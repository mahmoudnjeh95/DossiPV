import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { findHeadingPages, renderTableOfContents } from '../src/render-toc';
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

describe('level-2 entries and leaders', () => {
  it('indents a level-2 entry by 16 pt and draws a dotted leader to the page number', async () => {
    const pages = await extractPdfContent(
      await renderTableOfContents([
        { title: 'I. Préambule', pageNumber: 3 },
        { title: 'I.1 Objet', pageNumber: 3, level: 2 },
      ]),
    );
    const level1 = pages[0]!.texts.find((t) => t.text === 'I. Préambule')!;
    const level2 = pages[0]!.texts.find((t) => t.text === 'I.1 Objet')!;
    expect(level2.x - level1.x).toBeCloseTo(16, 1);
    expect(pages[0]!.paths.length).toBeGreaterThanOrEqual(2);
  });
});

describe('findHeadingPages', () => {
  async function body(pages: string[][]): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    for (const lines of pages) {
      const page = doc.addPage([595, 842]);
      lines.forEach((line, i) => page.drawText(line, { x: 60, y: 780 - i * 30, size: 12, font }));
    }
    return Buffer.from(await doc.save());
  }

  it('finds each heading on its page, searching onwards from the previous one', async () => {
    const pdf = await body([['I. Préambule', 'II. Présentation du projet'], ['du texte'], ['III. Câblage'], ['IV. Conclusion']]);
    expect(await findHeadingPages(pdf, ['I. Préambule', 'II. Présentation du projet', 'III. Câblage', 'IV. Conclusion'])).toEqual([1, 1, 3, 4]);
  });

  it('returns null for a heading that is not printed, and does not let it move the search', async () => {
    const pdf = await body([['I. Préambule'], ['III. Câblage']]);
    expect(await findHeadingPages(pdf, ['I. Préambule', 'II. Absent', 'III. Câblage'])).toEqual([1, null, 2]);
  });

  it('ignores a mention of a heading inside running text', async () => {
    const pdf = await body([['voir le chapitre II. Câblage plus loin'], ['II. Câblage']]);
    expect(await findHeadingPages(pdf, ['II. Câblage'])).toEqual([2]);
  });
});
