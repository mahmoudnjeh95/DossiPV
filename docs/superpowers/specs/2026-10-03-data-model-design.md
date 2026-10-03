# DossiPV — Data Model & Persistence Design Spec

## 1. Purpose and scope

This is sub-project #1 of the "full application" build (per spec §3, §8): the PostgreSQL
schema and Prisma setup that every later piece (auth, super-admin, installer UI, document
pipeline, map editor) depends on. It covers:

- The equipment catalog (global + per-company private items).
- The project aggregate (one dossier's full input data, mirroring `pv_dossier_input_schema.json`).
- Operational tables: companies, multi-user accounts, sessions, plans, subscriptions,
  payments, dossier generation jobs, validation check results, Claude usage log.

**Explicitly out of scope** (later sub-projects): actual auth implementation (login forms,
password hashing wiring, session middleware — this spec only defines the tables), the
super-admin UI, the installer-facing project form, the document generation pipeline's
drawing/docx/PDF logic, the map editor UI, and the Konnect payment gateway integration
(the `payment` table's shape supports it, but the actual API integration is separate).

## 2. Infrastructure (already provisioned)

PostgreSQL 18 runs in Docker on the existing Linux server (`217.182.205.137`, Debian 13),
fully isolated from that server's other applications (own Docker network `dossipv_default`,
own named volume `dossipv_pgdata`, own container `dossipv-postgres-1`), bound to
`127.0.0.1:5433` only — never exposed to the public internet directly.

- Compose file: `/home/debian/dossipv/docker-compose.yml` on the server.
- Local development reaches it via an SSH tunnel: `ssh -f -N -L 5433:127.0.0.1:5433 dossipv-server`
  (the `dossipv-server` alias is defined in the local `~/.ssh/config`, using a dedicated
  keypair `~/.ssh/dossipv_server` — not the account password). This tunnel must be
  re-established each dev session until a more permanent solution (e.g. a persistent tunnel
  service, or direct deployment of the app itself onto the same server) is set up.
- Connection string lives in the repo root's `.env` (gitignored) as `DATABASE_URL`.
- The account password used for initial SSH access was typed in chat during setup and should
  be rotated by the user independently of this spec — not required for any of this work since
  key-based auth is now in place.

## 3. Prisma 7 architecture note (verified empirically, not assumed)

Prisma 7 changed its configuration model significantly from the pattern used in Prisma 5/6
(which this spec originally assumed before being corrected during plan-writing, via a real
smoke-tested migration against the actual tunneled database — see the implementation plan's
own notes on this). Three concrete differences that affect every later section:

1. **`datasource.url` can no longer live in `schema.prisma`.** `url = env("DATABASE_URL")`
   inside the `datasource db { ... }` block is rejected outright (`P1012`). The schema's
   `datasource` block now only declares the `provider`; the actual connection URL moves to a
   new `prisma.config.ts` file at the repo root (or wherever `--schema`/`--config` point), as
   `defineConfig({ datasource: { url: process.env.DATABASE_URL } })`.
2. **`PrismaClient` requires an explicit driver adapter at construction** — `new PrismaClient()`
   with no arguments throws `PrismaClientInitializationError` ("A driver adapter is required
   to connect to your database"). For PostgreSQL, this is `@prisma/adapter-pg`'s `PrismaPg`
   class, constructed with the connection string and passed as `{ adapter }`.
3. **The CLI's `db execute` subcommand only runs side-effecting SQL** (DDL/DML) and reports
   success/failure — it does not print query results, so it cannot be used for ad-hoc `SELECT`
   verification. Reading data back for verification purposes goes through the generated
   client itself (`db.$queryRawUnsafe(...)` for raw SQL, or the generated model API for
   anything the schema already models) — both of which are exercised throughout the seed
   script and its own verification steps.

## 4. Decisions carried from brainstorming

- **ORM**: Prisma — chosen for migration tooling and type-safe client generation, and because
  the super-admin catalog CRUD screens benefit from its ergonomics.
- **Equipment catalog sharing model**: one table per equipment type with a nullable
  `ownerCompanyId` column — `NULL` means global/super-admin-maintained, a set value means
  private to that company. A project's FK can point at either.
- **Filtered FK enforcement** (e.g. `Cabling.connectorId` must reference an `Accessory` with
  `kind = MC4_CONNECTOR`): enforced in application code (Zod validation before insert), not
  as a database constraint. One `accessory` table with a `kind` column, one `cable` table with
  a `usage` column — matching how the JSON Schema itself expresses the rule (as an `x-notes`
  convention, not a structural constraint).
- **Geometry data** (`Imagery.panelPolygon`, `markers`, `cableRoute` — pixel coordinates for
  the premium map editor): stored as a single JSONB column. No relational value in querying
  individual points; the map editor UI reads/writes it as one JS object.
- **Accounts — revised from the original spec §8 "one login per company"**: real multi-user
  accounts. Each company can have multiple named logins (`CompanyUser`), not one shared
  credential pair. This is a structural anti-sharing measure: sharing one person's personal
  login to let a second, unrelated company use the subscription is a bigger trust violation
  than sharing an anonymous company-wide password, and it enables per-user session limits.
- **Anti-credential-sharing enforcement**: a `Session` table with a concurrent-session cap
  enforced server-side, counted **per company** (not per user) — the limit caps total
  simultaneous usage across the whole company's team, which is what actually prevents two
  different businesses from running on one subscription at once. Exact limit (e.g. 2–3
  concurrent sessions) is a config value, not hardcoded, decided at implementation time.
- **Payments**: both manual (super-admin records a payment in `/admin`) and online (Konnect
  checkout + webhook) paths are in scope for later integration work, even though the user
  expects manual-only usage in practice (clients always contact them for renewal). The
  `Payment` table is generic enough (`method` enum, nullable `gatewayReference`) to support
  either without a schema change when the Konnect integration is built.

## 5. Prisma schema

Two files, per the §3 architecture note: `schema.prisma` (models only — no connection URL)
and a new `prisma.config.ts` that supplies it.

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

```prisma
// packages/db/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

// ---------- Accounts & sessions ----------

model Company {
  id                     String    @id @default(uuid())
  name                   String
  shortName              String?
  slogan                 String?
  logoFileId             String?
  logo                   File?     @relation("CompanyLogo", fields: [logoFileId], references: [id])
  address                String
  phone                  String
  email                  String
  taxId                  String?
  commercialRegister     String?
  legalRepFullName       String
  legalRepRole           String    @default("Gérant")
  anmeCode               String
  anmeReference          String?
  anmeCategory           String
  anmeValidFrom          DateTime
  anmeValidTo            DateTime
  anmeCertificateFileId  String?
  anmeCertificate        File?     @relation("CompanyAnmeCertificate", fields: [anmeCertificateFileId], references: [id])
  defaultTMinC           Float     @default(-10)
  defaultTMaxC           Float     @default(85)
  defaultMaxVoltageDropPct Float   @default(3)
  defaultEarthResistanceTargetOhm Float?
  defaultDesignWindSpeedKmh Float  @default(120)
  defaultCosPhi          Float     @default(0.8)
  createdAt              DateTime  @default(now())

  users          CompanyUser[]
  subscription   Subscription?
  payments       Payment[]
  projects       Project[]
  pvModules      PvModule[]
  inverters      Inverter[]
  spds           Spd[]
  dcSwitches     DcSwitch[]
  dcFuses        DcFuse[]
  acBreakers     AcBreaker[]
  acIsolators    AcIsolator[]
  cables         Cable[]
  accessories    Accessory[]

  @@map("company")
}

model CompanyUser {
  id           String    @id @default(uuid())
  companyId    String
  company      Company   @relation(fields: [companyId], references: [id])
  email        String    @unique
  passwordHash String
  fullName     String
  role         CompanyUserRole @default(MEMBER)
  createdAt    DateTime  @default(now())

  sessions     Session[]

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

// ---------- Plans & billing ----------

model Plan {
  id                  String   @id @default(uuid())
  name                String
  monthlyDossierLimit Int
  priceTnd            Decimal  @db.Decimal(10, 2)
  tier                ProjectTier
  createdAt           DateTime @default(now())

  subscriptions Subscription[]

  @@map("plan")
}

model Subscription {
  id          String   @id @default(uuid())
  companyId   String   @unique
  company     Company  @relation(fields: [companyId], references: [id])
  planId      String
  plan        Plan     @relation(fields: [planId], references: [id])
  status      SubscriptionStatus @default(ACTIVE)
  periodStart DateTime
  periodEnd   DateTime
  createdAt   DateTime @default(now())

  @@map("subscription")
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  SUSPENDED
}

model Payment {
  id               String   @id @default(uuid())
  companyId        String
  company          Company  @relation(fields: [companyId], references: [id])
  amountTnd        Decimal  @db.Decimal(10, 2)
  method           PaymentMethod
  gatewayReference String?
  note             String?
  recordedByAdmin  Boolean  @default(true)
  createdAt        DateTime @default(now())

  @@map("payment")
}

enum PaymentMethod {
  MANUAL
  KONNECT
}

// ---------- Equipment catalog ----------
// Shared shape across all equipment types: id/brand/model/datasheet/homologation/ownerCompanyId.
// ownerCompanyId NULL = global (super-admin-maintained), set = private to that company.

model PvModule {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("PvModuleDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("PvModuleHomologation", fields: [homologationFileId], references: [id])

  pmaxW                 Float
  vmpV                  Float
  impA                  Float
  vocV                  Float
  iscA                  Float
  tempCoeffVocPct       Float
  tempCoeffIscPct       Float
  tempCoeffPmaxPct      Float
  tempCoeffVmpPct       Float?
  irmA                  Float
  maxSystemVoltageV     Float
  bifacial              Boolean  @default(false)
  bifacialGainPct       Float?
  lengthMm              Float
  widthMm               Float
  weightKg              Float

  createdAt             DateTime @default(now())

  arrayConfigs           ProjectArrayConfig[]

  @@map("pv_module")
}

model Inverter {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("InverterDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("InverterHomologation", fields: [homologationFileId], references: [id])

  phases                Int      // 1 | 3
  pacW                  Float
  sacVA                 Float
  vdcMaxV               Float
  mpptMinV              Float
  mpptMaxV              Float
  startUpV              Float
  mpptCount             Int
  inputsPerMppt         Int
  idcMaxPerMpptA         Float
  iscMaxPerMpptA         Float
  vacNomV               Float
  vacRangeV             String?
  iacMaxA               Float
  integratedDcSwitch    Boolean  @default(false)
  stegApproved          Boolean  @default(false)

  createdAt             DateTime @default(now())

  arrayInverters        ProjectArrayInverter[]

  @@map("inverter")
}

model Spd {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("SpdDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("SpdHomologation", fields: [homologationFileId], references: [id])

  side                  SpdSide
  type                  Int      // 1 | 2
  poles                 Int
  ucV                   Float
  upKV                  Float
  inKA                  Float
  imaxKA                Float
  iscpvKA               Float?

  createdAt             DateTime @default(now())

  protectionsDc         ProjectProtections[] @relation("DcSpd")
  protectionsAc         ProjectProtections[] @relation("AcSpd")

  @@map("spd")
}

enum SpdSide {
  DC
  AC
}

model DcSwitch {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("DcSwitchDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("DcSwitchHomologation", fields: [homologationFileId], references: [id])

  ratedVoltageV         Float
  ratedCurrentA         Float
  poles                 Int

  createdAt             DateTime @default(now())

  protections           ProjectProtections[]

  @@map("dc_switch")
}

model DcFuse {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("DcFuseDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("DcFuseHomologation", fields: [homologationFileId], references: [id])

  ratedVoltageV         Float
  ratedCurrentA         Float

  createdAt             DateTime @default(now())

  protections           ProjectProtections[]

  @@map("dc_fuse")
}

model AcBreaker {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("AcBreakerDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("AcBreakerHomologation", fields: [homologationFileId], references: [id])

  ratedCurrentA         Float
  curve                 String?
  breakingCapacityKA    Float?

  createdAt             DateTime @default(now())

  protections           ProjectProtections[]

  @@map("ac_breaker")
}

model AcIsolator {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("AcIsolatorDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("AcIsolatorHomologation", fields: [homologationFileId], references: [id])

  ratedCurrentA         Float

  createdAt             DateTime @default(now())

  protections           ProjectProtections[]

  @@map("ac_isolator")
}

model Cable {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("CableDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("CableHomologation", fields: [homologationFileId], references: [id])

  usage                 CableUsage
  conductor              String   // "Cu" | "Al"
  insulation            String   // "PR" | "PVC" | "EPR" | "XLPO"
  standard               String?

  createdAt             DateTime @default(now())

  sections              CableSection[]
  cableRuns              ProjectCableRun[]
  earthingCableFor       ProjectEarthing[]

  @@map("cable")
}

enum CableUsage {
  DC_SOLAR
  AC
  EARTH
}

model CableSection {
  id               String  @id @default(uuid())
  cableId          String
  cable            Cable   @relation(fields: [cableId], references: [id])
  sectionMm2       Float
  izA              Float
  izReferenceMethod String // "B" | "C" | "E" | "F"

  @@map("cable_section")
}

model Accessory {
  id                    String   @id @default(uuid())
  ownerCompanyId        String?
  ownerCompany          Company? @relation(fields: [ownerCompanyId], references: [id])
  brand                 String
  model                 String
  datasheetFileId       String?
  datasheet             File?    @relation("AccessoryDatasheet", fields: [datasheetFileId], references: [id])
  homologationReference String?
  homologationValidTo   DateTime?
  homologationFileId    String?
  homologationDocument  File?    @relation("AccessoryHomologation", fields: [homologationFileId], references: [id])

  kind                  AccessoryKind
  spec                  String?

  createdAt             DateTime @default(now())

  connectorFor           ProjectCablingConfig[] @relation("Connector")
  cableTrayFor           ProjectCablingConfig[] @relation("CableTray")
  distributionBlockFor   ProjectEarthing[]

  @@map("accessory")
}

enum AccessoryKind {
  MC4_CONNECTOR
  DISTRIBUTION_BLOCK
  CABLE_TRAY
  DC_ENCLOSURE
  AC_ENCLOSURE
  EARTH_ROD
  OTHER
}

// ---------- Generic file storage ----------

model File {
  id       String  @id @default(uuid())
  fileName String
  mimeType String  // "pdf" | "png" | "jpeg"
  storageKey String // path/key into whatever object storage is used — decided at implementation time
  createdAt DateTime @default(now())

  @@map("file")
}

// ---------- Project aggregate ----------

model Project {
  id              String      @id @default(uuid())
  companyId       String
  company         Company     @relation(fields: [companyId], references: [id])
  tier            ProjectTier @default(STANDARD)
  dossierNumber   String?
  dossierDate     DateTime?
  status          ProjectStatus @default(DRAFT)
  revision        Int         @default(1)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  client          ProjectClient?
  site            ProjectSite?
  arrayConfig     ProjectArrayConfig?
  protections     ProjectProtections?
  cablingConfig   ProjectCablingConfig?
  cableRuns       ProjectCableRun[]
  structure       ProjectStructure?
  earthing        ProjectEarthing?
  simulation      ProjectSimulation?
  imagery         ProjectImagery?
  offGrid         ProjectOffGrid?
  annexes         ProjectAnnexes?
  jobs            DossierJob[]

  @@map("project")
}

enum ProjectTier {
  STANDARD
  PREMIUM
}

enum ProjectStatus {
  DRAFT
  GENERATED
  SUBMITTED
  APPROVED
  REJECTED
}

model ProjectClient {
  id                    String  @id @default(uuid())
  projectId             String  @unique
  project               Project @relation(fields: [projectId], references: [id])
  civility              String?
  fullName              String
  clientKind            String
  stegReference         String?
  cin                   String?
  commercialRegister    String?
  phone                 String?
  address               String?
  city                  String?
  governorate           String?
  annualConsumptionKWh  Float?
  subscribedPowerKVA    Float?

  @@map("project_client")
}

model ProjectSite {
  id                       String  @id @default(uuid())
  projectId                String  @unique
  project                  Project @relation(fields: [projectId], references: [id])
  gpsLat                   Float
  gpsLon                   Float
  gridType                 String  // "BT" | "MT" | "ISOLATED"
  phases                   Int     // 1 | 3
  mountingType             String
  roofMaterial             String?
  buildingHeightM          Float?
  tiltDeg                  Float
  azimuthDeg               Float?
  shading                  String?
  shadingNotes             String?
  lightningRod             Boolean @default(false)
  generator                Boolean @default(false)
  installationPointLat     Float?
  installationPointLon     Float?
  technicalRoomPointLat    Float?
  technicalRoomPointLon    Float?
  meterPointLat            Float?
  meterPointLon            Float?
  earthPitPointLat         Float?
  earthPitPointLon         Float?
  equipmentLocation        String?

  @@map("project_site")
}

model ProjectArrayConfig {
  id              String   @id @default(uuid())
  projectId       String   @unique
  project         Project  @relation(fields: [projectId], references: [id])
  moduleId        String
  module          PvModule @relation(fields: [moduleId], references: [id])
  tMinC           Float    @default(-10)
  tMaxC           Float    @default(85)
  rowsDescription String?

  inverters       ProjectArrayInverter[]

  @@map("project_array_config")
}

model ProjectArrayInverter {
  id                String             @id @default(uuid())
  arrayConfigId     String
  arrayConfig       ProjectArrayConfig @relation(fields: [arrayConfigId], references: [id])
  inverterId        String
  inverter          Inverter           @relation(fields: [inverterId], references: [id])
  phaseConnection   String?            // "L1" | "L2" | "L3" | "3PH"

  mppts             ProjectArrayMppt[]

  @@map("project_array_inverter")
}

model ProjectArrayMppt {
  id                 String               @id @default(uuid())
  arrayInverterId     String
  arrayInverter       ProjectArrayInverter @relation(fields: [arrayInverterId], references: [id])
  stringsInParallel   Int
  modulesPerString    Int

  @@map("project_array_mppt")
}

model ProjectProtections {
  id                       String     @id @default(uuid())
  projectId                String     @unique
  project                  Project    @relation(fields: [projectId], references: [id])
  dcSpdId                  String
  dcSpd                    Spd        @relation("DcSpd", fields: [dcSpdId], references: [id])
  dcSwitchId               String
  dcSwitch                 DcSwitch   @relation(fields: [dcSwitchId], references: [id])
  dcFuseId                 String?
  dcFuse                   DcFuse?    @relation(fields: [dcFuseId], references: [id])
  acBreakerId              String
  acBreaker                AcBreaker  @relation(fields: [acBreakerId], references: [id])
  acSpdId                  String
  acSpd                    Spd        @relation("AcSpd", fields: [acSpdId], references: [id])
  acIsolatorId             String?
  acIsolator               AcIsolator? @relation(fields: [acIsolatorId], references: [id])
  mainBreakerRatedCurrentA  Float?
  mainBreakerSensitivityMA  Int?
  spdToEquipmentDistanceM   Float      @default(1)
  equipmentImpulseWithstandKV Float    @default(4)

  @@map("project_protections")
}

model ProjectCableRun {
  id               String   @id @default(uuid())
  projectId        String
  project          Project  @relation(fields: [projectId], references: [id])
  circuitType       CircuitType
  label            String
  cableId          String
  cable            Cable    @relation(fields: [cableId], references: [id])
  sectionMm2       Float
  lengthM          Float
  installMethod    String   // one of the 21 NF C 15-100 table 52C codes
  ambientContext   String   // "BURIED" | "TECHNICAL_ROOM" | "TRAY_SHADED" | "TRAY_SUN"
  groupedCircuits  Int      @default(1)
  layers           Int      @default(1)

  @@map("project_cable_run")
}

enum CircuitType {
  DC
  AC
}

model ProjectCablingConfig {
  id                 String     @id @default(uuid())
  projectId          String     @unique
  project            Project    @relation(fields: [projectId], references: [id])
  cosPhi             Float      @default(0.8)
  lambdaOhmPerM      Float
  maxVoltageDropPct  Float      @default(3)
  connectorId        String?
  connector          Accessory? @relation("Connector", fields: [connectorId], references: [id])
  cableTrayId        String?
  cableTray          Accessory? @relation("CableTray", fields: [cableTrayId], references: [id])

  @@map("project_cabling_config")
}

model ProjectStructure {
  id                   String  @id @default(uuid())
  projectId            String  @unique
  project              Project @relation(fields: [projectId], references: [id])
  material             String
  frameDescription     String?
  frameCount           Int
  railsDescription     String?
  fixingDescription    String?
  ballastPerFrame      Int?
  ballastMassKg        Float?
  ballastType          String?
  structureWeightN     Float
  heightHM             Float
  depthDM              Float
  windSpeedKmh         Float   @default(120)
  liftCoeffNPerM2      Float?
  dragCoeffNPerM2      Float?
  tieDownCables        String?
  structureAttestationFileId String?
  structureAttestation File?   @relation(fields: [structureAttestationFileId], references: [id])

  @@map("project_structure")
}

model ProjectEarthing {
  id                       String   @id @default(uuid())
  projectId                String   @unique
  project                  Project  @relation(fields: [projectId], references: [id])
  mainEarthSectionMm2      Float
  frameEarthSectionMm2     Float
  earthToPitSectionMm2     Float
  rodCount                 Int
  rodLengthM               Float
  rodSpacingCm             Float?
  pitSizeCm                String?
  targetResistanceOhm      Float
  earthCableId             String
  earthCable               Cable    @relation(fields: [earthCableId], references: [id])
  distributionBlockId      String?
  distributionBlock        Accessory? @relation(fields: [distributionBlockId], references: [id])

  @@map("project_earthing")
}

model ProjectSimulation {
  id                     String   @id @default(uuid())
  projectId              String   @unique
  project                Project  @relation(fields: [projectId], references: [id])
  source                 String   // "PVSYST_UPLOAD" | "PVGIS_AUTO"
  pvsystReportFileId     String?
  pvsystReport           File?    @relation(fields: [pvsystReportFileId], references: [id])
  annualProductionKWh    Float?
  specificYieldKWhPerKWp Float?
  performanceRatioPct    Float?
  systemLossesPct        Float?

  @@map("project_simulation")
}

model ProjectImagery {
  id                   String  @id @default(uuid())
  projectId            String  @unique
  project              Project @relation(fields: [projectId], references: [id])
  situationImageFileId String?
  situationImage       File?   @relation("SituationImage", fields: [situationImageFileId], references: [id])
  implantationImageFileId String?
  implantationImage    File?   @relation("ImplantationImage", fields: [implantationImageFileId], references: [id])
  southArrowDeg        Float?
  geometry             Json    // { panelPolygon, markers: { technicalRoom, meter, earthPit, cableRoute } }
  imageryProvider      String?

  @@map("project_imagery")
}

model ProjectOffGrid {
  id                        String  @id @default(uuid())
  projectId                 String  @unique
  project                   Project @relation(fields: [projectId], references: [id])
  dailyLoadKWh              Float
  autonomyDays              Float
  batteryChemistry          String
  batteryVoltageV           Int     // 12 | 24 | 48
  maxDepthOfDischargePct    Float
  batteryModel              String?
  chargeControllerModel     String?

  @@map("project_off_grid")
}

model ProjectAnnexes {
  id                        String  @id @default(uuid())
  projectId                 String  @unique
  project                   Project @relation(fields: [projectId], references: [id])
  cinFileId                 String?
  cin                       File?   @relation("AnnexCin", fields: [cinFileId], references: [id])
  commercialRegisterFileId  String?
  commercialRegister        File?   @relation("AnnexCommercialRegister", fields: [commercialRegisterFileId], references: [id])
  stegContractFileId        String?
  stegContract              File?   @relation("AnnexStegContract", fields: [stegContractFileId], references: [id])
  lastPaidBillFileId        String?
  lastPaidBill              File?   @relation("AnnexLastPaidBill", fields: [lastPaidBillFileId], references: [id])

  extraFiles                ProjectAnnexExtraFile[]

  @@map("project_annexes")
}

model ProjectAnnexExtraFile {
  id          String         @id @default(uuid())
  annexesId   String
  annexes     ProjectAnnexes @relation(fields: [annexesId], references: [id])
  fileId      String
  file        File           @relation(fields: [fileId], references: [id])

  @@map("project_annex_extra_file")
}

// ---------- Jobs & validation ----------

model DossierJob {
  id              String      @id @default(uuid())
  projectId       String
  project         Project     @relation(fields: [projectId], references: [id])
  status          JobStatus   @default(PENDING)
  failedStep      String?
  failureReason   String?
  inputSnapshot   Json        // frozen copy of all input data + equipment records used
  startedAt       DateTime    @default(now())
  completedAt     DateTime?

  checkResults    DossierCheckResult[]
  usageLogs       ClaudeUsageLog[]

  @@map("dossier_job")
}

enum JobStatus {
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
}

model DossierCheckResult {
  id        String     @id @default(uuid())
  jobId     String
  job       DossierJob @relation(fields: [jobId], references: [id])
  checkId   String     // "C01".."C22"
  level     String     // "BLOCK" | "WARN"
  pass      Boolean
  message   String

  @@map("dossier_check_result")
}

model ClaudeUsageLog {
  id            String     @id @default(uuid())
  jobId         String
  job           DossierJob @relation(fields: [jobId], references: [id])
  model         String
  inputTokens   Int
  outputTokens  Int
  costUsd       Decimal    @db.Decimal(10, 4)
  createdAt     DateTime   @default(now())

  @@map("claude_usage_log")
}
```

## 6. New package: `@dossipv/db`

A new workspace package holding the Prisma schema, generated client, and migrations —
matching the monorepo's existing package shape:

- `packages/db/prisma/schema.prisma` — the schema above.
- `packages/db/package.json` — depends on `prisma` (dev) and `@prisma/client` (runtime);
  scripts: `migrate` (`prisma migrate dev`), `generate` (`prisma generate`), `studio`
  (`prisma studio`, useful for inspecting data during development).
- `packages/db/src/index.ts` — exports a singleton `PrismaClient` instance (the standard
  Next.js-safe singleton pattern, avoiding exhausting connections during hot-reload).

Other packages (`apps/web`, a future `@dossipv/document-pipeline`) depend on `@dossipv/db` to
query the database — matching the existing monorepo's dependency-direction discipline (no new
package introduces a dependency cycle).

## 7. Testing

Given this is schema-only (no business logic yet), testing is narrower than the engine's
formula-level TDD:

- A smoke test that runs `prisma migrate dev` against the dev database and confirms the
  migration applies cleanly.
- A seed script (`packages/db/prisma/seed.ts`) that inserts a handful of global equipment
  catalog items (reusing the `habib-khedhira` fixture's module/inverter specs as seed data) —
  this both populates something useful for manual testing of later UI work and serves as a
  smoke test that every table's required fields are actually satisfiable.
- No unit tests for Prisma-generated code itself (nothing to unit test — it's generated).

## 8. Open items for the implementation plan to resolve

- Exact concurrent-session limit value (2? 3?) for the anti-sharing session cap — a config
  value, not fixed by this spec.
- Where `File.storageKey` actually points (local disk during development, object storage
  like S3/R2/MinIO in production) — this spec only defines the column; the actual storage
  backend is a separate, later decision.
- Whether `Subscription` needs a `trialEndsAt` or free-trial concept — not mentioned in spec
  §8, assumed out of scope unless the user raises it during plan review.
