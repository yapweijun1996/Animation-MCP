import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe('Hex color in #RRGGBB format');
const coordinate = z.number().min(-4096).max(4096);
const size = z.number().min(1).max(4096);
const opacity = z.number().min(0).max(1);

const shape = {
  fill: color,
  opacity: opacity.default(1),
  keyframes: z.array(z.strictObject({
    time: z.number().min(0).max(30).describe('Seconds from the start of the scene'),
    x: coordinate,
    y: coordinate,
    opacity: opacity.optional(),
  })).min(1).max(120).describe('Strictly increasing times. Coordinates are absolute.'),
};

export const sceneSchema = z.strictObject({
  width: z.number().int().min(16).max(1920),
  height: z.number().int().min(16).max(1080),
  fps: z.number().int().min(1).max(60),
  duration: z.number().positive().max(30).describe('Duration in seconds'),
  background: color,
  layers: z.array(z.discriminatedUnion('type', [
    z.strictObject({ ...shape, type: z.literal('rect'), width: size, height: size }),
    z.strictObject({ ...shape, type: z.literal('circle'), radius: size }),
    z.strictObject({
      ...shape,
      type: z.literal('text'),
      text: z.string().min(1).max(250).refine(
        (value) => [...value].every((char) => {
          const code = char.codePointAt(0)!;
          return code === 9 || code === 10 || code === 13 ||
            (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) ||
            code >= 0x10000;
        }),
        'Text contains a character that SVG cannot represent',
      ),
      fontSize: size,
    }),
  ])).min(1).max(64).describe('Back-to-front draw order'),
}).superRefine((scene, context) => {
  scene.layers.forEach((layer, layerIndex) => {
    layer.keyframes.forEach(({ time }, frameIndex) => {
      if (time > scene.duration || (frameIndex > 0 && time <= layer.keyframes[frameIndex - 1].time)) {
        context.addIssue({
          code: 'custom',
          path: ['layers', layerIndex, 'keyframes', frameIndex, 'time'],
          message: 'Keyframe times must increase strictly and stay within the scene duration',
        });
      }
    });
  });
});

export type Scene = z.infer<typeof sceneSchema>;
type Layer = Scene['layers'][number];

export function frameCount(scene: Scene): number {
  const frames = scene.duration * scene.fps;
  const nearest = Math.round(frames);
  return nearest > 0 && Math.abs(frames - nearest) < 1e-9 ? nearest : Math.ceil(frames);
}

function sample(layer: Layer, time: number) {
  const frames = layer.keyframes;
  const nextIndex = frames.findIndex((frame) => frame.time >= time);
  if (nextIndex <= 0) {
    const frame = nextIndex === 0 ? frames[0] : frames[frames.length - 1];
    return { x: frame.x, y: frame.y, opacity: frame.opacity ?? layer.opacity };
  }
  const start = frames[nextIndex - 1];
  const end = frames[nextIndex];
  const fraction = (time - start.time) / (end.time - start.time);
  const interpolate = (a: number, b: number) => a + (b - a) * fraction;
  return {
    x: interpolate(start.x, end.x),
    y: interpolate(start.y, end.y),
    opacity: interpolate(start.opacity ?? layer.opacity, end.opacity ?? layer.opacity),
  };
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderScene(scene: Scene, time: number, animated: boolean): string {
  const layers = scene.layers.map((layer) => {
    const { x, y, opacity } = sample(layer, time);
    const xAttribute = layer.type === 'circle' ? 'cx' : 'x';
    const yAttribute = layer.type === 'circle' ? 'cy' : 'y';
    const position = `${xAttribute}="${x}" ${yAttribute}="${y}"`;
    const paint = `fill="${layer.fill}" opacity="${opacity}"`;
    const motion = animated ? renderMotion(layer, scene.duration, xAttribute, yAttribute) : '';
    switch (layer.type) {
      case 'rect':
        return `<rect ${position} width="${layer.width}" height="${layer.height}" ${paint}>${motion}</rect>`;
      case 'circle':
        return `<circle ${position} r="${layer.radius}" ${paint}>${motion}</circle>`;
      case 'text':
        return `<text ${position} font-family="sans-serif" font-size="${layer.fontSize}" ${paint}>${motion}${escapeText(layer.text)}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}">` +
    `<rect width="100%" height="100%" fill="${scene.background}"/>${layers.join('')}</svg>`;
}

function renderMotion(layer: Layer, duration: number, xAttribute: string, yAttribute: string): string {
  const times = layer.keyframes.map(({ time }) => time);
  if (times[0] > 0) times.unshift(0);
  if (times.at(-1) !== duration) times.push(duration);
  const keyTimes = times.map((time) => decimal(time / duration)).join(';');
  const poses = times.map((time) => sample(layer, time));
  const tracks = [
    [xAttribute, poses.map(({ x }) => x)],
    [yAttribute, poses.map(({ y }) => y)],
    ['opacity', poses.map(({ opacity }) => opacity)],
  ] as const;
  return tracks.filter(([, values]) => values.some((value) => value !== values[0]))
    .map(([attribute, values]) =>
      `<animate attributeName="${attribute}" dur="${decimal(duration)}s" fill="freeze" calcMode="linear" ` +
      `keyTimes="${keyTimes}" values="${values.map(decimal).join(';')}"/>`,
    ).join('');
}

function decimal(value: number): string {
  const [coefficient, exponent] = String(Math.abs(value)).split('e-');
  if (exponent === undefined) return String(value);
  // SMIL clock values use decimal notation.
  return `${value < 0 ? '-' : ''}0.${'0'.repeat(Number(exponent) - 1)}${coefficient.replace('.', '')}`;
}

export function renderSvg(scene: Scene, time: number): string {
  return renderScene(scene, time, false);
}

export function renderAnimatedSvg(scene: Scene): string {
  return renderScene(scene, 0, true);
}
