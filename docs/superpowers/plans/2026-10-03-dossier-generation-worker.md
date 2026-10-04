# Dossier Generation Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing piece that lets DossiPV actually produce a downloadable dossier: a
polling worker that claims `PENDING` `DossierJob` rows and drives each one through simulation →
text generation → `.docx` fill → PDF conversion → annex merging → save-to-history, updating the
job's status/failedStep/files as it goes.

**Architecture:** A standalone Node.js script (`packages/dossier-worker/src/run-worker.ts`)
polls the database every few seconds, atomically claims one `PENDING` job at a time, and calls
a per-job pipeline function (`processJob`) built from small, independently-testable steps: an
adapter from the frozen `DossierJobSnapshotV1` + `generateDossierDocument()`'s output into
`DossierTemplateData` (the one genuinely new piece of glue this plan adds beyond what the spec
named — `fillDossierTemplate()` needs a shape nothing in the codebase builds today), LibreOffice
headless PDF conversion via `child_process`, PDF annex merging via `pdf-lib`, and a save step
that writes three new `File` rows linked to the job via three new `DossierJob` columns.

**Tech Stack:** TypeScript, Prisma 7, Vitest, `pdf-lib` (new dependency), LibreOffice headless
(`soffice`, confirmed installed on the real server), Node's `child_process`/`fs` for the PDF
conversion and streamed file download.

**Spec:** `docs/superpowers/specs/2026-10-03-dossier-generation-worker-design.md`

## Global Constraints

- Worker shape: a standalone polling process, not serverless or synchronous-in-request (spec §2).
- Poll interval: `DOSSIER_WORKER_POLL_INTERVAL_MS`, default `5000`.
- Stale-running reset threshold: `DOSSIER_WORKER_STALE_RUNNING_MS`, default `600000` (10 min).
- Engine input comes ONLY from `DossierJob.inputSnapshot` — never a fresh query of live project
  data (spec §2's "snapshot by value" requirement).
- Annex/company files (logo, ANME certificate, CIN/contract/bill, equipment datasheets) ARE
  queried live, never from the snapshot (spec §2).
- `failedStep` values written on failure must be exactly one of: `'snapshot' | 'simulation' |
  'text' | 'docx' | 'pdf' | 'annexes' | 'save'` — the exact keys
  `apps/web/lib/dossier-jobs.ts`'s `PIPELINE_STEPS` already recognizes. Never write `'drawings'`
  (out of scope for this plan).
- `pdf-lib` only (MIT, pure JS, no native binary) for PDF merging — no other PDF library.
- LibreOffice conversion: `soffice --headless --convert-to pdf --outdir <dir> <input>`, 60s
  timeout, run in a per-job temp directory cleaned up after the job (pass or fail).
- Drawings (SVG single-line/wiring diagrams) are explicitly out of scope — never attempted,
  never referenced as a failure step.
- Download route defaults to streamed reads (`fs.createReadStream`), not full-buffer reads.
- New package dependency types never reference `apps/web` from a `packages/*` package (wrong
  dependency direction) — any type shared between them is duplicated, not imported across that
  boundary (matches this spec's own stated reasoning for `ProjectMeta`/`PIPELINE_STEPS`).

## Review Focus

1. **A project with zero annex files uploaded** (the default state right after this ships) must
   still produce a complete dossier PDF — annex merging with no annex buffers is a no-op concat,
   not an error. (Task 4)
2. **A job's project/snapshot becomes unreadable between creation and processing** (corrupted
   JSON, or a shape `parseJobSnapshot` can't recognize) must fail that one job cleanly with
   `failedStep: 'snapshot'`, not throw an unhandled exception that kills the whole worker
   process and stops every other job from ever being picked up. (Task 7)
3. **Two claim attempts on the same job** (worker restarted mid-poll, or run twice by accident)
   must never let both succeed — the atomic `updateMany`-based claim is the fix, and this is the
   single most important test in the whole plan since a double-processing bug here would be
   genuinely hard to notice in casual testing. (Task 2)
4. **One corrupted/invalid annex file** must not abort a job that already succeeded at every
   more expensive earlier step (engine, Claude, docx fill, PDF conversion) — merging skips that
   one annex and continues, logging the gap, rather than failing the whole job over it. (Task 4)
5. **The worker process is killed mid-job** (restart, `SIGTERM`, OOM) leaves a job stuck at
   `RUNNING` forever with nothing left to ever finish or fail it — the worker resets any job
   `RUNNING` longer than `DOSSIER_WORKER_STALE_RUNNING_MS` back to `PENDING` on its own startup,
   before polling for new work. (Task 8)

---

## Task 1: `pdf-lib` dependency + PDF annex merging

**Files:**
- Modify: `packages/dossier-worker/package.json` (add `"pdf-lib": "^1.17.1"` dependency)
- Create: `packages/dossier-worker/src/merge-annexes.ts`
- Test: `packages/dossier-worker/test/merge-annexes.test.ts`

**Interfaces:**
- Produces: `mergeAnnexes(baseBuffer: Buffer, annexBuffers: { buffer: Buffer; mimeType: 'pdf' |
  'png' | 'jpeg' }[]): Promise<Buffer>` — concatenates `baseBuffer` (always a PDF) with every
  annex, converting a `png`/`jpeg` annex to a single full-page PDF page first. Returns the
  merged PDF as a `Buffer`.

- [ ] **Step 1: Add the `pdf-lib` dependency**

```bash
cd packages/dossier-worker && npm install pdf-lib@^1.17.1
```

Verify it installed: `cat package.json | grep pdf-lib` should show it under `dependencies`.

- [ ] **Step 2: Write the failing test for merging two PDFs**

```typescript
// packages/dossier-worker/test/merge-annexes.test.ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergeAnnexes } from '../src/merge-annexes';

async function makeOnePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

async function countPages(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer);
  return doc.getPageCount();
}

describe('mergeAnnexes', () => {
  it('concatenates the base PDF with every PDF annex, in order', async () => {
    const base = await makeOnePagePdf();
    const annex1 = await makeOnePagePdf();
    const annex2 = await makeOnePagePdf();

    const merged = await mergeAnnexes(base, [
      { buffer: annex1, mimeType: 'pdf' },
      { buffer: annex2, mimeType: 'pdf' },
    ]);

    expect(await countPages(merged)).toBe(3);
  });

  it('returns the base PDF unchanged when there are no annexes', async () => {
    const base = await makeOnePagePdf();

    const merged = await mergeAnnexes(base, []);

    expect(await countPages(merged)).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- merge-annexes.test.ts`
Expected: FAIL with "Cannot find module '../src/merge-annexes'" or similar — the file doesn't exist yet.

- [ ] **Step 4: Write the minimal implementation**

```typescript
// packages/dossier-worker/src/merge-annexes.ts
import { PDFDocument } from 'pdf-lib';

export interface AnnexFile {
  buffer: Buffer;
  mimeType: 'pdf' | 'png' | 'jpeg';
}

export async function mergeAnnexes(baseBuffer: Buffer, annexBuffers: AnnexFile[]): Promise<Buffer> {
  const merged = await PDFDocument.load(baseBuffer);

  for (const annex of annexBuffers) {
    if (annex.mimeType === 'pdf') {
      const annexDoc = await PDFDocument.load(annex.buffer);
      const pages = await merged.copyPages(annexDoc, annexDoc.getPageIndices());
      for (const page of pages) {
        merged.addPage(page);
      }
    } else {
      const image = annex.mimeType === 'png' ? await merged.embedPng(annex.buffer) : await merged.embedJpg(annex.buffer);
      const page = merged.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
  }

  return Buffer.from(await merged.save());
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix packages/dossier-worker test -- merge-annexes.test.ts`
Expected: PASS (2/2 tests).

- [ ] **Step 6: Write the failing test for the image-to-page and corrupted-annex-skip cases**

```typescript
// Add to packages/dossier-worker/test/merge-annexes.test.ts
import { PNG } from 'pngjs';

async function makeOnePagePng(): Promise<Buffer> {
  const png = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 255;
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = png.pack();
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('mergeAnnexes — image annexes', () => {
  it('converts a PNG annex into exactly one additional page', async () => {
    const base = await makeOnePagePdf();
    const pngAnnex = await makeOnePagePng();

    const merged = await mergeAnnexes(base, [{ buffer: pngAnnex, mimeType: 'png' }]);

    expect(await countPages(merged)).toBe(2);
  });
});

describe('mergeAnnexes — resilience', () => {
  it('skips a corrupted annex and still merges the valid ones, rather than failing the whole job', async () => {
    const base = await makeOnePagePdf();
    const validAnnex = await makeOnePagePdf();
    const corrupted = { buffer: Buffer.from('not a real pdf'), mimeType: 'pdf' as const };

    const merged = await mergeAnnexes(base, [corrupted, { buffer: validAnnex, mimeType: 'pdf' }]);

    // Base + the one valid annex = 2 pages; the corrupted one contributed nothing but did not abort the merge.
    expect(await countPages(merged)).toBe(2);
  });
});
```

This test needs the `pngjs` dev dependency to build a real PNG fixture inline (no external
fixture file): `npm install -D pngjs @types/pngjs --prefix packages/dossier-worker`.

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- merge-annexes.test.ts`
Expected: FAIL — the PNG test should pass already (Step 4's implementation already handles
`png`/`jpeg`), but the resilience test FAILS because the current implementation throws on the
corrupted buffer instead of skipping it. Confirm the failure is specifically in the resilience
test, not the PNG one — if the PNG one also fails, re-check Step 4's implementation first.

- [ ] **Step 8: Make the merge resilient to one corrupted annex**

```typescript
// packages/dossier-worker/src/merge-annexes.ts — replace the loop body
export async function mergeAnnexes(baseBuffer: Buffer, annexBuffers: AnnexFile[]): Promise<Buffer> {
  const merged = await PDFDocument.load(baseBuffer);

  for (const annex of annexBuffers) {
    try {
      if (annex.mimeType === 'pdf') {
        const annexDoc = await PDFDocument.load(annex.buffer);
        const pages = await merged.copyPages(annexDoc, annexDoc.getPageIndices());
        for (const page of pages) {
          merged.addPage(page);
        }
      } else {
        const image = annex.mimeType === 'png' ? await merged.embedPng(annex.buffer) : await merged.embedJpg(annex.buffer);
        const page = merged.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
    } catch {
      // One corrupted/unreadable annex must not abort the whole job — every earlier step
      // (engine, Claude, docx fill, PDF conversion) already succeeded and is more expensive to
      // redo than losing one annex page. Skip and continue.
      continue;
    }
  }

  return Buffer.from(await merged.save());
}
```

- [ ] **Step 9: Run all merge-annexes tests to verify they pass**

Run: `npm --prefix packages/dossier-worker test -- merge-annexes.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 10: Commit**

```bash
git add packages/dossier-worker/package.json packages/dossier-worker/src/merge-annexes.ts packages/dossier-worker/test/merge-annexes.test.ts
git commit -m "feat(dossier-worker): add PDF annex merging via pdf-lib"
```

---

## Task 2: PDF conversion via LibreOffice headless

**Files:**
- Create: `packages/dossier-worker/src/convert-to-pdf.ts`
- Test: `packages/dossier-worker/test/convert-to-pdf.test.ts`

**Interfaces:**
- Produces: `convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer>` — writes `docxBuffer` to a
  temp file, shells out to `soffice --headless --convert-to pdf`, reads the resulting PDF back
  as a `Buffer`, cleans up the temp directory, and rejects if `soffice` exits non-zero or the
  60s timeout fires.

- [ ] **Step 1: Write the failing test using a real minimal `.docx` fixture**

```typescript
// packages/dossier-worker/test/convert-to-pdf.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { convertDocxToPdf } from '../src/convert-to-pdf';

function sofficeAvailable(): boolean {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const describeIfSoffice = sofficeAvailable() ? describe : describe.skip;

// A minimal, real, valid .docx: a zip containing the three parts Word requires.
// Built inline with pizzip (already a dependency of @dossipv/docx-template; add it here too)
// rather than committing a binary fixture.
import PizZip from 'pizzip';

function buildMinimalDocx(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Conversion test</w:t></w:r></w:p></w:body></w:document>',
  );
  return zip.generate({ type: 'nodebuffer' });
}

describeIfSoffice('convertDocxToPdf', () => {
  it('converts a real minimal docx into a real PDF', async () => {
    const docx = buildMinimalDocx();

    const pdf = await convertDocxToPdf(docx);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(100);
  });

  it('rejects when the input is not a valid docx', async () => {
    const garbage = Buffer.from('this is not a docx file at all');

    await expect(convertDocxToPdf(garbage)).rejects.toThrow();
  });
});

if (!sofficeAvailable()) {
  // eslint-disable-next-line no-console -- intentional: tells a dev running locally without
  // LibreOffice why this file's tests were skipped, rather than silently showing 0 tests.
  console.warn('convert-to-pdf.test.ts: soffice not found on PATH, skipping (the real server has it installed).');
}
```

- [ ] **Step 2: Add `pizzip` as a dev dependency for the test fixture**

```bash
npm install -D pizzip --prefix packages/dossier-worker
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- convert-to-pdf.test.ts`
Expected: FAIL with "Cannot find module '../src/convert-to-pdf'" (or, if `soffice` is not on
this machine's PATH, the whole describe block is skipped and the run reports 0 tests for this
file — that is an acceptable RED-equivalent here; proceed to Step 4 either way, and if `soffice`
is unavailable locally, Step 5's PASS will also just show 0 tests for this file until the real
server runs it, per the spec's own stated testing approach).

- [ ] **Step 4: Write the implementation**

```typescript
// packages/dossier-worker/src/convert-to-pdf.ts
import { execFile } from 'child_process';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const CONVERSION_TIMEOUT_MS = 60_000;

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'dossipv-pdf-'));
  const inputPath = join(dir, 'input.docx');
  const outputPath = join(dir, 'input.pdf');

  try {
    await writeFile(inputPath, docxBuffer);
    await execFileAsync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, inputPath], {
      timeout: CONVERSION_TIMEOUT_MS,
    });
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix packages/dossier-worker test -- convert-to-pdf.test.ts`
Expected: PASS (2/2 tests) if `soffice` is on this machine's PATH; 0 tests run (skipped) with
the console warning otherwise. Either outcome is acceptable here — the live-verification task
at the end of this plan (Task 9) proves this against the real server regardless.

- [ ] **Step 6: Commit**

```bash
git add packages/dossier-worker/package.json packages/dossier-worker/src/convert-to-pdf.ts packages/dossier-worker/test/convert-to-pdf.test.ts
git commit -m "feat(dossier-worker): add docx-to-pdf conversion via LibreOffice headless"
```

---

## Task 3: Retry helper for network-dependent steps

**Files:**
- Create: `packages/dossier-worker/src/retry.ts`
- Test: `packages/dossier-worker/test/retry.test.ts`

**Interfaces:**
- Produces: `withRetry<T>(fn: () => Promise<T>, options?: { maxAttempts?: number; delaysMs?:
  number[] }): Promise<T>` — calls `fn`, retrying up to `maxAttempts` (default 3) times with
  delays from `delaysMs` (default `[1000, 2000]`) between attempts, but ONLY when the thrown
  error looks like a network-level failure (see `isRetryableError` below); any other error is
  rethrown immediately on the first attempt.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/dossier-worker/test/retry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/retry';

describe('withRetry', () => {
  it('retries a network-level failure up to maxAttempts, returning the eventual success', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('fetch failed');
      }
      return 'ok';
    });

    const result = await withRetry(fn, { delaysMs: [0, 0] });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-network error — rethrows on the first attempt', async () => {
    const fn = vi.fn(async () => {
      throw new Error('400 Bad Request');
    });

    await expect(withRetry(fn, { delaysMs: [0, 0] })).rejects.toThrow('400 Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts network failures and rethrows the last error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });

    await expect(withRetry(fn, { delaysMs: [0, 0] })).rejects.toThrow('ECONNRESET');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- retry.test.ts`
Expected: FAIL with "Cannot find module '../src/retry'".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/dossier-worker/src/retry.ts
const RETRYABLE_PATTERNS = [/fetch failed/i, /ECONNRESET/i, /ETIMEDOUT/i, /\b5\d\d\b/];

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(message));
}

export interface RetryOptions {
  maxAttempts?: number;
  delaysMs?: number[];
}

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const delaysMs = options?.delaysMs ?? [1000, 2000];

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      const delay = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1] ?? 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix packages/dossier-worker test -- retry.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/retry.ts packages/dossier-worker/test/retry.test.ts
git commit -m "feat(dossier-worker): add network-failure retry helper"
```

---

## Task 4: `DossierJob` schema migration — three output file columns

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (DossierJob model)
- Create: a new migration directory under `packages/db/prisma/migrations/` (generated by the
  command below, not hand-written)

**Interfaces:**
- Produces: `DossierJob.docxFileId`, `DossierJob.pdfFileId`, `DossierJob.annexesPdfFileId` (all
  `String?`, each with a matching `File?` relation), consumed by Task 6 (the save step) and
  Task 10 (`listJobFiles`/the download route).

- [ ] **Step 1: Edit the schema**

In `packages/db/prisma/schema.prisma`, find the `DossierJob` model and the `File` model.
Change `DossierJob` from:

```prisma
model DossierJob {
  id              String      @id @default(uuid())
  projectId       String
  project         Project     @relation(fields: [projectId], references: [id])
  status          JobStatus   @default(PENDING)
  failedStep      String?
  failureReason   String?
  inputSnapshot   Json
  startedAt       DateTime    @default(now())
  completedAt     DateTime?

  checkResults    DossierCheckResult[]
  usageLogs       ClaudeUsageLog[]

  @@map("dossier_job")
}
```

to:

```prisma
model DossierJob {
  id              String      @id @default(uuid())
  projectId       String
  project         Project     @relation(fields: [projectId], references: [id])
  status          JobStatus   @default(PENDING)
  failedStep      String?
  failureReason   String?
  inputSnapshot   Json
  startedAt       DateTime    @default(now())
  completedAt     DateTime?

  docxFileId       String?
  docx             File?    @relation("DossierJobDocx", fields: [docxFileId], references: [id])
  pdfFileId        String?
  pdf              File?    @relation("DossierJobPdf", fields: [pdfFileId], references: [id])
  annexesPdfFileId String?
  annexesPdf       File?    @relation("DossierJobAnnexesPdf", fields: [annexesPdfFileId], references: [id])

  checkResults    DossierCheckResult[]
  usageLogs       ClaudeUsageLog[]

  @@map("dossier_job")
}
```

Then find the `File` model and add the three matching back-relations next to its other
`xxxFor` lines (anywhere in that list; exact position doesn't matter):

```prisma
  dossierJobDocxFor       DossierJob[] @relation("DossierJobDocx")
  dossierJobPdfFor        DossierJob[] @relation("DossierJobPdf")
  dossierJobAnnexesPdfFor DossierJob[] @relation("DossierJobAnnexesPdf")
```

- [ ] **Step 2: Generate and apply the migration**

Run (from `packages/db`, per this repo's own Prisma 7 cwd requirement):
```bash
cd packages/db && npm run migrate -- --name add_dossier_job_output_files
```
Expected: Prisma prints a new migration directory name under `prisma/migrations/`, applies it
to the real database (the SSH tunnel to `127.0.0.1:5433` must be up first — check with: `node
-e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);});"`
— if it reports `TUNNEL DOWN`, run `ssh -f -N -L 5433:127.0.0.1:5433 dossipv-server` first),
and regenerates the Prisma client. No errors.

- [ ] **Step 3: Verify the generated client has the new fields**

Run: `cd packages/db && npm run generate` (if the migrate command didn't already trigger it),
then from the repo root: `npm run typecheck`.
Expected: clean (0 errors) — this alone doesn't prove the fields exist, but a later task
referencing `db.dossierJob.update({ data: { docxFileId: ... } } })` failing to typecheck here
would be the first sign something went wrong with this step.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add DossierJob output file columns (docx/pdf/annexesPdf)"
```

---

## Task 5: The `DossierTemplateData` adapter

**Files:**
- Create: `packages/dossier-worker/src/build-template-data.ts`
- Test: `packages/dossier-worker/test/build-template-data.test.ts`

**Interfaces:**
- Consumes: `DossierWorkerResult` (from `generate-dossier-document.ts`, already built —
  `{ sections: DossierTextSections, engineResult: EngineResult }`), `RunEngineInput` (from
  `@dossipv/engine`), `ProjectMeta` (from `placeholder-map.ts`), a `WorkerJobSnapshot` (Task 6
  defines this; for THIS task, treat its shape as: `{ client: { fullName: string; address:
  string | null; stegReference: string | null } | null; cableRuns: { label: string; sectionMm2:
  number; lengthM: number; installMethod: string }[] }` — the fields this adapter actually
  reads), and a `companyInfo: { name: string; address: string; phone: string; email: string }`
  (read live by the caller, not from the snapshot — see Global Constraints).
- Produces: `buildTemplateData(input: { workerResult: DossierWorkerResult; engineInput:
  RunEngineInput; projectMeta: ProjectMeta; snapshot: { client: {...} | null; cableRuns:
  {...}[] }; companyInfo: {...} }): DossierTemplateData` — a pure, synchronous mapping function,
  consumed by Task 6's save/docx step.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/dossier-worker/test/build-template-data.test.ts
import { describe, it, expect } from 'vitest';
import { buildTemplateData } from '../src/build-template-data';
import type { DossierWorkerResult } from '../src/generate-dossier-document';
import type { RunEngineInput } from '@dossipv/engine';
import type { ProjectMeta } from '../src/placeholder-map';

const workerResult: DossierWorkerResult = {
  sections: {
    introduction: 'Intro text.',
    solution: 'Solution text.',
    cabling: 'Cabling text.',
    earthing: 'Earthing text.',
    structure: 'Structure text.',
    conclusion: 'Conclusion text.',
  },
  engineResult: {
    derived: { P_DC_W: 3100, MODULE_COUNT: 5 },
    checks: [],
    hasBlockingFailure: false,
  },
};

const engineInput = {
  array: [
    {
      inverter: {} as never,
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  dcSwitch: {} as never, dcFuse: null, dcSpd: {} as never, acBreaker: {} as never,
  acSpd: {} as never, acIsolator: null, equipmentImpulseWithstandKV: 0, spdToEquipmentDistanceM: 0,
  dcRun: {} as never, acRun: {} as never, cosPhi: 0.95, lambdaOhmPerM: 0, maxVoltageDropPct: 3,
  structure: {} as never, site: { phases: 1 as const, lightningRod: false, gps: { lat: 0, lon: 0 } },
  module: {} as never, tMinC: -10, tMaxC: 85,
} as unknown as RunEngineInput;

const projectMeta: ProjectMeta = {
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  gridType: 'TT',
  mountingType: 'ROOF',
  structureMaterial: 'ALUMINUM',
  earthRodCount: 1,
};

describe('buildTemplateData', () => {
  it('maps every field DossierTemplateData needs from the worker result, engine input, and live company/client data', () => {
    const data = buildTemplateData({
      workerResult,
      engineInput,
      projectMeta,
      snapshot: {
        client: { fullName: 'Ahmed Ben Ali', address: '45 Avenue Habib Bourguiba, Sousse', stegReference: 'STEG-2026-001' },
        cableRuns: [{ label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13' }],
      },
      companyInfo: { name: 'SolarPro Tunisie', address: '12 Rue de la République, Tunis', phone: '+216 71 000 000', email: 'contact@solarpro.tn' },
    });

    expect(data.companyName).toBe('SolarPro Tunisie');
    expect(data.clientFullName).toBe('Ahmed Ben Ali');
    expect(data.clientStegReference).toBe('STEG-2026-001');
    expect(data.introduction).toBe('Intro text.');
    expect(data.moduleBrandModel).toBe('LONGi LR7-72HGD-620M');
    expect(data.inverterBrandModel).toBe('Sofar 1-4KTL2-G3');
    expect(data.pDcW).toBe('3 100');
    expect(data.moduleCount).toBe('5');
    expect(data.inverters).toEqual([{ inverterLabel: 'Onduleur 1', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 }] }]);
    expect(data.cableRuns).toEqual([{ label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13' }]);
    expect(data.dcFuseRequired).toBe(false);
    expect(data.acIsolatorRequired).toBe(false);
  });

  it('falls back to empty strings for a null client rather than throwing', () => {
    const data = buildTemplateData({
      workerResult, engineInput, projectMeta,
      snapshot: { client: null, cableRuns: [] },
      companyInfo: { name: 'SolarPro Tunisie', address: 'Tunis', phone: '71000000', email: 'a@b.tn' },
    });

    expect(data.clientFullName).toBe('');
    expect(data.clientAddress).toBe('');
    expect(data.clientStegReference).toBe('');
    expect(data.cableRuns).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- build-template-data.test.ts`
Expected: FAIL with "Cannot find module '../src/build-template-data'".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/dossier-worker/src/build-template-data.ts
import type { RunEngineInput } from '@dossipv/engine';
import { PLACEHOLDER_DEFINITIONS, type ProjectMeta } from './placeholder-map';
import type { DossierWorkerResult } from './generate-dossier-document';
import type { DossierTemplateData } from '@dossipv/docx-template';

export interface BuildTemplateDataInput {
  workerResult: DossierWorkerResult;
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
  snapshot: {
    client: { fullName: string; address: string | null; stegReference: string | null } | null;
    cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string }[];
  };
  companyInfo: { name: string; address: string; phone: string; email: string };
}

function formatPlaceholder(name: 'P_DC_W' | 'MODULE_COUNT', derived: Record<string, number>): string {
  const def = PLACEHOLDER_DEFINITIONS[name]!;
  const raw = def.source({ derived, engineInput: {} as RunEngineInput, representativeMppt: { stringsInParallel: 0, modulesPerString: 0 }, projectMeta: {} as ProjectMeta });
  const decimals = def.decimals ?? 0;
  const formatted = raw.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return def.unit ? `${formatted} ${def.unit}` : formatted;
}

export function buildTemplateData(input: BuildTemplateDataInput): DossierTemplateData {
  const { workerResult, engineInput, projectMeta, snapshot, companyInfo } = input;

  return {
    companyName: companyInfo.name,
    companyAddress: companyInfo.address,
    companyPhone: companyInfo.phone,
    companyEmail: companyInfo.email,
    clientFullName: snapshot.client?.fullName ?? '',
    clientAddress: snapshot.client?.address ?? '',
    clientStegReference: snapshot.client?.stegReference ?? '',
    introduction: workerResult.sections.introduction,
    solution: workerResult.sections.solution,
    cabling: workerResult.sections.cabling,
    earthing: workerResult.sections.earthing,
    structure: workerResult.sections.structure,
    conclusion: workerResult.sections.conclusion,
    moduleBrandModel: projectMeta.moduleBrandModel,
    inverterBrandModel: projectMeta.inverterBrandModel,
    pDcW: formatPlaceholder('P_DC_W', workerResult.engineResult.derived),
    moduleCount: formatPlaceholder('MODULE_COUNT', workerResult.engineResult.derived),
    inverters: engineInput.array.map((entry, index) => ({
      inverterLabel: `Onduleur ${index + 1}`,
      mppts: entry.mppts.map((mppt, mpptIndex) => ({
        mpptLabel: `MPPT ${mpptIndex + 1}`,
        stringsInParallel: mppt.stringsInParallel,
        modulesPerString: mppt.modulesPerString,
      })),
    })),
    cableRuns: snapshot.cableRuns.map((run) => ({
      label: run.label,
      sectionMm2: run.sectionMm2,
      lengthM: run.lengthM,
      installMethod: run.installMethod,
    })),
    dcFuseRequired: engineInput.dcFuse !== null,
    acIsolatorRequired: engineInput.acIsolator !== null,
  };
}
```

**Note on `formatPlaceholder`**: `PLACEHOLDER_DEFINITIONS[name].source(ctx)` only actually reads
`ctx.derived` for `P_DC_W`/`MODULE_COUNT` (confirmed by reading `placeholder-map.ts` directly —
both definitions are `(c) => c.derived.XXX!`), so the other fields of the `PlaceholderSourceContext`
argument are never touched for these two names and the empty/placeholder values passed for them
above are safe. If `PLACEHOLDER_DEFINITIONS['P_DC_W']` or `['MODULE_COUNT']` is ever changed to
read `engineInput`/`representativeMppt`/`projectMeta`, this function's casts would need
revisiting — not a concern for this task, but worth a one-line comment in the real file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix packages/dossier-worker test -- build-template-data.test.ts`
Expected: PASS (2/2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/build-template-data.ts packages/dossier-worker/test/build-template-data.test.ts
git commit -m "feat(dossier-worker): add adapter from engine/text output to DossierTemplateData"
```

---

## Task 6: `job-snapshot.ts` — the worker's own snapshot parser

**Files:**
- Create: `packages/dossier-worker/src/job-snapshot.ts`
- Test: `packages/dossier-worker/test/job-snapshot.test.ts`

**Interfaces:**
- Produces: `interface WorkerJobSnapshot { version: 1; projectId: string; companyId: string;
  engineInput: RunEngineInput; projectMeta: ProjectMeta; client: { fullName: string; address:
  string | null; stegReference: string | null } | null; cableRuns: { label: string; sectionMm2:
  number; lengthM: number; installMethod: string }[] }` and `parseJobSnapshot(value: unknown):
  WorkerJobSnapshot | null` — returns `null` (never throws) for anything that isn't a
  recognizable `WorkerJobSnapshot` shape, consumed by Task 7's `processJob`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/dossier-worker/test/job-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { parseJobSnapshot } from '../src/job-snapshot';

const validSnapshot = {
  version: 1,
  projectId: 'project-1',
  companyId: 'company-1',
  engineInput: { array: [], dcFuse: null, acIsolator: null },
  projectMeta: { moduleBrandModel: 'X', inverterBrandModel: 'Y', gridType: 'TT', mountingType: 'ROOF', structureMaterial: 'ALUMINUM', earthRodCount: 1 },
  client: { fullName: 'Ahmed', address: 'Tunis', stegReference: 'STEG-1' },
  cableRuns: [],
};

describe('parseJobSnapshot', () => {
  it('parses a valid snapshot into its typed shape', () => {
    const result = parseJobSnapshot(validSnapshot);
    expect(result?.projectId).toBe('project-1');
    expect(result?.engineInput).toEqual({ array: [], dcFuse: null, acIsolator: null });
  });

  it('returns null (never throws) for null input', () => {
    expect(parseJobSnapshot(null)).toBeNull();
  });

  it('returns null (never throws) for a string', () => {
    expect(parseJobSnapshot('not an object')).toBeNull();
  });

  it('returns null for an object missing required fields', () => {
    expect(parseJobSnapshot({ version: 1, projectId: 'p1' })).toBeNull();
  });

  it('returns null for an object with the wrong version number', () => {
    expect(parseJobSnapshot({ ...validSnapshot, version: 2 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- job-snapshot.test.ts`
Expected: FAIL with "Cannot find module '../src/job-snapshot'".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/dossier-worker/src/job-snapshot.ts
import type { RunEngineInput } from '@dossipv/engine';
import type { ProjectMeta } from './placeholder-map';

export interface WorkerJobSnapshot {
  version: 1;
  projectId: string;
  companyId: string;
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
  client: { fullName: string; address: string | null; stegReference: string | null } | null;
  cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseJobSnapshot(value: unknown): WorkerJobSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.version !== 1) {
    return null;
  }
  if (typeof value.projectId !== 'string' || typeof value.companyId !== 'string') {
    return null;
  }
  if (!isRecord(value.engineInput) || !isRecord(value.projectMeta)) {
    return null;
  }
  if (!Array.isArray(value.cableRuns)) {
    return null;
  }
  // client is allowed to be null (a project with no client section filled in yet would never
  // reach this point in practice — the generate action already requires it — but this parser
  // stays defensive rather than assuming).
  const client = value.client === null ? null : isRecord(value.client) ? (value.client as WorkerJobSnapshot['client']) : null;

  return {
    version: 1,
    projectId: value.projectId,
    companyId: value.companyId,
    engineInput: value.engineInput as unknown as RunEngineInput,
    projectMeta: value.projectMeta as unknown as ProjectMeta,
    client,
    cableRuns: value.cableRuns as WorkerJobSnapshot['cableRuns'],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix packages/dossier-worker test -- job-snapshot.test.ts`
Expected: PASS (5/5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/dossier-worker/src/job-snapshot.ts packages/dossier-worker/test/job-snapshot.test.ts
git commit -m "feat(dossier-worker): add defensive job snapshot parser"
```

---

## Task 7: `process-job.ts` — the per-job pipeline

**Files:**
- Create: `packages/dossier-worker/src/process-job.ts`
- Test: `packages/dossier-worker/test/process-job.test.ts`
- Modify: `packages/dossier-worker/src/index.ts` (export the new public pieces)

**Interfaces:**
- Consumes: `parseJobSnapshot` (Task 6), `generateDossierDocument`/`DossierGenerationBlockedError`
  (existing, slice 1), `buildTemplateData` (Task 5), `fillDossierTemplate` (existing,
  `@dossipv/docx-template`), `convertDocxToPdf` (Task 2), `mergeAnnexes` (Task 1), `saveFile`
  (existing, `@dossipv/file-storage`).
- Produces: `processJob(jobId: string): Promise<void>` — consumed by Task 8's poll loop.

- [ ] **Step 1: Write the failing test for the full successful path**

```typescript
// packages/dossier-worker/test/process-job.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dossierJobFindUniqueOrThrow: vi.fn(),
  dossierJobUpdate: vi.fn(),
  companyFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  fileFindMany: vi.fn(),
  fileCreate: vi.fn(),
  checkResultCreateMany: vi.fn(),
  generateDossierDocument: vi.fn(),
  fillDossierTemplate: vi.fn(),
  convertDocxToPdf: vi.fn(),
  mergeAnnexes: vi.fn(),
  saveFile: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      dossierJob: { findUniqueOrThrow: mocks.dossierJobFindUniqueOrThrow, update: mocks.dossierJobUpdate },
      company: { findUnique: mocks.companyFindUnique },
      project: { findUnique: mocks.projectFindUnique },
      file: { findMany: mocks.fileFindMany, create: mocks.fileCreate },
      dossierCheckResult: { createMany: mocks.checkResultCreateMany },
    },
  };
});
vi.mock('./generate-dossier-document', () => ({ generateDossierDocument: mocks.generateDossierDocument, DossierGenerationBlockedError: class extends Error {} }));
vi.mock('@dossipv/docx-template', () => ({ fillDossierTemplate: mocks.fillDossierTemplate }));
vi.mock('./convert-to-pdf', () => ({ convertDocxToPdf: mocks.convertDocxToPdf }));
vi.mock('./merge-annexes', () => ({ mergeAnnexes: mocks.mergeAnnexes }));
vi.mock('@dossipv/file-storage', () => ({ saveFile: mocks.saveFile, getFilePath: vi.fn(() => '/fake/path') }));
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, readFile: mocks.readFile };
});

import { processJob } from '../src/process-job';

const validSnapshot = {
  version: 1,
  projectId: 'project-1',
  companyId: 'company-1',
  engineInput: { array: [{ inverter: {}, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }], dcFuse: null, acIsolator: null },
  projectMeta: { moduleBrandModel: 'X', inverterBrandModel: 'Y', gridType: 'TT', mountingType: 'ROOF', structureMaterial: 'ALUMINUM', earthRodCount: 1 },
  client: { fullName: 'Ahmed', address: 'Tunis', stegReference: 'STEG-1' },
  cableRuns: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: validSnapshot });
  mocks.companyFindUnique.mockResolvedValue({ name: 'SolarPro', address: 'Tunis', phone: '71000000', email: 'a@b.tn', logoFileId: null, anmeCertificateFileId: null });
  mocks.projectFindUnique.mockResolvedValue({ annexes: null });
  mocks.fileFindMany.mockResolvedValue([]);
  mocks.generateDossierDocument.mockResolvedValue({
    sections: { introduction: 'i', solution: 's', cabling: 'c', earthing: 'e', structure: 'st', conclusion: 'co' },
    engineResult: { derived: { P_DC_W: 3100, MODULE_COUNT: 5 }, checks: [{ id: 'C01', level: 'BLOCK', pass: true, message: 'ok' }], hasBlockingFailure: false },
  });
  mocks.fillDossierTemplate.mockReturnValue(Buffer.from('fake docx'));
  mocks.convertDocxToPdf.mockResolvedValue(Buffer.from('%PDF-fake'));
  mocks.mergeAnnexes.mockResolvedValue(Buffer.from('%PDF-merged'));
  mocks.saveFile.mockResolvedValue({ storageKey: 'dossier/fake.bin' });
  mocks.fileCreate.mockResolvedValue({ id: 'file-x' });
  mocks.readFile.mockResolvedValue(Buffer.from('template bytes'));
});

describe('processJob — success path', () => {
  it('runs every step and marks the job SUCCEEDED with three linked files and persisted check results', async () => {
    await processJob('job-1');

    expect(mocks.generateDossierDocument).toHaveBeenCalled();
    expect(mocks.fillDossierTemplate).toHaveBeenCalled();
    expect(mocks.convertDocxToPdf).toHaveBeenCalled();
    expect(mocks.mergeAnnexes).toHaveBeenCalled();
    expect(mocks.fileCreate).toHaveBeenCalledTimes(3); // docx, pdf, annexesPdf

    const finalUpdateCall = mocks.dossierJobUpdate.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED',
    );
    expect(finalUpdateCall).toBeDefined();
    expect(mocks.checkResultCreateMany).toHaveBeenCalledWith({
      data: [{ jobId: 'job-1', checkId: 'C01', level: 'BLOCK', pass: true, message: 'ok' }],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- process-job.test.ts`
Expected: FAIL with "Cannot find module '../src/process-job'".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/dossier-worker/src/process-job.ts
import { readFile } from 'fs/promises';
import { join } from 'path';
import { db } from '@dossipv/db';
import { saveFile } from '@dossipv/file-storage';
import { fillDossierTemplate } from '@dossipv/docx-template';
import { generateDossierDocument, DossierGenerationBlockedError } from './generate-dossier-document';
import { buildTemplateData } from './build-template-data';
import { convertDocxToPdf } from './convert-to-pdf';
import { mergeAnnexes, type AnnexFile } from './merge-annexes';
import { parseJobSnapshot } from './job-snapshot';
import { withRetry } from './retry';

const TEMPLATE_PATH = join(import.meta.dirname, '..', '..', 'docx-template', 'template', 'dossier-template.docx');

async function fail(jobId: string, failedStep: string, failureReason: string): Promise<void> {
  await db.dossierJob.update({
    where: { id: jobId },
    data: { status: 'FAILED', failedStep, failureReason, completedAt: new Date() },
  });
}

async function collectAnnexFiles(projectId: string, companyId: string): Promise<AnnexFile[]> {
  const [company, project] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.project.findUnique({ where: { id: projectId }, include: { annexes: { include: { extraFiles: true } } } }),
  ]);

  const fileIds = [
    company?.anmeCertificateFileId,
    project?.annexes?.cinFileId,
    project?.annexes?.commercialRegisterFileId,
    project?.annexes?.stegContractFileId,
    project?.annexes?.lastPaidBillFileId,
    ...(project?.annexes?.extraFiles.map((f) => f.fileId) ?? []),
  ].filter((id): id is string => typeof id === 'string');

  if (fileIds.length === 0) {
    return [];
  }

  const files = await db.file.findMany({ where: { id: { in: fileIds } } });
  const { getFilePath } = await import('@dossipv/file-storage');
  const annexFiles: AnnexFile[] = [];
  for (const file of files) {
    const buffer = await readFile(getFilePath(file.storageKey));
    annexFiles.push({ buffer, mimeType: file.mimeType as 'pdf' | 'png' | 'jpeg' });
  }
  return annexFiles;
}

export async function processJob(jobId: string): Promise<void> {
  const job = await db.dossierJob.findUniqueOrThrow({ where: { id: jobId } });

  const snapshot = parseJobSnapshot(job.inputSnapshot);
  if (!snapshot) {
    return fail(jobId, 'snapshot', 'Instantané de la saisie illisible ou corrompu.');
  }

  let workerResult;
  try {
    workerResult = await withRetry(() => generateDossierDocument({ engineInput: snapshot.engineInput, projectMeta: snapshot.projectMeta }));
  } catch (error) {
    if (error instanceof DossierGenerationBlockedError) {
      return fail(jobId, 'text', error.message);
    }
    return fail(jobId, 'text', error instanceof Error ? error.message : String(error));
  }

  const company = await db.company.findUnique({ where: { id: snapshot.companyId } });
  if (!company) {
    return fail(jobId, 'docx', 'Société introuvable.');
  }

  let docxBuffer: Buffer;
  try {
    const templateData = buildTemplateData({
      workerResult,
      engineInput: snapshot.engineInput,
      projectMeta: snapshot.projectMeta,
      snapshot: { client: snapshot.client, cableRuns: snapshot.cableRuns },
      companyInfo: { name: company.name, address: company.address, phone: company.phone, email: company.email },
    });
    const templateBuffer = await readFile(TEMPLATE_PATH);
    docxBuffer = fillDossierTemplate(templateBuffer, templateData);
  } catch (error) {
    return fail(jobId, 'docx', error instanceof Error ? error.message : String(error));
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await convertDocxToPdf(docxBuffer);
  } catch (error) {
    return fail(jobId, 'pdf', error instanceof Error ? error.message : String(error));
  }

  let annexesPdfBuffer: Buffer;
  try {
    const annexFiles = await collectAnnexFiles(snapshot.projectId, snapshot.companyId);
    annexesPdfBuffer = await mergeAnnexes(pdfBuffer, annexFiles);
  } catch (error) {
    return fail(jobId, 'annexes', error instanceof Error ? error.message : String(error));
  }

  try {
    const docxSaved = await saveFile(docxBuffer, 'dossier.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const docxFile = await db.file.create({ data: { fileName: 'dossier.docx', mimeType: 'docx', storageKey: docxSaved.storageKey } });

    const pdfSaved = await saveFile(pdfBuffer, 'dossier.pdf', 'application/pdf');
    const pdfFile = await db.file.create({ data: { fileName: 'dossier.pdf', mimeType: 'pdf', storageKey: pdfSaved.storageKey } });

    const annexesSaved = await saveFile(annexesPdfBuffer, 'annexes.pdf', 'application/pdf');
    const annexesFile = await db.file.create({ data: { fileName: 'annexes.pdf', mimeType: 'pdf', storageKey: annexesSaved.storageKey } });

    await db.dossierCheckResult.createMany({
      data: workerResult.engineResult.checks.map((check) => ({
        jobId,
        checkId: check.id,
        level: check.level,
        pass: check.pass,
        message: check.message,
      })),
    });

    await db.dossierJob.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
        completedAt: new Date(),
        docxFileId: docxFile.id,
        pdfFileId: pdfFile.id,
        annexesPdfFileId: annexesFile.id,
      },
    });
  } catch (error) {
    return fail(jobId, 'save', error instanceof Error ? error.message : String(error));
  }
}
```

**Note on `mimeType: 'docx'`**: `@dossipv/file-storage`'s `validateUploadedFile` only recognizes
`'pdf' | 'png' | 'jpeg'` as upload-time MIME types (it exists to reject malicious user uploads),
but `saveFile`/`File.mimeType` itself is just a free-text column — the worker's own generated
`.docx` output never goes through `validateUploadedFile` (there is nothing to validate; the
worker produced the bytes itself), so storing `'docx'` as a descriptive tag here is correct and
matches how `File.mimeType`'s own schema comment already describes it as a loose tag
(`"pdf" | "png" | "jpeg"` is that comment's documented set for UPLOADED files specifically, not
a database-enforced constraint).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix packages/dossier-worker test -- process-job.test.ts`
Expected: PASS (1/1 test).

- [ ] **Step 5: Write the failing tests for the five failure-step cases**

```typescript
// Add to packages/dossier-worker/test/process-job.test.ts
describe('processJob — failure paths', () => {
  it('fails with failedStep "snapshot" when inputSnapshot cannot be parsed', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { garbage: true } });

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { status: string; failedStep: string } };
    expect(failCall.data.status).toBe('FAILED');
    expect(failCall.data.failedStep).toBe('snapshot');
  });

  it('fails with failedStep "text" when generateDossierDocument throws', async () => {
    mocks.generateDossierDocument.mockRejectedValue(new Error('Claude unavailable'));

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { status: string; failedStep: string; failureReason: string } };
    expect(failCall.data.failedStep).toBe('text');
    expect(failCall.data.failureReason).toBe('Claude unavailable');
  });

  it('fails with failedStep "docx" when the company cannot be found', async () => {
    mocks.companyFindUnique.mockResolvedValue(null);

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { failedStep: string } };
    expect(failCall.data.failedStep).toBe('docx');
  });

  it('fails with failedStep "pdf" when LibreOffice conversion throws', async () => {
    mocks.convertDocxToPdf.mockRejectedValue(new Error('soffice exited with code 1'));

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { failedStep: string } };
    expect(failCall.data.failedStep).toBe('pdf');
  });

  it('fails with failedStep "save" when writing the final files throws', async () => {
    mocks.saveFile.mockRejectedValue(new Error('disk full'));

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { failedStep: string } };
    expect(failCall.data.failedStep).toBe('save');
  });
});

describe('processJob — annexes edge cases (Review Focus items 1 and 4)', () => {
  it('succeeds with a complete dossier when the project has zero annex files uploaded', async () => {
    mocks.companyFindUnique.mockResolvedValue({ name: 'SolarPro', address: 'Tunis', phone: '71000000', email: 'a@b.tn', anmeCertificateFileId: null });
    mocks.projectFindUnique.mockResolvedValue({ annexes: null });

    await processJob('job-1');

    expect(mocks.mergeAnnexes).toHaveBeenCalledWith(expect.any(Buffer), []);
    const finalUpdateCall = mocks.dossierJobUpdate.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED',
    );
    expect(finalUpdateCall).toBeDefined();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm --prefix packages/dossier-worker test -- process-job.test.ts`
Expected: the 5 new failure-path tests and the zero-annexes test should already PASS given
Step 3's implementation (this step is here to confirm that, not to find a gap) — if any of them
fail, read the failure message, find the mismatched `failedStep` or missing early-return in the
Step 3 code, and fix the implementation (not the test) before moving on. **If every test in this
file already passes after Step 3**, that is the expected, correct outcome for this step — the
implementation was written with these cases in mind from the start; this step exists to prove
it, not to drive new code.

- [ ] **Step 7: Confirm all tests pass**

Run: `npm --prefix packages/dossier-worker test -- process-job.test.ts`
Expected: PASS (7/7 tests).

- [ ] **Step 8: Export the new public pieces**

```typescript
// packages/dossier-worker/src/index.ts — add these lines
export * from './process-job';
export * from './job-snapshot';
export * from './build-template-data';
export * from './merge-annexes';
export * from './convert-to-pdf';
export * from './retry';
```

- [ ] **Step 9: Run the full package test suite and typecheck**

Run: `npm --prefix packages/dossier-worker test && npm run typecheck`
Expected: both PASS / clean.

- [ ] **Step 10: Commit**

```bash
git add packages/dossier-worker/src/process-job.ts packages/dossier-worker/src/index.ts packages/dossier-worker/test/process-job.test.ts
git commit -m "feat(dossier-worker): add the per-job pipeline (processJob)"
```

---

## Task 8: `run-worker.ts` — the atomic claim and poll loop

**Files:**
- Create: `packages/dossier-worker/src/run-worker.ts`
- Test: `packages/dossier-worker/test/run-worker.test.ts`
- Modify: `packages/dossier-worker/package.json` (add `"bin"` entry)

**Interfaces:**
- Consumes: `processJob` (Task 7).
- Produces: `claimNextJob(): Promise<string | null>` (returns the claimed job's id, or `null` if
  no `PENDING` job exists — exported for the test to call directly rather than only through the
  full loop), `resetStaleRunningJobs(staleThresholdMs: number): Promise<number>` (returns how
  many jobs were reset), and a `main()` entry point that is NOT unit tested (per spec §5 — the
  loop itself is "obviously correct glue" once its two real pieces are proven).

- [ ] **Step 1: Write the failing test for the atomic claim (Review Focus item 3 — the most
  important test in this plan)**

```typescript
// packages/dossier-worker/test/run-worker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, dossierJob: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } } };
});

import { claimNextJob, resetStaleRunningJobs } from '../src/run-worker';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('claimNextJob', () => {
  it('returns null when there is no PENDING job', async () => {
    mocks.findFirst.mockResolvedValue(null);

    const result = await claimNextJob();

    expect(result).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('claims the oldest PENDING job by its id, conditioned on it still being PENDING', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'job-1' });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await claimNextJob();

    expect(result).toBe('job-1');
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: expect.any(Date) },
    });
  });

  it('returns null when another process claims the same job first (updateMany affects 0 rows)', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'job-1' });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await claimNextJob();

    expect(result).toBeNull();
  });
});

describe('resetStaleRunningJobs', () => {
  it('resets any job RUNNING longer than the threshold back to PENDING', async () => {
    mocks.updateMany.mockResolvedValue({ count: 2 });

    const count = await resetStaleRunningJobs(600_000);

    expect(count).toBe(2);
    const callArg = mocks.updateMany.mock.calls[0]?.[0] as { where: { status: string; startedAt: { lt: Date } }; data: { status: string } };
    expect(callArg.where.status).toBe('RUNNING');
    expect(callArg.data.status).toBe('PENDING');
    expect(callArg.where.startedAt.lt.getTime()).toBeLessThan(Date.now());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/dossier-worker test -- run-worker.test.ts`
Expected: FAIL with "Cannot find module '../src/run-worker'".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/dossier-worker/src/run-worker.ts
import { db } from '@dossipv/db';
import { processJob } from './process-job';

const POLL_INTERVAL_MS = Number(process.env.DOSSIER_WORKER_POLL_INTERVAL_MS ?? 5000);
const STALE_RUNNING_MS = Number(process.env.DOSSIER_WORKER_STALE_RUNNING_MS ?? 600_000);

export async function claimNextJob(): Promise<string | null> {
  const candidate = await db.dossierJob.findFirst({
    where: { status: 'PENDING' },
    orderBy: { startedAt: 'asc' },
    select: { id: true },
  });
  if (!candidate) {
    return null;
  }

  const claimed = await db.dossierJob.updateMany({
    where: { id: candidate.id, status: 'PENDING' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  return claimed.count === 1 ? candidate.id : null;
}

export async function resetStaleRunningJobs(staleThresholdMs: number): Promise<number> {
  const result = await db.dossierJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - staleThresholdMs) } },
    data: { status: 'PENDING' },
  });
  return result.count;
}

let shuttingDown = false;

async function pollOnce(): Promise<void> {
  const jobId = await claimNextJob();
  if (jobId) {
    try {
      await processJob(jobId);
    } catch (error) {
      // processJob is written to catch and record every failure itself; an exception escaping
      // it means something is badly wrong (e.g. the DB connection itself dropped). Log and keep
      // the worker alive rather than letting one bad job crash the whole process.
      // eslint-disable-next-line no-console -- this is the worker's own top-level error log, not a debug leftover.
      console.error(`processJob threw unexpectedly for job ${jobId}:`, error);
    }
  }
}

export async function main(): Promise<void> {
  await resetStaleRunningJobs(STALE_RUNNING_MS);

  process.on('SIGTERM', () => {
    shuttingDown = true;
  });
  process.on('SIGINT', () => {
    shuttingDown = true;
  });

  while (!shuttingDown) {
    await pollOnce();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // eslint-disable-next-line no-console -- top-level fatal startup error, intentionally logged before exit.
    console.error('Dossier worker crashed:', error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix packages/dossier-worker test -- run-worker.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Add the `bin` entry**

```json
// packages/dossier-worker/package.json — add at the top level, alongside "main"/"types"
"bin": {
  "dossipv-dossier-worker": "./src/run-worker.ts"
},
```

Note: this `bin` entry points at a `.ts` file, which only works when run via `tsx`/`node
--experimental-strip-types` or after a build step — the plan's own Task 9 live-verification
step runs it via `npx tsx packages/dossier-worker/src/run-worker.ts` directly rather than
relying on the `bin` symlink being executable as-is; the `bin` entry itself is there so the
real server's eventual process-manager config (systemd/pm2 — a deployment detail, not this
plan's concern per the spec's own stated scope) has something standard to reference.

- [ ] **Step 6: Run the full package test suite and typecheck**

Run: `npm --prefix packages/dossier-worker test && npm run typecheck`
Expected: both PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add packages/dossier-worker/src/run-worker.ts packages/dossier-worker/package.json packages/dossier-worker/test/run-worker.test.ts
git commit -m "feat(dossier-worker): add the atomic claim and poll loop (run-worker)"
```

---

## Task 9: The download route and `listJobFiles` rewiring

**Files:**
- Modify: `apps/web/lib/dossier-files.ts` (rewrite `listJobFiles`)
- Create: `apps/web/app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route.ts`
- Test: `apps/web/test/dossier-files.test.ts` (new — `listJobFiles` has no existing test file;
  confirm with `find apps/web/test -iname "*dossier-files*"` before writing, and if one somehow
  already exists, extend it instead of creating a duplicate)
- Test: `apps/web/test/dossier-job-files-route.test.ts`

**Interfaces:**
- Consumes: `DossierJob.docxFileId`/`pdfFileId`/`annexesPdfFileId` (Task 4), `getFilePath`
  (existing, `@dossipv/file-storage`).
- Produces: `listJobFiles(job: { id: string; docxFileId: string | null; pdfFileId: string |
  null; annexesPdfFileId: string | null }): DossierFileView[]` (note the widened parameter shape
  — the existing signature only took `{ id, status }`; this task changes it, so check every
  existing caller — there is exactly one, the job results page — and update it in the same
  commit).

- [ ] **Step 1: Find the current callers of `listJobFiles`**

Run: `grep -rn "listJobFiles" apps/web --include="*.tsx" --include="*.ts"`
Expected: one result in the job results page
(`apps/web/app/(app)/projects/[id]/jobs/[jobId]/page.tsx`) passing `job` (whatever shape that
page already loads the job as). Read that call site before writing Step 3's implementation, so
the new parameter shape is a strict superset of what's already passed (don't break that page).

- [ ] **Step 2: Write the failing test for `listJobFiles`**

```typescript
// apps/web/test/dossier-files.test.ts
import { describe, it, expect } from 'vitest';
import { listJobFiles } from '../lib/dossier-files';

describe('listJobFiles', () => {
  it('returns all three file views when every output file exists', () => {
    const job = { id: 'job-1', docxFileId: 'file-1', pdfFileId: 'file-2', annexesPdfFileId: 'file-3' };

    const files = listJobFiles(job);

    expect(files).toEqual([
      { kind: 'docx', label: 'Document Word (.docx)', href: '/projects/job-1-placeholder/jobs/job-1/files/docx' },
      { kind: 'pdf', label: 'Dossier complet (PDF)', href: '/projects/job-1-placeholder/jobs/job-1/files/pdf' },
      { kind: 'annexes', label: 'Annexes seules (PDF)', href: '/projects/job-1-placeholder/jobs/job-1/files/annexes' },
    ]);
  });

  it('returns an empty array when no output file exists yet (job still PENDING/RUNNING)', () => {
    const job = { id: 'job-1', docxFileId: null, pdfFileId: null, annexesPdfFileId: null };

    expect(listJobFiles(job)).toEqual([]);
  });

  it('returns only the files that exist when a job partially failed after saving some outputs', () => {
    const job = { id: 'job-1', docxFileId: 'file-1', pdfFileId: null, annexesPdfFileId: null };

    expect(listJobFiles(job)).toEqual([
      { kind: 'docx', label: 'Document Word (.docx)', href: expect.stringContaining('/files/docx') },
    ]);
  });
});
```

**Note on the `href` shape**: the real route is nested under `/projects/[id]/jobs/[jobId]/
files/[kind]`, which needs the PROJECT id, not just the job id — `listJobFiles`'s signature
must therefore also take the project id. Revise the test above (and the signature) once you
read the actual call site in Step 1 — if the results page already has `projectId` in scope
(it does; every page under `/projects/[id]/...` has it from `params`), pass it as a second
argument: `listJobFiles(job, projectId)`. Use this corrected two-argument form for the rest of
this task; the single-argument sketch above was this plan's first draft, corrected here before
any code is written against it.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm --prefix apps/web test -- test/dossier-files.test.ts`
Expected: FAIL — current `listJobFiles` returns `[]` unconditionally, and doesn't accept a
`projectId` second argument yet.

- [ ] **Step 4: Rewrite `listJobFiles`**

```typescript
// apps/web/lib/dossier-files.ts
export interface DossierFileView {
  kind: 'docx' | 'pdf' | 'annexes';
  label: string;
  href: string;
}

const FILE_KIND_LABELS: Record<DossierFileView['kind'], string> = {
  docx: 'Document Word (.docx)',
  pdf: 'Dossier complet (PDF)',
  annexes: 'Annexes seules (PDF)',
};

export function listJobFiles(
  job: { id: string; docxFileId: string | null; pdfFileId: string | null; annexesPdfFileId: string | null },
  projectId: string,
): DossierFileView[] {
  const entries: { kind: DossierFileView['kind']; fileId: string | null }[] = [
    { kind: 'docx', fileId: job.docxFileId },
    { kind: 'pdf', fileId: job.pdfFileId },
    { kind: 'annexes', fileId: job.annexesPdfFileId },
  ];

  return entries
    .filter((entry) => entry.fileId !== null)
    .map((entry) => ({
      kind: entry.kind,
      label: FILE_KIND_LABELS[entry.kind],
      href: `/projects/${projectId}/jobs/${job.id}/files/${entry.kind}`,
    }));
}
```

- [ ] **Step 5: Update the test's expected hrefs and the one real call site**

Fix the test file's `href` expectations to use a real `projectId` (e.g. `'project-1'`) and call
`listJobFiles(job, 'project-1')`. Then update the job results page's own call to
`listJobFiles(...)` to pass its `project.id` (or whatever variable holds the project id in that
file — read it, don't guess) as the second argument.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm --prefix apps/web test -- test/dossier-files.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 7: Write the failing test for the download route**

```typescript
// apps/web/test/dossier-job-files-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockCookies: vi.fn(() => Promise.resolve({ get: mocks.mockGet })),
  mockValidateSession: vi.fn(),
  mockProjectFindFirst: vi.fn(),
  mockJobFindFirst: vi.fn(),
  mockFileFindUnique: vi.fn(),
  mockGetFilePath: vi.fn(),
  mockCreateReadStream: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.mockCookies }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mocks.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: { ...actual.db, project: { findFirst: mocks.mockProjectFindFirst }, dossierJob: { findFirst: mocks.mockJobFindFirst }, file: { findUnique: mocks.mockFileFindUnique } },
  };
});
vi.mock('@dossipv/file-storage', () => ({ getFilePath: mocks.mockGetFilePath }));
vi.mock('fs', () => ({ createReadStream: mocks.mockCreateReadStream }));

import { GET } from '../app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockGet.mockReturnValue({ value: 'valid-session-token' });
  mocks.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com' });
});

function makeRequest(): Request {
  return new Request('http://localhost/projects/p1/jobs/j1/files/pdf');
}

describe('GET /projects/[id]/jobs/[jobId]/files/[kind]', () => {
  it('returns 404 when the project is not owned by the caller', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue(null);

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'pdf' }) });

    expect(response.status).toBe(404);
  });

  it('returns 404 when the job has no pdfFileId yet', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue({ id: 'p1' });
    mocks.mockJobFindFirst.mockResolvedValue({ id: 'j1', projectId: 'p1', pdfFileId: null, docxFileId: null, annexesPdfFileId: null });

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'pdf' }) });

    expect(response.status).toBe(404);
  });

  it('streams the file with the correct content type when everything is found', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue({ id: 'p1' });
    mocks.mockJobFindFirst.mockResolvedValue({ id: 'j1', projectId: 'p1', pdfFileId: 'file-1', docxFileId: null, annexesPdfFileId: null });
    mocks.mockFileFindUnique.mockResolvedValue({ id: 'file-1', fileName: 'dossier.pdf', mimeType: 'pdf', storageKey: 'dossier/abc.pdf' });
    mocks.mockGetFilePath.mockReturnValue('/fake/storage/dossier/abc.pdf');
    mocks.mockCreateReadStream.mockReturnValue(new ReadableStream());

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'pdf' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('dossier.pdf');
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm --prefix apps/web test -- test/dossier-job-files-route.test.ts`
Expected: FAIL with "Cannot find module '../app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route'".

- [ ] **Step 9: Write the Route Handler**

```typescript
// apps/web/app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route.ts
import { cookies } from 'next/headers';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { db } from '@dossipv/db';
import { validateSession } from '@dossipv/auth';
import { getFilePath } from '@dossipv/file-storage';

const FILE_ID_FIELDS = { docx: 'docxFileId', pdf: 'pdfFileId', annexes: 'annexesPdfFileId' } as const;
const CONTENT_TYPES: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; jobId: string; kind: string }> },
): Promise<Response> {
  const { id: projectId, jobId, kind } = await params;

  const token = (await cookies()).get('dossipv_session')?.value;
  const user = token ? await validateSession(token) : null;
  if (!user) {
    return new Response(null, { status: 401 });
  }

  const project = await db.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { id: true } });
  if (!project) {
    return new Response(null, { status: 404 });
  }

  if (!(kind in FILE_ID_FIELDS)) {
    return new Response(null, { status: 404 });
  }
  const fileIdField = FILE_ID_FIELDS[kind as keyof typeof FILE_ID_FIELDS];

  const job = await db.dossierJob.findFirst({ where: { id: jobId, projectId } });
  const fileId = job ? (job as unknown as Record<string, string | null>)[fileIdField] : null;
  if (!fileId) {
    return new Response(null, { status: 404 });
  }

  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) {
    return new Response(null, { status: 404 });
  }

  const stream = createReadStream(getFilePath(file.storageKey));
  const contentType = CONTENT_TYPES[file.mimeType] ?? 'application/octet-stream';

  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    },
  });
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm --prefix apps/web test -- test/dossier-job-files-route.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 11: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/dossier-files.ts "apps/web/app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route.ts" apps/web/test/dossier-files.test.ts apps/web/test/dossier-job-files-route.test.ts "apps/web/app/(app)/projects/[id]/jobs/[jobId]/page.tsx"
git commit -m "feat(web): wire up real dossier file downloads (docx/pdf/annexes)"
```

---

## Task 10: Live verification against the real server

**Files:** none — verification only, code changes only if a real gap is found.

- [ ] **Step 1: Confirm the SSH tunnel is alive**

Run: `node -e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);});"`
Expected: `tunnel alive`. Re-check even if it passed earlier — it has dropped mid-session
multiple times in this project already.

- [ ] **Step 2: Seed a real project ready to generate**

Using the admin UI / existing seed data (a `Project` with `client`, `site`, `arrayConfig`,
`protections`, `cablingConfig`+`cableRuns`, `structure`, `earthing`, and `simulation` all
filled in — reuse an existing fully-filled seeded project if one exists; check with a quick
Prisma query before creating a new one from scratch), create a real `DossierJob` via the real
"Générer" button in a real browser (Playwright), landing on its job results page.

- [ ] **Step 3: Run the worker once against the real job**

Run: `npx tsx packages/dossier-worker/src/run-worker.ts` in the foreground, and watch it pick up
the `PENDING` job within `DOSSIER_WORKER_POLL_INTERVAL_MS` (5s default). Let it finish one job,
then stop it (Ctrl+C / `SIGINT`) — the loop's own `main()` checks `shuttingDown` only between
polls, so it will exit after the current poll's job (if any) completes.

- [ ] **Step 4: Verify the real outcome**

Reload the job's results page in the browser. Expected: status shows `SUCCEEDED`, three
download links appear (docx/pdf/annexes), each one actually downloads a real file when clicked,
and the PDF opens and is a valid, non-corrupt PDF with readable French dossier text (not just
non-empty bytes — read the opened PDF to confirm the text looks like real dossier prose, not
garbled or empty pages).

- [ ] **Step 5: Verify a deliberate failure surfaces correctly**

Temporarily rename `soffice` off `PATH` on this machine (or, if testing against the real
server directly, temporarily move `/usr/bin/soffice` aside via SSH — reversible, confirm with
the user first if doing this on the real server rather than a local machine), create a second
job, run the worker once more, and confirm: the job's status becomes `FAILED`, `failedStep`
shows `'pdf'`, and the results page's own pipeline-step UI renders the failure at the correct
step with the real error message shown. Restore `soffice` afterward and confirm `which soffice`
(or the Windows-appropriate check) succeeds again before finishing this task.

- [ ] **Step 6: Verify the zero-annexes and with-annexes cases both work for real**

For the job from Step 2 (likely with no annexes uploaded yet), confirm the generated PDF has no
extra pages beyond the dossier itself. Then, via the real annexes upload UI (built just before
this plan), upload a real CIN PDF to that same project, regenerate (a fresh "Générer" click
creates a new job — regeneration is already supported by existing code), run the worker again,
and confirm the new job's PDF has exactly one more page than the dossier alone.

- [ ] **Step 7: Run the full workspace suite, typecheck, and lint one more time**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS/clean.

- [ ] **Step 8: Confirm no stray verification files or secrets were committed**

Run: `git status --porcelain` — expect empty (beyond this plan's own already-committed tasks).

- [ ] **Step 9: Update project memory**

Update `C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
recording: the dossier generation worker is done and live-verified end to end (a real dossier
was generated, downloaded, and opened), the exact scope that remains open (drawings — SVG
single-line/wiring diagrams — explicitly deferred as its own sub-project), and anything from
Steps 2-6 that surprised you (matching this file's own established style of being specific
about what was actually exercised versus assumed).

- [ ] **Step 10: Final commit if Steps 5 or 6 found anything to fix**

```bash
git add -A
git commit -m "fix(dossier-worker): close a gap found in the worker's live verification"
```

(Skip entirely if nothing was found.)
