'use client';

import { useActionState } from 'react';
import { rejectPaymentAction, type PaymentDecisionState } from './actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RejectForm({ intentId }: { intentId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<PaymentDecisionState | undefined, FormData>(rejectPaymentAction.bind(null, intentId), undefined);

  return (
    <form action={formAction}>
      <Label>
        Motif du refus (lu par le client)
        <Textarea name="reason" maxLength={300} rows={2} required />
      </Label>
      <Button variant="secondary" type="submit"  disabled={pending}>
        Refuser le paiement
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
