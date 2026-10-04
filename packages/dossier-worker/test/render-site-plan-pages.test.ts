import { describe, it, expect } from 'vitest';
import { encode as encodeJpeg } from 'jpeg-js';
import { renderSitePlanPages, type SitePlanPagesInput, type SitePlanPremiumData } from '../src/render-site-plan-pages';
import { extractPdfContent, findText, pageText, everythingOnPage, type PageContent, type DrawnImage } from './helpers/pdf-content';

const IMAGE_PX = 640;

function solidJpeg(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4).fill(150);
  return Buffer.from(encodeJpeg({ data, width, height }, 80).data);
}

const baseInput: Omit<SitePlanPagesInput, 'tier' | 'premiumData'> = {
  clientFullName: 'Habib Khedhira',
  clientAddress: 'Av Tahrir Hammamet',
  gps: { lat: 36.8, lon: 10.2 },
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
const points = { technicalRoom: { x: 470, y: 300 }, meter: { x: 150, y: 560 }, earthPit: { x: 200, y: 180 } };

function premiumData(overrides: Partial<SitePlanPremiumData['page37']> = {}): SitePlanPremiumData {
  return {
    page37: { image: { buffer: solidJpeg(IMAGE_PX, IMAGE_PX), widthPx: IMAGE_PX, heightPx: IMAGE_PX }, layout, points, ...overrides },
    page38: { image: { buffer: solidJpeg(IMAGE_PX, IMAGE_PX), widthPx: IMAGE_PX, heightPx: IMAGE_PX }, sitePin: { x: 320, y: 320 } },
  };
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

function colourIs(colour: number[] | null, expected: number[]): boolean {
  return colour !== null && colour.every((c, i) => Math.abs(c - expected[i]!) < 0.01);
}

const PANEL_BLUE = [0.1, 0.3, 0.85];
const ROUTE_ORANGE = [0.95, 0.5, 0.05];

describe('renderSitePlanPages — Standard tier', () => {
  it('renders 2 empty title-block frame pages, with no image', async () => {
    const pages = await extractPdfContent(await renderSitePlanPages({ ...baseInput, tier: 'STANDARD', premiumData: null }));

    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(pageText(page)).toContain("À compléter par l'installateur");
      expect(page.images).toHaveLength(0);
    }
  });
});

describe('renderSitePlanPages — Premium page 37', () => {
  it('draws the panel quad exactly where its pixel coordinates fall on the drawn image, never stretched to the image frame', async () => {
    const [page37] = await extractPdfContent(await renderSitePlanPages({ ...baseInput, tier: 'PREMIUM', premiumData: premiumData() }));
    const image = satelliteImage(page37!);

    const quadEdges = page37!.paths.filter((p) => colourIs(p.stroke, PANEL_BLUE) && p.points.length === 2 && p.fill === null);
    expect(quadEdges).toHaveLength(4);
    layout.panelRectangle.forEach((corner, i) => {
      const expected = expectedPdf(image, corner);
      expect(quadEdges[i]!.points[0]!.x).toBeCloseTo(expected.x, 2);
      expect(quadEdges[i]!.points[0]!.y).toBeCloseTo(expected.y, 2);
    });
    // The regression the review found: the quad's own bbox was scaled to fill the whole image.
    const xs = quadEdges.flatMap((e) => e.points.map((p) => p.x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(image.width / 2);
  });

  it('draws the wire route through its exact pixel positions, entirely inside the image (nothing off-page)', async () => {
    const [page37] = await extractPdfContent(await renderSitePlanPages({ ...baseInput, tier: 'PREMIUM', premiumData: premiumData() }));
    const image = satelliteImage(page37!);

    const routeSegments = page37!.paths.filter((p) => colourIs(p.stroke, ROUTE_ORANGE) && p.points.length === 2);
    const legendSegment = routeSegments.filter((s) => s.points[0]!.y < image.y); // the legend's sample line
    const overlaySegments = routeSegments.filter((s) => !legendSegment.includes(s));
    expect(overlaySegments).toHaveLength(layout.wireRoute.length - 1);
    overlaySegments.forEach((segment, i) => {
      const start = expectedPdf(image, layout.wireRoute[i]!);
      const end = expectedPdf(image, layout.wireRoute[i + 1]!);
      expect(segment.points[0]!.x).toBeCloseTo(start.x, 2);
      expect(segment.points[0]!.y).toBeCloseTo(start.y, 2);
      expect(segment.points[1]!.x).toBeCloseTo(end.x, 2);
      expect(segment.points[1]!.y).toBeCloseTo(end.y, 2);
      for (const p of segment.points) {
        expect(p.x).toBeGreaterThanOrEqual(image.x - 0.01);
        expect(p.x).toBeLessThanOrEqual(image.x + image.width + 0.01);
        expect(p.y).toBeGreaterThanOrEqual(image.y - 0.01);
        expect(p.y).toBeLessThanOrEqual(image.y + image.height + 0.01);
      }
    });
    expect(everythingOnPage(page37!)).toBe(true);
  });

  it('puts the three point markers (including the earth pit) at their ACTUAL positions, not at fixed corners', async () => {
    const render = async (pts: typeof points): Promise<PageContent> =>
      (await extractPdfContent(await renderSitePlanPages({ ...baseInput, tier: 'PREMIUM', premiumData: premiumData({ points: pts }) })))[0]!;
    const page37 = await render(points);
    const image = satelliteImage(page37);

    const labelFor = (page: PageContent, label: string): { x: number; y: number } => {
      // The marker label (bold, on the image) — the legend repeats each label below the image.
      const onImage = page.texts.filter((t) => t.text === label && t.y > image.y);
      expect(onImage, `${label} marker label`).toHaveLength(1);
      return onImage[0]!;
    };
    for (const [key, label] of [['technicalRoom', 'Local technique'], ['meter', 'Compteur STEG'], ['earthPit', 'Prise de terre']] as const) {
      const expected = expectedPdf(image, points[key]);
      const text = labelFor(page37, label);
      // Label baseline is 3pt below the marker centre and starts 9pt to its right (these fixture
      // points are far enough from the right edge for the label to fit on that side).
      expect(text.y).toBeCloseTo(expected.y - 3, 2);
      expect(text.x).toBeCloseTo(expected.x + 9, 2);
    }

    // Moving a point moves its marker.
    const moved = await render({ ...points, meter: { x: 500, y: 100 } });
    expect(labelFor(moved, 'Compteur STEG').y).toBeGreaterThan(labelFor(page37, 'Compteur STEG').y + 200);
  });

  it('shows a south arrow, a legend and a title block with client, French date, dossier number and installer', async () => {
    const [page37] = await extractPdfContent(await renderSitePlanPages({ ...baseInput, tier: 'PREMIUM', premiumData: premiumData() }));
    const text = pageText(page37!);

    expect(findText(page37!, 'Sud')).toBeDefined();
    expect(text).toContain('Légende');
    expect(text).toContain('Champ PV (implantation indicative)');
    expect(text).toContain('Tracé de câblage');
    expect(text).toContain('Client : Habib Khedhira');
    expect(text).toContain('Date : 25/11/2026');
    expect(text).toContain('N° dossier : 434-303');
    expect(text).toContain('Installateur : SolarPro Tunisie');
    expect(text).toContain('Esri');
  });

  it('renders the satellite image WITHOUT an overlay when no layout exists (no point placed), and says why', async () => {
    const [page37] = await extractPdfContent(
      await renderSitePlanPages({
        ...baseInput,
        tier: 'PREMIUM',
        premiumData: premiumData({ layout: null, points: { technicalRoom: null, meter: null, earthPit: null } }),
      }),
    );
    const image = satelliteImage(page37!);

    const overlayLines = page37!.paths.filter((p) => (colourIs(p.stroke, PANEL_BLUE) || colourIs(p.stroke, ROUTE_ORANGE)) && p.points.every((pt) => pt.y >= image.y));
    expect(overlayLines).toHaveLength(0);
    expect(pageText(page37!)).toContain('Implantation indicative non générée');
    expect(pageText(page37!)).toContain('Local technique (non placé)');
  });

  it('shows "Image satellite indisponible" and skips the overlay if the image cannot be embedded', async () => {
    const [page37] = await extractPdfContent(
      await renderSitePlanPages({
        ...baseInput,
        tier: 'PREMIUM',
        premiumData: premiumData({ image: { buffer: Buffer.from('not an image'), widthPx: IMAGE_PX, heightPx: IMAGE_PX } }),
      }),
    );

    expect(pageText(page37!)).toContain('Image satellite indisponible');
    expect(page37!.paths.filter((p) => colourIs(p.stroke, ROUTE_ORANGE) && p.points[0]!.y > 262)).toHaveLength(0);
  });
});

describe('renderSitePlanPages — Premium page 38', () => {
  it('draws a single pin at the site position and lists the client, GPS and installer contact details', async () => {
    const [, page38] = await extractPdfContent(await renderSitePlanPages({ ...baseInput, tier: 'PREMIUM', premiumData: premiumData() }));
    const image = satelliteImage(page38!);
    const tip = expectedPdf(image, { x: 320, y: 320 });

    // The pin: a red filled triangle whose lowest point is exactly the site position.
    const pinTriangles = page38!.paths.filter((p) => colourIs(p.fill, [0.85, 0.1, 0.1]) && p.points.length === 3);
    expect(pinTriangles).toHaveLength(1);
    const lowest = pinTriangles[0]!.points.reduce((a, b) => (b.y < a.y ? b : a));
    expect(lowest.x).toBeCloseTo(tip.x, 2);
    expect(lowest.y).toBeCloseTo(tip.y, 2);

    const text = pageText(page38!);
    expect(text).toContain('Plan de Situation');
    expect(text).toContain('Client : Habib Khedhira');
    expect(text).toContain('Adresse : Av Tahrir Hammamet');
    expect(text).toContain('Coordonnées GPS : 36.80000, 10.20000');
    expect(text).toContain('SolarPro Tunisie');
    expect(text).toContain('12 Rue de la Liberté, Tunis');
    expect(text).toContain('Tél : +216 71 234 567');
    expect(text).toContain('E-mail : contact@solarpro.tn');
    expect(everythingOnPage(page38!)).toBe(true);
  });
});

describe('renderSitePlanPages — non-WinAnsi text', () => {
  it.each(['STANDARD', 'PREMIUM'] as const)('does not throw on an Arabic client name / address / installer name (%s)', async (tier) => {
    const pages = await extractPdfContent(
      await renderSitePlanPages({
        ...baseInput,
        tier,
        clientFullName: 'حبيب خذيرة',
        clientAddress: `Rue ğ${String.fromCodePoint(0x202f)}Łódź`,
        installerName: 'شركة الطاقة',
        premiumData: tier === 'PREMIUM' ? premiumData() : null,
      }),
    );

    expect(pages).toHaveLength(2);
    if (tier === 'PREMIUM') {
      expect(pageText(pages[0]!)).toContain('Client : ???? ?????');
    }
  });
});
