# Map Provider & Map Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lengthMm`/`widthMm` to `PvModule`, build the panel-row-placement geometry
functions in `@dossipv/engine`, and build the map editor page (Leaflet + Esri World Imagery,
polygon drawing, pin placement, panel auto-fill, save action) under `apps/web/app/(app)/
projects/[id]/map`.

**Architecture:** A pure geometry module in `@dossipv/engine` (no I/O, same pattern as every
other calculation in that package) computes row spacing and panel placement. The map editor
page is a Server Component that loads project data and passes it to a Client Component
(`map-editor.tsx`) rendering the actual Leaflet map; a single Server Action persists the whole
edited state on an explicit save, not per-drag.

**Tech Stack:** `leaflet` + `react-leaflet` v5 (React 19-compatible), `@dossipv/engine`,
`@dossipv/auth`, `@dossipv/db`, Prisma migration, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-map-provider-and-editor-design.md`

## Global Constraints

- `PvModule.lengthMm`/`widthMm` are required `Float` fields (not optional) — matching
  `pv_dossier_input_schema.json`'s own `required` array for a module. Every existing seeded
  `PvModule` row needs a real value supplied by the migration (not a nullable column with a
  backfill-later plan), since `prisma migrate dev` will prompt for a default/backfill strategy
  on a required-column addition to a table with existing rows.
- `computeRowSpacingM`/`computePanelLayout` live in `packages/engine/src/panel-layout.ts`,
  exported from `packages/engine/src/index.ts`'s barrel, reusing the existing `GpsPoint`
  interface from `./gps` for any `{lat, lon}` value — never redefine that shape inline.
- The map editor route lives under the existing `(app)` route group and reuses
  `requireAuthenticatedCompanyUser()` from `apps/web/app/(app)/layout.tsx` — do not create a
  second guard.
- Every query loading a `Project` by id must filter `where: { id: projectId, companyId:
  user.companyId }`, never `where: { id: projectId }` alone — a company must never be able to
  load or mutate another company's project via a crafted id.
- `formData.get(fieldName)` returns `FormDataEntryValue | null`, which can be a `File` — this
  sub-project's own Server Action doesn't take raw form fields for its geometry payload
  (it's called with a structured object the client component builds, not a literal
  `<form>` submission), so this specific risk doesn't apply here, but any field that IS read
  from a plain `FormData` (if one exists) must still be checked with `typeof === 'string'`,
  per the pattern established in sub-projects #3 and #4.
- `redirect()` throws internally in production. Any test mocking it for a case where code
  after the call must NOT run needs to mock it as throwing, not as a silent no-op — this
  exact mistake was made and caught in sub-project #3's own Task 5; apply the fix from the
  start here for any test of this shape.
- `vi.mock()` factories are hoisted above top-level `const` — use `vi.hoisted()` for any mock
  referenced inside a `vi.mock()` factory.
- Esri World Imagery's tile URL and required attribution string (verified against Esri's own
  published terms, not guessed) are defined once as a constant and never hardcoded a second
  time anywhere else in the codebase.

## Review Focus

- **`saveMapDataAction` must reject a request for a project belonging to a different
  company** — the spec's §4 step 1 names this explicitly for the page load; the save action
  needs the identical check, independently, since it's a separate Server Action callable on
  its own (the same class of gap found and fixed in sub-project #3's installer-mutation
  actions, which had no session/ownership check of their own).
- **`computePanelLayout` must set `fitsAllModules: false`, not throw or silently truncate**,
  when the polygon is too small for the requested module count — a reasonable person reading
  "auto-fill" expects either all modules placed or a clear signal that they weren't, never a
  silent partial result presented as complete.
- **A module count not evenly divisible by one row's capacity must produce a partial last
  row, not drop the remainder or round up to a nonexistent module** — the spec's own §5
  mentions this case by name.
- **The Standard-tier map page must never render the polygon/panel-fill tools at all**, not
  merely hide them with CSS — the spec's §2 "enforced in the component" decision needs a test
  proving a Standard-tier project's page output contains no trace of those controls.
- **`lengthMm`/`widthMm` must be backfilled with a real, non-placeholder value for every
  existing seeded `PvModule` row during the migration** — a required column added with a
  placeholder value like `0` would silently corrupt the ballast-stability check
  (`MODULE_AREA_M2`'s formula multiplies by both fields) for every pre-existing module without
  any error, which is worse than the column being missing (which at least fails loudly).

---

## Task 1: Add `lengthMm`/`widthMm` to `PvModule` and backfill existing data

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: a new Prisma migration (generated by `prisma migrate dev`)
- Modify: `packages/db/prisma/seed.ts`

**Interfaces:**
- Produces: `PvModule.lengthMm: Float`, `PvModule.widthMm: Float` — consumed by Task 2's
  `computePanelLayout` via the project's array config's module relation.

- [ ] **Step 1: Check what `PvModule` rows currently exist**

Run (from `packages/db`): `npx tsx -e "import { db } from './src/index'; const modules = await db.pvModule.findMany(); console.log(modules.map(m => ({ id: m.id, brand: m.brand, model: m.model }))); await db.\$disconnect();"`

Expected: prints the seeded module(s) — there should be exactly the ones from
`packages/db/prisma/seed.ts` (check that file directly for the real brand/model names and
their real datasheet dimensions before Step 3, so the backfill uses accurate values, not
placeholders).

- [ ] **Step 2: Add the fields to the schema**

In `packages/db/prisma/schema.prisma`, inside `model PvModule`, add after the existing
`weightKg` field:

```prisma
  lengthMm              Float
  widthMm               Float
```

- [ ] **Step 3: Generate the migration**

Run (from `packages/db`): `npx prisma migrate dev --name add_pv_module_dimensions`

This will prompt because the column is required on a table with existing rows. Since this is
an interactive prompt this plan's own automation can't answer blindly, resolve it by first
checking the actual seeded module's real datasheet (read `packages/db/prisma/seed.ts` for the
brand/model, e.g. a specific real panel model) and finding its real length/width in mm from
public specs, OR — if the seed data is clearly a placeholder/fictional module not tied to a
real datasheet — use a realistic standard 72-cell module size (2256mm × 1133mm, a common
real-world dimension for this module class) as the backfill value, and note in the migration's
own SQL comment which case applied. Do not use `0` or another non-physical placeholder.

Expected: a new migration directory under `packages/db/prisma/migrations/` containing an
`ALTER TABLE` that adds both columns NOT NULL with the chosen backfill default, then (if
Prisma's own flow allows) drops the default so future inserts must supply a real value
explicitly.

- [ ] **Step 4: Update the seed script to supply real values going forward**

In `packages/db/prisma/seed.ts`, find the `db.pvModule.create(...)` call(s) and add
`lengthMm`/`widthMm` with the same real value chosen in Step 3, so a fresh `migrate reset`
going forward never needs the backfill path again.

- [ ] **Step 5: Regenerate the Prisma client**

Run (from `packages/db`): `npx prisma generate`
Expected: no errors; `PvModule` type now includes `lengthMm`/`widthMm`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no code outside `packages/db` references these fields yet, so this just
confirms the generated client itself is valid).

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/prisma/seed.ts
git commit -m "fix(db): add required lengthMm/widthMm to PvModule, backfill existing rows"
```

---

## Task 2: Panel layout geometry functions in `@dossipv/engine`

**Files:**
- Create: `packages/engine/src/panel-layout.ts`
- Create: `packages/engine/test/panel-layout.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `GpsPoint` from `./gps`.
- Produces: `computeRowSpacingM(tiltDeg, moduleLengthM, latitudeDeg): number`,
  `computePanelLayout(polygon: GpsPoint[], moduleCount, moduleLengthM, moduleWidthM, tiltDeg,
  latitudeDeg): PanelLayoutResult` — consumed by Task 4's map editor client component.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/engine/test/panel-layout.test.ts
import { describe, it, expect } from 'vitest';
import { computeRowSpacingM, computePanelLayout } from '../src/panel-layout';
import type { GpsPoint } from '../src/gps';

describe('computeRowSpacingM', () => {
  it('computes the standard worst-case-date row spacing for a known latitude/tilt', () => {
    // Latitude 34 deg, tilt 30 deg, module length 2m.
    // elevationDeg = 90 - |34 - (-23.45)| = 90 - 57.45 = 32.55
    // panelHeightM = 2 * sin(30deg) = 1.0
    // spacingM = 1.0 / tan(32.55deg) ≈ 1.0 / 0.6388 ≈ 1.5655
    const spacing = computeRowSpacingM(30, 2, 34);
    expect(spacing).toBeGreaterThan(1.5);
    expect(spacing).toBeLessThan(1.6);
  });

  it('requires more spacing at a higher latitude (lower winter sun angle)', () => {
    const spacingLowLat = computeRowSpacingM(30, 2, 30);
    const spacingHighLat = computeRowSpacingM(30, 2, 37);
    expect(spacingHighLat).toBeGreaterThan(spacingLowLat);
  });

  it('requires more spacing at a steeper tilt', () => {
    const spacingShallow = computeRowSpacingM(15, 2, 34);
    const spacingSteep = computeRowSpacingM(45, 2, 34);
    expect(spacingSteep).toBeGreaterThan(spacingShallow);
  });
});

describe('computePanelLayout', () => {
  // A roughly 20m x 10m rectangle, large enough for several rows.
  const largePolygon: GpsPoint[] = [
    { lat: 36.8000, lon: 10.1000 },
    { lat: 36.8000, lon: 10.1003 },
    { lat: 36.7999, lon: 10.1003 },
    { lat: 36.7999, lon: 10.1000 },
  ];

  it('places all requested modules when the polygon is large enough', () => {
    const result = computePanelLayout(largePolygon, 10, 2, 1, 30, 36.8);
    expect(result.fitsAllModules).toBe(true);
    expect(result.placedCount).toBe(10);
  });

  it('sets fitsAllModules to false and places fewer than requested when the polygon is too small', () => {
    const tinyPolygon: GpsPoint[] = [
      { lat: 36.80000, lon: 10.10000 },
      { lat: 36.80000, lon: 10.10002 },
      { lat: 36.79999, lon: 10.10002 },
      { lat: 36.79999, lon: 10.10000 },
    ];

    const result = computePanelLayout(tinyPolygon, 50, 2, 1, 30, 36.8);
    expect(result.fitsAllModules).toBe(false);
    expect(result.placedCount).toBeLessThan(50);
  });

  it('produces a partial last row when module count is not evenly divisible by row capacity', () => {
    // With a wide-enough polygon and narrow modules, one row should fit more than the
    // remainder, producing a shorter final row rather than dropping modules.
    const result = computePanelLayout(largePolygon, 7, 2, 1, 30, 36.8);
    expect(result.fitsAllModules).toBe(true);
    expect(result.placedCount).toBe(7);
    const totalPlacedAcrossRows = result.rows.reduce((sum, row) => sum + row.length, 0);
    expect(totalPlacedAcrossRows).toBe(7);
  });

  it('returns rows as arrays of lat/lon points with a rotation, not raw meter coordinates', () => {
    const result = computePanelLayout(largePolygon, 3, 2, 1, 30, 36.8);
    for (const row of result.rows) {
      for (const point of row) {
        expect(typeof point.lat).toBe('number');
        expect(typeof point.lon).toBe('number');
        expect(typeof point.rotationDeg).toBe('number');
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix packages/engine test -- test/panel-layout.test.ts`
Expected: FAIL — `Cannot find module '../src/panel-layout'`.

- [ ] **Step 3: Implement `panel-layout.ts`**

```ts
// packages/engine/src/panel-layout.ts
import type { GpsPoint } from './gps';

const SOLSTICE_DECLINATION_DEG = -23.45;
const METERS_PER_DEGREE_LAT = 111_320;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Minimum center-to-center row spacing (meters) that avoids one row shadowing the row behind
 * it at winter-solstice solar noon for the given latitude — the worst case of the year.
 */
export function computeRowSpacingM(tiltDeg: number, moduleLengthM: number, latitudeDeg: number): number {
  const elevationDeg = 90 - Math.abs(latitudeDeg - SOLSTICE_DECLINATION_DEG);
  const panelHeightM = moduleLengthM * Math.sin(toRad(tiltDeg));
  return panelHeightM / Math.tan(toRad(elevationDeg));
}

export interface PanelLayoutResult {
  rows: (GpsPoint & { rotationDeg: number })[][];
  placedCount: number;
  fitsAllModules: boolean;
}

interface LocalPoint {
  xM: number;
  yM: number;
}

function toLocalMeters(point: GpsPoint, originLat: number, originLon: number): LocalPoint {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(toRad(originLat));
  return {
    xM: (point.lon - originLon) * metersPerDegreeLon,
    yM: (point.lat - originLat) * METERS_PER_DEGREE_LAT,
  };
}

function toGpsPoint(local: LocalPoint, originLat: number, originLon: number): GpsPoint {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(toRad(originLat));
  return {
    lat: originLat + local.yM / METERS_PER_DEGREE_LAT,
    lon: originLon + local.xM / metersPerDegreeLon,
  };
}

export function computePanelLayout(
  polygon: GpsPoint[],
  moduleCount: number,
  moduleLengthM: number,
  moduleWidthM: number,
  tiltDeg: number,
  latitudeDeg: number,
): PanelLayoutResult {
  const originLat = polygon[0]!.lat;
  const originLon = polygon[0]!.lon;
  const localPoints = polygon.map((p) => toLocalMeters(p, originLat, originLon));

  const minX = Math.min(...localPoints.map((p) => p.xM));
  const maxX = Math.max(...localPoints.map((p) => p.xM));
  const minY = Math.min(...localPoints.map((p) => p.yM));
  const maxY = Math.max(...localPoints.map((p) => p.yM));

  const rowSpacingM = computeRowSpacingM(tiltDeg, moduleLengthM, latitudeDeg);
  const modulesPerRow = Math.max(1, Math.floor((maxX - minX) / moduleWidthM));

  const rows: (GpsPoint & { rotationDeg: number })[][] = [];
  let remaining = moduleCount;
  let currentY = maxY; // start from the northern edge

  while (remaining > 0 && currentY - rowSpacingM >= minY) {
    const countThisRow = Math.min(modulesPerRow, remaining);
    const row: (GpsPoint & { rotationDeg: number })[] = [];
    for (let i = 0; i < countThisRow; i++) {
      const xM = minX + i * moduleWidthM;
      const gps = toGpsPoint({ xM, yM: currentY }, originLat, originLon);
      row.push({ ...gps, rotationDeg: 0 });
    }
    rows.push(row);
    remaining -= countThisRow;
    currentY -= rowSpacingM;
  }

  const placedCount = moduleCount - remaining;
  return { rows, placedCount, fitsAllModules: placedCount === moduleCount };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix packages/engine test -- test/panel-layout.test.ts`
Expected: PASS, all 8 tests green. If the "too small polygon" test doesn't actually produce
`fitsAllModules: false` with the given tiny-polygon dimensions, adjust that test's polygon
size (not the implementation) until it genuinely exercises the too-small case — the numeric
polygon size in the test is illustrative, not load-bearing; what matters is that some real
input produces `false`.

- [ ] **Step 5: Add the barrel export**

```ts
// packages/engine/src/index.ts — add this line among the existing exports
export * from './panel-layout';
```

- [ ] **Step 6: Run the full engine suite**

Run: `npm --prefix packages/engine test`
Expected: PASS, all existing engine tests plus the 8 new ones green.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/panel-layout.ts packages/engine/test/panel-layout.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add panel row-spacing and layout-placement geometry functions"
```

---

## Task 3: Save Server Action with tenant isolation

**Files:**
- Create: `apps/web/app/(app)/projects/[id]/map/actions.ts`
- Create: `apps/web/test/map-save-action.test.ts`

**Interfaces:**
- Consumes: `requireAuthenticatedCompanyUser` from `../../../layout` (the existing `(app)`
  guard), `db` from `@dossipv/db`.
- Produces: `saveMapDataAction(projectId, payload): Promise<{ error: string } | void>` —
  consumed by Task 4's client component.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/map-save-action.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockCookies, mockRedirect, mockValidateSession, mockProjectFindFirst, mockSiteUpdate, mockImageryUpsert } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockSiteUpdate: vi.fn(),
    mockImageryUpsert: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      project: { findFirst: mockProjectFindFirst },
      projectSite: { update: mockSiteUpdate },
      projectImagery: { upsert: mockImageryUpsert },
    },
  };
});

import { saveMapDataAction, type MapSavePayload } from '../app/(app)/projects/[id]/map/actions';

const authenticatedUser = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-token' });
  mockRedirect.mockClear();
  mockValidateSession.mockReset();
  mockValidateSession.mockResolvedValue(authenticatedUser);
  mockProjectFindFirst.mockClear();
  mockSiteUpdate.mockClear();
  mockImageryUpsert.mockClear();
});

const samplePayload: MapSavePayload = {
  gpsLat: 36.8,
  gpsLon: 10.1,
  technicalRoomPointLat: 36.8001,
  technicalRoomPointLon: 10.1001,
  meterPointLat: 36.8002,
  meterPointLon: 10.1002,
  earthPitPointLat: 36.8003,
  earthPitPointLon: 10.1003,
  geometry: { outline: [{ lat: 36.8, lon: 10.1 }], panelRows: [], manualOverride: false },
};

describe('saveMapDataAction', () => {
  it('updates ProjectSite and upserts ProjectImagery when the project belongs to the caller\'s company', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'project-1', companyId: 'company-1' });
    mockSiteUpdate.mockResolvedValue({});
    mockImageryUpsert.mockResolvedValue({});

    await saveMapDataAction('project-1', samplePayload);

    expect(mockProjectFindFirst).toHaveBeenCalledWith({ where: { id: 'project-1', companyId: 'company-1' } });
    expect(mockSiteUpdate).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      data: {
        gpsLat: 36.8,
        gpsLon: 10.1,
        technicalRoomPointLat: 36.8001,
        technicalRoomPointLon: 10.1001,
        meterPointLat: 36.8002,
        meterPointLon: 10.1002,
        earthPitPointLat: 36.8003,
        earthPitPointLon: 10.1003,
      },
    });
    expect(mockImageryUpsert).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      create: { projectId: 'project-1', geometry: samplePayload.geometry },
      update: { geometry: samplePayload.geometry },
    });
  });

  it('does nothing and returns an error when the project belongs to a different company', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    const result = await saveMapDataAction('someone-elses-project', samplePayload);

    expect(mockSiteUpdate).not.toHaveBeenCalled();
    expect(mockImageryUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Projet introuvable.' });
  });

  it('skips the ProjectImagery upsert when geometry is omitted (Standard tier, single-pin only)', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'project-1', companyId: 'company-1' });
    mockSiteUpdate.mockResolvedValue({});

    const { geometry, ...withoutGeometry } = samplePayload;
    await saveMapDataAction('project-1', withoutGeometry);

    expect(mockSiteUpdate).toHaveBeenCalled();
    expect(mockImageryUpsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix apps/web test -- test/map-save-action.test.ts`
Expected: FAIL — `Cannot find module '../app/(app)/projects/[id]/map/actions'`.

- [ ] **Step 3: Implement the save action**

```ts
// apps/web/app/(app)/projects/[id]/map/actions.ts
'use server';

import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../../layout';

export interface ProjectGeometry {
  outline: { lat: number; lon: number }[];
  panelRows: { lat: number; lon: number; rotationDeg: number }[][];
  manualOverride: boolean;
}

export interface MapSavePayload {
  gpsLat: number;
  gpsLon: number;
  technicalRoomPointLat?: number;
  technicalRoomPointLon?: number;
  meterPointLat?: number;
  meterPointLon?: number;
  earthPitPointLat?: number;
  earthPitPointLon?: number;
  geometry?: ProjectGeometry;
}

export interface SaveMapDataActionError {
  error: string;
}

export async function saveMapDataAction(
  projectId: string,
  payload: MapSavePayload,
): Promise<SaveMapDataActionError | void> {
  const user = await requireAuthenticatedCompanyUser();

  const project = await db.project.findFirst({ where: { id: projectId, companyId: user.companyId } });
  if (!project) {
    return { error: 'Projet introuvable.' };
  }

  await db.projectSite.update({
    where: { projectId },
    data: {
      gpsLat: payload.gpsLat,
      gpsLon: payload.gpsLon,
      technicalRoomPointLat: payload.technicalRoomPointLat,
      technicalRoomPointLon: payload.technicalRoomPointLon,
      meterPointLat: payload.meterPointLat,
      meterPointLon: payload.meterPointLon,
      earthPitPointLat: payload.earthPitPointLat,
      earthPitPointLon: payload.earthPitPointLon,
    },
  });

  if (payload.geometry) {
    await db.projectImagery.upsert({
      where: { projectId },
      create: { projectId, geometry: payload.geometry },
      update: { geometry: payload.geometry },
    });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix apps/web test -- test/map-save-action.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(app)/projects/[id]/map/actions.ts" "apps/web/test/map-save-action.test.ts"
git commit -m "feat(map): add tenant-isolated save action for map editor data"
```

---

## Task 4: Map editor page and client component — single-pin foundation (Standard tier)

**Files:**
- Create: `apps/web/app/(app)/projects/[id]/map/page.tsx`
- Create: `apps/web/app/(app)/projects/[id]/map/map-editor.tsx`
- Create: `apps/web/app/(app)/projects/[id]/map/esri-provider.ts`
- Create: `apps/web/test/map-editor-page.test.ts`
- Modify: `apps/web/package.json` (add `leaflet`, `react-leaflet`, `@types/leaflet`)

**Interfaces:**
- Consumes: `requireAuthenticatedCompanyUser` from `../../../layout`, `saveMapDataAction` from
  `./actions`.
- Produces: `MapEditor` component — extended by Task 5 with polygon/pin/panel-fill tools.
  `loadMapPageData` — not consumed elsewhere.

This task builds the Standard-tier foundation (search-free single-pin placement, satellite
tiles, save/load) end to end and proves it works before Task 5 layers the Premium-tier
polygon/pin/panel-fill tools on top — splitting this way keeps each task's own test cycle
focused and means a mistake in the more complex Task 5 UI can't be confused with a foundation
problem.

- [ ] **Step 1: Add dependencies**

In `apps/web/package.json`, add to `dependencies`: `"leaflet": "^1.9.4"`, `"react-leaflet":
"^5.0.0"`. Add to `devDependencies`: `"@types/leaflet": "^1.9.22"`.

Run: `npm install`
Expected: no errors.

- [ ] **Step 2: Define the Esri provider constant**

```ts
// apps/web/app/(app)/projects/[id]/map/esri-provider.ts
export const ACTIVE_MAP_PROVIDER = {
  tileUrlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  maxZoom: 19,
} as const;
```

- [ ] **Step 3: Write the failing test for tier gating (the Review Focus item on this exact risk)**

```ts
// apps/web/test/map-editor-page.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockCookies, mockRedirect, mockValidateSession, mockProjectFindFirst } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockProjectFindFirst: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect, notFound: vi.fn() }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, project: { findFirst: mockProjectFindFirst } } };
});

import { loadMapPageData } from '../app/(app)/projects/[id]/map/page';

const authenticatedUser = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-token' });
  mockValidateSession.mockReset();
  mockValidateSession.mockResolvedValue(authenticatedUser);
  mockProjectFindFirst.mockClear();
});

describe('loadMapPageData', () => {
  it('returns tier STANDARD for a Standard-tier project, so the editor renders single-pin-only mode', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: 'project-1',
      tier: 'STANDARD',
      site: { gpsLat: 36.8, gpsLon: 10.1, technicalRoomPointLat: null, technicalRoomPointLon: null, meterPointLat: null, meterPointLon: null, earthPitPointLat: null, earthPitPointLon: null },
      imagery: null,
    });

    const result = await loadMapPageData('project-1');

    expect(result?.project.tier).toBe('STANDARD');
  });

  it('returns null when the project belongs to a different company (findFirst scoped by companyId returns nothing)', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    const result = await loadMapPageData('someone-elses-project');

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm --prefix apps/web test -- test/map-editor-page.test.ts`
Expected: FAIL — `loadMapPageData is not exported` (the file doesn't exist yet).

- [ ] **Step 5: Implement the page, exporting the data-loading logic separately for testability**

```tsx
// apps/web/app/(app)/projects/[id]/map/page.tsx
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import { MapEditor } from './map-editor';

export interface MapPageData {
  project: { id: string; tier: 'STANDARD' | 'PREMIUM' };
  site: {
    gpsLat: number;
    gpsLon: number;
    technicalRoomPointLat: number | null;
    technicalRoomPointLon: number | null;
    meterPointLat: number | null;
    meterPointLon: number | null;
    earthPitPointLat: number | null;
    earthPitPointLon: number | null;
  };
  geometry: unknown;
}

export async function loadMapPageData(projectId: string): Promise<MapPageData | null> {
  const user = await requireAuthenticatedCompanyUser();

  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    include: { site: true, imagery: true },
  });

  if (!project || !project.site) {
    return null;
  }

  return {
    project: { id: project.id, tier: project.tier },
    site: {
      gpsLat: project.site.gpsLat,
      gpsLon: project.site.gpsLon,
      technicalRoomPointLat: project.site.technicalRoomPointLat,
      technicalRoomPointLon: project.site.technicalRoomPointLon,
      meterPointLat: project.site.meterPointLat,
      meterPointLon: project.site.meterPointLon,
      earthPitPointLat: project.site.earthPitPointLat,
      earthPitPointLon: project.site.earthPitPointLon,
    },
    geometry: project.imagery?.geometry ?? null,
  };
}

export default async function MapPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  const data = await loadMapPageData(id);

  if (!data) {
    notFound();
  }

  return <MapEditor projectId={data.project.id} tier={data.project.tier} site={data.site} geometry={data.geometry} />;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm --prefix apps/web test -- test/map-editor-page.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 7: Implement the client-side map editor component**

```tsx
// apps/web/app/(app)/projects/[id]/map/map-editor.tsx
'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { saveMapDataAction, type ProjectGeometry } from './actions';
import { ACTIVE_MAP_PROVIDER } from './esri-provider';

interface MapEditorProps {
  projectId: string;
  tier: 'STANDARD' | 'PREMIUM';
  site: {
    gpsLat: number;
    gpsLon: number;
    technicalRoomPointLat: number | null;
    technicalRoomPointLon: number | null;
    meterPointLat: number | null;
    meterPointLon: number | null;
    earthPitPointLat: number | null;
    earthPitPointLon: number | null;
  };
  geometry: unknown;
}

export function MapEditor({ projectId, tier, site }: MapEditorProps): React.JSX.Element {
  const [gps, setGps] = useState({ lat: site.gpsLat, lon: site.gpsLon });
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave(): Promise<void> {
    const result = await saveMapDataAction(projectId, { gpsLat: gps.lat, gpsLon: gps.lon });
    if (result?.error) {
      setSaveError(result.error);
    } else {
      setSaveError(null);
    }
  }

  return (
    <main>
      <h1>Carte du site</h1>
      <MapContainer center={[gps.lat, gps.lon]} zoom={18} style={{ height: '500px', width: '100%' }}>
        <TileLayer url={ACTIVE_MAP_PROVIDER.tileUrlTemplate} attribution={ACTIVE_MAP_PROVIDER.attribution} maxZoom={ACTIVE_MAP_PROVIDER.maxZoom} />
        <Marker
          position={[gps.lat, gps.lon]}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const latLng = event.target.getLatLng();
              setGps({ lat: latLng.lat, lon: latLng.lng });
            },
          }}
        />
        {tier === 'PREMIUM' && (
          <p role="note">
            Les outils de contour et de remplissage automatique arrivent dans une prochaine mise à jour de cet
            éditeur.
          </p>
        )}
      </MapContainer>
      <button type="button" onClick={handleSave}>
        Enregistrer
      </button>
      {saveError && <p role="alert">{saveError}</p>}
    </main>
  );
}
```

Note: this component renders the Premium-tier "note" placeholder for now — Task 5 replaces
it with the real polygon/pin/panel-fill tools. The single-pin Marker (used by both tiers at
this stage) and the save/load round trip are the parts this task's own tests and Task 6's
live verification exercise.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json "apps/web/app/(app)/projects/[id]/map/page.tsx" "apps/web/app/(app)/projects/[id]/map/map-editor.tsx" "apps/web/app/(app)/projects/[id]/map/esri-provider.ts" "apps/web/test/map-editor-page.test.ts"
git commit -m "feat(map): add map editor page with single-pin placement and save"
```

---

## Task 5: Polygon drawing, named pins, and panel auto-fill (Premium tier)

**Files:**
- Modify: `apps/web/app/(app)/projects/[id]/map/map-editor.tsx`
- Modify: `apps/web/app/(app)/projects/[id]/map/actions.ts` (payload already supports
  `geometry`, `technicalRoomPointLat/Lon`, etc. from Task 3 — no interface change needed, only
  the client now actually populates those fields)
- Create: `apps/web/test/map-editor-geometry.test.ts`

**Interfaces:**
- Consumes: `computePanelLayout` from `@dossipv/engine` (Task 2), `ProjectGeometry` type from
  `./actions` (Task 3).
- Produces: the completed `MapEditor` component — the final deliverable of this plan.

Leaflet's drawing interactions (click-to-add-vertex, drag-to-move-pin) are DOM/mouse-event
driven and not practically unit-testable without a real browser (same honest limitation the
spec's §6 already names) — so this task pulls the three genuinely testable pieces of logic
(polygon area/centroid computation, the tier gate controlling which tools render, and the
auto-fill button's call into `computePanelLayout`) into small exported pure functions, each
with its own direct test, and leaves the actual mouse-driven interaction itself to Task 6's
required browser verification step.

- [ ] **Step 1: Write the failing tests for the exported pure helpers**

```ts
// apps/web/test/map-editor-geometry.test.ts
import { describe, it, expect } from 'vitest';
import { computePolygonCentroid, computePolygonAreaM2 } from '../app/(app)/projects/[id]/map/map-editor';

describe('computePolygonCentroid', () => {
  it('returns the arithmetic mean of the polygon vertices', () => {
    const centroid = computePolygonCentroid([
      { lat: 36.800, lon: 10.100 },
      { lat: 36.802, lon: 10.100 },
      { lat: 36.802, lon: 10.102 },
      { lat: 36.800, lon: 10.102 },
    ]);
    expect(centroid.lat).toBeCloseTo(36.801, 5);
    expect(centroid.lon).toBeCloseTo(10.101, 5);
  });
});

describe('computePolygonAreaM2', () => {
  it('computes the shoelace-formula area of a simple rectangle in square meters', () => {
    // Roughly a 20m x 20m square near the equator-ish latitude used elsewhere in this plan's tests.
    const area = computePolygonAreaM2([
      { lat: 36.80000, lon: 10.10000 },
      { lat: 36.80018, lon: 10.10000 },
      { lat: 36.80018, lon: 10.10022 },
      { lat: 36.80000, lon: 10.10022 },
    ]);
    expect(area).toBeGreaterThan(300);
    expect(area).toBeLessThan(500);
  });

  it('returns 0 for a degenerate polygon with fewer than 3 points', () => {
    expect(computePolygonAreaM2([{ lat: 36.8, lon: 10.1 }])).toBe(0);
    expect(computePolygonAreaM2([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix apps/web test -- test/map-editor-geometry.test.ts`
Expected: FAIL — `computePolygonCentroid is not exported`.

- [ ] **Step 3: Implement the pure helpers and export them from `map-editor.tsx`**

Add near the top of `map-editor.tsx` (above the component, exported):

```tsx
const METERS_PER_DEGREE_LAT = 111_320;

export function computePolygonCentroid(points: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
  return { lat, lon };
}

export function computePolygonAreaM2(points: { lat: number; lon: number }[]): number {
  if (points.length < 3) {
    return 0;
  }
  const originLat = points[0]!.lat;
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((originLat * Math.PI) / 180);
  const local = points.map((p) => ({
    xM: (p.lon - points[0]!.lon) * metersPerDegreeLon,
    yM: (p.lat - originLat) * METERS_PER_DEGREE_LAT,
  }));

  let twiceArea = 0;
  for (let i = 0; i < local.length; i++) {
    const current = local[i]!;
    const next = local[(i + 1) % local.length]!;
    twiceArea += current.xM * next.yM - next.xM * current.yM;
  }
  return Math.abs(twiceArea) / 2;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix apps/web test -- test/map-editor-geometry.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Rewrite the component to add polygon drawing, named pins, and auto-fill**

Replace `map-editor.tsx`'s component body (keep the two exported pure functions from Step 3
above it) with:

```tsx
'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { computePanelLayout } from '@dossipv/engine';
import { saveMapDataAction, type ProjectGeometry } from './actions';
import { ACTIVE_MAP_PROVIDER } from './esri-provider';

// ... computePolygonCentroid, computePolygonAreaM2 from Step 3 stay here, exported ...

interface MapEditorProps {
  projectId: string;
  tier: 'STANDARD' | 'PREMIUM';
  site: {
    gpsLat: number;
    gpsLon: number;
    technicalRoomPointLat: number | null;
    technicalRoomPointLon: number | null;
    meterPointLat: number | null;
    meterPointLon: number | null;
    earthPitPointLat: number | null;
    earthPitPointLon: number | null;
  };
  geometry: unknown;
  moduleInfo?: { count: number; lengthM: number; widthM: number; tiltDeg: number } | null;
}

type Point = { lat: number; lon: number };
type DrawMode = 'none' | 'polygon' | 'technicalRoom' | 'meter' | 'earthPit';

function ClickHandler({ onClick }: { onClick: (point: Point) => void }): null {
  useMapEvents({
    click: (event) => {
      onClick({ lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });
  return null;
}

export function MapEditor({ projectId, tier, site, moduleInfo }: MapEditorProps): React.JSX.Element {
  const [gps, setGps] = useState({ lat: site.gpsLat, lon: site.gpsLon });
  const [outline, setOutline] = useState<Point[]>([]);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [technicalRoom, setTechnicalRoom] = useState<Point | null>(
    site.technicalRoomPointLat && site.technicalRoomPointLon ? { lat: site.technicalRoomPointLat, lon: site.technicalRoomPointLon } : null,
  );
  const [meter, setMeter] = useState<Point | null>(
    site.meterPointLat && site.meterPointLon ? { lat: site.meterPointLat, lon: site.meterPointLon } : null,
  );
  const [earthPit, setEarthPit] = useState<Point | null>(
    site.earthPitPointLat && site.earthPitPointLon ? { lat: site.earthPitPointLat, lon: site.earthPitPointLon } : null,
  );
  const [panelRows, setPanelRows] = useState<(Point & { rotationDeg: number })[][]>([]);
  const [fitWarning, setFitWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleMapClick(point: Point): void {
    if (drawMode === 'polygon') {
      setOutline((prev) => [...prev, point]);
    } else if (drawMode === 'technicalRoom') {
      setTechnicalRoom(point);
      setDrawMode('none');
    } else if (drawMode === 'meter') {
      setMeter(point);
      setDrawMode('none');
    } else if (drawMode === 'earthPit') {
      setEarthPit(point);
      setDrawMode('none');
    }
  }

  function handleFinishPolygon(): void {
    if (outline.length < 3) {
      return;
    }
    const centroid = computePolygonCentroid(outline);
    setGps(centroid);
    setDrawMode('none');
  }

  function handleAutoFill(): void {
    if (outline.length < 3 || !moduleInfo) {
      return;
    }
    const centroid = computePolygonCentroid(outline);
    const result = computePanelLayout(outline, moduleInfo.count, moduleInfo.lengthM, moduleInfo.widthM, moduleInfo.tiltDeg, centroid.lat);
    setPanelRows(result.rows);
    setFitWarning(result.fitsAllModules ? null : `Seuls ${result.placedCount} modules sur ${moduleInfo.count} tiennent dans ce contour.`);
  }

  async function handleSave(): Promise<void> {
    const geometry: ProjectGeometry | undefined =
      tier === 'PREMIUM' && outline.length >= 3
        ? { outline, panelRows, manualOverride: false }
        : undefined;

    const result = await saveMapDataAction(projectId, {
      gpsLat: gps.lat,
      gpsLon: gps.lon,
      technicalRoomPointLat: technicalRoom?.lat,
      technicalRoomPointLon: technicalRoom?.lon,
      meterPointLat: meter?.lat,
      meterPointLon: meter?.lon,
      earthPitPointLat: earthPit?.lat,
      earthPitPointLon: earthPit?.lon,
      geometry,
    });

    setSaveError(result?.error ?? null);
  }

  return (
    <main>
      <h1>Carte du site</h1>
      {tier === 'PREMIUM' && (
        <div>
          <button type="button" onClick={() => setDrawMode('polygon')}>
            Dessiner le contour
          </button>
          <button type="button" onClick={handleFinishPolygon} disabled={outline.length < 3}>
            Terminer le contour
          </button>
          <button type="button" onClick={() => setDrawMode('technicalRoom')}>
            Placer : Local technique
          </button>
          <button type="button" onClick={() => setDrawMode('meter')}>
            Placer : Compteur STEG
          </button>
          <button type="button" onClick={() => setDrawMode('earthPit')}>
            Placer : Piquet de terre
          </button>
          <button type="button" onClick={handleAutoFill} disabled={outline.length < 3 || !moduleInfo}>
            Remplissage automatique
          </button>
        </div>
      )}
      <MapContainer center={[gps.lat, gps.lon]} zoom={18} style={{ height: '500px', width: '100%' }}>
        <TileLayer url={ACTIVE_MAP_PROVIDER.tileUrlTemplate} attribution={ACTIVE_MAP_PROVIDER.attribution} maxZoom={ACTIVE_MAP_PROVIDER.maxZoom} />
        <ClickHandler onClick={handleMapClick} />
        <Marker
          position={[gps.lat, gps.lon]}
          draggable
          eventHandlers={{ dragend: (event) => setGps({ lat: event.target.getLatLng().lat, lon: event.target.getLatLng().lng }) }}
        />
        {outline.length >= 3 && <Polygon positions={outline.map((p) => [p.lat, p.lon])} />}
        {technicalRoom && (
          <Marker
            position={[technicalRoom.lat, technicalRoom.lon]}
            draggable
            eventHandlers={{ dragend: (event) => setTechnicalRoom({ lat: event.target.getLatLng().lat, lon: event.target.getLatLng().lng }) }}
          />
        )}
        {meter && (
          <Marker
            position={[meter.lat, meter.lon]}
            draggable
            eventHandlers={{ dragend: (event) => setMeter({ lat: event.target.getLatLng().lat, lon: event.target.getLatLng().lng }) }}
          />
        )}
        {earthPit && (
          <Marker
            position={[earthPit.lat, earthPit.lon]}
            draggable
            eventHandlers={{ dragend: (event) => setEarthPit({ lat: event.target.getLatLng().lat, lon: event.target.getLatLng().lng }) }}
          />
        )}
        {panelRows.map((row, rowIndex) => (
          <Polygon key={rowIndex} positions={row.map((p) => [p.lat, p.lon])} pathOptions={{ color: 'blue' }} />
        ))}
      </MapContainer>
      {fitWarning && <p role="alert">{fitWarning}</p>}
      <button type="button" onClick={handleSave}>
        Enregistrer
      </button>
      {saveError && <p role="alert">{saveError}</p>}
    </main>
  );
}
```

Note: `moduleInfo` (the project's array config module count/dimensions/tilt) is passed as an
optional prop rather than fetched by this component itself — `page.tsx` is responsible for
loading it from `ProjectArrayConfig` (joined to its `PvModule` for `lengthMm`/`widthMm`) and
passing it down, since this component should stay a pure presentation/interaction layer with
all data loading in the Server Component, matching every other page in this app.

- [ ] **Step 6: Update `page.tsx` to load and pass `moduleInfo`**

In `loadMapPageData` (from Task 4), extend the `db.project.findFirst` query's `include` to add
`arrayConfig: { include: { module: true } }`, and extend `MapPageData` with a `moduleInfo`
field populated from `project.arrayConfig` when present (convert `lengthMm`/`widthMm` to
meters by dividing by 1000, matching the unit `computePanelLayout` expects). Pass this through
to `<MapEditor moduleInfo={data.moduleInfo} ... />` in the default export.

- [ ] **Step 7: Run the full apps/web test suite**

Run: `npm --prefix apps/web test`
Expected: PASS — all tests from Tasks 1-5 green together.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add "apps/web/app/(app)/projects/[id]/map/map-editor.tsx" "apps/web/app/(app)/projects/[id]/map/page.tsx" "apps/web/test/map-editor-geometry.test.ts"
git commit -m "feat(map): add polygon drawing, named pins, and panel auto-fill (Premium tier)"
```

---

## Task 6: Live verification and whole-package review

**Files:** none — verification and review only, code changes only if a real gap is found.

**Interfaces:** none new.

- [ ] **Step 1: Confirm the SSH tunnel to Postgres is active**

Run: `node -e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);}); s.setTimeout(3000,()=>{console.error('TUNNEL DOWN: timeout');process.exit(1);});"`
Expected: `tunnel alive`.

- [ ] **Step 2: Create a verification project with a real site, and one with a module/array config**

Write and run a one-off `npx tsx` script (from the repo root, delete immediately after) that
creates a `Project` (tier `PREMIUM`, so the polygon/pin/auto-fill tools render) + `ProjectSite`
row for the existing verification company/user from prior sub-projects' verification data
(reuse rather than duplicate), with a real `gpsLat`/`gpsLon` somewhere in Tunisia, AND a
`ProjectArrayConfig` referencing the seeded `PvModule` (now with real `lengthMm`/`widthMm`
from Task 1) with a realistic module count — needed so the auto-fill button in Step 4 has
real data to call `computePanelLayout` with.

- [ ] **Step 3: Start the dev server, check for and stop any stale process on port 3000 first**

Run `npm run dev --workspace=@dossipv/web`; if it reports the port in use by an unknown PID
(as happened in both sub-projects #4 and #3's own Task 5), stop that PID first per the
established pattern, then retry.

- [ ] **Step 4: Open the map editor page in a real browser and manually verify every interactive tool**

This is the one step in this plan that genuinely cannot be verified by curl — Leaflet's tile
rendering and mouse-driven drawing/drag interactions require a real browser. Per the spec's
own §6, this is flagged as a required step, not optional: open
`http://localhost:3000/projects/<premium-verification-project-id>/map` (the real path has no
parentheses in the URL — those only exist in the file-system route-group name) with a real
authenticated session cookie (log in through `/login` first), and confirm, for the Premium
verification project from Step 2:
- The Esri satellite tiles actually load and display (not a blank/gray map).
- The Esri attribution text is visible and not cropped.
- "Dessiner le contour" + clicking ≥3 points on the map + "Terminer le contour" draws and
  closes a visible polygon outline.
- "Placer : Local technique" / "Compteur STEG" / "Piquet de terre" each place their own
  distinct marker on the next map click, and each marker is independently draggable.
- "Remplissage automatique" (after a polygon is drawn) renders panel rows inside the polygon;
  if the verification project's module count is deliberately set larger than the drawn
  polygon can fit, confirm the "Seuls X modules sur Y..." warning appears rather than the UI
  silently placing fewer modules with no explanation.
- Clicking "Enregistrer" and reloading the page shows the polygon, all three pins, and the
  panel rows restored from the database exactly where they were left — proving the full
  `ProjectGeometry` round-trips through `saveMapDataAction` and back through
  `loadMapPageData`, not just the single pin tested by Task 4's own mocked unit tests.
- Open the same URL for a Standard-tier project (create one in Step 2 alongside the Premium
  one, or reuse an existing seeded one) and confirm NONE of the polygon/pin/auto-fill buttons
  render — only the single draggable position marker — proving the tier gate from the spec's
  §2 decision holds in a real rendered page, not just in a unit test that never actually
  renders JSX.

- [ ] **Step 5: Verify the GET-level tenant isolation with curl**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -b "dossipv_session=<a valid token for a DIFFERENT company>" http://localhost:3000/projects/<verification-project-id>/map
```

Expected: 404 (via `notFound()`), not 200 and not a 500 — proving `loadMapPageData`'s
company-scoped query genuinely blocks cross-tenant access against the real database, not just
in the mocked unit test.

- [ ] **Step 6: Stop the dev server**

- [ ] **Step 7: Run the full workspace suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS.

- [ ] **Step 8: Confirm no stray verification script or secret was committed**

Run: `git status --porcelain` — expect empty. Run a grep for any password/token literal used
during verification across tracked files — expect no matches outside existing test fixtures.

- [ ] **Step 9: Update project memory**

Update `C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
recording: the schema fix to `PvModule`, the new engine geometry functions, the completed map
editor (polygon drawing, three named pins, panel auto-fill, tier gating) and exactly what
Step 4's browser verification actually exercised — matching this file's existing style of
being explicit about what was live-verified vs. only unit-tested.

- [ ] **Step 10: Final commit if Steps 4, 5, or 8 found anything to fix**

```bash
git add -A
git commit -m "fix(map): close a gap found in the map editor's final review"
```

(Skip entirely if nothing was found.)
