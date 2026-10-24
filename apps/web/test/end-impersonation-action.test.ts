import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockDelete = vi.fn();
  return {
    mockGet,
    mockDelete,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet, delete: mockDelete })),
    mockRedirect: vi.fn(),
    mockLogout: vi.fn(),
    mockValidateSession: vi.fn(),
    mockAuditCreate: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, logout: m.mockLogout, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, adminAuditLog: { create: m.mockAuditCreate } } };
});

import { endImpersonationAction } from '../app/(app)/actions';

beforeEach(() => {
  for (const mock of [m.mockGet, m.mockDelete, m.mockRedirect, m.mockLogout, m.mockValidateSession, m.mockAuditCreate]) {
    mock.mockReset();
  }
});

describe('endImpersonationAction', () => {
  it('ends the support session, logs it under the admin who opened it and goes back to the company page', async () => {
    m.mockGet.mockReturnValue({ value: 'support-token' });
    m.mockValidateSession.mockResolvedValue({
      id: 'user-2',
      companyId: 'company-1',
      email: 'membre@solar.tn',
      fullName: 'Salma Membre',
      role: 'MEMBER',
      impersonatedBySuperAdminId: 'admin-1',
    });

    await endImpersonationAction();

    expect(m.mockLogout).toHaveBeenCalledWith('support-token');
    expect(m.mockDelete).toHaveBeenCalledWith('dossipv_session');
    expect(m.mockAuditCreate).toHaveBeenCalledWith({
      data: {
        superAdminId: 'admin-1',
        action: 'impersonation.end',
        targetCompanyId: 'company-1',
        details: { userId: 'user-2', email: 'membre@solar.tn' },
      },
    });
    expect(m.mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });

  it("logs a normal session out without writing to the audit log", async () => {
    m.mockGet.mockReturnValue({ value: 'own-token' });
    m.mockValidateSession.mockResolvedValue({ id: 'user-2', companyId: 'company-1', email: 'a@b.tn', fullName: 'A', role: 'MEMBER', impersonatedBySuperAdminId: null });

    await endImpersonationAction();

    expect(m.mockLogout).toHaveBeenCalledWith('own-token');
    expect(m.mockDelete).toHaveBeenCalledWith('dossipv_session');
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
    expect(m.mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('goes to /login when there is no session cookie', async () => {
    m.mockGet.mockReturnValue(undefined);

    await endImpersonationAction();

    expect(m.mockValidateSession).not.toHaveBeenCalled();
    expect(m.mockLogout).not.toHaveBeenCalled();
    expect(m.mockRedirect).toHaveBeenCalledWith('/login');
  });
});
