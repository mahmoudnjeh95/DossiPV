# DossiPV — Document Pipeline (Slice 1: Snapshot + Docx Template + Fill) Design Spec

## 1. Purpose and scope

Sub-project #8 of the "full application" build, per the master spec
(`docs/superpowers/specs/2026-10-02-dossipv-design.md` §5). The full pipeline has 8 steps;
this slice covers the first three that are buildable and verifiable entirely locally, with no
dependency on the real deployment server's LibreOffice availability (which this session has no
way to confirm — no shell access to that server beyond the database tunnel):

1. **Snapshot** — freeze the project's input data and the exact equipment records used.
2. **Docx template** — design, from scratch, the `.docx` template structure (no reference file
   exists in this repo — confirmed by searching for one before writing this spec).
3. **Fill** — populate that template with real engine/text/simulation data via `docxtemplater`,
   producing a real, openable `.docx` file.

**Explicitly deferred to a follow-up slice** (named here so the decomposition is visible, not
silently dropped): SVG drawings (single-line diagram, wiring diagrams, map-editor-derived
pages 37-38), LibreOffice headless PDF conversion, annex PDF merging, and the save-to-history
step. Each of these needs either a real design decision this spec doesn't make (drawings) or
confirmation of the real server's LibreOffice install (PDF conversion, which this session
cannot verify) — attempting them now would mean guessing rather than building on confirmed
ground, the same reasoning that split sub-project #7's PVGIS work from a server dependency it
could verify directly (the PVGIS API) versus one it couldn't (no shell access to the server).

**Note on how this spec was produced**: written autonomously (user asleep, standing
instruction to keep building using the recommended option at each decision point). The .docx
template's own structure is itself a new design decision this spec makes explicitly — not an
existing artifact being wired in, since none exists yet.

## 2. Decisions

- **`docxtemplater` (npm package `docxtemplater`, plus its required `pizzip` dependency for
  reading/writing the `.docx` zip container)** for templating — confirmed via research that
  its core tag types (placeholder `{tag}`, loop `{#loop}...{/loop}`, condition
  `{#condition}...{/condition}`) are free/open-source, not gated behind a paid module; only
  advanced features this slice doesn't need (image insertion, HTML rendering, chart-data
  replacement) require a paid add-on. This matches the master spec's own requirement for
  "repeated blocks per inverter/MPPT/cable run and conditional sections (fuse section only if
  `DC_FUSE_REQUIRED`; AC isolator section only if more than one inverter)" exactly — no custom
  templating engine needs to be built.
- **The `.docx` template is authored as a real Word file, committed to the repo** (not
  generated programmatically from scratch at build time) — this is how every real-world
  `docxtemplater` usage works: a human-authored template with tag placeholders, filled at
  runtime. Since no design/branding reference exists yet, this slice's own template is
  **functionally complete but visually minimal** (plain structure, placeholder tags in the
  right places, correct repeated/conditional blocks) rather than a polished, fully-designed
  document — visual polish is explicitly deferred to whoever has real brand/layout
  requirements to apply, matching this session's established pattern of not inventing
  requirements nobody has stated.
- **New package `@dossipv/docx-template`** (not inside `@dossipv/dossier-worker`) holding the
  template file itself and the fill function — keeps the (potentially large, binary) template
  file and its narrow filling logic separate from the worker's own orchestration code, matching
  this session's established pattern of one clear responsibility per package.
- **Snapshot persistence reuses `DossierJob.inputSnapshot` (`Json`, already in the schema from
  sub-project #1)** — no new table. The snapshot is the project's full nested input (client,
  site, array config with resolved equipment records, protections, cabling, structure) captured
  as one plain JSON object at generation time, via Prisma's own nested-include query shape —
  not re-deriving the engine's `RunEngineInput` from scratch each time history is viewed.
- **The snapshot captures equipment by VALUE, not by reference** — the master spec's own
  wording ("the exact equipment records used (so later catalog edits never change an
  already-generated dossier)") requires this explicitly: a project's `PvModule`/`Inverter`/etc.
  relations are followed and their full field values embedded directly in the snapshot JSON,
  not just their IDs (an ID alone would still be vulnerable to the referenced row being edited
  later).
- **Template sections**: the prose sections from `@dossipv/document-text`'s
  `DossierTextSections` (`introduction`, `solution`, `cabling`, `earthing`, `structure`,
  `conclusion`) are inserted as whole-paragraph placeholder tags (e.g. `{introduction}`) — one
  tag each, no further structure, since these are already complete French prose from Claude.
  Numeric/equipment data becomes its own set of plain-value tags (module brand/model, inverter
  brand/model, `P_DC_W`, `MODULE_COUNT`, etc. — reusing `PLACEHOLDER_DEFINITIONS`' existing
  computed values directly, not recomputing them a second time) plus `docxtemplater` loop
  blocks for the genuinely repeated structures: one loop over `array` (inverters) nesting a
  loop over each inverter's `mppts`, and one loop over cable runs.
- **Conditional sections use `docxtemplater`'s own condition tags directly on the already-
  computed booleans** (`dcFuseRequired`, `acIsolatorRequired` — both already computed by
  `generate-dossier-document.ts` today) — no new conditional-logic needs inventing, the fill
  function just passes these through as render-data booleans.
- **No image/logo insertion in this slice.** The master spec's branding requirement ("every
  generated page carries the installer's own company logo") needs `docxtemplater`'s paid
  image-module (confirmed during this spec's research) or a more involved manual OOXML
  manipulation — out of scope for this slice; the template reserves a clearly-labeled
  placeholder text block (`{companyName}`, `{companyAddress}`, etc. as plain text) where a
  logo image would eventually go, and this gap is named explicitly rather than silently
  worked around with an unlicensed image hack.

## 3. Package structure

```
packages/docx-template/
  template/
    dossier-template.docx       — the authored Word template (committed binary file)
  src/
    build-snapshot.ts            — buildProjectSnapshot(projectId): captures full input by value
    fill-template.ts              — fillDossierTemplate(templateBuffer, data): Buffer
    types.ts                      — DossierTemplateData (the full render-data shape)
  test/
    fill-template.test.ts
    build-snapshot.test.ts
```

## 4. Snapshot shape

```ts
// Every top-level section except cableRuns/capturedAt is nullable, matching the schema's own
// optional relations on Project (a project can legitimately exist with some sections not yet
// filled in) — the snapshot reflects that reality rather than assuming completeness.
export interface ProjectSnapshot {
  client: ProjectClient | null;   // full row when present, not just the FK
  site: ProjectSite | null;
  arrayConfig: {
    module: PvModule;              // full equipment row, captured by value
    inverters: {
      inverter: Inverter;           // full equipment row, captured by value
      mppts: ProjectArrayMppt[];
    }[];
  } | null;
  protections: (ProjectProtections & {
    dcSpd: Spd; dcSwitch: DcSwitch; dcFuse: DcFuse | null;
    acBreaker: AcBreaker; acSpd: Spd; acIsolator: AcIsolator | null;
  }) | null;
  cablingConfig: ProjectCablingConfig | null;
  cableRuns: ProjectCableRun[];     // array relation — naturally empty, never null
  structure: ProjectStructure | null;
  earthing: ProjectEarthing | null;
  capturedAt: string; // ISO timestamp
}
```

`buildProjectSnapshot(projectId)` runs one Prisma query with every relevant nested `include`,
then returns this plain object — written into a new `DossierJob` row's `inputSnapshot` field
by the (not-yet-built, deferred) job-orchestration step; this slice's own scope ends at
producing the snapshot object and proving it round-trips through `JSON.stringify`/`parse`
losslessly (the real correctness bar for something that will sit in a `Json` column).

## 5. Template render-data shape

```ts
export interface DossierTemplateData {
  // Cover / company block
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  // Client block
  clientFullName: string;
  clientAddress: string;
  clientStegReference: string;
  // Prose sections (already-substituted, placeholder-free text from generateDossierDocument)
  introduction: string;
  solution: string;
  cabling: string;
  earthing: string;
  structure: string;
  conclusion: string;
  // Key computed figures (reusing PLACEHOLDER_DEFINITIONS' own values, not recomputed)
  moduleBrandModel: string;
  inverterBrandModel: string;
  pDcW: string;       // pre-formatted per PLACEHOLDER_DEFINITIONS' own decimals/unit rules
  moduleCount: string;
  // Repeated blocks
  inverters: {
    inverterLabel: string; // e.g. "Onduleur 1"
    mppts: { mpptLabel: string; stringsInParallel: number; modulesPerString: number }[];
  }[];
  cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string }[];
  // Conditionals
  dcFuseRequired: boolean;
  acIsolatorRequired: boolean;
}
```

`fillDossierTemplate(templateBuffer, data)` loads the template via `pizzip`, constructs a
`docxtemplater` instance, calls `.render(data)`, and returns the resulting `.docx` as a
`Buffer` — a pure, synchronous, fully-testable function given a template buffer and data (no
I/O inside the function itself; the caller reads the template file and passes its buffer in).

## 6. Testing

- `fillDossierTemplate`: unit-tested against the real committed template file (reading it from
  disk in the test, not a mock) with a representative `DossierTemplateData` fixture, asserting
  the returned buffer is a valid `.docx` (re-opens it with `pizzip`/`docxtemplater` itself and
  confirms no render error) and that key substituted strings/values actually appear in the
  extracted document XML — the strongest test available without opening the file in a real
  Word application, which this session cannot do, but genuinely proves the fill mechanism
  works end-to-end against the real template, not a toy stand-in.
- A dedicated test exercises the conditional/loop paths specifically: one render with
  `dcFuseRequired: true` and multiple inverters/MPPTs, one with `dcFuseRequired: false` and a
  single inverter/MPPT, asserting the fuse section's own text is present/absent and the correct
  number of repeated blocks appear in each case.
- `buildProjectSnapshot`: tested against the real database (same pattern as every other
  `@dossipv/db`-touching function this session), asserting the full nested shape round-trips
  through `JSON.stringify`/`JSON.parse` with no data loss (specifically checking `Decimal`
  fields, which Prisma returns as `Decimal` objects that don't serialize to plain numbers via
  default `JSON.stringify` — this is a real, concrete risk worth testing directly, not assumed
  to "just work").

## 7. Open items for the implementation plan to resolve

- The exact visual structure of `dossier-template.docx` itself (page order, heading styles,
  table layouts) — this spec commits to the functional structure (which tags, loops,
  conditions exist and where) but the plan's own task writing the actual Word file should keep
  it deliberately simple (this spec's own §2 decision), not invent visual design requirements
  nobody has stated.
- Whether `Decimal` fields need an explicit `.toString()`/`Number()` conversion before being
  handed to `JSON.stringify` inside `buildProjectSnapshot` — flagged as a real risk in §6, the
  plan's own test should prove which approach (if any) is needed rather than assuming.
