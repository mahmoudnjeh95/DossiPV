'use client';

import { useActionState } from 'react';
import type { EquipmentKind } from '@dossipv/db';
import {
  addAllOfKindAction,
  addToLibraryAction,
  removeAllOfKindAction,
  removeFromLibraryAction,
  type LibraryActionState,
} from './actions';
import { deleteOwnEquipmentAction } from './own-equipment-actions';
import { Button } from '@/components/ui/button';

function ActionButton({
  action,
  label,
  confirmMessage,
}: {
  action: () => Promise<LibraryActionState>;
  label: string;
  confirmMessage?: string;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<LibraryActionState>(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <Button type="submit" disabled={pending}>{label}</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

export function AddButton({ kind, itemId }: { kind: EquipmentKind; itemId: string }): React.JSX.Element {
  return <ActionButton action={addToLibraryAction.bind(null, kind, itemId)} label="Ajouter" />;
}

export function AddAllButton({
  kind,
}: {
  kind: 'SPD' | 'DC_SWITCH' | 'DC_FUSE' | 'AC_BREAKER' | 'AC_ISOLATOR' | 'CABLE';
}): React.JSX.Element {
  return <ActionButton action={addAllOfKindAction.bind(null, kind)} label="Tout ajouter" />;
}

export function RemoveButton({ libraryItemId }: { libraryItemId: string }): React.JSX.Element {
  return <ActionButton action={removeFromLibraryAction.bind(null, libraryItemId)} label="Retirer" />;
}

export function RemoveAllButton({ kind, count, title }: { kind: EquipmentKind; count: number; title: string }): React.JSX.Element {
  return (
    <ActionButton
      action={removeAllOfKindAction.bind(null, kind)}
      label="Retirer tout"
      confirmMessage={`Retirer de votre bibliothèque les ${count} ${title.toLowerCase()} ? Vous pourrez les ajouter à nouveau depuis le catalogue partagé.`}
    />
  );
}

export function DeleteOwnButton({ kind, itemId }: { kind: EquipmentKind; itemId: string }): React.JSX.Element {
  return (
    <ActionButton
      action={deleteOwnEquipmentAction.bind(null, kind, itemId)}
      label="Supprimer"
      confirmMessage="Supprimer définitivement cet équipement de votre matériel ?"
    />
  );
}
