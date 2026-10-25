'use client';

import { useActionState } from 'react';
import { acceptPendingInvitationAction, type SponsorshipActionState } from './sponsorship-actions';
import { Button } from '@/components/ui/button';

export function AcceptInvitationButton({ invitationId }: { invitationId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SponsorshipActionState>(
    acceptPendingInvitationAction.bind(null, invitationId),
    undefined,
  );
  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending}>Accepter</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
