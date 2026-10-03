'use client';

import { useActionState } from 'react';
import { deleteAcBreakerAction, type AcBreakerActionState } from './actions';

export function DeleteAcBreakerButton({ acBreakerId }: { acBreakerId: string }): React.JSX.Element {
  const boundAction = deleteAcBreakerAction.bind(null, acBreakerId);
  const [state, formAction, pending] = useActionState<AcBreakerActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending}>Supprimer</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
