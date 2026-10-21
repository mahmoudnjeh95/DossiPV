import type { AnmePanelListing } from './types';

const ROW = /^(.*\S)\s{2,}(\d{2})\/(\d{2})\/(\d{4})\s*$/;
const COUNTRIES = new Set([
  'chine', 'tunisie', 'roumanie', 'croatie', 'allemagne', 'italie', 'jordanie', 'turquie', 'inde',
  'vietnam', 'malaisie', 'thaïlande', 'corée', 'japon', 'espagne', 'france', 'singapour', 'indonésie',
  'laos', 'cambodge', 'égypte', 'maroc', 'états-unis', 'pays-bas',
]);
const BRAND_PREFIXES: [RegExp, string][] = [
  [/^LONGi/i, 'LONGi'], [/^JinKo/i, 'Jinko'], [/^Shanghai JA Solar|^JA Solar/i, 'JA Solar'],
  [/^Trina/i, 'Trina'], [/^Canadian Solar/i, 'Canadian Solar'], [/^ALTERNATIVE ENERGY \(AE\)/i, 'AE Solar'],
  [/^ALPHANIS/i, 'Alphanis'], [/^Chint/i, 'Astronergy'], [/^Anhui Huasun/i, 'Huasun'],
  [/^Tongwei/i, 'Tongwei'], [/^Risen/i, 'Risen'], [/^Zhejiang aiko/i, 'Aiko'], [/^ZNShine/i, 'ZNShine'],
  [/^Wuxi Suntech/i, 'Suntech'], [/^DAH Solar/i, 'DAH Solar'],
];

function brandOf(manufacturer: string): string {
  return BRAND_PREFIXES.find(([pattern]) => pattern.test(manufacturer))?.[1] ?? manufacturer;
}

function capitalize(country: string): string {
  return country.charAt(0).toUpperCase() + country.slice(1).toLowerCase();
}

/**
 * Parses `pdftotext -table -enc UTF-8` output of the ANME accepted-panel list. Columns are
 * separated by 2+ spaces, but manufacturer names and certificate references can contain double
 * spaces too, so the row is anchored on the country column. Rows the layout garbled (model and
 * certification body run together) are returned in `unparsedLines` for manual entry.
 */
export function parseAnmeList(text: string): { listings: AnmePanelListing[]; unparsedLines: string[] } {
  const byModel = new Map<string, AnmePanelListing>();
  const unparsedLines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = ROW.exec(line);
    if (!match) continue;
    const [, cells, day, month, year] = match;
    const tokens = cells!.split(/\s{2,}/);
    const countryIndex = tokens.findIndex((token) => COUNTRIES.has(token.toLowerCase()));
    if (countryIndex < 1 || tokens.length < countryIndex + 4) {
      if (!/en date du/i.test(line)) unparsedLines.push(line);
      continue;
    }
    const manufacturer = tokens.slice(0, countryIndex).join(' ');
    const listing: AnmePanelListing = {
      manufacturer,
      brand: brandOf(manufacturer),
      country: capitalize(tokens[countryIndex]!),
      model: tokens[countryIndex + 1]!.replace(/\s+-\s+[A-Za-zÀ-ÿ]+$/, '').trim(),
      certificationBody: tokens[countryIndex + 2]!,
      certificateReference: tokens.slice(countryIndex + 3).join(' '),
      validUntil: `${year}-${month}-${day}`,
    };
    const existing = byModel.get(listing.model);
    if (!existing || existing.validUntil < listing.validUntil) byModel.set(listing.model, listing);
  }

  return { listings: [...byModel.values()], unparsedLines };
}
