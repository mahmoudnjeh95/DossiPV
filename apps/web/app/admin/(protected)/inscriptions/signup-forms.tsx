'use client';

import { useActionState } from 'react';
import { markSignupContactedAction, type SignupActionState } from './actions';

export function MarkContactedForm({ companyId, note }: { companyId: string; note: string | null }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SignupActionState | undefined, FormData>(
    markSignupContactedAction.bind(null, companyId),
    undefined,
  );

  return (
    <form action={formAction}>
      <label>
        Note
        <textarea name="note" defaultValue={note ?? ''} maxLength={1000} rows={3} />
      </label>
      <button type="submit" disabled={pending}>
        Marquer comme contacté
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
