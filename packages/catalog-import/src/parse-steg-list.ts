import type { StegInverterListing } from './types';

// One table row: [manufacturer fragment]  model  power W|VA  dd/mm/yyyy
const ROW = /^(.*?)\s{2,}([\d ]+?)\s?(?:W|VA)\s{2,}(\d{2})\/(\d{2})\/(\d{4})\s*$/;

const BRAND_ALIASES: Record<string, string> = {
  'Ningbo Ginlong Technologies SOLIS': 'SOLIS',
  'SHENZHEN KSTAR NEW ENERGY': 'KSTAR',
  'SHENZHEN SENERGY TECHNOLOGY': 'SENERGY',
  'Crown Micro FZCO': 'Crown Micro',
  'Heinrich Kopp GmbH': 'KOPP',
  'SMA SOLAR': 'SMA',
  'SOFAR SOLAR': 'SOFAR',
  'SOLAX POWER': 'SOLAX',
  'ZCS AZZURRO': 'ZCS Azzurro',
};

/**
 * Parses `pdftotext -table -enc UTF-8` output of the STEG accepted-inverter list. The manufacturer
 * cell is merged across its rows: its text appears on the group's first row(s) only, possibly
 * split over consecutive rows ("Ningbo Ginlong" / "Technologies" / "SOLIS"), and the group may
 * continue on the next page with no manufacturer text. A fragment on a row that follows a row
 * without one starts a new group; consecutive fragments extend the current group's name.
 */
export function parseStegList(text: string): StegInverterListing[] {
  const rows: { group: { parts: string[] }; model: string; acPowerW: number; acceptedUntil: string }[] = [];
  let group: { parts: string[] } | null = null;
  let previousRowHadFragment = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const match = ROW.exec(rawLine.trim());
    if (!match) continue;
    const [, cells, power, day, month, year] = match;
    const tokens = cells!.split(/\s{2,}/);
    const model = tokens.pop()!.trim();
    const fragment = tokens.join(' ').trim();
    if (fragment) {
      if (previousRowHadFragment && group) group.parts.push(fragment);
      else group = { parts: [fragment] };
    }
    previousRowHadFragment = fragment !== '';
    if (!group) continue; // rows before any manufacturer cannot be attributed
    rows.push({ group, model, acPowerW: Number(power!.replace(/ /g, '')), acceptedUntil: `${year}-${month}-${day}` });
  }

  return rows.map(({ group: g, model, acPowerW, acceptedUntil }) => {
    const manufacturer = g.parts.join(' ');
    return { manufacturer, brand: BRAND_ALIASES[manufacturer] ?? manufacturer, model, acPowerW, acceptedUntil };
  });
}
