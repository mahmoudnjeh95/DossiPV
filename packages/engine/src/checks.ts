import type { CheckResult } from './types';

export interface FuseCheckInput {
  fuseRequired: boolean;
  fuseSet: boolean;
  fuseRatedCurrentA: number | null;
  fuseRatedVoltageV: number | null;
  /** 1.1 * 1.25 * M.iscA, precomputed by the caller */
  lowerBoundA: number;
  /** M.irmA, precomputed by the caller */
  upperBoundA: number;
  stringVocTmin: number;
}

/** x-rules.checks C01: Ns <= NS_MAX (BLOCK) */
export function checkC01(ns: number, nsMax: number): CheckResult {
  return {
    id: 'C01',
    level: 'BLOCK',
    pass: ns <= nsMax,
    message: 'Tension Voc à Tmin dépasse Vdc max onduleur',
  };
}

/** x-rules.checks C02: Ns >= NS_MIN (BLOCK) */
export function checkC02(ns: number, nsMin: number): CheckResult {
  return {
    id: 'C02',
    level: 'BLOCK',
    pass: ns >= nsMin,
    message: 'Vmp à Tmax sous la plage MPPT / tension de démarrage',
  };
}

/** x-rules.checks C03: Ns <= NS_OPT_MAX (WARN) */
export function checkC03(ns: number, nsOptMax: number): CheckResult {
  return {
    id: 'C03',
    level: 'WARN',
    pass: ns <= nsOptMax,
    message: 'Vmp à Tmin au-dessus de la plage MPPT (écrêtage possible)',
  };
}

/** x-rules.checks C04: Np <= NP_MAX (BLOCK) */
export function checkC04(np: number, npMax: number): CheckResult {
  return {
    id: 'C04',
    level: 'BLOCK',
    pass: np <= npMax,
    message: 'Isc champ dépasse Isc max MPPT',
  };
}

/** x-rules.checks C05: Np <= NP_OPT (WARN) */
export function checkC05(np: number, npOpt: number): CheckResult {
  return {
    id: 'C05',
    level: 'WARN',
    pass: np <= npOpt,
    message: 'Imp champ dépasse Idc max MPPT (écrêtage courant)',
  };
}

/** x-rules.checks C06: 0.9 <= POWER_RATIO <= 1.3 (BLOCK) */
export function checkC06(powerRatio: number): CheckResult {
  return {
    id: 'C06',
    level: 'BLOCK',
    pass: powerRatio >= 0.9 && powerRatio <= 1.3,
    message: 'Ratio DC/AC hors plage 0.9 - 1.3',
  };
}

/** x-rules.checks C07: STRING_VOC_TMIN <= M.maxSystemVoltageV (BLOCK) */
export function checkC07(stringVocTmin: number, maxSystemVoltageV: number): CheckResult {
  return {
    id: 'C07',
    level: 'BLOCK',
    pass: stringVocTmin <= maxSystemVoltageV,
    message: 'Tension chaîne à Tmin dépasse la tension système max du module',
  };
}

/**
 * x-rules.checks C08: DC_FUSE_REQUIRED => dcFuse set AND
 * 1.1*1.25*iscA <= fuse.ratedCurrentA <= irmA AND fuse.ratedVoltageV >= STRING_VOC_TMIN (BLOCK)
 */
export function checkC08(input: FuseCheckInput): CheckResult {
  const result: CheckResult = {
    id: 'C08',
    level: 'BLOCK',
    pass: true,
    message: 'Fusible DC manquant ou mal calibré',
  };

  if (!input.fuseRequired) {
    return result;
  }

  if (!input.fuseSet || input.fuseRatedCurrentA === null || input.fuseRatedVoltageV === null) {
    return { ...result, pass: false };
  }

  const currentInRange =
    input.fuseRatedCurrentA >= input.lowerBoundA && input.fuseRatedCurrentA <= input.upperBoundA;
  const voltageOk = input.fuseRatedVoltageV >= input.stringVocTmin;

  return { ...result, pass: currentInRange && voltageOk };
}

/** x-rules.checks C09: dcSwitch.ratedVoltageV >= STRING_VOC_TMIN AND dcSwitch.ratedCurrentA >= ISC_FIELD_DESIGN (BLOCK) */
export function checkC09(
  dcSwitchRatedVoltageV: number,
  stringVocTmin: number,
  dcSwitchRatedCurrentA: number,
  iscFieldDesign: number,
): CheckResult {
  return {
    id: 'C09',
    level: 'BLOCK',
    pass: dcSwitchRatedVoltageV >= stringVocTmin && dcSwitchRatedCurrentA >= iscFieldDesign,
    message: 'Interrupteur-sectionneur DC sous-dimensionné',
  };
}

/** x-rules.checks C10: dcSpd.ucV >= 1.2*Ns*vocV AND dcSpd.inKA >= 5 AND dcSpd.iscpvKA*1000 >= ISC_FIELD_DESIGN (BLOCK) */
export function checkC10(
  dcSpdUcV: number,
  ns: number,
  moduleVocV: number,
  dcSpdInKA: number,
  dcSpdIscpvKA: number,
  iscFieldDesign: number,
): CheckResult {
  const ucOk = dcSpdUcV >= 1.2 * ns * moduleVocV;
  const inOk = dcSpdInKA >= 5;
  const iscpvOk = dcSpdIscpvKA * 1000 >= iscFieldDesign;
  return {
    id: 'C10',
    level: 'BLOCK',
    pass: ucOk && inOk && iscpvOk,
    message: 'Parafoudre DC sous-dimensionné',
  };
}

/** x-rules.checks C11: spd.upKV < 0.8*withstandKV (0.5x if distance > 10m) (BLOCK) */
export function checkC11(
  spdUpKV: number,
  equipmentImpulseWithstandKV: number,
  spdToEquipmentDistanceM: number,
): CheckResult {
  const threshold =
    spdToEquipmentDistanceM > 10
      ? 0.5 * equipmentImpulseWithstandKV
      : 0.8 * equipmentImpulseWithstandKV;
  return {
    id: 'C11',
    level: 'BLOCK',
    pass: spdUpKV < threshold,
    message: 'Niveau de protection du parafoudre insuffisant pour la tenue aux chocs',
  };
}

/** x-rules.checks C12: site.lightningRod => dcSpd.type == 1 AND acSpd.type == 1 (BLOCK) */
export function checkC12(lightningRod: boolean, dcSpdType: number, acSpdType: number): CheckResult {
  const pass = !lightningRod || (dcSpdType === 1 && acSpdType === 1);
  return {
    id: 'C12',
    level: 'BLOCK',
    pass,
    message: "Bâtiment équipé d'un paratonnerre : parafoudres DC et AC doivent être de Type 1",
  };
}

/** x-rules.checks C13: INV.iacMaxA <= acBreaker.ratedCurrentA <= IZ_CORRECTED(AC run) (BLOCK) */
export function checkC13(
  inverterIacMaxA: number,
  acBreakerRatedCurrentA: number,
  acRunIzCorrected: number,
): CheckResult {
  return {
    id: 'C13',
    level: 'BLOCK',
    pass: acBreakerRatedCurrentA >= inverterIacMaxA && acBreakerRatedCurrentA <= acRunIzCorrected,
    message: 'Calibre du disjoncteur AC hors plage [Iac onduleur, Iz câble]',
  };
}

/** x-rules.checks C14: acSpd.ucV >= 1.1*230 (BLOCK) */
export function checkC14(acSpdUcV: number): CheckResult {
  return {
    id: 'C14',
    level: 'BLOCK',
    pass: acSpdUcV >= 1.1 * 230,
    message: 'Tension de service du parafoudre AC insuffisante',
  };
}

/** x-rules.checks C15: inverterCount > 1 => acIsolator set AND ratedCurrentA > sum(iacMaxA) (BLOCK) */
export function checkC15(
  inverterCount: number,
  acIsolatorSet: boolean,
  acIsolatorRatedCurrentA: number,
  sumInverterIacMaxA: number,
): CheckResult {
  const pass =
    inverterCount <= 1 || (acIsolatorSet && acIsolatorRatedCurrentA > sumInverterIacMaxA);
  return {
    id: 'C15',
    level: 'BLOCK',
    pass,
    message: 'Interrupteur-sectionneur général AC requis et doit dépasser la somme des Iac',
  };
}

/** x-rules.checks C16: IZ_CORRECTED(DC run) >= ISC_FIELD_DESIGN (BLOCK) */
export function checkC16(dcRunIzCorrected: number, iscFieldDesign: number): CheckResult {
  return {
    id: 'C16',
    level: 'BLOCK',
    pass: dcRunIzCorrected >= iscFieldDesign,
    message: 'Courant admissible du câble DC insuffisant pour le courant de champ',
  };
}

/** x-rules.checks C17: sum(DU_DC_PCT) <= maxDcPct AND sum(DU_AC_PCT) <= maxAcPct (BLOCK) */
export function checkC17(
  duDcPctSum: number,
  duAcPctSum: number,
  maxDcPct: number,
  maxAcPct: number,
): CheckResult {
  const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  const dcFails = duDcPctSum > maxDcPct;
  const acFails = duAcPctSum > maxAcPct;
  const failures: string[] = [];
  if (dcFails) failures.push(`Chute de tension DC ${fmt.format(duDcPctSum)} % > ${fmt.format(maxDcPct)} %`);
  if (acFails) failures.push(`Chute de tension AC ${fmt.format(duAcPctSum)} % > ${fmt.format(maxAcPct)} %`);
  return {
    id: 'C17',
    level: 'BLOCK',
    pass: !dcFails && !acFails,
    message: failures.length > 0 ? failures.join(' ; ') : 'Chute de tension DC et AC dans les limites autorisées',
  };
}

/** x-rules.checks C18: STABILITY_LHS > STABILITY_RHS (BLOCK) */
export function checkC18(stabilityLhs: number, stabilityRhs: number): CheckResult {
  return {
    id: 'C18',
    level: 'BLOCK',
    pass: stabilityLhs > stabilityRhs,
    message: 'Lestage insuffisant – ajouter des dalles',
  };
}

/** x-rules.checks C19: site.phases == INV.phases (or balanced single-phase set) (BLOCK) */
export function checkC19(sitePhases: 1 | 3, inverterPhases: 1 | 3): CheckResult {
  return {
    id: 'C19',
    level: 'BLOCK',
    pass: sitePhases === inverterPhases,
    message: "Nombre de phases du site et de l'onduleur incompatibles",
  };
}

/** x-rules.checks C20: Every equipment with anmeHomologation.validTo < dossierDate (WARN) */
export function checkC20(
  equipmentHomologationExpiries: Array<string | null>,
  dossierDate: string,
): CheckResult {
  const anyExpired = equipmentHomologationExpiries.some(
    (validTo) => validTo !== null && validTo < dossierDate,
  );
  return {
    id: 'C20',
    level: 'WARN',
    pass: !anyExpired,
    message: 'Homologation expirée',
  };
}

/** x-rules.checks C21: INV.stegApproved != true (WARN) */
export function checkC21(inverterStegApproved: boolean | undefined): CheckResult {
  return {
    id: 'C21',
    level: 'WARN',
    pass: inverterStegApproved === true,
    message: 'Onduleur absent de la liste STEG',
  };
}

/** x-rules.checks C22: companySettings.anmeAccreditation.validTo >= dossierDate (BLOCK) */
export function checkC22(companyAccreditationValidTo: string, dossierDate: string): CheckResult {
  return {
    id: 'C22',
    level: 'BLOCK',
    pass: companyAccreditationValidTo >= dossierDate,
    message: 'Accréditation ANME de la société expirée',
  };
}

/** STEG rule: total inverter AC power (W) <= subscribed power (kVA x 1000) (BLOCK) */
export function checkC23(totalInverterPacW: number, subscribedPowerKVA: number): CheckResult {
  return {
    id: 'C23',
    level: 'BLOCK',
    pass: totalInverterPacW <= subscribedPowerKVA * 1000,
    message: 'Puissance AC totale des onduleurs supérieure à la puissance souscrite',
  };
}

/**
 * Flat set of pre-derived values every check needs. Built by run-engine.ts (Task 11) from the
 * outputs of module-electrical, string-sizing, protections, cabling, and structure, plus a few
 * fields read directly off the project/equipment/company records (SPD specs, breaker specs,
 * accreditation dates) that have no dedicated formula of their own.
 */
export interface ChecksContext {
  ns: number;
  nsMax: number;
  nsMin: number;
  nsOptMax: number;
  np: number;
  npMax: number;
  npOpt: number;
  powerRatio: number;
  stringVocTmin: number;
  maxSystemVoltageV: number;
  fuse: FuseCheckInput;
  dcSwitchRatedVoltageV: number;
  dcSwitchRatedCurrentA: number;
  iscFieldDesign: number;
  dcSpdUcV: number;
  dcSpdInKA: number;
  dcSpdIscpvKA: number;
  spdUpKV: number;
  equipmentImpulseWithstandKV: number;
  spdToEquipmentDistanceM: number;
  lightningRod: boolean;
  dcSpdType: number;
  acSpdType: number;
  inverterIacMaxA: number;
  acBreakerRatedCurrentA: number;
  acRunIzCorrected: number;
  acSpdUcV: number;
  inverterCount: number;
  acIsolatorSet: boolean;
  acIsolatorRatedCurrentA: number;
  sumInverterIacMaxA: number;
  dcRunIzCorrected: number;
  duDcPctSum: number;
  duAcPctSum: number;
  /** DC voltage-drop limit (%). */
  maxVoltageDropPct: number;
  /** AC voltage-drop limit (%). */
  maxAcVoltageDropPct: number;
  /** Absent when the project has no stability inputs; C18 is then skipped. */
  stabilityLhs?: number;
  stabilityRhs?: number;
  sitePhases: 1 | 3;
  inverterPhases: 1 | 3;
  equipmentHomologationExpiries: Array<string | null>;
  dossierDate: string;
  inverterStegApproved: boolean | undefined;
  companyAccreditationValidTo: string;
  moduleVocV: number;
}

/** Runs all 22 checks in C01..C22 order against a fully-derived context (C18 only with stability inputs). */
export function runAllChecks(context: ChecksContext): CheckResult[] {
  return [
    checkC01(context.ns, context.nsMax),
    checkC02(context.ns, context.nsMin),
    checkC03(context.ns, context.nsOptMax),
    checkC04(context.np, context.npMax),
    checkC05(context.np, context.npOpt),
    checkC06(context.powerRatio),
    checkC07(context.stringVocTmin, context.maxSystemVoltageV),
    checkC08(context.fuse),
    checkC09(
      context.dcSwitchRatedVoltageV,
      context.stringVocTmin,
      context.dcSwitchRatedCurrentA,
      context.iscFieldDesign,
    ),
    checkC10(
      context.dcSpdUcV,
      context.ns,
      context.moduleVocV,
      context.dcSpdInKA,
      context.dcSpdIscpvKA,
      context.iscFieldDesign,
    ),
    checkC11(context.spdUpKV, context.equipmentImpulseWithstandKV, context.spdToEquipmentDistanceM),
    checkC12(context.lightningRod, context.dcSpdType, context.acSpdType),
    checkC13(context.inverterIacMaxA, context.acBreakerRatedCurrentA, context.acRunIzCorrected),
    checkC14(context.acSpdUcV),
    checkC15(
      context.inverterCount,
      context.acIsolatorSet,
      context.acIsolatorRatedCurrentA,
      context.sumInverterIacMaxA,
    ),
    checkC16(context.dcRunIzCorrected, context.iscFieldDesign),
    checkC17(context.duDcPctSum, context.duAcPctSum, context.maxVoltageDropPct, context.maxAcVoltageDropPct),
    ...(context.stabilityLhs !== undefined && context.stabilityRhs !== undefined
      ? [checkC18(context.stabilityLhs, context.stabilityRhs)]
      : []),
    checkC19(context.sitePhases, context.inverterPhases),
    checkC20(context.equipmentHomologationExpiries, context.dossierDate),
    checkC21(context.inverterStegApproved),
    checkC22(context.companyAccreditationValidTo, context.dossierDate),
  ];
}
