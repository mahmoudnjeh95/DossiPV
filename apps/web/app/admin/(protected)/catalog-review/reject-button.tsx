'use client';

import { useActionState } from 'react';
import { rejectCatalogItemAction, type ReviewKind } from './actions';

export function RejectButton({ kind, id }: { kind: ReviewKind; id: string }): React.JSX.Element {
  const boundAction = rejectCatalogItemAction.bind(null, kind, id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction}>
      <button type="submit" className="danger" disabled={pending}>
        Rejeter
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
