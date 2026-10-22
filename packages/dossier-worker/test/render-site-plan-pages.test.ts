import { describe, it, expect } from 'vitest';
import { encode as encodeJpeg } from 'jpeg-js';
import { renderSitePlanPages, type SitePlanData, type SitePlanPagesInput, type SitePlanPoints } from '../src/render-site-plan-pages';
import { extractPdfContent, findText, pageText, everythingOnPage, type DrawnPath, type PageContent, type DrawnImage } from './helpers/pdf-content';

const IMAGE_PX = 640;

function solidJpeg(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4).fill(150);
  return Buffer.from(encodeJpeg({ data, width, height }, 80).data);
}

const baseInput: Omit<SitePlanPagesInput, 'planData'> = {
  clientFullName: 'MR TEST CLIENT',
  clientAddress: '1 Rue du Test, Sfax',
  gps: { lat: 34.742111, lon: 10.76 },
  installerName: 'SolarPro Tunisie',
  installerContact: { address: '12 Rue de la Liberté, Tunis', phone: '+216 71 234 567', email: 'contact@solarpro.tn' },
  companyLogoBuffer: null,
  dossierDate: '2026-11-25',
  dossierNumber: '434-303',
};

const layout = {
  panelRectangle: [{ x: 280, y: 250 }, { x: 380, y: 260 }, { x: 370, y: 330 }, { x: 270, y: 320 }],
  wireRoute: [{ x: 375, y: 300 }, { x: 470, y: 300 }, { x: 470, y: 500 }, { x: 150, y: 560 }],
};
const points: SitePlanPoints = { field: { x: 320, y: 290 }, technicalRoom: { x: 470, y: 300 }, meter: { x: 150, y: 560 }, earthPit: { x: 200, y: 180 } };
const gps: SitePlanData['page37']['gps'] = {
  field: { lat: 34.742111, lon: 10.76 },
  technicalRoom: { lat: 34.74208, lon: 10.76021 },
  meter: { lat: 34.74172, lon: 10.75981 },
  earthPit: { lat: 34.74231, lon: 10.75992 },
};
const DC_FORMULA = '15,5 m au sol × 1,2 + (1 + 1) niveau(x) × 3,5 m = 26 m';
const AC_FORMULA = '23 m au sol × 1,2 = 28 m';

function planData(overrides: Partial<SitePlanData['page37']> = {}, page38: Partial<SitePlanData['page38']> = {}): SitePlanData {
  return {
    page37: {
      image: { buffer: solidJpeg(IMAGE_PX, IMAGE_PX), widthPx: IMAGE_PX, heightPx: IMAGE_PX, metersPerPixel: 0.25 },
      layout: null,
      points,
      gps,
      dc: { lengthM: 26, sectionMm2: 6, formula: DC_FORMULA },
      ac: { lengthM: 28, sectionMm2: 10, formula: AC_FORMULA },
      ...overrides,
    },
    page38: { image: { buffer: solidJpeg(IMAGE_PX, IMAGE_PX), widthPx: IMAGE_PX, heightPx: IMAGE_PX, metersPerPixel: 1 }, sitePin: { x: 320, y: 320 }, ...page38 },
  };
}

const NO_IMAGE = { buffer: null, widthPx: IMAGE_PX, heightPx: IMAGE_PX, metersPerPixel: 0.25 };

async function render(data: SitePlanData | null, extra: Partial<SitePlanPagesInput> = {}): Promise<PageContent[]> {
  return extractPdfContent(await renderSitePlanPages({ ...baseInput, ...extra, planData: data }));
}

/** Where an image pixel must land on the page, computed from where the image was actually drawn. */
function expectedPdf(image: DrawnImage, p: { x: number; y: number }): { x: number; y: number } {
  return { x: image.x + (p.x / IMAGE_PX) * image.width, y: image.y + image.height - (p.y / IMAGE_PX) * image.height };
}

function satelliteImage(page: PageContent): DrawnImage {
  const image = page.images.find((img) => img.width > 300);
  expect(image, 'satellite image not drawn').toBeDefined();
  return image!;
}

/** The plain-background frame drawn instead of the photo: the large rgb(0.95) filled rectangle. */
function fallbackFrame(page: PageContent): DrawnImage {
  const frame = page.paths.find((p) => colourIs(p.fill, [0.95, 0.95, 0.95]) && p.points.length === 4);
  expect(frame, 'fallback frame not drawn').toBeDefined();
  const xs = frame!.points.map((p) => p.x);
  const ys = frame!.points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function colourIs(colour: number[] | null, expected: number[]): boolean {
  return colour !== null && colour.every((c, i) => Math.abs(c - expected[i]!) < 0.01);
}

const hex = (value: string): number[] => [0, 2, 4].map((i) => parseInt(value.slice(i + 1, i + 3), 16) / 255);
const MARKER_COLOURS = { field: hex('#F5B800'), technicalRoom: hex('#1E6FD9'), meter: hex('#D93025'), earthPit: hex('#1E8E3E') };
const PANEL_BLUE = [0.1, 0.3, 0.85];
const ROUTE_ORANGE = [0.95, 0.5, 0.05];

function near(a: { x: number; y: number }, b: { x: number; y: number }, tolerance = 0.05): boolean {
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance;
}

/** Stroked straight segments joining the two page positions, in either direction. */
function legsBetween(page: PageContent, a: { x: number; y: number }, b: { x: number; y: number }): DrawnPath[] {
  return page.paths.filter(
    (p) => p.stroke !== null && p.points.length === 2 && ((near(p.points[0]!, a) && near(p.points[1]!, b)) || (near(p.points[0]!, b) && near(p.points[1]!, a))),
  );
}

/**
 * Centre of the on-plan marker circle of this colour: a filled bezier circle (move + 4 curves)
 * wider than 10 pt — the legend's swatches of the same colour are smaller.
 */
function markerCentre(page: PageContent, colour: number[]): { x: number; y: number } | undefined {
  for (const circle of page.paths.filter((p) => colourIs(p.fill, colour) && p.points.length === 5)) {
    const xs = circle.points.map((p) => p.x);
    const ys = circle.points.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) > 10) {
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
  }
  return undefined;
}

const flat = (page: PageContent): string => pageText(page).replace(/\n/g, ' ');

describe('renderSitePlanPages — no located site', () => {
  it('keeps the empty frames when the project has no site', async () => {
    const pages = await render(null);

    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(pageText(page)).toContain("À compléter par l'installateur");
      expect(page.images).toHaveLength(0);
    }
  });
});

describe('renderSitePlanPages — implantation plan (page 37)', () => {
  it('draws the four points and the cable legs without an AI layout', async () => {
    const [page37] = await render(planData());
    const image = satelliteImage(page37!);
    const text = flat(page37!);

    expect(findText(page37!, 'Champ PV')).toBeDefined();
    expect(findText(page37!, 'DC : 26 m')).toBeDefined();
    expect(findText(page37!, 'AC : 28 m')).toBeDefined();
    expect(text).toContain('DC : 26 m — 6 mm²');
    expect(text).toContain('AC : 28 m — 10 mm²');
    expect(text).toMatch(/\d+,\d{5}° N, \d+,\d{5}° E/);
    expect(text).not.toContain('À compléter');

    const at = (key: keyof SitePlanPoints): { x: number; y: number } => expectedPdf(image, points[key]!);
    expect(legsBetween(page37!, at('field'), at('technicalRoom')).length).toBeGreaterThanOrEqual(1);
    expect(legsBetween(page37!, at('technicalRoom'), at('meter')).length).toBeGreaterThanOrEqual(1);
    expect(legsBetween(page37!, at('technicalRoom'), at('earthPit')).length).toBeGreaterThanOrEqual(1);
    expect(text).toContain('Terre');

    for (const key of Object.keys(MARKER_COLOURS) as (keyof SitePlanPoints)[]) {
      const centre = markerCentre(page37!, MARKER_COLOURS[key]);
      expect(centre, `${key} marker`).toBeDefined();
      expect(near(centre!, at(key), 0.1), `${key} marker position`).toBe(true);
    }
    // No AI layout: no panel quad, no route, and no legend entry for them.
    expect(page37!.paths.filter((p) => colourIs(p.stroke, PANEL_BLUE) || colourIs(p.stroke, ROUTE_ORANGE))).toHaveLength(0);
    expect(text).not.toContain('Tracé de câblage');
    expect(everythingOnPage(page37!)).toBe(true);
  });

  it('lists every point with its GPS, both formulas and a 10 m scale bar in the legend', async () => {
    const [page37] = await render(planData({ points: { ...points, earthPit: null }, gps: { ...gps, earthPit: null } }));
    const text = flat(page37!);

    expect(text).toContain('Légende');
    expect(text).toContain('Champ PV : 34,74211° N, 10,76000° E');
    expect(text).toContain('Local technique (onduleur) : 34,74208° N, 10,76021° E');
    expect(text).toContain('Compteur STEG : 34,74172° N, 10,75981° E');
    expect(text).toContain('Piquet de terre (non placé)');
    expect(text).toContain(`DC : ${DC_FORMULA}`);
    expect(text).toContain(`AC : ${AC_FORMULA}`);
    expect(findText(page37!, /^10 m$/)).toBeDefined();
    // No pit: no earth leg.
    expect(text).not.toContain('Terre :');
    expect(markerCentre(page37!, MARKER_COLOURS.earthPit)).toBeUndefined();
  });

  it('prints no formula when the run length was edited', async () => {
    const [page37] = await render(planData({ dc: { lengthM: 40, sectionMm2: 6, formula: null } }));
    const text = flat(page37!);

    expect(text).toContain("DC : 40 m (longueur saisie par l'installateur)");
    expect(text).toContain('DC : 40 m — 6 mm²');
    expect(text).not.toContain('au sol × 1,2 + (1 + 1)');
  });

  it('draws the plan without a satellite background when tiles fail', async () => {
    const [page37, page38] = await render(planData({ image: NO_IMAGE }, { image: { ...NO_IMAGE, metersPerPixel: 1 } }));

    for (const page of [page37!, page38!]) {
      expect(page.images).toHaveLength(0);
      expect(pageText(page)).toContain("Fond satellite indisponible — positions à l'échelle");
      expect(pageText(page)).not.toContain('Esri');
    }
    const frame = fallbackFrame(page37!);
    const at = (key: keyof SitePlanPoints): { x: number; y: number } => expectedPdf(frame, points[key]!);
    expect(legsBetween(page37!, at('field'), at('technicalRoom')).length).toBeGreaterThanOrEqual(1);
    expect(legsBetween(page37!, at('technicalRoom'), at('meter')).length).toBeGreaterThanOrEqual(1);
    expect(near(markerCentre(page37!, MARKER_COLOURS.meter)!, at('meter'), 0.1)).toBe(true);
    const text = flat(page37!);
    expect(text).toContain('DC : 26 m — 6 mm²');
    expect(text).toContain('AC : 28 m — 10 mm²');
    expect(text).toContain('Champ PV : 34,74211° N, 10,76000° E');
    expect(findText(page37!, 'Sud')).toBeDefined();
    expect(findText(page37!, /^10 m$/)).toBeDefined();

    // Page 38 keeps its pin, north arrow and coordinates on the plain background.
    const pinFrame = fallbackFrame(page38!);
    const pin = page38!.paths.find((p) => colourIs(p.fill, [0.85, 0.1, 0.1]) && p.points.length === 3);
    expect(pin).toBeDefined();
    const tip = pin!.points.reduce((a, b) => (b.y < a.y ? b : a));
    expect(near(tip, expectedPdf(pinFrame, { x: 320, y: 320 }))).toBe(true);
    expect(findText(page38!, /^N$/)).toBeDefined();
    expect(flat(page38!)).toContain(`34°44'31,6" N, 10°45'36,0" E`);
    expect(everythingOnPage(page37!)).toBe(true);
    expect(everythingOnPage(page38!)).toBe(true);
  });

  it('shows the fallback frame when the image cannot be embedded', async () => {
    const [page37] = await render(planData({ image: { ...NO_IMAGE, buffer: Buffer.from('not an image') } }));

    expect(page37!.images).toHaveLength(0);
    expect(pageText(page37!)).toContain("Fond satellite indisponible — positions à l'échelle");
    expect(markerCentre(page37!, MARKER_COLOURS.field)).toBeDefined();
  });

  it('embeds a small JPEG that lives in the shared Buffer pool (pdf-lib ignores byteOffset)', async () => {
    const small = encodeJpeg({ data: new Uint8Array(16 * 16 * 4).fill(150), width: 16, height: 16 }, 80).data;
    Buffer.from('padding so the next small Buffer is not at the start of the pool');
    const pooled = Buffer.from(small);
    expect(pooled.byteOffset, 'fixture must be a pooled Buffer for this test to mean anything').toBeGreaterThan(0);

    const [page37] = await render(planData({ image: { buffer: pooled, widthPx: IMAGE_PX, heightPx: IMAGE_PX, metersPerPixel: 0.25 } }));

    satelliteImage(page37!);
    expect(pageText(page37!)).not.toContain('Fond satellite indisponible');
  });

  it('shows a south arrow, the imagery credit and a title block with client, French date, dossier number and installer', async () => {
    const [page37] = await render(planData());
    const text = pageText(page37!);

    expect(findText(page37!, 'Sud')).toBeDefined();
    expect(text).toContain('Client : MR TEST CLIENT');
    expect(text).toContain('Date : 25/11/2026');
    expect(text).toContain('N° dossier : 434-303');
    expect(text).toContain('Installateur : SolarPro Tunisie');
    expect(text).toContain('Esri');
  });
});

describe('renderSitePlanPages — implantation plan with the AI layout (Premium)', () => {
  it('draws the panel quad exactly where its pixel coordinates fall on the drawn image, never stretched to the image frame', async () => {
    const [page37] = await render(planData({ layout }));
    const image = satelliteImage(page37!);

    const quadEdges = page37!.paths.filter((p) => colourIs(p.stroke, PANEL_BLUE) && p.points.length === 2 && p.fill === null && p.points[0]!.y > image.y);
    expect(quadEdges).toHaveLength(4);
    layout.panelRectangle.forEach((corner, i) => {
      const expected = expectedPdf(image, corner);
      expect(quadEdges[i]!.points[0]!.x).toBeCloseTo(expected.x, 2);
      expect(quadEdges[i]!.points[0]!.y).toBeCloseTo(expected.y, 2);
    });
    const xs = quadEdges.flatMap((e) => e.points.map((p) => p.x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(image.width / 2);
  });

  it('draws the wire route through its exact pixel positions, entirely inside the image', async () => {
    const [page37] = await render(planData({ layout }));
    const image = satelliteImage(page37!);

    const overlaySegments = page37!.paths.filter((p) => colourIs(p.stroke, ROUTE_ORANGE) && p.points.length === 2 && p.points[0]!.y > image.y);
    expect(overlaySegments).toHaveLength(layout.wireRoute.length - 1);
    overlaySegments.forEach((segment, i) => {
      const start = expectedPdf(image, layout.wireRoute[i]!);
      const end = expectedPdf(image, layout.wireRoute[i + 1]!);
      expect(near(segment.points[0]!, start, 0.01)).toBe(true);
      expect(near(segment.points[1]!, end, 0.01)).toBe(true);
    });
    expect(everythingOnPage(page37!)).toBe(true);
  });

  it('adds the panel and route entries to the legend only when there is a layout', async () => {
    const [page37] = await render(planData({ layout }));

    expect(pageText(page37!)).toContain('Champ PV (implantation indicative)');
    expect(pageText(page37!)).toContain('Tracé de câblage');
  });

  it('moves a marker when its point moves', async () => {
    const [before] = await render(planData());
    const [after] = await render(planData({ points: { ...points, meter: { x: 500, y: 100 } } }));

    expect(markerCentre(after!, MARKER_COLOURS.meter)!.y).toBeGreaterThan(markerCentre(before!, MARKER_COLOURS.meter)!.y + 200);
  });
});

describe('renderSitePlanPages — situation plan (page 38)', () => {
  it('draws a single pin at the site position, a north arrow, and the client, GPS (decimal and DMS) and installer details', async () => {
    const [, page38] = await render(planData());
    const image = satelliteImage(page38!);
    const tip = expectedPdf(image, { x: 320, y: 320 });

    const pinTriangles = page38!.paths.filter((p) => colourIs(p.fill, [0.85, 0.1, 0.1]) && p.points.length === 3);
    expect(pinTriangles).toHaveLength(1);
    const lowest = pinTriangles[0]!.points.reduce((a, b) => (b.y < a.y ? b : a));
    expect(lowest.x).toBeCloseTo(tip.x, 2);
    expect(lowest.y).toBeCloseTo(tip.y, 2);

    const text = flat(page38!);
    expect(text).toContain('Plan de Situation');
    expect(text).toContain('Client : MR TEST CLIENT');
    expect(text).toContain('Adresse : 1 Rue du Test, Sfax');
    expect(text).toContain('Coordonnées GPS : 34,74211° N, 10,76000° E');
    expect(text).toContain(`Coordonnées (DMS) : 34°44'31,6" N, 10°45'36,0" E`);
    expect(findText(page38!, /^N$/)).toBeDefined();
    expect(findText(page38!, / m$/)).toBeDefined(); // scale bar
    expect(text).toContain('SolarPro Tunisie');
    expect(text).toContain('Tél : +216 71 234 567');
    expect(text).toContain('E-mail : contact@solarpro.tn');
    expect(everythingOnPage(page38!)).toBe(true);
  });

  it('writes southern and western coordinates with S and O', async () => {
    const [, page38] = await render(planData(), { gps: { lat: -12.5, lon: -0.0001 } });

    expect(flat(page38!)).toContain('Coordonnées GPS : 12,50000° S, 0,00010° O');
    expect(flat(page38!)).toContain(`12°30'00,0" S, 0°00'00,4" O`);
  });
});

describe('renderSitePlanPages — non-WinAnsi text', () => {
  it.each([true, false])('does not throw on an Arabic client name / address / installer name (site located: %s)', async (located) => {
    const pages = await render(located ? planData() : null, {
      clientFullName: 'عميل تجريبي',
      clientAddress: `Rue ğ${String.fromCodePoint(0x202f)}Łódź`,
      installerName: 'شركة الطاقة',
    });

    expect(pages).toHaveLength(2);
    if (located) {
      expect(pageText(pages[0]!)).toContain('Client : ????');
    }
  });
});
