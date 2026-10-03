'use client';

import { useActionState } from 'react';
import { deleteAcIsolatorAction, type AcIsolatorActionState } from './actions';

export function DeleteAcIsolatorButton({ acIsolatorId }: { acIsolatorId: string }): React.JSX.Element {
  const boundAction = deleteAcIsolatorAction.bind(null, acIsolatorId);
  const [state, formAction, pending] = useActionState<AcIsolatorActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending}>Supprimer</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
