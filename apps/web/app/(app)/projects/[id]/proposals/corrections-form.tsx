'use client';

import { useActionState } from 'react';
import { saveBillCorrectionsAction } from './actions';

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
      <label>
        Nom du client
        <input type="text" name="fullName" maxLength={200} defaultValue={defaults.fullName} required />
      </label>
      <label>
        Référence STEG
        <input type="text" name="stegReference" maxLength={100} defaultValue={defaults.stegReference ?? ''} />
      </label>
      <label>
        Puissance souscrite (kVA)
        <input type="number" name="subscribedPowerKVA" min={1} max={100} step="any" defaultValue={defaults.subscribedPowerKVA ?? ''} required />
      </label>
      <label>
        Consommation annuelle (kWh/an)
        <input type="number" name="annualConsumptionKWh" min={1} max={1000000} step="any" defaultValue={defaults.annualConsumptionKWh ?? ''} required />
      </label>
      <button type="submit" disabled={pending}>Enregistrer et recalculer</button>
      {state?.error && <div className="banner banner-danger" role="alert" style={{ marginTop: 12 }}>{state.error}</div>}
    </form>
  );
}
