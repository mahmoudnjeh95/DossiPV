'use client';

import { useActionState, type ReactNode } from 'react';
import { loginAction } from './actions';
import { ResendVerificationForm } from '../inscription/resend-form';
import {
  AuthBackLink,
  AuthError,
  AuthForm,
  AuthHelp,
  AuthInlineLink,
  AuthIntro,
  AuthLink,
  AuthNotice,
  AuthShell,
  AuthSubmit,
} from '@/components/auth/auth-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginFormProps {
  passwordWasReset: boolean;
  accountWasCreated: boolean;
  loginRequired: boolean;
  /** Server-rendered « contactez SolarixPro » links for suppliers (null when no contact is configured). */
  supplierContact: ReactNode;
}

export function LoginForm({
  passwordWasReset,
  accountWasCreated,
  loginRequired,
  supplierContact,
}: LoginFormProps): React.JSX.Element {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <AuthShell titleId="login-title" eyebrow="CONNEXION">
      <h2 id="login-title">Ravi de vous revoir.</h2>
      <AuthIntro>Connectez-vous pour retrouver votre espace et vos dossiers.</AuthIntro>
      {passwordWasReset && !state?.error && (
        <AuthNotice>Votre mot de passe a été changé : connectez-vous.</AuthNotice>
      )}
      {loginRequired && !passwordWasReset && !accountWasCreated && !state?.error && (
        <AuthNotice>Connectez-vous pour accéder à votre espace.</AuthNotice>
      )}
      {accountWasCreated && !state?.error && <AuthNotice>Compte créé, connectez-vous.</AuthNotice>}
      <AuthForm action={formAction}>
        <Label htmlFor="email">
          Adresse e-mail
          <Input id="email" type="email" name="email" autoComplete="email" required />
        </Label>
        <Label htmlFor="password">
          Mot de passe
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </Label>
        {state?.error && <AuthError>{state.error}</AuthError>}
        <AuthSubmit pending={pending} label="Se connecter" pendingLabel="Connexion en cours…" />
      </AuthForm>
      {state?.unverifiedEmail && <ResendVerificationForm defaultEmail={state.unverifiedEmail} />}
      <AuthLink href="/mot-de-passe-oublie">Mot de passe oublié ?</AuthLink>
      <AuthHelp>
        Pas encore de compte ? <AuthInlineLink href="/inscription">Créer un compte</AuthInlineLink>
      </AuthHelp>
      <AuthHelp>
        Vous êtes fournisseur ? Contactez SolarixPro
        {supplierContact ? <> : {supplierContact}</> : ' pour obtenir votre accès'}.
      </AuthHelp>
      <AuthHelp>Un problème d’accès ? Contactez le responsable de votre compte.</AuthHelp>
      <AuthBackLink>Retour à l’accueil</AuthBackLink>
    </AuthShell>
  );
}
