import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe('Hex color in #RRGGBB format');
const coordinate = z.number().min(-20).max(20);
const keyframe = z.strictObject({
  time: z.number().min(0).max(30).describe('Seconds from the scene start'),
  x: coordinate,
  y: z.number().min(0).max(20).describe('Vertical world coordinate above the floor'),
  z: coordinate.describe('Depth in world coordinates'),
});

export const threeSceneSchema = z.strictObject({
  width: z.number().int().min(16).max(960),
  height: z.number().int().min(16).max(540),
  duration: z.number().positive().max(30),
  background: color.default('#142235'),
  spheres: z.array(z.strictObject({
    radius: z.number().min(0.05).max(4),
    color,
    keyframes: z.array(keyframe).min(1).max(120),
  })).min(1).max(8),
}).superRefine((scene, context) => {
  scene.spheres.forEach((sphere, sphereIndex) => {
    sphere.keyframes.forEach(({ time }, frameIndex) => {
      if (time > scene.duration || (frameIndex > 0 && time <= sphere.keyframes[frameIndex - 1].time)) {
        context.addIssue({
          code: 'custom',
          path: ['spheres', sphereIndex, 'keyframes', frameIndex, 'time'],
          message: 'Keyframe times must increase strictly and stay within the scene duration',
        });
      }
    });
  });
});

export type ThreeScene = z.infer<typeof threeSceneSchema>;

const origin = 'https://animation-mcp.invalid';
const document = '<!doctype html><style>body{margin:0;overflow:hidden}canvas{display:block}</style>' +
  '<script type="importmap">{"imports":{"three":"/three.module.js"}}</script><body></body>';

function resolveThree(): URL {
  try {
    return new URL(import.meta.resolve('three'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('The 3D preview requires the optional Three.js dependency. Install with optional dependencies enabled.');
    }
    throw error;
  }
}

export async function previewThree(scene: ThreeScene, time: number, requestSignal: AbortSignal): Promise<Buffer> {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(30_000)]);
  signal.throwIfAborted();
  const three = resolveThree();
  const modules = new Map([
    ['/renderer.js', new URL('./three-renderer.js', import.meta.url)],
    ['/three.module.js', three],
    ['/three.core.js', new URL('./three.core.js', three)],
  ]);
  const browser = await chromium.launch({ timeout: 15_000 });
  const cancel = () => { void browser.close().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const page = await browser.newPage({
      viewport: { width: scene.width, height: scene.height },
      deviceScaleFactor: 1,
      offline: true,
      serviceWorkers: 'block',
    });
    // Serve the installed renderer and its modules inside the offline browser context.
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: document });
      const module = modules.get(url.pathname);
      if (!module) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: await readFile(module) });
    });
    await page.goto(origin, { timeout: 10_000 });
    await page.evaluate(async ({ scene, time, url }) => {
      const renderer: typeof import('./three-renderer.js') = await import(url);
      renderer.renderStill(scene, time);
    }, { scene, time, url: `${origin}/renderer.js` });
    const image = await page.screenshot({ timeout: 10_000 });
    signal.throwIfAborted();
    return image;
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    await browser.close();
  }
}
