import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PNG } from 'pngjs';
import { stampStudyPages, type StampStudyPagesOptions } from '../src/stamp-study-pages';
import { applyDraftWatermark, DRAFT_INSERTED_PAGE_COUNT } from '../src/draft-watermark';
import { extractPdfContent, findText, pageText, type PageContent } from './helpers/pdf-content';

const A4: [number, number] = [595.28, 841.89];

function png(width: number, height: number): Buffer {
  const image = new PNG({ width, height });
  image.data.fill(180);
  return PNG.sync.write(image);
}

/** A synthetic PDF whose page i carries the text `MARQUE PAGE i`. */
async function labelledPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (let i = 1; i <= pageCount; i += 1) {
    doc.addPage(A4).drawText(`MARQUE PAGE ${i}`, { x: 80, y: 600, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

const STEG_LOGO = png(120, 40); // fits 60 × 30 as 60 × 20
const INSTALLER_LOGO = png(40, 40); // fits 60 × 30 as 30 × 30

const baseOptions: StampStudyPagesOptions = {
  studyPageCount: 3,
  logo: null,
  stegLogo: STEG_LOGO,
  installerName: 'SolarPro Tunisie',
  dossierNumber: '434 - 303',
};

/** The closed, stroked rectangles inset `inset` pt from every edge of the page. */
function frameAt(page: PageContent, inset: number): boolean {
  return page.paths.some((path) => {
    if (!path.closed || !path.stroke || path.points.length !== 4) return false;
    const xs = path.points.map((p) => p.x);
    const ys = path.points.map((p) => p.y);
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
    return near(Math.min(...xs), inset) && near(Math.max(...xs), page.width - inset) && near(Math.min(...ys), inset) && near(Math.max(...ys), page.height - inset);
  });
}

describe('stampStudyPages', () => {
  it('numbers pages 2..studyPageCount « Page n sur N » and leaves the later pages unchanged', async () => {
    const original = await labelledPdf(5);
    const before = await extractPdfContent(original);
    const pages = await extractPdfContent(await stampStudyPages(original, baseOptions));

    expect(pages).toHaveLength(5);
    expect(pageText(pages[0]!)).not.toContain('Page ');
    expect(pageText(pages[1]!)).toContain('Page 2 sur 3');
    expect(pageText(pages[2]!)).toContain('Page 3 sur 3');
    expect(pages[3]).toEqual(before[3]);
    expect(pages[4]).toEqual(before[4]);
    // The original content is kept under the stamp.
    for (let i = 0; i < 3; i += 1) expect(pageText(pages[i]!)).toContain(`MARQUE PAGE ${i + 1}`);
  });

  it('right-aligns the footer inside the frame, at the bottom of the page', async () => {
    const pages = await extractPdfContent(await stampStudyPages(await labelledPdf(3), baseOptions));
    const footer = findText(pages[1]!, 'Page 2 sur 3')!;
    expect(footer.y).toBeGreaterThan(24);
    expect(footer.y).toBeLessThan(50);
    expect(footer.x).toBeGreaterThan(A4[0] / 2);
    expect(footer.x).toBeLessThan(A4[0] - 24);
  });

  it('draws the double frame (20 pt and 24 pt insets) on pages 1..studyPageCount only', async () => {
    const pages = await extractPdfContent(await stampStudyPages(await labelledPdf(5), baseOptions));
    for (const page of pages.slice(0, 3)) {
      expect(frameAt(page, 20)).toBe(true);
      expect(frameAt(page, 24)).toBe(true);
    }
    for (const page of pages.slice(3)) expect(frameAt(page, 20)).toBe(false);
  });

  it('puts the STEG logo top-right with « Dossier n° … » to its left on pages 2..N, and no second STEG logo on the cover', async () => {
    const pages = await extractPdfContent(await stampStudyPages(await labelledPdf(5), baseOptions));

    expect(pages[0]!.images).toHaveLength(0);
    expect(pageText(pages[0]!)).not.toContain('Dossier n°');
    for (const page of pages.slice(1, 3)) {
      expect(page.images).toHaveLength(1);
      const steg = page.images[0]!;
      expect(steg.width).toBeCloseTo(60, 1);
      expect(steg.height).toBeCloseTo(20, 1);
      expect(steg.x + steg.width).toBeGreaterThan(A4[0] - 40);
      expect(steg.x + steg.width).toBeLessThan(A4[0] - 24);
      expect(steg.y + steg.height).toBeGreaterThan(A4[1] - 40);
      expect(steg.y + steg.height).toBeLessThan(A4[1] - 24);

      const number = findText(page, 'Dossier n° 434 - 303')!;
      expect(number).toBeDefined();
      expect(number.x).toBeLessThan(steg.x);
      expect(number.y).toBeGreaterThan(A4[1] - 70);
      // No installer logo: the installer's name stands top-left.
      const name = findText(page, 'SolarPro Tunisie')!;
      expect(name.x).toBeLessThan(60);
      expect(Math.abs(name.y - number.y)).toBeLessThan(1);
    }
    for (const page of pages.slice(3)) expect(page.images).toHaveLength(0);
  });

  it('draws the installer logo (max 60 × 30 pt) top-left instead of the name', async () => {
    const pages = await extractPdfContent(await stampStudyPages(await labelledPdf(3), { ...baseOptions, logo: INSTALLER_LOGO }));
    const page = pages[1]!;
    expect(page.images).toHaveLength(2);
    const installerLogo = page.images.find((image) => image.x < A4[0] / 2)!;
    expect(installerLogo.width).toBeCloseTo(30, 1);
    expect(installerLogo.height).toBeCloseTo(30, 1);
    expect(installerLogo.x).toBeGreaterThan(24);
    expect(installerLogo.y + installerLogo.height).toBeLessThan(A4[1] - 24);
    expect(pageText(page)).not.toContain('SolarPro Tunisie');
    expect(pages[0]!.images).toHaveLength(0);
  });

  it('keeps the number at the right edge when the STEG logo is not supplied, and prints no number when there is none', async () => {
    const withoutSteg = await extractPdfContent(await stampStudyPages(await labelledPdf(3), { ...baseOptions, stegLogo: null }));
    expect(withoutSteg[1]!.images).toHaveLength(0);
    const number = findText(withoutSteg[1]!, 'Dossier n° 434 - 303')!;
    expect(number.x).toBeGreaterThan(A4[0] / 2);

    const withoutNumber = await extractPdfContent(await stampStudyPages(await labelledPdf(3), { ...baseOptions, dossierNumber: null }));
    expect(pageText(withoutNumber[1]!)).not.toContain('Dossier n°');
    expect(pageText(withoutNumber[1]!)).toContain('Page 2 sur 3');
  });

  it('uses only the Times fonts', async () => {
    const doc = await PDFDocument.load(await stampStudyPages(await labelledPdf(3), baseOptions));
    const fonts = doc.context
      .enumerateIndirectObjects()
      .map(([, object]) => object.toString())
      .filter((text) => text.includes('/Type /Font'))
      .map((text) => /\/BaseFont \/(\S+)/.exec(text)?.[1]);
    expect(new Set(fonts)).toEqual(new Set(['Times-Roman', 'Times-Bold']));
  });

  describe('footer numbering against the TOC', () => {
    // The TOC numbers physical pages of the final dossier.pdf: cover 1, TOC 2, body 3.. — and in
    // a draft every number moves by the missing-pieces page the watermark inserts after the cover.
    const studyPageCount = 5; // cover + TOC + 3 body pages

    it('prints, on every numbered study page of a complete dossier, its own physical page number', async () => {
      const pages = await extractPdfContent(await stampStudyPages(await labelledPdf(7), { ...baseOptions, studyPageCount }));
      for (let physical = 2; physical <= studyPageCount; physical += 1) {
        expect(pageText(pages[physical - 1]!)).toContain(`Page ${physical} sur ${studyPageCount}`);
      }
    });

    it('still prints the physical page number once the draft watermark has inserted its page after the cover', async () => {
      const stamped = await stampStudyPages(await labelledPdf(7), { ...baseOptions, studyPageCount, pagesInsertedAfterCover: DRAFT_INSERTED_PAGE_COUNT });
      const pages = await extractPdfContent(await applyDraftWatermark(stamped, ['Copie de la CIN du titulaire']));
      const total = studyPageCount + DRAFT_INSERTED_PAGE_COUNT;

      expect(pages).toHaveLength(8);
      expect(pageText(pages[1]!)).toContain('Pièces manquantes');
      // Body page 1 (pre-watermark page 3) is the TOC's first body page: 3 + 1 = 4.
      expect(pageText(pages[3]!)).toContain('MARQUE PAGE 3');
      for (let physical = 3; physical <= total; physical += 1) {
        expect(pageText(pages[physical - 1]!)).toContain(`Page ${physical} sur ${total}`);
      }
      // The annexes after the study stay unnumbered.
      for (const page of pages.slice(total)) expect(pageText(page)).not.toMatch(/Page \d+ sur/);
    });
  });
});
