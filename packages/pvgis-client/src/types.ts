export interface PvgisHourlyRow {
  time: string; // "YYYYMMDD:HHmm"
  beamWM2: number; // Gb(i)
  diffuseWM2: number; // Gd(i)
  reflectedWM2: number; // Gr(i)
  ambientTempC: number; // T2m
}

/** Total in-plane irradiance for one hour — beam + diffuse + reflected. */
export function totalIrradianceWM2(row: Pick<PvgisHourlyRow, 'beamWM2' | 'diffuseWM2' | 'reflectedWM2'>): number {
  return row.beamWM2 + row.diffuseWM2 + row.reflectedWM2;
}

export class PvgisFetchError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PvgisFetchError';
  }
}

/** What PVGIS says about the data behind a series (its `inputs` block); null when absent. */
export interface PvgisSeriesMeta {
  /** e.g. `PVGIS-SARAH3`. */
  radiationDb: string | null;
  /** Database of the other meteorological variables, e.g. `ERA5`. */
  meteoDb: string | null;
  /** Ground elevation of the point, metres. */
  elevationM: number | null;
  /** Whether PVGIS applied the far-horizon shading. */
  useHorizon: boolean | null;
  /** Where the horizon came from, e.g. `DEM-calculated`. */
  horizonSource: string | null;
}

export interface PvgisHourlySeries {
  rows: PvgisHourlyRow[];
  meta: PvgisSeriesMeta;
}

/** PVcalc's metadata: the series metadata plus the years averaged and the system type. */
export interface PvgisPvcalcMeta extends PvgisSeriesMeta {
  yearMin: number | null;
  yearMax: number | null;
  /** e.g. `free-standing`. */
  mountingType: string | null;
  /** e.g. `c-Si`. */
  technology: string | null;
}

/** One month of PVcalc for 1 kWp without system loss, averaged over PVGIS's years. */
export interface PvgisPvcalcMonth {
  month: number;
  /** E_m */
  energyKWhPerKWp: number;
  /** E_d */
  dailyEnergyKWhPerKWp: number;
  /** H(i)_m */
  irradiationKWhM2: number;
  /** SD_m: year-to-year standard deviation of E_m. */
  energySdKWhPerKWp: number;
}

/**
 * PVGIS's own estimate for 1 kWp at the point and orientation with no system loss (`loss=0`),
 * multi-year average. Scale by the installed kWp; apply a system loss L as × (1 − L / 100),
 * exactly as PVcalc does.
 */
export interface PvgisPvcalcReference {
  meta: PvgisPvcalcMeta;
  monthly: PvgisPvcalcMonth[];
  yearly: {
    /** E_y */
    energyKWhPerKWp: number;
    /** E_d */
    dailyEnergyKWhPerKWp: number;
    /** H(i)_y */
    irradiationKWhM2: number;
    /** SD_y: year-to-year standard deviation of E_y. */
    energySdKWhPerKWp: number;
  };
  /** PVGIS's loss components, percent, signed as PVGIS gives them (negative = loss). */
  losses: {
    /** l_aoi: reflection at the angle of incidence. */
    aoiPct: number;
    /** l_spec: spectral effects (often a small gain). */
    spectralPct: number;
    /** l_tg: temperature and low irradiance. */
    temperatureIrradiancePct: number;
    /** l_total, with no system loss: the three above combined. */
    totalPct: number;
  };
}
