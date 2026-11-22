#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exportVideo } from './export.js';
import { frameCount, renderSvg, sceneSchema } from './scene.js';

const server = new McpServer({ name: 'animation-mcp', version: '0.1.0' });
const shutdown = new AbortController();
const readOnly = { readOnlyHint: true, openWorldHint: false };
const { width, height, fps, duration } = sceneSchema.shape;
const videoFormat = z.enum(['webm', 'mp4']);
const frameMetadata = {
  width,
  height,
  fps,
  frames: z.number().int().positive().describe('Number of scheduled frames'),
};
const previewTime = z.number().nonnegative().describe('Seconds from the scene start');

function result(value: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

server.registerTool('animation_validate', {
  description: 'Validate a 2D animation scene and report its dimensions and frame count.',
  inputSchema: { scene: sceneSchema },
  outputSchema: { valid: z.literal(true), ...frameMetadata, duration },
  annotations: readOnly,
}, ({ scene }) => result({
  valid: true, width: scene.width, height: scene.height,
  duration: scene.duration, fps: scene.fps, frames: frameCount(scene),
}));

server.registerTool('animation_preview', {
  description: 'Sample a 2D animation at a given time and return the standalone SVG markup.',
  inputSchema: { scene: sceneSchema, time: previewTime },
  outputSchema: { time: previewTime, mimeType: z.literal('image/svg+xml'), svg: z.string() },
  annotations: readOnly,
}, ({ scene, time }) => {
  if (time > scene.duration) throw new Error('Preview time exceeds the scene duration.');
  return result({ time, mimeType: 'image/svg+xml', svg: renderSvg(scene, time) });
});

let exporting = false;
server.registerTool('animation_export', {
  description: 'Render a silent 2D animation to a new local WebM (VP9) or MP4 (H.264) file.',
  inputSchema: { scene: sceneSchema, format: videoFormat },
  outputSchema: {
    path: z.string().min(1).describe('Absolute path to the rendered video'),
    format: videoFormat,
    codec: z.enum(['vp9', 'h264']),
    ...frameMetadata,
    duration: z.number().positive().describe('Scheduled video duration in seconds, calculated as frames / fps'),
  },
  annotations: { destructiveHint: false, openWorldHint: false },
}, async ({ scene, format }, { signal }) => {
  if (exporting) throw new Error('An export is already running. Retry once it finishes.');
  exporting = true;
  try {
    return result(await exportVideo(scene, format, AbortSignal.any([signal, shutdown.signal])));
  } finally {
    exporting = false;
  }
});

server.server.onerror = (error) => { console.error(error.message); };
process.stdin.once('end', () => shutdown.abort());
for (const event of ['SIGINT', 'SIGTERM'] as const) {
  process.once(event, () => {
    shutdown.abort();
    void server.close().catch((error) => { console.error(error); process.exitCode = 1; });
  });
}

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
