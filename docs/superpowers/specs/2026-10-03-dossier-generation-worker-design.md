# DossiPV — Dossier Generation Worker Design Spec

## 1. Purpose and scope

Sub-project #8 slice 2 of the "full application" build, combined with the missing piece of
sub-project #9 ("wiring it together"). An audit of the codebase (2026-10-03) found that the
installer-facing UI for creating a `DossierJob` (the "Générer" button) and viewing its results
page are both fully built, but **nothing ever processes a job**: `generateDossierDocument()`
(sub-project #8 slice 1) has zero production callers, no code anywhere transitions
`DossierJob.status` out of `PENDING` except the user's own cancel action, and
`apps/web/lib/dossier-files.ts`'s `listJobFiles()` unconditionally returns `[]`. The app cannot
produce a single real, downloadable dossier today.

This spec covers the piece that closes that gap:

1. **Worker loop** — a standalone process that polls for `PENDING` jobs, claims one at a time,
   and drives it through every remaining pipeline step.
2. **PDF conversion** — LibreOffice headless, confirmed installed and working on the real
   deployment server as of this spec's own writing (a `.docx`→PDF round-trip was tested
   directly against the server, not assumed from `--version` alone).
3. **Annex merging** — ANME certificate, CIN/commercial register/STEG contract/last paid bill,
   any extra files, and every used equipment item's datasheet + homologation letter, merged
   into the generated PDF. The upload UI for all of these (except equipment datasheets, already
   built in sub-project #3 slice 2) was itself a prerequisite closed just before this spec was
   written (company logo/ANME certificate, project annexes, PVsyst report — see project memory).
4. **Save-to-history** — persisting the generated `.docx`, the annex-merged `.pdf`, and a
   standalone `annexes.pdf`, plus updating `DossierJob`'s own status/timestamps/check results.

**Explicitly out of scope, by the user's own decision** (this sub-project's scope was split in
two during brainstorming specifically over this): SVG drawings (single-line diagram, wiring
diagrams, map-editor-derived pages 37-38). This is a separate, harder design problem — a
rendering engine and a layout algorithm from polygon/pin data — than the rest of this spec,
which is comparatively mechanical wiring of already-built pieces. The generated dossier will
have an empty or placeholder drawings section until that follow-up sub-project lands; this is a
named, deliberate gap, not a silently dropped requirement.

## 2. Decisions

- **Worker shape: a standalone Node.js polling process**, not a serverless function or an
  in-request synchronous call. There is no managed queue/serverless platform in this
  deployment (it runs on the user's own Debian VPS); a polling loop needs no new infrastructure
  and matches how a self-hosted app without a managed queue service is normally built. The
  `generate-button` action already returns immediately after creating the `PENDING` row
  (spec'd that way from the start) — the installer sees "generation will start automatically,"
  which becomes true once this worker exists and runs continuously.
- **New script `packages/dossier-worker/src/run-worker.ts`**, exported as a `bin` entry
  (`dossipv-dossier-worker`) so it can be started directly via `node` or a process manager
  (pm2/systemd — the exact supervision mechanism is a deployment detail for whoever runs the
  server, not this spec's concern; this spec only guarantees the script runs correctly once
  started and exits cleanly on `SIGTERM`).
- **Polling interval: 5 seconds**, configurable via `DOSSIER_WORKER_POLL_INTERVAL_MS` (default
  `5000`). A dossier generation is not time-critical to the second; 5s keeps idle database load
  negligible while still feeling immediate to an installer waiting on the results page.
- **Atomic single-job claim** via a conditional `updateMany`:
  ```ts
  const claimed = await db.dossierJob.updateMany({
    where: { status: 'PENDING' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
  ```
  mirroring the existing cancel action's own `updateMany({ where: { status: 'PENDING' }, ... })`
  pattern — the same safe-concurrent-update idiom already proven in this codebase. Postgres's
  own row-level locking inside the single `UPDATE` statement is what actually prevents two
  worker processes (if ever run) from claiming the same row twice; `updateMany`'s returned
  `count` tells the caller whether it won the claim. This spec runs one worker process, but the
  claim is written to be safe under more than one without further changes.
  **Correction during implementation, if `updateMany`'s `where` can't target "the oldest
  `PENDING` row" directly**: select the oldest `PENDING` job's id first (`findFirst({ where:
  { status: 'PENDING' }, orderBy: { startedAt: 'asc' } })`), then claim by id with
  `updateMany({ where: { id, status: 'PENDING' }, data: { status: 'RUNNING' } })` — the `status:
  'PENDING'` condition in the second query is what keeps the claim atomic even though the id was
  chosen in a separate read.
- **Single source of truth for engine input: `DossierJob.inputSnapshot`**, not a fresh DB
  query. The generate action already freezes `DossierJobSnapshotV1` (containing `engineInput`
  and `projectMeta` in exactly the shape `generateDossierDocument()`'s `DossierWorkerInput`
  needs) at job-creation time — this is the master spec's own explicit "snapshot by value"
  requirement from sub-project #8 slice 1, and the worker must honor it: re-querying the
  project's live data at generation time would defeat the whole point of freezing it. The
  worker parses `inputSnapshot` with the same `parseJobSnapshot()` defensive-parse pattern
  `apps/web/lib/dossier-jobs.ts` already uses for the results page, duplicated into
  `@dossipv/dossier-worker` as its own small type (see §4) — not imported from `apps/web`,
  since `apps/web` depends on packages, never the other way around.
- **Annex/company files ARE re-queried live** (company logo, ANME certificate, project
  annexes, equipment datasheets/homologation letters) — these are explicitly NOT part of the
  frozen engine-input snapshot (the master spec's "snapshot by value" requirement is about the
  technical design data the engine computed from, not administrative paperwork), and an
  installer should be able to upload a missing CIN after creating the job and have it appear
  in a later (re)generation. If a referenced equipment row's datasheet was deleted after the
  snapshot was taken, that document is simply skipped (not an error) — equipment deletion is
  already guarded against at the catalog level while any project still references it, but a
  project referencing now-private, since-deleted equipment via an old snapshot is a real edge
  case this spec names rather than ignores.
- **PDF conversion: `child_process.execFile('soffice', ['--headless', '--convert-to', 'pdf',
  '--outdir', outDir, inputPath])`**, wrapped in a timeout (60s — LibreOffice headless
  conversion of a multi-page Word document is normally sub-second, 60s is a generous ceiling
  against a hung process, not a tuned budget) and running in a per-job temp directory
  (`os.tmpdir()` + a random subdirectory, cleaned up after the job finishes, pass or fail — no
  generated file ever sits in a shared location where two concurrent jobs could collide). The
  `javaldx` warning on stderr (confirmed harmless, see project memory) is not treated as a
  failure signal — only a non-zero exit code or the timeout firing count as failure.
- **PDF annex merging: new dependency `pdf-lib`** (pure JavaScript, MIT-licensed, no native
  binary — confirmed via its own published license before adding it, same diligence this
  session applied to `docxtemplater` in slice 1). `pdf-lib`'s `PDFDocument.load()` +
  `copyPages()` + `addPage()` is used to concatenate: the freshly-converted dossier PDF, then
  each annex file that is itself a PDF. **A PNG/JPEG annex file (a photographed CIN, say) is
  converted to a single-page PDF first** via `pdf-lib`'s own `embedPng`/`embedJpg` + a new page
  sized to the image — this keeps the merge step working uniformly over "a list of PDF buffers"
  regardless of what format each source annex was uploaded as.
- **`DossierJob` gains three new nullable `File` relations**: `docxFileId`, `pdfFileId`,
  `annexesPdfFileId` (new migration). `apps/web/lib/dossier-files.ts`'s `listJobFiles()` —
  currently a hardcoded `[]` with a comment naming exactly this as the reason — is rewired to
  read these three fields and return real `href`s pointing at a new download route (see §5).
  This was the one piece of this spec requiring a schema change; every other involved table
  already had the right shape.
- **Failure handling matches the master spec's own stated rule** ("a failed job surfaces the
  failing step and reason to the installer and does not consume plan quota" — already true
  today, since quota consumption was never wired to anything beyond job creation). Each pipeline
  step is wrapped so a thrown error sets `status: 'FAILED'`, `failedStep: <the exact key the
  results page already recognizes: 'snapshot' | 'simulation' | 'text' | 'docx' | 'pdf' |
  'annexes' | 'save'>`, `failureReason: <error.message>`, `completedAt: new Date()` — using the
  existing `PIPELINE_STEPS` keys from `apps/web/lib/dossier-jobs.ts` verbatim (duplicated as a
  const in the worker package, not imported, for the same dependency-direction reason as
  above) so the already-built results page renders the failure correctly with zero changes on
  its side. The `'drawings'` key exists in that list but is never set by this worker (drawings
  is out of scope) — the results page's own per-step UI already handles an unrecognized/absent
  `failedStep` gracefully, and a job that completes successfully simply never fails on a step
  that was never attempted.
- **Network-dependent steps retry**, per the master spec's own explicit rule ("network-dependent
  steps (PVGIS, Claude) auto-retry"). `fetchPvgisHourlyData` and the Claude call inside
  `generateDossierDocument()` each get wrapped with a small retry helper: up to 3 attempts, a
  short fixed backoff (1s, 2s — not exponential; these are already-fast external calls, not a
  rate-limited API this session has reason to back off aggressively from), only retrying on a
  network-level failure (`fetch failed`, `ECONNRESET`, a 5xx — not on a 4xx client error, which
  retrying would never fix). A new small `retry.ts` helper in `@dossipv/dossier-worker`, unit
  tested directly (mock a function that fails twice then succeeds, assert 3 calls and the
  successful result; mock one that always fails with a 4xx-shaped error, assert exactly 1 call).
- **Quota**: the master spec's rule ("one project counts as one dossier against the monthly plan
  limit regardless of how many times it is regenerated") is already fully handled by existing
  code — `DossierJob` rows accumulate per project, and quota-counting logic (if it exists
  elsewhere) is unaffected by this spec, which only processes jobs that already exist. No new
  quota logic is needed or touched here.
- **Download route: new `apps/web/app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route.ts`**
  (a Next.js Route Handler, not a Server Action, since this serves a binary file download) that
  re-validates the caller owns the project (same `requireOwnedProjectId`-style check as every
  other project route), looks up the job's `docxFileId`/`pdfFileId`/`annexesPdfFileId` by the
  `kind` route param, resolves it through `@dossipv/file-storage`'s `getFilePath()`, and streams
  the file with the correct `Content-Type`/`Content-Disposition` header for a download. This is
  the piece `listJobFiles()`'s `href` field points at.

## 3. Package structure

```
packages/dossier-worker/
  src/
    run-worker.ts          — NEW. The poll loop: claim → process → repeat. Exported as a bin.
    process-job.ts          — NEW. processJob(jobId): the per-job pipeline (steps 1-8, minus
                              drawings), wrapped in try/catch per step for failedStep tracking.
    convert-to-pdf.ts       — NEW. convertDocxToPdf(docxBuffer): Promise<Buffer>, wraps the
                              soffice child_process call in a temp dir.
    merge-annexes.ts        — NEW. mergeAnnexes(dossierPdfBuffer, annexBuffers): Promise<Buffer>,
                              wraps pdf-lib concatenation + image-to-PDF-page conversion.
    retry.ts                — NEW. withRetry(fn, options): small retry wrapper for network calls.
    job-snapshot.ts         — NEW. parseJobSnapshot(value): this package's own copy of the
                              defensive-parse logic (duplicated from apps/web/lib/dossier-jobs.ts
                              by necessity — see §2's dependency-direction note), returning
                              DossierWorkerInput-shaped data directly.
    build-snapshot.ts        — existing (slice 1), unchanged.
    generate-dossier-document.ts — existing (slice 1), unchanged.
    placeholder-map.ts       — existing (slice 1), unchanged.
    run-simulation.ts        — existing (slice 1), unchanged.
    index.ts                 — extended to export the new public pieces.
  package.json               — add "bin": { "dossipv-dossier-worker": "./src/run-worker.ts" },
                                add "pdf-lib" dependency.

packages/db/prisma/
  migrations/<timestamp>_add_dossier_job_output_files/
    migration.sql            — NEW. Adds docxFileId/pdfFileId/annexesPdfFileId to DossierJob.
  schema.prisma               — DossierJob model gains the three new fields + relations.

apps/web/
  lib/dossier-files.ts        — REWRITTEN. listJobFiles() reads the job's three file ids and
                                builds real hrefs instead of returning [].
  app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route.ts — NEW. The download Route Handler.
```

## 4. The per-job pipeline (`processJob`)

```ts
export interface WorkerJobSnapshot {
  // Mirrors DossierJobSnapshotV1's shape exactly (duplicated type, see §2) — only the fields
  // this package's own functions actually consume.
  version: 1;
  projectId: string;
  companyId: string;
  engineInput: RunEngineInput;   // from @dossipv/engine
  projectMeta: ProjectMeta;      // from @dossipv/dossier-worker's own placeholder-map.ts
}

export async function processJob(jobId: string): Promise<void> {
  const job = await db.dossierJob.findUniqueOrThrow({ where: { id: jobId } });
  const snapshot = parseJobSnapshot(job.inputSnapshot);
  if (!snapshot) {
    return fail(jobId, 'snapshot', 'Instantané de la saisie illisible ou corrompu.');
  }

  // Step: simulation (if the project's own ProjectSimulation.source is PVGIS_LIVE — a
  // PVSYST_UPLOAD project already has its annualProductionKWh/etc. captured in the snapshot
  // from the engine input and does not need a live PVGIS call here).
  // Step: text (generateDossierDocument — runs the engine AGAIN here, not reusing a cached
  // result, deliberately: this is the one real computation step, and re-running it from the
  // frozen snapshot is both correct and cheap; it is NOT re-run against live project data).
  // Step: docx (fillDossierTemplate from @dossipv/docx-template, using the already-proven
  // template and DossierTemplateData shape from slice 1 — this spec adds no new tags/loops).
  // Step: pdf (convertDocxToPdf).
  // Step: annexes (fetch company + project annex files live, mergeAnnexes).
  // Step: save (write docx/pdf/annexesPdf to @dossipv/file-storage, create 3 File rows, link
  // them to the job, persist DossierCheckResult rows from EngineResult.checks, set
  // status: SUCCEEDED, completedAt).
}
```

Each step is a small, separately-testable function; `processJob` itself is mostly
sequencing-and-error-mapping, tested with the real pieces mocked at their package boundary
(`@dossipv/document-text`'s Claude call, `@dossipv/pvgis-client`'s fetch, the `soffice`
child_process call) exactly as `generate-dossier-document.test.ts` already mocks Claude in
slice 1 — no new mocking pattern needs inventing.

## 5. Testing

- `convert-to-pdf.ts`: tested against a REAL `soffice` invocation on this machine if available
  (skip gracefully with a clear console message if `soffice` is not on PATH locally — the real
  server has it, a given dev machine may not), using a minimal real `.docx` fixture, asserting
  the returned buffer starts with `%PDF-` and is non-trivial in size. A second test asserts a
  malformed input buffer causes a rejected promise, not a hang.
- `merge-annexes.ts`: unit tested with `pdf-lib` itself used to build small fixture PDFs inline
  (no external fixture files needed — `pdf-lib` can create a one-page blank PDF in a few lines),
  asserting the merged output's page count equals the sum of every input's page count, and that
  a PNG/JPEG annex correctly becomes exactly one additional page.
- `retry.ts`: unit tested with injected fake async functions (fails N times then succeeds;
  always fails with a non-retryable error shape) — no real network calls in this file's own
  tests.
- `process-job.ts`: unit tested with every external package boundary mocked (DB, Claude,
  PVGIS, `soffice`, `@dossipv/file-storage`), covering: a full successful run (asserts the
  final `status: SUCCEEDED` update and all three File rows created in the right order — docx
  before pdf before annexes-merge, matching the pipeline's own real dependency order); a
  failure at each of the 6 in-scope steps (asserts the exact `failedStep` key used, matching
  `PIPELINE_STEPS`); the network-retry path actually retrying PVGIS/Claude before giving up.
- `run-worker.ts`: tested for its claim logic only (the atomic `updateMany`-based claim,
  asserting a second concurrent claim attempt on an already-`RUNNING` job affects zero rows) —
  the poll loop itself (a `setInterval`-driven infinite loop) is deliberately NOT asserted by a
  test that runs it to completion; this matches how this session has tested other long-running
  loops in this codebase (none exist yet — this is the first — so the precedent being set here
  is: test the claim and the per-job pipeline thoroughly, treat the loop itself as "obviously
  correct glue" verified by live/manual running, not automated).
- **Live verification (this plan's own completion gate, not optional)**: after implementation,
  create a real job against the real database for a real seeded project, run the worker script
  directly (not via a long-running supervised process — a single poll-claim-process-exit
  invocation is enough to prove the pipeline), and confirm: the job's `status` becomes
  `SUCCEEDED`, three real files exist in `FILE_STORAGE_ROOT`, the PDF is a real openable PDF
  (verified by re-parsing it with `pdf-lib` in the verification script itself, not just checking
  it's non-empty), and the download route serves it correctly through a real HTTP request. A
  second live run deliberately triggers a failure (e.g., temporarily renaming `soffice` on
  PATH) and confirms the job's `status`/`failedStep`/`failureReason` are set correctly and the
  results page renders the failure.

## 6. Review Focus

The five input classes or failure modes most likely to bite an installer using this feature,
not yet pinned by a task's own tests above unless named here:

- **A project with NO annex files uploaded at all** (the common case right after this spec
  ships, before installers have had time to upload anything) must still produce a complete
  dossier PDF — annex merging with zero annex buffers is a no-op concat (just the dossier PDF
  itself), not an error. Pin with a test: `mergeAnnexes(dossierPdf, [])` returns the dossier PDF
  unchanged (same page count).
- **A job's project is deleted or becomes inaccessible between creation and processing**
  (unlikely but not impossible — e.g. a company's subscription lapses and some other process
  cleans up old projects). `processJob` must fail that job cleanly (`status: FAILED`,
  `failedStep: 'snapshot'`) rather than throwing an unhandled exception that crashes the whole
  worker process and stops every other job from ever being picked up.
- **Two worker processes running at once** (a deploy accidentally leaves an old process running
  alongside a new one, or someone starts it twice by hand) must never double-process the same
  job — the atomic claim in §2 is the fix, and its own test (above) is the one that matters
  most in this whole spec, since a double-charge or double-file-write bug here would be
  genuinely hard to notice in casual testing.
- **A company's ANME certificate (or any single annex) is itself an invalid/corrupted file**
  that somehow made it past upload-time validation (e.g. a bit-rotted file on disk, or an edge
  case `validateUploadedFile` at upload time didn't catch) — `mergeAnnexes` must fail that one
  annex gracefully (skip it, continue with the rest) rather than letting a `pdf-lib` parse
  exception abort the entire job after every earlier, more expensive step (engine, Claude,
  docx, pdf conversion) already succeeded. Losing one annex page is a recoverable, loggable
  gap; losing the whole dossier over it is not proportionate.
- **The worker process is killed mid-job** (server restart, `SIGTERM`, an OOM kill) while a job
  is `RUNNING` — that job is left stuck at `RUNNING` forever with no process left to ever finish
  or fail it, and the results page has no "stuck" state to show. This spec's own fix: on worker
  startup, before polling for new `PENDING` jobs, reset any job already `RUNNING` for longer
  than a generous staleness threshold (`DOSSIER_WORKER_STALE_RUNNING_MS`, default 10 minutes —
  far longer than any real generation should take) back to `PENDING` so it gets retried on the
  next claim, with a test asserting this reset query's exact `where` clause (`status: 'RUNNING'`
  AND `startedAt` older than the threshold).

## 7. Open items for the implementation plan to resolve

- The exact `DOSSIER_WORKER_POLL_INTERVAL_MS`/`DOSSIER_WORKER_STALE_RUNNING_MS` env var names
  and defaults are fixed by this spec; the plan's own task for `run-worker.ts` should read them
  via `process.env` with the stated defaults, not hardcode them, so the real server's deploy
  config can tune them without a code change.
- Whether the download Route Handler needs its own rate limiting or size-based streaming
  (vs. loading the whole file into memory) is NOT decided here — the equipment datasheet files
  already served through the existing admin UI are small (PDF/PNG/JPEG under 10MB, per
  `@dossipv/file-storage`'s own cap), and a generated dossier PDF is realistically in the same
  order of magnitude; the plan's own task should default to `fs.createReadStream` piped to the
  response (standard Next.js Route Handler pattern) rather than buffering the whole file, as
  the simpler-and-also-correct choice, not because streaming was identified as a hard
  requirement.
