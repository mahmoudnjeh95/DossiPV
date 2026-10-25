'use client';

import { useActionState } from 'react';
import { requestNotificationPermission } from '../../../../components/job-watcher';
import { generateDossierAction, type GenerateDossierActionState } from './actions';
import { Button } from '@/components/ui/button';

export function GenerateButton({
  projectId,
  disabled,
  reason,
  label = 'Générer le dossier',
}: {
  projectId: string;
  disabled: boolean;
  reason: string | null;
  label?: string;
}): React.JSX.Element {
  const boundAction = generateDossierAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<GenerateDossierActionState | undefined>(
    boundAction,
    undefined,
  );

  return (
    // The click is the moment a browser lets the page ask to notify the end of the generation.
    <form action={formAction} onSubmit={() => void requestNotificationPermission()} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={disabled || pending}>
          {pending ? 'Envoi…' : label}
        </Button>
        {reason && <span className="text-app-muted">{reason}</span>}
      </div>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
