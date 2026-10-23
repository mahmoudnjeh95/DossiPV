import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { computeRowSpacingM } from '@dossipv/engine';
import { A4_LANDSCAPE, BLACK, drawSheet, label, type DrawingCartouche, type Fonts, type Rect } from './drawing-kit';
import { embedLogo } from './render-cover-page';
import { decodeJpegBitmap, encodeJpegBitmap, type Bitmap } from './image-enhance';
import { wrapPdfText } from './pdf-text';
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
  /** Where Claude chose to centre the array on the drawn roof (view pixels); used without an AI footprint. */
  placement?: PixelPoint | null;
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

const GROUND_COLOR_OUTSIDE = 255;
const PIN_COLORS = { field: rgb(0.96, 0.72, 0), room: rgb(0.12, 0.44, 0.85), meter: rgb(0.85, 0.19, 0.15), earth: rgb(0.12, 0.56, 0.24) };
// The map editor's roof contour colour (ROOF_OUTLINE_STYLE in point-markers.ts).
const ROOF_CYAN = rgb(0, 184 / 255, 217 / 255);
const MODULE_COLOR = rgb(0.1, 0.2, 0.45);
const MODULE_EDGE = rgb(0.85, 0.88, 0.95);
const CAMERA_ELEVATION_DEG = 42;
const CAMERA_YAW_DEG = 28;
const MODULE_GAP_M = 0.02;
const LOW_EDGE_HEIGHT_M = 0.35;
const RASTER_PX_PER_PT = 2;
const MAX_ARRAY_MODULES_PER_ROW = 40;
/**
 * Ground kept around the array and the points: enough for the roof edges and the street to show,
 * and not so little that the photo (≈ 0,3 m of real detail) is enlarged into blur.
 */
const GROUND_MARGIN_M = 14;

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

function polygonAreaM2(polygon: Vec2[]): number {
  let twice = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    twice += a.e * b.n - b.e * a.n;
  }
  return Math.abs(twice) / 2;
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
  halfExtentM: number;
  widthM: number;
  depthM: number;
  rows: number;
  perRow: number;
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
  const fitPerRow = room ? Math.floor(room.widthM / (width + MODULE_GAP_M)) : idealPerRow;
  const wantedPerRow = room && !room.fill ? Math.min(idealPerRow, fitPerRow) : fitPerRow;
  const perRow = Math.max(1, Math.min(MAX_ARRAY_MODULES_PER_ROW, moduleCount, fitPerRow > 0 ? wantedPerRow : idealPerRow));
  const rows = Math.ceil(moduleCount / perRow);
  const arrayWidth = perRow * (width + MODULE_GAP_M);
  const arrayDepth = (rows - 1) * pitch + depth;
  const sunElevationRad = rad(Math.max(10, 90 - Math.abs(input.latitudeDeg + 23.45)));

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
    const shadowLength = (LOW_EDGE_HEIGHT_M + heightGain) / Math.tan(sunElevationRad);
    const left = rowStartU;
    const right = rowStartU + inRow * (width + MODULE_GAP_M) - MODULE_GAP_M;
    const toGround = (u: number, f: number): [number, number] => [centre.e + across.e * u + facing.e * f, centre.n + across.n * u + facing.n * f];
    shadows.push([toGround(left, frontF), toGround(right, frontF), toGround(right, backF - shadowLength), toGround(left, backF - shadowLength)]);
  }
  return { modules, shadows, halfExtentM: Math.hypot(arrayWidth, arrayDepth) / 2, widthM: arrayWidth, depthM: arrayDepth, rows, perRow };
}

/** `2 rangées de 6 modules`, or `2 rangées (6 + 3 modules)` when the last row is shorter. */
function rowsText(model: ArrayModel, moduleCount: number): string {
  const modules = (n: number): string => `${n} module${n > 1 ? 's' : ''}`;
  if (model.rows === 1) return `1 rangée de ${modules(moduleCount)}`;
  const last = moduleCount - (model.rows - 1) * model.perRow;
  if (last === model.perRow) return `${model.rows} rangées de ${modules(model.perRow)}`;
  return `${model.rows} rangées (${Array.from({ length: model.rows - 1 }, () => model.perRow).join(' + ')} + ${modules(last)})`;
}

/** Bilinear sample of a bitmap; white outside. */
function sample(bitmap: Bitmap, x: number, y: number): [number, number, number] {
  if (x < 0 || y < 0 || x > bitmap.width - 1 || y > bitmap.height - 1) return [GROUND_COLOR_OUTSIDE, GROUND_COLOR_OUTSIDE, GROUND_COLOR_OUTSIDE];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(bitmap.width - 1, x0 + 1);
  const y1 = Math.min(bitmap.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px: number, py: number, c: number): number => bitmap.data[(py * bitmap.width + px) * 4 + c]!;
  const channel = (c: number): number =>
    (at(x0, y0, c) * (1 - fx) + at(x1, y0, c) * fx) * (1 - fy) + (at(x0, y1, c) * (1 - fx) + at(x1, y1, c) * fx) * fy;
  return [channel(0), channel(1), channel(2)];
}

export async function renderRoof3dView(input: Roof3dInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const page = doc.addPage(A4_LANDSCAPE);
  const logo = await embedLogo(doc, input.cartouche.logo);
  const area = drawSheet(page, fonts, {
    ...input.cartouche,
    logo,
    drawingTitle: "Vue 3D de l'implantation sur toiture",
    planNumber: 5,
    pageLabel: 'Feuille 2/2',
  });

  // ---- scene geometry (metres, east/north, centred on the field) -------------------------------
  const photo = decodeJpegBitmap(input.image.buffer);
  const bitmapScale = photo.width / input.image.widthPx;
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
    const chosen = input.placement ? toMetres(input.placement) : null;
    // Claude's choice when it is on the roof; else the middle of the roof through the field point.
    const fitted = chosen && isInsidePolygon(chosen, roof) ? { centre: chosen, widthM: roomAcross(roof, chosen, facing, across, rowDepthM) } : fitOnRoof(roof, centre, facing, across, rowDepthM);
    centre = fitted.centre;
    availableWidth = fitted.widthM;
  }
  const model = buildArray(input, centre, availableWidth && availableWidth > 0 ? { widthM: availableWidth, fill: footprint !== null } : null);

  const pins: { kind: keyof typeof PIN_COLORS; text: string; at: Vec2 }[] = [
    { kind: 'field', text: 'Champ PV', at: centre },
    ...(input.technicalRoom ? [{ kind: 'room' as const, text: 'Local technique', at: toMetres(input.technicalRoom) }] : []),
    ...(input.meter ? [{ kind: 'meter' as const, text: 'Compteur STEG', at: toMetres(input.meter) }] : []),
    ...(input.earthPit ? [{ kind: 'earth' as const, text: 'Piquet de terre', at: toMetres(input.earthPit) }] : []),
  ];

  // The ground shown: the array and the placed points with a margin, never beyond the photo.
  const photoRect = {
    eMin: (0 - input.field.x) * mpp,
    eMax: (input.image.widthPx - input.field.x) * mpp,
    nMin: -(input.image.heightPx - input.field.y) * mpp,
    nMax: -(0 - input.field.y) * mpp,
  };
  const subjects = [...pins.map((p) => p.at), ...model.modules.flatMap((m) => m.corners.map(([e, n]) => ({ e, n }))), ...(roof ?? [])];
  const margin = Math.max(GROUND_MARGIN_M, model.halfExtentM);
  const ground = {
    eMin: Math.max(photoRect.eMin, Math.min(...subjects.map((p) => p.e)) - margin),
    eMax: Math.min(photoRect.eMax, Math.max(...subjects.map((p) => p.e)) + margin),
    nMin: Math.max(photoRect.nMin, Math.min(...subjects.map((p) => p.n)) - margin),
    nMax: Math.min(photoRect.nMax, Math.max(...subjects.map((p) => p.n)) + margin),
  };

  // ---- camera ------------------------------------------------------------------------------------
  const look: Vec2 = { e: -facing.e * Math.cos(rad(CAMERA_YAW_DEG)) + facing.n * Math.sin(rad(CAMERA_YAW_DEG)), n: -facing.n * Math.cos(rad(CAMERA_YAW_DEG)) - facing.e * Math.sin(rad(CAMERA_YAW_DEG)) };
  const right: Vec2 = { e: look.n, n: -look.e };
  const sinE = Math.sin(rad(CAMERA_ELEVATION_DEG));
  const cosE = Math.cos(rad(CAMERA_ELEVATION_DEG));
  const project = (e: number, n: number, z: number): { sx: number; sy: number; depth: number } => {
    const depth = e * look.e + n * look.n;
    return { sx: e * right.e + n * right.n, sy: depth * sinE + z * cosE, depth };
  };
  const toGround = (sx: number, sy: number): Vec2 => {
    const depth = sy / sinE;
    return { e: sx * right.e + depth * look.e, n: sx * right.n + depth * look.n };
  };

  const quadCorners = [
    { e: ground.eMin, n: ground.nMin },
    { e: ground.eMax, n: ground.nMin },
    { e: ground.eMax, n: ground.nMax },
    { e: ground.eMin, n: ground.nMax },
  ];
  const screenPoints = [
    ...quadCorners.map((c) => project(c.e, c.n, 0)),
    ...model.modules.flatMap((m) => m.corners.map(([e, n, z]) => project(e, n, z))),
  ];
  const minSx = Math.min(...screenPoints.map((p) => p.sx));
  const maxSx = Math.max(...screenPoints.map((p) => p.sx));
  const minSy = Math.min(...screenPoints.map((p) => p.sy));
  const maxSy = Math.max(...screenPoints.map((p) => p.sy));

  const box: Rect = { x: area.x + 4, y: area.y + 4, width: area.width * 0.72, height: area.height - 8 };
  const scale = Math.min(box.width / (maxSx - minSx), box.height / (maxSy - minSy));
  const drawnW = (maxSx - minSx) * scale;
  const drawnH = (maxSy - minSy) * scale;
  const originX = box.x + (box.width - drawnW) / 2;
  const originY = box.y + (box.height - drawnH) / 2;
  const toPage = (sx: number, sy: number): { x: number; y: number } => ({ x: originX + (sx - minSx) * scale, y: originY + (sy - minSy) * scale });
  const pagePoint = (e: number, n: number, z: number): { x: number; y: number } => {
    const p = project(e, n, z);
    return toPage(p.sx, p.sy);
  };

  // ---- the ground photo, warped to the oblique view ---------------------------------------------
  const rasterW = Math.round(drawnW * RASTER_PX_PER_PT);
  const rasterH = Math.round(drawnH * RASTER_PX_PER_PT);
  const raster = new Uint8Array(rasterW * rasterH * 4).fill(255);
  for (let py = 0; py < rasterH; py += 1) {
    const sy = minSy + (1 - py / rasterH) * (maxSy - minSy);
    for (let px = 0; px < rasterW; px += 1) {
      const sx = minSx + (px / rasterW) * (maxSx - minSx);
      const g = toGround(sx, sy);
      if (g.e < ground.eMin || g.e > ground.eMax || g.n < ground.nMin || g.n > ground.nMax) continue;
      const imgX = (input.field.x + g.e / mpp) * bitmapScale;
      const imgY = (input.field.y - g.n / mpp) * bitmapScale;
      const [r, gg, b] = sample(photo, imgX, imgY);
      const out = (py * rasterW + px) * 4;
      raster[out] = r;
      raster[out + 1] = gg;
      raster[out + 2] = b;
    }
  }
  const groundImage = await doc.embedJpg(encodeJpegBitmap({ width: rasterW, height: rasterH, data: raster }, 90));
  page.drawImage(groundImage, { x: originX, y: originY, width: drawnW, height: drawnH });
  const outline = quadCorners.map((c) => pagePoint(c.e, c.n, 0));
  for (let i = 0; i < 4; i += 1) page.drawLine({ start: outline[i]!, end: outline[(i + 1) % 4]!, thickness: 0.8, color: rgb(0.3, 0.3, 0.3) });

  // ---- shadows, cable legs, then the modules from the farthest to the nearest -------------------
  const svg = (points: { x: number; y: number }[]): string => `M ${points.map((p) => `${p.x.toFixed(2)} ${(A4_LANDSCAPE[1] - p.y).toFixed(2)}`).join(' L ')} Z`;
  const fillPolygon = (points: { x: number; y: number }[], color: ReturnType<typeof rgb>, opacity: number, border?: ReturnType<typeof rgb>, borderWidth = 0.4): void => {
    page.drawSvgPath(svg(points), { x: 0, y: A4_LANDSCAPE[1], color, opacity, ...(border ? { borderColor: border, borderWidth } : {}) });
  };
  if (roof) {
    // On the photo's own roof edges: the orthophoto is flat, so the contour lies at ground level.
    const roofOnPage = roof.map((p) => pagePoint(p.e, p.n, 0));
    page.drawSvgPath(svg(roofOnPage), { x: 0, y: A4_LANDSCAPE[1], borderColor: rgb(1, 1, 1), borderWidth: 3.5, borderOpacity: 0.85 });
    page.drawSvgPath(svg(roofOnPage), { x: 0, y: A4_LANDSCAPE[1], color: ROOF_CYAN, opacity: 0.1, borderColor: ROOF_CYAN, borderWidth: 1.6 });
  }
  for (const shadow of model.shadows) fillPolygon(shadow.map(([e, n]) => pagePoint(e, n, 0)), rgb(0, 0, 0), 0.32);

  const legs: [Vec2, Vec2][] = [];
  if (input.technicalRoom) legs.push([centre, toMetres(input.technicalRoom)]);
  if (input.technicalRoom && input.meter) legs.push([toMetres(input.technicalRoom), toMetres(input.meter)]);
  if (input.technicalRoom && input.earthPit) legs.push([toMetres(input.technicalRoom), toMetres(input.earthPit)]);
  for (const [from, to] of legs) page.drawLine({ start: pagePoint(from.e, from.n, 0), end: pagePoint(to.e, to.n, 0), thickness: 1.4, color: rgb(1, 0.55, 0), dashArray: [4, 3] });

  const ordered = [...model.modules].sort((a, b) => {
    const depthOf = (m: ModuleQuad): number => m.corners.reduce((s, [e, n]) => s + project(e, n, 0).depth, 0) / 4;
    return depthOf(b) - depthOf(a);
  });
  for (const module of ordered) {
    const corners = module.corners.map(([e, n, z]) => pagePoint(e, n, z));
    fillPolygon(corners, MODULE_COLOR, 0.96, MODULE_EDGE, 0.5);
    // Cell lines: two across and one along, a hint of the module's cells.
    const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    for (const t of [1 / 3, 2 / 3]) page.drawLine({ start: lerp(corners[0]!, corners[3]!, t), end: lerp(corners[1]!, corners[2]!, t), thickness: 0.25, color: rgb(0.55, 0.62, 0.8) });
    page.drawLine({ start: lerp(corners[0]!, corners[1]!, 0.5), end: lerp(corners[3]!, corners[2]!, 0.5), thickness: 0.25, color: rgb(0.55, 0.62, 0.8) });
  }

  // ---- pins -------------------------------------------------------------------------------------
  // The modules themselves mark the field: only the other points get a pin.
  const pointPins = pins.filter((p) => p.kind !== 'field').map((pin) => ({ ...pin, page: pagePoint(pin.at.e, pin.at.n, 0) }));
  // Labels avoid each other and every pin.
  const placedLabels: Rect[] = pointPins.map((p) => ({ x: p.page.x - 5, y: p.page.y - 5, width: 10, height: 10 }));
  for (const pin of pointPins) {
    const at = pin.page;
    page.drawCircle({ x: at.x, y: at.y, size: 4.2, color: PIN_COLORS[pin.kind], borderColor: rgb(1, 1, 1), borderWidth: 1 });
    // The label goes right of the pin, else left, below or above: never over another label.
    const width = fonts.bold.widthOfTextAtSize(pin.text, 7) + 6;
    const candidates = [
      { x: at.x + 6, y: at.y - 3.5 },
      { x: at.x - 6 - width, y: at.y - 3.5 },
      { x: at.x - width / 2, y: at.y - 17 },
      { x: at.x - width / 2, y: at.y + 7 },
    ];
    const overlaps = (r: Rect): boolean => placedLabels.some((o) => r.x < o.x + o.width && o.x < r.x + r.width && r.y < o.y + o.height && o.y < r.y + r.height);
    const spot = candidates.map((c) => ({ ...c, width, height: 10 })).find((r) => !overlaps(r)) ?? { ...candidates[0]!, width, height: 10 };
    placedLabels.push(spot);
    page.drawRectangle({ x: spot.x, y: spot.y, width, height: 10, color: rgb(1, 1, 1), opacity: 0.85 });
    label(page, fonts.bold, pin.text, { x: spot.x + 3, y: spot.y + 2.5 });
  }

  // ---- north arrow ------------------------------------------------------------------------------
  // North (0, 1) on the screen.
  const northDir = { x: right.n, y: look.n * sinE };
  const nLen = Math.hypot(northDir.x, northDir.y) || 1;
  const arrowBase = { x: box.x + box.width - 30, y: box.y + box.height - 30 };
  const arrowTip = { x: arrowBase.x + (northDir.x / nLen) * 22, y: arrowBase.y + (northDir.y / nLen) * 22 };
  page.drawLine({ start: arrowBase, end: arrowTip, thickness: 1.6, color: BLACK });
  page.drawCircle({ x: arrowTip.x, y: arrowTip.y, size: 2.4, color: BLACK });
  label(page, fonts.bold, 'N', { x: arrowTip.x + (northDir.x / nLen) * 5 - 2.5, y: arrowTip.y + (northDir.y / nLen) * 5 - 3 }, 9);

  // ---- information panel ------------------------------------------------------------------------
  const infoX = box.x + box.width + 14;
  const infoW = area.x + area.width - infoX;
  const facingText = Math.abs(input.azimuthDeg) < 1 ? 'plein sud' : `${input.azimuthDeg > 0 ? 'ouest' : 'est'} (${Math.abs(Math.round(input.azimuthDeg))}° du sud)`;
  const lines: { text: string; bold?: boolean }[] = [
    { text: 'Installation photovoltaïque', bold: true },
    { text: `${input.moduleCount} modules — ${input.installedKWp.toFixed(2).replace('.', ',')} kWc` },
    { text: input.moduleLabel },
    { text: `Inclinaison : ${Math.round(input.tiltDeg)}°` },
    { text: `Orientation : ${facingText}` },
    { text: rowsText(model, input.moduleCount) },
    { text: `Emprise : ${model.widthM.toFixed(1).replace('.', ',')} × ${model.depthM.toFixed(1).replace('.', ',')} m` },
    ...(roof ? [{ text: `Surface de la toiture : ${Math.round(polygonAreaM2(roof))} m²` }] : []),
    { text: "Écart entre rangées : sans ombrage au solstice d'hiver" },
    { text: '' },
    { text: 'Vue en perspective, indicative : les cotes font foi sur le plan d’implantation (annexe N°5).' },
  ];
  let y = box.y + box.height - 14;
  for (const line of lines) {
    const font = line.bold ? fonts.bold : fonts.regular;
    for (const wrapped of line.text === '' ? [''] : wrapPdfText(font, line.text, 8, infoW)) {
      label(page, font, wrapped, { x: infoX, y }, 8);
      y -= 11;
    }
  }
  y -= 6;
  label(page, fonts.bold, 'Légende', { x: infoX, y }, 8);
  y -= 13;
  for (const pin of pins) {
    if (pin.kind === 'field') page.drawRectangle({ x: infoX, y: y - 0.5, width: 8, height: 6, color: MODULE_COLOR, borderColor: MODULE_EDGE, borderWidth: 0.4 });
    else page.drawCircle({ x: infoX + 4, y: y + 2.5, size: 3.6, color: PIN_COLORS[pin.kind] });
    label(page, fonts.regular, pin.kind === 'field' ? 'Champ PV (modules)' : pin.text, { x: infoX + 12, y }, 8);
    y -= 12;
  }
  if (roof) {
    page.drawRectangle({ x: infoX, y: y - 0.5, width: 8, height: 6, color: ROOF_CYAN, opacity: 0.1, borderColor: ROOF_CYAN, borderWidth: 1.2 });
    label(page, fonts.regular, 'Contour de la toiture', { x: infoX + 12, y }, 8);
    y -= 12;
  }
  page.drawLine({ start: { x: infoX, y: y + 3 }, end: { x: infoX + 8, y: y + 3 }, thickness: 1.4, color: rgb(1, 0.55, 0), dashArray: [3, 2] });
  label(page, fonts.regular, 'Liaisons de câbles', { x: infoX + 12, y }, 8);

  return Buffer.from(await doc.save());
}
