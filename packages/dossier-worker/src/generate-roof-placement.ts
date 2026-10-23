import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { PixelPoint } from './fetch-satellite-image';

export interface RoofPlacementInput {
  satelliteImage: Buffer;
  imageWidthPx: number;
  imageHeightPx: number;
  /** Ground metres per image pixel, so the model sizes the array on the photo. */
  metersPerPixel: number;
  /** The roof contour the installer drew, in image pixels: the array must stand inside it. */
  roofOutline: PixelPoint[];
  /** Where the installer put the "Champ PV" point, in image pixels: a hint, not a constraint. */
  field: PixelPoint;
  /** The compact array to place: its rows and its footprint on the roof. */
  array: { moduleCount: number; perRow: number; rows: number; widthM: number; depthM: number };
  /** PVGIS convention: 0 = south, +90 = west, -90 = east. */
  azimuthDeg: number;
  tiltDeg: number;
}

/** In the photo's PIXEL space (origin top-left, x right, y down), like the 3D view draws it. */
export interface RoofPlacement {
  centre: PixelPoint;
}

const placementSchema = z.object({ centre: z.object({ x: z.number().finite(), y: z.number().finite() }) });

export class RoofPlacementParseError extends Error {
  constructor(reason: string) {
    super(`Claude did not return a valid roof placement: ${reason}`);
    this.name = 'RoofPlacementParseError';
  }
}

/** A placement off the roof is a call failure, retried like a network error. */
export function isRetryableRoofPlacementError(error: unknown): boolean {
  return error instanceof RoofPlacementParseError;
}

const placementOutputFormat = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      centre: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false },
    },
    required: ['centre'],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = [
  "Tu analyses une image satellite (vue du dessus, nord en haut) du toit d'un bâtiment où sera posé un champ photovoltaïque sur châssis inclinés.",
  "Toutes les coordonnées sont en PIXELS de l'image : origine (0, 0) au coin supérieur gauche, x vers la droite, y vers le bas.",
  "Le toit est délimité par le contour tracé par l'installateur. Choisis le meilleur emplacement du champ sur ce toit : une zone dégagée et plane, à l'écart des obstacles (cage d'escalier, réservoirs d'eau, chauffe-eau solaires, paraboles, climatiseurs, acrotères) et de leurs ombres, en gardant un peu de recul par rapport aux bords du toit.",
  "Réponds uniquement avec le centre du champ, qui doit se trouver à l'intérieur du contour.",
].join(' ');

const px = (p: PixelPoint): string => `x=${Math.round(p.x)}, y=${Math.round(p.y)}`;
const metres = (value: number): string => value.toFixed(1).replace('.', ',');

function orientation(azimuthDeg: number): string {
  if (Math.abs(azimuthDeg) < 1) return 'les modules font face au sud, les rangées sont donc alignées est-ouest';
  const side = azimuthDeg > 0 ? 'ouest' : 'est';
  return `les modules font face au sud tourné de ${Math.abs(Math.round(azimuthDeg))}° vers l'${side}, les rangées sont perpendiculaires à cette direction`;
}

function describeScene(input: RoofPlacementInput): string {
  const { imageWidthPx: w, imageHeightPx: h, metersPerPixel: mpp, array } = input;
  return [
    `Image : ${w} x ${h} pixels, environ ${mpp.toFixed(2)} m par pixel.`,
    `Contour du toit (sommets dans l'ordre) : ${input.roofOutline.map((p) => `(${px(p)})`).join(' ; ')}.`,
    `Point « Champ PV » placé par l'installateur (indicatif) : ${px(input.field)}.`,
    `Champ à placer : ${array.moduleCount} modules en ${array.rows} rangée(s) de ${array.perRow} au plus, inclinés à ${Math.round(input.tiltDeg)}° ; ${orientation(input.azimuthDeg)}.`,
    `Emprise du champ, écarts entre rangées compris : environ ${metres(array.widthM)} m le long des rangées sur ${metres(array.depthM)} m, soit environ ${Math.round(array.widthM / mpp)} x ${Math.round(array.depthM / mpp)} pixels.`,
    `Le centre renvoyé doit vérifier 0 <= x <= ${w} et 0 <= y <= ${h} et être à l'intérieur du contour du toit.`,
  ].join('\n');
}

function isInsidePolygon(p: PixelPoint, polygon: PixelPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Throws a RoofPlacementParseError (retryable) for a centre off the photo or off the roof. */
export function validateRoofPlacement(placement: RoofPlacement, input: Pick<RoofPlacementInput, 'imageWidthPx' | 'imageHeightPx' | 'roofOutline'>): RoofPlacement {
  const { x, y } = placement.centre;
  if (x < 0 || y < 0 || x > input.imageWidthPx || y > input.imageHeightPx) {
    throw new RoofPlacementParseError(`centre (${x}, ${y}) is outside the ${input.imageWidthPx}x${input.imageHeightPx} image`);
  }
  if (!isInsidePolygon(placement.centre, input.roofOutline)) {
    throw new RoofPlacementParseError(`centre (${x}, ${y}) is outside the roof contour`);
  }
  return placement;
}

/**
 * Asks claude-opus-5-5 where the array should stand on the roof the installer drew, looking at
 * the photo for obstacles and shade. Only the centre comes back: the 3D view keeps the array a
 * compact grid there, narrowed to the roof's width (render-roof-3d.ts).
 */
export async function generateRoofPlacement(input: RoofPlacementInput, client: Anthropic): Promise<RoofPlacement> {
  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    // Thinking is always on with this model and counts against max_tokens: leave it room.
    max_tokens: 16000,
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
    output_config: { format: placementOutputFormat, effort: 'medium' },
  });

  if (response.stop_reason === 'refusal') {
    // Asking again would be declined again: the 3D view falls back to its own placement.
    throw new Error('Claude declined the roof placement request');
  }
  if (response.parsed_output === null) {
    throw new RoofPlacementParseError('no parsed_output in response');
  }
  const parsed = placementSchema.safeParse(response.parsed_output);
  if (!parsed.success) {
    throw new RoofPlacementParseError(parsed.error.message);
  }
  return validateRoofPlacement(parsed.data, input);
}
