'use client';

import { useActionState } from 'react';
import { acceptPendingInvitationAction, type SponsorshipActionState } from './sponsorship-actions';

export function AcceptInvitationButton({ invitationId }: { invitationId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SponsorshipActionState>(
    acceptPendingInvitationAction.bind(null, invitationId),
    undefined,
  );
  return (
    <form action={formAction}>
      <button type="submit" disabled={pending}>Accepter</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
