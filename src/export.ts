import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { frameCount, renderAnimatedSvg, renderSvg } from './scene.js';
import type { Scene } from './scene.js';

const run = promisify(execFile);
const profiles = {
  webm: { codec: 'vp9', args: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0'] },
  mp4: { codec: 'h264', args: ['-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart'] },
};

async function createOutputDirectory() {
  const root = resolve(process.env.ANIMATION_MCP_OUTPUT_DIR ?? tmpdir());
  await mkdir(root, { recursive: true, mode: 0o700 });
  return mkdtemp(join(root, 'animation-mcp-'));
}

export async function exportSvg(scene: Scene, signal: AbortSignal) {
  signal.throwIfAborted();
  const directory = await createOutputDirectory();
  const path = join(directory, 'animation.svg');
  try {
    await writeFile(path, renderAnimatedSvg(scene), { signal, flag: 'wx' });
    signal.throwIfAborted();
    return { path, format: 'svg', mimeType: 'image/svg+xml', width: scene.width, height: scene.height, duration: scene.duration };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function exportVideo(scene: Scene, format: keyof typeof profiles, signal: AbortSignal) {
  const frames = frameCount(scene);
  const { width, height, fps } = scene;
  if (width % 2 || height % 2) {
    throw new Error('Video width and height must both be even for yuv420p.');
  }
  if (frames * width * height > 300_000_000) {
    throw new Error('Video exceeds the 300 million pixel budget. Reduce duration, fps, or dimensions.');
  }

  const profile = profiles[format];
  const directory = await createOutputDirectory();
  const frameDirectory = join(directory, 'frames');
  const output = join(directory, `animation.${format}`);
  try {
    await mkdir(frameDirectory);
    signal.throwIfAborted();
    const browser = await chromium.launch({ timeout: 15_000 });
    const closeBrowser = () => { void browser.close().catch(() => {}); };
    signal.addEventListener('abort', closeBrowser, { once: true });
    try {
      signal.throwIfAborted();
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.setContent('<body style="margin:0;overflow:hidden"></body>');
      for (let index = 0; index < frames; index++) {
        signal.throwIfAborted();
        await page.evaluate((svg) => { document.body.innerHTML = svg; }, renderSvg(scene, index / fps));
        await page.screenshot({
          path: join(frameDirectory, `frame-${String(index).padStart(6, '0')}.png`),
          timeout: 15_000,
        });
      }
    } finally {
      signal.removeEventListener('abort', closeBrowser);
      await browser.close();
    }

    await run(process.env.ANIMATION_MCP_FFMPEG ?? 'ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps),
      '-start_number', '0', '-i', join(frameDirectory, 'frame-%06d.png'), '-an',
      ...profile.args, '-pix_fmt', 'yuv420p', output,
    ], { signal, timeout: 120_000 });

    const { stdout } = await run(process.env.ANIMATION_MCP_FFPROBE ?? 'ffprobe', [
      '-v', 'error', '-count_frames', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,nb_read_frames,avg_frame_rate',
      '-of', 'json', output,
    ], { signal, timeout: 30_000 });
    const stream = JSON.parse(stdout).streams?.[0];
    const [rate, divisor] = (stream?.avg_frame_rate ?? '').split('/').map(Number);
    if (stream?.codec_name !== profile.codec || stream.width !== width ||
        stream.height !== height || Number(stream.nb_read_frames) !== frames || rate / divisor !== fps) {
      throw new Error('Export verification failed. The video stream differs from the requested render.');
    }
    signal.throwIfAborted();
    await rm(frameDirectory, { recursive: true, force: true });
    return { path: output, format, codec: profile.codec, width, height, fps, frames, duration: frames / fps };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
