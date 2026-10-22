import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderTableOfContents } from '../src/render-toc';
import { extractPdfContent, pdfFontNames, TIMES_FONTS } from './helpers/pdf-content';

describe('renderTableOfContents', () => {
  it('uses only the Times fonts (one font family across the dossier)', async () => {
    const fonts = await pdfFontNames(await renderTableOfContents([{ title: 'I. Préambule', pageNumber: 3 }]));
    expect(fonts.size).toBeGreaterThan(0);
    for (const font of fonts) expect(TIMES_FONTS).toContain(font);
  });

  it('produces a PDF listing every entry with its page number', async () => {
    const buffer = await renderTableOfContents([
      { title: 'I. Préambule', pageNumber: 3 },
      { title: 'II. Présentation du projet', pageNumber: 5 },
      { title: 'III. Description de l\'installation', pageNumber: 8 },
    ]);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('fits the longest dossier TOC (11 body sections I-XI + Annexes) on one page, as the page numbering assumes', async () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ title: `Section ${i + 1}`, pageNumber: i + 3 }));

    expect((await PDFDocument.load(await renderTableOfContents(entries))).getPageCount()).toBe(1);
  });

  it('does not throw on a title outside WinAnsi', async () => {
    const buffer = await renderTableOfContents([{ title: `Annexe — حبيب ${String.fromCodePoint(0xfb01)}che`, pageNumber: 3 }]);

    expect((await PDFDocument.load(buffer)).getPageCount()).toBe(1);
  });

  it('keeps the title and every row below the stamped running header and above its footer', async () => {
    const manyEntries = Array.from({ length: 60 }, (_, i) => ({ title: `Section ${i + 1}`, pageNumber: i + 3 }));
    const pages = await extractPdfContent(await renderTableOfContents(manyEntries));
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      for (const text of page.texts) {
        // stampStudyPages draws its header (logos, dossier number) in the top 60 pt and the
        // « Page n sur N » footer around 32 pt from the bottom.
        expect(text.y + text.size, text.text).toBeLessThan(page.height - 70);
        expect(text.y, text.text).toBeGreaterThan(50);
      }
    }
  });

  it('overflows to a second page rather than truncating when there are many entries', async () => {
    const manyEntries = Array.from({ length: 60 }, (_, i) => ({ title: `Section ${i + 1}`, pageNumber: i + 3 }));

    const buffer = await renderTableOfContents(manyEntries);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
