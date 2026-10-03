'use client';

import { useActionState } from 'react';
import { recordPaymentAction, type RecordPaymentActionState } from './actions';

export function RecordPaymentForm({ companyId }: { companyId: string }): React.JSX.Element {
  const boundAction = recordPaymentAction.bind(null, companyId);
  const [state, formAction] = useActionState<RecordPaymentActionState | undefined, FormData>(boundAction, undefined);

  return (
    <form action={formAction}>
      <label>
        Montant (TND)
        <input type="number" name="amountTnd" step="0.01" required />
      </label>
      <label>
        Méthode
        <select name="method" required>
          <option value="MANUAL">Manuel</option>
          <option value="KONNECT">Konnect</option>
        </select>
      </label>
      <label>
        Note
        <input type="text" name="note" />
      </label>
      <button type="submit">Enregistrer</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
