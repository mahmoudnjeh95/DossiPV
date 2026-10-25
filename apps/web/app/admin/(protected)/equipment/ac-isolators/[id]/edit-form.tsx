'use client';

import { useActionState } from 'react';
import type { AcIsolator } from '@dossipv/db';
import { AcIsolatorFields } from '../../../../../../components/equipment/ac-isolator-fields';
import { updateAcIsolatorAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditAcIsolatorForm({ acIsolator }: { acIsolator: AcIsolator }): React.JSX.Element {
  const boundAction = updateAcIsolatorAction.bind(null, acIsolator.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le sectionneur AC : {acIsolator.brand} {acIsolator.model}
      </h1>
      <form action={formAction}>
        <AcIsolatorFields item={acIsolator} />
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
