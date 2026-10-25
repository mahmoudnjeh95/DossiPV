'use client';

import { useActionState } from 'react';
import { deleteSpdAction, type SpdActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeleteSpdButton({ spdId }: { spdId: string }): React.JSX.Element {
  const boundAction = deleteSpdAction.bind(null, spdId);
  const [state, formAction, pending] = useActionState<SpdActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" variant="danger" size="sm" disabled={pending}>Supprimer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
