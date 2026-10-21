'use client';

import { useActionState } from 'react';
import type { EquipmentKind } from '@dossipv/db';
import {
  addAllOfKindAction,
  addToLibraryAction,
  removeFromLibraryAction,
  type LibraryActionState,
} from './actions';

function ActionButton({ action, label }: { action: () => Promise<LibraryActionState>; label: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<LibraryActionState>(action, undefined);
  return (
    <form action={formAction}>
      <button type="submit" disabled={pending}>{label}</button>
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
