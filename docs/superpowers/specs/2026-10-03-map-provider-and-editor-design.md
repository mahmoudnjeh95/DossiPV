# DossiPV — Map Provider & Map Editor Design Spec

## 1. Purpose and scope

Combined sub-projects #5 (map provider) and #6 (map editor) of the "full application" build.
Treated as one sub-project because the provider abstraction exists only to serve the editor —
building it in isolation with no consumer would be premature.

Covers, per the master spec (`docs/superpowers/specs/2026-10-02-dossipv-design.md` §6-§7):
- A provider-agnostic map rendering layer, backed by Esri World Imagery (the free, no-API-key,
  no-billing tile source — Google Maps Platform requires a billing account that doesn't exist
  yet, exactly as the project's existing decomposition already noted).
- The map editor: site search/locate, polygon drawing (derives centroid/area), three pin types
  (technical room, meter, earth pit), panel auto-fill with manual override, persisted as
  coordinates/geometry data (never a saved image).
- Standard tier: single pin only (`site.gps`), no polygon, no panel layout.
- A new pure geometry function in `@dossipv/engine` for panel-row placement (south-facing rows
  inside a polygon, spaced to avoid self-shading).

**Explicitly out of scope**: Google Maps Platform as an actual second provider (the interface
is designed to support it later, but no Google-specific code is written — there is no billing
account to test against); the PVGIS simulation that will eventually consume `site.gps`
(sub-project #7); anything in the document pipeline that renders the final situation/
implantation page images (sub-project #8 — this editor produces the *data* those pages are
rendered from, not the pages themselves).

**Note on how this spec was produced**: written autonomously (user asleep, standing
instruction to keep building using the recommended option at each decision point). Two
decisions were escalated via `AskUserQuestion` before this spec was written, because they
were genuine engineering judgment calls with real consequences if wrong (library choice,
row-spacing formula) rather than defaults with an obvious "recommended" answer from context
alone — both are recorded in §2 with the reasoning given at the time.

## 2. Decisions

- **Esri World Imagery via Leaflet + react-leaflet.** Esri's World Imagery tile service
  (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`)
  is a standard public XYZ tile endpoint, no API key or billing account required — this is
  exactly the "stubbed with a placeholder" approach already decided for this sub-project before
  this spec existed (per project memory). Leaflet is a mature, lightweight raster-tile-friendly
  map library with established drawing-interaction precedent (`leaflet-draw` or equivalent
  hand-rolled polygon/marker interactions); chosen over MapLibre GL JS because MapLibre's
  vector-tile strengths don't apply to raster satellite imagery, and its drawing ecosystem is
  less mature for this exact polygon+pins use case. Esri's required attribution ("Powered by
  Esri" / "Source: Esri, Maxar, Earthstar Geographics...") is rendered via Leaflet's built-in
  `attribution` option on the tile layer, which Leaflet never lets the page CSS hide or crop —
  satisfying the master spec's "must never be cropped out" requirement structurally, not just
  by convention.
- **Provider interface is a single internal TypeScript interface**, not yet implemented for a
  second provider:
  ```ts
  interface MapProvider {
    tileUrlTemplate: string;
    attribution: string;
    maxZoom: number;
  }
  ```
  A deployment-level config constant (`ACTIVE_MAP_PROVIDER`, hardcoded to the Esri definition
  for this sub-project) stands in for the master spec's future `/admin` settings toggle — that
  toggle is explicitly deferred to super-admin slice 2 (settings), which doesn't exist yet;
  wiring a UI control to a config value with only one real option would be premature.
- **New pure function in `@dossipv/engine`, not inline in the editor component**, for panel-row
  placement — matches the project's established architecture (the engine is the single
  dependency-free source of truth for every calculation, imported by both browser and worker).
  Named `computePanelLayout(polygon, moduleCount, moduleLengthM, moduleWidthM, tiltDeg,
  azimuthDeg, latitudeDeg): PanelLayoutResult`.
- **Row spacing uses the standard worst-case-date solar geometry formula**, not a fixed
  multiplier: `spacingM = panelHeightM × sin(tiltRad) / tan(worstCaseElevationRad)`, where
  `panelHeightM = moduleLengthM × cos(tiltRad)` is the panel's vertical rise at the given tilt,
  and `worstCaseElevationRad` is the solar elevation at winter-solstice solar noon for the
  project's own GPS latitude (`elevationDeg = 90 - |latitudeDeg - (-23.45)|`, the sun's
  declination at the December solstice). This was escalated and confirmed over a fixed
  multiplier specifically because Tunisia's latitude range (~30°N-37°N) is wide enough that a
  fixed rule of thumb would under- or over-space real roofs; computing from the project's own
  latitude (already captured in `ProjectSite.gpsLat`) costs nothing extra and is correct for
  every site rather than approximately correct for an assumed "typical" one.
- **Schema gap found and fixed as part of this sub-project**: `PvModule` is missing
  `lengthMm`/`widthMm`, even though `pv_dossier_input_schema.json` requires both
  (`x-rules.checks`' own `MODULE_AREA_M2` formula already depends on them, and the Prisma
  schema's own `@dossipv/engine` ballast-stability checks (`STABILITY_LHS`/`RHS`) use
  `MODULE_AREA_M2`) — this is a genuine pre-existing gap from sub-project #1 (data model),
  invisible until a consumer (this panel-fill algorithm) actually needed the fields. Fixed via
  a new migration adding `lengthMm Float` and `widthMm Float` to `PvModule`, both required
  (matching the input schema's own `required` array), not optional — every module genuinely
  needs real dimensions for both this feature and the ballast check that already silently
  assumed they'd exist.
- **Persisted shape**: polygon points and panel-layout rows go into
  `ProjectImagery.geometry` (already `Json`, already exists, no migration needed for this
  part) as:
  ```ts
  interface ProjectGeometry {
    outline: { lat: number; lon: number }[];       // polygon vertices, in order
    panelRows: { lat: number; lon: number; rotationDeg: number }[][]; // one array per row
    manualOverride: boolean; // true once the installer drags/rotates past the auto-fill
  }
  ```
  The three named pins (`technicalRoomPointLat/Lon`, `meterPointLat/Lon`,
  `earthPitPointLat/Lon`) and the polygon centroid (`gpsLat`/`gpsLon` — the project's single
  site GPS per the master spec §4) use `ProjectSite`'s own dedicated columns, already present
  — not duplicated into the JSON blob. `ProjectSite.installationPointLat/Lon` is a separate,
  pre-existing optional field not written by this editor in this slice (its exact purpose
  predates this sub-project and isn't part of the map editor's own data model).
- **Standard tier gate**: the map editor component itself checks `project.tier` (already on
  the `Project` model) and renders only a single draggable pin (no polygon tool, no panel
  layout) when `tier === 'STANDARD'` — enforced in the component, not a separate route, since
  both tiers share the same map/search/locate chrome and only the drawing tools differ.
- **No live PVGIS/production call from the editor** — placing panels is purely geometric in
  this slice; the simulation that uses the resulting layout is sub-project #7's job.
- **Client-side only, no new Server Action for saving** — the editor accumulates all edits
  (polygon points, pin positions, panel rows) in local React state and writes the whole
  `ProjectGeometry` + pin coordinates in one `saveMapDataAction(projectId, formData-equivalent
  JSON)` Server Action on an explicit "Enregistrer" button, not on every drag — continuous
  autosave-per-drag would spam the database with writes for a UI interaction with no
  correctness requirement to persist every intermediate state.

## 3. Package/route structure

```
packages/engine/src/
  panel-layout.ts          — computePanelLayout(), computeRowSpacingM() (new, pure, tested)

apps/web/app/
  (app)/
    projects/[id]/
      map/
        page.tsx            — Server Component: loads project + existing geometry, tier
        map-editor.tsx       — 'use client' — the actual Leaflet map + drawing tools
        actions.ts            — 'use server' — saveMapDataAction
```

`projects/[id]/` as a path segment anticipates the eventual project-detail/creation flow (not
yet built — that's a separate, larger piece per the original decomposition) but this sub-
project only adds the `map/` sub-route under it, which is enough to be independently useful
and testable without blocking on the full project CRUD flow existing first. A project row must
already exist (created directly in the database for this slice's own verification, same as
prior sub-projects' ad hoc verification users) for this route to have anything to load.

## 4. Map editor flow

1. `map/page.tsx` (Server Component): calls `requireAuthenticatedCompanyUser()` (existing
   guard from sub-project #4, reused as-is — this route lives under the same `(app)` group),
   loads the `Project` (tier, companyId ownership check — a company must only ever load its
   own projects, enforced by `where: { id: projectId, companyId: user.companyId }` in the
   query, not just by convention), its `ProjectSite` (existing pin/GPS columns) and
   `ProjectImagery` (existing `geometry` JSON, possibly `null` on a brand-new project). Passes
   all of this as props into `map-editor.tsx`.
2. `map-editor.tsx` (Client Component): renders the Leaflet map centered on the project's
   existing `gpsLat`/`gpsLon` if set, otherwise a default Tunisia-wide view. A search box
   (free-text) uses a geocoding call — **this slice stubs geocoding as a no-op with a clear
   "Recherche non disponible" message** rather than wiring a second external API (Esri's own
   geocoding service is a *separate* paid API from World Imagery tiles, and adding it is new
   external-service scope this spec's own §1 doesn't call for); the "use my location" browser
   geolocation API is used instead, since it requires no third-party service at all and covers
   the realistic case (installer standing at the site with a phone).
3. **Premium tier**: a "Dessiner le contour" button starts polygon-drawing mode (click to add
   vertices, click near the first vertex or a dedicated "Terminer" button to close it).
   Completing the polygon computes its centroid (arithmetic mean of vertices — adequate for the
   roughly-convex, roof-sized polygons this editor targets, not a general-purpose
   centroid-of-arbitrary-polygon formula) and area (standard shoelace formula), writes the
   centroid into the component's local `gpsLat`/`gpsLon` state (not yet saved to the database
   until "Enregistrer").
4. Three pin tools ("Local technique", "Compteur STEG", "Piquet de terre") each place one
   draggable marker; dragging updates that pin's local lat/lon state.
5. "Remplissage automatique" (enabled once a polygon exists and the project's `ArrayConfig`
   has a module + count): calls `computePanelLayout()` from `@dossipv/engine` with the
   polygon's vertices, the project's module count/dimensions/tilt/azimuth, and the polygon
   centroid's latitude; renders the returned rows as draggable/rotatable rectangles. Dragging
   or rotating any row sets `manualOverride: true` in local state (informational only in this
   slice — nothing currently branches on it besides being saved alongside the geometry for a
   future consumer to use, e.g. "don't silently re-run auto-fill over an installer's manual
   edits").
6. **Standard tier**: steps 3 and 5 are not rendered at all — only the search/locate chrome and
   a single draggable "Position de l'installation" pin, writing directly to `gpsLat`/`gpsLon`.
7. "Enregistrer" calls `saveMapDataAction(projectId, geometryJson, pinCoordinates)`: upserts
   `ProjectSite`'s pin columns and `gpsLat`/`gpsLon`, upserts `ProjectImagery.geometry` with
   the `ProjectGeometry` shape from §2 (Premium tier only — Standard tier's save skips the
   `ProjectImagery` write entirely, since there's no polygon/panel data to persist), redirects
   back to the same page (consistent with every other mutation in this app already redirecting
   rather than revalidating).

## 5. Panel layout algorithm (`@dossipv/engine`)

`computeRowSpacingM(tiltDeg: number, moduleLengthM: number, latitudeDeg: number): number` —
pure function, the formula from §2's decision. Returns the minimum center-to-center row
spacing in meters that avoids one row shadowing the row behind it at winter-solstice solar
noon for the given latitude.

`computePanelLayout(polygon: {lat,lon}[], moduleCount: number, moduleLengthM: number,
moduleWidthM: number, tiltDeg: number, latitudeDeg: number): PanelLayoutResult` — converts the
polygon's lat/lon vertices to a local flat-earth meter-based coordinate system (adequate at
roof scale — the curvature error over tens of meters is negligible for this purpose, unlike
the dossier's own GPS-precision requirements elsewhere), places south-facing module rows
(each row's long edge oriented east-west, modules placed side by side along that edge) starting
from the polygon's northern edge, spaced per `computeRowSpacingM()`, stopping once
`moduleCount` modules have been placed or no more rows fit within the polygon's bounding box
(whichever comes first), then converts each placed module's corner points back to lat/lon.
Returns `{ rows: {lat,lon,rotationDeg}[][], placedCount: number, fitsAllModules: boolean }` —
`fitsAllModules: false` signals to the UI that the polygon is too small for the project's full
module count, which the editor surfaces as a warning rather than silently truncating the array
without telling the installer.

## 6. Testing

`computeRowSpacingM()` and `computePanelLayout()` are pure functions with no I/O — fully
unit-testable in `@dossipv/engine`'s existing Vitest setup, same pattern as every other
calculation in that package. Test cases: a known-latitude/tilt pair against a hand-computed
expected spacing; a polygon too small for the requested module count (`fitsAllModules: false`);
a polygon exactly large enough for one row; module count not evenly divisible by one row's
capacity (partial last row).

`saveMapDataAction` is unit-testable the same way every other Server Action in this repo is
(mock `@dossipv/db`, `next/navigation`), including a tenant-isolation test (an action call for
a project belonging to a different company must fail/no-op, not silently write — this is the
same class of check sub-project #4's own Review Focus named for its layout guard, applied here
to a cross-tenant write instead of a missing-session read).

**Not tested at this layer** (same honest caveat as every prior sub-project's spec): the actual
Leaflet map rendering, real mouse/touch drag interactions, real browser geolocation. This
editor's own interactive correctness is the one piece in this sub-project that most needs an
actual human click-testing pass in a browser — flagged explicitly here so the implementation
plan's own verification task treats "open it in a real browser and draw a polygon" as a
required step, not an optional nice-to-have, since curl-based verification (this session's
usual substitute) cannot exercise mouse-drag drawing at all.

## 7. Open items for the implementation plan to resolve

- Exact French copy for every button/label/warning message.
- Whether `fitsAllModules: false` should block saving entirely or just warn — this spec leaves
  it as a warning (non-blocking), consistent with how `@dossipv/engine`'s own WARN-level checks
  work elsewhere (never silently drop data, but don't force the installer into a corner either)
  — the plan should implement it as WARN-level, matching that established pattern, unless a
  reason emerges during implementation to escalate it.
