import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { applyDraftWatermark, DRAFT_WATERMARK_LINES, DRAFT_WATERMARK_TEXT, MISSING_PIECES_TITLE } from '../src/draft-watermark';
import { extractPdfContent, findText, pageText, rawPageStreams } from './helpers/pdf-content';

/** A synthetic dossier: page 1 the cover, page 2 the body. */
async function twoPageDossier(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of ['Page de garde', 'Corps du dossier']) {
    doc.addPage([595.28, 841.89]).drawText(text, { x: 60, y: 760, size: 14, font });
  }
  return Buffer.from(await doc.save());
}

describe('applyDraftWatermark', () => {
  it('inserts the missing-pieces page after the cover and marks every page as a draft', async () => {
    const out = await applyDraftWatermark(await twoPageDossier(), ['Copie de la CIN du titulaire', 'Autorisation du syndic ou des copropriétaires']);

    const pages = await extractPdfContent(out);
    expect(pages).toHaveLength(3);
    expect(findText(pages[0]!, 'Page de garde')).toBeDefined();
    expect(findText(pages[2]!, 'Corps du dossier')).toBeDefined();

    const list = pages[1]!;
    expect(findText(list, MISSING_PIECES_TITLE)).toBeDefined();
    expect(findText(list, 'Copie de la CIN du titulaire')).toBeDefined();
    expect(findText(list, 'Autorisation du syndic ou des copropriétaires')).toBeDefined();
    expect(pageText(list)).not.toContain('Page de garde');

    expect(DRAFT_WATERMARK_LINES.join(' ')).toBe(DRAFT_WATERMARK_TEXT);
    for (const page of pages) {
      for (const line of DRAFT_WATERMARK_LINES) {
        const mark = findText(page, line);
        expect(mark).toBeDefined();
        expect(mark!.size).toBe(60);
      }
    }
  });

  it('draws the mark at 45°, translucent, across the middle of the page', async () => {
    const out = await applyDraftWatermark(await twoPageDossier(), ['Copie de la CIN du titulaire']);
    const doc = await PDFDocument.load(out);
    const page = doc.getPage(0);

    // 45°: the text matrix's a, b and d are cos 45° (≈ 0.7071), c is -sin 45°.
    const stream = (await rawPageStreams(out))[0]!;
    expect(stream).toMatch(/0\.7071\d* 0\.7071\d* -0\.7071\d* 0\.7071\d* [-\d.]+ [-\d.]+ Tm/);
    // The translucency comes from an ExtGState with CA/ca 0.25.
    expect(String(page.node.Resources()?.lookup(PDFName.of('ExtGState')))).toContain('0.25');

    // Both lines stay on the page whole: their ends, along the 45° baseline, fall inside the media box.
    const content = (await extractPdfContent(out))[0]!;
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaBold);
    for (const line of DRAFT_WATERMARK_LINES) {
      const start = findText(content, line)!;
      const length = font.widthOfTextAtSize(line, 60);
      const end = { x: start.x + length * Math.SQRT1_2, y: start.y + length * Math.SQRT1_2 };
      for (const p of [start, end]) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(595.28);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(841.89);
      }
    }
  });
});
