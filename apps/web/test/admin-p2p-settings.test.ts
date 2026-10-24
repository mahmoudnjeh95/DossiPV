import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockSettingsUpsert: vi.fn(),
    mockAuditCreate: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: m.mockValidateSuperAdminSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, platformSettings: { upsert: m.mockSettingsUpsert }, adminAuditLog: { create: m.mockAuditCreate } } };
});

import { updateP2pSettingsAction } from '../app/admin/(protected)/settings/actions';

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'admin-token' });
  m.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'a@x.tn' });
});

describe('updateP2pSettingsAction', () => {
  it('saves the holder, the numbers and the instructions, and logs settings.p2p', async () => {
    const result = await updateP2pSettingsAction(
      undefined,
      form({
        p2pAccountHolder: 'DossiPV SARL',
        p2pFlouciNumber: '+216 20 123 456',
        p2pIziNumber: '',
        p2pD17Number: '98765432',
        p2pInstructions: 'Mettez la référence en commentaire.',
      }),
    );

    expect(result).toEqual({ saved: true });
    const input = {
      p2pAccountHolder: 'DossiPV SARL',
      p2pFlouciNumber: '+216 20 123 456',
      p2pIziNumber: null,
      p2pD17Number: '98765432',
      p2pInstructions: 'Mettez la référence en commentaire.',
    };
    expect(m.mockSettingsUpsert).toHaveBeenCalledWith({ where: { id: 'singleton' }, create: { id: 'singleton', ...input }, update: input });
    expect(m.mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'settings.p2p', details: { accountHolder: 'DossiPV SARL', flouci: true, izi: false, d17: true } }) as unknown,
    });
  });

  it('accepts a form with no number at all (payment then unavailable)', async () => {
    expect(await updateP2pSettingsAction(undefined, form({}))).toEqual({ saved: true });
    expect(m.mockSettingsUpsert).toHaveBeenCalled();
  });

  it('rejects numbers that are not phone-like', async () => {
    const result = await updateP2pSettingsAction(undefined, form({ p2pFlouciNumber: 'abc-123', p2pD17Number: '12' }));
    expect(result?.error).toMatch(/Numéro Flouci/);
    expect(result?.error).toMatch(/Numéro D17/);
    expect(m.mockSettingsUpsert).not.toHaveBeenCalled();
  });

  it('rejects values that are too long', async () => {
    const result = await updateP2pSettingsAction(undefined, form({ p2pAccountHolder: 'x'.repeat(101), p2pInstructions: 'y'.repeat(1001), p2pIziNumber: '1'.repeat(25) }));
    expect(result?.error).toBeTruthy();
    expect(m.mockSettingsUpsert).not.toHaveBeenCalled();
  });

  it('redirects an unauthenticated caller', async () => {
    m.mockGet.mockReturnValue(undefined);
    // The mocked redirect does not throw as the real one does, so the action goes on and fails on the missing admin.
    await updateP2pSettingsAction(undefined, form({})).catch(() => undefined);
    expect(m.mockRedirect).toHaveBeenCalledWith('/admin/login');
  });
});
