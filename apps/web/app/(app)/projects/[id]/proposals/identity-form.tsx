'use client';

import { useActionState } from 'react';
import { saveClientIdentityAction } from './actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface IdentityFormProps {
  projectId: string;
  needs: { name: boolean };
}

/** Asks only for what the bill did not give: the holder's name (the CIN is not required). */
export function IdentityForm({ projectId, needs }: IdentityFormProps): React.JSX.Element {
  const bound = saveClientIdentityAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(bound, undefined);
  return (
    <form action={formAction}>
      {needs.name && (
        <>
          <p className="text-app-muted">La facture ne porte pas le nom du titulaire.</p>
          <Label>
            Nom du titulaire (comme sur le contrat STEG)
            <Input type="text" name="fullName" minLength={2} maxLength={200} required />
          </Label>
        </>
      )}
      <Button type="submit" disabled={pending}>Enregistrer</Button>
      {state?.error && <Alert variant="danger" role="alert" style={{ marginTop: 12 }}>{state.error}</Alert>}
    </form>
  );
}
