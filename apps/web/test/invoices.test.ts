/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/require-await, @typescript-eslint/only-throw-error, @typescript-eslint/unbound-method -- mocked modules of loosely typed call arguments */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface InvoiceRow {
  id: string;
  number: string;
  paymentId: string;
  [key: string]: unknown;
}

const m = vi.hoisted(() => ({
  counters: new Map<number, number>(),
  invoices: [] as InvoiceRow[],
  payments: new Map<string, Record<string, unknown>>(),
  settings: { current: null as Record<string, unknown> | null },
  intent: { current: null as Record<string, unknown> | null },
  plan: { current: null as Record<string, unknown> | null },
  saveFile: vi.fn(),
  renderFail: { current: false },
  fileCreate: vi.fn(),
  invoiceUpdate: vi.fn(),
  failNextCreateWith: { current: null as unknown },
}));

vi.mock('@dossipv/file-storage', () => ({ saveFile: m.saveFile }));
vi.mock('../lib/invoicing/render-invoice-pdf', () => ({
  renderInvoicePdf: vi.fn(async () => {
    if (m.renderFail.current) throw new Error('pdf boom');
    return new Uint8Array([37, 80, 68, 70]);
  }),
}));
vi.mock('@dossipv/db', () => {
  const tx = {
    invoiceCounter: {
      upsert: vi.fn(async ({ where, create, update }: { where: { year: number }; create: { last: number }; update: { last: { increment: number } } }) => {
        const next = m.counters.has(where.year) ? m.counters.get(where.year)! + update.last.increment : create.last;
        m.counters.set(where.year, next);
        return { year: where.year, last: next };
      }),
    },
    invoice: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (m.failNextCreateWith.current) {
          const error = m.failNextCreateWith.current;
          m.failNextCreateWith.current = null;
          throw error;
        }
        const row = { id: `inv-${m.invoices.length + 1}`, ...data } as InvoiceRow;
        m.invoices.push(row);
        return row;
      }),
    },
  };
  const db = {
    ...tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
      // Rolls the counter back and drops rows created inside when the callback throws.
      const counters = new Map(m.counters);
      const count = m.invoices.length;
      try {
        return await fn(tx);
      } catch (error) {
        m.counters = counters;
        m.invoices.length = count;
        throw error;
      }
    }),
    invoice: {
      ...tx.invoice,
      findUnique: vi.fn(async ({ where }: { where: { paymentId?: string; id?: string } }) => {
        const row = m.invoices.find((invoice) => (where.paymentId ? invoice.paymentId === where.paymentId : invoice.id === where.id));
        if (!row) return null;
        return { ...row, payment: m.payments.get(row.paymentId), pdfFile: null };
      }),
      update: m.invoiceUpdate,
    },
    payment: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => m.payments.get(where.id) ?? null) },
    paymentIntent: { findUnique: vi.fn(async () => m.intent.current) },
    plan: { findUnique: vi.fn(async () => m.plan.current) },
    platformSettings: { findUnique: vi.fn(async () => m.settings.current) },
    file: { create: m.fileCreate },
  };
  return { db };
});

import { issueInvoiceForPayment, regenerateInvoicePdf, invoiceYear, formatInvoiceNumber } from '../lib/invoices';

const COMPANY = {
  id: 'company-1',
  name: 'Soleil SARL',
  address: 'Sfax',
  phone: '74000000',
  email: 'a@b.tn',
  taxId: '123/A/M/000',
  commercialRegister: 'B0123',
};

function addPayment(id: string, amountTnd: string, note: string | null = null): void {
  m.payments.set(id, {
    id,
    companyId: 'company-1',
    amountTnd,
    method: 'MANUAL',
    note,
    createdAt: new Date('2026-10-24T09:00:00Z'),
    company: COMPANY,
  });
}

const NOW = new Date('2026-10-24T09:00:00Z');

beforeEach(() => {
  m.counters = new Map();
  m.invoices = [];
  m.payments = new Map();
  m.settings.current = {
    sellerLegalName: 'SOLARIX PRO SARL',
    sellerTaxId: '1234567/A/M/000',
    sellerAddress: 'Tunis',
    sellerPhone: null,
    sellerEmail: null,
    vatRatePct: '19.00',
    stampDutyTnd: '1.000',
    invoiceFooter: null,
  };
  m.intent.current = null;
  m.plan.current = null;
  m.renderFail.current = false;
  m.failNextCreateWith.current = null;
  m.saveFile.mockReset();
  m.saveFile.mockResolvedValue({ storageKey: 'equipment/x-Facture.pdf' });
  m.fileCreate.mockReset();
  m.fileCreate.mockResolvedValue({ id: 'file-1' });
  m.invoiceUpdate.mockReset();
  addPayment('p1', '119.00');
  addPayment('p2', '59.50');
  addPayment('p3', '10.00');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('numbering', () => {
  it('formats and derives the year in Tunisian time', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('2026-0001');
    expect(formatInvoiceNumber(2026, 12345)).toBe('2026-12345');
    expect(invoiceYear(new Date('2026-12-31T23:30:00Z'))).toBe(2027); // already 1 January in Tunis (UTC+1)
    expect(invoiceYear(new Date('2026-06-15T12:00:00Z'))).toBe(2026);
  });

  it('numbers sequentially within a year', async () => {
    const a = await issueInvoiceForPayment('p1', NOW);
    const b = await issueInvoiceForPayment('p2', NOW);
    expect([a.number, b.number]).toEqual(['2026-0001', '2026-0002']);
    expect(m.invoices.map((invoice) => invoice.sequence)).toEqual([1, 2]);
  });

  it('restarts the sequence each year', async () => {
    await issueInvoiceForPayment('p1', NOW);
    await issueInvoiceForPayment('p2', NOW);
    const next = await issueInvoiceForPayment('p3', new Date('2027-01-05T10:00:00Z'));
    expect(next.number).toBe('2027-0001');
  });

  it('gives concurrent issuers distinct numbers (atomic counter increment)', async () => {
    const results = await Promise.all([issueInvoiceForPayment('p1', NOW), issueInvoiceForPayment('p2', NOW), issueInvoiceForPayment('p3', NOW)]);
    expect(new Set(results.map((result) => result.number)).size).toBe(3);
    expect(m.counters.get(2026)).toBe(3);
  });

  it('retries when two first-of-year issuers collide on the counter row', async () => {
    m.failNextCreateWith.current = Object.assign(new Error('unique'), { code: 'P2002' });
    const result = await issueInvoiceForPayment('p1', NOW);
    expect(result.number).toBe('2026-0001');
    expect(m.counters.get(2026)).toBe(1); // the failed attempt gave its number back
  });

  it('never reuses a number whose PDF failed', async () => {
    m.renderFail.current = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = await issueInvoiceForPayment('p1', NOW);
    expect(first.number).toBe('2026-0001');
    expect(m.invoices).toHaveLength(1);
    m.renderFail.current = false;
    const second = await issueInvoiceForPayment('p2', NOW);
    expect(second.number).toBe('2026-0002');
  });
});

describe('idempotence', () => {
  it('returns the existing invoice of a payment without taking a number', async () => {
    const first = await issueInvoiceForPayment('p1', NOW);
    const again = await issueInvoiceForPayment('p1', NOW);
    expect(again).toEqual(first);
    expect(m.invoices).toHaveLength(1);
    expect(m.counters.get(2026)).toBe(1);
  });

  it('returns the winner when the same payment is issued concurrently', async () => {
    // The other issuer commits between our lookup and our create: the unique paymentId refuses ours.
    m.failNextCreateWith.current = Object.assign(new Error('unique'), { code: 'P2002' });
    m.invoices.push({ id: 'inv-winner', number: '2026-0007', paymentId: 'p1' });
    const { db } = await import('@dossipv/db');
    const findUnique = vi.mocked(db.invoice.findUnique);
    findUnique.mockResolvedValueOnce(null); // first lookup: nothing yet
    const result = await issueInvoiceForPayment('p1', NOW);
    expect(result).toEqual({ invoiceId: 'inv-winner', number: '2026-0007' });
  });

  it('rejects an unknown payment', async () => {
    await expect(issueInvoiceForPayment('nope', NOW)).rejects.toThrow(/introuvable/);
  });
});

describe('snapshot and amounts', () => {
  it('freezes seller, buyer, the single line and the back-computed amounts', async () => {
    await issueInvoiceForPayment('p1', NOW);
    const row = m.invoices[0]!;
    expect(row.seller).toMatchObject({ name: 'SOLARIX PRO SARL', taxId: '1234567/A/M/000', address: 'Tunis' });
    expect(row.buyer).toMatchObject({ name: 'Soleil SARL', taxId: '123/A/M/000', commercialRegister: 'B0123', address: 'Sfax' });
    expect(row.lines).toEqual([
      { description: 'Abonnement DossiPV', period: null, quantity: 1, unitHtTnd: '99.160', totalHtTnd: '99.160' },
    ]);
    expect(row).toMatchObject({ totalHtTnd: '99.160', vatTnd: '18.840', stampTnd: '1.000', totalTtcTnd: '119.000', vatRatePct: '19.00', year: 2026 });
  });

  it('uses the admin payment note in the designation', async () => {
    addPayment('p4', '119', 'Virement mars');
    await issueInvoiceForPayment('p4', NOW);
    expect((m.invoices[0]!.lines as { description: string }[])[0]!.description).toBe('Abonnement DossiPV — Virement mars');
  });

  it('describes a subscription checkout by plan and months, and the 3D option', async () => {
    m.intent.current = { purpose: 'SUBSCRIPTION', planId: 'plan-1', months: 3 };
    m.plan.current = { name: 'Premium' };
    await issueInvoiceForPayment('p1', NOW);
    expect(m.invoices[0]!.lines).toMatchObject([{ description: 'Abonnement Premium — 3 mois', period: '3 mois' }]);

    m.intent.current = { purpose: 'OPTION_3D', planId: null, months: 1 };
    await issueInvoiceForPayment('p2', NOW);
    expect(m.invoices[1]!.lines).toMatchObject([{ description: 'Option 3D — 1 mois' }]);
  });

  it('issues with the available data and warns when the seller is incomplete', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    m.settings.current = null; // nothing configured: defaults for VAT and stamp
    const result = await issueInvoiceForPayment('p1', NOW);
    expect(result.number).toBe('2026-0001');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('raison sociale, matricule fiscal'));
    expect(m.invoices[0]).toMatchObject({ totalHtTnd: '99.160', stampTnd: '1.000' });
  });

  it('keeps a manual payment without stamp as TTC', async () => {
    m.settings.current = { ...m.settings.current!, stampDutyTnd: '0.000' };
    await issueInvoiceForPayment('p1', NOW);
    expect(m.invoices[0]).toMatchObject({ totalHtTnd: '100.000', vatTnd: '19.000', stampTnd: '0.000', totalTtcTnd: '119.000' });
  });
});

describe('PDF storage', () => {
  it('stores the PDF, creates a File row and links it to the invoice', async () => {
    const { invoiceId } = await issueInvoiceForPayment('p1', NOW);
    expect(m.saveFile).toHaveBeenCalledWith(expect.any(Buffer), 'Facture-2026-0001.pdf', 'pdf');
    expect(m.fileCreate).toHaveBeenCalledWith({ data: { fileName: 'Facture-2026-0001.pdf', mimeType: 'pdf', storageKey: 'equipment/x-Facture.pdf' } });
    expect(m.invoiceUpdate).toHaveBeenCalledWith({ where: { id: invoiceId }, data: { pdfFileId: 'file-1' } });
  });

  it('keeps the invoice when the PDF fails, and regenerates it on demand', async () => {
    m.renderFail.current = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { invoiceId, number } = await issueInvoiceForPayment('p1', NOW);
    expect(number).toBe('2026-0001');
    expect(m.invoiceUpdate).not.toHaveBeenCalled();

    m.renderFail.current = false;
    await expect(regenerateInvoicePdf(invoiceId)).resolves.toBe('file-1');
    expect(m.invoiceUpdate).toHaveBeenCalledWith({ where: { id: invoiceId }, data: { pdfFileId: 'file-1' } });
  });

  it('rejects regenerating an unknown invoice', async () => {
    await expect(regenerateInvoicePdf('nope')).rejects.toThrow(/introuvable/);
  });
});
