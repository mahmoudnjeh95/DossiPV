// packages/engine/test/fixtures/habib-khedhira.ts
import type { RunEngineInput } from '../../src/run-engine';

/**
 * Inputs transcribed from "Dossier Technique - 434 - 303 - Habib Khedhira.pdf" (not committed
 * to git — contains real client PII), corrected for the 7 errors identified during spec
 * analysis:
 *  1. GPS: dossier had three disagreeing values (cover 36°24'N, plan 36°33'N, PVsyst 34.83°N).
 *     This fixture uses the plan's value (36°33'38.0"N 10°31'37.7"E) as the single source.
 *  2. Single-line diagram showed SUNGROW SG3.0RS-S / 300mA breaker vs text's Sofar / 30mA.
 *     This fixture uses the Sofar 1-4KTL2-G3 3kW inverter and a 30mA breaker (text values).
 *  3. DC switch: text said 20A, drawing said 25A. This fixture uses 25A (drawing, matching
 *     the ZJ BENY BB1H-63 datasheet In=25A visible on page 40 of the dossier).
 *  4. Vmp temperature correction: dossier used tempCoeffVocPct (-0.24%/°C); corrected to use
 *     tempCoeffPmaxPct (-0.28%/°C) per the engine's resolveVmpTempCoeff fallback rule.
 *  5. Ns optimal at 560V exceeded the inverter's 550V max; corrected module count derivation
 *     uses the inverter's actual 550V mpptMaxV.
 *  6. AC voltage drop: dossier printed 0.128V where the correct value is ~1.28V (0.56% was
 *     already correct) — a decimal-place transcription error, not a formula error; this
 *     fixture's expected DU_AC_V reflects the corrected ~1.28V magnitude.
 *  7. Module weight: dossier said 1395N for 5 modules; 5 * 33.5kg * 9.81 = 1643.175N. This
 *     fixture uses the corrected figure (see structure.test.ts Task 8 for the same correction).
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
