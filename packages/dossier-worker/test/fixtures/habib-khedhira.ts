// packages/dossier-worker/test/fixtures/habib-khedhira.ts
//
// Duplicated from packages/engine/test/fixtures/habib-khedhira.ts rather than imported
// directly, per the dossier-worker design spec's §6 open item: importing the engine's fixture
// by relative path pulls engine's entire src/ tree into this package's own `tsc -b` program,
// violating its `rootDir` boundary. Importing the type from the `@dossipv/engine` package
// (not a relative src path) avoids that. Keep this fixture's values in sync with the engine
// package's copy if that one changes.
import type { RunEngineInput } from '@dossipv/engine';

/**
 * Inputs transcribed from "Dossier Technique - 434 - 303 - Habib Khedhira.pdf" (not committed
 * to git — contains real client PII), corrected for the 7 errors identified during spec
 * analysis. See packages/engine/test/fixtures/habib-khedhira.ts for the full correction notes.
 */
export const habibKhedhiraFixture: RunEngineInput = {
  module: {
    pmaxW: 620,
    vmpV: 46.5,
    impA: 13.33,
    vocV: 55.9,
    iscA: 13.92,
    tempCoeffVocPct: -0.25,
    tempCoeffIscPct: 0.045,
    tempCoeffPmaxPct: -0.28,
    irmA: 25,
    maxSystemVoltageV: 1500,
    lengthMm: 2278,
    widthMm: 1134,
    weightKg: 33.5,
  },
  array: [
    {
      inverter: {
        phases: 1,
        pacW: 3000,
        sacVA: 3000,
        vdcMaxV: 550,
        mpptMinV: 90,
        mpptMaxV: 550,
        startUpV: 100,
        mpptCount: 1,
        inputsPerMppt: 2,
        idcMaxPerMpptA: 16,
        iscMaxPerMpptA: 20,
        vacNomV: 230,
        iacMaxA: 16,
        stegApproved: true,
      },
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  tMinC: -10,
  tMaxC: 85,
  dcSwitch: { ratedVoltageV: 600, ratedCurrentA: 25 },
  dcFuse: null,
  dcSpd: { ucV: 700, inKA: 10, iscpvKA: 0.02, upKV: 2.0, type: 2 },
  acBreaker: { ratedCurrentA: 20 },
  acSpd: { ucV: 275, upKV: 1.5, type: 2 },
  acIsolator: null,
  equipmentImpulseWithstandKV: 4,
  spdToEquipmentDistanceM: 1,
  dcRun: {
    conductor: 'Cu',
    insulation: 'PR',
    sectionMm2: 6,
    lengthM: 20,
    installMethod: '13',
    referenceMethod: 'B',
    ambientTempC: 50,
    groupedCircuits: 1,
    layers: 1,
    izBaseA: 56,
  },
  acRun: {
    conductor: 'Cu',
    insulation: 'PR',
    sectionMm2: 4,
    lengthM: 10,
    installMethod: '3A',
    referenceMethod: 'B',
    ambientTempC: 50,
    groupedCircuits: 1,
    layers: 1,
    izBaseA: 32,
  },
  cosPhi: 0.8,
  lambdaOhmPerM: 0.00008,
  maxVoltageDropPct: 3,
  structure: {
    frameCount: 5,
    ballastPerFrame: 2,
    ballastMassKg: 75,
    structureWeightN: 275,
    heightHM: 1,
    depthDM: 1.5,
    windSpeedKmh: 120,
    tiltDeg: 30,
  },
  site: {
    phases: 1,
    lightningRod: false,
    gps: { lat: 36.5606, lon: 10.5272 },
  },
  dossierDate: '2025-01-03',
  companyAccreditationValidTo: '2027-01-01',
};
