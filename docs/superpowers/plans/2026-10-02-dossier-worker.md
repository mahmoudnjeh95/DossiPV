# Dossier Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@dossipv/dossier-worker`, the connecting package that maps `@dossipv/engine`'s
output field names to the placeholder names used in dossier text, then chains
calculate → generate text → substitute into one function returning the finished French prose.

**Architecture:** A new npm workspace package depending on `@dossipv/engine` and
`@dossipv/document-text`. A fixed allowlist table (`PLACEHOLDER_DEFINITIONS`) is the single
source of truth for which placeholder names exist, how each one's value is computed from
engine output, and how it's formatted (French locale, units); the system prompt in
`document-text` is changed to accept an explicit list of allowed names (generated from this
table) instead of giving Claude loose examples. A single `generateDossierDocument()` function
runs the engine, refuses to call Claude if there's a blocking check failure, derives the
non-engine `DossierTextInput` fields, generates text, builds the placeholder value map, and
substitutes — returning both the finished sections and the full engine result.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`),
Vitest, npm workspaces, `tsc -b` project references — matching `@dossipv/engine` and
`@dossipv/document-text` exactly.

**Spec:** `docs/superpowers/specs/2026-10-02-dossier-worker-design.md`

## Global Constraints

- Text-only pipeline: no `.docx`/PDF/drawings/annexes in this plan (spec §1 "explicitly out of scope").
- `@dossipv/document-text` and `@dossipv/engine` must not gain a dependency on each other or on
  `@dossipv/dossier-worker` — all cross-package knowledge lives in the new package (spec §2).
  Exception: `document-text`'s prompt builder gains one new plain-`string[]` parameter (the
  allowed placeholder names) but no new import of `@dossipv/engine` or `@dossipv/dossier-worker`.
- Placeholder vocabulary is a fixed, enumerated allowlist — the prompt must list every allowed
  name explicitly, not give examples (spec §3).
- All number formatting (French locale: comma decimal separator, space thousands separator,
  per-placeholder decimal count, unit suffix) lives in the new package's placeholder-map module.
  `substitutePlaceholders()` in `document-text` is not modified — it stays a dumb string-replace
  (spec §3.2).
- `acIsolatorRequired` must match `checkC15`'s existing `inverterCount > 1` condition exactly;
  `dcFuseRequired` must be computed via the engine's own exported `dcFuseRequired()` function,
  never re-implemented (spec §4, step 3).
- If `EngineResult.hasBlockingFailure` is true, the worker must throw before calling the
  Anthropic client at all (spec §4, step 2) — no wasted API cost on an invalid design.
- New package follows the exact shape of `packages/engine` and `packages/document-text`:
  `"main"`/`"types"` pointing straight at `src/index.ts`, no build step, `vitest run` as the
  test script, `tsconfig.base.json` extended the same way, added to the root `tsconfig.json`
  references array and root `package.json` workspace glob already covers `packages/*`.

## Review Focus

- **Multi-inverter array (length > 1):** `INVERTER_COUNT` placeholder and `acIsolatorRequired`
  derivation must reflect `engineInput.array.length`, not assume a single inverter — the
  existing `habib-khedhira` fixture only has one inverter, so this plan's own multi-inverter
  test fixture is the only thing that exercises this path. Covered in Task 3's second fixture
  and Task 4's derivation tests.
- **Blocking check failure:** a design with `hasBlockingFailure: true` must stop before any
  Claude call — asserted via a call-count check on the fake client, not just an error type
  check (a client that's still invoked despite throwing afterward would pass a weaker test).
  Covered in Task 5.
- **Placeholder present in generated text but absent from `PLACEHOLDER_DEFINITIONS`:** must
  surface `MissingPlaceholderValueError` unchanged, not a new/different error — proves the
  worker doesn't swallow or rewrap `substitutePlaceholders`' existing error contract. Covered
  in Task 5.
- **Decimal and integer placeholders mixed in one dossier:** a placeholder with `decimals: 0`
  (e.g. `P_DC_W`) must not print a decimal point, and one with no `decimals` key at all (e.g.
  `MODULE_COUNT`, already an integer) must not run through `Intl.NumberFormat` fraction
  rounding and silently become `"5,0"` — both are distinct formatter code paths. Covered in
  Task 2.
- **String-valued placeholder (`NORME_CABLAGE`) mixed with numeric ones:** the formatter must
  pass strings through unchanged rather than attempting `Intl.NumberFormat` on a non-number,
  which would throw. Covered in Task 2.

---

## Task 1: Scaffold `@dossipv/dossier-worker` package

**Files:**
- Create: `packages/dossier-worker/package.json`
- Create: `packages/dossier-worker/tsconfig.json`
- Create: `packages/dossier-worker/src/index.ts`
- Modify: `tsconfig.json` (root, add project reference)

**Interfaces:**
- Consumes: nothing yet (scaffolding only).
- Produces: an installable, typed, empty package that later tasks fill in. `src/index.ts`
  starts empty (just a comment) and gains `export * from './...'` lines as later tasks add
  modules.

- [ ] **Step 1: Create the package directory and `package.json`**

```json
{
  "name": "@dossipv/dossier-worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@dossipv/engine": "*",
    "@dossipv/document-text": "*",
    "@anthropic-ai/sdk": "^0.74.0"
  },
  "devDependencies": {
    "@types/node": "^26.6.4"
  }
}
```

Save as `packages/dossier-worker/package.json`.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "references": [
    { "path": "../engine" },
    { "path": "../document-text" }
  ]
}
```

Save as `packages/dossier-worker/tsconfig.json`. The `references` array is required for
`tsc -b` to build this package's dependencies first — `engine`'s and `document-text`'s own
`tsconfig.json` don't need a matching `references` entry back, since they don't depend on this
new package (one-directional, matching the Global Constraints' dependency direction rule).

- [ ] **Step 3: Create an empty `src/index.ts`**

```ts
// Barrel file — later tasks add `export * from './...'` lines here as modules are built.
```

Save as `packages/dossier-worker/src/index.ts`.

- [ ] **Step 4: Add the project reference to the root `tsconfig.json`**

Read the current root `tsconfig.json` first (it has a `references` array with `engine`,
`document-text`, `apps/web`). Add a new entry:

```json
{ "path": "packages/dossier-worker" }
```

The full `references` array becomes:

```json
"references": [
  { "path": "packages/engine" },
  { "path": "packages/document-text" },
  { "path": "packages/dossier-worker" },
  { "path": "apps/web" }
]
```

- [ ] **Step 5: Install workspace dependencies**

Run: `npm install`
Expected: no errors; `node_modules/@dossipv/dossier-worker` symlinked into place (npm
workspaces), and `node_modules/@dossipv/engine` / `@dossipv/document-text` symlinks available
inside the new package's resolution path.

- [ ] **Step 6: Typecheck the whole workspace**

Run: `npm run typecheck`
Expected: PASS (the new package has no real code yet, just an empty barrel file, so there's
nothing to fail — this step only proves the new project reference wiring is valid).

- [ ] **Step 7: Commit**

```bash
git add packages/dossier-worker/package.json packages/dossier-worker/tsconfig.json packages/dossier-worker/src/index.ts tsconfig.json package-lock.json
git commit -m "chore(dossier-worker): scaffold package, wire into tsc project references"
```

---

## Task 2: Placeholder definitions and value formatting

**Files:**
- Create: `packages/dossier-worker/src/placeholder-map.ts`
- Test: `packages/dossier-worker/test/placeholder-map.test.ts`

**Interfaces:**
- Consumes: `EngineResult`, `RunEngineInput`, `MpptConfig` from `@dossipv/engine` (already
  defined in `packages/engine/src/types.ts` and `run-engine.ts`).
- Produces (for Task 4 and Task 5 to import):
  - `interface PlaceholderSourceContext { derived: Record<string, number>; engineInput: RunEngineInput; representativeMppt: MpptConfig; projectMeta: ProjectMeta }`
  - `interface ProjectMeta { moduleBrandModel: string; inverterBrandModel: string; gridType: string; mountingType: string; structureMaterial: string; earthRodCount: number }`
  - `const PLACEHOLDER_DEFINITIONS: Record<string, PlaceholderDefinition>`
  - `function buildPlaceholderValues(ctx: PlaceholderSourceContext): Record<string, string>`

This task's `ProjectMeta` type is the first place it's defined; Task 4 re-exports it as part of
`DossierWorkerInput` rather than redefining it.

- [ ] **Step 1: Write the failing test for formatting (decimals, units, integers, strings)**

```ts
// packages/dossier-worker/test/placeholder-map.test.ts
import { describe, it, expect } from 'vitest';
import { buildPlaceholderValues, type PlaceholderSourceContext } from '../src/placeholder-map';
import { habibKhedhiraFixture } from '../../engine/test/fixtures/habib-khedhira';
import { runEngine } from '@dossipv/engine';

function makeContext(): PlaceholderSourceContext {
  const engineResult = runEngine(habibKhedhiraFixture);
  return {
    derived: engineResult.derived,
    engineInput: habibKhedhiraFixture,
    representativeMppt: habibKhedhiraFixture.array[0]!.mppts[0]!,
    projectMeta: {
      moduleBrandModel: 'LONGi LR7-72HGD-620M',
      inverterBrandModel: 'Sofar 1-4KTL2-G3',
      gridType: 'BT',
      mountingType: 'FLAT_ROOF_BALLAST',
      structureMaterial: 'Aluminium',
      earthRodCount: 3,
    },
  };
}

describe('buildPlaceholderValues', () => {
  it('formats a decimals:0 numeric placeholder with no decimal point and a unit suffix', () => {
    const values = buildPlaceholderValues(makeContext());
    // habib-khedhira: 5 modules * 620W = 3100 W, decimals:0, unit "W"
    expect(values.P_DC_W).toBe('3\u00a0100\u00a0W');
  });

  it('formats a decimal numeric placeholder with a comma separator and a unit suffix', () => {
    const values = buildPlaceholderValues(makeContext());
    // STRING_VOC_TMIN with decimals:1, unit "V" — exact value asserted against the engine's
    // own derived output so this test tracks the formula, not a hand-computed duplicate.
    const engineResult = runEngine(habibKhedhiraFixture);
    const expectedNumber = engineResult.derived.STRING_VOC_TMIN!;
    const expectedFormatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(expectedNumber);
    expect(values.STRING_VOC_TMIN).toBe(`${expectedFormatted}\u00a0V`);
  });

  it('formats an integer placeholder with no decimal point and no unit', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.MODULE_COUNT).toBe('5');
  });

  it('passes a string-valued placeholder through unchanged', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.NORME_CABLAGE).toBe('NF C 15-100');
  });

  it('reads NS and NP from the representative MPPT, not from derived', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.NS).toBe('5');
    expect(values.NP).toBe('1');
  });

  it('reads INVERTER_COUNT from the engine input array length', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.INVERTER_COUNT).toBe('1');
  });

  it('reads EARTH_ROD_COUNT from projectMeta, not from the engine', () => {
    const values = buildPlaceholderValues(makeContext());
    expect(values.EARTH_ROD_COUNT).toBe('3');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/placeholder-map.test.ts`
Expected: FAIL — `Cannot find module '../src/placeholder-map'` (module doesn't exist yet).

- [ ] **Step 3: Implement `placeholder-map.ts`**

```ts
// packages/dossier-worker/src/placeholder-map.ts
import type { RunEngineInput, MpptConfig } from '@dossipv/engine';

export interface ProjectMeta {
  moduleBrandModel: string;
  inverterBrandModel: string;
  gridType: string;
  mountingType: string;
  structureMaterial: string;
  earthRodCount: number;
}

export interface PlaceholderSourceContext {
  derived: Record<string, number>;
  engineInput: RunEngineInput;
  representativeMppt: MpptConfig;
  projectMeta: ProjectMeta;
}

interface PlaceholderDefinition {
  source: (ctx: PlaceholderSourceContext) => number | string;
  decimals?: number;
  unit?: string;
}

/**
 * The full set of placeholder names dossier text is allowed to use. This table is the single
 * source of truth consumed both by buildPlaceholderValues (fills real values) and by the
 * prompt builder (lists allowed names to Claude) — see dossier-worker's index.ts.
 */
export const PLACEHOLDER_DEFINITIONS: Record<string, PlaceholderDefinition> = {
  P_DC_W: { source: (c) => c.derived.P_DC_W!, decimals: 0, unit: 'W' },
  MODULE_COUNT: { source: (c) => c.derived.MODULE_COUNT! },
  NS: { source: (c) => c.representativeMppt.modulesPerString },
  NP: { source: (c) => c.representativeMppt.stringsInParallel },
  STRING_VOC_TMIN: { source: (c) => c.derived.STRING_VOC_TMIN!, decimals: 1, unit: 'V' },
  STRING_VMP_STC: { source: (c) => c.derived.STRING_VMP_STC!, decimals: 1, unit: 'V' },
  DU_DC_PCT: { source: (c) => c.derived.DU_DC_PCT!, decimals: 2, unit: '%' },
  DU_AC_PCT: { source: (c) => c.derived.DU_AC_PCT!, decimals: 2, unit: '%' },
  INVERTER_COUNT: { source: (c) => c.engineInput.array.length },
  EARTH_ROD_COUNT: { source: (c) => c.projectMeta.earthRodCount },
  NORME_CABLAGE: { source: () => 'NF C 15-100' },
};

function formatValue(value: number | string, decimals: number | undefined, unit: string | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  const formatted =
    decimals === undefined
      ? new Intl.NumberFormat('fr-FR').format(value)
      : new Intl.NumberFormat('fr-FR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value);
  return unit ? `${formatted}\u00a0${unit}` : formatted;
}

/**
 * Computes every placeholder's real, formatted value from PLACEHOLDER_DEFINITIONS.
 * Numbers are formatted French-locale (comma decimal separator, space thousands separator,
 * non-breaking space before a unit suffix); strings pass through unchanged.
 */
export function buildPlaceholderValues(ctx: PlaceholderSourceContext): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, definition] of Object.entries(PLACEHOLDER_DEFINITIONS)) {
    const rawValue = definition.source(ctx);
    result[name] = formatValue(rawValue, definition.decimals, definition.unit);
  }
  return result;
}
```

Note: `c.derived.P_DC_W!` uses a non-null assertion because `derived` is typed
`Record<string, number>` (an index signature) and `noUncheckedIndexedAccess` makes every index
access `number | undefined` — the assertion is safe here because `runEngine` always populates
every one of these keys (see `run-engine.ts`'s `derived: { ... }` return literal), so the
value's presence is guaranteed by `@dossipv/engine`'s own contract, not re-validated here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/placeholder-map.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/dossier-worker/src/placeholder-map.ts packages/dossier-worker/test/placeholder-map.test.ts
git commit -m "feat(dossier-worker): add placeholder allowlist and French-locale value formatting"
```

---

## Task 3: Multi-inverter test fixture

**Files:**
- Create: `packages/dossier-worker/test/fixtures/two-inverter-site.ts`

**Interfaces:**
- Consumes: `RunEngineInput` from `@dossipv/engine`.
- Produces: `twoInverterSiteFixture: RunEngineInput`, imported by Task 4's and Task 5's tests
  to exercise the multi-inverter path (Review Focus item 1).

This fixture is a modified copy of `habibKhedhiraFixture` with a second inverter/MPPT entry
appended to `array`, an AC isolator set (since `checkC15` requires one once `array.length > 1`),
and adjusted `acBreaker`/`sumInverterIacMaxA`-related fields so the fixture produces a clean,
non-blocking `EngineResult` (needed for Task 5's happy-path test; Task 5 also needs a
deliberately *blocking* fixture, built separately in that task by taking this fixture and
breaking one field).

- [ ] **Step 1: Write the fixture**

```ts
// packages/dossier-worker/test/fixtures/two-inverter-site.ts
import type { RunEngineInput } from '@dossipv/engine';

/**
 * A clean, non-blocking two-inverter site, built to exercise INVERTER_COUNT > 1 and
 * acIsolatorRequired = true — paths habib-khedhira's single-inverter fixture can't reach.
 * Not derived from a real dossier; values are chosen only to pass every BLOCK check.
 */
export const twoInverterSiteFixture: RunEngineInput = {
  module: {
    pmaxW: 620,
    vmpV: 46.5,
    impA: 13.33,
    vocV: 55.9,
    iscA: 13.92,
    tempCoeffVocPct: -0.25,
    tempCoeffIscPct: 0.045,
    tempCoeffPmaxPct: -0.28,
    irmA: 25,
    maxSystemVoltageV: 1500,
    lengthMm: 2278,
    widthMm: 1134,
    weightKg: 33.5,
  },
  array: [
    {
      inverter: {
        phases: 1,
        pacW: 3000,
        sacVA: 3000,
        vdcMaxV: 550,
        mpptMinV: 90,
        mpptMaxV: 550,
        startUpV: 100,
        mpptCount: 1,
        inputsPerMppt: 2,
        idcMaxPerMpptA: 16,
        iscMaxPerMpptA: 20,
        vacNomV: 230,
        iacMaxA: 16,
        stegApproved: true,
      },
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
    {
      inverter: {
        phases: 1,
        pacW: 3000,
        sacVA: 3000,
        vdcMaxV: 550,
        mpptMinV: 90,
        mpptMaxV: 550,
        startUpV: 100,
        mpptCount: 1,
        inputsPerMppt: 2,
        idcMaxPerMpptA: 16,
        iscMaxPerMpptA: 20,
        vacNomV: 230,
        iacMaxA: 16,
        stegApproved: true,
      },
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  tMinC: -10,
  tMaxC: 85,
  dcSwitch: { ratedVoltageV: 600, ratedCurrentA: 25 },
  dcFuse: null,
  dcSpd: { ucV: 700, inKA: 10, iscpvKA: 0.02, upKV: 2.0, type: 2 },
  acBreaker: { ratedCurrentA: 20 },
  acSpd: { ucV: 275, upKV: 1.5, type: 2 },
  acIsolator: { ratedCurrentA: 40 },
  equipmentImpulseWithstandKV: 4,
  spdToEquipmentDistanceM: 1,
  dcRun: {
    conductor: 'Cu',
    insulation: 'PR',
    sectionMm2: 6,
    lengthM: 20,
    installMethod: '13',
    referenceMethod: 'B',
    ambientTempC: 50,
    groupedCircuits: 1,
    layers: 1,
    izBaseA: 56,
  },
  acRun: {
    conductor: 'Cu',
    insulation: 'PR',
    sectionMm2: 4,
    lengthM: 10,
    installMethod: '3A',
    referenceMethod: 'B',
    ambientTempC: 50,
    groupedCircuits: 1,
    layers: 1,
    izBaseA: 32,
  },
  cosPhi: 0.8,
  lambdaOhmPerM: 0.00008,
  maxVoltageDropPct: 3,
  structure: {
    frameCount: 10,
    ballastPerFrame: 2,
    ballastMassKg: 75,
    structureWeightN: 550,
    heightHM: 1,
    depthDM: 1.5,
    windSpeedKmh: 120,
    tiltDeg: 30,
  },
  site: {
    phases: 1,
    lightningRod: false,
    gps: { lat: 36.5606, lon: 10.5272 },
  },
  dossierDate: '2025-01-03',
  companyAccreditationValidTo: '2027-01-01',
};
```

Note: `acIsolator.ratedCurrentA: 40` must be `> sumInverterIacMaxA` (16 + 16 = 32) for
`checkC15` to pass — 40 > 32, so this fixture is clean.

- [ ] **Step 2: Verify the fixture produces a non-blocking result**

Run a quick throwaway check (not a committed test — just confirms the fixture is usable before
Tasks 4/5 build on it):

```bash
cd packages/dossier-worker && node --experimental-strip-types -e "
import { runEngine } from '@dossipv/engine';
import { twoInverterSiteFixture } from './test/fixtures/two-inverter-site.ts';
const result = runEngine(twoInverterSiteFixture);
console.log('hasBlockingFailure:', result.hasBlockingFailure);
console.log(result.checks.filter(c => !c.pass).map(c => c.id));
"
```

Expected: `hasBlockingFailure: false` and an empty (or WARN-only) failing-checks list. If any
BLOCK check fails, adjust the fixture's corresponding field (the printed check IDs tell you
which) and re-run until clean.

- [ ] **Step 3: Commit**

```bash
git add packages/dossier-worker/test/fixtures/two-inverter-site.ts
git commit -m "test(dossier-worker): add two-inverter fixture for multi-inverter coverage"
```

---

## Task 4: Allowed-placeholder-list prompt parameter in `@dossipv/document-text`

**Files:**
- Modify: `packages/document-text/src/prompt.ts`
- Modify: `packages/document-text/src/generate-dossier-text.ts`
- Modify: `packages/document-text/test/prompt.test.ts`
- Modify: `packages/document-text/test/generate-dossier-text.test.ts`

**Interfaces:**
- Consumes: nothing new from other packages (this task only changes `document-text`'s own
  internal signatures).
- Produces: `buildDossierTextUserPrompt(input: DossierTextInput, allowedPlaceholderNames: string[]): string`
  and `generateDossierText(input: DossierTextInput, client: Anthropic, allowedPlaceholderNames: string[]): Promise<DossierTextSections>`
  — both gain a new required third/second parameter. Task 5 is the only caller that supplies
  the real list (`Object.keys(PLACEHOLDER_DEFINITIONS)` from Task 2).

This is a breaking signature change to an existing, already-tested function — per the Global
Constraints, `document-text` still has zero knowledge of what the names mean or where they come
from, it only receives a `string[]` and lists it.

- [ ] **Step 1: Write the failing test for the new prompt parameter**

Add to `packages/document-text/test/prompt.test.ts` (inside the existing
`describe('buildDossierTextUserPrompt', ...)` block, alongside the existing tests — don't
remove the existing tests, they still apply with the new parameter added):

```ts
it('lists every allowed placeholder name explicitly, not just examples', () => {
  const allowedNames = ['P_DC_W', 'NS', 'NORME_CABLAGE'];
  const prompt = buildDossierTextUserPrompt(sampleInput, allowedNames);
  expect(prompt).toContain('{P_DC_W}');
  expect(prompt).toContain('{NS}');
  expect(prompt).toContain('{NORME_CABLAGE}');
});
```

Also update the three existing calls to `buildDossierTextUserPrompt(sampleInput)` in that same
file to pass a second argument, e.g. `buildDossierTextUserPrompt(sampleInput, ['INVERTER_COUNT', 'EARTH_ROD_COUNT'])`
(existing assertions about `{INVERTER_COUNT}`/`{EARTH_ROD_COUNT}` appearing in the prompt
depend on those two names being in the allowed list passed in).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/document-text && npx vitest run test/prompt.test.ts`
Expected: FAIL — TypeScript error (too many/too few arguments) or the new test failing because
the function doesn't yet use the second parameter.

- [ ] **Step 3: Update `buildDossierTextUserPrompt`**

In `packages/document-text/src/prompt.ts`, change the signature and append an explicit
placeholder list to the returned prompt string:

```ts
export function buildDossierTextUserPrompt(
  input: DossierTextInput,
  allowedPlaceholderNames: string[],
): string {
  return `Rédige les 6 sections du dossier technique pour cette installation photovoltaïque :

- Module : ${input.moduleBrandModel}
- Onduleur(s) : ${input.inverterBrandModel}, nombre d'onduleurs : {INVERTER_COUNT}
- Raccordement : ${input.gridType}, réseau ${input.phases === 1 ? 'monophasé' : 'triphasé'}
- Type de pose : ${input.mountingType}
- Structure : ${input.structureMaterial}
- Mise à la terre : {EARTH_ROD_COUNT} piquets de terre
- Fusible DC requis : ${input.dcFuseRequired ? 'oui' : 'non'}
- Interrupteur-sectionneur général AC requis : ${input.acIsolatorRequired ? 'oui' : 'non'}

Rédige :
1. introduction — présentation générale du projet
2. solution — description de la solution technique proposée
3. cabling — description du câblage DC et AC${input.dcFuseRequired ? ' (incluant la section fusible DC)' : ''}
4. earthing — description de la mise à la terre
5. structure — description de la structure et du lestage
6. conclusion — conclusion du dossier

Espaces réservés autorisés — tu ne peux utiliser AUCUN autre nom que ceux-ci : ${allowedPlaceholderNames
    .map((name) => `{${name}}`)
    .join(', ')}.

Rappel : aucun chiffre réel, uniquement des espaces réservés entre accolades, et uniquement parmi la liste ci-dessus.`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/document-text && npx vitest run test/prompt.test.ts`
Expected: PASS, all tests green (existing + new).

- [ ] **Step 5: Update `generateDossierText` to thread the new parameter through**

In `packages/document-text/src/generate-dossier-text.ts`, change the signature:

```ts
export async function generateDossierText(
  input: DossierTextInput,
  client: Anthropic,
  allowedPlaceholderNames: string[],
): Promise<DossierTextSections> {
  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4096,
    system: DOSSIER_TEXT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildDossierTextUserPrompt(input, allowedPlaceholderNames) }],
    output_config: {
      format: dossierTextOutputFormat,
    },
  });

  if (response.parsed_output === null) {
    throw new DossierTextParseError();
  }

  const sections = dossierTextSectionsSchema.parse(response.parsed_output);
  assertNoRawNumbers(sections);

  return sections;
}
```

- [ ] **Step 6: Update `generate-dossier-text.test.ts`'s three existing calls**

In `packages/document-text/test/generate-dossier-text.test.ts`, every call like
`generateDossierText(sampleInput, client)` becomes
`generateDossierText(sampleInput, client, ['P_DC_W', 'NS', 'NORME_REF', 'EARTH_ROD_COUNT'])`
(matching the placeholder names the test's own `cleanSections` fixture already uses — see that
file's existing `cleanSections` object for the exact names to list).

- [ ] **Step 7: Run the full document-text test suite**

Run: `cd packages/document-text && npm test`
Expected: PASS, all tests green.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/document-text/src/prompt.ts packages/document-text/src/generate-dossier-text.ts packages/document-text/test/prompt.test.ts packages/document-text/test/generate-dossier-text.test.ts
git commit -m "feat(document-text): require an explicit allowed-placeholder list in the prompt"
```

---

## Task 5: `generateDossierDocument` — the chaining worker

**Files:**
- Create: `packages/dossier-worker/src/generate-dossier-document.ts`
- Modify: `packages/dossier-worker/src/index.ts`
- Test: `packages/dossier-worker/test/generate-dossier-document.test.ts`

**Interfaces:**
- Consumes:
  - `runEngine`, `EngineResult`, `RunEngineInput`, `dcFuseRequired` from `@dossipv/engine`
  - `generateDossierText`, `substitutePlaceholders`, `DossierTextInput`, `DossierTextSections` from `@dossipv/document-text`
  - `PLACEHOLDER_DEFINITIONS`, `buildPlaceholderValues`, `ProjectMeta`, `PlaceholderSourceContext` from `./placeholder-map` (Task 2)
  - `habibKhedhiraFixture` from `../../engine/test/fixtures/habib-khedhira` (Task 2's import path)
  - `twoInverterSiteFixture` from `./fixtures/two-inverter-site` (Task 3)
- Produces: `generateDossierDocument(input: DossierWorkerInput, client: Anthropic): Promise<DossierWorkerResult>`
  and `DossierGenerationBlockedError`, exported from the package's `index.ts` — the public API
  this whole plan exists to deliver.

- [ ] **Step 1: Write the failing happy-path test**

```ts
// packages/dossier-worker/test/generate-dossier-document.test.ts
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  generateDossierDocument,
  DossierGenerationBlockedError,
} from '../src/generate-dossier-document';
import { habibKhedhiraFixture } from '../../engine/test/fixtures/habib-khedhira';
import { twoInverterSiteFixture } from './fixtures/two-inverter-site';
import type { DossierTextSections } from '@dossipv/document-text';

const sampleProjectMeta = {
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  gridType: 'BT',
  mountingType: 'FLAT_ROOF_BALLAST',
  structureMaterial: 'Aluminium',
  earthRodCount: 3,
};

const placeholderSections: DossierTextSections = {
  introduction: 'Installation de {P_DC_W}, {MODULE_COUNT} modules.',
  solution: '{NS} modules en série, {NP} chaîne(s) en parallèle.',
  cabling: 'Chute de tension DC {DU_DC_PCT}, norme {NORME_CABLAGE}.',
  earthing: '{EARTH_ROD_COUNT} piquets de terre.',
  structure: 'Structure conforme.',
  conclusion: '{INVERTER_COUNT} onduleur(s) installé(s).',
};

function fakeClientReturning(parsedResult: unknown): Anthropic {
  return {
    messages: {
      parse: vi.fn(() => Promise.resolve({ parsed_output: parsedResult })),
    },
  } as unknown as Anthropic;
}

describe('generateDossierDocument', () => {
  it('chains calculate -> generate text -> substitute, returning fully-substituted sections', async () => {
    const client = fakeClientReturning(placeholderSections);
    const result = await generateDossierDocument(
      { engineInput: habibKhedhiraFixture, projectMeta: sampleProjectMeta },
      client,
    );

    expect(result.sections.introduction).not.toMatch(/\{[A-Za-z0-9_]+\}/);
    expect(result.sections.introduction).toContain('3\u00a0100\u00a0W');
    expect(result.sections.solution).toContain('5 modules en série');
    expect(result.sections.earthing).toContain('3 piquets de terre');
    expect(result.engineResult.hasBlockingFailure).toBe(false);
  });

  it('derives INVERTER_COUNT and acIsolatorRequired correctly for a multi-inverter array', async () => {
    const client = fakeClientReturning(placeholderSections);
    const result = await generateDossierDocument(
      { engineInput: twoInverterSiteFixture, projectMeta: sampleProjectMeta },
      client,
    );

    expect(result.sections.conclusion).toContain('2 onduleur(s)');
  });

  it('throws DossierGenerationBlockedError before calling Claude when the design has a blocking failure', async () => {
    const blockedFixture = {
      ...habibKhedhiraFixture,
      // NS below inverter mppt startup minimum forces NS_MIN's check (C02) to fail.
      array: [
        {
          ...habibKhedhiraFixture.array[0]!,
          mppts: [{ stringsInParallel: 1, modulesPerString: 1 }],
        },
      ],
    };
    const client = fakeClientReturning(placeholderSections);

    await expect(
      generateDossierDocument({ engineInput: blockedFixture, projectMeta: sampleProjectMeta }, client),
    ).rejects.toThrow(DossierGenerationBlockedError);

    expect(client.messages.parse).not.toHaveBeenCalled();
  });

  it('propagates MissingPlaceholderValueError unchanged when generated text uses an unmapped placeholder', async () => {
    const unmappedSections: DossierTextSections = {
      ...placeholderSections,
      introduction: 'Texte avec {UNKNOWN_PLACEHOLDER} dedans.',
    };
    const client = fakeClientReturning(unmappedSections);

    await expect(
      generateDossierDocument({ engineInput: habibKhedhiraFixture, projectMeta: sampleProjectMeta }, client),
    ).rejects.toThrow('UNKNOWN_PLACEHOLDER');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/dossier-worker && npx vitest run test/generate-dossier-document.test.ts`
Expected: FAIL — `Cannot find module '../src/generate-dossier-document'`.

- [ ] **Step 3: Implement `generate-dossier-document.ts`**

```ts
// packages/dossier-worker/src/generate-dossier-document.ts
import type Anthropic from '@anthropic-ai/sdk';
import {
  runEngine,
  dcFuseRequired,
  type RunEngineInput,
  type EngineResult,
  type CheckResult,
} from '@dossipv/engine';
import {
  generateDossierText,
  substitutePlaceholders,
  type DossierTextInput,
  type DossierTextSections,
} from '@dossipv/document-text';
import {
  PLACEHOLDER_DEFINITIONS,
  buildPlaceholderValues,
  type ProjectMeta,
} from './placeholder-map';

export interface DossierWorkerInput {
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
}

export interface DossierWorkerResult {
  sections: DossierTextSections;
  engineResult: EngineResult;
}

/**
 * Thrown when the engine reports a blocking check failure for this design. Carries the full
 * check list so a caller can show the installer exactly which check(s) failed and why —
 * generation never reaches the Claude call in this case (no wasted API cost on an invalid
 * design), per spec §4 step 2.
 */
export class DossierGenerationBlockedError extends Error {
  public readonly checks: CheckResult[];

  constructor(checks: CheckResult[]) {
    const failing = checks.filter((c) => c.level === 'BLOCK' && !c.pass);
    super(
      `Cannot generate dossier text: ${failing.length} blocking check(s) failed (${failing
        .map((c) => c.id)
        .join(', ')}).`,
    );
    this.name = 'DossierGenerationBlockedError';
    this.checks = checks;
  }
}

/**
 * Runs the engine, refuses to proceed on a blocking failure, derives the non-engine
 * DossierTextInput fields, generates French dossier prose from Claude, and substitutes every
 * placeholder with its real engine-computed value. The single entry point for spec §5's
 * text-generation steps (snapshot/simulation/drawings/docx/PDF/annexes are out of scope here —
 * see the design spec).
 */
export async function generateDossierDocument(
  input: DossierWorkerInput,
  client: Anthropic,
): Promise<DossierWorkerResult> {
  const engineResult = runEngine(input.engineInput);

  if (engineResult.hasBlockingFailure) {
    throw new DossierGenerationBlockedError(engineResult.checks);
  }

  const firstEntry = input.engineInput.array[0]!;
  const representativeMppt = firstEntry.mppts[0]!;

  const textInput: DossierTextInput = {
    moduleBrandModel: input.projectMeta.moduleBrandModel,
    inverterBrandModel: input.projectMeta.inverterBrandModel,
    inverterCount: input.engineInput.array.length,
    gridType: input.projectMeta.gridType,
    phases: input.engineInput.site.phases,
    mountingType: input.projectMeta.mountingType,
    structureMaterial: input.projectMeta.structureMaterial,
    earthRodCount: input.projectMeta.earthRodCount,
    dcFuseRequired: dcFuseRequired(input.engineInput.module, representativeMppt.stringsInParallel),
    acIsolatorRequired: input.engineInput.array.length > 1,
  };

  const allowedPlaceholderNames = Object.keys(PLACEHOLDER_DEFINITIONS);
  const sections = await generateDossierText(textInput, client, allowedPlaceholderNames);

  const values = buildPlaceholderValues({
    derived: engineResult.derived,
    engineInput: input.engineInput,
    representativeMppt,
    projectMeta: input.projectMeta,
  });

  return {
    sections: substitutePlaceholders(sections, values),
    engineResult,
  };
}
```

- [ ] **Step 4: Wire the barrel file**

Update `packages/dossier-worker/src/index.ts`:

```ts
export * from './placeholder-map';
export * from './generate-dossier-document';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/dossier-worker && npx vitest run test/generate-dossier-document.test.ts`
Expected: PASS, all 4 tests green.

If the blocking-failure test's fixture (`modulesPerString: 1`) doesn't actually trigger a BLOCK
check, inspect `engineResult.checks` for that fixture (add a temporary
`console.log(engineResult.checks.filter(c => !c.pass))` in a scratch script) and adjust the
fixture's broken field until exactly one BLOCK check fails — `NS` below `NS_MIN` (checkC02) is
the intended trigger, but confirm it empirically against the real `nsMin()` formula rather than
assuming.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Run the full workspace test suite**

Run: `npm test`
Expected: PASS — every existing `@dossipv/engine` and `@dossipv/document-text` test still
green, plus all new `@dossipv/dossier-worker` tests.

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: PASS (or fix any reported issues before committing).

- [ ] **Step 9: Commit**

```bash
git add packages/dossier-worker/src/generate-dossier-document.ts packages/dossier-worker/src/index.ts packages/dossier-worker/test/generate-dossier-document.test.ts
git commit -m "feat(dossier-worker): add generateDossierDocument chaining calculate, text generation, and substitution"
```

---

## Task 6: Whole-package review pass

**Files:** none new — this task re-reads everything Tasks 1–5 produced.

**Interfaces:** none new.

- [ ] **Step 1: Re-run the full suite from the repo root**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS.

- [ ] **Step 2: Confirm the dependency direction constraint held**

Run: `grep -r "dossier-worker" packages/engine/package.json packages/document-text/package.json`
Expected: no matches — neither package depends on the new one.

- [ ] **Step 3: Confirm no raw unformatted numbers can reach final output**

Re-read `packages/dossier-worker/src/placeholder-map.ts`'s `formatValue` function and confirm
every entry in `PLACEHOLDER_DEFINITIONS` (Task 2) that returns a `number` from its `source` has
been exercised by at least one test in `placeholder-map.test.ts` — cross-check the table's keys
against the test file's assertions. Add any missing case directly (no separate task needed for
a one-line formatting gap).

- [ ] **Step 4: Update project memory**

This is a judgment call, not a scripted step: if this plan's completion changes what "next
planned piece" means for the project, update
`C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
to reflect the new `@dossipv/dossier-worker` package, its test count, and what's still
deferred (docx/PDF/drawings/PVGIS simulation/snapshot persistence) — matching that file's
existing style for the engine and document-text entries.

- [ ] **Step 5: Final commit if any fixes were made in Step 3**

```bash
git add -A
git commit -m "test(dossier-worker): close formatting coverage gaps found in final review"
```

(Skip this step entirely if Step 3 found no gaps.)
