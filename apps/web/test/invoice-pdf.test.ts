import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import { renderInvoicePdf, toInvoiceSafeText } from '../lib/invoicing/render-invoice-pdf';
import type { InvoiceDocument } from '../lib/invoicing/types';

const INVOICE: InvoiceDocument = {
  number: '2026-0001',
  issuedAt: new Date('2026-10-24T09:00:00Z'),
  seller: {
    name: 'SOLARIX PRO SARL',
    taxId: '1234567/A/M/000',
    address: '12 rue de la Liberté, 1002 Tunis',
    phone: '+216 71 000 000',
    email: 'facturation@dossipv.tn',
  },
  buyer: {
    name: 'Énergie Soleil Sfax',
    taxId: '7654321/B/P/000',
    commercialRegister: 'B0123452020',
    address: 'Route de Gabès km 3, Sfax',
    phone: '+216 74 111 111',
    email: 'contact@soleil.tn',
  },
  lines: [{ description: 'Abonnement Premium — 3 mois', period: '3 mois', quantity: 1, unitHtTnd: '99.160', totalHtTnd: '99.160' }],
  totalHtTnd: '99.160',
  vatRatePct: '19.00',
  vatTnd: '18.840',
  stampTnd: '1.000',
  totalTtcTnd: '119.000',
  paymentMethod: 'MANUAL',
  paidAt: new Date('2026-10-24T09:00:00Z'),
  footer: 'Merci de votre confiance. Facture acquittée.',
};

describe('renderInvoicePdf', () => {
  it('produces a one-page A4 PDF', async () => {
    const bytes = await renderInvoicePdf(INVOICE);
    if (process.env.INVOICE_PDF_OUT) writeFileSync(process.env.INVOICE_PDF_OUT, bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    expect(doc.getTitle()).toBe('Facture 2026-0001');
  });

  it('never throws on text a standard font cannot encode, and handles long content', async () => {
    const bytes = await renderInvoicePdf({
      ...INVOICE,
      buyer: { ...INVOICE.buyer, name: 'شركة الشمس ' + 'très long nom '.repeat(10), address: null },
      seller: { ...INVOICE.seller, name: '' },
      lines: Array.from({ length: 30 }, () => ({ ...INVOICE.lines[0]!, description: 'Une désignation assez longue '.repeat(5) })),
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it('keeps French text and replaces what WinAnsi cannot encode', () => {
    expect(toInvoiceSafeText('Arrêtée à l’œuvre — 5 € »')).toBe('Arrêtée à l’œuvre — 5 € »');
    expect(toInvoiceSafeText('Ğür')).toBe('Gür');
    expect(toInvoiceSafeText('شمس')).toBe('???');
  });
});
