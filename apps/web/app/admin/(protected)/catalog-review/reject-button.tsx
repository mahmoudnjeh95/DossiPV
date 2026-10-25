'use client';

import { useActionState } from 'react';
import { rejectCatalogItemAction, type ReviewKind } from './actions';
import { Button } from '@/components/ui/button';

export function RejectButton({ kind, id }: { kind: ReviewKind; id: string }): React.JSX.Element {
  const boundAction = rejectCatalogItemAction.bind(null, kind, id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction}>
      <Button variant="danger" type="submit" disabled={pending}>
        Rejeter
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
