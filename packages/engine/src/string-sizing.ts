import type { PvModuleInput, InverterInput, InverterArrayEntry } from './types';
import { vocAtTmin, vmpAtTmin, vmpAtTmax, iscAtTmax, impAtTmax } from './module-electrical';

/** x-rules.derived NS_MAX: floor(INV.vdcMaxV / VOC_TMIN) */
export function nsMax(module: PvModuleInput, inverter: InverterInput, tMinC: number): number {
  return Math.floor(inverter.vdcMaxV / vocAtTmin(module, tMinC));
}

/** x-rules.derived NS_OPT_MAX: floor(INV.mpptMaxV / VMP_TMIN) */
export function nsOptMax(
  module: PvModuleInput,
  inverter: InverterInput,
  tMinC: number,
): number {
  return Math.floor(inverter.mpptMaxV / vmpAtTmin(module, tMinC));
}

/** x-rules.derived NS_MIN: ceil(max(INV.mpptMinV, INV.startUpV) / VMP_TMAX) */
export function nsMin(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number {
  const minVoltage = Math.max(inverter.mpptMinV, inverter.startUpV);
  return Math.ceil(minVoltage / vmpAtTmax(module, tMaxC));
}

/** x-rules.derived NP_MAX: floor(INV.iscMaxPerMpptA / ISC_TMAX) */
export function npMax(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number {
  return Math.floor(inverter.iscMaxPerMpptA / iscAtTmax(module, tMaxC));
}

/** x-rules.derived NP_OPT: floor(INV.idcMaxPerMpptA / IMP_TMAX) */
export function npOpt(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number {
  return Math.floor(inverter.idcMaxPerMpptA / impAtTmax(module, tMaxC));
}

/** Sums Ns * Np across every MPPT of every inverter entry in the array. */
function sumModulesAcrossArray(array: InverterArrayEntry[]): number {
  let total = 0;
  for (const entry of array) {
    for (const mppt of entry.mppts) {
      total += mppt.stringsInParallel * mppt.modulesPerString;
    }
  }
  return total;
}

/** x-rules.derived P_DC_W: sum(Ns x Np over all MPPTs) * M.pmaxW */
export function totalDcPowerW(module: PvModuleInput, array: InverterArrayEntry[]): number {
  return sumModulesAcrossArray(array) * module.pmaxW;
}

/** x-rules.derived MODULE_COUNT: sum(Ns x Np) */
export function totalModuleCount(array: InverterArrayEntry[]): number {
  return sumModulesAcrossArray(array);
}

/** x-rules.derived POWER_RATIO: P_DC_W / sum(INV.pacW) */
export function powerRatio(module: PvModuleInput, array: InverterArrayEntry[]): number {
  const totalPacW = array.reduce((sum, entry) => sum + entry.inverter.pacW, 0);
  return totalDcPowerW(module, array) / totalPacW;
}
