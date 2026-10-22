import { describe, expect, it } from 'vitest';
import { guessBuildingType } from '../lib/building-type';

describe('guessBuildingType', () => {
  it('detects an apartment building from abbreviations', () => {
    expect(guessBuildingType('Imm. Les Jasmins App. 12')).toBe('APARTMENT_BUILDING');
  });
  it('detects accented words case-insensitively', () => {
    expect(guessBuildingType('Résidence El Amen')).toBe('APARTMENT_BUILDING');
    expect(guessBuildingType('RESIDENCE el amen')).toBe('APARTMENT_BUILDING');
    expect(guessBuildingType('2e ÉTAGE')).toBe('APARTMENT_BUILDING');
  });
  it('returns null when nothing matches', () => {
    expect(guessBuildingType('Route de Gabès km 4')).toBeNull();
  });
  it('matches whole words only', () => {
    expect(guessBuildingType('Rue des Réserves')).toBeNull();
    expect(guessBuildingType('Immobilier Nord')).toBeNull();
  });
  it('handles Rés. and keeps bloc to the whole word', () => {
    expect(guessBuildingType('Rés. Les Palmiers')).toBe('APARTMENT_BUILDING');
    expect(guessBuildingType('Bloc B, rue 5')).toBe('APARTMENT_BUILDING');
    expect(guessBuildingType('Zone de blocage')).toBeNull();
  });

  it('returns null without an address', () => {
    expect(guessBuildingType(null)).toBeNull();
  });
});
