import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [installDir] = process.argv.slice(2);
if (!installDir) {
  throw new Error('Usage: node scripts/verify-release.mjs <installation directory>');
}

const packageRequire = createRequire(resolve(installDir, 'node_modules/animation-mcp/package.json'));
const { Client } = packageRequire('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = packageRequire('@modelcontextprotocol/sdk/client/stdio.js');
const command = resolve(installDir, 'node_modules/.bin/animation-mcp');
const output = await mkdtemp(join(tmpdir(), 'animation-release-check-'));
const scene = {
  width: 320, height: 180, fps: 24, duration: 2, background: '#112036',
  layers: [{
    type: 'circle', radius: 18, fill: '#FFBD66',
    keyframes: [{ time: 0.5, x: 40, y: 90 }, { time: 1.5, x: 280, y: 90 }],
  }],
};

async function check(videoFormats) {
  const client = new Client({ name: 'animation-mcp-release-check', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({
      command,
      args: [],
      env: {
        ANIMATION_MCP_VIDEO_FORMATS: videoFormats,
        ANIMATION_MCP_OUTPUT_DIR: output,
        PLAYWRIGHT_BROWSERS_PATH: join(output, 'no-browsers'),
        ANIMATION_MCP_FFMPEG: join(output, 'no-ffmpeg'),
      },
    }));

    const { tools } = await client.listTools();
    const expected = ['animation_export_svg', 'animation_preview', 'animation_validate'];
    if (videoFormats !== 'none') expected.unshift('animation_export');
    assert.deepEqual(tools.map(({ name }) => name).sort(), expected);
    for (const tool of tools) {
      assert.ok(tool.inputSchema.properties?.scene, `${tool.name} must declare the scene input`);
      assert.ok(tool.outputSchema?.properties, `${tool.name} must declare its output schema`);
    }
    if (videoFormats !== 'none') return;

    const exported = await client.callTool({ name: 'animation_export_svg', arguments: { scene } });
    assert.ok(!exported.isError, JSON.stringify(exported.content));
    const { path, format, duration } = exported.structuredContent;
    assert.equal(format, 'svg');
    assert.equal(duration, 2);
    const svg = await readFile(path, 'utf8');
    assert.match(svg, /keyTimes="0;0.25;0.75;1" values="40;40;280;280"/);
    const disabled = await client.callTool({
      name: 'animation_export', arguments: { scene, format: 'mp4' },
    });
    assert.equal(disabled.isError, true);
  } finally {
    await client.close();
  }
}

try {
  await check('mp4,webm');
  await check('none');
  console.log('Installed stdio server passed tool discovery and offline SVG export.');
} finally {
  await rm(output, { recursive: true, force: true });
}
