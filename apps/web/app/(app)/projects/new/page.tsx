'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { importStegBillAction, type ImportBillState } from '../import-bill-actions';

export default function NewProjectPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState<ImportBillState | undefined, FormData>(
    importStegBillAction,
    undefined,
  );

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › Nouveau projet
      </p>
      <h1>Nouveau projet</h1>
      <form action={formAction} className="card stack">
        <p className="muted">
          Importez la photo ou le PDF de la facture STEG du client : le dossier se prépare automatiquement. Photographiez la dernière facture payée (papier), avec le nom du titulaire.
        </p>
        <label>
          Facture STEG
          <input type="file" name="bill" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <div className="actions">
          <button type="submit" disabled={pending}>
            {pending ? 'Lecture de la facture… (environ 30 s)' : 'Lire la facture'}
          </button>
          <Link href="/projects/new/manual" className="button secondary">
            Créer un projet sans facture
          </Link>
        </div>
      </form>
    </main>
  );
}
