import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';

const repo = fileURLToPath(new URL('../', import.meta.url));
const canvas = { width: 480, height: 270, duration: 2, background: '#142235' };
const threeRadius = 0.42;
const ballColor = '#FFAD36';
const flights = [
  { start: 0, end: 0.59, rise: 2.9 },
  { start: 0.59, end: 1.05, rise: 1.76 },
  { start: 1.05, end: 1.41, rise: 1.09 },
  { start: 1.41, end: 1.69, rise: 0.65 },
  { start: 1.69, end: 1.9, rise: 0.36 },
];
const flightEnd = flights.at(-1).end;
const previewTimes = [0, (flights[0].start + flights[0].end) / 2];
const keyframes = flights.flatMap(({ start, end, rise }) =>
  [0, 0.25, 0.5, 0.75].map((progress) => {
    const time = start + (end - start) * progress;
    return { time, x: -4.05 + 8.1 * time / flightEnd, y: threeRadius + 4 * rise * progress * (1 - progress), z: 0 };
  }),
);
keyframes.push({ time: flightEnd, x: 4.05, y: threeRadius, z: 0 }, { time: 2, x: 4.05, y: threeRadius, z: 0 });

const threeScene = { ...canvas, spheres: [{ radius: threeRadius, color: ballColor, keyframes }] };
const svgScene = { ...canvas, fps: 24, layers: [
  { type: 'rect', width: 480, height: 60, fill: '#1C3248', keyframes: [{ time: 0, x: 0, y: 210 }] },
  { type: 'circle', radius: 16, fill: ballColor, keyframes: keyframes.map(({ time, x, y }) => ({
    time, x: 240 + x * 41, y: 194 - (y - threeRadius) * 41,
  })) },
] };
const svgTools = ['animation_export_svg', 'animation_preview', 'animation_validate'];

function npm(args, cwd) {
  return execFileSync('npm', args, { cwd, encoding: 'utf8', timeout: 120_000 });
}

async function installArchive(archive, prefix, enable3d) {
  await mkdir(prefix);
  await writeFile(join(prefix, 'package.json'), JSON.stringify({
    name: 'animation-rendering-ci', version: '1.0.0', private: true,
  }));
  const optional = enable3d ? '--include=optional' : '--omit=optional';
  npm(['install', '--omit=dev', optional, '--ignore-scripts', '--no-audit', '--no-fund', archive], prefix);
  const installedRequire = createRequire(join(prefix, 'node_modules/animation-mcp/package.json'));
  if (enable3d) {
    assert.ok(installedRequire.resolve('three'));
  } else {
    assert.throws(() => installedRequire.resolve('three'), { code: 'MODULE_NOT_FOUND' });
  }
}

async function withServer(prefix, output, enable3d, check) {
  const client = new Client({ name: 'animation-rendering-ci', version: '1.0.0' });
  const browsers = enable3d ? process.env.PLAYWRIGHT_BROWSERS_PATH : join(prefix, 'missing-browsers');
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [join(prefix, 'node_modules/.bin/animation-mcp')],
      cwd: prefix,
      env: {
        ANIMATION_MCP_ENABLE_3D: String(enable3d),
        ANIMATION_MCP_VIDEO_FORMATS: 'none',
        ANIMATION_MCP_OUTPUT_DIR: output,
        ANIMATION_MCP_FFMPEG: join(prefix, 'missing-ffmpeg'),
        ANIMATION_MCP_FFPROBE: join(prefix, 'missing-ffprobe'),
        ...(browsers === undefined ? {} : { PLAYWRIGHT_BROWSERS_PATH: browsers }),
      },
    }));
    const { tools } = await client.listTools();
    const expected = enable3d ? [...svgTools, 'animation_preview_3d'].sort() : svgTools;
    assert.deepEqual(tools.map(({ name }) => name).sort(), expected);
    await check(client);
  } finally {
    await client.close();
  }
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 35_000 });
  assert.ok(!result.isError, JSON.stringify(result.content));
  return result;
}

async function previewPng(client, time) {
  const result = await call(client, 'animation_preview_3d', { scene: threeScene, time });
  assert.deepEqual(result.structuredContent, { time, width: 480, height: 270, mimeType: 'image/png' });
  const image = result.content.find(({ type }) => type === 'image');
  assert.equal(image?.mimeType, 'image/png');
  const png = Buffer.from(image.data, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [480, 270]);
  return png;
}

async function checkSvgPlayback(path) {
  const browser = await chromium.launch({ timeout: 15_000 });
  try {
    const page = await browser.newPage({ offline: true, serviceWorkers: 'block' });
    const requests = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await page.goto(pathToFileURL(path).href, { timeout: 10_000 });
    const { offline, initial, frames } = await page.evaluate(async (duration) => {
      const svg = document.documentElement;
      const ball = svg.querySelector('circle');
      const pose = () => ({ time: svg.getCurrentTime(), x: ball.cx.animVal.value, y: ball.cy.animVal.value });
      svg.pauseAnimations();
      svg.setCurrentTime(0);
      const initial = pose();
      svg.unpauseAnimations();
      const frames = await new Promise((resolve, reject) => {
        const samples = [];
        const timer = setTimeout(() => reject(new Error('SVG playback did not finish')), 8_000);
        function sample() {
          samples.push(pose());
          if (samples.at(-1).time < duration + 0.4) {
            requestAnimationFrame(sample);
          } else {
            clearTimeout(timer);
            resolve(samples);
          }
        }
        requestAnimationFrame(sample);
      });
      return { offline: !navigator.onLine, initial, frames };
    }, svgScene.duration);

    assert.equal(offline, true);
    const first = svgScene.layers[1].keyframes[0];
    assert.ok(Math.abs(initial.x - first.x) < 0.1 && initial.y === first.y);
    for (const { start, end, rise } of flights) {
      const apex = Math.min(...frames.filter(({ time }) => time > start && time < end).map(({ y }) => y));
      assert.ok(Math.abs(apex - (194 - rise * 41)) < 6, `Unexpected bounce height in ${start}–${end}s`);
    }
    const last = svgScene.layers[1].keyframes.at(-1);
    for (const pose of [frames.find(({ time }) => time >= 2.05), frames.at(-1)]) {
      assert.ok(Math.abs(pose.x - last.x) < 0.1 && pose.y === last.y, 'SVG must hold the final pose');
    }
    await page.reload();
    const restarted = await page.evaluate(() => !navigator.onLine && document.documentElement.getCurrentTime() < 0.3);
    assert.equal(restarted, true, 'Reload must restart offline playback');
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
}

test('installed Animation MCP rendering regressions', { timeout: 150_000 }, async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'animation-rendering-ci-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', scratch], repo));
  const archive = join(scratch, packed.filename);

  await t.test('Three.js returns different PNGs at takeoff and the first apex', async () => {
    const prefix = join(scratch, 'three');
    await installArchive(archive, prefix, true);
    await withServer(prefix, join(scratch, 'three-output'), true, async (client) => {
      const takeoff = await previewPng(client, previewTimes[0]);
      const apex = await previewPng(client, previewTimes[1]);
      assert.ok(!takeoff.equals(apex), 'The same ball must render differently at the two times');
    });
  });

  await t.test('clean install without Three.js exports and plays the full SVG offline', async () => {
    const prefix = join(scratch, 'svg');
    const output = join(scratch, 'svg-output');
    await installArchive(archive, prefix, false);
    await withServer(prefix, output, false, async (client) => {
      assert.equal((await call(client, 'animation_validate', { scene: svgScene })).structuredContent.frames, 48);
      assert.match((await call(client, 'animation_preview', { scene: svgScene, time: previewTimes[1] })).structuredContent.svg, /<circle /);
      const { structuredContent } = await call(client, 'animation_export_svg', { scene: svgScene });
      assert.equal(structuredContent.format, 'svg');
      assert.equal(structuredContent.duration, svgScene.duration);
      assert.equal(dirname(dirname(structuredContent.path)), output);
      await checkSvgPlayback(structuredContent.path);
    });
  });
});
