# DossiPV — From a STEG Bill to a Dossier Technique (Design Spec)

Date: 2026-10-21. Builds on `2026-10-07-installer-library-catalog-import-auto-sizing-design.md`
(Part 2 "catalog import" and Part 3 "auto-sizing"); this spec replaces Part 3's UI and narrows
its scope. Part 1 (installer library) stays deferred.

## 1. Intent

A Tunisian installer meets a client, photographs the client's STEG electricity bill, and wants
a dossier technique STEG will accept — with as little typing as possible. The installer's only
decisions are: **which installation the client approves**, then **where things are on the
satellite map**. Everything else is read from the bill, computed, or defaulted.

Success = for a real bill (reference case: Mr Mabrouk Mbarki, Metlaoui, bill of 2023-06-12), the
app produces a dossier that a STEG reviewer would accept, and an installer finds the flow simple.

## 2. Decisions taken with the user (2026-10-21)

- The bill is **imported** (photo or PDF) and **read by AI**; the installer does not type the
  client's data.
- The installer **only selects one of the possible installations** (after the client approves it).
- **Single-phase BT only** ("abonné monophasé, lumière"). Three-phase and MT are out of scope.
- Subscribed power ladder for single-phase BT (STEG meter codes 2xx, 220 V 2 fils):

  | Code | Calibre (A) | Puissance (kVA) |
  |---|---|---|
  | 202 | 10 | 2 |
  | 203 | 15 | 3 |
  | 204 | 20 | 4 |
  | 207 | 30/32 | 7 |
  | 210 | 45 | 10 |
  | 214 | 63 | 14 |
  | 222 | 100 | 22 |
  | 227 | 125 | 27 |
  | 235 | 160 | 35 |
  | 250 | 225 | 50 |

- **GPS points are set after the client picks an installation**, on the satellite map, **each
  point in its own colour**.
- The shared equipment catalog must hold **real data** (the official ANME/STEG lists + datasheets)
  and **all test equipment must be deleted** from it.
- Work is carried out by five agents: (1) implementer, (2) code reviewer, (3) STEG reviewer who
  judges the generated dossier, (4) facilitator who gathers all feedback into improvements,
  (5) installer/user who judges simplicity.

## 3. Calls made by Claude (user can override)

- Proposals use the **shared catalog** (PUBLISHED items only), not a per-company library.
- Sizing before the GPS points exist uses the **governorate capital's coordinates** (from a
  static table of Tunisia's 24 governorates) — solar yield barely varies inside a governorate.
  Production is recomputed with the exact GPS once the points are placed.
- Annual consumption = bill kWh × 12 / months billed, always labelled
  "estimation à partir de N mois de facture".
- A subscribed power not on the ladder (e.g. the reference bill's "13") is **kept as read and
  flagged** ("puissance souscrite inhabituelle pour un abonné monophasé — vérifier"), never
  silently rounded.
- Map points, all tiers (they drive cable lengths): **Champ PV = yellow**, **Local technique /
  onduleur = blue**, **Compteur STEG = red**, **Piquet de terre = green**. The roof polygon,
  panel auto-fill and pages 37–38 stay Premium-only.
- The proposal screen shows what a client needs to say yes: power (kWc), number and model of
  panels, inverter model, estimated yearly production, coverage of the consumption (%), roof area
  needed (m²) and estimated yearly saving (TND, from the bill's own average price per kWh). No
  equipment prices exist yet (prices are Part 1), so no installation price is shown.
- Bill reading uses `claude-opus-5-5` with image/PDF input and structured output (same SDK
  pattern as `packages/dossier-worker/src/generate-page-37-layout.ts`).

## 4. Piece A — Real shared catalog

### A1. Finish the catalog import

Execute the remaining tasks (2–11) of `docs/superpowers/plans/2026-10-07-tunisian-catalog-import.md`
as written, on branch `feat/catalog-import`. Task 11's datasheet priority for this spec:
**single-phase string inverters on the STEG list (1–10 kW)** and the panel brands most sold in
Tunisia, plus the curated cables and protections a single-phase residential install needs
(DC switch, DC SPD, DC fuse, AC breaker 2P, AC SPD 1P+N, AC isolator, H1Z2Z2-K, U1000 R2V,
earth conductor).

### A2. Delete the test equipment

New CLI command `catalog-import purge-test-items` (dry run by default, `--apply` to delete):

- A shared item (`ownerCompanyId = null`) is **test equipment** when it has no import
  provenance (`datasheetSourceUrl` is null) **and** is not in the curated JSON files.
- Dry run prints every candidate by type, brand, model, and the projects referencing it.
- `--apply` deletes only unreferenced candidates; referenced ones are listed and left alone
  (FKs are `Restrict`; the user decides what to do with those projects).
- Production runs (`--apply` against the production database) happen **only after the user has
  read the dry-run list and said yes**.

## 5. Piece B — Bill → proposals → map → dossier

### B1. Flow

1. `/projects/new` opens on **"Importer la facture STEG"** (file input accepting
   `image/jpeg, image/png, image/webp, application/pdf`, `capture` allowed on phones). Manual
   creation stays as a secondary link.
2. Upload → server reads the bill (B2), creates the project (B3), and redirects to
   **"Propositions"**.
3. **Propositions** (B4): up to 3 cards. The installer shows them to the client, then clicks
   "Choisir cette installation" on one. Confirmation → all technical sections are filled (B5).
4. Redirect to **"Emplacements"** (B6): satellite map with the 4 coloured points. When the
   required points are placed: "Enregistrer et générer le dossier".
5. Existing generation (`generateDossierAction` → worker) runs; the dossier appears in the
   project's history as today.

The project page keeps every section editable (existing forms), but the happy path never
requires opening them.

### B2. Reading the bill

`readStegBill(file) → StegBillReading` in a new package `@dossipv/bill-reader`:

- Input: the uploaded file bytes + media type. Validated first (`@dossipv/file-storage`
  `validateUploadedFile`, 10 MB cap, magic bytes); `image/webp` must be accepted.
- Claude call (structured output). Schema fields (null when unreadable — **never guessed**):
  `clientName`, `civility` (M/Mme/Mlle/société or null), `address`, `postalCode`, `city`,
  `stegDistrict`, `governorate` (one of the 24, inferred from city/district — the only inferred
  field, and `governorateInferred: true` says so), `stegReference`, `meterNumber`,
  `periodStart`, `periodEnd`, `monthsBilled`, `subscribedPowerKVA`, `tariffLabel`, `lines[]`
  (`label`, `oldIndex`, `newIndex`, `quantityKWh`, `unitPrice`, `amountHT`, `vatPct`),
  `totalElectricityKWh`, `electricityAmountTND`, `amountDueTND`, and `readingNotes[]`.
- Pure checks after the call (`checkBillReading`), each producing a French warning:
  - Σ `lines[].quantityKWh` = `totalElectricityKWh` (± 1 kWh), and each line's
    `newIndex − oldIndex` = its quantity when both are present;
  - `monthsBilled` matches the period (± 1 month); if missing, derive it from the dates;
  - `subscribedPowerKVA` on the ladder (§2);
  - `stegReference` present;
  - any null required field (`clientName`, `stegReference`, `subscribedPowerKVA`,
    `totalElectricityKWh`, `monthsBilled`).
- Derived: `annualConsumptionKWh = totalElectricityKWh × 12 / monthsBilled`,
  `averagePriceTNDPerKWh = Σ energy amountHT / totalElectricityKWh` (fixed charges excluded).
- If a required field is missing the import still creates the project, and the proposals screen
  shows a short form with **only the missing fields** (this is the only typing ever asked).
- Refusal / API error → French error on the upload screen, nothing created.

### B3. Project creation from a reading

One transaction:

- `ProjectClient`: name, civility, address, city, governorate, STEG reference,
  `annualConsumptionKWh`, `subscribedPowerKVA`, `clientKind = residential`.
- `ProjectSite`: `phases = 1`, `gridType = 'BT'`, `mountingType = 'FLAT_ROOF_BALLAST'` (Tunisian
  flat concrete roofs), `tiltDeg = 30`, `azimuthDeg = 0`, GPS = governorate capital.
- `ProjectAnnexes.lastPaidBillFileId` = the uploaded bill (it is a required STEG annex).
- New table `ProjectBillImport` (1–1 with Project): file id, raw reading JSON, warnings,
  derived values, model id, created at — the audit trail of what the AI read.
- New `Project.flowStep` enum `PROPOSALS | LOCATIONS | READY` (null for manually-created
  projects) so the project page sends the installer back to the right step.

### B4. Proposals

Pure function in `packages/engine/src/sizing.ts`:

`proposeInstallations(input, catalog) → { proposals: Proposal[]; noSolutionReasons: string[] }`

- Input: `annualConsumptionKWh`, `subscribedPowerKVA`, `specificYieldKWhPerKWp`, site temps
  (`tMinC`/`tMaxC`), default cable lengths (DC 15 m, AC 10 m before the points exist),
  `averagePriceTNDPerKWh` (optional), and the catalog: PUBLISHED modules with a valid
  homologation, PUBLISHED **single-phase**, `stegApproved`, non-expired inverters, protections,
  cables.
- Specific yield: from PVGIS `PVcalc` (peak power 1 kWp, 14 % losses, tilt 30°, azimuth 0°) at
  the site GPS, cached like the existing `PvgisWeatherCache`; the caller passes it in so the
  function stays pure. PVGIS failure → 1 600 kWh/kWp with a visible warning.
- Candidates: module × **one** inverter (Claude's call: single-phase residential sites use one
  inverter; multi-inverter layouts are a later iteration), N = ns × strings from the
  string-sizing limits (engine `nsMin`, `nsOptMax`, `npOpt`), strings spread evenly over the
  MPPTs. Cheap pre-filter before the engine runs: DC/AC ratio in [0.8, 1.3] and coverage in
  [50 %, 130 %]. Enumeration capped at 20 000 engine runs; modules pre-filtered to 380–720 W.
- STEG rules (engine checks, run on every complete candidate; any BLOCK failure drops it):
  - existing C01–C22;
  - **new C23 (BLOCK)**: total inverter AC power ≤ subscribed power;
  - C19 strict (single-phase inverter on single-phase site).
- Auto-selected per candidate: the smallest-rated catalog item per protection type that passes
  its checks (C08–C15); DC fuse only when required; no AC isolator (one inverter); the smallest
  cable sections passing C13/C16/C17 for the lengths; an EARTH cable with a 16 mm² section.
- Three proposals (deduplicated; fewer if they coincide):
  1. **Recommandée** — estimated production closest to the consumption.
  2. **Économique** — fewest modules with coverage ≥ 80 %.
  3. **Production maximale** — highest production with coverage ≤ 120 % and DC/AC ratio ≤ 1.3.
  Ties: DC/AC ratio closest to 1.15, then lower module count, then brand/model alphabetical.
- Each proposal carries the full section payload (array, protections, cabling, earthing cable),
  the summary for the card (§3), and a one-sentence French explanation.
- No solution → the most frequent blocking reasons in French (e.g. "aucun onduleur monophasé
  homologué STEG ne tient dans 3 kVA").

### B5. Applying a proposal

`applyProposalAction(projectId, proposalIndex)` recomputes the proposals server-side (never
trusts client data), then in one transaction writes `ProjectArrayConfig` (+ inverters/MPPTs),
`ProjectProtections`, `ProjectCablingConfig`, two `ProjectCableRun`s, `ProjectStructure`
(Aluminium, 120 km/h), `ProjectEarthing` (defaults identical to the reference dossier),
`ProjectSimulation` (PVGIS automatique), and sets `flowStep = LOCATIONS`. Every value the
installer could also edit stays editable in the existing section forms.

### B6. Locations (coloured points)

Reuse the existing Leaflet map editor with coloured markers (`L.divIcon`, colour + legend):

| Point | Colour | Required | Stored in |
|---|---|---|---|
| Champ PV | yellow `#F5B800` | yes | `installationPoint*` and site GPS |
| Local technique (onduleur) | blue `#1E6FD9` | yes | `technicalRoomPoint*` |
| Compteur STEG | red `#D93025` | yes | `meterPoint*` |
| Piquet de terre | green `#1E8E3E` | no | `earthPitPoint*` |

- A legend under the map shows each colour and whether the point is placed.
- New `floors` choice (RDC, R+1, R+2, R+3; default RDC) on the same screen.
- On save: lengths are computed (`DC = ground(champ→local) × 1.2 + (floors + 1) × 3.5 m`,
  `AC = ground(local→compteur) × 1.2`, rounded up, minimum 1 m), the cable runs are updated, the
  cable section is bumped to the next catalog section if C16/C17 now fail, the simulation is
  recomputed with the exact GPS, the engine runs, and `flowStep = READY`.
- "Enregistrer et générer le dossier" calls the existing generation action.

## 6. The five-agent loop (acceptance)

1. **Implementer** builds each plan task; **code reviewer** reviews each task (spec compliance,
   then quality) before the next one starts.
2. After the build, the reference bill (`D:\mahmoud repo\New folder\facture.webp`, real client
   data — **never committed**) is run through the real app against the local dev database:
   import → proposals → pick "Recommandée" → place points → generate.
3. **STEG reviewer** reads the generated dossier and answers: accepted / accepted with remarks /
   refused, with every reason tied to a page.
4. **Installer** walks the same flow in a real browser and reports what was confusing, slow, or
   unnecessary.
5. **Facilitator** reads 1–4, discusses disagreements, and produces one prioritised list of
   improvements for the user.

## 7. Testing

- `checkBillReading`: fixtures for a clean bill, a bill with a sum mismatch, an off-ladder power,
  a missing reference. Fixtures use **fictitious** client data.
- `readStegBill`: mocked Anthropic client (schema passed, refusal → error, media types incl.
  webp).
- `proposeInstallations`: a fixture catalog; the reference-dossier sanity case (3 000 kWh/yr,
  4 kVA → ~2 kWc, one string); C23 blocks an inverter larger than the subscribed power; a 2 kVA
  client with no fitting inverter returns a reason; the three objectives pick different
  candidates; enumeration cap respected.
- `checkC23` unit tests; existing engine fixtures unchanged when `subscribedPowerKVA` is absent.
- Length computation from points; section bump when C17 fails.
- Server actions: auth guard first, cross-tenant 404, recompute-not-trust on apply.
- Live: the reference bill end-to-end in a real browser (Playwright) against the local dev DB.

## 8. Constraints and risks

- Development and tests run against the **local** database `dossipv_dev` on
  `localhost:5432` (`DATABASE_URL` exported in the shell; the `.env` files still point at the
  production tunnel on 5433, which stays closed during development).
- Production migrations, the production catalog import and the production purge happen only with
  the user's explicit go-ahead, after the dry-run lists are shown.
- The bill image is personal data: stored only through `@dossipv/file-storage`, never in git,
  never in test fixtures.
- AI misreads are the main risk: the arithmetic checks in B2 catch most of them, and the reading
  is shown on the proposals screen ("Lu sur la facture : …") so the installer can spot an error.
- STEG's exact BT acceptance rules (surplus limits, per-phase injection caps) are not written
  down in this repo; the STEG-reviewer agent's verdict feeds the next iteration rather than
  being assumed now.
