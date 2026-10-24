'use client';

import { useActionState } from 'react';
import { declareIntentAction } from '../actions';

/** Screenshot of the transfer (required) and the sender number or transfer reference (required). */
export function DeclareForm({ intentId }: { intentId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(declareIntentAction.bind(null, intentId), undefined);

  return (
    <form action={formAction}>
      <label>
        Capture d’écran du transfert (PNG, JPEG ou WebP, 8 Mo au plus)
        <input type="file" name="proof" accept="image/png,image/jpeg,image/webp" required />
      </label>
      <label>
        Numéro d’envoi ou référence du transfert
        <input type="text" name="reference" maxLength={100} required />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Envoi…' : 'J’ai envoyé le paiement'}
      </button>
      {state?.saved && <p role="status">Paiement déclaré : en attente de validation par SolarixPro.</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
