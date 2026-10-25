'use client';

import { useActionState } from 'react';
import { cancelJobAction, type CancelJobActionState } from './actions';
import { Button } from '@/components/ui/button';

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
    <form action={formAction} className="flex flex-col gap-3">
      <Button variant="secondary" type="submit" disabled={pending}>
        {pending ? 'Annulation…' : 'Annuler cette génération'}
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
