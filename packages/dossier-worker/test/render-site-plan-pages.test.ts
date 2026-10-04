import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderSitePlanPages } from '../src/render-site-plan-pages';

describe('renderSitePlanPages', () => {
  it('renders 2 empty title-block frame pages for STANDARD tier, with no image data required', async () => {
    const buffer = await renderSitePlanPages({
      tier: 'STANDARD',
      clientFullName: 'Habib Khedhira',
      clientAddress: 'Av Tahrir Hammamet',
      gps: { lat: 36.8, lon: 10.2 },
      installerName: 'SolarPro Tunisie',
      premiumData: null,
    });

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(2);
  });

  it('renders 2 pages with the satellite images and layout overlay for PREMIUM tier', async () => {
    const buffer = await renderSitePlanPages({
      tier: 'PREMIUM',
      clientFullName: 'Habib Khedhira',
      clientAddress: 'Av Tahrir Hammamet',
      gps: { lat: 36.8, lon: 10.2 },
      installerName: 'SolarPro Tunisie',
      premiumData: {
        page37SatelliteImage: Buffer.from('fake-png-bytes-for-page-37'),
        page38SatelliteImage: Buffer.from('fake-png-bytes-for-page-38'),
        layout: {
          panelRectangle: [{ lat: 36.8, lon: 10.2 }, { lat: 36.8001, lon: 10.2 }, { lat: 36.8001, lon: 10.2001 }, { lat: 36.8, lon: 10.2001 }],
          wireRoute: [{ lat: 36.8, lon: 10.2 }, { lat: 36.801, lon: 10.201 }],
        },
        points: { technicalRoom: { lat: 36.801, lon: 10.201 }, meter: { lat: 36.799, lon: 10.199 }, earthPit: null },
      },
    });

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(2);
  });
});
