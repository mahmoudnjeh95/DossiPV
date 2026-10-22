import type { PvgisSeriesMeta } from './types';

/** The `inputs` block PVGIS echoes back with every answer. */
export interface RawPvgisInputs {
  location?: { elevation?: unknown };
  meteo_data?: {
    radiation_db?: unknown;
    meteo_db?: unknown;
    year_min?: unknown;
    year_max?: unknown;
    use_horizon?: unknown;
    horizon_db?: unknown;
    horizon_data?: unknown;
  };
  mounting_system?: { fixed?: { type?: unknown } };
  pv_module?: { technology?: unknown };
}

export const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
export const finite = (value: unknown): number | null => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

export function seriesMeta(inputs: RawPvgisInputs | undefined): PvgisSeriesMeta {
  const meteo = inputs?.meteo_data;
  return {
    radiationDb: text(meteo?.radiation_db),
    meteoDb: text(meteo?.meteo_db),
    elevationM: finite(inputs?.location?.elevation),
    useHorizon: typeof meteo?.use_horizon === 'boolean' ? meteo.use_horizon : null,
    // seriescalc names the source `horizon_data` (e.g. DEM-calculated); PVcalc names it `horizon_db`.
    horizonSource: text(meteo?.horizon_data) ?? text(meteo?.horizon_db),
  };
}
