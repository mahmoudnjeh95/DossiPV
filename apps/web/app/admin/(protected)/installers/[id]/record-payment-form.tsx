'use client';

import { useActionState } from 'react';
import { recordPaymentAction, type RecordPaymentActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RecordPaymentForm({ companyId }: { companyId: string }): React.JSX.Element {
  const boundAction = recordPaymentAction.bind(null, companyId);
  const [state, formAction] = useActionState<RecordPaymentActionState | undefined, FormData>(boundAction, undefined);

  return (
    <form action={formAction}>
      <Label>
        Montant (TND)
        <Input type="number" name="amountTnd" step="0.01" min="0.01" required />
      </Label>
      <Label>
        Méthode
        <Select name="method" required>
          <option value="MANUAL">Manuel</option>
          <option value="KONNECT">Konnect</option>
        </Select>
      </Label>
      <Label>
        Note
        <Input type="text" name="note" />
      </Label>
      <Label>
        Prolonger l&apos;abonnement de (mois)
        <Input type="number" name="extendMonths" defaultValue={1} min={0} max={24} step={1} />
        <span className="text-[0.8rem] font-normal text-app-muted">Compté depuis la fin actuelle, ou depuis aujourd&apos;hui si l&apos;abonnement est terminé. 0 : ne pas prolonger. Pour fixer une date précise, utilisez plutôt « Nouvelle fin de période » ci-dessus : ce champ n&apos;est qu&apos;un nombre de mois ajoutés à ce paiement.</span>
      </Label>
      <p className="text-[0.8rem] font-normal text-app-muted">Une facture sera émise. Le montant saisi est le total TTC payé (droit de timbre compris).</p>
      <Button type="submit">Enregistrer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
