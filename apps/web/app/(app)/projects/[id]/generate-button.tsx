'use client';

import { useActionState } from 'react';
import { generateDossierAction, type GenerateDossierActionState } from './actions';

export function GenerateButton({
  projectId,
  disabled,
  reason,
}: {
  projectId: string;
  disabled: boolean;
  reason: string | null;
}): React.JSX.Element {
  const boundAction = generateDossierAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<GenerateDossierActionState | undefined>(
    boundAction,
    undefined,
  );

  return (
    <form action={formAction} className="stack">
      <div className="actions">
        <button type="submit" disabled={disabled || pending}>
          {pending ? 'Envoi…' : 'Générer le dossier'}
        </button>
        {reason && <span className="muted">{reason}</span>}
      </div>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
