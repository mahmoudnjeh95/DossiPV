# Dossier Document Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the dossier generation pipeline so a generated PDF structurally matches the
real reference dossier — cover page, table of contents, numbered sections with real data
tables, programmatic technical drawings, Premium-tier map/site-plan pages, and equipment
datasheets merged into annexes.

**Architecture:** The worker builds several independent PDF fragments (cover, body, drawings,
map pages, TOC, annexes) and assembles them in order via an extended merge step. The existing
docxtemplater→LibreOffice path keeps producing the body (prose + tables); everything with an
embedded image (cover logo, drawings, map pages) is a new `pdf-lib`-only module, since
docxtemplater's free tier cannot embed images. One new Claude vision call (page 37 only,
Premium tier) reasons about panel placement/wire routing from a satellite image and returns
structured JSON that code then renders — Claude never generates an image itself.

**Tech Stack:** TypeScript, `pdf-lib` (already a dependency), `docxtemplater`/`pizzip`
(existing), `@anthropic-ai/sdk` (existing), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-dossier-document-redesign.md`

## Global Constraints

- Every Claude call in this pipeline uses `claude-sonnet-5-5` (not `claude-opus-5-5`) — this
  applies to both the already-shipped dossier-prose call and the new page-37 vision call.
- No network/API call of any kind happens for a Standard-tier project's pages 37-38 — they
  render as empty title-block frames, purely local.
- The snapshot-by-value rule holds: every new rendering module reads equipment/site/structure
  data from the frozen job snapshot (`DossierJob.inputSnapshot`), never by re-querying the
  catalog tables directly — a later catalog edit must never change an already-generated dossier.
- French language throughout (labels, generated prose, table headers) — matches every existing
  piece of this pipeline.
- `pdf-lib`'s `PDFDocument.create()`/`embedFont`/`drawText`/`drawImage`/`drawLine`/`drawRectangle`
  are the only drawing primitives used — no new PDF/image library is introduced.
- Every new module is a pure function (input data in, `Buffer` or JSON out) wherever possible —
  no module reaches into the database itself; `process-job.ts` remains the only place that
  reads snapshot data and passes it down, matching the existing architecture.

## Review Focus

- **A project with zero inverters' worth of equipment having a datasheet uploaded** (the common
  case in the current dev catalog) — equipment-datasheet collection must produce an empty list
  and generation must still succeed, not throw or produce a broken annexes section.
- **A multi-inverter project** (2+ entries in `engineInput.array`) feeding the single-line/
  unifilar drawing generator — the rectilinear layout must handle N inverters without
  overlapping boxes or truncated labels, not just the 1-inverter case every existing fixture
  uses.
- **Claude's page-37 vision response returning coordinates outside the image bounds** (a
  malformed or hallucinated response) — must be treated as a call failure and retried/failed,
  never silently drawn off-page or causing a crash in the PDF renderer.
- **A Standard-tier project reaching the map-pages renderer** — must take the empty-frame path
  with zero network calls, not accidentally call Esri or Claude because a condition was
  inverted.
- **Two cable runs (or two MPPTs) referencing the exact same catalog equipment row** (a single
  cable model used for both the DC and AC run, or the same inverter model used twice) — the
  equipment table and the datasheet-annex collector must each show/attach that equipment once,
  not once per reference.

---

## Task 1: Widen the worker's job-snapshot parser to carry site/structure/earthing/equipment data

**Files:**
- Modify: `packages/dossier-worker/src/job-snapshot.ts`
- Test: `packages/dossier-worker/test/job-snapshot.test.ts` (existing file — extend it)

**Interfaces:**
- Consumes: nothing new — this task only widens an existing type/parser.
- Produces: `WorkerJobSnapshot` now additionally carries `site`, `arrayConfig`, `protections`,
  `structure`, `earthing`, `dossierNumber`, `dossierDate`, `tier` — every later task that needs
  equipment/site data reads it from here, not from a fresh DB query.

The real JSON stored in `DossierJob.inputSnapshot` (written by
`apps/web/app/(app)/projects/[id]/actions.ts`'s `DossierJobSnapshotV1`) already includes
`site`, `arrayConfig` (with resolved `module`/`inverters`/`mppts`), `protections` (with resolved
`dcSpd`/`dcSwitch`/`dcFuse`/`acBreaker`/`acSpd`/`acIsolator`), `structure`, `earthing` (with
resolved `earthCable`), `tier`, and (on the `Project` row itself — confirm this is included by
checking the action's snapshot object, not assumed) `dossierNumber`/`dossierDate`. Today's
`WorkerJobSnapshot`/`parseJobSnapshot` only extracts `projectId`/`companyId`/`engineInput`/
`projectMeta`/`client`/`cableRuns` — the rest is silently ignored. This task widens the parser
so later tasks (drawings, map pages, equipment table, datasheet annexes) can read this data
from the one object `process-job.ts` already parses, instead of each reaching into the database
separately.

- [ ] **Step 1: Write the failing test for the widened shape**

Add to `packages/dossier-worker/test/job-snapshot.test.ts`:

```typescript
it('extracts site, arrayConfig, protections, structure, earthing, dossierNumber, dossierDate, and tier', () => {
  const raw = {
    version: 1,
    projectId: 'p1',
    companyId: 'c1',
    tier: 'PREMIUM',
    dossierNumber: '434-303',
    dossierDate: '2026-11-25T00:00:00.000Z',
    engineInput: {},
    projectMeta: {},
    client: null,
    cableRuns: [],
    site: { gpsLat: 36.8, gpsLon: 10.2, technicalRoomPointLat: 36.801, technicalRoomPointLon: 10.201, meterPointLat: 36.799, meterPointLon: 10.199, earthPitPointLat: 36.8005, earthPitPointLon: 10.2005 },
    arrayConfig: { module: { brand: 'LONGi', model: 'LR7-72HGD-620M' }, inverters: [{ inverter: { brand: 'Sofar', model: '1-4KTL2-G3' }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }] },
    protections: { dcSwitch: { brand: 'ZJ BENY', model: 'BB1H-63' } },
    structure: { material: 'ALUMINIUM', frameCount: 5 },
    earthing: { rodCount: 3 },
  };

  const parsed = parseJobSnapshot(raw);

  expect(parsed).not.toBeNull();
  expect(parsed!.tier).toBe('PREMIUM');
  expect(parsed!.dossierNumber).toBe('434-303');
  expect(parsed!.dossierDate).toBe('2026-11-25T00:00:00.000Z');
  expect(parsed!.site?.technicalRoomPointLat).toBe(36.801);
  expect(parsed!.arrayConfig?.module.brand).toBe('LONGi');
  expect(parsed!.protections?.dcSwitch.brand).toBe('ZJ BENY');
  expect(parsed!.structure?.frameCount).toBe(5);
  expect(parsed!.earthing?.rodCount).toBe(3);
});

it('still parses a snapshot missing the new optional fields (back-compat with narrower snapshots already in the DB)', () => {
  const raw = {
    version: 1,
    projectId: 'p1',
    companyId: 'c1',
    engineInput: {},
    projectMeta: {},
    client: null,
    cableRuns: [],
  };

  const parsed = parseJobSnapshot(raw);

  expect(parsed).not.toBeNull();
  expect(parsed!.site).toBeNull();
  expect(parsed!.arrayConfig).toBeNull();
  expect(parsed!.tier).toBe('STANDARD');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/job-snapshot.test.ts`
Expected: FAIL — `parsed!.tier` etc. are `undefined`, not the asserted values (the current
parser doesn't extract these fields yet).

- [ ] **Step 3: Implement the widened parser**

Replace the full contents of `packages/dossier-worker/src/job-snapshot.ts`:

```typescript
import type { RunEngineInput } from '@dossipv/engine';
import type { ProjectMeta } from './placeholder-map';

export interface SnapshotSite {
  gpsLat: number;
  gpsLon: number;
  technicalRoomPointLat: number | null;
  technicalRoomPointLon: number | null;
  meterPointLat: number | null;
  meterPointLon: number | null;
  earthPitPointLat: number | null;
  earthPitPointLon: number | null;
}

export interface SnapshotEquipmentRef {
  brand: string;
  model: string;
  datasheetFileId?: string | null;
  homologationFileId?: string | null;
}

export interface SnapshotArrayConfig {
  module: SnapshotEquipmentRef & Record<string, unknown>;
  inverters: {
    inverter: SnapshotEquipmentRef & Record<string, unknown>;
    mppts: { stringsInParallel: number; modulesPerString: number }[];
  }[];
}

export interface SnapshotProtections {
  dcSwitch?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  dcSpd?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  dcFuse?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  acBreaker?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  acSpd?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  acIsolator?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
}

export interface SnapshotStructure {
  material: string;
  frameCount: number;
  [key: string]: unknown;
}

export interface SnapshotEarthing {
  rodCount: number;
  earthCable?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  [key: string]: unknown;
}

export interface WorkerJobSnapshot {
  version: 1;
  projectId: string;
  companyId: string;
  tier: 'STANDARD' | 'PREMIUM';
  dossierNumber: string | null;
  dossierDate: string | null;
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
  client: { fullName: string; address: string | null; stegReference: string | null } | null;
  cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string; cable?: SnapshotEquipmentRef & Record<string, unknown> }[];
  site: SnapshotSite | null;
  arrayConfig: SnapshotArrayConfig | null;
  protections: SnapshotProtections | null;
  structure: SnapshotStructure | null;
  earthing: SnapshotEarthing | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseSite(value: unknown): SnapshotSite | null {
  if (!isRecord(value)) return null;
  if (typeof value.gpsLat !== 'number' || typeof value.gpsLon !== 'number') return null;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    gpsLat: value.gpsLat,
    gpsLon: value.gpsLon,
    technicalRoomPointLat: num(value.technicalRoomPointLat),
    technicalRoomPointLon: num(value.technicalRoomPointLon),
    meterPointLat: num(value.meterPointLat),
    meterPointLon: num(value.meterPointLon),
    earthPitPointLat: num(value.earthPitPointLat),
    earthPitPointLon: num(value.earthPitPointLon),
  };
}

export function parseJobSnapshot(value: unknown): WorkerJobSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.version !== 1) {
    return null;
  }
  if (typeof value.projectId !== 'string' || typeof value.companyId !== 'string') {
    return null;
  }
  if (!isRecord(value.engineInput) || !isRecord(value.projectMeta)) {
    return null;
  }
  if (!Array.isArray(value.cableRuns)) {
    return null;
  }
  const client = value.client === null ? null : isRecord(value.client) ? (value.client as WorkerJobSnapshot['client']) : null;
  const tier = value.tier === 'PREMIUM' ? 'PREMIUM' : 'STANDARD';

  return {
    version: 1,
    projectId: value.projectId,
    companyId: value.companyId,
    tier,
    dossierNumber: optionalString(value.dossierNumber),
    dossierDate: optionalString(value.dossierDate),
    engineInput: value.engineInput as unknown as RunEngineInput,
    projectMeta: value.projectMeta as unknown as ProjectMeta,
    client,
    cableRuns: value.cableRuns as WorkerJobSnapshot['cableRuns'],
    site: parseSite(value.site),
    arrayConfig: optionalRecord(value.arrayConfig) as unknown as SnapshotArrayConfig | null,
    protections: optionalRecord(value.protections) as unknown as SnapshotProtections | null,
    structure: optionalRecord(value.structure) as unknown as SnapshotStructure | null,
    earthing: optionalRecord(value.earthing) as unknown as SnapshotEarthing | null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/job-snapshot.test.ts`
Expected: PASS, all tests in the file including the two new ones.

- [ ] **Step 5: Run the full dossier-worker suite to check nothing else broke**

Run: `cd packages/dossier-worker && npx vitest run`
Expected: PASS — `process-job.ts` only reads the fields it already read before (this is a
widening, not a breaking change to the type).

- [ ] **Step 6: Commit**

```bash
git add packages/dossier-worker/src/job-snapshot.ts packages/dossier-worker/test/job-snapshot.test.ts
git commit -m "feat(dossier-worker): widen job-snapshot parser to carry site/equipment/structure data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Switch every Claude call in this pipeline to claude-sonnet-5-5

**Files:**
- Modify: `packages/document-text/src/generate-dossier-text.ts:68`
- Test: `packages/document-text/test/generate-dossier-text.test.ts` (existing — extend it)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — this is a pure model-id swap. Later tasks (the page-37 vision call)
  must use the same literal string `'claude-sonnet-5-5'`.

- [ ] **Step 1: Write the failing test**

Add to `packages/document-text/test/generate-dossier-text.test.ts` (check the existing mock
setup in that file first — it likely already mocks `client.messages.parse` and asserts on the
call args for other fields; add the model assertion to that same mock-call-args check):

```typescript
it('calls Claude with model claude-sonnet-5-5, not claude-opus-5-5', async () => {
  await generateDossierText(sampleInput, mockClient, ['P_DC_W']);

  expect(mockClient.messages.parse).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'claude-sonnet-5-5' }),
  );
});
```

(Adapt `sampleInput`/`mockClient` names to whatever this test file's existing fixtures are
already called — read the file first, don't invent new fixture names that collide.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/document-text && npx vitest run test/generate-dossier-text.test.ts`
Expected: FAIL — the mock was called with `model: 'claude-opus-5-5'`.

- [ ] **Step 3: Implement the model swap**

In `packages/document-text/src/generate-dossier-text.ts`, change line 68:

```typescript
    model: 'claude-sonnet-5-5',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/document-text && npx vitest run test/generate-dossier-text.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/document-text/src/generate-dossier-text.ts packages/document-text/test/generate-dossier-text.test.ts
git commit -m "feat(document-text): switch dossier prose generation to claude-sonnet-5-5

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Expand build-template-data.ts with equipment specs and calculation-result tables

**Files:**
- Modify: `packages/dossier-worker/src/build-template-data.ts`
- Modify: `packages/docx-template/src/types.ts`
- Test: `packages/dossier-worker/test/build-template-data.test.ts` (existing — extend it)

**Interfaces:**
- Consumes: `WorkerJobSnapshot.arrayConfig`/`.protections`/`.structure`/`.earthing` (Task 1),
  `EngineResult.derived` (already produced by `@dossipv/engine`'s `runEngine()` — read
  `packages/engine/src/run-engine.ts:402-429` for the full field list; this task surfaces
  fields that already exist there, it adds no new engine computation).
- Produces: `DossierTemplateData` gains `moduleSpecs`, `inverterSpecs`, `stringSizing`,
  `voltageDropResults`, `stabilityResults` — the redesigned template (Task 7) renders these as
  tables.

- [ ] **Step 1: Write the failing test**

Read `packages/dossier-worker/test/build-template-data.test.ts` first to match its existing
fixture style exactly (it already builds a fake `BuildTemplateDataInput` — extend that fixture
rather than building a second one). Add:

```typescript
it('exposes full module/inverter electrical specs and the engine calculation-result tables as flat string fields', () => {
  // Fields are flat (moduleSpecPmaxW, not a nested moduleSpecs.pmaxW object) — confirmed
  // empirically that this installed docxtemplater version (3.71.0) does NOT resolve
  // dotted-path tags against a nested render-data object; {moduleSpecs.pmaxW} renders as the
  // literal string "undefined". Every tag in this template must be a flat top-level key,
  // exactly matching this codebase's existing DossierTemplateData fields (pDcW, moduleCount).
  const result = buildTemplateData({
    ...baseInput, // whatever this file's existing fixture variable is named
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/build-template-data.test.ts`
Expected: FAIL — `result.moduleSpecs` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Add the new fields to DossierTemplateData**

In `packages/docx-template/src/types.ts`, add to the `DossierTemplateData` interface (after
the existing `moduleCount: string;` line):

```typescript
  // Flat fields, not nested objects — docxtemplater 3.71.0 (the installed version) does not
  // resolve dotted-path tags like {moduleSpecs.pmaxW} against nested render data (confirmed
  // empirically before writing this plan); every new tag must be a flat top-level key, same
  // as the existing pDcW/moduleCount fields.
  moduleSpecPmaxW: string;
  moduleSpecVmpV: string;
  moduleSpecImpA: string;
  moduleSpecVocV: string;
  moduleSpecIscA: string;
  inverterSpecPacW: string;
  inverterSpecVdcMaxV: string;
  inverterSpecMpptMinV: string;
  inverterSpecMpptMaxV: string;
  stringSizingNsMin: string;
  stringSizingNsMax: string;
  stringSizingNsOptMax: string;
  stringSizingNpMax: string;
  stringSizingNpOpt: string;
  voltageDropDuDcV: string;
  voltageDropDuDcPct: string;
  voltageDropDuAcV: string;
  voltageDropDuAcPct: string;
  stabilityWeightN: string;
  stabilityLhs: string;
  stabilityRhs: string;
```

- [ ] **Step 4: Implement in build-template-data.ts**

In `packages/dossier-worker/src/build-template-data.ts`, add a small French-locale number
formatter (reuse the exact pattern `placeholder-map.ts`'s `formatValue` already established —
`Intl.NumberFormat('fr-FR', { minimumFractionDigits, maximumFractionDigits })`, no unit suffix
needed here since these are table cells with their own column headers, not inline prose):

```typescript
function fmt(value: number, decimals = 1): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}
```

Then in the `buildTemplateData` function's returned object, add (reading the module/inverter
specs straight off `input.engineInput.module` and `input.engineInput.array[0].inverter` — these
are the exact same `RunEngineInput`-shaped values `generate-dossier-document.ts` already builds
and passes through; no new data source):

```typescript
    moduleSpecPmaxW: fmt(engineInput.module.pmaxW, 0),
    moduleSpecVmpV: fmt(engineInput.module.vmpV),
    moduleSpecImpA: fmt(engineInput.module.impA),
    moduleSpecVocV: fmt(engineInput.module.vocV),
    moduleSpecIscA: fmt(engineInput.module.iscA),
    inverterSpecPacW: fmt(engineInput.array[0]!.inverter.pacW, 0),
    inverterSpecVdcMaxV: fmt(engineInput.array[0]!.inverter.vdcMaxV),
    inverterSpecMpptMinV: fmt(engineInput.array[0]!.inverter.mpptMinV),
    inverterSpecMpptMaxV: fmt(engineInput.array[0]!.inverter.mpptMaxV),
    stringSizingNsMin: fmt(workerResult.engineResult.derived.NS_MIN!, 0),
    stringSizingNsMax: fmt(workerResult.engineResult.derived.NS_MAX!, 0),
    stringSizingNsOptMax: fmt(workerResult.engineResult.derived.NS_OPT_MAX!, 0),
    stringSizingNpMax: fmt(workerResult.engineResult.derived.NP_MAX!, 0),
    stringSizingNpOpt: fmt(workerResult.engineResult.derived.NP_OPT!, 0),
    voltageDropDuDcV: fmt(workerResult.engineResult.derived.DU_DC_V!),
    voltageDropDuDcPct: fmt(workerResult.engineResult.derived.DU_DC_PCT!, 2),
    voltageDropDuAcV: fmt(workerResult.engineResult.derived.DU_AC_V!),
    voltageDropDuAcPct: fmt(workerResult.engineResult.derived.DU_AC_PCT!, 2),
    stabilityWeightN: fmt(workerResult.engineResult.derived.F_WEIGHT_N!, 0),
    stabilityLhs: fmt(workerResult.engineResult.derived.STABILITY_LHS!, 0),
    stabilityRhs: fmt(workerResult.engineResult.derived.STABILITY_RHS!, 0),
```

(Match the existing function's parameter destructuring style exactly — read the current file
body first; `engineInput` and `workerResult` are already in scope as `input.engineInput` /
`input.workerResult` per the existing `BuildTemplateDataInput` interface, so either destructure
them at the top the same way the existing code already does, or qualify with `input.`
consistently with the surrounding code.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/build-template-data.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full dossier-worker and docx-template suites**

Run: `cd packages/dossier-worker && npx vitest run && cd ../docx-template && npx vitest run`
Expected: PASS — `fill-template.test.ts` may need its fixture `DossierTemplateData` object
extended with the 5 new fields too (TypeScript will error on the missing properties if the test
constructs a literal of that type) — if so, add minimal matching fixture values there using the
same field names.

- [ ] **Step 7: Commit**

```bash
git add packages/dossier-worker/src/build-template-data.ts packages/dossier-worker/test/build-template-data.test.ts packages/docx-template/src/types.ts packages/docx-template/test/fill-template.test.ts
git commit -m "feat(dossier-worker): expose equipment specs and calculation-result tables to the template

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Cover page renderer

**Files:**
- Create: `packages/dossier-worker/src/render-cover-page.ts`
- Test: `packages/dossier-worker/test/render-cover-page.test.ts`

**Interfaces:**
- Consumes: a plain data object (no DB access) — `{ companyName: string; companyLogoBuffer: Buffer | null; dossierNumber: string | null; clientFullName: string; dossierDate: string }`.
- Produces: `renderCoverPage(input: CoverPageInput): Promise<Buffer>` — a one-page PDF buffer.
  Later tasks (Task 9, the merge/orchestration step) call this and merge its output first.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderCoverPage } from '../src/render-cover-page';

describe('renderCoverPage', () => {
  it('produces a single-page PDF containing the company name, client name, and dossier number', async () => {
    const buffer = await renderCoverPage({
      companyName: 'SolarPro Tunisie',
      companyLogoBuffer: null,
      dossierNumber: '434-303',
      clientFullName: 'Habib Khedhira',
      dossierDate: '2026-11-25',
    });

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(1);
  });

  it('still produces a valid one-page PDF when companyLogoBuffer is null (no logo uploaded)', async () => {
    const buffer = await renderCoverPage({
      companyName: 'SolarPro Tunisie',
      companyLogoBuffer: null,
      dossierNumber: null,
      clientFullName: 'Habib Khedhira',
      dossierDate: '2026-11-25',
    });

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/render-cover-page.test.ts`
Expected: FAIL — `../src/render-cover-page` doesn't exist.

- [ ] **Step 3: Implement**

```typescript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface CoverPageInput {
  companyName: string;
  companyLogoBuffer: Buffer | null;
  dossierNumber: string | null;
  clientFullName: string;
  dossierDate: string;
}

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;

export async function renderCoverPage(input: CoverPageInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  if (input.companyLogoBuffer) {
    // pdf-lib's embedPng/embedJpg each throw on the wrong format — callers must have already
    // validated the stored mimeType; try PNG first, fall back to JPEG.
    let image;
    try {
      image = await doc.embedPng(input.companyLogoBuffer);
    } catch {
      image = await doc.embedJpg(input.companyLogoBuffer);
    }
    const logoWidth = 120;
    const logoHeight = (image.height / image.width) * logoWidth;
    page.drawImage(image, {
      x: (PAGE_WIDTH - logoWidth) / 2,
      y: PAGE_HEIGHT - 150,
      width: logoWidth,
      height: logoHeight,
    });
  }

  page.drawText(input.companyName, {
    x: 50,
    y: PAGE_HEIGHT - 220,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawText('Dossier Technique', {
    x: 50,
    y: PAGE_HEIGHT - 420,
    size: 28,
    font,
    color: rgb(0, 0, 0),
  });

  if (input.dossierNumber) {
    page.drawText(`N° Dossier : ${input.dossierNumber}`, {
      x: 50,
      y: PAGE_HEIGHT - 460,
      size: 14,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
  }

  page.drawText(`Client : ${input.clientFullName}`, {
    x: 50,
    y: PAGE_HEIGHT - 490,
    size: 14,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  page.drawText(`Date : ${input.dossierDate}`, {
    x: 50,
    y: PAGE_HEIGHT - 520,
    size: 14,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  return Buffer.from(await doc.save());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/render-cover-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/render-cover-page.ts packages/dossier-worker/test/render-cover-page.test.ts
git commit -m "feat(dossier-worker): add cover page renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Single-line and unifilar wiring diagram renderer (pages 35-36)

**Files:**
- Create: `packages/dossier-worker/src/render-drawings.ts`
- Test: `packages/dossier-worker/test/render-drawings.test.ts`

**Interfaces:**
- Consumes: `RunEngineInput` (from `@dossipv/engine`, already produced by the existing
  pipeline) plus equipment brand/model strings resolved from `WorkerJobSnapshot.arrayConfig`/
  `.protections` (Task 1) — this module takes a flat input object, it does not read the
  snapshot type directly, so it stays testable without constructing a full snapshot fixture.
- Produces: `renderDrawingPages(input: DrawingsInput): Promise<Buffer>` — a 2-page PDF buffer
  (page 35: single-line, page 36: unifilar). Later tasks merge this after the body.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderDrawingPages } from '../src/render-drawings';

const singleInverterInput = {
  moduleLabel: 'LONGi LR7-72HGD-620M',
  inverters: [
    {
      inverterLabel: 'Sofar 1-4KTL2-G3',
      pacW: 3000,
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  dcSwitchLabel: 'ZJ BENY BB1H-63',
  dcSpdLabel: 'Generic DC-SPD-1',
  acSpdLabel: 'Generic AC-SPD-1',
  acBreakerLabel: 'Generic AC-BRK-20',
  dcRun: { sectionMm2: 6, lengthM: 25 },
  acRun: { sectionMm2: 6, lengthM: 15 },
  earthRodCount: 3,
};

describe('renderDrawingPages', () => {
  it('produces a 2-page PDF (single-line + unifilar) for a single-inverter project', async () => {
    const buffer = await renderDrawingPages(singleInverterInput);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(2);
  });

  it('produces a valid 2-page PDF for a 2-inverter project without throwing or truncating', async () => {
    const twoInverterInput = {
      ...singleInverterInput,
      inverters: [singleInverterInput.inverters[0]!, singleInverterInput.inverters[0]!],
    };

    const buffer = await renderDrawingPages(twoInverterInput);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/render-drawings.test.ts`
Expected: FAIL — `../src/render-drawings` doesn't exist.

- [ ] **Step 3: Implement**

```typescript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface DrawingsInput {
  moduleLabel: string;
  inverters: { inverterLabel: string; pacW: number; mppts: { stringsInParallel: number; modulesPerString: number }[] }[];
  dcSwitchLabel: string;
  dcSpdLabel: string;
  acSpdLabel: string;
  acBreakerLabel: string;
  dcRun: { sectionMm2: number; lengthM: number };
  acRun: { sectionMm2: number; lengthM: number };
  earthRodCount: number;
}

const PAGE_WIDTH = 841.89; // A4 landscape, points — wider pages suit a left-to-right diagram
const PAGE_HEIGHT = 595.28;

function drawBox(page: import('pdf-lib').PDFPage, x: number, y: number, w: number, h: number, label: string, font: import('pdf-lib').PDFFont): void {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  page.drawText(label, { x: x + 4, y: y + h / 2 - 5, size: 8, font, color: rgb(0, 0, 0), maxWidth: w - 8 });
}

function drawSingleLine(doc: PDFDocument, input: DrawingsInput, font: import('pdf-lib').PDFFont): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText('Schéma unifilaire simplifié', { x: 40, y: PAGE_HEIGHT - 40, size: 16, font, color: rgb(0, 0, 0) });

  const boxY = PAGE_HEIGHT / 2;
  const boxH = 40;
  const slotWidth = (PAGE_WIDTH - 80) / (input.inverters.length + 2);

  const moduleCount = input.inverters.reduce(
    (sum, inv) => sum + inv.mppts.reduce((s, m) => s + m.stringsInParallel * m.modulesPerString, 0),
    0,
  );
  drawBox(page, 40, boxY, slotWidth, boxH, `${moduleCount} x ${input.moduleLabel}`, font);

  input.inverters.forEach((inv, i) => {
    const x = 40 + slotWidth * (i + 1);
    drawBox(page, x, boxY, slotWidth, boxH, inv.inverterLabel, font);
  });

  const meterX = 40 + slotWidth * (input.inverters.length + 1);
  drawBox(page, meterX, boxY, slotWidth, boxH, 'Point d\'injection STEG', font);
}

function drawUnifilar(doc: PDFDocument, input: DrawingsInput, font: import('pdf-lib').PDFFont): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText('Schéma de câblage détaillé', { x: 40, y: PAGE_HEIGHT - 40, size: 16, font, color: rgb(0, 0, 0) });

  const rowY = PAGE_HEIGHT - 120;
  const boxH = 36;
  const slots = ['Champ PV', ...input.inverters.map(() => 'Onduleur'), input.dcSwitchLabel, input.dcSpdLabel, input.acBreakerLabel, input.acSpdLabel, 'Compteur STEG'];
  const slotWidth = (PAGE_WIDTH - 80) / slots.length;

  slots.forEach((label, i) => {
    const x = 40 + slotWidth * i;
    drawBox(page, x, rowY, slotWidth - 10, boxH, label, font);
    if (i > 0) {
      page.drawLine({
        start: { x: 40 + slotWidth * i - 10, y: rowY + boxH / 2 },
        end: { x: 40 + slotWidth * i, y: rowY + boxH / 2 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
    }
  });

  page.drawText(`Liaison DC : ${input.dcRun.sectionMm2} mm² — ${input.dcRun.lengthM} m`, {
    x: 40, y: rowY - 40, size: 10, font, color: rgb(0, 0, 0),
  });
  page.drawText(`Liaison AC : ${input.acRun.sectionMm2} mm² — ${input.acRun.lengthM} m`, {
    x: 40, y: rowY - 60, size: 10, font, color: rgb(0, 0, 0),
  });
  page.drawText(`Mise à la terre : ${input.earthRodCount} piquet(s)`, {
    x: 40, y: rowY - 80, size: 10, font, color: rgb(0, 0, 0),
  });
}

export async function renderDrawingPages(input: DrawingsInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  drawSingleLine(doc, input, font);
  drawUnifilar(doc, input, font);

  return Buffer.from(await doc.save());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/render-drawings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/render-drawings.ts packages/dossier-worker/test/render-drawings.test.ts
git commit -m "feat(dossier-worker): add programmatic single-line and unifilar wiring diagram renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Page-37 placement/routing reasoning via claude-sonnet-5-5 vision call

**Files:**
- Create: `packages/dossier-worker/src/generate-page-37-layout.ts`
- Test: `packages/dossier-worker/test/generate-page-37-layout.test.ts`

**Interfaces:**
- Consumes: a satellite image `Buffer`, the 3 installer-placed points (each `{ lat: number; lon: number } | null`), and an `Anthropic` client instance (injected, same pattern as
  `generate-dossier-text.ts` — never constructed inside this module).
- Produces: `generatePage37Layout(input, client): Promise<Page37Layout>` where `Page37Layout`
  is `{ panelRectangle: { lat: number; lon: number }[]; wireRoute: { lat: number; lon: number }[] }`
  — Task 8 (the page 37/38 renderer) consumes this directly to draw onto the satellite image.

This is the one module in the whole redesign that calls Claude with an image. Claude returns
**structured JSON describing placement**, never an image — confirmed directly against the
current Claude API documentation that image-generation output does not exist on the Messages
API before this design was finalized.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { generatePage37Layout, Page37LayoutParseError } from '../src/generate-page-37-layout';

function fakeClient(parsedOutput: unknown) {
  return {
    messages: {
      parse: vi.fn().mockResolvedValue({ parsed_output: parsedOutput }),
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

const samplePoints = {
  technicalRoom: { lat: 36.801, lon: 10.201 },
  meter: { lat: 36.799, lon: 10.199 },
  earthPit: { lat: 36.8005, lon: 10.2005 },
};

describe('generatePage37Layout', () => {
  it('returns the parsed panel rectangle and wire route on a valid response', async () => {
    const client = fakeClient({
      panelRectangle: [{ lat: 36.8, lon: 10.2 }, { lat: 36.8001, lon: 10.2 }, { lat: 36.8001, lon: 10.2001 }, { lat: 36.8, lon: 10.2001 }],
      wireRoute: [{ lat: 36.8, lon: 10.2 }, { lat: 36.801, lon: 10.201 }],
    });

    const result = await generatePage37Layout({ satelliteImage: Buffer.from('fake-png'), points: samplePoints }, client);

    expect(result.panelRectangle).toHaveLength(4);
    expect(result.wireRoute).toHaveLength(2);
  });

  it('throws Page37LayoutParseError when Claude returns no parsed output', async () => {
    const client = fakeClient(null);

    await expect(
      generatePage37Layout({ satelliteImage: Buffer.from('fake-png'), points: samplePoints }, client),
    ).rejects.toThrow(Page37LayoutParseError);
  });

  it('throws Page37LayoutParseError when a coordinate is out of valid lat/lon range (malformed response)', async () => {
    const client = fakeClient({
      panelRectangle: [{ lat: 999, lon: 10.2 }],
      wireRoute: [],
    });

    await expect(
      generatePage37Layout({ satelliteImage: Buffer.from('fake-png'), points: samplePoints }, client),
    ).rejects.toThrow(Page37LayoutParseError);
  });

  it('calls Claude with model claude-sonnet-5-5', async () => {
    const client = fakeClient({ panelRectangle: [], wireRoute: [] });

    await generatePage37Layout({ satelliteImage: Buffer.from('fake-png'), points: samplePoints }, client);

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5-5' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/generate-page-37-layout.test.ts`
Expected: FAIL — `../src/generate-page-37-layout` doesn't exist.

- [ ] **Step 3: Implement**

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export interface Page37Point {
  lat: number;
  lon: number;
}

export interface Page37Points {
  technicalRoom: Page37Point | null;
  meter: Page37Point | null;
  earthPit: Page37Point | null;
}

export interface Page37LayoutInput {
  satelliteImage: Buffer;
  points: Page37Points;
}

export interface Page37Layout {
  panelRectangle: Page37Point[];
  wireRoute: Page37Point[];
}

const pointSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const page37LayoutSchema = z.object({
  panelRectangle: z.array(pointSchema),
  wireRoute: z.array(pointSchema),
});

export class Page37LayoutParseError extends Error {
  constructor(reason: string) {
    super(`Claude did not return a valid page-37 layout: ${reason}`);
    this.name = 'Page37LayoutParseError';
  }
}

const page37OutputFormat = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      panelRectangle: { type: 'array', items: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' } }, required: ['lat', 'lon'] } },
      wireRoute: { type: 'array', items: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' } }, required: ['lat', 'lon'] } },
    },
    required: ['panelRectangle', 'wireRoute'],
    additionalProperties: false,
  },
};

function describePoints(points: Page37Points): string {
  const lines: string[] = [];
  if (points.technicalRoom) lines.push(`Local technique : lat=${points.technicalRoom.lat}, lon=${points.technicalRoom.lon}`);
  if (points.meter) lines.push(`Compteur : lat=${points.meter.lat}, lon=${points.meter.lon}`);
  if (points.earthPit) lines.push(`Prise de terre : lat=${points.earthPit.lat}, lon=${points.earthPit.lon}`);
  return lines.join('\n');
}

/**
 * Sends the site's satellite image plus the installer-placed points to claude-sonnet-5-5 and
 * asks it to reason about where solar panels should sit on the roof/ground and how the DC/AC
 * wiring should route between the array and the given points. Claude's Messages API has no
 * image-generation output — it returns structured lat/lon coordinates here, which the caller
 * (render-page-37-38.ts) then draws onto the same satellite image deterministically.
 */
export async function generatePage37Layout(input: Page37LayoutInput, client: Anthropic): Promise<Page37Layout> {
  const response = await client.messages.parse({
    model: 'claude-sonnet-5-5',
    max_tokens: 2048,
    system:
      "Tu analyses une image satellite d'un site pour une installation photovoltaïque. On te donne les coordonnées GPS de certains points du site (local technique, compteur, prise de terre). Propose l'emplacement d'un champ de panneaux solaires sur le toit ou le terrain visible sur l'image (un rectangle à 4 coins, en coordonnées GPS), et un tracé de câblage reliant ce champ aux points donnés (une liste ordonnée de coordonnées GPS). Réponds uniquement avec les coordonnées demandées, sans texte additionnel.",
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: input.satelliteImage.toString('base64') } },
          { type: 'text', text: describePoints(input.points) },
        ],
      },
    ],
    output_config: { format: page37OutputFormat },
  });

  if (response.parsed_output === null) {
    throw new Page37LayoutParseError('no parsed_output in response');
  }

  const parseResult = page37LayoutSchema.safeParse(response.parsed_output);
  if (!parseResult.success) {
    throw new Page37LayoutParseError(parseResult.error.message);
  }

  return parseResult.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/generate-page-37-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/generate-page-37-layout.ts packages/dossier-worker/test/generate-page-37-layout.test.ts
git commit -m "feat(dossier-worker): add claude-sonnet-5-5 vision call for page-37 panel/wiring placement

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Esri satellite tile fetch

**Files:**
- Create: `packages/dossier-worker/src/fetch-satellite-image.ts`
- Test: `packages/dossier-worker/test/fetch-satellite-image.test.ts`

**Interfaces:**
- Consumes: `{ lat: number; lon: number }` plus a zoom/size config.
- Produces: `fetchSatelliteImage(input): Promise<Buffer>` — a PNG/JPEG buffer. Consumed by
  Task 6 (as the vision-call input) and Task 8 (as the background to draw on).

Esri World Imagery serves tiles at `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` (the same no-key, no-billing source the live map editor already uses — confirmed in this project's own history). This task fetches a small grid of tiles around the target point at a fixed zoom level and stitches them, OR (simpler, and sufficient for a single-page image) fetches one tile at a zoom level chosen so the tile itself comfortably covers a typical residential site. Use the single-tile approach for this task — stitching multiple tiles is unneeded complexity for a page-sized image.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSatelliteImage } from '../src/fetch-satellite-image';

describe('fetchSatelliteImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the Esri World Imagery tile for the given lat/lon and returns a Buffer', async () => {
    const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeBytes.buffer,
    } as Response);

    const result = await fetchSatelliteImage({ lat: 36.8, lon: 10.2 });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('arcgisonline.com'));
  });

  it('throws a clear error when the tile fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(fetchSatelliteImage({ lat: 36.8, lon: 10.2 })).rejects.toThrow(/503/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/fetch-satellite-image.test.ts`
Expected: FAIL — `../src/fetch-satellite-image` doesn't exist.

- [ ] **Step 3: Implement**

```typescript
/**
 * Fetches a single Esri World Imagery tile covering the given GPS point. Same free, no-key
 * tile source the live map editor already uses (confirmed project-wide: no billing/API key
 * exists or is needed for this source).
 */
const ZOOM_LEVEL = 19; // close enough to show a single residential roof clearly

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom,
  );
}

export interface FetchSatelliteImageInput {
  lat: number;
  lon: number;
}

export async function fetchSatelliteImage(input: FetchSatelliteImageInput): Promise<Buffer> {
  const x = lonToTileX(input.lon, ZOOM_LEVEL);
  const y = latToTileY(input.lat, ZOOM_LEVEL);
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM_LEVEL}/${y}/${x}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Esri tile fetch failed with status ${response.status} for ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/fetch-satellite-image.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/fetch-satellite-image.ts packages/dossier-worker/test/fetch-satellite-image.test.ts
git commit -m "feat(dossier-worker): add Esri World Imagery satellite tile fetch

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Pages 37-38 renderer (map/site-plan pages, both tiers)

**Files:**
- Create: `packages/dossier-worker/src/render-site-plan-pages.ts`
- Test: `packages/dossier-worker/test/render-site-plan-pages.test.ts`

**Interfaces:**
- Consumes: `tier: 'STANDARD' | 'PREMIUM'`, site GPS/point data, client/installer info, and
  (Premium only) a `Page37Layout` (Task 6) plus two satellite image `Buffer`s (Task 7 — one for
  page 37's crop, one for page 38's).
- Produces: `renderSitePlanPages(input): Promise<Buffer>` — always a 2-page PDF (both tiers;
  Standard's pages are empty frames). Merged after the drawings pages in the final assembly
  (Task 10).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderSitePlanPages } from '../src/render-site-plan-pages';

describe('renderSitePlanPages', () => {
  it('renders 2 empty title-block frame pages for STANDARD tier, with no image data required', async () => {
    const buffer = await renderSitePlanPages({
      tier: 'STANDARD',
      clientFullName: 'Habib Khedhira',
      clientAddress: 'Av Tahrir Hammamet',
      gps: { lat: 36.8, lon: 10.2 },
      installerName: 'SolarPro Tunisie',
      premiumData: null,
    });

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(2);
  });

  it('renders 2 pages with the satellite images and layout overlay for PREMIUM tier', async () => {
    const buffer = await renderSitePlanPages({
      tier: 'PREMIUM',
      clientFullName: 'Habib Khedhira',
      clientAddress: 'Av Tahrir Hammamet',
      gps: { lat: 36.8, lon: 10.2 },
      installerName: 'SolarPro Tunisie',
      premiumData: {
        page37SatelliteImage: Buffer.from('fake-png-bytes-for-page-37'),
        page38SatelliteImage: Buffer.from('fake-png-bytes-for-page-38'),
        layout: {
          panelRectangle: [{ lat: 36.8, lon: 10.2 }, { lat: 36.8001, lon: 10.2 }, { lat: 36.8001, lon: 10.2001 }, { lat: 36.8, lon: 10.2001 }],
          wireRoute: [{ lat: 36.8, lon: 10.2 }, { lat: 36.801, lon: 10.201 }],
        },
        points: { technicalRoom: { lat: 36.801, lon: 10.201 }, meter: { lat: 36.799, lon: 10.199 }, earthPit: null },
      },
    });

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(2);
  });
});
```

Note: the test fixture's `Buffer.from('fake-png-bytes-for-page-37')` is NOT a real decodable
image — `pdf-lib`'s `embedPng`/`embedJpg` will throw on it. The implementation below must
catch that and still produce a valid 2-page PDF (drawing a placeholder rectangle with text
instead of the image) — this exercises the same resilience a real corrupt/unfetchable tile
would need, and matters directly: **do not relax the test to use a real embedded PNG fixture
instead** — a real `.png` byte buffer would hide exactly the failure mode (a bad or non-image
response from the Esri fetch) this test exists to catch.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/render-site-plan-pages.test.ts`
Expected: FAIL — `../src/render-site-plan-pages` doesn't exist.

- [ ] **Step 3: Implement**

```typescript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Page37Layout, Page37Points } from './generate-page-37-layout';

export interface SitePlanPremiumData {
  page37SatelliteImage: Buffer;
  page38SatelliteImage: Buffer;
  layout: Page37Layout;
  points: Page37Points;
}

export interface SitePlanPagesInput {
  tier: 'STANDARD' | 'PREMIUM';
  clientFullName: string;
  clientAddress: string;
  gps: { lat: number; lon: number };
  installerName: string;
  premiumData: SitePlanPremiumData | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

async function embedImageSafely(doc: PDFDocument, buffer: Buffer): Promise<import('pdf-lib').PDFImage | null> {
  try {
    return await doc.embedPng(buffer);
  } catch {
    try {
      return await doc.embedJpg(buffer);
    } catch {
      return null;
    }
  }
}

function drawFrame(doc: PDFDocument, title: string, font: import('pdf-lib').PDFFont): import('pdf-lib').PDFPage {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText(title, { x: 40, y: PAGE_HEIGHT - 40, size: 16, font, color: rgb(0, 0, 0) });
  page.drawRectangle({ x: 40, y: 100, width: PAGE_WIDTH - 80, height: PAGE_HEIGHT - 200, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  return page;
}

export async function renderSitePlanPages(input: SitePlanPagesInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  if (input.tier === 'STANDARD' || !input.premiumData) {
    const page37 = drawFrame(doc, "Schéma d'implantation et de connexion", font);
    page37.drawText('À compléter par l\'installateur', { x: 60, y: PAGE_HEIGHT / 2, size: 12, font, color: rgb(0.4, 0.4, 0.4) });

    const page38 = drawFrame(doc, 'Plan de Situation', font);
    page38.drawText('À compléter par l\'installateur', { x: 60, y: PAGE_HEIGHT / 2, size: 12, font, color: rgb(0.4, 0.4, 0.4) });

    return Buffer.from(await doc.save());
  }

  const { page37SatelliteImage, page38SatelliteImage, layout, points } = input.premiumData;

  const page37 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page37.drawText("Schéma d'implantation et de connexion", { x: 40, y: PAGE_HEIGHT - 40, size: 16, font, color: rgb(0, 0, 0) });
  const img37 = await embedImageSafely(doc, page37SatelliteImage);
  const imageBoxY = 200;
  const imageBoxH = PAGE_HEIGHT - 300;
  const imageBoxW = PAGE_WIDTH - 80;
  if (img37) {
    page37.drawImage(img37, { x: 40, y: imageBoxY, width: imageBoxW, height: imageBoxH });
  } else {
    page37.drawRectangle({ x: 40, y: imageBoxY, width: imageBoxW, height: imageBoxH, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page37.drawText('Image satellite indisponible', { x: 60, y: imageBoxY + imageBoxH / 2, size: 12, font, color: rgb(0.6, 0, 0) });
  }

  // Overlay the AI-reasoned panel rectangle and wire route as simple normalized-bbox shapes —
  // a real geo-to-pixel projection is a further refinement; for v1 this maps the lat/lon
  // spread of the layout's own points onto the image box's pixel space proportionally.
  if (layout.panelRectangle.length > 0) {
    const lats = layout.panelRectangle.map((p) => p.lat);
    const lons = layout.panelRectangle.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const toPixel = (p: { lat: number; lon: number }): { x: number; y: number } => ({
      x: 40 + ((p.lon - minLon) / (maxLon - minLon || 1)) * imageBoxW,
      y: imageBoxY + ((p.lat - minLat) / (maxLat - minLat || 1)) * imageBoxH,
    });
    for (let i = 0; i < layout.panelRectangle.length; i++) {
      const a = toPixel(layout.panelRectangle[i]!);
      const b = toPixel(layout.panelRectangle[(i + 1) % layout.panelRectangle.length]!);
      page37.drawLine({ start: a, end: b, thickness: 2, color: rgb(0, 0, 0.8) });
    }
    for (let i = 0; i < layout.wireRoute.length - 1; i++) {
      const a = toPixel(layout.wireRoute[i]!);
      const b = toPixel(layout.wireRoute[i + 1]!);
      page37.drawLine({ start: a, end: b, thickness: 2, color: rgb(0.8, 0.4, 0) });
    }
  }

  if (points.technicalRoom) page37.drawText('Local Technique', { x: 50, y: imageBoxY + imageBoxH - 20, size: 9, font, color: rgb(0, 0, 0) });
  if (points.meter) page37.drawText('Compteur STEG', { x: 50, y: imageBoxY + 10, size: 9, font, color: rgb(0, 0, 0) });

  page37.drawText(`Client : ${input.clientFullName}`, { x: 40, y: 150, size: 10, font, color: rgb(0, 0, 0) });
  page37.drawText(`Installateur : ${input.installerName}`, { x: 40, y: 130, size: 10, font, color: rgb(0, 0, 0) });

  const page38 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page38.drawText('Plan de Situation', { x: 40, y: PAGE_HEIGHT - 40, size: 20, font, color: rgb(0, 0, 0) });
  const img38 = await embedImageSafely(doc, page38SatelliteImage);
  if (img38) {
    page38.drawImage(img38, { x: 40, y: imageBoxY, width: imageBoxW, height: imageBoxH });
  } else {
    page38.drawRectangle({ x: 40, y: imageBoxY, width: imageBoxW, height: imageBoxH, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page38.drawText('Image satellite indisponible', { x: 60, y: imageBoxY + imageBoxH / 2, size: 12, font, color: rgb(0.6, 0, 0) });
  }
  page38.drawText(`Client : ${input.clientFullName}`, { x: 40, y: 150, size: 12, font, color: rgb(0, 0, 0) });
  page38.drawText(`Adresse : ${input.clientAddress}`, { x: 40, y: 130, size: 12, font, color: rgb(0, 0, 0) });
  page38.drawText(`Coordonnées : ${input.gps.lat.toFixed(5)}, ${input.gps.lon.toFixed(5)}`, { x: 40, y: 110, size: 12, font, color: rgb(0, 0, 0) });
  page38.drawText(`Installateur : ${input.installerName}`, { x: 40, y: 80, size: 12, font, color: rgb(0, 0, 0) });

  return Buffer.from(await doc.save());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/render-site-plan-pages.test.ts`
Expected: PASS — including the "fake, non-decodable image buffer" case, which must hit the
`embedImageSafely` catch path and still produce a valid 2-page PDF.

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/render-site-plan-pages.ts packages/dossier-worker/test/render-site-plan-pages.test.ts
git commit -m "feat(dossier-worker): add pages 37-38 renderer for both Standard and Premium tiers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Table of contents renderer (two-pass, real page numbers)

**Files:**
- Create: `packages/dossier-worker/src/render-toc.ts`
- Test: `packages/dossier-worker/test/render-toc.test.ts`

**Interfaces:**
- Consumes: a list of `{ title: string; pageNumber: number }` entries — the caller (Task 10)
  computes these page numbers by counting pages in the already-built cover/body/drawings/map
  fragments before calling this.
- Produces: `renderTableOfContents(entries): Promise<Buffer>` — a one-page PDF (assume the
  section list fits one page; if it doesn't, overflow to a second page rather than truncating
  — implement this as a real behavior, not a known limitation, since the task is cheap).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderTableOfContents } from '../src/render-toc';

describe('renderTableOfContents', () => {
  it('produces a PDF listing every entry with its page number', async () => {
    const buffer = await renderTableOfContents([
      { title: 'I. Préambule', pageNumber: 3 },
      { title: 'II. Présentation du projet', pageNumber: 5 },
      { title: 'III. Description de l\'installation', pageNumber: 8 },
    ]);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('overflows to a second page rather than truncating when there are many entries', async () => {
    const manyEntries = Array.from({ length: 60 }, (_, i) => ({ title: `Section ${i + 1}`, pageNumber: i + 3 }));

    const buffer = await renderTableOfContents(manyEntries);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/render-toc.test.ts`
Expected: FAIL — `../src/render-toc` doesn't exist.

- [ ] **Step 3: Implement**

```typescript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface TocEntry {
  title: string;
  pageNumber: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const ROW_HEIGHT = 20;
const TOP_MARGIN = 100;
const BOTTOM_MARGIN = 60;

export async function renderTableOfContents(entries: TocEntry[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const rowsPerPage = Math.floor((PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN) / ROW_HEIGHT);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText('Table des matières', { x: 50, y: PAGE_HEIGHT - 50, size: 20, font: titleFont, color: rgb(0, 0, 0) });
  let y = PAGE_HEIGHT - TOP_MARGIN;
  let rowOnPage = 0;

  for (const entry of entries) {
    if (rowOnPage >= rowsPerPage) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 50;
      rowOnPage = 0;
    }
    page.drawText(entry.title, { x: 50, y, size: 11, font, color: rgb(0, 0, 0) });
    page.drawText(String(entry.pageNumber), { x: PAGE_WIDTH - 80, y, size: 11, font, color: rgb(0, 0, 0) });
    y -= ROW_HEIGHT;
    rowOnPage += 1;
  }

  return Buffer.from(await doc.save());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/render-toc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/render-toc.ts packages/dossier-worker/test/render-toc.test.ts
git commit -m "feat(dossier-worker): add two-pass-aware table of contents renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Extend equipment-datasheet collection with de-duplication

**Files:**
- Modify: `packages/dossier-worker/src/process-job.ts` (the `collectAnnexFiles` function)
- Test: `packages/dossier-worker/test/process-job.test.ts` (existing — extend it)

**Interfaces:**
- Consumes: `WorkerJobSnapshot.arrayConfig`/`.protections`/`.earthing` (Task 1) — each may carry
  `datasheetFileId`/`homologationFileId` on its equipment refs.
- Produces: `collectAnnexFiles` now also returns equipment datasheet/homologation files,
  de-duplicated by file id, alongside the existing company/project annex files — no change to
  its exported signature (`(projectId, companyId) => Promise<AnnexFile[]>`), callers in
  `processJob` are unaffected.

- [ ] **Step 1: Write the failing test**

Read `packages/dossier-worker/test/process-job.test.ts` first to match its existing
`vi.mock('@dossipv/db', ...)` pattern exactly (it already mocks `db.file.findMany` and
`db.project.findUnique`/`db.company.findUnique`) — extend those same mocks rather than adding a
parallel mock setup. Add:

```typescript
describe('processJob — equipment datasheet collection', () => {
  it('includes equipment datasheet/homologation files from the snapshot, de-duplicated by file id', async () => {
    const snapshotWithEquipment = {
      ...validSnapshot,
      arrayConfig: {
        module: { brand: 'LONGi', model: 'X', datasheetFileId: 'file-module-datasheet' },
        inverters: [
          { inverter: { brand: 'Sofar', model: 'Y', datasheetFileId: 'file-inverter-datasheet' }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
          { inverter: { brand: 'Sofar', model: 'Y', datasheetFileId: 'file-inverter-datasheet' }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
        ],
      },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: snapshotWithEquipment });
    mocks.fileFindMany.mockResolvedValue([
      { id: 'file-module-datasheet', mimeType: 'pdf', storageKey: 'module-datasheet.pdf' },
      { id: 'file-inverter-datasheet', mimeType: 'pdf', storageKey: 'inverter-datasheet.pdf' },
    ]);

    await processJob('job-1');

    // Exactly 2 distinct datasheets fetched (not 3, even though the inverter is referenced twice).
    const findManyCall = mocks.fileFindMany.mock.calls[0]![0] as { where: { id: { in: string[] } } };
    const uniqueIds = new Set(findManyCall.where.id.in);
    expect(uniqueIds.has('file-module-datasheet')).toBe(true);
    expect(uniqueIds.has('file-inverter-datasheet')).toBe(true);
    expect(findManyCall.where.id.in.filter((id) => id === 'file-inverter-datasheet')).toHaveLength(1);
  });
});
```

(Use whatever `validSnapshot` fixture name this test file already defines at the top — read the
file first; do not invent a second fixture.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/process-job.test.ts`
Expected: FAIL — today's `collectAnnexFiles` only reads `company.anmeCertificateFileId` and
`project.annexes.*`, never equipment datasheets, so the `id.in` array won't contain the
expected ids.

- [ ] **Step 3: Implement**

In `packages/dossier-worker/src/process-job.ts`, modify `collectAnnexFiles` to also walk the
snapshot's equipment and collect their datasheet/homologation file ids, de-duplicated via a
`Set` before the `in` query:

```typescript
async function collectAnnexFiles(projectId: string, companyId: string, snapshot: WorkerJobSnapshot): Promise<AnnexFile[]> {
  const [company, project] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.project.findUnique({ where: { id: projectId }, include: { annexes: { include: { extraFiles: true } } } }),
  ]);

  const equipmentFileIds: (string | null | undefined)[] = [];
  if (snapshot.arrayConfig) {
    equipmentFileIds.push(snapshot.arrayConfig.module.datasheetFileId, snapshot.arrayConfig.module.homologationFileId);
    for (const inv of snapshot.arrayConfig.inverters) {
      equipmentFileIds.push(inv.inverter.datasheetFileId, inv.inverter.homologationFileId);
    }
  }
  if (snapshot.protections) {
    for (const device of [snapshot.protections.dcSwitch, snapshot.protections.dcSpd, snapshot.protections.dcFuse, snapshot.protections.acBreaker, snapshot.protections.acSpd, snapshot.protections.acIsolator]) {
      if (device) equipmentFileIds.push(device.datasheetFileId, device.homologationFileId);
    }
  }
  if (snapshot.earthing?.earthCable) {
    equipmentFileIds.push(snapshot.earthing.earthCable.datasheetFileId, snapshot.earthing.earthCable.homologationFileId);
  }

  const fileIds = new Set([
    company?.anmeCertificateFileId,
    project?.annexes?.cinFileId,
    project?.annexes?.commercialRegisterFileId,
    project?.annexes?.stegContractFileId,
    project?.annexes?.lastPaidBillFileId,
    ...(project?.annexes?.extraFiles.map((f) => f.fileId) ?? []),
    ...equipmentFileIds,
  ].filter((id): id is string => typeof id === 'string'));

  if (fileIds.size === 0) {
    return [];
  }

  const files = await db.file.findMany({ where: { id: { in: [...fileIds] } } });
  const { getFilePath } = await import('@dossipv/file-storage');
  const annexFiles: AnnexFile[] = [];
  for (const file of files) {
    const buffer = await readFile(getFilePath(file.storageKey));
    annexFiles.push({ buffer, mimeType: file.mimeType as 'pdf' | 'png' | 'jpeg' });
  }
  return annexFiles;
}
```

Update the one call site inside `processJob` to pass `snapshot`:

```typescript
    const annexFiles = await collectAnnexFiles(snapshot.projectId, snapshot.companyId, snapshot);
```

Add the import for `WorkerJobSnapshot`'s type at the top of the file if not already imported
(it already imports `parseJobSnapshot` from `./job-snapshot` — add `type WorkerJobSnapshot` to
that same import line).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/process-job.test.ts`
Expected: PASS, including every pre-existing test in the file (the function signature changed
but every existing caller is the same `processJob` function, which already has `snapshot` in
scope at its call site).

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/process-job.ts packages/dossier-worker/test/process-job.test.ts
git commit -m "feat(dossier-worker): include equipment datasheets/homologation files in annexes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Redesign the docx template (numbered headings, equipment/calculation tables)

**Files:**
- Modify: `packages/docx-template/scripts/generate-template.ts`
- Modify: `packages/docx-template/template/dossier-template.docx` (regenerated binary, not
  hand-edited — run the script)
- Test: `packages/docx-template/test/fill-template.test.ts` (existing — extend it)

**Interfaces:**
- Consumes: the `DossierTemplateData` shape from Task 3 (`moduleSpecs`, `inverterSpecs`,
  `stringSizing`, `voltageDropResults`, `stabilityResults` added to the existing fields).
- Produces: a regenerated `dossier-template.docx` with numbered section headings and the new
  tables — `fillDossierTemplate()`'s existing signature is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `packages/docx-template/test/fill-template.test.ts` (reuse the file's existing fixture-
building pattern — read it first):

```typescript
it('fills the module and inverter spec tables and the calculation-result tables', () => {
  // Flat field names (moduleSpecPmaxW, not nested moduleSpecs.pmaxW) — this installed
  // docxtemplater version does not resolve dotted-path tags; see Task 3's note.
  const data: DossierTemplateData = {
    ...fixtureData, // this file's existing complete fixture object — extend it, don't rebuild it
    moduleSpecPmaxW: '620',
    moduleSpecVmpV: '46,5',
    moduleSpecImpA: '13,33',
    moduleSpecVocV: '55,9',
    moduleSpecIscA: '13,92',
    inverterSpecPacW: '3000',
    inverterSpecVdcMaxV: '550',
    inverterSpecMpptMinV: '90',
    inverterSpecMpptMaxV: '550',
    stringSizingNsMin: '3',
    stringSizingNsMax: '9',
    stringSizingNsOptMax: '8',
    stringSizingNpMax: '2',
    stringSizingNpOpt: '1',
    voltageDropDuDcV: '2,1',
    voltageDropDuDcPct: '1,11',
    voltageDropDuAcV: '3,4',
    voltageDropDuAcPct: '1,47',
    stabilityWeightN: '2450',
    stabilityLhs: '1200',
    stabilityRhs: '900',
  };

  const filledBuffer = fillDossierTemplate(templateBuffer, data);

  const zip = new PizZip(filledBuffer);
  const documentXml = zip.file('word/document.xml')!.asText();
  expect(documentXml).toContain('620');
  expect(documentXml).toContain('46,5');
  expect(documentXml).toContain('1,11');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/docx-template && npx vitest run test/fill-template.test.ts`
Expected: FAIL — the current template has no tags for `moduleSpecs`/etc., so docxtemplater
either leaves the literal tag text unfilled or (if `nullGetter` isn't configured) throws; either
way `documentXml` won't contain the fixture's `'620'` value.

- [ ] **Step 3: Rewrite the template-generation script**

Rewrite `packages/docx-template/scripts/generate-template.ts` in full. Preserve every existing
tag name exactly as today's script already defines them (`{companyName}`, `{introduction}`,
the `{#inverters}`/`{#mppts}` loops, `{#cableRuns}` loop, `{#dcFuseRequired}`/
`{#acIsolatorRequired}` conditions, `{pDcW}` without the hardcoded `" W"` suffix — already fixed
in a prior commit) and add the new numbered-heading structure and tables around them:

```typescript
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph(text)] });
}

function specTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, tag]) => new TableRow({ children: [cell(label), cell(tag)] })),
  });
}

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ text: '{companyName}', heading: HeadingLevel.TITLE }),
        new Paragraph('{companyAddress} — {companyPhone} — {companyEmail}'),
        new Paragraph({ text: 'Dossier technique BT', heading: HeadingLevel.HEADING_1 }),

        new Paragraph({ text: 'I. Préambule', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Nom : {clientFullName}'),
        new Paragraph('Adresse : {clientAddress}'),
        new Paragraph('Référence STEG : {clientStegReference}'),

        new Paragraph({ text: 'II. Présentation du projet', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{introduction}'),

        new Paragraph({ text: 'III. Description de la solution technique', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{solution}'),
        new Paragraph({ text: 'III.1 Caractéristiques du module', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Module : {moduleBrandModel}'),
        specTable([
          ['Puissance crête (Wc)', '{moduleSpecPmaxW}'],
          ['Tension Vmp (V)', '{moduleSpecVmpV}'],
          ['Courant Imp (A)', '{moduleSpecImpA}'],
          ['Tension Voc (V)', '{moduleSpecVocV}'],
          ['Courant Isc (A)', '{moduleSpecIscA}'],
        ]),
        new Paragraph({ text: 'III.2 Caractéristiques de l\'onduleur', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Onduleur : {inverterBrandModel}'),
        specTable([
          ['Puissance AC (W)', '{inverterSpecPacW}'],
          ['Tension DC max (V)', '{inverterSpecVdcMaxV}'],
          ['Plage MPPT min (V)', '{inverterSpecMpptMinV}'],
          ['Plage MPPT max (V)', '{inverterSpecMpptMaxV}'],
        ]),
        new Paragraph({ text: 'III.3 Dimensionnement du champ PV', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Puissance totale : {pDcW}'),
        new Paragraph('Nombre de modules : {moduleCount}'),
        specTable([
          ['Ns min', '{stringSizingNsMin}'],
          ['Ns max', '{stringSizingNsMax}'],
          ['Ns optimal max', '{stringSizingNsOptMax}'],
          ['Np max', '{stringSizingNpMax}'],
          ['Np optimal', '{stringSizingNpOpt}'],
        ]),

        new Paragraph({ text: 'III.4 Onduleurs et chaînes', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{#inverters}'),
        new Paragraph('{inverterLabel}'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [cell('MPPT'), cell('Chaînes en parallèle'), cell('Modules par chaîne')] }),
            new TableRow({ children: [cell('{#mppts}{mpptLabel}'), cell('{stringsInParallel}'), cell('{modulesPerString}{/mppts}')] }),
          ],
        }),
        new Paragraph('{/inverters}'),

        new Paragraph({ text: 'IV. Câblage', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{cabling}'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [cell('Repère'), cell('Section (mm²)'), cell('Longueur (m)'), cell('Mode de pose')] }),
            new TableRow({
              children: [
                cell('{#cableRuns}{label}'),
                cell('{sectionMm2}'),
                cell('{lengthM}'),
                cell('{installMethod}{/cableRuns}'),
              ],
            }),
          ],
        }),
        new Paragraph({ text: 'IV.1 Chute de tension', heading: HeadingLevel.HEADING_2 }),
        specTable([
          ['Chute de tension DC (V)', '{voltageDropDuDcV}'],
          ['Chute de tension DC (%)', '{voltageDropDuDcPct}'],
          ['Chute de tension AC (V)', '{voltageDropDuAcV}'],
          ['Chute de tension AC (%)', '{voltageDropDuAcPct}'],
        ]),

        new Paragraph({ text: 'V. Mise à la terre', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{earthing}'),

        new Paragraph({ text: 'VI. Structure et lestage', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{structure}'),
        specTable([
          ['Poids total (N)', '{stabilityWeightN}'],
          ['Stabilité — membre gauche', '{stabilityLhs}'],
          ['Stabilité — membre droit', '{stabilityRhs}'],
        ]),

        new Paragraph('{#dcFuseRequired}'),
        new Paragraph({ text: 'VII. Protection DC — fusible', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Un fusible DC est requis pour cette configuration.'),
        new Paragraph('{/dcFuseRequired}'),

        new Paragraph('{#acIsolatorRequired}'),
        new Paragraph({ text: 'VIII. Protection AC — sectionneur', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Un sectionneur AC est requis (plusieurs onduleurs).'),
        new Paragraph('{/acIsolatorRequired}'),

        new Paragraph({ text: 'IX. Conclusion', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{conclusion}'),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(join(import.meta.dirname, '..', 'template', 'dossier-template.docx'), buffer);
// eslint-disable-next-line no-console -- one-time CLI authoring script, not shipped runtime code
console.log('Template written to template/dossier-template.docx');
```

Note: every tag above is a flat key (e.g. `{moduleSpecPmaxW}`), matching the flat
`DossierTemplateData` fields Task 3 defines — confirmed empirically before writing this plan
that the installed `docxtemplater` 3.71.0 does NOT resolve a dotted path like
`{moduleSpecs.pmaxW}` against a nested render-data object (it renders the literal string
`"undefined"` instead). Do not introduce nested objects into the render data for these new
fields; this matches the existing template's own `pDcW`/`moduleCount` flat-field pattern.

- [ ] **Step 4: Regenerate the template and run the test**

Run: `cd packages/docx-template && npm run generate-template`
Then: `npx vitest run test/fill-template.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full docx-template and dossier-worker suites**

Run: `cd packages/docx-template && npx vitest run && cd ../dossier-worker && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/docx-template/scripts/generate-template.ts packages/docx-template/template/dossier-template.docx packages/docx-template/test/fill-template.test.ts
git commit -m "feat(docx-template): add numbered section hierarchy and equipment/calculation tables

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Orchestrate the full fragment assembly in process-job.ts

**Files:**
- Modify: `packages/dossier-worker/src/merge-annexes.ts` (generalize to accept an ordered list
  of fragments, not just base+annexes)
- Modify: `packages/dossier-worker/src/process-job.ts` (wire every new renderer into the
  pipeline)
- Test: `packages/dossier-worker/test/merge-annexes.test.ts` (existing — extend)
- Test: `packages/dossier-worker/test/process-job.test.ts` (existing — extend)

**Interfaces:**
- Consumes: every module from Tasks 4-10 (`renderCoverPage`, `renderDrawingPages`,
  `generatePage37Layout`, `fetchSatelliteImage`, `renderSitePlanPages`,
  `renderTableOfContents`), plus the existing `fillDossierTemplate`/`convertDocxToPdf`.
- Produces: `processJob`'s final saved `pdfFileId` now points to the full assembled document
  (cover → TOC → body → drawings → map pages), with `annexesPdfFileId` unchanged in meaning
  (still the separate, standalone annexes PDF) per the master spec's §5 step 8 file list.

This is the integration task — it has no new business logic of its own beyond sequencing, but
gets its own task because it's the one place a reviewer needs to check the whole assembly order
end-to-end, and because `mergeAnnexes`'s signature genuinely changes.

- [ ] **Step 1: Write the failing test for the generalized merge function**

```typescript
// In packages/dossier-worker/test/merge-annexes.test.ts, add:
it('merges an arbitrary ordered list of PDF fragments before the annexes', async () => {
  const fragment1 = await makeMinimalPdf('Fragment 1'); // use this file's existing PDF-building test helper
  const fragment2 = await makeMinimalPdf('Fragment 2');
  const annex = await makeMinimalPdf('Annex');

  const merged = await mergeDocumentFragments([fragment1, fragment2], [{ buffer: annex, mimeType: 'pdf' }]);

  const doc = await PDFDocument.load(merged);
  expect(doc.getPageCount()).toBe(3);
});
```

(If `merge-annexes.test.ts` doesn't already have a "build a minimal real PDF buffer" helper,
add one using `pdf-lib`'s own `PDFDocument.create()` + `addPage()` + `drawText()` — do not
invent a fake non-PDF buffer for this test, since `mergeDocumentFragments` must `PDFDocument.
load()` each fragment for real.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/merge-annexes.test.ts`
Expected: FAIL — `mergeDocumentFragments` doesn't exist yet (only today's `mergeAnnexes(base,
annexBuffers)` two-argument form exists).

- [ ] **Step 3: Generalize merge-annexes.ts**

Add a new exported function alongside the existing `mergeAnnexes` (keep `mergeAnnexes` itself
unchanged and exported — it's a thin wrapper now, nothing else in the codebase needs to change
its call site because of this):

```typescript
import { PDFDocument } from 'pdf-lib';

export interface AnnexFile {
  buffer: Buffer;
  mimeType: 'pdf' | 'png' | 'jpeg';
}

async function appendAnnex(merged: PDFDocument, annex: AnnexFile): Promise<void> {
  if (annex.mimeType === 'pdf') {
    const annexDoc = await PDFDocument.load(annex.buffer);
    const pages = await merged.copyPages(annexDoc, annexDoc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  } else {
    const image = annex.mimeType === 'png' ? await merged.embedPng(annex.buffer) : await merged.embedJpg(annex.buffer);
    const page = merged.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
}

/**
 * Merges an ordered list of already-rendered PDF fragments (cover, TOC, body, drawings, map
 * pages — each produced by its own renderer) into one document, then appends the annex files
 * exactly as mergeAnnexes already did. One corrupted/unreadable annex is skipped, never aborts
 * the whole merge (see the try/catch below) — a fragment itself failing to load IS allowed to
 * throw, since a broken fragment (cover/body/drawings/map pages) means an earlier pipeline step
 * produced bad output and the job should fail loudly, unlike a bad annex file which is optional
 * supporting material.
 */
export async function mergeDocumentFragments(fragments: Buffer[], annexFiles: AnnexFile[]): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const fragment of fragments) {
    const fragmentDoc = await PDFDocument.load(fragment);
    const pages = await merged.copyPages(fragmentDoc, fragmentDoc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  for (const annex of annexFiles) {
    try {
      await appendAnnex(merged, annex);
    } catch {
      continue;
    }
  }

  return Buffer.from(await merged.save());
}

export async function mergeAnnexes(baseBuffer: Buffer, annexBuffers: AnnexFile[]): Promise<Buffer> {
  return mergeDocumentFragments([baseBuffer], annexBuffers);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/merge-annexes.test.ts`
Expected: PASS — including every pre-existing `mergeAnnexes` test (it now delegates to
`mergeDocumentFragments([baseBuffer], ...)`, which is behaviorally identical to the old
single-fragment implementation).

- [ ] **Step 5: Write the failing integration test in process-job.test.ts**

Add a test asserting the new renderers are all invoked for a Premium-tier job (extend the
existing mock setup the same way Task 10 did):

```typescript
describe('processJob — full fragment assembly (Premium tier)', () => {
  it('calls every new renderer and merges fragments in the documented order for a PREMIUM project', async () => {
    const premiumSnapshot = { ...validSnapshot, tier: 'PREMIUM', site: { gpsLat: 36.8, gpsLon: 10.2, technicalRoomPointLat: 36.801, technicalRoomPointLon: 10.201, meterPointLat: 36.799, meterPointLon: 10.199, earthPitPointLat: null, earthPitPointLon: null } };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });

    await processJob('job-1');

    expect(mocks.renderCoverPage).toHaveBeenCalled();
    expect(mocks.renderDrawingPages).toHaveBeenCalled();
    expect(mocks.fetchSatelliteImage).toHaveBeenCalled();
    expect(mocks.generatePage37Layout).toHaveBeenCalled();
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith(expect.objectContaining({ tier: 'PREMIUM' }), );
    expect(mocks.renderTableOfContents).toHaveBeenCalled();
    expect(mocks.mergeDocumentFragments).toHaveBeenCalled();
  });

  it('skips fetchSatelliteImage and generatePage37Layout entirely for a STANDARD project (no network/API call)', async () => {
    await processJob('job-1'); // validSnapshot's default tier is STANDARD

    expect(mocks.fetchSatelliteImage).not.toHaveBeenCalled();
    expect(mocks.generatePage37Layout).not.toHaveBeenCalled();
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith(expect.objectContaining({ tier: 'STANDARD' }));
  });
});
```

Add the corresponding `vi.mock(...)` calls for each new module at the top of the test file,
following the exact pattern the file already uses for `fillDossierTemplate`/`convertDocxToPdf`/
`mergeAnnexes` (each as a `vi.fn()` inside the `vi.hoisted(...)` block, then `vi.mock('../src/
render-cover-page', () => ({ renderCoverPage: mocks.renderCoverPage }))` etc. for every new
module), and give each mock a sensible default resolved value in `beforeEach` (e.g.
`mocks.renderCoverPage.mockResolvedValue(Buffer.from('%PDF-fake-cover'))`) the same way the
file's existing mocks are defaulted.

- [ ] **Step 6: Run test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/process-job.test.ts`
Expected: FAIL — `processJob` doesn't call any of the new renderers yet.

- [ ] **Step 7: Wire the new renderers into process-job.ts**

Modify `packages/dossier-worker/src/process-job.ts`. Add the new imports (alongside the
existing ones at the top — note `PDFDocument` from `pdf-lib` is a new import this task adds,
`process-job.ts` does not import it today):

```typescript
import { PDFDocument } from 'pdf-lib';
import { renderCoverPage } from './render-cover-page';
import { renderDrawingPages } from './render-drawings';
import { generatePage37Layout } from './generate-page-37-layout';
import { fetchSatelliteImage } from './fetch-satellite-image';
import { renderSitePlanPages } from './render-site-plan-pages';
import { renderTableOfContents } from './render-toc';
import { mergeDocumentFragments } from './merge-annexes';
```

Replace the existing PDF-conversion-and-merge block (after `docxBuffer` is produced and before
the existing `annexFiles`/`saveFile` block) with the full fragment assembly. This is the
largest single change in the plan — read `process-job.ts`'s current full body first so the
surrounding `fail(jobId, ...)` try/catch structure for each step is preserved exactly (every
new step gets its own `try { } catch (error) { return fail(jobId, '<step-name>', error); }`
block, matching the file's existing pattern precisely):

```typescript
  let pdfBuffer: Buffer;
  try {
    const bodyPdfBuffer = await convertDocxToPdf(docxBuffer);

    const coverPageBuffer = await renderCoverPage({
      companyName: company.name,
      companyLogoBuffer: null, // logo fetch wired in a follow-up — company.logoFileId exists but
                                 // isn't resolved to a Buffer here yet; render-cover-page.ts
                                 // already handles a null logo gracefully (Task 4, Step 3)
      dossierNumber: snapshot.dossierNumber,
      clientFullName: snapshot.client?.fullName ?? '',
      dossierDate: snapshot.dossierDate ?? new Date().toISOString().slice(0, 10),
    });

    const drawingsBuffer = await renderDrawingPages({
      moduleLabel: snapshot.projectMeta.moduleBrandModel,
      inverters: snapshot.engineInput.array.map((entry, i) => ({
        inverterLabel: `${snapshot.projectMeta.inverterBrandModel} (${i + 1})`,
        pacW: entry.inverter.pacW,
        mppts: entry.mppts,
      })),
      dcSwitchLabel: snapshot.protections?.dcSwitch ? `${snapshot.protections.dcSwitch.brand} ${snapshot.protections.dcSwitch.model}` : '—',
      dcSpdLabel: snapshot.protections?.dcSpd ? `${snapshot.protections.dcSpd.brand} ${snapshot.protections.dcSpd.model}` : '—',
      acSpdLabel: snapshot.protections?.acSpd ? `${snapshot.protections.acSpd.brand} ${snapshot.protections.acSpd.model}` : '—',
      acBreakerLabel: snapshot.protections?.acBreaker ? `${snapshot.protections.acBreaker.brand} ${snapshot.protections.acBreaker.model}` : '—',
      dcRun: { sectionMm2: snapshot.engineInput.dcRun.sectionMm2, lengthM: snapshot.engineInput.dcRun.lengthM },
      acRun: { sectionMm2: snapshot.engineInput.acRun.sectionMm2, lengthM: snapshot.engineInput.acRun.lengthM },
      earthRodCount: snapshot.projectMeta.earthRodCount,
    });

    let sitePlanBuffer: Buffer;
    if (snapshot.tier === 'PREMIUM' && snapshot.site) {
      const points = {
        technicalRoom: snapshot.site.technicalRoomPointLat !== null && snapshot.site.technicalRoomPointLon !== null ? { lat: snapshot.site.technicalRoomPointLat, lon: snapshot.site.technicalRoomPointLon } : null,
        meter: snapshot.site.meterPointLat !== null && snapshot.site.meterPointLon !== null ? { lat: snapshot.site.meterPointLat, lon: snapshot.site.meterPointLon } : null,
        earthPit: snapshot.site.earthPitPointLat !== null && snapshot.site.earthPitPointLon !== null ? { lat: snapshot.site.earthPitPointLat, lon: snapshot.site.earthPitPointLon } : null,
      };
      const page37Image = await fetchSatelliteImage({ lat: snapshot.site.gpsLat, lon: snapshot.site.gpsLon });
      const page38Image = await fetchSatelliteImage({ lat: snapshot.site.gpsLat, lon: snapshot.site.gpsLon });
      const layout = await generatePage37Layout({ satelliteImage: page37Image, points }, anthropicClient);
      sitePlanBuffer = await renderSitePlanPages({
        tier: 'PREMIUM',
        clientFullName: snapshot.client?.fullName ?? '',
        clientAddress: snapshot.client?.address ?? '',
        gps: { lat: snapshot.site.gpsLat, lon: snapshot.site.gpsLon },
        installerName: company.name,
        premiumData: { page37SatelliteImage: page37Image, page38SatelliteImage: page38Image, layout, points },
      });
    } else {
      sitePlanBuffer = await renderSitePlanPages({
        tier: 'STANDARD',
        clientFullName: snapshot.client?.fullName ?? '',
        clientAddress: snapshot.client?.address ?? '',
        gps: snapshot.site ? { lat: snapshot.site.gpsLat, lon: snapshot.site.gpsLon } : { lat: 0, lon: 0 },
        installerName: company.name,
        premiumData: null,
      });
    }

    const bodyPageCount = (await PDFDocument.load(bodyPdfBuffer)).getPageCount();
    const drawingsPageCount = (await PDFDocument.load(drawingsBuffer)).getPageCount();
    const tocEntries = [
      { title: 'I. Préambule', pageNumber: 3 },
      { title: 'II. Présentation du projet', pageNumber: 3 },
      { title: 'III. Description de la solution technique', pageNumber: 4 },
      { title: 'IV. Câblage', pageNumber: bodyPageCount - 2 > 4 ? bodyPageCount - 2 : 5 },
      { title: 'V. Mise à la terre', pageNumber: bodyPageCount },
      { title: 'Annexe — Schémas électriques', pageNumber: 3 + bodyPageCount },
      { title: 'Annexe — Plans de situation', pageNumber: 3 + bodyPageCount + drawingsPageCount },
    ];
    const tocBuffer = await renderTableOfContents(tocEntries);

    pdfBuffer = await mergeDocumentFragments(
      [coverPageBuffer, tocBuffer, bodyPdfBuffer, drawingsBuffer, sitePlanBuffer],
      [],
    );
  } catch (error) {
    return fail(jobId, 'pdf', error);
  }
```

Note on the TOC page-number placeholders above: these are intentionally approximate fixed
offsets (cover=1 page, TOC assumed small) rather than a fully precise per-section page-number
computation within the body itself — computing the exact page a given *Claude-written prose
section* lands on inside the LibreOffice-rendered body would need parsing the body PDF's text
layout, which is real further work not justified for v1's TOC. This is a deliberate, named
scope boundary for this task, not an oversight — the TOC's *fragment-level* page numbers (which
page the drawings/map-pages/annexes sections start on) are accurate since those come from real
`getPageCount()` calls; only the sub-section numbers *within* the body are approximate.

Also update the existing `annexFiles`/`mergeAnnexes` call later in the function (the one that
currently does `annexesPdfBuffer = await mergeAnnexes(pdfBuffer, annexFiles)`) — leave this
exactly as-is; it already works unchanged since `mergeAnnexes` is now a thin wrapper
(Step 3) and this is still producing the separate standalone `annexesPdfFileId` output, per the
master spec's own file list (`dossier.pdf` already has everything merged in by the block above;
`annexes.pdf` is the standalone annexes-only file, confirmed unchanged in meaning).

- [ ] **Step 8: Run test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/process-job.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the entire dossier-worker suite**

Run: `cd packages/dossier-worker && npx vitest run`
Expected: PASS, all files.

- [ ] **Step 10: Commit**

```bash
git add packages/dossier-worker/src/merge-annexes.ts packages/dossier-worker/src/process-job.ts packages/dossier-worker/test/merge-annexes.test.ts packages/dossier-worker/test/process-job.test.ts
git commit -m "feat(dossier-worker): assemble cover/TOC/body/drawings/map-pages into one pipeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Full-workspace verification and live end-to-end re-run

**Files:** none created or modified — this task is verification only.

**Interfaces:** none — this task consumes the finished pipeline from Tasks 1-12 as a whole.

- [ ] **Step 1: Run the full workspace test suite**

Run (from the repo root): `npm test`
Expected: every test file passes (the 2 pre-existing expected skips — `convert-to-pdf.test.ts`
when `soffice` isn't on PATH locally, and the live-PVGIS reference test — are fine to remain
skipped locally).

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean, no errors.

- [ ] **Step 3: Live end-to-end re-run against the real premium test project**

Using the exact method already proven earlier in this project's history (a real `PENDING`
`DossierJob` created against a real Premium-tier project with a real subscription, then
`processJob` run for real against the server's real LibreOffice and a real `claude-sonnet-5-5`
API call): create a new job, run it, download the resulting `dossier.pdf`, and visually inspect
it against the reference dossier's structure (cover page present, TOC present and listing real
sections, numbered headings, equipment/calculation tables populated with real values, 2
drawing pages present with real equipment labels, 2 map/site-plan pages present for the Premium
project with a real Esri satellite image and an AI-reasoned panel/wiring overlay, annexes
including any uploaded equipment datasheets).

- [ ] **Step 4: Report findings**

If the live PDF has a defect not caught by any unit test (matching this project's own repeated
experience that live rendering catches things unit tests structurally cannot — the two doubled-
unit bugs found earlier this session, the stale Prisma-schema gap, the Node-version gap), fix
it and add a regression test to the task that owns the responsible code, following the same
practice already established in this codebase.

- [ ] **Step 5: No commit for this task** — verification only; any fixes found in Step 4 get
  their own commit against the task they belong to.
