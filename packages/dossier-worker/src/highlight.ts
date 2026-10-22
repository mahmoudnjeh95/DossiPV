import { BlendMode, PDFDocument, rgb } from 'pdf-lib';
import { applyMatrix, invertMatrix, userToDisplayMatrix } from './page-geometry';
import { extractTextBoxes, findModel, normalizeModel, type TextBox } from './pdf-locate';

/** A rectangle in the page's displayed space (same space as `TextBox`). */
export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Reference practice: amber marker, printed (drawn into the page content, not an annotation). */
const HIGHLIGHT_COLOR = rgb(1, 0.82, 0);
const HIGHLIGHT_OPACITY = 0.4;

/** Vertical margin around the highlighted text, in points. */
const ROW_MARGIN = 2;

/**
 * Draws `rects` on page `pageIndex` as filled amber rectangles (opacity 0.4, Multiply, so the
 * text under them stays black). The rectangles are given in displayed space and mapped back to
 * the page's user space, so a rotated page is highlighted where it is seen.
 */
export async function drawHighlights(pdf: Buffer, pageIndex: number, rects: HighlightRect[]): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(pageIndex);
  const box = page.getCropBox();
  const toUser = invertMatrix(userToDisplayMatrix([box.x, box.y, box.x + box.width, box.y + box.height], page.getRotation().angle));
  for (const rect of rects) {
    const a = applyMatrix(toUser, rect.x, rect.y);
    const b = applyMatrix(toUser, rect.x + rect.width, rect.y + rect.height);
    page.drawRectangle({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
      color: HIGHLIGHT_COLOR,
      opacity: HIGHLIGHT_OPACITY,
      blendMode: BlendMode.Multiply,
      borderWidth: 0,
    });
  }
  return Buffer.from(await doc.save());
}

/** The table row of `hits`: their y-band ±2 pt, across the full width the page's text spans. */
export function rowRect(page: TextBox[], hits: TextBox[]): HighlightRect {
  const items = page.filter((box) => box.text.trim() !== '');
  const left = Math.min(...items.map((box) => box.x));
  const right = Math.max(...items.map((box) => box.x + box.width));
  const bottom = Math.min(...hits.map((box) => box.y)) - ROW_MARGIN;
  const top = Math.max(...hits.map((box) => box.y + box.height)) + ROW_MARGIN;
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

/** Two items share a text line when their baselines are this close (points). */
const LINE_TOLERANCE = 2;

/** Items of one cell follow each other with gaps up to this many font sizes. */
const MAX_CELL_GAP_FONT_SIZES = 1.5;

/** A model header printed on two lines: the second baseline at most this many font sizes lower. */
const MAX_STACKED_LINE_FONT_SIZES = 1.6;

function isBlank(box: TextBox): boolean {
  return box.text.trim() === '';
}

function centreX(box: TextBox): number {
  return box.x + box.width / 2;
}

function onLineOf(box: TextBox, line: TextBox[]): boolean {
  return line.some((other) => Math.abs(other.y - box.y) <= LINE_TOLERANCE);
}

/** One item's own highlight: its text box with the row margin around it. */
function boxRect(box: TextBox): HighlightRect {
  return { x: box.x - 1, y: box.y - ROW_MARGIN, width: box.width + 2, height: box.height + 2 * ROW_MARGIN };
}

interface Band {
  left: number;
  right: number;
}

/**
 * The column under `header`: its x-range widened on each side by half the gap to the nearest
 * other item of the header line(s). An edge column, with a neighbour on one side only, is
 * widened by the same amount on its open side.
 */
function columnBand(page: TextBox[], header: TextBox[]): Band {
  const left = Math.min(...header.map((box) => box.x));
  const right = Math.max(...header.map((box) => box.x + box.width));
  const middle = (left + right) / 2;
  let leftGap: number | null = null;
  let rightGap: number | null = null;
  for (const box of page) {
    if (header.includes(box) || isBlank(box) || !onLineOf(box, header)) continue;
    if (centreX(box) < middle) {
      const gap = Math.max(0, left - (box.x + box.width));
      leftGap = leftGap === null ? gap : Math.min(leftGap, gap);
    } else {
      const gap = Math.max(0, box.x - right);
      rightGap = rightGap === null ? gap : Math.min(rightGap, gap);
    }
  }
  leftGap ??= rightGap ?? 0;
  rightGap ??= leftGap;
  return { left: left - leftGap / 2, right: right + rightGap / 2 };
}

function inBand(box: TextBox, band: Band): boolean {
  const x = centreX(box);
  return x >= band.left && x <= band.right;
}

/** The header and every non-blank item below it whose centre lies in the header's column band. */
function columnItems(page: TextBox[], header: TextBox[]): TextBox[] {
  const band = columnBand(page, header);
  const top = Math.min(...header.map((box) => box.y));
  return page.filter(
    (box) => header.includes(box) || (!isBlank(box) && !onLineOf(box, header) && box.y < top && inBand(box, band)),
  );
}

/**
 * One rectangle per text item of the column headed by `header` (the header's own items included):
 * the items below the header whose horizontal centre lies in the header's x-range, widened on
 * each side by half the gap to the nearest other item of the header line. Other items of the
 * header line are left out.
 */
export function columnRects(page: TextBox[], header: TextBox[]): HighlightRect[] {
  return columnItems(page, header).map(boxRect);
}

/** Splits `items` into runs on one baseline, each item right after the previous one. */
function lineRuns(items: TextBox[]): TextBox[][] {
  const runs: TextBox[][] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const box of sorted) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    const continues =
      last !== undefined &&
      Math.abs(last.y - box.y) <= LINE_TOLERANCE &&
      box.x - (last.x + last.width) <= MAX_CELL_GAP_FONT_SIZES * Math.max(last.height, box.height, 1);
    if (run && continues) run.push(box);
    else runs.push([box]);
  }
  return runs;
}

/**
 * The places `model` is printed on `page`, each as the item(s) to use as a column header: the
 * hits of `findModel` (split into runs on one line), else a model printed on two stacked lines
 * (`SUN-2.2K-G04` over `P1-EU-AM1`, as DEYE's tables do).
 */
function modelHeaders(page: TextBox[], model: string): TextBox[][] {
  const hits = findModel(page, model);
  if (hits.length > 0) return lineRuns(hits);

  const target = normalizeModel(model);
  for (const upper of page) {
    const head = normalizeModel(upper.text);
    if (head === '' || head === target || !target.startsWith(head)) continue;
    for (const lower of page) {
      const drop = upper.y - lower.y;
      const overlaps = lower.x < upper.x + upper.width && upper.x < lower.x + lower.width;
      const stacked = drop > LINE_TOLERANCE && drop <= MAX_STACKED_LINE_FONT_SIZES * Math.max(upper.height, lower.height);
      if (lower !== upper && stacked && overlaps && head + normalizeModel(lower.text) === target) return [[upper, lower]];
    }
  }
  return [];
}

/**
 * Other models' headers next to `header`: header-line items that read like a model reference
 * (letters and digits, at least four characters once normalized), so « Model », « Type » or
 * « Hybrid Inverter » beside a title are not taken for another model.
 */
function siblingHeaders(page: TextBox[], header: TextBox[]): TextBox[] {
  return page.filter((box) => {
    if (header.includes(box) || !onLineOf(box, header)) return false;
    const text = normalizeModel(box.text);
    return text.length >= 4 && /[A-Z]/.test(text) && /\d/.test(text);
  });
}

/**
 * The cells a merged table cell shares with the model's column: on each line of the table that
 * has nothing in the column, the run of items nearest to the column (a value printed once,
 * centred across several models). Only items lying wholly inside the table's model columns count.
 */
function mergedCells(page: TextBox[], header: TextBox[], siblings: TextBox[], column: TextBox[]): TextBox[] {
  const band = columnBand(page, header);
  const bands = [band, ...siblings.map((sibling) => columnBand(page, [sibling]))];
  const tableLeft = Math.min(...bands.map((b) => b.left));
  const tableRight = Math.max(...bands.map((b) => b.right));
  const top = Math.min(...header.map((box) => box.y));
  const middle = (band.left + band.right) / 2;
  const candidates = page.filter(
    (box) =>
      !isBlank(box) &&
      !column.includes(box) &&
      !onLineOf(box, header) &&
      !onLineOf(box, column) &&
      box.y < top &&
      box.x >= tableLeft - 1 &&
      box.x + box.width <= tableRight + 1,
  );
  const runCentre = (run: TextBox[]): number => (run[0]!.x + run[run.length - 1]!.x + run[run.length - 1]!.width) / 2;
  // A merged cell's text is centred on the cell, so the cell reaches the column only when the
  // column is no further from the text's centre than the table's edge on that side.
  const spansColumn = (run: TextBox[]): boolean => {
    const centre = runCentre(run);
    return Math.abs(centre - middle) <= Math.min(centre - tableLeft, tableRight - centre) + LINE_TOLERANCE;
  };
  const lines: TextBox[][] = [];
  for (const box of candidates) {
    const line = lines.find((l) => Math.abs(l[0]!.y - box.y) <= LINE_TOLERANCE);
    if (line) line.push(box);
    else lines.push([box]);
  }
  return lines.flatMap((line) => {
    const runs = lineRuns(line).filter(spansColumn);
    if (runs.length === 0) return [];
    return runs.reduce((best, run) => (Math.abs(runCentre(run) - middle) < Math.abs(runCentre(best) - middle) ? run : best));
  });
}

/**
 * Labels of the inverter values the dossier uses: Vdc max, MPPT range, Idc max, Isc max, Pac,
 * Iac max. Qualifiers such as « PV », « AC », « Operating », « Active » may sit between the words
 * (DEYE: « Max. PV Input Voltage », « Rated AC Output Active Power »); a « Short Circuit
 * Protection » row is not a current.
 */
const USED_INVERTER_ROW =
  /max\.? *((dc|pv|operating) *)*(dc|input).*voltage|mppt.*range|max\.? *((dc|pv|operating) *)*input.*current|short.?circuit.*current|rated *((ac|output|active) *)*power|max\.? *(ac *)?output current/i;

/**
 * The inverter datasheet with the chosen model's values highlighted, as the reference dossier
 * does. On a table with one column per model, the model's column (and the merged cells it
 * shares with the other models); on a sheet for this model alone, the rows of the values the
 * dossier uses, on the page(s) naming the model only. `highlighted: false`, with the PDF
 * unchanged, when the datasheet has no text layer or does not name the model.
 */
export async function highlightInverterDatasheet(pdf: Buffer, model: string): Promise<{ pdf: Buffer; highlighted: boolean }> {
  const pages = await extractTextBoxes(pdf);
  const namingPages = new Set<number>();
  for (const [index, page] of pages.entries()) {
    for (const header of modelHeaders(page, model)) {
      namingPages.add(index);
      const siblings = siblingHeaders(page, header);
      if (siblings.length === 0) continue;
      const column = columnItems(page, header);
      const cells = [...column, ...mergedCells(page, header, siblings, column)];
      return { pdf: await drawHighlights(pdf, index, cells.map(boxRect)), highlighted: true };
    }
  }

  // One model per sheet: no column to follow, the used rows of the pages naming the model.
  let out = pdf;
  let highlighted = false;
  for (const index of namingPages) {
    const page = pages[index]!;
    const labels = page.filter((box) => USED_INVERTER_ROW.test(box.text));
    if (labels.length === 0) continue;
    out = await drawHighlights(out, index, labels.map((label) => rowRect(page, [label])));
    highlighted = true;
  }
  return { pdf: out, highlighted };
}

/** A plain number printed with a comma or a dot (optionally followed by a watt unit when `watts`). */
function printedNumber(text: string, watts: boolean): number | null {
  const match = (watts ? /^(\d+(?:[.,]\d+)?) *(?:w|wc|wp)?$/i : /^(\d+(?:[.,]\d+)?)$/).exec(text.trim());
  return match ? Number(match[1]!.replace(',', '.')) : null;
}

function sameValue(printed: number | null, value: number): boolean {
  return printed !== null && Math.abs(printed - value) < 1e-6;
}

/** Row labels of the module's five values, as STC tables word them. */
const MODULE_LABELS = {
  pmax: /max(imum)?\.? *power|p *max|p *mpp|(nominal|rated|peak) *power|power *output/i,
  voc: /open.?circuit|\bv *oc\b/i,
  isc: /short.?circuit|\bi *sc\b/i,
  vmp: /(max(imum)?|optimum|operating|rated)\.?.*voltage|\bv *mpp?\b/i,
  imp: /(max(imum)?|optimum|operating|rated)\.?.*current|\bi *mpp?\b/i,
};

/** The text left of `box` on its line (the row's label, subscripts included). */
function rowLabel(page: TextBox[], box: TextBox): string {
  return page
    .filter((other) => other !== box && Math.abs(other.y - box.y) <= LINE_TOLERANCE && other.x + other.width <= box.x + 1 && /[a-z]/i.test(other.text))
    .sort((a, b) => a.x - b.x)
    .map((other) => other.text)
    .join(' ');
}

/**
 * The module datasheet with the module's Pmax, Voc, Isc, Vmp and Imp highlighted in its column:
 * the column headed by the model, or by its power (`450 W`, `450Wc`, or a bare `450` on the
 * Pmax row) when the table lists power classes. An item is marked only when it prints one of
 * those values (with a comma or a dot) on a row labelled with that quantity, so a 50 in a
 * dimension row is not taken for a Voc of 50 V. `highlighted: false`, with the PDF unchanged,
 * when no column holds at least two of them.
 */
export async function highlightModuleDatasheet(
  pdf: Buffer,
  module: { model: string; pmaxW: number; vocV: number; iscA: number; vmpV: number; impA: number },
): Promise<{ pdf: Buffer; highlighted: boolean }> {
  const quantities: { value: number; label: RegExp; watts: boolean }[] = [
    { value: module.pmaxW, label: MODULE_LABELS.pmax, watts: true },
    { value: module.vocV, label: MODULE_LABELS.voc, watts: false },
    { value: module.iscA, label: MODULE_LABELS.isc, watts: false },
    { value: module.vmpV, label: MODULE_LABELS.vmp, watts: false },
    { value: module.impA, label: MODULE_LABELS.imp, watts: false },
  ];
  const pages = await extractTextBoxes(pdf);
  let best: { index: number; items: TextBox[] } | null = null;
  for (const [index, page] of pages.entries()) {
    const isUsedValue = (box: TextBox): boolean =>
      quantities.some(({ value, label, watts }) => sameValue(printedNumber(box.text, watts), value) && label.test(rowLabel(page, box)));
    const isPowerHeader = (box: TextBox): boolean =>
      sameValue(printedNumber(box.text, true), module.pmaxW) && (/\d *(w|wc|wp)$/i.test(box.text.trim()) || MODULE_LABELS.pmax.test(rowLabel(page, box)));
    const powerHeaders = page.filter(isPowerHeader).map((box) => [box]);
    for (const header of [...modelHeaders(page, module.model), ...powerHeaders]) {
      const items = columnItems(page, header).filter(isUsedValue);
      if (items.length >= 2 && (best === null || items.length > best.items.length)) best = { index, items };
    }
  }
  if (best === null) return { pdf, highlighted: false };
  return { pdf: await drawHighlights(pdf, best.index, best.items.map(boxRect)), highlighted: true };
}
