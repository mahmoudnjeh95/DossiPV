/**
 * Fetches a single Esri World Imagery tile covering the given GPS point. Same free, no-key
 * tile source the live map editor already uses (confirmed project-wide: no billing/API key
 * exists or is needed for this source).
 */
const ZOOM_LEVEL = 19; // close enough to show a single residential roof clearly

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom,
  );
}

export interface FetchSatelliteImageInput {
  lat: number;
  lon: number;
}

export async function fetchSatelliteImage(input: FetchSatelliteImageInput): Promise<Buffer> {
  const x = lonToTileX(input.lon, ZOOM_LEVEL);
  const y = latToTileY(input.lat, ZOOM_LEVEL);
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM_LEVEL}/${y}/${x}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Esri tile fetch failed with status ${response.status} for ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
