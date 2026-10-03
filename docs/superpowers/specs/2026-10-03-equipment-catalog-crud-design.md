# DossiPV — Equipment Catalog CRUD (Sub-project #3 Slice 2) Design Spec

## 1. Purpose and scope

Sub-project #3 slice 2 of the "full application" build: the super-admin equipment catalog
CRUD, per the master spec (`docs/superpowers/specs/2026-10-02-dossipv-design.md` §2) — "add/
edit panels, inverters, SPDs, breakers, cables, etc." Nine equipment types exist in the
schema: `PvModule`, `Inverter`, `Spd`, `DcSwitch`, `DcFuse`, `AcBreaker`, `AcIsolator`, `Cable`
(with its own `CableSection[]` child rows), `Accessory`.

Also covers file storage — datasheet/homologation-document uploads are real columns on every
equipment type (`datasheetFileId`, `homologationFileId`, both nullable FKs to `File`), but no
upload mechanism exists anywhere in this app yet (`File.storageKey`'s own schema comment says
"decided at implementation time"). Building real catalog CRUD without a working upload path
would leave those fields permanently empty, so this slice designs and builds the storage layer
too, per the master spec's own "local disk... swappable for S3 later" requirement.

**Explicitly out of scope for this slice** (still part of sub-project #3 overall, per its own
earlier slice-1 spec's own scope note): settings (map provider/Claude model/plan definitions),
editing company details/login email/password from the admin side, viewing a company's actual
dossier list/files.

**Note on how this spec was produced**: written autonomously (user asleep, standing
instruction to keep building using the recommended option at each decision point), with two
exceptions — the user explicitly chose NOT the recommended option twice during this spec's own
brainstorming: (1) 9 separate hand-written pages rather than one generic metadata-driven CRUD
page, and (2) building real file storage/upload now rather than deferring it. Both choices are
followed here as given, not second-guessed.

## 2. Decisions

- **9 separate hand-written pages**, one per equipment type, each with its own list page,
  create form, and edit form — not a shared generic CRUD component. Every page follows the
  identical structural pattern (list → create → edit, same Server Action shape, same guard
  reuse) since the underlying data genuinely is this uniform, but each page's own JSX and
  field list is written out explicitly per type rather than driven by a shared schema/registry
  object, per the user's own explicit choice.
- **New `@dossipv/file-storage` package**: `saveFile(buffer, originalFileName, mimeType):
  Promise<{ storageKey: string }>`, `getFilePath(storageKey): string`, `deleteFile(storageKey):
  Promise<void>`. Root directory from `FILE_STORAGE_ROOT` env var (new, added to every
  package's `.env` that needs it — `apps/web`'s, following this session's own established
  per-package `.env` convention). `storageKey` is a relative path under that root
  (`equipment/{uuid}-{sanitizedOriginalFileName}`), never an absolute path — this is exactly
  what makes the "swappable for S3 later" requirement real: a future S3 implementation of the
  same 3-function interface would treat `storageKey` as an S3 object key instead of a disk
  path, with zero schema change and zero caller-code change.
- **Uploads go through a Server Action accepting `FormData` with a `File` field** (the
  browser's native multipart file upload, not a base64 JSON blob) — Next.js Server Actions
  support this directly; the action reads the file's bytes via `await file.arrayBuffer()`,
  calls `saveFile`, then creates the `File` DB row with the returned `storageKey`.
- **MIME-type and size validation at the upload boundary**: only `application/pdf`,
  `image/png`, `image/jpeg` accepted (matching `File.mimeType`'s own schema comment — `"pdf" |
  "png" | "jpeg"`), max 10 MB — a reasonable bound for a datasheet/certificate PDF, preventing
  an unbounded upload from being accepted silently. Both checks happen server-side in the
  Server Action itself, never trusting a client-supplied MIME type alone (browsers can lie
  about `file.type`) — the action also peeks at the real file signature's first bytes (PDF:
  `%PDF`, PNG: `\x89PNG`, JPEG: `\xFF\xD8\xFF`) before accepting it, closing the gap a renamed-
  extension attack would otherwise open.
- **Deleting an equipment row that still has a datasheet/homologation file also deletes the
  underlying stored file** — orphaned files on disk with no DB reference serve no purpose and
  would accumulate forever otherwise. If a `File` row is still referenced by something else
  (shouldn't happen for per-equipment datasheets, which are 1:1, but checked defensively via
  a query before deleting) the delete is skipped and logged, never silently destroying a file
  another record still needs.
- **Equipment list/create/edit pages live under `/admin/equipment/<type-slug>`** (e.g.
  `/admin/equipment/pv-modules`, `/admin/equipment/inverters`), reusing the existing
  `(protected)` route group and its `requireAuthenticatedSuperAdmin()` guard exactly as every
  other admin page already does (both independently, per-page, matching the defense-in-depth
  pattern already established and required by this session's own prior security-review
  findings — not relying solely on the layout).
- **Every created/edited row here is global catalog** (`ownerCompanyId: null`) — the super-
  admin panel's own purpose, per the master spec's own framing, is maintaining the *shared*
  catalog; a company's own *private* equipment (non-null `ownerCompanyId`) is created from the
  installer-facing app during project creation (a different, not-yet-built flow), not from
  here. This slice's forms never expose an `ownerCompanyId` field at all — every row created
  through `/admin/equipment/*` is unconditionally global.
- **Delete is a hard delete, blocked by the schema's own existing `onDelete: Restrict`** on
  `ownerCompanyId` — but that FK is on the *equipment* row pointing at `Company`, not the
  reverse; the real constraint to respect here is each equipment type's OWN relation to
  `Project`-side usage (e.g. `PvModule.arrayConfigs`, `Inverter.arrayInverters`). Attempting to
  delete an equipment row still referenced by an existing project must fail with a clear French
  error ("Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé."),
  not a raw Prisma foreign-key-violation stack trace — this is a real, common case (any catalog
  item used by any existing project, anywhere) and must be handled explicitly, not left to
  surface as an unhandled 500.
- **List pages show only the global catalog, never any company's private equipment** — the
  super-admin's own scope, per the master spec's own framing, is managing the shared catalog;
  it has no reason to see any one company's private items. Every list query filters
  `where: { ownerCompanyId: null }`.

## 3. Package structure

```
packages/file-storage/
  src/
    index.ts                — saveFile(), getFilePath(), deleteFile()
    validate-upload.ts       — validateUploadedFile(): MIME + size + magic-byte check

apps/web/app/admin/(protected)/equipment/
  pv-modules/
    page.tsx                  — list
    new/page.tsx                — create form
    [id]/page.tsx                — edit form
    actions.ts                    — createPvModuleAction, updatePvModuleAction, deletePvModuleAction
  inverters/            (same 4-file shape)
  spds/                 (same 4-file shape)
  dc-switches/          (same 4-file shape)
  dc-fuses/             (same 4-file shape)
  ac-breakers/          (same 4-file shape)
  ac-isolators/         (same 4-file shape)
  cables/               (same 4-file shape, plus nested CableSection rows in the form)
  accessories/          (same 4-file shape)
```

## 4. Shared form/action shape (illustrated once, repeated per type)

Using `PvModule` as the representative example — every other type's own task in the
implementation plan follows this identical shape with its own field list:

1. **List** (`pv-modules/page.tsx`): Server Component, `requireAuthenticatedSuperAdmin()`,
   `db.pvModule.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } })`,
   rendered as a table (brand, model, key spec column, a link to edit, a delete form button).
2. **Create** (`pv-modules/new/page.tsx` + `actions.ts`'s `createPvModuleAction`): a form with
   every non-file field as a plain input, a `<input type="file">` for datasheet and one for
   homologation document (both optional). The action validates each uploaded file (if present)
   via `validateUploadedFile`, calls `saveFile`, creates the `File` row(s), then creates the
   `PvModule` row with `ownerCompanyId: null` and the resulting file IDs.
3. **Edit** (`pv-modules/[id]/page.tsx` + `updatePvModuleAction`): loads the existing row,
   pre-fills the form; a new file upload in either slot replaces the existing one (old `File`
   row + stored file deleted after the new one is successfully saved, never before — avoiding
   a window where a failed upload has already destroyed the previous file).
4. **Delete** (`deletePvModuleAction`): checks `db.pvModule.findUnique({ where: { id },
   include: { arrayConfigs: { take: 1 } } })` — if any usage exists, returns the French "in
   use" error instead of attempting the delete; otherwise deletes the row, then its datasheet/
   homologation `File` rows and their underlying stored files. **Each type's own usage
   relation(s) differ and some types have MORE THAN ONE** — confirmed directly from the schema,
   not assumed uniform: `PvModule.arrayConfigs`, `Inverter.arrayInverters`,
   `DcSwitch`/`DcFuse`/`AcBreaker`/`AcIsolator`'s single `protections`, `Spd`'s TWO relations
   (`protectionsDc` and `protectionsAc` — a given SPD row could be used as either the DC or AC
   surge protector on different projects, so both must be checked), `Cable`'s TWO relations
   (`cableRuns` and `earthingCableFor`), and `Accessory`'s THREE relations (`connectorFor`,
   `cableTrayFor`, `distributionBlockFor`). The implementation plan's own per-type task must
   check every one of that type's real usage relations, not just the first one found.

Every other type's plain-field list is simply that type's own schema fields minus `id`,
`ownerCompanyId`, the two file FKs, and `createdAt` — the implementation plan enumerates each
type's exact field list explicitly (per the user's own "9 separate hand-written pages" choice,
no shared schema-registry object exists to look it up from).

## 5. Testing

- `@dossipv/file-storage`: `saveFile`/`getFilePath`/`deleteFile` tested against a real
  temporary directory (via `FILE_STORAGE_ROOT` pointed at a test-specific tmp path, cleaned up
  in `afterEach`) — real filesystem I/O, not mocked, since this package's entire job is
  correctly reading/writing real files. `validateUploadedFile` tested with real byte buffers
  for each accepted type's real magic bytes, a renamed-extension attack (e.g. a `.pdf`-named
  file whose real bytes are a PNG), and an oversized buffer.
- Each equipment type's Server Actions: the same mocked-`@dossipv/db` unit-test pattern this
  session has used throughout, PLUS one test per type proving the "equipment in use" delete
  guard works (mock the usage-relation query to return a non-empty result, assert the delete
  action returns the French error and never calls `db.<type>.delete`).
- Live verification (this plan's own final task, matching every prior sub-project's pattern):
  create a real equipment row with a real small PDF upload through the real dev server UI (via
  Playwright, proven to work in this session already during the map editor sub-project),
  confirm the file lands on this machine's real filesystem at the expected path, confirm the
  edit form re-displays it, confirm delete removes both the DB row and the file from disk.

## 6. Open items for the implementation plan to resolve

- The exact French copy for every form label/button/error message across all 9 types — this
  spec's own §4 gives the pattern; the plan writes concrete strings per type.
- Whether `FILE_STORAGE_ROOT`'s default (for local dev, if the env var is unset) should be a
  path under the repo's own gitignored scratch area or require the var to always be set
  explicitly — the plan should pick one and document why, rather than leaving an implicit
  default nobody decided on purpose.
