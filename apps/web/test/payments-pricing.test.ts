import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  companyFindUnique: vi.fn(),
  planFindUnique: vi.fn(),
  settingsFindUnique: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      company: { findUnique: m.companyFindUnique },
      plan: { findUnique: m.planFindUnique },
      platformSettings: { findUnique: m.settingsFindUnique },
    },
  };
});

import { computePrice, priceCheckout } from '../lib/payments/pricing';
import { CheckoutError } from '../lib/payments/types';

const plan = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'plan-std',
  name: 'Standard',
  priceTnd: 100,
  tier: 'STANDARD',
  audience: 'INSTALLER',
  archivedAt: null,
  isTrial: false,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.settingsFindUnique.mockResolvedValue({ vatRatePct: 19, stampDutyTnd: 1, option3dPriceTnd: 30 });
  m.companyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: null, subscription: { planId: 'plan-std' } });
  m.planFindUnique.mockResolvedValue(plan());
});

describe('computePrice', () => {
  it('adds VAT on the HT total and the fixed stamp duty once', () => {
    expect(computePrice({ unitPriceTnd: 100, months: 1, vatRatePct: 19, stampDutyTnd: 1 })).toEqual({ htTnd: 100, vatTnd: 19, stampTnd: 1, ttcTnd: 120 });
    expect(computePrice({ unitPriceTnd: 100, months: 12, vatRatePct: 19, stampDutyTnd: 1 })).toEqual({ htTnd: 1200, vatTnd: 228, stampTnd: 1, ttcTnd: 1429 });
  });

  it('rounds the VAT to the centime', () => {
    // 49.90 x 3 = 149.70 ; 19 % = 28.443 -> 28.44
    expect(computePrice({ unitPriceTnd: 49.9, months: 3, vatRatePct: 19, stampDutyTnd: 1 })).toEqual({ htTnd: 149.7, vatTnd: 28.44, stampTnd: 1, ttcTnd: 179.14 });
  });
});

describe('priceCheckout', () => {
  it('prices a plan period from the plan, the VAT rate and the stamp of the settings', async () => {
    const priced = await priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 3 });
    expect(priced).toMatchObject({ purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 3, htTnd: 300, vatTnd: 57, ttcTnd: 358 });
  });

  it('uses the defaults (19 %, 1 TND) while the settings row does not exist', async () => {
    m.settingsFindUnique.mockResolvedValue(null);
    expect((await priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1 })).ttcTnd).toBe(120);
  });

  it('prices the 3D option for a sponsored installer', async () => {
    m.companyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: 's1', subscription: null });
    expect(await priceCheckout('c1', { purpose: 'OPTION_3D', planId: null, months: 3 })).toMatchObject({ planId: null, htTnd: 90, vatTnd: 17.1, ttcTnd: 108.1 });
  });

  it('refuses an archived plan, a trial plan and an unknown plan', async () => {
    m.planFindUnique.mockResolvedValue(plan({ archivedAt: new Date() }));
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1 })).rejects.toThrow('plus proposé');
    m.planFindUnique.mockResolvedValue(plan({ isTrial: true }));
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1 })).rejects.toThrow('essai gratuit');
    m.planFindUnique.mockResolvedValue(null);
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'nope', months: 1 })).rejects.toBeInstanceOf(CheckoutError);
  });

  it('refuses a plan of the other audience, both ways', async () => {
    m.planFindUnique.mockResolvedValue(plan({ audience: 'SUPPLIER' }));
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1 })).rejects.toThrow('plan installateur');
    m.companyFindUnique.mockResolvedValue({ kind: 'SUPPLIER', sponsorCompanyId: null, subscription: { planId: 'plan-std' } });
    m.planFindUnique.mockResolvedValue(plan({ audience: 'INSTALLER' }));
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1 })).rejects.toThrow('pack fournisseur');
  });

  it('lets a supplier renew only its own pack', async () => {
    m.companyFindUnique.mockResolvedValue({ kind: 'SUPPLIER', sponsorCompanyId: null, subscription: { planId: 'pack-50' } });
    m.planFindUnique.mockResolvedValue(plan({ id: 'pack-100', audience: 'SUPPLIER' }));
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'pack-100', months: 1 })).rejects.toThrow('pack actuel');
    m.planFindUnique.mockResolvedValue(plan({ id: 'pack-50', audience: 'SUPPLIER' }));
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'pack-50', months: 1 })).resolves.toMatchObject({ ttcTnd: 120 });
  });

  it('keeps a sponsored installer from buying Standard but lets it buy Premium', async () => {
    m.companyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: 's1', subscription: null });
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1 })).rejects.toThrow('offert par votre fournisseur');
    m.planFindUnique.mockResolvedValue(plan({ id: 'plan-pre', tier: 'PREMIUM' }));
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-pre', months: 1 })).resolves.toMatchObject({ planId: 'plan-pre' });
  });

  it('refuses the 3D option to a direct installer, a supplier, or when no price is set', async () => {
    await expect(priceCheckout('c1', { purpose: 'OPTION_3D', planId: null, months: 1 })).rejects.toThrow('parrainés');
    m.companyFindUnique.mockResolvedValue({ kind: 'SUPPLIER', sponsorCompanyId: null, subscription: null });
    await expect(priceCheckout('c1', { purpose: 'OPTION_3D', planId: null, months: 1 })).rejects.toThrow('parrainés');
    m.companyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: 's1', subscription: null });
    m.settingsFindUnique.mockResolvedValue({ vatRatePct: 19, stampDutyTnd: 1, option3dPriceTnd: null });
    await expect(priceCheckout('c1', { purpose: 'OPTION_3D', planId: null, months: 1 })).rejects.toThrow('pas encore en vente');
  });

  it('refuses a duration other than 1, 3, 6 or 12 months', async () => {
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 2 })).rejects.toThrow('Durée invalide');
  });
});
