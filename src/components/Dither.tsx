import { useEffect, useRef } from 'react';

import './Dither.css';

/*
 * Dithered waves background, drawn with plain WebGL2 (no three.js).
 *
 * The retro dither gives every pixelSize × pixelSize block one colour, so the canvas renders
 * one fragment per block (1/pixelSize² of the pixels) and the browser scales it up with
 * `image-rendering: pixelated`. Same shader maths and output as the original three.js +
 * postprocessing version, in a single pass and a fraction of the GPU work and bundle size.
 */

const vertexShader = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `#version 300 es
precision highp float;
uniform vec2 resolution; // full-resolution size in device pixels (before the block downscale)
uniform float pixelSize;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;
uniform float colorNum;
out vec4 fragColor;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p + fbm(p2));
}

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

vec3 dither(vec2 block, vec3 color) {
  int x = int(mod(block.x, 8.0));
  int y = int(mod(block.y, 8.0));
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;
  float step = 1.0 / (colorNum - 1.0);
  color += threshold * step;
  float bias = 0.2;
  color = clamp(color - bias, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

// The original pipeline wrote its output through an sRGB encode
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c));
}

void main() {
  // One fragment = one pixelSize block; sample the wave at the block's corner like the dither pass did
  vec2 block = floor(gl_FragCoord.xy);
  vec2 uv = block * pixelSize / resolution;
  uv -= 0.5;
  uv.x *= resolution.x / resolution.y;
  float f = pattern(uv);
  if (enableMouseInteraction == 1) {
    vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= resolution.x / resolution.y;
    float dist = length(uv - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);
    f -= 0.5 * effect;
  }
  vec3 col = mix(vec3(0.0), waveColor, f);
  fragColor = vec4(linearToSrgb(dither(block, col)), 1.0);
}
`;

const MAX_DPR = 2;
const FRAME_INTERVAL_MS = 1000 / 30; // the waves drift slowly; 30 fps looks the same as 60

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
  }
  return shader;
}

interface DitherProps {
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  waveColor?: [number, number, number];
  colorNum?: number;
  pixelSize?: number;
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
}

export default function Dither({
  waveSpeed = 0.05,
  waveFrequency = 3,
  waveAmplitude = 0.3,
  waveColor = [0.5, 0.5, 0.5],
  colorNum = 4,
  pixelSize = 2,
  disableAnimation = false,
  enableMouseInteraction = true,
  mouseRadius = 1
}: DitherProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [r, g, b] = waveColor;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mouse = { x: 0, y: 0 };
    let gl: WebGL2RenderingContext | null = null;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let frame = 0;
    let lastDraw = 0;
    let dpr = 1;
    const start = performance.now();

    const draw = (now: number) => {
      if (!gl) return;
      gl.uniform1f(uniforms.time, disableAnimation || reducedMotion.matches ? 0 : (now - start) / 1000);
      gl.uniform2f(uniforms.mousePos, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      if (!gl) return;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.round(container.clientWidth * dpr));
      const height = Math.max(1, Math.round(container.clientHeight * dpr));
      canvas.width = Math.ceil(width / pixelSize);
      canvas.height = Math.ceil(height / pixelSize);
      // Exact whole-block size; any partial block overflows the container and is clipped
      canvas.style.width = `${(canvas.width * pixelSize) / dpr}px`;
      canvas.style.height = `${(canvas.height * pixelSize) / dpr}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.resolution, width, height);
      draw(performance.now());
    };

    const setup = () => {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
      if (!gl) return; // no WebGL2: the page's black background shows instead
      try {
        const program = gl.createProgram()!;
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexShader));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentShader));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
        gl.useProgram(program);

        // One triangle that covers the whole viewport
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        uniforms = Object.fromEntries(
          ['resolution', 'pixelSize', 'time', 'waveSpeed', 'waveFrequency', 'waveAmplitude', 'waveColor',
            'mousePos', 'enableMouseInteraction', 'mouseRadius', 'colorNum'].map((n) => [n, gl!.getUniformLocation(program, n)])
        );
        gl.uniform1f(uniforms.pixelSize, pixelSize);
        gl.uniform1f(uniforms.waveSpeed, waveSpeed);
        gl.uniform1f(uniforms.waveFrequency, waveFrequency);
        gl.uniform1f(uniforms.waveAmplitude, waveAmplitude);
        gl.uniform3f(uniforms.waveColor, r, g, b);
        gl.uniform1i(uniforms.enableMouseInteraction, enableMouseInteraction ? 1 : 0);
        gl.uniform1f(uniforms.mouseRadius, mouseRadius);
        gl.uniform1f(uniforms.colorNum, colorNum);
        resize();
      } catch (err) {
        if (import.meta.env.DEV) console.error('Dither background disabled:', err);
        gl = null;
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - lastDraw < FRAME_INTERVAL_MS - 1) return;
      lastDraw = now;
      draw(now);
    };

    const startLoop = () => {
      cancelAnimationFrame(frame);
      if (!gl || document.hidden) return;
      if (disableAnimation || reducedMotion.matches) {
        draw(performance.now()); // a single still frame
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!enableMouseInteraction) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) * dpr;
      mouse.y = (e.clientY - rect.top) * dpr;
    };
    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
      gl = null;
    };
    const onContextRestored = () => {
      setup();
      startLoop();
    };

    // Set up after the first paint so the page content shows first
    const init = setTimeout(() => {
      setup();
      startLoop();
    }, 0);

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    document.addEventListener('visibilitychange', startLoop);
    reducedMotion.addEventListener('change', startLoop);
    // Same event target as before (react-three-fiber listened on the canvas container)
    container.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    return () => {
      clearTimeout(init);
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', startLoop);
      reducedMotion.removeEventListener('change', startLoop);
      container.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
    };
  }, [waveSpeed, waveFrequency, waveAmplitude, r, g, b, colorNum, pixelSize, disableAnimation, enableMouseInteraction, mouseRadius]);

  return (
    <div ref={containerRef} className="dither-container">
      <canvas ref={canvasRef} className="dither-canvas" />
    </div>
  );
}
