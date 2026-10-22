import { describe, it, expect } from 'vitest';
import {
  ANNEX_NUMBERS,
  ANNEX_PHYSICAL_ORDER,
  annexDocumentsFromSnapshot,
  annexStartPages,
  buildAnnexPlan,
  physicalAnnexDocuments,
  type AnnexDocument,
  type AnnexProjectFiles,
} from '../src/annex-plan';
import type { WorkerJobSnapshot } from '../src/job-snapshot';

function snapshot(overrides: Partial<WorkerJobSnapshot> = {}): WorkerJobSnapshot {
  return {
    version: 1,
    projectId: 'project-1',
    companyId: 'company-1',
    tier: 'STANDARD',
    dossierNumber: null,
    dossierDate: null,
    engineInput: {} as WorkerJobSnapshot['engineInput'],
    projectMeta: {} as WorkerJobSnapshot['projectMeta'],
    client: null,
    consumption: null,
    cableRuns: [],
    site: null,
    arrayConfig: null,
    protections: null,
    structure: null,
    earthing: null,
    cablingConfig: null,
    ...overrides,
  };
}

const NO_ANNEXES: AnnexProjectFiles = {
  cinFileId: null,
  commercialRegisterFileId: null,
  stegContractFileId: null,
  lastPaidBillFileId: null,
  moduleAcceptanceFileId: null,
  extraFileIds: [],
};

function fileIds(documents: AnnexDocument[]): string[] {
  return documents.map((d) => (d.source.kind === 'file' ? d.source.fileId : 'fragment'));
}

describe('buildAnnexPlan', () => {
  it('numbers every slot like the reference', () => {
    const plan = buildAnnexPlan([]);

    expect(plan).toHaveLength(25);
    expect(plan.map((e) => e.number)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(plan.find((e) => e.slot === 'RCD')).toMatchObject({ number: 18, title: 'Disjoncteur différentiel', documents: [] });
    expect(plan.find((e) => e.slot === 'CABLE_TRAY')).toMatchObject({ number: 25, title: 'Chemin de câbles' });
    expect(ANNEX_NUMBERS.RCD).toBe(18);
    expect(ANNEX_NUMBERS.CABLE_TRAY).toBe(25);
    expect(new Set(ANNEX_PHYSICAL_ORDER).size).toBe(25);
  });

  it('keeps each slot’s documents in input order and appends them in physical order', () => {
    const a: AnnexDocument = { slot: 'INVERTER_HOMOLOGATION', label: 'liste', source: { kind: 'file', fileId: 'list' } };
    const b: AnnexDocument = { slot: 'MODULE', label: 'm1', source: { kind: 'file', fileId: 'm1' } };
    const c: AnnexDocument = { slot: 'MODULE', label: 'm2', source: { kind: 'file', fileId: 'm2' } };
    const d: AnnexDocument = { slot: 'INVERTER', label: 'inv', source: { kind: 'file', fileId: 'inv' } };

    const plan = buildAnnexPlan([a, b, c, d]);

    expect(plan.find((e) => e.slot === 'MODULE')!.documents).toEqual([b, c]);
    // The reference appends the module and inverter datasheets before the STEG list (N°10).
    expect(physicalAnnexDocuments(plan)).toEqual([b, c, d, a]);
  });
});

describe('annexStartPages', () => {
  it('gives each annex the page of its first readable document, and null when it has none', () => {
    const admin1: AnnexDocument = { slot: 'ADMIN', label: 'a1', source: { kind: 'file', fileId: 'a1' } };
    const admin2: AnnexDocument = { slot: 'ADMIN', label: 'a2', source: { kind: 'file', fileId: 'a2' } };
    const broken: AnnexDocument = { slot: 'STRUCTURE', label: 's', source: { kind: 'file', fileId: 's' } };
    const module: AnnexDocument = { slot: 'MODULE', label: 'm', source: { kind: 'file', fileId: 'm' } };
    const plan = buildAnnexPlan([admin1, admin2, broken, module]);

    const pages = annexStartPages(plan, new Map([[admin1, 2], [admin2, 1], [broken, null], [module, 3]]), 10);

    expect(pages.get('ADMIN')).toBe(10);
    expect(pages.get('STRUCTURE')).toBeNull();
    expect(pages.get('MODULE')).toBe(13);
    expect(pages.get('RCD')).toBeNull();
  });
});

describe('annexDocumentsFromSnapshot', () => {
  it('puts the ANME agreement first in the administrative annex', () => {
    const documents = annexDocumentsFromSnapshot(
      snapshot(),
      { anmeCertificateFileId: 'anme' },
      { cinFileId: 'cin', commercialRegisterFileId: 'rc', stegContractFileId: 'contract', lastPaidBillFileId: 'bill', moduleAcceptanceFileId: null, extraFileIds: ['x1', 'x2'] },
      null,
    );

    const admin = documents.filter((d) => d.slot === 'ADMIN');
    expect(admin.map((d) => d.label)).toEqual([
      "Agrément ANME de l'installateur",
      'Copie de la CIN du titulaire',
      'Registre de commerce',
      "Contrat STEG / attestation d'abonnement",
      'Dernière facture STEG',
      'Pièce complémentaire 1',
      'Pièce complémentaire 2',
    ]);
    expect(fileIds(admin)).toEqual(['anme', 'cin', 'rc', 'contract', 'bill', 'x1', 'x2']);
  });

  it('collects the structure attestation', () => {
    const documents = annexDocumentsFromSnapshot(snapshot(), { anmeCertificateFileId: null }, null, 'structure-file');

    expect(documents).toEqual([
      { slot: 'STRUCTURE', label: 'Attestation de conformité de la structure', source: { kind: 'file', fileId: 'structure-file' } },
    ]);
  });

  it('puts the differential breaker under RCD', () => {
    const documents = annexDocumentsFromSnapshot(
      snapshot({
        protections: {
          acBreaker: { brand: 'Hager', model: 'ADC816F', residualCurrentMA: 30, rcdType: 'A', datasheetFileId: 'rcd-sheet' },
          dcSpd: { brand: 'Citel', model: 'DS50', datasheetFileId: 'dc-spd' },
          acIsolator: null,
        },
      }),
      { anmeCertificateFileId: null },
      null,
      null,
    );

    expect(documents).toEqual([
      { slot: 'DC_SPD', label: 'Fiche technique Citel DS50', source: { kind: 'file', fileId: 'dc-spd' } },
      { slot: 'RCD', label: 'Fiche technique Hager ADC816F', source: { kind: 'file', fileId: 'rcd-sheet' } },
    ]);
  });

  it('puts a plain breaker under AC_MAIN_BREAKER', () => {
    const documents = annexDocumentsFromSnapshot(
      snapshot({ protections: { acBreaker: { brand: 'Hager', model: 'MCN116', residualCurrentMA: null, datasheetFileId: 'breaker' } } }),
      { anmeCertificateFileId: null },
      null,
      null,
    );

    expect(documents.map((d) => d.slot)).toEqual(['AC_MAIN_BREAKER']);
  });

  it('lists a shared file id once', () => {
    const cable = { brand: 'Generic', model: 'H1Z2Z2-K', usage: 'DC_SOLAR', datasheetFileId: 'cable-sheet' };
    const documents = annexDocumentsFromSnapshot(
      snapshot({
        cableRuns: [
          { label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13', circuitType: 'DC', cable },
          { label: 'DC-2', sectionMm2: 6, lengthM: 15, installMethod: '13', circuitType: 'DC', cable },
          { label: 'AC', sectionMm2: 10, lengthM: 15, installMethod: '13', circuitType: 'AC', cable: { brand: 'Nexans', model: 'U-1000 R2V', usage: 'AC', datasheetFileId: 'ac-sheet' } },
        ],
        earthing: { rodCount: 1, rodLengthM: 1.5, mainEarthSectionMm2: 16, frameEarthSectionMm2: 6, earthToPitSectionMm2: 16, targetResistanceOhm: 25, earthCable: { brand: 'Nexans', model: 'H07V-U', datasheetFileId: 'earth-sheet' }, distributionBlock: { brand: 'Legrand', model: 'DB', datasheetFileId: 'shared-accessory' } },
        cablingConfig: { connector: { brand: 'Stäubli', model: 'MC4', datasheetFileId: 'mc4' }, cableTray: { brand: 'Legrand', model: 'Tray', datasheetFileId: 'shared-accessory' } },
      }),
      { anmeCertificateFileId: null },
      null,
      null,
    );

    expect(documents.map((d) => [d.slot, fileIds([d])[0]])).toEqual([
      ['DC_CABLE', 'cable-sheet'],
      ['AC_CABLE', 'ac-sheet'],
      ['EARTH_CABLE', 'earth-sheet'],
      ['CONNECTOR', 'mc4'],
      ['DISTRIBUTION_BLOCK', 'shared-accessory'],
    ]);
  });

  it('puts the module datasheet then its acceptance letter, preferring the project upload over the catalog homologation', () => {
    const module = { brand: 'LONGi', model: 'LR5', datasheetFileId: 'module-sheet', homologationFileId: 'module-homologation' };
    const inverter = { brand: 'Deye', model: 'SUN-5K', datasheetFileId: 'inv-sheet', homologationFileId: 'inv-homologation' };
    const arrayConfig = { module, inverters: [{ inverter, mppts: [] }] };

    const withUpload = annexDocumentsFromSnapshot(snapshot({ arrayConfig }), { anmeCertificateFileId: null }, { ...NO_ANNEXES, moduleAcceptanceFileId: 'letter' }, null);
    const withoutUpload = annexDocumentsFromSnapshot(snapshot({ arrayConfig }), { anmeCertificateFileId: null }, NO_ANNEXES, null);

    expect(withUpload.map((d) => [d.slot, d.label, fileIds([d])[0]])).toEqual([
      ['MODULE', 'Fiche technique LONGi LR5', 'module-sheet'],
      ['MODULE', 'Acceptation ANME du module', 'letter'],
      ['INVERTER', 'Fiche technique Deye SUN-5K', 'inv-sheet'],
      ['INVERTER', 'Homologation Deye SUN-5K', 'inv-homologation'],
    ]);
    expect(fileIds(withoutUpload.filter((d) => d.slot === 'MODULE'))).toEqual(['module-sheet', 'module-homologation']);
  });
});
