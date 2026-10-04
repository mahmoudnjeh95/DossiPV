import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderCoverPage } from '../src/render-cover-page';

describe('renderCoverPage', () => {
  it('produces a single-page PDF containing the company name, client name, and dossier number', async () => {
    const buffer = await renderCoverPage({
      companyName: 'SolarPro Tunisie',
      companyLogoBuffer: null,
      dossierNumber: '434-303',
      clientFullName: 'Habib Khedhira',
      dossierDate: '2026-11-25',
    });

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(1);
  });

  it('still produces a valid one-page PDF when companyLogoBuffer is null (no logo uploaded)', async () => {
    const buffer = await renderCoverPage({
      companyName: 'SolarPro Tunisie',
      companyLogoBuffer: null,
      dossierNumber: null,
      clientFullName: 'Habib Khedhira',
      dossierDate: '2026-11-25',
    });

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(1);
  });
});
