'use client';

import { useActionState } from 'react';
import { cancelJobAction, type CancelJobActionState } from './actions';

export function CancelJobButton({
  projectId,
  jobId,
}: {
  projectId: string;
  jobId: string;
}): React.JSX.Element {
  const boundAction = cancelJobAction.bind(null, projectId, jobId);
  const [state, formAction, pending] = useActionState<CancelJobActionState | undefined>(
    boundAction,
    undefined,
  );

  return (
    <form action={formAction} className="stack">
      <button type="submit" className="secondary" disabled={pending}>
        {pending ? 'Annulation…' : 'Annuler cette génération'}
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
