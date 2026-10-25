'use client';

import { useActionState } from 'react';
import { resendVerificationAction } from './actions';
import {
  AuthError,
  AuthFieldHint,
  AuthForm,
  AuthNotice,
  AuthSubmit,
} from '@/components/auth/auth-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Development only (the action sets it when SMTP is not configured and NODE_ENV is not production). */
export function DevVerifyLink({ url }: { url: string | undefined }): React.JSX.Element | null {
  if (!url) return null;
  return (
    <AuthFieldHint data-testid="dev-verify-link">
      Mode développement (aucun SMTP configuré) : <a href={url}>ouvrir le lien de confirmation</a>.
    </AuthFieldHint>
  );
}

/** "Renvoyer l'email de confirmation": the address is prefilled when we know it. */
export function ResendVerificationForm({
  defaultEmail = '',
}: {
  defaultEmail?: string;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(resendVerificationAction, undefined);

  if (state?.sent) {
    return (
      <>
        <AuthNotice>{state.message}</AuthNotice>
        <DevVerifyLink url={state.devVerifyUrl} />
      </>
    );
  }
  return (
    <AuthForm action={formAction}>
      <Label htmlFor="resend-email">
        Adresse e-mail
        <Input
          id="resend-email"
          type="email"
          name="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          required
        />
      </Label>
      {state?.error && <AuthError>{state.error}</AuthError>}
      <AuthSubmit
        pending={pending}
        label="Renvoyer l’email de confirmation"
        pendingLabel="Envoi en cours…"
      />
    </AuthForm>
  );
}
