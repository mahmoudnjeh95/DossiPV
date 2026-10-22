import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { multiplyMatrix, userToDisplayMatrix, type Matrix } from './page-geometry';

/**
 * One text item of a page, in the page's space as displayed (its /Rotate applied, origin at the
 * displayed bottom-left corner, y up): `x, y` is the start of the baseline, `height` the font
 * size, `width` the advance along the baseline.
 */
export interface TextBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Text boxes of every page of `pdf`, one array per page, in content-stream order. */
export async function extractTextBoxes(pdf: Buffer): Promise<TextBox[][]> {
  // pdfjs takes ownership of (and detaches) the array it is given: hand it a copy.
  const task = getDocument({ data: new Uint8Array(pdf), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: TextBox[][] = [];
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const display = userToDisplayMatrix(page.view as [number, number, number, number], page.rotate);
      const content = await page.getTextContent();
      const boxes: TextBox[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const m = multiplyMatrix(item.transform as Matrix, display);
        boxes.push({ text: item.str, x: m[4], y: m[5], width: item.width, height: Math.hypot(m[2], m[3]) });
      }
      pages.push(boxes);
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** Upper-case, without spaces, '-', '_', '.', '/': how list and datasheet models are compared. */
export function normalizeModel(text: string): string {
  return text.toUpperCase().replace(/[\s\-_./]/g, '');
}

const BASELINE_TOLERANCE = 2;

/** A following item continues the same cell when it starts no further than this (× font size) after the previous one ends. */
const MAX_GAP_FONT_SIZES = 1.5;

/**
 * The item(s) holding `model`: an item whose normalized text contains it, or a run of items on
 * the same baseline (|Δy| ≤ 2), each starting right after the previous one, whose joined
 * normalized text contains it (a model drawn as two text runs, or a split cell). Exact matches
 * win over longer texts that merely contain the model. [] when absent.
 */
export function findModel(page: TextBox[], model: string): TextBox[] {
  const target = normalizeModel(model);
  if (target === '') return [];
  const exact: TextBox[] = [];
  const partial: TextBox[] = [];

  let i = 0;
  while (i < page.length) {
    const first = page[i]!;
    if (normalizeModel(first.text) === '') {
      i += 1;
      continue;
    }
    const run: TextBox[] = [first];
    let joined = normalizeModel(first.text);
    let j = i + 1;
    while (!joined.includes(target) && j < page.length) {
      const next = page[j]!;
      const previous = run[run.length - 1]!;
      const gap = next.x - (previous.x + previous.width);
      const maxGap = MAX_GAP_FONT_SIZES * Math.max(previous.height, next.height, 1);
      if (Math.abs(next.y - first.y) > BASELINE_TOLERANCE || gap > maxGap || next.x < previous.x - BASELINE_TOLERANCE) break;
      run.push(next);
      joined += normalizeModel(next.text);
      j += 1;
    }
    if (!joined.includes(target)) {
      i += 1;
      continue;
    }
    // Drop leading items the match does not need (a brand cell right before the model).
    while (run.length > 1 && run.slice(1).map((b) => normalizeModel(b.text)).join('').includes(target)) run.shift();
    const hits = run.filter((b) => normalizeModel(b.text) !== '');
    (hits.map((b) => normalizeModel(b.text)).join('') === target ? exact : partial).push(...hits);
    i = j;
  }
  return exact.length > 0 ? exact : partial;
}
