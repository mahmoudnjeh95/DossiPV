'use client';

import { useActionState } from 'react';
import { deleteAcIsolatorAction, type AcIsolatorActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeleteAcIsolatorButton({ acIsolatorId }: { acIsolatorId: string }): React.JSX.Element {
  const boundAction = deleteAcIsolatorAction.bind(null, acIsolatorId);
  const [state, formAction, pending] = useActionState<AcIsolatorActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>Supprimer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
