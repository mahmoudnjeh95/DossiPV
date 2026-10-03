# DossiPV — Design Spec

Status: approved by user (2026-10-02). Placeholder product name "DossiPV" and no logo yet — both are config values, swap later with no code change.

## 1. Purpose and scope

DossiPV is a hosted web app (works well on phone browsers, no native app) that Tunisian PV
installers subscribe to, to generate STEG BT ("Basse Tension") grid-connection technical
dossiers for their own clients — the same kind of dossier as the reference file
`Dossier Technique - 434 - 303 - Habib Khedhira.pdf` (not committed to git; contains a real
client's personal data — see `.gitignore`).

**Version 1 scope:** grid-connected BT installations only, French only. Isolated/off-grid
sites (battery sizing) are out of scope for v1 — the schema (`pv_dossier_input_schema.json`)
already reserves an `offGrid` section for a future v2, once a reference isolated-site dossier
is available to model the template on.

**Two sellable tiers**, both producing a complete dossier:
- **Standard** — no auto-generated implantation/situation plan images (pages 37–38 of the
  reference dossier are empty title-block frames the installer fills in by hand later).
- **Premium** — pages 37–38 are generated from a map-based editor (satellite image, drawn
  roof/ground outline, pins, panel layout).

All dossier numbers, the 22 validation checks (C01–C22), and the production simulation are
computed in deterministic code. Claude is used only to write descriptive prose from already-
validated data, and never sees client personal data (name, CIN, address, STEG reference).

## 2. Architecture

Single Next.js (TypeScript) codebase, deployed as containers on one VPS (not serverless —
document generation needs a background worker and LibreOffice).

| Component | Role |
|---|---|
| **web** | Installer-facing app, super-admin panel at `/admin`, auth, REST/RPC API |
| **engine** | Pure TypeScript package: formulas, C01–C22 checks, production simulation. No I/O. Imported by both the browser (live validation while filling the form) and the worker (final calculation at generation time) — the single source of truth for every number in a dossier. |
| **worker** | Separate Node process consuming a PostgreSQL-backed job queue (pg-boss). Runs the document generation pipeline (§5). |
| **PostgreSQL** | Companies, users, plans, payments, shared + private equipment catalog, projects, dossier history, Claude usage/cost log. |
| **File storage** | Uploads (certificates, datasheets, CIN, bills) and generated dossier files (docx/pdf). Local disk with a documented path layout for v1; swappable for S3-compatible storage later without schema changes. |

### Super-admin (`/admin`)

A separate role, not visible to installer accounts, logged in separately from any company.

- **Installer list:** company name, plan, subscription status/end date (highlighted <7 days
  or expired), dossiers generated (this month / total) against plan limit, Claude token spend
  and $ cost (this month / total), last login.
- **Installer detail page:** edit company details and login email; set a new password
  (passwords are hashed — admin cannot view the current one); activate/extend/suspend
  subscription; record a manual payment; view full payment history; view that company's
  dossier list (opening an actual dossier file is allowed per user's explicit decision —
  these contain client PII, so access to `/admin` itself must be tightly restricted to the
  owner).
- **Shared equipment catalog:** add/edit panels, inverters, SPDs, breakers, cables, etc.
  (reuses the `EquipmentLibrary` schema from `pv_dossier_input_schema.json`).
- **Settings:** active map provider (`google` | `esri`), active Claude model, plan definitions
  (name, monthly dossier limit, price, which tier it unlocks).
- **Dashboard:** active installers, dossiers/month, Claude cost/month, revenue.

Every Claude API call is logged against the installer and dossier it was made for (model,
input/output tokens, computed cost), which is what the admin token/cost figures are built
from.

## 3. Data model

`pv_dossier_input_schema.json` (committed in repo root) is the authoritative shape for a
project's input data — `companySettings`, `equipmentLibrary`, `project` — and its `x-rules`
block is the authoritative source for every formula and check. The PostgreSQL schema mirrors
these three objects plus the operational tables layered on top (users, plans, payments, jobs,
dossier history, Claude usage log). Equipment library is **shared + private**: a global
catalog maintained by the super-admin, plus per-company private items visible only to that
company; a project can reference either.

## 4. Calculation engine

A standalone, dependency-free (no DB/network) TypeScript package covering:

- Module electrical corrections at Tmin/Tmax (Voc, Vmp, Isc, Imp), using `tempCoeffPmaxPct`
  for Vmp correction per the schema's `VMP_TMIN`/`VMP_TMAX` formulas (not `tempCoeffVocPct`,
  which was the error found in the reference dossier).
- Ns min/optimal/max, Np max/optimal, DC/AC power ratio.
- Fuse necessity (`NC_MAX_NO_FUSE`, `DC_FUSE_REQUIRED`).
- SPD, switch, breaker, isolator sizing checks.
- Cable ampacity (`IZ_CORRECTED` via K1–K4 factors) and DC/AC voltage drop.
- Ballast stability (`STABILITY_LHS`/`STABILITY_RHS`), with the 339/196 N/m² constants
  flagged as valid only at 120 km/h wind, 30° tilt — any other wind speed or tilt requires
  the installer to supply recomputed coefficients (from their inspection office) before
  generation is allowed.
- All 22 checks (C01–C22) exactly as listed in `x-rules.checks`, each tagged BLOCK (disables
  Generate, names the field to fix) or WARN (must be acknowledged, never printed in the
  dossier).
- A single GPS value (`site.gps`) is the only source of coordinates anywhere in the dossier —
  cover page, situation plan, and simulation all format from it, preventing the
  cover/plan/PVsyst mismatch found in the reference dossier.

**Live validation:** because the engine is pure TypeScript with no server dependency, the
exact same code runs client-side while the installer fills the form (instant feedback, e.g.
"Ns must be 6–14 for this inverter") and server-side in the worker at generation time —
guaranteeing the two can never disagree.

**Production simulation (replaces the PVsyst annex):** the app generates its own production
study page under its own name (not presented as PVsyst), computed as follows:
1. Fetch a typical-year hourly weather dataset from the free PVGIS API for the project's GPS
   point.
2. Run an hourly simulation in the engine: plane-of-array irradiance from tilt/azimuth, angle-
   of-incidence losses, cell temperature, the actual module's temperature coefficients, the
   actual inverter's efficiency curve, and cable losses derived from the engine's own voltage-
   drop results (not a generic assumed loss figure).
3. Derive the full 8-column monthly table (GlobHor, DiffHor, T_Amb, GlobInc, GlobEff, EArray,
   E_Grid, PR) and both charts (normalized production bar chart, PR bar chart) matching the
   reference PVsyst page's layout and content, rendered under the app's own branding.
4. Validate this simulation path once during implementation against the reference dossier's
   PVsyst result (4,760 kWh/year at PVsyst's coordinates) as a correctness check, and keep an
   "upload your own PVsyst PDF" fallback (`Simulation.source = PVSYST_UPLOAD`) in case STEG/
   ANME ever requires it — confirming STEG's actual current requirement is a follow-up outside
   this spec.

**Testing:** the engine ships with a test fixture built from the reference dossier's inputs,
asserting against hand-corrected values for all 7 errors identified during analysis (GPS
mismatch, inverter model/breaker mismatch, DC switch rating mismatch, Vmp temperature
coefficient, Ns optimal exceeding inverter max voltage, AC voltage drop decimal error, module
weight/power ratio arithmetic).

## 5. Document generation pipeline

Triggered by the installer's "Generate" action; runs as a background job in the worker.

1. **Snapshot** — freeze the project's input data and the exact equipment records used (so
   later catalog edits never change an already-generated dossier).
2. **Simulation** — run the production simulation (§4), cache PVGIS weather data per location.
3. **Claude text** — one call returning a fixed set of sections (introduction, solution
   description, cabling/earthing/structure description, conclusion) in the reference dossier's
   style. Receives only technical/validated data — never client name, CIN, address, or STEG
   reference. The prompt instructs numeric values to be emitted as named placeholders (e.g.
   `{P_DC}`); the worker substitutes every placeholder from the engine's output and rejects any
   draft that still contains a raw number, guaranteeing all figures originate from code, never
   from the model. Generated text is editable in the app before/after generation; regenerating
   reuses saved text unless the installer explicitly requests a rewrite.
4. **Drawings** — single-line diagram and panel/DC-box/AC-box wiring diagrams are built as SVG
   directly from the project's actual strings/protections, rendered to PNG. Premium additionally
   renders pages 37–38 from the map editor's stored outline/pins/panel-layout data (fetching a
   fresh satellite image at generation time — see §7); standard gets empty title-block frames.
5. **Word fill** — a single `.docx` template (structurally matching the reference dossier) is
   filled with repeated blocks per inverter/MPPT/cable run and conditional sections (fuse
   section only if `DC_FUSE_REQUIRED`; AC isolator section only if more than one inverter).
6. **PDF** — LibreOffice headless converts the filled Word file to PDF and refreshes the table
   of contents.
7. **Annexes** — ANME accreditation certificate, admin documents (CIN/contract/bill), and every
   used equipment item's datasheet + homologation letter are merged into the PDF.
8. **Save** — `dossier.docx`, `dossier.pdf` (with annexes merged), `annexes.pdf` (standalone),
   revision number, and the full input snapshot are written to history.

**Quota rule:** one project counts as one dossier against the monthly plan limit regardless of
how many times it is regenerated. Client name and STEG reference lock after first generation
to prevent reusing one project slot across different clients.

**Failure handling:** network-dependent steps (PVGIS, Claude) auto-retry; a failed job surfaces
the failing step and reason to the installer and does not consume plan quota.

**Branding:** every generated page carries the installer's own company logo/details (from
`companySettings`) — never the app's. The one exception is the production simulation page,
labeled under the app's own name since it replaces the PVsyst-branded annex.

**Default Claude model:** Claude Opus 5.5, ~$0.10/dossier for text generation, ~$0.02–0.03 per
uploaded certificate for structured-output field extraction. Switchable from `/admin` (Sonnet/
Haiku) without a code change.

## 6. Map provider

Both **Google Maps Platform** (Static Maps API + JS Maps/Drawing Library) and **Esri World
Imagery** are implemented behind one internal interface (fetch a satellite image for a
bounding box; geocode an address), selectable per-deployment from `/admin`
(`mapProvider: "google" | "esri"`). Google is recommended as the default for its Tunisia
imagery quality and unambiguous commercial/print terms (Maps Platform is the paid, revenue-
generating-use-permitted tier — the free "business documents" allowance does not clearly cover
an app generating client dossiers at scale); Esri's commercial/print terms for this use case
should be confirmed directly with Esri before enabling it as default. Provider attribution
(the "Google" wordmark, or Esri's required credit) is baked into the rendered page and must
never be cropped out.

Stored project data (polygon points, pin coordinates, panel layout) is provider-agnostic —
plain coordinates, not a saved image — so the satellite image itself is fetched fresh at
generation time and a deployment can switch providers without invalidating existing projects.

## 7. Map editor (premium tier)

1. **Find the site** — search box (geocoding) or phone GPS ("use my location"), centered on
   the active provider's satellite layer.
2. **Draw the outline** — installer taps ≥3 points around the roof/ground installation area;
   polygon auto-closes.
3. **Derived values** — centroid becomes `site.gps` (the project's single GPS source, §4);
   polygon area in m²; default orientation from the longest edge (installer can override).
4. **Pins** — local technique (`site.technicalRoomPoint`), STEG meter (`site.meterPoint`),
   earth pit (`site.earthPitPoint`) — tap to place, drag to adjust.
5. **Panel placement** — auto-fill mode places rows inside the outline from the project's
   module count/dimensions (south-facing, row spacing avoiding self-shading on flat roofs);
   installer can then drag/rotate individual rows, or switch to fully manual placement.
6. **Persisted as data**, not an image (§6) — `imagery.panelPolygon`, `imagery.markers` in the
   schema.

**Standard tier:** single pin only (sets `site.gps`), no polygon, no panel layout, no page
37/38 generation (empty frames instead, per §5 step 4).

## 8. Plans, payments, and accounts

**Plans** — configurable from `/admin`, not hardcoded: name, monthly dossier limit, price,
which tier (Standard/Premium) it unlocks. A company holds exactly one active plan; switching
plans takes effect immediately, with the current month's usage carried over against the new
limit.

**Subscription state** per company: `planId`, `status` (active/expired/suspended),
`periodStart`, `periodEnd`. **No automatic renewal** — on `periodEnd`, status flips to
`expired`; the company can still view history but cannot generate until renewed.

- **Manual renewal** — super-admin records a payment (amount, method, note) in `/admin` and
  sets a new `periodEnd`.
- **Online renewal** — a "Renew" button in the installer app opens a Tunisian payment gateway
  checkout (Konnect, to be confirmed as the specific integration at build time) for the plan's
  price; a webhook on success extends `periodEnd` by one period and logs the payment with the
  gateway's reference.
- Both paths write to one `payments` table, so `/admin` shows a unified history regardless of
  collection method.

**Accounts** — one login (email + password) per company, as the shared workspace for that
installer's team; super-admin is a separate login, not listed among companies. Super-admin can
reset a company's password or login email from `/admin`.

**Notifications** — email + in-app banner at 7 days and 1 day before `periodEnd`, and again on
expiry.

## 9. Compliance notes (outside this spec's build scope, flagged for the user to resolve)

- **Personal data (CIN, STEG contract, bills, client address)** falls under Tunisia's 2004
  data-protection law (INPDP oversight). Hosting location and any INPDP authorization
  requirement is the user's call to confirm — the design minimizes exposure by never sending
  this data to Claude, but storage/hosting jurisdiction is unresolved here.
- **STEG/ANME acceptance of a non-PVsyst production simulation** is unconfirmed — the upload
  fallback in §4 exists specifically to de-risk this until confirmed.
- **Esri commercial/print licensing** for this specific use case (satellite imagery embedded
  in a commercial document, at scale) should be confirmed with Esri before Esri is set as the
  default/only provider for any installer.

## Out of scope for v1 (explicitly deferred)

- Isolated/off-grid site dossiers (needs a reference dossier first).
- Native mobile apps (phone-browser web app only).
- Automatic subscription renewal/recurring billing.
- Multiple user logins per company (role-based access).
