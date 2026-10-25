'use client';

import { useActionState } from 'react';
import type { Inverter } from '@dossipv/db';
import { InverterFields } from '../../../../../../components/equipment/inverter-fields';
import { updateInverterAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditInverterForm({ inverter }: { inverter: Inverter }): React.JSX.Element {
  const boundAction = updateInverterAction.bind(null, inverter.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier l&apos;onduleur : {inverter.brand} {inverter.model}
      </h1>
      <form action={formAction}>
        <InverterFields item={inverter} />
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
