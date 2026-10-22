import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import PizZip from 'pizzip';
import { fillDossierTemplate, type DossierTemplateData } from '@dossipv/docx-template';
import { buildTemplateData, type BuildTemplateDataInput } from '../src/build-template-data';
import type { DossierWorkerResult } from '../src/generate-dossier-document';
import { runEngine, type EngineResult, type RunEngineInput } from '@dossipv/engine';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';
import type { ProjectMeta } from '../src/placeholder-map';
import type { ProductionSimulation } from '../src/run-simulation';
import type { SnapshotConsumption } from '../src/job-snapshot';
import type { InstallerIdentity } from '../src/installer-identity';

const NNBSP = '\u202f';

const production: ProductionSimulation = {
  lat: 36.8,
  lon: 10.2,
  tiltDeg: 30,
  azimuthDeg: 0,
  weatherYear: 2020,
  installedKWp: 3.1,
  annualProductionKWh: 5400,
  annualArrayKWh: 5900,
  specificYieldKWhPerKWp: 5400 / 3.1,
  performanceRatioPct: 81.55,
  monthly: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    globHorKWhM2: 150,
    globIncKWhM2: 170.25,
    ambientTempC: 20,
    eArrayKWh: 490,
    eGridKWh: 450,
    prPct: 81.5,
  })),
  pvgis: { radiationDb: 'PVGIS-SARAH3', meteoDb: 'ERA5', elevationM: 4, useHorizon: true, horizonSource: 'DEM-calculated', fetchedAt: '2026-10-22T15:25:00.000Z' },
  simulatedAt: '2026-10-22T15:25:02.000Z',
  annualNominalKWh: 6324,
  losses: { temperaturePct: 6.7, dcCablePct: 0.9, inverterEfficiencyPct: 3, clippingPct: 0, acCablePct: 0.5, totalPct: 14.6 },
  pvcalc: null,
};

const billConsumption: SnapshotConsumption = {
  annualConsumptionKWh: 4800,
  source: 'BILL',
  billedKWh: 2400,
  monthsBilled: 6,
  periodStart: '2026-01-05',
  periodEnd: '2026-07-04',
};

const installer: InstallerIdentity = {
  name: 'SolarPro Tunisie',
  address: '12 Rue de la République, Tunis',
  phone: '+216 71 000 000',
  email: 'contact@solarpro.tn',
  anmeCode: 'ANME-TEST-01',
  anmeCategory: 'BT',
  anmeValidTo: '2027-12-31T00:00:00.000Z',
  taxId: '1234567/A/M/000',
  legalRepFullName: 'MR TEST GERANT',
  legalRepRole: 'Gérant',
  commercialRegister: null,
};

const installerInputs = { installer, dossierNumber: '434 - 303', dossierDate: '2026-11-25T09:30:00.000Z' };

const sizingInputs = { production, consumption: billConsumption, subscribedPowerKVA: 6, phases: 1 as const };

const workerResult: DossierWorkerResult = {
  sections: {
    introduction: 'Intro text.',
    solution: 'Solution text.',
    cabling: 'Cabling text.',
    earthing: 'Earthing text.',
    structure: 'Structure text.',
    conclusion: 'Conclusion text.',
  },
  engineResult: {
    derived: { P_DC_W: 3100, MODULE_COUNT: 5 },
    checks: [],
    hasBlockingFailure: false,
  },
};

const engineInput = {
  array: [
    {
      inverter: { pacW: 3000, vdcMaxV: 550, mpptMinV: 90, mpptMaxV: 550 } as never,
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  dcSwitch: {} as never, dcFuse: null, dcSpd: {} as never, acBreaker: {} as never,
  acSpd: {} as never, acIsolator: null, equipmentImpulseWithstandKV: 0, spdToEquipmentDistanceM: 0,
  dcRun: {} as never, acRun: {} as never, cosPhi: 0.95, lambdaOhmPerM: 0, maxVoltageDropPct: 3,
  structure: {} as never, site: { phases: 1 as const, lightningRod: false, gps: { lat: 0, lon: 0 } },
  module: { pmaxW: 620, vmpV: 41.2, impA: 15.05, vocV: 49.3, iscA: 15.85 } as never, tMinC: -10, tMaxC: 85,
} as unknown as RunEngineInput;

const projectMeta: ProjectMeta = {
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  gridType: 'TT',
  mountingType: 'ROOF',
  structureMaterial: 'ALUMINUM',
  earthRodCount: 1, earthingMode: 'DEDICATED_ROD', buildingType: 'HOUSE', floors: 1,
  protections: {
    dcSwitch: 'ZJ BENY BB1H-63',
    dcSpd: 'Generic DC-SPD-1',
    dcFuse: null,
    acBreaker: 'Generic AC-BRK-16',
    acSpd: 'Generic AC-SPD-1',
  },
  acBreakerFunction: 'disjoncteur différentiel 16 A, 30 mA type A',
};

const earthingRow = {
  rodCount: 1,
  rodLengthM: 1.5,
  mainEarthSectionMm2: 16,
  frameEarthSectionMm2: 6,
  earthToPitSectionMm2: 16,
  targetResistanceOhm: 25,
};

describe('buildTemplateData', () => {
  it('maps every field DossierTemplateData needs from the worker result, engine input, and live company/client data', () => {
    const data = buildTemplateData({
      workerResult,
      engineInput,
      projectMeta,
      snapshot: {
        client: { fullName: 'Ahmed Ben Ali', address: '45 Avenue Habib Bourguiba, Sousse', stegReference: 'STEG-2026-001', cin: '01234567' },
        cableRuns: [{ label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13' }],
        earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'],
      },
      ...installerInputs, ...sizingInputs,
    });

    expect(data.companyName).toBe('SolarPro Tunisie');
    expect(data.clientFullName).toBe('Ahmed Ben Ali');
    expect(data.clientStegReference).toBe('STEG-2026-001');
    expect(data.introduction).toBe('Intro text.');
    expect(data.moduleBrandModel).toBe('LONGi LR7-72HGD-620M');
    expect(data.inverterBrandModel).toBe('Sofar 1-4KTL2-G3');
    expect(data.pDcW).toBe('3 100 W');
    expect(data.moduleCount).toBe('5');
    // fr-FR Intl.NumberFormat uses U+202F (narrow no-break space) as its thousands separator,
    // not a plain space — same gotcha this codebase has hit before (see pDcW above, '3 100 W').
    expect(data.inverters).toEqual([{ inverterLabel: 'Onduleur 1', inverterBrandModel: 'Sofar 1-4KTL2-G3', pacW: '3 000', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 }] }]);
    expect(data.cableRuns).toEqual([{ label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13' }]);
    expect(data.dcFuseRequired).toBe(false);
    expect(data.acIsolatorRequired).toBe(false);
  });

  it('exposes full module/inverter electrical specs and the engine calculation-result tables as flat string fields', () => {
    // Fields are flat (moduleSpecPmaxW, not a nested moduleSpecs.pmaxW object) — confirmed
    // empirically that this installed docxtemplater version (3.71.0) does NOT resolve
    // dotted-path tags against a nested render-data object; {moduleSpecs.pmaxW} renders as the
    // literal string "undefined". Every tag in this template must be a flat top-level key,
    // exactly matching this codebase's existing DossierTemplateData fields (pDcW, moduleCount).
    const result = buildTemplateData({
      workerResult: {
        ...workerResult,
        engineResult: {
          ...workerResult.engineResult,
          derived: {
            ...workerResult.engineResult.derived,
            NS_MIN: 10,
            NS_MAX: 14,
            NS_OPT_MAX: 13,
            NP_MAX: 2,
            NP_OPT: 2,
            DU_DC_V: 2.3,
            DU_DC_PCT: 0.74,
            DU_AC_V: 1.1,
            DU_AC_PCT: 0.48,
            F_WEIGHT_N: 1200,
            STABILITY_LHS: 1500,
            STABILITY_RHS: 1200,
          },
        },
      },
      engineInput: {
        ...engineInput,
        module: { pmaxW: 620, vmpV: 41.2, impA: 15.05, vocV: 49.3, iscA: 15.85 } as never,
        array: [
          {
            inverter: { pacW: 4000, vdcMaxV: 1000, mpptMinV: 80, mpptMaxV: 550 } as never,
            mppts: engineInput.array[0]!.mppts,
          },
        ],
      },
      projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      ...installerInputs, ...sizingInputs,
    });

    expect(result.moduleSpecPmaxW).toEqual(expect.any(String));
    expect(result.moduleSpecVmpV).toEqual(expect.any(String));
    expect(result.moduleSpecImpA).toEqual(expect.any(String));
    expect(result.moduleSpecVocV).toEqual(expect.any(String));
    expect(result.moduleSpecIscA).toEqual(expect.any(String));
    expect(result.inverterSpecVdcMaxV).toEqual(expect.any(String));
    expect(result.inverterSpecMpptMinV).toEqual(expect.any(String));
    expect(result.inverterSpecMpptMaxV).toEqual(expect.any(String));
    expect(result.voltageDropDuDcV).toEqual(expect.any(String));
    expect(result.voltageDropDuDcPct).toEqual(expect.any(String));
    expect(result.voltageDropDuAcV).toEqual(expect.any(String));
    expect(result.voltageDropDuAcPct).toEqual(expect.any(String));
    expect(result.stabilityWeightN).toEqual(expect.any(String));
    expect(result.stabilityLhs).toEqual(expect.any(String));
    expect(result.stabilityRhs).toEqual(expect.any(String));
    expect(result.stabilityComputed).toBe(true);
  });

  it('marks the stability table as not computed, with empty strings, when the engine produced no stability values', () => {
    const result = buildTemplateData({
      workerResult,
      engineInput,
      projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      ...installerInputs, ...sizingInputs,
    });

    expect(result.stabilityComputed).toBe(false);
    expect(result.stabilityWeightN).toBe('');
    expect(result.stabilityLhs).toBe('');
    expect(result.stabilityRhs).toBe('');
  });

  it('marks a dossier with missing STEG pieces as a draft and lists them', () => {
    const input = {
      workerResult,
      engineInput,
      projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: [] },
      ...installerInputs,
      ...sizingInputs,
    };

    const draft = buildTemplateData({ ...input, draftMissing: ['Copie de la CIN du titulaire', 'Acceptation ANME du module'] });
    expect(draft.isDraft).toBe(true);
    expect(draft.draftMissingText).toBe('Copie de la CIN du titulaire ; Acceptation ANME du module');

    const complete = buildTemplateData(input);
    expect(complete.isDraft).toBe(false);
    expect(complete.draftMissingText).toBe('');
  });

  it('falls back to empty strings for a null client rather than throwing', () => {
    const data = buildTemplateData({
      workerResult, engineInput, projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      ...installerInputs, ...sizingInputs,
    });

    expect(data.clientFullName).toBe('');
    expect(data.clientAddress).toBe('');
    expect(data.clientStegReference).toBe('');
    expect(data.cableRuns).toEqual([]);
  });

  it('computes section numbers I-VIII, IX with no gap when neither DC fuse nor AC isolator is required (I4)', () => {
    const data = buildTemplateData({
      workerResult, engineInput: { ...engineInput, dcFuse: null, acIsolator: null }, projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      ...installerInputs, ...sizingInputs,
    });

    expect(data.sectionNumberPreambule).toBe('I.');
    expect(data.sectionNumberPresentation).toBe('II.');
    expect(data.sectionNumberDimensionnement).toBe('III.');
    expect(data.sectionNumberSolution).toBe('IV.');
    expect(data.sectionNumberProtections).toBe('V.');
    expect(data.sectionNumberCablage).toBe('VI.');
    expect(data.sectionNumberTerre).toBe('VII.');
    expect(data.sectionNumberStructure).toBe('VIII.');
    expect(data.sectionNumberFusible).toBe('');
    expect(data.sectionNumberSectionneur).toBe('');
    // The regression this fix closes: Structure must be followed directly by the Conclusion (no
    // number left over for the DC fuse/AC isolator sections) when both are absent.
    expect(data.sectionNumberConclusion).toBe('IX.');
  });

  it('renumbers IX, X correctly when the DC fuse section is required but the AC isolator section is not (I4)', () => {
    const data = buildTemplateData({
      workerResult, engineInput: { ...engineInput, dcFuse: { ratedCurrentA: 16, ratedVoltageV: 1000 }, acIsolator: null }, projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      ...installerInputs, ...sizingInputs,
    });

    expect(data.sectionNumberStructure).toBe('VIII.');
    expect(data.sectionNumberFusible).toBe('IX.');
    expect(data.sectionNumberSectionneur).toBe('');
    expect(data.sectionNumberConclusion).toBe('X.');
  });

  it('numbers all eleven sections I-XI when both the DC fuse and the AC isolator sections are required (I4)', () => {
    const data = buildTemplateData({
      workerResult,
      engineInput: { ...engineInput, dcFuse: { ratedCurrentA: 16, ratedVoltageV: 1000 }, acIsolator: { ratedCurrentA: 25 } },
      projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      ...installerInputs, ...sizingInputs,
    });

    expect(data.sectionNumberFusible).toBe('IX.');
    expect(data.sectionNumberSectionneur).toBe('X.');
    expect(data.sectionNumberConclusion).toBe('XI.');
  });

  it("uses each inverter's OWN brand/model from the snapshot, not projectMeta's first-inverter-only string, for a mixed-model array (I7)", () => {
    const mixedEngineInput: RunEngineInput = {
      ...engineInput,
      array: [
        { inverter: { pacW: 3000, vdcMaxV: 550, mpptMinV: 90, mpptMaxV: 550 } as never, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
        { inverter: { pacW: 5000, vdcMaxV: 600, mpptMinV: 100, mpptMaxV: 600 } as never, mppts: [{ stringsInParallel: 1, modulesPerString: 8 }] },
      ],
    };

    const data = buildTemplateData({
      workerResult,
      engineInput: mixedEngineInput,
      projectMeta, // projectMeta.inverterBrandModel is 'Sofar 1-4KTL2-G3' — the FIRST inverter only
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3', 'Huawei SUN2000-5KTL'] },
      ...installerInputs, ...sizingInputs,
    });

    expect(data.inverters).toHaveLength(2);
    expect(data.inverters[0]!.inverterBrandModel).toBe('Sofar 1-4KTL2-G3');
    expect(data.inverters[1]!.inverterBrandModel).toBe('Huawei SUN2000-5KTL');
    expect(data.inverters[0]!.pacW).toBe('3 000');
    expect(data.inverters[1]!.pacW).toBe('5 000');
  });

  it("falls back to projectMeta.inverterBrandModel when the snapshot's inverterBrandModels array is shorter than the engine's array (defensive, should not throw)", () => {
    const data = buildTemplateData({
      workerResult, engineInput, projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: [] },
      ...installerInputs, ...sizingInputs,
    });

    expect(data.inverters[0]!.inverterBrandModel).toBe(projectMeta.inverterBrandModel);
  });

  describe('installer and client identity', () => {
    const base = {
      workerResult, engineInput, projectMeta, ...installerInputs, ...sizingInputs,
      snapshot: { client: { fullName: 'MR TEST CLIENT', address: null, stegReference: null, cin: '01234567' }, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
    };

    it('formats the dossier number, date and the installer lines', () => {
      const data = buildTemplateData(base);

      expect(data.dossierNumber).toBe('434 - 303');
      expect(data.dossierDateText).toBe('25/11/2026');
      expect(data.installerAnmeLine).toBe("Installateur agréé ANME n° ANME-TEST-01 (catégorie BT), agrément valable jusqu'au 31/12/2027");
      expect(data.installerTaxIdLine).toBe('Matricule fiscal : 1234567/A/M/000');
      expect(data.installerLegalRepLine).toBe('Représentant légal : MR TEST GERANT, Gérant');
      expect(data.clientCinLine).toBe('CIN : 01234567');
    });

    it("says « non renseigné » without a tax id and points to annex N°1 without a CIN", () => {
      const data = buildTemplateData({
        ...base,
        installer: { ...installer, taxId: null },
        snapshot: { ...base.snapshot, client: { ...base.snapshot.client, cin: null } },
      });

      expect(data.installerTaxIdLine).toBe('Matricule fiscal : non renseigné');
      expect(data.clientCinLine).toBe('CIN : copie jointe en annexe N°1');
    });

    it('prints a mixed ANME category readably', () => {
      expect(buildTemplateData({ ...base, installer: { ...installer, anmeCategory: 'BT_MT' } }).installerAnmeLine).toContain('(catégorie BT + MT)');
    });
  });

  describe('dimensioning and production section', () => {
    const base = {
      workerResult, engineInput, projectMeta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      ...installerInputs,
    };

    it('fills the sizing and production section from a bill', () => {
      const data = buildTemplateData({ ...base, ...sizingInputs });

      expect(data.sectionNumberDimensionnement).toBe('III.');
      expect(data.sectionNumberSolution).toBe('IV.');
      expect(data.sizingBranchement).toBe('Monophasé BT');
      expect(data.sizingSubscribedPower).toBe('6 kVA');
      expect(data.sizingConsumption).toBe(
        `2${NNBSP}400 kWh facturés sur 6 mois (du 05/01/2026 au 04/07/2026) → environ 4${NNBSP}800 kWh/an (estimation à partir de 6 mois de facture)`,
      );
      expect(data.sizingInstalledKWp).toBe('3,10');
      expect(data.sizingInverterPac).toBe('3,00');
      expect(data.sizingDcAcRatio).toBe('1,03');
      expect(data.sizingRule).toBe(
        "Puissance AC de l'onduleur (3,00 kW) inférieure ou égale à la puissance souscrite (6 kVA) ; rapport DC/AC limité à 1,3.",
      );
      expect(data.productionAnnual).toBe(`5${NNBSP}400`);
      expect(data.productionSpecificYield).toBe(`1${NNBSP}742`);
      expect(data.productionPr).toBe('81,6 %');
      expect(data.productionCoverage).toBe('113 %');
      expect(data.productionMethod).toContain('Simulation PVGIS v5.3');
      expect(data.productionMethod).toContain('au point GPS 36,8, 10,2');
      expect(data.productionMethod).toContain("l'année 2020 ; inclinaison 30°, azimut 0° (0° = plein sud)");
      expect(data.productionMethod).toContain('Rapport détaillé en annexe N°2.');
      expect(data.productionMonths).toHaveLength(12);
      expect(data.productionMonths[0]).toEqual({ monthLabel: 'Janvier', globInc: '170,3', eGrid: '450', pr: '81,5' });
      expect(data.productionMonths[11]!.monthLabel).toBe('Décembre');
      expect(data.productionTotalGlobInc).toBe(`2${NNBSP}043,0`);
      expect(data.productionTotalEGrid).toBe(`5${NNBSP}400`);
    });

    it('describes a bill without dates and a typed consumption', () => {
      const noDates = buildTemplateData({ ...base, ...sizingInputs, consumption: { ...billConsumption, periodStart: null, periodEnd: null } });
      expect(noDates.sizingConsumption).toBe(`2${NNBSP}400 kWh facturés sur 6 mois → environ 4${NNBSP}800 kWh/an (estimation)`);

      const manual = buildTemplateData({
        ...base, ...sizingInputs,
        consumption: { annualConsumptionKWh: 3000, source: 'MANUAL', billedKWh: null, monthsBilled: null, periodStart: null, periodEnd: null },
      });
      expect(manual.sizingConsumption).toBe(`3${NNBSP}000 kWh/an (valeur saisie par l'installateur)`);
    });

    it('handles a project without consumption', () => {
      const data = buildTemplateData({ ...base, ...sizingInputs, consumption: null, subscribedPowerKVA: null });

      expect(data.sizingConsumption).toBe('Non renseignée');
      expect(data.sizingSubscribedPower).toBe('Non renseignée');
      expect(data.productionCoverage).toBe('—');
      const section = Object.fromEntries(
        Object.entries(data).filter(([key]) => key.startsWith('sizing') || key.startsWith('production')),
      );
      const serialized = JSON.stringify(section);
      expect(serialized).not.toContain('NaN');
      expect(serialized).not.toContain('undefined');
    });

    it('uses a decimal comma', () => {
      const data = buildTemplateData({ ...base, ...sizingInputs });

      for (const value of [data.sizingInstalledKWp, data.sizingInverterPac, data.sizingDcAcRatio, data.productionPr, data.productionMonths[0]!.globInc]) {
        expect(value).toContain(',');
        expect(value).not.toContain('.');
      }
    });
  });
});

describe('building and earthing lines', () => {
  const base = {
    workerResult,
    engineInput,
    snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
    ...installerInputs,
    ...sizingInputs,
  };

  it('lists the dedicated rod earthing details', () => {
    const data = buildTemplateData({ ...base, projectMeta });
    expect(data.earthingDetails).toEqual([
      { label: 'Schéma de liaison à la terre', value: 'TT' },
      { label: 'Prise de terre', value: 'Piquet dédié (1 × 1,5 m)' },
      { label: 'Conducteur principal de protection', value: '16 mm²' },
      { label: 'Liaison équipotentielle des cadres', value: '6 mm²' },
      { label: 'Conducteur de terre vers le piquet', value: '16 mm²' },
      { label: 'Résistance de terre visée', value: '≤ 25 Ω' },
    ]);
  });

  it('uses the building earth without a pit conductor row', () => {
    const data = buildTemplateData({ ...base, projectMeta: { ...projectMeta, earthingMode: 'BUILDING_EARTH', buildingType: 'APARTMENT_BUILDING', floors: 4 } });
    expect(data.earthingDetails.find((row) => row.label === 'Prise de terre')?.value).toBe('Terre existante du bâtiment');
    expect(data.earthingDetails.map((row) => row.label)).not.toContain('Conducteur de terre vers le piquet');
  });

  it('words the building line for a house and a flat', () => {
    expect(buildTemplateData({ ...base, projectMeta: { ...projectMeta, floors: 0 } }).siteBuildingLine).toBe(
      'Bâtiment : maison individuelle, toiture au niveau RDC',
    );
    expect(buildTemplateData({ ...base, projectMeta }).siteBuildingLine).toBe('Bâtiment : maison individuelle, toiture au niveau R+1');
    expect(
      buildTemplateData({ ...base, projectMeta: { ...projectMeta, buildingType: 'APARTMENT_BUILDING', floors: 4 } }).siteBuildingLine,
    ).toBe('Bâtiment : immeuble collectif (appartement), toiture-terrasse au niveau R+4');
  });

  it('copes with a legacy snapshot whose meta lacks the building and earthing fields', () => {
    const legacy = { ...projectMeta } as Record<string, unknown>;
    delete legacy.earthingMode;
    delete legacy.buildingType;
    delete legacy.floors;
    const data = buildTemplateData({ ...base, projectMeta: legacy as unknown as ProjectMeta });
    expect(data.siteBuildingLine).toBe('');
    expect(data.earthingDetails.find((row) => row.label === 'Prise de terre')?.value).toBe('Piquet dédié (1 × 1,5 m)');
  });

  it('leaves the building line empty when the type is unknown', () => {
    expect(buildTemplateData({ ...base, projectMeta: { ...projectMeta, buildingType: null } }).siteBuildingLine).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------
// Calculation notes (Tasks 19-20): every printed number is checked against the engine, on the
// reference fixture and on fixtures that take other branches (2 strings + bifacial + a Vmp
// coefficient; 3 strings needing a DC fuse), so the notes cannot be hard-coded to one case.
// ---------------------------------------------------------------------------------------------

/** Material and wind only (no ballast stability inputs), so check C18 is not run. */
const NO_STABILITY_STRUCTURE: RunEngineInput['structure'] = { ballastPerFrame: 2, ballastMassKg: 75, windSpeedKmh: 120, tiltDeg: 30 };

/** 2 strings of 4 bifacial modules (+10 %) with their own Vmp coefficient: no fuse (Np = Ncmax). */
const twoStringBifacialFixture: RunEngineInput = {
  ...habibKhedhiraFixture,
  module: { ...habibKhedhiraFixture.module, bifacial: true, bifacialGainPct: 10, tempCoeffVmpPct: -0.3 },
  array: [
    {
      inverter: { ...habibKhedhiraFixture.array[0]!.inverter, pacW: 5000, sacVA: 5000, iscMaxPerMpptA: 40, idcMaxPerMpptA: 32, iacMaxA: 22 },
      mppts: [{ stringsInParallel: 2, modulesPerString: 4 }],
    },
  ],
  dcSwitch: { ratedVoltageV: 1000, ratedCurrentA: 63 },
  dcSpd: { ucV: 1000, inKA: 20, iscpvKA: 40, upKV: 3.5, type: 2 },
  acBreaker: { ratedCurrentA: 25 },
  acRun: { ...habibKhedhiraFixture.acRun, sectionMm2: 6, izBaseA: 41 },
  spdToEquipmentDistanceM: 12,
  equipmentImpulseWithstandKV: 8,
  structure: NO_STABILITY_STRUCTURE,
};

/** 3 strings of 6 modules on one MPPT: Np = 3 > Ncmax = 2, a 20 A / 1 000 V string fuse is fitted. */
const fusedFixture: RunEngineInput = {
  ...habibKhedhiraFixture,
  array: [
    {
      inverter: { ...habibKhedhiraFixture.array[0]!.inverter, pacW: 10000, sacVA: 10000, iscMaxPerMpptA: 50, idcMaxPerMpptA: 45 },
      mppts: [{ stringsInParallel: 3, modulesPerString: 6 }],
    },
  ],
  dcSwitch: { ratedVoltageV: 1000, ratedCurrentA: 63 },
  dcFuse: { ratedCurrentA: 20, ratedVoltageV: 1000 },
  dcSpd: { ucV: 1000, inKA: 20, iscpvKA: 40, upKV: 2.5, type: 2 },
  dcRun: { ...habibKhedhiraFixture.dcRun, sectionMm2: 10, izBaseA: 75 },
  structure: NO_STABILITY_STRUCTURE,
};

const NOTE_FIXTURES: [string, RunEngineInput][] = [
  ['reference fixture', habibKhedhiraFixture],
  ['2 bifacial strings', twoStringBifacialFixture],
  ['3 fused strings', fusedFixture],
];

function notesInput(engineInput: RunEngineInput, meta: ProjectMeta = projectMeta): { engineResult: EngineResult; input: BuildTemplateDataInput } {
  const engineResult = runEngine(engineInput);
  return {
    engineResult,
    input: {
      workerResult: { sections: workerResult.sections, engineResult },
      engineInput,
      projectMeta: meta,
      snapshot: { client: null, cableRuns: [], earthing: earthingRow, inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      ...installerInputs,
      ...sizingInputs,
    },
  };
}

const TEMPLATE = readFileSync(join(import.meta.dirname, '..', '..', 'docx-template', 'template', 'dossier-template.docx'));

/** The text of the real Word template filled with `data`, paragraphs separated by newlines. */
function filledTemplateText(data: DossierTemplateData): string {
  const xml = new PizZip(fillDossierTemplate(TEMPLATE, data)).file('word/document.xml')!.asText();
  return xml
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Independent of the code under test: 2 decimals, decimal comma. */
function two(value: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function frNumber(text: string): number {
  return Number(text.replace(/[  ]/g, '').replace(',', '.'));
}

/**
 * Evaluates a printed « Application numérique » expression (e.g. `partie entière de (550 / 60,79)`)
 * with a tiny recursive-descent parser: numbers with a decimal comma, + - × /, brackets,
 * `max(a ; b)`, `partie entière de` (floor) and `partie entière supérieure de` (ceil).
 */
function evaluatePrinted(expression: string): number {
  const source = expression
    .replace(/partie entière supérieure de/g, 'C')
    .replace(/partie entière de/g, 'F')
    .replace(/max\(/g, 'M(')
    .replace(/[  ](?=\d)/g, '')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/\s+/g, '');
  let index = 0;
  const peek = (): string => source[index] ?? '';
  const consume = (char: string): void => {
    if (source[index] !== char) throw new Error(`expected ${char} at ${index} in ${source}`);
    index += 1;
  };
  const parseFactor = (): number => {
    const char = peek();
    if (char === '-') {
      index += 1;
      return -parseFactor();
    }
    if (char === '(') {
      index += 1;
      const value = parseExpression();
      consume(')');
      return value;
    }
    if (char === 'F' || char === 'C') {
      index += 1;
      const value = parseFactor();
      return char === 'F' ? Math.floor(value) : Math.ceil(value);
    }
    if (char === 'M') {
      index += 1;
      consume('(');
      const a = parseExpression();
      consume(';');
      const b = parseExpression();
      consume(')');
      return Math.max(a, b);
    }
    const match = /^\d+(,\d+)?/.exec(source.slice(index));
    if (!match) throw new Error(`unexpected ${char} at ${index} in ${source}`);
    index += match[0].length;
    return frNumber(match[0]);
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === '×' || peek() === '/') {
      const op = source[index++];
      const right = parseFactor();
      value = op === '×' ? value * right : value / right;
    }
    return value;
  };
  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = source[index++];
      const right = parseTerm();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  const value = parseExpression();
  if (index !== source.length) throw new Error(`trailing input at ${index} in ${source}`);
  return value;
}

/**
 * Every line of a computed note reads `Symbol = expression = … = value [unit]`: the printed
 * expression, evaluated, must give the printed value (within the 2-decimal display rounding).
 * Returns the last line's printed value.
 */
function expectApplicationConsistent(application: string): number {
  let last = Number.NaN;
  for (const line of application.split('\n')) {
    const segments = line.split(' = ');
    expect(segments.length, line).toBeGreaterThanOrEqual(3);
    const printed = frNumber(segments[segments.length - 1]!.replace(/ (V|A|kV)$/, ''));
    const evaluated = evaluatePrinted(segments[1]!);
    expect(Math.abs(evaluated - printed), line).toBeLessThanOrEqual(0.006 + 1e-3 * Math.abs(printed));
    last = printed;
  }
  return last;
}

const STRING_NOTE_TITLES = [
  'Tension de circuit ouvert du module à Tmin : Voc(Tmin)',
  'Tension au point de puissance maximale à Tmin : Vmp(Tmin)',
  'Tension au point de puissance maximale à Tmax : Vmp(Tmax)',
  'Courant de court-circuit du module à Tmax : Isc(Tmax)',
  'Nombre maximal de modules en série : Ns max',
  'Nombre minimal de modules en série : Ns min',
  'Nombre optimal maximal de modules en série : Ns optimal max',
  'Nombre maximal de chaînes en parallèle : Np max',
  'Nombre optimal de chaînes en parallèle : Np optimal',
  'Ns retenu',
  'Rapport de puissance DC/AC',
  'Nombre maximal de chaînes sans protection (Ncmax)',
  'Fusible DC',
];

describe('string sizing notes (Task 19)', () => {
  it.each(NOTE_FIXTURES)('lists the 13 notes in order, each result equal to the engine derived value (%s)', (_name, fixture) => {
    const { engineResult, input } = notesInput(fixture);
    const d = engineResult.derived;
    const notes = buildTemplateData(input).stringSizingNotes;
    const count = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

    expect(engineResult.hasBlockingFailure).toBe(false);
    expect(notes.map((note) => note.title)).toEqual(STRING_NOTE_TITLES);
    expect(notes.slice(0, 9).map((note) => note.result)).toEqual([
      `Voc(Tmin) = ${two(d.VOC_TMIN!)} V`,
      `Vmp(Tmin) = ${two(d.VMP_TMIN!)} V`,
      `Vmp(Tmax) = ${two(d.VMP_TMAX!)} V`,
      `Isc(Tmax) = ${two(d.ISC_TMAX!)} A`,
      `Ns max = ${count(d.NS_MAX!, 'module', 'modules')}`,
      `Ns min = ${count(d.NS_MIN!, 'module', 'modules')}`,
      `Ns optimal max = ${count(d.NS_OPT_MAX!, 'module', 'modules')}`,
      `Np max = ${count(d.NP_MAX!, 'chaîne', 'chaînes')}`,
      `Np optimal = ${count(d.NP_OPT!, 'chaîne', 'chaînes')}`,
    ]);
    expect(notes[10]!.result).toBe(`Rapport DC/AC = ${two(d.POWER_RATIO!)}`);
    expect(notes[11]!.result).toBe(`Ncmax = ${count(d.NC_MAX_NO_FUSE!, 'chaîne', 'chaînes')}`);
    expect(notes[9]!.conclusion).toContain('condition vérifiée');
    expect(notes[10]!.conclusion).toContain('condition vérifiée');
    expect(notes[12]!.conclusion).not.toContain('non vérifiée');
  });

  it.each(NOTE_FIXTURES)('prints applications whose own numbers compute the engine value (%s)', (_name, fixture) => {
    const { engineResult, input } = notesInput(fixture);
    const d = engineResult.derived;
    const notes = buildTemplateData(input).stringSizingNotes;
    const derivedByNote = [d.VOC_TMIN, d.VMP_TMIN, d.VMP_TMAX, d.ISC_TMAX, d.NS_MAX, d.NS_MIN, d.NS_OPT_MAX, d.NP_MAX, d.NP_OPT];

    derivedByNote.forEach((value, i) => {
      const printed = expectApplicationConsistent(notes[i]!.application);
      expect(printed, notes[i]!.title).toBeCloseTo(value!, 2);
    });
    expect(expectApplicationConsistent(notes[10]!.application)).toBeCloseTo(d.POWER_RATIO!, 2);
    expect(expectApplicationConsistent(notes[11]!.application)).toBe(d.NC_MAX_NO_FUSE);
    // Every number carries a decimal comma, never a point.
    for (const note of notes) expect(`${note.formula}${note.application}${note.result}${note.conclusion ?? ''}`).not.toMatch(/\d\.\d|NaN|undefined/);
  });

  it('states the temperature assumptions and drops the bare results table (STEG remark 6)', () => {
    const data = buildTemplateData(notesInput(habibKhedhiraFixture).input);

    expect(data.temperatureAssumptions).toBe('Tmin = -10 °C, Tmax = 85 °C (hypothèses de calcul)');
    for (const key of ['stringSizingNsMin', 'stringSizingNsMax', 'stringSizingNsOptMax', 'stringSizingNpMax', 'stringSizingNpOpt']) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it('writes the reference fixture notes with the formulas and numbers of the engine', () => {
    const notes = buildTemplateData(notesInput(habibKhedhiraFixture).input).stringSizingNotes;

    expect(notes[0]).toEqual({
      title: 'Tension de circuit ouvert du module à Tmin : Voc(Tmin)',
      formula: 'Voc(Tmin) = Voc × [1 + βVoc/100 × (Tmin - 25)]\nVoc : tension de circuit ouvert du module aux STC ; βVoc : coefficient de température de Voc (%/°C)',
      application: 'Voc(Tmin) = 55,9 × [1 + (-0,25)/100 × (-10 - 25)] = 60,79 V',
      result: 'Voc(Tmin) = 60,79 V',
      conclusion: null,
    });
    // No Vmp coefficient on the datasheet: the engine uses the Pmax one, and the note says so.
    expect(notes[1]!.formula).toContain('pris égal à celui de Pmax');
    expect(notes[1]!.application).toBe('Vmp(Tmin) = 46,5 × [1 + (-0,28)/100 × (-10 - 25)] = 51,06 V');
    expect(notes[4]!.application).toBe('Ns max = partie entière de (550 / 60,79) = partie entière de 9,04 = 9');
    expect(notes[5]!.application).toBe('Ns min = partie entière supérieure de (max(90 ; 100) / 38,69) = partie entière supérieure de 2,59 = 3');
    expect(notes[8]!.application).toBe(
      'Imp(Tmax) = 13,33 × [1 + 0,045/100 × (85 - 25)] = 13,69 A\nNp optimal = partie entière de (16 / 13,69) = partie entière de 1,16 = 1',
    );
    expect(notes[3]!.formula).not.toContain('Gbif');
    expect(notes[9]).toMatchObject({
      application: '3 ≤ 5 ≤ min(9 ; 10) = 9',
      conclusion: 'Ns retenu = 5 ≤ min(Ns max, Ns optimal max) = 9 et ≥ Ns min = 3 : condition vérifiée.',
    });
    expect(notes[10]).toMatchObject({
      formula: 'Rapport DC/AC = P DC / Pac = (N modules × Pmax) / Pac onduleur\nPlage admise : 0,9 ≤ Rapport DC/AC ≤ 1,3',
      application: `Rapport DC/AC = (5 × 620) / 3${NNBSP}000 = 1,03`,
      conclusion: '0,9 ≤ 1,03 ≤ 1,3 : condition vérifiée.',
    });
    expect(notes[11]!.formula).toContain('UTE C15-712-1');
    expect(notes[12]).toMatchObject({
      application: 'Np = 1 ≤ Ncmax = 2',
      result: 'Aucun fusible DC requis',
      conclusion: 'Pas de fusible : 1 chaîne(s) par MPPT ≤ Ncmax = 2.',
    });
    for (const note of notes.slice(0, 9)) expect(note.conclusion).toBeNull();
  });

  it('carries the bifacial gain and the datasheet Vmp coefficient into the formulas', () => {
    const notes = buildTemplateData(notesInput(twoStringBifacialFixture).input).stringSizingNotes;

    expect(notes[1]!.formula).not.toContain('Pmax');
    expect(notes[1]!.application).toContain('× [1 + (-0,3)/100 × (-10 - 25)]');
    expect(notes[3]!.formula).toContain('× (1 + Gbif/100)');
    expect(notes[3]!.application).toContain('× (1 + 10/100)');
    expect(notes[8]!.application).toContain('× (1 + 10/100)');
    expect(notes[12]!.conclusion).toBe('Pas de fusible : 2 chaîne(s) par MPPT ≤ Ncmax = 2.');
  });

  it('fills the real Word template with every note of the reference fixture', () => {
    const data = buildTemplateData(notesInput(habibKhedhiraFixture).input);
    const text = filledTemplateText(data);

    expect(text).toContain(data.temperatureAssumptions);
    let cursor = 0;
    for (const note of data.stringSizingNotes) {
      for (const part of [note.title, note.application.split('\n')[0]!, note.result, note.conclusion ?? note.result]) {
        const at = text.indexOf(part, cursor);
        expect(at, part).toBeGreaterThanOrEqual(cursor);
        cursor = at;
      }
    }
    expect(text).not.toMatch(/undefined|NaN/);
  });

  it('sizes the string fuse with the engine bounds when Np > Ncmax', () => {
    const { engineResult, input } = notesInput(fusedFixture, { ...projectMeta, protections: { ...projectMeta.protections, dcFuse: 'TEST gPV-20' } });
    const fuseNote = buildTemplateData(input).stringSizingNotes[12]!;
    const lower = 1.1 * 1.25 * fusedFixture.module.iscA;

    expect(fuseNote.application).toBe(
      [
        'Np = 3 > Ncmax = 2 : fusible requis',
        `1,1 × 1,25 × Isc = 1,1 × 1,25 × 13,92 = ${two(lower)} A ≤ In fusible ≤ IRM = 25 A`,
        `Un fusible ≥ Ns × Voc(Tmin) = 6 × 60,79 = ${two(engineResult.derived.STRING_VOC_TMIN!)} V`,
      ].join('\n'),
    );
    expect(fuseNote.result).toBe(`In fusible = 20 A ; Un fusible = 1${NNBSP}000 V`);
    expect(fuseNote.conclusion).toBe(
      `Fusible DC TEST gPV-20 : ${two(lower)} A ≤ In = 20 A ≤ 25 A et Un = 1${NNBSP}000 V ≥ ${two(engineResult.derived.STRING_VOC_TMIN!)} V : condition vérifiée.`,
    );
  });
});

/** The reference fixture with its 30 mA type A differential breaker (Task 7's C24 input). */
const referenceWithRcd: RunEngineInput = { ...habibKhedhiraFixture, rcd: { residualCurrentMA: 30, rcdType: 'A' } };

function protectionNotesOf(engineInput: RunEngineInput, acSpdInKA: number | null = 20): ReturnType<typeof buildTemplateData>['protectionNotes'] {
  const { input } = notesInput(engineInput);
  return buildTemplateData({ ...input, snapshot: { ...input.snapshot, acSpdInKA } }).protectionNotes;
}

describe('protection sizing notes (Task 20)', () => {
  it('lists the five protections in the reference order, each conforming to its engine checks', () => {
    const notes = protectionNotesOf(referenceWithRcd);

    expect(notes.map((note) => note.title)).toEqual(['Interrupteur-sectionneur DC', 'Parafoudre DC', 'Disjoncteur différentiel AC', 'Parafoudre AC', 'Sectionnement AC']);
    expect(notes.map((note) => note.conclusion)).toEqual([
      "L'interrupteur-sectionneur DC choisi est conforme.",
      'Le parafoudre DC choisi est conforme.',
      'Le disjoncteur différentiel AC choisi est conforme.',
      'Le parafoudre AC choisi est conforme.',
      "Un seul onduleur : pas d'interrupteur-sectionneur AC dédié ; le sectionnement côté AC est assuré par le disjoncteur différentiel Generic AC-BRK-16.",
    ]);
    for (const note of notes) expect(Object.values(note).join('\n')).not.toMatch(/\d\.\d|NaN|undefined/);
  });

  it.each([...NOTE_FIXTURES, ['reference with differential breaker', referenceWithRcd] as [string, RunEngineInput]])(
    'prints the DC switch numbers as the engine STRING_VOC_TMIN and ISC_FIELD_DESIGN (%s)',
    (_name, fixture) => {
      const { engineResult } = notesInput(fixture);
      const d = engineResult.derived;
      const dcSwitch = protectionNotesOf(fixture)[0]!;
      const [voltageLine, currentLine] = dcSwitch.application.split('\n');

      expect(expectApplicationConsistent(voltageLine!)).toBeCloseTo(d.STRING_VOC_TMIN!, 2);
      expect(voltageLine).toMatch(new RegExp(`= ${two(d.STRING_VOC_TMIN!)} V$`));
      expect(expectApplicationConsistent(currentLine!)).toBeCloseTo(d.ISC_FIELD_DESIGN!, 2);
      expect(currentLine).toMatch(new RegExp(`= ${two(d.ISC_FIELD_DESIGN!)} A$`));
      expect(dcSwitch.result).toBe(
        `Ue = ${fixture.dcSwitch.ratedVoltageV.toLocaleString('fr-FR')} V ≥ ${two(d.STRING_VOC_TMIN!)} V ; In = ${fixture.dcSwitch.ratedCurrentA} A ≥ ${two(d.ISC_FIELD_DESIGN!)} A`,
      );
    },
  );

  it('writes the reference DC notes with the requirements of checks C09 to C12', () => {
    const [dcSwitch, dcSpd] = protectionNotesOf(referenceWithRcd);

    expect(dcSwitch).toEqual({
      title: 'Interrupteur-sectionneur DC',
      formula: 'Ue ≥ Voc(Tmin) de la chaîne = Ns × Voc(Tmin)\nIn ≥ courant de conception du champ = 1,25 × Isc × Np (UTE C15-712-1)',
      application: 'Ns × Voc(Tmin) = 5 × 60,79 = 303,96 V\n1,25 × Isc × Np = 1,25 × 13,92 × 1 = 17,40 A',
      result: 'Ue = 600 V ≥ 303,96 V ; In = 25 A ≥ 17,40 A',
      chosen: 'ZJ BENY BB1H-63 — 600 V, 25 A',
      conclusion: "L'interrupteur-sectionneur DC choisi est conforme.",
    });
    expect(dcSpd!.formula.split('\n')).toEqual([
      "Type 1 si le bâtiment est équipé d'un paratonnerre, sinon type 2",
      'Ucpv ≥ 1,2 × Ns × Voc (Voc du module aux STC)',
      "Up < 0,8 × Uw (0,5 × Uw si le parafoudre est à plus de 10 m de l'équipement protégé) ; Uw : tenue aux chocs des équipements",
      'In ≥ 5 kA',
      'Iscpv ≥ courant de conception du champ = 1,25 × Isc × Np (UTE C15-712-1)',
    ]);
    expect(dcSpd!.application.split('\n')).toEqual([
      'Pas de paratonnerre : type 2',
      '1,2 × Ns × Voc = 1,2 × 5 × 55,9 = 335,40 V',
      'Up < 0,8 × tenue aux chocs (4 kV) = 3,20 kV',
      '1,25 × Isc × Np = 1,25 × 13,92 × 1 = 17,40 A',
    ]);
    expect(dcSpd!.result.split('\n')).toEqual(['Type 2', 'Ucpv = 700 V ≥ 335,40 V', 'Up = 2 kV < 3,20 kV', 'In = 10 kA ≥ 5 kA', 'Iscpv = 20 A ≥ 17,40 A']);
    expect(dcSpd!.chosen).toBe('Generic DC-SPD-1 — type 2, Ucpv 700 V, Up 2 kV, In 10 kA, Iscpv 20 A');
  });

  it('writes the reference AC notes: breaker within [Iac max, Iz\'] with 30 mA type A, Uc rule, single-inverter disconnection', () => {
    const { engineResult } = notesInput(referenceWithRcd);
    const [, , breaker, acSpd, disconnection] = protectionNotesOf(referenceWithRcd);
    const iz = two(engineResult.derived.AC_RUN_IZ_CORRECTED!);

    expect(breaker!.formula).toContain("Iac max onduleur ≤ In ≤ Iz' câble AC");
    expect(breaker!.formula).toContain('30 mA type A');
    expect(breaker!.application).toBe(`Iac max onduleur = 16 A ; Iz' câble AC (4 mm²) = ${iz} A\n16 A ≤ In ≤ ${iz} A`);
    expect(breaker!.result).toBe('In = 20 A ; IΔn = 30 mA type A');
    expect(breaker!.chosen).toBe('Generic AC-BRK-16 — 20 A, 30 mA type A');
    expect(acSpd!.application.split('\n')).toEqual(['Pas de paratonnerre : type 2', '1,1 × Un = 1,1 × 230 = 253,00 V', 'Up < 0,8 × tenue aux chocs (4 kV) = 3,20 kV']);
    expect(acSpd!.result.split('\n')).toEqual(['Type 2', 'Uc = 275 V ≥ 253,00 V', 'Up = 1,5 kV < 3,20 kV', 'In = 20 kA ≥ 5 kA']);
    expect(acSpd!.chosen).toBe('Generic AC-SPD-1 — type 2, Uc 275 V, Up 1,5 kV, In 20 kA');
    expect(disconnection).toMatchObject({ application: "Nombre d'onduleurs = 1", result: "Pas d'interrupteur-sectionneur AC dédié", chosen: 'Generic AC-BRK-16 — 20 A, 30 mA type A' });
  });

  it('halves the Up limit beyond 10 m and carries the bifacial gain into the design current', () => {
    const [dcSwitch, dcSpd] = protectionNotesOf(twoStringBifacialFixture);

    expect(dcSwitch!.application.split('\n')[1]).toBe('1,25 × Isc × Np × (1 + Gbif/100) = 1,25 × 13,92 × 2 × (1 + 10/100) = 38,28 A');
    expect(dcSpd!.application).toContain('Up < 0,5 × tenue aux chocs (8 kV) = 4,00 kV');
    expect(dcSpd!.result).toContain('Iscpv = 40 kA ≥ 38,28 A');
  });

  it('requires type 1 surge arresters under a lightning rod', () => {
    const fixture: RunEngineInput = {
      ...referenceWithRcd,
      site: { ...referenceWithRcd.site, lightningRod: true },
      dcSpd: { ...referenceWithRcd.dcSpd, type: 1 },
      acSpd: { ...referenceWithRcd.acSpd, type: 1 },
    };
    const notes = protectionNotesOf(fixture);

    expect(notes[1]!.application.split('\n')[0]).toBe("Bâtiment équipé d'un paratonnerre : type 1");
    expect(notes[1]!.conclusion).toBe('Le parafoudre DC choisi est conforme.');
    expect(notes[3]!.application.split('\n')[0]).toBe("Bâtiment équipé d'un paratonnerre : type 1");
  });

  it('never claims conformity the checks do not support', () => {
    const plainBreaker = protectionNotesOf({ ...habibKhedhiraFixture, rcd: { residualCurrentMA: null, rcdType: null } });
    expect(plainBreaker[2]!.result).toBe('In = 20 A ; pas de fonction différentielle');
    expect(plainBreaker[2]!.conclusion).toBe(
      "Le disjoncteur différentiel AC choisi n'est pas conforme : Aucune protection différentielle 30 mA de type A (ou F, B) côté AC.",
    );

    // The engine checks Up on the DC arrester only: the AC one is checked here with checkC11.
    const highUp = protectionNotesOf({ ...referenceWithRcd, acSpd: { ...referenceWithRcd.acSpd, upKV: 3.5 } });
    expect(highUp[3]!.conclusion).toBe("Le parafoudre AC choisi n'est pas conforme : Niveau de protection du parafoudre insuffisant pour la tenue aux chocs.");

    const unknownIn = protectionNotesOf(referenceWithRcd, null);
    expect(unknownIn[3]!.result).toContain('In non renseigné');
    expect(unknownIn[3]!.conclusion).toBe("Le parafoudre AC choisi n'est pas conforme : courant nominal de décharge In non renseigné.");
  });

  it('fills the protections section of the real Word template after the string sizing notes', () => {
    const { input } = notesInput(referenceWithRcd);
    const data = buildTemplateData({ ...input, snapshot: { ...input.snapshot, acSpdInKA: 20 } });
    const text = filledTemplateText(data);
    const heading = 'V. Dimensionnement des protections';

    expect(text.indexOf(heading)).toBeGreaterThan(text.indexOf('Pas de fusible : 1 chaîne(s) par MPPT'));
    expect(text.indexOf(heading)).toBeLessThan(text.indexOf('VI. Câblage'));
    let cursor = text.indexOf(heading);
    for (const note of data.protectionNotes) {
      for (const part of [note.title, `Exigences : ${note.formula.split('\n')[0]!}`, note.result.split('\n')[0]!, `Matériel retenu : ${note.chosen}`, note.conclusion!]) {
        const at = text.indexOf(part, cursor);
        expect(at, part).toBeGreaterThanOrEqual(cursor);
        cursor = at;
      }
    }
    expect(text).not.toMatch(/undefined|NaN/);
  });
});
