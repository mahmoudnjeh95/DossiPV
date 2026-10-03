/**
 * Error thrown when a project uses a wind speed or tilt different from the schema's
 * documented default (120 km/h, 30deg) without supplying its own lift/drag coefficients.
 * Spec §4: "any other wind speed or tilt requires the installer to supply recomputed
 * coefficients (from their inspection office) before generation is allowed."
 */
export class MissingStabilityCoefficientsError extends Error {
  constructor(windSpeedKmh: number, tiltDeg: number) {
    super(
      `Structure uses wind speed ${windSpeedKmh} km/h and tilt ${tiltDeg} deg, which differ ` +
        `from the template default (120 km/h, 30 deg). liftCoeffNPerM2 and dragCoeffNPerM2 ` +
        `must be supplied explicitly (confirmed by an inspection office) before this project ` +
        `can be generated.`,
    );
    this.name = 'MissingStabilityCoefficientsError';
  }
}

/** x-rules Structure schema notes: template constants valid only at 120 km/h wind, 30deg tilt. */
export const WIND_TILT_DEFAULT = {
  windSpeedKmh: 120,
  tiltDeg: 30,
  liftCoeffNPerM2: 339,
  dragCoeffNPerM2: 196,
} as const;

export interface StabilityCoefficientsInput {
  windSpeedKmh: number;
  tiltDeg: number;
  liftCoeffNPerM2?: number;
  dragCoeffNPerM2?: number;
}

export interface StabilityCoefficientsResult {
  liftCoeffNPerM2: number;
  dragCoeffNPerM2: number;
  usedDefault: boolean;
}

export function resolveStabilityCoefficients(
  input: StabilityCoefficientsInput,
): StabilityCoefficientsResult {
  if (input.liftCoeffNPerM2 !== undefined && input.dragCoeffNPerM2 !== undefined) {
    return {
      liftCoeffNPerM2: input.liftCoeffNPerM2,
      dragCoeffNPerM2: input.dragCoeffNPerM2,
      usedDefault: false,
    };
  }

  const matchesDefault =
    input.windSpeedKmh === WIND_TILT_DEFAULT.windSpeedKmh &&
    input.tiltDeg === WIND_TILT_DEFAULT.tiltDeg;

  if (!matchesDefault) {
    throw new MissingStabilityCoefficientsError(input.windSpeedKmh, input.tiltDeg);
  }

  return {
    liftCoeffNPerM2: WIND_TILT_DEFAULT.liftCoeffNPerM2,
    dragCoeffNPerM2: WIND_TILT_DEFAULT.dragCoeffNPerM2,
    usedDefault: true,
  };
}

export interface TotalWeightInput {
  frameCount: number;
  ballastPerFrame: number;
  ballastMassKg: number;
  moduleCount: number;
  moduleWeightKg: number;
  structureWeightN: number;
}

const GRAVITY_M_PER_S2 = 9.81;

/**
 * x-rules.derived F_WEIGHT_N:
 * frameCount * ballastPerFrame * ballastMassKg * 9.81
 * + MODULE_COUNT * M.weightKg * 9.81
 * + structureWeightN
 */
export function totalWeightN(input: TotalWeightInput): number {
  const ballastWeightN =
    input.frameCount * input.ballastPerFrame * input.ballastMassKg * GRAVITY_M_PER_S2;
  const moduleWeightN = input.moduleCount * input.moduleWeightKg * GRAVITY_M_PER_S2;
  return ballastWeightN + moduleWeightN + input.structureWeightN;
}

/** x-rules.derived STABILITY_LHS: (F_WEIGHT_N - liftCoeffNPerM2 * MODULE_AREA_M2) * depthDM */
export function stabilityLhs(
  weightN: number,
  liftCoeffNPerM2: number,
  moduleAreaM2: number,
  depthDM: number,
): number {
  return (weightN - liftCoeffNPerM2 * moduleAreaM2) * depthDM;
}

/** x-rules.derived STABILITY_RHS: 2 * dragCoeffNPerM2 * MODULE_AREA_M2 * heightHM */
export function stabilityRhs(
  dragCoeffNPerM2: number,
  moduleAreaM2: number,
  heightHM: number,
): number {
  return 2 * dragCoeffNPerM2 * moduleAreaM2 * heightHM;
}
