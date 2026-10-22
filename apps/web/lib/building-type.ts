export type BuildingTypeValue = 'HOUSE' | 'APARTMENT_BUILDING';

const APARTMENT_WORDS = new Set(['app', 'appt', 'appartement', 'imm', 'immeuble', 'residence', 'res', 'etage', 'bloc']);

/**
 * Guesses an apartment building from the bill's address (whole words, case- and accent-insensitive).
 * Returns null when nothing in the address says so: the installer then picks, nothing is assumed.
 */
export function guessBuildingType(address: string | null): 'APARTMENT_BUILDING' | null {
  if (!address) return null;
  const words = address
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return words.some((word) => APARTMENT_WORDS.has(word)) ? 'APARTMENT_BUILDING' : null;
}
