'use client';

import { useActionState } from 'react';
import { deleteAccessoryAction, type AccessoryActionState } from './actions';

export function DeleteAccessoryButton({ accessoryId }: { accessoryId: string }): React.JSX.Element {
  const boundAction = deleteAccessoryAction.bind(null, accessoryId);
  const [state, formAction, pending] = useActionState<AccessoryActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending}>Supprimer</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
