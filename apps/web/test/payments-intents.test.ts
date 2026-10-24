import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

const m = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockRequireUser: vi.fn(),
  mockCompanyFindUnique: vi.fn(),
  mockPlanFindUnique: vi.fn(),
  mockSettingsFindUnique: vi.fn(),
  mockIntentCount: vi.fn(),
  mockIntentCreate: vi.fn(),
  mockIntentUpdateMany: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../app/(app)/layout', () => ({ requireAuthenticatedCompanyUser: m.mockRequireUser }));
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      company: { findUnique: m.mockCompanyFindUnique },
      plan: { findUnique: m.mockPlanFindUnique },
      platformSettings: { findUnique: m.mockSettingsFindUnique },
      paymentIntent: { count: m.mockIntentCount, create: m.mockIntentCreate, updateMany: m.mockIntentUpdateMany },
    },
  };
});

import { cancelIntentAction, createIntentAction, declareIntentAction } from '../app/paiement/actions';
import { cancelIntent, createIntent, declareIntent } from '../lib/payments/intents';
import { offeredProviders, paymentReference } from '../lib/payments/p2p';

const owner = { id: 'u1', companyId: 'c1', email: 'o@x.tn', fullName: 'O', role: 'OWNER' as const };
const plan = { id: 'plan-std', tier: 'STANDARD', audience: 'INSTALLER', archivedAt: null, isTrial: false, priceTnd: 50 };

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer();
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mockRequireUser.mockResolvedValue(owner);
  m.mockSettingsFindUnique.mockResolvedValue({ p2pFlouciNumber: '+216 20 123 456', p2pIziNumber: null, p2pD17Number: '98 765 432', p2pAccountHolder: 'DossiPV' });
  m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: null, subscription: { planId: 'plan-std' } });
  m.mockPlanFindUnique.mockResolvedValue(plan);
  m.mockIntentCount.mockResolvedValue(0);
  m.mockIntentCreate.mockResolvedValue({ id: 'intent-1' });
  m.mockIntentUpdateMany.mockResolvedValue({ count: 1 });
});

describe('providers and reference', () => {
  it('offers only the providers with a number', () => {
    const offered = offeredProviders({ accountHolder: null, numbers: { FLOUCI: '20 123 456', IZI: null, D17: '  ' }, instructions: null });
    expect(offered.map((p) => p.id)).toEqual(['FLOUCI']);
  });

  it('builds DPV- plus 6 characters of the intent id', () => {
    expect(paymentReference('1a2b3c4d-0000-0000-0000-000000000000')).toBe('DPV-1A2B3C');
  });
});

describe('createIntent', () => {
  it('records a PENDING intent priced plan × months', async () => {
    await expect(createIntent('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 3, provider: 'FLOUCI' })).resolves.toEqual({ intentId: 'intent-1' });
    expect(m.mockIntentCreate).toHaveBeenCalledWith({
      data: { companyId: 'c1', purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 3, amountTnd: 150, provider: 'FLOUCI' },
      select: { id: true },
    });
  });

  it('refuses a provider without a number', async () => {
    await expect(createIntent('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1, provider: 'IZI' })).rejects.toThrow(/pas disponible/);
    expect(m.mockIntentCreate).not.toHaveBeenCalled();
  });

  it('refuses a fourth open intent', async () => {
    m.mockIntentCount.mockResolvedValue(3);
    await expect(createIntent('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1, provider: 'FLOUCI' })).rejects.toThrow(/3 paiements en cours/);
    expect(m.mockIntentCount).toHaveBeenCalledWith({ where: { companyId: 'c1', status: 'PENDING' } });
  });

  it('refuses an archived plan, a trial plan and an audience mismatch', async () => {
    const input = { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1, provider: 'FLOUCI' } as const;
    m.mockPlanFindUnique.mockResolvedValue({ ...plan, archivedAt: new Date() });
    await expect(createIntent('c1', input)).rejects.toThrow(/plus proposé/);
    m.mockPlanFindUnique.mockResolvedValue({ ...plan, isTrial: true });
    await expect(createIntent('c1', input)).rejects.toThrow(/essai/);
    m.mockPlanFindUnique.mockResolvedValue({ ...plan, audience: 'SUPPLIER' });
    await expect(createIntent('c1', input)).rejects.toThrow();
    expect(m.mockIntentCreate).not.toHaveBeenCalled();
  });

  it('refuses the 3D option unless sponsored and priced', async () => {
    const input = { purpose: 'OPTION_3D', planId: null, months: 1, provider: 'D17' } as const;
    await expect(createIntent('c1', input)).rejects.toThrow(/parrainés/);
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: 's1', subscription: null });
    await expect(createIntent('c1', input)).rejects.toThrow(/pas encore en vente/);
    m.mockSettingsFindUnique.mockResolvedValue({ p2pD17Number: '98 765 432', option3dPriceTnd: 12 });
    await createIntent('c1', input);
    expect(m.mockIntentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ purpose: 'OPTION_3D', amountTnd: 12 }) as unknown }));
  });
});

describe('createIntentAction', () => {
  it('redirects to the payment page of the new intent', async () => {
    await createIntentAction('SUBSCRIPTION', 'plan-std', 1, 'FLOUCI');
    expect(m.mockRedirect).toHaveBeenCalledWith('/paiement/intent-1');
  });

  it('refuses a support session and a non-owner without creating anything', async () => {
    m.mockRequireUser.mockResolvedValue({ ...owner, impersonatedBySuperAdminId: 'admin-1' });
    await expect(createIntentAction('SUBSCRIPTION', 'plan-std', 1, 'FLOUCI')).resolves.toEqual({ error: expect.stringMatching(/Mode support/) as unknown });

    m.mockRequireUser.mockResolvedValue({ ...owner, role: 'MEMBER' });
    await expect(createIntentAction('SUBSCRIPTION', 'plan-std', 1, 'FLOUCI')).resolves.toEqual({ error: expect.stringMatching(/responsable du compte/) as unknown });
    expect(m.mockIntentCreate).not.toHaveBeenCalled();
  });

  it('returns the French refusal of the pricing rules', async () => {
    m.mockIntentCount.mockResolvedValue(3);
    const result = await createIntentAction('SUBSCRIPTION', 'plan-std', 1, 'FLOUCI');
    expect(result?.error).toMatch(/paiements en cours/);
    expect(m.mockRedirect).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider', async () => {
    await expect(createIntentAction('SUBSCRIPTION', 'plan-std', 1, 'KONNECT')).resolves.toEqual({ error: 'Moyen de paiement inconnu.' });
  });
});

describe('declareIntent', () => {
  const NOW = new Date('2026-10-24T10:00:00.000Z');

  it('requires the screenshot and the reference', async () => {
    await expect(declareIntent('c1', 'i1', { file: null, reference: '20 123 456' }, NOW)).rejects.toThrow(/capture/);
    const file = { buffer: await png(100, 100), type: 'image/png', size: 5000 };
    await expect(declareIntent('c1', 'i1', { file, reference: '   ' }, NOW)).rejects.toThrow(/numéro d’envoi ou la référence/);
    expect(m.mockIntentUpdateMany).not.toHaveBeenCalled();
  });

  it('validates the type, the content and the size', async () => {
    const buffer = await png(100, 100);
    await expect(declareIntent('c1', 'i1', { file: { buffer, type: 'application/pdf', size: 100 }, reference: 'r' }, NOW)).rejects.toThrow();
    await expect(declareIntent('c1', 'i1', { file: { buffer, type: 'image/jpeg', size: 100 }, reference: 'r' }, NOW)).rejects.toThrow(/ne correspond pas/);
    await expect(declareIntent('c1', 'i1', { file: { buffer, type: 'image/png', size: 9 * 1024 * 1024 }, reference: 'r' }, NOW)).rejects.toThrow(/8 Mo/);
    await expect(declareIntent('c1', 'i1', { file: { buffer: Buffer.from('not an image at all'), type: 'image/png', size: 20 }, reference: 'r' }, NOW)).rejects.toThrow();
    expect(m.mockIntentUpdateMany).not.toHaveBeenCalled();
  });

  it('re-encodes to a JPEG of 1600 px at most and sets a 30-day expiry', async () => {
    const buffer = await png(3200, 1600);
    await declareIntent('c1', 'i1', { file: { buffer, type: 'image/png', size: buffer.length }, reference: ' 20 123 456 ' }, NOW);

    const call = m.mockIntentUpdateMany.mock.calls[0]?.[0] as {
      where: unknown;
      data: { proofImage: Uint8Array; proofMime: string; proofExpiresAt: Date; declaredAt: Date; providerReference: string };
    };
    expect(call.where).toEqual({ id: 'i1', companyId: 'c1', status: 'PENDING' });
    expect(call.data.proofMime).toBe('image/jpeg');
    expect(call.data.providerReference).toBe('20 123 456');
    expect(call.data.declaredAt).toEqual(NOW);
    expect(call.data.proofExpiresAt).toEqual(new Date('2026-11-23T10:00:00.000Z'));
    const meta = await sharp(Buffer.from(call.data.proofImage)).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(800);
  });

  it('accepts WebP and does not enlarge a small image', async () => {
    const webp = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#fff' } }).webp().toBuffer();
    await declareIntent('c1', 'i1', { file: { buffer: webp, type: 'image/webp', size: webp.length }, reference: 'r' }, NOW);
    const call = m.mockIntentUpdateMany.mock.calls[0]?.[0] as { data: { proofImage: Uint8Array } };
    expect((await sharp(Buffer.from(call.data.proofImage)).metadata()).width).toBe(300);
  });

  it('refuses once the intent is decided or not the company’s own', async () => {
    m.mockIntentUpdateMany.mockResolvedValue({ count: 0 });
    const buffer = await png(50, 50);
    await expect(declareIntent('c1', 'i1', { file: { buffer, type: 'image/png', size: buffer.length }, reference: 'r' }, NOW)).rejects.toThrow(/n’accepte plus/);
  });
});

describe('declareIntentAction', () => {
  it('refuses a support session and a non-owner', async () => {
    m.mockRequireUser.mockResolvedValue({ ...owner, impersonatedBySuperAdminId: 'admin-1' });
    expect((await declareIntentAction('i1', undefined, new FormData()))?.error).toMatch(/Mode support/);
    m.mockRequireUser.mockResolvedValue({ ...owner, role: 'MEMBER' });
    expect((await declareIntentAction('i1', undefined, new FormData()))?.error).toMatch(/responsable/);
    expect(m.mockIntentUpdateMany).not.toHaveBeenCalled();
  });

  it('reads the file and the reference from the form', async () => {
    const buffer = await png(80, 80);
    const formData = new FormData();
    formData.set('proof', new File([new Uint8Array(buffer)], 'virement.png', { type: 'image/png' }));
    formData.set('reference', '98 765 432');

    await expect(declareIntentAction('i1', undefined, formData)).resolves.toEqual({ saved: true });
    expect(m.mockIntentUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('answers « capture requise » when no file was sent', async () => {
    const formData = new FormData();
    formData.set('reference', '98 765 432');
    expect((await declareIntentAction('i1', undefined, formData))?.error).toMatch(/capture/);
  });
});

describe('cancelIntent', () => {
  it('cancels only the company’s own open intent', async () => {
    await cancelIntent('c1', 'i1');
    expect(m.mockIntentUpdateMany).toHaveBeenCalledWith({ where: { id: 'i1', companyId: 'c1', status: 'PENDING' }, data: { status: 'CANCELLED' } });
  });

  it('refuses when nothing was open', async () => {
    m.mockIntentUpdateMany.mockResolvedValue({ count: 0 });
    await expect(cancelIntent('c1', 'i1')).rejects.toThrow(/ne peut plus être annulé/);
  });

  it('the action does nothing for a support session', async () => {
    m.mockRequireUser.mockResolvedValue({ ...owner, impersonatedBySuperAdminId: 'admin-1' });
    await cancelIntentAction('i1');
    expect(m.mockIntentUpdateMany).not.toHaveBeenCalled();
  });
});
