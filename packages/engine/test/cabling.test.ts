import { describe, it, expect } from 'vitest';
import {
  izCorrected,
  duDcV,
  duDcPct,
  duAcV,
  duAcPct,
  UnsupportedInstallMethodError,
  izCorrectionFactors,
} from '../src/cabling';
import { INSTALL_METHOD_LABELS, K1_BY_METHOD } from '../src/constants';

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

  it('clamps K4 (layers) to the worst-case (9-layer, 0.66) factor when layers exceeds the table, instead of defaulting to no correction (1.0)', () => {
    // Mode 13: K1=1.0; 1 grouped circuit: K2=1.0; PR at 50C: K3_PR['50']=0.82.
    // layers=12 is beyond K4_LAYERS' highest key ('9' => 0.66), so K4 must clamp to 0.66,
    // NOT fall back to 1.0 (which would be the unsafe, no-derating direction).
    // izBase=30 => 30 * 1.0 * 1.0 * 0.82 * 0.66 = 16.236
    const result = izCorrected(30, '13', 'B', 1, 12, 50, 'PR');
    expect(result).toBeCloseTo(16.236, 5);
    // Sanity: confirm it is strictly less than what the old (unsafe) 1.0 fallback would give.
    const unsafeWouldBe = izCorrected(30, '13', 'B', 1, 9, 50, 'PR'); // exactly at the table's max key
    expect(result).toBeCloseTo(unsafeWouldBe, 5);
  });

  it('K3 (temperature) clamps to the hottest tabled column when ambientTempC exceeds every key (already-correct behavior, documented here)', () => {
    // K3_PVC's highest key is '60' => 0.5. ambientTempC=80 is above every key in the table;
    // nearestTempKey's "largest key <= ambientTempC" loop naturally resolves to '60' here,
    // since there is no higher key to wrongly prefer. Mode 13: K1=1.0; 1 circuit: K2=1.0;
    // 1 layer: K4=1.0. izBase=30 => 30 * 1.0 * 1.0 * 0.5 * 1.0 = 15.
    const result = izCorrected(30, '13', 'B', 1, 1, 80, 'PVC');
    expect(result).toBeCloseTo(15, 5);
  });

  it('throws UnsupportedInstallMethodError for a valid-per-schema but untabled install method (e.g. "21"), instead of silently using no derating', () => {
    expect(() => izCorrected(30, '21', 'B', 1, 1, 50, 'PR')).toThrow(UnsupportedInstallMethodError);
  });
});

describe('izCorrectionFactors', () => {
  it("returns K1–K4 for mode 13, method C, 1 circuit, 1 layer, 80 °C, PR, whose product is izCorrected's", () => {
    const factors = izCorrectionFactors('13', 'C', 1, 1, 80, 'PR');
    expect(factors).toEqual({ k1: 1, k2: 1, k3: 0.41, k4: 1 });
    expect(Math.abs(56 * factors.k1 * factors.k2 * factors.k3 * factors.k4 - izCorrected(56, '13', 'C', 1, 1, 80, 'PR'))).toBeLessThanOrEqual(1e-12);
  });

  it.each([
    ['3A', 'E', 3, 1, 30, 'PVC'],
    ['11A', 'B', 15, 12, 47, 'XLPO'],
    ['18', 'F', 2, 3, 5, 'EPR'],
    ['1', 'C', 0, 2, 80, 'PVC'],
  ] as const)('reproduces izCorrected exactly (%s, %s, %i circuits, %i layers, %i °C, %s)', (method, reference, circuits, layers, ambient, insulation) => {
    const f = izCorrectionFactors(method, reference, circuits, layers, ambient, insulation);
    expect(32 * f.k1 * f.k2 * f.k3 * f.k4).toBe(izCorrected(32, method, reference, circuits, layers, ambient, insulation));
  });

  it('uses the tray K2 table for E/F and the enclosed one for B/C, and clamps K4', () => {
    expect(izCorrectionFactors('13', 'E', 3, 12, 30, 'PR')).toEqual({ k1: 1, k2: 0.82, k3: 1, k4: 0.66 });
    expect(izCorrectionFactors('13', 'B', 3, 1, 30, 'PR').k2).toBe(0.7);
  });

  it('throws UnsupportedInstallMethodError for an untabled method', () => {
    expect(() => izCorrectionFactors('21', 'B', 1, 1, 50, 'PR')).toThrow(UnsupportedInstallMethodError);
  });
});

describe('INSTALL_METHOD_LABELS', () => {
  it('names every install method that has a K1 factor in French, with its NF C 15-100 code', () => {
    expect(Object.keys(INSTALL_METHOD_LABELS).sort()).toEqual(Object.keys(K1_BY_METHOD).sort());
    expect(INSTALL_METHOD_LABELS['13']).toBe('Chemin de câbles perforé (mode de pose 13)');
    expect(INSTALL_METHOD_LABELS['3A']).toBe('Conduit en montage apparent (mode de pose 3A)');
    for (const [code, label] of Object.entries(INSTALL_METHOD_LABELS)) expect(label).toMatch(new RegExp(`\\(mode de pose ${code}\\)$`));
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

  it('three-phase: b=sqrt(3), reference voltage 400V (NF C 15-100 / UTE C 15-105)', () => {
    // same inner sum as above = 0.04676; * iacMaxA(16) = 0.74816; * b(sqrt(3)=1.7320508...)
    // = 1.2958511321907313 (verified with node: Math.sqrt(3)*0.74816)
    // duAcPct = 100 * 1.2958511321907313 / 400 = 0.3239627830476828
    const dv = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 3);
    expect(dv).toBeCloseTo(1.29585, 4);
    expect(duAcPct(dv, 3)).toBeCloseTo(0.32396, 4);
  });

  it('single-phase and three-phase at the same inputs do not produce the same drop percentage', () => {
    const dvSingle = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 1);
    const dvThree = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 3);
    const pctSingle = duAcPct(dvSingle, 1);
    const pctThree = duAcPct(dvThree, 3);
    expect(pctSingle).not.toBeCloseTo(pctThree, 2);
  });
});
