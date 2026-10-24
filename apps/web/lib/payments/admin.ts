import { db } from '@dossipv/db';
import { unreadForAdmin } from './chat';

/** Declared payments waiting for the admin: the badge in the menu. */
export function countDeclaredIntents(): Promise<number> {
  return db.paymentIntent.count({ where: { status: 'PENDING', declaredAt: { not: null } } });
}

/** What the "Paiements" menu badge counts: payments to check plus payments with an unread payer message. */
export async function countPaymentsNeedingAttention(): Promise<number> {
  const [declared, unread] = await Promise.all([countDeclaredIntents(), unreadForAdmin()]);
  return declared + unread.size;
}
