import { PvgisFetchError } from './types';

const PVGIS_PVCALC_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';
const SYSTEM_LOSS_PERCENT = 14;
/** The proposals page waits on this call; a stalled PVGIS must not hang it (callers fall back). */
const REQUEST_TIMEOUT_MS = 10_000;

interface RawPvcalcResponse {
  outputs?: {
    totals?: {
      fixed?: {
        E_y?: number;
      };
    };
  };
}

/** Yearly energy yield (kWh) of 1 kWp at the given site and orientation, from PVGIS PVcalc. */
export async function fetchPvgisSpecificYield(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
): Promise<number> {
  const url = new URL(PVGIS_PVCALC_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('peakpower', '1');
  url.searchParams.set('loss', String(SYSTEM_LOSS_PERCENT));
  url.searchParams.set('angle', String(tiltDeg));
  url.searchParams.set('aspect', String(azimuthDeg));
  url.searchParams.set('outputformat', 'json');

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new PvgisFetchError(response.status, `PVGIS request failed with status ${response.status}`);
  }

  const data = (await response.json()) as RawPvcalcResponse;
  const yearlyYield = data.outputs?.totals?.fixed?.E_y;
  if (typeof yearlyYield !== 'number') {
    throw new PvgisFetchError(response.status, 'PVGIS response is missing outputs.totals.fixed.E_y');
  }
  return yearlyYield;
}
