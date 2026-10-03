'use client';

import { useActionState } from 'react';
import { deleteDcSwitchAction, type DcSwitchActionState } from './actions';

export function DeleteDcSwitchButton({ dcSwitchId }: { dcSwitchId: string }): React.JSX.Element {
  const boundAction = deleteDcSwitchAction.bind(null, dcSwitchId);
  const [state, formAction, pending] = useActionState<DcSwitchActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending}>Supprimer</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
