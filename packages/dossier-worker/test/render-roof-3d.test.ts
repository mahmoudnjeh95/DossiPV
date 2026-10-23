import { describe, it, expect } from 'vitest';
import { encodeJpegBitmap } from '../src/image-enhance';
import { compactArrayFootprint, fitOnRoof, renderRoof3dView, roomAcross, ROOF_VIEW_TITLE, type Roof3dInput } from '../src/render-roof-3d';
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

/** Closed paths filled with the module blue above the legend band: each module is drawn on the site view and on the detail. */
const moduleFaces = (paths: { closed: boolean; fill: number[] | null; points: { x: number; y: number }[] }[]): number =>
  paths.filter((p) => p.closed && p.fill && Math.abs(p.fill[0]! - 0.09) < 0.01 && Math.abs(p.fill[2]! - 0.38) < 0.01 && p.points.every((pt) => pt.y > 100)).length;

describe('renderRoof3dView', { timeout: 20_000 }, () => {
  it('draws one page: the site and the detail of the field on the photo, each module on both, the section and the facts', async () => {
    const buffer = await renderRoof3dView({ ...input, imageCredit: 'Imagerie : test' });
    const [page, ...rest] = await extractPdfContent(buffer);
    expect(rest).toHaveLength(0);
    const text = pageText(page!).replace(/\s+/g, ' ');
    expect(text).toContain(ROOF_VIEW_TITLE);
    expect(text).toContain('VUE DE DESSUS DU SITE');
    expect(text).toContain('DÉTAIL DU CHAMP PV');
    expect(text).toContain('Coupe A-A');
    expect(text).toContain('5 modules');
    expect(text).toContain('Inclinaison 30°');
    expect(text).toContain('orientation plein sud');
    expect(text).toContain('Imagerie : test');
    expect(text).toContain('1 rangée de 5 modules');
    expect(text).toContain('Local technique');
    expect(text).toContain('Compteur STEG');
    expect(text).toContain('Piquet de terre');
    expect(text).toContain('Plan N° 5');
    expect(page!.images).toHaveLength(2);
    expect(moduleFaces(page!.paths)).toBe(10);
    expect(everythingOnPage(page!)).toBe(true);
    for (const font of await pdfFontNames(buffer)) expect(TIMES_FONTS).toContain(font);
  });

  it('splits a large array into several rows and names a west orientation', async () => {
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 24, azimuthDeg: 45 }));
    const text = pageText(page!).replace(/\s+/g, ' ');
    expect(moduleFaces(page!.paths)).toBe(48);
    expect(text).toMatch(/\d+ rangées (de \d+ modules|\([\d +]+ modules\))/);
    expect(text).toContain('orientation ouest (45° du sud)');
    expect(text).toMatch(/Écart entre rangées \d,\d\d m/);
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

  it('keeps one row when the AI rectangle is drawn a little short of it', async () => {
    // 42 px (5,04 m) for a 5,29 m row of five: four and three quarter modules.
    const footprint = [{ x: 160, y: 160 }, { x: 202, y: 160 }, { x: 202, y: 178 }, { x: 160, y: 178 }];
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, footprint }));
    expect(pageText(page!).replace(/\s+/g, ' ')).toContain('1 rangée de 5 modules');
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

describe('renderRoof3dView on a drawn roof', { timeout: 20_000 }, () => {
  // A 4,56 m x 4,8 m roof (38 x 40 px at 0,12 m/px) around the field point: four modules per row.
  const roofOutline = [
    { x: 160, y: 150 },
    { x: 198, y: 150 },
    { x: 198, y: 190 },
    { x: 160, y: 190 },
  ];

  it('fits the rows to the roof width and draws the contour, with the surface measured on the map', async () => {
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 8, roofOutline, roofAreaM2: 23.4 }));
    const text = pageText(page!).replace(/\s+/g, ' ');
    expect(text).toContain('2 rangées de 4 modules');
    expect(text).toContain('Surface de la toiture : 23 m²');
    expect(text).toContain('Contour de la toiture');
    const cyanEdges = page!.paths.filter((p) => p.stroke && Math.abs(p.stroke[0]!) < 0.01 && Math.abs(p.stroke[1]! - 184 / 255) < 0.01);
    expect(cyanEdges.length).toBeGreaterThanOrEqual(4);
    expect(everythingOnPage(page!)).toBe(true);
  });

  it('keeps the AI rectangle first when there is one', async () => {
    const footprint = [{ x: 150, y: 150 }, { x: 207, y: 150 }, { x: 207, y: 200 }, { x: 150, y: 200 }];
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 9, footprint, roofOutline }));
    expect(pageText(page!).replace(/\s+/g, ' ')).toContain('2 rangées (6 + 3 modules)');
  });

  it("puts the array where Claude chose, narrowed to the room the roof leaves there", async () => {
    // 6 px (0,72 m) from the roof's west edge: a row there holds a single module.
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 8, roofOutline, placement: { centre: { x: 166, y: 170 }, freeRowLengthPx: null } }));
    expect(pageText(page!).replace(/\s+/g, ' ')).toContain('8 rangées de 1 module');
  });

  it('keeps the rows within the free length Claude saw between the borders of that part of the roof', async () => {
    // In the middle of the 4,56 m roof, but a border leaves 18 px (2,16 m) free along the rows: two modules.
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 8, roofOutline, placement: { centre: { x: 179, y: 170 }, freeRowLengthPx: 18 } }));
    expect(pageText(page!).replace(/\s+/g, ' ')).toContain('4 rangées de 2 modules');
  });

  it("ignores a placement off the roof", async () => {
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 8, roofOutline, placement: { centre: { x: 20, y: 20 }, freeRowLengthPx: 18 } }));
    expect(pageText(page!).replace(/\s+/g, ' ')).toContain('2 rangées de 4 modules');
  });

  it('states no surface measured on the photo: only the map measures it', async () => {
    const [page] = await extractPdfContent(await renderRoof3dView({ ...input, moduleCount: 8, roofOutline }));
    expect(pageText(page!)).not.toContain('Surface de la toiture');
  });

  it('says nothing of a roof when none was drawn', async () => {
    const [page] = await extractPdfContent(await renderRoof3dView(input));
    expect(pageText(page!)).not.toContain('Surface de la toiture');
    expect(pageText(page!)).not.toContain('Contour de la toiture');
  });
});

describe('fitOnRoof', () => {
  // Rows facing south run east-west: `across` is east.
  const facing = { e: 0, n: -1 };
  const across = { e: 1, n: 0 };
  const roof = [
    { e: -2, n: -3 },
    { e: 8, n: -3 },
    { e: 8, n: 3 },
    { e: -2, n: 3 },
  ];

  it('centres the array on the roof through the field point and gives the roof width', () => {
    const fitted = fitOnRoof(roof, { e: 0, n: 1 }, facing, across);
    expect(fitted.centre.e).toBeCloseTo(3, 9);
    expect(fitted.centre.n).toBeCloseTo(0, 9);
    expect(fitted.widthM).toBeCloseTo(10, 9);
  });

  it("starts from the roof's centre when the field point is off the roof", () => {
    const fitted = fitOnRoof(roof, { e: 20, n: 20 }, facing, across);
    expect(fitted.centre.e).toBeCloseTo(3, 9);
    expect(fitted.widthM).toBeCloseTo(10, 9);
  });

  it('narrows the room to the roof width over the depth of a row, on a roof drawn at an angle', () => {
    const diamond = [
      { e: 0, n: 5 },
      { e: 5, n: 0 },
      { e: 0, n: -5 },
      { e: -5, n: 0 },
    ];
    expect(fitOnRoof(diamond, { e: 0, n: 0 }, facing, across).widthM).toBeCloseTo(10, 9);
    // A 2 m deep row reaches 1 m north and south of the middle, where the roof is 8 m wide.
    expect(fitOnRoof(diamond, { e: 0, n: 0 }, facing, across, 2).widthM).toBeCloseTo(8, 9);
  });

  it('measures the width of the arm the field point is on, for an L-shaped roof', () => {
    // A 10 m wide, 2 m deep strip along the south edge plus a 2 m wide arm going north.
    const lShape = [
      { e: 0, n: 0 },
      { e: 10, n: 0 },
      { e: 10, n: 2 },
      { e: 2, n: 2 },
      { e: 2, n: 10 },
      { e: 0, n: 10 },
    ];
    expect(fitOnRoof(lShape, { e: 5, n: 1 }, facing, across).widthM).toBeCloseTo(10, 9);
    expect(fitOnRoof(lShape, { e: 1, n: 6 }, facing, across).widthM).toBeCloseTo(2, 9);
  });
});

describe('roomAcross', () => {
  const facing = { e: 0, n: -1 };
  const across = { e: 1, n: 0 };
  const roof = [
    { e: 0, n: 0 },
    { e: 10, n: 0 },
    { e: 10, n: 6 },
    { e: 0, n: 6 },
  ];

  it('is twice the distance to the nearer side, and null off the roof', () => {
    expect(roomAcross(roof, { e: 5, n: 3 }, facing, across)).toBeCloseTo(10, 9);
    expect(roomAcross(roof, { e: 2, n: 3 }, facing, across)).toBeCloseTo(4, 9);
    expect(roomAcross(roof, { e: 20, n: 3 }, facing, across)).toBeNull();
  });
});

describe('compactArrayFootprint', () => {
  it('lays 12 modules out about as deep as wide, rows spaced for the winter sun', () => {
    const footprint = compactArrayFootprint({ moduleCount: 12, moduleLengthM: 2.094, moduleWidthM: 1.038, tiltDeg: 30, latitudeDeg: 34.79 });
    expect(footprint).toMatchObject({ perRow: 7, rows: 2 });
    expect(footprint.widthM).toBeCloseTo(7 * 1.058, 6);
    expect(footprint.depthM).toBeGreaterThan(2.094 * Math.cos(Math.PI / 6));
  });
});
