# Data Model & Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@dossipv/db`, a new workspace package holding the full Prisma schema,
generated client, and a working migration + seed against the already-provisioned PostgreSQL
18 database, covering accounts/billing, the equipment catalog, the project aggregate, and
jobs/validation tables.

**Architecture:** A single `schema.prisma` file (Prisma doesn't meaningfully support
multi-file schemas in the pinned version without extra config, and splitting it wouldn't
help readability given how interlinked the models are) built up in logical sections across
several tasks, each ending in a `prisma validate` checkpoint rather than a traditional
unit test — there's no business logic yet, so correctness here means "the schema is valid
and a migration can run against the real database," which is itself the verification step.
A seed script populated with the existing `habib-khedhira` engine fixture's equipment specs
is the final correctness proof: if every required field across every table can be
satisfied by real data and insert successfully, the schema is usable.

**Tech Stack:** Prisma 7.10 (stable; `8.0.0-rc.19` exists but is a release candidate, not
used), `@prisma/client`, PostgreSQL 18 (already running in Docker on the user's Linux
server, reachable from local dev via an SSH tunnel to `localhost:5433`).

**Spec:** `docs/superpowers/specs/2026-10-03-data-model-design.md`

## Global Constraints

- New package `@dossipv/db` keeps the existing monorepo package shape (private, `type:
  module`, workspace dependency `"*"` versions, `main: ./src/index.ts`) — `src/index.ts`
  itself still needs `prisma generate` to have run first (it imports the generated
  `@prisma/client` types), but the package's own entry point stays raw source like
  `engine`/`document-text`/`dossier-worker`, unlike a typical Prisma project's generated-output
  `main` field.
- `DATABASE_URL` must come from a gitignored `.env` file — never hardcoded in the schema, in
  `prisma.config.ts`, or in any other committed file. Two copies exist by design (repo root
  and `packages/db/`, see Task 1 Step 8) because Prisma 7's `prisma.config.ts` and the
  `dotenv/config` pattern both resolve `.env` relative to the current working directory, and
  this plan's commands run from two different cwds (`packages/db` for the `prisma` CLI, the
  repo root for `npm run` scripts and seed/verification one-liners) — both copies must stay in
  sync if the password ever rotates.
- **Prisma 7's config architecture is a real breaking change from Prisma 5/6**, verified
  empirically (not from documentation alone) before this plan was finalized: no
  `datasource.url` in `schema.prisma` (moves to `prisma.config.ts`), `PrismaClient` requires
  an explicit driver adapter at construction (`@prisma/adapter-pg`'s `PrismaPg` for
  PostgreSQL), and `prisma db execute` cannot be used to read back query results (only to run
  side-effecting SQL) — see the design spec §3 for the full note. Every task's commands in
  this plan already reflect this; if any step's output looks like it's hitting a
  config-related error this plan didn't anticipate, treat it as a live finding to rule on
  (per executing-plans' process), not a transcription mistake to silently route around.
- Every model, field, and relation in the implementation must match the spec's Prisma schema
  exactly (names, types, nullability) unless a task's own step finds and rules on a real
  Prisma validation error — the spec was self-reviewed for internal consistency (every type
  reference resolves, every named relation pairs correctly) but was not run through the real
  Prisma CLI before this plan, so `prisma validate`/`prisma migrate dev` are the first real
  checks this plan performs.
- No business logic (auth wiring, session-limit enforcement, quota checks) in this plan —
  purely schema + migration + seed. Those are later sub-projects per the spec's own scope
  note.
- `packages/db` must be added to the root `tsconfig.json`'s `references` array and get its
  own `tsconfig.json`, matching the pattern fixed during the dossier-worker plan (no
  `references` array pointing at sibling packages in the package's own tsconfig, since `tsc
  -b` requires `composite: true` on any referenced project and none of the existing packages
  set it — see that plan's Task 1 ruling for the exact error this avoids).

## Review Focus

- **Required-but-unseeded fields across every table**: a schema can look complete yet have a
  required field that's awkward or impossible to supply from real project data (e.g. a
  non-nullable `DateTime` on a record where the source JSON Schema marks the equivalent field
  optional). The seed script (Task 8) is what actually proves this, not a visual read of the
  schema — any field that fails to seed cleanly from the habib-khedhira fixture's real data is
  a true finding, not a hypothetical one.
- **Nullable vs. required mismatches against the JSON Schema's conditional-requirement rules**
  (e.g. `ProjectImagery` is only required when `tier=PREMIUM`, `ProjectOffGrid` only when
  `gridType=ISOLATED`, `ProjectSimulation.pvsystReportFileId` only when `source=PVSYST_UPLOAD`)
  — the Prisma schema makes these child records fully optional (nullable 1:1), which is
  correct for the *table*, but nothing in this plan's scope enforces the *conditional*
  requirement itself (that's app-level validation, explicitly out of scope) — Task 8's seed
  script should create at least one project exercising each conditional branch (one PREMIUM
  with imagery, one ISOLATED with off-grid, one with PVSYST_UPLOAD) to prove the nullable
  design doesn't silently make an always-required field insertable as empty.
- **The anti-sharing session model's query shape**: `Session` is keyed to `CompanyUserId`, but
  the concurrent-session cap described in the spec is enforced *per company*, meaning any
  future query needs to join `Session → CompanyUser → Company` and count across every user in
  that company, not just one user's own sessions. No code in this plan enforces that cap (it's
  app-logic, out of scope) — but the seed script should create two `CompanyUser` rows under
  the same `Company` each with an active `Session`, proving that join path actually resolves
  cleanly before any later plan builds the enforcement logic on top of it.
- **The `File` model's one-sided relations**: 26 of this schema's 34 named relations point at
  `File` with no back-relation field declared on `File` itself (confirmed deliberate during
  the spec's self-review — valid Prisma, used for a shared attachment table you never need to
  query in reverse). The risk is a typo turning one of these into an *ambiguous* unnamed
  relation during transcription from spec to file — `prisma validate` catches structurally
  invalid relations, but it will NOT catch a relation that's valid Prisma but silently wrong
  (e.g. two fields accidentally sharing one relation name that should be distinct). Task 3's
  validation step should specifically grep the committed schema for duplicate `@relation("X"`
  names where `X` was meant to be unique per field, cross-checked against the spec's own
  34-relation inventory (listed in the spec's self-review script output, reproducible via the
  same Node one-liner used there).
- **Decimal precision on money fields**: `Plan.priceTnd`, `Payment.amountTnd`, and
  `ClaudeUsageLog.costUsd` use Prisma's `Decimal` type with explicit `@db.Decimal(10, 2)` /
  `(10, 4)` precision. A seed value with more decimal places than the column allows (e.g.
  seeding `costUsd` with a raw floating-point multiplication result that has more than 4
  decimal digits) will either silently round or throw depending on Prisma's configured
  rounding mode — Task 8's seed script should seed at least one `ClaudeUsageLog` row with a
  value that has 5+ decimal digits before rounding, and assert the stored value actually
  rounded rather than truncated oddly or errored.

---

## Task 1: Scaffold `@dossipv/db` package

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma.config.ts`
- Create: `packages/db/prisma/schema.prisma`
- Modify: `tsconfig.json` (root, add project reference)

**Interfaces:**
- Consumes: nothing yet (scaffolding only).
- Produces: an installable, empty Prisma project ready for schema authoring in Task 2.

- [ ] **Step 1: Create `packages/db/package.json`**

```json
{
  "name": "@dossipv/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "studio": "prisma studio",
    "seed": "node --experimental-strip-types prisma/seed.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/client": "^7.10.0",
    "@prisma/adapter-pg": "^7.10.0",
    "dotenv": "^17.0.0"
  },
  "devDependencies": {
    "prisma": "^7.10.0",
    "@types/node": "^26.6.4"
  }
}
```

Save as `packages/db/package.json`. `@prisma/adapter-pg` and `dotenv` are real runtime
dependencies, not devDependencies — Prisma 7's `PrismaClient` requires an explicit driver
adapter at construction (confirmed by a real `new PrismaClient()` call throwing
`PrismaClientInitializationError: ... A driver adapter is required`, not merely documented),
and `prisma.config.ts` (Step 4) needs `dotenv` to load `.env` outside of Next.js/other
frameworks that do it automatically.

- [ ] **Step 2: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "prisma/**/*.ts", "prisma.config.ts"]
}
```

Save as `packages/db/tsconfig.json`. No `references` array — matches the Global Constraints
note (and the dossier-worker plan's Task 1 ruling): `tsc -b` requires `composite: true` on
any referenced project, which no package in this repo sets, so this package's own tsconfig
stays reference-free and relies on the root `tsconfig.json`'s flat list instead.

- [ ] **Step 3: Create `packages/db/prisma.config.ts`**

Prisma 7 moved the datasource connection URL out of `schema.prisma` entirely — a real
breaking change from Prisma 5/6, confirmed by running an actual `prisma migrate dev` against
the tunneled database during this plan's own writing: `url = env("DATABASE_URL")` inside
`schema.prisma`'s `datasource` block is rejected with error `P1012`
("The datasource property `url` is no longer supported in schema files"). The URL now lives
in a `prisma.config.ts` file instead.

```ts
// packages/db/prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

Save as `packages/db/prisma.config.ts`. `dotenv/config` loads a `.env` file from the current
working directory — this plan's invocation convention (below) always runs `prisma` commands
from **inside `packages/db`** (not the repo root), so this step also requires a `.env` to
exist at `packages/db/.env`, not just the repo root's. Since the repo root's `.env` is
gitignored and already has the real `DATABASE_URL`, the simplest fix is a one-line copy — add
this to Step 3 as well: `cp ../../.env .env` run from inside `packages/db` (or the Windows
equivalent `copy ..\..\.env .env`), creating a second, also-gitignored copy. (`packages/db/.env`
matches the root `.gitignore`'s existing bare `.env` pattern — confirm with
`git check-ignore -q packages/db/.env` before committing anything else in this task; it must
report success, i.e. ignored, or the real `DATABASE_URL` would otherwise be committed.)

Record the resulting invocation convention for every later step in this plan: always run
`npx prisma <command>` from **inside `packages/db`** (not the repo root), since
`prisma.config.ts`'s relative `schema: 'prisma/schema.prisma'` path and `dotenv/config`'s
cwd-relative `.env` lookup both resolve relative to the CLI's current working directory.

- [ ] **Step 4: Create the `prisma` directory with a placeholder schema**

```prisma
// packages/db/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}
```

Save as `packages/db/prisma/schema.prisma` — no `url` field (see Step 3's explanation). This
is intentionally minimal — Task 2 onward fill in every model.

- [ ] **Step 5: Create an empty `src/index.ts`**

```ts
// Re-exports the generated Prisma client as this package's public API.
// Populated once `prisma generate` has produced the client (Task 7).
```

Save as `packages/db/src/index.ts`.

- [ ] **Step 6: Add the project reference to the root `tsconfig.json`**

Read the current root `tsconfig.json` first. Add `{ "path": "packages/db" }` to its
`references` array, alongside the existing `engine`/`document-text`/`dossier-worker`/`apps/web`
entries.

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: no errors; `node_modules/@dossipv/db` symlinked into place via npm workspaces;
`node_modules/prisma`, `node_modules/@prisma/client`, `node_modules/@prisma/adapter-pg`, and
`node_modules/dotenv` present.

- [ ] **Step 8: Copy the root `.env` into `packages/db/` and confirm it's gitignored**

Run: `cp .env packages/db/.env` (or `copy .env packages\db\.env` on native Windows cmd/PowerShell)
Then run: `git check-ignore -q packages/db/.env && echo IGNORED || echo NOT_IGNORED`
Expected: `IGNORED`. If `NOT_IGNORED`, stop and add a `packages/db/.env` (or broader `**/.env`)
line to the root `.gitignore` before proceeding — never commit this file, it contains the
real database password.

- [ ] **Step 9: Validate the placeholder schema**

Run (from inside `packages/db`, per Step 3's invocation convention): `cd packages/db && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` (or equivalent success message —
exact wording may differ by Prisma version; a non-zero exit code is the real failure signal
to watch for, not the exact string). This is the first command in the plan that reads
`prisma.config.ts`, so a failure here likely means that file has a syntax error or the `.env`
copy from Step 8 is missing — re-check both before assuming the schema itself is wrong.

- [ ] **Step 10: Commit**

```bash
git add packages/db/package.json packages/db/tsconfig.json packages/db/prisma.config.ts packages/db/prisma/schema.prisma packages/db/src/index.ts tsconfig.json package-lock.json
git commit -m "chore(db): scaffold @dossipv/db package with a minimal valid Prisma schema"
```

Note `packages/db/.env` is correctly excluded from this commit (gitignored, confirmed in
Step 8) — only the files above are staged.

---

## Task 2: Accounts, sessions, and billing models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing from other tasks yet.
- Produces: `Company`, `CompanyUser`, `Session`, `SuperAdmin`, `Plan`, `Subscription`,
  `Payment` models and the `CompanyUserRole`, `SubscriptionStatus`, `PaymentMethod` enums —
  consumed by Task 3's `Project.companyId` FK and Task 6's equipment catalog's
  `ownerCompanyId` FK.

This task also needs the `File` model (for `Company.logo`/`Company.anmeCertificate`) and the
`ProjectTier` enum (for `Plan.tier`) even though those two names are "owned" conceptually by
later tasks — add them now as forward declarations (Task 3 adds `Project`'s own use of
`ProjectTier`, Task 7 adds the rest of `File`'s referencing fields). Prisma doesn't care about
declaration order within one file, but to keep this plan's diffs reviewable per task, add
`model File` and `enum ProjectTier` once, here, in Task 2, and every later task that needs
them just adds fields pointing at the already-declared names.

- [ ] **Step 1: Write the File model and ProjectTier enum**

Append to `packages/db/prisma/schema.prisma`:

```prisma
model File {
  id         String   @id @default(uuid())
  fileName   String
  mimeType   String // "pdf" | "png" | "jpeg"
  storageKey String // path/key into whatever object storage is used — decided at implementation time
  createdAt  DateTime @default(now())

  @@map("file")
}

enum ProjectTier {
  STANDARD
  PREMIUM
}
```

- [ ] **Step 2: Write the Company, CompanyUser, Session, SuperAdmin models**

Append:

```prisma
model Company {
  id                       String    @id @default(uuid())
  name                     String
  shortName                String?
  slogan                   String?
  logoFileId               String?
  logo                     File?     @relation("CompanyLogo", fields: [logoFileId], references: [id])
  address                  String
  phone                    String
  email                    String
  taxId                    String?
  commercialRegister       String?
  legalRepFullName         String
  legalRepRole             String    @default("Gérant")
  anmeCode                 String
  anmeReference            String?
  anmeCategory             String
  anmeValidFrom            DateTime
  anmeValidTo              DateTime
  anmeCertificateFileId    String?
  anmeCertificate          File?     @relation("CompanyAnmeCertificate", fields: [anmeCertificateFileId], references: [id])
  defaultTMinC             Float     @default(-10)
  defaultTMaxC             Float     @default(85)
  defaultMaxVoltageDropPct Float     @default(3)
  defaultEarthResistanceTargetOhm Float?
  defaultDesignWindSpeedKmh Float    @default(120)
  defaultCosPhi            Float     @default(0.8)
  createdAt                DateTime  @default(now())

  users        CompanyUser[]
  subscription Subscription?
  payments     Payment[]

  @@map("company")
}

model CompanyUser {
  id           String          @id @default(uuid())
  companyId    String
  company      Company         @relation(fields: [companyId], references: [id])
  email        String          @unique
  passwordHash String
  fullName     String
  role         CompanyUserRole @default(MEMBER)
  createdAt    DateTime        @default(now())

  sessions Session[]

  @@map("company_user")
}

enum CompanyUserRole {
  OWNER
  MEMBER
}

model Session {
  id            String      @id @default(uuid())
  companyUserId String
  companyUser   CompanyUser @relation(fields: [companyUserId], references: [id])
  tokenHash     String      @unique
  createdAt     DateTime    @default(now())
  lastSeenAt    DateTime    @default(now())
  expiresAt     DateTime

  @@map("session")
}

model SuperAdmin {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  @@map("super_admin")
}
```

- [ ] **Step 3: Write the Plan, Subscription, Payment models**

Append:

```prisma
model Plan {
  id                  String      @id @default(uuid())
  name                String
  monthlyDossierLimit Int
  priceTnd            Decimal     @db.Decimal(10, 2)
  tier                ProjectTier
  createdAt           DateTime    @default(now())

  subscriptions Subscription[]

  @@map("plan")
}

model Subscription {
  id          String             @id @default(uuid())
  companyId   String             @unique
  company     Company            @relation(fields: [companyId], references: [id])
  planId      String
  plan        Plan               @relation(fields: [planId], references: [id])
  status      SubscriptionStatus @default(ACTIVE)
  periodStart DateTime
  periodEnd   DateTime
  createdAt   DateTime           @default(now())

  @@map("subscription")
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  SUSPENDED
}

model Payment {
  id               String        @id @default(uuid())
  companyId        String
  company          Company       @relation(fields: [companyId], references: [id])
  amountTnd        Decimal       @db.Decimal(10, 2)
  method           PaymentMethod
  gatewayReference String?
  note             String?
  recordedByAdmin  Boolean       @default(true)
  createdAt        DateTime      @default(now())

  @@map("payment")
}

enum PaymentMethod {
  MANUAL
  KONNECT
}
```

- [ ] **Step 4: Validate**

Run (from inside `packages/db`): `cd packages/db && npx prisma validate`
Expected: valid (exit code 0). If Prisma reports a missing relation field (e.g. `Company.logo`
referencing `File` without `File` being fully resolvable), re-check Step 1 ran before Step 2
in the actual file — order matters for readability, not validity, but confirms nothing was
skipped.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add accounts, sessions, and billing models"
```

---

## Task 3: Equipment catalog models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: `Company` (Task 2, for `ownerCompanyId`), `File` (Task 2).
- Produces: `PvModule`, `Inverter`, `Spd`, `DcSwitch`, `DcFuse`, `AcBreaker`, `AcIsolator`,
  `Cable`, `CableSection`, `Accessory` models and `SpdSide`, `CableUsage`, `AccessoryKind`
  enums — consumed by Task 4's `Project*` models (`ArrayConfig.moduleId`,
  `ArrayInverter.inverterId`, `Protections.*Id`, `CableRun.cableId`, `Earthing.*Id`,
  `CablingConfig.*Id`).

- [ ] **Step 1: Write all nine equipment catalog models and their three enums**

Append to `packages/db/prisma/schema.prisma` the full block from the design spec §4's
"Equipment catalog" section — `PvModule`, `Inverter`, `Spd` (+ `SpdSide` enum), `DcSwitch`,
`DcFuse`, `AcBreaker`, `AcIsolator`, `Cable` (+ `CableUsage` enum) and its child
`CableSection`, `Accessory` (+ `AccessoryKind` enum) — copied exactly from
`docs/superpowers/specs/2026-10-03-data-model-design.md`'s Prisma schema section, EXCEPT:
leave out every back-relation field that points at a `Project*` model not yet declared
(`arrayConfigs`, `arrayInverters`, `protectionsDc`/`protectionsAc`, `protections`,
`cableRuns`/`earthingCableFor`, `connectorFor`/`cableTrayFor`/`distributionBlockFor`) — Task 4
adds those back-relation fields when it declares the `Project*` models that originate them,
since Prisma relation fields must be added in pairs and the owning (FK) side doesn't exist
yet.

Also fix the one typo the spec's own self-review found and corrected: `PvModule`'s
back-relation field (added in Task 4, not here) is named `arrayConfigs`, not `arrayInverters`
— note this now so Task 4 doesn't reintroduce the original mistake when copying from the spec
document (the spec file itself already has the fix applied at the time this plan was
written).

- [ ] **Step 2: Validate**

Run (from inside `packages/db`): `cd packages/db && npx prisma validate`
Expected: valid. Every FK in these models (`ownerCompanyId`, `datasheetFileId`,
`homologationFileId`) points at already-declared models (`Company`, `File`), so this should
pass cleanly without needing anything from Task 4 yet.

- [ ] **Step 3: Cross-check named relations against the spec's self-review inventory**

Per this plan's Review Focus item on the `File` model's one-sided relations: run

```bash
node -e "
const fs = require('fs');
const schema = fs.readFileSync('packages/db/prisma/schema.prisma', 'utf8');
const names = [...schema.matchAll(/@relation\(\"(\w+)\"/g)].map(m => m[1]);
const counts = {};
for (const n of names) counts[n] = (counts[n]||0)+1;
console.log(Object.entries(counts).map(([n,c]) => \`\${n}: \${c}\`).join('\n'));
"
```

Expected at this point in the plan (Tasks 1-3 only): every `*Datasheet`/`*Homologation` name
for the nine equipment types appears exactly once (one-sided relation to `File`, intentional —
see the design spec's own self-review for why this is valid Prisma, not a bug). No name should
appear more than twice. If any name appears more than twice, two different fields accidentally
share one relation name — find and rename the duplicate before continuing.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add equipment catalog models (modules, inverters, protections, cables, accessories)"
```

---

## Task 4: Project aggregate models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: `Company` (Task 2), `File` (Task 2), `ProjectTier` enum (Task 2), every equipment
  catalog model (Task 3).
- Produces: `Project`, `ProjectClient`, `ProjectSite`, `ProjectArrayConfig`,
  `ProjectArrayInverter`, `ProjectArrayMppt`, `ProjectProtections`, `ProjectCableRun`,
  `ProjectCablingConfig`, `ProjectStructure`, `ProjectEarthing`, `ProjectSimulation`,
  `ProjectImagery`, `ProjectOffGrid`, `ProjectAnnexes`, `ProjectAnnexExtraFile` models, and
  `ProjectStatus`, `CircuitType` enums — consumed by Task 5's `DossierJob.projectId`.

This task also adds the equipment catalog models' back-relation fields that Task 3
deliberately omitted (`PvModule.arrayConfigs`, `Inverter.arrayInverters`,
`Spd.protectionsDc`/`protectionsAc`, `DcSwitch.protections`, `DcFuse.protections`,
`AcBreaker.protections`, `AcIsolator.protections`, `Cable.cableRuns`/`earthingCableFor`,
`Accessory.connectorFor`/`cableTrayFor`/`distributionBlockFor`) — add each one as a one-line
edit to its already-declared model from Task 3, not as a new model block.

- [ ] **Step 1: Write the Project model and its direct children**

Append the full block from the design spec §4's "Project aggregate" section —
`Project` (+ `ProjectStatus` enum), `ProjectClient`, `ProjectSite`, `ProjectArrayConfig`,
`ProjectArrayInverter`, `ProjectArrayMppt`, `ProjectProtections`, `ProjectCableRun` (+
`CircuitType` enum), `ProjectCablingConfig`, `ProjectStructure`, `ProjectEarthing`,
`ProjectSimulation`, `ProjectImagery`, `ProjectOffGrid`, `ProjectAnnexes`,
`ProjectAnnexExtraFile` — copied exactly from the spec document.

- [ ] **Step 2: Add the omitted back-relation fields to Task 3's equipment models**

Edit each of these existing models (from Task 3) to add exactly the one back-relation field
named in this task's Interfaces block above — e.g. `PvModule` gains:

```prisma
  arrayConfigs ProjectArrayConfig[]
```

placed right after its existing `createdAt` field, before the model's closing brace. Repeat
for `Inverter.arrayInverters`, `Spd.protectionsDc`/`protectionsAc` (two fields, since `Spd` is
referenced twice from `ProjectProtections` — once as `dcSpdId`, once as `acSpdId` — each
needs its own relation name matching what `ProjectProtections` declares: `"DcSpd"` and
`"AcSpd"`), `DcSwitch.protections`, `DcFuse.protections`, `AcBreaker.protections`,
`AcIsolator.protections`, `Cable.cableRuns` and `Cable.earthingCableFor` (two fields, same
reasoning — `Cable` is referenced from both `ProjectCableRun.cableId` and
`ProjectEarthing.earthCableId`), `Accessory.connectorFor`/`cableTrayFor` (from
`ProjectCablingConfig`'s two accessory FKs) and `Accessory.distributionBlockFor` (from
`ProjectEarthing.distributionBlockId`).

- [ ] **Step 3: Validate**

Run (from inside `packages/db`): `cd packages/db && npx prisma validate`
Expected: valid. This is the step most likely to surface a real relation-pairing error, since
it's the first point every named relation declared across Tasks 2-4 has both of its sides
present. If it fails, read the exact Prisma error — it names the field and model with the
problem — and fix the mismatched relation name, not a workaround.

- [ ] **Step 4: Re-run the relation-name count check**

```bash
node -e "
const fs = require('fs');
const schema = fs.readFileSync('packages/db/prisma/schema.prisma', 'utf8');
const names = [...schema.matchAll(/@relation\(\"(\w+)\"/g)].map(m => m[1]);
const counts = {};
for (const n of names) counts[n] = (counts[n]||0)+1;
const bad = Object.entries(counts).filter(([n,c]) => c !== 1 && c !== 2);
console.log(bad.length === 0 ? 'OK: every name appears 1 (File, one-sided) or 2 (paired) times' : bad);
"
```

Expected: `OK: every name appears 1 (File, one-sided) or 2 (paired) times`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add project aggregate models and equipment catalog back-relations"
```

---

## Task 5: Jobs & validation models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: `Project` (Task 4).
- Produces: `DossierJob`, `DossierCheckResult`, `ClaudeUsageLog` models and `JobStatus` enum —
  the final models in the schema; nothing later depends on these.

- [ ] **Step 1: Write the DossierJob, DossierCheckResult, ClaudeUsageLog models**

Append the full block from the design spec §4's "Jobs & validation" section, and add
`Project`'s own back-relation field `jobs DossierJob[]` to the already-declared `Project`
model from Task 4 (one-line edit, same pattern as Task 4 Step 2).

- [ ] **Step 2: Validate**

Run (from inside `packages/db`): `cd packages/db && npx prisma validate`
Expected: valid. This should now validate the complete 37-model schema for the first time.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add dossier job, check result, and Claude usage log models"
```

---

## Task 6: First migration against the real database

**Files:**
- Create: `packages/db/prisma/migrations/<timestamp>_init/migration.sql` (generated by Prisma,
  not hand-written)

**Interfaces:**
- Consumes: the complete schema (Tasks 1-5).
- Produces: a real, applied PostgreSQL schema in the `dossipv` database running in Docker on
  the server, reachable via the SSH tunnel.

- [ ] **Step 1: Confirm the SSH tunnel to Postgres is active**

Run: `node -e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);}); s.setTimeout(3000,()=>{console.error('TUNNEL DOWN: timeout');process.exit(1);});"`
Expected: `tunnel alive`. If it prints `TUNNEL DOWN`, re-establish it first:
`ssh -f -N -L 5433:127.0.0.1:5433 dossipv-server` (requires the `dossipv-server` alias and
dedicated keypair already configured in `~/.ssh/config` from the infrastructure setup done
before this plan — see the design spec §2).

- [ ] **Step 2: Run the first migration**

Run (from inside `packages/db`): `cd packages/db && npx prisma migrate dev --name init`
Expected: Prisma creates `packages/db/prisma/migrations/<timestamp>_init/migration.sql`,
applies it to the `dossipv` database, and reports success (e.g. "Your database is now in
sync with your schema."). If it reports a connection error, re-check Step 1 and the
`DATABASE_URL` value in `packages/db/.env` (copied from the repo root in Task 1 Step 8;
should be `postgresql://dossipv:<password>@localhost:5433/dossipv?schema=public`).

Table-count verification happens in Task 7 Step 3, once the Prisma client exists to query
with — Prisma 7's `db execute` subcommand only runs side-effecting SQL and reports
success/failure, it does not print query results, so it cannot be used to read back a row
count here.

- [ ] **Step 3: Commit the migration**

```bash
git add packages/db/prisma/migrations
git commit -m "feat(db): apply initial migration to the dossipv database"
```

---

## Task 7: Generate the Prisma client and wire it into `src/index.ts`

**Files:**
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: the applied migration (Task 6) and the schema (Tasks 1-5) — `prisma generate`
  reads the schema file directly, not the database.
- Produces: `export const db: PrismaClient` from `@dossipv/db`'s public API — the single
  client instance every later package (the installer web app, a future document-pipeline
  worker) imports to query the database.

- [ ] **Step 1: Generate the client**

Run (from inside `packages/db`): `cd packages/db && npx prisma generate`
Expected: Prisma reports the client was generated (its output names the generated package
path, typically into `node_modules/@prisma/client` or a configured custom output path — this
schema's `generator client` block in Task 1 didn't set a custom `output`, so it generates into
the default `node_modules/.prisma/client` location, re-exported through `@prisma/client`).

- [ ] **Step 2: Write the singleton client export**

Prisma 7's `PrismaClient` requires an explicit driver adapter at construction — confirmed by a
real `new PrismaClient()` call throwing `PrismaClientInitializationError: ... A driver
adapter is required to connect to your database` during this plan's own writing. For
PostgreSQL this is `@prisma/adapter-pg`'s `PrismaPg` class (already a dependency, added in
Task 1 Step 1), constructed with the connection string.

```ts
// packages/db/src/index.ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient instance. Every package that queries the database imports this
 * rather than constructing its own client — avoids exhausting Postgres connections during
 * development hot-reload (the standard Next.js-safe singleton pattern), and matches the
 * design spec's "single source of truth" discipline already used for the calculation
 * engine's runEngine(). Requires an explicit driver adapter (Prisma 7) rather than reading
 * DATABASE_URL implicitly.
 */
declare global {
  // eslint-disable-next-line no-var
  var __dossipvPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalThis.__dossipvPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__dossipvPrisma = db;
}

export * from '@prisma/client';
```

Save as `packages/db/src/index.ts`, replacing the placeholder comment from Task 1. Note
`import 'dotenv/config'` here loads `.env` relative to whatever process imports this module
— when run via this plan's own verification scripts (Tasks 7-9), that process's cwd is the
repo root, which does NOT have the same `.env` loading guarantee as `packages/db/.env` unless
the repo root's own `.env` (which already exists) is also present there, which it is — both
copies carry the same `DATABASE_URL`, so this resolves correctly regardless of which one
`dotenv` finds first in practice. If a later task's verification script fails with a
connection error despite the tunnel being up, check first whether `process.env.DATABASE_URL`
is actually populated in that script's process before suspecting the schema or adapter.

- [ ] **Step 3: Typecheck**

Run (from repo root): `npm run typecheck`
Expected: PASS. This is the first point the generated Prisma types (now imported by
`src/index.ts`) flow through the monorepo's `tsc -b` build — a failure here likely means the
generated client wasn't produced where TypeScript expects it (re-check Step 1's output path
against this file's import).

- [ ] **Step 4: Verify every table from Task 6's migration actually exists**

Now that the client exists, use it (via `$queryRawUnsafe`, Prisma's supported escape hatch for
ad-hoc SQL the generated model API doesn't cover) to read back the table count — this is the
step Task 6 deferred, since `prisma db execute` in this version only runs side-effecting SQL
and cannot print query results.

Run (from repo root):
```bash
node --experimental-strip-types -e "
import { db } from './packages/db/src/index.ts';
const rows = await db.\$queryRawUnsafe(\"SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'\");
console.log('table count:', rows[0].count);
await db.\$disconnect();
"
```
Expected: `table count: 38` (37 models' tables plus Prisma's own `_prisma_migrations`
tracking table). If lower, a model failed to migrate; if higher by more than 1, investigate
what extra table exists before continuing.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/index.ts
git commit -m "feat(db): export a singleton PrismaClient from @dossipv/db"
```

---

## Task 8: Seed script proving every table is insertable

**Files:**
- Create: `packages/db/prisma/seed.ts`

**Interfaces:**
- Consumes: `db` from `../src/index.ts` (Task 7), equipment specs adapted from
  `@dossipv/engine`'s `habib-khedhira` test fixture (read-only reference, not an import —
  `@dossipv/db` does not depend on `@dossipv/engine`, matching the Global Constraint that no
  new package introduces an unnecessary cross-dependency; the seed script hand-transcribes the
  same real-world module/inverter specs as literal values instead).
- Produces: nothing other packages consume — this is a standalone, re-runnable script
  (`npm run seed` from `packages/db`) that populates enough realistic data to manually
  exercise later UI work, and whose successful run is this task's own proof the schema works
  end-to-end.

This task directly implements this plan's Review Focus items: it must insert data exercising
every conditional-requirement branch (PREMIUM+imagery, ISOLATED+offGrid, PVSYST_UPLOAD
simulation), prove the per-company multi-user session join resolves, and prove `Decimal`
rounding behaves predictably on a 5-decimal-digit input.

- [ ] **Step 1: Write the seed script's global equipment catalog section**

```ts
// packages/db/prisma/seed.ts
import { db } from '../src/index.ts';

async function seedGlobalEquipment() {
  const pvModule = await db.pvModule.create({
    data: {
      brand: 'LONGi',
      model: 'LR7-72HGD-620M',
      pmaxW: 620,
      vmpV: 46.5,
      impA: 13.33,
      vocV: 55.9,
      iscA: 13.92,
      tempCoeffVocPct: -0.25,
      tempCoeffIscPct: 0.045,
      tempCoeffPmaxPct: -0.28,
      irmA: 25,
      maxSystemVoltageV: 1500,
      lengthMm: 2278,
      widthMm: 1134,
      weightKg: 33.5,
    },
  });

  const inverter = await db.inverter.create({
    data: {
      brand: 'Sofar',
      model: '1-4KTL2-G3',
      phases: 1,
      pacW: 3000,
      sacVA: 3000,
      vdcMaxV: 550,
      mpptMinV: 90,
      mpptMaxV: 550,
      startUpV: 100,
      mpptCount: 1,
      inputsPerMppt: 2,
      idcMaxPerMpptA: 16,
      iscMaxPerMpptA: 20,
      vacNomV: 230,
      iacMaxA: 16,
      stegApproved: true,
    },
  });

  const dcSpd = await db.spd.create({
    data: { brand: 'Generic', model: 'DC-SPD-1', side: 'DC', type: 2, poles: 2, ucV: 700, upKV: 2.0, inKA: 10, iscpvKA: 0.02 },
  });
  const acSpd = await db.spd.create({
    data: { brand: 'Generic', model: 'AC-SPD-1', side: 'AC', type: 2, poles: 2, ucV: 275, upKV: 1.5, inKA: 10, iscpvKA: 0 },
  });
  const dcSwitch = await db.dcSwitch.create({
    data: { brand: 'ZJ BENY', model: 'BB1H-63', ratedVoltageV: 600, ratedCurrentA: 25, poles: 2 },
  });
  const acBreaker = await db.acBreaker.create({
    data: { brand: 'Generic', model: 'AC-BRK-20', ratedCurrentA: 20 },
  });
  const cable = await db.cable.create({
    data: {
      brand: 'Generic',
      model: 'H1Z2Z2-K',
      usage: 'DC_SOLAR',
      conductor: 'Cu',
      insulation: 'PR',
      sections: { create: [{ sectionMm2: 6, izA: 56, izReferenceMethod: 'B' }] },
    },
  });
  const earthCable = await db.cable.create({
    data: {
      brand: 'Generic',
      model: 'H07V-U',
      usage: 'EARTH',
      conductor: 'Cu',
      insulation: 'PVC',
      sections: { create: [{ sectionMm2: 16, izA: 0, izReferenceMethod: 'B' }] },
    },
  });

  return { pvModule, inverter, dcSpd, acSpd, dcSwitch, acBreaker, cable, earthCable };
}
```

- [ ] **Step 2: Write the company, multi-user session, and plan/subscription section**

```ts
async function seedCompanyAndAccounts() {
  const plan = await db.plan.create({
    data: { name: 'Standard', monthlyDossierLimit: 10, priceTnd: 199.99, tier: 'STANDARD' },
  });

  const company = await db.company.create({
    data: {
      name: 'SolarPro Tunisie',
      address: '12 Rue de la Liberté, Tunis',
      phone: '+216 71 234 567',
      email: 'contact@solarpro.tn',
      legalRepFullName: 'Ahmed Ben Ali',
      anmeCode: 'ANME-2024-001',
      anmeCategory: 'BT',
      anmeValidFrom: new Date('2024-01-01'),
      anmeValidTo: new Date('2027-01-01'),
      subscription: {
        create: { planId: plan.id, status: 'ACTIVE', periodStart: new Date(), periodEnd: new Date('2027-01-01') },
      },
    },
  });

  // Two users under the SAME company, each with an active session — proves the
  // per-company (not per-user) concurrent-session join path resolves cleanly before any
  // later plan builds enforcement logic on top of it (Review Focus item 3).
  const owner = await db.companyUser.create({
    data: { companyId: company.id, email: 'owner@solarpro.tn', passwordHash: 'placeholder-hash', fullName: 'Ahmed Ben Ali', role: 'OWNER' },
  });
  const member = await db.companyUser.create({
    data: { companyId: company.id, email: 'member@solarpro.tn', passwordHash: 'placeholder-hash', fullName: 'Fatma Trabelsi', role: 'MEMBER' },
  });
  await db.session.create({
    data: { companyUserId: owner.id, tokenHash: 'placeholder-token-hash-1', expiresAt: new Date(Date.now() + 86400000) },
  });
  await db.session.create({
    data: { companyUserId: member.id, tokenHash: 'placeholder-token-hash-2', expiresAt: new Date(Date.now() + 86400000) },
  });

  // Prove the per-company join resolves: count sessions across every user of this company.
  const sessionCountForCompany = await db.session.count({
    where: { companyUser: { companyId: company.id } },
  });
  if (sessionCountForCompany !== 2) {
    throw new Error(`Expected 2 sessions for company ${company.id}, found ${sessionCountForCompany}`);
  }

  return { company, owner };
}
```

- [ ] **Step 3: Write the three project section (STANDARD baseline, PREMIUM+imagery, ISOLATED+offGrid)**

```ts
async function seedProjects(
  companyId: string,
  equipment: Awaited<ReturnType<typeof seedGlobalEquipment>>,
) {
  // Baseline STANDARD project with PVSYST_UPLOAD simulation — exercises that conditional
  // branch (Review Focus item 2).
  const standardProject = await db.project.create({
    data: {
      companyId,
      tier: 'STANDARD',
      status: 'DRAFT',
      client: { create: { fullName: 'Habib Khedhira', clientKind: 'INDIVIDUAL' } },
      site: {
        create: {
          gpsLat: 36.5606,
          gpsLon: 10.5272,
          gridType: 'BT',
          phases: 1,
          mountingType: 'FLAT_ROOF_BALLAST',
          tiltDeg: 30,
        },
      },
      arrayConfig: {
        create: {
          moduleId: equipment.pvModule.id,
          inverters: {
            create: [{ inverterId: equipment.inverter.id, mppts: { create: [{ stringsInParallel: 1, modulesPerString: 5 }] } }],
          },
        },
      },
      protections: {
        create: {
          dcSpdId: equipment.dcSpd.id,
          dcSwitchId: equipment.dcSwitch.id,
          acBreakerId: equipment.acBreaker.id,
          acSpdId: equipment.acSpd.id,
        },
      },
      structure: {
        create: { material: 'Aluminium', frameCount: 5, structureWeightN: 275, heightHM: 1, depthDM: 1.5, windSpeedKmh: 120 },
      },
      earthing: {
        create: {
          mainEarthSectionMm2: 16,
          frameEarthSectionMm2: 16,
          earthToPitSectionMm2: 25,
          rodCount: 3,
          rodLengthM: 1.5,
          targetResistanceOhm: 25,
          earthCableId: equipment.earthCable.id,
        },
      },
      simulation: {
        create: { source: 'PVSYST_UPLOAD', annualProductionKWh: 4760 },
      },
    },
  });

  // PREMIUM project with imagery — exercises that conditional branch.
  const premiumProject = await db.project.create({
    data: {
      companyId,
      tier: 'PREMIUM',
      status: 'DRAFT',
      client: { create: { fullName: 'Client Premium', clientKind: 'COMPANY' } },
      site: { create: { gpsLat: 36.8, gpsLon: 10.2, gridType: 'BT', phases: 3, mountingType: 'GROUND', tiltDeg: 25 } },
      imagery: {
        create: {
          geometry: { panelPolygon: [[0, 0], [100, 0], [100, 50], [0, 50]], markers: { technicalRoom: [10, 10], meter: [20, 20], earthPit: [30, 30], cableRoute: [[0, 0], [10, 10]] } },
        },
      },
    },
  });

  // ISOLATED (off-grid) project — exercises that conditional branch.
  const offGridProject = await db.project.create({
    data: {
      companyId,
      tier: 'STANDARD',
      status: 'DRAFT',
      client: { create: { fullName: 'Client Hors Reseau', clientKind: 'INDIVIDUAL' } },
      site: { create: { gpsLat: 34.0, gpsLon: 9.0, gridType: 'ISOLATED', phases: 1, mountingType: 'GROUND', tiltDeg: 30 } },
      offGrid: {
        create: { dailyLoadKWh: 5, autonomyDays: 2, batteryChemistry: 'LITHIUM', batteryVoltageV: 48, maxDepthOfDischargePct: 80 },
      },
    },
  });

  return { standardProject, premiumProject, offGridProject };
}
```

- [ ] **Step 4: Write the DossierJob + Decimal-rounding section**

```ts
async function seedJobAndUsageLog(projectId: string) {
  const job = await db.dossierJob.create({
    data: {
      projectId,
      status: 'SUCCEEDED',
      inputSnapshot: { note: 'seed placeholder snapshot' },
      completedAt: new Date(),
      checkResults: {
        create: [{ checkId: 'C01', level: 'BLOCK', pass: true, message: 'Ns within range' }],
      },
    },
  });

  // Decimal rounding check (Review Focus item 4): costUsd is @db.Decimal(10, 4) — seed a
  // value with 5 decimal digits before rounding and assert it actually rounded to 4, rather
  // than truncating oddly or throwing.
  const rawCost = 0.123456; // 6 decimal digits in the JS float
  const log = await db.claudeUsageLog.create({
    data: { jobId: job.id, model: 'claude-opus-5-5', inputTokens: 500, outputTokens: 1200, costUsd: rawCost },
  });
  const storedCost = Number(log.costUsd);
  if (storedCost !== 0.1235 && storedCost !== 0.1234) {
    throw new Error(`Expected costUsd to round to 4 decimal places, got ${storedCost}`);
  }

  return { job, log };
}
```

- [ ] **Step 5: Write the main() entry point and run it**

```ts
async function main() {
  const equipment = await seedGlobalEquipment();
  const { company } = await seedCompanyAndAccounts();
  const { standardProject } = await seedProjects(company.id, equipment);
  await seedJobAndUsageLog(standardProject.id);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
```

Append this to `packages/db/prisma/seed.ts`, after the three section functions from Steps 1-4.

- [ ] **Step 6: Run the seed script**

Run (from repo root): `node --experimental-strip-types packages/db/prisma/seed.ts`
Expected: `Seed complete.` printed with no thrown error. If the per-company session count
check or the Decimal rounding check throws, that is this task's Review Focus items actually
catching a real problem — fix the underlying schema or seed data (not the check) and re-run.

- [ ] **Step 7: Verify row counts directly against the database**

Use the Prisma client's model API directly (simpler and more reliable here than raw SQL,
since every count is a single model's table):

```bash
node --experimental-strip-types -e "
import { db } from './packages/db/src/index.ts';
console.log('modules:', await db.pvModule.count());
console.log('companies:', await db.company.count());
console.log('projects:', await db.project.count());
console.log('sessions:', await db.session.count());
await db.\$disconnect();
"
```
Expected: `modules: 1` (or more), `companies: 1`, `projects: 3`, `sessions: 2`.

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/seed.ts
git commit -m "feat(db): add seed script covering every conditional project branch and the anti-sharing session join"
```

---

## Task 9: Whole-package review pass

**Files:** none new — this task re-reads everything Tasks 1-8 produced.

**Interfaces:** none new.

- [ ] **Step 1: Re-validate the full schema and re-run the seed from a clean database**

Run:
```bash
cd packages/db && npx prisma validate
npx prisma migrate reset --force
npx prisma migrate dev --name init
cd ../.. && node --experimental-strip-types packages/db/prisma/seed.ts
```
No `--skip-seed` flag: this plan never wires the seed script into Prisma's own `prisma.seed`
auto-seed hook (it's run manually as a separate `npm run seed` step in Task 8), so
`migrate reset` has nothing to auto-seed and the flag isn't needed — confirmed empirically
against the installed Prisma 7.10 CLI, which rejects `--skip-seed` as unrecognized when no
seed hook is configured, matching `migrate reset --help`'s own options list.

Expected: all four commands succeed, proving the migration + seed sequence works from a truly
empty database, not just incrementally on top of Task 6-8's already-migrated state.

- [ ] **Step 2: Confirm every table from the design spec's inventory actually exists**

```bash
node --experimental-strip-types -e "
import { db } from './packages/db/src/index.ts';
const rows = await db.\$queryRawUnsafe(\"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name\");
console.log(rows.map(r => r.table_name).join('\n'));
await db.\$disconnect();
"
```
Expected: 37 table names, each matching one `@@map(...)` value from the schema (e.g. `company`,
`company_user`, `session`, `pv_module`, `project`, `dossier_job`, ...). Cross-check this list
against the design spec's §4 table inventory — any name present in one list but not the other
is a finding to resolve directly (no separate task needed for a one-line gap).

- [ ] **Step 3: Typecheck and lint the whole workspace**

Run: `npm run typecheck && npm run lint`
Expected: both PASS, confirming `@dossipv/db`'s addition didn't break any existing package.

- [ ] **Step 4: Update project memory**

Judgment call, not scripted: update
`C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
to record `@dossipv/db` as built (37 models, migrated, seeded), the server infrastructure now
in place (Postgres in Docker, SSH tunnel for local dev), and the real multi-user +
concurrent-session anti-sharing decision that revised spec §8 — matching that file's existing
style for the engine/document-text/dossier-worker entries.

- [ ] **Step 5: Final commit if Step 2 found any gaps**

```bash
git add -A
git commit -m "fix(db): close table-inventory gaps found in final review"
```

(Skip entirely if Step 2 found no gaps.)
