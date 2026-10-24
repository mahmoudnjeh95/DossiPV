'use client';

import { useActionState, type ReactNode } from 'react';
import { inviteInstallerAction, type InviteState } from './actions';

export function InviteForm({ disabled, disabledReason }: { disabled: boolean; disabledReason?: ReactNode }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteInstallerAction, undefined);
  return (
    <form action={formAction} className="stack">
      <label>
        Adresse e-mail de l’installateur
        <input type="email" name="email" required maxLength={200} />
      </label>
      <div className="actions">
        <button type="submit" disabled={pending || disabled}>
          {pending ? 'Envoi…' : 'Envoyer l’invitation'}
        </button>
      </div>
      {disabled && disabledReason && (
        <p className="hint" role="status">
          {disabledReason}
        </p>
      )}
      {state && 'error' in state && <p role="alert">{state.error}</p>}
      {state && 'sent' in state && <div className="banner banner-ok">Invitation envoyée à {state.sent} (valable 7 jours).</div>}
    </form>
  );
}
