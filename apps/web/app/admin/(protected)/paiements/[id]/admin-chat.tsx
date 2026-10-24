'use client';

import { useCallback } from 'react';
import { ChatPanel } from '../../../../../components/payments/chat-panel';
import type { ChatSnapshot } from '../../../../../lib/payments/chat';
import { sendAdminPaymentMessageAction } from '../actions';

/** The admin's chat of one payment, wired to the server action and the polling route. */
export function AdminChat({ intentId, initial }: { intentId: string; initial: ChatSnapshot }): React.JSX.Element {
  const fetchSnapshot = useCallback(async (): Promise<ChatSnapshot> => {
    const response = await fetch(`/admin/paiements/${intentId}/messages`, { cache: 'no-store' });
    if (!response.ok) throw new Error('poll failed');
    return (await response.json()) as ChatSnapshot;
  }, [intentId]);
  const send = useCallback(
    async (body: string): Promise<{ error?: string }> => {
      const formData = new FormData();
      formData.set('body', body);
      return (await sendAdminPaymentMessageAction(intentId, formData)) ?? {};
    },
    [intentId],
  );
  return <ChatPanel initial={initial} mine="ADMIN" send={send} fetchSnapshot={fetchSnapshot} />;
}
