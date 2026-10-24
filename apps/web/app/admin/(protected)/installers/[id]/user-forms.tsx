'use client';

import { useActionState } from 'react';
import {
  changeCompanyUserEmailAction,
  disableCompanyUserAction,
  enableCompanyUserAction,
  impersonateCompanyUserAction,
  sendCompanyUserResetLinkAction,
  type UserActionState,
} from './user-actions';

const USER_BUTTONS = {
  disable: { action: disableCompanyUserAction, label: 'Désactiver' },
  enable: { action: enableCompanyUserAction, label: 'Réactiver' },
  sendResetLink: { action: sendCompanyUserResetLinkAction, label: 'Envoyer un lien de réinitialisation' },
  impersonate: { action: impersonateCompanyUserAction, label: 'Se connecter en tant que' },
} as const;

/** One button acting on a user of the company, with the refusal or result shown under it. */
export function UserActionButton({
  companyId,
  userId,
  kind,
}: {
  companyId: string;
  userId: string;
  kind: keyof typeof USER_BUTTONS;
}): React.JSX.Element {
  const { action, label } = USER_BUTTONS[kind];
  const [state, formAction, pending] = useActionState<UserActionState | undefined, FormData>(
    action.bind(null, companyId, userId),
    undefined,
  );

  return (
    <form action={formAction}>
      <button type="submit" className="secondary small" disabled={pending}>
        {label}
      </button>
      {state?.notice && <p role="status">{state.notice}</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

export function ChangeEmailForm({ companyId, userId, email }: { companyId: string; userId: string; email: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<UserActionState | undefined, FormData>(
    changeCompanyUserEmailAction.bind(null, companyId, userId),
    undefined,
  );

  return (
    <form action={formAction}>
      <input type="email" name="email" required maxLength={200} defaultValue={email} aria-label="Email de connexion" />
      <button type="submit" className="secondary small" disabled={pending}>
        Changer
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
