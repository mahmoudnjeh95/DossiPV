import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ findMany: vi.fn(), upsert: vi.fn() }));
vi.mock('@dossipv/db', () => ({ db: { supplierProduct: { findMany: m.findMany }, supplierProductDailyStat: { upsert: m.upsert } } }));

import { highlightedFirst, loadHighlightedProducts, recordProductStat } from '../lib/highlight';

beforeEach(() => vi.clearAllMocks());

describe('loadHighlightedProducts', () => {
  it('asks only for highlighted, published, sourced shared items of suppliers whose pack includes it and is active', async () => {
    m.findMany.mockResolvedValue([]);
    const now = new Date('2026-10-24');

    expect(await loadHighlightedProducts(now)).toEqual({ moduleIds: [], inverterIds: [], suppliers: {}, productIds: {} });

    const published = { ownerCompanyId: null, catalogStatus: 'PUBLISHED', datasheetSourceUrl: { not: null } };
    expect(m.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          highlighted: true,
          supplierCompany: { kind: 'SUPPLIER', subscription: { is: { status: 'ACTIVE', periodEnd: { gt: now }, plan: { is: { includesHighlight: true } } } } },
          OR: [{ pvModule: published }, { inverter: published }],
        },
      }),
    );
  });

  it('lists panels and inverters, and every supplier highlighting the same item', async () => {
    m.findMany.mockResolvedValue([
      { id: 'sp-1', pvModuleId: 'panel-1', inverterId: null, supplierCompany: { name: 'SolarTN' } },
      { id: 'sp-2', pvModuleId: 'panel-1', inverterId: null, supplierCompany: { name: 'SunSfax' } },
      { id: 'sp-3', pvModuleId: null, inverterId: 'inv-1', supplierCompany: { name: 'SolarTN' } },
    ]);

    expect(await loadHighlightedProducts()).toEqual({
      moduleIds: ['panel-1'],
      inverterIds: ['inv-1'],
      suppliers: { 'panel-1': ['SolarTN', 'SunSfax'], 'inv-1': ['SolarTN'] },
      productIds: { 'panel-1': ['sp-1', 'sp-2'], 'inv-1': ['sp-3'] },
    });
  });
});

describe('highlightedFirst', () => {
  it('puts highlighted items first and keeps every other order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(highlightedFirst(items, ['c', 'a']).map((i) => i.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(highlightedFirst(items, []).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('recordProductStat', () => {
  it('counts per product and UTC day, once per product however often it is listed', async () => {
    await recordProductStat(['sp-1', 'sp-1', 'sp-2'], 'shown', new Date('2026-10-24T23:30:00Z'));

    expect(m.upsert).toHaveBeenCalledTimes(2);
    expect(m.upsert).toHaveBeenCalledWith({
      where: { supplierProductId_date: { supplierProductId: 'sp-1', date: new Date('2026-10-24T00:00:00Z') } },
      create: { supplierProductId: 'sp-1', date: new Date('2026-10-24T00:00:00Z'), shownCount: 1 },
      update: { shownCount: { increment: 1 } },
    });
  });

  it('does nothing without products', async () => {
    await recordProductStat([], 'applied');
    expect(m.upsert).not.toHaveBeenCalled();
  });
});
