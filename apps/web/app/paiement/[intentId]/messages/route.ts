import { cookies } from 'next/headers';
import { db } from '@dossipv/db';
import { validateSession } from '@dossipv/auth';
import { chatSnapshot, markReadByCompany } from '../../../../lib/payments/chat';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * The chat of a payment of the caller's company, for the polling panel. Another company's payment
 * is a 404; reading marks the admin's messages read, except in a support session (the admin
 * looking through the payer's eyes must not clear what the payer has not seen).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ intentId: string }> }): Promise<Response> {
  const token = (await cookies()).get('dossipv_session')?.value;
  const user = token ? await validateSession(token) : null;
  if (!user) return new Response(null, { status: 401, headers: NO_STORE });

  const { intentId } = await params;
  const intent = await db.paymentIntent.findFirst({ where: { id: intentId, companyId: user.companyId }, select: { id: true, status: true, paidAt: true } });
  if (!intent) return new Response(null, { status: 404, headers: NO_STORE });
  const snapshot = await chatSnapshot(intent);
  if (!user.impersonatedBySuperAdminId) await markReadByCompany(intent.id);
  return Response.json(snapshot, { headers: NO_STORE });
}
