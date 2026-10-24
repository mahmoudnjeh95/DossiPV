'use client';

import { useCallback } from 'react';
import { ChatPanel } from '../../../components/payments/chat-panel';
import type { ChatSnapshot } from '../../../lib/payments/chat';
import { sendPaymentMessageAction } from '../actions';

/** The payer's chat of one payment, wired to the server action and the polling route. */
export function PayerChat({ intentId, initial, canWrite, readOnlyHint }: { intentId: string; initial: ChatSnapshot; canWrite: boolean; readOnlyHint?: string }): React.JSX.Element {
  const fetchSnapshot = useCallback(async (): Promise<ChatSnapshot> => {
    const response = await fetch(`/paiement/${intentId}/messages`, { cache: 'no-store' });
    if (!response.ok) throw new Error('poll failed');
    return (await response.json()) as ChatSnapshot;
  }, [intentId]);
  const send = useCallback(
    async (body: string): Promise<{ error?: string }> => {
      const formData = new FormData();
      formData.set('body', body);
      return (await sendPaymentMessageAction(intentId, formData)) ?? {};
    },
    [intentId],
  );
  return <ChatPanel initial={initial} mine="COMPANY" send={canWrite ? send : null} fetchSnapshot={fetchSnapshot} readOnlyHint={readOnlyHint} />;
}
