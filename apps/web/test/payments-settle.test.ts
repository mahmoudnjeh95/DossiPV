/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  intentFindUnique: vi.fn(),
  intentUpdateMany: vi.fn(),
  intentUpdate: vi.fn(),
  paymentCreate: vi.fn(),
  subFindUnique: vi.fn(),
  subCreate: vi.fn(),
  subUpdate: vi.fn(),
  subUpdateMany: vi.fn(),
  companyFindUnique: vi.fn(),
  companyUpdateMany: vi.fn(),
  planFindUnique: vi.fn(),
  planFindFirst: vi.fn(),
  verify: vi.fn(),
  issueInvoice: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  const tables = {
    paymentIntent: { findUnique: m.intentFindUnique, updateMany: m.intentUpdateMany, update: m.intentUpdate },
    payment: { create: m.paymentCreate },
    subscription: { findUnique: m.subFindUnique, create: m.subCreate, update: m.subUpdate, updateMany: m.subUpdateMany },
    company: { findUnique: m.companyFindUnique, updateMany: m.companyUpdateMany },
    plan: { findUnique: m.planFindUnique, findFirst: m.planFindFirst },
  };
  return { ...actual, db: { ...actual.db, ...tables, $transaction: (cb: (tx: typeof tables) => Promise<unknown>) => cb(tables) } };
});
vi.mock('../lib/payments/registry', () => ({ getProvider: () => ({ verify: m.verify }) }));
vi.mock('../lib/invoices', () => ({ issueInvoiceForPayment: m.issueInvoice }));

import { settlePaymentIntent } from '../lib/payments/settle';

const NOW = new Date('2026-10-24T10:00:00Z');
const day = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);

const intent = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'i1',
  companyId: 'c1',
  purpose: 'SUBSCRIPTION',
  planId: 'plan-std',
  months: 3,
  amountTnd: 358,
  provider: 'FLOUCI',
  status: 'PENDING',
  providerReference: 'ref-1',
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.intentFindUnique.mockResolvedValue(intent());
  m.intentUpdateMany.mockResolvedValue({ count: 1 });
  m.paymentCreate.mockResolvedValue({ id: 'pay1' });
  m.verify.mockResolvedValue('PAID');
  m.issueInvoice.mockResolvedValue({ invoiceId: 'inv1', number: '2026-0001' });
  m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: null });
  m.planFindUnique.mockResolvedValue({ id: 'plan-std', tier: 'STANDARD' });
  m.subFindUnique.mockResolvedValue({ planId: 'plan-std', status: 'ACTIVE', periodEnd: day(10), plan: { isTrial: false } });
});

describe('settlePaymentIntent', () => {
  it('records the payment, extends the period from the current end and issues the invoice', async () => {
    expect(await settlePaymentIntent('i1', NOW)).toEqual({ status: 'PAID' });
    expect(m.paymentCreate).toHaveBeenCalledWith({
      data: { companyId: 'c1', amountTnd: 358, method: 'FLOUCI', gatewayReference: 'ref-1', recordedByAdmin: false },
    });
    expect(m.intentUpdate).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { paymentId: 'pay1' } });
    const update = m.subUpdate.mock.calls[0]![0] as { data: { periodEnd: Date } };
    // 10 days left + 3 months: counted from the current end, not from today
    expect(update.data.periodEnd.getTime()).toBeGreaterThan(day(10 + 85).getTime());
    expect(update.data.periodEnd.getTime()).toBeLessThan(day(10 + 93).getTime());
    expect(m.issueInvoice).toHaveBeenCalledWith('pay1');
  });

  it('counts from today for a subscription that already ended, and reactivates it', async () => {
    m.subFindUnique.mockResolvedValue({ planId: 'plan-std', status: 'EXPIRED', periodEnd: day(-30), plan: { isTrial: false } });
    await settlePaymentIntent('i1', NOW);
    const update = m.subUpdate.mock.calls[0]![0] as { data: { periodEnd: Date; status: string } };
    expect(update.data.status).toBe('ACTIVE');
    expect(update.data.periodEnd.getTime()).toBeGreaterThan(day(85).getTime());
    expect(update.data.periodEnd.getTime()).toBeLessThan(day(93).getTime());
  });

  it('changes the plan when the paid plan differs', async () => {
    m.planFindUnique.mockResolvedValue({ id: 'plan-pre', tier: 'PREMIUM' });
    m.intentFindUnique.mockResolvedValue(intent({ planId: 'plan-pre' }));
    await settlePaymentIntent('i1', NOW);
    expect((m.subUpdate.mock.calls[0]![0] as { data: { planId: string } }).data.planId).toBe('plan-pre');
    expect(m.companyUpdateMany).not.toHaveBeenCalled();
  });

  it('settles once when two calls race: the second finds the intent already claimed', async () => {
    m.intentUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await Promise.all([settlePaymentIntent('i1', NOW), settlePaymentIntent('i1', NOW)]);
    expect(m.paymentCreate).toHaveBeenCalledTimes(1);
    expect(m.subUpdate).toHaveBeenCalledTimes(1);
    expect(m.issueInvoice).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an intent that is already settled, without asking the provider', async () => {
    m.intentFindUnique.mockResolvedValue(intent({ status: 'PAID' }));
    expect(await settlePaymentIntent('i1', NOW)).toEqual({ status: 'PAID' });
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.paymentCreate).not.toHaveBeenCalled();
  });

  it('unlinks a sponsored installer that pays Premium and drops its 3D option', async () => {
    m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: 's1' });
    m.planFindUnique.mockResolvedValue({ id: 'plan-pre', tier: 'PREMIUM' });
    m.intentFindUnique.mockResolvedValue(intent({ planId: 'plan-pre', months: 1 }));
    m.subFindUnique.mockResolvedValue({ planId: 'plan-std', status: 'SUSPENDED', periodEnd: day(200), plan: { isTrial: false } });
    await settlePaymentIntent('i1', NOW);
    expect(m.companyUpdateMany).toHaveBeenCalledWith({ where: { id: 'c1', sponsorCompanyId: { not: null } }, data: { sponsorCompanyId: null } });
    expect(m.subUpdateMany).toHaveBeenCalledWith({ where: { companyId: 'c1' }, data: { option3dUntil: null } });
    // the suspended row only held the option: a fresh month from today, not from its date
    const update = m.subUpdate.mock.calls[0]![0] as { data: { status: string; periodEnd: Date } };
    expect(update.data.status).toBe('ACTIVE');
    expect(update.data.periodEnd.getTime()).toBeLessThan(day(40).getTime());
  });

  it('creates the subscription of a company that has none', async () => {
    m.subFindUnique.mockResolvedValue(null);
    await settlePaymentIntent('i1', NOW);
    expect(m.subCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: 'c1', planId: 'plan-std', status: 'ACTIVE' }) });
  });

  it('extends option3dUntil from the later of its end and now', async () => {
    m.intentFindUnique.mockResolvedValue(intent({ purpose: 'OPTION_3D', planId: null, months: 2 }));
    m.subFindUnique.mockResolvedValue({ option3dUntil: day(20) });
    await settlePaymentIntent('i1', NOW);
    const update = m.subUpdate.mock.calls[0]![0] as { data: { option3dUntil: Date } };
    expect(update.data.option3dUntil.getTime()).toBeGreaterThan(day(20 + 55).getTime());
    expect(update.data.option3dUntil.getTime()).toBeLessThan(day(20 + 63).getTime());
    expect(m.paymentCreate).toHaveBeenCalledTimes(1);
  });

  it('starts the 3D option from today when it has lapsed, creating the suspended holder row if needed', async () => {
    m.intentFindUnique.mockResolvedValue(intent({ purpose: 'OPTION_3D', planId: null, months: 1 }));
    m.subFindUnique.mockResolvedValue(null);
    m.planFindFirst.mockResolvedValue({ id: 'plan-std' });
    await settlePaymentIntent('i1', NOW);
    const created = m.subCreate.mock.calls[0]![0] as { data: { status: string; option3dUntil: Date } };
    expect(created.data.status).toBe('SUSPENDED');
    expect(created.data.option3dUntil.getTime()).toBeGreaterThan(day(27).getTime());
    expect(created.data.option3dUntil.getTime()).toBeLessThan(day(32).getTime());
  });

  it('keeps the settlement when the invoice cannot be issued', async () => {
    m.issueInvoice.mockRejectedValue(new Error('not implemented'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await settlePaymentIntent('i1', NOW)).toEqual({ status: 'PAID' });
    expect(m.paymentCreate).toHaveBeenCalledTimes(1);
  });

  it('marks the intent FAILED when the provider says so, and records no payment', async () => {
    m.verify.mockResolvedValue('FAILED');
    m.intentFindUnique.mockResolvedValueOnce(intent()).mockResolvedValueOnce({ status: 'FAILED' });
    expect(await settlePaymentIntent('i1', NOW)).toEqual({ status: 'FAILED' });
    expect(m.intentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'FAILED', failureReason: expect.any(String) }),
    });
    expect(m.paymentCreate).not.toHaveBeenCalled();
  });

  it('stays pending while the provider says pending or cannot be reached', async () => {
    m.verify.mockResolvedValue('PENDING');
    expect(await settlePaymentIntent('i1', NOW)).toEqual({ status: 'PENDING' });
    m.verify.mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await settlePaymentIntent('i1', NOW)).toEqual({ status: 'PENDING', unreachable: true });
    expect(m.paymentCreate).not.toHaveBeenCalled();
  });

  it('reports an unknown intent', async () => {
    m.intentFindUnique.mockResolvedValue(null);
    expect(await settlePaymentIntent('nope', NOW)).toEqual({ status: 'NOT_FOUND' });
  });
});
