/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method -- mock.calls are untyped by design */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn((): Promise<{ get: typeof mockGet }> => Promise.resolve({ get: mockGet })),
    mockValidateSession: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockIntentFindFirst: vi.fn(),
    mockIntentFindUnique: vi.fn(),
    mockMsgFindMany: vi.fn(),
    mockMsgFindFirst: vi.fn(),
    mockMsgCount: vi.fn(),
    mockMsgCreate: vi.fn(),
    mockMsgUpdateMany: vi.fn(),
    mockMsgGroupBy: vi.fn(),
    mockOwnersFindMany: vi.fn(),
    mockSendEmail: vi.fn(),
    mockAdminEmail: vi.fn(),
    mockRequireUser: vi.fn(),
    mockRequireAdmin: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@dossipv/auth', () => ({ validateSession: m.mockValidateSession, validateSuperAdminSession: m.mockValidateSuperAdminSession }));
vi.mock('@dossipv/db', () => ({
  db: {
    paymentIntent: { findFirst: m.mockIntentFindFirst, findUnique: m.mockIntentFindUnique, count: vi.fn() },
    paymentMessage: {
      findMany: m.mockMsgFindMany,
      findFirst: m.mockMsgFindFirst,
      count: m.mockMsgCount,
      create: m.mockMsgCreate,
      updateMany: m.mockMsgUpdateMany,
      groupBy: m.mockMsgGroupBy,
    },
    companyUser: { findMany: m.mockOwnersFindMany },
    platformSettings: { findUnique: vi.fn() },
  },
}));
vi.mock('@dossipv/email', () => ({
  sendEmail: m.mockSendEmail,
  adminEmailAddress: m.mockAdminEmail,
  appUrl: (path: string): string => `https://app.test${path}`,
}));
vi.mock('../app/(app)/layout', () => ({ requireAuthenticatedCompanyUser: m.mockRequireUser }));
vi.mock('../app/admin/(protected)/layout', () => ({ requireAuthenticatedSuperAdmin: m.mockRequireAdmin }));

import {
  chatOpen,
  listMessages,
  markReadByAdmin,
  markReadByCompany,
  postAdminMessage,
  postCompanyMessage,
  readMessageBody,
  unreadForAdmin,
  unreadForCompany,
} from '../lib/payments/chat';
import { countPaymentsNeedingAttention } from '../lib/payments/admin';
import { sendPaymentMessageAction } from '../app/paiement/actions';
import { sendAdminPaymentMessageAction } from '../app/admin/(protected)/paiements/actions';
import { GET as companyMessages } from '../app/paiement/[intentId]/messages/route';
import { GET as adminMessages } from '../app/admin/(protected)/paiements/[id]/messages/route';

const NOW = new Date('2026-10-24T12:00:00Z');
const owner = { id: 'u1', companyId: 'c1', fullName: 'Sami Ben Ali', role: 'OWNER' as const, impersonatedBySuperAdminId: null };
const pendingIntent = { id: 'i1', companyId: 'c1', status: 'PENDING', paidAt: null, amountTnd: '59.00', company: { name: 'Solaire SARL' } };
const SECRET = 'mon texte très personnel 0612345678';

function emailsSent(): string {
  return JSON.stringify(m.mockSendEmail.mock.calls);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'token' });
  m.mockValidateSession.mockResolvedValue({ ...owner });
  m.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1' });
  m.mockRequireUser.mockResolvedValue({ ...owner });
  m.mockRequireAdmin.mockResolvedValue({ id: 'admin-1' });
  m.mockIntentFindFirst.mockResolvedValue({ ...pendingIntent });
  m.mockIntentFindUnique.mockResolvedValue({ ...pendingIntent });
  m.mockMsgCount.mockResolvedValue(0);
  m.mockMsgFindFirst.mockResolvedValue(null);
  m.mockMsgCreate.mockResolvedValue({});
  m.mockMsgUpdateMany.mockResolvedValue({ count: 0 });
  m.mockMsgGroupBy.mockResolvedValue([]);
  m.mockMsgFindMany.mockResolvedValue([]);
  m.mockOwnersFindMany.mockResolvedValue([{ email: 'owner@solaire.tn' }]);
  m.mockSendEmail.mockResolvedValue({ sent: true });
  m.mockAdminEmail.mockReturnValue('admin@dossipv.tn');
});

describe('message validation', () => {
  it('trims the text and normalises line breaks', () => {
    expect(readMessageBody('  bonjour\r\nmonsieur  ')).toEqual({ ok: true, body: 'bonjour\nmonsieur' });
  });

  it('refuses an empty or blank message, and a non-string', () => {
    expect(readMessageBody('   ')).toEqual({ ok: false, error: 'Écrivez un message.' });
    expect(readMessageBody(null)).toEqual({ ok: false, error: 'Écrivez un message.' });
  });

  it('accepts 1000 characters and refuses 1001', () => {
    expect(readMessageBody('a'.repeat(1000)).ok).toBe(true);
    expect(readMessageBody('a'.repeat(1001))).toEqual({ ok: false, error: 'Message trop long : 1000 caractères au plus.' });
  });

  it('stores nothing for an invalid message', async () => {
    expect(await postCompanyMessage(owner, 'i1', '  ', NOW)).toEqual({ ok: false, error: 'Écrivez un message.' });
    expect(m.mockMsgCreate).not.toHaveBeenCalled();
  });
});

describe('rate rules', () => {
  it('refuses the 31st message of the day from the same side', async () => {
    m.mockMsgCount.mockResolvedValueOnce(30);
    const result = await postCompanyMessage(owner, 'i1', 'bonjour', NOW);
    expect(result).toEqual({ ok: false, error: 'Limite atteinte : 30 messages par jour sur ce paiement.' });
    expect(m.mockMsgCount).toHaveBeenCalledWith({ where: { intentId: 'i1', author: 'COMPANY', createdAt: { gte: new Date('2026-10-23T12:00:00Z') } } });
    expect(m.mockMsgCreate).not.toHaveBeenCalled();
  });

  it('accepts the 30th message', async () => {
    m.mockMsgCount.mockResolvedValueOnce(29);
    expect((await postCompanyMessage(owner, 'i1', 'bonjour', NOW)).ok).toBe(true);
  });

  it('refuses a message less than 2 seconds after the previous one of the same side', async () => {
    m.mockMsgFindFirst.mockResolvedValueOnce({ createdAt: new Date(NOW.getTime() - 1500) });
    const result = await postAdminMessage('i1', 'bonjour', NOW);
    expect(result.ok).toBe(false);
    expect(m.mockMsgFindFirst).toHaveBeenCalledWith({ where: { intentId: 'i1', author: 'ADMIN' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    expect(m.mockMsgCreate).not.toHaveBeenCalled();
  });

  it('accepts a message 2 seconds after the previous one', async () => {
    m.mockMsgFindFirst.mockResolvedValueOnce({ createdAt: new Date(NOW.getTime() - 2000) });
    expect((await postAdminMessage('i1', 'bonjour', NOW)).ok).toBe(true);
  });
});

describe('chat window', () => {
  it('is open while PENDING or FAILED, whatever the age', () => {
    expect(chatOpen({ status: 'PENDING', paidAt: null }, NOW)).toBe(true);
    expect(chatOpen({ status: 'FAILED', paidAt: null }, NOW)).toBe(true);
  });

  it('stays open 30 days after the confirmation, then is read-only', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(chatOpen({ status: 'PAID', paidAt: new Date(NOW.getTime() - 29 * day) }, NOW)).toBe(true);
    expect(chatOpen({ status: 'PAID', paidAt: new Date(NOW.getTime() - 31 * day) }, NOW)).toBe(false);
  });

  it('is closed for a cancelled payment', () => {
    expect(chatOpen({ status: 'CANCELLED', paidAt: null }, NOW)).toBe(false);
  });

  it('refuses a new message once closed, from both sides', async () => {
    const old = { ...pendingIntent, status: 'PAID', paidAt: new Date('2026-08-01T00:00:00Z') };
    m.mockIntentFindFirst.mockResolvedValue(old);
    m.mockIntentFindUnique.mockResolvedValue(old);
    expect(await postCompanyMessage(owner, 'i1', 'bonjour', NOW)).toEqual({ ok: false, error: 'Conversation terminée.' });
    expect(await postAdminMessage('i1', 'bonjour', NOW)).toEqual({ ok: false, error: 'Conversation terminée.' });
    expect(m.mockMsgCreate).not.toHaveBeenCalled();
  });
});

describe('authorization of the payer', () => {
  it('looks the payment up scoped to the caller company: another company gets not found', async () => {
    m.mockIntentFindFirst.mockResolvedValue(null);
    const result = await postCompanyMessage({ ...owner, companyId: 'other' }, 'i1', 'bonjour', NOW);
    expect(result).toEqual({ ok: false, error: 'Paiement introuvable.', notFound: true });
    expect(m.mockIntentFindFirst.mock.calls[0]![0].where).toEqual({ id: 'i1', companyId: 'other' });
    expect(m.mockMsgCreate).not.toHaveBeenCalled();
  });

  it('refuses a support session (read-only)', async () => {
    const result = await postCompanyMessage({ ...owner, impersonatedBySuperAdminId: 'admin-1' }, 'i1', 'bonjour', NOW);
    expect(result.ok).toBe(false);
    expect(m.mockMsgCreate).not.toHaveBeenCalled();
  });

  it('refuses a member who is not the owner', async () => {
    const result = await postCompanyMessage({ ...owner, role: 'MEMBER' }, 'i1', 'bonjour', NOW);
    expect(result).toEqual({ ok: false, error: 'Seul le responsable du compte peut payer l’abonnement.' });
    expect(m.mockMsgCreate).not.toHaveBeenCalled();
  });

  it('stores the owner message with its name', async () => {
    expect(await postCompanyMessage(owner, 'i1', ' bonjour ', NOW)).toEqual({ ok: true });
    expect(m.mockMsgCreate).toHaveBeenCalledWith({ data: { intentId: 'i1', author: 'COMPANY', authorName: 'Sami Ben Ali', body: 'bonjour', createdAt: NOW } });
  });

  it('the server action answers with the French refusal, or saved', async () => {
    const ok = new FormData();
    ok.set('body', 'bonjour');
    expect(await sendPaymentMessageAction('i1', ok)).toEqual({ saved: true });
    m.mockRequireUser.mockResolvedValue({ ...owner, impersonatedBySuperAdminId: 'admin-1' });
    expect(await sendPaymentMessageAction('i1', ok)).toEqual({ error: 'Mode support : le paiement est désactivé.' });
    m.mockRequireUser.mockResolvedValue({ ...owner });
    m.mockIntentFindFirst.mockResolvedValue(null);
    expect(await sendPaymentMessageAction('i1', ok)).toEqual({ error: 'Paiement introuvable.' });
  });
});

describe('admin posting', () => {
  it('posts as SolarixPro on any payment', async () => {
    expect(await postAdminMessage('i1', 'Montant incorrect', NOW)).toEqual({ ok: true });
    expect(m.mockMsgCreate).toHaveBeenCalledWith({ data: { intentId: 'i1', author: 'ADMIN', authorName: 'SolarixPro', body: 'Montant incorrect', createdAt: NOW } });
  });

  it('answers not found for an unknown payment', async () => {
    m.mockIntentFindUnique.mockResolvedValue(null);
    expect(await postAdminMessage('nope', 'x', NOW)).toMatchObject({ ok: false, notFound: true });
  });

  it('the admin action requires the super admin and returns the error', async () => {
    const form = new FormData();
    form.set('body', '   ');
    expect(await sendAdminPaymentMessageAction('i1', form)).toEqual({ error: 'Écrivez un message.' });
    expect(m.mockRequireAdmin).toHaveBeenCalled();
    form.set('body', 'ok');
    expect(await sendAdminPaymentMessageAction('i1', form)).toBeUndefined();
  });
});

describe('read markers and unread counts', () => {
  it('marks only the other side messages, only the unread ones', async () => {
    await markReadByCompany('i1');
    expect(m.mockMsgUpdateMany).toHaveBeenLastCalledWith({ where: { intentId: 'i1', author: 'ADMIN', readByCompanyAt: null }, data: { readByCompanyAt: expect.any(Date) } });
    await markReadByAdmin('i1');
    expect(m.mockMsgUpdateMany).toHaveBeenLastCalledWith({ where: { intentId: 'i1', author: 'COMPANY', readByAdminAt: null }, data: { readByAdminAt: expect.any(Date) } });
  });

  it('counts the unread admin messages per payment of the company', async () => {
    m.mockMsgGroupBy.mockResolvedValue([{ intentId: 'i1', _count: { _all: 2 } }]);
    const counts = await unreadForCompany('c1');
    expect(counts.get('i1')).toBe(2);
    expect(m.mockMsgGroupBy.mock.calls[0]![0].where).toEqual({ author: 'ADMIN', readByCompanyAt: null, intent: { companyId: 'c1' } });
  });

  it('counts the unread payer messages per payment for the admin, and the menu badge adds the intents', async () => {
    m.mockMsgGroupBy.mockResolvedValue([
      { intentId: 'i1', _count: { _all: 3 } },
      { intentId: 'i2', _count: { _all: 1 } },
    ]);
    const counts = await unreadForAdmin();
    expect([...counts.entries()]).toEqual([['i1', 3], ['i2', 1]]);
    expect(m.mockMsgGroupBy.mock.calls[0]![0].where).toEqual({ author: 'COMPANY', readByAdminAt: null });
    const { db } = await import('@dossipv/db');
    vi.mocked(db.paymentIntent.count).mockResolvedValue(4);
    expect(await countPaymentsNeedingAttention()).toBe(6);
  });

  it('lists messages oldest first with ISO dates', async () => {
    m.mockMsgFindMany.mockResolvedValue([
      { id: 'b', author: 'ADMIN', authorName: 'SolarixPro', body: 'deux', createdAt: new Date('2026-10-24T10:01:00Z') },
      { id: 'a', author: 'COMPANY', authorName: 'Sami', body: 'un', createdAt: new Date('2026-10-24T10:00:00Z') },
    ]);
    const messages = await listMessages('i1');
    expect(messages.map((x) => x.id)).toEqual(['a', 'b']);
    expect(messages[0]!.createdAt).toBe('2026-10-24T10:00:00.000Z');
  });
});

describe('polling routes', () => {
  const companyParams = { params: Promise.resolve({ intentId: 'i1' }) };
  const adminParams = { params: Promise.resolve({ id: 'i1' }) };
  const request = new Request('http://localhost/messages');

  it('the payer route needs a session', async () => {
    m.mockGet.mockReturnValue(undefined);
    expect((await companyMessages(request, companyParams)).status).toBe(401);
  });

  it('the payer route is scoped to the company: another company gets a 404 and nothing is marked read', async () => {
    m.mockIntentFindFirst.mockResolvedValue(null);
    const response = await companyMessages(request, companyParams);
    expect(response.status).toBe(404);
    expect(m.mockIntentFindFirst.mock.calls[0]![0].where).toEqual({ id: 'i1', companyId: 'c1' });
    expect(m.mockMsgUpdateMany).not.toHaveBeenCalled();
  });

  it('the payer route returns JSON, uncached, and marks the admin messages read', async () => {
    m.mockMsgFindMany.mockResolvedValue([{ id: 'a', author: 'ADMIN', authorName: 'SolarixPro', body: 'salut', createdAt: new Date('2026-10-24T10:00:00Z') }]);
    const response = await companyMessages(request, companyParams);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      messages: [{ id: 'a', author: 'ADMIN', authorName: 'SolarixPro', body: 'salut', createdAt: '2026-10-24T10:00:00.000Z' }],
      open: true,
    });
    expect(m.mockMsgUpdateMany).toHaveBeenCalledWith({ where: { intentId: 'i1', author: 'ADMIN', readByCompanyAt: null }, data: { readByCompanyAt: expect.any(Date) } });
  });

  it('a support session reads without marking anything read', async () => {
    m.mockValidateSession.mockResolvedValue({ ...owner, impersonatedBySuperAdminId: 'admin-1' });
    expect((await companyMessages(request, companyParams)).status).toBe(200);
    expect(m.mockMsgUpdateMany).not.toHaveBeenCalled();
  });

  it('the admin route needs an admin session', async () => {
    m.mockValidateSuperAdminSession.mockResolvedValue(null);
    expect((await adminMessages(request, adminParams)).status).toBe(401);
  });

  it('the admin route returns JSON, uncached, marks the payer messages read, 404 when unknown', async () => {
    const response = await adminMessages(request, adminParams);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(m.mockMsgUpdateMany).toHaveBeenCalledWith({ where: { intentId: 'i1', author: 'COMPANY', readByAdminAt: null }, data: { readByAdminAt: expect.any(Date) } });
    m.mockIntentFindUnique.mockResolvedValue(null);
    expect((await adminMessages(request, adminParams)).status).toBe(404);
  });

  it('reports a closed conversation', async () => {
    m.mockIntentFindFirst.mockResolvedValue({ id: 'i1', status: 'CANCELLED', paidAt: null });
    expect(((await (await companyMessages(request, companyParams)).json()) as { open: boolean }).open).toBe(false);
  });
});

describe('notifications', () => {
  it('emails the admin address when the payer writes: company, amount and link, never the text', async () => {
    await postCompanyMessage(owner, 'i1', SECRET, NOW);
    expect(m.mockSendEmail).toHaveBeenCalledTimes(1);
    const message = m.mockSendEmail.mock.calls[0]![0];
    expect(message.to).toBe('admin@dossipv.tn');
    expect(message.text).toContain('Solaire SARL');
    expect(message.text).toContain('59,00 TND');
    expect(message.action.url).toBe('https://app.test/admin/paiements/i1');
    expect(emailsSent()).not.toContain('personnel');
    expect(emailsSent()).not.toContain('0612345678');
  });

  it('emails the owner users when the admin writes, with the payment link and without the text', async () => {
    await postAdminMessage('i1', SECRET, NOW);
    expect(m.mockOwnersFindMany).toHaveBeenCalledWith({ where: { companyId: 'c1', role: 'OWNER', disabledAt: null }, select: { email: true } });
    const message = m.mockSendEmail.mock.calls[0]![0];
    expect(message.to).toEqual(['owner@solaire.tn']);
    expect(message.action.url).toBe('https://app.test/paiement/i1');
    expect(emailsSent()).not.toContain('personnel');
  });

  it('sends no second email while an earlier message from the same side is still unread', async () => {
    // count calls: day cap, then the "already waiting unread" check.
    m.mockMsgCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await postCompanyMessage(owner, 'i1', 'encore', NOW);
    expect(m.mockMsgCreate).toHaveBeenCalledTimes(1);
    expect(m.mockSendEmail).not.toHaveBeenCalled();
    m.mockMsgCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await postAdminMessage('i1', 'encore', NOW);
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing when no admin address is configured', async () => {
    m.mockAdminEmail.mockReturnValue(null);
    expect((await postCompanyMessage(owner, 'i1', 'bonjour', NOW)).ok).toBe(true);
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('never fails the action when the email fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.mockSendEmail.mockRejectedValue(new Error('smtp down'));
    expect(await postCompanyMessage(owner, 'i1', 'bonjour', NOW)).toEqual({ ok: true });
    m.mockOwnersFindMany.mockRejectedValue(new Error('db down'));
    expect(await postAdminMessage('i1', 'bonjour', NOW)).toEqual({ ok: true });
    spy.mockRestore();
  });
});
