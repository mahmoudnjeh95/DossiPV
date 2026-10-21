import { describe, it, expect } from 'vitest';
import { parseRegistry, checkRegistryAgainstListings, type DatasheetFamily } from '../src/datasheet-registry';

const family: DatasheetFamily = { kind: 'PV_MODULE', brand: 'LONGi', url: 'https://example.com/lr5.pdf', models: ['LR5-72HTH-575M', 'LR5-72HTH-585M'] };

describe('datasheet registry', () => {
  it('accepts a well-formed registry', () => {
    expect(parseRegistry([family])).toEqual([family]);
  });

  it('rejects a non-https URL and an empty model list', () => {
    expect(() => parseRegistry([{ ...family, url: 'http://example.com/a.pdf' }])).toThrow();
    expect(() => parseRegistry([{ ...family, models: [] }])).toThrow();
  });

  it('reports models that are not on the official list, and models listed twice', () => {
    const problems = checkRegistryAgainstListings(
      [family, { ...family, url: 'https://example.com/other.pdf', models: ['LR5-72HTH-585M', 'NOT-LISTED'] }],
      new Set(['LR5-72HTH-575M', 'LR5-72HTH-585M']),
      new Set(),
    );
    expect(problems).toEqual([
      'LR5-72HTH-585M : présent dans plusieurs fiches.',
      'NOT-LISTED : absent de la liste officielle ANME.',
    ]);
  });
});
