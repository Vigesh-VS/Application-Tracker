/*
 * WebGL2 renderer for the dithered waves background. Works on a normal <canvas> (main thread)
 * or an OffscreenCanvas inside a Web Worker, so all GPU setup and per-frame work can run
 * off the main thread.
 *
 * The retro dither gives every pixelSize × pixelSize block one colour, so the canvas renders
 * one fragment per block (1/pixelSize² of the pixels) and the browser scales it up with
 * `image-rendering: pixelated`. Same shader maths and output as the original three.js +
 * postprocessing version, in a single pass.
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

export interface DitherOptions {
  waveSpeed: number;
  waveFrequency: number;
  waveAmplitude: number;
  waveColor: [number, number, number];
  colorNum: number;
  pixelSize: number;
  enableMouseInteraction: boolean;
  mouseRadius: number;
}

export interface DitherRenderer {
  /** Full-resolution size in device pixels; the canvas itself is 1/pixelSize of it. */
  resize(width: number, height: number): void;
  setMouse(x: number, y: number): void;
  /** Animate (true) or show a still frame (false, e.g. prefers-reduced-motion). */
  setAnimated(animated: boolean): void;
  /** Pause while the page is hidden. */
  setVisible(visible: boolean): void;
  destroy(): void;
}

const FRAME_INTERVAL_MS = 1000 / 30; // the waves drift slowly; 30 fps looks the same as 60
const UNIFORMS = ['resolution', 'pixelSize', 'time', 'waveSpeed', 'waveFrequency', 'waveAmplitude', 'waveColor',
  'mousePos', 'enableMouseInteraction', 'mouseRadius', 'colorNum'] as const;

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

// Workers have requestAnimationFrame in current browsers; fall back to a timer elsewhere
const raf = (cb: (now: number) => void): number =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb)
    : (setTimeout(() => cb(performance.now()), FRAME_INTERVAL_MS) as unknown as number);
const cancelRaf = (id: number) =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id);

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  // No COMPILE_STATUS check here: asking for it forces a blocking compile (see setup)
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

export function createDitherRenderer(canvas: AnyCanvas, options: DitherOptions): DitherRenderer {
  const { pixelSize } = options;
  let gl: WebGL2RenderingContext | null = null;
  let uniforms: Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>> = {};
  let size = { width: 1, height: 1 };
  const mouse = { x: 0, y: 0 };
  let animated = true;
  let visible = true;
  let destroyed = false;
  let frame = 0;
  let lastDraw = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const start = performance.now();

  const draw = (now: number) => {
    if (!gl) return;
    gl.uniform1f(uniforms.time!, animated ? (now - start) / 1000 : 0);
    gl.uniform2f(uniforms.mousePos!, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const applySize = () => {
    if (!gl) return;
    canvas.width = Math.ceil(size.width / pixelSize);
    canvas.height = Math.ceil(size.height / pixelSize);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.resolution!, size.width, size.height);
    draw(performance.now());
  };

  const loop = (now: number) => {
    frame = raf(loop);
    if (now - lastDraw < FRAME_INTERVAL_MS - 1) return;
    lastDraw = now;
    draw(now);
  };

  const startLoop = () => {
    cancelRaf(frame);
    if (!gl || !visible || destroyed) return;
    if (!animated) {
      draw(performance.now()); // a single still frame
      return;
    }
    frame = raf(loop);
  };

  const setup = () => {
    const ctx = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      powerPreference: 'low-power',
    }) as WebGL2RenderingContext | null;
    if (!ctx) return; // no WebGL2: the page's black background shows instead
    const program = ctx.createProgram()!;
    const shaders = [compile(ctx, ctx.VERTEX_SHADER, vertexShader), compile(ctx, ctx.FRAGMENT_SHADER, fragmentShader)];
    shaders.forEach((shader) => ctx.attachShader(program, shader));
    ctx.linkProgram(program);

    const finish = () => {
      if (destroyed || ctx.isContextLost()) return;
      if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
        console.error('Dither background disabled:', ctx.getProgramInfoLog(program), ...shaders.map((s) => ctx.getShaderInfoLog(s)));
        return;
      }
      ctx.useProgram(program);

      // One triangle that covers the whole viewport
      ctx.bindBuffer(ctx.ARRAY_BUFFER, ctx.createBuffer());
      ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
      const position = ctx.getAttribLocation(program, 'position');
      ctx.enableVertexAttribArray(position);
      ctx.vertexAttribPointer(position, 2, ctx.FLOAT, false, 0, 0);

      uniforms = Object.fromEntries(UNIFORMS.map((n) => [n, ctx.getUniformLocation(program, n)]));
      ctx.uniform1f(uniforms.pixelSize!, pixelSize);
      ctx.uniform1f(uniforms.waveSpeed!, options.waveSpeed);
      ctx.uniform1f(uniforms.waveFrequency!, options.waveFrequency);
      ctx.uniform1f(uniforms.waveAmplitude!, options.waveAmplitude);
      ctx.uniform3f(uniforms.waveColor!, ...options.waveColor);
      ctx.uniform1i(uniforms.enableMouseInteraction!, options.enableMouseInteraction ? 1 : 0);
      ctx.uniform1f(uniforms.mouseRadius!, options.mouseRadius);
      ctx.uniform1f(uniforms.colorNum!, options.colorNum);
      gl = ctx;
      applySize();
      startLoop();
    };

    // Shader compilation can take hundreds of milliseconds (software rendering, ANGLE on
    // Windows). With KHR_parallel_shader_compile it happens in the background and we poll
    // for completion instead of blocking.
    const parallel = ctx.getExtension('KHR_parallel_shader_compile');
    const poll = () => {
      if (destroyed) return;
      if (ctx.getProgramParameter(program, parallel!.COMPLETION_STATUS_KHR)) finish();
      else pollTimer = setTimeout(poll, 50);
    };
    if (parallel) poll();
    else finish();
  };

  const onContextLost = (e: Event) => {
    e.preventDefault();
    cancelRaf(frame);
    gl = null;
  };
  // HTMLCanvasElement fires webglcontext*, OffscreenCanvas fires context*
  const lostEvents = ['webglcontextlost', 'contextlost'];
  const restoredEvents = ['webglcontextrestored', 'contextrestored'];
  lostEvents.forEach((e) => canvas.addEventListener(e, onContextLost));
  restoredEvents.forEach((e) => canvas.addEventListener(e, setup));

  setup();

  return {
    resize(width, height) {
      size = { width: Math.max(1, width), height: Math.max(1, height) };
      applySize();
    },
    setMouse(x, y) {
      mouse.x = x;
      mouse.y = y;
    },
    setAnimated(value) {
      animated = value;
      startLoop();
    },
    setVisible(value) {
      visible = value;
      startLoop();
    },
    destroy() {
      destroyed = true;
      cancelRaf(frame);
      clearTimeout(pollTimer);
      lostEvents.forEach((e) => canvas.removeEventListener(e, onContextLost));
      restoredEvents.forEach((e) => canvas.removeEventListener(e, setup));
      gl = null;
    },
  };
}
