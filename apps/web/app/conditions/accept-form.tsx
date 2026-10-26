'use client';

import { useActionState } from 'react';
import { acceptTermsAction } from './actions';
import { AuthError, AuthForm, AuthSubmit } from '@/components/auth/auth-ui';
import { TermsCheckbox } from '@/components/terms-checkbox';

export function AcceptTermsForm(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(acceptTermsAction, undefined);
  return (
    <AuthForm action={formAction}>
      {state && <AuthError>{state.error}</AuthError>}
      <TermsCheckbox />
      <AuthSubmit pending={pending} label="Accepter et continuer" pendingLabel="Enregistrement…" />
    </AuthForm>
  );
}
