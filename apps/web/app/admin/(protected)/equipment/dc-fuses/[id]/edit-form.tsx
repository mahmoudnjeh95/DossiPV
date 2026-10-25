'use client';

import { useActionState } from 'react';
import type { DcFuse } from '@dossipv/db';
import { DcFuseFields } from '../../../../../../components/equipment/dc-fuse-fields';
import { updateDcFuseAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
        <Label>
          Remplacer la fiche technique (PDF) <Input type="file" name="datasheet" accept="application/pdf" />
        </Label>
        <Button type="submit" disabled={pending}>
          Enregistrer
        </Button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
