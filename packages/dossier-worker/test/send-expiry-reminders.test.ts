import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscriptionFindMany: vi.fn(),
  reminderCreate: vi.fn(),
  reminderDelete: vi.fn(),
  sendEmail: vi.fn(),
  adminEmailAddress: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      subscription: { findMany: mocks.subscriptionFindMany },
      subscriptionReminder: { create: mocks.reminderCreate, delete: mocks.reminderDelete },
    },
  };
});
vi.mock('@dossipv/email', () => ({
  sendEmail: mocks.sendEmail,
  adminEmailAddress: mocks.adminEmailAddress,
  appUrl: (path: string): string => `https://dossipv.tn${path}`,
}));

import { buildReminderEmail, formatFrenchDate, reminderKindFor, reminderRecipients, sendExpiryReminders } from '../src/send-expiry-reminders';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = new Date('2026-10-24T08:00:00.000Z');
const inMs = (ms: number): Date => new Date(NOW.getTime() + ms);

function subscriptionRow(overrides: Partial<{ id: string; status: string; periodEnd: Date; users: unknown[]; email: string }> = {}): unknown {
  return {
    id: overrides.id ?? 'sub-1',
    status: overrides.status ?? 'ACTIVE',
    periodEnd: overrides.periodEnd ?? inMs(3 * DAY_MS),
    plan: { name: 'Standard' },
    company: {
      name: 'SolarPro',
      email: overrides.email ?? 'contact@solarpro.tn',
      users: overrides.users ?? [{ email: 'owner@solarpro.tn', role: 'OWNER', disabledAt: null }],
    },
  };
}

const uniqueViolation = (): Error => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminEmailAddress.mockReturnValue('admin@dossipv.tn');
  mocks.sendEmail.mockResolvedValue({ sent: true });
  mocks.reminderCreate.mockResolvedValue({ id: 'reminder-1' });
  mocks.reminderDelete.mockResolvedValue({});
});

describe('reminderKindFor', () => {
  it('picks the 7-day email from 7 days down to just over 1 day left', () => {
    expect(reminderKindFor(inMs(7 * DAY_MS), NOW)).toBe('EXPIRES_IN_7_DAYS');
    expect(reminderKindFor(inMs(DAY_MS + 1), NOW)).toBe('EXPIRES_IN_7_DAYS');
  });

  it('picks the 1-day email at 1 day left and below', () => {
    expect(reminderKindFor(inMs(DAY_MS), NOW)).toBe('EXPIRES_IN_1_DAY');
    expect(reminderKindFor(inMs(1), NOW)).toBe('EXPIRES_IN_1_DAY');
  });

  it('picks the expired email from the period end on', () => {
    expect(reminderKindFor(NOW, NOW)).toBe('EXPIRED');
    expect(reminderKindFor(inMs(-29 * DAY_MS), NOW)).toBe('EXPIRED');
  });

  it('sends nothing more than 7 days ahead, nor for a period that ended over 30 days ago', () => {
    expect(reminderKindFor(inMs(7 * DAY_MS + 1), NOW)).toBeNull();
    expect(reminderKindFor(inMs(-30 * DAY_MS - 1), NOW)).toBeNull();
  });
});

describe('reminderRecipients', () => {
  it('keeps enabled owners and the company address, without members, disabled owners or duplicates', () => {
    const recipients = reminderRecipients({
      email: 'Owner@SolarPro.tn',
      users: [
        { email: 'owner@solarpro.tn', role: 'OWNER', disabledAt: null },
        { email: 'second@solarpro.tn', role: 'OWNER', disabledAt: null },
        { email: 'member@solarpro.tn', role: 'MEMBER', disabledAt: null },
        { email: 'gone@solarpro.tn', role: 'OWNER', disabledAt: new Date('2026-09-01') },
      ],
    });
    expect(recipients).toEqual(['owner@solarpro.tn', 'second@solarpro.tn']);
  });
});

describe('buildReminderEmail', () => {
  it('names the plan and the French end date, explains the effect and how to renew', () => {
    const periodEnd = new Date('2026-10-30T10:00:00.000Z');
    const email = buildReminderEmail({ kind: 'EXPIRES_IN_7_DAYS', companyName: 'SolarPro', planName: 'Premium', periodEnd, now: NOW });
    expect(formatFrenchDate(periodEnd)).toBe('30/10/2026');
    expect(email.subject).toBe('Votre abonnement DossiPV expire le 30/10/2026');
    expect(email.text).toContain('formule Premium');
    expect(email.text).toContain('dans 7 jours');
    expect(email.text).toContain('consulter');
    expect(email.text).toContain('ne pourrez plus générer');
    expect(email.text).toContain('admin@dossipv.tn');
  });

  it('falls back to a generic contact without ADMIN_EMAIL', () => {
    mocks.adminEmailAddress.mockReturnValue(null);
    const email = buildReminderEmail({ kind: 'EXPIRED', companyName: 'SolarPro', planName: 'Standard', periodEnd: inMs(-DAY_MS), now: NOW });
    expect(email.subject).toBe('Votre abonnement DossiPV a expiré');
    expect(email.text).toContain("contactez l'équipe DossiPV");
  });
});

describe('sendExpiryReminders', () => {
  it('queries non-suspended subscriptions ending within 7 days or in the last 30', async () => {
    mocks.subscriptionFindMany.mockResolvedValue([]);

    await sendExpiryReminders(NOW);

    const where = (mocks.subscriptionFindMany.mock.calls[0]?.[0] as { where: { status: unknown; periodEnd: { lte: Date; gte: Date } } }).where;
    expect(where.status).toEqual({ not: 'SUSPENDED' });
    expect(where.periodEnd.lte).toEqual(inMs(7 * DAY_MS));
    expect(where.periodEnd.gte).toEqual(inMs(-30 * DAY_MS));
  });

  it('records the reminder first, then emails the recipients with a dashboard button', async () => {
    const periodEnd = inMs(12 * HOUR_MS);
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow({ periodEnd })]);

    const summary = await sendExpiryReminders(NOW);

    expect(summary).toEqual({ checked: 1, sent: 1 });
    expect(mocks.reminderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: { subscriptionId: 'sub-1', periodEnd, kind: 'EXPIRES_IN_1_DAY' } }));
    expect(mocks.reminderCreate.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendEmail.mock.invocationCallOrder[0]!);
    const message = mocks.sendEmail.mock.calls[0]?.[0] as { to: string[]; subject: string; action: { url: string } };
    expect(message.to).toEqual(['owner@solarpro.tn', 'contact@solarpro.tn']);
    expect(message.subject).toMatch(/^Dernier jour/);
    expect(message.action.url).toBe('https://dossipv.tn/dashboard');
  });

  it('sends each reminder once: an existing row (unique violation) means already sent', async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow()]);
    mocks.reminderCreate.mockRejectedValue(uniqueViolation());

    const summary = await sendExpiryReminders(NOW);

    expect(summary).toEqual({ checked: 1, sent: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('clears the reminder after a provider failure so the next run retries', async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow()]);
    mocks.sendEmail.mockResolvedValue({ sent: false, reason: 'connection refused' });

    const summary = await sendExpiryReminders(NOW);

    expect(summary.sent).toBe(0);
    expect(mocks.reminderDelete).toHaveBeenCalledWith({ where: { id: 'reminder-1' } });
  });

  it('keeps the reminder when SMTP is not configured (the email was logged)', async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow()]);
    mocks.sendEmail.mockResolvedValue({ sent: false, reason: 'SMTP is not configured' });

    const summary = await sendExpiryReminders(NOW);

    expect(summary.sent).toBe(1);
    expect(mocks.reminderDelete).not.toHaveBeenCalled();
  });

  it('skips suspended subscriptions and periods that ended long ago', async () => {
    mocks.subscriptionFindMany.mockResolvedValue([
      subscriptionRow({ id: 'suspended', status: 'SUSPENDED' }),
      subscriptionRow({ id: 'old', periodEnd: inMs(-45 * DAY_MS) }),
    ]);

    const summary = await sendExpiryReminders(NOW);

    expect(summary).toEqual({ checked: 0, sent: 0 });
    expect(mocks.reminderCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('sends the expired email for an ACTIVE row past its end (effectively expired)', async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow({ periodEnd: inMs(-2 * DAY_MS) })]);

    await sendExpiryReminders(NOW);

    expect((mocks.reminderCreate.mock.calls[0]?.[0] as { data: { kind: string } }).data.kind).toBe('EXPIRED');
    expect((mocks.sendEmail.mock.calls[0]?.[0] as { subject: string }).subject).toBe('Votre abonnement DossiPV a expiré');
  });

  it('carries on with the other subscriptions when one reminder cannot be recorded', async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow({ id: 'broken' }), subscriptionRow({ id: 'fine' })]);
    mocks.reminderCreate.mockRejectedValueOnce(new Error('connection reset'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await sendExpiryReminders(NOW);

    expect(summary).toEqual({ checked: 2, sent: 1 });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
