'use client';

import { useActionState } from 'react';
import { deleteAcBreakerAction, type AcBreakerActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeleteAcBreakerButton({ acBreakerId }: { acBreakerId: string }): React.JSX.Element {
  const boundAction = deleteAcBreakerAction.bind(null, acBreakerId);
  const [state, formAction, pending] = useActionState<AcBreakerActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>Supprimer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
