'use client';

import { useActionState, type ReactNode } from 'react';
import { inviteInstallerAction, type InviteState } from './actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function InviteForm({ disabled, disabledReason }: { disabled: boolean; disabledReason?: ReactNode }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteInstallerAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label>
        Adresse e-mail de l’installateur
        <Input type="email" name="email" required maxLength={200} />
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || disabled}>
          {pending ? 'Envoi…' : 'Envoyer l’invitation'}
        </Button>
      </div>
      {disabled && disabledReason && (
        <p className="text-[0.8rem] font-normal text-app-muted" role="status">
          {disabledReason}
        </p>
      )}
      {state && 'error' in state && <p role="alert">{state.error}</p>}
      {state && 'sent' in state && <Alert variant="ok">Invitation envoyée à {state.sent} (valable 7 jours).</Alert>}
    </form>
  );
}
