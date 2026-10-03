import type { PvModuleInput } from './types';
import { vocAtTmin } from './module-electrical';

/** x-rules.derived NC_MAX_NO_FUSE: floor(1 + M.irmA / M.iscA) */
export function ncMaxNoFuse(module: PvModuleInput): number {
  return Math.floor(1 + module.irmA / module.iscA);
}

/**
 * x-rules.derived DC_FUSE_REQUIRED: Np > NC_MAX_NO_FUSE (per MPPT).
 * Strict inequality — Np exactly equal to NC_MAX_NO_FUSE does NOT require a fuse.
 */
export function dcFuseRequired(module: PvModuleInput, np: number): boolean {
  return np > ncMaxNoFuse(module);
}

/** x-rules.derived STRING_VOC_TMIN: Ns * VOC_TMIN */
export function stringVocTmin(module: PvModuleInput, ns: number, tMinC: number): number {
  return ns * vocAtTmin(module, tMinC);
}

/** x-rules.derived STRING_VMP_STC: Ns * M.vmpV */
export function stringVmpStc(module: PvModuleInput, ns: number): number {
  return ns * module.vmpV;
}

/** x-rules.derived ISC_FIELD_DESIGN: 1.25 * M.iscA * Np * (1 + bifacialGainPct/100) */
export function iscFieldDesign(module: PvModuleInput, np: number): number {
  const bifacialGain = module.bifacialGainPct ?? 0;
  return 1.25 * module.iscA * np * (1 + bifacialGain / 100);
}
