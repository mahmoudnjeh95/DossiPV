'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <main>
      <h1>Connexion</h1>
      <form action={formAction}>
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Mot de passe
          <input type="password" name="password" required />
        </label>
        <button type="submit" disabled={pending}>
          Se connecter
        </button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
