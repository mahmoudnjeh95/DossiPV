'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import { proposeSupplierProductAction, type SupplierProductActionState } from '../../actions';

/** The product's shared fields (`children`), then its datasheet file and the manufacturer's datasheet link. */
export function ProposeForm({ kind, children }: { kind: string; children: ReactNode }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SupplierProductActionState, FormData>(proposeSupplierProductAction.bind(null, kind), undefined);
  return (
    <form action={formAction} className="stack">
      <section className="card">
        <h2>Caractéristiques</h2>
        <p className="hint">Reprenez les valeurs de la fiche technique du fabricant.</p>
        <div className="form-grid">{children}</div>
      </section>
      <section className="card">
        <h2>Fiche technique</h2>
        <div className="form-grid">
          <label>
            Fiche technique (PDF)
            <input type="file" name="datasheet" accept="application/pdf" required />
          </label>
          <label>
            Lien de la fiche sur le site du fabricant
            <input type="url" name="datasheetSourceUrl" placeholder="https://" maxLength={500} required />
          </label>
        </div>
      </section>
      {state?.error && <p role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Envoi…' : 'Proposer ce produit'}
        </button>
        <Link href="/fournisseur/produits" className="button secondary">
          Annuler
        </Link>
      </div>
    </form>
  );
}
