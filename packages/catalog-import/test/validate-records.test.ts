import { describe, it, expect } from 'vitest';
import { validatePvModule, validateInverter, type PvModuleRecord, type InverterRecord } from '../src/validate-records';

const goodModule: PvModuleRecord = {
  model: 'LR5-72HTH-585M', pmaxW: 585, vmpV: 44.4, impA: 13.18, vocV: 53.2, iscA: 13.98,
  tempCoeffVocPct: -0.23, tempCoeffIscPct: 0.05, tempCoeffPmaxPct: -0.28, tempCoeffVmpPct: null,
  irmA: 30, maxSystemVoltageV: 1500, bifacial: false, bifacialGainPct: null,
  lengthMm: 2278, widthMm: 1134, weightKg: 27.2, noctC: 45, sourcePages: [1, 2],
};

const goodInverter: InverterRecord = {
  model: 'SUN2000-12KTL-M5', phases: 3, pacW: 12000, sacVA: 13200, vdcMaxV: 1100, mpptMinV: 140,
  mpptMaxV: 980, startUpV: 200, mpptCount: 2, inputsPerMppt: 2, idcMaxPerMpptA: 30, iscMaxPerMpptA: 40,
  vacNomV: 400, vacRangeV: '320-460', iacMaxA: 20.2, integratedDcSwitch: true, sourcePages: [2],
};

describe('validatePvModule', () => {
  it('accepts a coherent datasheet record', () => {
    expect(validatePvModule(goodModule)).toEqual({ errors: [], warnings: [] });
  });

  it('flags missing required values and physically impossible ones', () => {
    const result = validatePvModule({ ...goodModule, irmA: null, vmpV: 54, tempCoeffVocPct: -0.5 });
    expect(result.errors).toEqual([
      'irmA manquant sur la fiche.',
      'Vmp (54) doit être inférieur à Voc (53.2).',
      'Pmax (585) ≠ Vmp × Imp (711.7) à plus de 3 %.',
      'Coefficient Voc (-0.5 %/°C) hors de la plage -0.35…-0.2.',
    ]);
  });
});

describe('validateInverter', () => {
  const listing = { manufacturer: 'HUAWEI', brand: 'HUAWEI', model: 'SUN2000-12KTL-M5', acPowerW: 12000, acceptedUntil: '2028-05-11' };

  it('accepts a coherent record matching the STEG power', () => {
    expect(validateInverter(goodInverter, listing)).toEqual({ errors: [], warnings: [] });
  });

  it('rejects an MPPT range above the DC maximum and a power that differs from the STEG list', () => {
    const result = validateInverter({ ...goodInverter, mpptMaxV: 1200, pacW: 10000 }, listing);
    expect(result.errors).toEqual([
      'Plage MPPT max (1200 V) au-dessus de la tension DC max (1100 V).',
      'Puissance AC (10000 W) différente de la liste STEG (12000 W).',
    ]);
  });
});
