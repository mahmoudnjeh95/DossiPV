# DossiPV — Dossier Worker (Placeholder Mapping + Text Pipeline) Design Spec

## 1. Purpose and scope

Spec §5 ("Document generation pipeline") describes 8 steps from snapshot through PDF+annexes.
Two of those steps already exist as standalone packages: `@dossipv/engine` (step 2's
calculation half, minus PVGIS simulation) and `@dossipv/document-text` (step 3's Claude call
and placeholder substitution, minus knowledge of the engine's actual field names). Nothing
currently connects them.

This spec covers **only** the connecting piece: a mapping from the engine's output field names
to the placeholder names used in dossier text, and a worker function that chains
calculate → generate text → substitute, returning the finished French prose sections.

**Explicitly out of scope** (deferred to later pieces, once their prerequisites exist):
- PVGIS weather fetch / production simulation (needs its own design once PVGIS integration is built).
- `.docx` template fill, PDF conversion, drawings, annexes merging (needs a real Word template,
  which does not exist yet).
- Snapshot persistence, job queueing, quota accounting (needs the DB/jobs layer from §8).

The deliverable here is text-only: given a project's full engine input plus a handful of
non-technical descriptive fields, produce the 6 finished dossier sections with every
`{PLACEHOLDER}` replaced by a real, correctly formatted, French-locale value.

## 2. New package: `@dossipv/dossier-worker`

A new workspace package, matching the existing `@dossipv/engine` / `@dossipv/document-text`
shape (plain TypeScript, `vitest`, no build step — `main`/`types` point straight at `src/index.ts`).

It depends on both `@dossipv/engine` and `@dossipv/document-text`. Neither of those packages
gains a dependency on the other or on this new package — `@dossipv/document-text` continues to
know nothing about the engine's field names, preserving its existing isolation and test
coverage. This package is purely the glue between them, matching spec §2's "worker" concept.

## 3. Placeholder vocabulary: a fixed allowlist

Today `document-text`'s system prompt only gives 2-3 example placeholder names
(`{P_DC_W}`, `{NS}`, `{NORME_CABLAGE}`) as illustrations — Claude is free to invent any other
name matching the `{WORD}` pattern. This spec replaces that with a fixed, enumerated
vocabulary: the one source of truth both the prompt and the mapping logic read from, so
Claude can never emit a placeholder the worker doesn't know how to fill, and the worker can
never silently support a placeholder the prompt doesn't tell Claude about.

### 3.1 `PLACEHOLDER_DEFINITIONS`

A new module, `packages/dossier-worker/src/placeholder-map.ts`, exports:

```ts
interface PlaceholderDefinition {
  /** Pulls the raw value from engine output + worker input. */
  source: (ctx: PlaceholderSourceContext) => number | string;
  /** Decimal places for a numeric value. Omit for integers/strings. */
  decimals?: number;
  /** Unit suffix appended after formatting, e.g. "W", "V", "A", "%". */
  unit?: string;
}

const PLACEHOLDER_DEFINITIONS: Record<string, PlaceholderDefinition> = {
  P_DC_W:            { source: (c) => c.derived.P_DC_W, decimals: 0, unit: 'W' },
  MODULE_COUNT:      { source: (c) => c.derived.MODULE_COUNT },
  NS:                { source: (c) => c.representativeMppt.modulesPerString },
  NP:                { source: (c) => c.representativeMppt.stringsInParallel },
  STRING_VOC_TMIN:   { source: (c) => c.derived.STRING_VOC_TMIN, decimals: 1, unit: 'V' },
  DU_DC_PCT:         { source: (c) => c.derived.DU_DC_PCT, decimals: 2, unit: '%' },
  DU_AC_PCT:         { source: (c) => c.derived.DU_AC_PCT, decimals: 2, unit: '%' },
  INVERTER_COUNT:    { source: (c) => c.engineInput.array.length },
  EARTH_ROD_COUNT:   { source: (c) => c.projectMeta.earthRodCount },
  NORME_CABLAGE:     { source: () => 'NF C 15-100' },
  // ... remaining entries covering every number the 6 sections could plausibly need
  //     (full enumeration happens during implementation against x-rules' derived list).
};
```

`PlaceholderSourceContext` bundles `derived` (from `EngineResult`), `engineInput`
(`RunEngineInput`), `representativeMppt` (`array[0].mppts[0]`, matching `runEngine`'s own
existing "first MPPT is representative" convention), and `projectMeta` (the new
non-engine fields — §4). The initial entry set is seeded from values the reference dossier
actually prints (per the design spec's `derived` list and the habib-khedhira fixture) and
extended as the 6 prose sections demand during implementation — the table is additive and
the plan can add entries without redesigning the mechanism.

### 3.2 Formatting

`buildPlaceholderValues(ctx): Record<string, string>` walks `PLACEHOLDER_DEFINITIONS`,
calls each `source`, and formats numbers with `Intl.NumberFormat('fr-FR', { minimumFractionDigits, maximumFractionDigits })`
(comma decimal separator, space thousands separator — matching the reference dossier's French
formatting), appending `unit` with a non-breaking space when present. String sources
(`NORME_CABLAGE`) pass through unchanged. This is the only place formatting logic lives;
`substitutePlaceholders()` in `document-text` is unchanged and stays a dumb string-replace.

### 3.3 Prompt change

`document-text/src/prompt.ts`'s `DOSSIER_TEXT_SYSTEM_PROMPT` changes from giving 2-3 example
placeholder names to enumerating the full allowed set. Since the prompt lives in
`document-text` and the allowlist lives in `dossier-worker` (which depends on `document-text`,
not the reverse), the enumerated list is generated as a plain `string[]` of placeholder names
and passed into prompt construction as a parameter — `document-text` keeps zero knowledge of
what the names *mean*, it just lists names it's told about. Concretely:
`buildDossierTextUserPrompt(input, allowedPlaceholderNames: string[])`, with
`dossier-worker` the only caller that supplies the real list (derived from
`Object.keys(PLACEHOLDER_DEFINITIONS)`). `document-text`'s existing tests keep a small
fixed list for their own fixtures, independent of the real vocabulary.

`MissingPlaceholderValueError` (already implemented in `substitutePlaceholders`) remains the
runtime safety net for the rare case Claude still emits an unlisted name.

## 4. Worker input/output contract

One exported function from `dossier-worker`'s `src/index.ts`:

```ts
interface DossierWorkerInput {
  engineInput: RunEngineInput;   // @dossipv/engine — unchanged
  projectMeta: {
    moduleBrandModel: string;
    inverterBrandModel: string;
    gridType: string;            // "BT" | "MT" | "ISOLATED"
    mountingType: string;        // "FLAT_ROOF_BALLAST" | ...
    structureMaterial: string;
    earthRodCount: number;
  };
}

interface DossierWorkerResult {
  sections: DossierTextSections;  // @dossipv/document-text — the 6 finished French sections
  engineResult: EngineResult;     // full derived values + checks, so callers can still show them
}

declare function generateDossierDocument(
  input: DossierWorkerInput,
  client: Anthropic,
): Promise<DossierWorkerResult>;
```

Steps inside `generateDossierDocument`:

1. `const engineResult = runEngine(input.engineInput)`.
2. If `engineResult.hasBlockingFailure`, throw `DossierGenerationBlockedError` (new, carries the
   failing `CheckResult[]`) **before** calling Claude — no wasted API cost generating text for
   a design that can't be built.
3. Derive `DossierTextInput` from `engineInput` + `projectMeta` + `engineResult`:
   - `inverterCount` ← `engineInput.array.length`
   - `phases` ← `engineInput.site.phases`
   - `dcFuseRequired` ← `dcFuseRequired(engineInput.module, representativeMppt.stringsInParallel)`
     (re-using the engine's own exported function — never re-implemented here, so this can't
     drift from the engine's actual C08 logic)
   - `acIsolatorRequired` ← `engineInput.array.length > 1` (matching `checkC15`'s existing
     "inverterCount > 1" condition in `checks.ts`)
   - everything else passes straight through from `projectMeta`
4. `const sections = await generateDossierText(textInput, client, allowedPlaceholderNames)`.
5. `const values = buildPlaceholderValues(ctx)`.
6. `return { sections: substitutePlaceholders(sections, values), engineResult }`.

Errors from steps 1 (engine throws on malformed input), 4 (`DossierTextParseError`, network
errors), and 6 (`MissingPlaceholderValueError`) all propagate unchanged — no new wrapping,
matching the existing packages' style of letting specific typed errors surface directly.

## 5. Testing

Following TDD as usual for this codebase:

- `placeholder-map.test.ts` — formatting unit tests (decimal comma, thousands separator, unit
  suffixes, integer vs. decimal placeholders) using hand-built `EngineResult`-shaped fixtures.
- `index.test.ts` (or `generate-dossier-document.test.ts`) — end-to-end chain test using a fake
  Anthropic client (same pattern as `document-text`'s existing tests) plus the `habib-khedhira`
  engine fixture (imported from `@dossipv/engine`'s test fixtures, or duplicated if cross-package
  test fixture imports prove awkward — decided during implementation):
  - happy path: full chain produces fully-substituted sections with no `{...}` left.
  - blocking-check fixture: `hasBlockingFailure: true` throws before the fake client is ever
    called (assert the fake client's call count is 0).
  - missing-placeholder path: a deliberately incomplete `PLACEHOLDER_DEFINITIONS` subset (test
    double) surfaces `MissingPlaceholderValueError` unchanged.

## 6. Open items for the implementation plan to resolve

- The exact full enumeration of `PLACEHOLDER_DEFINITIONS` (which specific derived/input values
  the 6 prose sections actually reference) is determined during implementation by reading
  what the current prompt's sections ask for plus the reference dossier's prose — not fully
  fixed by this spec, which defines the *mechanism* (table + formatter + allowlist prompt),
  not the final enumerated list.
- Whether `habib-khedhira.ts`'s engine fixture is imported directly from
  `@dossipv/engine/test/fixtures` or duplicated into `dossier-worker`'s own test fixtures is an
  implementation-time call based on whichever keeps `vitest` config simplest under npm
  workspaces.
