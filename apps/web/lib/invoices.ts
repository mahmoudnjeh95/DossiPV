/**
 * Numbered invoices (spec 2026-10-23 §8). This is the contract the payment code calls: every
 * Payment that is recorded — by the admin or settled from an online checkout — gets one invoice,
 * once. Numbers are sequential per year (2026-0001…) and never reused: the counter is incremented
 * in the same transaction as the invoice row, so a rollback gives the number back and a committed
 * invoice keeps it for good, even if its PDF could not be generated.
 */
import { db, type Prisma } from '@dossipv/db';
import { saveFile } from '@dossipv/file-storage';
import { getInvoicingSettings, type InvoicingSettings } from './platform-settings';
import { computeInvoiceAmounts, millimesToDecimalString, tndToMillimes } from './invoicing/amounts';
import { renderInvoicePdf } from './invoicing/render-invoice-pdf';
import type { InvoiceDocument, InvoiceLine, InvoiceParty } from './invoicing/types';

const DEFAULT_DESCRIPTION = 'Abonnement DossiPV';
const MAX_ATTEMPTS = 3;

/** Calendar year in Tunisia (the invoice sequence restarts on 1 January local time). */
export function invoiceYear(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric' }).format(date));
}

/** `2026`, `7` -> `"2026-0007"`. */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(4, '0')}`;
}

function monthsLabel(months: number): string {
  return `${months} mois`;
}

interface PaymentForInvoice {
  id: string;
  companyId: string;
  amountTnd: { toString(): string };
  method: string;
  note: string | null;
  createdAt: Date;
}

/** The designation of the invoice's single line, from the checkout intent when there is one. */
async function describePayment(payment: PaymentForInvoice): Promise<Pick<InvoiceLine, 'description' | 'period'>> {
  const intent = await db.paymentIntent.findUnique({ where: { paymentId: payment.id } });
  if (intent?.purpose === 'OPTION_3D') {
    return { description: `Option 3D — ${monthsLabel(intent.months)}`, period: monthsLabel(intent.months) };
  }
  if (intent?.purpose === 'SUBSCRIPTION') {
    const plan = intent.planId ? await db.plan.findUnique({ where: { id: intent.planId } }) : null;
    return {
      description: plan ? `Abonnement ${plan.name} — ${monthsLabel(intent.months)}` : `${DEFAULT_DESCRIPTION} — ${monthsLabel(intent.months)}`,
      period: monthsLabel(intent.months),
    };
  }
  const note = payment.note?.trim();
  return { description: note ? `${DEFAULT_DESCRIPTION} — ${note}` : DEFAULT_DESCRIPTION, period: null };
}

function sellerSnapshot(settings: InvoicingSettings): InvoiceParty {
  const missing = [
    !settings.sellerLegalName?.trim() && 'raison sociale',
    !settings.sellerTaxId?.trim() && 'matricule fiscal',
  ].filter(Boolean);
  if (missing.length > 0) {
    console.warn(`[invoices] Émetteur incomplet dans /admin/settings (${missing.join(', ')}) : la facture est émise avec les données disponibles.`);
  }
  return {
    name: settings.sellerLegalName?.trim() ?? '',
    taxId: settings.sellerTaxId?.trim() || null,
    address: settings.sellerAddress?.trim() || null,
    phone: settings.sellerPhone?.trim() || null,
    email: settings.sellerEmail?.trim() || null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/** Issues the invoice of a payment (idempotent: a payment has at most one) and returns its number. */
export async function issueInvoiceForPayment(paymentId: string, now: Date = new Date()): Promise<{ invoiceId: string; number: string }> {
  const existing = await db.invoice.findUnique({ where: { paymentId }, select: { id: true, number: true } });
  if (existing) {
    return { invoiceId: existing.id, number: existing.number };
  }

  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { company: true } });
  if (!payment) {
    throw new Error(`Paiement introuvable : ${paymentId}`);
  }
  const settings = await getInvoicingSettings();
  const seller = sellerSnapshot(settings);
  const company = payment.company;
  const buyer: InvoiceParty = {
    name: company.name,
    taxId: company.taxId,
    commercialRegister: company.commercialRegister,
    address: company.address,
    phone: company.phone,
    email: company.email,
  };
  const amounts = computeInvoiceAmounts(payment.amountTnd, settings.stampDutyTnd, settings.vatRatePct);
  const line: InvoiceLine = {
    ...(await describePayment(payment)),
    quantity: 1,
    unitHtTnd: millimesToDecimalString(amounts.totalHtMillimes),
    totalHtTnd: millimesToDecimalString(amounts.totalHtMillimes),
  };
  const year = invoiceYear(now);

  let invoice: { id: string; number: string } | null = null;
  for (let attempt = 1; invoice === null; attempt++) {
    try {
      invoice = await db.$transaction(async (tx) => {
        // The upsert is one atomic statement: two concurrent issuers never read the same `last`.
        const counter = await tx.invoiceCounter.upsert({
          where: { year },
          create: { year, last: 1 },
          update: { last: { increment: 1 } },
        });
        const number = formatInvoiceNumber(year, counter.last);
        const created = await tx.invoice.create({
          data: {
            number,
            year,
            sequence: counter.last,
            companyId: payment.companyId,
            paymentId,
            issuedAt: now,
            seller: seller as unknown as Prisma.InputJsonValue,
            buyer: buyer as unknown as Prisma.InputJsonValue,
            lines: [line] as unknown as Prisma.InputJsonValue,
            totalHtTnd: millimesToDecimalString(amounts.totalHtMillimes),
            vatRatePct: String(settings.vatRatePct),
            vatTnd: millimesToDecimalString(amounts.vatMillimes),
            stampTnd: millimesToDecimalString(amounts.stampMillimes),
            totalTtcTnd: millimesToDecimalString(amounts.totalTtcMillimes),
          },
          select: { id: true, number: true },
        });
        return created;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Same payment issued by someone else meanwhile: that invoice wins. Otherwise two first
      // upserts of a new year collided: the transaction was rolled back, so try again.
      const winner = await db.invoice.findUnique({ where: { paymentId }, select: { id: true, number: true } });
      if (winner) return { invoiceId: winner.id, number: winner.number };
      if (attempt >= MAX_ATTEMPTS) throw error;
    }
  }

  try {
    await regenerateInvoicePdf(invoice.id);
  } catch (error) {
    // The invoice and its number stay; the PDF is rebuilt on demand (download or regenerateInvoicePdf).
    console.error(`[invoices] PDF de la facture ${invoice.number} non généré :`, error);
  }
  return { invoiceId: invoice.id, number: invoice.number };
}

/** The invoice of a payment, or null (for the payment history tables). */
export async function invoiceForPayment(paymentId: string): Promise<{ id: string; number: string } | null> {
  return db.invoice.findUnique({ where: { paymentId }, select: { id: true, number: true } });
}

function asParty(value: unknown): InvoiceParty {
  return value as InvoiceParty;
}

/** Builds the PDF of a stored invoice from its frozen data, stores it and sets `pdfFileId`. Returns the file id. */
export async function regenerateInvoicePdf(invoiceId: string): Promise<string> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { payment: true } });
  if (!invoice) {
    throw new Error(`Facture introuvable : ${invoiceId}`);
  }
  const settings = await getInvoicingSettings();
  const document: InvoiceDocument = {
    number: invoice.number,
    issuedAt: invoice.issuedAt,
    seller: asParty(invoice.seller),
    buyer: asParty(invoice.buyer),
    lines: invoice.lines as unknown as InvoiceLine[],
    totalHtTnd: millimesToDecimalString(tndToMillimes(invoice.totalHtTnd)),
    vatRatePct: invoice.vatRatePct.toString(),
    vatTnd: millimesToDecimalString(tndToMillimes(invoice.vatTnd)),
    stampTnd: millimesToDecimalString(tndToMillimes(invoice.stampTnd)),
    totalTtcTnd: millimesToDecimalString(tndToMillimes(invoice.totalTtcTnd)),
    paymentMethod: invoice.payment.method,
    paidAt: invoice.payment.createdAt,
    footer: settings.invoiceFooter,
  };
  const bytes = await renderInvoicePdf(document);
  const fileName = invoiceDownloadName(invoice.number);
  const { storageKey } = await saveFile(Buffer.from(bytes), fileName, 'pdf');
  const file = await db.file.create({ data: { fileName, mimeType: 'pdf', storageKey } });
  await db.invoice.update({ where: { id: invoiceId }, data: { pdfFileId: file.id } });
  return file.id;
}

/** `"2026-0001"` -> `"Facture-2026-0001.pdf"`. */
export function invoiceDownloadName(number: string): string {
  return `Facture-${number}.pdf`;
}
