# STEG Bill → Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installer imports a client's STEG bill, AI reads it, the app proposes up to three valid single-phase installations, the installer picks one, places four coloured points on the map, and generates the dossier; plus a CLI that deletes test equipment from the shared catalog.

**Architecture:** A new `@dossipv/bill-reader` package reads the bill with `claude-opus-5-5` (structured output) and checks the reading arithmetically. Sizing is pure engine code (`buildCandidate` + `proposeInstallations`) fed by a catalog loader and a cached PVGIS specific yield. Three new installer screens (import, proposals, locations) write the existing project sections, so the existing generation path (`generateDossierAction` → worker) is reused unchanged.

**Tech Stack:** TypeScript (ESM, Node ≥ 24), Next.js 16 Server Actions, Prisma 7, `@anthropic-ai/sdk` (same version as `packages/dossier-worker`), Leaflet / react-leaflet v5, vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-21-steg-bill-to-dossier-design.md`

**Runs after:** Tasks 2–11 of `docs/superpowers/plans/2026-10-07-tunisian-catalog-import.md` (this plan uses its `catalogStatus` column, `catalogScope` drafts filter, `RunEngineInput.equipmentHomologationExpiries` and `data/catalog/{cables,protections}.json`).

**Execution order (user decision 2026-10-21 added the installer library):** Tasks 1–7, then 12, 13, 14 (installer library), then 8, 9, 10, 11.

## Global Constraints

- Single-phase BT only: every proposal uses one inverter with `phases = 1`; sites created by this flow have `phases = 1`.
- Single-phase ladder (kVA): `[2, 3, 4, 7, 10, 14, 22, 27, 35, 50]`.
- AI model: `claude-opus-5-5`, structured output via `client.messages.parse` + `output_config.format` (pattern: `packages/dossier-worker/src/generate-page-37-layout.ts`).
- Development and tests use `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dossipv_dev` exported in the shell. Never open or use the production tunnel (port 5433). Prisma CLI runs from inside `packages/db`.
- The real reference bill (`D:\mahmoud repo\New folder\facture.webp`) and any real client name never go into git or test fixtures; fixtures use "MR TEST CLIENT".
- UI text is French; code, comments, file names are English. Numbers shown to users use `Intl.NumberFormat('fr-FR')`.
- Every Server Action calls its auth guard (`requireAuthenticatedCompanyUser()` or `requireOwnedProject()`) as its first line. Tests mock `redirect()` as **throwing**. An action that mutates and does not `redirect()` calls `revalidatePath()`.
- Prisma 7: every relation needs its back-relation field on the other model.
- Stage only your own files; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verification for every task: `npx vitest run <changed test files>`, then `npx tsc -b --noEmit` and `npx eslint <changed files>` clean.

## Review Focus

- A blurry, cropped or rotated bill where the AI cannot read the reference or the power → the project is still created, required fields stay null (never guessed), and the proposals screen asks only for the missing fields (Task 4 + Task 7 + Task 9 tests).
- A client whose subscribed power is below the smallest single-phase STEG inverter (2 kVA) → a French reason is shown, no crash, no empty page (Task 3 + Task 9 tests).
- The catalog changes between showing the proposals and clicking "Choisir" (an item unpublished) → the server recomputes, the key is gone, a French error is shown and nothing is written (Task 8 test).
- A mis-click puts a point 2 km away → refused with a clear message before any length or section is computed (Task 10 test).
- The reference bill is a `.webp` → accepted by upload validation; a RIFF file that is not WEBP is refused (Task 5 test).

---

## File Structure

```
packages/engine/src/
  checks.ts                 # + checkC23
  run-engine.ts             # + RunEngineInput.subscribedPowerKVA?
  sizing-types.ts           # catalog/context/candidate/proposal types
  build-candidate.ts        # one (module, inverter, ns, strings) → complete engine input or reason
  sizing.ts                 # proposeInstallations: filter, enumerate, rank, explain
  run-lengths.ts            # haversine + DC/AC lengths from points
packages/engine/test/
  checks-c23.test.ts, build-candidate.test.ts, sizing.test.ts, run-lengths.test.ts
  fixtures/sizing-catalog.ts
packages/bill-reader/        # new package
  package.json, tsconfig.json
  src/types.ts, src/ladder.ts, src/governorates.ts, src/check-bill-reading.ts,
  src/read-steg-bill.ts, src/index.ts
  test/check-bill-reading.test.ts, test/governorates.test.ts, test/read-steg-bill.test.ts
packages/file-storage/src/validate-upload.ts      # + image/webp
packages/pvgis-client/src/specific-yield.ts       # PVcalc E_y
packages/db/prisma/schema.prisma + migrations/20261021120000_bill_flow/migration.sql
apps/web/lib/specific-yield.ts                    # cached yield + fallback
apps/web/lib/sizing-catalog.ts                    # Prisma rows → SizingCatalog
apps/web/lib/project-proposals.ts                 # project → SizingContext → proposals
apps/web/components/map/point-markers.ts          # colours + divIcons for the 4 points
apps/web/app/(app)/projects/new/page.tsx          # import-first page
apps/web/app/(app)/projects/new/manual/page.tsx   # the old manual form, moved
apps/web/app/(app)/projects/import-bill-actions.ts
apps/web/app/(app)/projects/[id]/proposals/{page.tsx,actions.ts,proposal-card.tsx,corrections-form.tsx}
apps/web/app/(app)/projects/[id]/locations/{page.tsx,actions.ts,locations-map.tsx,locations-map-loader.tsx}
apps/web/app/(app)/projects/[id]/page.tsx         # "Continuer" banner by flowStep
apps/web/app/(app)/projects/[id]/map/map-editor.tsx  # coloured markers
packages/catalog-import/src/purge-test-items.ts + src/cli.ts
```

---

### Task 1: Check C23 — inverter AC power ≤ subscribed power

**Files:**
- Modify: `packages/engine/src/checks.ts`, `packages/engine/src/run-engine.ts`
- Test: `packages/engine/test/checks-c23.test.ts`

**Interfaces:**
- Produces: `checkC23(totalInverterPacW: number, subscribedPowerKVA: number): CheckResult`; `RunEngineInput.subscribedPowerKVA?: number` (absent → C23 not in `checks`, behaviour unchanged).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { checkC23, runEngine } from '../src';
import { habibKhedhiraFixture } from './fixtures/<existing reference fixture file>';

describe('checkC23', () => {
  it('blocks when total inverter AC power exceeds the subscribed power', () => {
    expect(checkC23(5000, 4)).toEqual({
      id: 'C23', level: 'BLOCK', pass: false,
      message: 'Puissance AC totale des onduleurs supérieure à la puissance souscrite',
    });
  });
  it('passes at exactly the subscribed power', () => {
    expect(checkC23(4000, 4).pass).toBe(true);
  });
});

describe('runEngine + subscribedPowerKVA', () => {
  it('fails C23 when the subscribed power is below the inverter power', () => {
    const result = runEngine({ ...habibKhedhiraFixture, subscribedPowerKVA: 1 });
    expect(result.checks.find((c) => c.id === 'C23')?.pass).toBe(false);
    expect(result.hasBlockingFailure).toBe(true);
  });
  it('does not run C23 when subscribedPowerKVA is absent', () => {
    expect(runEngine(habibKhedhiraFixture).checks.some((c) => c.id === 'C23')).toBe(false);
  });
});
```
(Use whatever name/path the existing engine tests import the reference fixture from.)

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run packages/engine/test/checks-c23.test.ts` → `checkC23 is not a function`.
- [ ] **Step 3: Implement** `checkC23` (pass = `totalInverterPacW <= subscribedPowerKVA * 1000`) and append it to `runEngine`'s checks when `input.subscribedPowerKVA !== undefined`, using Σ `array[i].inverter.pacW`.
- [ ] **Step 4: Run, expect PASS**, then the whole engine suite `npx vitest run packages/engine` (existing tests unchanged).
- [ ] **Step 5: Commit** — `feat(engine): check C23, inverter AC power within the subscribed power`

---

### Task 2: `buildCandidate` — one complete, checked installation

**Files:**
- Create: `packages/engine/src/sizing-types.ts`, `packages/engine/src/build-candidate.ts`, `packages/engine/test/fixtures/sizing-catalog.ts`
- Modify: `packages/engine/src/index.ts` (export both)
- Test: `packages/engine/test/build-candidate.test.ts`

**Interfaces:**
- Consumes: `runEngine`, `RunEngineInput.subscribedPowerKVA` (Task 1), `izCorrected`, `duDcV/duDcPct/duAcV/duAcPct`, `stringVocTmin`, `iscFieldDesign`, `dcFuseRequired`, `checkC08/C09/C10/C13/C14/C16`.
- Produces (in `sizing-types.ts`):
```ts
export interface CatalogModule extends PvModuleInput { id: string; brand: string; model: string; homologationValidTo: string | null }
export interface CatalogInverter extends InverterInput { id: string; brand: string; model: string; homologationValidTo: string | null }
export interface CatalogDcSwitch { id: string; brand: string; model: string; ratedVoltageV: number; ratedCurrentA: number }
export interface CatalogDcFuse { id: string; brand: string; model: string; ratedCurrentA: number; ratedVoltageV: number }
export interface CatalogSpd { id: string; brand: string; model: string; side: 'DC' | 'AC'; type: number; ucV: number; upKV: number; inKA: number; iscpvKA: number | null }
export interface CatalogAcBreaker { id: string; brand: string; model: string; ratedCurrentA: number }
export interface CatalogCable { id: string; brand: string; model: string; usage: 'DC_SOLAR' | 'AC' | 'EARTH'; conductor: ConductorType; insulation: InsulationType; sections: { sectionMm2: number; izA: number; izReferenceMethod: ReferenceMethod }[] }
export interface SizingCatalog { modules: CatalogModule[]; inverters: CatalogInverter[]; dcSwitches: CatalogDcSwitch[]; dcFuses: CatalogDcFuse[]; spds: CatalogSpd[]; acBreakers: CatalogAcBreaker[]; cables: CatalogCable[] }
export interface SizingContext {
  annualConsumptionKWh: number; subscribedPowerKVA: number; specificYieldKWhPerKWp: number;
  averagePriceTNDPerKWh: number | null;
  tMinC: number; tMaxC: number; cosPhi: number; lambdaOhmPerM: number; maxVoltageDropPct: number;
  dcLengthM: number; acLengthM: number; windSpeedKmh: number; tiltDeg: number;
  gps: { lat: number; lon: number }; dossierDate: string; companyAccreditationValidTo: string;
}
export interface CableChoice { cableId: string; sectionMm2: number; lengthM: number }
export interface Candidate {
  module: CatalogModule; inverter: CatalogInverter; modulesPerString: number; stringCount: number; mppts: MpptConfig[];
  dcSwitchId: string; dcFuseId: string | null; dcSpdId: string; acBreakerId: string; acSpdId: string;
  dcCable: CableChoice; acCable: CableChoice; earthCableId: string;
  engineInput: RunEngineInput; engineResult: EngineResult;
}
export type BuildCandidateResult = { ok: true; candidate: Candidate } | { ok: false; reason: string };
```
- `buildCandidate(module: CatalogModule, inverter: CatalogInverter, modulesPerString: number, stringCount: number, catalog: SizingCatalog, context: SizingContext): BuildCandidateResult`

Fixed run parameters (spec §5/B5, existing cabling form defaults): DC run `installMethod '13'`, ambient 80 °C (`TRAY_SUN`); AC run `installMethod '3A'`, ambient 50 °C (`TECHNICAL_ROOM`); `groupedCircuits 1`, `layers 1`; `equipmentImpulseWithstandKV 4`; `spdToEquipmentDistanceM 1`; `structure { ballastPerFrame: 0, ballastMassKg: 0, windSpeedKmh, tiltDeg }`; `site { phases: 1, lightningRod: false, gps }`; `acIsolator: null`.

Selection rules (each "smallest" = ascending by rating, then brand/model):
1. MPPTs: spread `stringCount` evenly over `inverter.mpptCount` (3 strings on 2 MPPTs → `[2, 1]`, MPPTs with 0 strings omitted); any MPPT above `inputsPerMppt` → reason `Trop de chaînes pour l'onduleur ${brand} ${model}.`
2. DC switch: smallest passing C09. DC SPD (`side 'DC'`, `iscpvKA !== null`): smallest `ucV` passing C10. DC fuse only if `dcFuseRequired(module, maxStringsPerMppt)`: smallest passing C08. AC SPD (`side 'AC'`): smallest `ucV` passing C14.
3. DC cable: over `usage 'DC_SOLAR'` cables, smallest section with C16 pass and DC drop % ≤ `maxVoltageDropPct`. AC cable + breaker: over `usage 'AC'` cables, smallest section for which some breaker passes C13 (`iacMaxA ≤ In ≤ Iz`) and AC drop % ≤ `maxVoltageDropPct`; take the smallest such breaker. (C17 compares DC and AC separately, so the two choices are independent.)
4. Earth cable: first `usage 'EARTH'` cable that has a 16 mm² section.
5. Missing item → reason naming it in French, e.g. `Aucun parafoudre DC compatible dans le catalogue.`, `Aucune section de câble AC ne respecte la chute de tension sur ${acLengthM} m.`
6. Build `RunEngineInput` (with `subscribedPowerKVA`), run the engine; any failing BLOCK check → `{ ok: false, reason: <that check's message> }`.

- [ ] **Step 1: Fixture** — `sizing-catalog.ts` exports `sizingCatalog: SizingCatalog` and `sizingContext: SizingContext`: two modules (450 W and 550 W, realistic mono-PERC datasheet values; reuse the reference fixture's coefficients), single-phase STEG-approved inverters of 2, 3, 5 and 10 kW (realistic MPPT windows, 1–2 MPPTs), one three-phase 10 kW, one non-approved 5 kW, one 5 kW with `homologationValidTo: '2020-01-01'`; DC switches 16 A and 32 A (1000 V); DC SPDs uc 600 V and 1000 V; one DC fuse 15 A/1000 V; AC breakers 10/16/20/25/32/40/50/63 A; AC SPD uc 275 V; cables H1Z2Z2-K (DC, 4/6/10 mm², method C), U1000 R2V (AC, 2.5/4/6/10/16 mm², method C), earth (16/25 mm²). Context: 3 000 kWh, 4 kVA, 1 600 kWh/kWp, price 0.12, temps −10/85, cosφ 0.8, λ 0.00008, drop 3 %, DC 15 m, AC 10 m, wind 120, tilt 30, GPS (34.42, 8.78), dates `2026-10-21` / `2027-12-31`.
- [ ] **Step 2: Write the failing tests** (`build-candidate.test.ts`):
  - `spreads 3 strings over 2 MPPTs as [2, 1]` → `candidate.mppts.map(m => m.stringsInParallel)` equals `[2, 1]`.
  - `picks the smallest DC switch that passes C09` → with a string whose Isc design current > 16 A, `dcSwitchId` is the 32 A switch.
  - `adds no DC fuse for one string per MPPT` → `dcFuseId === null`.
  - `bumps the AC section on a long run` → `acLengthM: 10` gives 2.5 mm²; `acLengthM: 60` gives a larger section.
  - `returns a reason when no DC SPD passes` → catalog with only the 600 V DC SPD and a long string → `{ ok: false, reason: 'Aucun parafoudre DC compatible dans le catalogue.' }`.
  - `produces an engine input with no blocking failure` → `candidate.engineResult.hasBlockingFailure === false` and `engineInput.subscribedPowerKVA === 4`.
- [ ] **Step 3: Run, expect FAIL**.
- [ ] **Step 4: Implement** `buildCandidate` per the rules above.
- [ ] **Step 5: Run, expect PASS**; commit — `feat(engine): build a complete checked candidate installation`

---

### Task 3: `proposeInstallations` — up to three ranked proposals

**Files:**
- Create: `packages/engine/src/sizing.ts`
- Modify: `packages/engine/src/sizing-types.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/test/sizing.test.ts`

**Interfaces:**
- Consumes: `buildCandidate` + types (Task 2), `nsMin`, `nsMax`, `nsOptMax`, `npOpt`, `computeRowSpacingM`.
- Produces:
```ts
export type ProposalKind = 'RECOMMENDED' | 'ECONOMIC' | 'MAX_PRODUCTION';
export interface Proposal {
  key: string;                 // `${module.id}|${inverter.id}|${modulesPerString}x${stringCount}`
  kinds: ProposalKind[];       // one candidate may win several objectives
  candidate: Candidate;
  moduleCount: number; dcPowerKWp: number; acPowerKW: number;
  annualProductionKWh: number; coveragePct: number; roofAreaM2: number;
  yearlySavingTND: number | null; explanation: string;
}
export interface ProposeResult { proposals: Proposal[]; noSolutionReasons: string[]; stats: { engineRuns: number } }
export const MAX_ENGINE_RUNS = 20_000;
export function proposeInstallations(catalog: SizingCatalog, context: SizingContext): ProposeResult;
```

Algorithm:
1. Eligible inverters: `phases === 1`, `stegApproved === true`, `homologationValidTo === null || >= dossierDate`, `pacW <= subscribedPowerKVA * 1000`. None → reason `Aucun onduleur monophasé homologué STEG de ${kVA} kVA ou moins dans le catalogue.`
2. Eligible modules: `380 <= pmaxW <= 720`, not expired. None → `Aucun module homologué de 380 à 720 W dans le catalogue.`
3. Cheap combos: for each (module, inverter), `ns` from `nsMin` to `min(nsOptMax, nsMax)`, `strings` from 1 to `mpptCount × min(inputsPerMppt, npOpt)`; keep when DC/AC ratio (`ns·strings·pmaxW / pacW`) ∈ [0.8, 1.3] and coverage (`ns·strings·pmaxW/1000 × yield / consumption`) ∈ [0.5, 1.3]. None → `Aucune combinaison panneaux/onduleur ne couvre entre 50 % et 130 % de la consommation.`
4. Sort combos by |coverage − 1| ascending; `buildCandidate` each until `MAX_ENGINE_RUNS`; tally failure reasons.
5. Winners: RECOMMENDED = min |production − consumption|; ECONOMIC = among coverage ≥ 0.8, min module count; MAX_PRODUCTION = among coverage ≤ 1.2, max production. Ties: ratio closest to 1.15, then fewer modules, then `brand model` alphabetical. Merge winners with the same key (kinds in the order RECOMMENDED, ECONOMIC, MAX_PRODUCTION). No valid candidate → the 3 most frequent tallied reasons.
6. Figures: production = dcKWp × yield (rounded kWh); coveragePct = round(production / consumption × 100); roofAreaM2 = round(moduleCount × widthM × (lengthM × cos(tilt) + computeRowSpacingM(tilt, lengthM, lat)), 1 decimal); yearlySavingTND = price === null ? null : round(min(production, consumption) × price).
7. Explanation (French, joined with a space when merged):
   - RECOMMENDED: `Production estimée la plus proche de la consommation (${coveragePct} %).`
   - ECONOMIC: `Le moins de panneaux pour couvrir au moins 80 % de la consommation.`
   - MAX_PRODUCTION: `La plus forte production possible avec ${kVA} kVA souscrits.`

- [ ] **Step 1: Write the failing tests** (`sizing.test.ts`, fixture from Task 2):
  - `recommends a single-phase installation close to the need` → 3 000 kWh / 4 kVA: first proposal has `kinds` containing `RECOMMENDED`, coverage in [85, 115], `inverter.phases === 1`, `inverter.pacW <= 4000`, `engineResult.hasBlockingFailure === false`.
  - `never proposes ineligible inverters` → no proposal uses the three-phase, non-approved or expired inverter, nor any inverter with `pacW > 4000`.
  - `explains why there is no solution` → context `subscribedPowerKVA: 1.5` → `proposals` empty, `noSolutionReasons[0] === 'Aucun onduleur monophasé homologué STEG de 1,5 kVA ou moins dans le catalogue.'` (format kVA with `fr-FR`).
  - `objectives pick different installations for a large consumer` → 21 096 kWh, 14 kVA, yield 1 750: MAX_PRODUCTION production ≥ RECOMMENDED production; ECONOMIC module count ≤ RECOMMENDED module count; every proposal coverage ≤ 130.
  - `merges objectives that pick the same candidate` → no two proposals share a `key`.
  - `computes the saving from the bill price` → `yearlySavingTND === Math.round(Math.min(p.annualProductionKWh, 3000) * 0.12)`; with `averagePriceTNDPerKWh: null` → `null`.
  - `caps engine runs` → a synthetic catalog of 60 modules × 40 eligible inverters → `stats.engineRuns <= MAX_ENGINE_RUNS` and the call returns.
- [ ] **Step 2: Run, expect FAIL**. **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(engine): propose up to three single-phase installations from the catalog`

---

### Task 4: `@dossipv/bill-reader` — types, ladder, governorates, arithmetic checks

**Files:**
- Create: `packages/bill-reader/{package.json,tsconfig.json}`, `src/{types.ts,ladder.ts,governorates.ts,check-bill-reading.ts,index.ts}`, `test/{check-bill-reading.test.ts,governorates.test.ts}`
- Modify: root `tsconfig.json` references; run `npm install` so the workspace link exists.

**Interfaces:**
- Produces:
```ts
export const SINGLE_PHASE_POWER_LADDER_KVA = [2, 3, 4, 7, 10, 14, 22, 27, 35, 50] as const;
export interface Governorate { name: string; capital: string; lat: number; lon: number }
export const TUNISIAN_GOVERNORATES: readonly Governorate[];           // the 24
export function findGovernorate(name: string | null): Governorate | null; // accent/case-insensitive
export interface StegBillLine { label: string; oldIndex: number | null; newIndex: number | null; quantityKWh: number | null; unitPrice: number | null; amountHT: number | null; vatPct: number | null }
export interface StegBillReading {
  clientName: string | null; civility: 'M' | 'Mme' | 'Mlle' | 'societe' | null;
  address: string | null; postalCode: string | null; city: string | null; stegDistrict: string | null;
  governorate: string | null; governorateInferred: boolean;
  stegReference: string | null; meterNumber: string | null;
  periodStart: string | null; periodEnd: string | null; monthsBilled: number | null;   // ISO dates
  subscribedPowerKVA: number | null; tariffLabel: string | null; lines: StegBillLine[];
  totalElectricityKWh: number | null; electricityAmountTND: number | null; amountDueTND: number | null;
  readingNotes: string[];
}
export type BillRequiredField = 'clientName' | 'stegReference' | 'subscribedPowerKVA' | 'totalElectricityKWh' | 'monthsBilled';
export interface BillCheckResult {
  warnings: string[]; missingFields: BillRequiredField[];
  derived: { monthsBilled: number | null; annualConsumptionKWh: number | null; averagePriceTNDPerKWh: number | null };
}
export function checkBillReading(reading: StegBillReading): BillCheckResult;
```

Rules: `monthsBilled` falls back to `round(days(periodStart→periodEnd) / 30.44)`; annual = `round(totalKWh × 12 / months)`; average price = Σ line `amountHT` of lines with `quantityKWh > 0` ÷ total kWh (4 decimals); `monthsBilled` is "missing" only if neither it nor both dates are readable. Warning texts (exact):
- `La somme des consommations par poste (${sum} kWh) ne correspond pas au total lu (${total} kWh).` (tolerance 1 kWh)
- `Poste « ${label} » : l'écart d'index (${diff}) ne correspond pas à la quantité (${qty} kWh).`
- `Nombre de mois facturés (${months}) incohérent avec la période du ${start} au ${end}.` (tolerance 1 month)
- `Puissance souscrite de ${kva} kVA inhabituelle pour un abonné monophasé — vérifier sur le compteur.`

- [ ] **Step 1: Write the failing tests**
  - Fixture `testBill` = the reference bill's numbers with `clientName: 'MR TEST CLIENT'`, `stegReference: '00000 000 0'`: lines POINTE 851→851 0 kWh, JOUR 26457→28691 2234 kWh @0.140 amount 312.760, HR-CREUSES 43346→48144 4798 kWh @0.116 amount 556.568; total 7032; months 4; period 2023-02-13→2023-06-12; power 13.
  - `flags only the off-ladder power on a consistent bill` → `warnings` equals `['Puissance souscrite de 13 kVA inhabituelle pour un abonné monophasé — vérifier sur le compteur.']`, `missingFields` `[]`, `derived.annualConsumptionKWh === 21096`, `derived.averagePriceTNDPerKWh === 0.1236`.
  - `detects a sum mismatch` → total 7000 → warning starting `La somme des consommations par poste (7032 kWh)`.
  - `detects an index/quantity mismatch` → JOUR newIndex 28700 → warning containing `Poste « JOUR »`.
  - `derives months from the dates when the count is unreadable` → `monthsBilled: null` → `derived.monthsBilled === 4`, not in `missingFields`.
  - `lists unreadable required fields without guessing` → `stegReference: null, subscribedPowerKVA: null` → `missingFields` equals `['stegReference', 'subscribedPowerKVA']`.
  - `governorates`: 24 entries, every lat ∈ [30.2, 37.6] and lon ∈ [7.5, 11.7], `findGovernorate('GAFSA')?.capital === 'Gafsa'` with lat 34.42 ± 0.1 / lon 8.78 ± 0.1, `findGovernorate('Médenine')` and `findGovernorate('medenine')` both found, `findGovernorate('Paris') === null`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(bill-reader): bill reading types and arithmetic checks`

---

### Task 5: Reading the bill with Claude + WebP uploads

**Files:**
- Create: `packages/bill-reader/src/read-steg-bill.ts`, `packages/bill-reader/test/read-steg-bill.test.ts`
- Modify: `packages/bill-reader/package.json` (`@anthropic-ai/sdk`, same version as dossier-worker), `src/index.ts`; `packages/file-storage/src/validate-upload.ts` + its test

**Interfaces:**
- Produces: `readStegBill(input: { bytes: Buffer; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' }, client: Anthropic): Promise<StegBillReading>`; `class BillReadingError extends Error` (French message); `BILL_READER_MODEL = 'claude-opus-5-5'`. `ValidateUploadResult.mimeType` gains `'webp'`.

Request: `client.messages.parse({ model: BILL_READER_MODEL, max_tokens: 4096, system, messages: [{ role: 'user', content: [<image block (base64) | document block (base64 pdf)>, { type: 'text', text: <instructions> }] }], output_config: { format: <hand-built JSON schema of StegBillReading, additionalProperties false, every key required, nullable via type unions> } })`. The system prompt states: Tunisian STEG bill, French/Arabic; copy values exactly as printed; null when unreadable — never estimate; `governorate` may be inferred from city/district and then `governorateInferred: true`; quantities in kWh; dates ISO. `stop_reason === 'refusal'` or `parsed_output == null` → `BillReadingError('La facture n'a pas pu être lue. Reprenez une photo nette de la facture entière.')`.

- [ ] **Step 1: Write the failing tests**
  - `sends a webp image as a base64 image block` → mocked `client.messages.parse` receives `content[0]` `{ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: <base64> } }` and `model: 'claude-opus-5-5'`.
  - `sends a PDF as a document block` → `content[0].type === 'document'`, `media_type 'application/pdf'`.
  - `returns the parsed reading` → mock returns `{ parsed_output: testBill, stop_reason: 'end_turn' }` → resolves to `testBill`.
  - `throws BillReadingError on refusal` → `stop_reason: 'refusal'` → rejects with that class and message.
  - `validateUploadedFile`: a buffer starting `RIFF....WEBP` claimed as `image/webp` → `{ valid: true, mimeType: 'webp' }`; `RIFF....WAVE` claimed as `image/webp` → `valid: false`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** (WebP = bytes 0–3 `RIFF` and 8–11 `WEBP`; update every caller that switches on `mimeType` so `'webp'` is handled). **Step 4: Run, expect PASS** (plus `packages/file-storage` and `apps/web` suites).
- [ ] **Step 5: Commit** — `feat(bill-reader): read a STEG bill image or PDF with Claude; accept WebP uploads`

---

### Task 6: Schema for the bill flow + cached specific yield

**Files:**
- Modify: `packages/db/prisma/schema.prisma`; Create: `packages/db/prisma/migrations/20261021120000_bill_flow/migration.sql`
- Create: `packages/pvgis-client/src/specific-yield.ts` (+ export), `packages/pvgis-client/test/specific-yield.test.ts`
- Create: `apps/web/lib/specific-yield.ts`, `apps/web/test/specific-yield.test.ts`

**Interfaces:**
- Produces (Prisma): `enum ProjectFlowStep { PROPOSALS LOCATIONS READY }`; `Project.flowStep ProjectFlowStep?`; `Project.billImport ProjectBillImport?`; `model ProjectBillImport { id String @id @default(uuid()); projectId String @unique; fileId String; reading Json; warnings Json; annualConsumptionKWh Float?; averagePriceTNDPerKWh Float?; modelId String; createdAt DateTime @default(now()) }` (`@@map("project_bill_import")`, relations to `Project` and `File` with back-relations); `ProjectSite.floors Int?`; `model PvgisYieldCache { id; latRounded Float; lonRounded Float; tiltDeg Float; azimuthDeg Float; specificYieldKWhPerKWp Float; fetchedAt DateTime @default(now()); @@unique([latRounded, lonRounded, tiltDeg, azimuthDeg]) }` (`@@map("pvgis_yield_cache")`).
- Produces: `fetchPvgisSpecificYield(lat: number, lon: number, tiltDeg: number, azimuthDeg: number): Promise<number>` — GET `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc` with `lat, lon, peakpower=1, loss=14, angle, aspect, outputformat=json`, returns `outputs.totals.fixed.E_y`; non-OK or missing value → `PvgisFetchError`.
- Produces: `getSpecificYield(lat: number, lon: number, tiltDeg: number, azimuthDeg: number): Promise<{ value: number; warning: string | null }>` — lat/lon rounded to 2 decimals; cache hit → no fetch; miss → fetch + insert; fetch failure → `{ value: 1600, warning: 'PVGIS indisponible : rendement par défaut de 1 600 kWh/kWc utilisé.' }` and nothing cached.

- [ ] **Step 1: Schema + migration** — edit the schema, then from `packages/db`: `npx prisma migrate dev --name bill_flow --create-only`, rename the folder to `20261021120000_bill_flow`, `npx prisma migrate deploy`, `npx prisma generate`. Expected: "All migrations have been successfully applied."
- [ ] **Step 2: Write the failing tests**
  - pvgis-client (mocked `fetch`): `returns E_y from PVcalc` (fixture JSON `{ outputs: { totals: { fixed: { E_y: 1750.3 } } } }` → `1750.3`, URL contains `peakpower=1` and `loss=14`); `throws PvgisFetchError on HTTP 500`; `throws PvgisFetchError when E_y is missing`.
  - web (mocked `@dossipv/db` + `@dossipv/pvgis-client`): `uses the cache on a hit` (fetch not called); `fetches and stores on a miss` (create called with `latRounded: 34.42, lonRounded: 8.78`); `falls back to 1600 with a warning when PVGIS fails` (create not called).
- [ ] **Step 3: Run, expect FAIL.** **Step 4: Implement.** **Step 5: Run, expect PASS**; full `npx vitest run` still green.
- [ ] **Step 6: Commit** — `feat: bill-flow schema and cached PVGIS specific yield`

---

### Task 7: Import the bill → create the project

**Files:**
- Create: `apps/web/app/(app)/projects/import-bill-actions.ts`, `apps/web/test/import-bill-action.test.ts`
- Modify: `apps/web/app/(app)/projects/new/page.tsx` (import-first); Create: `apps/web/app/(app)/projects/new/manual/page.tsx` (the current form, moved unchanged)
- Modify: `apps/web/package.json` (`@dossipv/bill-reader`, `@anthropic-ai/sdk`)

**Interfaces:**
- Consumes: `readStegBill`, `checkBillReading`, `findGovernorate`, `BILL_READER_MODEL` (Tasks 4–5); `validateUploadedFile`, `saveFile`, `deleteFile`; Prisma models from Task 6.
- Produces: `importStegBillAction(prev: ImportBillState | undefined, formData: FormData): Promise<ImportBillState | undefined>`, `interface ImportBillState { error: string }`. On success redirects to `/projects/${id}/proposals`.

Order (no orphan files, per the project's validate-then-save rule): guard → file field `bill` (`'Aucun fichier reçu.'` if absent / not a `File`) → `validateUploadedFile` → `readStegBill` (client `new Anthropic()`) → `checkBillReading` → `saveFile` → one `db.$transaction`: `File` row, `Project` (tier from subscription as in `createProjectAction`, `status 'DRAFT'`, `flowStep 'PROPOSALS'`), `ProjectClient` (`fullName: reading.clientName ?? 'Client à compléter'`, civility, address, city, governorate, stegReference, `annualConsumptionKWh`, `subscribedPowerKVA`, `clientKind 'residential'`), `ProjectSite` (`phases 1, gridType 'BT', mountingType 'FLAT_ROOF_BALLAST', tiltDeg 30, azimuthDeg 0`, GPS = governorate capital, else Tunis 36.8065 / 10.1815 plus warning `Gouvernorat non reconnu : position par défaut (Tunis).`), `ProjectAnnexes.lastPaidBillFileId`, `ProjectBillImport` (reading, warnings, derived values, `modelId: BILL_READER_MODEL`). An existing project of the company with the same `stegReference` adds the warning `Un autre projet existe déjà pour la référence STEG ${ref}.` (still created). Transaction failure → `deleteFile` the saved file, return `'Enregistrement impossible, réessayez.'`. `BillReadingError` → its message; any other error → `'Lecture de la facture impossible, réessayez.'`.

Page: heading "Nouveau projet", lead "Importez la photo ou le PDF de la facture STEG du client : le dossier se prépare automatiquement.", `<input type="file" name="bill" accept="image/jpeg,image/png,image/webp,application/pdf" required>` (no `capture` attribute — it would stop the installer from picking an existing photo), submit "Lire la facture" (pending: "Lecture de la facture… (environ 30 s)"), error `role="alert"`, secondary link "Créer un projet sans facture" → `/projects/new/manual`.

- [ ] **Step 1: Write the failing tests** (mock `@dossipv/auth`, `next/navigation` with a throwing `redirect`, `@dossipv/db`, `@dossipv/file-storage`, `@dossipv/bill-reader` keeping the real `checkBillReading`/`findGovernorate`):
  - `requires a session before reading anything` → no session → redirect thrown, `readStegBill` not called.
  - `rejects a missing file` → `{ error: 'Aucun fichier reçu.' }`.
  - `does not save the file when the bill cannot be read` → `readStegBill` rejects `BillReadingError` → returns its message, `saveFile` not called.
  - `creates the project from the reading and opens the proposals` → `testBill` with governorate `'Gafsa'` → transaction creates client (`subscribedPowerKVA 13`, `annualConsumptionKWh 21096`), site (`phases 1`, GPS ≈ 34.42/8.78), annexes with the new file id, bill import with the ladder warning, `flowStep 'PROPOSALS'`; redirect to `/projects/<id>/proposals`.
  - `keeps unreadable fields null` → `subscribedPowerKVA: null` → client created with `subscribedPowerKVA: null`.
  - `deletes the saved file if the database write fails` → `$transaction` rejects → `deleteFile` called, error returned.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement action + pages.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): import a STEG bill to create a project`

---

### Task 8: Catalog loader, project proposals, apply a proposal

**Files:**
- Create: `apps/web/lib/sizing-catalog.ts`, `apps/web/lib/project-proposals.ts`, `apps/web/app/(app)/projects/[id]/proposals/actions.ts`
- Test: `apps/web/test/sizing-catalog.test.ts`, `apps/web/test/apply-proposal-action.test.ts`
- Modify: `apps/web/lib/project-engine-input.ts` (`PROJECT_ENGINE_INCLUDE` + `billImport: true`)

**Interfaces:**
- Consumes: `proposeInstallations`, `SizingCatalog`, `SizingContext`, `Proposal` (Tasks 2–3); `getSpecificYield` (Task 6); `catalogScope`; `PROJECT_ENGINE_INCLUDE`.
- Produces:
  - `loadSizingCatalog(companyId: string): Promise<SizingCatalog>` — the 7 equipment tables filtered by `{ AND: [libraryScope(companyId), catalogScope(companyId)] }` (Task 12: only the company's library, and never a shared draft), cables with `sections`, dates → `YYYY-MM-DD`, SPD/cable enums passed through.
  - `missingLibraryKinds(catalog: SizingCatalog): string[]` — French labels of what the library lacks for a single-phase proposal, in this order: `Modules photovoltaïques`, `Onduleurs monophasés homologués STEG`, `Interrupteurs-sectionneurs DC`, `Parafoudres DC`, `Parafoudres AC`, `Disjoncteurs AC`, `Câbles DC (solaire)`, `Câbles AC`, `Câbles de terre`.
  - `computeProjectProposals(project: ProjectForEngine, now: Date): Promise<{ ok: true; result: ProposeResult; context: SizingContext; yieldWarning: string | null } | { ok: false; missing: string[]; missingLibraryKinds: string[] }>` — `missing` when `client.annualConsumptionKWh`, `client.subscribedPowerKVA` or `site` is null; `missingLibraryKinds` non-empty → not ok (no sizing run). Context: company `defaultTMinC/defaultTMaxC/defaultCosPhi/defaultMaxVoltageDropPct/defaultDesignWindSpeedKmh`, `lambdaOhmPerM 0.00008`, lengths = current DC/AC cable-run lengths if the runs exist else 15 / 10, `tiltDeg = site.tiltDeg`, azimuth `site.azimuthDeg ?? 0`, GPS = site GPS, `averagePriceTNDPerKWh = billImport?.averagePriceTNDPerKWh ?? null`, `dossierDate = project.dossierDate ?? now`, `companyAccreditationValidTo = company.anmeValidTo`.
  - `applyProposalAction(projectId: string, proposalKey: string): Promise<{ error: string } | undefined>` — guard (`requireOwnedProject`, `ProjectNotFoundError` → `'Projet introuvable.'`); recompute; key not found → `'Les propositions ont changé : rechargez la page.'` with no write; else one transaction: replace `ProjectArrayConfig` (+ inverters/MPPTs; `tMinC/tMaxC` from context), upsert `ProjectProtections` (chosen ids, `acIsolatorId null`), upsert `ProjectCablingConfig` (`cosPhi`, `lambdaOhmPerM`, `maxVoltageDropPct`), replace cable runs with DC `{ label: 'Champ PV → onduleur', installMethod: '13', ambientContext: 'TRAY_SUN' }` and AC `{ label: 'Onduleur → compteur STEG', installMethod: '3A', ambientContext: 'TECHNICAL_ROOM' }` (`groupedCircuits 1`, `layers 1`, chosen cable/section/length), upsert `ProjectStructure` (`material 'ALUMINIUM'`, company wind speed, every optional column null — same shape as `saveStructureAction`), upsert `ProjectEarthing` (`earthCableId`, `16/16/25 mm²`, `rodCount 1`, `rodLengthM 1.5`, `targetResistanceOhm = company.defaultEarthResistanceTargetOhm ?? 25`), upsert `ProjectSimulation` (`source 'PVGIS_LIVE'`), `Project.flowStep 'LOCATIONS'`; redirect `/projects/${projectId}/locations`.

- [ ] **Step 1: Write the failing tests**
  - `sizing-catalog`: maps one row of each type (homologation date → `'2027-12-31'`, `iscpvKA: null` kept) and queries every table with the library ∧ catalog filter; `missingLibraryKinds` of an empty catalog lists all 9 labels in order, of a three-phase-only inverter list includes `Onduleurs monophasés homologués STEG`.
  - `apply-proposal-action` (mock db, `getSpecificYield` → 1 600, a seeded fake catalog that yields at least one proposal): `guards before recomputing`; `refuses an unknown key without writing` (`$transaction` not called, error text above); `writes every section and moves to the locations step` (array config with the proposal's module and MPPTs, two runs with lengths 15 / 10, earthing `rodCount 1`, flowStep `LOCATIONS`, redirect thrown to `/projects/p1/locations`); `returns Projet introuvable for another company's project`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): compute and apply installation proposals`

---

### Task 9: Proposals screen

**Files:**
- Create: `apps/web/app/(app)/projects/[id]/proposals/{page.tsx,proposal-card.tsx,corrections-form.tsx}`
- Modify: `apps/web/app/(app)/projects/[id]/proposals/actions.ts` (+ corrections action)
- Test: `apps/web/test/proposal-card.test.tsx`, `apps/web/test/bill-corrections-action.test.ts`

**Interfaces:**
- Consumes: `computeProjectProposals`, `applyProposalAction` (Task 8); `Proposal` (Task 3); `ProjectBillImport` (Task 6).
- Produces: `saveBillCorrectionsAction(projectId: string, prev: { error: string } | undefined, formData: FormData): Promise<{ error: string } | undefined>` — fields `fullName` (text ≤ 200), `stegReference` (text ≤ 100), `subscribedPowerKVA` (number 1–100), `annualConsumptionKWh` (number 1–1 000 000); updates `ProjectClient`; `revalidatePath(`/projects/${projectId}/proposals`)`.

Screen (top to bottom):
1. `Propositions pour ${fullName}`.
2. Box "Lu sur la facture": Référence STEG, Puissance souscrite (kVA), Consommation `${kWh} kWh sur ${n} mois → environ ${annual} kWh/an (estimation)`, Prix moyen `${price} DT/kWh`; warnings (bill import + yield warning) as a list; a `<details>` "Corriger les données lues" containing the corrections form (open by default when a required value is missing; proposals are then hidden).
3. Up to 3 `ProposalCard`s: badges `Recommandée` / `Économique` / `Production maximale`; `${dcPowerKWp} kWc` large; `${moduleCount} panneaux ${brand} ${model} (${pmaxW} W)`; `Onduleur ${brand} ${model} (${pacW/1000} kW)`; `Production estimée : ${kWh} kWh/an`; `Couverture de la consommation : ${pct} %`; `Surface de toiture : environ ${m2} m²`; `Économie estimée : environ ${dt} DT/an` (only when not null); the explanation; button "Choisir cette installation" → `confirm('Le client a validé cette installation ?')` → `applyProposalAction` (error shown in the card).
4. No proposal → "Aucune installation possible" + the reasons list + link "Ouvrir le projet" (`/projects/${id}`).
5. Library incomplete (`missingLibraryKinds` non-empty) → instead of cards: "Votre bibliothèque ne contient pas encore :" + the list + primary link "Compléter ma bibliothèque" (`/library?tab=catalogue`).

- [ ] **Step 1: Write the failing tests**
  - `proposal-card`: renders `3,6 kWc`, `8 panneaux`, `Couverture de la consommation : 98 %`, `Économie estimée : environ 380 DT/an` for a fixture proposal; omits the saving line when `yearlySavingTND` is null; shows two badges when `kinds` has two entries.
  - `bill-corrections-action`: guard first; `subscribedPowerKVA: '0'` → error mentioning `Puissance souscrite`; valid → `projectClient.update` with numbers, `revalidatePath('/projects/p1/proposals')` called.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): proposals screen for the client's approval`

---

### Task 10: Locations — four coloured points, lengths, generate

**Files:**
- Create: `packages/engine/src/run-lengths.ts` (+ export), `packages/engine/test/run-lengths.test.ts`
- Create: `apps/web/components/map/point-markers.ts`, `apps/web/app/(app)/projects/[id]/locations/{page.tsx,actions.ts,locations-map.tsx,locations-map-loader.tsx}`, `apps/web/test/locations-action.test.ts`
- Modify: `apps/web/app/(app)/projects/[id]/map/map-editor.tsx` (use the coloured icons; the GPS marker is the yellow "Champ PV"), `apps/web/app/(app)/projects/[id]/page.tsx` (banner)

**Interfaces:**
- Consumes: `generateDossierAction` (existing), `buildEngineInput`, `runEngine`, `ACTIVE_MAP_PROVIDER`, Task 6 `ProjectSite.floors`.
- Produces:
  - `groundDistanceM(a: GpsPoint, b: GpsPoint): number` (haversine, R = 6 371 000 m); `computeRunLengthsM(points: { field: GpsPoint; technicalRoom: GpsPoint; meter: GpsPoint }, floors: number): { dcLengthM: number; acLengthM: number }` — DC = `ceil(ground(field→technicalRoom) × 1.2 + (floors + 1) × 3.5)`, AC = `ceil(ground(technicalRoom→meter) × 1.2)`, each at least 1.
  - `POINT_STYLES = { field: { label: 'Champ PV', color: '#F5B800' }, technicalRoom: { label: 'Local technique (onduleur)', color: '#1E6FD9' }, meter: { label: 'Compteur STEG', color: '#D93025' }, earthPit: { label: 'Piquet de terre', color: '#1E8E3E' } } as const`; `type PointKind = keyof typeof POINT_STYLES`; `pointIcon(kind: PointKind): L.DivIcon` (24 px circle in the colour, 2 px white border, shadow).
  - `saveLocationsAndGenerateAction(projectId: string, payload: { field: GpsPoint | null; technicalRoom: GpsPoint | null; meter: GpsPoint | null; earthPit: GpsPoint | null; floors: number }): Promise<{ error: string } | undefined>`.

Action: guard first → each of field/technicalRoom/meter present (`'Placez le point « ${label} » sur la carte.'`), finite, in range → any two placed points more than 500 m apart → `'Les points sont trop éloignés (plus de 500 m) : vérifiez leur emplacement.'` → `floors` integer 0–3 → update site (`gpsLat/gpsLon` and `installationPoint*` = field, `technicalRoomPoint*`, `meterPoint*`, `earthPitPoint*` (null allowed), `floors`) and the DC/AC run lengths → load project, `buildEngineInput` + `runEngine`; while C16 fails or the DC drop exceeds the limit, move the DC run to the cable's next larger section; same for the AC run with C13/AC drop; no larger section left → `'Aucune section de câble ne respecte la chute de tension pour la liaison ${DC|AC} (${length} m).'` (points stay saved) → `flowStep 'READY'` → `return generateDossierAction(projectId, undefined)`.

Screen: title `Emplacements — ${fullName}`; one line "Touchez un bouton puis la carte pour placer chaque point. Les points sont déplaçables."; four buttons (colour dot + label + `✓ placé` / `à placer`, Piquet de terre marked "facultatif"); select "Niveau du toit" RDC / R+1 / R+2 / R+3 (0–3, default `site.floors ?? 0`); Esri map centred on the site GPS at zoom 19 (`ssr: false` loader as in `map/`); legend under the map; primary button "Enregistrer et générer le dossier" disabled until the three required points are placed; pending "Génération en cours…"; error `role="alert"`. Project page: when `flowStep` is `PROPOSALS` or `LOCATIONS`, a banner at the top links to "Continuer : choisir l'installation" (`/proposals`) or "Continuer : placer les points" (`/locations`).

- [ ] **Step 1: Write the failing tests**
  - `run-lengths`: 10 m east-west at lat 34.4 (Δlon = 10 / (111 320 × cos 34.4°)) → `groundDistanceM` 10 ± 0.05; with field→room 10 m, room→meter 10 m, floors 0 → `{ dcLengthM: 16, acLengthM: 12 }`; floors 1 → DC 19; all three points identical → `{ dcLengthM: 4, acLengthM: 1 }`.
  - `locations-action` (mock db, engine input builder, `generateDossierAction`): `guards first`; `asks for the meter point` (meter null → `Placez le point « Compteur STEG » sur la carte.`); `refuses points 2 km apart` (no db write); `saves points, lengths and generates` (site update with GPS = field, run lengths from `computeRunLengthsM`, flowStep `READY`, `generateDossierAction` called with `('p1', undefined)`); `bumps the AC section when the voltage drop fails` (engine stub fails C17 on AC first then passes → AC run updated to the next section of that cable).
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live check** — `npm run dev` in `apps/web` with the dev `DATABASE_URL`: the four coloured markers render and are draggable (Playwright screenshot of `/projects/<id>/locations`).
- [ ] **Step 6: Commit** — `feat(web): coloured location points drive cable lengths, then generate`

---

### Task 11: Delete test equipment from the shared catalog

**Files:**
- Create: `packages/catalog-import/src/purge-test-items.ts`, `packages/catalog-import/test/purge-test-items.test.ts`
- Modify: `packages/catalog-import/src/cli.ts` (command `purge-test-items [--apply]`)

**Interfaces:**
- Consumes: `data/catalog/cables.json`, `data/catalog/protections.json` (catalog-import Task 11), `datasheetSourceUrl` column (catalog-import Task 4).
- Produces: `type EquipmentTable = 'pvModule' | 'inverter' | 'spd' | 'dcSwitch' | 'dcFuse' | 'acBreaker' | 'acIsolator' | 'cable' | 'accessory'`; `interface SharedItemRow { table: EquipmentTable; id: string; brand: string; model: string; datasheetSourceUrl: string | null; referencingProjectIds: string[] }`; `selectTestItems(items: SharedItemRow[], curatedKeys: Set<string>): { deletable: SharedItemRow[]; referenced: SharedItemRow[] }` (key = `${table}|${brand}|${model}` lower-cased); `runPurge(db: PrismaClient, options: { apply: boolean; log: (line: string) => void }): Promise<{ deleted: number; referenced: number }>`.

A shared item (`ownerCompanyId = null`) is test equipment when `datasheetSourceUrl === null` and its key is not curated. References follow each table's real usage relations (Spd: DC + AC protections; Cable: cable runs + earthing; Accessory: connector + cable tray + distribution block; the others their single relation). Dry run (default) logs one line per candidate `[table] brand model — supprimable` or `— utilisé par N projet(s): ids`; `--apply` deletes only `deletable` (cables: their `CableSection` rows first, same transaction).

- [ ] **Step 1: Write the failing tests** — `keeps imported items` (url set → in neither list); `keeps curated items`; `marks an unreferenced seed item deletable`; `keeps a referenced seed item out of the deletable list`; key matching is case-insensitive.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Dry run on the dev DB** — `npx tsx packages/catalog-import/src/cli.ts purge-test-items` with the dev `DATABASE_URL`; expected: the seed items (`Generic …`, `LONGi …` seed module, `Sofar …` seed inverter, …) listed. Do **not** run against production.
- [ ] **Step 6: Commit** — `feat(catalog-import): purge-test-items command (dry run by default)`

---

### Task 12: Installer library — data model, backfill, `libraryScope`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`; Create: `packages/db/prisma/migrations/20261021130000_installer_library/migration.sql`
- Modify: `apps/web/lib/project-access.ts` (+ `libraryScope`); Test: `apps/web/test/library-scope.test.ts`

**Interfaces:**
- Produces (Prisma): `enum EquipmentKind { PV_MODULE INVERTER SPD DC_SWITCH DC_FUSE AC_BREAKER AC_ISOLATOR CABLE ACCESSORY }`; `model LibraryItem { id String @id @default(uuid()); companyId String (→ Company, onDelete: Cascade); kind EquipmentKind; pvModuleId String?; inverterId String?; spdId String?; dcSwitchId String?; dcFuseId String?; acBreakerId String?; acIsolatorId String?; cableId String?; accessoryId String? (each → its model, onDelete: Cascade); purchasePriceTnd Float @default(0); createdAt DateTime @default(now()); @@unique([companyId, <fk>]) for each of the 9 FKs; @@map("library_item") }` with back-relation `libraryItems LibraryItem[]` on `Company` and on each of the 9 equipment models.
- Produces: `libraryScope(companyId: string): { libraryItems: { some: { companyId: string } } }` (works as a `where` on every equipment model).

Migration SQL (after Prisma's generated DDL): a `CHECK` that exactly one FK is non-null and it is the one matching `kind`; then the backfill — for every company, one `LibraryItem` for (a) every equipment row it owns (`ownerCompanyId = company`) and (b) every shared row referenced by any of its projects: array module, array inverters, protections (dcSpd, dcSwitch, dcFuse, acBreaker, acSpd, acIsolator), cable runs' cable, earthing earth cable + distribution block, cabling connector + cable tray (`INSERT ... SELECT DISTINCT ... ON CONFLICT DO NOTHING`).

- [ ] **Step 1: Write the failing test** — `libraryScope('company-1')` equals `{ libraryItems: { some: { companyId: 'company-1' } } }`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Schema + migration** — from `packages/db`: `npx prisma migrate dev --name installer_library --create-only`, rename the folder to `20261021130000_installer_library`, append the CHECK + backfill SQL, `npx prisma migrate deploy`, `npx prisma generate`.
- [ ] **Step 4: Implement `libraryScope`; run, expect PASS**; full `npx vitest run` green.
- [ ] **Step 5: Verify the backfill on the dev DB** — query: every `ProjectArrayConfig.moduleId` has a `LibraryItem` for its project's company (expected: 0 rows missing); record the per-company library counts in the report.
- [ ] **Step 6: Commit** — `feat(db): installer library with backfill from existing projects`

---

### Task 13: Library screen — add from the shared catalog, remove, price

**Files:**
- Modify: `apps/web/app/(app)/library/page.tsx`; Create: `apps/web/app/(app)/library/{actions.ts,library-tabs.tsx,price-form.tsx}`
- Test: `apps/web/test/library-actions.test.ts`

**Interfaces:**
- Consumes: `LibraryItem`, `EquipmentKind`, `libraryScope` (Task 12); `catalogScope`.
- Produces: `addToLibraryAction(kind: EquipmentKind, itemId: string): Promise<{ error: string } | undefined>`; `addAllOfKindAction(kind: 'SPD' | 'DC_SWITCH' | 'DC_FUSE' | 'AC_BREAKER' | 'AC_ISOLATOR' | 'CABLE'): Promise<{ error: string } | undefined>`; `removeFromLibraryAction(libraryItemId: string): Promise<{ error: string } | undefined>`; `updateLibraryPriceAction(libraryItemId: string, prev: { error: string } | undefined, formData: FormData): Promise<{ error: string } | undefined>`.

Rules: every action calls `requireAuthenticatedCompanyUser()` first; an item can be added only if `catalogScope(companyId)` finds it (PUBLISHED shared or the company's own) — else `'Équipement introuvable dans le catalogue.'`; adding twice is a no-op (upsert on the unique key); remove/price only on the caller's own `LibraryItem` (else `'Élément introuvable.'`); price: number ≥ 0 and ≤ 1 000 000 (`'Prix invalide.'`); `addAllOfKindAction` adds every PUBLISHED shared item of that kind not yet in the library; every action calls `revalidatePath('/library')`.

Screen (`/library`, tab from `?tab=`): heading "Ma bibliothèque"; tabs "Mes équipements" (default) and "Catalogue partagé" (`?tab=catalogue`). Mes équipements: one section per type with count, rows `brand model` + key figures (module: `Pmax W`; inverter: `Pac kW · mono/tri · STEG ✓`; SPD: `DC/AC · Uc V · Up kV`; switch/fuse/breaker/isolator: `In A · U V` where present; cable: usage + sections), price field (DT, "Enregistrer") and "Retirer"; an empty library shows "Votre bibliothèque est vide : ajoutez les équipements que vous installez depuis le catalogue partagé." with a link to the catalogue tab. Catalogue partagé: a search box (`?q=` — brand/model contains, case-insensitive; a number matches module Pmax / inverter Pac in W or kW), one section per type, rows with the same key figures and "Ajouter" or a "Déjà ajouté" badge; "Tout ajouter" on SPD, DC switch, DC fuse, AC breaker, AC isolator and cable sections.

- [ ] **Step 1: Write the failing tests** — `guards before anything`; `adds a published shared item` (upsert called with `{ companyId, kind: 'INVERTER', inverterId }`, revalidatePath('/library')); `refuses a draft or another company's private item` (catalogScope lookup null → error, no upsert); `adds every published shared SPD not yet in the library` (createMany with skipDuplicates or equivalent, only missing ids); `removes only the caller's own item` (deleteMany scoped by companyId; 0 deleted → 'Élément introuvable.'); `rejects a negative price`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Live check** — dev server: add a module, an inverter and "Tout ajouter" protections/cables, then remove one; Playwright screenshot of both tabs.
- [ ] **Step 6: Commit** — `feat(web): installer library — choose equipment from the shared catalog`

---

### Task 14: Project equipment choices limited to the library

**Files:**
- Modify: `apps/web/app/(app)/projects/[id]/sections/[section]/page.tsx`, `apps/web/app/(app)/projects/[id]/sections/actions.ts`
- Test: `apps/web/test/section-actions.test.ts` (update + new cases)

**Interfaces:**
- Consumes: `libraryScope` (Task 12).
- Produces: `equipmentChoiceScope(companyId: string, currentIds: string[]): { OR: [ { AND: [libraryScope, catalogScope] }, { id: { in: string[] } } ] }` in `apps/web/lib/project-access.ts` — library items, plus the items already saved in this project.

Rules: every equipment `<select>` of the array, protections, cabling and earthing sections lists `equipmentChoiceScope(companyId, <ids saved in this project for that field>)`; an option whose id is not in the library gets the suffix ` (hors bibliothèque)`. Every section action validates submitted equipment ids with the same scope (an id already saved in the project stays accepted, any other id outside the library → the existing `'Un équipement sélectionné est introuvable dans votre bibliothèque.'`).

- [ ] **Step 1: Write the failing tests** — `rejects an inverter outside the library`; `accepts the inverter already saved in the project even if removed from the library`; existing scope expectations updated to `equipmentChoiceScope`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS** (whole apps/web suite).
- [ ] **Step 5: Commit** — `feat(web): project equipment choices come from the installer library`

---

## Acceptance (orchestrator, after Task 11)

Not a coding task. With the dev server and worker running against `dossipv_dev` and the imported catalog published there:

1. The installer agent fills its library from the shared catalogue (first-time setup), imports `D:\mahmoud repo\New folder\facture.webp` through the UI (Playwright), picks a proposal, places the four points, generates.
2. STEG-reviewer agent reads the generated dossier → verdict + reasons per page.
3. Installer agent walks the same flow in the browser → simplicity feedback.
4. Facilitator agent merges code-review, STEG and installer feedback into one prioritised list for the user.

Production steps (migrations, catalog import, purge `--apply`) wait for the user's explicit go-ahead after they see the dry-run lists.
