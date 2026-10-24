import type { EquipmentKind } from '@dossipv/db';

/** What the catalogue search box understood: free text, equipment types named by a synonym, a power in W. */
export interface LibraryQuery {
  /** Free text left once synonyms and powers are removed (accents and case folded). */
  text: string;
  /** Equipment types named in the query ("onduleur" is INVERTER); empty means every type. */
  kinds: EquipmentKind[];
  /** A power typed with a unit ("5 kW", "550 W"), in watts. */
  watts: number | null;
}

/** Lower case, no accents: « Parafoudre », « parafoudré » and « PARAFOUDRE » are the same word. */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Words an installer types for each equipment type (folded, singular or plural). */
const SYNONYMS: ReadonlyArray<readonly [EquipmentKind, readonly string[]]> = [
  ['INVERTER', ['onduleur', 'onduleurs', 'inverter', 'inverters']],
  ['PV_MODULE', ['panneau', 'panneaux', 'module', 'modules']],
  ['SPD', ['parafoudre', 'parafoudres', 'spd', 'surge', 'arrester', 'arresters']],
  ['DC_SWITCH', ['sectionneur', 'sectionneurs']],
  ['DC_FUSE', ['fusible', 'fusibles']],
  ['AC_BREAKER', ['disjoncteur', 'disjoncteurs']],
  ['CABLE', ['cable', 'cables']],
];

const POWER = /(\d+(?:[.,]\d+)?)\s*(kw|w|wc|kwc)\b/;

/** Reads the catalogue search box: « onduleur 5 kW » is the inverter type with a 5000 W power. */
export function parseLibraryQuery(raw: string): LibraryQuery {
  let rest = foldText(raw).trim();
  let watts: number | null = null;
  const power = POWER.exec(rest);
  if (power) {
    const value = Number((power[1] ?? '').replace(',', '.'));
    if (Number.isFinite(value) && value > 0) {
      watts = power[2]?.startsWith('k') ? value * 1000 : value;
      rest = rest.replace(power[0], ' ');
    }
  }
  const kinds: EquipmentKind[] = [];
  const words: string[] = [];
  for (const word of rest.split(/\s+/).filter(Boolean)) {
    const match = SYNONYMS.find(([, names]) => names.includes(word));
    if (match) {
      if (!kinds.includes(match[0])) kinds.push(match[0]);
    } else {
      words.push(word);
    }
  }
  return { text: words.join(' '), kinds, watts };
}
