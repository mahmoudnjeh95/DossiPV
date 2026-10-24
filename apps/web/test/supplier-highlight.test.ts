/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-function-return-type -- mocked modules of loosely typed call arguments */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  redirect: vi.fn(),
  logAdminAction: vi.fn(),
  db: {
    subscription: { findUnique: vi.fn() },
    supplierProduct: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    supplierProductDailyStat: { findMany: vi.fn() },
    dossierJob: { findMany: vi.fn() },
  },
}));

vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@dossipv/db', () => ({ db: m.db }));
vi.mock('@dossipv/file-storage', () => ({ saveFile: vi.fn(), validateUploadedFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('../lib/supplier-access', () => ({
  requireSupplier: () => Promise.resolve({ supplierId: 'sup1', supplierName: 'Solaire SA', user: {} }),
  dossiersThisMonth: vi.fn(),
}));
vi.mock('../lib/sponsorship', () => ({ syncSupplierInstallers: vi.fn() }));
vi.mock('../lib/admin-audit', () => ({ logAdminAction: m.logAdminAction, describeAuditDetails: vi.fn() }));
vi.mock('../app/admin/(protected)/layout', () => ({ requireAuthenticatedSuperAdmin: () => Promise.resolve({ id: 'admin1' }) }));

import { setProductHighlightedAction } from '../app/fournisseur/produits/actions';
import { unhighlightProductAction } from '../app/admin/(protected)/fournisseurs/[id]/actions';
import { loadProductMonthStats, lastMonths } from '../lib/supplier-stats';
import { MAX_HIGHLIGHTED_PRODUCTS } from '../lib/supplier-highlight';
import { ADMIN_ACTION_LABELS } from '../lib/labels';

const DAY = 24 * 3600 * 1000;
const active = (overrides: Record<string, unknown> = {}) => ({ status: 'ACTIVE', periodEnd: new Date(Date.now() + 30 * DAY), plan: { includesHighlight: true }, ...overrides });
const published = { id: 'p1', pvModule: { catalogStatus: 'PUBLISHED' }, inverter: null };

beforeEach(() => {
  for (const group of Object.values(m.db)) for (const fn of Object.values(group)) (fn).mockReset();
  m.redirect.mockReset();
  m.logAdminAction.mockReset();
  m.db.supplierProduct.count.mockResolvedValue(0);
});

describe('setProductHighlightedAction', () => {
  it('highlights a published product when the pack includes it and the subscription is active', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue(published);
    m.db.subscription.findUnique.mockResolvedValue(active());

    expect(await setProductHighlightedAction('p1', true)).toBeUndefined();

    expect(m.db.supplierProduct.findFirst.mock.calls[0]![0].where).toEqual({ id: 'p1', supplierCompanyId: 'sup1' });
    expect(m.db.supplierProduct.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', supplierCompanyId: 'sup1' }, data: { highlighted: true } });
  });

  it('refuses when the pack does not include highlighting', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue(published);
    m.db.subscription.findUnique.mockResolvedValue(active({ plan: { includesHighlight: false } }));

    expect(await setProductHighlightedAction('p1', true)).toEqual({ error: expect.stringContaining('n’inclut pas la mise en avant') });
    expect(m.db.supplierProduct.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when there is no subscription', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue(published);
    m.db.subscription.findUnique.mockResolvedValue(null);

    expect(await setProductHighlightedAction('p1', true)).toEqual({ error: expect.stringContaining('n’inclut pas la mise en avant') });
  });

  it('refuses an expired or suspended subscription', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue(published);
    m.db.subscription.findUnique.mockResolvedValue(active({ periodEnd: new Date(Date.now() - DAY) }));
    expect(await setProductHighlightedAction('p1', true)).toEqual({ error: expect.stringContaining('Abonnement expiré') });

    m.db.subscription.findUnique.mockResolvedValue(active({ status: 'SUSPENDED' }));
    expect(await setProductHighlightedAction('p1', true)).toEqual({ error: expect.stringContaining('Abonnement expiré') });
    expect(m.db.supplierProduct.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a product still waiting for validation', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue({ id: 'p1', pvModule: { catalogStatus: 'DRAFT' }, inverter: null });
    m.db.subscription.findUnique.mockResolvedValue(active());

    expect(await setProductHighlightedAction('p1', true)).toEqual({ error: expect.stringContaining('en attente de validation') });
    expect(m.db.supplierProduct.updateMany).not.toHaveBeenCalled();
  });

  it('answers "introuvable" for a product the supplier does not carry', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue(null);

    expect(await setProductHighlightedAction('foreign', true)).toEqual({ error: expect.stringContaining('introuvable') });
    expect(m.db.supplierProduct.updateMany).not.toHaveBeenCalled();
  });

  it('stops at the cap', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue(published);
    m.db.subscription.findUnique.mockResolvedValue(active());
    m.db.supplierProduct.count.mockResolvedValue(MAX_HIGHLIGHTED_PRODUCTS);

    expect(await setProductHighlightedAction('p1', true)).toEqual({ error: expect.stringContaining(`${MAX_HIGHLIGHTED_PRODUCTS} produits au maximum`) });
    m.db.supplierProduct.count.mockResolvedValue(MAX_HIGHLIGHTED_PRODUCTS - 1);
    expect(await setProductHighlightedAction('p1', true)).toBeUndefined();
  });

  it('always lets a supplier switch highlighting off, even after its subscription expired', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue(published);
    m.db.subscription.findUnique.mockResolvedValue(null);

    expect(await setProductHighlightedAction('p1', false)).toBeUndefined();
    expect(m.db.supplierProduct.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', supplierCompanyId: 'sup1' }, data: { highlighted: false } });
  });
});

describe('loadProductMonthStats', () => {
  const month = new Date(Date.UTC(2026, 9, 1));

  it('aggregates counters, dossiers and kWc per product and reads nothing personal', async () => {
    m.db.supplierProduct.findMany.mockResolvedValue([
      { id: 'p1', kind: 'PV_MODULE', highlighted: true, pvModuleId: 'mod1', inverterId: null, pvModule: { brand: 'Jinko', model: 'T550' }, inverter: null },
      { id: 'p2', kind: 'INVERTER', highlighted: false, pvModuleId: null, inverterId: 'inv1', pvModule: null, inverter: { brand: 'Huawei', model: 'SUN2000' } },
    ]);
    m.db.supplierProductDailyStat.findMany.mockResolvedValue([
      { supplierProductId: 'p1', shownCount: 3, appliedCount: 1 },
      { supplierProductId: 'p1', shownCount: 2, appliedCount: 0 },
    ]);
    const config = { moduleId: 'mod1', module: { pmaxW: 550 }, inverters: [{ inverterId: 'inv1', mppts: [{ stringsInParallel: 2, modulesPerString: 10 }] }] };
    m.db.dossierJob.findMany.mockResolvedValue([
      { projectId: 'pr1', project: { arrayConfig: config } },
      { projectId: 'pr1', project: { arrayConfig: config } }, // second job of the same project
      { projectId: 'pr2', project: { arrayConfig: null } },
    ]);

    const stats = await loadProductMonthStats('sup1', month);

    expect(stats).toEqual([
      { id: 'p1', kind: 'PV_MODULE', label: 'Jinko T550', highlighted: true, shown: 5, applied: 1, dossiers: 1, kwc: 11 },
      { id: 'p2', kind: 'INVERTER', label: 'Huawei SUN2000', highlighted: false, shown: 0, applied: 0, dossiers: 1, kwc: 11 },
    ]);
    // Month window and failed jobs excluded; sponsored installers only.
    const jobQuery = m.db.dossierJob.findMany.mock.calls[0]![0];
    expect(jobQuery.where).toEqual({ startedAt: { gte: month, lt: new Date(Date.UTC(2026, 10, 1)) }, status: { not: 'FAILED' }, project: { company: { sponsorCompanyId: 'sup1' } } });
    // No client, CIN, address, STEG reference or installer is selected or returned.
    const queried = JSON.stringify([m.db.supplierProduct.findMany.mock.calls, m.db.supplierProductDailyStat.findMany.mock.calls, m.db.dossierJob.findMany.mock.calls]);
    expect(queried).not.toMatch(/client|bcinb|address|steg|inputSnapshot|"companyId"|"name"|"email"/i);
    expect(JSON.stringify(stats)).not.toMatch(/client|cin|address|steg/i);
  });

  it('returns nothing and queries nothing else when no product is carried', async () => {
    m.db.supplierProduct.findMany.mockResolvedValue([]);
    expect(await loadProductMonthStats('sup1', month)).toEqual([]);
    expect(m.db.dossierJob.findMany).not.toHaveBeenCalled();
  });

  it('offers the last 6 months, the current first', () => {
    const months = lastMonths(new Date(Date.UTC(2026, 1, 15)));
    expect(months.map((x) => x.key)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11', '2025-10', '2025-09']);
  });
});

describe('unhighlightProductAction (admin)', () => {
  it('switches a highlighted product of this supplier off and logs supplier.unhighlight', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue({ pvModule: { brand: 'Jinko', model: 'T550' }, inverter: null });

    await unhighlightProductAction('sup1', 'p1');

    expect(m.db.supplierProduct.findFirst.mock.calls[0]![0].where).toEqual({ id: 'p1', supplierCompanyId: 'sup1', highlighted: true });
    expect(m.db.supplierProduct.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { highlighted: false } });
    expect(m.logAdminAction).toHaveBeenCalledWith('admin1', 'supplier.unhighlight', 'sup1', { productId: 'p1', product: 'Jinko T550' });
    expect(m.redirect).toHaveBeenCalledWith('/admin/fournisseurs/sup1?ok=productUnhighlighted');
    expect(ADMIN_ACTION_LABELS['supplier.unhighlight']).toBeTruthy();
  });

  it('ignores a product that is not this supplier\'s or not highlighted, and logs nothing', async () => {
    m.db.supplierProduct.findFirst.mockResolvedValue(null);

    await unhighlightProductAction('sup1', 'foreign');

    expect(m.db.supplierProduct.update).not.toHaveBeenCalled();
    expect(m.logAdminAction).not.toHaveBeenCalled();
  });
});
