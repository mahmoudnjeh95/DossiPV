'use client';

import { useActionState } from 'react';
import { linkInstallerAction, type SponsorshipActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LinkInstallerForm({
  supplierId,
  installers,
}: {
  supplierId: string;
  installers: { id: string; name: string }[];
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SponsorshipActionState | undefined, FormData>(
    linkInstallerAction.bind(null, supplierId),
    undefined,
  );

  return (
    <form action={formAction}>
      <Label>
        Installateur
        <Select name="installerId" defaultValue="" required>
          <option value="" disabled>
            Choisir un installateur
          </option>
          {installers.map((installer) => (
            <option key={installer.id} value={installer.id}>
              {installer.name}
            </option>
          ))}
        </Select>
      </Label>
      <Button type="submit" disabled={pending}>
        Parrainer
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
