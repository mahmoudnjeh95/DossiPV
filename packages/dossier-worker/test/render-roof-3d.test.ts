import { describe, it, expect } from 'vitest';
import { encodeJpegBitmap } from '../src/image-enhance';
import { renderRoof3dView, type Roof3dInput } from '../src/render-roof-3d';
import { extractPdfContent, everythingOnPage, pageText, pdfFontNames, TIMES_FONTS } from './helpers/pdf-content';

function photo(size: number): Buffer {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) data.set([180, 170, 150, 255], i * 4);
  return encodeJpegBitmap({ width: size, height: size, data }, 85);
}

const input: Roof3dInput = {
  image: { buffer: photo(400), widthPx: 400, heightPx: 400, metersPerPixel: 0.12 },
  field: { x: 180, y: 170 },
  technicalRoom: { x: 220, y: 230 },
  meter: { x: 160, y: 250 },
  earthPit: { x: 260, y: 200 },
  footprint: null,
  moduleCount: 5,
  moduleLengthM: 2.094,
  moduleWidthM: 1.038,
  moduleLabel: 'AE Solar AE510CMER-108BDS',
  tiltDeg: 30,
  azimuthDeg: 0,
  latitudeDeg: 34.76,
  installedKWp: 2.55,
  cartouche: {
    projectTitle: 'Installation PV 2,55 kWc',
    client: 'le client',
    commune: 'Sfax',
    installerName: 'Solarix Pro',
    anmeCode: 'AN-1',
    revision: 'A',
    date: '2026-10-22',
    dossierNumber: '1',
    logo: null,
  },
};

/** Closed paths filled with the module blue, except the legend's axis-aligned swatch. */
const moduleFaces = (paths: { closed: boolean; fill: number[] | null; points: { x: number; y: number }[] }[]): number =>
  paths.filter(
    (p) =>
      p.closed &&
      p.fill &&
      Math.abs(p.fill[0]! - 0.1) < 0.01 &&
      Math.abs(p.fill[2]! - 0.45) < 0.01 &&
      new Set(p.points.map((pt) => pt.x.toFixed(1))).size > 2,
  ).length;

describe('renderRoof3dView', { timeout: 20_000 }, () => {
  it('draws one page with the photo, one face per module and the installation facts', async () => {
    const buffer = await renderRoof3dView(input);
    const [page, ...rest] = await extractPdfContent(buffer);
    expect(rest).toHaveLength(0);
    const text = pageText(page!).replace(/\s+/g, ' ');
    expect(text).toContain("Vue 3D de l'implantation sur toiture");
    expect(text).toContain('5 modules');
    expect(text).toContain('Inclinaison : 30°');
    expect(text).toContain('Orientation : plein sud');
    expect(text).toContain('1 rangée de 5 modules');
    expect(text).toContain('Local technique');
    expect(text).toContain('Compteur STEG');
    expect(text).toContain('Piquet de terre');
    expect(text).toContain('Plan N° 5');
    expect(page!.images).toHaveLength(1);
    expect(moduleFaces(page!.paths)).toBe(5);
    expect(everythingOnPage(page!)).toBe(true);
    for (const font of await pdfFontNames(buffer)) expect(TIMES_FONTS).toContain(font);
  });

  it('splits a large array into several rows and names a west orientation', async () => {
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 24, azimuthDeg: 45 }));
    const text = pageText(page!).replace(/\s+/g, ' ');
    expect(moduleFaces(page!.paths)).toBe(24);
    expect(text).toMatch(/\d+ rangées (de \d+ modules|\([\d +]+ modules\))/);
    expect(text).toContain('Orientation : ouest (45° du sud)');
    expect(everythingOnPage(page!)).toBe(true);
  });

  it('fits the rows to the AI panel rectangle when there is one', async () => {
    // A 4.5 m wide rectangle (≈ 37 px at 0,12 m/px): four 1,04 m modules per row.
    const footprint = [
      { x: 160, y: 150 },
      { x: 198, y: 150 },
      { x: 198, y: 190 },
      { x: 160, y: 190 },
    ];
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 8, footprint }));
    expect(pageText(page!).replace(/\s+/g, ' ')).toContain('2 rangées de 4 modules');
  });

  it('draws the page without the optional points', async () => {
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, technicalRoom: null, meter: null, earthPit: null }));
    expect(pageText(page!)).not.toContain('Compteur STEG');
    expect(everythingOnPage(page!)).toBe(true);
  });
});

describe('renderRoof3dView rows', { timeout: 20_000 }, () => {
  it('names a shorter last row', async () => {
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 9, footprint: [{ x: 150, y: 150 }, { x: 207, y: 150 }, { x: 207, y: 200 }, { x: 150, y: 200 }] }));
    expect(pageText(page!).replace(/\s+/g, ' ')).toContain('2 rangées (6 + 3 modules)');
  });
});
