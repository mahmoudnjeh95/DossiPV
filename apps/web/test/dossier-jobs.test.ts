import { describe, it, expect } from 'vitest';
import {
  derivePipelineSteps,
  parseJobSnapshot,
  summarizeSnapshot,
  PIPELINE_STEPS,
} from '../lib/dossier-jobs';
import { buildEngineInput } from '../lib/project-engine-input';
import { buildFullProject, FIXTURE_NOW } from './fixtures/full-project';
import type { DossierJobSnapshotV1 } from '../app/(app)/projects/[id]/actions';

function fixtureSnapshot(): DossierJobSnapshotV1 {
  const project = buildFullProject();
  const result = buildEngineInput(project, FIXTURE_NOW);
  if (!result.ok) {
    throw new Error(result.missing.join(' '));
  }
  return {
    version: 1,
    projectId: project.id,
    companyId: project.companyId,
    tier: project.tier,
    capturedAt: FIXTURE_NOW.toISOString(),
    client: project.client,
    site: project.site,
    arrayConfig: project.arrayConfig,
    protections: project.protections,
    cablingConfig: project.cablingConfig,
    cableRuns: project.cableRuns,
    structure: project.structure,
    earthing: project.earthing,
    engineInput: result.input,
    projectMeta: result.meta,
  };
}

describe('derivePipelineSteps', () => {
  it('marks every step done for a succeeded job and pending for a queued one', () => {
    expect(
      derivePipelineSteps({ status: 'SUCCEEDED', failedStep: null }).every(
        (s) => s.state === 'done',
      ),
    ).toBe(true);
    expect(
      derivePipelineSteps({ status: 'PENDING', failedStep: null }).every(
        (s) => s.state === 'pending',
      ),
    ).toBe(true);
  });

  it('marks steps before the failed one done, the failed one failed, the rest pending', () => {
    const states = derivePipelineSteps({ status: 'FAILED', failedStep: 'text' }).map(
      (s) => s.state,
    );
    expect(states).toEqual([
      'done',
      'done',
      'failed',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('accepts the French label and a substring match for failedStep', () => {
    expect(
      derivePipelineSteps({ status: 'FAILED', failedStep: 'Conversion PDF' }).find(
        (s) => s.key === 'pdf',
      )?.state,
    ).toBe('failed');
    expect(
      derivePipelineSteps({ status: 'FAILED', failedStep: 'pvgis-simulation fetch' }).find(
        (s) => s.key === 'simulation',
      )?.state,
    ).toBe('failed');
  });

  it('leaves everything pending for an unrecognised failed step rather than guessing', () => {
    const steps = derivePipelineSteps({ status: 'FAILED', failedStep: 'quelque chose' });
    expect(steps.every((s) => s.state === 'pending')).toBe(true);
    expect(steps).toHaveLength(PIPELINE_STEPS.length);
  });
});

describe('parseJobSnapshot', () => {
  it('accepts the shape the generate action writes, after a JSON round trip', () => {
    const parsed = parseJobSnapshot(JSON.parse(JSON.stringify(fixtureSnapshot())));
    expect(parsed?.projectId).toBe('project-1');
    expect(parsed?.engineInput.tMinC).toBe(-10);
  });

  it('rejects other shapes without throwing', () => {
    expect(parseJobSnapshot(null)).toBeNull();
    expect(parseJobSnapshot({ note: 'seed placeholder snapshot' })).toBeNull();
    expect(
      parseJobSnapshot({ version: 2, projectId: 'x', engineInput: {}, projectMeta: {} }),
    ).toBeNull();
    expect(
      parseJobSnapshot({
        version: 1,
        projectId: 'x',
        engineInput: { module: {} },
        projectMeta: {},
      }),
    ).toBeNull();
  });
});

describe('summarizeSnapshot', () => {
  it('flattens the frozen data into display rows', () => {
    const summary = summarizeSnapshot(fixtureSnapshot());
    expect(summary).toMatchObject({
      moduleBrandModel: 'LONGi LR7-72HGD-620M',
      moduleCount: 5,
      dcPowerW: 3100,
      tMinC: -10,
      tMaxC: 85,
      phases: 1,
      dossierDate: '2026-10-03',
    });
    expect(summary.inverters).toEqual([{ label: 'Sofar 1-4KTL2-G3', mppts: [{ ns: 5, np: 1 }] }]);
    expect(summary.protections.find((p) => p.label === 'Fusibles DC')?.value).toBe('Non requis');
    expect(summary.cableRuns[0]).toEqual({
      label: 'DC · Modules → onduleur',
      detail: 'Generic H1Z2Z2-K · 6 mm² · 20 m · pose 13',
    });
    expect(summary.structure).toBe('ALUMINIUM, 5 châssis, vent 120 km/h');
    expect(summary.earthing).toContain('3 piquet(s)');
  });

  it('falls back to projectMeta for the inverter label when the by-value rows are absent', () => {
    const snapshot = fixtureSnapshot();
    snapshot.arrayConfig = null;
    expect(summarizeSnapshot(snapshot).inverters[0]?.label).toBe('Sofar 1-4KTL2-G3');
  });
});
