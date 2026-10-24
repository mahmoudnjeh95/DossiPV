import { db } from '@dossipv/db';

/**
 * Mise en avant (spec 2026-10-23 §6): a supplier whose pack includes highlighting marks some of
 * the products it carries as highlighted. They are shown first, with a "Sponsorisé" badge, and
 * proposed first, to DIRECT installers only (a sponsored installer only sees its own supplier's
 * products). Highlighting changes the order and never the technical validity of a proposal.
 */

export interface HighlightedProducts {
  /** Highlighted panels and inverters (catalog ids), usable now. */
  moduleIds: string[];
  inverterIds: string[];
  /** catalog id → the supplier names highlighting it (a product can be carried by several suppliers). */
  suppliers: Record<string, string[]>;
  /** catalog id → SupplierProduct ids, to count statistics. */
  productIds: Record<string, string[]>;
}

const EMPTY: HighlightedProducts = { moduleIds: [], inverterIds: [], suppliers: {}, productIds: {} };

/**
 * The products highlighted right now: flagged by the supplier, the supplier's subscription active
 * and not past its end, its pack including highlighting, and the product a published, sourced,
 * shared catalog item (a draft or a company's private item is never promoted).
 */
export async function loadHighlightedProducts(now = new Date()): Promise<HighlightedProducts> {
  const published = { ownerCompanyId: null, catalogStatus: 'PUBLISHED' as const, datasheetSourceUrl: { not: null } };
  const rows = await db.supplierProduct.findMany({
    where: {
      highlighted: true,
      supplierCompany: { kind: 'SUPPLIER', subscription: { is: { status: 'ACTIVE', periodEnd: { gt: now }, plan: { is: { includesHighlight: true } } } } },
      OR: [{ pvModule: published }, { inverter: published }],
    },
    select: { id: true, pvModuleId: true, inverterId: true, supplierCompany: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (rows.length === 0) return EMPTY;
  const result: HighlightedProducts = { moduleIds: [], inverterIds: [], suppliers: {}, productIds: {} };
  for (const row of rows) {
    const catalogId = row.pvModuleId ?? row.inverterId;
    if (!catalogId) continue;
    const list = row.pvModuleId ? result.moduleIds : result.inverterIds;
    if (!list.includes(catalogId)) list.push(catalogId);
    (result.suppliers[catalogId] ??= []).push(row.supplierCompany.name);
    (result.productIds[catalogId] ??= []).push(row.id);
  }
  return result;
}

/** Highlighted items first (in their listed order), the others after, each group in its original order. */
export function highlightedFirst<T extends { id: string }>(items: T[], highlightedIds: string[]): T[] {
  const rank = new Map(highlightedIds.map((id, index) => [id, index]));
  const first = items.filter((item) => rank.has(item.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...first, ...items.filter((item) => !rank.has(item.id))];
}

export type ProductStat = 'shown' | 'applied';

/** Counts one display or one application of highlighted products today (aggregates only, no installer recorded). */
export async function recordProductStat(supplierProductIds: string[], stat: ProductStat, now = new Date()): Promise<void> {
  if (supplierProductIds.length === 0) return;
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const field = stat === 'shown' ? 'shownCount' : 'appliedCount';
  await Promise.all(
    [...new Set(supplierProductIds)].map((supplierProductId) =>
      db.supplierProductDailyStat.upsert({
        where: { supplierProductId_date: { supplierProductId, date } },
        create: { supplierProductId, date, [field]: 1 },
        update: { [field]: { increment: 1 } },
      }),
    ),
  );
}
