'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import type { OwnEquipmentActionState } from './own-equipment-actions';

export interface AttachedDocuments {
  datasheet: boolean;
  homologation: boolean;
}

/**
 * The installer's own equipment form: the type's shared fields (`children`), its two documents
 * and, on creation, its purchase price.
 */
export function OwnEquipmentForm({
  action,
  attached,
  children,
}: {
  action: (prev: OwnEquipmentActionState, formData: FormData) => Promise<OwnEquipmentActionState>;
  /** Present when editing an existing item. */
  attached?: AttachedDocuments | undefined;
  children: ReactNode;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<OwnEquipmentActionState, FormData>(action, undefined);
  const editing = attached !== undefined;

  return (
    <form action={formAction} className="stack">
      <section className="card">
        <h2>Caractéristiques</h2>
        <p className="hint">
          Reprenez les valeurs de la fiche technique du fabricant : elles servent aux vérifications et aux calculs, et figurent
          dans le dossier.
        </p>
        <div className="form-grid">{children}</div>
      </section>
      <section className="card">
        <h2>{editing ? 'Documents' : 'Documents et prix'}</h2>
        <div className="form-grid">
          <label>
            {editing ? 'Remplacer la fiche technique (PDF)' : 'Fiche technique (PDF)'}
            <input type="file" name="datasheet" accept="application/pdf" />
            <span className="hint">
              {attached?.datasheet ? 'Une fiche technique est déjà jointe.' : 'Jointe en annexe du dossier STEG.'}
            </span>
          </label>
          <label>
            {editing ? "Remplacer l'attestation d'homologation (PDF)" : "Attestation d'homologation (PDF)"}
            <input type="file" name="homologationDocument" accept="application/pdf" />
            {attached?.homologation && <span className="hint">Une attestation est déjà jointe.</span>}
          </label>
          {!editing && (
            <label>
              Prix d&apos;achat (DT, optionnel)
              <input type="number" name="price" min={0} max={1000000} step="0.001" defaultValue={0} />
            </label>
          )}
        </div>
      </section>
      {state?.error && <p role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <Link href="/library" className="button secondary">
          Annuler
        </Link>
      </div>
    </form>
  );
}
