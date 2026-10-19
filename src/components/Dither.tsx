import { useEffect, useRef } from 'react';
import { createDitherRenderer, type DitherOptions, type DitherRenderer } from './dither/renderer';
import type { DitherWorkerMessage } from './dither/dither.worker';

import './Dither.css';

/*
 * Dithered waves background (plain WebGL2, see ./dither/renderer.ts).
 * Where the browser supports OffscreenCanvas the renderer runs in a Web Worker, so none of the
 * GPU work touches the main thread; otherwise it runs here, set up after the first paint.
 */

const MAX_DPR = 2;

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

/** The same controls whether the renderer lives in a worker or on this thread. */
type Controller = Pick<DitherRenderer, 'resize' | 'setMouse' | 'setAnimated' | 'setVisible' | 'destroy'>;

function startInWorker(canvas: HTMLCanvasElement, options: DitherOptions, width: number, height: number, animated: boolean): Controller {
  const worker = new Worker(new URL('./dither/dither.worker.ts', import.meta.url), { type: 'module' });
  const offscreen = canvas.transferControlToOffscreen();
  const send = (msg: DitherWorkerMessage, transfer: Transferable[] = []) => worker.postMessage(msg, transfer);
  send({ type: 'init', canvas: offscreen, options, width, height, animated }, [offscreen]);
  return {
    resize: (w, h) => send({ type: 'resize', width: w, height: h }),
    setMouse: (x, y) => send({ type: 'mouse', x, y }),
    setAnimated: (value) => send({ type: 'animated', value }),
    setVisible: (value) => send({ type: 'visible', value }),
    destroy: () => worker.terminate(),
  };
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

    const options: DitherOptions = {
      waveSpeed, waveFrequency, waveAmplitude, waveColor: [r, g, b], colorNum, pixelSize, enableMouseInteraction, mouseRadius,
    };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isAnimated = () => !disableAnimation && !reducedMotion.matches;
    let dpr = 1;
    let controller: Controller | null = null;

    // Full-resolution size in device pixels. The canvas is drawn at one pixel per dither block;
    // its CSS size is a whole number of blocks (a partial block overflows and is clipped).
    const measure = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.round(container.clientWidth * dpr));
      const height = Math.max(1, Math.round(container.clientHeight * dpr));
      canvas.style.width = `${(Math.ceil(width / pixelSize) * pixelSize) / dpr}px`;
      canvas.style.height = `${(Math.ceil(height / pixelSize) * pixelSize) / dpr}px`;
      return { width, height };
    };

    const start = () => {
      const { width, height } = measure();
      if (typeof canvas.transferControlToOffscreen === 'function' && typeof Worker !== 'undefined') {
        try {
          controller = startInWorker(canvas, options, width, height, isAnimated());
          return;
        } catch (err) {
          if (import.meta.env.DEV) console.warn('Dither worker unavailable, rendering on the main thread:', err);
        }
      }
      const renderer = createDitherRenderer(canvas, options);
      renderer.setAnimated(isAnimated());
      renderer.resize(width, height);
      controller = renderer;
    };

    // Set up after the first paint so the page content shows first
    const init = setTimeout(start, 0);

    const onResize = () => {
      const { width, height } = measure();
      controller?.resize(width, height);
    };
    const onVisibility = () => controller?.setVisible(!document.hidden);
    const onMotionChange = () => controller?.setAnimated(isAnimated());
    const onPointerMove = (e: PointerEvent) => {
      if (!enableMouseInteraction) return;
      const rect = canvas.getBoundingClientRect();
      controller?.setMouse((e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', onMotionChange);
    // Same event target as before (react-three-fiber listened on the canvas container)
    container.addEventListener('pointermove', onPointerMove);

    return () => {
      clearTimeout(init);
      controller?.destroy();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionChange);
      container.removeEventListener('pointermove', onPointerMove);
    };
  }, [waveSpeed, waveFrequency, waveAmplitude, r, g, b, colorNum, pixelSize, disableAnimation, enableMouseInteraction, mouseRadius]);

  return (
    <div ref={containerRef} className="dither-container">
      <canvas ref={canvasRef} className="dither-canvas" />
    </div>
  );
}
