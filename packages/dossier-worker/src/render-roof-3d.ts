import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { computeRowSpacingM } from '@dossipv/engine';
import { A4_LANDSCAPE, BLACK, drawSheet, label, type DrawingCartouche, type Fonts, type Rect } from './drawing-kit';
import { embedLogo } from './render-cover-page';
import { decodeJpegBitmap, encodeJpegBitmap, type Bitmap } from './image-enhance';
import { drawPdfText, wrapPdfText } from './pdf-text';
import type { PixelPoint } from './fetch-satellite-image';

export interface Roof3dInput {
  /** The satellite photo (ideally already enhanced) and the view it shows. */
  image: { buffer: Buffer; widthPx: number; heightPx: number; metersPerPixel: number };
  /** The PV field centre and the installer's points, in the view's pixel space. */
  field: PixelPoint;
  technicalRoom: PixelPoint | null;
  meter: PixelPoint | null;
  earthPit: PixelPoint | null;
  /** The Premium AI layout's panel quadrilateral (view pixels); null makes the array a compact grid at `field`. */
  footprint: PixelPoint[] | null;
  /**
   * The roof contour the installer drew (view pixels): drawn on the photo and, without an AI
   * footprint, the array is centred on the roof and its rows kept within the roof's width.
   */
  roofOutline?: PixelPoint[] | null;
  /** The roof's surface measured on the map (m²): every measurement comes from the map, none from the photo. */
  roofAreaM2?: number | null;
  /**
   * Where Claude chose to centre the array on the drawn roof (view pixels), with the free length
   * along the rows there, between the borders of that part of the roof; used without an AI footprint.
   */
  placement?: { centre: PixelPoint; freeRowLengthPx: number | null } | null;
  /** Who the photo is credited to, printed on it. */
  imageCredit?: string | null;
  moduleCount: number;
  moduleLengthM: number;
  moduleWidthM: number;
  moduleLabel: string;
  tiltDeg: number;
  /** PVGIS convention: 0 = south, +90 = west, -90 = east. */
  azimuthDeg: number;
  latitudeDeg: number;
  installedKWp: number;
  cartouche: DrawingCartouche;
}

export interface Vec2 {
  e: number;
  n: number;
}

export const ROOF_VIEW_TITLE = 'Implantation des modules sur toiture : vue de dessus et coupe';

const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.4, 0.4, 0.4);
const POINT_COLORS = { room: rgb(0.12, 0.44, 0.85), meter: rgb(0.85, 0.19, 0.15), earth: rgb(0.12, 0.56, 0.24) };
// The map editor's roof contour colour (ROOF_OUTLINE_STYLE in point-markers.ts).
const ROOF_CYAN = rgb(0, 184 / 255, 217 / 255);
// Page 37's conductor colours.
const DC_RED = rgb(0.8, 0, 0);
const AC_BROWN = rgb(0.55, 0.27, 0.07);
const PE_GREEN = rgb(0.1, 0.55, 0.2);
const PE_YELLOW = rgb(1, 0.85, 0);
const MODULE_COLOR = rgb(0.09, 0.17, 0.38);
const MODULE_FRAME = rgb(0.82, 0.85, 0.9);
const CELL_LINE = rgb(0.38, 0.48, 0.74);
const STRUCTURE_GREY = rgb(0.45, 0.47, 0.5);
const SUN_ORANGE = rgb(0.9, 0.5, 0);
const MODULE_GAP_M = 0.02;
const LOW_EDGE_HEIGHT_M = 0.35;
const MAX_ARRAY_MODULES_PER_ROW = 40;
/** A module's cells as drawn: 6 across its width, 12 along its length (a half-cut module shows its split). */
const CELLS = { across: 6, along: 12 };
/** Ground kept around the array, the roof and the points, so the roof edges and the street show. */
const GROUND_MARGIN_M = 6;
/** The plan view's share of the drawing area's width; the facts and the section take the rest. */
const PLAN_SHARE = 0.63;
const DIMENSION_TEXT_SIZE = 7;
const SHADOW_OPACITY = 0.24;

const rad = (deg: number): number => (deg * Math.PI) / 180;

function isInsidePolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.n > p.n !== b.n > p.n && p.e < ((b.e - a.e) * (p.n - a.n)) / (b.n - a.n) + a.e) inside = !inside;
  }
  return inside;
}

function polygonCentre(polygon: Vec2[]): Vec2 {
  let twice = 0;
  let e = 0;
  let n = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = a.e * b.n - b.e * a.n;
    twice += cross;
    e += (a.e + b.e) * cross;
    n += (a.n + b.n) * cross;
  }
  if (Math.abs(twice) < 1e-9) return { e: polygon.reduce((sum, p) => sum + p.e, 0) / polygon.length, n: polygon.reduce((sum, p) => sum + p.n, 0) / polygon.length };
  return { e: e / (3 * twice), n: n / (3 * twice) };
}

/**
 * The stretch of the line `from + t·direction` inside the polygon that contains `from` (t = 0),
 * as [start, end] in metres along `direction`; null when `from` is not inside.
 */
function chordThrough(polygon: Vec2[], from: Vec2, direction: Vec2): [number, number] | null {
  const hits: number[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const edge = { e: b.e - a.e, n: b.n - a.n };
    const denominator = direction.e * edge.n - direction.n * edge.e;
    if (Math.abs(denominator) < 1e-12) continue; // parallel edge
    const offset = { e: a.e - from.e, n: a.n - from.n };
    const t = (offset.e * edge.n - offset.n * edge.e) / denominator;
    const u = (offset.e * direction.n - offset.n * direction.e) / denominator;
    if (u >= 0 && u < 1) hits.push(t);
  }
  hits.sort((x, y) => x - y);
  for (let i = 0; i + 1 < hits.length; i += 1) {
    if (hits[i]! <= 0 && hits[i + 1]! >= 0) return [hits[i]!, hits[i + 1]!];
  }
  return null;
}

/**
 * Where the array goes on the drawn roof: through the field point when it is on the roof (else
 * the roof's centre), moved to the middle of the roof across the rows and then along them. The
 * room for a row is the roof's width across the rows, over the whole depth of a row (a roof
 * drawn at an angle narrows towards its corners).
 */
export function fitOnRoof(roof: Vec2[], field: Vec2, facing: Vec2, across: Vec2, rowDepthM = 0): { centre: Vec2; widthM: number | null } {
  let centre = isInsidePolygon(field, roof) ? field : polygonCentre(roof);
  const acrossChord = chordThrough(roof, centre, across);
  if (!acrossChord) return { centre, widthM: null };
  const acrossShift = (acrossChord[0] + acrossChord[1]) / 2;
  centre = { e: centre.e + across.e * acrossShift, n: centre.n + across.n * acrossShift };
  const facingChord = chordThrough(roof, centre, facing);
  if (facingChord) {
    const facingShift = (facingChord[0] + facingChord[1]) / 2;
    centre = { e: centre.e + facing.e * facingShift, n: centre.n + facing.n * facingShift };
  }
  return { centre, widthM: roomAcross(roof, centre, facing, across, rowDepthM) };
}

/**
 * The longest row centred on `centre` that stays on the roof, over the whole depth of a row: on
 * each edge of the row, twice the distance to the nearer side of the roof. Null off the roof.
 */
export function roomAcross(roof: Vec2[], centre: Vec2, facing: Vec2, across: Vec2, rowDepthM = 0): number | null {
  let widthM = Number.POSITIVE_INFINITY;
  for (const f of [-rowDepthM / 2, 0, rowDepthM / 2]) {
    const chord = chordThrough(roof, { e: centre.e + facing.e * f, n: centre.n + facing.n * f }, across);
    if (chord) widthM = Math.min(widthM, 2 * Math.min(-chord[0], chord[1]));
  }
  return Number.isFinite(widthM) ? widthM : null;
}

/** What the array is made of; the same fields as Roof3dInput. */
export interface ArraySpec {
  moduleCount: number;
  moduleLengthM: number;
  moduleWidthM: number;
  tiltDeg: number;
  latitudeDeg: number;
}

/**
 * The compact array with no width limit: about as deep as wide once the rows are spaced so they
 * do not shade each other at the winter solstice. Its footprint, gaps between rows included.
 */
export function compactArrayFootprint(spec: ArraySpec): { perRow: number; rows: number; widthM: number; depthM: number } {
  const depth = spec.moduleLengthM * Math.cos(rad(spec.tiltDeg));
  const pitch = depth + computeRowSpacingM(spec.tiltDeg, spec.moduleLengthM, spec.latitudeDeg);
  const ideal = Math.ceil(Math.sqrt((spec.moduleCount * pitch) / (spec.moduleWidthM + MODULE_GAP_M)));
  const perRow = Math.max(1, Math.min(MAX_ARRAY_MODULES_PER_ROW, spec.moduleCount, ideal));
  const rows = Math.ceil(spec.moduleCount / perRow);
  return { perRow, rows, widthM: perRow * (spec.moduleWidthM + MODULE_GAP_M), depthM: (rows - 1) * pitch + depth };
}

/** The facing direction of the modules (horizontal, east/north metres): azimuth 0 faces south. */
function facingVector(azimuthDeg: number): Vec2 {
  return { e: -Math.sin(rad(azimuthDeg)), n: -Math.cos(rad(azimuthDeg)) };
}

interface ModuleQuad {
  /** The four corners, front-left, front-right, back-right, back-left, as [east, north, height]. */
  corners: [number, number, number][];
  row: number;
}

interface ArrayModel {
  modules: ModuleQuad[];
  /** Per row: the shadow polygon on the ground (east, north). */
  shadows: [number, number][][];
  /** The array's middle, the direction the modules face and the one a row runs along. */
  centre: Vec2;
  facing: Vec2;
  across: Vec2;
  widthM: number;
  depthM: number;
  rows: number;
  perRow: number;
  /** A row's depth on the ground, the height its back edge rises above its front edge, row to row. */
  rowDepthM: number;
  riseM: number;
  pitchM: number;
  /** The sun's height at noon on the winter solstice, which the rows are spaced for. */
  sunElevationDeg: number;
}

/**
 * Modules in rows facing `azimuthDeg`, rows spaced so they do not shade each other at the winter
 * solstice. `room` caps a row's length: `fill` packs every row to it (the AI rectangle is sized
 * for the array); otherwise the array stays a compact grid, only narrowed to fit (a whole roof).
 */
function buildArray(input: Roof3dInput, centre: Vec2, room: { widthM: number; fill: boolean } | null): ArrayModel {
  const { moduleCount, moduleLengthM: length, moduleWidthM: width, tiltDeg } = input;
  const facing = facingVector(input.azimuthDeg);
  const across: Vec2 = { e: -facing.n, n: facing.e }; // along a row
  const depth = length * Math.cos(rad(tiltDeg));
  const heightGain = length * Math.sin(rad(tiltDeg));
  const pitch = depth + computeRowSpacingM(tiltDeg, length, input.latitudeDeg);

  const idealPerRow = compactArrayFootprint(input).perRow;
  // The AI rectangle is drawn to the compact row's width by eye, a few pixels either way: a row up
  // to half a module wider still fills it. A drawn roof's edge is a hard limit.
  const modulesAcross = room ? room.widthM / (width + MODULE_GAP_M) : 0;
  const fitPerRow = room ? (room.fill ? Math.round(modulesAcross) : Math.floor(modulesAcross)) : idealPerRow;
  const wantedPerRow = room && !room.fill ? Math.min(idealPerRow, fitPerRow) : fitPerRow;
  const perRow = Math.max(1, Math.min(MAX_ARRAY_MODULES_PER_ROW, moduleCount, fitPerRow > 0 ? wantedPerRow : idealPerRow));
  const rows = Math.ceil(moduleCount / perRow);
  const arrayWidth = perRow * (width + MODULE_GAP_M);
  const arrayDepth = (rows - 1) * pitch + depth;
  const sunElevationDeg = Math.max(10, 90 - Math.abs(input.latitudeDeg + 23.45));

  const modules: ModuleQuad[] = [];
  const shadows: [number, number][][] = [];
  const point = (u: number, f: number, z: number): [number, number, number] => [
    centre.e + across.e * u + facing.e * f,
    centre.n + across.n * u + facing.n * f,
    z,
  ];
  let placed = 0;
  for (let row = 0; row < rows; row += 1) {
    // Row 0 is the front one; further rows stand behind it (opposite to the facing direction).
    const frontF = arrayDepth / 2 - row * pitch;
    const backF = frontF - depth;
    const inRow = Math.min(perRow, moduleCount - placed);
    const rowStartU = -(inRow * (width + MODULE_GAP_M)) / 2;
    for (let j = 0; j < inRow; j += 1) {
      const u0 = rowStartU + j * (width + MODULE_GAP_M);
      const u1 = u0 + width;
      modules.push({
        corners: [point(u0, frontF, LOW_EDGE_HEIGHT_M), point(u1, frontF, LOW_EDGE_HEIGHT_M), point(u1, backF, LOW_EDGE_HEIGHT_M + heightGain), point(u0, backF, LOW_EDGE_HEIGHT_M + heightGain)],
        row,
      });
    }
    placed += inRow;
    // The shadow of the high edge falls behind the row (away from the sun).
    const shadowLength = (LOW_EDGE_HEIGHT_M + heightGain) / Math.tan(rad(sunElevationDeg));
    const left = rowStartU;
    const right = rowStartU + inRow * (width + MODULE_GAP_M) - MODULE_GAP_M;
    const toGround = (u: number, f: number): [number, number] => [centre.e + across.e * u + facing.e * f, centre.n + across.n * u + facing.n * f];
    shadows.push([toGround(left, frontF), toGround(right, frontF), toGround(right, backF - shadowLength), toGround(left, backF - shadowLength)]);
  }
  return { modules, shadows, centre, facing, across, widthM: arrayWidth, depthM: arrayDepth, rows, perRow, rowDepthM: depth, riseM: heightGain, pitchM: pitch, sunElevationDeg };
}

/** `2 rangées de 6 modules`, or `2 rangées (6 + 3 modules)` when the last row is shorter. */
function rowsText(model: ArrayModel, moduleCount: number): string {
  const modules = (n: number): string => `${n} module${n > 1 ? 's' : ''}`;
  if (model.rows === 1) return `1 rangée de ${modules(moduleCount)}`;
  const last = moduleCount - (model.rows - 1) * model.perRow;
  if (last === model.perRow) return `${model.rows} rangées de ${modules(model.perRow)}`;
  return `${model.rows} rangées (${Array.from({ length: model.rows - 1 }, () => model.perRow).join(' + ')} + ${modules(last)})`;
}

/** A length in metres the French way: `5,77 m`. */
const metres = (value: number, decimals = 2): string => `${value.toFixed(decimals).replace('.', ',')} m`;

function cropBitmap(bitmap: Bitmap, x0: number, y0: number, width: number, height: number): Bitmap {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const from = ((y0 + row) * bitmap.width + x0) * 4;
    data.set(bitmap.data.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, data };
}

type PagePoint = { x: number; y: number };

const svgPath = (points: PagePoint[]): string => `M ${points.map((p) => `${p.x.toFixed(2)} ${(A4_LANDSCAPE[1] - p.y).toFixed(2)}`).join(' L ')} Z`;

function fillPolygon(page: PDFPage, points: PagePoint[], color: RGB, opacity: number, border?: { color: RGB; width: number; opacity?: number }): void {
  page.drawSvgPath(svgPath(points), {
    x: 0,
    y: A4_LANDSCAPE[1],
    color,
    opacity,
    ...(border ? { borderColor: border.color, borderWidth: border.width, borderOpacity: border.opacity ?? 1 } : {}),
  });
}

/** A line with a white halo under it, readable on any photo. */
function haloLine(page: PDFPage, start: PagePoint, end: PagePoint, thickness: number, color: RGB, dashArray?: number[]): void {
  page.drawLine({ start, end, thickness: thickness + 1.8, color: WHITE, opacity: 0.85 });
  page.drawLine({ start, end, thickness, color, ...(dashArray ? { dashArray } : {}) });
}

const lerp = (a: PagePoint, b: PagePoint, t: number): PagePoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const unit = (v: PagePoint): PagePoint => {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
};

/**
 * A dimension line from a to b pushed out by `offset` (page points): extension lines, 45° ticks
 * and the length centred on it, upright, on its outer side. `halo` backs it in white over a photo.
 */
function drawDimension(page: PDFPage, font: PDFFont, a: PagePoint, b: PagePoint, offset: PagePoint, text: string, halo: boolean): void {
  const out = unit(offset);
  const a2 = { x: a.x + offset.x, y: a.y + offset.y };
  const b2 = { x: b.x + offset.x, y: b.y + offset.y };
  const along = unit({ x: b2.x - a2.x, y: b2.y - a2.y });
  const line = (start: PagePoint, end: PagePoint, thickness: number): void => (halo ? haloLine(page, start, end, thickness, BLACK) : page.drawLine({ start, end, thickness, color: BLACK }));
  for (const [from, to] of [[a, a2], [b, b2]] as const) {
    line({ x: from.x + out.x * 2, y: from.y + out.y * 2 }, { x: to.x + out.x * 3, y: to.y + out.y * 3 }, 0.4);
  }
  line(a2, b2, 0.6);
  const tick = unit({ x: along.x + out.x, y: along.y + out.y });
  for (const p of [a2, b2]) page.drawLine({ start: { x: p.x - tick.x * 2.4, y: p.y - tick.y * 2.4 }, end: { x: p.x + tick.x * 2.4, y: p.y + tick.y * 2.4 }, thickness: 0.9, color: BLACK });

  // Upright text: read left to right (or bottom to top), on the side away from what is measured.
  const dir = along.x < -1e-6 || (Math.abs(along.x) <= 1e-6 && along.y < 0) ? { x: -along.x, y: -along.y } : along;
  const up = { x: -dir.y, y: dir.x };
  const size = DIMENSION_TEXT_SIZE;
  const width = font.widthOfTextAtSize(text, size);
  const lift = up.x * out.x + up.y * out.y >= 0 ? 1.8 : -(1.8 + size * 0.72);
  const mid = lerp(a2, b2, 0.5);
  const start = { x: mid.x - (dir.x * width) / 2 + up.x * lift, y: mid.y - (dir.y * width) / 2 + up.y * lift };
  const angle = degrees((Math.atan2(dir.y, dir.x) * 180) / Math.PI);
  if (halo) {
    page.drawRectangle({ x: start.x - dir.x * 1.5 - up.x * 1.5, y: start.y - dir.y * 1.5 - up.y * 1.5, width: width + 3, height: size * 0.72 + 3, color: WHITE, opacity: 0.85, rotate: angle });
  }
  drawPdfText(page, text, { x: start.x, y: start.y, size, font, color: BLACK, rotate: angle });
}

function drawArrowHead(page: PDFPage, tip: PagePoint, direction: PagePoint, size: number, color: RGB): void {
  const d = unit(direction);
  const side = { x: -d.y, y: d.x };
  const base = { x: tip.x - d.x * size, y: tip.y - d.y * size };
  fillPolygon(page, [tip, { x: base.x + side.x * size * 0.45, y: base.y + side.y * size * 0.45 }, { x: base.x - side.x * size * 0.45, y: base.y - side.y * size * 0.45 }], color, 1);
}

/** Which way the modules face, in words. */
function facingText(azimuthDeg: number): string {
  return Math.abs(azimuthDeg) < 1 ? 'plein sud' : `${azimuthDeg > 0 ? 'ouest' : 'est'} (${Math.abs(Math.round(azimuthDeg))}° du sud)`;
}

/**
 * Section A-A through the rows, seen from the side: the roof, the frames, the modules at their
 * tilt, the ground depth of a row, the rise of its back edge, the gap to the next row and the
 * winter-solstice noon sun ray that sets that gap.
 */
function drawSection(page: PDFPage, fonts: Fonts, box: Rect, model: ArrayModel, input: Roof3dInput): void {
  page.drawRectangle({ x: box.x, y: box.y, width: box.width, height: box.height, borderColor: BLACK, borderWidth: 0.6 });
  const titleWidth = label(page, fonts.bold, 'Coupe A-A', { x: box.x + 6, y: box.y + box.height - 12 }, 8.5);
  label(page, fonts.regular, '(rangées vues de côté)', { x: box.x + 10 + titleWidth, y: box.y + box.height - 12 }, 7, GREY);

  const shown = Math.min(model.rows, 2);
  const depth = model.rowDepthM;
  const rise = model.riseM;
  const gap = model.pitchM - depth;
  const low = LOW_EDGE_HEIGHT_M;
  const xMin = -1.1; // the rise dimension stands in front of the first row
  const xMax = (shown - 1) * model.pitchM + depth + gap + 0.5;
  const zMin = -0.3;
  const zMax = low + rise + 0.9;
  const inner = { x: box.x + 8, y: box.y + 30, width: box.width - 16, height: box.height - 30 - 34 };
  const k = Math.min(inner.width / (xMax - xMin), inner.height / (zMax - zMin));
  const left = inner.x + (inner.width - (xMax - xMin) * k) / 2;
  const P = (x: number, z: number): PagePoint => ({ x: left + (x - xMin) * k, y: inner.y + (z - zMin) * k });

  // The roof slab.
  const slabTop = P(xMin, 0);
  const slabBottom = P(xMax, zMin);
  page.drawRectangle({ x: slabTop.x, y: slabBottom.y, width: slabBottom.x - slabTop.x, height: slabTop.y - slabBottom.y, color: rgb(0.9, 0.9, 0.9), borderColor: BLACK, borderWidth: 0.5 });
  for (let x = slabTop.x + 6; x < slabBottom.x; x += 6) {
    const top = Math.min(slabBottom.x, x + (slabTop.y - slabBottom.y));
    page.drawLine({ start: { x, y: slabBottom.y }, end: { x: top, y: slabBottom.y + (top - x) }, thickness: 0.3, color: GREY });
  }
  page.drawLine({ start: slabTop, end: { x: slabBottom.x, y: slabTop.y }, thickness: 1.2, color: BLACK });

  for (let row = 0; row < shown; row += 1) {
    const front = row * model.pitchM;
    const heightAt = (x: number): number => low + ((x - front) / depth) * rise;
    // The frame: a base rail, a short front leg, a tall rear leg and a brace.
    const frontLeg = front + 0.1 * depth;
    const rearLeg = front + 0.9 * depth;
    page.drawLine({ start: P(front, 0.03), end: P(front + depth, 0.03), thickness: 1.8, color: STRUCTURE_GREY });
    page.drawLine({ start: P(frontLeg, 0), end: P(frontLeg, heightAt(frontLeg)), thickness: 1.3, color: STRUCTURE_GREY });
    page.drawLine({ start: P(rearLeg, 0), end: P(rearLeg, heightAt(rearLeg)), thickness: 1.3, color: STRUCTURE_GREY });
    page.drawLine({ start: P(frontLeg, 0.03), end: P(rearLeg, heightAt(rearLeg) * 0.55), thickness: 0.7, color: STRUCTURE_GREY });
    // The module, seen edge-on.
    page.drawLine({ start: P(front, low), end: P(front + depth, low + rise), thickness: 3.4, color: MODULE_COLOR });
    page.drawLine({ start: P(front, low), end: P(front + depth, low + rise), thickness: 0.5, color: MODULE_FRAME });
  }

  // The tilt, measured at the first row's low edge.
  const pivot = P(0, low);
  page.drawLine({ start: pivot, end: P(depth * 0.6, low), thickness: 0.4, color: GREY, dashArray: [2, 1.5] });
  const radius = depth * 0.42 * k;
  const tilt = rad(input.tiltDeg);
  for (let i = 0; i < 12; i += 1) {
    const a0 = (tilt * i) / 12;
    const a1 = (tilt * (i + 1)) / 12;
    page.drawLine({ start: { x: pivot.x + radius * Math.cos(a0), y: pivot.y + radius * Math.sin(a0) }, end: { x: pivot.x + radius * Math.cos(a1), y: pivot.y + radius * Math.sin(a1) }, thickness: 0.6, color: BLACK });
  }
  label(page, fonts.bold, `${Math.round(input.tiltDeg)}°`, { x: pivot.x + (radius + 3) * Math.cos(tilt / 2), y: pivot.y + (radius + 3) * Math.sin(tilt / 2) - 3 }, 7.5);

  // The winter-solstice noon sun ray over the first row's high edge to where its shadow ends.
  const sun = rad(model.sunElevationDeg);
  const high = { x: depth, z: low + rise };
  const lead = 0.9;
  const rayStart = P(high.x - lead * Math.cos(sun), high.z + lead * Math.sin(sun));
  page.drawLine({ start: rayStart, end: P(depth + gap, low), thickness: 0.8, color: SUN_ORANGE, dashArray: [3, 2] });
  page.drawCircle({ x: rayStart.x - 4, y: rayStart.y + 3, size: 2.6, color: SUN_ORANGE });
  const sunText = `Soleil le 21 déc. à midi : ${model.sunElevationDeg.toFixed(1).replace('.', ',')}°`;
  label(page, fonts.regular, sunText, { x: Math.min(rayStart.x + 2, box.x + box.width - 6 - fonts.regular.widthOfTextAtSize(sunText, 7)), y: Math.min(rayStart.y + 6, box.y + box.height - 26) }, 7, SUN_ORANGE);

  // Dimensions: the ground depth of a row and the gap behind it, under the roof line...
  const below = { x: 0, y: -10 };
  drawDimension(page, fonts.regular, P(0, zMin), P(depth, zMin), below, metres(depth), false);
  drawDimension(page, fonts.regular, P(depth, zMin), P(depth + gap, zMin), below, shown > 1 ? metres(gap) : `ombre ${metres(gap)}`, false);
  // ...and the rise of the back edge, in front of the first row.
  page.drawLine({ start: P(depth, low + rise), end: P(-0.5, low + rise), thickness: 0.3, color: GREY, dashArray: [1.5, 1.5] });
  drawDimension(page, fonts.regular, P(-0.35, low), P(-0.35, low + rise), { x: -0.25 * k, y: 0 }, metres(rise), false);

  // Which way the modules face: towards the left of the section.
  const arrowY = box.y + box.height - 24;
  const arrowX = box.x + 10;
  page.drawLine({ start: { x: arrowX + 26, y: arrowY }, end: { x: arrowX + 4, y: arrowY }, thickness: 0.9, color: BLACK });
  drawArrowHead(page, { x: arrowX, y: arrowY }, { x: -1, y: 0 }, 5, BLACK);
  label(page, fonts.regular, `Face au ${Math.abs(input.azimuthDeg) < 1 ? 'sud' : facingText(input.azimuthDeg)}`, { x: arrowX + 30, y: arrowY - 2.5 }, 7);
}

/** A north arrow in the top-right corner of a north-up photo. */
function drawNorthArrow(page: PDFPage, rect: Rect, font: PDFFont): void {
  const cx = rect.x + rect.width - 18;
  const top = rect.y + rect.height - 6;
  page.drawRectangle({ x: cx - 11, y: top - 44, width: 22, height: 40, color: WHITE, opacity: 0.88, borderColor: BLACK, borderWidth: 0.5 });
  page.drawText('N', { x: cx - font.widthOfTextAtSize('N', 9) / 2, y: top - 14, size: 9, font, color: BLACK });
  fillPolygon(page, [{ x: cx, y: top - 17 }, { x: cx - 5, y: top - 27 }, { x: cx + 5, y: top - 27 }], BLACK, 1);
  page.drawLine({ start: { x: cx, y: top - 26 }, end: { x: cx, y: top - 40 }, thickness: 1.6, color: BLACK });
}

/** A two-tone scale bar in the bottom-left corner of the photo: the shortest round length of 40 pt or more. */
function drawScaleBar(page: PDFPage, rect: Rect, ptPerMetre: number, font: PDFFont): void {
  const lengths = [1, 2, 5, 10, 20, 50, 100];
  const length = lengths.find((m) => m * ptPerMetre >= 40) ?? lengths[lengths.length - 1]!;
  const width = length * ptPerMetre;
  const x = rect.x + 10;
  const y = rect.y + 8;
  page.drawRectangle({ x: x - 6, y: y - 4, width: width + 30, height: 22, color: WHITE, opacity: 0.88 });
  for (let i = 0; i < 4; i += 1) {
    page.drawRectangle({ x: x + (i * width) / 4, y: y + 8, width: width / 4, height: 3.5, color: i % 2 === 0 ? BLACK : WHITE, borderColor: BLACK, borderWidth: 0.4 });
  }
  page.drawText('0', { x: x - 2, y, size: 7, font, color: BLACK });
  const text = `${length} m`;
  page.drawText(text, { x: x + width - font.widthOfTextAtSize(text, 7) / 2, y, size: 7, font, color: BLACK });
}

interface GroundBounds {
  eMin: number;
  eMax: number;
  nMin: number;
  nMax: number;
}

/** A piece of the photo drawn north up at one scale: where it landed and how to place a ground point on it. */
interface GroundView {
  rect: Rect;
  /** Page points per ground metre. */
  scale: number;
  ground: GroundBounds;
  at: (p: Vec2) => PagePoint;
}

function boundsAround(points: Vec2[], marginM: number): GroundBounds {
  return {
    eMin: Math.min(...points.map((p) => p.e)) - marginM,
    eMax: Math.max(...points.map((p) => p.e)) + marginM,
    nMin: Math.min(...points.map((p) => p.n)) - marginM,
    nMax: Math.max(...points.map((p) => p.n)) + marginM,
  };
}

/**
 * Draws the ground `wanted` shows (metres east/north of the field point), widened to the box's
 * proportions and cut to the photo, north up and undeformed, in the middle of `box`; a light veil
 * keeps the drawing over it readable.
 */
async function drawGround(doc: PDFDocument, page: PDFPage, photo: Bitmap, input: Roof3dInput, box: Rect, wanted: GroundBounds): Promise<GroundView> {
  const mpp = input.image.metersPerPixel;
  const bounds = { ...wanted };
  const boxAspect = box.width / box.height;
  const spanE = bounds.eMax - bounds.eMin;
  const spanN = bounds.nMax - bounds.nMin;
  if (spanE / spanN < boxAspect) {
    const grow = (spanN * boxAspect - spanE) / 2;
    bounds.eMin -= grow;
    bounds.eMax += grow;
  } else {
    const grow = (spanE / boxAspect - spanN) / 2;
    bounds.nMin -= grow;
    bounds.nMax += grow;
  }
  // Never beyond the photo: the crop, snapped to whole photo pixels, sets the ground shown.
  const bitmapScale = photo.width / input.image.widthPx;
  const x0 = Math.max(0, Math.floor((input.field.x + bounds.eMin / mpp) * bitmapScale));
  const x1 = Math.max(x0 + 1, Math.min(photo.width, Math.ceil((input.field.x + bounds.eMax / mpp) * bitmapScale)));
  const y0 = Math.max(0, Math.floor((input.field.y - bounds.nMax / mpp) * bitmapScale));
  const y1 = Math.max(y0 + 1, Math.min(photo.height, Math.ceil((input.field.y - bounds.nMin / mpp) * bitmapScale)));
  const ground = {
    eMin: (x0 / bitmapScale - input.field.x) * mpp,
    eMax: (x1 / bitmapScale - input.field.x) * mpp,
    nMin: -(y1 / bitmapScale - input.field.y) * mpp,
    nMax: -(y0 / bitmapScale - input.field.y) * mpp,
  };
  const scale = Math.min(box.width / (ground.eMax - ground.eMin), box.height / (ground.nMax - ground.nMin));
  const rect: Rect = {
    x: box.x + (box.width - (ground.eMax - ground.eMin) * scale) / 2,
    y: box.y + (box.height - (ground.nMax - ground.nMin) * scale) / 2,
    width: (ground.eMax - ground.eMin) * scale,
    height: (ground.nMax - ground.nMin) * scale,
  };
  // A copy with its own buffer: pdf-lib reads a small JPEG from the start of a pooled Buffer's memory.
  const image = await doc.embedJpg(new Uint8Array(encodeJpegBitmap(cropBitmap(photo, x0, y0, x1 - x0, y1 - y0), 90)));
  page.drawImage(image, rect);
  page.drawRectangle({ ...rect, color: WHITE, opacity: 0.12 });
  page.drawRectangle({ ...rect, borderColor: BLACK, borderWidth: 0.8 });
  return { rect, scale, ground, at: (p) => ({ x: rect.x + (p.e - ground.eMin) * scale, y: rect.y + (p.n - ground.nMin) * scale }) };
}

/** The polygon cut to the ground bounds (Sutherland-Hodgman); empty when it lies outside them. */
function clipPolygon(polygon: Vec2[], bounds: GroundBounds): Vec2[] {
  const edges: [(p: Vec2) => number, (a: Vec2, b: Vec2) => Vec2][] = (
    [
      ['e', bounds.eMin, 1],
      ['e', bounds.eMax, -1],
      ['n', bounds.nMin, 1],
      ['n', bounds.nMax, -1],
    ] as const
  ).map(([axis, limit, sign]) => [
    (p: Vec2): number => sign * (p[axis] - limit),
    (a: Vec2, b: Vec2): Vec2 => {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      return { e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t };
    },
  ]);
  let output = polygon;
  for (const [inside, cross] of edges) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i]!;
      const previous = input[(i + input.length - 1) % input.length]!;
      if (inside(current) >= 0) {
        if (inside(previous) < 0) output.push(cross(previous, current));
        output.push(current);
      } else if (inside(previous) >= 0) {
        output.push(cross(previous, current));
      }
    }
    if (output.length === 0) break;
  }
  return output;
}

/** The segment a-b cut to the ground bounds (Liang-Barsky); null when it lies outside them. */
function clipSegment(a: Vec2, b: Vec2, bounds: GroundBounds): [Vec2, Vec2] | null {
  let t0 = 0;
  let t1 = 1;
  const d = { e: b.e - a.e, n: b.n - a.n };
  for (const [p, q] of [
    [-d.e, a.e - bounds.eMin],
    [d.e, bounds.eMax - a.e],
    [-d.n, a.n - bounds.nMin],
    [d.n, bounds.nMax - a.n],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    { e: a.e + d.e * t0, n: a.n + d.n * t0 },
    { e: a.e + d.e * t1, n: a.n + d.n * t1 },
  ];
}

/**
 * The roof contour, the rows' shadows and the modules (framed dark faces with their cells) on a
 * ground view. The contour is cut to the view: a detail shows only the part of the roof it covers.
 */
function drawArray(page: PDFPage, view: GroundView, model: ArrayModel, roof: Vec2[] | null): void {
  if (roof) {
    const inside = clipPolygon(roof, view.ground);
    if (inside.length >= 3) fillPolygon(page, inside.map(view.at), ROOF_CYAN, 0.1);
    for (let i = 0; i < roof.length; i += 1) {
      const edge = clipSegment(roof[i]!, roof[(i + 1) % roof.length]!, view.ground);
      if (edge) haloLine(page, view.at(edge[0]), view.at(edge[1]), 1.5, ROOF_CYAN);
    }
  }
  for (const shadow of model.shadows) fillPolygon(page, shadow.map(([e, n]) => view.at({ e, n })), BLACK, SHADOW_OPACITY);
  for (const module of model.modules) {
    const c = module.corners.map(([e, n]) => view.at({ e, n }));
    fillPolygon(page, c, MODULE_COLOR, 1, { color: MODULE_FRAME, width: 0.6 });
    const widthPt = Math.hypot(c[1]!.x - c[0]!.x, c[1]!.y - c[0]!.y);
    if (widthPt >= 9) {
      for (let i = 1; i < CELLS.across; i += 1) page.drawLine({ start: lerp(c[0]!, c[1]!, i / CELLS.across), end: lerp(c[3]!, c[2]!, i / CELLS.across), thickness: 0.2, color: CELL_LINE });
      for (let i = 1; i < CELLS.along; i += 1) page.drawLine({ start: lerp(c[0]!, c[3]!, i / CELLS.along), end: lerp(c[1]!, c[2]!, i / CELLS.along), thickness: 0.2, color: CELL_LINE });
    }
    page.drawLine({ start: lerp(c[0]!, c[3]!, 0.5), end: lerp(c[1]!, c[2]!, 0.5), thickness: 0.5, color: MODULE_FRAME });
  }
}

/** A caption in the top-left corner of a ground view. */
function drawCaption(page: PDFPage, rect: Rect, font: PDFFont, text: string): void {
  page.drawRectangle({ x: rect.x + 5, y: rect.y + rect.height - 16, width: font.widthOfTextAtSize(text, 7.5) + 8, height: 11, color: WHITE, opacity: 0.9 });
  label(page, font, text, { x: rect.x + 9, y: rect.y + rect.height - 13 }, 7.5);
}

/**
 * Annex N°5, sheet 2: the array on the roof as professional plan views, on the same photo as
 * page 37, north up and undeformed: the site with the cable routes and the installer's points,
 * a detail of the field to a larger scale with its dimensions (the modules with their cells and
 * the shadows they cast on the winter solstice), and a section through the rows giving the tilt,
 * the rise of the back edge and the gap between rows.
 */
export async function renderRoof3dView(input: Roof3dInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const page = doc.addPage(A4_LANDSCAPE);
  const logo = await embedLogo(doc, input.cartouche.logo);
  const area = drawSheet(page, fonts, {
    ...input.cartouche,
    logo,
    drawingTitle: ROOF_VIEW_TITLE,
    planNumber: 5,
    pageLabel: 'Feuille 2/2',
  });

  // ---- the array on the roof (metres east/north of the field point) ----------------------------
  const mpp = input.image.metersPerPixel;
  const toMetres = (p: PixelPoint): Vec2 => ({ e: (p.x - input.field.x) * mpp, n: -(p.y - input.field.y) * mpp });
  const footprint = input.footprint && input.footprint.length >= 3 ? input.footprint.map(toMetres) : null;
  const roof = input.roofOutline && input.roofOutline.length >= 3 ? input.roofOutline.map(toMetres) : null;
  const facing = facingVector(input.azimuthDeg);
  const across: Vec2 = { e: -facing.n, n: facing.e };
  let centre: Vec2 = { e: 0, n: 0 };
  let availableWidth: number | null = null;
  if (footprint) {
    centre = { e: footprint.reduce((s, p) => s + p.e, 0) / footprint.length, n: footprint.reduce((s, p) => s + p.n, 0) / footprint.length };
    availableWidth = Math.max(...footprint.map((p) => (p.e - centre.e) * across.e + (p.n - centre.n) * across.n)) * 2;
  } else if (roof) {
    const rowDepthM = input.moduleLengthM * Math.cos(rad(input.tiltDeg));
    const chosen = input.placement ? toMetres(input.placement.centre) : null;
    // Claude's choice when it is on the roof, its rows no longer than the free length it saw
    // between the borders there; else the middle of the roof through the field point.
    if (chosen && isInsidePolygon(chosen, roof)) {
      const freeM = input.placement?.freeRowLengthPx ? input.placement.freeRowLengthPx * mpp : Number.POSITIVE_INFINITY;
      centre = chosen;
      availableWidth = Math.min(roomAcross(roof, chosen, facing, across, rowDepthM) ?? Number.POSITIVE_INFINITY, freeM);
      if (!Number.isFinite(availableWidth)) availableWidth = null;
    } else {
      const fitted = fitOnRoof(roof, centre, facing, across, rowDepthM);
      centre = fitted.centre;
      availableWidth = fitted.widthM;
    }
  }
  const model = buildArray(input, centre, availableWidth && availableWidth > 0 ? { widthM: availableWidth, fill: footprint !== null } : null);
  const halfW = (model.widthM - MODULE_GAP_M) / 2;
  const halfD = model.depthM / 2;
  const arrayPoint = (u: number, f: number): Vec2 => ({ e: model.centre.e + model.across.e * u + model.facing.e * f, n: model.centre.n + model.across.n * u + model.facing.n * f });

  const points: { kind: keyof typeof POINT_COLORS; text: string; at: Vec2 }[] = [
    ...(input.technicalRoom ? [{ kind: 'room' as const, text: 'Local technique', at: toMetres(input.technicalRoom) }] : []),
    ...(input.meter ? [{ kind: 'meter' as const, text: 'Compteur STEG', at: toMetres(input.meter) }] : []),
    ...(input.earthPit ? [{ kind: 'earth' as const, text: 'Piquet de terre', at: toMetres(input.earthPit) }] : []),
  ];
  const room = points.find((p) => p.kind === 'room')?.at ?? null;
  const meter = points.find((p) => p.kind === 'meter')?.at ?? null;
  const earth = points.find((p) => p.kind === 'earth')?.at ?? null;
  // The DC cables leave the array at the edge nearest the technical room.
  const dcExit = ((): Vec2 => {
    if (!room) return model.centre;
    const u = (room.e - model.centre.e) * model.across.e + (room.n - model.centre.n) * model.across.n;
    const f = (room.e - model.centre.e) * model.facing.e + (room.n - model.centre.n) * model.facing.n;
    return arrayPoint(Math.max(-halfW, Math.min(halfW, u)), Math.max(-halfD, Math.min(halfD, f)));
  })();
  const routes: { from: Vec2; to: Vec2; color: RGB; earth: boolean; text: string }[] = [
    ...(room ? [{ from: dcExit, to: room, color: DC_RED, earth: false, text: 'Câble DC' }] : []),
    ...(room && meter ? [{ from: room, to: meter, color: AC_BROWN, earth: false, text: 'Câble AC' }] : []),
    ...(room && earth ? [{ from: room, to: earth, color: PE_GREEN, earth: true, text: 'Conducteur de terre' }] : []),
  ];

  // The right column, top to bottom: the facts, the detail of the field (whatever height is left)
  // and the section.
  const sideW = Math.round(area.width * (1 - PLAN_SHARE)) - 12;
  const sideX = area.x + area.width - sideW;
  const roofArea = input.roofAreaM2 ?? null;
  const facts: { text: string; bold?: boolean }[] = [
    { text: 'Installation photovoltaïque', bold: true },
    { text: `${input.moduleCount} modules ${input.moduleLabel} — ${input.installedKWp.toFixed(2).replace('.', ',')} kWc` },
    { text: `Inclinaison ${Math.round(input.tiltDeg)}° — orientation ${facingText(input.azimuthDeg)}` },
    { text: `${rowsText(model, input.moduleCount)} — emprise ${metres(model.widthM - MODULE_GAP_M)} × ${metres(model.depthM)}` },
    ...(model.rows > 1 ? [{ text: `Écart entre rangées ${metres(model.pitchM - model.rowDepthM)} : aucune ombre portée le 21 décembre à midi` }] : []),
    ...(roofArea !== null ? [{ text: `Surface de la toiture : ${Math.round(roofArea)} m²` }] : []),
  ];
  const factLines = facts.flatMap((fact) => wrapPdfText(fact.bold ? fonts.bold : fonts.regular, fact.text, 8, sideW).map((text) => ({ text, bold: fact.bold === true })));
  const noteLines = wrapPdfText(fonts.regular, "Implantation indicative, à l'échelle de la photo ; les longueurs de câbles font foi sur le plan d'implantation (feuille 1/2).", 7, sideW).slice(0, 2);
  const factsHeight = factLines.length * 10.5 + noteLines.length * 9 + 4;

  const photo = decodeJpegBitmap(input.image.buffer);
  const planBox: Rect = { x: area.x, y: area.y, width: sideX - 12 - area.x, height: area.height };
  const sectionBox: Rect = { x: sideX, y: area.y, width: sideW, height: 168 };
  const detailTop = area.y + area.height - factsHeight - 6;
  const detailBox: Rect = { x: sideX, y: sectionBox.y + sectionBox.height + 8, width: sideW, height: detailTop - (sectionBox.y + sectionBox.height + 8) };

  // ---- the detail of the field: the array to a larger scale, with its dimensions -----------------
  const arrayExtent = [...model.modules.flatMap((m) => m.corners.map(([e, n]) => ({ e, n }))), ...model.shadows.flatMap((s) => s.map(([e, n]) => ({ e, n })))];
  const firstPass = boundsAround(arrayExtent, 1.5);
  const roughScale = Math.min(detailBox.width / (firstPass.eMax - firstPass.eMin), detailBox.height / (firstPass.nMax - firstPass.nMin));
  // Room around the array for the dimensions and the section marks, about 34 pt at the detail's scale.
  const detailWanted = boundsAround(arrayExtent, Math.max(1.5, 34 / roughScale));
  page.drawRectangle({ x: detailBox.x, y: detailBox.y, width: detailBox.width, height: detailBox.height, color: rgb(0.96, 0.96, 0.96) });
  const detail = await drawGround(doc, page, photo, input, detailBox, detailWanted);
  drawArray(page, detail, model, roof);
  const atArray = (u: number, f: number): PagePoint => detail.at(arrayPoint(u, f));
  const facingPage = unit({ x: atArray(0, 1).x - atArray(0, 0).x, y: atArray(0, 1).y - atArray(0, 0).y });
  const acrossPage = unit({ x: atArray(1, 0).x - atArray(0, 0).x, y: atArray(1, 0).y - atArray(0, 0).y });

  // The section line A-A along the facing direction through the array's middle, looked at from the side.
  const cutFront = atArray(0, halfD + 30 / detail.scale);
  const cutBack = atArray(0, -halfD - 12 / detail.scale);
  haloLine(page, cutFront, cutBack, 0.7, BLACK, [7, 2, 1.5, 2]);
  const viewDir = { x: -acrossPage.x, y: -acrossPage.y };
  for (const end of [cutFront, cutBack]) {
    const tip = { x: end.x + viewDir.x * 9, y: end.y + viewDir.y * 9 };
    haloLine(page, end, tip, 0.9, BLACK);
    drawArrowHead(page, tip, viewDir, 5, BLACK);
    const letter = { x: tip.x + viewDir.x * 5 - 2.7, y: tip.y + viewDir.y * 5 - 3 };
    page.drawRectangle({ x: letter.x - 1, y: letter.y - 1, width: 7.4, height: 9, color: WHITE, opacity: 0.85 });
    label(page, fonts.bold, 'A', letter, 8.5);
  }
  // Its width along the front row, its depth along its side and, between rows, their gap.
  drawDimension(page, fonts.regular, atArray(-halfW, halfD), atArray(halfW, halfD), { x: facingPage.x * 12, y: facingPage.y * 12 }, metres(model.widthM - MODULE_GAP_M), true);
  drawDimension(page, fonts.regular, atArray(halfW, halfD), atArray(halfW, -halfD), { x: acrossPage.x * 12, y: acrossPage.y * 12 }, metres(model.depthM), true);
  if (model.rows > 1) {
    const gapFront = halfD - model.rowDepthM;
    drawDimension(page, fonts.regular, atArray(-halfW, gapFront), atArray(-halfW, gapFront - (model.pitchM - model.rowDepthM)), { x: -acrossPage.x * 10, y: -acrossPage.y * 10 }, metres(model.pitchM - model.rowDepthM), true);
  }
  drawNorthArrow(page, detail.rect, fonts.bold);
  drawCaption(page, detail.rect, fonts.bold, 'DÉTAIL DU CHAMP PV');

  // ---- the site: the photo with the array, the cable routes and the installer's points -----------
  const siteWanted = boundsAround([dcExit, ...points.map((p) => p.at), ...arrayExtent, ...(roof ?? [])], GROUND_MARGIN_M);
  const site = await drawGround(doc, page, photo, input, planBox, siteWanted);
  drawArray(page, site, model, roof);
  for (const route of routes) {
    haloLine(page, site.at(route.from), site.at(route.to), 1.4, route.color);
    if (route.earth) page.drawLine({ start: site.at(route.from), end: site.at(route.to), thickness: 1.4, color: PE_YELLOW, dashArray: [3, 3] });
  }
  // Where the detail is taken from.
  const detailOnSite = { min: site.at({ e: detail.ground.eMin, n: detail.ground.nMin }), max: site.at({ e: detail.ground.eMax, n: detail.ground.nMax }) };
  const frame = {
    x: Math.max(site.rect.x, detailOnSite.min.x),
    y: Math.max(site.rect.y, detailOnSite.min.y),
    width: Math.min(site.rect.x + site.rect.width, detailOnSite.max.x) - Math.max(site.rect.x, detailOnSite.min.x),
    height: Math.min(site.rect.y + site.rect.height, detailOnSite.max.y) - Math.max(site.rect.y, detailOnSite.min.y),
  };
  page.drawRectangle({ ...frame, borderColor: WHITE, borderWidth: 2.2, borderOpacity: 0.8 });
  page.drawRectangle({ ...frame, borderColor: BLACK, borderWidth: 0.8, borderDashArray: [4, 2] });
  const detailTag = 'Détail';
  page.drawRectangle({ x: frame.x, y: frame.y + frame.height, width: fonts.bold.widthOfTextAtSize(detailTag, 7) + 6, height: 10, color: WHITE, opacity: 0.9 });
  label(page, fonts.bold, detailTag, { x: frame.x + 3, y: frame.y + frame.height + 2.5 });

  // The installer's points; labels avoid each other and every point, and stay on the photo.
  const pointPins = points.map((p) => ({ ...p, page: site.at(p.at) }));
  const placedLabels: Rect[] = pointPins.map((p) => ({ x: p.page.x - 5, y: p.page.y - 5, width: 10, height: 10 }));
  for (const pin of pointPins) {
    const spotAt = pin.page;
    page.drawCircle({ x: spotAt.x, y: spotAt.y, size: 4.2, color: POINT_COLORS[pin.kind], borderColor: WHITE, borderWidth: 1.2 });
    const width = fonts.bold.widthOfTextAtSize(pin.text, 7) + 6;
    const candidates = [
      { x: spotAt.x + 6, y: spotAt.y - 5 },
      { x: spotAt.x - 6 - width, y: spotAt.y - 5 },
      { x: spotAt.x - width / 2, y: spotAt.y - 18 },
      { x: spotAt.x - width / 2, y: spotAt.y + 7 },
    ];
    const overlaps = (r: Rect): boolean => placedLabels.some((o) => r.x < o.x + o.width && o.x < r.x + r.width && r.y < o.y + o.height && o.y < r.y + r.height);
    const inside = (r: Rect): boolean => r.x >= site.rect.x && r.x + r.width <= site.rect.x + site.rect.width && r.y >= site.rect.y && r.y + r.height <= site.rect.y + site.rect.height;
    const boxes = candidates.map((c) => ({ ...c, width, height: 10 }));
    const spot = boxes.find((r) => inside(r) && !overlaps(r)) ?? boxes.find((r) => !overlaps(r)) ?? boxes[0]!;
    placedLabels.push(spot);
    page.drawRectangle({ x: spot.x, y: spot.y, width, height: 10, color: WHITE, opacity: 0.9, borderColor: POINT_COLORS[pin.kind], borderWidth: 0.6 });
    label(page, fonts.bold, pin.text, { x: spot.x + 3, y: spot.y + 2.5 });
  }
  drawNorthArrow(page, site.rect, fonts.bold);
  drawScaleBar(page, site.rect, site.scale, fonts.regular);
  drawCaption(page, site.rect, fonts.bold, 'VUE DE DESSUS DU SITE');
  if (input.imageCredit) {
    const width = fonts.regular.widthOfTextAtSize(input.imageCredit, 7);
    const creditX = site.rect.x + site.rect.width - width - 8;
    page.drawRectangle({ x: creditX - 3, y: site.rect.y + 2, width: width + 6, height: 10, color: WHITE, opacity: 0.8 });
    label(page, fonts.regular, input.imageCredit, { x: creditX, y: site.rect.y + 4.5 }, 7, GREY);
  }

  // ---- the section and the facts ------------------------------------------------------------------
  drawSection(page, fonts, sectionBox, model, input);

  let y = area.y + area.height - 8;
  for (const line of factLines) {
    label(page, line.bold ? fonts.bold : fonts.regular, line.text, { x: sideX, y }, 8);
    y -= 10.5;
  }
  for (const line of noteLines) {
    label(page, fonts.regular, line, { x: sideX, y: y + 1 }, 7, GREY);
    y -= 9;
  }

  // ---- the legend, beside the title block ---------------------------------------------------------
  type Swatch = { kind: 'box'; fill: RGB; opacity: number; border: RGB | null } | { kind: 'line'; color: RGB; earth: boolean } | { kind: 'point'; color: RGB } | { kind: 'cut' };
  const entries: { swatch: Swatch; text: string }[] = [
    { swatch: { kind: 'box', fill: MODULE_COLOR, opacity: 1, border: MODULE_FRAME }, text: 'Module PV (vue de dessus)' },
    { swatch: { kind: 'box', fill: BLACK, opacity: SHADOW_OPACITY, border: null }, text: 'Ombre portée le 21 décembre à midi' },
    ...(roof ? [{ swatch: { kind: 'box' as const, fill: ROOF_CYAN, opacity: 0.1, border: ROOF_CYAN }, text: 'Contour de la toiture' }] : []),
    ...routes.map((route) => ({ swatch: { kind: 'line' as const, color: route.color, earth: route.earth }, text: route.text })),
    ...points.map((p) => ({ swatch: { kind: 'point' as const, color: POINT_COLORS[p.kind] }, text: p.text })),
    { swatch: { kind: 'cut' }, text: 'Plan de coupe A-A' },
  ];
  const legend = area.legend;
  label(page, fonts.bold, 'Légende', { x: legend.x, y: legend.y + legend.height - 9 }, 8);
  const perColumn = Math.max(1, Math.floor((legend.height - 14) / 11));
  const columnWidth = legend.width / Math.ceil(entries.length / perColumn);
  entries.forEach(({ swatch, text }, i) => {
    const x = legend.x + Math.floor(i / perColumn) * columnWidth;
    const rowY = legend.y + legend.height - 22 - (i % perColumn) * 11;
    const lineEnds = { start: { x, y: rowY + 3 }, end: { x: x + 14, y: rowY + 3 } };
    if (swatch.kind === 'box') {
      page.drawRectangle({ x: x + 2, y: rowY - 1, width: 10, height: 7, color: swatch.fill, opacity: swatch.opacity, ...(swatch.border ? { borderColor: swatch.border, borderWidth: 0.8 } : {}) });
    } else if (swatch.kind === 'line') {
      page.drawLine({ ...lineEnds, thickness: 1.6, color: swatch.color });
      if (swatch.earth) page.drawLine({ ...lineEnds, thickness: 1.6, color: PE_YELLOW, dashArray: [3, 3] });
    } else if (swatch.kind === 'point') {
      page.drawCircle({ x: x + 7, y: rowY + 2.5, size: 3.6, color: swatch.color, borderColor: WHITE, borderWidth: 0.8 });
    } else {
      page.drawLine({ ...lineEnds, thickness: 0.7, color: BLACK, dashArray: [5, 1.5, 1, 1.5] });
    }
    label(page, fonts.regular, text, { x: x + 18, y: rowY }, 7);
  });

  return Buffer.from(await doc.save());
}
