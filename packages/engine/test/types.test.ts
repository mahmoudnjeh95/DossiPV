import { describe, it, expect } from 'vitest';
import type { PvModuleInput, InverterInput, CheckResult, EngineResult } from '../src/types';

describe('types', () => {
  it('PvModuleInput accepts a minimal valid module and omits optional fields', () => {
    const module: PvModuleInput = {
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
    };
    expect(module.tempCoeffVmpPct).toBeUndefined();
  });

  it('InverterInput phases is restricted to 1 or 3', () => {
    const inv: InverterInput = {
      phases: 1,
      pacW: 3000,
      sacVA: 3000,
      vdcMaxV: 550,
      mpptMinV: 90,
      mpptMaxV: 550,
      startUpV: 100,
      mpptCount: 2,
      inputsPerMppt: 2,
      idcMaxPerMpptA: 16,
      iscMaxPerMpptA: 20,
      vacNomV: 230,
      iacMaxA: 16,
    };
    expect(inv.phases).toBe(1);
  });

  it('CheckResult level is restricted to BLOCK or WARN', () => {
    const result: CheckResult = { id: 'C01', level: 'BLOCK', pass: true, message: '' };
    expect(result.level).toBe('BLOCK');
  });

  it('EngineResult shape holds derived values and checks', () => {
    const result: EngineResult = {
      derived: { P_DC_W: 3100 },
      checks: [],
      hasBlockingFailure: false,
    };
    expect(result.derived.P_DC_W).toBe(3100);
  });
});
