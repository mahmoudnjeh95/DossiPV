# Document Pipeline (Slice 1: Snapshot + Docx Template + Fill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `@dossipv/docx-template` package containing a committed `.docx` template
(authored via a one-time generation script using the `docx` library, since no template exists
and this session cannot open Word interactively), a `fillDossierTemplate` function using
`docxtemplater` to produce a real filled `.docx` buffer, and a `buildProjectSnapshot` function
in `@dossipv/dossier-worker` that captures a project's full input data by value.

**Architecture:** The template file itself is generated once by a throwaway script (using the
`docx` library) and committed as a binary artifact — it is not regenerated at runtime.
`fillDossierTemplate` is a pure function (template buffer + data in, filled buffer out) using
`docxtemplater`+`pizzip`, the standard combination for templating an existing `.docx`.
`buildProjectSnapshot` is a separate, `@dossipv/db`-touching function capturing equipment by
value (not by reference), per the master spec's own explicit requirement.

**Tech Stack:** `docx` (one-time template authoring only), `docxtemplater`, `pizzip`,
`@dossipv/db`, `@dossipv/engine`, `@dossipv/dossier-worker`'s existing `placeholder-map.ts`.

**Spec:** `docs/superpowers/specs/2026-10-03-document-pipeline-design.md`

## Global Constraints

- `docxtemplater`'s core tag types (placeholder, loop `{#x}...{/x}`, condition
  `{#x}...{/x}` on a boolean) are free — confirmed during this plan's own research. Do not
  reach for a paid module (image-module, html-module) for anything in this slice's scope.
- The template-generation script (Task 1) is run ONCE to produce the committed `.docx` file —
  it is not part of the runtime fill path and is not wired into any package's `src/`; keep it
  in the package's own `scripts/` directory or delete it after running, per this task's own
  step, so nobody mistakes it for a live dependency.
- `docxtemplater`'s `.render(data)` is synchronous; `.toBuffer()` /
  `.getZip().generate({ type: 'nodebuffer' })` returns the output — do not wrap either in an
  unnecessary `Promise`/`await` beyond what the function signature already needs for file I/O
  elsewhere.
- Equipment in `buildProjectSnapshot` must be captured BY VALUE (the full related row's own
  fields embedded in the snapshot JSON), never just the foreign-key ID — this is the master
  spec's own explicit requirement ("the exact equipment records used (so later catalog edits
  never change an already-generated dossier)") and the whole reason this function exists
  rather than just storing the project's own ID.
- Prisma's `Decimal` fields (e.g. `Payment.amountTnd`-style fields, though none appear in this
  particular snapshot's own tables — check each table's schema directly rather than assuming)
  do not serialize to plain numbers via default `JSON.stringify`; any `Decimal` value reaching
  the snapshot must be explicitly converted (`.toString()` or `Number(...)`) before the
  snapshot is treated as JSON-safe.
- Reuse `@dossipv/dossier-worker`'s existing `PLACEHOLDER_DEFINITIONS`/`buildPlaceholderValues`
  for every numeric/computed value that already has a defined placeholder — never recompute
  the same figure a second time with different logic.

## Review Focus

- **A project missing an optional relation (e.g. no `dcFuse`, no `acIsolator` — both legitimately
  nullable per the schema) must not crash `buildProjectSnapshot` or `fillDossierTemplate`** —
  the snapshot's own shape already types these as nullable; the fill function's conditional
  logic (`dcFuseRequired`/`acIsolatorRequired`) must correctly render the "false" branch, not
  throw on a missing nested object it never needed to read in that branch.
- **A project with more than one inverter and more than one MPPT per inverter must render ALL
  of them in the loop, not just the first** — the master spec's own wording calls out
  "repeated blocks per inverter/MPPT/cable run" explicitly; a test with exactly one
  inverter/MPPT would not catch a bug where only `array[0]` is ever rendered.
- **The snapshot must round-trip through `JSON.stringify`/`JSON.parse` with no data loss** —
  this is the literal mechanism `DossierJob.inputSnapshot` (a `Json` column) will use; a field
  that silently becomes `null`, a string, or throws during this round-trip is a real bug this
  slice's own scope must catch, not defer to the (not-yet-built) job-orchestration step that
  will actually write this column.
- **French special characters (é, è, à, ç, œ, the U+202F narrow-no-break-space already used
  elsewhere in this codebase for French number formatting) must survive the `docxtemplater`
  fill unmangled** — a `.docx`'s XML is UTF-8, but an encoding mismatch anywhere in the
  pizzip/docxtemplater chain would corrupt exactly the kind of text this document is full of;
  a test must assert on a string containing at least one such character.
- **The template-generation script (Task 1) itself must never be imported or executed by any
  other package's runtime code** — it is a one-time authoring tool, and the plan's own Global
  Constraints section already names this risk; the review should confirm no `import` of that
  script file exists anywhere outside its own directory.

---

## Task 1: Author the `.docx` template

**Files:**
- Create: `packages/docx-template/scripts/generate-template.ts` (one-time authoring script)
- Create: `packages/docx-template/template/dossier-template.docx` (committed binary output)
- Create: `packages/docx-template/package.json`
- Create: `packages/docx-template/tsconfig.json`
- Modify: `tsconfig.json` (root) — add a reference to the new package

**Interfaces:**
- Produces: the committed `dossier-template.docx` file — consumed by Task 2's
  `fillDossierTemplate` (reads it from disk by its fixed path) and Task 3's tests.

- [ ] **Step 1: Scaffold the package**

```json
// packages/docx-template/package.json
{
  "name": "@dossipv/docx-template",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "generate-template": "tsx scripts/generate-template.ts"
  },
  "dependencies": {
    "docxtemplater": "^3.71.0",
    "pizzip": "^3.3.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "docx": "^9.8.1",
    "tsx": "^4.23.0"
  }
}
```

```json
// packages/docx-template/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Add `{ "path": "packages/docx-template" }` to the root `tsconfig.json`'s `references` array.

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: no errors.

- [ ] **Step 3: Write the template-generation script**

```ts
// packages/docx-template/scripts/generate-template.ts
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph(text)] });
}

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ text: '{companyName}', heading: HeadingLevel.TITLE }),
        new Paragraph('{companyAddress} — {companyPhone} — {companyEmail}'),
        new Paragraph({ text: 'Dossier technique BT', heading: HeadingLevel.HEADING_1 }),

        new Paragraph({ text: 'Client', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Nom : {clientFullName}'),
        new Paragraph('Adresse : {clientAddress}'),
        new Paragraph('Référence STEG : {clientStegReference}'),

        new Paragraph({ text: 'Introduction', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{introduction}'),

        new Paragraph({ text: 'Description de la solution', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{solution}'),
        new Paragraph('Module : {moduleBrandModel}'),
        new Paragraph('Onduleur : {inverterBrandModel}'),
        new Paragraph('Puissance DC : {pDcW} W'),
        new Paragraph('Nombre de modules : {moduleCount}'),

        new Paragraph({ text: 'Onduleurs et chaînes', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{#inverters}'),
        new Paragraph('{inverterLabel}'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [cell('MPPT'), cell('Chaînes en parallèle'), cell('Modules par chaîne')] }),
            new TableRow({ children: [cell('{#mppts}{mpptLabel}'), cell('{stringsInParallel}'), cell('{modulesPerString}{/mppts}')] }),
          ],
        }),
        new Paragraph('{/inverters}'),

        new Paragraph({ text: 'Câblage', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{cabling}'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [cell('Repère'), cell('Section (mm²)'), cell('Longueur (m)'), cell('Mode de pose')] }),
            new TableRow({
              children: [
                cell('{#cableRuns}{label}'),
                cell('{sectionMm2}'),
                cell('{lengthM}'),
                cell('{installMethod}{/cableRuns}'),
              ],
            }),
          ],
        }),

        new Paragraph({ text: 'Mise à la terre', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{earthing}'),

        new Paragraph({ text: 'Structure', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{structure}'),

        new Paragraph('{#dcFuseRequired}'),
        new Paragraph({ text: 'Protection DC — fusible', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Un fusible DC est requis pour cette configuration.'),
        new Paragraph('{/dcFuseRequired}'),

        new Paragraph('{#acIsolatorRequired}'),
        new Paragraph({ text: 'Protection AC — sectionneur', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Un sectionneur AC est requis (plusieurs onduleurs).'),
        new Paragraph('{/acIsolatorRequired}'),

        new Paragraph({ text: 'Conclusion', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{conclusion}'),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(join(import.meta.dirname, '..', 'template', 'dossier-template.docx'), buffer);
console.log('Template written to template/dossier-template.docx');
```

- [ ] **Step 4: Run the script to generate the template**

Run (from `packages/docx-template`): `mkdir -p template && npx tsx scripts/generate-template.ts`
Expected: `Template written to template/dossier-template.docx`, and the file exists with a
non-zero size (`ls -la template/dossier-template.docx`).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/docx-template/package.json packages/docx-template/tsconfig.json packages/docx-template/scripts/generate-template.ts packages/docx-template/template/dossier-template.docx tsconfig.json package-lock.json
git commit -m "feat(docx-template): author the initial dossier .docx template"
```

---

## Task 2: `fillDossierTemplate`

**Files:**
- Create: `packages/docx-template/src/types.ts`
- Create: `packages/docx-template/src/fill-template.ts`
- Create: `packages/docx-template/src/index.ts`
- Create: `packages/docx-template/test/fill-template.test.ts`

**Interfaces:**
- Consumes: the committed `template/dossier-template.docx` file (read from disk by a fixed
  relative path).
- Produces: `fillDossierTemplate(templateBuffer: Buffer, data: DossierTemplateData): Buffer`,
  `DossierTemplateData` — consumed by Task 4's snapshot/fill integration and by sub-project
  #8's own future slice 2 (PDF conversion, not built in this plan).

- [ ] **Step 1: Write the types**

```ts
// packages/docx-template/src/types.ts
export interface DossierTemplateData {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  clientFullName: string;
  clientAddress: string;
  clientStegReference: string;
  introduction: string;
  solution: string;
  cabling: string;
  earthing: string;
  structure: string;
  conclusion: string;
  moduleBrandModel: string;
  inverterBrandModel: string;
  pDcW: string;
  moduleCount: string;
  inverters: {
    inverterLabel: string;
    mppts: { mpptLabel: string; stringsInParallel: number; modulesPerString: number }[];
  }[];
  cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string }[];
  dcFuseRequired: boolean;
  acIsolatorRequired: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/docx-template/test/fill-template.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { fillDossierTemplate } from '../src/fill-template';
import type { DossierTemplateData } from '../src/types';

const templatePath = join(import.meta.dirname, '..', 'template', 'dossier-template.docx');
const templateBuffer = readFileSync(templatePath);

function extractText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml')!.asText();
  // Strip XML tags to get a plain-text approximation good enough to assert substring presence.
  return xml.replace(/<[^>]+>/g, '');
}

const baseData: DossierTemplateData = {
  companyName: 'SolarPro Tunisie',
  companyAddress: '12 Rue de la République, Tunis',
  companyPhone: '+216 71 000 000',
  companyEmail: 'contact@solarpro.tn',
  clientFullName: 'Ahmed Ben Ali',
  clientAddress: '45 Avenue Habib Bourguiba, Sousse',
  clientStegReference: 'STEG-2026-001',
  introduction: "Ce dossier présente l'installation photovoltaïque réalisée à l'adresse ci-dessus.",
  solution: 'La solution retenue utilise des modules à haute performance et un onduleur certifié.',
  cabling: 'Le câblage respecte la norme NF C 15-100.',
  earthing: 'La mise à la terre est assurée par un piquet de terre conforme.',
  structure: 'La structure est dimensionnée pour une vitesse de vent de 120 km/h.',
  conclusion: "L'installation est conforme aux exigences réglementaires en vigueur.",
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  pDcW: '3 100',
  moduleCount: '5',
  inverters: [
    {
      inverterLabel: 'Onduleur 1',
      mppts: [
        { mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 },
      ],
    },
  ],
  cableRuns: [
    { label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13' },
  ],
  dcFuseRequired: false,
  acIsolatorRequired: false,
};

describe('fillDossierTemplate', () => {
  it('fills the template with the given data and produces a valid, re-openable .docx', () => {
    const result = fillDossierTemplate(templateBuffer, baseData);

    expect(result.length).toBeGreaterThan(0);

    // Re-open the result the same way a real consumer would, proving it's a valid .docx —
    // this throws if the zip or document.xml is corrupted.
    const zip = new PizZip(result);
    expect(() => new Docxtemplater(zip)).not.toThrow();
  });

  it('substitutes plain-value tags, including French accented characters', () => {
    const result = fillDossierTemplate(templateBuffer, baseData);
    const text = extractText(result);

    expect(text).toContain('SolarPro Tunisie');
    expect(text).toContain('Ahmed Ben Ali');
    expect(text).toContain(baseData.introduction); // contains "présente", "l'installation" — real accented chars
  });

  it('renders every inverter and every MPPT in a multi-inverter, multi-MPPT project', () => {
    const multiData: DossierTemplateData = {
      ...baseData,
      inverters: [
        { inverterLabel: 'Onduleur 1', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 }, { mpptLabel: 'MPPT 2', stringsInParallel: 2, modulesPerString: 4 }] },
        { inverterLabel: 'Onduleur 2', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 6 }] },
      ],
    };

    const result = fillDossierTemplate(templateBuffer, multiData);
    const text = extractText(result);

    expect(text).toContain('Onduleur 1');
    expect(text).toContain('Onduleur 2');
    expect(text).toContain('MPPT 2');
  });

  it('renders the DC fuse section when dcFuseRequired is true, omits it when false', () => {
    const withFuse = extractText(fillDossierTemplate(templateBuffer, { ...baseData, dcFuseRequired: true }));
    const withoutFuse = extractText(fillDossierTemplate(templateBuffer, { ...baseData, dcFuseRequired: false }));

    expect(withFuse).toContain('fusible DC est requis');
    expect(withoutFuse).not.toContain('fusible DC est requis');
  });

  it('renders the AC isolator section when acIsolatorRequired is true, omits it when false', () => {
    const withIsolator = extractText(fillDossierTemplate(templateBuffer, { ...baseData, acIsolatorRequired: true }));
    const withoutIsolator = extractText(fillDossierTemplate(templateBuffer, { ...baseData, acIsolatorRequired: false }));

    expect(withIsolator).toContain('sectionneur AC est requis');
    expect(withoutIsolator).not.toContain('sectionneur AC est requis');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix packages/docx-template test`
Expected: FAIL — `Cannot find module '../src/fill-template'`.

- [ ] **Step 4: Implement `fill-template.ts`**

```ts
// packages/docx-template/src/fill-template.ts
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { DossierTemplateData } from './types';

export function fillDossierTemplate(templateBuffer: Buffer, data: DossierTemplateData): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  doc.render(data as unknown as Record<string, unknown>);

  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
}
```

```ts
// packages/docx-template/src/index.ts
export * from './types';
export * from './fill-template';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix packages/docx-template test`
Expected: PASS, all 5 tests green. If the table-based loop tags from Task 1's template don't
render correctly (a real, known risk with `docxtemplater` and table rows — loop start/end tags
split across table cells sometimes need the row itself wrapped, not just the cells), this is
the step where that surfaces: fix Task 1's template structure (e.g. move the `{#mppts}`/
`{/mppts}` tags to wrap the entire `TableRow`, not just span text within cells) rather than
abandoning the loop requirement — the master spec's own repeated-block requirement is not
optional. Re-run Task 1's generation script after any template-structure fix, and re-run this
step until genuinely green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/docx-template/src packages/docx-template/test
# If Task 1's template needed structural fixes per Step 5's note, include the regenerated
# template/dossier-template.docx in this commit too.
git commit -m "feat(docx-template): add fillDossierTemplate using docxtemplater"
```

---

## Task 3: `buildProjectSnapshot`

**Files:**
- Create: `packages/dossier-worker/src/build-snapshot.ts`
- Create: `packages/dossier-worker/test/build-snapshot.test.ts`

**Interfaces:**
- Consumes: `db` from `@dossipv/db`.
- Produces: `buildProjectSnapshot(projectId: string): Promise<ProjectSnapshot>`,
  `ProjectSnapshot` — not consumed by any other task in this plan (the as-yet-unbuilt job-
  orchestration step, outside this slice's scope, is this function's future real caller).

- [ ] **Step 1: Confirm the SSH tunnel to Postgres is active**

Run: `node -e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);}); s.setTimeout(3000,()=>{console.error('TUNNEL DOWN: timeout');process.exit(1);});"`
Expected: `tunnel alive`. If this session has been running a long time, re-check this even if
it passed earlier — the tunnel has been observed to drop mid-session more than once already.

- [ ] **Step 2: Check `packages/dossier-worker` has its own `.env`**

Run: `ls -la packages/dossier-worker/.env`
Expected: the file exists (it was created during sub-project #7's own Task 5, which first gave
this package a `@dossipv/db` dependency) — if missing, copy the same `DATABASE_URL` line from
`packages/auth/.env`, confirming `git check-ignore -q packages/dossier-worker/.env` first.

- [ ] **Step 3: Write the failing tests**

```ts
// packages/dossier-worker/test/build-snapshot.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@dossipv/db';
import { buildProjectSnapshot } from '../src/build-snapshot';

let companyId: string;
let projectId: string;

beforeEach(async () => {
  const company = await db.company.create({
    data: {
      name: 'Snapshot Test Co', address: 'Test address', phone: '+216 00 000 000',
      email: 'snapshot-test@example.com', legalRepFullName: 'Test Rep',
      anmeCode: 'SNAP-0001', anmeCategory: 'BT',
      anmeValidFrom: new Date('2024-01-01'), anmeValidTo: new Date('2030-01-01'),
    },
  });
  companyId = company.id;

  const pvModule = await db.pvModule.create({
    data: {
      brand: 'TestBrand', model: 'TestModule', pmaxW: 400, vmpV: 40, impA: 10, vocV: 48, iscA: 10.5,
      tempCoeffVocPct: -0.3, tempCoeffIscPct: 0.05, tempCoeffPmaxPct: -0.35, irmA: 15,
      maxSystemVoltageV: 1000, lengthMm: 2000, widthMm: 1000, weightKg: 22,
    },
  });
  const inverter = await db.inverter.create({
    data: { brand: 'TestInv', model: 'TestModel', phases: 1, pacW: 3000, sacVA: 3000, vdcMaxV: 500,
      mpptMinV: 80, mpptMaxV: 500, startUpV: 90, mpptCount: 1, inputsPerMppt: 2,
      idcMaxPerMpptA: 15, iscMaxPerMpptA: 18, vacNomV: 230, iacMaxA: 14 },
  });

  const project = await db.project.create({
    data: {
      companyId,
      tier: 'STANDARD',
      client: { create: { fullName: 'Snapshot Client', clientKind: 'INDIVIDUAL' } },
      site: { create: { gpsLat: 36.8, gpsLon: 10.1, gridType: 'BT', phases: 1, mountingType: 'ROOF', tiltDeg: 30 } },
      arrayConfig: {
        create: {
          moduleId: pvModule.id,
          inverters: { create: [{ inverterId: inverter.id, mppts: { create: [{ stringsInParallel: 1, modulesPerString: 5 }] } }] },
        },
      },
    },
  });
  projectId = project.id;
});

afterEach(async () => {
  const arrayConfig = await db.projectArrayConfig.findUnique({ where: { projectId }, include: { inverters: true } });
  if (arrayConfig) {
    for (const inv of arrayConfig.inverters) {
      await db.projectArrayMppt.deleteMany({ where: { arrayInverterId: inv.id } });
    }
    await db.projectArrayInverter.deleteMany({ where: { arrayConfigId: arrayConfig.id } });
    await db.projectArrayConfig.delete({ where: { id: arrayConfig.id } });
  }
  await db.projectSite.deleteMany({ where: { projectId } });
  await db.projectClient.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.pvModule.deleteMany({ where: { brand: 'TestBrand' } });
  await db.inverter.deleteMany({ where: { brand: 'TestInv' } });
  await db.company.delete({ where: { id: companyId } });
});

describe('buildProjectSnapshot', () => {
  it('captures the module and inverter by VALUE, not just by id', async () => {
    const snapshot = await buildProjectSnapshot(projectId);

    expect(snapshot.arrayConfig.module.brand).toBe('TestBrand');
    expect(snapshot.arrayConfig.module.pmaxW).toBe(400);
    expect(snapshot.arrayConfig.inverters[0]!.inverter.brand).toBe('TestInv');
  });

  it('round-trips losslessly through JSON.stringify/JSON.parse', async () => {
    const snapshot = await buildProjectSnapshot(projectId);

    const roundTripped = JSON.parse(JSON.stringify(snapshot));

    expect(roundTripped.arrayConfig.module.pmaxW).toBe(400);
    expect(roundTripped.client.fullName).toBe('Snapshot Client');
    expect(typeof roundTripped.capturedAt).toBe('string');
  });

  it('includes a capturedAt ISO timestamp close to now', async () => {
    const before = Date.now();
    const snapshot = await buildProjectSnapshot(projectId);
    const after = Date.now();

    const capturedAtMs = new Date(snapshot.capturedAt).getTime();
    expect(capturedAtMs).toBeGreaterThanOrEqual(before);
    expect(capturedAtMs).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm --prefix packages/dossier-worker test -- test/build-snapshot.test.ts`
Expected: FAIL — `Cannot find module '../src/build-snapshot'`.

- [ ] **Step 5: Implement `build-snapshot.ts`**

```ts
// packages/dossier-worker/src/build-snapshot.ts
import { db } from '@dossipv/db';

export async function buildProjectSnapshot(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      client: true,
      site: true,
      arrayConfig: {
        include: {
          module: true,
          inverters: { include: { inverter: true, mppts: true } },
        },
      },
      protections: {
        include: { dcSpd: true, dcSwitch: true, dcFuse: true, acBreaker: true, acSpd: true, acIsolator: true },
      },
      cablingConfig: true,
      cableRuns: true,
      structure: true,
      earthing: true,
    },
  });

  return {
    client: project.client,
    site: project.site,
    arrayConfig: project.arrayConfig,
    protections: project.protections,
    cablingConfig: project.cablingConfig,
    cableRuns: project.cableRuns,
    structure: project.structure,
    earthing: project.earthing,
    capturedAt: new Date().toISOString(),
  };
}

export type ProjectSnapshot = Awaited<ReturnType<typeof buildProjectSnapshot>>;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix packages/dossier-worker test -- test/build-snapshot.test.ts`
Expected: PASS, all 3 tests green. If the round-trip test fails because a field became `null`
or threw, this is a real finding (per this plan's own Global Constraints note on `Decimal`
fields) — check which field's actual Prisma type is the cause via the failing assertion's own
diff, and fix `buildProjectSnapshot` to explicitly convert that field (not loosen the test).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/dossier-worker/src/build-snapshot.ts packages/dossier-worker/test/build-snapshot.test.ts
git commit -m "feat(dossier-worker): add buildProjectSnapshot capturing equipment by value"
```

---

## Task 4: Whole-package review pass

**Files:** none new — this task re-reads everything Tasks 1-3 produced.

**Interfaces:** none new.

- [ ] **Step 1: Confirm no runtime code imports the template-generation script**

Run: `grep -rn "generate-template" packages/ apps/ --include="*.ts" | grep -v "scripts/generate-template.ts" | grep -v node_modules`
Expected: no matches — confirms this plan's own Review Focus item that the authoring script
stays a one-time tool, never a runtime dependency.

- [ ] **Step 2: Re-run the full workspace suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS.

- [ ] **Step 3: Confirm no stray verification artifact was committed**

Run: `git status --porcelain` — expect empty.

- [ ] **Step 4: Update project memory**

Update `C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
recording: the new `@dossipv/docx-template` package, the template's own functional structure
(which tags/loops/conditions exist), `buildProjectSnapshot`, and — critically — what remains
deferred to slice 2 (SVG drawings, LibreOffice PDF conversion, annex merging, save-to-history)
and why (no verified LibreOffice availability on the real server, no drawing-rendering design
decision made yet) — matching this file's established style of being explicit about partial
scope.

- [ ] **Step 5: Final commit if Steps 1-3 found anything to fix**

```bash
git add -A
git commit -m "fix(docx): close a gap found in the document pipeline slice 1's final review"
```

(Skip entirely if nothing was found.)
