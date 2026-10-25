'use client';

import { useActionState } from 'react';
import { AuthError, AuthFieldHint, AuthForm, AuthSubmit } from '@/components/auth/auth-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  acceptInvitationAction,
  createAccountFromInvitationAction,
  type InvitationActionState,
} from './actions';

// Password rules mirror @dossipv/auth (MIN_PASSWORD_LENGTH); the server action checks them anyway.
const MIN_PASSWORD_LENGTH = 10;

export function AcceptForm({ token }: { token: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InvitationActionState>(
    acceptInvitationAction.bind(null, token),
    undefined,
  );
  return (
    <AuthForm action={formAction}>
      {state?.error && <AuthError>{state.error}</AuthError>}
      <AuthSubmit pending={pending} label="Accepter" pendingLabel="Un instant…" />
    </AuthForm>
  );
}

export function CreateAccountForm({
  token,
  email,
}: {
  token: string;
  email: string;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InvitationActionState, FormData>(
    createAccountFromInvitationAction.bind(null, token),
    undefined,
  );
  return (
    <AuthForm action={formAction}>
      <Label htmlFor="companyName">
        Raison sociale
        <Input
          id="companyName"
          name="companyName"
          autoComplete="organization"
          maxLength={200}
          required
        />
      </Label>
      <Label htmlFor="contactName">
        Nom et prénom du contact
        <Input id="contactName" name="contactName" autoComplete="name" maxLength={200} required />
      </Label>
      <Label htmlFor="phone">
        Téléphone
        <Input id="phone" type="tel" name="phone" autoComplete="tel" maxLength={30} required />
      </Label>
      <Label htmlFor="email">
        Adresse e-mail
        <Input id="email" type="email" name="email" value={email} readOnly />
      </Label>
      <Label htmlFor="anmeCode">
        Code ANME de l’installateur
        <Input id="anmeCode" name="anmeCode" minLength={3} maxLength={40} required />
      </Label>
      <Label htmlFor="password">
        Mot de passe
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={72}
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
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={72}
          required
        />
      </Label>
      <AuthFieldHint>{MIN_PASSWORD_LENGTH} caractères minimum.</AuthFieldHint>
      {state?.error && <AuthError>{state.error}</AuthError>}
      <AuthSubmit pending={pending} label="Créer mon compte" pendingLabel="Création en cours…" />
    </AuthForm>
  );
}
