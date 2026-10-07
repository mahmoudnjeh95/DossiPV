# DossiPV — Installer Library, Tunisian Catalog Import & Auto-Sizing Design Spec

## 1. Purpose and scope

Goal: an installer enters almost nothing and DossiPV proposes the ideal installation from the
equipment the installer actually has. Three parts, built and planned in this order (each part
gets its own implementation plan). Build order, per the user on 2026-10-07: Part 2 first (catalog
import), then Part 1, then Part 3.

1. **Installer library** — each company keeps its own library: equipment picked from the shared
   catalog plus its own private equipment, with an optional purchase price.
2. **Tunisian catalog import** — fill the shared catalog with the equipment accepted in Tunisia
   (ANME panel list, STEG inverter list) with characteristics extracted from manufacturer
   datasheets, published only after super-admin review.
3. **Auto-sizing** — from the client's consumption, subscribed power, phases and the map, search
   the installer's library for valid installations, rank them by an objective the installer
   picks, and pre-fill the project sections.

Out of scope: price web-scraping (no public prices exist for grid inverters / DC protections in
Tunisia — see §6), micro-inverters, batteries / off-grid sizing, and the pending "Opus designs
and reviews the drawings" work (separate spec).

### Decisions taken with the user (2026-10-07)

- The installer chooses the optimisation objective per project: (1) closest to the need,
  (2) lowest cost, (3) maximum production.
- The installer's library = its private equipment + the shared-catalog items it added. Sizing
  searches **only** that library.
- Cable lengths are computed from the map pins and editable. Vertical runs use the building
  level: RDC = 3.5 m, R+1 = 7 m, R+2 = 10.5 m, i.e. `(floors + 1) × 3.5 m`.
- Prices come from the installer (purchase price on each library entry), not from scraping. Every
  price starts at 0 and the installer updates it later.

## 2. Part 1 — Installer library

### Data model

New table `LibraryItem` (one row = one equipment item in one company's library):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `companyId` | FK Company, cascade delete | |
| `kind` | enum `EquipmentKind` | PV_MODULE, INVERTER, SPD, DC_SWITCH, DC_FUSE, AC_BREAKER, AC_ISOLATOR, CABLE, ACCESSORY |
| `pvModuleId` … `accessoryId` | 9 nullable FKs, cascade delete | exactly one is set, matching `kind` (SQL `CHECK` in the migration) |
| `purchasePriceTnd` | Float, default 0 | per unit; per metre for cables; 0 = not yet entered |
| `createdAt` | timestamp | |

Unique `(companyId, <fk>)` per FK column (Postgres treats NULLs as distinct, so nine
`@@unique` constraints work). Real FKs rather than a polymorphic `equipmentId` keep referential
integrity and cascade on catalog deletion.

- Creating a private item (owner = company) always creates its `LibraryItem` in the same
  transaction. The library is therefore the single source of truth for "what this company can
  use".
- New helper `libraryScope(companyId, kind)` replaces `catalogScope` in every section page and
  section action (selects and server-side validation). `catalogScope` stays for the browse view.
- A project keeps referencing equipment that was later removed from the library: section
  selects always include the currently saved item, labelled "(hors bibliothèque)".

### Backfill migration

For every company: insert a `LibraryItem` for (a) every private item it owns, and (b) every
shared item referenced by any of its projects (array module/inverters, protections, cable runs,
earthing cable/block, cabling connector/tray). No existing project breaks.

### UI (`/library`)

- **Ma bibliothèque** (default tab): per equipment type, the company's items with price (inline
  edit) and "Retirer". Private items also get "Modifier" / "Supprimer" (delete refused while a
  project uses the item).
- **Catalogue partagé**: searchable list per type (brand / model / power), "Ajouter" button,
  "Déjà ajouté" badge, homologation validity shown.
- **Nouveau matériel**: the same 9 forms as the super-admin equipment pages, extracted into
  shared components under `apps/web/components/equipment/`; the installer action sets
  `ownerCompanyId = companyId`.

## 3. Part 2 — Tunisian catalog import

### Sources (as of 2026-10-07)

- Panels: ANME list of 24/07/2026 — 422 models, 72 manufacturers, 366 valid today. Gives
  manufacturer, model, certification body, IEC 61215/61730 reference, validity end date. No
  electrical data.
- Inverters: STEG list V1.62 (July 2026) — about 600 models; manufacturer, model, AC power,
  acceptance end date. No electrical data.
- Characteristics: manufacturer datasheets (one datasheet usually covers a model family, so
  roughly 100–150 datasheets in total).
- Cables: no official list. Generic entries (H1Z2Z2-K DC, U1000 R2V AC, earth conductor) with
  Iz per section and reference method from IEC 60364-5-52 tables.
- Protections (DC/AC SPD, DC switch, DC fuse, AC breaker, AC isolator): curated list of
  brands commonly sold in Tunisia (Schneider, ABB, Hager, Chint, Suntree, …) from their
  datasheets.

### Pipeline (`packages/catalog-import`, CLI scripts, never run by the web app)

1. **Parse lists** — `pdftotext -layout` + a parser per list → `data/catalog/sources/anme-panels.json`
   and `steg-inverters.json` (brand, model, homologation reference, validTo, stegApproved).
   Parser tests run on committed text fixtures of the real lists.
2. **Find datasheets** — per model family, a datasheet URL recorded in
   `data/catalog/datasheets.json` (manually curated where search fails; the URL is the
   evidence).
3. **Extract** — pdftotext the datasheet, ask `claude-opus-5-5` for structured output matching
   the `PvModule` / `Inverter` fields, one record per model in the family, each field with the
   datasheet page it came from. Missing fields stay null; nothing is guessed.
4. **Validate** — sanity rules reject or flag a record: Vmp < Voc, Imp < Isc,
   |Pmax − Vmp×Imp| ≤ 3 %, coefficient ranges (Voc −0.2…−0.35 %/°C, Isc 0…0.1 %/°C),
   mpptMin < mpptMax ≤ vdcMax, pacW ≤ sacVA, model power matches the official list.
5. **Output** — `data/catalog/<type>.json`, committed, reviewable in a diff.
6. **Import** — `catalog-import import` upserts shared items by (brand, model), uploads the
   datasheet PDF to file storage (`datasheetFileId`), sets homologation fields / `stegApproved`,
   and creates items with `catalogStatus = DRAFT`.

### Review and publication

- New column `catalogStatus` (DRAFT | PUBLISHED, default PUBLISHED so existing items are
  unaffected) on the 9 equipment tables. Installers only see PUBLISHED shared items.
- Super-admin page "Catalogue à valider": each draft next to its datasheet PDF, flagged fields
  highlighted, "Publier" / "Corriger" / "Rejeter". Bulk publish per family once one model has
  been checked.
- Re-running the import refreshes homologation dates. Items no longer on a list are marked
  expired (never deleted — projects reference them). Engine check C20 (expired homologation)
  is currently fed an empty list; it gets wired to the real expiry dates.

## 4. Part 3 — Auto-sizing

### Inputs

- Client: `annualConsumptionKWh`, `subscribedPowerKVA` (both exist; become required for sizing).
- Site: GPS, phases, tilt (default 30°), azimuth (default 0 = south), **new `floors` field**
  (RDC = 0) shown as "RDC, R+1, R+2 …"; `buildingHeightM = (floors + 1) × 3.5`.
- Map pins: installation point, technical room, meter.
- Project: **new `sizingObjective`** enum CLOSEST_TO_NEED (default) | LOWEST_COST | MAX_PRODUCTION.

### Lengths from the map

- DC run = ground distance(installation point → technical room) × 1.2 + building height.
- AC run = ground distance(technical room → meter) × 1.2.
- Rounded up to the metre, minimum 1 m; shown editable on the proposal screen. A missing pin
  falls back to 10 m and is flagged "à vérifier". (The earth conductor length is not used by
  any calculation or document, so it is not computed.)

### Search (pure function in `packages/engine/src/sizing.ts`)

`proposeInstallations(input, library) → { proposals: Proposal[]; noSolutionReasons: string[] }`

1. Specific yield (kWh/kWc/year) from PVGIS for the GPS/tilt/azimuth (existing client and
   cache), passed in by the caller so the function stays pure.
2. Target DC power = consumption ÷ yield.
3. Candidates: each library module × each library inverter (1 to 3 identical units), phases
   compatible under the STEG rules below.
4. Module count N: CLOSEST/LOWEST_COST scan around the target; MAX_PRODUCTION scans up to the
   limits (ratio ≤ 1.3, subscribed power, roof capacity from the map outline's panel layout
   when an outline exists).
5. String layout: split N across MPPTs with ns in [NS_MIN, NS_OPT_MAX] and np ≤ NP_OPT, equal
   strings preferred.
6. Protections: per type, the cheapest priced item (else the smallest rating) from the library
   that passes its checks (C08–C15); DC fuse only when required, AC isolator only when more than
   one inverter.
7. Cables: the smallest library section passing Iz (C13/C16) and voltage drop (C17) for the
   computed lengths.
8. Run the full engine on each complete candidate; keep those with no BLOCK failure.
9. Rank: CLOSEST — |production − consumption|, then fewer inverters, then |ratio − 1.15|, then
   cost. LOWEST_COST — total cost (modules + inverters + protections + cable × length), then
   closeness. A price of 0 counts as "not entered": LOWEST_COST stays selectable but the screen
   warns and lists the items still at 0, since they would look free. MAX_PRODUCTION —
   production, then cost.
10. Return the top 3 with a short French explanation each. With no valid candidate, return the
    most frequent blocking reasons (e.g. "aucun onduleur triphasé dans votre bibliothèque",
    "puissance souscrite trop faible").

Enumeration is capped (e.g. 20 000 candidates) and is a few milliseconds for realistic
libraries.

### New STEG rules in the engine

- New check C23 (BLOCK): total inverter AC power ≤ subscribed power.
- C19 relaxed: a single-phase inverter on a three-phase site passes when its AC power is
  ≤ 1/3 of the subscribed power and ≤ 6 kVA.
- Both require `subscribedPowerKVA` in `RunEngineInput` (optional; when absent, C23 is skipped
  and C19 keeps today's strict rule).

### UI

New project section "Dimensionnement" between Site and Champ PV: objective selector, the
computed lengths (editable), "Calculer", then the 3 proposals (modules × count, inverter(s),
strings, protections, cables, estimated production, ratio, cost when available). "Appliquer"
overwrites the Array, Protections, Cabling and Earthing-cable sections after a confirmation;
the installer can still edit every section afterwards.

## 5. Testing

- Part 1: `libraryScope` unit tests; section actions reject equipment outside the library;
  backfill migration test on a seeded DB (every project's equipment ends up in its company's
  library); private-item delete refused while used.
- Part 2: list parsers on committed text fixtures of the real ANME/STEG lists; validation rules
  on good/bad records; extraction with a mocked Anthropic client; idempotent import (second run
  changes nothing).
- Part 3: `proposeInstallations` on fixture libraries, including the reference example
  (3 000 kWh/yr, single-phase → about 2 kWc, 5 × 450 W in one string, 2 kW inverter), a
  three-phase site where only the 1/3-of-subscribed rule allows a single-phase inverter, a
  library with no compatible inverter (reason returned), and objective-specific ranking; length
  computation from pins; C19/C23 unit tests; existing fixtures unchanged when
  `subscribedPowerKVA` is absent.

## 6. Risks and notes

- Datasheet extraction errors would silently corrupt every dossier using that item, hence the
  DRAFT → PUBLISHED review and the sanity rules. Nothing imported is visible to installers
  before a super-admin publishes it.
- Price scraping was investigated (Tunisianet, Primini, Spacenet): only UPS units and portable
  panels have public prices; grid inverters and DC protections are sold on quote. Matching
  listings to catalog models would be unreliable. Revisit only as an indicative-price hint.
- Production migrations are applied by hand (`npm run migrate:deploy` through the tunnel); the
  deploy workflow does not run them. Each part's plan must include that step.
- Datasheets are public manufacturer documents; the stored copy keeps its source URL.
