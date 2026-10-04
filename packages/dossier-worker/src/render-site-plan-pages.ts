import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Page37Layout, Page37Points } from './generate-page-37-layout';
import { drawPdfText } from './pdf-text';

export interface SitePlanPremiumData {
  page37SatelliteImage: Buffer;
  page38SatelliteImage: Buffer;
  layout: Page37Layout;
  points: Page37Points;
}

export interface SitePlanPagesInput {
  tier: 'STANDARD' | 'PREMIUM';
  clientFullName: string;
  clientAddress: string;
  gps: { lat: number; lon: number };
  installerName: string;
  premiumData: SitePlanPremiumData | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

async function embedImageSafely(doc: PDFDocument, buffer: Buffer): Promise<import('pdf-lib').PDFImage | null> {
  try {
    return await doc.embedPng(buffer);
  } catch {
    try {
      return await doc.embedJpg(buffer);
    } catch {
      return null;
    }
  }
}

function drawFrame(doc: PDFDocument, title: string, font: import('pdf-lib').PDFFont): import('pdf-lib').PDFPage {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, title, { x: 40, y: PAGE_HEIGHT - 40, size: 16, font, color: rgb(0, 0, 0) });
  page.drawRectangle({ x: 40, y: 100, width: PAGE_WIDTH - 80, height: PAGE_HEIGHT - 200, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  return page;
}

export async function renderSitePlanPages(input: SitePlanPagesInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  if (input.tier === 'STANDARD' || !input.premiumData) {
    const page37 = drawFrame(doc, "Schéma d'implantation et de connexion", font);
    drawPdfText(page37, 'À compléter par l\'installateur', { x: 60, y: PAGE_HEIGHT / 2, size: 12, font, color: rgb(0.4, 0.4, 0.4) });

    const page38 = drawFrame(doc, 'Plan de Situation', font);
    drawPdfText(page38, 'À compléter par l\'installateur', { x: 60, y: PAGE_HEIGHT / 2, size: 12, font, color: rgb(0.4, 0.4, 0.4) });

    return Buffer.from(await doc.save());
  }

  const { page37SatelliteImage, page38SatelliteImage, layout, points } = input.premiumData;

  const page37 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page37, "Schéma d'implantation et de connexion", { x: 40, y: PAGE_HEIGHT - 40, size: 16, font, color: rgb(0, 0, 0) });
  const img37 = await embedImageSafely(doc, page37SatelliteImage);
  const imageBoxY = 200;
  const imageBoxH = PAGE_HEIGHT - 300;
  const imageBoxW = PAGE_WIDTH - 80;
  if (img37) {
    page37.drawImage(img37, { x: 40, y: imageBoxY, width: imageBoxW, height: imageBoxH });
  } else {
    page37.drawRectangle({ x: 40, y: imageBoxY, width: imageBoxW, height: imageBoxH, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    drawPdfText(page37, 'Image satellite indisponible', { x: 60, y: imageBoxY + imageBoxH / 2, size: 12, font, color: rgb(0.6, 0, 0) });
  }

  // Overlay the AI-reasoned panel rectangle and wire route as simple normalized-bbox shapes —
  // a real geo-to-pixel projection is a further refinement; for v1 this maps the lat/lon
  // spread of the layout's own points onto the image box's pixel space proportionally.
  if (layout.panelRectangle.length > 0) {
    const lats = layout.panelRectangle.map((p) => p.lat);
    const lons = layout.panelRectangle.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const toPixel = (p: { lat: number; lon: number }): { x: number; y: number } => ({
      x: 40 + ((p.lon - minLon) / (maxLon - minLon || 1)) * imageBoxW,
      y: imageBoxY + ((p.lat - minLat) / (maxLat - minLat || 1)) * imageBoxH,
    });
    for (let i = 0; i < layout.panelRectangle.length; i++) {
      const a = toPixel(layout.panelRectangle[i]!);
      const b = toPixel(layout.panelRectangle[(i + 1) % layout.panelRectangle.length]!);
      page37.drawLine({ start: a, end: b, thickness: 2, color: rgb(0, 0, 0.8) });
    }
    for (let i = 0; i < layout.wireRoute.length - 1; i++) {
      const a = toPixel(layout.wireRoute[i]!);
      const b = toPixel(layout.wireRoute[i + 1]!);
      page37.drawLine({ start: a, end: b, thickness: 2, color: rgb(0.8, 0.4, 0) });
    }
  }

  if (points.technicalRoom) drawPdfText(page37, 'Local Technique', { x: 50, y: imageBoxY + imageBoxH - 20, size: 9, font, color: rgb(0, 0, 0) });
  if (points.meter) drawPdfText(page37, 'Compteur STEG', { x: 50, y: imageBoxY + 10, size: 9, font, color: rgb(0, 0, 0) });

  drawPdfText(page37, `Client : ${input.clientFullName}`, { x: 40, y: 150, size: 10, font, color: rgb(0, 0, 0) });
  drawPdfText(page37, `Installateur : ${input.installerName}`, { x: 40, y: 130, size: 10, font, color: rgb(0, 0, 0) });

  const page38 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page38, 'Plan de Situation', { x: 40, y: PAGE_HEIGHT - 40, size: 20, font, color: rgb(0, 0, 0) });
  const img38 = await embedImageSafely(doc, page38SatelliteImage);
  if (img38) {
    page38.drawImage(img38, { x: 40, y: imageBoxY, width: imageBoxW, height: imageBoxH });
  } else {
    page38.drawRectangle({ x: 40, y: imageBoxY, width: imageBoxW, height: imageBoxH, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    drawPdfText(page38, 'Image satellite indisponible', { x: 60, y: imageBoxY + imageBoxH / 2, size: 12, font, color: rgb(0.6, 0, 0) });
  }
  drawPdfText(page38, `Client : ${input.clientFullName}`, { x: 40, y: 150, size: 12, font, color: rgb(0, 0, 0) });
  drawPdfText(page38, `Adresse : ${input.clientAddress}`, { x: 40, y: 130, size: 12, font, color: rgb(0, 0, 0) });
  drawPdfText(page38, `Coordonnées : ${input.gps.lat.toFixed(5)}, ${input.gps.lon.toFixed(5)}`, { x: 40, y: 110, size: 12, font, color: rgb(0, 0, 0) });
  drawPdfText(page38, `Installateur : ${input.installerName}`, { x: 40, y: 80, size: 12, font, color: rgb(0, 0, 0) });

  return Buffer.from(await doc.save());
}
