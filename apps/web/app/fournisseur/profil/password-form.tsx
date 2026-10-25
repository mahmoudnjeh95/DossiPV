'use client';

import { useActionState } from 'react';
import { changePasswordAction, type ChangePasswordState } from './actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Mirrors @dossipv/auth (MIN_PASSWORD_LENGTH); the server action checks it anyway.
const MIN_PASSWORD_LENGTH = 10;

export function PasswordForm({ disabled }: { disabled: boolean }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label>
        Mot de passe actuel
        <Input type="password" name="currentPassword" autoComplete="current-password" required />
      </Label>
      <Label>
        Nouveau mot de passe
        <Input type="password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72} required />
      </Label>
      <Label>
        Confirmation du nouveau mot de passe
        <Input type="password" name="confirmation" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72} required />
      </Label>
      <p className="text-[0.8rem] font-normal text-app-muted">{MIN_PASSWORD_LENGTH} caractères minimum. Vos autres connexions en cours seront fermées.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || disabled}>
          {pending ? 'Enregistrement…' : 'Changer le mot de passe'}
        </Button>
      </div>
      {state && 'error' in state && <p role="alert">{state.error}</p>}
      {state && 'done' in state && <Alert variant="ok">Mot de passe changé.</Alert>}
    </form>
  );
}
