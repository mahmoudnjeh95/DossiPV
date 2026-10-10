import { describe, it, expect } from 'vitest';
import { runEngine } from '@dossipv/engine';
import { buildEngineInput } from '../lib/project-engine-input';
import { computeSectionStatuses } from '../lib/project-sections';
import { buildFullProject, FIXTURE_NOW } from './fixtures/full-project';

describe('buildEngineInput', () => {
  it('maps a complete project to a RunEngineInput the engine accepts', () => {
    const result = buildEngineInput(buildFullProject(), FIXTURE_NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.module.tempCoeffVmpPct).toBeUndefined();
    expect(result.input.array).toHaveLength(1);
    expect(result.input.dcRun).toMatchObject({
      conductor: 'Cu',
      insulation: 'PR',
      referenceMethod: 'B',
      izBaseA: 56,
      ambientTempC: 80,
    });
    expect(result.input.acRun).toMatchObject({ ambientTempC: 50, installMethod: '3A' });
    expect(result.input.structure.tiltDeg).toBe(30);
    expect(result.input.structure).not.toHaveProperty('liftCoeffNPerM2');
    expect(result.input.dossierDate).toBe('2026-10-03');
    expect(result.input.companyAccreditationValidTo).toBe('2027-01-01');
    expect(result.meta).toEqual({
      moduleBrandModel: 'LONGi LR7-72HGD-620M',
      inverterBrandModel: 'Sofar 1-4KTL2-G3',
      gridType: 'BT',
      mountingType: 'FLAT_ROOF_BALLAST',
      structureMaterial: 'ALUMINIUM',
      earthRodCount: 3,
    });

    const engine = runEngine(result.input);
    expect(engine.derived.P_DC_W).toBe(3100);
    expect(engine.derived.MODULE_COUNT).toBe(5);
    expect(engine.checks).toHaveLength(22);
  });

  it('accepts a structure with only material + wind speed and runs the engine without the stability check', () => {
    const project = buildFullProject();
    project.structure = {
      ...project.structure!,
      frameCount: null,
      structureWeightN: null,
      heightHM: null,
      depthDM: null,
      ballastPerFrame: null,
      ballastMassKg: null,
      liftCoeffNPerM2: null,
      dragCoeffNPerM2: null,
      windSpeedKmh: 90,
    };
    const result = buildEngineInput(project, FIXTURE_NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.structure.windSpeedKmh).toBe(90);
    expect(result.input.structure).not.toHaveProperty('frameCount');
    expect(result.input.structure).not.toHaveProperty('depthDM');

    const engine = runEngine(result.input);
    expect(engine.derived.STABILITY_LHS).toBeUndefined();
    expect(engine.checks.some((c) => c.id === 'C18')).toBe(false);
  });

  it('lists every missing section at once instead of failing on the first', () => {
    const result = buildEngineInput(
      buildFullProject({ site: null, structure: null, cableRuns: [] }),
      FIXTURE_NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.missing).toEqual([
      'Site : section non renseignée.',
      'Câblage : aucune liaison DC définie.',
      'Câblage : aucune liaison AC définie.',
      'Structure : section non renseignée.',
    ]);
  });

  it('refuses a cable run whose section is not in the cable catalog entry', () => {
    const project = buildFullProject();
    project.cableRuns[0]!.sectionMm2 = 10;
    const result = buildEngineInput(project, FIXTURE_NOW);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.missing[0]).toContain("la section 10 mm² n'existe pas");
  });

  it('refuses a DC SPD without an Iscpv rating', () => {
    const project = buildFullProject();
    project.protections!.dcSpd.iscpvKA = null;
    const result = buildEngineInput(project, FIXTURE_NOW);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.missing[0]).toContain('Iscpv');
  });
});

describe('computeSectionStatuses', () => {
  it('marks filled sections complete and reports the simulation and map as still to do', () => {
    const statuses = computeSectionStatuses(buildFullProject());
    const byKey = Object.fromEntries(statuses.map((s) => [s.key, s.complete]));
    expect(byKey).toEqual({
      client: true,
      site: true,
      map: false,
      array: true,
      protections: true,
      cabling: true,
      structure: true,
      earthing: true,
      simulation: false,
      annexes: true,
    });
    expect(statuses.find((s) => s.key === 'array')?.summary).toBe(
      '5 modules LONGi LR7-72HGD-620M, 1 onduleur(s)',
    );
  });

  it('requires STEG reference and address before the client section counts as complete', () => {
    const project = buildFullProject();
    project.client!.stegReference = null;
    expect(computeSectionStatuses(project).find((s) => s.key === 'client')?.complete).toBe(false);
  });

  it('annexes section is always complete (optional, not an engine input) and summarizes attached file count', () => {
    const noAnnexes = computeSectionStatuses(buildFullProject());
    expect(noAnnexes.find((s) => s.key === 'annexes')?.complete).toBe(true);
    expect(noAnnexes.find((s) => s.key === 'annexes')?.summary).toBeNull();

    const withAnnexes = computeSectionStatuses(
      buildFullProject({
        annexes: {
          id: 'annexes-1', projectId: 'project-1', cinFileId: 'file-1', commercialRegisterFileId: null,
          stegContractFileId: 'file-2', lastPaidBillFileId: null, extraFiles: [{ id: 'extra-1', annexesId: 'annexes-1', fileId: 'file-3' }],
        },
      }),
    );
    expect(withAnnexes.find((s) => s.key === 'annexes')?.summary).toBe('3 fichier(s)');
  });
});
