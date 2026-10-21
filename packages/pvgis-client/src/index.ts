import { PvgisFetchError, type PvgisHourlyRow } from './types';

const PVGIS_BASE_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc';

interface RawPvgisHourlyRow {
  time: string;
  'Gb(i)': number;
  'Gd(i)': number;
  'Gr(i)': number;
  T2m: number;
}

interface RawPvgisResponse {
  outputs?: {
    hourly?: RawPvgisHourlyRow[];
  };
}

export async function fetchPvgisHourlyData(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
  year: number,
): Promise<PvgisHourlyRow[]> {
  const url = new URL(PVGIS_BASE_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('angle', String(tiltDeg));
  url.searchParams.set('aspect', String(azimuthDeg));
  url.searchParams.set('startyear', String(year));
  url.searchParams.set('endyear', String(year));
  url.searchParams.set('components', '1');
  url.searchParams.set('outputformat', 'json');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new PvgisFetchError(response.status, `PVGIS request failed with status ${response.status}`);
  }

  const data = (await response.json()) as RawPvgisResponse;
  const hourly = data.outputs?.hourly;
  if (!hourly) {
    throw new PvgisFetchError(response.status, 'PVGIS response is missing outputs.hourly');
  }

  return hourly.map((row) => ({
    time: row.time,
    beamWM2: row['Gb(i)'],
    diffuseWM2: row['Gd(i)'],
    reflectedWM2: row['Gr(i)'],
    ambientTempC: row.T2m,
  }));
}

export { fetchPvgisSpecificYield } from './specific-yield';
export * from './types';
