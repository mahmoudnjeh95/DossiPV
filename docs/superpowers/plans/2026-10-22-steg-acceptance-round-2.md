# STEG Acceptance — Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generated dossier acceptable to a STEG reviewer. That means fixing every blocking reason in the round-1 verdict (B1–B8) and reaching the human-made reference dossier's level in four areas: annex completeness, highlighting of the values used, format and style, and calculation-note content. The installer's flow keeps the same few taps.

**Architecture:** Most of the fix prints or annexes data the project already holds:
- map points; Company ANME data; bill consumption;
- protection ratings; the engine's intermediate values;
- catalog datasheet URLs and the STEG/ANME source lists.

New pieces:
- **PVGIS step.** The worker runs a mandatory PVGIS step at the exact GPS point, first, so a failure costs nothing.
- **Annex assembly.** A fixed, numbered annex plan follows the reference's N°1–N°25 scheme. A pdfjs-based text locator lets the worker highlight the chosen inverter's column and its STEG-list row, and find real TOC page numbers.
- **Drawing kit.** A small pdf-lib drawing kit (IEC-style symbols plus cartouche) draws the single-line, string, DC-box and AC-box diagrams.

The installer gets only two additions, each shown only when needed:
- an identity box when the bill lacks the holder's name or the CIN is missing;
- a pre-generation summary listing missing STEG papers. Missing papers make the PDF a watermarked draft rather than blocking it.

**Tech Stack:** TypeScript (ESM, Node ≥ 24), Next.js 16 Server Actions, Prisma 7, pdf-lib, `pdfjs-dist` (new; legacy Node build), docxtemplater 3.71 + `docx` (template generator), `@anthropic-ai/sdk`, PVGIS v5.3 API, vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-21-steg-bill-to-dossier-design.md` (user decisions §2 dated 2026-10-22, §5 B4).

**Inputs (motif and item numbers refer to these):**
- Under `.superpowers/sdd/2026-10-21-steg-bill-to-dossier/acceptance/`:
  - `agent3-steg-report.md` (motifs B1–B8);
  - `agent4-facilitator-report.md` (items 1–20);
  - `agent5-installer-report.md`;
  - `reference-comparison.md` (REF pages, annexes A1–A23, gaps P1–P3).
- Ledger: `.superpowers/sdd/2026-10-21-steg-bill-to-dossier/progress.md`.
- The reference dossier itself (`Dossier Technique - 434 - 303 - ….pdf`) holds real client data. It is gitignored; never commit it, quote it or copy values from it.

**Runs after:** `docs/superpowers/plans/2026-10-21-steg-bill-to-dossier.md` (all tasks, rulings R1–R12, F1–F9).

**Execution order:** Tasks 1 → 27 in number order, which is the STEG-impact order, adjusted only where a task consumes an earlier one's interface.
- Tasks 1–4: the product owner's decisions and the empty plans (B3, B7).
- Tasks 5–12: equipment truth and annex completeness (B5, B6, B8; product-owner priority 1), then highlighting (priority 2).
- Tasks 13–16: identity and STEG papers (B1, B2).
- Tasks 17–24: format and calculation notes (priority 3).
- Tasks 25–27: real drawings (B4).

## Global Constraints

- Development and tests use `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dossipv_dev` exported in the shell. Never open or use the production tunnel (port 5433). Prisma CLI runs from inside `packages/db`. Migrations: `npx prisma migrate dev --name <name> --create-only`, rename the folder to the timestamp the task gives, then `npx prisma migrate deploy` and `npx prisma generate`.
- Prisma 7: every relation needs its back-relation field on the other model.
- Every Server Action calls its auth guard (`requireAuthenticatedCompanyUser()` or `requireOwnedProject()`) as its first line. Tests mock `redirect()` as **throwing**. An action that mutates and does not `redirect()` calls `revalidatePath()`.
- UI and dossier text are French; code, comments, file names are English. Numbers shown to users use `Intl.NumberFormat('fr-FR')`, with a decimal comma everywhere, including dossier tables and drawings.
- Real client data never goes into git, test fixtures or plan text: the bill `D:\mahmoud repo\New folder\facture.webp`, the reference dossier PDF, any real name. Fixtures use "MR TEST CLIENT", and synthetic PDFs are generated in tests with pdf-lib.
- Stage only your own files and commit with a pathspec (`git commit -m "…" -- <paths>`). Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verification for every task:
  - `npx vitest run <changed test files>`;
  - `npx tsc -b --noEmit` and `npx eslint <changed files>` clean;
  - the touched packages' full suites stay green.
- **Any live external API (Anthropic, PVGIS) must have at least one live verification step, because mocked tests missed the Anthropic union-type limit in round 1** (ruling R12). A task whose code calls one of them ends with a live step against the real API and records its output in the task report. The same applies to downloads from datasheet and list URLs (Tasks 5, 10).
- Single-phase BT only; one inverter per project; three-phase and multi-inverter stay out of scope.
- **No AC isolator (user, 2026-10-22):** `acIsolatorId` stays `null` in every proposal; no task adds one. The dossier states that the differential AC breaker is the AC disconnecting device (Tasks 8, 20).
- **Sizing rule (user, 2026-10-22):** no production/consumption ceiling. The limits are inverter AC power ≤ subscribed power (C23) and DC/AC ≤ 1.3. The cheap pre-filter keeps only coverage ≥ 50 %.
- **PVGIS is mandatory (user, 2026-10-22):** the dossier always carries the PVGIS simulation at the installation's exact GPS point. If PVGIS fails, the job fails with `PVGIS indisponible : le dossier n'a pas été généré. Réessayez plus tard.` and produces no file.
- **ANME agreement is mandatory (product owner, 2026-10-22):** no dossier is generated without the company's uploaded ANME agreement (Task 9).
- **Template changes:** the docx template is generated. Edit `packages/docx-template/scripts/generate-template.ts`, run `npm run generate-template -w @dossipv/docx-template`, and commit the regenerated `template/dossier-template.docx` with the script. docxtemplater tags are flat top-level keys (no dotted paths). From Task 17 on, new template content uses the style helpers that task defines.
- **Highlight style (reference practice):** amber `rgb(1, 0.82, 0)` at opacity 0.4 with `BlendMode.Multiply`, drawn as flattened rectangles so it prints. A text-only datasheet gets no highlight; the job records a warning instead.
- Annex numbering follows the reference's scheme (Task 9 `ANNEX_NUMBERS`): N°1 dossier administratif … N°25 chemin de câbles. Slots that do not apply show `—` in the tables.
- **Drawing tasks start with a skill (product owner, 2026-10-22).** Tasks 4, 25, 26 and 27 (plans, single-line and wiring diagrams) begin with a step that loads the project skill `pv-electrical-drawings` (`.claude/skills/pv-electrical-drawings/SKILL.md`). That skill fixes:
  - the content checklist and the IEC-style symbols drawn with `page.drawSvgPath`;
  - the conductor colours and the title block;
  - the visual verification against the reference pages.

  Where this plan and the skill differ on a drawing detail, the skill wins, except for values pinned by the spec (e.g. the AGCP ladder). The PVGIS chart task (Task 23) begins by loading the `dataviz` skill.

## Review Focus

- PVGIS answers with its maintenance page (HTTP 403) during generation:
  - expected: the job ends FAILED with the exact French message; no Claude call is made, no file is saved, and a retry of the same project does not use a second monthly slot;
  - pinned by Task 2 test `fails the job without calling Claude when PVGIS is down`.
- A datasheet is a scan without a text layer, or the model string is printed differently (spaces, dots, a split cell):
  - expected: no highlight, a job warning naming the document, and the annex still appended; the job never fails;
  - pinned by Task 11 tests `skips the highlight on a text-less page with a warning` and `matches a model split across two text items`.
- The Esri tile server fails or has no imagery:
  - expected: pages for the implantation and situation plans still show the four points, the cable legs, their lengths and the GPS coordinates on a plain scaled background;
  - pinned by Task 4 test `draws the plan without a satellite background when tiles fail`.
- The installer changed a cable length by hand after placing the points:
  - expected: plans, summary and calculation notes print the real run length and "longueur saisie par l'installateur", never a formula giving a different number;
  - pinned by Task 4 test `prints no formula when the run length was edited`.
- A project created without a bill (manual, no `ProjectBillImport`):
  - expected: the dimensioning section says `Non renseignée` for the consumption and `—` for the coverage, with no `NaN` anywhere in the template data;
  - pinned by Task 3 test `handles a project without consumption`.

---

## File Structure

```
packages/engine/src/
  sizing.ts                         # T1
  run-lengths.ts                    # T4 formatRunLengthFormula
  checks.ts, run-engine.ts, sizing-types.ts, build-candidate.ts   # T7 C24
  cabling.ts                        # T21 izCorrectionFactors + derived K1..K4
  check-labels.ts                   # T18 neutral French label per check
  constants.ts                      # T25 STEG_SINGLE_PHASE_BRANCHEMENT_A
packages/pvgis-client/src/index.ts  # T2 timeout
packages/catalog-import/src/
  run-import.ts, cli.ts             # T5 datasheet download; T10 store source lists
  attach-curated-datasheets.ts      # T5 (new)
  purge-test-items.ts               # T6
data/catalog/{protections.json,accessories.json(new)}            # T5, T7
packages/dossier-worker/src/
  run-simulation.ts                 # T2 simulateProduction
  job-snapshot.ts                   # T2, T3, T9, T16 snapshot fields
  process-job.ts                    # every worker task wires its step here
  build-template-data.ts            # T3, T14, T15, T18–T22
  render-site-plan-pages.ts         # T4
  annex-plan.ts                     # T9 (new) slots, numbers, order, labels
  render-annex-divider.ts           # T9 (new) divider + bordereau
  pdf-locate.ts                     # T10 (new) pdfjs text boxes
  highlight.ts                      # T10/T11 (new) rectangles + column/row finders
  steg-list-annex.ts                # T10 (new)
  clean-pdf-annex.ts                # T12 (new) drop blank trailing pages
  render-cover-page.ts              # T14
  draft-watermark.ts                # T16 (new)
  stamp-study-pages.ts              # T17 (new) frame, header, footer
  render-production-report.ts       # T23 (new)
  render-toc.ts                     # T24
  drawing-symbols.ts                # T25 (new) IEC symbol paths + anchors (skill pv-electrical-drawings)
  drawing-kit.ts                    # T25 (new) sheet, cartouche, conductors, legend
  render-drawings.ts                # T25 single-line; T26 string wiring; T27 DC/AC boxes
packages/document-text/src/{types.ts,prompt.ts}                 # T8, T15
packages/docx-template/{scripts/generate-template.ts,src/types.ts,template/dossier-template.docx}
packages/db/prisma/schema.prisma + migrations                   # T7, T9, T10, T15, T16
apps/web/lib/
  project-access.ts, sizing-catalog.ts    # T6 provenance; T7 differential mapping
  project-engine-input.ts                 # T7 rcd; T8 protection refs; T15 meta
  client-identity.ts, annex-upload.ts     # T13 (new)
  dossier-number.ts                       # T14 (new)
  building-type.ts                        # T15 (new)
  steg-completeness.ts                    # T16 (new)
  specific-yield.ts                       # T3 wording
apps/web/app/(app)/projects/
  import-bill-actions.ts                  # T12 browser-print detection
  [id]/actions.ts                         # T3, T6, T9, T14, T16 (generateDossierAction)
  [id]/proposals/…                        # T13
  [id]/locations/…                        # T15, T16
  [id]/summary/…                          # T16 (new)
  [id]/jobs/[jobId]/page.tsx              # T9 job warnings
apps/web/app/(app)/library/…              # T6
apps/web/app/(app)/settings/…             # T9 ANME agreement required
apps/web/app/admin/(protected)/equipment/ac-breakers/…   # T7
```

---

### Task 1: Sizing — no coverage ceiling for "Production maximale"

**Files:**
- Modify: `packages/engine/src/sizing.ts`
- Test: `packages/engine/test/sizing.test.ts`

**Interfaces:**
- Produces: `export const MAX_PRODUCTION_RESERVE_RUNS = 2_000;`. The `proposeInstallations` signature is unchanged.

Rules (spec §5 B4, user decision 2026-10-22):
1. Delete `MAX_COVERAGE` and `MAX_PRODUCTION_MAX_COVERAGE`. The cheap filter keeps `ratio ∈ [0.8, 1.3]` and `coverage ≥ 0.5`.
2. MAX_PRODUCTION is the candidate with maximum `annualProductionKWh` among all valid candidates. The ties rule is unchanged.
3. Budget, in two phases. Without phase 2 the largest installations, which sort last, could never be built. All successes from both phases are pooled before winners are chosen.
   - Phase 1 builds combos sorted by |coverage − 1| until `MAX_ENGINE_RUNS − MAX_PRODUCTION_RESERVE_RUNS` runs.
   - Phase 2 walks the combos not yet built, by DC power descending (ties by key). It builds until one succeeds or the total reaches `MAX_ENGINE_RUNS`.
4. The no-combo reason becomes `Aucune combinaison panneaux/onduleur ne couvre au moins 50 % de la consommation.`
5. The MAX_PRODUCTION explanation becomes `La plus forte production possible avec ${kVA} kVA souscrits (onduleur ≤ puissance souscrite, rapport DC/AC ≤ 1,3).`
6. Update `proposeInstallations`'s doc comment: there is no 120 % limit any more.

- [ ] **Step 1: Update and add the failing tests** (fixture unchanged):
  - `objectives pick different installations for a large consumer`:
    - drop both coverage ceilings (`≤ 120`, `≤ 130`);
    - keep MAX_PRODUCTION production ≥ RECOMMENDED production and ECONOMIC modules ≤ RECOMMENDED modules.
  - `production maximale has no coverage ceiling`: with 3 000 kWh and 10 kVA, MAX_PRODUCTION has
    - `coveragePct > 130`;
    - `inverter.pacW <= 10000`;
    - `dcPowerKWp * 1000 / inverter.pacW <= 1.3`.
  - `production maximale is the largest buildable installation`: a brute force over `buildCandidate` for every eligible (module, inverter, ns, strings) with ratio ∈ [0.8, 1.3]. Its max DC power among `ok` results equals MAX_PRODUCTION's `dcPowerKWp`.
  - `explains that no combination covers half the need`: the reason equals the new text.
  - `caps engine runs` still passes.
- [ ] **Step 2: Run, expect FAIL** — `npx vitest run packages/engine/test/sizing.test.ts`.
- [ ] **Step 3: Implement** rules 1–6.
- [ ] **Step 4: Run, expect PASS**, then `npx vitest run packages/engine apps/web/test/apply-proposal-action.test.ts apps/web/test/proposal-card.test.tsx`.
- [ ] **Step 5: Commit** — `feat(engine): production maximale limited only by the subscribed power and DC/AC ratio`

---

### Task 2: The worker runs PVGIS at the exact GPS point — or the job fails

**Files:**
- Modify: `packages/pvgis-client/src/index.ts` (+ `test/index.test.ts`)
- Modify: `packages/dossier-worker/src/run-simulation.ts`, `src/job-snapshot.ts`, `src/process-job.ts`
- Test: `packages/dossier-worker/test/{run-simulation,job-snapshot,process-job}.test.ts`

**Interfaces:**
- Consumes: `computeMonthlySimulationTable`, `runEngine`; `fetchPvgisHourlyData`, `PvgisFetchError`; the `PvgisWeatherCache` table.
- Produces (in `run-simulation.ts`). `runProductionSimulation(projectId)`, which had no caller, is deleted.
```ts
export interface ProductionSimulationInput {
  lat: number; lon: number; tiltDeg: number; azimuthDeg: number;   // PVGIS aspect, 0 = south
  module: PvModuleInput; moduleCount: number; inverterPacW: number;
  dcVoltageDropPct: number; acVoltageDropPct: number;
}
export interface ProductionMonth {
  month: number; globHorKWhM2: number; globIncKWhM2: number; ambientTempC: number;
  eArrayKWh: number; eGridKWh: number; prPct: number;
}
export interface ProductionSimulation {
  lat: number; lon: number; tiltDeg: number; azimuthDeg: number; weatherYear: number;
  installedKWp: number; annualProductionKWh: number; annualArrayKWh: number;
  specificYieldKWhPerKWp: number; performanceRatioPct: number; monthly: ProductionMonth[];   // 12 rows
}
export class ProductionSimulationError extends Error {}
export function simulateProduction(input: ProductionSimulationInput): Promise<ProductionSimulation>;
```
- Produces (`job-snapshot.ts`):
  - `SnapshotSite` gains `tiltDeg: number | null`, `azimuthDeg: number | null`, `installationPointLat/Lon: number | null`, `floors: number | null`.
  - `WorkerJobSnapshot.client` becomes `SnapshotClient | null`, where `SnapshotClient = { fullName; address: string | null; stegReference: string | null; cin: string | null; annualConsumptionKWh: number | null; subscribedPowerKVA: number | null }`.
  - Any of these fields absent from an older snapshot parses as `null`.
- Produces (`process-job.ts`):
  - step `'simulation'`, with `GENERIC_FAILURE_REASONS.simulation = "PVGIS indisponible : le dossier n'a pas été généré. Réessayez plus tard."`;
  - a local `production: ProductionSimulation` consumed by Tasks 3 and 23.

Rules:
- `fetchPvgisHourlyData` passes `signal: AbortSignal.timeout(30_000)`.
- `simulateProduction` reuses the old cache lookup and insert unchanged: keys rounded to 4 decimals, year 2020.
  - Annual production = Σ `eGridKWh`.
  - PR is **weighted**: `annual / (installedKWp × Σ globIncKWhM2) × 100`.
  - It throws `ProductionSimulationError` when `installedKWp <= 0`, a value is not finite, annual ≤ 0, or there are not 12 months.
- In `processJob` the simulation runs **right after the snapshot parse, before the text step**. Its inputs:
  - GPS = installation point when set, else the site GPS;
  - `tiltDeg`; `azimuthDeg ?? 0`;
  - `engineInput.module`; module count and Σ `pacW` from `engineInput.array`;
  - voltage drops from `runEngine(snapshot.engineInput).derived.DU_DC_PCT/DU_AC_PCT` (0 when undefined).
- The call is wrapped in `withRetry`, with the default retry set; a 403 is not retried. A null site, a null tilt, or any throw → `fail(jobId, 'simulation', error)`.
- The save step upserts `ProjectSimulation` with `{ source: 'PVGIS_LIVE', annualProductionKWh, specificYieldKWhPerKWp, performanceRatioPct, systemLossesPct: null, pvsystReportFileId: null }`.

- [ ] **Step 1: Write the failing tests**
  - pvgis-client: `passes a timeout signal to the hourly fetch`.
  - run-simulation (mocked cache + fetch, synthetic 8 760 hourly rows):
    - `uses the cache on a hit`;
    - `fetches both series and caches them on a miss`;
    - `returns 12 months and a weighted PR` (exact to 1e-9);
    - `throws ProductionSimulationError for zero modules`;
    - `propagates PvgisFetchError`.
  - job-snapshot:
    - `parses a pre-round-2 snapshot`: client without `cin`/`annualConsumptionKWh` → both `null`. Tasks 3, 9 and 16 extend this same test with their fields' defaults.
    - `reads tilt and installation point from the site row`.
  - process-job:
    - `fails the job without calling Claude when PVGIS is down`: `PvgisFetchError(403)` → `status 'FAILED'`, `failedStep 'simulation'`, exact `failureReason`; `generateDossierDocument` and `saveFile` not called.
    - `simulates at the installation point`.
    - `stores the simulation figures on success`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS** (worker + pvgis-client suites).
- [ ] **Step 5: Live PVGIS check.** A scratchpad script, not committed, calls `simulateProduction` with the dev `DATABASE_URL`:
  - inputs: Sfax (34.74, 10.76), tilt 30, azimuth 0, 5 × the reference fixture module, 2 200 W, drops 1.5 / 1.0;
  - expected: specific yield in [1 500, 2 000] and 12 months.
  - If PVGIS still serves its maintenance page, record the status, run the dev worker on one PENDING job, and confirm the French failure. Repeat this step before the acceptance run.
- [ ] **Step 6: Commit** — `feat(worker): mandatory PVGIS production simulation at the installation's GPS point`

---

### Task 3: "Dimensionnement et productible" section

**Files:**
- Modify: `packages/docx-template/{scripts/generate-template.ts,src/types.ts,template/dossier-template.docx,test/fill-template.test.ts}`
- Modify: `packages/dossier-worker/src/{build-template-data.ts,job-snapshot.ts,process-job.ts}`
- Modify: `apps/web/app/(app)/projects/[id]/actions.ts`, `apps/web/lib/specific-yield.ts`, `apps/web/app/(app)/projects/[id]/proposals/page.tsx`
- Test: `packages/dossier-worker/test/{build-template-data,job-snapshot,process-job}.test.ts`, `apps/web/test/{generate-dossier-action,specific-yield}.test.ts`

**Interfaces:**
- Consumes: `ProductionSimulation` (Task 2).
- Produces, in the web `DossierJobSnapshotV1` and the worker `WorkerJobSnapshot`:
```ts
export interface SnapshotConsumption {
  annualConsumptionKWh: number; source: 'BILL' | 'MANUAL';
  billedKWh: number | null; monthsBilled: number | null; periodStart: string | null; periodEnd: string | null;
}
consumption: SnapshotConsumption | null;   // null when client.annualConsumptionKWh is null
```
  - `source` is `'BILL'` when `billImport.annualConsumptionKWh` equals the client's value. The bill figures then come from `billImport.reading`: `totalElectricityKWh`, `monthsBilled ?? derived`, the period dates.
  - Otherwise `source` is `'MANUAL'` and those fields are null.
- Produces: `BuildTemplateDataInput` gains `production`, `consumption`, `subscribedPowerKVA: number | null`, `phases: 1 | 3`. `computeSectionNumbers` gains `sectionNumberDimensionnement`, placed right after Présentation.
- Produces: `DossierTemplateData` gains these flat string fields:
  - `sizingBranchement`, `sizingSubscribedPower`, `sizingConsumption`, `sizingInstalledKWp`, `sizingInverterPac`, `sizingDcAcRatio`, `sizingRule`;
  - `productionAnnual`, `productionSpecificYield`, `productionPr`, `productionCoverage`, `productionMethod`;
  - `productionMonths: { monthLabel; globInc; eGrid; pr }[]`, `productionTotalGlobInc`, `productionTotalEGrid`;
  - `sectionNumberDimensionnement`.

Exact copy. Formats: kWh as integers, kWc with 2 decimals, ratio 2 decimals, PR 1 decimal, dates `dd/MM/yyyy`.
- `sizingBranchement`: `Monophasé BT`.
- `sizingSubscribedPower`: `${kVA} kVA`, or `Non renseignée`.
- `sizingConsumption`:
  - BILL with all fields: `${billedKWh} kWh facturés sur ${months} mois (du ${start} au ${end}) → environ ${annual} kWh/an (estimation à partir de ${months} mois de facture)`;
  - BILL without dates: `${billedKWh} kWh facturés sur ${months} mois → environ ${annual} kWh/an (estimation)`;
  - MANUAL: `${annual} kWh/an (valeur saisie par l'installateur)`;
  - null: `Non renseignée`.
- `sizingRule`: `Puissance AC de l'onduleur (${pac} kW) inférieure ou égale à la puissance souscrite (${kVA} kVA) ; rapport DC/AC limité à 1,3.`
- `productionCoverage`: `${round(annual / consumption × 100)} %`, or `—`.
- `productionMethod`: `Simulation PVGIS v5.3 (Centre commun de recherche de la Commission européenne, JRC) au point GPS ${lat}, ${lon} ; irradiation horaire de l'année ${year} ; inclinaison ${tilt}°, azimut ${az}° (0° = plein sud) ; pertes de câblage DC et AC calculées, écrêtage à la puissance de l'onduleur. Rapport détaillé en annexe N°2.`
- Month labels: `Janvier` … `Décembre`.

Template section, placed after Présentation:
- heading `{sectionNumberDimensionnement} Dimensionnement et productible`;
- a 2-column table: Type de branchement, Puissance souscrite, Consommation de référence, Puissance crête installée (kWc), Puissance AC de l'onduleur (kW), Rapport DC/AC, Règle de dimensionnement, Production annuelle estimée (kWh/an), Productible spécifique (kWh/kWc/an), Indice de performance (PR), Taux de couverture de la consommation, Méthode;
- a monthly table `Mois | Irradiation dans le plan (kWh/m²) | Production (kWh) | PR (%)` with a `{#productionMonths}` row and a `Total` row.

The TOC gains the entry.

Proposals screen wording (installer confusion #2):
- the fallback warning becomes `Estimation rapide : PVGIS momentanément indisponible, moyenne de 1 600 kWh/kWc utilisée. Le dossier utilisera la simulation PVGIS au point exact.`;
- under the cards, always: `Production estimée à partir de la position approximative ; le dossier utilisera la simulation PVGIS au point exact du champ PV.`

- [ ] **Step 1: Write the failing tests**
  - build-template-data:
    - `fills the sizing and production section from a bill`: the BILL copy with 6 months; 12 month rows with `Janvier` first; `sectionNumberDimensionnement 'II.'`, `sectionNumberSolution 'III.'`.
    - `handles a project without consumption`: `Non renseignée`, `—`, and no `NaN` in any string field.
    - `uses a decimal comma`.
  - fill-template: the text contains the heading, `Production annuelle estimée` and two month rows.
  - job-snapshot: `consumption` defaults to `null`.
  - generate-dossier-action: `snapshots the consumption from the bill import` (BILL) and `marks a typed consumption as MANUAL`.
  - specific-yield: the fallback warning equals the new text.
  - process-job: the TOC contains `II. Dimensionnement et productible`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** (regenerate the template). **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(dossier): dimensionnement et productible section from the bill and PVGIS`

---

### Task 4: Implantation and situation plans for every tier

**Files:**
- Modify: `packages/dossier-worker/src/render-site-plan-pages.ts`, `src/process-job.ts`, `packages/engine/src/run-lengths.ts`
- Test: `packages/dossier-worker/test/{render-site-plan-pages,process-job}.test.ts`, `packages/engine/test/run-lengths.test.ts`

**Interfaces:**
- Consumes: `planImplantationView`, `planSituationView`, `projectToImage`, `metersPerPixel`, `fetchSatelliteImage`; engine `groundDistanceM`, `computeRunLengthsM`; `SnapshotSite` (Task 2).
- Produces (engine): `formatRunLengthFormula(groundM: number, lengthM: number, floors: number | null, kind: 'DC' | 'AC'): string | null`.
  - DC → `${ground} m au sol × 1,2 + (${floors} + 1) niveau(x) × 3,5 m = ${L} m`.
  - AC → `${ground} m au sol × 1,2 = ${L} m`.
  - Returns `null` when `floors` is null (DC) or when `computeRunLengthsM` does not give back `lengthM`.
- Produces: the renderer input changes. `tier` and `premiumData` are replaced by the types below; Task 9 places the resulting fragment.
```ts
export interface SitePlanImage { buffer: Buffer | null; widthPx: number; heightPx: number; metersPerPixel: number }
export interface SitePlanPoints { field: PixelPoint | null; technicalRoom: PixelPoint | null; meter: PixelPoint | null; earthPit: PixelPoint | null }
export interface SitePlanLink { lengthM: number; sectionMm2: number; formula: string | null }
export interface SitePlanData {
  page37: { image: SitePlanImage; layout: Page37Layout | null; points: SitePlanPoints;
            gps: Record<keyof SitePlanPoints, LatLon | null>; dc: SitePlanLink; ac: SitePlanLink };
  page38: { image: SitePlanImage; sitePin: PixelPoint };
}
// SitePlanPagesInput = { clientFullName; clientAddress; gps; installerName; installerContact; companyLogoBuffer;
//                        dossierDate; dossierNumber; planData: SitePlanData | null }
```

Rules:
- **Images.** Whenever `snapshot.site` is set (any tier), fetch both images with `withRetry`. A failed fetch gives `buffer: null` and a `console.warn`; it never fails the job.
- **AI layout.** It runs only when the tier is `PREMIUM`, at least one point is placed and the page-37 buffer exists. Its own failure still fails the job, as today.
- **Points and markers.** `field` = the installation point, falling back to the site GPS. Markers are circles with a white border, in the editor's colours:
  - Champ PV `#F5B800`;
  - Local technique (onduleur) `#1E6FD9`;
  - Compteur STEG `#D93025`;
  - Piquet de terre `#1E8E3E`.
- **Cable legs.** Straight legs, with lengths and sections from `engineInput.dcRun/acRun`:
  - field → technical room: `DC : ${L} m — ${s} mm²`;
  - technical room → meter: `AC : ${L} m — ${s} mm²`;
  - technical room → earth pit: `Terre`, only when the pit is placed.
- **Legend.** One line per point (colour, label, GPS to 5 decimals, or `(non placé)`), then both formulas. When a formula is null the line reads `${kind} : ${L} m (longueur saisie par l'installateur)`. A `10 m` scale bar follows. The panel/route entries appear only when there is a layout.
- **No image.** Draw a `rgb(0.95,0.95,0.95)` frame titled `Fond satellite indisponible — positions à l'échelle`. Points, legs, scale bar and south arrow are still drawn.
- **Page 38.** Every tier gets it (pin + GPS), with the same fallback frame. It adds a north arrow and prints the GPS in decimal and in DMS (`34°44'31,6" N, 10°45'36,0" E`), as the skill asks.

- [ ] **Step 0: Load the project skill `pv-electrical-drawings`** and follow its "Implantation / situation plans" and "Verification" sections.
- [ ] **Step 1: Write the failing tests** (`extractPdfContent`/`findText`):
  - `draws the four points and the cable legs without an AI layout`: texts `Champ PV`, `DC : 26 m`, `AC : 28 m` and a 5-decimal GPS; at least 2 stroked paths between marker centres; no `À compléter`.
  - `draws the plan without a satellite background when tiles fail`.
  - engine: `formatRunLengthFormula(15, 26, 1, 'DC') === '15 m au sol × 1,2 + (1 + 1) niveau(x) × 3,5 m = 26 m'`.
  - `prints no formula when the run length was edited`: `formatRunLengthFormula(15, 40, 1, 'DC') === null`, and the legend says `longueur saisie par l'installateur`.
  - `keeps the empty frames when the project has no site`.
  - process-job:
    - `fetches satellite plans for a STANDARD project without calling the AI layout`;
    - `still calls the AI layout for PREMIUM`;
    - `does not fail the job when a tile fetch fails`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Visual check (skill verification).** Render a STANDARD and a PREMIUM fixture to PDF in the scratchpad. View pages 1–2 of each as images next to the reference's implantation and situation pages. Check the points, legs, lengths, legend, GPS and arrows; fix any overlap before committing.
- [ ] **Step 6: Commit** — `feat(worker): implantation and situation plans from the placed points for every tier`

---

### Task 5: Equipment datasheets are downloaded and stored by catalog-import

**Files:**
- Create: `packages/catalog-import/src/attach-curated-datasheets.ts`, `data/catalog/accessories.json`
- Modify: `packages/catalog-import/src/{run-import.ts,cli.ts}`
- Test: `packages/catalog-import/test/{attach-curated-datasheets,run-import-curated}.test.ts`

**Interfaces:**
- Produces: `runAttachCuratedDatasheets(db: PrismaClient, options: { apply: boolean; log: (line: string) => void; fetchPdf: (url: string, model: string) => Promise<string /* File id */> }): Promise<{ attached: number; failed: number }>`.
  - Scope: every shared spd, dcSwitch, dcFuse, acBreaker, acIsolator, cable and accessory row with `datasheetSourceUrl !== null && datasheetFileId === null`.
  - With `--apply` it calls `fetchPdf` (the CLI passes run-import's `uploadDatasheet`) and sets `datasheetFileId`.
  - A failure logs `fiche non téléchargée : ${url}` and moves on.
  - CLI command `attach-curated-datasheets [--apply]`, dry run by default, printing the `Base :` line as `purge-test-items` does.
- Produces: `importCurated` calls `datasheetOrNote(source, model)` for every **new** curated protection, cable and accessory, and stores `datasheetFileId`.
- Produces: `data/catalog/accessories.json` entries `{ kind: AccessoryKind; brand; model; spec: string | null; source }`, imported like protections (shared, DRAFT, `datasheetSourceUrl: source`). Minimum content, each with a real public manufacturer datasheet URL checked by download:
  - one `MC4_CONNECTOR`;
  - one `DISTRIBUTION_BLOCK` for earthing;
  - one `CABLE_TRAY`.

  An item whose datasheet cannot be fetched is left out and named in the task report; references are never invented.

The worker already annexes every chosen item's `datasheetFileId` (protections, cables, earth cable, connector, tray, distribution block). Task 9 orders them.

- [ ] **Step 1: Write the failing tests**
  - attach-curated-datasheets: `dry run changes nothing`; `apply attaches the file id`; `a download failure is logged and skipped`; `rows that already have a file are ignored`.
  - run-import-curated (fake db, stubbed `datasheetOrNote`): a new curated SPD and a new accessory are created with `datasheetFileId`; an existing one is skipped.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live download on dev.** Run `npx tsx packages/catalog-import/src/cli.ts attach-curated-datasheets`, then `--apply`, then the curated import, all with the dev `DATABASE_URL`.
  - Record attached/failed counts. Every failed URL is either replaced by a working manufacturer URL in the JSON or listed in the report.
  - Production follows `docs/runbooks/catalog-production-import.md` (staging folder) after the user's go-ahead.
- [ ] **Step 6: Commit** — `feat(catalog-import): download and store curated protection, cable and accessory datasheets`

---

### Task 6: No generic or unsourced equipment in a dossier

**Files:**
- Modify: `apps/web/lib/{project-access.ts,sizing-catalog.ts}`, `apps/web/app/(app)/library/{library-data.ts,actions.ts}`, `apps/web/app/(app)/projects/[id]/actions.ts`, `packages/catalog-import/src/purge-test-items.ts`
- Test: `apps/web/test/{sizing-catalog,library-actions,generate-dossier-action}.test.ts`, `packages/catalog-import/test/purge-test-items.test.ts`

**Interfaces:**
- Produces: `provenanceScope(companyId: string): { OR: [{ datasheetSourceUrl: { not: null } }, { ownerCompanyId: string }] }`.
  - `loadSizingCatalog` filters with `AND: [libraryScope, catalogScope, provenanceScope]`.
  - The `'catalogue'` mode of `loadSections` adds `provenanceScope`.
  - `addToLibraryAction` / `addAllOfKindAction` refuse unsourced shared items with `'Équipement sans fiche technique source : non disponible.'`.
- Produces: `unsourcedEquipment(project: ProjectForSnapshot): string[]` returns the `brand model` of each chosen module, inverter, protection, cable or accessory with `ownerCompanyId === null && datasheetSourceUrl === null`. When the list is non-empty, `generateDossierAction` returns `Équipement sans fiche technique : ${list}. Remplacez-le avant de générer.` before the quota check.
- `runPurge --apply` also deletes the `LibraryItem` rows that point at **referenced** unsourced items. Those items stay for their projects and show "(hors bibliothèque)". The dry run prints `— sera retiré de N bibliothèque(s)`.

- [ ] **Step 1: Write the failing tests**
  - every sizing query's `where.AND` contains `provenanceScope('c1')`;
  - `refuses an unsourced shared item`;
  - `allows the company's own item without a source`;
  - `refuses to generate with generic equipment` (`Generic AC-SPD-1` named, no job);
  - `apply removes library entries of referenced unsourced items`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Dev data run** — `purge-test-items`, then `--apply`, on dev only. `SolarPro Tunisie`'s library no longer lists `Generic …`.
- [ ] **Step 6: Commit** — `feat: sizing, libraries and generation use only sourced equipment`

---

### Task 7: 30 mA differential protection as data (differential AC breaker)

**Decision (cost if wrong):** the RCD is modelled as a property of the AC breaker: a 2P or 1P+N `disjoncteur différentiel`, 30 mA, type A minimum. There is no new equipment kind. If wrong, an installer who fits an MCB plus a separate RCCB must instead pick a differential breaker in the catalog; a separate RCCB kind can come later.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`; Create: `migrations/20261022120000_ac_breaker_residual_current/migration.sql`
- Modify: `packages/engine/src/{checks.ts,run-engine.ts,sizing-types.ts,build-candidate.ts,index.ts}`
- Modify: `apps/web/lib/{sizing-catalog.ts,project-engine-input.ts}`
- Modify: `apps/web/app/admin/(protected)/equipment/ac-breakers/…` (form + actions)
- Modify: `apps/web/app/(app)/projects/[id]/sections/forms/protections-form.tsx`, `apps/web/app/(app)/library/library-data.ts`
- Modify: `data/catalog/protections.json`, `packages/catalog-import/src/run-import.ts`
- Test: `packages/engine/test/{checks-c24,build-candidate}.test.ts` + fixture, `apps/web/test/{sizing-catalog,project-engine-input,admin-equipment-ac-breakers}.test.ts`

**Interfaces:**
- Prisma: `AcBreaker.residualCurrentMA Int?`, `AcBreaker.rcdType String?` (`'AC' | 'A' | 'F' | 'B'`; null means no differential function).
- Engine:
  - `export type RcdType = 'AC' | 'A' | 'F' | 'B'`;
  - `RunEngineInput.rcd?: { residualCurrentMA: number | null; rcdType: RcdType | null }`; when absent, C24 is not run, so legacy fixtures are unchanged (the same pattern as C23);
  - `checkC24(rcd)` → `{ id: 'C24', level: 'BLOCK', pass: residualCurrentMA !== null && residualCurrentMA <= 30 && rcdType ∈ {A, F, B}, message: 'Aucune protection différentielle 30 mA de type A (ou F, B) côté AC' }`.
- `CatalogAcBreaker` gains both fields.
  - `buildCandidate` only considers breakers that pass C24, with the C13 rule unchanged, and sets `engineInput.rcd`.
  - When none passes, the reason is `Aucun disjoncteur différentiel 30 mA de type A dans le catalogue.`
- `missingLibraryKinds`: the label `Disjoncteurs AC` becomes `Disjoncteurs différentiels AC 30 mA (type A)`.
- `buildEngineInput` always sets `rcd`. A project with a plain breaker is therefore blocked at generation (B5).
- Labels (form option, library figures): `${In} A · 30 mA type A`.
- Curated data: add **at least four** real differential breakers, 2P or 1P+N, 30 mA, type A, rated 16/20/25/32 A, from brands sold in Tunisia (Hager, Schneider Electric, Legrand, SIAME).
  - Each entry needs `residualCurrentMA`, `rcdType`, `ratedCurrentA`, `curve` and `breakingCapacityKA` read from the manufacturer's datasheet, plus `source` set to that datasheet URL.
  - Never invent a reference. An unfetchable datasheet means the entry is left out.

- [ ] **Step 1: Write the failing tests**
  - C24: 30 mA type A passes; 300 mA fails; type AC fails; null fails with the exact message; no C24 without `rcd`.
  - buildCandidate:
    - `picks the smallest differential breaker that passes C13 and C24`;
    - `returns the differential reason when only plain breakers exist`.
  - sizing-catalog:
    - maps the two columns;
    - `missingLibraryKinds` with only plain breakers shows the new label.
  - project-engine-input: `rcd` is set.
  - admin: saves `30`/`'A'`; refuses `rcdType 'X'`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Migration + implement.** **Step 4: Run, expect PASS** (existing engine fixtures unchanged).
- [ ] **Step 5: Dev data.** Run the curated import (datasheets are downloaded by Task 5's code), publish the new breakers in admin catalog review, and add them to `SolarPro Tunisie`'s library. The round-1 test project then gets proposals with a differential breaker.
- [ ] **Step 6: Commit** — `feat: 30 mA type A differential AC breaker required and auto-selected (C24)`

---

### Task 8: The AI text receives the exact protection list

**Files:**
- Modify: `packages/document-text/src/{types.ts,prompt.ts}`, `packages/dossier-worker/src/{placeholder-map.ts,generate-dossier-document.ts}`, `apps/web/lib/project-engine-input.ts`
- Test: `packages/document-text/test/prompt.test.ts`, `packages/dossier-worker/test/{placeholder-map,generate-dossier-document}.test.ts`, `apps/web/test/project-engine-input.test.ts`

**Interfaces:**
- `ProjectMeta` / `ProjectMetaForWorker` gain:
  - `protections: { dcSwitch: string; dcSpd: string; dcFuse: string | null; acBreaker: string; acSpd: string }` (each `brand model`);
  - `acBreakerFunction`: `disjoncteur différentiel ${In} A, 30 mA type ${t}` when the breaker is differential, else `disjoncteur magnétothermique ${In} A`.
- New `PLACEHOLDER_DEFINITIONS` (strings from `projectMeta`): `DC_SWITCH_REF`, `DC_SPD_REF`, `DC_FUSE_REF` (`—` when there is no fuse), `AC_BREAKER_REF`, `AC_BREAKER_FUNCTION`, `AC_SPD_REF`, `MODULE_REF`, `INVERTER_REF`.
- `DossierTextInput` gains `protectionLines: string[]`:
  - `Interrupteur-sectionneur DC : {DC_SWITCH_REF}`;
  - `Parafoudre DC : {DC_SPD_REF}`;
  - `Fusible DC : {DC_FUSE_REF}` (only when required);
  - `Protection AC et organe de sectionnement côté AC : {AC_BREAKER_FUNCTION} ({AC_BREAKER_REF})`;
  - `Parafoudre AC : {AC_SPD_REF}`.

Prompt changes:
- Add `Appareils de protection installés (liste exhaustive) :` followed by the lines.
- Add `Ne mentionne aucun autre appareil de protection que ceux de cette liste. Ne parle de protection différentielle que si elle y figure. Le sectionnement côté AC est assuré par l'appareil désigné ci-dessus : n'écris pas qu'un organe de sectionnement n'est pas requis.`
- Remove the `Interrupteur-sectionneur général AC requis` line.
- Module and inverter become the `{MODULE_REF}` / `{INVERTER_REF}` placeholders, so digits in model names no longer collide with the no-digit rule.

- [ ] **Step 1: Write the failing tests**
  - The prompt contains `liste exhaustive` and every protection line, and no `Interrupteur-sectionneur général AC requis`.
  - `AC_BREAKER_FUNCTION` → `disjoncteur différentiel 16 A, 30 mA type A`.
  - There is no `Fusible DC` line when no fuse is required.
  - A substituted `{AC_BREAKER_REF}` reads the brand and model.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live Anthropic check.** Run `generateDossierDocument` once with the real client on the reference fixture plus a differential breaker.
  - Expected: no `RawNumberLeakError` and no schema error.
  - The text names the differential breaker and no other protection device. Paste the sentences into the report.
- [ ] **Step 6: Commit** — `feat(text): the dossier text cites exactly the installed protections`

---

### Task 9: Annex plan — every annex, fixed order and numbers, divider, bordereau, mandatory ANME agreement

**Files:**
- Modify: `packages/db/prisma/schema.prisma`; Create: `migrations/20261022130000_annex_plan/migration.sql`
- Create: `packages/dossier-worker/src/annex-plan.ts`, `src/render-annex-divider.ts`
- Modify: `packages/dossier-worker/src/{process-job.ts,merge-annexes.ts,job-snapshot.ts}`
- Modify: `apps/web/app/(app)/projects/[id]/actions.ts`, `apps/web/app/(app)/settings/{page.tsx,actions.ts}`, `apps/web/app/(app)/projects/[id]/jobs/[jobId]/page.tsx`
- Modify: `apps/web/app/(app)/projects/[id]/sections/actions.ts` (annex field `moduleAcceptance`) + the annexes form
- Test: `packages/dossier-worker/test/{annex-plan,render-annex-divider,merge-annexes,process-job}.test.ts`, `apps/web/test/{generate-dossier-action,settings-company-action,section-annexes-action}.test.ts`

**Interfaces:**
- Prisma:
  - `ProjectAnnexes.moduleAcceptanceFileId String?`: the distributor's ANME acceptance letter for the module, with a `File` relation `"AnnexModuleAcceptance"` and its back-relation;
  - `DossierJob.warnings Json @default("[]")`, a French `string[]`.
- Produces (`annex-plan.ts`):
```ts
export type AnnexSlot = 'ADMIN' | 'SIMULATION' | 'STRUCTURE' | 'SINGLE_LINE' | 'IMPLANTATION' | 'SITUATION'
  | 'PANEL_WIRING' | 'DC_BOX' | 'AC_BOX' | 'INVERTER_HOMOLOGATION' | 'MODULE' | 'INVERTER' | 'DC_FUSE' | 'DC_SPD'
  | 'DC_SWITCH' | 'AC_SPD' | 'AC_ISOLATOR' | 'RCD' | 'AC_MAIN_BREAKER' | 'DC_CABLE' | 'AC_CABLE' | 'EARTH_CABLE'
  | 'CONNECTOR' | 'DISTRIBUTION_BLOCK' | 'CABLE_TRAY';
export const ANNEX_NUMBERS: Record<AnnexSlot, number>;   // ADMIN 1, SIMULATION 2, STRUCTURE 3, SINGLE_LINE 4, IMPLANTATION 5,
  // SITUATION 6, PANEL_WIRING 7, DC_BOX 8, AC_BOX 9, INVERTER_HOMOLOGATION 10, MODULE 11, INVERTER 12, DC_FUSE 13, DC_SPD 14,
  // DC_SWITCH 15, AC_SPD 16, AC_ISOLATOR 17, RCD 18, AC_MAIN_BREAKER 19, DC_CABLE 20, AC_CABLE 21, EARTH_CABLE 22,
  // CONNECTOR 23, DISTRIBUTION_BLOCK 24, CABLE_TRAY 25
export const ANNEX_TITLES: Record<AnnexSlot, string>;   // 'Dossier administratif', 'Simulation de production PVGIS',
  // 'Attestation de conformité de la structure', 'Schéma unifilaire', "Plan d'implantation et de connexion", 'Plan de situation',
  // 'Câblage des panneaux', 'Câblage du coffret DC', 'Câblage du coffret AC', "Homologation de l'onduleur (liste STEG)",
  // 'Fiche technique du module', "Fiche technique de l'onduleur", 'Fusible DC', 'Parafoudre DC', 'Interrupteur-sectionneur DC',
  // 'Parafoudre AC', 'Interrupteur-sectionneur AC', 'Disjoncteur différentiel', 'Disjoncteur AC général', 'Câble DC', 'Câble AC',
  // 'Câble de terre', 'Connecteurs MC4', 'Répartiteur de terre', 'Chemin de câbles'
/** Physical order of appended documents (reference dossier order). */
export const ANNEX_PHYSICAL_ORDER: AnnexSlot[];   // ADMIN, SIMULATION, STRUCTURE, SINGLE_LINE, IMPLANTATION, SITUATION, PANEL_WIRING,
  // DC_BOX, AC_BOX, MODULE, INVERTER, INVERTER_HOMOLOGATION, DC_FUSE, DC_SPD, DC_SWITCH, AC_SPD, AC_ISOLATOR, RCD, AC_MAIN_BREAKER,
  // DC_CABLE, AC_CABLE, EARTH_CABLE, CONNECTOR, DISTRIBUTION_BLOCK, CABLE_TRAY
export interface AnnexDocument { slot: AnnexSlot; label: string; source: { kind: 'file'; fileId: string } | { kind: 'fragment'; buffer: Buffer } }
export interface AnnexEntry { slot: AnnexSlot; number: number; title: string; documents: AnnexDocument[] }   // documents may be []
export function buildAnnexPlan(documents: AnnexDocument[]): AnnexEntry[];   // all 25 slots, numbered, docs in input order
export function annexDocumentsFromSnapshot(snapshot: WorkerJobSnapshot, company: { anmeCertificateFileId: string | null },
  annexes: { cinFileId; commercialRegisterFileId; stegContractFileId; lastPaidBillFileId; moduleAcceptanceFileId; extraFileIds: string[] } | null,
  structureAttestationFileId: string | null): AnnexDocument[];
```
- `ADMIN` documents, in this order:
  1. `Agrément ANME de l'installateur`;
  2. `Copie de la CIN du titulaire`;
  3. `Registre de commerce`;
  4. `Contrat STEG / attestation d'abonnement`;
  5. `Dernière facture STEG`;
  6. extras, as `Pièce complémentaire ${n}`.
- `MODULE` holds the datasheet, then `Acceptation ANME du module`. That is the project upload when present, else `PvModule.homologationFileId`. Task 10 adds the ANME list page as the fallback.
- `INVERTER` holds the datasheet, plus the inverter's `homologationFileId` when present.
- Each protection, cable or accessory goes to its slot (the differential breaker → `RCD`). Each file id appears once, under its first slot.
- `STRUCTURE` = `ProjectStructure.structureAttestationFileId`. This fixes a bug: it was never collected.
- Rendered fragments go to their slots: the drawings (`SINGLE_LINE`; Tasks 26–27 add the others), the plans (`IMPLANTATION`, `SITUATION`; Task 4), and the PVGIS report (`SIMULATION`; Task 23). They leave the body area.
- Produces:
  - `renderAnnexDivider(entries: { number: number; title: string; pageNumber: number | null }[]): Promise<Buffer>`: page 1 shows a large `ANNEXES`; then the `Bordereau des annexes` table `N° | Pièce | Page`, where empty slots show `—` in Page and are listed as `(sans objet)`;
  - `mergeDocumentFragments` returns `{ pdf: Buffer; skipped: string[] }`, so unreadable documents are named instead of dropped silently;
  - the job's `warnings` = skipped annex labels (+ Task 10/11 highlight warnings); the job page lists them under `Avertissements`.
- Final PDF order: cover, TOC, body, divider + bordereau, then the annexes in `ANNEX_PHYSICAL_ORDER`. The TOC entry `Annexes` points at the divider. `annexes.pdf` = divider + annexes.
- ANME agreement mandatory:
  - `generateDossierAction` returns `Ajoutez l'attestation d'agrément ANME de votre société dans Paramètres avant de générer.` when `company.anmeCertificateFileId` is null;
  - the settings page marks the field `obligatoire` and shows that sentence when it is missing.
- The annexes section form gains `Lettre d'acceptation ANME du module (fournie par le distributeur)`.

- [ ] **Step 1: Write the failing tests**
  - annex-plan:
    - `numbers every slot like the reference`: 25 entries, `RCD` = 18, `CABLE_TRAY` = 25;
    - `puts the ANME agreement first in the administrative annex`;
    - `collects the structure attestation`;
    - `puts the differential breaker under RCD`;
    - `lists a shared file id once`.
  - render-annex-divider: texts `ANNEXES`, `Bordereau des annexes`, `18`, `Disjoncteur différentiel`, `(sans objet)`.
  - merge-annexes: a corrupt buffer → `skipped` contains its label.
  - process-job:
    - annex documents are merged in physical order;
    - the drawings and plans now follow the divider;
    - `DossierJob.warnings` is saved.
  - generate-dossier-action: `refuses to generate without the ANME agreement`.
  - section-annexes-action: `stores the module acceptance letter`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Migration + implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(worker): numbered annex plan in reference order with bordereau; ANME agreement required`

---

### Task 10: STEG accepted-inverter list page (and ANME panel list page), row highlighted

**Files:**
- Modify: `packages/db/prisma/schema.prisma`; Create: `migrations/20261022140000_catalog_source_document/migration.sql`
- Modify: `packages/catalog-import/src/cli.ts` (command `store-source-lists`)
- Create: `packages/dossier-worker/src/{pdf-locate.ts,highlight.ts,steg-list-annex.ts}`; Modify: `packages/dossier-worker/package.json` (`pdfjs-dist`), `src/process-job.ts`
- Test: `packages/dossier-worker/test/{pdf-locate,highlight,steg-list-annex}.test.ts`, `packages/catalog-import/test/store-source-lists.test.ts`

**Interfaces:**
- Prisma:
  - `enum CatalogSourceKind { STEG_INVERTER_LIST ANME_PANEL_LIST }`;
  - `model CatalogSourceDocument { id String @id @default(uuid()); kind CatalogSourceKind @unique; fileId String (→ File); sourceUrl String; fetchedAt DateTime @default(now()); @@map("catalog_source_document") }`, with its back-relation on `File`.
- CLI: `store-source-lists [--apply]` downloads `SOURCE_LISTS.stegInverters` and `SOURCE_LISTS.anmePanels`, saves each as a `File`, and upserts by `kind`. The dry run prints the URLs and byte sizes.
- Produces (`pdf-locate.ts`, using `pdfjs-dist/legacy/build/pdf.mjs`):
```ts
export interface TextBox { text: string; x: number; y: number; width: number; height: number }   // PDF user space of the page as drawn (rotation applied)
export function extractTextBoxes(pdf: Buffer): Promise<TextBox[][]>;   // one array per page
export function normalizeModel(text: string): string;   // upper-case; drop spaces, '-', '_', '.', '/'
export function findModel(page: TextBox[], model: string): TextBox[];   // the item(s) whose normalized text — alone or joined with
  // the following items on the same baseline (|Δy| ≤ 2) — contains normalizeModel(model); [] when absent
```
- Produces (`highlight.ts`):
```ts
export interface HighlightRect { x: number; y: number; width: number; height: number }
export function drawHighlights(pdf: Buffer, pageIndex: number, rects: HighlightRect[]): Promise<Buffer>;   // amber rgb(1,0.82,0), opacity 0.4, Multiply
export function rowRect(page: TextBox[], hits: TextBox[]): HighlightRect;   // y-band of the hits ±2 pt, x from min to max x of the page's items
```
- Produces (`steg-list-annex.ts`): `buildListPageAnnex(listPdf: Buffer, model: string): Promise<{ page: Buffer; pageNumber: number } | null>`. It finds the first page where `findModel` hits, copies that page alone, and highlights its row. It returns null when the model is not found.
- In `processJob`:
  - the STEG list page for the inverter → slot `INVERTER_HOMOLOGATION`, labelled `Liste STEG des onduleurs acceptés — page ${n}`;
  - the ANME panel list page for the module → slot `MODULE`, labelled `Liste ANME des panneaux acceptés — page ${n}`, added only when no acceptance letter exists;
  - not found or no stored list → warning `Page de la liste ${STEG|ANME} introuvable pour ${model}.`, and nothing appended.

- [ ] **Step 1: Write the failing tests.** A synthetic list PDF is made in the test with pdf-lib: three pages of rows `Brand | Model | Power | Validity`; the target model is on page 2.
  - pdf-locate:
    - `extracts text boxes in page coordinates`;
    - `normalizes model strings`: `'SUN-2.2K-G04P1-EU-AM1'` and `'SUN 2.2K G04P1 EU AM1'` give the same value;
    - `matches a model split across two text items`.
  - steg-list-annex:
    - `returns page 2 with one amber rectangle over the row`, checked with `extractPdfContent`: a filled path with colour `[1, 0.82, 0]` whose y-band contains the model text;
    - `returns null when the model is absent`.
  - store-source-lists: `apply upserts one document per kind` (fake db, stubbed download).
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Migration + implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live check.** Run `store-source-lists --apply` on dev, then a scratchpad script that calls `buildListPageAnnex` for the round-1 inverter (`DEYE SUN-2.2K-G04P1-EU-AM1`) and module (`AE450MC-144`). Save the page PDFs in the scratchpad, view them as images, and confirm the highlighted row is the right one.
- [ ] **Step 6: Commit** — `feat: STEG and ANME list pages annexed with the chosen model's row highlighted`

---

### Task 11: Highlight the values used in the inverter and module datasheets

**Files:**
- Modify: `packages/dossier-worker/src/{highlight.ts,process-job.ts}`
- Test: `packages/dossier-worker/test/highlight.test.ts`, `test/process-job.test.ts`

**Interfaces:**
- Consumes: `extractTextBoxes`, `findModel`, `drawHighlights` (Task 10).
- Produces:
```ts
export function columnRects(page: TextBox[], header: TextBox[]): HighlightRect[];
export function highlightInverterDatasheet(pdf: Buffer, model: string): Promise<{ pdf: Buffer; highlighted: boolean }>;
export function highlightModuleDatasheet(pdf: Buffer, module: { model: string; pmaxW: number; vocV: number; iscA: number; vmpV: number; impA: number }): Promise<{ pdf: Buffer; highlighted: boolean }>;
```
- `columnRects` gives one rectangle per text item below the header. An item is included when its horizontal centre lies inside the column band. The band is the header's x-range, widened on each side to half the gap to the nearest other header-line item. Items on the header line itself are excluded, except the header.
- Inverter rule: on the first page where `findModel` hits, highlight the model's column, which reproduces the reference practice. A datasheet that lists one model per sheet has no column header for it. In that case, highlight the rows whose label matches `/max\.? *(dc|input).*voltage|mppt.*range|max\.? *input.*current|short.?circuit|rated output power|max\.? *output current/i`, using `rowRect`.
- Module rule (cheap extension): on the page where `findModel` or a header token `${pmaxW}` (optionally followed by `W`/`Wc`) hits, highlight the items in that column whose text, with a comma or a dot, equals one of `pmaxW`, `vocV`, `iscA`, `vmpV`, `impA` (formatted with 1–2 decimals).
- Text-less page, or nothing found → `highlighted: false`, the original PDF unchanged, and the job warning `Surlignage impossible dans ${label} (document scanné ou modèle introuvable).`
- `processJob` replaces the module and inverter datasheet buffers with the highlighted ones before merging.

- [ ] **Step 1: Write the failing tests.** The synthetic datasheet has 3 model columns and 8 labelled rows.
  - `highlights only the chosen model's column`: the amber rectangles' x-centres all sit inside model B's band, and their count equals B's items.
  - `falls back to rows for a single-model sheet`.
  - `highlights the module's five values`.
  - `skips the highlight on a text-less page with a warning` (an image-only PDF).
  - process-job: the merged dossier contains amber paths on the inverter datasheet page.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live check.** Run the round-1 datasheets (the dev `.file-storage` files of the DEYE inverter and the AE Solar module) through both functions. View the outputs as images, record which values were highlighted, and fix the matchers if a used value (Vdc max, MPPT range, Idc max, Isc max, Pac, Iac max) is missed.
- [ ] **Step 6: Commit** — `feat(worker): highlight the chosen model's values in the inverter and module datasheets`

---

### Task 12: Bill annex hygiene

**Files:**
- Create: `packages/dossier-worker/src/clean-pdf-annex.ts`
- Modify: `packages/dossier-worker/src/process-job.ts`, `apps/web/app/(app)/projects/import-bill-actions.ts`, `apps/web/app/(app)/projects/new/page.tsx`
- Test: `packages/dossier-worker/test/clean-pdf-annex.test.ts`, `apps/web/test/import-bill-action.test.ts`

**Interfaces:**
- Produces: `dropBlankTrailingPages(pdf: Buffer): Promise<Buffer>`. It removes trailing pages whose text (via `extractTextBoxes`), trimmed, is empty or only `[Fermer la fenêtre]`. A page with an image XObject counts as non-blank. It is applied to every PDF annex of the `ADMIN` slot.
- Produces: `isBrowserPrintedBill(pdfText: string): boolean`, true when the text contains `sid=`, `http://` or `https://`.
  - In that case the import still reads the bill and creates the project, but does **not** set `ProjectAnnexes.lastPaidBillFileId`. Cropping would leave the session URL in the file, so the file is never annexed.
  - It adds the warning `Facture imprimée depuis le site STEG (adresse web avec identifiant de session) : elle n'est pas jointe au dossier. Ajoutez une photo ou un scan de la facture papier acquittée.`
  - The text comes from `extractTextBoxes`. To keep `pdfjs-dist` out of the web bundle, export it from `@dossipv/dossier-worker`'s `pdf-locate` through a new `@dossipv/dossier-worker/pdf-locate` subpath export.
- Import page lead gains: `Photographiez la dernière facture payée (papier), avec le nom du titulaire.`

- [ ] **Step 1: Write the failing tests**
  - `drops a trailing page that only says [Fermer la fenêtre]`;
  - `keeps an image-only page`;
  - import: `does not annex a browser-printed PDF bill` (no `lastPaidBillFileId`, warning present, project created);
  - import: `annexes a photo bill as before`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `fix: never annex a browser-printed bill; drop blank trailing annex pages`

---

### Task 13: Client identity — ask the name and the CIN only when missing

**Files:**
- Create: `apps/web/lib/client-identity.ts`, `apps/web/lib/annex-upload.ts`, `apps/web/app/(app)/projects/[id]/proposals/identity-form.tsx`
- Modify: `apps/web/app/(app)/projects/[id]/proposals/{page.tsx,actions.ts}`, `apps/web/app/(app)/projects/import-bill-actions.ts`, `apps/web/app/(app)/projects/[id]/sections/actions.ts`
- Test: `apps/web/test/{client-identity,client-identity-action,section-annexes-action}.test.ts`

**Interfaces:**
- Produces:
  - `export const CLIENT_NAME_PLACEHOLDER = 'Client à compléter';`, used by the import action.
  - `clientIdentityNeeds(input: { fullName: string; reading: StegBillReading | null; cinFileId: string | null }): { name: boolean; cinPhoto: boolean; missingBillFields: BillRequiredField[] }`.
    - `name` is true when the name is blank or equals the placeholder.
    - `cinPhoto` is true when `cinFileId` is null.
    - `missingBillFields` = `checkBillReading(reading).missingFields`, or `[]` without a reading.
  - `storeAnnexFiles(projectId: string, formData: FormData): Promise<{ error: string } | null>`.
    - It is extracted from `saveAnnexesAction` phases 1–3: validate everything, then save, then the transaction, then delete replaced files, keeping files referenced by `ProjectBillImport`.
    - It covers every annex field, including Task 9's `moduleAcceptance`. `saveAnnexesAction` delegates to it.
  - `saveClientIdentityAction(projectId: string, prev: { error: string } | undefined, formData: FormData): Promise<{ error: string } | undefined>`.

Action rules:
1. Guard first.
2. `fullName` is read only when the field is present: trimmed, 2–200 characters, never the placeholder (`'Indiquez le nom du titulaire du contrat STEG.'`), and ignored when the identity is locked.
3. `cin` is optional and must match `/^\d{8}$/` (`'N° CIN invalide (8 chiffres).'`).
4. The `cin` file goes through `storeAnnexFiles`. The client row is updated only after the files are stored.
5. Finish with `revalidatePath('/projects/${projectId}/proposals')`.

Screen: on the proposals page, above "Lu sur la facture", the card **Identité du titulaire** appears only when `name || cinPhoto`.
- When `name`: the field `Nom du titulaire (comme sur le contrat STEG)` (required) and the line `La facture ne porte pas le nom du titulaire.`
- When `cinPhoto`: `Photo de la CIN` (`accept="image/jpeg,image/png,application/pdf"`, no `capture`) and `N° CIN (facultatif)`.
- The button is "Enregistrer".

- [ ] **Step 1: Write the failing tests**
  - needs flags for the placeholder, a real name, a missing CIN and a `clientName: null` reading;
  - action: `guards first`; `refuses the placeholder`; `refuses a 7-digit CIN`;
  - action: `stores the CIN photo and renames the client` (`cinFileId`, `fullName 'MR TEST CLIENT'`, `cin '01234567'`, revalidated);
  - action: `does not rename a locked identity`; `writes nothing when the photo is invalid`;
  - the annex tests stay green.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live UI check.** Playwright at 390 px: the card shows, saves, then disappears, and the breadcrumb shows the new name.
- [ ] **Step 6: Commit** — `feat(web): ask the holder's name and CIN photo only when the bill lacks them`

---

### Task 14: Cover, installer and client identity, signatures, dossier number

**Files:**
- Create: `apps/web/lib/dossier-number.ts`
- Modify: `apps/web/app/(app)/projects/[id]/actions.ts`
- Modify: `packages/dossier-worker/src/{render-cover-page.ts,build-template-data.ts,process-job.ts,render-site-plan-pages.ts}`
- Modify: the docx template (script, types, docx, test)
- Test: `apps/web/test/{dossier-number,generate-dossier-action}.test.ts`, `packages/dossier-worker/test/{render-cover-page,build-template-data,render-site-plan-pages}.test.ts`

**Interfaces:**
- Produces: `formatDossierNumber(projectId: string, date: Date): string` → `DPV-${YYYY}-${first 8 hex of the id, upper-case}`.
  - `generateDossierAction` stores it when `project.dossierNumber` is null, inside its existing transaction, and snapshots it.
  - An existing number never changes.
- Produces: `InstallerIdentity = { name; address; phone; email; anmeCode; anmeCategory; anmeValidTo /* ISO */; taxId: string | null; legalRepFullName; legalRepRole; commercialRegister: string | null }`. It is built once in `process-job.ts` from `Company`.
- `CoverPageInput` becomes `{ installer; companyLogoBuffer; dossierNumber; dossierDate; client: { fullName; cin: string | null; address: string | null; stegReference: string | null }; gps: { lat; lon } | null; installedKWp: number }`.
- Cover layout (reference p1, without the STEG logo; see open questions), top to bottom:
  - a double-line page frame (outer 1 pt at 20 pt inset, inner 0.5 pt at 24 pt inset);
  - the installer logo top-left;
  - the title `Dossier technique d'une installation photovoltaïque raccordée au réseau Basse Tension de la STEG`;
  - labelled fields, label colour `rgb(0.12,0.31,0.6)`, label then value:
    - `Client BT :`
    - `CIN :`
    - `Référence STEG :`
    - `Adresse :`
    - `Localisation (GPS) :` — `lat, lon` to 5 decimals
    - `Puissance installée :` — `${kWc} kWc`
    - `Installateur :` — name
    - `Agrément ANME n° :` — `${code} (catégorie ${cat}), valable jusqu'au ${date}`
    - `N° dossier :`
    - `Date :`
- `DossierTemplateData` gains `dossierNumber`, `dossierDateText`, `installerAnmeLine`, `installerTaxIdLine`, `installerLegalRepLine`, `clientCinLine`:
  - `Installateur agréé ANME n° ${code} (catégorie ${cat}), agrément valable jusqu'au ${dd/MM/yyyy}`;
  - `Matricule fiscal : ${taxId ?? 'non renseigné'}`;
  - `Représentant légal : ${name}, ${role}`;
  - `CIN : ${cin}`, or `CIN : copie jointe en annexe N°1`.
- Template:
  - The title paragraph stops being `{companyName}` (the company moves to the running header in Task 17). It becomes `Dossier technique de raccordement d'une installation photovoltaïque au réseau BT de la STEG`, followed by `Dossier n° {dossierNumber} du {dossierDateText}`.
  - The preamble gains the installer block and `{clientCinLine}`.
  - After the conclusion comes a 2-column signature table:
    - `Établi par l'installateur`, `{installerLegalRepLine}`, `Date :`, `Signature et cachet :` plus 4 blank lines;
    - `Lu et approuvé — le titulaire du contrat`, `{clientFullName}`, `Date :`, `Signature :` plus 4 blank lines.
- Site-plan title blocks add `Agrément ANME n° ${code}`.

- [ ] **Step 1: Write the failing tests**
  - `formatDossierNumber('019f6642-…', 2026-10-22) === 'DPV-2026-019F6642'`;
  - number assigned once, existing number kept;
  - cover text contains `Référence STEG :`, `34.74210`, `kWc`, `Agrément ANME n° ANME-TEST-01`, `CIN : 01234567`, and two nested frame rectangles;
  - template lines, including the `non renseigné` case; the signature table texts; the title is no longer the company name;
  - title block contains `Agrément ANME n°`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(dossier): reference-style cover, installer accreditation, client identity, signatures, dossier number`

---

### Task 15: House or flat, explained roof level, earthing details

**Files:**
- Modify: `packages/db/prisma/schema.prisma`; Create: `migrations/20261022150000_building_type/migration.sql`
- Create: `apps/web/lib/building-type.ts`
- Modify: `apps/web/app/(app)/projects/[id]/locations/{page.tsx,locations-map.tsx,actions.ts}`, `apps/web/lib/project-engine-input.ts`
- Modify: `packages/document-text/src/{types.ts,prompt.ts}`, `packages/dossier-worker/src/{generate-dossier-document.ts,placeholder-map.ts,build-template-data.ts}`, the docx template
- Test: `apps/web/test/{building-type,locations-action}.test.ts`, `packages/document-text/test/prompt.test.ts`, `packages/dossier-worker/test/build-template-data.test.ts`

**Interfaces:**
- Prisma: `enum BuildingType { HOUSE APARTMENT_BUILDING }`; `ProjectSite.buildingType BuildingType?`; `ProjectEarthing.useBuildingEarth Boolean @default(false)`.
- `guessBuildingType(address: string | null): 'APARTMENT_BUILDING' | null` matches whole words, case- and accent-insensitively: `app`, `appt`, `appartement`, `imm`, `immeuble`, `résidence`, `res`, `étage`, `bloc`.
- `LocationsPayload` gains `buildingType: 'HOUSE' | 'APARTMENT_BUILDING' | null`; `floors` becomes `number | null`.
- `ProjectMeta(ForWorker)` gains `earthingMode: 'DEDICATED_ROD' | 'BUILDING_EARTH'`, `buildingType`, `floors`. `DossierTextInput` gains `earthingMode`.
- `DossierTemplateData` gains `siteBuildingLine` and `earthingDetails: { label: string; value: string }[]`.

Rules:
- Validation, after the points checks:
  - buildingType null → `'Indiquez si le client habite une maison ou un immeuble.'`;
  - floors null → `'Indiquez l'étage du toit où seront posés les panneaux.'`;
  - floors must be an integer in 0–3 for HOUSE and 0–15 for APARTMENT_BUILDING (`'Niveau du toit invalide.'`);
  - HOUSE without an earth pit → `'Placez le point « Piquet de terre » : il est obligatoire pour une maison.'`.
- Save: `useBuildingEarth = APARTMENT_BUILDING && earthPit === null`, which sets `rodCount 0`; otherwise `rodCount 1`.
- Screen:
  - a two-button toggle **Maison individuelle / Immeuble (appartement)**, pre-selected from `guessBuildingType(reading.address)`, else nothing selected;
  - the floors select is labelled `Étage du toit où seront posés les panneaux` with the hint `Sert à calculer la longueur du câble DC (3,5 m par niveau).`, and starts on `— choisir —` (no silent default);
  - the earth-pit button reads `(obligatoire)` for a house and `(facultatif : sinon terre du bâtiment)` for a building;
  - a live line `Câble DC estimé : ${dc} m — câble AC estimé : ${ac} m` from `computeRunLengthsM` once the points and the floors are set.
- Prompt: the earthing line becomes `un piquet de terre dédié` / `raccordement à la prise de terre existante du bâtiment (pas de piquet dédié)`. `{EARTH_ROD_COUNT}` is removed from the prompt and from `PLACEHOLDER_DEFINITIONS`, which fixes "1 piquet(s)".
- `siteBuildingLine`: `Bâtiment : maison individuelle, toiture au niveau ${RDC|R+n}`, or `Bâtiment : immeuble collectif (appartement), toiture-terrasse au niveau R+n`.
- `earthingDetails` (rendered as a table in the earthing section; values from the earthing row):
  - `Schéma de liaison à la terre` → `TT`;
  - `Prise de terre` → `Piquet dédié (${rodCount} × ${rodLengthM} m)` or `Terre existante du bâtiment`;
  - `Conducteur principal de protection` → `${main} mm²`;
  - `Liaison équipotentielle des cadres` → `${frame} mm²`;
  - `Conducteur de terre vers le piquet` → `${toPit} mm²` (dedicated rod only);
  - `Résistance de terre visée` → `≤ ${target} Ω`.

- [ ] **Step 1: Write the failing tests**
  - building-type: `'Imm. Les Jasmins App. 12'` → APARTMENT_BUILDING; `'Route de Gabès km 4'` → null; `'Résidence El Amen'` → APARTMENT_BUILDING; `null` → null.
  - action: asks for the building type; asks for the floors; requires the pit for a house; flat without a pit → `useBuildingEarth: true, rodCount: 0`; floors 5 refused for a house.
  - prompt: BUILDING_EARTH wording, and no `{EARTH_ROD_COUNT}`.
  - template data: `TT`, `16 mm²`, `≤ 25 Ω`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Migration + implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live Anthropic check.** Call `generateDossierText` once with BUILDING_EARTH. Expected: no `RawNumberLeakError`, and no rod count in the text.
- [ ] **Step 6: Live UI check** — Playwright at 390 px.
- [ ] **Step 7: Commit** — `feat: house or flat, explained roof level and earthing details`

---

### Task 16: Pre-generation summary, STEG completeness, "BROUILLON" watermark

**Files:**
- Modify: `packages/db/prisma/schema.prisma`; Create: `migrations/20261022160000_syndic_authorization/migration.sql`
- Create: `apps/web/lib/steg-completeness.ts`, `apps/web/app/(app)/projects/[id]/summary/{page.tsx,actions.ts,piece-upload-form.tsx}`
- Modify: `apps/web/lib/annex-upload.ts`, `apps/web/app/(app)/projects/[id]/locations/{actions.ts,locations-map.tsx}`, `apps/web/app/(app)/projects/[id]/{actions.ts,page.tsx}`
- Create: `packages/dossier-worker/src/draft-watermark.ts`; Modify: `src/{job-snapshot.ts,process-job.ts,annex-plan.ts}`, the docx template
- Test: `apps/web/test/{steg-completeness,summary-actions,locations-action,generate-dossier-action}.test.ts`, `packages/dossier-worker/test/{draft-watermark,process-job}.test.ts`

**Interfaces:**
- Prisma: `ProjectAnnexes.syndicAuthorizationFileId String?`, with `File` relation `"AnnexSyndicAuthorization"`. `annexDocumentsFromSnapshot` puts it in `ADMIN` after the contract.
- Produces:
```ts
export type StegPieceKey = 'holderName' | 'cin' | 'stegContract' | 'lastPaidBill' | 'installerAccreditation' | 'installerTaxId'
  | 'syndicAuthorization' | 'structureAttestation' | 'moduleAcceptance' | 'datasheets' | 'mapPoints';
export interface StegPiece { key: StegPieceKey; label: string; done: boolean; detail: string | null }
export function stegCompleteness(project: ProjectForEngine, dossierDate: Date, hasAnmeList: boolean): { pieces: StegPiece[]; missingLabels: string[] };
```
  Pieces in this order (label → done when):
  1. `Nom du titulaire du contrat` → the name is not the placeholder.
  2. `Copie de la CIN du titulaire` → `cinFileId`.
  3. `Contrat STEG ou attestation d'abonnement` → `stegContractFileId`.
  4. `Dernière facture STEG acquittée` → `lastPaidBillFileId`. Detail: `Photo ou scan de la facture papier portant la mention « payée », ou reçu de paiement.`
  5. `Agrément ANME de l'installateur en cours de validité` → certificate uploaded and `anmeValidTo ≥ dossierDate`.
  6. `Matricule fiscal de l'installateur` → `company.taxId`.
  7. `Autorisation du syndic ou des copropriétaires` → `syndicAuthorizationFileId`. Listed only for APARTMENT_BUILDING.
  8. `Attestation de conformité de la structure (bureau de contrôle)` → `structure.structureAttestationFileId`.
  9. `Acceptation ANME du module` → `moduleAcceptanceFileId`, or `module.homologationFileId`, or `hasAnmeList`.
  10. `Fiches techniques de tous les équipements` → every chosen item has a `datasheetFileId`. Detail lists the missing `brand model`.
  11. `Points GPS du plan d'implantation` → the field, technical room and meter points are placed.
- `saveLocationsAction(projectId, payload)` replaces `saveLocationsAndGenerateAction`. It sets `flowStep 'READY'` and redirects to `/projects/${id}/summary`; it never enqueues a job.
- `uploadStegPieceAction(projectId: string, prev, formData)` does the guard, then one of:
  - `storeAnnexFiles` for `cin | stegContract | lastPaidBill | syndicAuthorization | moduleAcceptance`;
  - an upload stored on `ProjectStructure.structureAttestationFileId` for `structureAttestation`. It creates the structure row's file link and refuses with `'Structure non renseignée.'` if there is no structure row.

  It ends with `revalidatePath('/projects/${id}/summary')`.
- The snapshot gains `draftMissing: string[]` (= `missingLabels`); the worker defaults it to `[]`. `generateDossierAction` redirects to `/projects/${id}/jobs/${jobId}` on success.
- `applyDraftWatermark(pdf: Buffer, missing: string[]): Promise<Buffer>`:
  - draws `BROUILLON – NON RECEVABLE` at 45°, 60 pt, red, opacity 0.25, on every page;
  - inserts after page 1 a page `Pièces manquantes — dossier non recevable en l'état` that lists `missing`;
  - is applied to `dossier.pdf` only when `draftMissing` is non-empty.
- Docx: `{#isDraft}BROUILLON – NON RECEVABLE. Pièces manquantes : {draftMissingText}{/isDraft}` under the title.

Summary screen (`/projects/[id]/summary`, title `Récapitulatif avant génération — ${fullName}`), top to bottom:
1. The installation: kWc, panels, inverter, differential breaker, production estimate.
2. Cables: `formatRunLengthFormula` lines, or `${L} m (longueur saisie par l'installateur)`, with the link `Modifier les points`.
3. `Pièces STEG — ${done}/${total}`: ✓ or `manquant` per piece, with its detail. Every uploadable piece has a `PieceUploadForm` (`accept="image/jpeg,image/png,application/pdf"`, button `Ajouter la photo`).
4. `Contrôles électriques : ${passed}/${total} OK`.
5. The quota line: `Ce dossier utilisera 1 des ${remaining} dossiers restants ce mois.` or `Ce projet a déjà sa place ce mois-ci.`
6. The button: `Générer le dossier`, or `Générer un brouillon (pièces manquantes)` with the line `Le PDF portera la mention « BROUILLON – NON RECEVABLE ».`

- [ ] **Step 1: Write the failing tests**
  - completeness:
    - a complete house project has no missing label;
    - a flat lists the syndic authorization; a house never does;
    - an expired ANME agreement is missing;
    - the datasheets detail names the item;
    - the module acceptance is satisfied by the ANME list.
  - summary actions: guard; stores the syndic authorization; stores the structure attestation.
  - locations: redirect to the summary, no generation.
  - generate: `draftMissing` snapshotted; redirect to the job page.
  - watermark: 2 pages in → 3 pages out, page 2 lists the missing piece, `BROUILLON` on every page.
  - process-job: a draft is watermarked and `annexes.pdf` is not; a complete dossier is left untouched.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Migration + implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live UI check.** Playwright: locations → summary → add a fictitious CIN image → the counter goes up → generate → the job page opens. Screenshots at desktop and 390 px.
- [ ] **Step 6: Commit** — `feat: pre-generation summary with STEG pieces; draft dossiers are watermarked`

---

### Task 17: Document style — one font family, reference table styling, blue values, header, footer, frame

**Files:**
- Modify: `packages/docx-template/scripts/generate-template.ts` (+ regenerated template), `packages/docx-template/test/fill-template.test.ts`
- Create: `packages/dossier-worker/src/stamp-study-pages.ts`
- Modify: `packages/dossier-worker/src/{process-job.ts,render-cover-page.ts,render-toc.ts,render-site-plan-pages.ts,render-drawings.ts,render-annex-divider.ts}` (fonts)
- Modify: `Dockerfile` (worker image: `fonts-liberation`, if not already present)
- Test: `packages/dossier-worker/test/stamp-study-pages.test.ts`, the existing renderer tests

**Interfaces:**
- Template generator helpers, used by every later template task:
  - `valueRun(tag: string): TextRun`: colour `1F4E9A`;
  - `anLabel(): TextRun`: `Application numérique :` in red `C00000`, underlined;
  - `conclusionRun(text: string): TextRun`: red `C00000`, underlined;
  - `styledTable(rows: (string | TextRun[])[][], options: { header: boolean; labelColumn: boolean }): Table`: header row shaded `FFC000` and bold; first column shaded `FBE4D5` when `labelColumn`; all borders single 4.
- Document styles:
  - default run Times New Roman 11 pt;
  - Heading 1: bold, black, 13 pt, roman numeral from the existing section numbers;
  - Heading 2: bold, underlined, 11 pt, black;
  - no blue theme colours.
- Existing tables (module, inverter, cables, voltage drop, stability, dimensioning) switch to `styledTable`, and their value tags to `valueRun`.
- pdf-lib fragments (cover, TOC, plans, drawings, divider, watermark page) use `StandardFonts.TimesRoman` / `TimesRomanBold` instead of Helvetica.
- Produces: `stampStudyPages(pdf: Buffer, options: { studyPageCount: number; logo: Buffer | null; installerName: string; dossierNumber: string | null }): Promise<Buffer>`. It applies to pages 1..studyPageCount (cover + TOC + body):
  - a double-line frame (as on the cover);
  - a header with the logo (max 60 × 30 pt) or the installer name on the left and `Dossier n° ${number}` on the right;
  - the footer `Page ${n} sur ${studyPageCount}`, right-aligned, on pages 2..studyPageCount.

  Drawings and plans carry their own cartouche, and annex pages are not stamped (the reference practice).
- `processJob` calls it on the merged `dossier.pdf` before the watermark.

- [ ] **Step 1: Write the failing tests**
  - fill-template:
    - the document XML contains `w:shd` with `FFC000` in a header row and `FBE4D5` in a label cell;
    - the default font is `Times New Roman`;
    - a module value run has colour `1F4E9A`.
  - stamp-study-pages:
    - a 5-page PDF with `studyPageCount 3` → pages 2–3 contain `Page 2 sur 3` / `Page 3 sur 3`; pages 4–5 are unchanged;
    - the frame rectangles are present on pages 1–3.
  - Renderer tests are updated to expect the Times fonts; texts are unchanged.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Visual check.** Generate one dev dossier, view pages 1–4 as images, and confirm a single font family, the frames and the footer.
- [ ] **Step 6: Commit** — `feat(dossier): reference-style typography, tables, header, footer and page frame`

---

### Task 18: Characteristic tables, equipment list with annex numbers, documentation index, compliance summary

**Files:**
- Create: `packages/engine/src/check-labels.ts` (+ export, test)
- Modify: `packages/dossier-worker/src/build-template-data.ts`, the docx template
- Test: `packages/engine/test/check-labels.test.ts`, `packages/dossier-worker/test/build-template-data.test.ts`, `packages/docx-template/test/fill-template.test.ts`

**Interfaces:**
- Consumes: `ANNEX_NUMBERS`, `ANNEX_TITLES` (Task 9); style helpers (Task 17); snapshot equipment rows.
- Produces: `CHECK_LABELS: Record<string, string>`, a neutral French label for every check C01–C24, for example `C22: "Agrément ANME de l'installateur valide à la date du dossier"`.
- `DossierTemplateData` gains:
  - `documentationRows: { designation; annex }[]`: N°1–N°10 with `ANNEX_TITLES`, and `—` for slots without a document;
  - `equipmentRows: { designation; quantity; brand; reference; annex }[]`: modules, inverter, DC fuse, DC SPD, DC switch, AC SPD, AC isolator, differential breaker, DC cable, AC cable, earth cable, MC4 connector, distribution block, cable tray. An item that is not used gets quantity `—`, reference `—`, annex `—`;
  - `moduleSpecRows` (label/value): Marque, Référence, Pmax, Vmp, Imp, Voc, Isc, `Coefficient de température Voc (β)`, `Coefficient de température Isc (α)`, `Coefficient de température Pmax`, `Courant inverse max (IRM)`, `Tension système max`, Dimensions, Masse;
  - `inverterSpecRows`: Marque, Référence, Pac, Sac, Vdc max, `Plage MPPT`, `Tension de démarrage`, `Nombre de MPPT`, `Entrées par MPPT`, `Idc max par MPPT`, `Isc max par MPPT`, `Tension AC nominale`, `Plage de tension AC` (when known), `Iac max`, `Homologation STEG` (`Oui, valable jusqu'au …`);
  - `deviceRatingRows: { device; ratings }[]`:
    - DC fuse `Un / In`;
    - DC SPD `Type ${t} · Ucpv ${uc} V · Up ${up} kV · In ${in} kA · Iscpv ${iscpv} kA`;
    - DC switch `Ue ${u} V DC · In ${i} A · ${poles} pôles`;
    - differential breaker `${poles} pôles · In ${i} A · courbe ${c} · Icn ${k} kA · ${ma} mA type ${t}`;
    - AC SPD `Type ${t} · Uc ${uc} V · Up ${up} kV · In ${in} kA`;
    - DC/AC cable `${ref} ${s} mm² · Iz ${iz} A`;
    - `Paratonnerre sur le site : ${oui|non}`;
  - `complianceRows: { id; label; result }[]` from the engine checks, with result `Conforme` / `Non conforme` / `Avertissement`.
- Template order:
  - Présentation gets `Documentation de la solution` (documentationRows) and `Équipements de la solution` (equipmentRows);
  - III.1 / III.2 use the new rows (every inverter in the snapshot);
  - a new III.x `Caractéristiques des équipements DC et AC` (deviceRatingRows);
  - before the conclusion, the section `Vérifications réglementaires` (complianceRows).
  - `computeSectionNumbers` and the TOC are updated.

- [ ] **Step 1: Write the failing tests**
  - check-labels: every id produced by `runEngine` on the reference fixture (with `subscribedPowerKVA` and `rcd`) has a label.
  - build-template-data:
    - the differential breaker row has annex `18`;
    - the unused AC isolator row is `—`;
    - `moduleSpecRows` contains β with `%/°C`;
    - complianceRows count equals the engine checks.
  - fill-template: the headings `Équipements de la solution` and `Vérifications réglementaires` render.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(dossier): equipment and documentation tables with annex numbers, full characteristics, compliance summary`

---

### Task 19: String sizing note — formulas and "Application numérique"

**Files:**
- Modify: `packages/dossier-worker/src/build-template-data.ts`, the docx template
- Test: `packages/dossier-worker/test/build-template-data.test.ts`, `packages/docx-template/test/fill-template.test.ts`

**Interfaces:**
- `DossierTemplateData` gains `stringSizingNotes: { title: string; formula: string; application: string; result: string; conclusion: string | null }[]` and `temperatureAssumptions` (`Tmin = ${tMin} °C, Tmax = ${tMax} °C (hypothèses de calcul)`).
- One note each, in this order:
  1. Voc(Tmin)
  2. Vmp(Tmin)
  3. Vmp(Tmax)
  4. Isc(Tmax)
  5. Ns max
  6. Ns min
  7. Ns optimal max
  8. Np max
  9. Np optimal
  10. `Ns retenu` — conclusion `Ns retenu = ${ns} ≤ min(Ns max, Ns optimal max) = ${m} et ≥ Ns min = ${n} : condition vérifiée.`
  11. `Rapport de puissance DC/AC` — bounds from check C06
  12. `Nombre maximal de chaînes sans protection (Ncmax)`
  13. `Fusible DC` — conclusion `Pas de fusible : ${np} chaîne(s) par MPPT ≤ Ncmax = ${x}.` or the fuse requirement `${1,1 × 1,25 × Isc} ≤ In fusible ≤ IRM` with the chosen rating
- **Formulas are copied from the engine functions that compute the value** (`module-electrical.ts`, `string-sizing.ts`, `ncMaxNoFuse`, check C06/C08), written in plain text with the engine's symbols. `application` substitutes the actual inputs. `result` must equal the corresponding `engineResult.derived` value (`VOC_TMIN`, `VMP_TMIN`, `VMP_TMAX`, `ISC_TMAX`, `NS_*`, `NP_*`, `POWER_RATIO`, `NC_MAX_NO_FUSE`), formatted.
- Template (replacing table III.3): `temperatureAssumptions`, then for each note: bold title; `Formule : ` + formula; `anLabel()` + application; `Résultat : ` + `valueRun(result)`; `conclusionRun(conclusion)`.

- [ ] **Step 1: Write the failing tests.** On the reference fixture, each note's `result` equals its derived value formatted fr-FR. Ns retenu's conclusion reads `condition vérifiée`. The fuse note has no fuse for 1 string per MPPT. There is no `Ns optimal max` row left in a bare results table (STEG remark 6).
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(dossier): string sizing calculation notes with application numérique`

---

### Task 20: Protection sizing notes (DC switch, DC SPD, differential breaker, AC SPD, AC disconnection)

**Files:** as Task 19.

**Interfaces:**
- `DossierTemplateData` gains `protectionNotes`, with the same shape as `stringSizingNotes` plus `chosen: string` (`${brand} ${model} — ${ratings}`).
- Notes, with requirements taken from checks C09–C15 and C24 and their inputs from the engine input or derived values:
  1. `Interrupteur-sectionneur DC`: `Ue ≥ Voc(Tmin) de la chaîne`, `In ≥ courant de conception du champ`.
  2. `Parafoudre DC`:
     - `Ucpv ≥ Voc(Tmin) de la chaîne`;
     - `Up < 0,8 × tenue aux chocs (${kV} kV)`;
     - `In ≥ 5 kA`;
     - `Iscpv ≥ courant de conception`;
     - the type from C12, with `Pas de paratonnerre : type 2`.
  3. `Disjoncteur différentiel AC`: `Iac max onduleur ≤ In ≤ Iz' câble AC` (C13), plus `30 mA type A` (C24).
  4. `Parafoudre AC`: the Uc rule from C14, Up, In.
  5. `Sectionnement AC`: conclusion `Un seul onduleur : pas d'interrupteur-sectionneur AC dédié ; le sectionnement côté AC est assuré par le disjoncteur différentiel ${ref}.`
- Each conclusion is `Le ${appareil} choisi est conforme.` when its checks pass.
- New template section `Dimensionnement des protections`, after the string sizing note, in the same layout.

- [ ] **Step 1: Write the failing tests.** On the reference fixture plus a differential breaker:
  - the DC switch application numbers equal `STRING_VOC_TMIN` and `ISC_FIELD_DESIGN` formatted;
  - the AC note includes `30 mA type A`;
  - the sectioning conclusion names the breaker.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(dossier): protection sizing notes from the engine checks`

---

### Task 21: Cable sizing note — Iz with K1–K4, voltage drop with inputs

**Files:**
- Modify: `packages/engine/src/{cabling.ts,run-engine.ts}` (+ tests), `packages/dossier-worker/src/build-template-data.ts`, the docx template
- Test: `packages/engine/test/{cabling,run-engine}.test.ts`, `packages/dossier-worker/test/build-template-data.test.ts`

**Interfaces:**
- Engine: `izCorrectionFactors(installMethod, referenceMethod, groupedCircuits, layers, ambientTempC, insulation): { k1: number; k2: number; k3: number; k4: number }`. `izCorrected` now multiplies by these, with identical results.
- New derived keys:
  - `DC_RUN_IZ`, `DC_RUN_K1`…`DC_RUN_K4`, `AC_RUN_IZ`, `AC_RUN_K1`…`AC_RUN_K4`;
  - `AC_DESIGN_CURRENT` (Σ iacMax);
  - `DC_RUN_AMBIENT_C`, `AC_RUN_AMBIENT_C`.
- `DossierTemplateData` gains:
  - `cableSizingRows: { link; installMethodText; sectionMm2; iz; k1; k2; k3; k4; izCorrected; designCurrent; conclusion }[]`;
  - `voltageDropRows: { link; formula; rho; lengthM; currentA; sectionMm2; voltageV; dropV; dropPct; limitPct; conclusion }[]`.
- Install method text: every code in the engine's `INSTALL_METHODS_WITH_K1` / `K1_BY_METHOD` gets a plain French label in a new `INSTALL_METHOD_LABELS` in `packages/engine/src/constants.ts`, e.g. `'13'` → `Chemin de câbles perforé (mode de pose 13)`, `'3A'` → `Conduit en montage apparent (mode de pose 3A)`. Wording for other codes follows NF C 15-100 table 52C. This also replaces the bare codes in the existing cable table (STEG remark 10).
- Voltage-drop formulas are the plain-text forms of `duDcV` / `duAcV` in `cabling.ts`. Inputs come from the engine input; results equal `DU_*`.
- Template section `Dimensionnement des câbles`:
  - the line `Iz' = Iz × K1 × K2 × K3 × K4` with the factor definitions;
  - the cable table;
  - for each run: `anLabel()` + application + `conclusionRun(...)`;
  - then `Chute de tension` with the per-run table (replacing table IV.1) and `La chute de tension est calculée pour chaque tronçon ; limite ${limit} %.`

- [ ] **Step 1: Write the failing tests**
  - engine: `izCorrectionFactors` for `'13'`, method C, 1 circuit, 1 layer, 80 °C, PR equals the product used by `izCorrected` (same result to 1e-12); derived keys present.
  - template data:
    - DC row `izCorrected` equals `DC_RUN_IZ_CORRECTED` formatted;
    - the method text for `'13'`;
    - the AC drop row `dropPct` equals `DU_AC_PCT` formatted.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS** (engine fixtures unchanged).
- [ ] **Step 5: Commit** — `feat: cable sizing and voltage drop notes with correction factors and inputs`

---

### Task 22: Structure section from data

**Files:** `packages/dossier-worker/src/build-template-data.ts`, the docx template, and their tests.

**Interfaces:**
- `DossierTemplateData` gains `structureRows: { label; value }[]`:
  - Matériau;
  - `Nombre de modules`;
  - `Masse des modules` (`n × weightKg` kg);
  - `Inclinaison` (°);
  - `Orientation` (`azimut ${az}° (0° = plein sud)`);
  - `Vitesse de vent de calcul` (km/h);
  - `Lestage` (`${ballastPerFrame} × ${ballastMassKg} kg par cadre`, or `à définir sur site selon l'étude de stabilité`);
  - `Attestation de conformité` (`annexe N°3`, or `à fournir`).
- When `stabilityComputed`, the stability table also gets the formula from the engine's `computeStabilityLhs/Rhs`, rendered as `anLabel()` plus the inputs (S, H, D) and the conclusion `condition vérifiée` / `non vérifiée`.

- [ ] **Step 1: Failing tests.** The rows for the reference fixture, the `à fournir` case, and the stability formula present when computed. **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(dossier): structure section from project data`

---

### Task 23: PVGIS simulation report (annex N°2)

**Files:**
- Create: `packages/dossier-worker/src/render-production-report.ts`; Modify: `src/process-job.ts`
- Test: `packages/dossier-worker/test/render-production-report.test.ts`, `test/process-job.test.ts`

**Interfaces:**
- Produces: `renderProductionReport(sim: ProductionSimulation, ctx: { moduleRef: string; moduleCount: number; inverterRef: string; inverterPacW: number; dcDropPct: number; acDropPct: number; dossierNumber: string | null; dossierDate: string; installerName: string; logo: Buffer | null }): Promise<Buffer>`. It produces 2 A4 portrait pages in Times.
  - **Page 1**, `Rapport de simulation de production — PVGIS v5.3 (JRC)`:
    - a parameter table: site GPS; tilt; azimuth; source `PVGIS v5.3, série horaire ${year}`; kWc; modules; inverter; `Pertes câbles DC/AC : ${dc} % / ${ac} %`; `Rendement onduleur : valeur forfaitaire du moteur de calcul`; `Écrêtage à ${Pac} W`;
    - a results table: annual production, specific yield, PR, `Énergie en sortie du champ (avant onduleur)` = `annualArrayKWh`.
  - **Page 2**:
    - a monthly table `Mois | GlobHor (kWh/m²) | GlobInc (kWh/m²) | T amb (°C) | E champ (kWh) | E réseau (kWh) | PR (%)` with a total row;
    - a bar chart of the monthly `eGridKWh` (12 bars, y-axis in kWh, month initials);
    - a footer cartouche (dossier n°, date, installer).
- `processJob` adds it as an annex document in slot `SIMULATION`.

- [ ] **Step 0: Load the `dataviz` skill** before drawing the monthly chart, and apply its mark, axis and colour rules within pdf-lib (print-safe, monochrome-readable).
- [ ] **Step 1: Failing tests:**
  - two pages;
  - page 1 contains `PVGIS v5.3` and the annual production formatted;
  - page 2 contains `Décembre` or `D` labels and 12 filled bar paths;
  - `everythingOnPage`;
  - process-job: annex N°2 is present in the bordereau with a page number.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(worker): PVGIS simulation report as annex N°2`

---

### Task 24: Table of contents with exact page numbers and subsections

**Files:**
- Modify: `packages/dossier-worker/src/{render-toc.ts,process-job.ts}`
- Test: `packages/dossier-worker/test/{render-toc,process-job}.test.ts`

**Interfaces:**
- Consumes: `extractTextBoxes` (Task 10); `computeSectionNumbers` and the subsection titles.
- Produces:
  - `findHeadingPages(bodyPdf: Buffer, headings: string[]): Promise<(number | null)[]>`. It finds each heading in order, searching from the previous heading's page onwards. A heading line is matched by its normalized text (whitespace collapsed); the result is a 1-based body page, or null when not found.
  - `renderTableOfContents(entries: { title: string; pageNumber: number; level: 1 | 2 }[]): Promise<Buffer>`, with dotted leaders and level-2 entries indented 16 pt. It may render more than one page.
- `processJob`:
  - computes absolute pages as `cover(1) + tocPageCount + bodyPage`;
  - renders the TOC once to learn its page count, then again if the count changed;
  - gives drawings/plans/annexes their pages from the divider and bordereau;
  - removes the "even spread" estimate and its comment.
  - A heading not found keeps the previous entry's page and adds a job warning `Sommaire : titre « ${t} » introuvable.`

- [ ] **Step 1: Failing tests:**
  - a synthetic 4-page body with headings on pages 1, 1, 3, 4 → `findHeadingPages` returns `[1, 1, 3, 4]`;
  - a missing heading → null;
  - the TOC renders leaders and an indented level-2 entry;
  - process-job: the TOC's page for `Câblage` equals the page where the body PDF really prints it.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(worker): table of contents with real page numbers and subsections`

---

### Task 25: Drawing symbols, sheet and a real single-line diagram (annex N°4)

**Files:**
- Create: `packages/dossier-worker/src/drawing-symbols.ts` (the skill's single symbol module), `packages/dossier-worker/src/drawing-kit.ts` (sheet, cartouche, conductors, legend)
- Modify: `packages/engine/src/constants.ts` (+ test), `packages/dossier-worker/src/{render-drawings.ts,process-job.ts}`
- Test: `packages/dossier-worker/test/{drawing-symbols,drawing-kit,render-drawings,process-job}.test.ts`, `packages/engine/test/constants.test.ts`

**Interfaces:**
- Engine: `STEG_SINGLE_PHASE_BRANCHEMENT_A = { 2: '10', 3: '15', 4: '20', 7: '30/32', 10: '45', 14: '63', 22: '100', 27: '125', 35: '160', 50: '225' }` (spec §2), and `branchementCalibre(kVA: number): string | null`.
- `drawing-symbols.ts`, IEC 60617 style per the skill:
```ts
export type SymbolKind = 'pvString' | 'fuse' | 'switchDisconnector' | 'breaker' | 'rcdBreaker' | 'spd' | 'inverter' | 'meter' | 'earth' | 'distributionBlock';
export interface SymbolDef { path: string; width: number; height: number; anchors: { in: { x: number; y: number }; out: { x: number; y: number }; earth?: { x: number; y: number } } }
export const SYMBOLS: Record<SymbolKind, SymbolDef>;
export function drawSymbol(page: PDFPage, kind: SymbolKind, at: { x: number; y: number }, options?: { scale?: number; color?: RGB }): { in: Point; out: Point; earth?: Point };   // drawSvgPath; returns page-space anchors
```
- `drawing-kit.ts`:
  - `drawSheet(page, fonts, cartouche: { projectTitle: string; client: string; commune: string; installerName: string; anmeCode: string; drawingTitle: string; planNumber: number; revision: string; date: string; dossierNumber: string | null; pageLabel: string; logo: PDFImage | null }): { x; y; width; height }`:
    - an A4-landscape page with a 10 mm frame;
    - a bottom-right cartouche with `Échelle : sans échelle`;
    - it returns the drawing area.
  - `conductor(page, from, to, kind: 'dcPlus' | 'dcMinus' | 'acPhase' | 'acNeutral' | 'pe', label: string)`, with the skill's colours: DC + red, DC − black, phase brown, neutral blue, PE green-yellow dashed with a `PE` label. Width ≥ 0.8 pt; the label sits at the midpoint without crossing the line (widths come from `font.widthOfTextAtSize`).
  - `enclosure(page, rect, label)`: dashed.
  - `legend(page, entries: { kind: SymbolKind; text: string }[])`.
  - Text never goes below 7 pt; a group that does not fit is scaled as a whole.
- `render-drawings.ts`:
  - The old block-diagram types are replaced by `SingleLineInput`:
```ts
export interface DeviceRating { label: string; ref: string; lines: string[] }
export interface SingleLineInput {
  pvField: { moduleRef: string; moduleCount: number; strings: number; modulesPerString: number; stringVocTminV: number; iscA: number };
  dcCable: { ref: string; sectionMm2: number; lengthM: number };
  dcSwitch: DeviceRating; dcSpd: DeviceRating; dcFuse: DeviceRating | null; inverter: DeviceRating;
  acCable: { ref: string; sectionMm2: number; lengthM: number };
  acBreaker: DeviceRating; acSpd: DeviceRating;
  agcp: { calibreA: string | null }; earthing: { mode: 'DEDICATED_ROD' | 'BUILDING_EARTH'; mainMm2: number; frameMm2: number; toPitMm2: number; targetOhm: number };
  cartouche: DrawingCartouche;
}
/** Everything drawSheet needs except the per-drawing fields (drawingTitle, planNumber, pageLabel), with the logo as bytes. */
export type DrawingCartouche = { projectTitle: string; client: string; commune: string; installerName: string; anmeCode: string;
  revision: string; date: string; dossierNumber: string | null; logo: Buffer | null };
export function renderSingleLineDiagram(input: SingleLineInput): Promise<Buffer>;   // 1 page, plan N°4
```
  - The page is titled `Schéma unifilaire`. Left to right:
    1. PV generator (`${n} × ${moduleRef}`, `${strings} chaîne(s) de ${ns} modules`, `Voc(Tmin) ${v} V · Isc ${i} A`);
    2. a DC conductor `${ref} 2 × 1 × ${s} mm² — ${L} m`;
    3. a dashed enclosure `Coffret DC` containing the switch, optional fuse and SPD (to the PE), each with its `DeviceRating.lines`;
    4. the inverter;
    5. an AC conductor;
    6. a dashed enclosure `Coffret AC` containing the differential breaker and SPD;
    7. a dashed box `Tableau électrique existant du client`;
    8. the AGCP breaker `Disjoncteur de branchement STEG (AGCP) ${calibre} A`, or `calibre à relever sur le disjoncteur de branchement` when `branchementCalibre` is null;
    9. `Compteur bidirectionnel STEG`;
    10. `Réseau STEG BT 230 V`.
  - Below, the PE network:
    - module frames (`liaison équipotentielle ${frame} mm²`), both SPDs and the inverter go to a `Répartiteur de terre`;
    - then `${toPit} mm²` to the electrode `Piquet de terre — R ≤ ${Ω} Ω`, or `Terre existante du bâtiment`;
    - the text `Schéma de liaison à la terre : TT`.
  - A legend with every symbol used; the cartouche shows plan N°4.
  - The old two block pages are deleted. The single-line page goes to annex slot `SINGLE_LINE`.
- `processJob` builds the input from the snapshot rows and the derived values:
  - ratings from the snapshot: DC switch `ratedVoltageV/ratedCurrentA/poles`, SPD `type/ucV/upKV/inKA/iscpvKA`, breaker `ratedCurrentA/curve/breakingCapacityKA/residualCurrentMA/rcdType`;
  - `STRING_VOC_TMIN`; the client's `subscribedPowerKVA`; the earthing row.

- Every device on the diagram carries a designation (`Q1` DC switch, `F1` fuse, `SPD1` DC SPD, `Q2` differential breaker, `SPD2` AC SPD, `AGCP`, `kWh` meter) plus its rating text. The ratings come from the same snapshot values the calculation notes print, never re-derived. The inverter box adds `${mpptCount} MPPT, monophasé, accepté STEG`.

- [ ] **Step 0: Load the project skill `pv-electrical-drawings`**, read its single-line checklist (items 1–8), and view the reference dossier's single-line page as an image before drawing.
- [ ] **Step 1: Failing tests**
  - constants: `branchementCalibre(7) === '30/32'`, `branchementCalibre(13) === null`.
  - drawing-symbols: every `SymbolDef` has `in`/`out` anchors inside its `width × height`; `spd` and `earth` have an `earth` anchor; `drawSymbol` returns anchors translated by `at` (anchors are unit-tested, not pixels).
  - drawing-kit: `drawSheet` returns an area inside the frame; the cartouche texts include `sans échelle` and the ANME code.
  - render-drawings:
    - the texts `Schéma unifilaire`, `Compteur bidirectionnel STEG`, `Disjoncteur de branchement STEG (AGCP) 30/32 A`, `30 mA`, `Coffret DC`, `Coffret AC`, `Tableau électrique existant du client`, `TT`, `Piquet de terre`, the DC/AC conductor texts;
    - a green dashed path;
    - `everythingOnPage`;
    - no fuse text when `dcFuse` is null;
    - `BUILDING_EARTH` → `Terre existante du bâtiment`;
    - never `chaîne(s)` with 1 string — `1 chaîne de 5 modules`.
  - process-job: the drawing input carries `30 mA type A` and the AGCP calibre for 7 kVA.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Visual check (skill verification).** Render the fixture into the scratchpad and view it next to the reference's single-line page. Tick off the skill's 8-item checklist with values visible, check that no label overlaps a symbol or line, and fix before committing.
- [ ] **Step 6: Commit** — `feat(worker): IEC-style single-line diagram with ratings, boxes, AGCP, bidirectional meter and PE network`

---

### Task 26: Panel string wiring diagram (annex N°7)

**Files:** `packages/dossier-worker/src/{render-drawings.ts,process-job.ts}` + tests.

**Interfaces:**
- Produces: `renderPanelWiringDiagram(input: { strings: { modules: number }[]; moduleRef: string; dcCable: { ref: string; sectionMm2: number }; frameMm2: number; toPitMm2: number; earthing: SingleLineInput['earthing']; cartouche: SingleLineInput['cartouche'] }): Promise<Buffer>` (plan N°7).
  - One row per string of module rectangles labelled `P1…Pn`, chained in series.
  - Polarity conductors: `+` red `rgb(0.8,0,0)`, `−` black, from each string's ends to a `Coffret DC` box, labelled `${ref} 1 × ${s} mm²`.
  - A yellow-green PE (`conductor` `'pe'`) from each module frame to the `Répartiteur de terre`, labelled `1 × ${frame} mm²`, then `1 × ${toPit} mm²` to the earth electrode (or the building earth).
  - A legend and the cartouche.
  - A string of more than 12 modules draws P1–P3, an ellipsis box `…`, and the last 2.
- Slot: `PANEL_WIRING`.
- Uses `drawing-symbols.ts` / `drawing-kit.ts` from Task 25 and no new symbol code outside them.

- [ ] **Step 0: Load the project skill `pv-electrical-drawings`** and view the reference's panel wiring page as an image.
- [ ] **Step 1: Failing tests:**
  - 1 × 5 modules → texts `P1`…`P5`, `Coffret DC`, `1 × 4 mm²`, a red path and a green dashed path;
  - 1 × 20 modules → `…` and `P20`, and no `P10`;
  - `everythingOnPage`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Visual check (skill verification), then commit** — `feat(worker): panel string wiring diagram`

---

### Task 27: DC box and AC box wiring diagrams (annexes N°8, N°9)

**Files:** `packages/dossier-worker/src/{render-drawings.ts,process-job.ts}` + tests.

**Interfaces:**
- `renderDcBoxDiagram(input: Pick<SingleLineInput, 'dcSwitch' | 'dcSpd' | 'dcFuse' | 'dcCable' | 'earthing' | 'cartouche'> & { strings: number }): Promise<Buffer>` (plan N°8).
  - A dashed enclosure `Coffret DC`.
  - For each string, `+`/`−` inputs → optional fuses → DC switch (`Un ${u} V · In ${i} A`) → DC SPD (`Uc ${uc} V · Up ${up} kV · In ${in} kA`) between the poles and the PE.
  - Output `Vers onduleur — ${ref} 2 × ${s} mm² — ${L} m`.
  - A PE bar to the `Répartiteur de terre`, then the electrode; a legend and the cartouche.
- `renderAcBoxDiagram(input: Pick<SingleLineInput, 'acBreaker' | 'acSpd' | 'acCable' | 'earthing' | 'agcp' | 'cartouche'>): Promise<Buffer>` (plan N°9).
  - Input `Depuis l'onduleur — L / N / PE`, with L brown `rgb(0.45,0.25,0.1)`, N blue `rgb(0.1,0.3,0.8)` and PE green dashed.
  - Then the differential breaker (`In ${i} A · ${ma} mA type ${t}`), then the AC SPD (`Uc ${uc} V · Up ${up} kV · In ${in} kA`) to the PE.
  - Output `Vers point d'injection (tableau existant — compteur STEG)`, a legend and the cartouche.
- Slots: `DC_BOX`, `AC_BOX`.
- Uses `drawing-symbols.ts` / `drawing-kit.ts` from Task 25.

- [ ] **Step 0: Load the project skill `pv-electrical-drawings`** and view the reference's DC-box and AC-box pages as images.
- [ ] **Step 1: Failing tests:**
  - DC: `Coffret DC`, the switch and SPD rating texts, no fuse text without a fuse;
  - AC: `30 mA type A`, `Vers point d'injection`, a brown and a blue path;
  - both `everythingOnPage`;
  - process-job: the bordereau shows N°7, N°8, N°9 with pages.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Visual check (skill verification), then commit** — `feat(worker): DC box and AC box wiring diagrams`

---

## Acceptance (orchestrator, after Task 27)

Not a coding task. Run the dev server and the worker on `dossipv_dev`, with PVGIS reachable (re-run Task 2 Step 5 first), the source lists stored (Task 10) and curated datasheets attached (Task 5).

**Account:** the run uses a **PREMIUM** account. The dev company `SolarPro Tunisie` is on a Premium plan in `dossipv_dev`, so the AI-reasoned page-37/38 site imagery is exercised. A project's tier is copied when the project is created, so the run creates a **new** project after the switch; older projects stay STANDARD. Check that the new project's `tier` is `PREMIUM` before step 2.

1. **Installer agent: import to map step.**
   - Re-imports the reference bill through the UI as a photo or scan, which creates the new Premium project. The user uploads it if the classifier blocks PII again.
   - Fills the identity box with a fictitious CIN test image and picks "Recommandée".
   - **Stops at the map step.**
2. **User: map points.** The user places the location points himself and chooses Maison / Immeuble and the roof level.
3. **Installer agent: summary and generation.** Continues from the summary, adds the missing STEG pieces it has (test images), and generates.
4. **STEG-reviewer agent.**
   - Reads the new dossier and gives a page-by-page verdict.
   - Every motif B1–B8 must be answered.
   - It also compares against the reference dossier's structure (annexes N°1–N°25, highlighting, calculation notes), without quoting its personal data.
5. **Installer agent: flow report.** Reports taps and time compared with round 1 (~13 actions, ~6 min).
6. **Facilitator agent.** Produces the round-3 list.

Production steps wait for the user's explicit go-ahead: migrations, `purge-test-items --apply`, `attach-curated-datasheets --apply`, `store-source-lists --apply`, and the curated import.

## Next round (not in this plan)

- **AC run split at the AC box.** Split into two segments (inverter → AC box → TGBT) for the per-segment voltage drop (REF VII.4). This needs a second AC cable run in the data model and in sizing.
- **Embedded NF C 15-100 table extracts** with the used row boxed (REF p15). The factor values are printed by Task 21.
- **Wind and ballast calculation always shown.** This needs required structure inputs (frame count, H, D, ballast) and a figure. Task 22 shows it only when inputs exist.
- **Highlighting for scanned datasheets** via Claude vision bounding boxes, and highlighting of protection and cable datasheets (beyond the reference practice).
- **Equipment conformity table** (list version, certificate numbers, validity vs commissioning, decoupling standards and grid code) — facilitator 11.
- **AC voltage-drop target of 1 %** (UTE C15-712-1) — facilitator 13, a product decision.
- **Map usability:** "Ma position", address search, centring on the bill address, phone layout — facilitator 14.
- **Proposal cards:** price, payback, surplus explanation — facilitator 15, 16.
- **Better consumption estimate:** second bill, seasonal warning — facilitator 17.
- **Full .docx export:** cover, drawings, plans — facilitator 18.
- **Separate RCCB equipment kind.**
- **Multi-year PVGIS average** instead of the single 2020 series.
- **Larger product scope:** three-phase, multi-inverter, lightning-rod sites — facilitator 19.
