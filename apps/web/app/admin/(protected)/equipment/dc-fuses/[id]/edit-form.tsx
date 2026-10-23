'use client';

import { useActionState } from 'react';
import type { DcFuse } from '@dossipv/db';
import { DcFuseFields } from '../../../../../../components/equipment/dc-fuse-fields';
import { updateDcFuseAction } from '../actions';

export function EditDcFuseForm({ dcFuse }: { dcFuse: DcFuse }): React.JSX.Element {
  const boundAction = updateDcFuseAction.bind(null, dcFuse.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le fusible DC : {dcFuse.brand} {dcFuse.model}
      </h1>
      <form action={formAction}>
        <DcFuseFields item={dcFuse} />
        <label>
          Remplacer la fiche technique (PDF) <input type="file" name="datasheet" accept="application/pdf" />
        </label>
        <button type="submit" disabled={pending}>
          Enregistrer
        </button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
