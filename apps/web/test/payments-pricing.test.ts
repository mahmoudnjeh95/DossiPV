import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  mockCompanyFindUnique: vi.fn(),
  mockPlanFindUnique: vi.fn(),
  mockSettingsFindUnique: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      company: { findUnique: m.mockCompanyFindUnique },
      plan: { findUnique: m.mockPlanFindUnique },
      platformSettings: { findUnique: m.mockSettingsFindUnique },
    },
  };
});

import { computeAmount, planPurchaseError, priceCheckout } from '../lib/payments/pricing';
import { PaymentError } from '../lib/payments/p2p';

const installerPlan = { id: 'plan-std', tier: 'STANDARD', audience: 'INSTALLER', archivedAt: null, isTrial: false, priceTnd: 49.9 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  m.mockSettingsFindUnique.mockResolvedValue({ option3dPriceTnd: 15 });
});

describe('computeAmount', () => {
  it('multiplies the unit price by the months, with no VAT and no stamp', () => {
    expect(computeAmount(49, 1)).toBe(49);
    expect(computeAmount(49, 12)).toBe(588);
  });

  it('stays exact to the centime', () => {
    expect(computeAmount(49.9, 3)).toBe(149.7);
    expect(computeAmount(19.99, 12)).toBe(239.88);
    expect(computeAmount(0.1, 3)).toBe(0.3);
  });
});

describe('planPurchaseError', () => {
  const installer = { kind: 'INSTALLER', sponsored: false } as const;

  it('accepts an active paid plan of the right audience', () => {
    expect(planPurchaseError(installer, installerPlan, 'plan-std', null)).toBeNull();
  });

  it('refuses an archived plan, an audience mismatch and the trial plan', () => {
    expect(planPurchaseError(installer, { ...installerPlan, archivedAt: new Date() }, 'plan-std', null)).toMatch(/plus proposé/);
    expect(planPurchaseError(installer, { ...installerPlan, audience: 'SUPPLIER' }, 'plan-std', null)).not.toBeNull();
    expect(planPurchaseError(installer, { ...installerPlan, isTrial: true }, 'plan-std', null)).toMatch(/essai/);
  });

  it('lets a sponsored installer buy Premium but not Standard', () => {
    const sponsored = { kind: 'INSTALLER', sponsored: true } as const;
    expect(planPurchaseError(sponsored, installerPlan, 'plan-std', null)).toMatch(/offert par votre fournisseur/);
    expect(planPurchaseError(sponsored, { ...installerPlan, tier: 'PREMIUM' }, 'plan-prem', null)).toBeNull();
  });

  it('lets a supplier renew only its current pack', () => {
    const supplier = { kind: 'SUPPLIER', sponsored: false } as const;
    const pack = { ...installerPlan, audience: 'SUPPLIER' } as const;
    expect(planPurchaseError(supplier, pack, 'pack-1', 'pack-1')).toBeNull();
    expect(planPurchaseError(supplier, pack, 'pack-2', 'pack-1')).toMatch(/pack actuel/);
  });
});

describe('priceCheckout', () => {
  it('prices a subscription as plan price × months', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: null, subscription: { planId: 'plan-std' } });
    m.mockPlanFindUnique.mockResolvedValue(installerPlan);

    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 3 })).resolves.toEqual({
      purpose: 'SUBSCRIPTION',
      planId: 'plan-std',
      months: 3,
      amountTnd: 149.7,
    });
  });

  it('refuses a duration outside 1, 3, 6, 12', async () => {
    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 2 })).rejects.toBeInstanceOf(PaymentError);
  });

  it('refuses a plan the company cannot buy', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: null, subscription: null });
    m.mockPlanFindUnique.mockResolvedValue({ ...installerPlan, archivedAt: new Date() });

    await expect(priceCheckout('c1', { purpose: 'SUBSCRIPTION', planId: 'plan-std', months: 1 })).rejects.toThrow(/plus proposé/);
  });

  it('prices the 3D option for a sponsored installer from the settings price', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: 's1', subscription: null });

    await expect(priceCheckout('c1', { purpose: 'OPTION_3D', planId: null, months: 6 })).resolves.toMatchObject({ purpose: 'OPTION_3D', planId: null, amountTnd: 90 });
  });

  it('refuses the 3D option to a direct installer and when no price is set', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: null, subscription: null });
    await expect(priceCheckout('c1', { purpose: 'OPTION_3D', planId: null, months: 1 })).rejects.toThrow(/parrainés/);

    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: 's1', subscription: null });
    m.mockSettingsFindUnique.mockResolvedValue({ option3dPriceTnd: null });
    await expect(priceCheckout('c1', { purpose: 'OPTION_3D', planId: null, months: 1 })).rejects.toThrow(/pas encore en vente/);
  });
});
