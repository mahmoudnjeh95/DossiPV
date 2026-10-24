import { cookies } from 'next/headers';
import { db } from '@dossipv/db';
import { validateSuperAdminSession } from '@dossipv/auth';
import { chatSnapshot, markReadByAdmin } from '../../../../../../lib/payments/chat';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The chat of any payment, for the super admin's polling panel; reading marks the payer's messages read. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const token = (await cookies()).get('dossipv_admin_session')?.value;
  const admin = token ? await validateSuperAdminSession(token) : null;
  if (!admin) return new Response(null, { status: 401, headers: NO_STORE });

  const { id } = await params;
  const intent = await db.paymentIntent.findUnique({ where: { id }, select: { id: true, status: true, paidAt: true } });
  if (!intent) return new Response(null, { status: 404, headers: NO_STORE });
  const snapshot = await chatSnapshot(intent);
  await markReadByAdmin(intent.id);
  return Response.json(snapshot, { headers: NO_STORE });
}
