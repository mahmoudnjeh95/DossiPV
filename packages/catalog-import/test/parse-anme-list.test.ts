import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { parseAnmeList } from '../src/parse-anme-list';

const fixture = readFileSync(new URL('./fixtures/anme-panneaux-2026-07-24.txt', import.meta.url), 'utf8');

describe('parseAnmeList', () => {
  const { listings, unparsedLines } = parseAnmeList(fixture);

  it('parses every row it can and reports the two garbled FuturaSun rows instead of guessing', () => {
    expect(unparsedLines).toHaveLength(2);
    expect(unparsedLines.every((line) => line.startsWith('FuturaSun srl'))).toBe(true);
  });

  it('anchors on the country so manufacturer names with double spaces stay whole', () => {
    const row = listings.find((l) => l.model === 'LR5-72HTH-585M');
    expect(row).toMatchObject({
      manufacturer: 'LONGi Green Energy Technology Co.,Ltd',
      brand: 'LONGi',
      country: 'Chine',
      certificationBody: 'TÜV SÜD',
      validUntil: '2028-04-10',
    });
    expect(row?.certificateReference).toContain('Z2 099333 0111');
  });

  it('strips the " - Chine" style suffix from model names', () => {
    expect(listings.some((l) => l.model === 'LR8-66HVD-650M')).toBe(true);
    expect(listings.some((l) => / - (Chine|Tunisie|Roumanie)$/i.test(l.model))).toBe(false);
  });

  it('keeps one entry per model, with the latest validity date', () => {
    const rows = listings.filter((l) => l.model === 'AE630CMER-132BDS');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.validUntil).toBe('2028-01-26');
  });
});
