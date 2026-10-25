'use client';

import { useActionState } from 'react';
import { deleteDcFuseAction, type DcFuseActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeleteDcFuseButton({ dcFuseId }: { dcFuseId: string }): React.JSX.Element {
  const boundAction = deleteDcFuseAction.bind(null, dcFuseId);
  const [state, formAction, pending] = useActionState<DcFuseActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>Supprimer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
