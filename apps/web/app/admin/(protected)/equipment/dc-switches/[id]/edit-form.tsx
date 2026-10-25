'use client';

import { useActionState } from 'react';
import type { DcSwitch } from '@dossipv/db';
import { DcSwitchFields } from '../../../../../../components/equipment/dc-switch-fields';
import { updateDcSwitchAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditDcSwitchForm({ dcSwitch }: { dcSwitch: DcSwitch }): React.JSX.Element {
  const boundAction = updateDcSwitchAction.bind(null, dcSwitch.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le sectionneur DC : {dcSwitch.brand} {dcSwitch.model}
      </h1>
      <form action={formAction}>
        <DcSwitchFields item={dcSwitch} />
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
