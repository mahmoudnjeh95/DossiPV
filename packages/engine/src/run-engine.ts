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
import {
  runAllChecks,
  checkC01,
  checkC02,
  checkC04,
  checkC07,
  checkC08,
  checkC09,
  checkC10,
  checkC13,
  checkC16,
  checkC19,
  checkC21,
  type ChecksContext,
  type FuseCheckInput,
} from './checks';
import type { InverterInput, MpptConfig, CheckResult } from './types';

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
 * Runs the 8 Ns/Np/fuse-dependent BLOCK checks (C01, C02, C04, C07, C08, C09, C10, C16) for one
 * (inverter, MPPT) pair, using that pair's own inverter ratings and that MPPT's own ns/np —
 * never array[0]'s. Called once per MPPT of every inverter entry so a failure on any string in
 * a multi-inverter/multi-MPPT array is never silently skipped (see runEngine's doc comment).
 */
function evaluatePerMpptBlockChecks(
  module: PvModuleInput,
  inverter: InverterInput,
  mppt: MpptConfig,
  tMinC: number,
  tMaxC: number,
  dcSwitch: RunEngineInput['dcSwitch'],
  dcFuse: RunEngineInput['dcFuse'],
  dcSpd: RunEngineInput['dcSpd'],
  dcRunIzCorrected: number,
): CheckResult[] {
  const ns = mppt.modulesPerString;
  const np = mppt.stringsInParallel;

  const nsMaxVal = nsMax(module, inverter, tMinC);
  const nsMinVal = nsMin(module, inverter, tMaxC);
  const npMaxVal = npMax(module, inverter, tMaxC);

  const stringVoc = stringVocTmin(module, ns, tMinC);
  const fieldDesignCurrent = iscFieldDesign(module, np);

  const fuseRequired = dcFuseRequired(module, np);
  const fuseLowerBound = 1.1 * 1.25 * module.iscA;
  const fuseUpperBound = module.irmA;
  const fuse: FuseCheckInput = {
    fuseRequired,
    fuseSet: dcFuse !== null,
    fuseRatedCurrentA: dcFuse?.ratedCurrentA ?? null,
    fuseRatedVoltageV: dcFuse?.ratedVoltageV ?? null,
    lowerBoundA: fuseLowerBound,
    upperBoundA: fuseUpperBound,
    stringVocTmin: stringVoc,
  };

  return [
    checkC01(ns, nsMaxVal),
    checkC02(ns, nsMinVal),
    checkC04(np, npMaxVal),
    checkC07(stringVoc, module.maxSystemVoltageV),
    checkC08(fuse),
    checkC09(dcSwitch.ratedVoltageV, stringVoc, dcSwitch.ratedCurrentA, fieldDesignCurrent),
    checkC10(dcSpd.ucV, ns, module.vocV, dcSpd.inKA, dcSpd.iscpvKA, fieldDesignCurrent),
    checkC16(dcRunIzCorrected, fieldDesignCurrent),
  ];
}

/**
 * Runs the 3 single-inverter-dependent BLOCK/WARN checks (C13, C19, C21) for one inverter's
 * own iacMaxA/phases/stegApproved — never array[0]'s. Called once per inverter entry so a
 * second (or later) inverter with a mismatched breaker rating, phase count, or STEG approval
 * status is never silently skipped (see runEngine's doc comment).
 */
function evaluatePerInverterChecks(
  inverter: InverterInput,
  acBreakerRatedCurrentA: number,
  acRunIzCorrected: number,
  sitePhases: 1 | 3,
): CheckResult[] {
  return [
    checkC13(inverter.iacMaxA, acBreakerRatedCurrentA, acRunIzCorrected),
    checkC19(sitePhases, inverter.phases),
    checkC21(inverter.stegApproved),
  ];
}

/**
 * Single entry point: validated project + equipment data in, every derived value and every
 * check's result out. Imported unchanged by the browser (live form validation) and the worker
 * (final generation) — spec §4's "single source of truth" guarantee depends on both call sites
 * using this exact function rather than re-implementing any formula locally.
 */
export function runEngine(input: RunEngineInput): EngineResult {
  const { module, array, tMinC, tMaxC } = input;

  // Multi-inverter aggregation (P_DC_W, POWER_RATIO) works for any array shape via
  // totalDcPowerW/totalModuleCount. The Ns/Np/fuse-dependent BLOCK checks (C01, C02, C04, C07,
  // C08, C09, C10, C16) and the single-inverter-dependent checks (C13, C19, C21) are evaluated
  // below once per representative (first) MPPT/inverter for the `derived` output — which
  // remains a single representative string's/inverter's values, as before — AND, separately,
  // for EVERY MPPT of EVERY inverter entry via evaluatePerMpptBlockChecks(), and for EVERY
  // inverter entry via evaluatePerInverterChecks(), so a second inverter or MPPT with an
  // out-of-bounds string, mismatched phase count, under-rated breaker, or missing STEG
  // approval still produces hasBlockingFailure: true (or a traceable WARN) rather than being
  // silently skipped.
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

  // The array-wide 22-check run above already evaluates the 8 Ns/Np/fuse-dependent BLOCK checks
  // (C01, C02, C04, C07, C08, C09, C10, C16) for array[0].mppts[0] via checksContext. To avoid
  // silently ignoring every OTHER MPPT, re-run those same 8 checks for every (inverter, MPPT)
  // pair EXCEPT that first one (which would just duplicate the result already in runAllChecks'
  // output) and append every result. A failing BLOCK on any additional string therefore always
  // shows up in `checks` and always flips `hasBlockingFailure`, regardless of which inverter or
  // MPPT it came from.
  const perMpptChecks: CheckResult[] = [];
  let isFirstPair = true;
  for (const entry of array) {
    for (const mppt of entry.mppts) {
      if (isFirstPair) {
        isFirstPair = false;
        continue;
      }
      perMpptChecks.push(
        ...evaluatePerMpptBlockChecks(
          module,
          entry.inverter,
          mppt,
          tMinC,
          tMaxC,
          input.dcSwitch,
          input.dcFuse,
          input.dcSpd,
          dcRunIz,
        ),
      );
    }
  }

  // The array-wide 22-check run above already evaluates the 3 single-inverter-dependent
  // checks (C13, C19, C21) for array[0].inverter via checksContext. To avoid silently
  // ignoring every OTHER inverter's own breaker rating, phase count, or STEG approval status,
  // re-run those same 3 checks for every inverter entry EXCEPT the first (which would just
  // duplicate the result already in runAllChecks' output) and append every result.
  const perInverterChecks: CheckResult[] = [];
  for (const entry of array.slice(1)) {
    perInverterChecks.push(
      ...evaluatePerInverterChecks(
        entry.inverter,
        input.acBreaker.ratedCurrentA,
        acRunIz,
        input.site.phases,
      ),
    );
  }

  const checks = [...runAllChecks(checksContext), ...perMpptChecks, ...perInverterChecks];
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
