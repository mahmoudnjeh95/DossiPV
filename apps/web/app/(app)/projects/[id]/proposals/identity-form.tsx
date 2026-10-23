'use client';

import { useActionState } from 'react';
import { saveClientIdentityAction } from './actions';

interface IdentityFormProps {
  projectId: string;
  needs: { name: boolean };
}

/** Asks only for what the bill did not give: the holder's name (the CIN is not required). */
export function IdentityForm({ projectId, needs }: IdentityFormProps): React.JSX.Element {
  const bound = saveClientIdentityAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(bound, undefined);
  return (
    <form action={formAction}>
      {needs.name && (
        <>
          <p className="muted">La facture ne porte pas le nom du titulaire.</p>
          <label>
            Nom du titulaire (comme sur le contrat STEG)
            <input type="text" name="fullName" minLength={2} maxLength={200} required />
          </label>
        </>
      )}
      <button type="submit" disabled={pending}>Enregistrer</button>
      {state?.error && <div className="banner banner-danger" role="alert" style={{ marginTop: 12 }}>{state.error}</div>}
    </form>
  );
}
