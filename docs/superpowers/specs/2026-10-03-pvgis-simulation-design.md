# DossiPV — PVGIS Production Simulation Design Spec

## 1. Purpose and scope

Sub-project #7 of the "full application" build: the production simulation that replaces the
PVsyst annex, per the master spec (`docs/superpowers/specs/2026-10-02-dossipv-design.md` §4).

Covers:
- Fetching hourly weather/irradiance data from the real PVGIS API (confirmed live during this
  spec's own research — see §2) for the project's GPS point and tilt/azimuth.
- Running the hourly simulation: plane-of-array irradiance already comes from PVGIS itself
  (not re-derived from scratch — see §2's decision on this), cell temperature, the actual
  module's temperature coefficients, the actual inverter's efficiency, and cable losses
  derived from `@dossipv/engine`'s own existing voltage-drop results.
- Deriving the 8-column monthly table (GlobHor, DiffHor, T_Amb, GlobInc, GlobEff, EArray,
  E_Grid, PR) that mirrors PVsyst's report layout, rendered under the app's own name.
- A validation check against the reference dossier's known PVsyst output — with an important
  caveat found during this spec's own research (§2).

**Explicitly out of scope**: the two charts' actual rendering (normalized production bar
chart, PR bar chart) — this spec covers computing the data those charts need; rendering them
as part of the generated document is sub-project #8's job. The "upload your own PVsyst PDF"
fallback (`Simulation.source = PVSYST_UPLOAD`) already has a schema column
(`ProjectSimulation.source`/`pvsystReportFileId`) from sub-project #1 and needs no new work
here — this spec only builds the `PVGIS_LIVE` computation path.

**Note on how this spec was produced**: written autonomously (user asleep, standing
instruction to keep building using the recommended option at each decision point). Unlike
earlier sub-projects this session, this one required real external research before any design
decision could be made responsibly — PVGIS's exact API contract was not something to guess at.
That research is documented in §2 with the actual confirmed API responses, not assumptions.

## 2. PVGIS API — confirmed by live requests during this spec's research

**Base URL**: `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc` — free, no API key, confirmed
reachable and returning real data for a Tunisia coordinate during this spec's own research.

**Query parameters used by this app**:
- `lat`, `lon` — the project's `ProjectSite.gpsLat`/`gpsLon`.
- `angle` — the project's `ProjectSite.tiltDeg`.
- `aspect` — the project's `ProjectSite.azimuthDeg`, passed through with **no conversion**:
  confirmed by reading `pv_dossier_input_schema.json` directly (`azimuthDeg`'s own
  `x-notes`: "PVsyst convention: 0 = South, -90 = East, +90 = West") against PVGIS's own
  documented `aspect` convention (0=south, -90=east, +90=west, confirmed via this spec's own
  research in the paragraph above) — the two conventions are identical, not merely similar.
- `pvcalculation=1`, `peakpower` (project's total DC array power, kWp), `loss` (a placeholder
  system-loss percentage PVGIS itself applies — **this app does NOT use PVGIS's own `P`
  (power) output figure**, since the whole point of this sub-project is computing power from
  the engine's own module/inverter/cable-loss chain, not PVGIS's generic loss assumption; `P`
  is fetched anyway as a sanity-check cross-reference, never as the dossier's reported figure).
- `components=1` — returns `Gb(i)`, `Gd(i)`, `Gr(i)` (beam/diffuse/reflected **in-plane**
  irradiance, confirmed live) instead of only the combined `G(i)`.
- `startyear`/`endyear` — both set to a single representative year (see §2's decision on
  which year) rather than a multi-year average, since the spec calls for "a typical-year
  hourly weather dataset," and PVGIS's own `raddatabase` default already reflects a long-term
  typical pattern for a single requested year rather than this app needing to average several
  years itself.
- `outputformat=json`.

**Confirmed real response shape** (verified via a live request against `lat=36.8, lon=10.18`
during this spec's research):
```json
{
  "inputs": {
    "location": { "latitude": 36.8, "longitude": 10.18, "elevation": 9.0 },
    "meteo_data": { "radiation_db": "PVGIS-SARAH3", "meteo_db": "ERA5", "year_min": ..., "year_max": ... },
    "mounting_system": { "fixed": { "slope": { "value": 30 }, "azimuth": { "value": 0 } } },
    "pv_module": { "technology": "c-Si", "peak_power": 6.2, "system_loss": 14.0 }
  },
  "outputs": {
    "hourly": [
      { "time": "20200101:0809", "P": 1248.06, "Gb(i)": 113.83, "Gd(i)": 130.93, "Gr(i)": 2.25, "H_sun": 14.9, "T2m": 9.39, "WS10m": 1.93, "Int": 0.0 }
    ]
  }
}
```
`time` format is `YYYYMMDD:HHmm`. **No monthly aggregation is provided by PVGIS itself** — the
8-column PVsyst-style monthly table must be computed by this app from the hourly rows, which
matches the master spec's own wording ("derive the full 8-column monthly table") rather than
assuming PVGIS returns it pre-formatted.

**A second PVGIS call is needed for horizontal-plane irradiance** (`GlobHor`/`DiffHor` in the
monthly table): the same request with `angle=0` instead of the project's real tilt returns
`Gb(i)`/`Gd(i)` for a flat (horizontal) plane, which is what `GlobHor`/`DiffHor` are in a
PVsyst-style report — computing horizontal irradiance by inverting the in-plane transposition
model is a known-hard, error-prone calculation; a second real API call is simpler and exactly
as accurate as PVGIS's own transposition model, which this app already trusts for the in-plane
figures.

## 3. Decisions

- **Two PVGIS calls per simulation**: one at the project's real tilt/azimuth (for `GlobInc`
  and the engine's own power calculation inputs), one at `angle=0` (for `GlobHor`/`DiffHor`).
  Both cached together once fetched (see the master spec's own §5 step 2, "cache PVGIS weather
  data per location") — this spec reuses `ProjectSimulation`'s existing schema shape for the
  summary figures and adds a new cache table rather than re-fetching on every regeneration.
- **New cache table `PvgisWeatherCache`** (new migration): keyed by rounded `(lat, lon, tilt,
  azimuth, year)` to a stored JSON blob of both PVGIS responses, with a `fetchedAt` timestamp.
  PVGIS's own data for a fixed historical year never changes, so this cache has no expiry —
  once fetched for a given location/configuration, it is reused forever. A new project at the
  same site (common — one roof can host multiple project revisions across one subscription's
  renewal cycle) never re-fetches.
- **New pure calculation module in `@dossipv/engine`**, not in the worker: `pvgis-simulation.ts`
  exporting `aggregateMonthlyIrradiance(hourlyRows)` (pure, no I/O — groups PVGIS's hourly rows
  by calendar month, no network calls) and `computeMonthlySimulationTable(...)` (pure,
  combines the aggregated irradiance with the engine's own module/inverter/cable-loss
  functions to produce the final 8 columns + the two chart datasets as plain arrays). The
  actual PVGIS HTTP fetch itself lives in a new `@dossipv/pvgis-client` package (I/O,
  therefore NOT inside the dependency-free `@dossipv/engine`, matching that package's own
  established no-I/O rule from sub-project #1's design) — `@dossipv/pvgis-client` depends on
  nothing but `fetch` and exports one function, `fetchPvgisHourlyData(lat, lon, tiltDeg,
  azimuthDeg, year): Promise<PvgisHourlyRow[]>`.
- **Representative year**: 2020 — the most recent full year PVGIS's SARAH3 database reliably
  covers as of this research (confirmed reachable live), and using a single fixed year
  (rather than, say, "the most recent year" computed dynamically) means the cache key is
  stable and the simulation is reproducible across regenerations, matching the master spec's
  §5 "regenerating reuses saved text/data unless explicitly requested" principle extended to
  simulation data too.
- **Cell temperature, module temp coefficients, inverter efficiency, and cable losses all
  reuse `@dossipv/engine`'s own existing exported functions** (module-electrical.ts's
  temperature-correction functions, and the cabling/voltage-drop functions already built in
  sub-project #1) — this sub-project does not reimplement any of that math, only chains it
  together per-hour against PVGIS's irradiance/temperature series. `EArray` (DC output, before
  inverter) uses the module's `tempCoeffPmaxPct` at the PVGIS-supplied `T2m` (ambient) plus a
  standard cell-temperature-rise-above-ambient model (`T_cell = T2m + irradiance/800 ×
  (NOCT - 20)`, the standard, widely-used NOCT-based approximation — flagged as a new formula
  this sub-project introduces, not one `pv_dossier_input_schema.json` already specifies, since
  that schema has no NOCT field on `PvModule` at all; see §7's open item on this gap).
- **Validation against the reference dossier is NOT a direct "does it equal 4,760 kWh/year"
  assertion** — a real discrepancy found during this spec's own research: the master spec's
  §4 step 4 says to validate "against the reference dossier's PVsyst result (4,760 kWh/year at
  PVsyst's coordinates)," but the reference dossier's own GPS value was one of the 7 errors
  this project already found and fixed (PVsyst's report used `34.83°N`, which the engine's own
  test fixture — `packages/engine/test/fixtures/habib-khedhira.ts` — corrects to the real site
  GPS `36.5606°N, 10.5272°E`). The 4,760 kWh/year figure was PVsyst's own output **at the
  wrong coordinates**, so asserting this app's simulation produces exactly that number at the
  *corrected* coordinates would be asserting the wrong thing — a different latitude gets
  different irradiance and a genuinely different (not equal) annual yield. This sub-project's
  validation instead: (a) runs the real PVGIS-backed simulation at the fixture's corrected GPS
  and the fixture's real tilt/module/inverter, (b) asserts the result lands within a generous
  ±15% band of 4,760 kWh/year (a sanity check that the whole pipeline produces a plausible
  same-order-of-magnitude annual yield for a system of this size and climate, not an exact
  match) — **and (c) documents this discrepancy explicitly in the test file's own comment**,
  so a future reader understands why this isn't an exact-match assertion rather than assuming
  the test is weak or wrong.

## 4. Package structure

```
packages/pvgis-client/          — new package
  src/
    index.ts                      — fetchPvgisHourlyData()
    types.ts                      — PvgisHourlyRow, PvgisFetchResult

packages/engine/src/
  pvgis-simulation.ts            — aggregateMonthlyIrradiance(), computeMonthlySimulationTable()
                                    (pure — no network, no DB)

packages/db/prisma/schema.prisma  — new model PvgisWeatherCache (migration)

packages/dossier-worker/src/       — (existing package from sub-project #4's own earlier work)
  run-simulation.ts               — new: orchestrates cache lookup → fetchPvgisHourlyData (on
                                     miss) → computeMonthlySimulationTable → writes
                                     ProjectSimulation summary fields
```

## 5. Monthly table and chart data shapes

```ts
export interface MonthlySimulationRow {
  month: number; // 1-12
  globHorKWhM2: number;   // GlobHor
  diffHorKWhM2: number;   // DiffHor
  ambientTempC: number;   // T_Amb (mean)
  globIncKWhM2: number;   // GlobInc
  globEffKWhM2: number;   // GlobEff (after angle-of-incidence + soiling-equivalent loss already
                           // baked into PVGIS's own in-plane figure — this app does not add a
                           // second AOI correction on top of PVGIS's own)
  eArrayKWh: number;      // EArray (DC array output)
  eGridKWh: number;       // E_Grid (AC output after inverter + cable losses)
  prPct: number;          // Performance Ratio
}

export interface SimulationChartData {
  monthly: MonthlySimulationRow[];
  normalizedProductionPerKWp: number[]; // one value per month, EArray or E_Grid / installed kWp
  performanceRatioPct: number[];        // one value per month, same as monthly[].prPct
}
```

`computeMonthlySimulationTable` returns both the monthly rows (for the table) and the chart
data (derived from the same rows, not recomputed independently) in one call, so the table and
charts can never disagree with each other.

## 6. Testing

- `aggregateMonthlyIrradiance`/`computeMonthlySimulationTable`: pure functions, tested the same
  way every other `@dossipv/engine` calculation is — hand-computable small fixtures (e.g. a
  synthetic 2-day hourly dataset with known irradiance values, asserting the monthly sum lands
  on the hand-computed expected figure) plus the reference-dossier sanity-band check from §3.
- `fetchPvgisHourlyData` in `@dossipv/pvgis-client`: this is the one function in this
  sub-project that makes a real network call. Unit tests mock `fetch` (the same honest-caveat
  pattern as every Server Action test this session mocking `next/headers`) to assert the
  correct query string is built from given inputs and that a non-200 response throws a typed
  error; a SEPARATE live-verification step (per the implementation plan's own final task,
  matching every prior sub-project's pattern) makes one real call against the actual PVGIS API
  to prove the integration genuinely works end to end, not just against a mock.
- `PvgisWeatherCache` read/write: tested against the real database (same pattern as
  `@dossipv/db`'s own correctness proof — a real migration + real round-trip, not a mock).

## 7. Open items for the implementation plan to resolve

- **No NOCT (nominal operating cell temperature) field exists on `PvModule`** — the cell-
  temperature-rise model in §3 needs one. The plan should add it as a new optional
  `Float?` column (defaulting to the datasheet-typical 45°C when absent, a standard assumption
  for crystalline-silicon modules, rather than blocking the whole feature on requiring every
  existing module record to supply a real value immediately).
