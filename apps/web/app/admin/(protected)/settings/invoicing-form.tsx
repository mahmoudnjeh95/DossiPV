'use client';

import { useActionState } from 'react';
import { updateInvoicingSettingsAction } from './actions';
import type { InvoicingFormValues } from './invoicing-validation';

export function InvoicingForm({ values }: { values: InvoicingFormValues }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(updateInvoicingSettingsAction, undefined);

  return (
    <form action={formAction}>
      <label>
        Raison sociale
        <input type="text" name="sellerLegalName" defaultValue={values.sellerLegalName} maxLength={200} required />
      </label>
      <label>
        Matricule fiscal
        <input type="text" name="sellerTaxId" defaultValue={values.sellerTaxId} maxLength={40} required />
      </label>
      <label>
        Adresse
        <input type="text" name="sellerAddress" defaultValue={values.sellerAddress} maxLength={300} />
      </label>
      <label>
        Téléphone
        <input type="text" name="sellerPhone" defaultValue={values.sellerPhone} maxLength={40} />
      </label>
      <label>
        Email
        <input type="email" name="sellerEmail" defaultValue={values.sellerEmail} maxLength={200} />
      </label>
      <label>
        Taux de TVA (%)
        <input type="number" name="vatRatePct" defaultValue={values.vatRatePct} min={0} max={100} step="0.01" required />
      </label>
      <label>
        Droit de timbre (TND)
        <input type="number" name="stampDutyTnd" defaultValue={values.stampDutyTnd} min={0} step="0.001" required />
      </label>
      <label>
        Pied de facture
        <textarea name="invoiceFooter" defaultValue={values.invoiceFooter} maxLength={1000} rows={3} />
      </label>
      <button type="submit" disabled={pending}>
        Enregistrer
      </button>
      {state?.saved && <p role="status">Paramètres de facturation enregistrés.</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
