'use client';

import { useActionState } from 'react';
import { markSignupContactedAction, type SignupActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MarkContactedForm({ companyId, note }: { companyId: string; note: string | null }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SignupActionState | undefined, FormData>(
    markSignupContactedAction.bind(null, companyId),
    undefined,
  );

  return (
    <form action={formAction}>
      <Label>
        Note
        <Textarea name="note" defaultValue={note ?? ''} maxLength={1000} rows={3} />
      </Label>
      <Button type="submit" disabled={pending}>
        Marquer comme contacté
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
