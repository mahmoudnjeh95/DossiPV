'use client';

import { useActionState } from 'react';
import { rejectPaymentAction, type PaymentDecisionState } from './actions';

export function RejectForm({ intentId }: { intentId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<PaymentDecisionState | undefined, FormData>(rejectPaymentAction.bind(null, intentId), undefined);

  return (
    <form action={formAction}>
      <label>
        Motif du refus (lu par le client)
        <textarea name="reason" maxLength={300} rows={2} required />
      </label>
      <button type="submit" className="secondary" disabled={pending}>
        Refuser le paiement
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
