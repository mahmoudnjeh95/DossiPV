'use client';

import { useActionState } from 'react';
import { extendOption3dAction, type InstallerActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Option3dForm({ companyId }: { companyId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InstallerActionState | undefined, FormData>(
    extendOption3dAction.bind(null, companyId),
    undefined,
  );

  return (
    <form action={formAction}>
      <Label>
        Durée (mois)
        <Input type="number" name="months" defaultValue={1} min={1} max={24} step={1} required />
        <span className="text-[0.8rem] font-normal text-app-muted">Comptée depuis la fin actuelle de l&apos;option, ou depuis aujourd&apos;hui si elle est terminée ou absente.</span>
      </Label>
      <Button type="submit" disabled={pending}>
        Activer / prolonger l&apos;option 3D
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
