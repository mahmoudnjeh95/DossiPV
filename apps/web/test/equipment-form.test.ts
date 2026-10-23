import { describe, it, expect } from 'vitest';
import { readEquipmentForm } from '../lib/equipment-form';

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [key, value] of Object.entries(values)) {
    f.set(key, value);
  }
  return f;
}

const MODULE = {
  brand: 'LONGi', model: 'LR7-72HGD-620M', pmaxW: '620', vmpV: '46.5', impA: '13.33', vocV: '55.9', iscA: '13.92',
  tempCoeffVocPct: '-0.25', tempCoeffIscPct: '0.045', tempCoeffPmaxPct: '-0.28', irmA: '25', maxSystemVoltageV: '1500',
  lengthMm: '2278', widthMm: '1134', weightKg: '33.5',
};

const INVERTER = {
  brand: 'Huawei', model: 'SUN2000-5KTL-L1', phases: '1', pacW: '5000', sacVA: '5500', vdcMaxV: '600', mpptMinV: '90',
  mpptMaxV: '560', startUpV: '100', mpptCount: '2', inputsPerMppt: '1', idcMaxPerMpptA: '12.5', iscMaxPerMpptA: '18',
  vacNomV: '230', iacMaxA: '25', stegApproved: 'on',
};

describe('readEquipmentForm', () => {
  it('reads a PV module, optional fields empty as null and the bifacial box unchecked', () => {
    const result = readEquipmentForm('PV_MODULE', form({ ...MODULE, tempCoeffVmpPct: '', noctC: '' }));
    expect(result).toMatchObject({
      ok: true,
      sections: null,
      data: { brand: 'LONGi', pmaxW: 620, vocV: 55.9, tempCoeffVmpPct: null, noctC: null, bifacial: false },
    });
  });

  it('collects every missing or invalid value at once', () => {
    const result = readEquipmentForm('PV_MODULE', form({ ...MODULE, pmaxW: '', iscA: 'abc', weightKg: '0' }));
    expect(result.ok).toBe(false);
    const error = result.ok ? '' : result.error;
    expect(error).toContain('Puissance Pmax : valeur numérique obligatoire.');
    expect(error).toContain('Courant Isc : valeur numérique obligatoire.');
    expect(error).toContain('Poids : doit être > 0.');
  });

  it('refuses a module whose Vmp is not below Voc', () => {
    const result = readEquipmentForm('PV_MODULE', form({ ...MODULE, vmpV: '56' }));
    expect(result).toEqual({ ok: false, error: 'La tension Vmp doit être inférieure à la tension Voc.' });
  });

  it('reads an inverter declared STEG approved', () => {
    const result = readEquipmentForm('INVERTER', form(INVERTER));
    expect(result).toMatchObject({
      ok: true,
      sections: null,
      data: { phases: 1, pacW: 5000, mpptCount: 2, stegApproved: true, integratedDcSwitch: false, vacRangeV: null },
    });
  });

  it('refuses an inverter on 2 phases or with an MPPT range above its DC maximum', () => {
    expect(readEquipmentForm('INVERTER', form({ ...INVERTER, phases: '2' }))).toEqual({
      ok: false,
      error: 'Phases : 1 (monophasé) ou 3 (triphasé).',
    });
    expect(readEquipmentForm('INVERTER', form({ ...INVERTER, mpptMaxV: '700' }))).toEqual({
      ok: false,
      error: 'La tension MPPT max ne peut pas dépasser la tension DC max.',
    });
  });

  it('reads the homologation date and rejects an invalid one', () => {
    const base = { brand: 'Schneider', model: 'iID 40A', ratedCurrentA: '40', homologationReference: 'REF-1' };
    expect(readEquipmentForm('AC_ISOLATOR', form({ ...base, homologationValidTo: '2027-12-31' }))).toEqual({
      ok: true,
      sections: null,
      data: { brand: 'Schneider', model: 'iID 40A', ratedCurrentA: 40, homologationReference: 'REF-1', homologationValidTo: new Date('2027-12-31T00:00:00.000Z') },
    });
    expect(readEquipmentForm('AC_ISOLATOR', form({ ...base, homologationValidTo: '31/12/2027' }))).toEqual({
      ok: false,
      error: "Fin de validité de l'homologation : date invalide.",
    });
  });

  it('wants both the sensitivity and the type of a differential breaker, or neither', () => {
    const base = { brand: 'Hager', model: 'ADA', ratedCurrentA: '25', curve: 'C' };
    expect(readEquipmentForm('AC_BREAKER', form({ ...base, residualCurrentMA: '30', rcdType: '' }))).toEqual({
      ok: false,
      error: 'Renseignez à la fois la sensibilité (mA) et le type du différentiel, ou aucun des deux.',
    });
    expect(readEquipmentForm('AC_BREAKER', form({ ...base, residualCurrentMA: '30', rcdType: 'A' }))).toMatchObject({
      ok: true,
      sections: null,
      data: { residualCurrentMA: 30, rcdType: 'A', curve: 'C', breakingCapacityKA: null },
    });
    expect(readEquipmentForm('AC_BREAKER', form({ ...base, rcdType: 'X' })).ok).toBe(false);
  });

  it('reads the cable sections and requires at least one valid section', () => {
    const base = { brand: 'Nexans', model: 'H1Z2Z2-K', usage: 'DC_SOLAR', conductor: 'Cuivre', insulation: 'XLPE' };
    const sections = JSON.stringify([{ sectionMm2: 6, izA: 70, izReferenceMethod: ' C ' }]);
    expect(readEquipmentForm('CABLE', form({ ...base, sections }))).toMatchObject({
      ok: true,
      sections: [{ sectionMm2: 6, izA: 70, izReferenceMethod: 'C' }],
      data: { usage: 'DC_SOLAR', standard: null },
    });
    for (const bad of ['[]', 'not json', JSON.stringify([{ sectionMm2: -6, izA: 70, izReferenceMethod: 'C' }])]) {
      expect(readEquipmentForm('CABLE', form({ ...base, sections: bad }))).toEqual({
        ok: false,
        error: 'Au moins une section de câble est requise (section, Iz et mode de pose, valeurs positives).',
      });
    }
  });

  it('refuses an unknown SPD side or accessory type', () => {
    const spd = { brand: 'Suntree', model: 'SUP2', side: 'XX', type: '2', poles: '2', ucV: '1000', upKV: '3.6', inKA: '20', imaxKA: '40' };
    expect(readEquipmentForm('SPD', form(spd))).toEqual({ ok: false, error: 'Côté : valeur invalide.' });
    expect(readEquipmentForm('ACCESSORY', form({ brand: 'Stäubli', model: 'MC4', kind: 'ROCKET' }))).toEqual({
      ok: false,
      error: 'Type : valeur invalide.',
    });
  });
});
