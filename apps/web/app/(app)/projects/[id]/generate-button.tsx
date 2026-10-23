'use client';

import { useActionState } from 'react';
import { requestNotificationPermission } from '../../../../components/job-watcher';
import { generateDossierAction, type GenerateDossierActionState } from './actions';

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
    <form action={formAction} onSubmit={() => void requestNotificationPermission()} className="stack">
      <div className="actions">
        <button type="submit" disabled={disabled || pending}>
          {pending ? 'Envoi…' : label}
        </button>
        {reason && <span className="muted">{reason}</span>}
      </div>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
