/**
 * Column values shared by the section save actions and the proposal applier, so a section
 * written by either path has exactly the same shape.
 */

/**
 * Every `ProjectStructure` column but the project link. Tunisian dossiers need only the material
 * and the design wind speed; the other columns are cleared so a saved structure never carries
 * stale wind-stability inputs (the engine then skips the stability check).
 */
export function structureDataFor(material: string, windSpeedKmh: number): {
  material: string;
  windSpeedKmh: number;
  frameDescription: null;
  frameCount: null;
  railsDescription: null;
  fixingDescription: null;
  ballastPerFrame: null;
  ballastMassKg: null;
  ballastType: null;
  structureWeightN: null;
  heightHM: null;
  depthDM: null;
  liftCoeffNPerM2: null;
  dragCoeffNPerM2: null;
  tieDownCables: null;
} {
  return {
    material,
    windSpeedKmh,
    frameDescription: null,
    frameCount: null,
    railsDescription: null,
    fixingDescription: null,
    ballastPerFrame: null,
    ballastMassKg: null,
    ballastType: null,
    structureWeightN: null,
    heightHM: null,
    depthDM: null,
    liftCoeffNPerM2: null,
    dragCoeffNPerM2: null,
    tieDownCables: null,
  };
}

/** The standard earthing values installers never enter (none of them feed the engine). */
export const EARTHING_FIXED_VALUES = {
  mainEarthSectionMm2: 16,
  frameEarthSectionMm2: 16,
  earthToPitSectionMm2: 25,
  rodLengthM: 1.5,
  rodSpacingCm: null,
  pitSizeCm: null,
} as const;
