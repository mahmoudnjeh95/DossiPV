'use client';

import { useActionState } from 'react';
import { saveBillCorrectionsAction } from './actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CorrectionsFormProps {
  projectId: string;
  defaults: {
    fullName: string;
    stegReference: string | null;
    subscribedPowerKVA: number | null;
    annualConsumptionKWh: number | null;
  };
}

/** Lets the installer fix or fill what the bill reading got wrong or missed. */
export function CorrectionsForm({ projectId, defaults }: CorrectionsFormProps): React.JSX.Element {
  const bound = saveBillCorrectionsAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(bound, undefined);
  return (
    <form action={formAction}>
      <Label>
        Nom du client
        <Input type="text" name="fullName" maxLength={200} defaultValue={defaults.fullName} required />
      </Label>
      <Label>
        Référence STEG
        <Input type="text" name="stegReference" maxLength={100} defaultValue={defaults.stegReference ?? ''} />
      </Label>
      <Label>
        Puissance souscrite (kVA)
        <Input type="number" name="subscribedPowerKVA" min={1} max={100} step="any" defaultValue={defaults.subscribedPowerKVA ?? ''} required />
      </Label>
      <Label>
        Consommation annuelle (kWh/an)
        <Input type="number" name="annualConsumptionKWh" min={1} max={1000000} step="any" defaultValue={defaults.annualConsumptionKWh ?? ''} required />
      </Label>
      <Button type="submit" disabled={pending}>Enregistrer et recalculer</Button>
      {state?.error && <Alert variant="danger" role="alert" style={{ marginTop: 12 }}>{state.error}</Alert>}
    </form>
  );
}
