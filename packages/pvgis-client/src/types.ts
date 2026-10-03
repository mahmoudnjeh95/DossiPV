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
