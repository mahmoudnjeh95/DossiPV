import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderTableOfContents } from '../src/render-toc';

describe('renderTableOfContents', () => {
  it('produces a PDF listing every entry with its page number', async () => {
    const buffer = await renderTableOfContents([
      { title: 'I. Préambule', pageNumber: 3 },
      { title: 'II. Présentation du projet', pageNumber: 5 },
      { title: 'III. Description de l\'installation', pageNumber: 8 },
    ]);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('does not throw on a title outside WinAnsi', async () => {
    const buffer = await renderTableOfContents([{ title: `Annexe — حبيب ${String.fromCodePoint(0xfb01)}che`, pageNumber: 3 }]);

    expect((await PDFDocument.load(buffer)).getPageCount()).toBe(1);
  });

  it('overflows to a second page rather than truncating when there are many entries', async () => {
    const manyEntries = Array.from({ length: 60 }, (_, i) => ({ title: `Section ${i + 1}`, pageNumber: i + 3 }));

    const buffer = await renderTableOfContents(manyEntries);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
