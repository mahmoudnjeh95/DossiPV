import { rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { drawPdfText, wrapPdfText, toPdfSafeText } from './pdf-text';
import { formatFrenchDate } from './render-cover-page';
import { drawSymbol, SYMBOLS, type Point, type SymbolKind } from './drawing-symbols';

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything the title block needs except the per-drawing fields, with the logo as bytes. */
export interface DrawingCartouche {
  projectTitle: string;
  client: string;
  commune: string;
  installerName: string;
  anmeCode: string;
  revision: string;
  date: string;
  dossierNumber: string | null;
  logo: Buffer | null;
}

export interface SheetCartouche extends Omit<DrawingCartouche, 'logo'> {
  drawingTitle: string;
  planNumber: number;
  pageLabel: string;
  logo: PDFImage | null;
}

export const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
export const FRAME_MARGIN = 28.35; // 10 mm
export const MIN_TEXT_SIZE = 7;
export const LINE_WIDTH = 1;
const CARTOUCHE = { width: 340, height: 66 };
const LOGO_CELL = 58;

export const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);

export type ConductorKind = 'dcPlus' | 'dcMinus' | 'acPhase' | 'acNeutral' | 'pe';

export const CONDUCTOR_COLORS: Record<ConductorKind, RGB> = {
  dcPlus: rgb(0.8, 0, 0),
  dcMinus: BLACK,
  acPhase: rgb(0.45, 0.25, 0.1),
  acNeutral: rgb(0.1, 0.3, 0.8),
  pe: rgb(0.1, 0.6, 0.15),
};

/** Draws text no smaller than the 7 pt floor; returns the width it took. */
export function label(page: PDFPage, font: PDFFont, text: string, at: Point, size = MIN_TEXT_SIZE, color: RGB = BLACK): number {
  const fontSize = Math.max(MIN_TEXT_SIZE, size);
  drawPdfText(page, text, { x: at.x, y: at.y, size: fontSize, font, color });
  return font.widthOfTextAtSize(toPdfSafeText(text), fontSize);
}

/** Cuts `text` to fit `maxWidth`, ending with an ellipsis. */
export function clip(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const safe = toPdfSafeText(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let cut = safe;
  while (cut.length > 0 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * Frame, heading and title block of an A4-landscape drawing. The title block sits bottom right;
 * the area to its left stays free for a legend. Returns the drawing area: everything inside the
 * frame above the title block and below the heading, plus the legend band.
 */
export function drawSheet(page: PDFPage, fonts: Fonts, cartouche: SheetCartouche): Rect & { legend: Rect } {
  const { width: pageW, height: pageH } = page.getSize();
  const frame: Rect = { x: FRAME_MARGIN, y: FRAME_MARGIN, width: pageW - 2 * FRAME_MARGIN, height: pageH - 2 * FRAME_MARGIN };
  page.drawRectangle({ x: frame.x, y: frame.y, width: frame.width, height: frame.height, borderColor: BLACK, borderWidth: 1.5 });

  const box: Rect = { x: frame.x + frame.width - CARTOUCHE.width, y: frame.y, width: CARTOUCHE.width, height: CARTOUCHE.height };
  page.drawRectangle({ x: box.x, y: box.y, width: box.width, height: box.height, borderColor: BLACK, borderWidth: 1, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: box.x + LOGO_CELL, y: box.y }, end: { x: box.x + LOGO_CELL, y: box.y + box.height }, thickness: 0.5, color: BLACK });

  if (cartouche.logo) {
    const scale = Math.min((LOGO_CELL - 8) / cartouche.logo.width, (box.height - 8) / cartouche.logo.height);
    const w = cartouche.logo.width * scale;
    const h = cartouche.logo.height * scale;
    page.drawImage(cartouche.logo, { x: box.x + (LOGO_CELL - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h });
  }

  const textX = box.x + LOGO_CELL + 5;
  const textW = box.width - LOGO_CELL - 10;
  const colW = textW / 2;
  const rowH = 9.6;
  const top = box.y + box.height;
  label(page, fonts.bold, clip(fonts.bold, cartouche.drawingTitle, 9, textW), { x: textX, y: top - 11 }, 9);
  page.drawLine({ start: { x: box.x + LOGO_CELL, y: top - 15 }, end: { x: box.x + box.width, y: top - 15 }, thickness: 0.5, color: BLACK });

  const left = [
    `Projet : ${cartouche.projectTitle}`,
    `Client : ${cartouche.client}`,
    `Adresse : ${cartouche.commune}`,
    `Installateur : ${cartouche.installerName}`,
    `Dossier N° ${cartouche.dossierNumber ?? '—'}`,
  ];
  const right = [
    `Code ANME : ${cartouche.anmeCode}`,
    `Plan N° ${cartouche.planNumber} — rév. ${cartouche.revision}`,
    `Date : ${formatFrenchDate(cartouche.date)}`,
    'Échelle : sans échelle',
    cartouche.pageLabel,
  ];
  left.forEach((text, i) => label(page, fonts.regular, clip(fonts.regular, text, MIN_TEXT_SIZE, colW - 4), { x: textX, y: top - 24 - i * rowH }));
  right.forEach((text, i) => label(page, fonts.regular, clip(fonts.regular, text, MIN_TEXT_SIZE, colW - 4), { x: textX + colW, y: top - 24 - i * rowH }));

  const headingH = 24;
  label(page, fonts.bold, cartouche.drawingTitle, { x: frame.x + 10, y: frame.y + frame.height - 18 }, 13);
  const area: Rect = {
    x: frame.x + 8,
    y: frame.y + CARTOUCHE.height + 6,
    width: frame.width - 16,
    height: frame.height - CARTOUCHE.height - 6 - headingH - 4,
  };
  const legendRect: Rect = { x: frame.x + 8, y: frame.y + 4, width: frame.width - CARTOUCHE.width - 20, height: CARTOUCHE.height - 6 };
  return { ...area, legend: legendRect };
}

function dashedLine(page: PDFPage, from: Point, to: Point, color: RGB): void {
  page.drawLine({ start: from, end: to, thickness: LINE_WIDTH, color, dashArray: [4, 3], dashPhase: 0 });
}

/**
 * A straight conductor with its label beside the line (above a horizontal one, to the right of a
 * vertical one) — never across it. A string label is wrapped to the conductor's length; an array
 * is taken as explicit lines. The PE conductor is green and dashed and carries a `PE` mark.
 */
export function conductor(
  page: PDFPage,
  font: PDFFont,
  from: Point,
  to: Point,
  kind: ConductorKind,
  text: string | string[] = '',
  options: { labelSide?: 'above' | 'below' | 'left' | 'right' } = {},
): void {
  const color = CONDUCTOR_COLORS[kind];
  if (kind === 'pe') dashedLine(page, from, to, color);
  else page.drawLine({ start: from, end: to, thickness: LINE_WIDTH, color });

  const horizontal = Math.abs(to.y - from.y) < 0.01;
  const length = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
  const raw = kind === 'pe' && !text ? 'PE' : text;
  const lines = Array.isArray(raw) ? raw : raw ? wrapPdfText(font, raw, MIN_TEXT_SIZE, horizontal ? Math.max(length, 40) : 90) : [];
  if (lines.length === 0) return;
  const lineH = MIN_TEXT_SIZE * 1.2;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  if (horizontal) {
    const below = options.labelSide === 'below';
    lines.forEach((line, i) => {
      const w = font.widthOfTextAtSize(toPdfSafeText(line), MIN_TEXT_SIZE);
      const y = below ? midY - 3 - MIN_TEXT_SIZE - i * lineH : midY + 3 + (lines.length - 1 - i) * lineH;
      label(page, font, line, { x: midX - w / 2, y });
    });
  } else {
    const leftSide = options.labelSide === 'left';
    lines.forEach((line, i) => {
      const w = font.widthOfTextAtSize(toPdfSafeText(line), MIN_TEXT_SIZE);
      const y = midY + ((lines.length - 1) / 2 - i) * lineH - MIN_TEXT_SIZE / 3;
      label(page, font, line, { x: leftSide ? midX - 4 - w : midX + 4, y });
    });
  }
}

/** A dashed enclosure (coffret, existing switchboard) with its name inside the top-left corner. */
export function enclosure(page: PDFPage, font: PDFFont, rect: Rect, name: string): void {
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    borderColor: GREY,
    borderWidth: 1,
    borderDashArray: [5, 3],
  });
  label(page, font, clip(font, name, 8, rect.width - 8), { x: rect.x + 4, y: rect.y + rect.height - 10 }, 8);
}

/** Every symbol used on the drawing with its meaning, in the band left of the title block. */
export function legend(page: PDFPage, font: PDFFont, entries: { kind: SymbolKind; text: string }[], rect: Rect): void {
  const rowH = 14;
  const rowsPerColumn = Math.max(1, Math.floor((rect.height - 10) / rowH));
  const columnW = 150;
  label(page, font, 'Légende', { x: rect.x, y: rect.y + rect.height - 8 });
  entries.forEach((entry, i) => {
    const column = Math.floor(i / rowsPerColumn);
    const row = i % rowsPerColumn;
    const def = SYMBOLS[entry.kind];
    const scale = Math.min(0.45, (rowH - 2) / def.height);
    const x = rect.x + column * columnW + 4;
    const yTop = rect.y + rect.height - 14 - row * rowH;
    drawSymbol(page, entry.kind, { x, y: yTop }, { scale });
    label(page, font, clip(font, entry.text, MIN_TEXT_SIZE, columnW - 40), { x: x + 24, y: yTop - rowH / 2 - 1 });
  });
}
