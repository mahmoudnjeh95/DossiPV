# PVGIS Production Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real PVGIS-backed production simulation: a new `@dossipv/pvgis-client`
package fetching live hourly weather data, a new pure `pvgis-simulation.ts` module in
`@dossipv/engine` deriving the 8-column PVsyst-style monthly table and chart data from it, a
`PvgisWeatherCache` table so the same location/configuration is never re-fetched, and a
`noctC` field on `PvModule` for the cell-temperature model.

**Architecture:** Network I/O (`fetchPvgisHourlyData`) lives in its own dependency-light
package, never inside `@dossipv/engine` (which stays dependency-free, matching sub-project
#1's own established rule). All simulation math — monthly aggregation, cell temperature,
module/inverter output, hourly-scaled cable loss — is pure functions in `@dossipv/engine`,
unit-tested with hand-computable fixtures. A new orchestration module in
`@dossipv/dossier-worker` ties cache lookup, the live fetch, and the engine math together.

**Tech Stack:** `fetch` (Node's built-in, no HTTP client dependency needed), `@dossipv/engine`,
`@dossipv/db`, Prisma migration, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-pvgis-simulation-design.md`

## Global Constraints

- PVGIS base URL: `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc` — confirmed live during
  this plan's own spec research, no API key needed.
- `aspect` (PVGIS) and `ProjectSite.azimuthDeg` use the IDENTICAL convention (0=south,
  -90=east, +90=west per `pv_dossier_input_schema.json`'s own `x-notes` on `azimuthDeg`,
  confirmed against PVGIS's documented `aspect` convention) — pass the value through with NO
  sign flip or offset. A task that adds a conversion here is wrong; flag it in review.
- Two PVGIS calls per simulation: one at the project's real `tiltDeg`/`azimuthDeg` (for
  `GlobInc` and the power-chain inputs), one at `angle=0` (for `GlobHor`/`DiffHor`) — both
  results cached together under one `PvgisWeatherCache` row.
- The representative year is a fixed constant, `2020` — not computed dynamically — so the
  cache key is stable and a regeneration reuses the exact same cached data.
- Cable loss in the hourly simulation scales as `designPct × (hourlyIrradianceWM2 / 1000)²`
  off the EXISTING `duDcPct`/`duAcPct` design-time percentage (physically correct: resistive
  I²R loss scales with current², and current scales roughly linearly with irradiance ratio
  against the 1000 W/m² STC reference) — never apply the flat design-max percentage uniformly
  across every hour.
- `noctC` on `PvModule` is a new OPTIONAL `Float?` column defaulting to `45` (a standard
  crystalline-silicon NOCT assumption) when absent in the engine's own calculation code — do
  NOT make this column required or force a backfill of existing rows; absence is a valid,
  handled case.
- `PvModule.tempCoeffPmaxPct` (not `tempCoeffVocPct`) is the coefficient for the Pmax-at-
  cell-temperature calculation — this exact substitution error was the reference dossier's
  own Vmp-correction bug from an earlier sub-project; do not repeat the pattern here.

## Review Focus

- **The reference-dossier validation test must NOT assert an exact match to 4,760 kWh/year**
  — the spec's own §3 documents why that figure was computed at the wrong (pre-correction)
  GPS coordinate. A task that writes `expect(annualKWh).toBe(4760)` or similarly exact is
  wrong regardless of whether it happens to pass; the test must assert a plausibility band
  (±15%) and its own comment must state why, matching the spec's own wording.
- **`fetchPvgisHourlyData` must handle a non-200 PVGIS response** (rate limiting, an invalid
  coordinate, a transient outage) by throwing a typed, catchable error — not by returning
  `undefined`/an empty array that downstream code silently treats as "zero production."
- **The cache lookup key must round `lat`/`lon` to a fixed precision** (e.g. 4 decimal places,
  ~11m) before using it as a cache key — two requests for GPS points that differ only in the
  12th decimal place (floating-point noise, not a real different location) must hit the same
  cache row, not silently create a new PVGIS fetch for what is practically the same site.
- **A module missing `tempCoeffVmpPct` AND with `noctC` absent must still produce a sane
  simulation result**, not `NaN` propagating silently through every hour — both optional-field
  fallback paths need their own test with neither field present.
- **`aggregateMonthlyIrradiance` must correctly bucket an hourly row whose `time` string
  crosses a month boundary at the exact last hour of a month** (e.g. `20200131:2309`) into
  January, not February — a date-parsing off-by-one here would silently misattribute a whole
  month's worth of late-December-style boundary hours.

---

## Task 1: Add `noctC` to `PvModule`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/engine/src/types.ts`
- Create: a new Prisma migration

**Interfaces:**
- Produces: `PvModule.noctC: Float?`, `PvModuleInput.noctC?: number` — consumed by Task 3's
  cell-temperature calculation.

- [ ] **Step 1: Add the field to the schema**

In `packages/db/prisma/schema.prisma`, inside `model PvModule`, add after `widthMm`:

```prisma
  noctC                 Float?
```

- [ ] **Step 2: Generate the migration**

Run (from `packages/db`): `npx prisma migrate dev --name add_pv_module_noct`
Expected: a new migration directory adding one nullable column — no backfill prompt, since
the column is optional.

- [ ] **Step 3: Regenerate the Prisma client**

Run (from `packages/db`): `npx prisma generate`
Expected: no errors.

- [ ] **Step 4: Add the field to the engine's own module type**

In `packages/engine/src/types.ts`, inside `PvModuleInput`, add after `weightKg: number;`:

```ts
  /** Nominal Operating Cell Temperature, °C. Optional — defaults to 45 (standard crystalline-
   * silicon assumption) in the engine's own cell-temperature calculation when absent. */
  noctC?: number;
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/engine/src/types.ts
git commit -m "feat(db,engine): add optional noctC field to PvModule for cell-temperature modeling"
```

---

## Task 2: `@dossipv/pvgis-client` package

**Files:**
- Create: `packages/pvgis-client/package.json`
- Create: `packages/pvgis-client/tsconfig.json`
- Create: `packages/pvgis-client/src/types.ts`
- Create: `packages/pvgis-client/src/index.ts`
- Create: `packages/pvgis-client/test/index.test.ts`
- Modify: `tsconfig.json` (root) — add a reference to the new package
- Modify: `package-lock.json` (via `npm install`)

**Interfaces:**
- Produces: `fetchPvgisHourlyData(lat, lon, tiltDeg, azimuthDeg, year): Promise<PvgisHourlyRow[]>`,
  `PvgisHourlyRow`, `PvgisFetchError` — consumed by Task 5's worker orchestration module.

- [ ] **Step 1: Scaffold the package**

```json
// packages/pvgis-client/package.json
{
  "name": "@dossipv/pvgis-client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "@types/node": "^22.0.0" }
}
```

```json
// packages/pvgis-client/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*.ts"]
}
```

(No `references` array — matching the established pattern from every prior sub-project's
own package scaffolding this session, since sibling packages don't set `composite: true`.)

Add `"packages/pvgis-client"` to the root `tsconfig.json`'s `references` array.

- [ ] **Step 2: Write the types**

```ts
// packages/pvgis-client/src/types.ts
export interface PvgisHourlyRow {
  time: string; // "YYYYMMDD:HHmm"
  beamWM2: number; // Gb(i)
  diffuseWM2: number; // Gd(i)
  reflectedWM2: number; // Gr(i)
  ambientTempC: number; // T2m
}

/** Total in-plane irradiance for one hour — beam + diffuse + reflected. */
export function totalIrradianceWM2(row: Pick<PvgisHourlyRow, 'beamWM2' | 'diffuseWM2' | 'reflectedWM2'>): number {
  return row.beamWM2 + row.diffuseWM2 + row.reflectedWM2;
}

export class PvgisFetchError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PvgisFetchError';
  }
}
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/pvgis-client/test/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPvgisHourlyData } from '../src/index';
import { PvgisFetchError } from '../src/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchPvgisHourlyData', () => {
  it('builds the correct query string and maps the response to PvgisHourlyRow[]', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        outputs: {
          hourly: [
            { time: '20200101:0809', 'Gb(i)': 100, 'Gd(i)': 50, 'Gr(i)': 2, T2m: 9.0 },
            { time: '20200101:0909', 'Gb(i)': 200, 'Gd(i)': 60, 'Gr(i)': 3, T2m: 10.5 },
          ],
        },
      }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const rows = await fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020);

    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://re.jrc.ec.europa.eu/api/v5_3/seriescalc');
    expect(calledUrl.searchParams.get('lat')).toBe('36.8');
    expect(calledUrl.searchParams.get('lon')).toBe('10.18');
    expect(calledUrl.searchParams.get('angle')).toBe('30');
    expect(calledUrl.searchParams.get('aspect')).toBe('-10');
    expect(calledUrl.searchParams.get('startyear')).toBe('2020');
    expect(calledUrl.searchParams.get('endyear')).toBe('2020');
    expect(calledUrl.searchParams.get('components')).toBe('1');
    expect(calledUrl.searchParams.get('outputformat')).toBe('json');

    expect(rows).toEqual([
      { time: '20200101:0809', beamWM2: 100, diffuseWM2: 50, reflectedWM2: 2, ambientTempC: 9.0 },
      { time: '20200101:0909', beamWM2: 200, diffuseWM2: 60, reflectedWM2: 3, ambientTempC: 10.5 },
    ]);
  });

  it('throws PvgisFetchError on a non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;

    await expect(fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020)).rejects.toThrow(PvgisFetchError);
  });

  it('throws PvgisFetchError when the response has no outputs.hourly array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as unknown as typeof fetch;

    await expect(fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020)).rejects.toThrow(PvgisFetchError);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm install && npm --prefix packages/pvgis-client test`
Expected: FAIL — `Cannot find module '../src/index'`.

- [ ] **Step 5: Implement `index.ts`**

```ts
// packages/pvgis-client/src/index.ts
import { PvgisFetchError, type PvgisHourlyRow } from './types';

const PVGIS_BASE_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc';

interface RawPvgisHourlyRow {
  time: string;
  'Gb(i)': number;
  'Gd(i)': number;
  'Gr(i)': number;
  T2m: number;
}

interface RawPvgisResponse {
  outputs?: {
    hourly?: RawPvgisHourlyRow[];
  };
}

export async function fetchPvgisHourlyData(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
  year: number,
): Promise<PvgisHourlyRow[]> {
  const url = new URL(PVGIS_BASE_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('angle', String(tiltDeg));
  url.searchParams.set('aspect', String(azimuthDeg));
  url.searchParams.set('startyear', String(year));
  url.searchParams.set('endyear', String(year));
  url.searchParams.set('components', '1');
  url.searchParams.set('outputformat', 'json');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new PvgisFetchError(response.status, `PVGIS request failed with status ${response.status}`);
  }

  const data = (await response.json()) as RawPvgisResponse;
  const hourly = data.outputs?.hourly;
  if (!hourly) {
    throw new PvgisFetchError(response.status, 'PVGIS response is missing outputs.hourly');
  }

  return hourly.map((row) => ({
    time: row.time,
    beamWM2: row['Gb(i)'],
    diffuseWM2: row['Gd(i)'],
    reflectedWM2: row['Gr(i)'],
    ambientTempC: row.T2m,
  }));
}

export * from './types';
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm --prefix packages/pvgis-client test`
Expected: PASS, all 3 tests green.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/pvgis-client tsconfig.json package-lock.json
git commit -m "feat(pvgis-client): add PVGIS seriescalc HTTP client package"
```

---

## Task 3: Monthly simulation math in `@dossipv/engine`

**Files:**
- Create: `packages/engine/src/pvgis-simulation.ts`
- Create: `packages/engine/test/pvgis-simulation.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `PvgisHourlyRow` from `@dossipv/pvgis-client` (type-only import — the engine stays
  dependency-free at runtime, importing only the type, never the fetch function), `PvModuleInput`
  from `./types`, `resolveVmpTempCoeff`-style pattern (new sibling function
  `pmaxAtCellTemp`), `duDcPct`/`duAcPct` from `./cabling`.
- Produces: `aggregateMonthlyIrradiance(hourlyRows, horizontalHourlyRows):
  MonthlyIrradianceAggregate[]`, `computeMonthlySimulationTable(...)` — consumed by Task 5's
  worker orchestration module.

- [ ] **Step 1: Write the failing tests for monthly aggregation**

```ts
// packages/engine/test/pvgis-simulation.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateMonthlyIrradiance, computeMonthlySimulationTable, pmaxAtCellTemp } from '../src/pvgis-simulation';
import type { PvgisHourlyRow } from '@dossipv/pvgis-client';

/** Test helper — beamWM2/diffuseWM2 split chosen so (beam+diffuse+reflected) matches each
 * call site's previous "total irradiance" figure, and diffuseWM2 is independently assertable. */
function row(time: string, beamWM2: number, diffuseWM2: number, ambientTempC: number): PvgisHourlyRow {
  return { time, beamWM2, diffuseWM2, reflectedWM2: 0, ambientTempC };
}

describe('aggregateMonthlyIrradiance', () => {
  it('sums in-plane irradiance into kWh/m2 per month and averages ambient temperature', () => {
    const inPlane: PvgisHourlyRow[] = [
      row('20200101:0809', 80, 20, 9.0),
      row('20200101:0909', 160, 40, 10.0),
      row('20200201:0809', 40, 10, 5.0),
    ];
    const horizontal: PvgisHourlyRow[] = [
      row('20200101:0809', 60, 20, 9.0),
      row('20200101:0909', 120, 30, 10.0),
      row('20200201:0809', 30, 10, 5.0),
    ];

    const result = aggregateMonthlyIrradiance(inPlane, horizontal);

    const jan = result.find((r) => r.month === 1)!;
    expect(jan.globIncKWhM2).toBeCloseTo((100 + 200) / 1000, 5);
    expect(jan.globHorKWhM2).toBeCloseTo((80 + 150) / 1000, 5);
    expect(jan.diffHorKWhM2).toBeCloseTo((20 + 30) / 1000, 5);
    expect(jan.ambientTempC).toBeCloseTo(9.5, 5);

    const feb = result.find((r) => r.month === 2)!;
    expect(feb.globIncKWhM2).toBeCloseTo(50 / 1000, 5);
  });

  it('buckets the last hour of a month correctly, not into the next month', () => {
    const lastHourOfJanuary = row('20200131:2309', 8, 2, 5.0);
    const firstHourOfFebruary = row('20200201:0009', 4, 1, 4.0);

    const result = aggregateMonthlyIrradiance([lastHourOfJanuary, firstHourOfFebruary], [lastHourOfJanuary, firstHourOfFebruary]);

    const jan = result.find((r) => r.month === 1)!;
    const feb = result.find((r) => r.month === 2)!;
    expect(jan.globIncKWhM2).toBeCloseTo(10 / 1000, 5);
    expect(feb.globIncKWhM2).toBeCloseTo(5 / 1000, 5);
  });
});

describe('pmaxAtCellTemp', () => {
  it('derates Pmax at a cell temperature above 25C using tempCoeffPmaxPct', () => {
    const module = {
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
    };

    const result = pmaxAtCellTemp(module, 45);

    // 620 * (1 + (-0.28/100) * (45-25)) = 620 * (1 - 0.056) = 620 * 0.944
    expect(result).toBeCloseTo(620 * 0.944, 2);
  });
});

describe('computeMonthlySimulationTable', () => {
  const module = {
    pmaxW: 620, vmpV: 46.5, impA: 13.33, vocV: 55.9, iscA: 13.92,
    tempCoeffVocPct: -0.25, tempCoeffIscPct: 0.045, tempCoeffPmaxPct: -0.28,
    irmA: 25, maxSystemVoltageV: 1500, lengthMm: 2278, widthMm: 1134, weightKg: 33.5,
  };

  it('produces one row per month present in the data with all 8 columns populated', () => {
    const inPlane: PvgisHourlyRow[] = [row('20200101:1200', 640, 160, 20)];
    const horizontal: PvgisHourlyRow[] = [row('20200101:1200', 480, 120, 20)];

    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane,
      horizontalHourly: horizontal,
      module,
      moduleCount: 20,
      installedKWp: 12.4,
      dcVoltageDropPct: 1.5,
      acVoltageDropPct: 1.0,
    });

    expect(result.monthly).toHaveLength(1);
    const jan = result.monthly[0]!;
    expect(jan.month).toBe(1);
    expect(jan.globHorKWhM2).toBeGreaterThan(0);
    expect(jan.diffHorKWhM2).toBeGreaterThan(0);
    expect(jan.diffHorKWhM2).toBeLessThan(jan.globHorKWhM2); // diffuse is a component of the total, never exceeds it
    expect(jan.globIncKWhM2).toBeGreaterThan(0);
    expect(jan.ambientTempC).toBe(20);
    expect(jan.eArrayKWh).toBeGreaterThan(0);
    expect(jan.eGridKWh).toBeGreaterThan(0);
    expect(jan.eGridKWh).toBeLessThan(jan.eArrayKWh); // cable losses reduce AC output below DC array output
    expect(jan.prPct).toBeGreaterThan(0);
    expect(jan.prPct).toBeLessThanOrEqual(100);
  });

  it('scales cable loss by the hourly irradiance ratio, not a flat design-max percentage', () => {
    // Two otherwise-identical hours, one at full STC irradiance, one at half — the ABSOLUTE
    // cable loss (not just the percentage) at half irradiance must be well below a quarter of
    // the full-irradiance loss's own contribution, proving the (G/1000)^2 scaling is applied
    // per hour rather than as one flat percentage of whatever output each hour happens to have.
    const fullSun: PvgisHourlyRow[] = [row('20200101:1200', 800, 200, 25)];
    const halfSun: PvgisHourlyRow[] = [row('20200101:1200', 400, 100, 25)];

    const fullResult = computeMonthlySimulationTable({
      inPlaneHourly: fullSun, horizontalHourly: fullSun, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0,
    });
    const halfResult = computeMonthlySimulationTable({
      inPlaneHourly: halfSun, horizontalHourly: halfSun, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0,
    });

    const fullLossKWh = fullResult.monthly[0]!.eArrayKWh - fullResult.monthly[0]!.eGridKWh;
    const halfLossKWh = halfResult.monthly[0]!.eArrayKWh - halfResult.monthly[0]!.eGridKWh;

    // Loss scales with (ratio)^2 * (output which itself scales ~linearly with irradiance) —
    // so loss at half irradiance should be well under 1/4 of full-irradiance loss, not 1/2.
    expect(halfLossKWh).toBeLessThan(fullLossKWh / 3);
  });

  it('uses the default NOCT of 45C when the module has no noctC field', () => {
    const inPlane: PvgisHourlyRow[] = [row('20200101:1200', 640, 160, 20)];
    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane, horizontalHourly: inPlane, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0,
    });
    expect(Number.isNaN(result.monthly[0]!.eArrayKWh)).toBe(false);
  });

  it('returns chart data derived from the same monthly rows, never independently computed', () => {
    const inPlane: PvgisHourlyRow[] = [row('20200101:1200', 640, 160, 20), row('20200601:1200', 720, 180, 30)];
    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane, horizontalHourly: inPlane, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0,
    });

    expect(result.normalizedProductionPerKWp).toHaveLength(result.monthly.length);
    expect(result.performanceRatioPct).toEqual(result.monthly.map((m) => m.prPct));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix packages/engine test -- test/pvgis-simulation.test.ts`
Expected: FAIL — `Cannot find module '../src/pvgis-simulation'`.

- [ ] **Step 3: Implement `pvgis-simulation.ts`**

```ts
// packages/engine/src/pvgis-simulation.ts
import { totalIrradianceWM2, type PvgisHourlyRow } from '@dossipv/pvgis-client';
import type { PvModuleInput } from './types';

const DEFAULT_NOCT_C = 45;
const STC_IRRADIANCE_WM2 = 1000;
const NOCT_IRRADIANCE_WM2 = 800;
const NOCT_AMBIENT_C = 20;

export function cellTempFromIrradiance(ambientTempC: number, irradianceWM2: number, noctC: number | undefined): number {
  const resolvedNoct = noctC ?? DEFAULT_NOCT_C;
  const noctRiseC = resolvedNoct - NOCT_AMBIENT_C;
  return ambientTempC + (irradianceWM2 / NOCT_IRRADIANCE_WM2) * noctRiseC;
}

export function pmaxAtCellTemp(module: PvModuleInput, cellTempC: number): number {
  return module.pmaxW * (1 + (module.tempCoeffPmaxPct / 100) * (cellTempC - 25));
}

export interface MonthlyIrradianceAggregate {
  month: number;
  globHorKWhM2: number;
  diffHorKWhM2: number;
  globIncKWhM2: number;
  ambientTempC: number;
  hourlyInPlane: PvgisHourlyRow[];
}

function monthFromTime(time: string): number {
  return Number(time.slice(4, 6));
}

export function aggregateMonthlyIrradiance(
  inPlaneHourly: PvgisHourlyRow[],
  horizontalHourly: PvgisHourlyRow[],
): MonthlyIrradianceAggregate[] {
  const months = new Map<
    number,
    { globHorWh: number; diffHorWh: number; globIncWh: number; tempSum: number; count: number; hourlyInPlane: PvgisHourlyRow[] }
  >();

  for (const row of inPlaneHourly) {
    const month = monthFromTime(row.time);
    const bucket = months.get(month) ?? { globHorWh: 0, diffHorWh: 0, globIncWh: 0, tempSum: 0, count: 0, hourlyInPlane: [] };
    bucket.globIncWh += totalIrradianceWM2(row);
    bucket.tempSum += row.ambientTempC;
    bucket.count += 1;
    bucket.hourlyInPlane.push(row);
    months.set(month, bucket);
  }

  for (const row of horizontalHourly) {
    const month = monthFromTime(row.time);
    const bucket = months.get(month);
    if (bucket) {
      bucket.globHorWh += totalIrradianceWM2(row);
      bucket.diffHorWh += row.diffuseWM2;
    }
  }

  return Array.from(months.entries())
    .map(([month, bucket]) => ({
      month,
      globHorKWhM2: bucket.globHorWh / 1000,
      diffHorKWhM2: bucket.diffHorWh / 1000,
      globIncKWhM2: bucket.globIncWh / 1000,
      ambientTempC: bucket.tempSum / bucket.count,
      hourlyInPlane: bucket.hourlyInPlane,
    }))
    .sort((a, b) => a.month - b.month);
}

export interface MonthlySimulationRow {
  month: number;
  globHorKWhM2: number;
  diffHorKWhM2: number;
  ambientTempC: number;
  globIncKWhM2: number;
  globEffKWhM2: number;
  eArrayKWh: number;
  eGridKWh: number;
  prPct: number;
}

export interface SimulationChartData {
  monthly: MonthlySimulationRow[];
  normalizedProductionPerKWp: number[];
  performanceRatioPct: number[];
}

export interface ComputeMonthlySimulationTableInput {
  inPlaneHourly: PvgisHourlyRow[];
  horizontalHourly: PvgisHourlyRow[];
  module: PvModuleInput;
  moduleCount: number;
  installedKWp: number;
  dcVoltageDropPct: number;
  acVoltageDropPct: number;
}

export function computeMonthlySimulationTable(input: ComputeMonthlySimulationTableInput): SimulationChartData {
  const aggregates = aggregateMonthlyIrradiance(input.inPlaneHourly, input.horizontalHourly);

  const monthly: MonthlySimulationRow[] = aggregates.map((aggregate) => {
    let eArrayWh = 0;
    let eGridWh = 0;

    for (const hour of aggregate.hourlyInPlane) {
      const hourIrradianceWM2 = totalIrradianceWM2(hour);
      const cellTempC = cellTempFromIrradiance(hour.ambientTempC, hourIrradianceWM2, input.module.noctC);
      const derateFromStc = pmaxAtCellTemp(input.module, cellTempC) / input.module.pmaxW;
      const irradianceRatio = hourIrradianceWM2 / STC_IRRADIANCE_WM2;
      const hourArrayWh = input.module.pmaxW * input.moduleCount * irradianceRatio * derateFromStc;

      const irradianceRatioSquared = irradianceRatio * irradianceRatio;
      const dcLossFraction = (input.dcVoltageDropPct / 100) * irradianceRatioSquared;
      const acLossFraction = (input.acVoltageDropPct / 100) * irradianceRatioSquared;
      const hourGridWh = hourArrayWh * (1 - dcLossFraction) * (1 - acLossFraction);

      eArrayWh += Math.max(0, hourArrayWh);
      eGridWh += Math.max(0, hourGridWh);
    }

    const eArrayKWh = eArrayWh / 1000;
    const eGridKWh = eGridWh / 1000;
    const prPct = input.installedKWp > 0 && aggregate.globIncKWhM2 > 0
      ? (eGridKWh / (input.installedKWp * aggregate.globIncKWhM2)) * 100
      : 0;

    return {
      month: aggregate.month,
      globHorKWhM2: aggregate.globHorKWhM2,
      diffHorKWhM2: aggregate.diffHorKWhM2,
      ambientTempC: aggregate.ambientTempC,
      globIncKWhM2: aggregate.globIncKWhM2,
      globEffKWhM2: aggregate.globIncKWhM2,
      eArrayKWh,
      eGridKWh,
      prPct,
    };
  });

  return {
    monthly,
    normalizedProductionPerKWp: monthly.map((row) => (input.installedKWp > 0 ? row.eGridKWh / input.installedKWp : 0)),
    performanceRatioPct: monthly.map((row) => row.prPct),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix packages/engine test -- test/pvgis-simulation.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Add the barrel export**

```ts
// packages/engine/src/index.ts — add this line among the existing exports
export * from './pvgis-simulation';
```

- [ ] **Step 6: Run the full engine suite**

Run: `npm --prefix packages/engine test`
Expected: PASS, all existing engine tests plus the new ones green.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/pvgis-simulation.ts packages/engine/test/pvgis-simulation.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add PVGIS-driven monthly simulation table computation"
```

---

## Task 4: `PvgisWeatherCache` table

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: a new Prisma migration

**Interfaces:**
- Produces: `PvgisWeatherCache` model (`latRounded`, `lonRounded`, `tiltDeg`, `azimuthDeg`,
  `year`, `inPlaneDataJson`, `horizontalDataJson`, `fetchedAt`) — consumed by Task 5's worker
  orchestration module.

- [ ] **Step 1: Add the model to the schema**

In `packages/db/prisma/schema.prisma`, add a new model (placement: near `ProjectSimulation`):

```prisma
model PvgisWeatherCache {
  id                 String   @id @default(uuid())
  latRounded         Float
  lonRounded         Float
  tiltDeg            Float
  azimuthDeg         Float
  year               Int
  inPlaneDataJson    Json
  horizontalDataJson Json
  fetchedAt          DateTime @default(now())

  @@unique([latRounded, lonRounded, tiltDeg, azimuthDeg, year])
  @@map("pvgis_weather_cache")
}
```

The composite `@@unique` is both the cache lookup key and the natural upsert target —
rounding happens in application code (Task 5), not in the schema itself.

- [ ] **Step 2: Generate the migration**

Run (from `packages/db`): `npx prisma migrate dev --name add_pvgis_weather_cache`
Expected: a new migration creating the table — no prompts, since it's a brand-new table with
no existing rows.

- [ ] **Step 3: Regenerate the Prisma client**

Run (from `packages/db`): `npx prisma generate`
Expected: no errors.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): add PvgisWeatherCache table"
```

---

## Task 5: Worker orchestration — cache lookup, fetch-on-miss, write `ProjectSimulation`

**Files:**
- Create: `packages/dossier-worker/src/run-simulation.ts`
- Create: `packages/dossier-worker/test/run-simulation.test.ts`

**Interfaces:**
- Consumes: `fetchPvgisHourlyData` from `@dossipv/pvgis-client`, `computeMonthlySimulationTable`
  from `@dossipv/engine`, `db` from `@dossipv/db`.
- Produces: `runProductionSimulation(projectId): Promise<SimulationChartData>` — not consumed
  by any other task in this plan (sub-project #8, the document pipeline, is this function's
  future real consumer).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/dossier-worker/test/run-simulation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCacheFindUnique, mockCacheUpsert, mockFetchPvgisHourlyData } = vi.hoisted(() => ({
  mockCacheFindUnique: vi.fn(),
  mockCacheUpsert: vi.fn(),
  mockFetchPvgisHourlyData: vi.fn(),
}));

vi.mock('@dossipv/pvgis-client', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/pvgis-client')>('@dossipv/pvgis-client');
  return { ...actual, fetchPvgisHourlyData: mockFetchPvgisHourlyData };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, pvgisWeatherCache: { findUnique: mockCacheFindUnique, upsert: mockCacheUpsert } } };
});

import { roundForCacheKey } from '../src/run-simulation';

beforeEach(() => {
  mockCacheFindUnique.mockClear();
  mockCacheUpsert.mockClear();
  mockFetchPvgisHourlyData.mockClear();
});

describe('roundForCacheKey', () => {
  it('rounds to 4 decimal places so floating-point noise collapses to the same key', () => {
    expect(roundForCacheKey(36.80000000001)).toBe(roundForCacheKey(36.8));
    expect(roundForCacheKey(36.8001)).not.toBe(roundForCacheKey(36.8002));
  });
});
```

(This task's own test for `roundForCacheKey` is the one piece of pure, directly-unit-testable
logic in this module without needing the real database — the rest of
`runProductionSimulation`'s own cache-hit/cache-miss/real-fetch-on-miss behavior is exercised
by this task's live-verification step against the real database and the real PVGIS API, per
this plan's own established pattern of reserving real-network/real-DB round trips for a
dedicated verification task rather than mocking every layer.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- test/run-simulation.test.ts`
Expected: FAIL — `roundForCacheKey is not exported`.

- [ ] **Step 3: Implement `run-simulation.ts`**

```ts
// packages/dossier-worker/src/run-simulation.ts
import { db } from '@dossipv/db';
import { fetchPvgisHourlyData, type PvgisHourlyRow } from '@dossipv/pvgis-client';
import { computeMonthlySimulationTable, type SimulationChartData } from '@dossipv/engine';

const SIMULATION_YEAR = 2020;
const CACHE_KEY_DECIMAL_PLACES = 4;

export function roundForCacheKey(value: number): number {
  const factor = 10 ** CACHE_KEY_DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
}

async function getOrFetchWeatherData(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
): Promise<{ inPlane: PvgisHourlyRow[]; horizontal: PvgisHourlyRow[] }> {
  const latRounded = roundForCacheKey(lat);
  const lonRounded = roundForCacheKey(lon);

  const cached = await db.pvgisWeatherCache.findUnique({
    where: { latRounded_lonRounded_tiltDeg_azimuthDeg_year: { latRounded, lonRounded, tiltDeg, azimuthDeg, year: SIMULATION_YEAR } },
  });

  if (cached) {
    return {
      inPlane: cached.inPlaneDataJson as unknown as PvgisHourlyRow[],
      horizontal: cached.horizontalDataJson as unknown as PvgisHourlyRow[],
    };
  }

  const [inPlane, horizontal] = await Promise.all([
    fetchPvgisHourlyData(lat, lon, tiltDeg, azimuthDeg, SIMULATION_YEAR),
    fetchPvgisHourlyData(lat, lon, 0, azimuthDeg, SIMULATION_YEAR),
  ]);

  await db.pvgisWeatherCache.upsert({
    where: { latRounded_lonRounded_tiltDeg_azimuthDeg_year: { latRounded, lonRounded, tiltDeg, azimuthDeg, year: SIMULATION_YEAR } },
    create: {
      latRounded,
      lonRounded,
      tiltDeg,
      azimuthDeg,
      year: SIMULATION_YEAR,
      inPlaneDataJson: inPlane as unknown as object,
      horizontalDataJson: horizontal as unknown as object,
    },
    update: {
      inPlaneDataJson: inPlane as unknown as object,
      horizontalDataJson: horizontal as unknown as object,
    },
  });

  return { inPlane, horizontal };
}

export async function runProductionSimulation(projectId: string): Promise<SimulationChartData> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { site: true, arrayConfig: { include: { module: true, inverters: { include: { mppts: true } } } } },
  });

  if (!project.site || !project.arrayConfig) {
    throw new Error(`Project ${projectId} is missing site or array configuration data required for simulation.`);
  }

  const { inPlane, horizontal } = await getOrFetchWeatherData(
    project.site.gpsLat,
    project.site.gpsLon,
    project.site.tiltDeg,
    project.site.azimuthDeg ?? 0,
  );

  const moduleCount = project.arrayConfig.inverters.reduce(
    (total, inverter) => total + inverter.mppts.reduce((mpptTotal, mppt) => mpptTotal + mppt.stringsInParallel * mppt.modulesPerString, 0),
    0,
  );
  const installedKWp = (project.arrayConfig.module.pmaxW * moduleCount) / 1000;

  const result = computeMonthlySimulationTable({
    inPlaneHourly: inPlane,
    horizontalHourly: horizontal,
    module: project.arrayConfig.module,
    moduleCount,
    installedKWp,
    dcVoltageDropPct: 1.5, // placeholder until the engine's own cabling results are threaded through — see this task's own note below
    acVoltageDropPct: 1.0,
  });

  const annualKWh = result.monthly.reduce((sum, row) => sum + row.eGridKWh, 0);
  const annualPrPct = result.monthly.reduce((sum, row) => sum + row.prPct, 0) / result.monthly.length;

  await db.projectSimulation.upsert({
    where: { projectId },
    create: {
      projectId,
      source: 'PVGIS_LIVE',
      annualProductionKWh: annualKWh,
      specificYieldKWhPerKWp: installedKWp > 0 ? annualKWh / installedKWp : 0,
      performanceRatioPct: annualPrPct,
    },
    update: {
      annualProductionKWh: annualKWh,
      specificYieldKWhPerKWp: installedKWp > 0 ? annualKWh / installedKWp : 0,
      performanceRatioPct: annualPrPct,
    },
  });

  return result;
}
```

**Implementer note on the hardcoded `dcVoltageDropPct: 1.5`/`acVoltageDropPct: 1.0`**: these
are placeholders. The spec's §3 says cable loss must derive from "the engine's own voltage-
drop results" — meaning this task should call the project's own real `duDcPct`/`duAcPct`
computation (using the project's actual cable runs, lengths, and sections from
`ProjectCableRun`/`ProjectCablingConfig`, already modeled in sub-project #1's schema) rather
than a flat placeholder. Wiring that up fully requires reading through
`packages/dossier-worker`'s existing `generate-dossier-document.ts` (built in an earlier
sub-project) to see how it already assembles the engine's cabling inputs from a `Project`
record, and reusing that same assembly here. This plan's own scope stops at using a
placeholder value and flagging it explicitly — matching this plan's own Review Focus
principle of never silently shipping less than the spec without saying so — rather than
guessing at the cable-run assembly logic without having read the real existing code for it
first. The live-verification task (Task 6) must re-confirm this placeholder is still present
and ledger it as an explicit, acknowledged gap for a follow-up pass, not silently resolved by
this plan.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix packages/dossier-worker test -- test/run-simulation.test.ts`
Expected: PASS, the one test green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/dossier-worker/src/run-simulation.ts packages/dossier-worker/test/run-simulation.test.ts
git commit -m "feat(dossier-worker): add PVGIS-backed production simulation orchestration"
```

---

## Task 6: Reference-dossier validation test and live verification

**Files:**
- Create: `packages/engine/test/pvgis-simulation-reference-dossier.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Confirm the SSH tunnel to Postgres is active**

Run: `node -e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);}); s.setTimeout(3000,()=>{console.error('TUNNEL DOWN: timeout');process.exit(1);});"`
Expected: `tunnel alive`.

- [ ] **Step 2: Write the reference-dossier plausibility-band test**

Read `packages/engine/test/fixtures/habib-khedhira.ts` first to get its real module/inverter/
GPS/tilt values — do not re-derive them from memory. This test makes a REAL PVGIS API call
(no mock), matching this plan's own established pattern of a dedicated real-network check
separate from the mocked unit tests.

```ts
// packages/engine/test/pvgis-simulation-reference-dossier.test.ts
import { describe, it, expect } from 'vitest';
import { fetchPvgisHourlyData } from '@dossipv/pvgis-client';
import { computeMonthlySimulationTable } from '../src/pvgis-simulation';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira'; // adjust the import to this fixture's real exported name

/**
 * Validates the simulation pipeline's plausibility, not an exact match. The master design
 * spec names 4,760 kWh/year as the reference dossier's own PVsyst figure, but that figure was
 * computed at PVsyst's own GPS reading (34.83 deg N), which this project's own reference
 * fixture already corrects to the real site coordinate (36.5606 deg N) — one of the 7 known
 * errors fixed in an earlier sub-project. A different latitude genuinely receives different
 * annual irradiance, so asserting an exact match at the corrected coordinate would be
 * asserting the wrong thing. This test instead checks the result lands within a generous +/-
 * 15% band of 4,760 kWh/year, as a sanity check that the whole real PVGIS-backed pipeline
 * produces a plausible, same-order-of-magnitude annual yield for a system of this size and
 * climate — not a proof of numerical equivalence to the original (differently-sited) report.
 */
describe('production simulation — reference dossier plausibility check', () => {
  it('produces an annual yield within +/-15% of the reference dossier\'s 4,760 kWh/year figure, at the CORRECTED GPS', async () => {
    // Fill in with the fixture's real module/tilt/moduleCount/installedKWp values.
    const [inPlane, horizontal] = await Promise.all([
      fetchPvgisHourlyData(36.5606, 10.5272, 30, 0, 2020),
      fetchPvgisHourlyData(36.5606, 10.5272, 0, 0, 2020),
    ]);

    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane,
      horizontalHourly: horizontal,
      module: habibKhedhiraFixture.module, // adjust to the fixture's real shape
      moduleCount: habibKhedhiraFixture.moduleCount,
      installedKWp: habibKhedhiraFixture.installedKWp,
      dcVoltageDropPct: 1.5,
      acVoltageDropPct: 1.0,
    });

    const annualKWh = result.monthly.reduce((sum, row) => sum + row.eGridKWh, 0);

    expect(annualKWh).toBeGreaterThan(4760 * 0.85);
    expect(annualKWh).toBeLessThan(4760 * 1.15);
  }, 30_000); // real network call — generous timeout, not a hang
});
```

- [ ] **Step 3: Run it to verify it passes against the real PVGIS API**

Run: `npm --prefix packages/engine test -- test/pvgis-simulation-reference-dossier.test.ts`
Expected: PASS. If the result falls outside the ±15% band, this is a genuine finding — use
`systematic-debugging`, not a wider band, to find the real cause (a likely candidate: the
hardcoded `dcVoltageDropPct`/`acVoltageDropPct` placeholders from Task 5 not matching this
specific reference project's real cable configuration — ledger this as a known limitation if
investigation confirms that's the cause, rather than silently loosening the assertion to make
it pass).

- [ ] **Step 4: Verify the cache actually prevents a second PVGIS call for the same location**

Write and run a one-off `npx tsx` script (from the repo root, delete immediately after) that
calls `runProductionSimulation` twice in a row for the same real project id, with a console
log or a wrapped fetch counter proving the second call hits the cache (one real PVGIS network
round trip total, not two).

- [ ] **Step 5: Run the full workspace suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS.

- [ ] **Step 6: Confirm no stray verification script was committed**

Run: `git status --porcelain` — expect empty.

- [ ] **Step 7: Update project memory**

Update `C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
recording: the new `@dossipv/pvgis-client` package, the engine's new simulation math, the
cache table, and — critically — the acknowledged placeholder cable-loss percentages from
Task 5 that still need to be wired to the project's real cabling data in a follow-up pass
(do not let this detail get lost; it is a real, deliberate scope boundary, not an oversight).

- [ ] **Step 8: Final commit if Step 4 or the reference-dossier test's own investigation found anything to fix**

```bash
git add -A
git commit -m "fix(pvgis): close a gap found in the production simulation's final review"
```

(Skip entirely if nothing was found.)
