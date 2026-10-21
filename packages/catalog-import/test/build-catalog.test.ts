import { describe, it, expect } from 'vitest';
import { buildModuleEntry, buildInverterEntry } from '../src/build-catalog';

const family = { kind: 'PV_MODULE' as const, brand: 'LONGi', url: 'https://example.com/lr5.pdf', models: ['LR5-72HTH-585M'] };
const listing = {
  manufacturer: 'LONGi Green Energy Technology Co.,Ltd', brand: 'LONGi', country: 'Chine', model: 'LR5-72HTH-585M',
  certificationBody: 'TÜV SÜD', certificateReference: 'Z2 099333 0111 REV 08', validUntil: '2028-04-10',
};
const record = {
  model: 'LR5-72HTH-585M', pmaxW: 585, vmpV: 44.4, impA: 13.18, vocV: 53.2, iscA: 13.98, tempCoeffVocPct: -0.23,
  tempCoeffIscPct: 0.05, tempCoeffPmaxPct: -0.28, tempCoeffVmpPct: null, irmA: 30, maxSystemVoltageV: 1500,
  bifacial: false, bifacialGainPct: null, lengthMm: 2278, widthMm: 1134, weightKg: 27.2, noctC: 45, sourcePages: [1],
};

describe('buildModuleEntry', () => {
  it('adds the ANME homologation, the datasheet URL and the validation result', () => {
    expect(buildModuleEntry(record, family, listing)).toMatchObject({
      brand: 'LONGi',
      model: 'LR5-72HTH-585M',
      homologationReference: 'TÜV SÜD Z2 099333 0111 REV 08',
      homologationValidTo: '2028-04-10',
      datasheetSourceUrl: 'https://example.com/lr5.pdf',
      errors: [],
    });
  });
});

describe('buildInverterEntry', () => {
  it('marks the inverter as STEG-approved until the list date and keeps validation errors', () => {
    const entry = buildInverterEntry(
      {
        model: 'X', phases: 1, pacW: 3000, sacVA: 3000, vdcMaxV: 600, mpptMinV: 90, mpptMaxV: 700, startUpV: 100,
        mpptCount: 2, inputsPerMppt: 1, idcMaxPerMpptA: 16, iscMaxPerMpptA: 20, vacNomV: 230, vacRangeV: null,
        iacMaxA: 14.3, integratedDcSwitch: true, sourcePages: [2],
      },
      { ...family, kind: 'INVERTER', brand: 'SOFAR' },
      { manufacturer: 'SOFAR SOLAR', brand: 'SOFAR', model: 'X', acPowerW: 3000, acceptedUntil: '2030-12-25' },
    );
    expect(entry).toMatchObject({ brand: 'SOFAR', stegApproved: true, homologationValidTo: '2030-12-25' });
    expect(entry.errors).toEqual(['Plage MPPT max (700 V) au-dessus de la tension DC max (600 V).']);
  });
});
