'use client';

import { useActionState } from 'react';
import { deleteDcSwitchAction, type DcSwitchActionState } from './actions';
import { Button } from '@/components/ui/button';

export function DeleteDcSwitchButton({ dcSwitchId }: { dcSwitchId: string }): React.JSX.Element {
  const boundAction = deleteDcSwitchAction.bind(null, dcSwitchId);
  const [state, formAction, pending] = useActionState<DcSwitchActionState | undefined>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>Supprimer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
