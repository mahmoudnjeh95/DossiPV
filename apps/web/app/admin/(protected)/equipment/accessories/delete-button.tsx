'use client';

import { useActionState } from 'react';
import { deleteAccessoryAction, type AccessoryActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeleteAccessoryButton({ accessoryId }: { accessoryId: string }): React.JSX.Element {
  const boundAction = deleteAccessoryAction.bind(null, accessoryId);
  const [state, formAction, pending] = useActionState<AccessoryActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>Supprimer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
