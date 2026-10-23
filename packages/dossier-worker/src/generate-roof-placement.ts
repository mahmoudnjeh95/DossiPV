import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { PixelPoint } from './fetch-satellite-image';

/** The compact array the 3D view draws (compactArrayFootprint): its rows and its footprint on the roof. */
export interface ArrayToPlace {
  moduleCount: number;
  perRow: number;
  rows: number;
  widthM: number;
  depthM: number;
}

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
  array: ArrayToPlace;
  /** PVGIS convention: 0 = south, +90 = west, -90 = east. */
  azimuthDeg: number;
  tiltDeg: number;
}

/** In the photo's PIXEL space (origin top-left, x right, y down), like the 3D view draws it. */
export interface RoofPlacement {
  centre: PixelPoint;
  /**
   * The free length along the rows through the centre, between the borders or obstacles that
   * close the chosen part of the roof (setback deducted): a row never runs longer. Null when
   * Claude gave none that makes sense.
   */
  freeRowLengthPx: number | null;
}

const placementSchema = z.object({ centre: z.object({ x: z.number().finite(), y: z.number().finite() }), freeRowLengthPx: z.number() });

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
      freeRowLengthPx: { type: 'number' },
    },
    required: ['centre', 'freeRowLengthPx'],
    additionalProperties: false,
  },
};

/** Where an array may stand on a roof photo; both vision prompts state it. */
export const ROOF_PART_RULE = [
  "Avant de répondre, repère sur la photo chaque obstacle du toit : cage d'escalier, édicule, réservoirs et citernes d'eau, chauffe-eau solaires, panneaux existants, paraboles, antennes, climatiseurs, cheminées, lanterneaux et puits de lumière, gaines, conduits et tuyaux, garde-corps, arbres en surplomb ; dans le doute, une forme en relief ou une tache sombre est un obstacle.",
  "Le champ entier, toute son emprise comprise, doit tenir dans UNE seule partie plane et dégagée du toit : il ne recouvre ni ne chevauche aucun obstacle, aucune bordure, aucun muret ni aucune marche, et garde au moins 50 cm de recul par rapport à chacun et aux bords du toit.",
  "Il reste aussi hors de l'ombre portée en hiver par les éléments hauts (cage d'escalier, murs, réservoirs, arbres), qui s'étend vers le nord sur plus d'une fois et demie leur hauteur.",
].join(' ');

const SYSTEM_PROMPT = [
  "Tu analyses une image satellite (vue du dessus, nord en haut) du toit d'un bâtiment où sera posé un champ photovoltaïque sur châssis inclinés.",
  "Toutes les coordonnées sont en PIXELS de l'image : origine (0, 0) au coin supérieur gauche, x vers la droite, y vers le bas.",
  "Le toit est délimité par le contour tracé par l'installateur, qui peut englober plusieurs parties séparées par des bordures : acrotères, murets, relevés, marches entre deux niveaux, gaines ou joints.",
  ROOF_PART_RULE,
  "Choisis la plus grande partie qui convient. Si aucune n'est assez longue pour une rangée complète, prends la plus longue : le champ y sera réparti en davantage de rangées plus courtes.",
  "Réponds avec le centre du champ, à l'intérieur du contour, et la longueur libre le long des rangées à travers ce centre : la distance en pixels entre les bordures ou obstacles qui ferment la partie choisie de part et d'autre, recul déduit.",
].join(' ');

const px = (p: PixelPoint): string => `x=${Math.round(p.x)}, y=${Math.round(p.y)}`;
const metres = (value: number): string => value.toFixed(1).replace('.', ',');

function orientation(azimuthDeg: number): string {
  if (Math.abs(azimuthDeg) < 1) return 'les modules font face au sud, les rangées sont donc alignées est-ouest';
  const side = azimuthDeg > 0 ? 'ouest' : 'est';
  return `les modules font face au sud tourné de ${Math.abs(Math.round(azimuthDeg))}° vers l'${side}, les rangées sont perpendiculaires à cette direction`;
}

/** The array's rows, orientation and footprint in metres and pixels, as both vision prompts state them. */
export function describeArray(array: ArrayToPlace, tiltDeg: number, azimuthDeg: number, metersPerPixel: number): string[] {
  return [
    `Champ à placer : ${array.moduleCount} modules en ${array.rows} rangée(s) de ${array.perRow} au plus, inclinés à ${Math.round(tiltDeg)}° ; ${orientation(azimuthDeg)}.`,
    `Emprise du champ, écarts entre rangées compris : environ ${metres(array.widthM)} m le long des rangées sur ${metres(array.depthM)} m, soit environ ${Math.round(array.widthM / metersPerPixel)} x ${Math.round(array.depthM / metersPerPixel)} pixels.`,
  ];
}

function describeScene(input: RoofPlacementInput): string {
  const { imageWidthPx: w, imageHeightPx: h, metersPerPixel: mpp } = input;
  return [
    `Image : ${w} x ${h} pixels, environ ${mpp.toFixed(2)} m par pixel.`,
    `Contour du toit (sommets dans l'ordre) : ${input.roofOutline.map((p) => `(${px(p)})`).join(' ; ')}.`,
    `Point « Champ PV » placé par l'installateur (indicatif) : ${px(input.field)}.`,
    ...describeArray(input.array, input.tiltDeg, input.azimuthDeg, mpp),
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
 * the photo for the borders between roof parts, obstacles and shade. The centre and the free
 * length along the rows there come back: the 3D view keeps the array a compact grid at that
 * centre, its rows no longer than that length or the roof's width (render-roof-3d.ts).
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
  const { centre, freeRowLengthPx } = parsed.data;
  return validateRoofPlacement({ centre, freeRowLengthPx: Number.isFinite(freeRowLengthPx) && freeRowLengthPx > 0 ? freeRowLengthPx : null }, input);
}
