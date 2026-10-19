/// <reference lib="webworker" />
// Runs the dither background off the main thread: WebGL context creation, shader compilation
// and every frame happen here, so they never block scrolling, typing or page load.
import { createDitherRenderer, type DitherOptions, type DitherRenderer } from './renderer';

export type DitherWorkerMessage =
  | { type: 'init'; canvas: OffscreenCanvas; options: DitherOptions; width: number; height: number; animated: boolean }
  | { type: 'resize'; width: number; height: number }
  | { type: 'mouse'; x: number; y: number }
  | { type: 'animated'; value: boolean }
  | { type: 'visible'; value: boolean };

let renderer: DitherRenderer | null = null;

self.onmessage = (event: MessageEvent<DitherWorkerMessage>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    renderer = createDitherRenderer(msg.canvas, msg.options);
    renderer.setAnimated(msg.animated);
    renderer.resize(msg.width, msg.height);
    return;
  }
  if (!renderer) return;
  if (msg.type === 'resize') renderer.resize(msg.width, msg.height);
  else if (msg.type === 'mouse') renderer.setMouse(msg.x, msg.y);
  else if (msg.type === 'animated') renderer.setAnimated(msg.value);
  else if (msg.type === 'visible') renderer.setVisible(msg.value);
};
