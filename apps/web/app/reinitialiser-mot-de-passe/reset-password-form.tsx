'use client';

import { useActionState } from 'react';
import { resetPasswordAction } from './actions';
import { AuthError, AuthFieldHint, AuthForm, AuthSubmit } from '@/components/auth/auth-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// minPasswordLength comes from the server page: importing @dossipv/auth here would pull the
// database client into the browser bundle.
export function ResetPasswordForm({
  token,
  email,
  minPasswordLength,
}: {
  token: string;
  email: string;
  minPasswordLength: number;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);

  return (
    <AuthForm action={formAction}>
      <Input type="hidden" name="token" value={token} />
      <Label htmlFor="email">
        Adresse e-mail
        <Input
          id="email"
          type="email"
          name="username"
          value={email}
          autoComplete="username"
          readOnly
        />
      </Label>
      <Label htmlFor="password">
        Nouveau mot de passe
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={minPasswordLength}
          required
        />
      </Label>
      <Label htmlFor="confirmation">
        Confirmation du mot de passe
        <Input
          id="confirmation"
          type="password"
          name="confirmation"
          autoComplete="new-password"
          minLength={minPasswordLength}
          required
        />
      </Label>
      <AuthFieldHint>{minPasswordLength} caractères minimum.</AuthFieldHint>
      {state?.error && <AuthError>{state.error}</AuthError>}
      <AuthSubmit
        pending={pending}
        label="Enregistrer le mot de passe"
        pendingLabel="Enregistrement…"
      />
    </AuthForm>
  );
}
