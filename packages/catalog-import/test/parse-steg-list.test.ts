import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { parseStegList } from '../src/parse-steg-list';

const fixture = readFileSync(new URL('./fixtures/steg-onduleurs-v1.62.txt', import.meta.url), 'utf8');

describe('parseStegList', () => {
  const listings = parseStegList(fixture);

  it('reads every inverter row of the V1.62 list', () => {
    expect(listings).toHaveLength(598);
  });

  it('joins manufacturer names spread over several lines and keeps them for the whole group', () => {
    const counts: Record<string, number> = {};
    for (const l of listings) counts[l.manufacturer] = (counts[l.manufacturer] ?? 0) + 1;
    expect(counts).toEqual({
      AFORE: 23, AUSTA: 14, 'Canadian Solar': 14, 'COALA GREEN': 5, DEYE: 24, 'Crown Micro FZCO': 17,
      'Each Energy': 6, FOXESS: 54, GOODWE: 32, GROWATT: 16, 'Heinrich Kopp GmbH': 4, HUAWEI: 13,
      HOPEWIND: 22, HYPONTECH: 21, 'Ningbo Ginlong Technologies SOLIS': 32, RENAC: 27,
      'SHENZHEN KSTAR NEW ENERGY': 16, 'SHENZHEN SENERGY TECHNOLOGY': 27, SINENG: 21, 'SMA SOLAR': 4,
      'SOFAR SOLAR': 53, 'SOLAX POWER': 41, SOLPLANET: 32, SUNGROW: 34, SUNWAYS: 31, 'ZCS AZZURRO': 15,
    });
  });

  it('carries a brand across a page break and parses W, VA and thousands separators', () => {
    expect(listings.find((l) => l.model === 'AU8K3P')).toEqual({
      manufacturer: 'AUSTA', brand: 'AUSTA', model: 'AU8K3P', acPowerW: 8000, acceptedUntil: '2026-12-31',
    });
    expect(listings.find((l) => l.model === 'SG125CX-P2')?.acPowerW).toBe(125000);
    expect(listings.find((l) => l.model === 'HNS1000TL-1')?.acPowerW).toBe(1000);
  });

  it('maps long manufacturer names to the commercial brand', () => {
    expect(listings.find((l) => l.model === 'S5-GR3P8K')?.brand).toBe('SOLIS');
    expect(listings.find((l) => l.model === 'BluE-G 3000S-M1')?.brand).toBe('KSTAR');
    expect(listings.find((l) => l.model === 'SE 2KTL-S1/G3')?.brand).toBe('SENERGY');
  });
});
