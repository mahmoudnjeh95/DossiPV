'use client';

import { useActionState } from 'react';
import { deleteProjectAction, setProjectArchivedAction, type ProjectListActionState } from './actions';
import { Button } from '@/components/ui/button';

function ActionButton({
  action,
  label,
  pendingLabel,
  variant = 'secondary',
  confirmMessage,
}: {
  action: () => Promise<ProjectListActionState | undefined>;
  label: string;
  pendingLabel: string;
  variant?: 'secondary' | 'danger';
  confirmMessage?: string;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<ProjectListActionState | undefined>(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

/** Archive or restore a project; delete it while no dossier was ever launched for it. */
export function ProjectRowActions({
  projectId,
  clientName,
  archived,
  deletable,
}: {
  projectId: string;
  clientName: string;
  archived: boolean;
  deletable: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton
        action={setProjectArchivedAction.bind(null, projectId, !archived)}
        label={archived ? 'Restaurer' : 'Archiver'}
        pendingLabel={archived ? 'Restauration…' : 'Archivage…'}
      />
      {deletable && (
        <ActionButton
          action={deleteProjectAction.bind(null, projectId)}
          label="Supprimer"
          pendingLabel="Suppression…"
          variant="danger"
          confirmMessage={`Supprimer définitivement le projet « ${clientName} » et ses pièces ? Cette action est irréversible.`}
        />
      )}
    </div>
  );
}
