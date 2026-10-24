import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CreateCheckoutInput, CreatedCheckout, PaymentProvider, ProviderPaymentStatus, WebhookRequest } from './types';

/**
 * Flouci (https://docs.flouci.com, read 2026-10-24). Authorization is `Bearer <public>:<private>`;
 * the same host serves the sandbox and production, only the keys differ. Amounts are in millimes.
 * The browser return is never trusted: the status always comes from `verify_payment`.
 */
const DEFAULT_BASE_URL = 'https://developers.flouci.com';
const REQUEST_TIMEOUT_MS = 15_000;
/** Flouci says to reject webhook timestamps older than a few minutes. */
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

const baseUrl = (): string => (process.env.FLOUCI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
const publicKey = (): string => process.env.FLOUCI_APP_TOKEN?.trim() ?? '';
const privateKey = (): string => process.env.FLOUCI_APP_SECRET?.trim() ?? '';
const authorization = (): string => `Bearer ${publicKey()}:${privateKey()}`;

async function flouciFetch(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { Authorization: authorization(), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Flouci a répondu ${response.status}`);
  return body;
}

/** Flouci statuses: SUCCESS, PENDING (still payable), EXPIRED, FAILURE, SYSTEM_FAILURE, PREAUTH_SUCCESS. */
export function mapFlouciStatus(status: unknown): ProviderPaymentStatus {
  if (status === 'SUCCESS') return 'PAID';
  if (status === 'FAILURE' || status === 'EXPIRED' || status === 'SYSTEM_FAILURE') return 'FAILED';
  return 'PENDING';
}

/** `t=<unix seconds>,v1=<hex>` */
function parseSignature(header: string | null): { t: string; v1: string } | null {
  if (!header) return null;
  const parts: Record<string, string> = {};
  for (const part of header.split(',')) {
    const [key, ...value] = part.trim().split('=');
    if (key) parts[key] = value.join('=');
  }
  return parts.t && parts.v1 ? { t: parts.t, v1: parts.v1 } : null;
}

export const flouciProvider: PaymentProvider = {
  id: 'FLOUCI',
  label: 'Flouci',
  isEnabled: () => publicKey() !== '' && privateKey() !== '',

  async createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
    const body = (await flouciFetch('/api/v2/generate_payment', {
      method: 'POST',
      body: JSON.stringify({
        amount: String(Math.round(input.amountTnd * 1000)),
        success_link: input.successUrl,
        fail_link: input.failUrl,
        webhook: input.webhookUrl,
        webhook_version: 2,
        developer_tracking_id: input.intentId,
        accept_card: true,
      }),
    })) as { result?: { success?: boolean; payment_id?: string; link?: string } } | null;
    const result = body?.result;
    if (!result?.success || !result.payment_id || !result.link) {
      throw new Error('Flouci n’a pas créé le paiement');
    }
    return { providerReference: result.payment_id, checkoutUrl: result.link };
  },

  async verify(providerReference: string): Promise<ProviderPaymentStatus> {
    const body = (await flouciFetch(`/api/v2/verify_payment/${encodeURIComponent(providerReference)}`, { method: 'GET' })) as {
      success?: boolean;
      result?: { status?: string };
    } | null;
    if (!body?.success) return 'PENDING';
    return mapFlouciStatus(body.result?.status);
  },

  /**
   * Webhook v2: signed JSON POST. `X-Flouci-Signature: t=<ts>,v1=<hex>`, v1 = HMAC-SHA256 with the
   * private token over `<t>.<raw body>`. Returns the payment id only for a valid, recent signature;
   * settlement then re-verifies with the API, so the body is never trusted for the outcome.
   */
  verifyWebhook(request: WebhookRequest, now: Date = new Date()): string | null {
    const secret = privateKey();
    const signature = parseSignature(request.headers.get('x-flouci-signature'));
    if (!secret || !signature) return null;
    const timestampMs = Number(signature.t) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(now.getTime() - timestampMs) > WEBHOOK_TOLERANCE_MS) return null;
    const expected = createHmac('sha256', secret).update(`${signature.t}.${request.rawBody}`).digest('hex');
    const given = Buffer.from(signature.v1, 'hex');
    const wanted = Buffer.from(expected, 'hex');
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
    try {
      const payload = JSON.parse(request.rawBody) as { payment_id?: unknown };
      return typeof payload.payment_id === 'string' && payload.payment_id !== '' ? payload.payment_id : null;
    } catch {
      return null;
    }
  },
};
