import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [installDir] = process.argv.slice(2);
if (!installDir) {
  throw new Error('Usage: node scripts/verify-release.mjs <installation directory>');
}

const packageRequire = createRequire(resolve(installDir, 'node_modules/animation-mcp/package.json'));
const { Client } = packageRequire('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = packageRequire('@modelcontextprotocol/sdk/client/stdio.js');
const client = new Client({ name: 'animation-mcp-release-check', version: '1.0.0' });

try {
  await client.connect(new StdioClientTransport({
    command: resolve(installDir, 'node_modules/.bin/animation-mcp'),
    args: [],
  }));

  const { tools } = await client.listTools();
  const names = tools.map(({ name }) => name).sort();
  assert.deepEqual(names, ['animation_export', 'animation_preview', 'animation_validate']);
  for (const tool of tools) {
    assert.ok(tool.inputSchema.properties?.scene, `${tool.name} must declare the scene input`);
    assert.ok(tool.outputSchema?.properties, `${tool.name} must declare its output schema`);
  }
  console.log(`Installed server discovered over stdio: ${names.join(', ')}`);
} finally {
  await client.close();
}
