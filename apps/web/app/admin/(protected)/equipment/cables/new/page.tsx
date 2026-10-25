'use client';

import { useActionState } from 'react';
import { CableFields } from '../../../../../../components/equipment/cable-fields';
import { createCableAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewCablePage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createCableAction, undefined);

  return (
    <main>
      <h1>Ajouter un câble</h1>
      <form action={formAction}>
        <CableFields />
        <Label>
          Fiche technique (PDF) <Input type="file" name="datasheet" accept="application/pdf" />
        </Label>
        <Label>
          Attestation d&apos;homologation (PDF) <Input type="file" name="homologationDocument" accept="application/pdf" />
        </Label>
        <Button type="submit" disabled={pending}>
          Enregistrer
        </Button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
