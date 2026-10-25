'use client';

import { useActionState } from 'react';
import { requestPasswordResetAction } from './actions';
import {
  AuthBackLink,
  AuthError,
  AuthForm,
  AuthIntro,
  AuthNotice,
  AuthShell,
  AuthSubmit,
} from '@/components/auth/auth-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Public page (outside the (app) layout): same two-panel look as /login.
export default function ForgotPasswordPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, undefined);

  return (
    <AuthShell titleId="forgot-title" eyebrow="MOT DE PASSE OUBLIÉ">
      <h2 id="forgot-title">Choisir un nouveau mot de passe.</h2>
      {state?.sent ? (
        <AuthNotice>{state.message}</AuthNotice>
      ) : (
        <>
          <AuthIntro>
            Saisissez l’adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un
            nouveau mot de passe.
          </AuthIntro>
          <AuthForm action={formAction}>
            <Label htmlFor="email">
              Adresse e-mail
              <Input id="email" type="email" name="email" autoComplete="email" required />
            </Label>
            {state?.error && <AuthError>{state.error}</AuthError>}
            <AuthSubmit pending={pending} label="Recevoir le lien" pendingLabel="Envoi en cours…" />
          </AuthForm>
        </>
      )}
      <AuthBackLink href="/login">Retour à la connexion</AuthBackLink>
    </AuthShell>
  );
}
