'use client';

import { useActionState } from 'react';
import { deletePvModuleAction, type PvModuleActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeletePvModuleButton({ moduleId }: { moduleId: string }): React.JSX.Element {
  const boundAction = deletePvModuleAction.bind(null, moduleId);
  const [state, formAction, pending] = useActionState<PvModuleActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>
        Supprimer
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
