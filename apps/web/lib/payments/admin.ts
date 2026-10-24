import { db } from '@dossipv/db';

/** Declared payments waiting for the admin: the badge in the menu. */
export function countDeclaredIntents(): Promise<number> {
  return db.paymentIntent.count({ where: { status: 'PENDING', declaredAt: { not: null } } });
}
