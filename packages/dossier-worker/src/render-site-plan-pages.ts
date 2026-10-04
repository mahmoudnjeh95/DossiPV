import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import type { PixelPoint } from './fetch-satellite-image';
import type { Page37Layout, Page37Points } from './generate-page-37-layout';
import { drawPdfText, fitPdfText, toPdfSafeText } from './pdf-text';
import { embedLogo, formatFrenchDate } from './render-cover-page';

/** A stitched satellite image plus its pixel size (the coordinate space of every overlay). */
export interface SitePlanImage {
  buffer: Buffer;
  widthPx: number;
  heightPx: number;
}

export interface SitePlanPremiumData {
  page37: {
    image: SitePlanImage;
    /** Null when no point was placed on the map: the photo is shown without an AI overlay. */
    layout: Page37Layout | null;
    /** Installer-placed points, in page-37 image pixels. */
    points: Page37Points;
  };
  page38: {
    image: SitePlanImage;
    /** The site's GPS point, in page-38 image pixels. */
    sitePin: PixelPoint;
  };
}

export interface SitePlanPagesInput {
  tier: 'STANDARD' | 'PREMIUM';
  clientFullName: string;
  clientAddress: string;
  gps: { lat: number; lon: number };
  installerName: string;
  installerContact: { address: string; phone: string; email: string };
  companyLogoBuffer: Buffer | null;
  /** ISO date, printed dd/MM/yyyy in the title block. */
  dossierDate: string;
  dossierNumber: string | null;
  premiumData: SitePlanPremiumData | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.4, 0.4, 0.4);
const PANEL_BLUE = rgb(0.1, 0.3, 0.85);
const ROUTE_ORANGE = rgb(0.95, 0.5, 0.05);
const PIN_RED = rgb(0.85, 0.1, 0.1);

// The satellite image is fitted (aspect kept) inside this square; the legend and title block sit
// below it.
const IMAGE_BOX = { x: MARGIN, y: 262, width: PAGE_WIDTH - 2 * MARGIN, height: PAGE_WIDTH - 2 * MARGIN };
const INFO_TOP = 240;
const INFO_BOTTOM = MARGIN;
const LEFT_BLOCK = { x: MARGIN, width: 250 };
const RIGHT_BLOCK = { x: MARGIN + 265, width: PAGE_WIDTH - 2 * MARGIN - 265 };
const ATTRIBUTION = 'Imagerie : Esri, Maxar, Earthstar Geographics et la communauté des utilisateurs SIG';

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  widthPx: number;
  heightPx: number;
}

const MARKER_STYLES = {
  technicalRoom: { label: 'Local technique', color: rgb(0.75, 0.1, 0.1), shape: 'square' },
  meter: { label: 'Compteur STEG', color: rgb(0.1, 0.55, 0.15), shape: 'circle' },
  earthPit: { label: 'Prise de terre', color: rgb(0.55, 0.35, 0.1), shape: 'triangle' },
} as const;

type MarkerKey = keyof typeof MARKER_STYLES;

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

/** Image pixel → PDF point, inside the rectangle the image was drawn in. */
function toPdf(placement: Placement, p: PixelPoint): { x: number; y: number } {
  return {
    x: placement.x + (p.x / placement.widthPx) * placement.width,
    y: placement.y + placement.height - (p.y / placement.heightPx) * placement.height,
  };
}

function isInsidePlacement(placement: Placement, p: PixelPoint): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= placement.widthPx && p.y <= placement.heightPx;
}

/** Draws the image fitted in IMAGE_BOX; returns where it went, or null if it can't be embedded. */
async function drawSatelliteImage(doc: PDFDocument, page: PDFPage, image: SitePlanImage, fonts: Fonts): Promise<Placement | null> {
  const embedded = await embedImageSafely(doc, image.buffer);
  if (!embedded || image.widthPx <= 0 || image.heightPx <= 0) {
    page.drawRectangle({ ...IMAGE_BOX, borderColor: BLACK, borderWidth: 1 });
    drawPdfText(page, 'Image satellite indisponible', { x: IMAGE_BOX.x + 20, y: IMAGE_BOX.y + IMAGE_BOX.height / 2, size: 12, font: fonts.regular, color: rgb(0.6, 0, 0) });
    return null;
  }
  const scale = Math.min(IMAGE_BOX.width / image.widthPx, IMAGE_BOX.height / image.heightPx);
  const width = image.widthPx * scale;
  const height = image.heightPx * scale;
  const placement: Placement = {
    x: IMAGE_BOX.x + (IMAGE_BOX.width - width) / 2,
    y: IMAGE_BOX.y + (IMAGE_BOX.height - height) / 2,
    width,
    height,
    widthPx: image.widthPx,
    heightPx: image.heightPx,
  };
  page.drawImage(embedded, { x: placement.x, y: placement.y, width, height });
  page.drawRectangle({ x: placement.x, y: placement.y, width, height, borderColor: BLACK, borderWidth: 1 });
  drawPdfText(page, ATTRIBUTION, { x: IMAGE_BOX.x, y: IMAGE_BOX.y - 11, size: 6.5, font: fonts.regular, color: GREY });
  return placement;
}

function svgPolygon(points: { x: number; y: number }[]): string {
  // drawSvgPath is called with origin (0, PAGE_HEIGHT): SVG y grows downwards from the page top.
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${PAGE_HEIGHT - p.y}`).join(' ')} Z`;
}

function drawPolygon(page: PDFPage, points: { x: number; y: number }[], options: { color?: RGB; opacity?: number; borderColor?: RGB; borderWidth?: number }): void {
  page.drawSvgPath(svgPolygon(points), { x: 0, y: PAGE_HEIGHT, ...options });
}

function drawMarkerShape(page: PDFPage, key: MarkerKey, at: { x: number; y: number }, size = 5.5): void {
  const style = MARKER_STYLES[key];
  if (style.shape === 'square') {
    page.drawRectangle({ x: at.x - size, y: at.y - size, width: 2 * size, height: 2 * size, color: style.color, borderColor: WHITE, borderWidth: 1.2 });
  } else if (style.shape === 'circle') {
    page.drawCircle({ x: at.x, y: at.y, size, color: style.color, borderColor: WHITE, borderWidth: 1.2 });
  } else {
    drawPolygon(page, [{ x: at.x, y: at.y - size }, { x: at.x - size, y: at.y + size }, { x: at.x + size, y: at.y + size }], { color: style.color, borderColor: WHITE, borderWidth: 1.2 });
  }
}

/** Label on a white backdrop next to a marker, kept inside the image. */
function drawMarkerLabel(page: PDFPage, text: string, at: { x: number; y: number }, placement: Placement, font: PDFFont): void {
  const size = 8;
  const safe = toPdfSafeText(text);
  const width = font.widthOfTextAtSize(safe, size);
  let x = at.x + 9;
  if (x + width + 3 > placement.x + placement.width) x = at.x - 9 - width;
  x = Math.max(placement.x + 3, x);
  const y = Math.min(placement.y + placement.height - size - 3, Math.max(placement.y + 4, at.y - 3));
  page.drawRectangle({ x: x - 2, y: y - 2, width: width + 4, height: size + 3, color: WHITE, opacity: 0.85 });
  page.drawText(safe, { x, y, size, font, color: BLACK });
}

/** Map imagery is north-up, so south points straight down. */
function drawSouthArrow(page: PDFPage, placement: Placement, font: PDFFont): void {
  const cx = placement.x + placement.width - 24;
  const top = placement.y + placement.height - 8;
  page.drawRectangle({ x: cx - 14, y: top - 62, width: 28, height: 58, color: WHITE, opacity: 0.85, borderColor: BLACK, borderWidth: 0.5 });
  page.drawLine({ start: { x: cx, y: top - 10 }, end: { x: cx, y: top - 38 }, thickness: 2, color: BLACK });
  drawPolygon(page, [{ x: cx, y: top - 46 }, { x: cx - 6, y: top - 34 }, { x: cx + 6, y: top - 34 }], { color: BLACK });
  const label = 'Sud';
  page.drawText(label, { x: cx - font.widthOfTextAtSize(label, 8) / 2, y: top - 57, size: 8, font, color: BLACK });
}

function drawOverlay(page: PDFPage, layout: Page37Layout, placement: Placement): void {
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

/** One or more lines of text fitted to `width`, drawn downwards from `y`; returns the next y. */
function drawFittedLines(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, options: { size?: number; maxLines?: number } = {}): number {
  const size = options.size ?? 9;
  const maxLines = options.maxLines ?? 1;
  const fitted = fitPdfText(font, text, { size, minSize: Math.min(size, 7), maxWidth: width, maxHeight: maxLines * size * 1.2 });
  let lineY = y;
  for (const line of fitted.lines) {
    page.drawText(line, { x, y: lineY, size: fitted.size, font, color: BLACK });
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

function drawLegend(page: PDFPage, fonts: Fonts, points: Page37Points): void {
  drawBlockFrame(page, LEFT_BLOCK);
  const x = LEFT_BLOCK.x + 10;
  let y = INFO_TOP - 18;
  page.drawText('Légende', { x, y, size: 10, font: fonts.bold, color: BLACK });
  y -= 22;

  page.drawRectangle({ x, y: y - 2, width: 18, height: 10, color: PANEL_BLUE, opacity: 0.35, borderColor: PANEL_BLUE, borderWidth: 1.5 });
  drawPdfText(page, 'Champ PV (implantation indicative)', { x: x + 26, y, size: 8, font: fonts.regular, color: BLACK });
  y -= 18;
  page.drawLine({ start: { x, y: y + 3 }, end: { x: x + 18, y: y + 3 }, thickness: 2, color: ROUTE_ORANGE });
  drawPdfText(page, 'Tracé de câblage', { x: x + 26, y, size: 8, font: fonts.regular, color: BLACK });
  y -= 18;
  for (const key of Object.keys(MARKER_STYLES) as MarkerKey[]) {
    drawMarkerShape(page, key, { x: x + 9, y: y + 3 }, 4.5);
    const placed = points[key] !== null;
    drawPdfText(page, `${MARKER_STYLES[key].label}${placed ? '' : ' (non placé)'}`, { x: x + 26, y, size: 8, font: fonts.regular, color: placed ? BLACK : GREY });
    y -= 18;
  }
  y -= 4;
  drawFittedLines(page, 'Chaîne : DC -> Onduleur -> AC -> TGBT -> Compteur STEG', x, y, LEFT_BLOCK.width - 20, fonts.regular, { size: 8 });
}

async function drawTitleBlock(doc: PDFDocument, page: PDFPage, input: SitePlanPagesInput, fonts: Fonts, title: string): Promise<void> {
  drawBlockFrame(page, RIGHT_BLOCK);
  const x = RIGHT_BLOCK.x + 8;
  const width = RIGHT_BLOCK.width - 16;
  const titleWidth = await drawBlockLogo(doc, page, input.companyLogoBuffer, width);
  let y = INFO_TOP - 18;
  y = drawFittedLines(page, title, x, y, titleWidth, fonts.bold, { size: 10, maxLines: 2 });
  y -= 6;
  y = drawFittedLines(page, `Client : ${input.clientFullName}`, x, y, width, fonts.regular);
  y = drawFittedLines(page, `Adresse : ${input.clientAddress}`, x, y, width, fonts.regular, { maxLines: 2 });
  y = drawFittedLines(page, `Date : ${formatFrenchDate(input.dossierDate)}`, x, y, width, fonts.regular);
  if (input.dossierNumber) y = drawFittedLines(page, `N° dossier : ${input.dossierNumber}`, x, y, width, fonts.regular);
  drawFittedLines(page, `Installateur : ${input.installerName}`, x, y, width, fonts.regular);
}

async function drawPage37(doc: PDFDocument, input: SitePlanPagesInput, data: SitePlanPremiumData['page37'], fonts: Fonts): Promise<void> {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, "Schéma d'implantation et de connexion", { x: MARGIN, y: PAGE_HEIGHT - 45, size: 16, font: fonts.bold, color: BLACK });

  const placement = await drawSatelliteImage(doc, page, data.image, fonts);
  if (placement) {
    if (data.layout) {
      drawOverlay(page, data.layout, placement);
    } else {
      drawPdfText(page, "Implantation indicative non générée : aucun point (local technique, compteur, prise de terre) n'a été placé sur la carte.", {
        x: IMAGE_BOX.x,
        y: IMAGE_BOX.y - 20,
        size: 7,
        font: fonts.regular,
        color: GREY,
      });
    }
    for (const key of Object.keys(MARKER_STYLES) as MarkerKey[]) {
      const point = data.points[key];
      if (!point || !isInsidePlacement(placement, point)) continue;
      const at = toPdf(placement, point);
      drawMarkerShape(page, key, at);
      drawMarkerLabel(page, MARKER_STYLES[key].label, at, placement, fonts.bold);
    }
    drawSouthArrow(page, placement, fonts.bold);
  }

  drawLegend(page, fonts, data.points);
  await drawTitleBlock(doc, page, input, fonts, "Schéma d'implantation et de connexion");
}

function drawPin(page: PDFPage, tip: { x: number; y: number }): void {
  const headY = tip.y + 16;
  drawPolygon(page, [tip, { x: tip.x - 6, y: headY - 3 }, { x: tip.x + 6, y: headY - 3 }], { color: PIN_RED });
  page.drawCircle({ x: tip.x, y: headY, size: 7, color: PIN_RED, borderColor: WHITE, borderWidth: 1.2 });
  page.drawCircle({ x: tip.x, y: headY, size: 2.5, color: WHITE });
}

async function drawPage38(doc: PDFDocument, input: SitePlanPagesInput, data: SitePlanPremiumData['page38'], fonts: Fonts): Promise<void> {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, 'Plan de Situation', { x: MARGIN, y: PAGE_HEIGHT - 45, size: 20, font: fonts.bold, color: BLACK });

  const placement = await drawSatelliteImage(doc, page, data.image, fonts);
  if (placement && isInsidePlacement(placement, data.sitePin)) {
    drawPin(page, toPdf(placement, data.sitePin));
  }

  drawBlockFrame(page, LEFT_BLOCK);
  let x = LEFT_BLOCK.x + 10;
  let width = LEFT_BLOCK.width - 20;
  let y = INFO_TOP - 18;
  page.drawText('Site', { x, y, size: 10, font: fonts.bold, color: BLACK });
  y -= 18;
  y = drawFittedLines(page, `Client : ${input.clientFullName}`, x, y, width, fonts.regular);
  y = drawFittedLines(page, `Adresse : ${input.clientAddress}`, x, y, width, fonts.regular, { maxLines: 3 });
  y = drawFittedLines(page, `Coordonnées GPS : ${input.gps.lat.toFixed(5)}, ${input.gps.lon.toFixed(5)}`, x, y, width, fonts.regular);
  drawFittedLines(page, `Date : ${formatFrenchDate(input.dossierDate)}`, x, y, width, fonts.regular);

  drawBlockFrame(page, RIGHT_BLOCK);
  x = RIGHT_BLOCK.x + 8;
  width = RIGHT_BLOCK.width - 16;
  const nameWidth = await drawBlockLogo(doc, page, input.companyLogoBuffer, width);
  y = INFO_TOP - 18;
  page.drawText('Installateur', { x, y, size: 10, font: fonts.bold, color: BLACK });
  y -= 18;
  y = drawFittedLines(page, input.installerName, x, y, nameWidth, fonts.bold);
  y = drawFittedLines(page, input.installerContact.address, x, y, width, fonts.regular, { maxLines: 3 });
  y = drawFittedLines(page, `Tél : ${input.installerContact.phone}`, x, y, width, fonts.regular);
  drawFittedLines(page, `E-mail : ${input.installerContact.email}`, x, y, width, fonts.regular);
}

function drawEmptyFrame(doc: PDFDocument, title: string, fonts: Fonts): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, title, { x: MARGIN, y: PAGE_HEIGHT - 40, size: 16, font: fonts.regular, color: BLACK });
  page.drawRectangle({ x: MARGIN, y: 100, width: PAGE_WIDTH - 2 * MARGIN, height: PAGE_HEIGHT - 200, borderColor: BLACK, borderWidth: 1 });
  drawPdfText(page, "À compléter par l'installateur", { x: 60, y: PAGE_HEIGHT / 2, size: 12, font: fonts.regular, color: GREY });
}

export async function renderSitePlanPages(input: SitePlanPagesInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };

  if (input.tier === 'STANDARD' || !input.premiumData) {
    drawEmptyFrame(doc, "Schéma d'implantation et de connexion", fonts);
    drawEmptyFrame(doc, 'Plan de Situation', fonts);
    return Buffer.from(await doc.save());
  }

  await drawPage37(doc, input, input.premiumData.page37, fonts);
  await drawPage38(doc, input, input.premiumData.page38, fonts);
  return Buffer.from(await doc.save());
}
