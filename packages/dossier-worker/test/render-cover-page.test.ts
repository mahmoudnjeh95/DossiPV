import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { renderCoverPage, formatFrenchDate, type CoverPageInput } from '../src/render-cover-page';
import type { InstallerIdentity } from '../src/installer-identity';
import { extractPdfContent, pageText, everythingOnPage, rawPageStreams, pdfFontNames, TIMES_FONTS, type PageContent } from './helpers/pdf-content';

const NARROW_NBSP = String.fromCodePoint(0x202f);
const FI_LIGATURE = String.fromCodePoint(0xfb01);

function tinyPng(): Buffer {
  const png = new PNG({ width: 4, height: 2 });
  png.data.fill(200);
  return PNG.sync.write(png);
}

const installer: InstallerIdentity = {
  name: 'SolarPro Tunisie',
  address: '12 Rue de la République, Tunis',
  phone: '+216 71 000 000',
  email: 'contact@solarpro.tn',
  anmeCode: 'ANME-TEST-01',
  anmeCategory: 'BT',
  anmeValidTo: '2027-12-31T00:00:00.000Z',
  taxId: null,
  legalRepFullName: 'MR TEST GERANT',
  legalRepRole: 'Gérant',
  commercialRegister: null,
};

const baseInput: CoverPageInput = {
  installer,
  companyLogoBuffer: null,
  stegLogoBuffer: null,
  dossierNumber: '434 - 303',
  dossierDate: '2026-11-25',
  client: { fullName: 'MR TEST CLIENT', cin: '01234567', address: '1 rue du Test, Sfax', stegReference: '12 345 678 9' },
  gps: { lat: 34.7421, lon: 10.76 },
  installedKWp: 3.1,
};

/** Each text line of the page: the runs drawn on one baseline, joined left to right. */
function lines(page: PageContent): string[] {
  const byY = new Map<number, { x: number; text: string }[]>();
  for (const t of page.texts) {
    const y = Math.round(t.y * 10) / 10;
    byY.set(y, [...(byY.get(y) ?? []), { x: t.x, text: t.text }]);
  }
  return [...byY.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, runs]) => runs.sort((a, b) => a.x - b.x).map((r) => r.text).join(' '));
}

describe('renderCoverPage', () => {
  it('uses only the Times fonts (one font family across the dossier)', async () => {
    const fonts = await pdfFontNames(await renderCoverPage({ ...baseInput, companyLogoBuffer: tinyPng(), stegLogoBuffer: tinyPng() }));
    expect(fonts.size).toBeGreaterThan(0);
    for (const font of fonts) expect(TIMES_FONTS).toContain(font);
  });

  it('renders the reference-style cover: title, labelled client, site and installer fields', async () => {
    const [page, ...rest] = await extractPdfContent(await renderCoverPage(baseInput));
    expect(rest).toHaveLength(0);
    const text = lines(page!);

    expect(pageText(page!)).toContain("Dossier technique d'une installation photovoltaïque");
    expect(text).toContain('Client BT : MR TEST CLIENT');
    expect(text).toContain('CIN : 01234567');
    expect(text).toContain('Référence STEG : 12 345 678 9');
    expect(text).toContain('Adresse : 1 rue du Test, Sfax');
    expect(text).toContain('Localisation (GPS) : 34.74210, 10.76000');
    expect(text).toContain('Puissance installée : 3,10 kWc');
    expect(text).toContain('Installateur : SolarPro Tunisie');
    expect(text).toContain("Agrément ANME n° : ANME-TEST-01 (catégorie BT), valable jusqu'au 31/12/2027");
    expect(text).toContain('N° dossier : 434 - 303');
    expect(text).toContain('Date : 25/11/2026');
    expect(pageText(page!)).not.toContain('2026-11-25');
    expect(everythingOnPage(page!)).toBe(true);
  });

  it('draws the labels in the reference blue', async () => {
    const [stream] = await rawPageStreams(await renderCoverPage(baseInput));
    expect(stream).toMatch(/0\.12 0\.31 0\.6 rg/);
  });

  it('draws two nested frame rectangles (20 pt and 24 pt insets)', async () => {
    const [page] = await extractPdfContent(await renderCoverPage(baseInput));
    const frameAt = (inset: number): boolean =>
      page!.paths.some((p) => {
        const xs = p.points.map((pt) => pt.x);
        const ys = p.points.map((pt) => pt.y);
        const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.6;
        return near(Math.min(...xs), inset) && near(Math.max(...xs), page!.width - inset) && near(Math.min(...ys), inset) && near(Math.max(...ys), page!.height - inset);
      });
    expect(frameAt(20)).toBe(true);
    expect(frameAt(24)).toBe(true);
  });

  it('embeds the STEG logo top-right and the installer logo top-left', async () => {
    const [page] = await extractPdfContent(await renderCoverPage({ ...baseInput, companyLogoBuffer: tinyPng(), stegLogoBuffer: tinyPng() }));

    expect(page!.images).toHaveLength(2);
    const [left, right] = [...page!.images].sort((a, b) => a.x - b.x);
    expect(left!.x).toBeLessThan(page!.width / 2);
    expect(right!.x).toBeGreaterThan(page!.width / 2);
    expect(Math.min(left!.y, right!.y)).toBeGreaterThan(page!.height * 0.75);
    expect(everythingOnPage(page!)).toBe(true);
  });

  it('renders without either logo, and without the optional client fields', async () => {
    const [page] = await extractPdfContent(
      await renderCoverPage({ ...baseInput, dossierNumber: null, gps: null, client: { fullName: 'MR TEST CLIENT', cin: null, address: null, stegReference: null } }),
    );
    const text = lines(page!);

    expect(page!.images).toHaveLength(0);
    expect(text).toContain('CIN : copie jointe en annexe N°1');
    expect(text).toContain('Référence STEG : —');
    expect(text).toContain('Localisation (GPS) : —');
    expect(text).toContain('N° dossier : —');
  });

  it('wraps a long address inside the frame', async () => {
    const [page] = await extractPdfContent(
      await renderCoverPage({ ...baseInput, client: { ...baseInput.client, address: 'Route de la Corniche, '.repeat(8) } }),
    );
    expect(everythingOnPage(page!)).toBe(true);
    expect(page!.texts.every((t) => t.x < page!.width - 24)).toBe(true);
  });

  it('does not throw on an Arabic client name (or ğ / Ł / U+202F / U+FB01 in other fields) — it renders a PDF-safe substitute', async () => {
    const [page] = await extractPdfContent(
      await renderCoverPage({
        ...baseInput,
        installer: { ...installer, name: `Énergie Doğan Łódź${NARROW_NBSP}${FI_LIGATURE}liale` },
        dossierNumber: `12${NARROW_NBSP}345`,
        client: { ...baseInput.client, fullName: 'حبيب خذيرة' },
      }),
    );
    const text = lines(page!);
    expect(text).toContain('Client BT : ???? ?????');
    expect(text).toContain('Installateur : Énergie Dogan Lódz filiale');
    expect(text).toContain('N° dossier : 12 345');
  });

  it('skips an unreadable logo instead of failing the whole cover', async () => {
    const buffer = await renderCoverPage({ ...baseInput, companyLogoBuffer: Buffer.from('definitely not an image'), stegLogoBuffer: Buffer.from('nope') });

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
