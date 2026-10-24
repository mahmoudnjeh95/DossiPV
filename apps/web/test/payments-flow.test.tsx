/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  intentFindFirst: vi.fn(),
  intentCreate: vi.fn(),
  intentUpdate: vi.fn(),
  settle: vi.fn(),
  priceCheckout: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: m.redirect,
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));
vi.mock('../app/(app)/layout', () => ({ requireAuthenticatedCompanyUser: m.requireUser }));
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, paymentIntent: { findFirst: m.intentFindFirst, create: m.intentCreate, update: m.intentUpdate } } };
});
vi.mock('../lib/payments/settle', () => ({ settlePaymentIntent: m.settle }));
vi.mock('../lib/payments/pricing', async () => {
  const actual = await vi.importActual<typeof import('../lib/payments/pricing')>('../lib/payments/pricing');
  return { ...actual, priceCheckout: m.priceCheckout };
});

import { POST } from '../app/api/payments/[provider]/webhook/route';
import PaymentReturnPage from '../app/paiement/retour/page';
import { startCheckoutAction } from '../app/paiement/actions';
import { listProviders } from '../lib/payments/registry';
import { fakeProvider, isFakeEnabled } from '../lib/payments/fake';
import { CheckoutError } from '../lib/payments/types';

const env = process.env as Record<string, string | undefined>;
const KEYS = ['FLOUCI_APP_TOKEN', 'FLOUCI_APP_SECRET', 'PAYMENTS_FAKE', 'NODE_ENV', 'APP_URL'];
const SAVED = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  vi.resetAllMocks();
  env.FLOUCI_APP_TOKEN = 'pub';
  env.FLOUCI_APP_SECRET = 'sec';
  delete env.PAYMENTS_FAKE;
  delete env.APP_URL;
  m.requireUser.mockResolvedValue({ id: 'u1', companyId: 'c1', role: 'OWNER' });
});
afterEach(() => {
  for (const key of KEYS) {
    if (SAVED[key] === undefined) delete env[key];
    else env[key] = SAVED[key];
  }
});

function signed(body: string, secret = 'sec', t = Math.floor(Date.now() / 1000)): Headers {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return new Headers({ 'x-flouci-signature': `t=${t},v1=${v1}` });
}
const call = (slug: string, body: string, headers: Headers): Promise<Response> =>
  POST(new Request('http://x/api/payments/flouci/webhook', { method: 'POST', body, headers }), { params: Promise.resolve({ provider: slug }) });

describe('payment webhook', () => {
  const body = JSON.stringify({ event: 'payment.succeeded', payment_id: 'pay-9' });

  it('settles the intent of a correctly signed call', async () => {
    m.intentFindFirst.mockResolvedValue({ id: 'i1' });
    const response = await call('flouci', body, signed(body));
    expect(response.status).toBe(200);
    expect(m.intentFindFirst).toHaveBeenCalledWith({ where: { provider: 'FLOUCI', providerReference: 'pay-9' }, select: { id: true } });
    expect(m.settle).toHaveBeenCalledWith('i1');
  });

  it('answers 400 and settles nothing for a wrong signature, a missing one or a stale one', async () => {
    for (const headers of [signed(body, 'other-secret'), new Headers(), signed(body, 'sec', Math.floor(Date.now() / 1000) - 3600)]) {
      const response = await call('flouci', body, headers);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid' });
    }
    expect(m.settle).not.toHaveBeenCalled();
  });

  it('rejects a body that was changed after signing', async () => {
    const headers = signed(body);
    expect((await call('flouci', body.replace('pay-9', 'pay-8'), headers)).status).toBe(400);
  });

  it('answers 400 for a provider that is unknown or not configured', async () => {
    expect((await call('izi', body, signed(body))).status).toBe(400);
    expect((await call('nope', body, signed(body))).status).toBe(400);
    delete env.FLOUCI_APP_SECRET;
    expect((await call('flouci', body, signed(body))).status).toBe(400);
  });

  it('still answers 200 for a genuine call about an unknown payment', async () => {
    m.intentFindFirst.mockResolvedValue(null);
    expect((await call('flouci', body, signed(body))).status).toBe(200);
    expect(m.settle).not.toHaveBeenCalled();
  });
});

describe('return page', () => {
  const render = async (): Promise<string> => renderToStaticMarkup(await PaymentReturnPage({ searchParams: Promise.resolve({ intent: 'i1' }) }));
  beforeEach(() => m.intentFindFirst.mockResolvedValue({ id: 'i1', company: { kind: 'INSTALLER' } }));

  it('says the payment was received', async () => {
    m.settle.mockResolvedValue({ status: 'PAID' });
    const html = await render();
    expect(html).toContain('Paiement reçu');
    expect(html).toContain('href="/facturation"');
  });

  it('says it is pending and offers to check again', async () => {
    m.settle.mockResolvedValue({ status: 'PENDING' });
    const html = await render();
    expect(html).toContain('en attente de confirmation');
    expect(html).toContain('/paiement/retour?intent=i1');
  });

  it('says it failed and offers to retry', async () => {
    m.settle.mockResolvedValue({ status: 'FAILED' });
    const html = await render();
    expect(html).toContain('n’a pas abouti');
    expect(html).toContain('Réessayer');
  });

  it('sends a supplier back to its own billing page', async () => {
    m.intentFindFirst.mockResolvedValue({ id: 'i1', company: { kind: 'SUPPLIER' } });
    m.settle.mockResolvedValue({ status: 'PAID' });
    expect(await render()).toContain('href="/fournisseur/facturation"');
  });

  it('only finds the intents of the signed-in company', async () => {
    m.intentFindFirst.mockResolvedValue(null);
    await expect(render()).rejects.toThrow('NOT_FOUND');
    expect(m.intentFindFirst.mock.calls[0]![0]).toMatchObject({ where: { id: 'i1', companyId: 'c1' } });
    expect(m.settle).not.toHaveBeenCalled();
  });
});

describe('startCheckoutAction', () => {
  it('refuses a member who is not the owner', async () => {
    m.requireUser.mockResolvedValue({ id: 'u1', companyId: 'c1', role: 'MEMBER' });
    expect(await startCheckoutAction('SUBSCRIPTION', 'p1', 1, 'FLOUCI')).toEqual({ error: expect.stringContaining('responsable') });
    expect(m.priceCheckout).not.toHaveBeenCalled();
  });

  it('refuses a support session', async () => {
    m.requireUser.mockResolvedValue({ id: 'u1', companyId: 'c1', role: 'OWNER', impersonatedBySuperAdminId: 'a1' });
    expect(await startCheckoutAction('SUBSCRIPTION', 'p1', 1, 'FLOUCI')).toEqual({ error: expect.stringContaining('Mode support') });
  });

  it('refuses a provider that is not configured', async () => {
    expect(await startCheckoutAction('SUBSCRIPTION', 'p1', 1, 'IZI')).toEqual({ error: expect.stringContaining('pas disponible') });
    delete env.FLOUCI_APP_TOKEN;
    expect(await startCheckoutAction('SUBSCRIPTION', 'p1', 1, 'FLOUCI')).toEqual({ error: expect.stringContaining('pas disponible') });
    expect(m.intentCreate).not.toHaveBeenCalled();
  });

  it('returns the French refusal of the pricing rules and opens no intent', async () => {
    m.priceCheckout.mockRejectedValue(new CheckoutError('Ce plan n’est plus proposé : contactez DossiPV.'));
    expect(await startCheckoutAction('SUBSCRIPTION', 'p1', 1, 'FLOUCI')).toEqual({ error: 'Ce plan n’est plus proposé : contactez DossiPV.' });
    expect(m.intentCreate).not.toHaveBeenCalled();
  });

  it('creates the intent, calls the provider and redirects to its checkout page', async () => {
    m.priceCheckout.mockResolvedValue({ purpose: 'SUBSCRIPTION', planId: 'p1', months: 3, ttcTnd: 358, description: 'Abonnement' });
    m.intentCreate.mockResolvedValue({ id: 'i1' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { success: true, payment_id: 'pay-1', link: 'https://checkout.flouci.com/x/pay-1' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await startCheckoutAction('SUBSCRIPTION', 'p1', 3, 'FLOUCI');
    expect(m.intentCreate.mock.calls[0]![0]).toMatchObject({ data: { companyId: 'c1', amountTnd: 358, provider: 'FLOUCI', months: 3 } });
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe('https://developers.flouci.com/api/v2/generate_payment');
    expect(init.headers.Authorization).toBe('Bearer pub:sec');
    expect(JSON.parse(init.body)).toMatchObject({ amount: '358000', developer_tracking_id: 'i1', webhook_version: 2 });
    expect(m.intentUpdate).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { providerReference: 'pay-1', checkoutUrl: 'https://checkout.flouci.com/x/pay-1' } });
    expect(m.redirect).toHaveBeenCalledWith('https://checkout.flouci.com/x/pay-1');
    vi.unstubAllGlobals();
  });

  it('marks the intent FAILED and says so when the provider is down', async () => {
    m.priceCheckout.mockResolvedValue({ purpose: 'SUBSCRIPTION', planId: 'p1', months: 1, ttcTnd: 120, description: 'Abonnement' });
    m.intentCreate.mockResolvedValue({ id: 'i1' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await startCheckoutAction('SUBSCRIPTION', 'p1', 1, 'FLOUCI')).toEqual({ error: expect.stringContaining('ne répond pas') });
    expect(m.intentUpdate).toHaveBeenCalledWith({ where: { id: 'i1' }, data: expect.objectContaining({ status: 'FAILED' }) });
    expect(m.redirect).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('providers', () => {
  it('lists izi and D17 as not configured and Flouci as enabled only with its keys', () => {
    const byId = Object.fromEntries(listProviders().map((p) => [p.id, p.enabled]));
    expect(byId).toEqual({ FLOUCI: true, IZI: false, D17: false });
    delete env.FLOUCI_APP_SECRET;
    expect(listProviders().find((p) => p.id === 'FLOUCI')?.enabled).toBe(false);
  });

  it('never enables the fake provider in production', async () => {
    env.PAYMENTS_FAKE = '1';
    env.NODE_ENV = 'production';
    expect(isFakeEnabled()).toBe(false);
    await expect(fakeProvider.createCheckout({ intentId: 'i1', amountTnd: 1, description: '', successUrl: '', failUrl: '', webhookUrl: '' })).rejects.toThrow();
    await expect(fakeProvider.verify('fake-paid-i1')).rejects.toThrow();
  });

  it('simulates a checkout in development when PAYMENTS_FAKE=1', async () => {
    env.PAYMENTS_FAKE = '1';
    env.NODE_ENV = 'development';
    delete env.FLOUCI_APP_TOKEN;
    expect(listProviders().find((p) => p.id === 'FLOUCI')).toMatchObject({ enabled: true, label: 'Flouci (simulation)' });
    const checkout = await fakeProvider.createCheckout({ intentId: 'i1', amountTnd: 1, description: '', successUrl: '', failUrl: '', webhookUrl: '' });
    expect(checkout.checkoutUrl).toBe('/paiement/simulation?intent=i1');
    expect(await fakeProvider.verify(checkout.providerReference)).toBe('PENDING');
    expect(await fakeProvider.verify('fake-paid-i1')).toBe('PAID');
    expect(await fakeProvider.verify('fake-failed-i1')).toBe('FAILED');
  });
});
