import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  validateSession: vi.fn(),
  companyFindUnique: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({ cookies: (): Promise<{ get: unknown }> => Promise.resolve({ get: m.cookieGet }) }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('@dossipv/auth', () => ({ validateSession: m.validateSession }));
vi.mock('@dossipv/db', () => ({ db: { company: { findUnique: m.companyFindUnique } } }));
vi.mock('../components/app-shell', () => ({ AppShell: (): null => null }));
vi.mock('../app/(app)/actions', () => ({ endImpersonationAction: vi.fn() }));

import { requireInstallerUser } from '../app/(app)/layout';

const USER = { id: 'u1', companyId: 'c1', email: 'a@b.tn', fullName: 'A', role: 'OWNER' };

beforeEach(() => {
  vi.clearAllMocks();
  m.cookieGet.mockReturnValue({ value: 'token' });
  m.validateSession.mockResolvedValue(USER);
});

describe('requireInstallerUser (the guard of every installer server action)', () => {
  it('lets an installer company through', async () => {
    m.companyFindUnique.mockResolvedValue({ kind: 'INSTALLER' });

    expect(await requireInstallerUser()).toEqual(USER);
  });

  it('sends a supplier company to its own space: a supplier cannot post installer actions', async () => {
    m.companyFindUnique.mockResolvedValue({ kind: 'SUPPLIER' });

    await expect(requireInstallerUser()).rejects.toThrow('NEXT_REDIRECT:/fournisseur');
  });

  it('still needs a session', async () => {
    m.cookieGet.mockReturnValue(undefined);

    await expect(requireInstallerUser()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(m.companyFindUnique).not.toHaveBeenCalled();
  });
});
