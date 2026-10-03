import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCacheFindUnique, mockCacheUpsert, mockFetchPvgisHourlyData } = vi.hoisted(() => ({
  mockCacheFindUnique: vi.fn(),
  mockCacheUpsert: vi.fn(),
  mockFetchPvgisHourlyData: vi.fn(),
}));

vi.mock('@dossipv/pvgis-client', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/pvgis-client')>('@dossipv/pvgis-client');
  return { ...actual, fetchPvgisHourlyData: mockFetchPvgisHourlyData };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, pvgisWeatherCache: { findUnique: mockCacheFindUnique, upsert: mockCacheUpsert } } };
});

import { roundForCacheKey } from '../src/run-simulation';

beforeEach(() => {
  mockCacheFindUnique.mockClear();
  mockCacheUpsert.mockClear();
  mockFetchPvgisHourlyData.mockClear();
});

describe('roundForCacheKey', () => {
  it('rounds to 4 decimal places so floating-point noise collapses to the same key', () => {
    expect(roundForCacheKey(36.80000000001)).toBe(roundForCacheKey(36.8));
    expect(roundForCacheKey(36.8001)).not.toBe(roundForCacheKey(36.8002));
  });
});
