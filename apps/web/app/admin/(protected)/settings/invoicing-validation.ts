import { FormReader } from '../../../../lib/form-reader';

/** The invoicing form's fields as strings, to pre-fill the inputs. */
export interface InvoicingFormValues {
  sellerLegalName: string;
  sellerTaxId: string;
  sellerAddress: string;
  sellerPhone: string;
  sellerEmail: string;
  vatRatePct: string;
  stampDutyTnd: string;
  invoiceFooter: string;
}

export interface InvoicingSettingsInput {
  sellerLegalName: string;
  sellerTaxId: string;
  sellerAddress: string | null;
  sellerPhone: string | null;
  sellerEmail: string | null;
  vatRatePct: number;
  stampDutyTnd: number;
  invoiceFooter: string | null;
}

// Loose on purpose: Tunisian matricules look like "1234567/A/M/000" or "1234567ABC000", and
// foreign or older forms exist. Letters, digits, and the usual separators, at least 5 characters.
const TAX_ID_PATTERN = /^[0-9A-Za-z][0-9A-Za-z/ .\-]{3,38}[0-9A-Za-z]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads and validates the "Facturation" form. Errors are collected on the reader. */
export function readInvoicingSettings(reader: FormReader): InvoicingSettingsInput {
  const sellerLegalName = reader.text('sellerLegalName', 'Raison sociale', 200);
  const sellerTaxId = reader.text('sellerTaxId', 'Matricule fiscal', 40);
  if (sellerTaxId !== '' && !TAX_ID_PATTERN.test(sellerTaxId)) {
    reader.errors.push('Matricule fiscal : format invalide (lettres, chiffres, « / », « - »).');
  }
  const sellerEmail = reader.optionalText('sellerEmail', 'Email', 200);
  if (sellerEmail !== null && !EMAIL_PATTERN.test(sellerEmail)) {
    reader.errors.push('Email : adresse invalide.');
  }
  return {
    sellerLegalName,
    sellerTaxId,
    sellerAddress: reader.optionalText('sellerAddress', 'Adresse', 300),
    sellerPhone: reader.optionalText('sellerPhone', 'Téléphone', 40),
    sellerEmail,
    vatRatePct: reader.number('vatRatePct', 'Taux de TVA (%)', { min: 0, max: 100 }),
    stampDutyTnd: reader.number('stampDutyTnd', 'Droit de timbre (TND)', { min: 0, max: 1000 }),
    invoiceFooter: reader.optionalText('invoiceFooter', 'Pied de facture', 1000),
  };
}
