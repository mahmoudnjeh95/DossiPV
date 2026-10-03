'use client';

import { useActionState } from 'react';
import { deleteSpdAction, type SpdActionState } from './actions';

export function DeleteSpdButton({ spdId }: { spdId: string }): React.JSX.Element {
  const boundAction = deleteSpdAction.bind(null, spdId);
  const [state, formAction, pending] = useActionState<SpdActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending}>Supprimer</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
