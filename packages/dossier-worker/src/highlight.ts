import { BlendMode, PDFDocument, rgb } from 'pdf-lib';
import { applyMatrix, invertMatrix, userToDisplayMatrix } from './page-geometry';
import type { TextBox } from './pdf-locate';

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
