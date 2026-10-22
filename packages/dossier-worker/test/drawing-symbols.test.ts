import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { SYMBOLS, drawSymbol, type SymbolKind } from '../src/drawing-symbols';

const kinds = Object.keys(SYMBOLS) as SymbolKind[];

describe('SYMBOLS', () => {
  it.each(kinds)('%s has anchors inside its box', (kind) => {
    const { width, height, anchors } = SYMBOLS[kind];
    for (const point of Object.values(anchors)) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(height);
    }
  });

  it('gives the shunt devices an earth anchor', () => {
    expect(SYMBOLS.spd.anchors.earth).toBeDefined();
    expect(SYMBOLS.earth.anchors.earth).toBeDefined();
  });
});

describe('drawSymbol', () => {
  it('returns the anchors translated to page space, y up', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const anchors = drawSymbol(page, 'spd', { x: 100, y: 150 });
    expect(anchors.in).toEqual({ x: 100 + SYMBOLS.spd.anchors.in.x, y: 150 - SYMBOLS.spd.anchors.in.y });
    expect(anchors.earth).toEqual({ x: 100 + SYMBOLS.spd.anchors.earth!.x, y: 150 - SYMBOLS.spd.anchors.earth!.y });
  });

  it('scales the anchors with the symbol', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const anchors = drawSymbol(page, 'fuse', { x: 10, y: 100 }, { scale: 0.5 });
    expect(anchors.out).toEqual({ x: 10 + SYMBOLS.fuse.anchors.out.x * 0.5, y: 100 - SYMBOLS.fuse.anchors.out.y * 0.5 });
  });
});
