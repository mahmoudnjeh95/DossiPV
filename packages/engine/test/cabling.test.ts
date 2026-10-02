import { describe, it, expect } from 'vitest';
import { izCorrected, duDcV, duDcPct, duAcV, duAcPct } from '../src/cabling';

describe('izCorrected', () => {
  it('applies K1 (install method), K2 (grouping), K3 (temp+insulation), K4 (layers) to the base Iz', () => {
    // Mode 13 (DC default): K1 = 1.0
    // 1 grouped circuit, enclosed B/C table index 0: K2 = 1.0
    // PR insulation at 50C ambient: K3_PR['50'] = 0.82
    // 1 layer: K4 = 1.0
    // izBase = 30 => 30 * 1.0 * 1.0 * 0.82 * 1.0 = 24.6
    const result = izCorrected(30, '13', 'B', 1, 1, 50, 'PR');
    expect(result).toBeCloseTo(24.6, 5);
  });

  it('uses the perforated tray K2 table for reference method E/F', () => {
    // 3 grouped circuits (index 2) on perforated tray: K2 = 0.82
    // Mode 3A: K1 = 0.9; PVC at 30C: K3_PVC['30'] = 1.0; 1 layer: K4 = 1.0
    // izBase = 20 => 20 * 0.9 * 0.82 * 1.0 * 1.0 = 14.76
    const result = izCorrected(20, '3A', 'E', 3, 1, 30, 'PVC');
    expect(result).toBeCloseTo(14.76, 5);
  });

  it('treats EPR and XLPO insulation as the PR column (schema note on Cable.insulation)', () => {
    const resultEpr = izCorrected(30, '13', 'B', 1, 1, 50, 'EPR');
    const resultXlpo = izCorrected(30, '13', 'B', 1, 1, 50, 'XLPO');
    const resultPr = izCorrected(30, '13', 'B', 1, 1, 50, 'PR');
    expect(resultEpr).toBeCloseTo(resultPr, 5);
    expect(resultXlpo).toBeCloseTo(resultPr, 5);
  });
});

describe('duDcV and duDcPct', () => {
  it('DU_DC_V = 2 * rho * L / S * impA * NpOnRun (copper)', () => {
    // 2 * 0.02314 * 20 / 6 * 13.33 * 1 = 2.05637466...
    // NOTE: the task brief's worked comment claimed 2.05597, which is arithmetically
    // wrong for the stated formula/inputs (off by ~0.0004, outside toBeCloseTo(_, 4)
    // tolerance of 0.00005). Verified independently with node; using the correct value.
    const result = duDcV('Cu', 20, 6, 13.33, 1);
    expect(result).toBeCloseTo(2.05637, 4);
  });

  it('DU_DC_PCT = 100 * DU_DC_V / STRING_VMP_STC', () => {
    const dv = duDcV('Cu', 20, 6, 13.33, 1);
    // string Vmp = 5 * 46.5 = 232.5; 100 * 2.05637 / 232.5 = 0.884462...
    expect(duDcPct(dv, 232.5)).toBeCloseTo(0.8845, 3);
  });
});

describe('duAcV and duAcPct (phase-dependent b factor and reference voltage)', () => {
  it('single-phase: b=2, reference voltage 230V', () => {
    // b=2; rho*L/S*cosPhi = 0.02314*10/4*0.8 = 0.04628; lambda*L*sinPhi = 0.00008*10*0.6=0.00048
    // sum = 0.04676; * iacMaxA(16) = 0.74816; * b(2) = 1.49632
    const dv = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 1);
    expect(dv).toBeCloseTo(1.49632, 4);
    expect(duAcPct(dv, 1)).toBeCloseTo((100 * 1.49632) / 230, 4);
  });

  it('three-phase: b=1, reference voltage 400V', () => {
    // same inner sum as above = 0.04676; * iacMaxA(16) = 0.74816; * b(1) = 0.74816
    const dv = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 3);
    expect(dv).toBeCloseTo(0.74816, 4);
    expect(duAcPct(dv, 3)).toBeCloseTo((100 * 0.74816) / 400, 4);
  });

  it('single-phase and three-phase at the same inputs do not produce the same drop percentage', () => {
    const dvSingle = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 1);
    const dvThree = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 3);
    const pctSingle = duAcPct(dvSingle, 1);
    const pctThree = duAcPct(dvThree, 3);
    expect(pctSingle).not.toBeCloseTo(pctThree, 2);
  });
});
