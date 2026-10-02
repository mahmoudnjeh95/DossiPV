import type { PvModuleInput, InverterArrayEntry, EngineResult } from './types';
import {
  vocAtTmin,
  vmpAtTmin,
  vmpAtTmax,
  iscAtTmax,
} from './module-electrical';
import {
  nsMax,
  nsOptMax,
  nsMin,
  npMax,
  npOpt,
  totalDcPowerW,
  totalModuleCount,
  powerRatio as computePowerRatio,
} from './string-sizing';
import { ncMaxNoFuse, dcFuseRequired, stringVocTmin, iscFieldDesign } from './protections';
import {
  izCorrected,
  duDcV,
  duDcPct,
  duAcV,
  duAcPct,
  type ConductorType,
  type InsulationType,
  type ReferenceMethod,
} from './cabling';
import {
  resolveStabilityCoefficients,
  totalWeightN,
  stabilityLhs as computeStabilityLhs,
  stabilityRhs as computeStabilityRhs,
} from './structure';
import { runAllChecks, type ChecksContext, type FuseCheckInput } from './checks';

export interface CableRunInput {
  conductor: ConductorType;
  insulation: InsulationType;
  sectionMm2: number;
  lengthM: number;
  installMethod: string;
  referenceMethod: ReferenceMethod;
  ambientTempC: number;
  groupedCircuits: number;
  layers: number;
  izBaseA: number;
}

export interface RunEngineInput {
  module: PvModuleInput;
  array: InverterArrayEntry[];
  tMinC: number;
  tMaxC: number;
  dcSwitch: { ratedVoltageV: number; ratedCurrentA: number };
  dcFuse: { ratedCurrentA: number; ratedVoltageV: number } | null;
  dcSpd: { ucV: number; inKA: number; iscpvKA: number; upKV: number; type: number };
  acBreaker: { ratedCurrentA: number };
  acSpd: { ucV: number; upKV: number; type: number };
  acIsolator: { ratedCurrentA: number } | null;
  equipmentImpulseWithstandKV: number;
  spdToEquipmentDistanceM: number;
  dcRun: CableRunInput;
  acRun: CableRunInput;
  cosPhi: number;
  lambdaOhmPerM: number;
  maxVoltageDropPct: number;
  structure: {
    frameCount: number;
    ballastPerFrame: number;
    ballastMassKg: number;
    structureWeightN: number;
    heightHM: number;
    depthDM: number;
    windSpeedKmh: number;
    tiltDeg: number;
    liftCoeffNPerM2?: number;
    dragCoeffNPerM2?: number;
  };
  site: {
    phases: 1 | 3;
    lightningRod: boolean;
    gps: { lat: number; lon: number };
  };
  dossierDate: string;
  companyAccreditationValidTo: string;
}

/**
 * Single entry point: validated project + equipment data in, every derived value and every
 * check's result out. Imported unchanged by the browser (live form validation) and the worker
 * (final generation) — spec §4's "single source of truth" guarantee depends on both call sites
 * using this exact function rather than re-implementing any formula locally.
 */
export function runEngine(input: RunEngineInput): EngineResult {
  const { module, array, tMinC, tMaxC } = input;

  // Only single-inverter, single-MPPT projects are fully supported for the per-string checks
  // in this task; multi-inverter aggregation (P_DC_W, POWER_RATIO) already works for any
  // array shape via totalDcPowerW/totalModuleCount (Task 5), but the Ns/Np-driven checks below
  // run only on the first MPPT of the first inverter — multi-string check support is explicitly
  // handled by the Project-level orchestration layer introduced when the web form is built, not
  // required for this package's public contract.
  const firstEntry = array[0];
  const firstMppt = firstEntry?.mppts[0];
  const ns = firstMppt?.modulesPerString ?? 0;
  const np = firstMppt?.stringsInParallel ?? 0;
  const inverter = firstEntry?.inverter;

  if (!inverter) {
    throw new Error('runEngine requires at least one inverter with at least one MPPT configured.');
  }

  const dcPower = totalDcPowerW(module, array);
  const moduleCount = totalModuleCount(array);
  const ratio = computePowerRatio(module, array);

  const voc = vocAtTmin(module, tMinC);
  const vmpMin = vmpAtTmin(module, tMinC);
  const vmpMax = vmpAtTmax(module, tMaxC);
  const isc = iscAtTmax(module, tMaxC);

  const nsMaxVal = nsMax(module, inverter, tMinC);
  const nsMinVal = nsMin(module, inverter, tMaxC);
  const nsOptMaxVal = nsOptMax(module, inverter, tMinC);
  const npMaxVal = npMax(module, inverter, tMaxC);
  const npOptVal = npOpt(module, inverter, tMaxC);

  const stringVoc = stringVocTmin(module, ns, tMinC);
  const stringVmp = ns * module.vmpV;
  const fieldDesignCurrent = iscFieldDesign(module, np);

  const fuseRequired = dcFuseRequired(module, np);
  const fuseLowerBound = 1.1 * 1.25 * module.iscA;
  const fuseUpperBound = module.irmA;
  const fuse: FuseCheckInput = {
    fuseRequired,
    fuseSet: input.dcFuse !== null,
    fuseRatedCurrentA: input.dcFuse?.ratedCurrentA ?? null,
    fuseRatedVoltageV: input.dcFuse?.ratedVoltageV ?? null,
    lowerBoundA: fuseLowerBound,
    upperBoundA: fuseUpperBound,
    stringVocTmin: stringVoc,
  };

  const dcRunIz = izCorrected(
    input.dcRun.izBaseA,
    input.dcRun.installMethod,
    input.dcRun.referenceMethod,
    input.dcRun.groupedCircuits,
    input.dcRun.layers,
    input.dcRun.ambientTempC,
    input.dcRun.insulation,
  );
  const acRunIz = izCorrected(
    input.acRun.izBaseA,
    input.acRun.installMethod,
    input.acRun.referenceMethod,
    input.acRun.groupedCircuits,
    input.acRun.layers,
    input.acRun.ambientTempC,
    input.acRun.insulation,
  );

  const dcDrop = duDcV(input.dcRun.conductor, input.dcRun.lengthM, input.dcRun.sectionMm2, module.impA, np);
  const dcDropPct = duDcPct(dcDrop, stringVmp);

  const acDrop = duAcV(
    input.acRun.conductor,
    input.acRun.lengthM,
    input.acRun.sectionMm2,
    input.cosPhi,
    input.lambdaOhmPerM,
    inverter.iacMaxA,
    input.site.phases,
  );
  const acDropPct = duAcPct(acDrop, input.site.phases);

  // Built with spread rather than literal keys so that, under exactOptionalPropertyTypes,
  // an absent liftCoeffNPerM2/dragCoeffNPerM2 on the input is genuinely absent on this object
  // (triggering resolveStabilityCoefficients' default-lookup path) rather than present-but-undefined.
  const stabilityCoeffs = resolveStabilityCoefficients({
    windSpeedKmh: input.structure.windSpeedKmh,
    tiltDeg: input.structure.tiltDeg,
    ...(input.structure.liftCoeffNPerM2 !== undefined
      ? { liftCoeffNPerM2: input.structure.liftCoeffNPerM2 }
      : {}),
    ...(input.structure.dragCoeffNPerM2 !== undefined
      ? { dragCoeffNPerM2: input.structure.dragCoeffNPerM2 }
      : {}),
  });

  const moduleAreaM2 = (moduleCount * module.lengthMm * module.widthMm) / 1e6;
  const weightN = totalWeightN({
    frameCount: input.structure.frameCount,
    ballastPerFrame: input.structure.ballastPerFrame,
    ballastMassKg: input.structure.ballastMassKg,
    moduleCount,
    moduleWeightKg: module.weightKg,
    structureWeightN: input.structure.structureWeightN,
  });
  const lhs = computeStabilityLhs(
    weightN,
    stabilityCoeffs.liftCoeffNPerM2,
    moduleAreaM2,
    input.structure.depthDM,
  );
  const rhs = computeStabilityRhs(stabilityCoeffs.dragCoeffNPerM2, moduleAreaM2, input.structure.heightHM);

  const sumInverterIacMaxA = array.reduce((sum, entry) => sum + entry.inverter.iacMaxA, 0);

  const checksContext: ChecksContext = {
    ns,
    nsMax: nsMaxVal,
    nsMin: nsMinVal,
    nsOptMax: nsOptMaxVal,
    np,
    npMax: npMaxVal,
    npOpt: npOptVal,
    powerRatio: ratio,
    stringVocTmin: stringVoc,
    maxSystemVoltageV: module.maxSystemVoltageV,
    fuse,
    dcSwitchRatedVoltageV: input.dcSwitch.ratedVoltageV,
    dcSwitchRatedCurrentA: input.dcSwitch.ratedCurrentA,
    iscFieldDesign: fieldDesignCurrent,
    dcSpdUcV: input.dcSpd.ucV,
    dcSpdInKA: input.dcSpd.inKA,
    dcSpdIscpvKA: input.dcSpd.iscpvKA,
    spdUpKV: input.dcSpd.upKV,
    equipmentImpulseWithstandKV: input.equipmentImpulseWithstandKV,
    spdToEquipmentDistanceM: input.spdToEquipmentDistanceM,
    lightningRod: input.site.lightningRod,
    dcSpdType: input.dcSpd.type,
    acSpdType: input.acSpd.type,
    inverterIacMaxA: inverter.iacMaxA,
    acBreakerRatedCurrentA: input.acBreaker.ratedCurrentA,
    acRunIzCorrected: acRunIz,
    acSpdUcV: input.acSpd.ucV,
    inverterCount: array.length,
    acIsolatorSet: input.acIsolator !== null,
    acIsolatorRatedCurrentA: input.acIsolator?.ratedCurrentA ?? 0,
    sumInverterIacMaxA,
    dcRunIzCorrected: dcRunIz,
    duDcPctSum: dcDropPct,
    duAcPctSum: acDropPct,
    maxVoltageDropPct: input.maxVoltageDropPct,
    stabilityLhs: lhs,
    stabilityRhs: rhs,
    sitePhases: input.site.phases,
    inverterPhases: inverter.phases,
    equipmentHomologationExpiries: [],
    dossierDate: input.dossierDate,
    inverterStegApproved: inverter.stegApproved,
    companyAccreditationValidTo: input.companyAccreditationValidTo,
    moduleVocV: module.vocV,
  };

  const checks = runAllChecks(checksContext);
  const hasBlockingFailure = checks.some((c) => c.level === 'BLOCK' && !c.pass);

  return {
    derived: {
      P_DC_W: dcPower,
      MODULE_COUNT: moduleCount,
      MODULE_AREA_M2: moduleAreaM2,
      VOC_TMIN: voc,
      VMP_TMIN: vmpMin,
      VMP_TMAX: vmpMax,
      ISC_TMAX: isc,
      NS_MAX: nsMaxVal,
      NS_MIN: nsMinVal,
      NS_OPT_MAX: nsOptMaxVal,
      NP_MAX: npMaxVal,
      NP_OPT: npOptVal,
      POWER_RATIO: ratio,
      STRING_VOC_TMIN: stringVoc,
      STRING_VMP_STC: stringVmp,
      ISC_FIELD_DESIGN: fieldDesignCurrent,
      NC_MAX_NO_FUSE: ncMaxNoFuse(module),
      DC_RUN_IZ_CORRECTED: dcRunIz,
      AC_RUN_IZ_CORRECTED: acRunIz,
      DU_DC_V: dcDrop,
      DU_DC_PCT: dcDropPct,
      DU_AC_V: acDrop,
      DU_AC_PCT: acDropPct,
      F_WEIGHT_N: weightN,
      STABILITY_LHS: lhs,
      STABILITY_RHS: rhs,
    },
    checks,
    hasBlockingFailure,
  };
}
