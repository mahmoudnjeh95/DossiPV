import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSatelliteImage } from '../src/fetch-satellite-image';

describe('fetchSatelliteImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the Esri World Imagery tile for the given lat/lon and returns a Buffer', async () => {
    const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeBytes.buffer,
    } as Response);

    const result = await fetchSatelliteImage({ lat: 36.8, lon: 10.2 });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('arcgisonline.com'));
  });

  it('throws a clear error when the tile fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(fetchSatelliteImage({ lat: 36.8, lon: 10.2 })).rejects.toThrow(/503/);
  });
});
