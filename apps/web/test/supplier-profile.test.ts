import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  requireSupplier: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  cookieGet: vi.fn(),
  db: {
    companyUser: { findUnique: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: m.cookieGet }) }));
vi.mock('@dossipv/db', () => ({ db: m.db }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, verifyPassword: m.verifyPassword, hashPassword: m.hashPassword };
});
vi.mock('../lib/supplier-access', () => ({ requireSupplier: m.requireSupplier }));

import { changePasswordAction } from '../app/fournisseur/profil/actions';
import { hashToken } from '@dossipv/auth';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const valid = { currentPassword: 'ancien-mot-de-passe', password: 'nouveau-mot-de-passe', confirmation: 'nouveau-mot-de-passe' };

beforeEach(() => {
  vi.clearAllMocks();
  m.requireSupplier.mockResolvedValue({ user: { id: 'u1' }, supplierId: 's1', supplierName: 'Solaire SA' });
  m.db.companyUser.findUnique.mockResolvedValue({ passwordHash: 'old-hash' });
  m.verifyPassword.mockResolvedValue(true);
  m.hashPassword.mockResolvedValue('new-hash');
  m.cookieGet.mockReturnValue({ value: 'tok' });
  m.db.$transaction.mockResolvedValue([]);
});

describe('changePasswordAction', () => {
  it('sets the new password and closes the other sessions only', async () => {
    expect(await changePasswordAction(undefined, form(valid))).toEqual({ done: true });
    expect(m.db.companyUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { passwordHash: 'new-hash' } });
    expect(m.db.session.deleteMany).toHaveBeenCalledWith({ where: { companyUserId: 'u1', tokenHash: { not: hashToken('tok') } } });
  });

  it.each([
    [{ currentPassword: '' }, 'mot de passe actuel'],
    [{ password: 'court', confirmation: 'court' }, 'au moins 10 caractères'],
    [{ confirmation: 'autre-mot-de-passe' }, 'ne correspondent pas'],
  ])('refuses %j', async (overrides, message) => {
    const result = await changePasswordAction(undefined, form({ ...valid, ...overrides }));
    expect(result).toMatchObject({ error: expect.stringContaining(message) as string });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a wrong current password', async () => {
    m.verifyPassword.mockResolvedValue(false);
    expect(await changePasswordAction(undefined, form(valid))).toEqual({ error: 'Le mot de passe actuel est incorrect.' });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it('is disabled in a support session', async () => {
    m.requireSupplier.mockResolvedValue({ user: { id: 'u1', impersonatedBySuperAdminId: 'a1' }, supplierId: 's1', supplierName: 'X' });
    expect(await changePasswordAction(undefined, form(valid))).toMatchObject({ error: expect.stringContaining('Mode support') as string });
  });
});
