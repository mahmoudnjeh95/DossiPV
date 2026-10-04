# DossiPV — Dossier Document Redesign (matching the reference dossier)

## 1. Purpose and scope

Sub-project #8 slice 1 (`2026-10-03-document-pipeline-design.md`) built a real, working, but
**deliberately minimal** `.docx` template and fill pipeline — plain paragraphs, no cover page,
no table of contents, no drawings, no branding, no annex merging of equipment datasheets. That
slice's own spec explicitly named this scope boundary ("functionally complete but visually
minimal... visual polish is explicitly deferred").

A live end-to-end test of the full premium-account generation pipeline (real Claude call, real
LibreOffice conversion, real downloaded PDF) confirmed this gap directly: the generated dossier
does not resemble the real reference dossier used throughout this project
(`Dossier Technique - 434 - 303 - Habib Khedhira.pdf`, gitignored — contains a real client's
personal data) in structure, layout, or content depth — maybe 15-20% of the way there.

This spec redesigns the full document-generation pipeline to close that gap: cover page, table
of contents, numbered section hierarchy, real equipment/calculation data tables, company
branding, programmatically-generated technical drawings, the Premium-tier map/site-plan pages,
and equipment datasheet/homologation merging into annexes. This directly fulfills master-spec
§5 steps 4 ("Drawings"), 6's TOC refresh, and 7's equipment-datasheet annex merging — all three
were explicitly deferred by slice 1, not newly invented here.

**Explicitly out of scope for this pass** (named so the boundary is visible, not silently
dropped): isolated/off-grid dossier layout (v1 is grid-connected BT only, per the master spec);
editing generated prose in the app before/after generation (master spec mentions this but no
UI for it exists yet — separate future work); multi-language support (French only, as today).

## 2. Reference pages inspected directly

Pages 35-38 of the reference dossier were rendered and visually inspected (via `pdftoppm`,
installed for this purpose) rather than assumed from the master spec's prose description alone:

- **Page 35** — a PVsyst-style single-line diagram title block: PV module → inverter →
  injection point, with a small equipment summary table (module/inverter/string).
- **Page 36** — "Schéma Unifilaire" (detailed unifilar wiring diagram): real cable lengths
  (20m, 10m), real section callouts (1×10mm², 2×4mm², 1×6mm² earth), real equipment model
  numbers (interrupteur-sectionneur, parafoudre DC/AC with brand/model), STEG network
  connection symbol, meter (CTR), a legend box, and a formal title block (dossier/plan number).
- **Page 37** — "Schéma d'implantation et de connexion": a satellite image of the real roof
  with the drawn panel array overlaid, a routed cable path from the array to a labeled "Local
  Technique" box and "Compteur STEG" point, a small DC→Onduleur→AC→TGBT→Compteur STEG legend
  box, a south arrow, and a title block (client, date, installer logo).
- **Page 38** — "Plan de Situation": a separate, simpler satellite image with a single pin at
  the site, client name/address/GPS coordinates, and installer contact info/logo.

Confirmed against the master spec's own wording: only pages 37-38 are the map-editor-driven
"situation/implantation plan" pages (§1: "pages 37–38... generated from a map-based editor");
pages 35-36 are unrelated drawings with no tie to the map editor or any external API.

## 3. Decisions

### 3.1 Three-fragment render, merged at the end

The worker builds several PDF fragments and assembles them via an extended `merge-annexes.ts`
(renamed in spirit, not necessarily in file name, to reflect that it now assembles the *whole*
document, not just trailing annexes). **Generation order** (what gets built first, since the
TOC needs the others' page counts) differs from **final page order** (what the reader sees):

- **Generation order**: cover page → body → drawings (35-36) → map pages (37-38) → **table of
  contents** (built last, once the other fragments' real page counts are known, §3.5) → annexes.
- **Final page order** (the assembled PDF): cover page → table of contents → body → drawings →
  map pages → annexes — the TOC is inserted right after the cover once it exists, matching the
  reference dossier's own page order and normal document convention.

Fragment details:

1. **Cover page** — new, pdf-lib.
2. **Body** — existing docxtemplater → LibreOffice path, template redesigned (§3.3).
3. **Drawings (pages 35-36)** — new, pdf-lib + programmatic SVG→PNG, deterministic.
4. **Map pages (pages 37-38, Premium only)** — new, pdf-lib; page 37 uses one Claude vision
   call, page 38 is fully deterministic (§3.4). Standard tier gets empty title-block frames
   for both pages, no network/API call, matching the master spec's tier split exactly.
5. **Table of contents** — new, pdf-lib; built last (generation order) but placed second
   (final page order), per above.
6. **Annexes** — existing step, extended to include equipment datasheets/homologation letters
   (§3.6).

This keeps the already-tested docxtemplater+LibreOffice path for everything it already does
well (prose, repeated/conditional blocks, tables) and adds pdf-lib only for the genuinely new,
image-bearing pages — confirmed necessary because docxtemplater's free tier has no image-
insertion capability (a paid add-on would be needed to put images inside the `.docx` itself,
which this spec avoids entirely rather than taking on a license cost or a fragile manual-OOXML
workaround).

### 3.2 Model: `claude-sonnet-5-5` for every Claude call in this pipeline

Both the already-shipped dossier-prose call (`@dossipv/document-text`'s `generateDossierText()`,
currently `claude-opus-5-5`) and the new page-37 vision call switch to `claude-sonnet-5-5`. This
is a deliberate, explicit choice for this redesign, not a silent default — confirmed directly
with the user, including disambiguating "sonnet5" against the two current candidate model IDs
before locking it in.

### 3.3 Body template redesign

`packages/docx-template`'s template-generation script is rewritten (and the committed
`dossier-template.docx` regenerated from it, exactly as the unit-fix commits from this session
already did once) to use:

- **Real Word numbered-heading styles** matching the reference's hierarchy (I. Préambule,
  II. Présentation du projet, III. Description de l'installation, etc.) instead of today's flat
  `HEADING_2` for every section. The 6 existing Claude-generated prose sections
  (`introduction`/`solution`/`cabling`/`earthing`/`structure`/`conclusion`) become sub-content
  slotted under the relevant numbered heading, not each its own top-level section.
- **An expanded equipment table** carrying full electrical specs per item (module
  Pmax/Vmp/Imp/Voc/Isc; inverter Pac/Vdc max/MPPT range/etc.), not just the brand/model string
  pair `DossierTemplateData` exposes today.
- **New calculation-result tables** — string sizing (`NS_MIN`/`NS_MAX`/`NS_OPT_MAX`/
  `NP_MAX`/`NP_OPT`), voltage drop (`DU_DC_V`/`DU_DC_PCT`/`DU_AC_V`/`DU_AC_PCT`), and structural
  stability (`F_WEIGHT_N`/`STABILITY_LHS`/`STABILITY_RHS`) — using `EngineResult.derived` fields
  that are already computed by `runEngine()` today but never surfaced past the engine boundary
  (confirmed directly in `run-engine.ts`: `PLACEHOLDER_DEFINITIONS` today exposes only 11 of the
  ~25 fields the engine already returns). No new engine computation needed — purely plumbing
  already-correct numbers one layer further.
- **Letterhead/branding text** reusing the already-populated `Company.logoFileId`/name/address
  fields — the logo image itself renders on the new cover page (pdf-lib can embed images;
  docxtemplater's free tier cannot), not inside the docx body.

### 3.4 Pages 35-38: drawings and map pages

**Pages 35-36 (single-line + unifilar diagrams)** — pure SVG generated directly from the
project's resolved `RunEngineInput` and equipment rows (module/inverter model names, cable
run sections/lengths from `ProjectCableRun`, protection device brand/model from
`ProjectProtections`'s resolved relations), rendered to PNG, placed as their own pdf-lib pages.
Zero network calls. Layout is a **clean, deterministic left-to-right rectilinear arrangement**
(fixed slots: PV array → DC protections → inverter → AC protections → meter/STEG) rather than
an attempt at the reference's specific hand-drawn-style routing and label placement — matches
the reference structurally (same boxes, same real values) while staying reliable across any
project configuration (multiple inverters, DC fuse present/absent, etc.), a deliberate,
explicit trade-off over higher-fidelity visual matching.

**Page 37 (implantation/connection plan, Premium only)** — the installer places 3 points in
the existing map editor (technical room, earth pit, meter — `ProjectSite`'s already-existing
`technicalRoomPointLat/Lon`, `earthPitPointLat/Lon`, `meterPointLat/Lon` fields; confirmed
present in the schema and already populated by a prior sub-project's map-editor UI). This
replaces the existing panel-outline/rows manual-drawing flow for this specific page — the
installer no longer needs to trace the roof polygon by hand for the dossier image.

At generation time:
1. Fetch the satellite tile image for the site's GPS bounding box from Esri World Imagery (the
   same free, no-key tile source the live map editor already uses — confirmed via project
   history that no billing/API key exists or is needed for this source).
2. Send that image plus the 3 point coordinates to `claude-sonnet-5-5` as a vision input call.
   The model does **not** return an image — Claude's Messages API has no image-generation
   output capability (confirmed directly against the current API documentation before this
   decision was finalized, correcting an initial wrong assumption). It returns **structured
   JSON**: a proposed panel-array rectangle (corner coordinates + rotation, reasoned from the
   roof/ground shape visible in the image) and a wire-route path (waypoints from the panel
   array to the technical room point, then to the meter point).
3. Code (pdf-lib/SVG) deterministically draws that JSON onto the fetched satellite image —
   panel rectangle, route polyline, the 3 point markers, labels, south arrow, legend box, title
   block — exactly like the page 35-36 drawings, just with AI-sourced placement data instead of
   manually-drawn polygon data.

This keeps the same "AI reasons about placement from visual context, code renders
deterministically" division of labor as the rest of the pipeline, and keeps the panel
rectangle **purely illustrative** — the real electrical design (string/MPPT counts feeding
every calculation and check) still comes from `ProjectArrayConfig`'s actual data entered
elsewhere, never from this page's AI-suggested siting.

**Page 38 (site location plan)** — fully deterministic, no Claude call: fetch the Esri tile for
the site's GPS point, draw a single pin, overlay client name/address/GPS coordinates and
installer contact info/logo (all already-stored project/company fields). There is nothing to
reason about here, so no AI call is made for this page.

**Standard tier**: both pages render as empty title-block frames (border, title, "à compléter
par l'installateur" placeholder text) with zero network or API calls, matching the master
spec's tier split (§1) exactly.

### 3.5 Table of contents: two-pass render

Because the final page numbers depend on how many pages the cover/drawings/map fragments add
(which varies per project — e.g. Standard tier's empty frames are still full pages, multi-
inverter projects may need more drawing-page space), the TOC cannot be computed from the docx
template alone. The worker renders fragments 1-4 first, counts their real page totals via
pdf-lib, then generates the TOC page with accurate page numbers. The TOC is generated last but
assembled second in the final document, right after the cover page (see §3.1's generation-order
vs. final-page-order distinction).

### 3.6 Annex merging: equipment datasheets

`collectAnnexFiles()` (in `process-job.ts`) is extended to also walk every piece of equipment
referenced in the project's snapshot — `PvModule`, `Inverter`, every `Spd`/`DcSwitch`/`DcFuse`/
`AcBreaker`/`AcIsolator`/`Cable`/`Accessory` actually used — and include their
`datasheetFileId`/`homologationFileId` File rows alongside the existing company (ANME
certificate) and project (CIN/commercial register/STEG contract/bill) annexes. Multiple
MPPTs/cable runs referencing the same catalog row are **de-duplicated by file id** before
merging — no point appending an identical datasheet twice. Equipment with no uploaded datasheet
(the common case in the current dev catalog, confirmed directly) contributes nothing, matching
`mergeAnnexes()`'s existing graceful-skip-on-missing/corrupt-file behavior — this is not
a new failure mode, just a wider set of files fed through an already-proven code path.

## 4. New/changed packages and files

```
packages/document-text/
  src/
    generate-dossier-text.ts     — model id changed to claude-sonnet-5-5

packages/dossier-worker/
  src/
    build-template-data.ts        — expanded: full equipment specs, calculation-result fields
    generate-page-37.ts           — new: Esri tile fetch + claude-sonnet-5-5 vision call +
                                     structured JSON parse
    render-site-plan-pages.ts     — new: pdf-lib rendering for pages 37-38 (both tiers)
    render-drawings.ts            — new: SVG generation + PNG rendering for pages 35-36
    render-cover-page.ts          — new: pdf-lib cover page
    render-toc.ts                 — new: pdf-lib TOC page, second-pass page-count aware
    merge-annexes.ts              — extended: accepts ordered fragment list, not just
                                     base+annexes; equipment-datasheet collection added to
                                     process-job.ts's collectAnnexFiles()
    process-job.ts                — orchestrates the new fragment order + two-pass TOC render

packages/docx-template/
  scripts/generate-template.ts    — rewritten: numbered heading styles, equipment table,
                                     calculation tables
  template/dossier-template.docx  — regenerated from the script (committed binary, as today)
```

No new top-level package is needed — SVG/PNG rendering and the Esri fetch are new modules
inside the existing `@dossipv/dossier-worker` package, matching its existing role as the
pipeline orchestrator; `pdf-lib` is already a dependency there.

## 5. Error handling

- **Esri tile fetch failure (page 37/38, Premium only)**: network-dependent, per the master
  spec's existing rule ("network-dependent steps... auto-retry") — reuses the worker's existing
  `withRetry()` helper. A final failure surfaces as a new `failedStep: 'map-pages'`, generic
  French message, same pattern as every other step in `process-job.ts` today.
- **`claude-sonnet-5-5` vision call failure (page 37)**: same retry-then-fail pattern, its own
  `failedStep`.
- **Opus/Sonnet returns placement JSON that fails schema validation** (e.g. route waypoints
  outside the image bounds): treated as a call failure, retried like a network error — never
  silently drawn with garbage coordinates.
- **TOC two-pass render**: if the page-count pass itself fails (e.g. a corrupt intermediate
  fragment), this is a bug in an earlier step, not a new failure category — the error surfaces
  at whichever step actually produced the bad fragment.

## 6. Testing

- Unit tests for each new pdf-lib rendering module (cover page, drawings, TOC, site-plan pages)
  — given fixed input data, assert the output is a valid PDF with the expected page count, and
  (where feasible) assert on embedded text/structure rather than pixel comparison.
- A unit test for the page-37 vision call's JSON-parsing/validation logic with a mocked Claude
  response — valid JSON, malformed JSON, and out-of-bounds coordinates.
- `collectAnnexFiles()`'s equipment-datasheet extension gets a dedicated test proving
  de-duplication (two cable runs sharing one cable catalog row contribute one datasheet, not
  two) and the zero-datasheets-uploaded case still succeeds.
- The template-generation script's regenerated output is proven via the existing
  `fill-template.test.ts` pattern (fill with fixture data, assert the resulting `.docx` is valid
  and contains the expected text) — no pixel-level Word-rendering assertions, matching this
  codebase's existing test philosophy for the docx layer.
- A live end-to-end re-run (same method as the one that surfaced this redesign's need:
  real premium project, real Claude/Sonnet calls, real LibreOffice conversion, downloaded and
  visually inspected PDF) is the acceptance test for the whole redesign, not just unit coverage
  — matching how the original doubled-unit bugs were actually caught.
