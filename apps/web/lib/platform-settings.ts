import { db } from '@dossipv/db';

/** The single PlatformSettings row. */
export const PLATFORM_SETTINGS_ID = 'singleton';

/** Monthly price of the 3D option in TND, or null while the admin has not set one. */
export async function getOption3dPriceTnd(): Promise<number | null> {
  const settings = await db.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return settings?.option3dPriceTnd == null ? null : Number(settings.option3dPriceTnd);
}

export interface InvoicingSettings {
  sellerLegalName: string | null;
  sellerTaxId: string | null;
  sellerAddress: string | null;
  sellerPhone: string | null;
  sellerEmail: string | null;
  /** Percent (Prisma Decimal from the row, 19 by default). */
  vatRatePct: { toString(): string } | number;
  stampDutyTnd: { toString(): string } | number;
  invoiceFooter: string | null;
}

/** The invoicing part of the settings, with the defaults (VAT 19 %, stamp 1,000 TND) while no row exists. */
export async function getInvoicingSettings(): Promise<InvoicingSettings> {
  const settings = await db.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return {
    sellerLegalName: settings?.sellerLegalName ?? null,
    sellerTaxId: settings?.sellerTaxId ?? null,
    sellerAddress: settings?.sellerAddress ?? null,
    sellerPhone: settings?.sellerPhone ?? null,
    sellerEmail: settings?.sellerEmail ?? null,
    vatRatePct: settings?.vatRatePct ?? 19,
    stampDutyTnd: settings?.stampDutyTnd ?? 1,
    invoiceFooter: settings?.invoiceFooter ?? null,
  };
}

/** True once the seller's legal name and matricule fiscal are set: required before the first online payment. */
export function isSellerComplete(settings: Pick<InvoicingSettings, 'sellerLegalName' | 'sellerTaxId'>): boolean {
  return Boolean(settings.sellerLegalName?.trim() && settings.sellerTaxId?.trim());
}
