import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PNG } from 'pngjs';
import { dropBlankTrailingPages, isBrowserPrintedBill } from '../src/clean-pdf-annex';

type PageSpec = { text?: string; image?: boolean };

async function makePdf(specs: PageSpec[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(200);
  const image = await doc.embedPng(PNG.sync.write(png));
  for (const spec of specs) {
    const page = doc.addPage([300, 300]);
    if (spec.text) page.drawText(spec.text, { x: 20, y: 150, size: 12, font });
    if (spec.image) page.drawImage(image, { x: 20, y: 20, width: 100, height: 100 });
  }
  return Buffer.from(await doc.save());
}

async function pageCount(pdf: Buffer): Promise<number> {
  return (await PDFDocument.load(pdf)).getPageCount();
}

describe('dropBlankTrailingPages', () => {
  it('drops a trailing page that only says [Fermer la fenêtre]', async () => {
    const out = await dropBlankTrailingPages(await makePdf([{ text: 'MR TEST CLIENT' }, { text: '[Fermer la fenêtre]' }]));
    expect(await pageCount(out)).toBe(1);
  });

  it('drops several empty trailing pages but keeps the content before them', async () => {
    const out = await dropBlankTrailingPages(await makePdf([{ text: 'A' }, {}, { text: 'B' }, {}, { text: '[Fermer la fenêtre]' }]));
    expect(await pageCount(out)).toBe(3);
  });

  it('keeps an image-only page', async () => {
    const out = await dropBlankTrailingPages(await makePdf([{ text: 'A' }, { image: true }]));
    expect(await pageCount(out)).toBe(2);
  });

  it('returns the same buffer when nothing is dropped', async () => {
    const pdf = await makePdf([{ text: 'A' }, { text: 'B' }]);
    expect(await dropBlankTrailingPages(pdf)).toBe(pdf);
  });

  it('keeps at least one page', async () => {
    const out = await dropBlankTrailingPages(await makePdf([{}, {}]));
    expect(await pageCount(out)).toBe(1);
  });
});

describe('isBrowserPrintedBill', () => {
  it('detects a session id or a web address', () => {
    expect(isBrowserPrintedBill('https://example.test/facture?sid=123')).toBe(true);
    expect(isBrowserPrintedBill('see http://example.test')).toBe(true);
    expect(isBrowserPrintedBill('x?sid=abc')).toBe(true);
  });

  it('accepts plain bill text', () => {
    expect(isBrowserPrintedBill('MR TEST CLIENT Facture 2026')).toBe(false);
  });
});
