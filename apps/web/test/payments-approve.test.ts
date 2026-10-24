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
  auditCreate: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  const tables = {
    paymentIntent: { findUnique: m.intentFindUnique, updateMany: m.intentUpdateMany, update: m.intentUpdate },
    payment: { create: m.paymentCreate },
    subscription: { findUnique: m.subFindUnique, create: m.subCreate, update: m.subUpdate, updateMany: m.subUpdateMany },
    company: { findUnique: m.companyFindUnique, updateMany: m.companyUpdateMany },
    plan: { findUnique: m.planFindUnique, findFirst: m.planFindFirst },
    adminAuditLog: { create: m.auditCreate },
  };
  return { ...actual, db: { ...actual.db, ...tables, $transaction: (cb: (tx: typeof tables) => Promise<unknown>) => cb(tables) } };
});

import { approveIntent, rejectIntent } from '../lib/payments/approve';

const NOW = new Date('2026-10-24T10:00:00Z');
const day = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);

const intent = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: '1a2b3c4d-0000-0000-0000-000000000000',
  companyId: 'c1',
  purpose: 'SUBSCRIPTION',
  planId: 'plan-std',
  months: 3,
  amountTnd: 150,
  provider: 'FLOUCI',
  status: 'PENDING',
  providerReference: '20 123 456',
  declaredAt: day(-1),
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.intentFindUnique.mockResolvedValue(intent());
  m.intentUpdateMany.mockResolvedValue({ count: 1 });
  m.paymentCreate.mockResolvedValue({ id: 'pay1' });
  m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: null });
  m.planFindUnique.mockResolvedValue({ id: 'plan-std', tier: 'STANDARD' });
  m.subFindUnique.mockResolvedValue({ planId: 'plan-std', status: 'ACTIVE', periodEnd: day(10), plan: { isTrial: false } });
});

describe('approveIntent', () => {
  it('records the payment as an admin P2P payment, claims the intent and extends the period from the current end', async () => {
    expect(await approveIntent('i1', 'admin-1', NOW)).toEqual({ ok: true });
    expect(m.intentUpdateMany).toHaveBeenCalledWith({
      where: { id: '1a2b3c4d-0000-0000-0000-000000000000', status: 'PENDING', declaredAt: { not: null } },
      data: { status: 'PAID', paidAt: NOW },
    });
    expect(m.paymentCreate).toHaveBeenCalledWith({
      data: {
        companyId: 'c1',
        amountTnd: 150,
        method: 'FLOUCI',
        gatewayReference: '20 123 456',
        note: 'Paiement P2P Flouci, référence DPV-1A2B3C',
        recordedByAdmin: true,
      },
    });
    expect(m.intentUpdate).toHaveBeenCalledWith({ where: { id: '1a2b3c4d-0000-0000-0000-000000000000' }, data: { paymentId: 'pay1' } });
    const update = m.subUpdate.mock.calls[0]![0] as { data: { periodEnd: Date } };
    // 10 days left + 3 months: counted from the current end, not from today
    expect(update.data.periodEnd.getTime()).toBeGreaterThan(day(10 + 85).getTime());
    expect(update.data.periodEnd.getTime()).toBeLessThan(day(10 + 93).getTime());
  });

  it('logs payment.p2pApprove without any screenshot data', async () => {
    await approveIntent('i1', 'admin-1', NOW);
    const data = (m.auditCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ superAdminId: 'admin-1', action: 'payment.p2pApprove', targetCompanyId: 'c1' });
    expect(JSON.stringify(data)).not.toMatch(/proof/i);
  });

  it('counts from today for a subscription that already ended, and reactivates it', async () => {
    m.subFindUnique.mockResolvedValue({ planId: 'plan-std', status: 'EXPIRED', periodEnd: day(-30), plan: { isTrial: false } });
    await approveIntent('i1', 'admin-1', NOW);
    const update = m.subUpdate.mock.calls[0]![0] as { data: { periodEnd: Date; status: string } };
    expect(update.data.status).toBe('ACTIVE');
    expect(update.data.periodEnd.getTime()).toBeGreaterThan(day(85).getTime());
    expect(update.data.periodEnd.getTime()).toBeLessThan(day(93).getTime());
  });

  it('changes the plan when the paid plan differs', async () => {
    m.planFindUnique.mockResolvedValue({ id: 'plan-pre', tier: 'PREMIUM' });
    m.intentFindUnique.mockResolvedValue(intent({ planId: 'plan-pre' }));
    await approveIntent('i1', 'admin-1', NOW);
    expect((m.subUpdate.mock.calls[0]![0] as { data: { planId: string } }).data.planId).toBe('plan-pre');
    expect(m.companyUpdateMany).not.toHaveBeenCalled();
  });

  it('settles once when two approvals race: the second finds the intent already claimed', async () => {
    m.intentUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.all([approveIntent('i1', 'admin-1', NOW), approveIntent('i1', 'admin-1', NOW)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(m.paymentCreate).toHaveBeenCalledTimes(1);
    expect(m.subUpdate).toHaveBeenCalledTimes(1);
    expect(m.auditCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses an intent that is already decided or not declared yet', async () => {
    m.intentFindUnique.mockResolvedValue(intent({ status: 'PAID' }));
    expect(await approveIntent('i1', 'admin-1', NOW)).toMatchObject({ ok: false });
    m.intentFindUnique.mockResolvedValue(intent({ declaredAt: null }));
    expect(await approveIntent('i1', 'admin-1', NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/pas encore déclaré/) });
    m.intentFindUnique.mockResolvedValue(null);
    expect(await approveIntent('nope', 'admin-1', NOW)).toMatchObject({ ok: false });
    expect(m.paymentCreate).not.toHaveBeenCalled();
  });

  it('unlinks a sponsored installer that pays Premium and drops its 3D option', async () => {
    m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: 's1' });
    m.planFindUnique.mockResolvedValue({ id: 'plan-pre', tier: 'PREMIUM' });
    m.intentFindUnique.mockResolvedValue(intent({ planId: 'plan-pre', months: 1 }));
    m.subFindUnique.mockResolvedValue({ planId: 'plan-std', status: 'SUSPENDED', periodEnd: day(200), plan: { isTrial: false } });
    await approveIntent('i1', 'admin-1', NOW);
    expect(m.companyUpdateMany).toHaveBeenCalledWith({ where: { id: 'c1', sponsorCompanyId: { not: null } }, data: { sponsorCompanyId: null } });
    expect(m.subUpdateMany).toHaveBeenCalledWith({ where: { companyId: 'c1' }, data: { option3dUntil: null } });
    // the suspended row only held the option: a fresh month from today, not from its date
    const update = m.subUpdate.mock.calls[0]![0] as { data: { status: string; periodEnd: Date } };
    expect(update.data.status).toBe('ACTIVE');
    expect(update.data.periodEnd.getTime()).toBeLessThan(day(40).getTime());
  });

  it('starts a fresh period from today for a trial', async () => {
    m.subFindUnique.mockResolvedValue({ planId: 'plan-trial', status: 'ACTIVE', periodEnd: day(20), plan: { isTrial: true } });
    await approveIntent('i1', 'admin-1', NOW);
    const update = m.subUpdate.mock.calls[0]![0] as { data: { planId: string; status: string; periodStart: Date; periodEnd: Date } };
    expect(update.data.planId).toBe('plan-std');
    expect(update.data.periodStart).toEqual(NOW);
    expect(update.data.periodEnd.getTime()).toBeLessThan(day(95).getTime());
    expect(update.data.periodEnd.getTime()).toBeGreaterThan(day(85).getTime());
  });

  it('creates the subscription of a company that has none', async () => {
    m.subFindUnique.mockResolvedValue(null);
    await approveIntent('i1', 'admin-1', NOW);
    expect(m.subCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: 'c1', planId: 'plan-std', status: 'ACTIVE' }) });
  });

  it('extends option3dUntil from the later of its end and now', async () => {
    m.intentFindUnique.mockResolvedValue(intent({ purpose: 'OPTION_3D', planId: null, months: 2, provider: 'D17' }));
    m.subFindUnique.mockResolvedValue({ option3dUntil: day(20) });
    await approveIntent('i1', 'admin-1', NOW);
    const update = m.subUpdate.mock.calls[0]![0] as { data: { option3dUntil: Date } };
    expect(update.data.option3dUntil.getTime()).toBeGreaterThan(day(20 + 55).getTime());
    expect(update.data.option3dUntil.getTime()).toBeLessThan(day(20 + 63).getTime());
    expect(m.paymentCreate).toHaveBeenCalledTimes(1);
  });

  it('starts the 3D option from today when it has lapsed, creating the suspended holder row if needed', async () => {
    m.intentFindUnique.mockResolvedValue(intent({ purpose: 'OPTION_3D', planId: null, months: 1 }));
    m.subFindUnique.mockResolvedValue(null);
    m.planFindFirst.mockResolvedValue({ id: 'plan-std' });
    await approveIntent('i1', 'admin-1', NOW);
    const created = m.subCreate.mock.calls[0]![0] as { data: { status: string; option3dUntil: Date } };
    expect(created.data.status).toBe('SUSPENDED');
    expect(created.data.option3dUntil.getTime()).toBeGreaterThan(day(27).getTime());
    expect(created.data.option3dUntil.getTime()).toBeLessThan(day(32).getTime());
  });
});

describe('rejectIntent', () => {
  beforeEach(() => {
    m.intentFindUnique.mockResolvedValue({ companyId: 'c1', amountTnd: 150, provider: 'IZI' });
  });

  it('requires a reason', async () => {
    expect(await rejectIntent('i1', 'admin-1', '   ')).toEqual({ ok: false, error: 'Indiquez le motif du refus.' });
    expect(m.intentUpdateMany).not.toHaveBeenCalled();
  });

  it('marks the open intent FAILED with the reason, records no payment and logs payment.p2pReject', async () => {
    expect(await rejectIntent('i1', 'admin-1', ' Montant incorrect ')).toEqual({ ok: true });
    expect(m.intentUpdateMany).toHaveBeenCalledWith({ where: { id: 'i1', status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'Montant incorrect' } });
    expect(m.paymentCreate).not.toHaveBeenCalled();
    const data = (m.auditCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ action: 'payment.p2pReject', targetCompanyId: 'c1' });
  });

  it('refuses an intent that is already decided', async () => {
    m.intentUpdateMany.mockResolvedValue({ count: 0 });
    expect(await rejectIntent('i1', 'admin-1', 'x')).toMatchObject({ ok: false });
    expect(m.auditCreate).not.toHaveBeenCalled();
  });
});
