'use client';

import { useActionState } from 'react';
import { linkInstallerAction, type SponsorshipActionState } from './actions';

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
      <label>
        Installateur
        <select name="installerId" defaultValue="" required>
          <option value="" disabled>
            Choisir un installateur
          </option>
          {installers.map((installer) => (
            <option key={installer.id} value={installer.id}>
              {installer.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending}>
        Parrainer
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
