import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawPdfText, wrapPdfText, wordsFitPdfWidth } from './pdf-text';

export interface DrawingsInput {
  moduleLabel: string;
  /** One entry per inverter; `inverterLabel` is THAT inverter's own brand/model. */
  inverters: { inverterLabel: string; pacW: number; mppts: { stringsInParallel: number; modulesPerString: number }[] }[];
  dcSwitchLabel: string;
  dcSpdLabel: string;
  acSpdLabel: string;
  acBreakerLabel: string;
  dcRun: { sectionMm2: number; lengthM: number };
  acRun: { sectionMm2: number; lengthM: number };
  earthRodCount: number;
  earthingMode: 'DEDICATED_ROD' | 'BUILDING_EARTH';
}

const PAGE_WIDTH = 841.89; // A4 landscape, points — wider pages suit a left-to-right diagram
const PAGE_HEIGHT = 595.28;
const MARGIN = 40;
const BLACK = rgb(0, 0, 0);

// Vertical band the diagram occupies; the cable summary sits below it.
const AREA_TOP = PAGE_HEIGHT - 90;
const AREA_BOTTOM = 170;
const BOX_PADDING = 4;
const MAX_BOX_HEIGHT = 80;
const INVERTER_GAP = 12;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

const frNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

const MAX_LABEL_SIZE = 9;
const MIN_LABEL_SIZE = 4;
const LINE_GAP = 1.2;

interface LabelBox {
  rect: Rect;
  paragraphs: string[];
}

function wrapParagraphs(paragraphs: string[], fonts: Fonts, size: number, maxWidth: number): { text: string; font: PDFFont }[] {
  return paragraphs.flatMap((paragraph, i) => {
    const font = i === 0 ? fonts.bold : fonts.regular;
    return wrapPdfText(font, paragraph, size, maxWidth).map((text) => ({ text, font }));
  });
}

/**
 * Largest font size at which the box's paragraphs (first one bold) fit inside it. Prefers a size
 * where no word has to be cut mid-word (hyphen breaks are fine); falls back to the largest size
 * that fits at all.
 */
function fitLabelSize(box: LabelBox, fonts: Fonts): number {
  const maxWidth = box.rect.width - 2 * BOX_PADDING;
  const maxHeight = box.rect.height - 2 * BOX_PADDING;
  let fallback: number | null = null;
  for (let size = MAX_LABEL_SIZE; size >= MIN_LABEL_SIZE; size -= 0.5) {
    const fitsHeight = wrapParagraphs(box.paragraphs, fonts, size, maxWidth).length * size * LINE_GAP <= maxHeight;
    if (!fitsHeight) continue;
    fallback ??= size;
    const noCutWords = box.paragraphs.every((p, i) => wordsFitPdfWidth(i === 0 ? fonts.bold : fonts.regular, p, size, maxWidth));
    if (noCutWords) return size;
  }
  return fallback ?? MIN_LABEL_SIZE;
}

/**
 * Draws a white box with its label centred inside it. Labels never spill outside their box (the
 * line list is clipped to the box height as a last resort), which matters once inverter boxes are
 * stacked directly above each other.
 */
function drawLabelBox(page: PDFPage, box: LabelBox, fonts: Fonts, size: number): void {
  const { rect } = box;
  page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, borderColor: BLACK, borderWidth: 1, color: rgb(1, 1, 1) });
  const maxWidth = rect.width - 2 * BOX_PADDING;
  const maxHeight = rect.height - 2 * BOX_PADDING;
  const lineHeight = size * LINE_GAP;
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const shown = wrapParagraphs(box.paragraphs, fonts, size, maxWidth).slice(0, maxLines);
  const blockHeight = shown.length * lineHeight;
  let baseline = rect.y + rect.height / 2 + blockHeight / 2 - size;
  for (const line of shown) {
    const textWidth = line.font.widthOfTextAtSize(line.text, size);
    page.drawText(line.text, { x: rect.x + (rect.width - textWidth) / 2, y: baseline, size, font: line.font, color: BLACK });
    baseline -= lineHeight;
  }
}

/** Draws standalone boxes at their own best size, and every inverter box at one shared size. */
function drawBoxes(page: PDFPage, standalone: LabelBox[], inverterStack: LabelBox[], fonts: Fonts): void {
  for (const box of standalone) drawLabelBox(page, box, fonts, fitLabelSize(box, fonts));
  const stackSize = Math.min(...inverterStack.map((box) => fitLabelSize(box, fonts)));
  for (const box of inverterStack) drawLabelBox(page, box, fonts, stackSize);
}

function hLine(page: PDFPage, x1: number, x2: number, y: number): void {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 1, color: BLACK });
}

function vLine(page: PDFPage, x: number, y1: number, y2: number): void {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 1, color: BLACK });
}

const centerY = (rect: Rect): number => rect.y + rect.height / 2;

/**
 * Lays out `columnCount` equal columns left to right. Every column holds one box centred on the
 * diagram's axis, except `inverterColumn`, which holds one box per inverter stacked vertically —
 * inverters are parallel branches between the DC and AC protections, never chained in series.
 */
function layoutColumns(columnCount: number, inverterColumn: number, inverterCount: number, gap: number): { columns: Rect[][]; axisY: number } {
  const columnWidth = (PAGE_WIDTH - 2 * MARGIN - (columnCount - 1) * gap) / columnCount;
  const areaHeight = AREA_TOP - AREA_BOTTOM;
  const axisY = AREA_BOTTOM + areaHeight / 2;
  const stackBoxHeight = Math.min(MAX_BOX_HEIGHT, (areaHeight - (inverterCount - 1) * INVERTER_GAP) / inverterCount);
  const stackHeight = inverterCount * stackBoxHeight + (inverterCount - 1) * INVERTER_GAP;

  const columns: Rect[][] = [];
  for (let c = 0; c < columnCount; c += 1) {
    const x = MARGIN + c * (columnWidth + gap);
    if (c === inverterColumn) {
      const top = axisY + stackHeight / 2;
      columns.push(
        Array.from({ length: inverterCount }, (_, i) => ({
          x,
          y: top - (i + 1) * stackBoxHeight - i * INVERTER_GAP,
          width: columnWidth,
          height: stackBoxHeight,
        })),
      );
    } else {
      columns.push([{ x, y: axisY - MAX_BOX_HEIGHT / 2, width: columnWidth, height: MAX_BOX_HEIGHT }]);
    }
  }
  return { columns, axisY };
}

/**
 * Draws the links between consecutive columns. A single box to a single box is a straight line;
 * a single box to the inverter stack (or back) is a bus: a vertical bar in the gap with one
 * horizontal stub per inverter — the parallel topology.
 */
function drawLinks(page: PDFPage, columns: Rect[][], axisY: number): void {
  for (let c = 0; c + 1 < columns.length; c += 1) {
    const left = columns[c]!;
    const right = columns[c + 1]!;
    const fromX = left[0]!.x + left[0]!.width;
    const toX = right[0]!.x;
    const busX = (fromX + toX) / 2;
    if (left.length === 1 && right.length === 1) {
      hLine(page, fromX, toX, axisY);
      continue;
    }
    const ys = [...left, ...right].map(centerY);
    vLine(page, busX, Math.min(...ys), Math.max(...ys));
    for (const box of left) hLine(page, fromX, busX, centerY(box));
    for (const box of right) hLine(page, busX, toX, centerY(box));
  }
}

function moduleCount(input: DrawingsInput): number {
  return input.inverters.reduce((sum, inv) => sum + inv.mppts.reduce((s, m) => s + m.stringsInParallel * m.modulesPerString, 0), 0);
}

function inverterParagraphs(inv: DrawingsInput['inverters'][number], index: number): string[] {
  const strings = inv.mppts.reduce((s, m) => s + m.stringsInParallel, 0);
  return [`Onduleur ${index + 1}`, inv.inverterLabel, `${frNumber.format(inv.pacW)} W — ${strings} chaîne(s)`];
}

function drawTitle(page: PDFPage, title: string, fonts: Fonts): void {
  drawPdfText(page, title, { x: MARGIN, y: PAGE_HEIGHT - 45, size: 16, font: fonts.bold, color: BLACK });
}

// Spec §3.4 slot order: PV array → DC protections → inverter(s) → AC protections → meter/STEG.
function drawSingleLine(doc: PDFDocument, input: DrawingsInput, fonts: Fonts): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawTitle(page, 'Schéma unifilaire simplifié', fonts);

  const inverterColumn = 2;
  const { columns, axisY } = layoutColumns(5, inverterColumn, input.inverters.length, 30);
  drawLinks(page, columns, axisY);

  drawBoxes(
    page,
    [
      { rect: columns[0]![0]!, paragraphs: ['Champ PV', `${moduleCount(input)} x ${input.moduleLabel}`] },
      { rect: columns[1]![0]!, paragraphs: ['Protections DC', `Interrupteur-sectionneur : ${input.dcSwitchLabel}`, `Parafoudre : ${input.dcSpdLabel}`] },
      { rect: columns[3]![0]!, paragraphs: ['Protections AC', `Disjoncteur : ${input.acBreakerLabel}`, `Parafoudre : ${input.acSpdLabel}`] },
      { rect: columns[4]![0]!, paragraphs: ["Point d'injection STEG", 'Compteur'] },
    ],
    input.inverters.map((inv, i) => ({ rect: columns[inverterColumn]![i]!, paragraphs: inverterParagraphs(inv, i) })),
    fonts,
  );
}

function drawUnifilar(doc: PDFDocument, input: DrawingsInput, fonts: Fonts): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawTitle(page, 'Schéma de câblage détaillé', fonts);

  const inverterColumn = 3;
  const { columns, axisY } = layoutColumns(7, inverterColumn, input.inverters.length, 18);
  drawLinks(page, columns, axisY);

  drawBoxes(
    page,
    [
      { rect: columns[0]![0]!, paragraphs: ['Champ PV', `${moduleCount(input)} x ${input.moduleLabel}`] },
      { rect: columns[1]![0]!, paragraphs: ['Interrupteur-sectionneur DC', input.dcSwitchLabel] },
      { rect: columns[2]![0]!, paragraphs: ['Parafoudre DC', input.dcSpdLabel] },
      { rect: columns[4]![0]!, paragraphs: ['Disjoncteur AC', input.acBreakerLabel] },
      { rect: columns[5]![0]!, paragraphs: ['Parafoudre AC', input.acSpdLabel] },
      { rect: columns[6]![0]!, paragraphs: ['Compteur STEG', "Point d'injection"] },
    ],
    input.inverters.map((inv, i) => ({ rect: columns[inverterColumn]![i]!, paragraphs: inverterParagraphs(inv, i) })),
    fonts,
  );

  const summaryY = AREA_BOTTOM - 40;
  drawPdfText(page, `Liaison DC : ${frNumber.format(input.dcRun.sectionMm2)} mm² — ${frNumber.format(input.dcRun.lengthM)} m`, {
    x: MARGIN, y: summaryY, size: 10, font: fonts.regular, color: BLACK,
  });
  drawPdfText(page, `Liaison AC : ${frNumber.format(input.acRun.sectionMm2)} mm² — ${frNumber.format(input.acRun.lengthM)} m`, {
    x: MARGIN, y: summaryY - 20, size: 10, font: fonts.regular, color: BLACK,
  });
  drawPdfText(page, input.earthingMode === 'BUILDING_EARTH' ? 'Mise à la terre : terre existante du bâtiment' : `Mise à la terre : ${input.earthRodCount} piquet(s)`, {
    x: MARGIN, y: summaryY - 40, size: 10, font: fonts.regular, color: BLACK,
  });
}

export async function renderDrawingPages(rawInput: DrawingsInput): Promise<Buffer> {
  // The engine never accepts a project without an inverter; this only keeps the layout maths
  // safe (no division by zero) if one ever reaches the renderer.
  const input: DrawingsInput =
    rawInput.inverters.length > 0 ? rawInput : { ...rawInput, inverters: [{ inverterLabel: '—', pacW: 0, mppts: [] }] };
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
  };

  drawSingleLine(doc, input, fonts);
  drawUnifilar(doc, input, fonts);

  return Buffer.from(await doc.save());
}
