'use client';

import { useActionState } from 'react';
import { deleteInverterAction, type InverterActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeleteInverterButton({ inverterId }: { inverterId: string }): React.JSX.Element {
  const boundAction = deleteInverterAction.bind(null, inverterId);
  const [state, formAction, pending] = useActionState<InverterActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>Supprimer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
