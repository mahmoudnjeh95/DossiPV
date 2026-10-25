'use client';

import { useActionState } from 'react';
import { updateClaudeModelAction } from './actions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ClaudeModelForm({
  model,
  options,
}: {
  model: string;
  options: readonly { id: string; label: string }[];
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(updateClaudeModelAction, undefined);

  return (
    <form action={formAction}>
      <Label>
        Génération du texte du dossier
        <Select name="claudeModel" defaultValue={model}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Label>
      <Button type="submit" disabled={pending}>
        Enregistrer
      </Button>
      {state?.saved && <p role="status">Modèle enregistré.</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
