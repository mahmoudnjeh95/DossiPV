/**
 * Numbered invoices (spec 2026-10-23 §8). Written by the invoices slice of phase 5; this is the
 * contract the payment code calls: every Payment that is recorded — by the admin or settled from
 * an online checkout — gets one invoice, once.
 */

/** Issues the invoice of a payment (idempotent: a payment has at most one) and returns its number. */
export function issueInvoiceForPayment(paymentId: string): Promise<{ invoiceId: string; number: string }> {
  return Promise.reject(new Error(`issueInvoiceForPayment is not implemented yet (payment ${paymentId})`));
}
