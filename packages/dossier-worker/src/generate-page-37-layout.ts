import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { PixelPoint } from './fetch-satellite-image';

/** The installer-placed points, already projected into the satellite image's pixel space. */
export interface Page37Points {
  technicalRoom: PixelPoint | null;
  meter: PixelPoint | null;
  earthPit: PixelPoint | null;
}

export interface Page37LayoutInput {
  satelliteImage: Buffer;
  imageWidthPx: number;
  imageHeightPx: number;
  /** Ground metres per image pixel, so the model can size the array realistically. */
  metersPerPixel: number;
  /** The site's own GPS point (the building to equip), in image pixels. */
  sitePoint: PixelPoint;
  points: Page37Points;
  /** Approximate PV array surface (modules × module area), if known. */
  arrayAreaM2?: number | null;
}

/**
 * Everything is in the satellite image's PIXEL space (origin top-left, x right, y down) — the same
 * space the renderer draws in, so there is no lat/lon → pixel projection to get wrong.
 */
export interface Page37Layout {
  panelRectangle: PixelPoint[];
  wireRoute: PixelPoint[];
}

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const page37LayoutSchema = z.object({
  panelRectangle: z.array(pointSchema),
  wireRoute: z.array(pointSchema),
});

export class Page37LayoutParseError extends Error {
  constructor(reason: string) {
    super(`Claude did not return a valid page-37 layout: ${reason}`);
    this.name = 'Page37LayoutParseError';
  }
}

/** A coordinate outside the satellite image: a call failure, never drawn (spec §5). */
export class Page37LayoutOutOfBoundsError extends Page37LayoutParseError {
  constructor(reason: string) {
    super(reason);
    this.name = 'Page37LayoutOutOfBoundsError';
  }
}

/**
 * Spec §5: a layout that fails validation (including out-of-bounds coordinates) is "treated as a
 * call failure, retried like a network error". The caller passes this to `withRetry`.
 */
export function isRetryablePage37LayoutError(error: unknown): boolean {
  return error instanceof Page37LayoutParseError;
}

const MIN_PANEL_AREA_PX = 25;

const pixelPointJsonSchema = { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false };
const page37OutputFormat = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      panelRectangle: { type: 'array', items: pixelPointJsonSchema },
      wireRoute: { type: 'array', items: pixelPointJsonSchema },
    },
    required: ['panelRectangle', 'wireRoute'],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = [
  "Tu analyses une image satellite (vue du dessus, nord en haut) d'un site pour une installation photovoltaïque raccordée au réseau.",
  "Toutes les coordonnées sont en PIXELS de l'image : origine (0, 0) au coin supérieur gauche, x vers la droite, y vers le bas.",
  "Propose l'emplacement du champ de panneaux solaires sur le toit (ou le terrain) du bâtiment situé au point du site : un quadrilatère de 4 coins donnés dans l'ordre du contour, qui peut être tourné pour suivre l'orientation du toit.",
  'Propose aussi un tracé de câblage : une liste ordonnée de points partant du champ de panneaux, passant par le local technique, puis allant au compteur STEG (seulement les points fournis).',
  "Chaque coordonnée renvoyée doit rester à l'intérieur de l'image. Réponds uniquement avec les coordonnées demandées.",
].join(' ');

const px = (p: PixelPoint): string => `x=${Math.round(p.x)}, y=${Math.round(p.y)}`;

function describeScene(input: Page37LayoutInput): string {
  const { imageWidthPx: w, imageHeightPx: h, metersPerPixel: mpp } = input;
  const lines = [
    `Image : ${w} x ${h} pixels, environ ${mpp.toFixed(2)} m par pixel (${Math.round(w * mpp)} m de large).`,
    `Point du site (bâtiment à équiper) : ${px(input.sitePoint)}.`,
  ];
  if (input.points.technicalRoom) lines.push(`Local technique : ${px(input.points.technicalRoom)}.`);
  if (input.points.meter) lines.push(`Compteur STEG : ${px(input.points.meter)}.`);
  if (input.points.earthPit) lines.push(`Prise de terre : ${px(input.points.earthPit)}.`);
  if (input.arrayAreaM2 && input.arrayAreaM2 > 0) {
    const areaPx = input.arrayAreaM2 / (mpp * mpp);
    lines.push(`Surface du champ PV : environ ${Math.round(input.arrayAreaM2)} m², soit environ ${Math.round(areaPx)} pixels² ; dimensionne le quadrilatère en conséquence.`);
  }
  lines.push(`Toutes les coordonnées renvoyées doivent vérifier 0 <= x <= ${w} et 0 <= y <= ${h}.`);
  return lines.join('\n');
}

function polygonArea(points: PixelPoint[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Throws a Page37LayoutParseError (retryable) for any layout that must not be drawn. */
export function validatePage37Layout(layout: Page37Layout, imageWidthPx: number, imageHeightPx: number): Page37Layout {
  if (layout.panelRectangle.length !== 4) {
    throw new Page37LayoutParseError(`panelRectangle must have exactly 4 corners, got ${layout.panelRectangle.length}`);
  }
  if (layout.wireRoute.length < 2) {
    throw new Page37LayoutParseError(`wireRoute must have at least 2 points, got ${layout.wireRoute.length}`);
  }
  for (const [name, points] of [['panelRectangle', layout.panelRectangle], ['wireRoute', layout.wireRoute]] as const) {
    for (const p of points) {
      if (p.x < 0 || p.y < 0 || p.x > imageWidthPx || p.y > imageHeightPx) {
        throw new Page37LayoutOutOfBoundsError(`${name} point (${p.x}, ${p.y}) is outside the ${imageWidthPx}x${imageHeightPx} image`);
      }
    }
  }
  if (polygonArea(layout.panelRectangle) < MIN_PANEL_AREA_PX) {
    throw new Page37LayoutParseError('panelRectangle is degenerate (near-zero area)');
  }
  return layout;
}

/**
 * Sends the site's satellite image plus the installer-placed points (in image pixels) to
 * claude-sonnet-5-5 and asks it to reason about where the panels should sit on the roof and how
 * the wiring should route. Claude's Messages API has no image-generation output — it returns
 * pixel coordinates, which render-site-plan-pages.ts draws onto the same image deterministically.
 */
export async function generatePage37Layout(input: Page37LayoutInput, client: Anthropic): Promise<Page37Layout> {
  const response = await client.messages.parse({
    model: 'claude-sonnet-5-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.satelliteImage.toString('base64') } },
          { type: 'text', text: describeScene(input) },
        ],
      },
    ],
    output_config: { format: page37OutputFormat },
  });

  if (response.parsed_output === null) {
    throw new Page37LayoutParseError('no parsed_output in response');
  }

  const parseResult = page37LayoutSchema.safeParse(response.parsed_output);
  if (!parseResult.success) {
    throw new Page37LayoutParseError(parseResult.error.message);
  }

  return validatePage37Layout(parseResult.data, input.imageWidthPx, input.imageHeightPx);
}
