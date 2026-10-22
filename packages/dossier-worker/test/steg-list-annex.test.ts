import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildListPageAnnex } from '../src/steg-list-annex';
import { extractPdfContent } from './helpers/pdf-content';
import { syntheticListPdf, TARGET_MODEL, TARGET_ROW_Y } from './helpers/synthetic-list';

const AMBER = [1, 0.82, 0];

describe('buildListPageAnnex', () => {
  it('returns page 2 with one amber rectangle over the row', async () => {
    const result = await buildListPageAnnex(await syntheticListPdf(), 'SUN 2.2K G04P1 EU AM1');

    expect(result).not.toBeNull();
    expect(result!.pageNumber).toBe(2);
    expect((await PDFDocument.load(result!.page)).getPageCount()).toBe(1);

    const [page] = await extractPdfContent(result!.page);
    const model = page!.texts.find((t) => t.text === TARGET_MODEL)!;
    expect(model.y).toBeCloseTo(TARGET_ROW_Y, 1);
    const amber = page!.paths.filter((p) => p.fill !== null && JSON.stringify(p.fill) === JSON.stringify(AMBER));
    expect(amber).toHaveLength(1);
    const ys = amber[0]!.points.map((p) => p.y);
    const xs = amber[0]!.points.map((p) => p.x);
    expect(Math.min(...ys)).toBeLessThanOrEqual(model.y);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(model.y + model.size);
    // Only this row: the rows above and below (25 pt away) stay outside the band.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(25);
    // Across the whole row, brand to validity date.
    expect(Math.min(...xs)).toBeLessThanOrEqual(60);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(500);
  });

  it('highlights a model split across two text items', async () => {
    const result = await buildListPageAnnex(await syntheticListPdf({ splitTarget: true }), TARGET_MODEL);
    expect(result?.pageNumber).toBe(2);
    const [page] = await extractPdfContent(result!.page);
    expect(page!.paths.filter((p) => JSON.stringify(p.fill) === JSON.stringify(AMBER))).toHaveLength(1);
  });

  it('returns null when the model is absent', async () => {
    expect(await buildListPageAnnex(await syntheticListPdf({ withTarget: false }), TARGET_MODEL)).toBeNull();
  });
});
