import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { IMAGERY_ATTRIBUTION, type ImageryProvider, type LatLon, type PixelPoint } from './fetch-satellite-image';
import type { Page37Layout } from './generate-page-37-layout';
import { drawPdfText, fitPdfText, toPdfSafeText } from './pdf-text';
import { embedLogo, formatFrenchDate } from './render-cover-page';

/**
 * Pages 37-38 of the dossier: the implantation plan (the installer's four placed points, the DC,
 * AC and earth legs with their lengths, the legend with GPS and length formulas) and the
 * situation plan (site pin, north arrow, GPS in decimal and DMS). Both are drawn for every tier
 * on Esri imagery; when the imagery is missing, on a plain frame at the same scale.
 */

/** A stitched satellite image plus its pixel size (the coordinate space of every overlay). */
export interface SitePlanImage {
  /** Null when the tiles could not be fetched: the plan is drawn on a plain frame instead. */
  buffer: Buffer | null;
  widthPx: number;
  heightPx: number;
  /** Ground metres per image pixel, for the scale bar. */
  metersPerPixel: number;
  /** Which imagery the photo came from, for the credit under it; Esri when omitted. */
  provider?: ImageryProvider;
}

/** Installer-placed points in page-37 image pixels; `field` falls back to the site GPS. */
export interface SitePlanPoints {
  field: PixelPoint | null;
  technicalRoom: PixelPoint | null;
  meter: PixelPoint | null;
  earthPit: PixelPoint | null;
}

export interface SitePlanLink {
  lengthM: number;
  sectionMm2: number;
  /** How the length was computed from the points; null when the installer typed it. */
  formula: string | null;
}

export interface SitePlanData {
  page37: {
    image: SitePlanImage;
    /** The Premium AI layout (panel rows and route); null otherwise. */
    layout: Page37Layout | null;
    points: SitePlanPoints;
    gps: Record<keyof SitePlanPoints, LatLon | null>;
    dc: SitePlanLink;
    ac: SitePlanLink;
  };
  page38: {
    image: SitePlanImage;
    /** The site's GPS point, in page-38 image pixels. */
    sitePin: PixelPoint;
  };
}

export interface SitePlanPagesInput {
  clientFullName: string;
  clientAddress: string;
  gps: LatLon;
  installerName: string;
  /** The installer's ANME accreditation code, printed in both title blocks. */
  installerAnmeCode: string;
  installerContact: { address: string; phone: string; email: string };
  companyLogoBuffer: Buffer | null;
  /** ISO date, printed dd/MM/yyyy in the title block. */
  dossierDate: string;
  dossierNumber: string | null;
  /** Null when the project has no located site: both pages are empty frames. */
  planData: SitePlanData | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.4, 0.4, 0.4);
const FALLBACK_GREY = rgb(0.95, 0.95, 0.95);
const PANEL_BLUE = rgb(0.1, 0.3, 0.85);
const ROUTE_ORANGE = rgb(0.95, 0.5, 0.05);
const PIN_RED = rgb(0.85, 0.1, 0.1);

// The image is fitted (aspect kept) inside this box; the legend and title block sit below it.
const IMAGE_BOX = { x: MARGIN, y: 282, width: PAGE_WIDTH - 2 * MARGIN, height: 495 };
const INFO_TOP = 262;
const INFO_BOTTOM = MARGIN;
const LEFT_BLOCK = { x: MARGIN, width: 285 };
const RIGHT_BLOCK = { x: MARGIN + 295, width: PAGE_WIDTH - 2 * MARGIN - 295 };
const NO_IMAGERY_TITLE = "Fond satellite indisponible — positions à l'échelle";
const IMPLANTATION_TITLE = "Schéma d'implantation et de connexion";
const SITUATION_TITLE = 'Plan de Situation';

const hexColour = (hex: string): RGB => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

type PointKey = keyof SitePlanPoints;
const POINT_KEYS: PointKey[] = ['field', 'technicalRoom', 'meter', 'earthPit'];

// The map editor's colours and labels (apps/web/components/map/point-markers.ts).
const POINT_STYLES: Record<PointKey, { label: string; color: RGB }> = {
  field: { label: 'Champ PV', color: hexColour('#F5B800') },
  technicalRoom: { label: 'Local technique (onduleur)', color: hexColour('#1E6FD9') },
  meter: { label: 'Compteur STEG', color: hexColour('#D93025') },
  earthPit: { label: 'Piquet de terre', color: hexColour('#1E8E3E') },
};
const MARKER_RADIUS = 6;

// Conductor colours (skill): DC in red, AC phase in brown, PE green-yellow.
const DC_RED = rgb(0.8, 0, 0);
const AC_BROWN = rgb(0.55, 0.27, 0.07);
const PE_GREEN = rgb(0.1, 0.55, 0.2);
const PE_YELLOW = rgb(1, 0.85, 0);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Placement extends Rect {
  widthPx: number;
  heightPx: number;
}

const frenchNumber = (value: number, decimals: { min?: number; max: number }): string =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals.min ?? 0, maximumFractionDigits: decimals.max, useGrouping: false }).format(value);

/** `34,74211° N, 10,76000° E` — five decimals, French decimal comma. */
export function formatGpsDecimal(point: LatLon): string {
  const coord = (value: number, positive: string, negative: string): string => `${frenchNumber(Math.abs(value), { min: 5, max: 5 })}° ${value >= 0 ? positive : negative}`;
  return `${coord(point.lat, 'N', 'S')}, ${coord(point.lon, 'E', 'O')}`;
}

/** `34°44'31,6" N, 10°45'36,0" E` — rounded to the tenth of a second, carries included. */
export function formatGpsDms(point: LatLon): string {
  const coord = (value: number, positive: string, negative: string): string => {
    const tenths = Math.round(Math.abs(value) * 36000);
    const degrees = Math.floor(tenths / 36000);
    const minutes = Math.floor((tenths % 36000) / 600);
    const secondTenths = tenths % 600;
    const seconds = `${String(Math.floor(secondTenths / 10)).padStart(2, '0')},${secondTenths % 10}`;
    return `${degrees}°${String(minutes).padStart(2, '0')}'${seconds}" ${value >= 0 ? positive : negative}`;
  };
  return `${coord(point.lat, 'N', 'S')}, ${coord(point.lon, 'E', 'O')}`;
}

async function embedImageSafely(doc: PDFDocument, buffer: Buffer): Promise<PDFImage | null> {
  // pdf-lib reads `imageData.buffer` ignoring byteOffset, so a small pooled Node Buffer would be
  // parsed from the start of the shared 8 KB pool. Hand it a standalone copy.
  const bytes = Uint8Array.from(buffer);
  try {
    return await doc.embedJpg(bytes);
  } catch {
    try {
      return await doc.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

/** Image pixel → PDF point, inside the rectangle the image (or its fallback frame) occupies. */
function toPdf(placement: Placement, p: PixelPoint): { x: number; y: number } {
  return {
    x: placement.x + (p.x / placement.widthPx) * placement.width,
    y: placement.y + placement.height - (p.y / placement.heightPx) * placement.height,
  };
}

function isInsidePlacement(placement: Placement, p: PixelPoint): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= placement.widthPx && p.y <= placement.heightPx;
}

/** PDF points per ground metre on the drawn image. */
function pointsPerMetre(placement: Placement, image: SitePlanImage): number {
  return placement.width / placement.widthPx / image.metersPerPixel;
}

/**
 * Draws the photo fitted in IMAGE_BOX, or — when there is none or it cannot be embedded — a plain
 * frame of the same size and scale, so every overlay still lands where it belongs.
 */
async function drawBackground(doc: PDFDocument, page: PDFPage, image: SitePlanImage, fonts: Fonts): Promise<{ placement: Placement; titleRect: Rect | null }> {
  const widthPx = image.widthPx > 0 ? image.widthPx : 1;
  const heightPx = image.heightPx > 0 ? image.heightPx : 1;
  const scale = Math.min(IMAGE_BOX.width / widthPx, IMAGE_BOX.height / heightPx);
  const width = widthPx * scale;
  const height = heightPx * scale;
  const placement: Placement = {
    x: IMAGE_BOX.x + (IMAGE_BOX.width - width) / 2,
    y: IMAGE_BOX.y + (IMAGE_BOX.height - height) / 2,
    width,
    height,
    widthPx,
    heightPx,
  };

  const embedded = image.buffer ? await embedImageSafely(doc, image.buffer) : null;
  if (embedded) {
    page.drawImage(embedded, { x: placement.x, y: placement.y, width, height });
    page.drawRectangle({ x: placement.x, y: placement.y, width, height, borderColor: BLACK, borderWidth: 1 });
    drawPdfText(page, IMAGERY_ATTRIBUTION[image.provider ?? 'esri'], { x: placement.x, y: placement.y - 11, size: 6.5, font: fonts.regular, color: GREY });
    return { placement, titleRect: null };
  }

  page.drawRectangle({ x: placement.x, y: placement.y, width, height, color: FALLBACK_GREY, borderColor: BLACK, borderWidth: 1 });
  const size = 9;
  const textX = placement.x + 8;
  const textY = placement.y + height - 8 - size;
  drawPdfText(page, NO_IMAGERY_TITLE, { x: textX, y: textY, size, font: fonts.bold, color: GREY });
  const textWidth = fonts.bold.widthOfTextAtSize(toPdfSafeText(NO_IMAGERY_TITLE), size);
  return { placement, titleRect: { x: textX - 2, y: textY - 3, width: textWidth + 4, height: size + 5 } };
}

function svgPolygon(points: { x: number; y: number }[]): string {
  // drawSvgPath is called with origin (0, PAGE_HEIGHT): SVG y grows downwards from the page top.
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${PAGE_HEIGHT - p.y}`).join(' ')} Z`;
}

function drawPolygon(page: PDFPage, points: { x: number; y: number }[], options: { color?: RGB; opacity?: number; borderColor?: RGB; borderWidth?: number }): void {
  page.drawSvgPath(svgPolygon(points), { x: 0, y: PAGE_HEIGHT, ...options });
}

/**
 * Free-space bookkeeping for the labels drawn on a plan: each label takes the first candidate
 * position that stays inside the image and touches neither a marker, an arrow nor another label.
 */
class LabelSpace {
  private readonly taken: Rect[] = [];

  constructor(private readonly bounds: Rect) {}

  reserve(rect: Rect): void {
    this.taken.push(rect);
  }

  private inside(rect: Rect): boolean {
    const b = this.bounds;
    return rect.x >= b.x + 2 && rect.y >= b.y + 2 && rect.x + rect.width <= b.x + b.width - 2 && rect.y + rect.height <= b.y + b.height - 2;
  }

  private free(rect: Rect): boolean {
    return this.inside(rect) && this.taken.every((t) => rect.x + rect.width <= t.x || t.x + t.width <= rect.x || rect.y + rect.height <= t.y || t.y + t.height <= rect.y);
  }

  /** The first free candidate (else the first one inside the image, else the first one clamped). */
  place(candidates: Rect[]): Rect {
    const chosen = candidates.find((c) => this.free(c)) ?? candidates.find((c) => this.inside(c)) ?? this.clamp(candidates[0]!);
    this.taken.push(chosen);
    return chosen;
  }

  private clamp(rect: Rect): Rect {
    const b = this.bounds;
    return {
      ...rect,
      x: Math.min(Math.max(rect.x, b.x + 2), b.x + b.width - 2 - rect.width),
      y: Math.min(Math.max(rect.y, b.y + 2), b.y + b.height - 2 - rect.height),
    };
  }
}

interface PlanLabel {
  text: string;
  size: number;
  font: PDFFont;
  border: RGB | null;
  rect: Rect;
}

const LABEL_PAD = 2.5;

function labelBox(text: string, font: PDFFont, size: number): { width: number; height: number } {
  return { width: font.widthOfTextAtSize(toPdfSafeText(text), size) + 2 * LABEL_PAD, height: size + 2 * LABEL_PAD };
}

function drawLabel(page: PDFPage, label: PlanLabel): void {
  const { rect } = label;
  page.drawRectangle({ ...rect, color: WHITE, opacity: 0.9, ...(label.border ? { borderColor: label.border, borderWidth: 0.8 } : {}) });
  drawPdfText(page, label.text, { x: rect.x + LABEL_PAD, y: rect.y + LABEL_PAD + label.size * 0.22, size: label.size, font: label.font, color: BLACK });
}

/** Map imagery is north-up, so south points straight down. Returns the area it covers. */
function drawSouthArrow(page: PDFPage, placement: Placement, font: PDFFont): Rect {
  const cx = placement.x + placement.width - 24;
  const top = placement.y + placement.height - 8;
  const box = { x: cx - 14, y: top - 62, width: 28, height: 58 };
  page.drawRectangle({ ...box, color: WHITE, opacity: 0.85, borderColor: BLACK, borderWidth: 0.5 });
  page.drawLine({ start: { x: cx, y: top - 10 }, end: { x: cx, y: top - 38 }, thickness: 2, color: BLACK });
  drawPolygon(page, [{ x: cx, y: top - 46 }, { x: cx - 6, y: top - 34 }, { x: cx + 6, y: top - 34 }], { color: BLACK });
  const label = 'Sud';
  page.drawText(label, { x: cx - font.widthOfTextAtSize(label, 8) / 2, y: top - 57, size: 8, font, color: BLACK });
  return box;
}

function drawNorthArrow(page: PDFPage, placement: Placement, font: PDFFont): void {
  const cx = placement.x + placement.width - 24;
  const top = placement.y + placement.height - 8;
  page.drawRectangle({ x: cx - 14, y: top - 58, width: 28, height: 54, color: WHITE, opacity: 0.85, borderColor: BLACK, borderWidth: 0.5 });
  const label = 'N';
  page.drawText(label, { x: cx - font.widthOfTextAtSize(label, 10) / 2, y: top - 17, size: 10, font, color: BLACK });
  drawPolygon(page, [{ x: cx, y: top - 20 }, { x: cx - 6, y: top - 32 }, { x: cx + 6, y: top - 32 }], { color: BLACK });
  page.drawLine({ start: { x: cx, y: top - 30 }, end: { x: cx, y: top - 52 }, thickness: 2, color: BLACK });
}

/**
 * A two-tone scale bar starting at (x, y): the shortest round length of at least 25 pt — 10 m on
 * a normal implantation plan. Returns the height it used.
 */
function drawScaleBar(page: PDFPage, x: number, y: number, ptPerMetre: number, maxWidth: number, font: PDFFont): number {
  if (!Number.isFinite(ptPerMetre) || ptPerMetre <= 0) return 0;
  const lengths = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const metres = lengths.find((m) => m * ptPerMetre >= 25) ?? lengths[lengths.length - 1]!;
  const width = Math.min(maxWidth, metres * ptPerMetre);
  const barY = y + 9;
  page.drawRectangle({ x, y: barY, width: width / 2, height: 4, color: BLACK, borderColor: BLACK, borderWidth: 0.5 });
  page.drawRectangle({ x: x + width / 2, y: barY, width: width / 2, height: 4, color: WHITE, borderColor: BLACK, borderWidth: 0.5 });
  page.drawText('0', { x: x - font.widthOfTextAtSize('0', 7) / 2, y, size: 7, font, color: BLACK });
  const label = `${frenchNumber(metres, { max: 0 })} m`;
  page.drawText(label, { x: x + width - font.widthOfTextAtSize(label, 7) / 2, y, size: 7, font, color: BLACK });
  page.drawText('Échelle', { x: x + width + 14, y: barY - 1, size: 7, font, color: GREY });
  return 22;
}

function drawLayoutOverlay(page: PDFPage, layout: Page37Layout, placement: Placement): void {
  const quad = layout.panelRectangle.map((p) => toPdf(placement, p));
  drawPolygon(page, quad, { color: PANEL_BLUE, opacity: 0.35 });
  for (let i = 0; i < quad.length; i += 1) {
    page.drawLine({ start: quad[i]!, end: quad[(i + 1) % quad.length]!, thickness: 1.5, color: PANEL_BLUE });
  }
  const route = layout.wireRoute.map((p) => toPdf(placement, p));
  for (let i = 0; i + 1 < route.length; i += 1) {
    page.drawLine({ start: route[i]!, end: route[i + 1]!, thickness: 2, color: ROUTE_ORANGE });
  }
}

interface Leg {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  color: RGB;
  earth: boolean;
}

function drawLeg(page: PDFPage, leg: Leg): void {
  // A white halo keeps the conductor readable on any roof colour.
  page.drawLine({ start: leg.from, end: leg.to, thickness: 4.5, color: WHITE, opacity: 0.85 });
  page.drawLine({ start: leg.from, end: leg.to, thickness: 2.2, color: leg.color });
  if (leg.earth) page.drawLine({ start: leg.from, end: leg.to, thickness: 2.2, color: PE_YELLOW, dashArray: [4, 4] });
}

/** Label candidates along a leg: on it at mid-length first, then beside it, then further along. */
function legLabelCandidates(leg: Leg, box: { width: number; height: number }): Rect[] {
  const dx = leg.to.x - leg.from.x;
  const dy = leg.to.y - leg.from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const offset = box.height / 2 + 5;
  const candidates: Rect[] = [];
  for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    for (const side of [0, 1, -1, 2, -2]) {
      const cx = leg.from.x + dx * t + normal.x * offset * side;
      const cy = leg.from.y + dy * t + normal.y * offset * side;
      candidates.push({ x: cx - box.width / 2, y: cy - box.height / 2, ...box });
    }
  }
  return candidates;
}

function markerLabelCandidates(at: { x: number; y: number }, box: { width: number; height: number }): Rect[] {
  const gap = MARKER_RADIUS + 4;
  return [
    { x: at.x + gap, y: at.y - box.height / 2, ...box },
    { x: at.x - gap - box.width, y: at.y - box.height / 2, ...box },
    { x: at.x - box.width / 2, y: at.y + gap, ...box },
    { x: at.x - box.width / 2, y: at.y - gap - box.height, ...box },
    { x: at.x + gap, y: at.y + gap - 2, ...box },
    { x: at.x - gap - box.width, y: at.y + gap - 2, ...box },
    { x: at.x + gap, y: at.y - gap - box.height + 2, ...box },
    { x: at.x - gap - box.width, y: at.y - gap - box.height + 2, ...box },
  ];
}

/** One or more lines of text fitted to `width`, drawn downwards from `y`; returns the next y. */
function drawFittedLines(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, options: { size?: number; maxLines?: number; color?: RGB } = {}): number {
  const size = options.size ?? 9;
  const maxLines = options.maxLines ?? 1;
  const fitted = fitPdfText(font, text, { size, minSize: Math.min(size, 7), maxWidth: width, maxHeight: maxLines * size * 1.2 });
  let lineY = y;
  for (const line of fitted.lines) {
    page.drawText(line, { x, y: lineY, size: fitted.size, font, color: options.color ?? BLACK });
    lineY -= fitted.lineHeight;
  }
  return lineY - 3;
}

function drawBlockFrame(page: PDFPage, block: { x: number; width: number }): void {
  page.drawRectangle({ x: block.x, y: INFO_BOTTOM, width: block.width, height: INFO_TOP - INFO_BOTTOM, borderColor: BLACK, borderWidth: 1 });
}

/** Draws the logo in the block's top-right corner; returns the width left for text beside it. */
async function drawBlockLogo(doc: PDFDocument, page: PDFPage, logoBuffer: Buffer | null, fullTextWidth: number): Promise<number> {
  const logo = await embedLogo(doc, logoBuffer);
  if (!logo) return fullTextWidth;
  const scale = Math.min(70 / logo.width, 40 / logo.height);
  page.drawImage(logo, {
    x: RIGHT_BLOCK.x + RIGHT_BLOCK.width - 8 - logo.width * scale,
    y: INFO_TOP - 8 - logo.height * scale,
    width: logo.width * scale,
    height: logo.height * scale,
  });
  return fullTextWidth - 78;
}

function linkLegendText(kind: 'DC' | 'AC', link: SitePlanLink): string {
  return link.formula ? `${kind} : ${link.formula}` : `${kind} : ${frenchNumber(link.lengthM, { max: 1 })} m (longueur saisie par l'installateur)`;
}

function drawImplantationLegend(page: PDFPage, fonts: Fonts, data: SitePlanData['page37'], ptPerMetre: number, earthDrawn: boolean): void {
  drawBlockFrame(page, LEFT_BLOCK);
  const x = LEFT_BLOCK.x + 10;
  const textX = x + 24;
  const textWidth = LEFT_BLOCK.width - 20 - 24;
  let y = INFO_TOP - 18;
  page.drawText('Légende', { x, y, size: 10, font: fonts.bold, color: BLACK });
  y -= 18;

  for (const key of POINT_KEYS) {
    const style = POINT_STYLES[key];
    const gps = data.gps[key];
    page.drawCircle({ x: x + 9, y: y + 3, size: 4, color: style.color, borderColor: WHITE, borderWidth: 1 });
    const text = gps ? `${style.label} : ${formatGpsDecimal(gps)}` : `${style.label} (non placé)`;
    y = drawFittedLines(page, text, textX, y, textWidth, fonts.regular, { size: 8, color: gps ? BLACK : GREY }) - 1;
  }

  if (data.layout) {
    page.drawRectangle({ x, y: y - 2, width: 18, height: 9, color: PANEL_BLUE, opacity: 0.35, borderColor: PANEL_BLUE, borderWidth: 1.5 });
    y = drawFittedLines(page, 'Champ PV (implantation indicative)', textX, y, textWidth, fonts.regular, { size: 8 }) - 1;
    page.drawLine({ start: { x, y: y + 3 }, end: { x: x + 18, y: y + 3 }, thickness: 2, color: ROUTE_ORANGE });
    y = drawFittedLines(page, 'Tracé de câblage', textX, y, textWidth, fonts.regular, { size: 8 }) - 1;
  }

  y -= 2;
  const links: [RGB, string, boolean][] = [
    [DC_RED, linkLegendText('DC', data.dc), false],
    [AC_BROWN, linkLegendText('AC', data.ac), false],
    ...(earthDrawn ? ([[PE_GREEN, 'Terre : local technique — piquet de terre', true]] as [RGB, string, boolean][]) : []),
  ];
  for (const [color, text, earth] of links) {
    page.drawLine({ start: { x, y: y + 3 }, end: { x: x + 18, y: y + 3 }, thickness: 2.2, color });
    if (earth) page.drawLine({ start: { x, y: y + 3 }, end: { x: x + 18, y: y + 3 }, thickness: 2.2, color: PE_YELLOW, dashArray: [4, 4] });
    y = drawFittedLines(page, text, textX, y, textWidth, fonts.regular, { size: 8, maxLines: 2 }) - 1;
  }

  drawScaleBar(page, x + 4, Math.max(INFO_BOTTOM + 8, y - 14), ptPerMetre, LEFT_BLOCK.width - 80, fonts.regular);
}

async function drawImplantationTitleBlock(doc: PDFDocument, page: PDFPage, input: SitePlanPagesInput, fonts: Fonts): Promise<void> {
  drawBlockFrame(page, RIGHT_BLOCK);
  const x = RIGHT_BLOCK.x + 8;
  const width = RIGHT_BLOCK.width - 16;
  const titleWidth = await drawBlockLogo(doc, page, input.companyLogoBuffer, width);
  let y = INFO_TOP - 18;
  y = drawFittedLines(page, IMPLANTATION_TITLE, x, y, titleWidth, fonts.bold, { size: 10, maxLines: 3 });
  y -= 6;
  y = drawFittedLines(page, `Client : ${input.clientFullName}`, x, y, width, fonts.regular);
  y = drawFittedLines(page, `Adresse : ${input.clientAddress}`, x, y, width, fonts.regular, { maxLines: 2 });
  y = drawFittedLines(page, `Date : ${formatFrenchDate(input.dossierDate)}`, x, y, width, fonts.regular);
  if (input.dossierNumber) y = drawFittedLines(page, `N° dossier : ${input.dossierNumber}`, x, y, width, fonts.regular);
  y = drawFittedLines(page, `Installateur : ${input.installerName}`, x, y, width, fonts.regular, { maxLines: 2 });
  drawFittedLines(page, `Agrément ANME n° ${input.installerAnmeCode}`, x, y, width, fonts.regular);
}

const formatSection = (mm2: number): string => `${frenchNumber(mm2, { max: 1 })} mm²`;

async function drawImplantationPage(doc: PDFDocument, input: SitePlanPagesInput, data: SitePlanData['page37'], fonts: Fonts): Promise<void> {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, IMPLANTATION_TITLE, { x: MARGIN, y: PAGE_HEIGHT - 45, size: 16, font: fonts.bold, color: BLACK });

  const { placement, titleRect } = await drawBackground(doc, page, data.image, fonts);
  if (data.layout) drawLayoutOverlay(page, data.layout, placement);

  const at: Partial<Record<PointKey, { x: number; y: number }>> = {};
  for (const key of POINT_KEYS) {
    const point = data.points[key];
    if (point && isInsidePlacement(placement, point)) at[key] = toPdf(placement, point);
  }

  const legs: Leg[] = [];
  if (at.field && at.technicalRoom) {
    legs.push({ from: at.field, to: at.technicalRoom, label: `DC : ${frenchNumber(data.dc.lengthM, { max: 1 })} m — ${formatSection(data.dc.sectionMm2)}`, color: DC_RED, earth: false });
  }
  if (at.technicalRoom && at.meter) {
    legs.push({ from: at.technicalRoom, to: at.meter, label: `AC : ${frenchNumber(data.ac.lengthM, { max: 1 })} m — ${formatSection(data.ac.sectionMm2)}`, color: AC_BROWN, earth: false });
  }
  if (at.technicalRoom && at.earthPit) {
    legs.push({ from: at.technicalRoom, to: at.earthPit, label: 'Terre', color: PE_GREEN, earth: true });
  }
  for (const leg of legs) drawLeg(page, leg);

  const space = new LabelSpace(placement);
  space.reserve(drawSouthArrow(page, placement, fonts.bold));
  if (titleRect) space.reserve(titleRect);
  for (const key of POINT_KEYS) {
    const centre = at[key];
    if (!centre) continue;
    page.drawCircle({ x: centre.x, y: centre.y, size: MARKER_RADIUS, color: POINT_STYLES[key].color, borderColor: WHITE, borderWidth: 1.5 });
    const r = MARKER_RADIUS + 2;
    space.reserve({ x: centre.x - r, y: centre.y - r, width: 2 * r, height: 2 * r });
  }

  const labels: PlanLabel[] = [];
  for (const leg of legs) {
    const size = 7.5;
    const box = labelBox(leg.label, fonts.bold, size);
    labels.push({ text: leg.label, size, font: fonts.bold, border: leg.color, rect: space.place(legLabelCandidates(leg, box)) });
  }
  for (const key of POINT_KEYS) {
    const centre = at[key];
    if (!centre) continue;
    const size = 8;
    const text = POINT_STYLES[key].label;
    const box = labelBox(text, fonts.bold, size);
    labels.push({ text, size, font: fonts.bold, border: null, rect: space.place(markerLabelCandidates(centre, box)) });
  }
  for (const label of labels) drawLabel(page, label);

  drawImplantationLegend(page, fonts, data, pointsPerMetre(placement, data.image), legs.some((leg) => leg.earth));
  await drawImplantationTitleBlock(doc, page, input, fonts);
}

function drawPin(page: PDFPage, tip: { x: number; y: number }): void {
  const headY = tip.y + 16;
  drawPolygon(page, [tip, { x: tip.x - 6, y: headY - 3 }, { x: tip.x + 6, y: headY - 3 }], { color: PIN_RED });
  page.drawCircle({ x: tip.x, y: headY, size: 7, color: PIN_RED, borderColor: WHITE, borderWidth: 1.2 });
  page.drawCircle({ x: tip.x, y: headY, size: 2.5, color: WHITE });
}

async function drawSituationPage(doc: PDFDocument, input: SitePlanPagesInput, data: SitePlanData['page38'], fonts: Fonts): Promise<void> {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, SITUATION_TITLE, { x: MARGIN, y: PAGE_HEIGHT - 45, size: 20, font: fonts.bold, color: BLACK });

  const { placement } = await drawBackground(doc, page, data.image, fonts);
  if (isInsidePlacement(placement, data.sitePin)) drawPin(page, toPdf(placement, data.sitePin));
  drawNorthArrow(page, placement, fonts.bold);

  drawBlockFrame(page, LEFT_BLOCK);
  let x = LEFT_BLOCK.x + 10;
  let width = LEFT_BLOCK.width - 20;
  let y = INFO_TOP - 18;
  page.drawText('Site', { x, y, size: 10, font: fonts.bold, color: BLACK });
  y -= 18;
  y = drawFittedLines(page, `Client : ${input.clientFullName}`, x, y, width, fonts.regular);
  y = drawFittedLines(page, `Adresse : ${input.clientAddress}`, x, y, width, fonts.regular, { maxLines: 3 });
  y = drawFittedLines(page, `Coordonnées GPS : ${formatGpsDecimal(input.gps)}`, x, y, width, fonts.regular);
  y = drawFittedLines(page, `Coordonnées (DMS) : ${formatGpsDms(input.gps)}`, x, y, width, fonts.regular, { maxLines: 2 });
  y = drawFittedLines(page, `Date : ${formatFrenchDate(input.dossierDate)}`, x, y, width, fonts.regular);
  drawScaleBar(page, x + 4, Math.max(INFO_BOTTOM + 8, y - 16), pointsPerMetre(placement, data.image), width - 60, fonts.regular);

  drawBlockFrame(page, RIGHT_BLOCK);
  x = RIGHT_BLOCK.x + 8;
  width = RIGHT_BLOCK.width - 16;
  const nameWidth = await drawBlockLogo(doc, page, input.companyLogoBuffer, width);
  y = INFO_TOP - 18;
  page.drawText('Installateur', { x, y, size: 10, font: fonts.bold, color: BLACK });
  y -= 18;
  y = drawFittedLines(page, input.installerName, x, y, nameWidth, fonts.bold, { maxLines: 2 });
  y = drawFittedLines(page, input.installerContact.address, x, y, width, fonts.regular, { maxLines: 3 });
  y = drawFittedLines(page, `Tél : ${input.installerContact.phone}`, x, y, width, fonts.regular);
  y = drawFittedLines(page, `E-mail : ${input.installerContact.email}`, x, y, width, fonts.regular);
  drawFittedLines(page, `Agrément ANME n° ${input.installerAnmeCode}`, x, y, width, fonts.regular);
}

function drawEmptyFrame(doc: PDFDocument, title: string, fonts: Fonts): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, title, { x: MARGIN, y: PAGE_HEIGHT - 40, size: 16, font: fonts.regular, color: BLACK });
  page.drawRectangle({ x: MARGIN, y: 100, width: PAGE_WIDTH - 2 * MARGIN, height: PAGE_HEIGHT - 200, borderColor: BLACK, borderWidth: 1 });
  drawPdfText(page, "À compléter par l'installateur", { x: 60, y: PAGE_HEIGHT / 2, size: 12, font: fonts.regular, color: GREY });
}

export async function renderSitePlanPages(input: SitePlanPagesInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) };

  if (!input.planData) {
    drawEmptyFrame(doc, IMPLANTATION_TITLE, fonts);
    drawEmptyFrame(doc, SITUATION_TITLE, fonts);
    return Buffer.from(await doc.save());
  }

  await drawImplantationPage(doc, input, input.planData.page37, fonts);
  await drawSituationPage(doc, input, input.planData.page38, fonts);
  return Buffer.from(await doc.save());
}
