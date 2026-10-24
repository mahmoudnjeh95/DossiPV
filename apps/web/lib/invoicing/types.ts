/** What an Invoice row keeps (its `seller`, `buyer` and `lines` JSON columns), frozen at issue time. */

export interface InvoiceParty {
  name: string;
  taxId: string | null;
  commercialRegister?: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface InvoiceLine {
  description: string;
  /** What the line covers, e.g. "3 mois"; shown in the quantity column. */
  period: string | null;
  quantity: number;
  /** HT amounts as decimal strings with 3 decimals ("100.840"). */
  unitHtTnd: string;
  totalHtTnd: string;
}

/** Everything the PDF prints. */
export interface InvoiceDocument {
  number: string;
  issuedAt: Date;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  totalHtTnd: string;
  vatRatePct: string;
  vatTnd: string;
  stampTnd: string;
  totalTtcTnd: string;
  paymentMethod: string;
  paidAt: Date;
  footer: string | null;
}
