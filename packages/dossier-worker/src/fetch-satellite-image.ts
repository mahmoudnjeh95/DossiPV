import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import { isRetryableError } from './retry';

/**
 * Satellite views for pages 37-38 — Mapbox satellite-v9 when MAPBOX_ACCESS_TOKEN (or
 * NEXT_PUBLIC_MAPBOX_TOKEN) is set, like the live map editor; Esri World Imagery otherwise.
 *
 * A view is an exact window onto the Web-Mercator world-pixel grid at one zoom level, so the
 * image's geographic bounds are known to the pixel. Tiles covering the window are fetched and
 * stitched into one JPEG (Esri's dynamic `export` endpoint is not enabled on the public
 * World_Imagery service, so stitching is the only way to get one image with known bounds).
 * `projectToImage()` maps any lat/lon to that image's pixel coordinates, so page 37 never has to
 * guess where a GPS point lands on the photo.
 */

export const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878; // Web-Mercator limit
const EARTH_CIRCUMFERENCE_M_PER_PX_Z0 = 156543.03392; // ground metres per pixel at zoom 0, equator

export interface LatLon {
  lat: number;
  lon: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

/** A rectangular window onto the Web-Mercator world-pixel grid at one zoom level. */
export interface SatelliteView {
  zoom: number;
  /** World-pixel coordinates (at `zoom`) of the image's top-left corner. */
  originX: number;
  originY: number;
  widthPx: number;
  heightPx: number;
}

export function latLonToWorldPixel(point: LatLon, zoom: number): PixelPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, point.lat));
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((point.lon + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  };
}

/** Pixel position of a lat/lon inside the view's image (origin top-left, y down). */
export function projectToImage(view: SatelliteView, point: LatLon): PixelPoint {
  const world = latLonToWorldPixel(point, view.zoom);
  return { x: world.x - view.originX, y: world.y - view.originY };
}

export function isInsideImage(view: { widthPx: number; heightPx: number }, point: PixelPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= view.widthPx && point.y <= view.heightPx;
}

/** Ground metres per image pixel at the given latitude. */
export function metersPerPixel(view: SatelliteView, lat: number): number {
  return (EARTH_CIRCUMFERENCE_M_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / 2 ** view.zoom;
}

export interface ImplantationViewOptions {
  maxZoom?: number;
  minZoom?: number;
  minSizePx?: number;
  maxSizePx?: number;
  /** Free space kept around the outermost point, so markers and labels aren't on the edge. */
  paddingPx?: number;
}

function squareViewAround(zoom: number, centre: PixelPoint, sizePx: number): SatelliteView {
  const size = Math.round(sizePx);
  return { zoom, originX: Math.round(centre.x - size / 2), originY: Math.round(centre.y - size / 2), widthPx: size, heightPx: size };
}

/**
 * Page 37's view: the most detailed zoom (≤ maxZoom) at which the site point and every placed
 * point, plus padding, fit in a square of at most `maxSizePx`, centred on their bounding box.
 * Spec §3.4 step 1: "the site's GPS bounding box".
 */
export function planImplantationView(points: LatLon[], options: ImplantationViewOptions = {}): SatelliteView {
  const maxZoom = options.maxZoom ?? 19;
  const minZoom = options.minZoom ?? 12;
  const minSizePx = options.minSizePx ?? 512;
  const maxSizePx = options.maxSizePx ?? 1024;
  const paddingPx = options.paddingPx ?? 96;
  if (points.length === 0) {
    throw new Error('planImplantationView needs at least one point');
  }
  for (let zoom = maxZoom; zoom >= minZoom; zoom -= 1) {
    const world = points.map((p) => latLonToWorldPixel(p, zoom));
    const xs = world.map((p) => p.x);
    const ys = world.map((p) => p.y);
    const needed = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 2 * paddingPx;
    if (needed <= maxSizePx || zoom === minZoom) {
      const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      return squareViewAround(zoom, centre, Math.min(maxSizePx, Math.max(minSizePx, needed)));
    }
  }
  /* c8 ignore next */
  throw new Error('unreachable');
}

/** Page 38's view: a neighbourhood-scale square (≈ 700 m across at zoom 17) centred on the site. */
export function planSituationView(site: LatLon, zoom = 17, sizePx = 768): SatelliteView {
  return squareViewAround(zoom, latLonToWorldPixel(site, zoom), sizePx);
}

export type ImageryProvider = 'mapbox' | 'esri';

/** Highest zoom at which each provider has real imagery (Esri has none at 19+ outside big cities). */
export const MAX_NATIVE_ZOOM: Record<ImageryProvider, number> = { esri: 18, mapbox: 20 };

/** Credit printed under the imagery on plan pages; Mapbox's terms require it. */
export const IMAGERY_ATTRIBUTION: Record<ImageryProvider, string> = {
  esri: 'Imagerie : Esri, Maxar, Earthstar Geographics et la communauté des utilisateurs SIG',
  mapbox: 'Imagerie : © Mapbox © Maxar © OpenStreetMap',
};

/** Warning recorded on the job when Mapbox rejects the token (it never contains the token). */
export const MAPBOX_REFUSED_WARNING = 'Imagerie Mapbox refusée : vérifiez MAPBOX_ACCESS_TOKEN.';

/** The server-side Mapbox token; NEXT_PUBLIC_MAPBOX_TOKEN is the fallback so one value serves web and worker. */
function mapboxToken(): string | null {
  const token = (process.env.MAPBOX_ACCESS_TOKEN ?? '').trim() || (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim();
  return token || null;
}

/** Mapbox when a token is configured, else Esri. Read at call time so the env can change between jobs. */
export function activeImageryProvider(): ImageryProvider {
  return mapboxToken() ? 'mapbox' : 'esri';
}

/** Mapbox refused the token (HTTP 401/403): the caller may fall back to Esri. */
export class MapboxAuthError extends Error {
  constructor(public readonly status: number) {
    super(`Mapbox tile fetch refused with status ${status}`);
    this.name = 'MapboxAuthError';
  }
}

/** A tile request answered with a non-2xx status; only 429 and 5xx are worth retrying. */
export class TileHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TileHttpError';
  }
}

/** The tile request never got an answer (network error or timeout): transient. */
export class TileNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TileNetworkError';
  }
}

/** The tile came back in a format we cannot decode: retrying would give the same bytes. */
export class TileFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TileFormatError';
  }
}

/** Retry policy for tile fetches, by error type/HTTP status (never by scanning message text, which holds tile coordinates). */
export function isRetryableTileError(error: unknown): boolean {
  if (error instanceof TileHttpError) return error.status === 429 || error.status >= 500;
  if (error instanceof TileNetworkError) return true;
  if (error instanceof TileFormatError) return false;
  return isRetryableError(error); // anything untyped (e.g. a bare `fetch failed`) keeps the shared policy
}

/** Per-tile network timeout. */
export const TILE_FETCH_TIMEOUT_MS = 15_000;

/** Removes the access token from any text that may be logged or thrown. */
export function redactSecrets(text: string): string {
  let out = text.replace(/access_token=[^&\s"'<>]*/gi, 'access_token=REDACTED');
  const token = mapboxToken();
  if (token) out = out.split(token).join('REDACTED');
  return out;
}

function tileUrl(provider: ImageryProvider, zoom: number, x: number, y: number): string {
  if (provider === 'mapbox') {
    // 256 "@2x": a 512 px bitmap covering the same ground as a 256 px tile at this zoom; the format is left to Mapbox and sniffed on decode.
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/${zoom}/${x}/${y}@2x?access_token=${encodeURIComponent(mapboxToken() ?? '')}`;
  }
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
}

type Bitmap = { width: number; height: number; data: Uint8Array };

/** Box-filters an RGBA bitmap down by an integer factor (512 px @2x tiles -> the 256 px grid). */
function downscale(tile: Bitmap, factor: number): Bitmap {
  const width = Math.floor(tile.width / factor);
  const height = Math.floor(tile.height / factor);
  const data = new Uint8Array(width * height * 4);
  const samples = factor * factor;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy += 1) {
          for (let dx = 0; dx < factor; dx += 1) sum += tile.data[((y * factor + dy) * tile.width + x * factor + dx) * 4 + c]!;
        }
        data[(y * width + x) * 4 + c] = Math.round(sum / samples);
      }
    }
  }
  return { width, height, data };
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean => signature.every((byte, i) => bytes[offset + i] === byte);

/** Decodes a tile by its magic bytes: JPEG and PNG are supported; anything else fails with a clear, token-free message. */
function decodeTile(bytes: Uint8Array, label: string, url: string): Bitmap {
  try {
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4 });
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      const png = PNG.sync.read(Buffer.from(bytes));
      return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) };
    }
  } catch (error) {
    throw new TileFormatError(redactSecrets(`${label} tile ${url} could not be decoded: ${error instanceof Error ? error.message : String(error)}`));
  }
  const isWebp = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  throw new TileFormatError(redactSecrets(`${label} tile ${url} is not a decodable JPEG or PNG (${isWebp ? 'WebP is not supported' : 'unknown image format'}).`));
}

/** A decoded tile at its native resolution, and how many times denser than the 256 px grid it is (1 or 2). */
interface NativeTile {
  bitmap: Bitmap;
  factor: number;
}

async function fetchTile(provider: ImageryProvider, zoom: number, x: number, y: number): Promise<NativeTile> {
  const url = tileUrl(provider, zoom, x, y);
  const label = provider === 'mapbox' ? 'Mapbox' : 'Esri';
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TILE_FETCH_TIMEOUT_MS) });
  } catch (error) {
    // The token may sit in the URL or the message: rethrow a redacted error without the cause.
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    const reason = timedOut ? `timeout after ${TILE_FETCH_TIMEOUT_MS / 1000} s` : error instanceof Error ? error.message : String(error);
    throw new TileNetworkError(redactSecrets(`${label} tile fetch failed for ${url}: ${reason}`));
  }
  if (!response.ok) {
    if (provider === 'mapbox' && (response.status === 401 || response.status === 403)) throw new MapboxAuthError(response.status);
    throw new TileHttpError(response.status, redactSecrets(`${label} tile fetch failed with status ${response.status} for ${url}`));
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const tile = decodeTile(bytes, label, url);
  const factor = tile.width >= 2 * TILE_SIZE && tile.width % TILE_SIZE === 0 ? tile.width / TILE_SIZE : 1;
  return { bitmap: tile, factor };
}

/** The satellite photo of a view at the 256 px grid (the one overlays are projected on), and a denser copy when the provider serves retina tiles. */
export interface SatelliteImages {
  /** `view.widthPx` × `view.heightPx`: the pixel space every overlay and the AI layout use. */
  standard: Buffer;
  /** Same ground, 2× the pixels (the retina tiles' real detail); null when the tiles had none. */
  detailed: Buffer | null;
}

/** Stitches the tiles into one JPEG; `density` 1 box-filters retina tiles down, 2 keeps their detail. */
function stitch(view: SatelliteView, tiles: { tileX: number; tileY: number; tile: NativeTile }[], density: 1 | 2): Buffer {
  const tileSide = TILE_SIZE * density;
  const width = view.widthPx * density;
  const height = view.heightPx * density;
  const out = new Uint8Array(width * height * 4).fill(220); // light grey outside the world
  for (const { tileX, tileY, tile: native } of tiles) {
    const tile = density === 1 && native.factor > 1 ? downscale(native.bitmap, native.factor) : native.bitmap;
    if (density === 2 && tile.width !== tileSide) continue;
    const offsetX = tileX * tileSide - view.originX * density;
    const offsetY = tileY * tileSide - view.originY * density;
    const fromCol = Math.max(0, -offsetX);
    const toCol = Math.min(tile.width, width - offsetX);
    if (toCol <= fromCol) continue;
    for (let row = 0; row < tile.height; row += 1) {
      const destRow = offsetY + row;
      if (destRow < 0 || destRow >= height) continue;
      const src = tile.data.subarray((row * tile.width + fromCol) * 4, (row * tile.width + toCol) * 4);
      out.set(src, (destRow * width + offsetX + fromCol) * 4);
    }
  }
  return Buffer.from(encodeJpeg({ data: out, width, height }, density === 2 ? 90 : 85).data);
}

/**
 * Fetches every tile overlapping `view` once and stitches them into the standard JPEG of exactly
 * `view.widthPx` × `view.heightPx` (top-left pixel = world pixel originX, originY) and, when the
 * provider serves retina tiles, a 2× copy that keeps their detail.
 */
export async function fetchSatelliteImages(view: SatelliteView, provider: ImageryProvider = activeImageryProvider()): Promise<SatelliteImages> {
  const tilesPerAxis = 2 ** view.zoom;
  const firstX = Math.floor(view.originX / TILE_SIZE);
  const lastX = Math.floor((view.originX + view.widthPx - 1) / TILE_SIZE);
  const firstY = Math.max(0, Math.floor(view.originY / TILE_SIZE));
  const lastY = Math.min(tilesPerAxis - 1, Math.floor((view.originY + view.heightPx - 1) / TILE_SIZE));

  const jobs: Promise<{ tileX: number; tileY: number; tile: NativeTile }>[] = [];
  for (let tileY = firstY; tileY <= lastY; tileY += 1) {
    for (let tileX = firstX; tileX <= lastX; tileX += 1) {
      const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis; // antimeridian wrap
      jobs.push(fetchTile(provider, view.zoom, wrappedX, tileY).then((tile) => ({ tileX, tileY, tile })));
    }
  }
  const tiles = await Promise.all(jobs);
  const retina = tiles.length > 0 && tiles.every(({ tile }) => tile.factor === 2);
  return { standard: stitch(view, tiles, 1), detailed: retina ? stitch(view, tiles, 2) : null };
}

/** Just the standard image (see `fetchSatelliteImages`). */
export async function fetchSatelliteImage(view: SatelliteView, provider: ImageryProvider = activeImageryProvider()): Promise<Buffer> {
  return (await fetchSatelliteImages(view, provider)).standard;
}
