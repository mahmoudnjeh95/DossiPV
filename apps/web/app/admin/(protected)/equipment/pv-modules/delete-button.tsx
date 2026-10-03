'use client';

import { useActionState } from 'react';
import { deletePvModuleAction, type PvModuleActionState } from './actions';

export function DeletePvModuleButton({ moduleId }: { moduleId: string }): React.JSX.Element {
  const boundAction = deletePvModuleAction.bind(null, moduleId);
  const [state, formAction, pending] = useActionState<PvModuleActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending}>
        Supprimer
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
