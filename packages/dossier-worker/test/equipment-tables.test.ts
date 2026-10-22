import { describe, it, expect } from 'vitest';
import { runEngine } from '@dossipv/engine';
import { buildEquipmentTables } from '../src/equipment-tables';
import type { WorkerJobSnapshot } from '../src/job-snapshot';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';

const engineInput = { ...habibKhedhiraFixture, subscribedPowerKVA: 7, rcd: { residualCurrentMA: 30, rcdType: 'A' as const } };
const engineResult = runEngine(engineInput);

const module = {
  brand: 'AE Solar',
  model: 'AE450MC-144',
  datasheetFileId: 'ds-module',
  homologationFileId: null,
  pmaxW: 450,
  vmpV: 41.5,
  impA: 10.85,
  vocV: 49.9,
  iscA: 11.5,
  tempCoeffVocPct: -0.26,
  tempCoeffIscPct: 0.048,
  tempCoeffPmaxPct: -0.35,
  irmA: 20,
  maxSystemVoltageV: 1500,
  lengthMm: 2094,
  widthMm: 1038,
  weightKg: 24.5,
};

const inverter = {
  brand: 'DEYE',
  model: 'SUN-2.2K-G04P1-EU-AM1',
  datasheetFileId: 'ds-inverter',
  homologationFileId: null,
  homologationValidTo: '2027-05-30T00:00:00.000Z',
  stegApproved: true,
  pacW: 2200,
  sacVA: 2200,
  vdcMaxV: 500,
  mpptMinV: 100,
  mpptMaxV: 425,
  startUpV: 120,
  mpptCount: 2,
  inputsPerMppt: 1,
  idcMaxPerMpptA: 16,
  iscMaxPerMpptA: 20,
  vacNomV: 230,
  vacRangeV: '180 – 270',
  iacMaxA: 10,
};

function snapshot(overrides: Partial<WorkerJobSnapshot> = {}): WorkerJobSnapshot {
  return {
    engineInput,
    projectMeta: {},
    arrayConfig: { module, inverters: [{ inverter, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }] },
    protections: {
      dcSwitch: { brand: 'ZJ BENY', model: 'BB1H-63', datasheetFileId: 'ds-dcsw', poles: 2 },
      dcSpd: { brand: 'Citel', model: 'DS60VGPV', datasheetFileId: 'ds-dcspd' },
      dcFuse: null,
      acBreaker: { brand: 'Hager', model: 'RCBO', datasheetFileId: 'ds-rcbo', ratedCurrentA: 16, curve: 'C', breakingCapacityKA: 6, residualCurrentMA: 30, rcdType: 'A' },
      acSpd: { brand: 'Citel', model: 'DS250', datasheetFileId: 'ds-acspd', inKA: 20 },
      acIsolator: null,
    },
    cableRuns: [
      { label: 'DC', circuitType: 'DC', sectionMm2: 6, lengthM: 20, installMethod: 'X', cable: { brand: 'Helukabel', model: 'H1Z2Z2-K', datasheetFileId: 'ds-dccable' } },
      { label: 'AC', circuitType: 'AC', sectionMm2: 4, lengthM: 10, installMethod: 'X' },
    ],
    earthing: null,
    cablingConfig: null,
    ...overrides,
  } as unknown as WorkerJobSnapshot;
}

const tables = (snap: WorkerJobSnapshot, hasStructureAttestation = false): ReturnType<typeof buildEquipmentTables> =>
  buildEquipmentTables({ snapshot: snap, engineInput, engineResult, hasStructureAttestation });

describe('buildEquipmentTables', () => {
  it("numbers the differential breaker's row with annex 18 and prints — for unused equipment", () => {
    const { equipmentRows } = tables(snapshot());
    const breaker = equipmentRows.find((row) => row.designation === 'Disjoncteur différentiel AC')!;
    expect(breaker).toEqual({ designation: 'Disjoncteur différentiel AC', quantity: '1', brand: 'Hager', reference: 'RCBO', annex: '18' });
    const isolator = equipmentRows.find((row) => row.designation === 'Interrupteur-sectionneur AC')!;
    expect(isolator).toEqual({ designation: 'Interrupteur-sectionneur AC', quantity: '—', brand: '—', reference: '—', annex: '—' });
    expect(equipmentRows.find((row) => row.designation === 'Fusible DC')!.annex).toBe('—');
  });

  it('lists the modules with their count and annex 11, and the cables with their length', () => {
    const { equipmentRows } = tables(snapshot());
    expect(equipmentRows[0]).toEqual({ designation: 'Modules photovoltaïques', quantity: '5', brand: 'AE Solar', reference: 'AE450MC-144', annex: '11' });
    expect(equipmentRows.find((row) => row.designation === 'Câble DC')).toMatchObject({ quantity: '20 m', annex: '20' });
    // The AC run has no catalog cable.
    expect(equipmentRows.find((row) => row.designation === 'Câble AC')!.annex).toBe('—');
  });

  it('lists annexes N°1 to N°10 and marks the ones without a document', () => {
    const { documentationRows } = tables(snapshot());
    expect(documentationRows).toHaveLength(10);
    expect(documentationRows[0]).toEqual({ designation: 'N°1 — Dossier administratif', annex: '1' });
    expect(documentationRows.find((row) => row.designation.startsWith('N°3'))!.annex).toBe('—');
    expect(tables(snapshot(), true).documentationRows.find((row) => row.designation.startsWith('N°3'))!.annex).toBe('3');
    expect(documentationRows.find((row) => row.designation.startsWith('N°10'))!.annex).toBe('10');
  });

  it('prints the module characteristics with the temperature coefficients in %/°C', () => {
    const rows = Object.fromEntries(tables(snapshot()).moduleSpecRows.map((row) => [row.label, row.value]));
    expect(rows['Coefficient de température Voc (β)']).toBe('-0,26 %/°C');
    expect(rows['Coefficient de température Isc (α)']).toBe('0,05 %/°C');
    expect(rows['Courant inverse max (IRM)']).toBe('20 A');
    expect(rows['Dimensions']).toBe('2 094 × 1 038 mm');
    expect(rows['Masse']).toBe('24,5 kg');
  });

  it('prints one characteristics table per inverter with the STEG homologation validity', () => {
    const { inverterSpecTables } = tables(snapshot());
    expect(inverterSpecTables).toHaveLength(1);
    const rows = Object.fromEntries(inverterSpecTables[0]!.rows.map((row) => [row.label, row.value]));
    expect(rows['Plage MPPT']).toBe('100 – 425 V');
    expect(rows['Plage de tension AC']).toBe('180 – 270 V');
    expect(rows['Homologation STEG']).toBe("Oui, valable jusqu'au 30/05/2027");
  });

  it('prints the device ratings, the 30 mA breaker included', () => {
    const { deviceRatingRows } = tables(snapshot());
    const byDevice = Object.fromEntries(deviceRatingRows.map((row) => [row.device, row.ratings]));
    expect(byDevice['Interrupteur-sectionneur DC']).toContain('2 pôles');
    expect(byDevice['Disjoncteur différentiel AC']).toBe(`2 pôles · In ${engineInput.acBreaker.ratedCurrentA} A · courbe C · Icn 6 kA · 30 mA type A`);
    expect(byDevice['Parafoudre AC']).toContain('In 20 kA');
    expect(byDevice['Paratonnerre']).toBe('Paratonnerre sur le site : non');
    expect(byDevice['Fusible DC']).toBeUndefined();
  });
});
