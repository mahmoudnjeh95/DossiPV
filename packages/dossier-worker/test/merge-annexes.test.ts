import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { mergeAnnexes, mergeDocumentFragments } from '../src/merge-annexes';

async function makeOnePagePdf(size: [number, number] = [200, 200]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage(size);
  return Buffer.from(await doc.save());
}

async function countPages(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer);
  return doc.getPageCount();
}

describe('mergeAnnexes', () => {
  it('concatenates the base PDF with every PDF annex, in order', async () => {
    const base = await makeOnePagePdf();
    const annex1 = await makeOnePagePdf();
    const annex2 = await makeOnePagePdf();

    const merged = await mergeAnnexes(base, [
      { buffer: annex1, mimeType: 'pdf' },
      { buffer: annex2, mimeType: 'pdf' },
    ]);

    expect(await countPages(merged)).toBe(3);
  });

  it('returns the base PDF unchanged when there are no annexes', async () => {
    const base = await makeOnePagePdf();

    const merged = await mergeAnnexes(base, []);

    expect(await countPages(merged)).toBe(1);
  });
});

async function makeOnePagePng(): Promise<Buffer> {
  const png = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 255;
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = png.pack();
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('mergeAnnexes — image annexes', () => {
  it('converts a PNG annex into exactly one additional page', async () => {
    const base = await makeOnePagePdf();
    const pngAnnex = await makeOnePagePng();

    const merged = await mergeAnnexes(base, [{ buffer: pngAnnex, mimeType: 'png' }]);

    expect(await countPages(merged)).toBe(2);
  });
});

describe('mergeAnnexes — resilience', () => {
  it('skips a corrupted annex and still merges the valid ones, rather than failing the whole job', async () => {
    const base = await makeOnePagePdf();
    const validAnnex = await makeOnePagePdf();
    const corrupted = { buffer: Buffer.from('not a real pdf'), mimeType: 'pdf' as const };

    const merged = await mergeAnnexes(base, [corrupted, { buffer: validAnnex, mimeType: 'pdf' }]);

    // Base + the one valid annex = 2 pages; the corrupted one contributed nothing but did not abort the merge.
    expect(await countPages(merged)).toBe(2);
  });
});

describe('mergeDocumentFragments', () => {
  it('merges an arbitrary ordered list of PDF fragments before the annexes', async () => {
    // Distinct page widths make the final page order observable, not just the page count.
    const fragment1 = await makeOnePagePdf([100, 100]);
    const fragment2 = await makeOnePagePdf([200, 200]);
    const annex = await makeOnePagePdf([300, 300]);

    const merged = await mergeDocumentFragments([fragment1, fragment2], [{ buffer: annex, mimeType: 'pdf' }]);

    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((page) => page.getWidth())).toEqual([100, 200, 300]);
  });

  it('throws when a fragment itself is unreadable (unlike an annex, a broken fragment must fail the job)', async () => {
    const valid = await makeOnePagePdf();

    await expect(mergeDocumentFragments([valid, Buffer.from('not a real pdf')], [])).rejects.toThrow();
  });
});
