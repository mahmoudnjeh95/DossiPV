import { describe, it, expect, vi, afterEach, type MockInstance } from 'vitest';
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';
import {
  fetchSatelliteImage,
  latLonToWorldPixel,
  projectToImage,
  planImplantationView,
  planSituationView,
  metersPerPixel,
  isInsideImage,
  TILE_SIZE,
  type SatelliteView,
} from '../src/fetch-satellite-image';

/** A solid-colour 256x256 JPEG whose colour encodes its tile x/y, so stitching can be checked. */
function colouredTile(tileX: number, tileY: number): Uint8Array {
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const r = (tileX % 4) * 60 + 20;
  const g = (tileY % 4) * 60 + 20;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  return new Uint8Array(encodeJpeg({ data, width: TILE_SIZE, height: TILE_SIZE }, 95).data);
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function mockEsriTiles(): MockInstance<typeof fetch> {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const match = /tile\/(\d+)\/(\d+)\/(\d+)$/.exec(requestUrl(url));
    const [, , y, x] = match!.map(Number);
    const bytes = colouredTile(x!, y!);
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) } as Response);
  });
}

describe('Web-Mercator projection', () => {
  it('matches the standard slippy-map tile maths (the tile containing a point at zoom 19)', () => {
    const p = latLonToWorldPixel({ lat: 36.8065, lon: 10.1815 }, 19);
    // Reference tile indices from the slippy-map formulas (the previous single-tile code's
    // lonToTileX/latToTileY): x = floor((lon+180)/360 * 2^z), y = floor((1 - ln(tan + sec)/pi)/2 * 2^z).
    expect(Math.floor(p.x / TILE_SIZE)).toBe(276971);
    expect(Math.floor(p.y / TILE_SIZE)).toBe(204421);
  });

  it('projects a point to its pixel position relative to the view origin', () => {
    const view: SatelliteView = { zoom: 19, originX: 1000, originY: 2000, widthPx: 512, heightPx: 512 };
    const world = latLonToWorldPixel({ lat: 36.8, lon: 10.2 }, 19);
    expect(projectToImage(view, { lat: 36.8, lon: 10.2 })).toEqual({ x: world.x - 1000, y: world.y - 2000 });
  });

  it('north is up and east is right: a point north-east of another has smaller y and larger x', () => {
    const view = planSituationView({ lat: 36.8, lon: 10.2 });
    const centre = projectToImage(view, { lat: 36.8, lon: 10.2 });
    const northEast = projectToImage(view, { lat: 36.801, lon: 10.201 });
    expect(northEast.x).toBeGreaterThan(centre.x);
    expect(northEast.y).toBeLessThan(centre.y);
  });

  it('gives a realistic ground resolution (~0.24 m/px at zoom 19 in Tunisia)', () => {
    const view = planImplantationView([{ lat: 36.8, lon: 10.2 }]);
    expect(metersPerPixel(view, 36.8)).toBeCloseTo(0.239, 2);
  });
});

describe('planImplantationView', () => {
  const site = { lat: 36.8, lon: 10.2 };
  const nearby = [
    { lat: 36.8001, lon: 10.2002 }, // technical room, ~20 m away
    { lat: 36.7999, lon: 10.1998 }, // meter
    { lat: 36.80015, lon: 10.1999 }, // earth pit
  ];

  it('covers the site and every placed point, with padding, at zoom 19 when they are close together', () => {
    const view = planImplantationView([site, ...nearby]);
    expect(view.zoom).toBe(19);
    expect(view.widthPx).toBe(view.heightPx);
    expect(view.widthPx).toBeGreaterThanOrEqual(512);
    expect(view.widthPx).toBeLessThanOrEqual(1024);
    for (const p of [site, ...nearby]) {
      const px = projectToImage(view, p);
      expect(px.x).toBeGreaterThanOrEqual(96 - 1);
      expect(px.y).toBeGreaterThanOrEqual(96 - 1);
      expect(px.x).toBeLessThanOrEqual(view.widthPx - 96 + 1);
      expect(px.y).toBeLessThanOrEqual(view.heightPx - 96 + 1);
    }
  });

  it('is centred on the bounding box of the points, not on a tile boundary chosen by floor()', () => {
    const view = planImplantationView([site]);
    const px = projectToImage(view, site);
    expect(px.x).toBeCloseTo(view.widthPx / 2, 0);
    expect(px.y).toBeCloseTo(view.heightPx / 2, 0);
  });

  it('drops to a lower zoom when the points are spread too far apart for zoom 19, still covering all of them', () => {
    const farMeter = { lat: 36.8025, lon: 10.2035 }; // ~400 m away
    const view = planImplantationView([site, farMeter]);
    expect(view.zoom).toBeLessThan(19);
    for (const p of [site, farMeter]) {
      expect(isInsideImage(view, projectToImage(view, p))).toBe(true);
    }
  });
});

describe('fetchSatelliteImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches exactly the Esri tiles overlapping the view and stitches them into one JPEG of the view size', async () => {
    const fetchSpy = mockEsriTiles();
    // A 300x200 window starting 100 px into tile (10, 20): spans tiles x 10-11, y 20-21.
    const view: SatelliteView = { zoom: 5, originX: 10 * TILE_SIZE + 100, originY: 20 * TILE_SIZE + 150, widthPx: 300, heightPx: 200 };

    const jpeg = await fetchSatelliteImage(view);

    const urls = fetchSpy.mock.calls.map((call) => requestUrl(call[0])).sort();
    expect(urls).toEqual(
      ['tile/5/20/10', 'tile/5/20/11', 'tile/5/21/10', 'tile/5/21/11']
        .map((suffix) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/${suffix}`)
        .sort(),
    );
    const decoded = decodeJpeg(jpeg, { useTArray: true, formatAsRGBA: true });
    expect(decoded.width).toBe(300);
    expect(decoded.height).toBe(200);

    const pixel = (x: number, y: number): [number, number] => [decoded.data[(y * 300 + x) * 4]!, decoded.data[(y * 300 + x) * 4 + 1]!];
    const near = (actual: [number, number], tileX: number, tileY: number): void => {
      expect(Math.abs(actual[0] - ((tileX % 4) * 60 + 20))).toBeLessThan(12);
      expect(Math.abs(actual[1] - ((tileY % 4) * 60 + 20))).toBeLessThan(12);
    };
    near(pixel(20, 20), 10, 20); // top-left area comes from tile (10, 20)
    near(pixel(250, 20), 11, 20); // x >= 156 is past tile 10's right edge
    near(pixel(20, 150), 10, 21); // y >= 106 is past tile 20's bottom edge
    near(pixel(250, 150), 11, 21);
  });

  it('throws a clear error when a tile fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(fetchSatelliteImage({ zoom: 19, originX: 0, originY: 0, widthPx: 256, heightPx: 256 })).rejects.toThrow(/503/);
  });

  it('throws when Esri returns something that is not a JPEG', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) } as Response);

    await expect(fetchSatelliteImage({ zoom: 19, originX: 0, originY: 0, widthPx: 256, heightPx: 256 })).rejects.toThrow(/not a decodable JPEG/);
  });
});
