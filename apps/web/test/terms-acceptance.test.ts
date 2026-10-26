import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  user: { id: 'u1', companyId: 'c1', email: 'a@b.tn', fullName: 'A', role: 'OWNER' as const, impersonatedBySuperAdminId: null as string | null },
  mockRedirect: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockCompanyFindUnique: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/db', () => ({
  db: {
    companyUser: { findUnique: m.mockUserFindUnique, update: m.mockUserUpdate },
    company: { findUnique: m.mockCompanyFindUnique },
  },
}));
vi.mock('../app/(app)/layout', () => ({ requireAuthenticatedCompanyUser: (): Promise<typeof m.user> => Promise.resolve(m.user) }));

import { requireCurrentTerms } from '../lib/terms-gate';
import { acceptTermsAction } from '../app/conditions/actions';
import { TERMS_VERSION, needsTermsAcceptance } from '../lib/legal';

const anyDate = (): Date => expect.any(Date) as Date;

function acceptForm(checked: boolean): FormData {
  const formData = new FormData();
  if (checked) formData.set('acceptTerms', 'on');
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.user.impersonatedBySuperAdminId = null;
  m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER' });
});

describe('needsTermsAcceptance', () => {
  it('is false only for the current version', () => {
    expect(needsTermsAcceptance(TERMS_VERSION)).toBe(false);
    expect(needsTermsAcceptance(null)).toBe(true);
    expect(needsTermsAcceptance(undefined)).toBe(true);
    expect(needsTermsAcceptance('2000-01-01')).toBe(true);
  });
});

describe('requireCurrentTerms', () => {
  it.each([null, '2000-01-01'])('sends a user on version %s to /conditions', async (version) => {
    m.mockUserFindUnique.mockResolvedValue({ termsVersion: version });

    await requireCurrentTerms(m.user);

    expect(m.mockRedirect).toHaveBeenCalledWith('/conditions');
  });

  it('lets a user who accepted the current version through', async () => {
    m.mockUserFindUnique.mockResolvedValue({ termsVersion: TERMS_VERSION });

    await requireCurrentTerms(m.user);

    expect(m.mockRedirect).not.toHaveBeenCalled();
  });

  it('lets the impersonating super admin through without accepting for the user', async () => {
    m.user.impersonatedBySuperAdminId = 'admin1';

    await requireCurrentTerms(m.user);

    expect(m.mockUserFindUnique).not.toHaveBeenCalled();
    expect(m.mockRedirect).not.toHaveBeenCalled();
  });
});

describe('acceptTermsAction', () => {
  it('records the current version and opens the installer dashboard', async () => {
    await acceptTermsAction(undefined, acceptForm(true));

    expect(m.mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { termsAcceptedAt: anyDate(), termsVersion: TERMS_VERSION },
    });
    expect(m.mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('opens the supplier space for a supplier', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'SUPPLIER' });

    await acceptTermsAction(undefined, acceptForm(true));

    expect(m.mockRedirect).toHaveBeenCalledWith('/fournisseur');
  });

  it('refuses without the box ticked', async () => {
    const result = await acceptTermsAction(undefined, acceptForm(false));

    expect(result).toEqual({ error: expect.stringContaining('Cochez') as string });
    expect(m.mockUserUpdate).not.toHaveBeenCalled();
  });

  it('refuses the impersonating super admin', async () => {
    m.user.impersonatedBySuperAdminId = 'admin1';

    const result = await acceptTermsAction(undefined, acceptForm(true));

    expect(result).toMatchObject({ error: expect.stringContaining('utilisateur lui-même') as string });
    expect(m.mockUserUpdate).not.toHaveBeenCalled();
  });
});
