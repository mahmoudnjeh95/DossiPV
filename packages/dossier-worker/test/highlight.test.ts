import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { drawHighlights, rowRect } from '../src/highlight';
import type { TextBox } from '../src/pdf-locate';
import { extractPdfContent } from './helpers/pdf-content';

const AMBER = [1, 0.82, 0];

async function blankPdf(size: [number, number], rotation = 0): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage(size).setRotation(degrees(rotation));
  doc.addPage(size);
  return Buffer.from(await doc.save());
}

function bounds(points: { x: number; y: number }[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('rowRect', () => {
  it('spans the page items horizontally and the hits ±2 pt vertically', () => {
    const page: TextBox[] = [
      { text: 'Marque', x: 60, y: 780, width: 40, height: 10 },
      { text: 'DEYE', x: 60, y: 600, width: 30, height: 10 },
      { text: 'SUN', x: 160, y: 600, width: 50, height: 10 },
      { text: '31/12/2028', x: 460, y: 600, width: 50, height: 10 },
    ];
    expect(rowRect(page, [page[2]!])).toEqual({ x: 60, y: 598, width: 450, height: 14 });
  });
});

describe('drawHighlights', () => {
  it('draws filled amber rectangles on the given page only', async () => {
    const out = await drawHighlights(await blankPdf([595, 842]), 1, [{ x: 50, y: 100, width: 200, height: 14 }]);
    const pages = await extractPdfContent(out);
    expect(pages[0]!.paths).toHaveLength(0);
    const amber = pages[1]!.paths.filter((p) => JSON.stringify(p.fill) === JSON.stringify(AMBER));
    expect(amber).toHaveLength(1);
    expect(bounds(amber[0]!.points)).toEqual({ minX: 50, maxX: 250, minY: 100, maxY: 114 });
  });

  it('uses opacity 0.4 and the Multiply blend mode', async () => {
    const out = await drawHighlights(await blankPdf([595, 842]), 0, [{ x: 0, y: 0, width: 10, height: 10 }]);
    const doc = await PDFDocument.load(out);
    const states = doc.getPage(0).node.Resources()!.toString();
    expect(states).toMatch(/\/ca 0\.4/);
    expect(states).toMatch(/\/BM \/Multiply/);
  });

  it('maps a displayed rectangle back to user space on a rotated page', async () => {
    // 400 × 600 user page shown at /Rotate 90 as 600 × 400: displayed (X, Y) is user (400 − Y, X).
    const out = await drawHighlights(await blankPdf([400, 600], 90), 0, [{ x: 50, y: 290, width: 200, height: 14 }]);
    const amber = (await extractPdfContent(out))[0]!.paths.filter((p) => JSON.stringify(p.fill) === JSON.stringify(AMBER));
    const b = bounds(amber[0]!.points);
    expect(b.minX).toBeCloseTo(96, 5);
    expect(b.maxX).toBeCloseTo(110, 5);
    expect(b.minY).toBeCloseTo(50, 5);
    expect(b.maxY).toBeCloseTo(250, 5);
  });
});
