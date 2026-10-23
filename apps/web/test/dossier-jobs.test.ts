import { describe, it, expect } from 'vitest';
import {
  derivePipelineSteps,
  jobProgressPercent,
  jobWarnings,
  parseJobSnapshot,
  snapshotDraftMissing,
  summarizeSnapshot,
  toJobProgressView,
  CANCELLED_BY_INSTALLER_REASON,
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
    dossierNumber: project.dossierNumber ?? null,
    dossierDate: (project.dossierDate ?? FIXTURE_NOW).toISOString(),
    capturedAt: FIXTURE_NOW.toISOString(),
    client: project.client,
    consumption: null,
    site: project.site,
    arrayConfig: project.arrayConfig,
    protections: project.protections,
    cablingConfig: project.cablingConfig,
    cableRuns: project.cableRuns,
    structure: project.structure,
    earthing: project.earthing,
    engineInput: result.input,
    projectMeta: result.meta,
    draftMissing: [],
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

  it("maps the worker's finer failure keys to the step they belong to", () => {
    const failed = (failedStep: string): string | undefined =>
      derivePipelineSteps({ status: 'FAILED', failedStep }).find((s) => s.state === 'failed')?.key;
    expect(failed('simulation-report')).toBe('drawings');
    expect(failed('map-pages')).toBe('drawings');
    expect(failed('page-37-layout')).toBe('drawings');
    expect(failed('toc')).toBe('annexes');
    expect(failed('assembly')).toBe('annexes');
  });

  it('marks the steps before the reported progress done and the reported one running', () => {
    expect(
      derivePipelineSteps({ status: 'RUNNING', failedStep: null, progressStep: 'pdf' }).map((s) => s.state),
    ).toEqual(['done', 'done', 'done', 'done', 'running', 'pending', 'pending', 'pending']);
    // A worker that has not reported a step yet (or an unknown one): the first step runs.
    for (const progressStep of [null, 'inconnu']) {
      expect(derivePipelineSteps({ status: 'RUNNING', failedStep: null, progressStep }).map((s) => s.state)[0]).toBe(
        'running',
      );
    }
  });
});

describe('jobProgressPercent', () => {
  const running = (progressStep: string, seconds: number | null): number =>
    jobProgressPercent({ status: 'RUNNING', progressStep }, seconds === null ? null : seconds * 1000);

  it('is 0 while queued and 100 once succeeded', () => {
    expect(jobProgressPercent({ status: 'PENDING', progressStep: null }, null)).toBe(0);
    expect(jobProgressPercent({ status: 'SUCCEEDED', progressStep: 'save' }, 1000)).toBe(100);
  });

  it('grows within a step and from one step to the next', () => {
    expect(running('text', 0)).toBeLessThan(running('text', 20));
    expect(running('text', 20)).toBeLessThan(running('text', 600));
    // However long a step takes, the next one starts further on.
    expect(running('text', 3600)).toBeLessThan(running('docx', 0));
    expect(running('pdf', 0)).toBeLessThan(running('drawings', 0));
  });

  it('stays within 1–99 while running', () => {
    expect(running('snapshot', null)).toBe(1);
    expect(running('save', 3600)).toBe(99);
  });
});

describe('toJobProgressView', () => {
  const now = new Date('2026-10-23T10:00:00Z');

  it('measures the durations at the given server time and flags an installer cancellation', () => {
    const view = toJobProgressView(
      {
        id: 'job-1',
        projectId: 'project-1',
        status: 'FAILED',
        failedStep: null,
        failureReason: CANCELLED_BY_INSTALLER_REASON,
        progressStep: null,
        progressAt: null,
        startedAt: new Date(now.getTime() - 5000),
        project: { client: null },
      },
      now,
    );
    expect(view).toMatchObject({ clientName: 'Projet', cancelled: true, elapsedMs: 5000, stepElapsedMs: null, asOf: now.getTime() });
  });

  it('gives the time spent in the current step', () => {
    const view = toJobProgressView(
      {
        id: 'job-1',
        projectId: 'project-1',
        status: 'RUNNING',
        failedStep: null,
        failureReason: null,
        progressStep: 'text',
        progressAt: new Date(now.getTime() - 12_000),
        startedAt: new Date(now.getTime() - 20_000),
        project: { client: { fullName: 'Ali Ben Salah' } },
      },
      now,
    );
    expect(view).toMatchObject({ clientName: 'Ali Ben Salah', cancelled: false, progressStep: 'text', stepElapsedMs: 12_000 });
  });
});

describe('jobWarnings', () => {
  it('reads the worker warnings and drops anything that is not a string', () => {
    expect(jobWarnings(['Annexe N°14 — Fiche technique X : document illisible, non joint au dossier.', 3, null, ''])).toEqual([
      'Annexe N°14 — Fiche technique X : document illisible, non joint au dossier.',
    ]);
    expect(jobWarnings(null)).toEqual([]);
    expect(jobWarnings({ a: 1 })).toEqual([]);
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

  it('omits the frame count from the structure summary when it was not entered', () => {
    const snapshot = fixtureSnapshot();
    snapshot.structure = { ...snapshot.structure!, frameCount: null };
    expect(summarizeSnapshot(snapshot).structure).toBe('ALUMINIUM, vent 120 km/h');
  });

  it('falls back to projectMeta for the inverter label when the by-value rows are absent', () => {
    const snapshot = fixtureSnapshot();
    snapshot.arrayConfig = null;
    expect(summarizeSnapshot(snapshot).inverters[0]?.label).toBe('Sofar 1-4KTL2-G3');
  });
});

describe('snapshotDraftMissing', () => {
  it('reads the missing STEG pieces, and nothing from an older snapshot', () => {
    expect(snapshotDraftMissing({ ...fixtureSnapshot(), draftMissing: ['Copie de la CIN du titulaire', 3] })).toEqual([
      'Copie de la CIN du titulaire',
    ]);
    expect(snapshotDraftMissing({ version: 1 })).toEqual([]);
    expect(snapshotDraftMissing(null)).toEqual([]);
  });
});
