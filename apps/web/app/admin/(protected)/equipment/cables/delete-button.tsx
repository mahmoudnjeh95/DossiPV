'use client';

import { useActionState } from 'react';
import { deleteCableAction, type CableActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeleteCableButton({ cableId }: { cableId: string }): React.JSX.Element {
  const boundAction = deleteCableAction.bind(null, cableId);
  const [state, formAction, pending] = useActionState<CableActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>Supprimer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
