import { describe, it, expect } from 'vitest';
import { buildTemplateData } from '../src/build-template-data';
import type { DossierWorkerResult } from '../src/generate-dossier-document';
import type { RunEngineInput } from '@dossipv/engine';
import type { ProjectMeta } from '../src/placeholder-map';
import type { ProductionSimulation } from '../src/run-simulation';
import type { SnapshotConsumption } from '../src/job-snapshot';

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
};

const billConsumption: SnapshotConsumption = {
  annualConsumptionKWh: 4800,
  source: 'BILL',
  billedKWh: 2400,
  monthsBilled: 6,
  periodStart: '2026-01-05',
  periodEnd: '2026-07-04',
};

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
  earthRodCount: 1,
};

describe('buildTemplateData', () => {
  it('maps every field DossierTemplateData needs from the worker result, engine input, and live company/client data', () => {
    const data = buildTemplateData({
      workerResult,
      engineInput,
      projectMeta,
      snapshot: {
        client: { fullName: 'Ahmed Ben Ali', address: '45 Avenue Habib Bourguiba, Sousse', stegReference: 'STEG-2026-001' },
        cableRuns: [{ label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13' }],
        inverterBrandModels: ['Sofar 1-4KTL2-G3'],
      },
      companyInfo: { name: 'SolarPro Tunisie', address: '12 Rue de la République, Tunis', phone: '+216 71 000 000', email: 'contact@solarpro.tn' }, ...sizingInputs,
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
      snapshot: { client: null, cableRuns: [], inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' }, ...sizingInputs,
    });

    expect(result.moduleSpecPmaxW).toEqual(expect.any(String));
    expect(result.moduleSpecVmpV).toEqual(expect.any(String));
    expect(result.moduleSpecImpA).toEqual(expect.any(String));
    expect(result.moduleSpecVocV).toEqual(expect.any(String));
    expect(result.moduleSpecIscA).toEqual(expect.any(String));
    expect(result.inverterSpecVdcMaxV).toEqual(expect.any(String));
    expect(result.inverterSpecMpptMinV).toEqual(expect.any(String));
    expect(result.inverterSpecMpptMaxV).toEqual(expect.any(String));
    expect(result.stringSizingNsMin).toEqual(expect.any(String));
    expect(result.stringSizingNsMax).toEqual(expect.any(String));
    expect(result.stringSizingNsOptMax).toEqual(expect.any(String));
    expect(result.stringSizingNpMax).toEqual(expect.any(String));
    expect(result.stringSizingNpOpt).toEqual(expect.any(String));
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
      snapshot: { client: null, cableRuns: [], inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' }, ...sizingInputs,
    });

    expect(result.stabilityComputed).toBe(false);
    expect(result.stabilityWeightN).toBe('');
    expect(result.stabilityLhs).toBe('');
    expect(result.stabilityRhs).toBe('');
  });

  it('falls back to empty strings for a null client rather than throwing', () => {
    const data = buildTemplateData({
      workerResult, engineInput, projectMeta,
      snapshot: { client: null, cableRuns: [], inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' }, ...sizingInputs,
    });

    expect(data.clientFullName).toBe('');
    expect(data.clientAddress).toBe('');
    expect(data.clientStegReference).toBe('');
    expect(data.cableRuns).toEqual([]);
  });

  it('computes section numbers I-VII, VIII with no gap when neither DC fuse nor AC isolator is required (I4)', () => {
    const data = buildTemplateData({
      workerResult, engineInput: { ...engineInput, dcFuse: null, acIsolator: null }, projectMeta,
      snapshot: { client: null, cableRuns: [], inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' }, ...sizingInputs,
    });

    expect(data.sectionNumberPreambule).toBe('I.');
    expect(data.sectionNumberPresentation).toBe('II.');
    expect(data.sectionNumberDimensionnement).toBe('III.');
    expect(data.sectionNumberSolution).toBe('IV.');
    expect(data.sectionNumberCablage).toBe('V.');
    expect(data.sectionNumberTerre).toBe('VI.');
    expect(data.sectionNumberStructure).toBe('VII.');
    expect(data.sectionNumberFusible).toBe('');
    expect(data.sectionNumberSectionneur).toBe('');
    // The regression this fix closes: VI must be followed directly by VII (not a hardcoded "IX"
    // left over from when the DC fuse/AC isolator sections existed) when both are absent.
    expect(data.sectionNumberConclusion).toBe('VIII.');
  });

  it('renumbers VIII, IX correctly when the DC fuse section is required but the AC isolator section is not (I4)', () => {
    const data = buildTemplateData({
      workerResult, engineInput: { ...engineInput, dcFuse: { ratedCurrentA: 16, ratedVoltageV: 1000 }, acIsolator: null }, projectMeta,
      snapshot: { client: null, cableRuns: [], inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' }, ...sizingInputs,
    });

    expect(data.sectionNumberStructure).toBe('VII.');
    expect(data.sectionNumberFusible).toBe('VIII.');
    expect(data.sectionNumberSectionneur).toBe('');
    expect(data.sectionNumberConclusion).toBe('IX.');
  });

  it('numbers all ten sections I-X when both the DC fuse and the AC isolator sections are required (I4)', () => {
    const data = buildTemplateData({
      workerResult,
      engineInput: { ...engineInput, dcFuse: { ratedCurrentA: 16, ratedVoltageV: 1000 }, acIsolator: { ratedCurrentA: 25 } },
      projectMeta,
      snapshot: { client: null, cableRuns: [], inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' }, ...sizingInputs,
    });

    expect(data.sectionNumberFusible).toBe('VIII.');
    expect(data.sectionNumberSectionneur).toBe('IX.');
    expect(data.sectionNumberConclusion).toBe('X.');
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
      snapshot: { client: null, cableRuns: [], inverterBrandModels: ['Sofar 1-4KTL2-G3', 'Huawei SUN2000-5KTL'] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' }, ...sizingInputs,
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
      snapshot: { client: null, cableRuns: [], inverterBrandModels: [] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' }, ...sizingInputs,
    });

    expect(data.inverters[0]!.inverterBrandModel).toBe(projectMeta.inverterBrandModel);
  });

  describe('dimensioning and production section', () => {
    const base = {
      workerResult, engineInput, projectMeta,
      snapshot: { client: null, cableRuns: [], inverterBrandModels: ['Sofar 1-4KTL2-G3'] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' },
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
