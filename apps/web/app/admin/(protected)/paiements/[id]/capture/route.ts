import { cookies } from 'next/headers';
import { db } from '@dossipv/db';
import { validateSuperAdminSession } from '@dossipv/auth';
import { proofResponse } from '../../../../../../lib/payments/proof-response';

/** The screenshot of any declared payment, for the super admin only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const token = (await cookies()).get('dossipv_admin_session')?.value;
  const admin = token ? await validateSuperAdminSession(token) : null;
  if (!admin) return new Response(null, { status: 401 });

  const { id } = await params;
  const intent = await db.paymentIntent.findUnique({ where: { id }, select: { proofImage: true, proofMime: true } });
  return proofResponse(intent);
}
