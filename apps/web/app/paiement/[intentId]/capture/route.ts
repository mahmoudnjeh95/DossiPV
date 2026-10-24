import { cookies } from 'next/headers';
import { db } from '@dossipv/db';
import { validateSession } from '@dossipv/auth';
import { proofResponse } from '../../../../lib/payments/proof-response';

/** The payer's own screenshot: only the company that declared the payment can see it. */
export async function GET(_request: Request, { params }: { params: Promise<{ intentId: string }> }): Promise<Response> {
  const token = (await cookies()).get('dossipv_session')?.value;
  const user = token ? await validateSession(token) : null;
  if (!user) return new Response(null, { status: 401 });

  const { intentId } = await params;
  const intent = await db.paymentIntent.findFirst({
    where: { id: intentId, companyId: user.companyId },
    select: { proofImage: true, proofMime: true },
  });
  return proofResponse(intent);
}
