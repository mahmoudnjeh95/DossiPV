import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { renderCoverPage, formatFrenchDate } from '../src/render-cover-page';
import { extractPdfContent, pageText, everythingOnPage } from './helpers/pdf-content';

const NARROW_NBSP = String.fromCodePoint(0x202f);
const FI_LIGATURE = String.fromCodePoint(0xfb01);

function tinyPng(): Buffer {
  const png = new PNG({ width: 4, height: 2 });
  png.data.fill(200);
  return PNG.sync.write(png);
}

describe('renderCoverPage', () => {
  it('produces a single-page PDF containing the company name, client name, dossier number and the French-formatted date', async () => {
    const buffer = await renderCoverPage({
      companyName: 'SolarPro Tunisie',
      companyLogoBuffer: null,
      dossierNumber: '434-303',
      clientFullName: 'Habib Khedhira',
      dossierDate: '2026-11-25',
    });

    const [page, ...rest] = await extractPdfContent(buffer);
    expect(rest).toHaveLength(0);
    const text = pageText(page!);
    expect(text).toContain('SolarPro Tunisie');
    expect(text).toContain('Client : Habib Khedhira');
    expect(text).toContain('N° Dossier : 434-303');
    expect(text).toContain('Date : 25/11/2026');
    expect(text).not.toContain('2026-11-25');
    expect(everythingOnPage(page!)).toBe(true);
  });

  it('omits the dossier-number line when there is none, and still renders without a logo', async () => {
    const buffer = await renderCoverPage({
      companyName: 'SolarPro Tunisie',
      companyLogoBuffer: null,
      dossierNumber: null,
      clientFullName: 'Habib Khedhira',
      dossierDate: '2026-11-25',
    });

    const [page] = await extractPdfContent(buffer);
    expect(pageText(page!)).not.toContain('N° Dossier');
    expect(page!.images).toHaveLength(0);
  });

  it('does not throw on an Arabic client name (or ğ / Ł / U+202F / U+FB01 in other fields) — it renders a PDF-safe substitute', async () => {
    const buffer = await renderCoverPage({
      companyName: `Énergie Doğan Łódź${NARROW_NBSP}${FI_LIGATURE}liale`,
      companyLogoBuffer: null,
      dossierNumber: `12${NARROW_NBSP}345`,
      clientFullName: 'حبيب خذيرة',
      dossierDate: '2026-11-25',
    });

    const [page] = await extractPdfContent(buffer);
    const text = pageText(page!);
    expect(text).toContain('Client : ???? ?????');
    expect(text).toContain('Énergie Dogan Lódz filiale');
    expect(text).toContain('N° Dossier : 12 345');
  });

  it('draws the company logo when one is provided, inside the page', async () => {
    const buffer = await renderCoverPage({
      companyName: 'SolarPro Tunisie',
      companyLogoBuffer: tinyPng(),
      dossierNumber: null,
      clientFullName: 'Habib Khedhira',
      dossierDate: '2026-11-25',
    });

    const [page] = await extractPdfContent(buffer);
    expect(page!.images).toHaveLength(1);
    expect(everythingOnPage(page!)).toBe(true);
  });

  it('skips an unreadable logo instead of failing the whole cover', async () => {
    const buffer = await renderCoverPage({
      companyName: 'SolarPro Tunisie',
      companyLogoBuffer: Buffer.from('definitely not an image'),
      dossierNumber: null,
      clientFullName: 'Habib Khedhira',
      dossierDate: '2026-11-25',
    });

    expect((await PDFDocument.load(buffer)).getPageCount()).toBe(1);
  });
});

describe('formatFrenchDate', () => {
  it('formats ISO dates and ISO timestamps as dd/MM/yyyy without time-zone shifting', () => {
    expect(formatFrenchDate('2026-01-05')).toBe('05/01/2026');
    expect(formatFrenchDate('2026-12-31T23:30:00.000Z')).toBe('31/12/2026');
  });

  it('returns non-ISO input unchanged', () => {
    expect(formatFrenchDate('demain')).toBe('demain');
  });
});
