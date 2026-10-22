import { describe, it, expect } from 'vitest';
import { buildPlaceholderValues, type PlaceholderSourceContext } from '../src/placeholder-map';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';
import { runEngine } from '@dossipv/engine';

function makeContext(): PlaceholderSourceContext {
  const engineResult = runEngine(habibKhedhiraFixture);
  return {
    derived: engineResult.derived,
    engineInput: habibKhedhiraFixture,
    representativeMppt: habibKhedhiraFixture.array[0]!.mppts[0]!,
    projectMeta: {
      moduleBrandModel: 'LONGi LR7-72HGD-620M',
      inverterBrandModel: 'Sofar 1-4KTL2-G3',
      gridType: 'BT',
      mountingType: 'FLAT_ROOF_BALLAST',
      structureMaterial: 'Aluminium',
      earthRodCount: 3,
      earthingMode: 'DEDICATED_ROD' as const,
      buildingType: 'HOUSE' as const,
      floors: 1,
      protections: {
        dcSwitch: 'ZJ BENY BB1H-63',
        dcSpd: 'Generic DC-SPD-1',
        dcFuse: null,
        acBreaker: 'Generic AC-BRK-16',
        acSpd: 'Generic AC-SPD-1',
      },
      acBreakerFunction: 'disjoncteur différentiel 16 A, 30 mA type A',
    },
  };
}

describe('buildPlaceholderValues', () => {
  it('maps the protection references and the AC breaker function from the project meta', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.AC_BREAKER_FUNCTION).toBe('disjoncteur différentiel 16 A, 30 mA type A');
    expect(values.AC_BREAKER_REF).toBe('Generic AC-BRK-16');
    expect(values.DC_SWITCH_REF).toBe('ZJ BENY BB1H-63');
    expect(values.DC_SPD_REF).toBe('Generic DC-SPD-1');
    expect(values.AC_SPD_REF).toBe('Generic AC-SPD-1');
    expect(values.MODULE_REF).toBe('LONGi LR7-72HGD-620M');
    expect(values.INVERTER_REF).toBe('Sofar 1-4KTL2-G3');
  });

  it('shows an em dash for the DC fuse reference when there is no fuse', () => {
    expect(buildPlaceholderValues(makeContext()).DC_FUSE_REF).toBe('—');
    const withFuse = makeContext();
    withFuse.projectMeta.protections.dcFuse = 'Generic FUSE-15';
    expect(buildPlaceholderValues(withFuse).DC_FUSE_REF).toBe('Generic FUSE-15');
  });

  it('formats a decimals:0 numeric placeholder with no decimal point and a unit suffix', () => {
    const values = buildPlaceholderValues(makeContext());
    // habib-khedhira: 5 modules * 620W = 3100 W, decimals:0, unit "W".
    // fr-FR's Intl.NumberFormat uses U+202F (narrow no-break space) as the thousands
    // separator; the unit-prefix space inserted by formatValue() is U+00A0.
    expect(values.P_DC_W).toBe('3 100 W');
  });

  it('formats a decimal numeric placeholder with a comma separator and a unit suffix', () => {
    const values = buildPlaceholderValues(makeContext());
    // STRING_VOC_TMIN with decimals:1, unit "V" — exact value asserted against the engine's
    // own derived output so this test tracks the formula, not a hand-computed duplicate.
    const engineResult = runEngine(habibKhedhiraFixture);
    const expectedNumber = engineResult.derived.STRING_VOC_TMIN!;
    const expectedFormatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(expectedNumber);
    expect(values.STRING_VOC_TMIN).toBe(`${expectedFormatted} V`);
  });

  it('formats an integer placeholder with no decimal point and no unit', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.MODULE_COUNT).toBe('5');
  });

  it('passes a string-valued placeholder through unchanged', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.NORME_CABLAGE).toBe('NF C 15-100');
  });

  it('reads NS and NP from the representative MPPT, not from derived', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.NS).toBe('5');
    expect(values.NP).toBe('1');
  });

  it('reads INVERTER_COUNT from the engine input array length', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.INVERTER_COUNT).toBe('1');
  });

  it('no longer offers a rod count placeholder', () => {
    expect(buildPlaceholderValues(makeContext())).not.toHaveProperty('EARTH_ROD_COUNT');
  });

  it('formats STRING_VMP_STC with decimals:1 and unit "V", tracking the engine formula', () => {
    const values = buildPlaceholderValues(makeContext());
    const engineResult = runEngine(habibKhedhiraFixture);
    const expectedNumber = engineResult.derived.STRING_VMP_STC!;
    const expectedFormatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(expectedNumber);
    expect(values.STRING_VMP_STC).toBe(`${expectedFormatted} V`);
  });

  it('formats DU_DC_PCT and DU_AC_PCT with decimals:2 and unit "%", tracking the engine formula', () => {
    const values = buildPlaceholderValues(makeContext());
    const engineResult = runEngine(habibKhedhiraFixture);
    for (const key of ['DU_DC_PCT', 'DU_AC_PCT'] as const) {
      const expectedNumber = engineResult.derived[key]!;
      const expectedFormatted = new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(expectedNumber);
      expect(values[key]).toBe(`${expectedFormatted} %`);
    }
  });
});
