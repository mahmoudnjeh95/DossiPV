import type { EquipmentKind } from '@dossipv/db';

export interface OwnEquipmentKind {
  kind: EquipmentKind;
  /** URL segment of /library/new/<slug> and /library/edit/<slug>/<id>. */
  slug: string;
  label: string;
}

/** The nine equipment types an installer can create for its own library, in library order. */
export const OWN_EQUIPMENT_KINDS: readonly OwnEquipmentKind[] = [
  { kind: 'PV_MODULE', slug: 'pv-modules', label: 'Module photovoltaïque' },
  { kind: 'INVERTER', slug: 'inverters', label: 'Onduleur' },
  { kind: 'SPD', slug: 'spds', label: 'Parafoudre' },
  { kind: 'DC_SWITCH', slug: 'dc-switches', label: 'Interrupteur-sectionneur DC' },
  { kind: 'DC_FUSE', slug: 'dc-fuses', label: 'Fusible DC' },
  { kind: 'AC_BREAKER', slug: 'ac-breakers', label: 'Disjoncteur AC' },
  { kind: 'AC_ISOLATOR', slug: 'ac-isolators', label: 'Interrupteur-sectionneur AC' },
  { kind: 'CABLE', slug: 'cables', label: 'Câble' },
  { kind: 'ACCESSORY', slug: 'accessories', label: 'Accessoire' },
];

export function ownEquipmentKindBySlug(slug: string): OwnEquipmentKind | null {
  return OWN_EQUIPMENT_KINDS.find((entry) => entry.slug === slug) ?? null;
}

export function ownEquipmentSlug(kind: EquipmentKind): string {
  return OWN_EQUIPMENT_KINDS.find((entry) => entry.kind === kind)?.slug ?? '';
}
