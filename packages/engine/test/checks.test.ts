import { describe, it, expect } from 'vitest';
import {
  checkC01,
  checkC02,
  checkC03,
  checkC04,
  checkC05,
  checkC06,
  checkC07,
  checkC08,
  checkC09,
  checkC10,
  checkC11,
  checkC12,
  checkC13,
  checkC14,
  checkC15,
  checkC16,
  checkC17,
  checkC18,
  checkC19,
  checkC20,
  checkC21,
  checkC22,
  runAllChecks,
  type ChecksContext,
} from '../src/checks';

describe('C01 Ns <= NS_MAX (BLOCK)', () => {
  it('passes when Ns is within the max', () => {
    expect(checkC01(9, 9).pass).toBe(true);
    expect(checkC01(9, 9).level).toBe('BLOCK');
  });
  it('fails when Ns exceeds the max', () => {
    expect(checkC01(10, 9).pass).toBe(false);
  });
});

describe('C02 Ns >= NS_MIN (BLOCK)', () => {
  it('passes at the boundary', () => {
    expect(checkC02(3, 3).pass).toBe(true);
  });
  it('fails below the minimum', () => {
    expect(checkC02(2, 3).pass).toBe(false);
  });
});

describe('C03 Ns <= NS_OPT_MAX (WARN)', () => {
  it('is a WARN-level check', () => {
    expect(checkC03(9, 10).level).toBe('WARN');
  });
  it('fails when Ns exceeds the optimal max', () => {
    expect(checkC03(11, 10).pass).toBe(false);
  });
});

describe('C04 Np <= NP_MAX (BLOCK)', () => {
  it('fails when Np exceeds max', () => {
    expect(checkC04(2, 1).pass).toBe(false);
  });
});

describe('C05 Np <= NP_OPT (WARN)', () => {
  it('passes at the boundary', () => {
    expect(checkC05(1, 1).pass).toBe(true);
    expect(checkC05(1, 1).level).toBe('WARN');
  });
});

describe('C06 0.9 <= POWER_RATIO <= 1.3 (BLOCK)', () => {
  it('passes inside the range', () => {
    expect(checkC06(1.03).pass).toBe(true);
  });
  it('fails below the range', () => {
    expect(checkC06(0.85).pass).toBe(false);
  });
  it('fails above the range', () => {
    expect(checkC06(1.4).pass).toBe(false);
  });
});

describe('C07 STRING_VOC_TMIN <= maxSystemVoltageV (BLOCK)', () => {
  it('fails when string Voc exceeds the module system voltage limit', () => {
    expect(checkC07(1600, 1500).pass).toBe(false);
  });
});

describe('C08 fuse compound condition (BLOCK)', () => {
  it('fails when fuse is required but not set', () => {
    const result = checkC08({
      fuseRequired: true,
      fuseSet: false,
      fuseRatedCurrentA: null,
      fuseRatedVoltageV: null,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(result.pass).toBe(false);
  });

  it('fails when fuse is set but under the lower bound (1.1*1.25*iscA)', () => {
    const result = checkC08({
      fuseRequired: true,
      fuseSet: true,
      fuseRatedCurrentA: 15,
      fuseRatedVoltageV: 600,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(result.pass).toBe(false);
  });

  it('fails when fuse voltage rating is below STRING_VOC_TMIN', () => {
    const result = checkC08({
      fuseRequired: true,
      fuseSet: true,
      fuseRatedCurrentA: 20,
      fuseRatedVoltageV: 250,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(result.pass).toBe(false);
  });

  it('passes when fuse is correctly rated and fuse is not required at all', () => {
    const notRequired = checkC08({
      fuseRequired: false,
      fuseSet: false,
      fuseRatedCurrentA: null,
      fuseRatedVoltageV: null,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(notRequired.pass).toBe(true);

    const correctlyRated = checkC08({
      fuseRequired: true,
      fuseSet: true,
      fuseRatedCurrentA: 20,
      fuseRatedVoltageV: 600,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(correctlyRated.pass).toBe(true);
  });
});

describe('C09 DC switch voltage/current rating (BLOCK)', () => {
  it('fails when switch current rating is below field design current', () => {
    expect(checkC09(600, 300, 15, 17).pass).toBe(false);
  });
});

describe('C10 DC SPD sizing (BLOCK)', () => {
  it('passes when Uc, In, and Iscpv all meet their minimums', () => {
    const result = checkC10(700, 9, 50, 10, 0.05, 17.4);
    expect(result.level).toBe('BLOCK');
    expect(result.pass).toBe(true);
  });
  it('fails when Uc is below 1.2*Ns*vocV', () => {
    expect(checkC10(400, 9, 50, 10, 0.05, 17.4).pass).toBe(false);
  });
  it('fails when In is below 5kA', () => {
    expect(checkC10(700, 9, 50, 4, 0.05, 17.4).pass).toBe(false);
  });
  it('fails when Iscpv*1000 is below ISC_FIELD_DESIGN', () => {
    expect(checkC10(700, 9, 50, 10, 0.01, 17.4).pass).toBe(false);
  });
});

describe('C11 SPD protection level vs equipment withstand (BLOCK)', () => {
  it('passes when Up is below 0.8x withstand at <=10m distance', () => {
    expect(checkC11(2.0, 4, 1).pass).toBe(true);
  });
  it('fails when Up is at or above 0.8x withstand at <=10m distance', () => {
    expect(checkC11(3.5, 4, 1).pass).toBe(false);
  });
  it('fails when Up is at or above 0.5x withstand beyond 10m distance', () => {
    expect(checkC11(2.0, 4, 15).pass).toBe(false);
  });
});

describe('C12 lightning rod requires Type 1 SPDs (BLOCK)', () => {
  it('fails when a lightning rod is present but either SPD is not Type 1', () => {
    expect(checkC12(true, 1, 2).pass).toBe(false);
    expect(checkC12(true, 2, 1).pass).toBe(false);
  });
  it('passes when no lightning rod is present regardless of SPD type', () => {
    expect(checkC12(false, 2, 2).pass).toBe(true);
  });
  it('passes when a lightning rod is present and both SPDs are Type 1', () => {
    expect(checkC12(true, 1, 1).pass).toBe(true);
  });
});

describe('C13 AC breaker rating within [Iac inverter, Iz cable] (BLOCK)', () => {
  it('passes when the breaker rating is within range', () => {
    expect(checkC13(16, 20, 25).pass).toBe(true);
  });
  it('fails when the breaker rating is below the inverter Iac max', () => {
    expect(checkC13(16, 14, 25).pass).toBe(false);
  });
  it('fails when the breaker rating exceeds the cable Iz corrected', () => {
    expect(checkC13(16, 30, 25).pass).toBe(false);
  });
});

describe('C14 AC SPD service voltage >= 1.1*230V (BLOCK)', () => {
  it('passes at or above the threshold', () => {
    expect(checkC14(275).pass).toBe(true);
  });
  it('fails below the threshold', () => {
    expect(checkC14(250).pass).toBe(false);
  });
});

describe('C15 AC isolator required for multiple inverters (BLOCK)', () => {
  it('fails when more than one inverter and no isolator is set', () => {
    expect(checkC15(2, false, 0, 0).pass).toBe(false);
  });
  it('fails when isolator current rating does not exceed the sum of inverter currents', () => {
    expect(checkC15(2, true, 30, 32).pass).toBe(false);
  });
  it('passes with a single inverter regardless of isolator presence', () => {
    expect(checkC15(1, false, 0, 0).pass).toBe(true);
  });
});

describe('C16 DC cable ampacity vs field design current (BLOCK)', () => {
  it('passes when Iz corrected meets or exceeds the field design current', () => {
    expect(checkC16(25, 17.4).pass).toBe(true);
  });
  it('fails when Iz corrected is below the field design current', () => {
    expect(checkC16(10, 17.4).pass).toBe(false);
  });
});

describe('C17 voltage drop within allowed limit (BLOCK)', () => {
  it('passes when both DC and AC drop sums are within the limit', () => {
    expect(checkC17(1.2, 0.6, 3).pass).toBe(true);
  });
  it('fails when the DC drop sum exceeds the limit', () => {
    expect(checkC17(3.5, 0.6, 3).pass).toBe(false);
  });
  it('fails when the AC drop sum exceeds the limit', () => {
    expect(checkC17(1.2, 3.5, 3).pass).toBe(false);
  });
});

describe('C18 ballast stability (BLOCK)', () => {
  it('fails when LHS does not exceed RHS', () => {
    expect(checkC18(4000, 4704).pass).toBe(false);
  });
  it('passes when LHS exceeds RHS', () => {
    expect(checkC18(7811.5, 4704).pass).toBe(true);
  });
});

describe('C19 site phases match inverter phases (BLOCK)', () => {
  it('passes when phases match', () => {
    expect(checkC19(1, 1).pass).toBe(true);
    expect(checkC19(3, 3).pass).toBe(true);
  });
  it('fails when phases mismatch', () => {
    expect(checkC19(1, 3).pass).toBe(false);
  });
});

describe('C20 equipment homologation not expired (WARN)', () => {
  it('is a WARN-level check', () => {
    expect(checkC20([], '2026-10-02').level).toBe('WARN');
  });
  it('passes when no homologation is expired (including null entries)', () => {
    expect(checkC20([null, '2027-01-01'], '2026-10-02').pass).toBe(true);
  });
  it('fails when any homologation expired before the dossier date', () => {
    expect(checkC20([null, '2024-01-01'], '2026-10-02').pass).toBe(false);
  });
});

describe('C21 inverter on STEG-approved list (WARN)', () => {
  it('passes when stegApproved is true', () => {
    expect(checkC21(true).pass).toBe(true);
    expect(checkC21(true).level).toBe('WARN');
  });
  it('fails when stegApproved is false or undefined', () => {
    expect(checkC21(false).pass).toBe(false);
    expect(checkC21(undefined).pass).toBe(false);
  });
});

describe('C22 company ANME accreditation not expired (BLOCK)', () => {
  it('fails when accreditation validTo is before the dossier date', () => {
    expect(checkC22('2024-01-01', '2026-10-02').pass).toBe(false);
  });
  it('passes when accreditation validTo is on or after the dossier date', () => {
    expect(checkC22('2027-01-01', '2026-10-02').pass).toBe(true);
  });
});

describe('runAllChecks', () => {
  it('runs all 22 checks and returns one CheckResult per check, in C01..C22 order', () => {
    const context: ChecksContext = buildPassingContext();
    const results = runAllChecks(context);
    expect(results).toHaveLength(22);
    expect(results.map((r) => r.id)).toEqual([
      'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10',
      'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20',
      'C21', 'C22',
    ]);
  });

  it('omits C18 when the stability inputs are absent', () => {
    const { stabilityLhs, stabilityRhs, ...context } = buildPassingContext();
    void stabilityLhs;
    void stabilityRhs;
    const results = runAllChecks(context);
    expect(results).toHaveLength(21);
    expect(results.some((r) => r.id === 'C18')).toBe(false);
  });

  it('a fully valid context passes every check', () => {
    const context: ChecksContext = buildPassingContext();
    const results = runAllChecks(context);
    const failures = results.filter((r) => !r.pass);
    expect(failures).toEqual([]);
  });
});

/** A hand-built context where every one of the 22 checks passes, used to test runAllChecks' wiring. */
function buildPassingContext(): ChecksContext {
  return {
    ns: 9,
    nsMax: 9,
    nsMin: 3,
    nsOptMax: 10,
    np: 1,
    npMax: 1,
    npOpt: 1,
    powerRatio: 1.03,
    stringVocTmin: 547,
    maxSystemVoltageV: 1500,
    fuse: {
      fuseRequired: false,
      fuseSet: false,
      fuseRatedCurrentA: null,
      fuseRatedVoltageV: null,
      lowerBoundA: 0,
      upperBoundA: 0,
      stringVocTmin: 547,
    },
    dcSwitchRatedVoltageV: 600,
    dcSwitchRatedCurrentA: 25,
    iscFieldDesign: 17.4,
    dcSpdUcV: 700,
    dcSpdInKA: 10,
    dcSpdIscpvKA: 0.05,
    spdUpKV: 2.0,
    equipmentImpulseWithstandKV: 4,
    spdToEquipmentDistanceM: 1,
    lightningRod: false,
    dcSpdType: 2,
    acSpdType: 2,
    inverterIacMaxA: 16,
    acBreakerRatedCurrentA: 20,
    acRunIzCorrected: 25,
    acSpdUcV: 275,
    inverterCount: 1,
    acIsolatorSet: false,
    acIsolatorRatedCurrentA: 0,
    sumInverterIacMaxA: 16,
    dcRunIzCorrected: 25,
    duDcPctSum: 1.2,
    duAcPctSum: 0.6,
    maxVoltageDropPct: 3,
    stabilityLhs: 7811.5,
    stabilityRhs: 4704,
    sitePhases: 1,
    inverterPhases: 1,
    equipmentHomologationExpiries: [],
    dossierDate: '2026-10-02',
    inverterStegApproved: true,
    companyAccreditationValidTo: '2027-01-01',
    moduleVocV: 55.9,
  };
}
