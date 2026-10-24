'use client';

import { useActionState } from 'react';
import { extendOption3dAction, type InstallerActionState } from './actions';

export function Option3dForm({ companyId }: { companyId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InstallerActionState | undefined, FormData>(
    extendOption3dAction.bind(null, companyId),
    undefined,
  );

  return (
    <form action={formAction}>
      <label>
        Durée (mois)
        <input type="number" name="months" defaultValue={1} min={1} max={24} step={1} required />
        <span className="hint">Comptée depuis la fin actuelle de l&apos;option, ou depuis aujourd&apos;hui si elle est terminée ou absente.</span>
      </label>
      <button type="submit" disabled={pending}>
        Activer / prolonger l&apos;option 3D
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
