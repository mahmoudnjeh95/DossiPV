import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, type PDFPage } from 'pdf-lib';
import { A4_LANDSCAPE, FRAME_MARGIN, conductor, drawSheet, label, type Fonts } from '../src/drawing-kit';
import { extractPdfContent, everythingOnPage } from './helpers/pdf-content';

const sheetCartouche = {
  projectTitle: 'Installation PV',
  client: 'le client',
  commune: 'Sfax',
  installerName: 'SolarPro Tunisie',
  anmeCode: 'AN-123',
  revision: 'A',
  date: '2026-10-22',
  dossierNumber: null,
  drawingTitle: 'Schéma unifilaire',
  planNumber: 4,
  pageLabel: 'Feuille 1/1',
  logo: null,
};

async function setup(): Promise<{ doc: PDFDocument; fonts: Fonts; page: PDFPage }> {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const page = doc.addPage(A4_LANDSCAPE);
  return { doc, fonts, page };
}

describe('drawSheet', () => {
  it('returns a drawing area inside the frame and prints the title block', async () => {
    const { doc, fonts, page } = await setup();
    const area = drawSheet(page, fonts, sheetCartouche);
    expect(area.x).toBeGreaterThanOrEqual(FRAME_MARGIN);
    expect(area.y).toBeGreaterThanOrEqual(FRAME_MARGIN);
    expect(area.x + area.width).toBeLessThanOrEqual(A4_LANDSCAPE[0] - FRAME_MARGIN);
    expect(area.y + area.height).toBeLessThanOrEqual(A4_LANDSCAPE[1] - FRAME_MARGIN);
    const [content] = await extractPdfContent(Buffer.from(await doc.save()));
    const text = content!.texts.map((t) => t.text).join('\n');
    expect(text).toContain('sans échelle');
    expect(text).toContain('AN-123');
    expect(text).toContain('Plan N° 4');
    expect(text).toContain('22/10/2026');
  });
});

describe('conductor and label', () => {
  it('never draws text under 7 pt', async () => {
    const { doc, fonts, page } = await setup();
    label(page, fonts.regular, 'petit', { x: 50, y: 50 }, 4);
    const [content] = await extractPdfContent(Buffer.from(await doc.save()));
    expect(content!.texts[0]!.size).toBe(7);
  });

  it('puts a horizontal conductor label above the line, centred on it', async () => {
    const { doc, fonts, page } = await setup();
    conductor(page, fonts.regular, { x: 100, y: 300 }, { x: 300, y: 300 }, 'dcPlus', 'H1Z2Z2-K');
    const [content] = await extractPdfContent(Buffer.from(await doc.save()));
    const text = content!.texts[0]!;
    expect(text.y).toBeGreaterThan(300);
    const width = fonts.regular.widthOfTextAtSize('H1Z2Z2-K', 7);
    expect(text.x + width / 2).toBeCloseTo(200, 0);
    expect(everythingOnPage(content!)).toBe(true);
  });

  it('marks a PE conductor with PE and a green stroke', async () => {
    const { doc, fonts, page } = await setup();
    conductor(page, fonts.regular, { x: 100, y: 300 }, { x: 300, y: 300 }, 'pe');
    const [content] = await extractPdfContent(Buffer.from(await doc.save()));
    expect(content!.texts[0]!.text).toBe('PE');
    const stroke = content!.paths[0]!.stroke!;
    expect(stroke[1]).toBeGreaterThan(stroke[0]!);
  });
});
