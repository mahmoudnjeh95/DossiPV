import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUnique, create, fetchPvgisSpecificYield } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  fetchPvgisSpecificYield: vi.fn(),
}));

vi.mock('@dossipv/db', () => ({ db: { pvgisYieldCache: { findUnique, create } } }));
vi.mock('@dossipv/pvgis-client', () => ({ fetchPvgisSpecificYield }));

import { getSpecificYield } from '../lib/specific-yield';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSpecificYield', () => {
  it('uses the cache on a hit', async () => {
    findUnique.mockResolvedValue({ specificYieldKWhPerKWp: 1720 });

    const result = await getSpecificYield(34.4213, 8.7811, 30, 0);

    expect(result).toEqual({ value: 1720, warning: null });
    expect(fetchPvgisSpecificYield).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('fetches and stores on a miss', async () => {
    findUnique.mockResolvedValue(null);
    fetchPvgisSpecificYield.mockResolvedValue(1750.3);

    const result = await getSpecificYield(34.4213, 8.7811, 30, 0);

    expect(result).toEqual({ value: 1750.3, warning: null });
    expect(fetchPvgisSpecificYield).toHaveBeenCalledWith(34.42, 8.78, 30, 0);
    expect(create).toHaveBeenCalledWith({
      data: { latRounded: 34.42, lonRounded: 8.78, tiltDeg: 30, azimuthDeg: 0, specificYieldKWhPerKWp: 1750.3 },
    });
  });

  it('falls back to 1600 with a warning when PVGIS fails', async () => {
    findUnique.mockResolvedValue(null);
    fetchPvgisSpecificYield.mockRejectedValue(new Error('down'));

    const result = await getSpecificYield(34.42, 8.78, 30, 0);

    expect(result).toEqual({
      value: 1600,
      warning: 'PVGIS indisponible : rendement par défaut de 1 600 kWh/kWc utilisé.',
    });
    expect(create).not.toHaveBeenCalled();
  });
});
