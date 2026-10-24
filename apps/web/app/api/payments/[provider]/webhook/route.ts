import { db } from '@dossipv/db';
import { getProvider, providerFromSlug } from '../../../../../lib/payments/registry';
import { settlePaymentIntent } from '../../../../../lib/payments/settle';

const HEADERS = { 'Cache-Control': 'no-store' };
const reply = (status: number, body: Record<string, unknown>): Response => Response.json(body, { status, headers: HEADERS });

/**
 * Server-to-server notification of a payment provider. The call is authenticated by the provider's
 * signature (400 and no detail when it does not check out); the body is only used to find the
 * intent, whose outcome is then re-verified with the provider before anything is settled. Always
 * 200 for a genuine call, even for an unknown payment, so the provider does not retry for ever.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider: slug } = await params;
  const id = providerFromSlug(slug);
  const provider = id ? getProvider(id) : null;
  if (!id || !provider?.verifyWebhook || !provider.isEnabled()) return reply(400, { error: 'invalid' });

  const rawBody = await request.text();
  const providerReference = provider.verifyWebhook({ rawBody, headers: request.headers });
  if (!providerReference) return reply(400, { error: 'invalid' });

  try {
    const intent = await db.paymentIntent.findFirst({ where: { provider: id, providerReference }, select: { id: true } });
    if (intent) await settlePaymentIntent(intent.id);
  } catch (error) {
    console.error(`payments: webhook settlement failed (${id})`, error);
    return reply(500, { error: 'retry' }); // the provider retries; settlement is idempotent
  }
  return reply(200, { ok: true });
}
