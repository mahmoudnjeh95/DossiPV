import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockCompanyFindUnique: vi.fn(),
    mockCompanyFindMany: vi.fn(),
    mockCompanyUpdate: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      company: { findUnique: m.mockCompanyFindUnique, findMany: m.mockCompanyFindMany, update: m.mockCompanyUpdate },
    },
  };
});

import { saveCompanyAction } from '../app/(app)/settings/actions';

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'valid-session-token' });
  m.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com' });
  m.mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });
  m.mockCompanyFindMany.mockResolvedValue([]);
  m.mockCompanyUpdate.mockResolvedValue({ id: 'company-1' });
});

function form(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    name: 'SolarPro', address: '12 Rue de la Paix', phone: '20123456', email: 'contact@solarpro.tn',
    legalRepFullName: 'Ahmed Ben Ali', legalRepRole: 'Gérant', anmeCode: 'ANME-001',
    anmeCategory: 'BT', anmeValidFrom: '2026-01-01', anmeValidTo: '2099-01-01',
    defaultTMinC: '-10', defaultTMaxC: '85', defaultMaxVoltageDropPct: '3', defaultMaxAcVoltageDropPct: '1',
    defaultDesignWindSpeedKmh: '120', defaultCosPhi: '0.95',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('saveCompanyAction — profile completion (self sign-up)', () => {
  it('marks the profile complete when address, representative, category and validity are all given', async () => {
    const result = await saveCompanyAction(undefined, form());

    expect(result).toBeUndefined();
    const arg = m.mockCompanyUpdate.mock.calls[0]?.[0] as { data: { profileComplete: boolean } };
    expect(arg.data.profileComplete).toBe(true);
  });

  it.each([
    ['address', 'Adresse'],
    ['legalRepFullName', 'Représentant légal'],
    ['anmeValidFrom', 'Début de validité ANME'],
    ['anmeValidTo', 'Fin de validité ANME'],
  ])('refuses an empty %s and keeps the profile incomplete', async (field, label) => {
    const result = await saveCompanyAction(undefined, form({ [field]: '' }));

    expect(result?.error).toContain(label);
    expect(m.mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it('refuses an unknown ANME category', async () => {
    const result = await saveCompanyAction(undefined, form({ anmeCategory: 'XX' }));

    expect(result?.error).toContain('Catégorie ANME');
    expect(m.mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it('does not let the sign-up placeholder dates (2000-01-01) pass', async () => {
    const result = await saveCompanyAction(undefined, form({ anmeValidFrom: '2000-01-01', anmeValidTo: '2000-01-01' }));

    expect(result?.error).toContain('postérieure au début');
    expect(result?.error).toContain('saisissez la date réelle');
    expect(result?.error).toContain('dans le futur');
    expect(m.mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it('refuses a placeholder start date even with a future end date', async () => {
    const result = await saveCompanyAction(undefined, form({ anmeValidFrom: '2000-01-01', anmeValidTo: '2099-01-01' }));

    expect(result?.error).toContain('saisissez la date réelle');
    expect(m.mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it('refuses an agreement that has already expired', async () => {
    const result = await saveCompanyAction(undefined, form({ anmeValidFrom: '2020-01-01', anmeValidTo: '2021-01-01' }));

    expect(result?.error).toContain('dans le futur');
    expect(m.mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it('refuses an ANME code already used by another company, ignoring case, spaces and dashes', async () => {
    m.mockCompanyFindMany.mockResolvedValue([{ name: 'Autre SARL', anmeCode: 'anme 001' }]);

    const result = await saveCompanyAction(undefined, form({ anmeCode: 'ANME-001' }));

    expect(result?.error).toBe('Ce code ANME est déjà inscrit (Autre SARL).');
    expect(m.mockCompanyFindMany).toHaveBeenCalledWith({ where: { id: { not: 'company-1' } }, select: { name: true, anmeCode: true } });
    expect(m.mockCompanyUpdate).not.toHaveBeenCalled();
  });
});
