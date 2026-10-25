'use client';

import { useActionState } from 'react';
import { loginAdminAction } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminLoginPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(loginAdminAction, undefined);

  return (
    <main>
      <h1>Administration — Connexion</h1>
      <form action={formAction}>
        <Label>
          Email
          <Input type="email" name="email" required />
        </Label>
        <Label>
          Mot de passe
          <Input type="password" name="password" required />
        </Label>
        <Button type="submit" disabled={pending}>
          Se connecter
        </Button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
