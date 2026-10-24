import { db } from '@dossipv/db';
import type { EquipmentKind } from '@dossipv/db';
import { provenanceScope } from '../../../lib/project-access';
import { acBreakerRating } from '../../../lib/labels';
import { highlightedFirst, type HighlightedProducts } from '../../../lib/highlight';

export interface LibraryRow {
  itemId: string;
  label: string;
  figures: string;
  /** Present when the company already has the item in its library. */
  libraryItemId: string | null;
  priceTnd: number;
  /** The company's own item (not from the shared catalog): it may edit or delete it. */
  own: boolean;
  /** The suppliers highlighting this panel or inverter ("Sponsorisé" badge); absent when it is not highlighted. */
  sponsoredBy?: string[];
}

export interface LibrarySection {
  kind: EquipmentKind;
  title: string;
  bulk: boolean;
  rows: LibraryRow[];
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const n = (v: number): string => nf.format(v);
const join = (parts: (string | null)[]): string => parts.filter(Boolean).join(' · ');

const order = [{ brand: 'asc' as const }, { model: 'asc' as const }];

/** A number in the search box matches module Pmax / inverter Pac, in W (and in kW for inverters). */
function searchWhere(q: string, numeric: 'pmaxW' | 'pacW' | null): Record<string, unknown> {
  if (!q) {
    return {};
  }
  const or: Record<string, unknown>[] = [
    { brand: { contains: q, mode: 'insensitive' } },
    { model: { contains: q, mode: 'insensitive' } },
  ];
  const num = Number(q.replace(',', '.'));
  if (numeric && Number.isFinite(num) && num > 0) {
    or.push({ [numeric]: num });
    if (numeric === 'pacW') {
      or.push({ pacW: num * 1000 });
    }
  }
  return { OR: or };
}

interface Owned {
  id: string;
  brand: string;
  model: string;
  ownerCompanyId: string | null;
  libraryItems: { id: string; purchasePriceTnd: number }[];
}

function row(item: Owned, figures: string): LibraryRow {
  return {
    itemId: item.id,
    label: `${item.brand} ${item.model}`,
    figures,
    libraryItemId: item.libraryItems[0]?.id ?? null,
    priceTnd: item.libraryItems[0]?.purchasePriceTnd ?? 0,
    own: item.ownerCompanyId !== null,
  };
}

/**
 * Highlighted panels and inverters (spec §6.1) come first in their section and carry the suppliers
 * that highlight them; every other row keeps its order. Direct installers only: the caller passes
 * nothing for a sponsored installer.
 */
export function withHighlights(sections: LibrarySection[], highlighted: HighlightedProducts): LibrarySection[] {
  const idsByKind: Partial<Record<EquipmentKind, string[]>> = { PV_MODULE: highlighted.moduleIds, INVERTER: highlighted.inverterIds };
  return sections.map((section) => {
    const ids = idsByKind[section.kind];
    if (!ids || ids.length === 0) return section;
    const rows = highlightedFirst(section.rows.map((r) => ({ ...r, id: r.itemId })), ids).map(({ id, ...r }) =>
      ids.includes(id) ? { ...r, sponsoredBy: highlighted.suppliers[id] ?? [] } : r,
    );
    return { ...section, rows };
  });
}

/**
 * Loads every equipment section. Mode 'library' lists only what the company selected;
 * 'catalogue' lists everything it may choose (published shared items plus its private ones).
 */
export async function loadSections(companyId: string, mode: 'library' | 'catalogue', q: string): Promise<LibrarySection[]> {
  const base: Record<string, unknown> =
    mode === 'library'
      ? { libraryItems: { some: { companyId } } }
      : { AND: [{ OR: [{ ownerCompanyId: null, catalogStatus: 'PUBLISHED' }, { ownerCompanyId: companyId }] }, provenanceScope(companyId)] };
  const query = (numeric: 'pmaxW' | 'pacW' | null = null): { where: never; orderBy: typeof order } => {
    const search = searchWhere(q.trim(), numeric);
    return { where: (Object.keys(search).length > 0 ? { AND: [base, search] } : base) as never, orderBy: order };
  };
  const include = { libraryItems: { where: { companyId }, select: { id: true, purchasePriceTnd: true } } };

  const [modules, inverters, spds, dcSwitches, dcFuses, acBreakers, acIsolators, cables, accessories] = await Promise.all([
    db.pvModule.findMany({ ...query('pmaxW'), include }),
    db.inverter.findMany({ ...query('pacW'), include }),
    db.spd.findMany({ ...query(), include }),
    db.dcSwitch.findMany({ ...query(), include }),
    db.dcFuse.findMany({ ...query(), include }),
    db.acBreaker.findMany({ ...query(), include }),
    db.acIsolator.findMany({ ...query(), include }),
    db.cable.findMany({ ...query(), include: { ...include, sections: true } }),
    db.accessory.findMany({ ...query(), include }),
  ]);

  return [
    { kind: 'PV_MODULE', title: 'Modules photovoltaïques', bulk: false, rows: modules.map((x) => row(x, `${n(x.pmaxW)} W`)) },
    {
      kind: 'INVERTER',
      title: 'Onduleurs',
      bulk: false,
      rows: inverters.map((x) =>
        row(x, join([`${n(x.pacW / 1000)} kW`, x.phases === 1 ? 'mono' : 'tri', x.stegApproved ? 'STEG ✓' : null])),
      ),
    },
    {
      kind: 'SPD',
      title: 'Parafoudres',
      bulk: true,
      rows: spds.map((x) => row(x, join([String(x.side), `${n(x.ucV)} V`, `${n(x.upKV)} kV`]))),
    },
    {
      kind: 'DC_SWITCH',
      title: 'Interrupteurs-sectionneurs DC',
      bulk: true,
      rows: dcSwitches.map((x) => row(x, join([`${n(x.ratedCurrentA)} A`, `${n(x.ratedVoltageV)} V`]))),
    },
    {
      kind: 'DC_FUSE',
      title: 'Fusibles DC',
      bulk: true,
      rows: dcFuses.map((x) => row(x, join([`${n(x.ratedCurrentA)} A`, `${n(x.ratedVoltageV)} V`]))),
    },
    { kind: 'AC_BREAKER', title: 'Disjoncteurs AC', bulk: true, rows: acBreakers.map((x) => row(x, acBreakerRating(x))) },
    {
      kind: 'AC_ISOLATOR',
      title: 'Interrupteurs-sectionneurs AC',
      bulk: true,
      rows: acIsolators.map((x) => row(x, `${n(x.ratedCurrentA)} A`)),
    },
    {
      kind: 'CABLE',
      title: 'Câbles',
      bulk: true,
      rows: cables.map((x) =>
        row(x, join([String(x.usage), x.sections.map((s) => `${n(s.sectionMm2)} mm²`).join(', ') || null])),
      ),
    },
    {
      kind: 'ACCESSORY',
      title: 'Accessoires',
      bulk: false,
      rows: accessories.map((x) => row(x, join([String(x.kind), x.spec ?? null]))),
    },
  ];
}
