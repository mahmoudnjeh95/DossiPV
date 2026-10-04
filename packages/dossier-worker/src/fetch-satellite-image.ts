import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';

/**
 * Esri World Imagery satellite views for pages 37-38 — the same free, no-key tile source the live
 * map editor already uses.
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

function tileUrl(zoom: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
}

async function fetchTile(zoom: number, x: number, y: number): Promise<{ width: number; height: number; data: Uint8Array }> {
  const url = tileUrl(zoom, x, y);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Esri tile fetch failed with status ${response.status} for ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    return decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4 });
  } catch (error) {
    throw new Error(`Esri tile ${url} is not a decodable JPEG: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetches every tile overlapping `view` and stitches them into one JPEG of exactly
 * `view.widthPx` × `view.heightPx`, whose top-left pixel is world pixel (originX, originY).
 */
export async function fetchSatelliteImage(view: SatelliteView): Promise<Buffer> {
  const tilesPerAxis = 2 ** view.zoom;
  const firstX = Math.floor(view.originX / TILE_SIZE);
  const lastX = Math.floor((view.originX + view.widthPx - 1) / TILE_SIZE);
  const firstY = Math.max(0, Math.floor(view.originY / TILE_SIZE));
  const lastY = Math.min(tilesPerAxis - 1, Math.floor((view.originY + view.heightPx - 1) / TILE_SIZE));

  const jobs: Promise<{ tileX: number; tileY: number; tile: { width: number; height: number; data: Uint8Array } }>[] = [];
  for (let tileY = firstY; tileY <= lastY; tileY += 1) {
    for (let tileX = firstX; tileX <= lastX; tileX += 1) {
      const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis; // antimeridian wrap
      jobs.push(fetchTile(view.zoom, wrappedX, tileY).then((tile) => ({ tileX, tileY, tile })));
    }
  }
  const tiles = await Promise.all(jobs);

  const out = new Uint8Array(view.widthPx * view.heightPx * 4).fill(220); // light grey outside the world
  for (const { tileX, tileY, tile } of tiles) {
    const offsetX = tileX * TILE_SIZE - view.originX;
    const offsetY = tileY * TILE_SIZE - view.originY;
    const fromCol = Math.max(0, -offsetX);
    const toCol = Math.min(tile.width, view.widthPx - offsetX);
    if (toCol <= fromCol) continue;
    for (let row = 0; row < tile.height; row += 1) {
      const destRow = offsetY + row;
      if (destRow < 0 || destRow >= view.heightPx) continue;
      const src = tile.data.subarray((row * tile.width + fromCol) * 4, (row * tile.width + toCol) * 4);
      out.set(src, (destRow * view.widthPx + offsetX + fromCol) * 4);
    }
  }

  return Buffer.from(encodeJpeg({ data: out, width: view.widthPx, height: view.heightPx }, 85).data);
}
