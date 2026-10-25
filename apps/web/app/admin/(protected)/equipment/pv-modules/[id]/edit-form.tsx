'use client';

import { useActionState } from 'react';
import type { PvModule } from '@dossipv/db';
import { PvModuleFields } from '../../../../../../components/equipment/pv-module-fields';
import { updatePvModuleAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditPvModuleForm({ pvModule }: { pvModule: PvModule }): React.JSX.Element {
  const boundAction = updatePvModuleAction.bind(null, pvModule.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le module : {pvModule.brand} {pvModule.model}
      </h1>
      <form action={formAction}>
        <PvModuleFields item={pvModule} />
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
