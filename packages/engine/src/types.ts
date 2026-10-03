/**
 * Input/output types for the DossiPV calculation engine.
 * Field names mirror `pv_dossier_input_schema.json`'s $defs (PvModule, Inverter, ...)
 * so engine callers can pass schema-validated data through without remapping.
 */

export interface PvModuleInput {
  pmaxW: number;
  vmpV: number;
  impA: number;
  vocV: number;
  iscA: number;
  /** %/°C, always <= 0. Schema: PvModule.tempCoeffVocPct */
  tempCoeffVocPct: number;
  /** %/°C, always >= 0. Schema: PvModule.tempCoeffIscPct */
  tempCoeffIscPct: number;
  /** %/°C, always <= 0. Schema: PvModule.tempCoeffPmaxPct */
  tempCoeffPmaxPct: number;
  /**
   * %/°C, optional. Schema: PvModule.tempCoeffVmpPct.
   * When absent, VMP_TMIN/VMP_TMAX fall back to tempCoeffPmaxPct — never tempCoeffVocPct.
   */
  tempCoeffVmpPct?: number;
  irmA: number;
  maxSystemVoltageV: number;
  bifacial?: boolean;
  bifacialGainPct?: number;
  lengthMm: number;
  widthMm: number;
  weightKg: number;
  /** Nominal Operating Cell Temperature, °C. Optional — defaults to 45 (standard crystalline-
   * silicon assumption) in the engine's own cell-temperature calculation when absent. */
  noctC?: number;
}

export interface InverterInput {
  phases: 1 | 3;
  pacW: number;
  sacVA: number;
  vdcMaxV: number;
  mpptMinV: number;
  mpptMaxV: number;
  startUpV: number;
  mpptCount: number;
  inputsPerMppt: number;
  idcMaxPerMpptA: number;
  iscMaxPerMpptA: number;
  vacNomV: number;
  iacMaxA: number;
  stegApproved?: boolean;
}

export interface MpptConfig {
  stringsInParallel: number;
  modulesPerString: number;
}

export interface InverterArrayEntry {
  inverter: InverterInput;
  mppts: MpptConfig[];
}

export interface CheckResult {
  id: string;
  level: 'BLOCK' | 'WARN';
  pass: boolean;
  message: string;
}

export interface EngineResult {
  derived: Record<string, number>;
  checks: CheckResult[];
  hasBlockingFailure: boolean;
}
