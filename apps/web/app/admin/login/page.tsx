'use client';

import { useActionState } from 'react';
import { loginAdminAction } from './actions';
import { AuthError, AuthForm, AuthIntro, AuthShell, AuthSubmit } from '@/components/auth/auth-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminLoginPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(loginAdminAction, undefined);

  return (
    <AuthShell story="admin" titleId="admin-login-title" eyebrow="ADMINISTRATION">
      <h2 id="admin-login-title">Connexion</h2>
      <AuthIntro>Accès réservé à l’équipe SolarixPro.</AuthIntro>
      <AuthForm action={formAction}>
        <Label htmlFor="email">
          Email
          <Input id="email" type="email" name="email" autoComplete="username" required />
        </Label>
        <Label htmlFor="password">
          Mot de passe
          <Input id="password" type="password" name="password" autoComplete="current-password" required />
        </Label>
        {state?.error && <AuthError>{state.error}</AuthError>}
        <AuthSubmit pending={pending} label="Se connecter" pendingLabel="Connexion en cours…" />
      </AuthForm>
    </AuthShell>
  );
}
