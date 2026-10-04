import { describe, it, expect } from 'vitest';
import { buildTemplateData } from '../src/build-template-data';
import type { DossierWorkerResult } from '../src/generate-dossier-document';
import type { RunEngineInput } from '@dossipv/engine';
import type { ProjectMeta } from '../src/placeholder-map';

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
      inverter: {} as never,
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  dcSwitch: {} as never, dcFuse: null, dcSpd: {} as never, acBreaker: {} as never,
  acSpd: {} as never, acIsolator: null, equipmentImpulseWithstandKV: 0, spdToEquipmentDistanceM: 0,
  dcRun: {} as never, acRun: {} as never, cosPhi: 0.95, lambdaOhmPerM: 0, maxVoltageDropPct: 3,
  structure: {} as never, site: { phases: 1 as const, lightningRod: false, gps: { lat: 0, lon: 0 } },
  module: {} as never, tMinC: -10, tMaxC: 85,
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
      },
      companyInfo: { name: 'SolarPro Tunisie', address: '12 Rue de la République, Tunis', phone: '+216 71 000 000', email: 'contact@solarpro.tn' },
    });

    expect(data.companyName).toBe('SolarPro Tunisie');
    expect(data.clientFullName).toBe('Ahmed Ben Ali');
    expect(data.clientStegReference).toBe('STEG-2026-001');
    expect(data.introduction).toBe('Intro text.');
    expect(data.moduleBrandModel).toBe('LONGi LR7-72HGD-620M');
    expect(data.inverterBrandModel).toBe('Sofar 1-4KTL2-G3');
    expect(data.pDcW).toBe('3 100 W');
    expect(data.moduleCount).toBe('5');
    expect(data.inverters).toEqual([{ inverterLabel: 'Onduleur 1', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 }] }]);
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
      snapshot: { client: null, cableRuns: [] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' },
    });

    expect(result.moduleSpecPmaxW).toEqual(expect.any(String));
    expect(result.moduleSpecVmpV).toEqual(expect.any(String));
    expect(result.moduleSpecImpA).toEqual(expect.any(String));
    expect(result.moduleSpecVocV).toEqual(expect.any(String));
    expect(result.moduleSpecIscA).toEqual(expect.any(String));
    expect(result.inverterSpecPacW).toEqual(expect.any(String));
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
  });

  it('falls back to empty strings for a null client rather than throwing', () => {
    const data = buildTemplateData({
      workerResult, engineInput, projectMeta,
      snapshot: { client: null, cableRuns: [] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' },
    });

    expect(data.clientFullName).toBe('');
    expect(data.clientAddress).toBe('');
    expect(data.clientStegReference).toBe('');
    expect(data.cableRuns).toEqual([]);
  });
});
