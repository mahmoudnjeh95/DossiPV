# Equipment Catalog CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `@dossipv/file-storage` package (local-disk upload/retrieve/delete, a
root directory from `FILE_STORAGE_ROOT`) and 9 separate super-admin CRUD page sets — one per
equipment type (`PvModule`, `Inverter`, `Spd`, `DcSwitch`, `DcFuse`, `AcBreaker`,
`AcIsolator`, `Cable`, `Accessory`) — each with list/create/edit/delete, real datasheet/
homologation file uploads, and a usage-check guard before delete.

**Architecture:** `@dossipv/file-storage` is a thin, dependency-free package (just Node's
`fs`/`path`/`crypto`) implementing the 3-function interface the master spec's own "swappable
for S3 later" requirement calls for. Every equipment type's pages/actions follow an identical
structural pattern (proven once in Task 2 for `PvModule`, then repeated per type in Tasks
3-10) — Server Components for list/edit-load, Server Actions for create/update/delete, the
existing `requireAuthenticatedSuperAdmin()` guard called independently by every page and
action per this session's own established defense-in-depth pattern.

**Tech Stack:** Node's built-in `fs`/`crypto`, `@dossipv/db`, Next.js Server Actions with
`FormData`/`File`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-equipment-catalog-crud-design.md`

## Global Constraints

- `FILE_STORAGE_ROOT` env var — this plan sets its default (for local dev, when unset) to a
  path under the repo's own gitignored scratch area (`<repo-root>/.file-storage`, added to
  `.gitignore`), documented as a deliberate choice, not an undecided default — the spec's own
  §6 flagged this as needing a decision, resolved here.
- Every uploaded file is validated by BOTH its claimed MIME type AND its real magic bytes
  (`%PDF` for PDF, `\x89PNG` for PNG, `\xFF\xD8\xFF` for JPEG) before being accepted — a
  client-supplied `file.type` is never trusted alone.
- Max upload size: 10 MB, enforced server-side before the file is written to disk (check
  `file.size` before calling `saveFile`, not after).
- Every list/create/edit/delete page and action calls `requireAuthenticatedSuperAdmin()`
  itself, independently — this exact gap (relying solely on the layout) was flagged by the
  automated security review twice already this session; do not reintroduce it a third time.
- Every created/edited equipment row has `ownerCompanyId: null` unconditionally — no form in
  this plan exposes that field for the super-admin to set.
- Delete actions MUST check every one of that type's real usage relations (not just the first
  found) before deleting — per the spec's own §4 table: `Spd` has 2 (`protectionsDc`,
  `protectionsAc`), `Cable` has 2 (`cableRuns`, `earthingCableFor`), `Accessory` has 3
  (`connectorFor`, `cableTrayFor`, `distributionBlockFor`), every other type has exactly 1.
- Replacing a file on edit (new upload in a slot that already has one) deletes the OLD stored
  file and `File` row only AFTER the new one is successfully saved — never before, to avoid a
  window where a failed upload has already destroyed the previous file.

## Review Focus

- **A delete attempt on equipment still referenced by a project must return a clear French
  error, never a raw Prisma foreign-key-violation 500** — this is a realistic, common case
  (any catalog item used anywhere), not an edge case; every one of the 9 delete actions needs
  its own test proving this, not just one representative type.
- **`Spd` and `Accessory`'s multi-relation usage checks must each be tested with usage on
  EVERY one of their relations individually** (e.g. a test where only `protectionsAc` has a
  row, not `protectionsDc`, still blocks the delete) — a test that only exercises the first
  relation in the list could pass even if a later relation in the same check was silently
  omitted from the code.
- **A renamed-extension attack (a non-PDF/PNG/JPEG file's real bytes, given a `.pdf`-style
  filename and a spoofed `Content-Type`) must be rejected by the magic-byte check specifically,
  not just by filename/MIME inspection** — this is the whole reason the magic-byte check
  exists; a test must prove it actually fires, not just that the MIME-type check alone works.
- **An edit that uploads a new file must not leave the old file orphaned on disk** if the new
  upload itself fails partway through (e.g. the DB update fails after the new file was already
  written) — the ordering constraint from this plan's own Global Constraints section needs a
  test proving the OLD file is still retrievable if the NEW save/DB-update sequence fails,
  not just that the happy path deletes it correctly.
- **The 10 MB size limit must be enforced BEFORE any byte of the file is written to disk** —
  a test with an oversized `File` object must prove `saveFile` (or the action calling it) was
  never invoked, not just that the resulting DB row wasn't created (which could pass even if a
  partial/full file was wastefully written to disk first).

---

## Task 1: `@dossipv/file-storage` package

**Files:**
- Create: `packages/file-storage/package.json`
- Create: `packages/file-storage/tsconfig.json`
- Create: `packages/file-storage/src/index.ts`
- Create: `packages/file-storage/src/validate-upload.ts`
- Create: `packages/file-storage/test/index.test.ts`
- Create: `packages/file-storage/test/validate-upload.test.ts`
- Modify: `tsconfig.json` (root) — add a reference
- Modify: `.gitignore` — add `.file-storage/`
- Modify: `apps/web/.env` (and any other package that will need it later) — add
  `FILE_STORAGE_ROOT`

**Interfaces:**
- Produces: `saveFile(buffer: Buffer, originalFileName: string, mimeType: string):
  Promise<{ storageKey: string }>`, `getFilePath(storageKey: string): string`,
  `deleteFile(storageKey: string): Promise<void>`, `validateUploadedFile(buffer: Buffer,
  claimedMimeType: string, sizeBytes: number): { valid: true; mimeType: 'pdf' | 'png' | 'jpeg' }
  | { valid: false; error: string }` — consumed by every equipment type's create/update/delete
  actions in Tasks 2-10.

- [ ] **Step 1: Scaffold the package**

```json
// packages/file-storage/package.json
{
  "name": "@dossipv/file-storage",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "@types/node": "^22.0.0" }
}
```

```json
// packages/file-storage/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Add `{ "path": "packages/file-storage" }` to the root `tsconfig.json`'s `references` array.

- [ ] **Step 2: Add `.file-storage/` to `.gitignore` and `FILE_STORAGE_ROOT` to `apps/web/.env`**

In `.gitignore`, add a new line: `.file-storage/`

In `apps/web/.env` (confirm `git check-ignore -q apps/web/.env` first — it already is, per
every prior sub-project's own convention), add:
```
FILE_STORAGE_ROOT="D:/mahmoud repo/DossiPV/.file-storage"
```
(Use the actual absolute repo path on this machine — Node's `fs` needs a real absolute path
for local dev; production's own `.env` on the real server would point at a real server path,
not committed here.)

- [ ] **Step 3: Write the failing tests for `validateUploadedFile`**

```ts
// packages/file-storage/test/validate-upload.test.ts
import { describe, it, expect } from 'vitest';
import { validateUploadedFile } from '../src/validate-upload';

const PDF_MAGIC = Buffer.from('%PDF-1.4\n...');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);

describe('validateUploadedFile', () => {
  it('accepts a real PDF (correct magic bytes, correct claimed type, under the size limit)', () => {
    const result = validateUploadedFile(PDF_MAGIC, 'application/pdf', PDF_MAGIC.length);
    expect(result).toEqual({ valid: true, mimeType: 'pdf' });
  });

  it('accepts a real PNG', () => {
    const result = validateUploadedFile(PNG_MAGIC, 'image/png', PNG_MAGIC.length);
    expect(result).toEqual({ valid: true, mimeType: 'png' });
  });

  it('accepts a real JPEG', () => {
    const result = validateUploadedFile(JPEG_MAGIC, 'image/jpeg', JPEG_MAGIC.length);
    expect(result).toEqual({ valid: true, mimeType: 'jpeg' });
  });

  it('rejects a renamed-extension attack: claimed application/pdf but real bytes are a PNG', () => {
    const result = validateUploadedFile(PNG_MAGIC, 'application/pdf', PNG_MAGIC.length);
    expect(result.valid).toBe(false);
  });

  it('rejects an unsupported claimed MIME type outright', () => {
    const result = validateUploadedFile(PDF_MAGIC, 'application/zip', PDF_MAGIC.length);
    expect(result.valid).toBe(false);
  });

  it('rejects a file exceeding the 10 MB size limit, regardless of valid magic bytes', () => {
    const result = validateUploadedFile(PDF_MAGIC, 'application/pdf', 10 * 1024 * 1024 + 1);
    expect(result.valid).toBe(false);
  });

  it('accepts a file at exactly the 10 MB boundary', () => {
    const result = validateUploadedFile(PDF_MAGIC, 'application/pdf', 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm install && npm --prefix packages/file-storage test -- test/validate-upload.test.ts`
Expected: FAIL — `Cannot find module '../src/validate-upload'`.

- [ ] **Step 5: Implement `validate-upload.ts`**

```ts
// packages/file-storage/src/validate-upload.ts
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const MAGIC_BYTES: Record<string, { mimeType: 'pdf' | 'png' | 'jpeg'; bytes: number[] }> = {
  'application/pdf': { mimeType: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  'image/png': { mimeType: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { mimeType: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
};

export type ValidateUploadResult = { valid: true; mimeType: 'pdf' | 'png' | 'jpeg' } | { valid: false; error: string };

export function validateUploadedFile(buffer: Buffer, claimedMimeType: string, sizeBytes: number): ValidateUploadResult {
  if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return { valid: false, error: 'Le fichier dépasse la taille maximale autorisée (10 Mo).' };
  }

  const expected = MAGIC_BYTES[claimedMimeType];
  if (!expected) {
    return { valid: false, error: 'Type de fichier non autorisé.' };
  }

  const actualPrefix = buffer.subarray(0, expected.bytes.length);
  const matches = expected.bytes.every((byte, i) => actualPrefix[i] === byte);
  if (!matches) {
    return { valid: false, error: "Le contenu du fichier ne correspond pas au type déclaré." };
  }

  return { valid: true, mimeType: expected.mimeType };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix packages/file-storage test -- test/validate-upload.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 7: Write the failing tests for `saveFile`/`getFilePath`/`deleteFile`**

```ts
// packages/file-storage/test/index.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let testRoot: string;

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), 'dossipv-file-storage-test-'));
  process.env.FILE_STORAGE_ROOT = testRoot;
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.FILE_STORAGE_ROOT;
});

describe('saveFile / getFilePath / deleteFile', () => {
  it('saves a file under the configured root and returns a storageKey that is a relative path', async () => {
    const { saveFile } = await import('../src/index');
    const content = Buffer.from('fake pdf content');

    const { storageKey } = await saveFile(content, 'datasheet.pdf', 'application/pdf');

    expect(storageKey.startsWith('/')).toBe(false);
    expect(storageKey.includes('..')).toBe(false);

    const { getFilePath } = await import('../src/index');
    const fullPath = getFilePath(storageKey);
    expect(existsSync(fullPath)).toBe(true);
    expect(readFileSync(fullPath)).toEqual(content);
  });

  it('sanitizes the original file name so no path-traversal characters survive into storageKey', async () => {
    const { saveFile, getFilePath } = await import('../src/index');
    const { storageKey } = await saveFile(Buffer.from('x'), '../../etc/passwd.pdf', 'application/pdf');

    expect(storageKey.includes('..')).toBe(false);
    const fullPath = getFilePath(storageKey);
    expect(fullPath.startsWith(testRoot)).toBe(true);
  });

  it('deleteFile removes the file from disk', async () => {
    const { saveFile, getFilePath, deleteFile } = await import('../src/index');
    const { storageKey } = await saveFile(Buffer.from('to be deleted'), 'temp.pdf', 'application/pdf');
    const fullPath = getFilePath(storageKey);
    expect(existsSync(fullPath)).toBe(true);

    await deleteFile(storageKey);

    expect(existsSync(fullPath)).toBe(false);
  });

  it('deleteFile does not throw for a storageKey that does not exist on disk', async () => {
    const { deleteFile } = await import('../src/index');
    await expect(deleteFile('equipment/does-not-exist.pdf')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `npm --prefix packages/file-storage test -- test/index.test.ts`
Expected: FAIL — `Cannot find module '../src/index'`.

- [ ] **Step 9: Implement `index.ts`**

```ts
// packages/file-storage/src/index.ts
import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { dirname, join, resolve } from 'path';

export * from './validate-upload';

function getRoot(): string {
  const root = process.env.FILE_STORAGE_ROOT;
  if (!root) {
    throw new Error('FILE_STORAGE_ROOT is not set.');
  }
  return root;
}

function sanitizeFileName(originalFileName: string): string {
  const baseName = originalFileName.split(/[/\\]/).pop() ?? 'file';
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function saveFile(buffer: Buffer, originalFileName: string, mimeType: string): Promise<{ storageKey: string }> {
  const sanitizedName = sanitizeFileName(originalFileName);
  const storageKey = `equipment/${randomUUID()}-${sanitizedName}`;
  const fullPath = join(getRoot(), storageKey);

  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  return { storageKey };
}

export function getFilePath(storageKey: string): string {
  return resolve(getRoot(), storageKey);
}

export async function deleteFile(storageKey: string): Promise<void> {
  try {
    await unlink(getFilePath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
```

Note: `mimeType` is accepted as a parameter (matching the interface) but not currently used in
`saveFile`'s own body — it's part of the public interface because a future S3 implementation
of this same function signature WOULD need it (as the `ContentType` for the S3 `PutObject`
call), even though the local-disk implementation has no use for it today. Keep the parameter;
do not remove it just because this implementation doesn't read it.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm --prefix packages/file-storage test -- test/index.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 11: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 12: Commit**

```bash
git add packages/file-storage .gitignore apps/web/.env tsconfig.json package-lock.json
```
(Note: `apps/web/.env` is gitignored — confirm it does NOT actually get staged; if `git add`
reports it as ignored, that's correct and expected, do not force-add it.)
```bash
git commit -m "feat(file-storage): add local-disk file storage package with upload validation"
```

---

## Task 2: `PvModule` CRUD (reference implementation for the pattern)

**Files:**
- Create: `apps/web/app/admin/(protected)/equipment/pv-modules/page.tsx`
- Create: `apps/web/app/admin/(protected)/equipment/pv-modules/new/page.tsx`
- Create: `apps/web/app/admin/(protected)/equipment/pv-modules/[id]/page.tsx`
- Create: `apps/web/app/admin/(protected)/equipment/pv-modules/actions.ts`
- Create: `apps/web/test/admin-equipment-pv-modules.test.ts`

**Interfaces:**
- Consumes: `requireAuthenticatedSuperAdmin` from `../../../layout`, `saveFile`/`deleteFile`/
  `validateUploadedFile` from `@dossipv/file-storage`, `db` from `@dossipv/db`.
- Produces: `createPvModuleAction`, `updatePvModuleAction`, `deletePvModuleAction` — this
  exact shape (not consumed elsewhere) is the pattern repeated by Tasks 3-10 for the other 8
  types, each with their own field list.

- [ ] **Step 1: Add `@dossipv/file-storage` as a dependency of `apps/web`**

In `apps/web/package.json`, add `"@dossipv/file-storage": "*"` to `dependencies`. Run
`npm install`.

- [ ] **Step 2: Write the failing tests**

```ts
// apps/web/test/admin-equipment-pv-modules.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockValidateSuperAdminSession,
  mockPvModuleFindUnique, mockPvModuleCreate, mockPvModuleUpdate, mockPvModuleDelete,
  mockSaveFile, mockDeleteFile, mockValidateUploadedFile,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockPvModuleFindUnique: vi.fn(),
    mockPvModuleCreate: vi.fn(),
    mockPvModuleUpdate: vi.fn(),
    mockPvModuleDelete: vi.fn(),
    mockSaveFile: vi.fn(),
    mockDeleteFile: vi.fn(),
    mockValidateUploadedFile: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: mockValidateSuperAdminSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, pvModule: { findUnique: mockPvModuleFindUnique, create: mockPvModuleCreate, update: mockPvModuleUpdate, delete: mockPvModuleDelete } } };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createPvModuleAction, updatePvModuleAction, deletePvModuleAction } from '../app/admin/(protected)/equipment/pv-modules/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockPvModuleFindUnique.mockClear();
  mockPvModuleCreate.mockClear();
  mockPvModuleUpdate.mockClear();
  mockPvModuleDelete.mockClear();
  mockSaveFile.mockClear();
  mockDeleteFile.mockClear();
  mockValidateUploadedFile.mockReset();
});

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    brand: 'LONGi', model: 'LR7-72HGD-620M', pmaxW: '620', vmpV: '46.5', impA: '13.33',
    vocV: '55.9', iscA: '13.92', tempCoeffVocPct: '-0.25', tempCoeffIscPct: '0.045',
    tempCoeffPmaxPct: '-0.28', irmA: '25', maxSystemVoltageV: '1500', lengthMm: '2278',
    widthMm: '1134', weightKg: '33.5',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createPvModuleAction', () => {
  it('creates a global PvModule row (ownerCompanyId: null) with no files uploaded', async () => {
    mockPvModuleCreate.mockResolvedValue({ id: 'new-module-1' });

    await createPvModuleAction(undefined, buildFormData());

    expect(mockPvModuleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerCompanyId: null, brand: 'LONGi', pmaxW: 620 }),
      }),
    );
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/pv-modules');
  });

  it('uploads and validates a datasheet file when provided', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/abc-datasheet.pdf' });
    mockPvModuleCreate.mockResolvedValue({ id: 'new-module-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await createPvModuleAction(undefined, formData);

    expect(mockValidateUploadedFile).toHaveBeenCalled();
    expect(mockSaveFile).toHaveBeenCalled();
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createPvModuleAction(undefined, formData);

    expect(mockPvModuleCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });

  it('rejects an oversized file before calling saveFile', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Le fichier dépasse la taille maximale autorisée (10 Mo).' });

    const formData = buildFormData();
    const oversized = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' });
    formData.set('datasheet', oversized);

    await createPvModuleAction(undefined, formData);

    expect(mockSaveFile).not.toHaveBeenCalled();
  });
});

describe('updatePvModuleAction', () => {
  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockPvModuleFindUnique.mockResolvedValue({ id: 'module-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockPvModuleUpdate.mockResolvedValue({ id: 'module-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updatePvModuleAction('module-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deletePvModuleAction', () => {
  it('deletes the row when it has no usage', async () => {
    mockPvModuleFindUnique.mockResolvedValue({ id: 'module-1', arrayConfigs: [], datasheetFileId: null, homologationFileId: null });
    mockPvModuleDelete.mockResolvedValue({ id: 'module-1' });

    const result = await deletePvModuleAction('module-1');

    expect(mockPvModuleDelete).toHaveBeenCalledWith({ where: { id: 'module-1' } });
    expect(result).toBeUndefined();
  });

  it('refuses to delete and returns a French error when the module is used by a project', async () => {
    mockPvModuleFindUnique.mockResolvedValue({ id: 'module-1', arrayConfigs: [{ id: 'config-1' }], datasheetFileId: null, homologationFileId: null });

    const result = await deletePvModuleAction('module-1');

    expect(mockPvModuleDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix apps/web test -- test/admin-equipment-pv-modules.test.ts`
Expected: FAIL — `Cannot find module '../app/admin/(protected)/equipment/pv-modules/actions'`.

- [ ] **Step 4: Implement `actions.ts`**

```ts
// apps/web/app/admin/(protected)/equipment/pv-modules/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedSuperAdmin } from '../../../layout';

export interface PvModuleActionState {
  error: string;
}

async function uploadIfPresent(
  formData: FormData,
  fieldName: string,
): Promise<{ storageKey: string; mimeType: string; fileName: string } | null | { error: string }> {
  const field = formData.get(fieldName);
  if (!(field instanceof File) || field.size === 0) {
    return null;
  }

  const buffer = Buffer.from(await field.arrayBuffer());
  const validation = validateUploadedFile(buffer, field.type, field.size);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const { storageKey } = await saveFile(buffer, field.name, field.type);
  return { storageKey, mimeType: validation.mimeType, fileName: field.name };
}

function parseFields(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of [
    'brand', 'model', 'pmaxW', 'vmpV', 'impA', 'vocV', 'iscA', 'tempCoeffVocPct',
    'tempCoeffIscPct', 'tempCoeffPmaxPct', 'tempCoeffVmpPct', 'irmA', 'maxSystemVoltageV',
    'bifacialGainPct', 'lengthMm', 'widthMm', 'weightKg', 'noctC',
  ]) {
    const value = formData.get(key);
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

export async function createPvModuleAction(
  _prevState: PvModuleActionState | undefined,
  formData: FormData,
): Promise<PvModuleActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const datasheetResult = await uploadIfPresent(formData, 'datasheet');
  if (datasheetResult && 'error' in datasheetResult) {
    return { error: datasheetResult.error };
  }
  const homologationResult = await uploadIfPresent(formData, 'homologationDocument');
  if (homologationResult && 'error' in homologationResult) {
    return { error: homologationResult.error };
  }

  const fields = parseFields(formData);
  const bifacial = formData.get('bifacial') === 'on';

  let datasheetFileId: string | undefined;
  if (datasheetResult) {
    const file = await db.file.create({ data: { fileName: datasheetResult.fileName, mimeType: datasheetResult.mimeType, storageKey: datasheetResult.storageKey } });
    datasheetFileId = file.id;
  }
  let homologationFileId: string | undefined;
  if (homologationResult) {
    const file = await db.file.create({ data: { fileName: homologationResult.fileName, mimeType: homologationResult.mimeType, storageKey: homologationResult.storageKey } });
    homologationFileId = file.id;
  }

  await db.pvModule.create({
    data: {
      ownerCompanyId: null,
      brand: fields.brand!,
      model: fields.model!,
      pmaxW: Number(fields.pmaxW),
      vmpV: Number(fields.vmpV),
      impA: Number(fields.impA),
      vocV: Number(fields.vocV),
      iscA: Number(fields.iscA),
      tempCoeffVocPct: Number(fields.tempCoeffVocPct),
      tempCoeffIscPct: Number(fields.tempCoeffIscPct),
      tempCoeffPmaxPct: Number(fields.tempCoeffPmaxPct),
      tempCoeffVmpPct: fields.tempCoeffVmpPct ? Number(fields.tempCoeffVmpPct) : null,
      irmA: Number(fields.irmA),
      maxSystemVoltageV: Number(fields.maxSystemVoltageV),
      bifacial,
      bifacialGainPct: fields.bifacialGainPct ? Number(fields.bifacialGainPct) : null,
      lengthMm: Number(fields.lengthMm),
      widthMm: Number(fields.widthMm),
      weightKg: Number(fields.weightKg),
      noctC: fields.noctC ? Number(fields.noctC) : null,
      ...(datasheetFileId ? { datasheetFileId } : {}),
      ...(homologationFileId ? { homologationFileId } : {}),
    },
  });

  redirect('/admin/equipment/pv-modules');
}

export async function updatePvModuleAction(
  moduleId: string,
  _prevState: PvModuleActionState | undefined,
  formData: FormData,
): Promise<PvModuleActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.pvModule.findUnique({ where: { id: moduleId } });
  if (!existing) {
    return { error: 'Module introuvable.' };
  }

  const datasheetResult = await uploadIfPresent(formData, 'datasheet');
  if (datasheetResult && 'error' in datasheetResult) {
    return { error: datasheetResult.error };
  }

  const fields = parseFields(formData);
  const bifacial = formData.get('bifacial') === 'on';

  let newDatasheetFileId: string | undefined;
  if (datasheetResult) {
    const file = await db.file.create({ data: { fileName: datasheetResult.fileName, mimeType: datasheetResult.mimeType, storageKey: datasheetResult.storageKey } });
    newDatasheetFileId = file.id;
  }

  await db.pvModule.update({
    where: { id: moduleId },
    data: {
      brand: fields.brand!,
      model: fields.model!,
      pmaxW: Number(fields.pmaxW),
      vmpV: Number(fields.vmpV),
      impA: Number(fields.impA),
      vocV: Number(fields.vocV),
      iscA: Number(fields.iscA),
      tempCoeffVocPct: Number(fields.tempCoeffVocPct),
      tempCoeffIscPct: Number(fields.tempCoeffIscPct),
      tempCoeffPmaxPct: Number(fields.tempCoeffPmaxPct),
      tempCoeffVmpPct: fields.tempCoeffVmpPct ? Number(fields.tempCoeffVmpPct) : null,
      irmA: Number(fields.irmA),
      maxSystemVoltageV: Number(fields.maxSystemVoltageV),
      bifacial,
      bifacialGainPct: fields.bifacialGainPct ? Number(fields.bifacialGainPct) : null,
      lengthMm: Number(fields.lengthMm),
      widthMm: Number(fields.widthMm),
      weightKg: Number(fields.weightKg),
      noctC: fields.noctC ? Number(fields.noctC) : null,
      ...(newDatasheetFileId ? { datasheetFileId: newDatasheetFileId } : {}),
    },
  });

  // Old file deleted only AFTER the new save + DB update both succeeded.
  if (newDatasheetFileId && existing.datasheetFileId) {
    const oldFile = await db.file.findUnique({ where: { id: existing.datasheetFileId } });
    if (oldFile) {
      await deleteFile(oldFile.storageKey);
      await db.file.delete({ where: { id: oldFile.id } });
    }
  }

  redirect(`/admin/equipment/pv-modules/${moduleId}`);
}

export async function deletePvModuleAction(moduleId: string): Promise<PvModuleActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.pvModule.findUnique({
    where: { id: moduleId },
    include: { arrayConfigs: { take: 1 } },
  });
  if (!existing) {
    return { error: 'Module introuvable.' };
  }
  if (existing.arrayConfigs.length > 0) {
    return { error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' };
  }

  await db.pvModule.delete({ where: { id: moduleId } });

  if (existing.datasheetFileId) {
    const file = await db.file.findUnique({ where: { id: existing.datasheetFileId } });
    if (file) {
      await deleteFile(file.storageKey);
      await db.file.delete({ where: { id: file.id } });
    }
  }
  if (existing.homologationFileId) {
    const file = await db.file.findUnique({ where: { id: existing.homologationFileId } });
    if (file) {
      await deleteFile(file.storageKey);
      await db.file.delete({ where: { id: file.id } });
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix apps/web test -- test/admin-equipment-pv-modules.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 6: Implement the list page**

```tsx
// apps/web/app/admin/(protected)/equipment/pv-modules/page.tsx
import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { deletePvModuleAction } from './actions';

export default async function PvModuleListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const modules = await db.pvModule.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1>Modules photovoltaïques</h1>
      <Link href="/admin/equipment/pv-modules/new">Ajouter un module</Link>
      <table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Puissance (Wc)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {modules.map((module) => (
            <tr key={module.id}>
              <td>{module.brand}</td>
              <td>{module.model}</td>
              <td>{module.pmaxW}</td>
              <td>
                <Link href={`/admin/equipment/pv-modules/${module.id}`}>Modifier</Link>
                <form action={deletePvModuleAction.bind(null, module.id)}>
                  <button type="submit">Supprimer</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 7: Implement the create form page**

```tsx
// apps/web/app/admin/(protected)/equipment/pv-modules/new/page.tsx
'use client';

import { useActionState } from 'react';
import { createPvModuleAction } from '../actions';

export default function NewPvModulePage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createPvModuleAction, undefined);

  return (
    <main>
      <h1>Ajouter un module photovoltaïque</h1>
      <form action={formAction}>
        <label>Marque <input name="brand" required /></label>
        <label>Modèle <input name="model" required /></label>
        <label>Puissance Pmax (Wc) <input type="number" name="pmaxW" step="0.01" required /></label>
        <label>Tension Vmp (V) <input type="number" name="vmpV" step="0.01" required /></label>
        <label>Courant Imp (A) <input type="number" name="impA" step="0.01" required /></label>
        <label>Tension Voc (V) <input type="number" name="vocV" step="0.01" required /></label>
        <label>Courant Isc (A) <input type="number" name="iscA" step="0.01" required /></label>
        <label>Coeff. temp. Voc (%/°C) <input type="number" name="tempCoeffVocPct" step="0.001" required /></label>
        <label>Coeff. temp. Isc (%/°C) <input type="number" name="tempCoeffIscPct" step="0.001" required /></label>
        <label>Coeff. temp. Pmax (%/°C) <input type="number" name="tempCoeffPmaxPct" step="0.001" required /></label>
        <label>Coeff. temp. Vmp (%/°C, optionnel) <input type="number" name="tempCoeffVmpPct" step="0.001" /></label>
        <label>Courant inverse max Irm (A) <input type="number" name="irmA" step="0.01" required /></label>
        <label>Tension système max (V) <input type="number" name="maxSystemVoltageV" step="0.01" required /></label>
        <label>Bifacial <input type="checkbox" name="bifacial" /></label>
        <label>Gain bifacial (%, optionnel) <input type="number" name="bifacialGainPct" step="0.01" /></label>
        <label>Longueur (mm) <input type="number" name="lengthMm" step="0.1" required /></label>
        <label>Largeur (mm) <input type="number" name="widthMm" step="0.1" required /></label>
        <label>Poids (kg) <input type="number" name="weightKg" step="0.01" required /></label>
        <label>NOCT (°C, optionnel) <input type="number" name="noctC" step="0.1" /></label>
        <label>Fiche technique (PDF) <input type="file" name="datasheet" accept="application/pdf" /></label>
        <label>Attestation d&apos;homologation (PDF) <input type="file" name="homologationDocument" accept="application/pdf" /></label>
        <button type="submit" disabled={pending}>Enregistrer</button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 8: Implement the edit form page**

```tsx
// apps/web/app/admin/(protected)/equipment/pv-modules/[id]/page.tsx
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../../layout';
import { EditPvModuleForm } from './edit-form';

export default async function EditPvModulePage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const pvModule = await db.pvModule.findUnique({ where: { id } });
  if (!pvModule) {
    notFound();
  }

  return <EditPvModuleForm pvModule={pvModule} />;
}
```

```tsx
// apps/web/app/admin/(protected)/equipment/pv-modules/[id]/edit-form.tsx
'use client';

import { useActionState } from 'react';
import type { PvModule } from '@dossipv/db';
import { updatePvModuleAction } from '../actions';

export function EditPvModuleForm({ pvModule }: { pvModule: PvModule }): React.JSX.Element {
  const boundAction = updatePvModuleAction.bind(null, pvModule.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>Modifier le module : {pvModule.brand} {pvModule.model}</h1>
      <form action={formAction}>
        <label>Marque <input name="brand" defaultValue={pvModule.brand} required /></label>
        <label>Modèle <input name="model" defaultValue={pvModule.model} required /></label>
        <label>Puissance Pmax (Wc) <input type="number" name="pmaxW" step="0.01" defaultValue={pvModule.pmaxW} required /></label>
        <label>Tension Vmp (V) <input type="number" name="vmpV" step="0.01" defaultValue={pvModule.vmpV} required /></label>
        <label>Courant Imp (A) <input type="number" name="impA" step="0.01" defaultValue={pvModule.impA} required /></label>
        <label>Tension Voc (V) <input type="number" name="vocV" step="0.01" defaultValue={pvModule.vocV} required /></label>
        <label>Courant Isc (A) <input type="number" name="iscA" step="0.01" defaultValue={pvModule.iscA} required /></label>
        <label>Coeff. temp. Voc (%/°C) <input type="number" name="tempCoeffVocPct" step="0.001" defaultValue={pvModule.tempCoeffVocPct} required /></label>
        <label>Coeff. temp. Isc (%/°C) <input type="number" name="tempCoeffIscPct" step="0.001" defaultValue={pvModule.tempCoeffIscPct} required /></label>
        <label>Coeff. temp. Pmax (%/°C) <input type="number" name="tempCoeffPmaxPct" step="0.001" defaultValue={pvModule.tempCoeffPmaxPct} required /></label>
        <label>Coeff. temp. Vmp (%/°C, optionnel) <input type="number" name="tempCoeffVmpPct" step="0.001" defaultValue={pvModule.tempCoeffVmpPct ?? undefined} /></label>
        <label>Courant inverse max Irm (A) <input type="number" name="irmA" step="0.01" defaultValue={pvModule.irmA} required /></label>
        <label>Tension système max (V) <input type="number" name="maxSystemVoltageV" step="0.01" defaultValue={pvModule.maxSystemVoltageV} required /></label>
        <label>Bifacial <input type="checkbox" name="bifacial" defaultChecked={pvModule.bifacial} /></label>
        <label>Gain bifacial (%, optionnel) <input type="number" name="bifacialGainPct" step="0.01" defaultValue={pvModule.bifacialGainPct ?? undefined} /></label>
        <label>Longueur (mm) <input type="number" name="lengthMm" step="0.1" defaultValue={pvModule.lengthMm} required /></label>
        <label>Largeur (mm) <input type="number" name="widthMm" step="0.1" defaultValue={pvModule.widthMm} required /></label>
        <label>Poids (kg) <input type="number" name="weightKg" step="0.01" defaultValue={pvModule.weightKg} required /></label>
        <label>NOCT (°C, optionnel) <input type="number" name="noctC" step="0.1" defaultValue={pvModule.noctC ?? undefined} /></label>
        <label>Remplacer la fiche technique (PDF) <input type="file" name="datasheet" accept="application/pdf" /></label>
        <button type="submit" disabled={pending}>Enregistrer</button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS. If `exactOptionalPropertyTypes`/`no-unsafe-*` findings appear (both have
recurred in nearly every prior sub-project's own Task reviews this session), fix them using
the same established patterns: `?? null` for Prisma nullable fields, conditional spreads for
optional object keys, explicit casts only where genuinely needed (never a bare `object`/`any`
escape hatch).

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json "apps/web/app/admin/(protected)/equipment/pv-modules" apps/web/test/admin-equipment-pv-modules.test.ts
git commit -m "feat(admin): add PvModule equipment CRUD (list/create/edit/delete)"
```

---

## Task 3: `Inverter` CRUD

**Files:** same 4-file shape as Task 2, under `apps/web/app/admin/(protected)/equipment/inverters/`.

**Interfaces:**
- Fields: `brand`, `model`, `phases` (1|3), `pacW`, `sacVA`, `vdcMaxV`, `mpptMinV`,
  `mpptMaxV`, `startUpV`, `mpptCount`, `inputsPerMppt`, `idcMaxPerMpptA`, `iscMaxPerMpptA`,
  `vacNomV`, `vacRangeV` (optional string), `iacMaxA`, `integratedDcSwitch` (boolean),
  `stegApproved` (boolean).
- Usage relation for delete guard: `arrayInverters` (single relation).

Follow Task 2's exact steps (write failing tests first, including the same "in use" and file-
upload test shapes with `Inverter`'s own field list and `arrayInverters` as the usage check),
implement `actions.ts`/`page.tsx`/`new/page.tsx`/`[id]/page.tsx`/`[id]/edit-form.tsx`, run
tests, typecheck, lint, commit with message "feat(admin): add Inverter equipment CRUD
(list/create/edit/delete)".

---

## Task 4: `Spd` CRUD

**Files:** same 4-file shape under `apps/web/app/admin/(protected)/equipment/spds/`.

**Interfaces:**
- Fields: `brand`, `model`, `side` (`DC`|`AC` enum), `type` (Int), `poles` (Int), `ucV`,
  `upKV`, `inKA`, `imaxKA`, `iscpvKA` (optional).
- **Usage relation for delete guard: TWO relations, both must be checked —
  `protectionsDc` AND `protectionsAc`.** Per this plan's own Review Focus, write a test
  proving a delete is blocked when ONLY `protectionsAc` has a row (not `protectionsDc`), and a
  separate test for the reverse, not just one combined case.

Follow Task 2's exact steps with `Spd`'s own field list and the two-relation usage check.
Commit message: "feat(admin): add Spd equipment CRUD (list/create/edit/delete)".

---

## Task 5: `DcSwitch` CRUD

**Files:** same 4-file shape under `apps/web/app/admin/(protected)/equipment/dc-switches/`.

**Interfaces:**
- Fields: `brand`, `model`, `ratedVoltageV`, `ratedCurrentA`, `poles` (Int).
- Usage relation: `protections` (single relation).

Follow Task 2's exact steps. Commit message: "feat(admin): add DcSwitch equipment CRUD
(list/create/edit/delete)".

---

## Task 6: `DcFuse` CRUD

**Files:** same 4-file shape under `apps/web/app/admin/(protected)/equipment/dc-fuses/`.

**Interfaces:**
- Fields: `brand`, `model`, `ratedVoltageV`, `ratedCurrentA`.
- Usage relation: `protections` (single relation).

Follow Task 2's exact steps. Commit message: "feat(admin): add DcFuse equipment CRUD
(list/create/edit/delete)".

---

## Task 7: `AcBreaker` CRUD

**Files:** same 4-file shape under `apps/web/app/admin/(protected)/equipment/ac-breakers/`.

**Interfaces:**
- Fields: `brand`, `model`, `ratedCurrentA`, `curve` (optional string), `breakingCapacityKA`
  (optional).
- Usage relation: `protections` (single relation).

Follow Task 2's exact steps. Commit message: "feat(admin): add AcBreaker equipment CRUD
(list/create/edit/delete)".

---

## Task 8: `AcIsolator` CRUD

**Files:** same 4-file shape under `apps/web/app/admin/(protected)/equipment/ac-isolators/`.

**Interfaces:**
- Fields: `brand`, `model`, `ratedCurrentA`.
- Usage relation: `protections` (single relation).

Follow Task 2's exact steps. Commit message: "feat(admin): add AcIsolator equipment CRUD
(list/create/edit/delete)".

---

## Task 9: `Cable` CRUD (with nested `CableSection` rows)

**Files:** same 4-file shape under `apps/web/app/admin/(protected)/equipment/cables/`, plus
the create/edit forms include a repeatable sub-form for `CableSection` rows (`sectionMm2`,
`izA`, `izReferenceMethod`) — at least one section is required per cable.

**Interfaces:**
- Fields: `brand`, `model`, `usage` (`DC_SOLAR`|`AC`|`EARTH` enum), `conductor`, `insulation`,
  `standard` (optional), plus a `sections` array of `{ sectionMm2, izA, izReferenceMethod }`.
- **Usage relation for delete guard: TWO relations — `cableRuns` AND `earthingCableFor`.**
  Write separate tests for each, per this plan's own Review Focus.
- The create/update actions create/replace the full set of `CableSection` child rows in the
  same transaction as the parent `Cable` row (delete all existing sections then recreate on
  update, simplest correct approach for a small child list like this).

Follow Task 2's exact steps, adapted for the nested sections sub-form and the two-relation
usage check. Commit message: "feat(admin): add Cable equipment CRUD with nested sections
(list/create/edit/delete)".

---

## Task 10: `Accessory` CRUD

**Files:** same 4-file shape under `apps/web/app/admin/(protected)/equipment/accessories/`.

**Interfaces:**
- Fields: `brand`, `model`, `kind` (`AccessoryKind` enum — confirmed directly from
  `packages/db/prisma/schema.prisma`, real members: `MC4_CONNECTOR`, `DISTRIBUTION_BLOCK`,
  `CABLE_TRAY`, `DC_ENCLOSURE`, `AC_ENCLOSURE`, `EARTH_ROD`, `OTHER` — use these exact values
  as the form's `<select>` options, do not invent different ones), `spec` (optional string).
- **Usage relation for delete guard: THREE relations — `connectorFor`, `cableTrayFor`, AND
  `distributionBlockFor`.** Write a separate test for each relation individually, per this
  plan's own Review Focus — a test exercising only one of the three could pass even if the
  code only checks that one.

Follow Task 2's exact steps with all three usage relations checked. Commit message:
"feat(admin): add Accessory equipment CRUD (list/create/edit/delete)".

---

## Task 11: Live verification and whole-package review

**Files:** none — verification and review only, code changes only if a real gap is found.

**Interfaces:** none new.

- [ ] **Step 1: Confirm the SSH tunnel to Postgres is active**

Run: `node -e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);}); s.setTimeout(3000,()=>{console.error('TUNNEL DOWN: timeout');process.exit(1);});"`
Expected: `tunnel alive`. Re-check even if it passed earlier in this plan's own execution —
it has dropped mid-session multiple times already in this project.

- [ ] **Step 2: Start the dev server, checking for and stopping any stale process first**

Run `npm run dev --workspace=@dossipv/web`; if it reports the port in use by an unknown PID (a
recurring pattern across every prior sub-project this session), stop that PID first, then
retry.

- [ ] **Step 3: Exercise the full create → list → edit (with a real file upload) → delete loop
  in a real browser for at least 2 of the 9 types (one simple type, `Cable` for its nested
  sections)**

Using Playwright (proven to work in this session during the map editor sub-project): log in as
the seeded super-admin, navigate to `/admin/equipment/pv-modules/new`, fill the form, attach a
real small local PDF file (create one ad hoc if none exists — a minimal valid PDF is just a
few bytes starting with `%PDF-`), submit, confirm the new row appears in the list, open its
edit page, confirm the existing data pre-fills correctly, upload a replacement file, save,
confirm the list still shows one row (not two), then delete it and confirm it's gone from the
list AND its file is gone from `FILE_STORAGE_ROOT`'s real directory on disk. Repeat the same
loop for `Cable`, specifically adding 2+ sections and confirming both appear on the edit page
reload.

- [ ] **Step 4: Verify the delete-blocked-by-usage path against the real database for at least
  one type**

Create a real `PvModule` row, then a real `ProjectArrayConfig` referencing it (reusing the
verification company/project pattern from prior sub-projects' own Task 5/6), then attempt to
delete that module through the real running app — confirm it returns the French "in use"
error and the row still exists, both in the UI and via a direct database check.

- [ ] **Step 5: Stop the dev server**

- [ ] **Step 6: Run the full workspace suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS.

- [ ] **Step 7: Confirm no stray verification files, uploaded test files, or secrets were
  committed**

Run: `git status --porcelain` — expect empty. Run `ls $FILE_STORAGE_ROOT` (or the Windows
equivalent) and confirm no verification-only files remain on disk outside what Step 3/4's own
cleanup already removed.

- [ ] **Step 8: Update project memory**

Update `C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
recording: the new `@dossipv/file-storage` package, all 9 equipment types' CRUD being done,
what was live-verified (2 of 9 types' full loops, plus the usage-guard path) versus only
unit-tested (the remaining 7 types, which share the identical, now-twice-proven pattern) —
matching this file's established style of being explicit about what was actually exercised.

- [ ] **Step 9: Final commit if Steps 3, 4, or 7 found anything to fix**

```bash
git add -A
git commit -m "fix(admin): close a gap found in the equipment catalog CRUD's final review"
```

(Skip entirely if nothing was found.)
