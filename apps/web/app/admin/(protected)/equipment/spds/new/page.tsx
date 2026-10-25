'use client';

import { useActionState } from 'react';
import { SpdFields } from '../../../../../../components/equipment/spd-fields';
import { createSpdAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewSpdPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createSpdAction, undefined);

  return (
    <main>
      <h1>Ajouter un parafoudre</h1>
      <form action={formAction}>
        <SpdFields />
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
