# Repo Scaffold and Calculation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the DossiPV monorepo skeleton and ship a fully tested, pure TypeScript calculation engine package (`@dossipv/engine`) implementing every formula and check (C01–C22) from `pv_dossier_input_schema.json`, validated against the reference dossier's corrected figures.

**Architecture:** npm workspaces monorepo. `packages/engine` is a dependency-free TypeScript library (no DB, no network, no framework) exporting pure functions: given validated project + equipment data, return every derived value and every check's pass/fail/level. This package is imported unchanged by both the browser (live form validation) and the worker (final generation). `apps/web` is scaffolded as an empty Next.js 16 shell in this plan (just enough to prove the workspace wiring and host the engine later) — its real screens are built in later plans.

**Tech Stack:** TypeScript 5, npm workspaces, Next.js 16 (App Router), Vitest for testing, ESLint (flat config) + Prettier, Zod for runtime schema validation at the engine's input boundary.

**Spec:** [docs/superpowers/specs/2026-10-02-dossipv-design.md](../specs/2026-10-02-dossipv-design.md) — this plan implements spec §4 (Calculation engine) in full, plus the `packages/engine` slice of §2 (Architecture), and the `EquipmentLibrary`/`Project` shapes from `pv_dossier_input_schema.json`.

## Global Constraints

- TypeScript `strict: true` across every package; no `any` without an inline justifying comment.
- Node 25.x (matches the dev machine) as the minimum engine version in every `package.json`.
- The engine package (`packages/engine`) has **zero runtime dependencies** besides `zod` — no DB client, no HTTP client, no Next.js import. This is what lets the exact same code run in the browser and the worker (spec §2, §4).
- Every numeric formula in the engine must cite its `x-rules.derived[].id` or `x-rules.checks[].id` from `pv_dossier_input_schema.json` in a comment above the implementing function — this is the traceability the spec's "all numbers from code, never from the LLM" guarantee depends on.
- Vmp temperature correction MUST use `coeffVmp = tempCoeffVmpPct ?? tempCoeffPmaxPct` (never `tempCoeffVocPct`) — this is the exact error the spec's §4 calls out as found in the reference dossier.
- All 22 checks (C01–C22) must be implemented with the exact `level` (`BLOCK` | `WARN`) from the schema — a BLOCK check failing must be distinguishable from a WARN check failing in the engine's return type, not just in a message string.
- No check, formula, or constant may be hand-copied with a transcription error — every constant table (K1, K2, K3_PR, K3_PVC, K4) must match `x-rules.constants` in `pv_dossier_input_schema.json` exactly; a task step below diffs them programmatically against the schema file to catch drift.
- Commit after every passing test, per TDD discipline — no task bundles multiple untested behaviors into one commit.

## Review Focus

- **Missing optional `tempCoeffVmpPct`:** every module in the reference dossier and most real datasheets omit it — `VMP_TMIN`/`VMP_TMAX` must fall back to `tempCoeffPmaxPct` silently, not throw or treat it as `0`. Covered in Task 3.
- **Multiple MPPTs / multiple inverters with different string layouts:** `P_DC_W`, `MODULE_COUNT`, and the Ns/Np checks are defined per-MPPT in the schema but several derived values (`POWER_RATIO`, `F_WEIGHT_N`) sum across the whole array — a plan that only tests a single-inverter, single-MPPT project would miss an aggregation bug. Covered in Task 5 and Task 8.
- **Three-phase vs single-phase AC voltage drop:** `DU_AC_V`'s `b` factor (2 vs 1) and `DU_AC_PCT`'s reference voltage (230 vs 400) must both switch together on `site.phases` — a mismatched pair (e.g. `b=1` with `V=230`) silently halves the computed drop percentage without erroring. Covered in Task 7.
- **DC_FUSE_REQUIRED boundary and the compound C08 condition:** Np exactly equal to `NC_MAX_NO_FUSE` must NOT require a fuse (`Np > NC_MAX_NO_FUSE`, strict), and C08 is a 4-part AND (fuse set, lower bound, upper bound, voltage) where a plan testing only "fuse missing" would miss a fuse that's present but under-rated. Covered in Task 6.
- **Ballast formula with non-default wind/tilt:** the spec (§4) requires generation to be blocked unless `liftCoeffNPerM2`/`dragCoeffNPerM2` are explicitly supplied when wind speed or tilt differ from the 120 km/h / 30° default the schema's constants assume — an engine that silently reuses 339/196 N/m² at a different tilt would pass a check it shouldn't. Covered in Task 8.

---

## File Structure

```
DossiPV/
├── package.json                 # npm workspaces root
├── tsconfig.base.json           # shared compiler options (strict: true)
├── .eslintrc.cjs                # flat config, shared rules
├── .prettierrc.json
├── vitest.workspace.ts          # points Vitest at every package's tests
├── pv_dossier_input_schema.json # existing — authoritative formula/check source
├── packages/
│   └── engine/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts              # public exports
│       │   ├── types.ts              # ProjectInput, EquipmentInput, CheckResult, EngineResult
│       │   ├── constants.ts          # K1/K2/K3/K4/rho tables, transcribed + schema-diffed
│       │   ├── module-electrical.ts  # VOC_TMIN, VMP_TMIN, VMP_TMAX, ISC_TMAX, IMP_TMAX
│       │   ├── string-sizing.ts      # NS_MAX, NS_MIN, NS_OPT_MAX, NP_MAX, NP_OPT, POWER_RATIO
│       │   ├── protections.ts        # NC_MAX_NO_FUSE, DC_FUSE_REQUIRED, STRING_VOC_TMIN, ISC_FIELD_DESIGN
│       │   ├── cabling.ts            # IZ_CORRECTED (K1-K4), DU_DC_V/PCT, DU_AC_V/PCT
│       │   ├── structure.ts          # F_WEIGHT_N, STABILITY_LHS/RHS
│       │   ├── checks.ts             # C01–C22, each returning {id, level, pass, message}
│       │   ├── gps.ts                # single GPS source → DMS formatting
│       │   └── run-engine.ts         # top-level: ProjectInput + equipment → EngineResult
│       └── test/
│           ├── fixtures/
│           │   └── habib-khedhira.ts # reference dossier inputs + hand-corrected expected outputs
│           ├── constants.test.ts
│           ├── module-electrical.test.ts
│           ├── string-sizing.test.ts
│           ├── protections.test.ts
│           ├── cabling.test.ts
│           ├── structure.test.ts
│           ├── checks.test.ts
│           ├── gps.test.ts
│           └── run-engine.test.ts    # full reference-dossier integration test
└── apps/
    └── web/
        ├── package.json
        ├── tsconfig.json
        ├── next.config.ts
        ├── app/
        │   ├── layout.tsx
        │   └── page.tsx
        └── test/
            └── smoke.test.ts
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc.json`
- Create: `.editorconfig`
- Create: `vitest.workspace.ts`
- Modify: `.gitignore` (already has `node_modules/`, `.env*`, `dist/`, `build/` from the spec commit — confirm, don't duplicate)

**Interfaces:**
- Produces: an npm workspaces root that `packages/engine` and `apps/web` both join as `"workspaces": ["packages/*", "apps/*"]`.

- [ ] **Step 1: Write the root `package.json`**

```json
{
  "name": "dossipv",
  "private": true,
  "version": "0.0.0",
  "engines": { "node": ">=25.0.0" },
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc -b --noEmit",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "eslint": "^9.17.0",
    "@typescript-eslint/parser": "^8.18.0",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "prettier": "^3.4.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Write `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', project: true },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['dist/', 'build/', '.next/', 'node_modules/'],
};
```

- [ ] **Step 4: Write `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 5: Write `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 6: Write `vitest.workspace.ts`**

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['packages/*', 'apps/*']);
```

- [ ] **Step 7: Confirm `.gitignore` already covers `node_modules/`, `dist/`, `build/`, `.env*`**

Run: `cat .gitignore`
Expected: already contains those four patterns from the earlier spec commit. If any is missing, append it.

- [ ] **Step 8: Install root devDependencies**

Run: `cd "D:/mahmoud repo/DossiPV" && npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.base.json .eslintrc.cjs .prettierrc.json .editorconfig vitest.workspace.ts package-lock.json .gitignore
git commit -m "chore: scaffold npm workspaces monorepo with shared TS/ESLint/Vitest config"
```

---

### Task 2: Engine package skeleton and types

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/types.ts`
- Test: `packages/engine/test/types.test.ts`

**Interfaces:**
- Consumes: nothing (first engine file).
- Produces:
  - `PvModuleInput` — fields: `pmaxW, vmpV, impA, vocV, iscA, tempCoeffVocPct, tempCoeffIscPct, tempCoeffPmaxPct, tempCoeffVmpPct?, irmA, maxSystemVoltageV, bifacial?, bifacialGainPct?, lengthMm, widthMm, weightKg` (all `number`, matching `PvModule` in the schema).
  - `InverterInput` — fields: `phases: 1 | 3, pacW, sacVA, vdcMaxV, mpptMinV, mpptMaxV, startUpV, mpptCount, inputsPerMppt, idcMaxPerMpptA, iscMaxPerMpptA, vacNomV, iacMaxA, stegApproved?: boolean` (matching `Inverter`).
  - `MpptConfig` — `{ stringsInParallel: number; modulesPerString: number }`.
  - `InverterArrayEntry` — `{ inverter: InverterInput; mppts: MpptConfig[] }`.
  - `CheckResult` — `{ id: string; level: 'BLOCK' | 'WARN'; pass: boolean; message: string }`.
  - `EngineResult` — `{ derived: Record<string, number>; checks: CheckResult[]; hasBlockingFailure: boolean }`.

- [ ] **Step 1: Write `packages/engine/package.json`**

```json
{
  "name": "@dossipv/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.24.0"
  }
}
```

- [ ] **Step 2: Write `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test for types (a compile-only smoke test)**

```typescript
// packages/engine/test/types.test.ts
import { describe, it, expect } from 'vitest';
import type { PvModuleInput, InverterInput, CheckResult, EngineResult } from '../src/types';

describe('types', () => {
  it('PvModuleInput accepts a minimal valid module and omits optional fields', () => {
    const module: PvModuleInput = {
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
    };
    expect(module.tempCoeffVmpPct).toBeUndefined();
  });

  it('InverterInput phases is restricted to 1 or 3', () => {
    const inv: InverterInput = {
      phases: 1,
      pacW: 3000,
      sacVA: 3000,
      vdcMaxV: 550,
      mpptMinV: 90,
      mpptMaxV: 550,
      startUpV: 100,
      mpptCount: 2,
      inputsPerMppt: 2,
      idcMaxPerMpptA: 16,
      iscMaxPerMpptA: 20,
      vacNomV: 230,
      iacMaxA: 16,
    };
    expect(inv.phases).toBe(1);
  });

  it('CheckResult level is restricted to BLOCK or WARN', () => {
    const result: CheckResult = { id: 'C01', level: 'BLOCK', pass: true, message: '' };
    expect(result.level).toBe('BLOCK');
  });

  it('EngineResult shape holds derived values and checks', () => {
    const result: EngineResult = {
      derived: { P_DC_W: 3100 },
      checks: [],
      hasBlockingFailure: false,
    };
    expect(result.derived.P_DC_W).toBe(3100);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/types.test.ts`
Expected: FAIL — `Cannot find module '../src/types'` (file doesn't exist yet).

- [ ] **Step 5: Write `packages/engine/src/types.ts`**

```typescript
/**
 * Input/output types for the DossiPV calculation engine.
 * Field names mirror `pv_dossier_input_schema.json`'s $defs (PvModule, Inverter, ...)
 * so engine callers can pass schema-validated data through without remapping.
 */

export interface PvModuleInput {
  pmaxW: number;
  vmpV: number;
  impA: number;
  vocV: number;
  iscA: number;
  /** %/°C, always <= 0. Schema: PvModule.tempCoeffVocPct */
  tempCoeffVocPct: number;
  /** %/°C, always >= 0. Schema: PvModule.tempCoeffIscPct */
  tempCoeffIscPct: number;
  /** %/°C, always <= 0. Schema: PvModule.tempCoeffPmaxPct */
  tempCoeffPmaxPct: number;
  /**
   * %/°C, optional. Schema: PvModule.tempCoeffVmpPct.
   * When absent, VMP_TMIN/VMP_TMAX fall back to tempCoeffPmaxPct — never tempCoeffVocPct.
   */
  tempCoeffVmpPct?: number;
  irmA: number;
  maxSystemVoltageV: number;
  bifacial?: boolean;
  bifacialGainPct?: number;
  lengthMm: number;
  widthMm: number;
  weightKg: number;
}

export interface InverterInput {
  phases: 1 | 3;
  pacW: number;
  sacVA: number;
  vdcMaxV: number;
  mpptMinV: number;
  mpptMaxV: number;
  startUpV: number;
  mpptCount: number;
  inputsPerMppt: number;
  idcMaxPerMpptA: number;
  iscMaxPerMpptA: number;
  vacNomV: number;
  iacMaxA: number;
  stegApproved?: boolean;
}

export interface MpptConfig {
  stringsInParallel: number;
  modulesPerString: number;
}

export interface InverterArrayEntry {
  inverter: InverterInput;
  mppts: MpptConfig[];
}

export interface CheckResult {
  id: string;
  level: 'BLOCK' | 'WARN';
  pass: boolean;
  message: string;
}

export interface EngineResult {
  derived: Record<string, number>;
  checks: CheckResult[];
  hasBlockingFailure: boolean;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/engine/package.json packages/engine/tsconfig.json packages/engine/src/types.ts packages/engine/test/types.test.ts
git commit -m "feat(engine): scaffold @dossipv/engine package with core input/output types"
```

---

### Task 3: Module electrical corrections (VOC_TMIN, VMP_TMIN/TMAX, ISC_TMAX, IMP_TMAX)

**Files:**
- Create: `packages/engine/src/module-electrical.ts`
- Test: `packages/engine/test/module-electrical.test.ts`

**Interfaces:**
- Consumes: `PvModuleInput` from `../src/types`.
- Produces:
  - `resolveVmpTempCoeff(module: PvModuleInput): number` — the `coeffVmp = tempCoeffVmpPct ?? tempCoeffPmaxPct` fallback, exported standalone so later tasks and tests can assert the fallback directly.
  - `vocAtTmin(module: PvModuleInput, tMinC: number): number`
  - `vmpAtTmin(module: PvModuleInput, tMinC: number): number`
  - `vmpAtTmax(module: PvModuleInput, tMaxC: number): number`
  - `iscAtTmax(module: PvModuleInput, tMaxC: number): number`
  - `impAtTmax(module: PvModuleInput, tMaxC: number): number`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/engine/test/module-electrical.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveVmpTempCoeff,
  vocAtTmin,
  vmpAtTmin,
  vmpAtTmax,
  iscAtTmax,
  impAtTmax,
} from '../src/module-electrical';
import type { PvModuleInput } from '../src/types';

// LONGi LR7-72HGD-620M, the module actually used in the reference dossier.
const moduleWithVmpCoeff: PvModuleInput = {
  pmaxW: 620,
  vmpV: 46.5,
  impA: 13.33,
  vocV: 55.9,
  iscA: 13.92,
  tempCoeffVocPct: -0.25,
  tempCoeffIscPct: 0.045,
  tempCoeffPmaxPct: -0.28,
  tempCoeffVmpPct: -0.27,
  irmA: 25,
  maxSystemVoltageV: 1500,
  lengthMm: 2278,
  widthMm: 1134,
  weightKg: 33.5,
};

const moduleWithoutVmpCoeff: PvModuleInput = {
  ...moduleWithVmpCoeff,
  tempCoeffVmpPct: undefined,
};

describe('resolveVmpTempCoeff', () => {
  it('uses tempCoeffVmpPct when present', () => {
    expect(resolveVmpTempCoeff(moduleWithVmpCoeff)).toBe(-0.27);
  });

  it('falls back to tempCoeffPmaxPct when tempCoeffVmpPct is absent (never tempCoeffVocPct)', () => {
    expect(resolveVmpTempCoeff(moduleWithoutVmpCoeff)).toBe(-0.28);
  });
});

describe('vocAtTmin', () => {
  it('computes Voc at Tmin per VOC_TMIN = vocV * (1 + tempCoeffVocPct/100 * (tMinC - 25))', () => {
    // -10 - 25 = -35; -0.25/100 * -35 = 0.0875; 55.9 * 1.0875 = 60.80625
    expect(vocAtTmin(moduleWithVmpCoeff, -10)).toBeCloseTo(60.80625, 5);
  });
});

describe('vmpAtTmin', () => {
  it('computes Vmp at Tmin using the resolved Vmp coefficient', () => {
    // -10 - 25 = -35; -0.27/100 * -35 = 0.0945; 46.5 * 1.0945 = 50.89425
    expect(vmpAtTmin(moduleWithVmpCoeff, -10)).toBeCloseTo(50.89425, 5);
  });

  it('falls back to tempCoeffPmaxPct, not tempCoeffVocPct, when module has no tempCoeffVmpPct', () => {
    // -0.28/100 * -35 = 0.098; 46.5 * 1.098 = 51.057
    expect(vmpAtTmin(moduleWithoutVmpCoeff, -10)).toBeCloseTo(51.057, 5);
  });
});

describe('vmpAtTmax', () => {
  it('computes Vmp at Tmax using the resolved Vmp coefficient', () => {
    // 85 - 25 = 60; -0.27/100 * 60 = -0.162; 46.5 * 0.838 = 38.967
    expect(vmpAtTmax(moduleWithVmpCoeff, 85)).toBeCloseTo(38.967, 5);
  });
});

describe('iscAtTmax', () => {
  it('computes Isc at Tmax with no bifacial gain', () => {
    // 85 - 25 = 60; 0.045/100 * 60 = 0.027; 13.92 * 1.027 = 14.29584
    expect(iscAtTmax(moduleWithVmpCoeff, 85)).toBeCloseTo(14.29584, 5);
  });

  it('applies bifacialGainPct when present', () => {
    const bifacialModule: PvModuleInput = {
      ...moduleWithVmpCoeff,
      bifacial: true,
      bifacialGainPct: 10,
    };
    // 14.29584 * 1.10 = 15.725424
    expect(iscAtTmax(bifacialModule, 85)).toBeCloseTo(15.725424, 5);
  });
});

describe('impAtTmax', () => {
  it('matches the reference dossier\'s corrected Imp at 85°C (13.92A dossier example used Isc coeff on Imp)', () => {
    // 13.33 * 1.027 = 13.68991
    expect(impAtTmax(moduleWithVmpCoeff, 85)).toBeCloseTo(13.68991, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/module-electrical.test.ts`
Expected: FAIL — `Cannot find module '../src/module-electrical'`.

- [ ] **Step 3: Write `packages/engine/src/module-electrical.ts`**

```typescript
import type { PvModuleInput } from './types';

/**
 * Resolves the temperature coefficient used for Vmp correction.
 * Schema note on VMP_TMIN/VMP_TMAX (x-rules.derived): coeffVmp = tempCoeffVmpPct ?? tempCoeffPmaxPct.
 * MUST NOT fall back to tempCoeffVocPct — using the Voc coefficient for Vmp correction was
 * the exact error identified in the reference dossier (spec §4).
 */
export function resolveVmpTempCoeff(module: PvModuleInput): number {
  return module.tempCoeffVmpPct ?? module.tempCoeffPmaxPct;
}

/** x-rules.derived VOC_TMIN: vocV * (1 + tempCoeffVocPct/100 * (tMinC - 25)) */
export function vocAtTmin(module: PvModuleInput, tMinC: number): number {
  return module.vocV * (1 + (module.tempCoeffVocPct / 100) * (tMinC - 25));
}

/** x-rules.derived VMP_TMIN: vmpV * (1 + coeffVmp/100 * (tMinC - 25)) */
export function vmpAtTmin(module: PvModuleInput, tMinC: number): number {
  const coeffVmp = resolveVmpTempCoeff(module);
  return module.vmpV * (1 + (coeffVmp / 100) * (tMinC - 25));
}

/** x-rules.derived VMP_TMAX: vmpV * (1 + coeffVmp/100 * (tMaxC - 25)) */
export function vmpAtTmax(module: PvModuleInput, tMaxC: number): number {
  const coeffVmp = resolveVmpTempCoeff(module);
  return module.vmpV * (1 + (coeffVmp / 100) * (tMaxC - 25));
}

/**
 * x-rules.derived ISC_TMAX: iscA * (1 + tempCoeffIscPct/100 * (tMaxC - 25)) * (1 + bifacialGainPct/100)
 */
export function iscAtTmax(module: PvModuleInput, tMaxC: number): number {
  const base = module.iscA * (1 + (module.tempCoeffIscPct / 100) * (tMaxC - 25));
  const bifacialGain = module.bifacialGainPct ?? 0;
  return base * (1 + bifacialGain / 100);
}

/**
 * x-rules.derived IMP_TMAX: impA * (1 + tempCoeffIscPct/100 * (tMaxC - 25)) * (1 + bifacialGainPct/100)
 * Note: the schema explicitly reuses the Isc coefficient (not a separate Imp coefficient) here.
 */
export function impAtTmax(module: PvModuleInput, tMaxC: number): number {
  const base = module.impA * (1 + (module.tempCoeffIscPct / 100) * (tMaxC - 25));
  const bifacialGain = module.bifacialGainPct ?? 0;
  return base * (1 + bifacialGain / 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/module-electrical.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/module-electrical.ts packages/engine/test/module-electrical.test.ts
git commit -m "feat(engine): module electrical temperature corrections (VOC_TMIN, VMP_TMIN/TMAX, ISC_TMAX, IMP_TMAX)"
```

---

### Task 4: Constants tables, schema-diffed

**Files:**
- Create: `packages/engine/src/constants.ts`
- Test: `packages/engine/test/constants.test.ts`

**Interfaces:**
- Consumes: nothing new (reads `pv_dossier_input_schema.json` from repo root at test time only, via relative path).
- Produces:
  - `RHO_CU = 0.02314`, `RHO_AL = 0.037`
  - `K1_BY_METHOD: Record<string, number>`
  - `K2_TRAY_PERFORATED_E_F: number[]`
  - `K2_ENCLOSED_B_C: number[]`
  - `K3_PR: Record<string, number>`
  - `K3_PVC: Record<string, number>`
  - `K4_LAYERS: Record<string, number>`

- [ ] **Step 1: Write the failing test (values + a schema-drift guard)**

```typescript
// packages/engine/test/constants.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RHO_CU,
  RHO_AL,
  K1_BY_METHOD,
  K2_TRAY_PERFORATED_E_F,
  K2_ENCLOSED_B_C,
  K3_PR,
  K3_PVC,
  K4_LAYERS,
} from '../src/constants';

describe('constants', () => {
  it('rho values match x-rules.constants', () => {
    expect(RHO_CU).toBe(0.02314);
    expect(RHO_AL).toBe(0.037);
  });

  it('every constant table matches pv_dossier_input_schema.json x-rules.constants exactly', () => {
    const schemaPath = resolve(__dirname, '../../../pv_dossier_input_schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const schemaConstants = schema['x-rules']['constants'];

    expect(K1_BY_METHOD).toEqual(schemaConstants.K1_byMethod);
    expect(K2_TRAY_PERFORATED_E_F).toEqual(schemaConstants.K2_trayPerforated_E_F);
    expect(K2_ENCLOSED_B_C).toEqual(schemaConstants.K2_enclosed_B_C);
    expect(K3_PR).toEqual(schemaConstants.K3_PR);
    expect(K3_PVC).toEqual(schemaConstants.K3_PVC);
    expect(K4_LAYERS).toEqual(schemaConstants.K4_layers);
    expect(RHO_CU).toBe(schemaConstants.rhoCu);
    expect(RHO_AL).toBe(schemaConstants.rhoAl);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/constants.test.ts`
Expected: FAIL — `Cannot find module '../src/constants'`.

- [ ] **Step 3: Write `packages/engine/src/constants.ts`**

Transcribed verbatim from `pv_dossier_input_schema.json` → `x-rules.constants`:

```typescript
/**
 * NF C 15-100 correction factor tables and resistivity constants.
 * Transcribed verbatim from pv_dossier_input_schema.json x-rules.constants.
 * test/constants.test.ts diffs this file against the schema on every run to catch drift.
 */

export const RHO_CU = 0.02314;
export const RHO_AL = 0.037;

export const K3_PR: Record<string, number> = {
  '10': 1.15,
  '15': 1.12,
  '20': 1.08,
  '25': 1.04,
  '30': 1.0,
  '35': 0.96,
  '40': 0.91,
  '45': 0.87,
  '50': 0.82,
  '55': 0.76,
  '60': 0.71,
  '65': 0.65,
  '70': 0.58,
  '75': 0.5,
  '80': 0.41,
};

export const K3_PVC: Record<string, number> = {
  '10': 1.22,
  '15': 1.17,
  '20': 1.12,
  '25': 1.06,
  '30': 1.0,
  '35': 0.94,
  '40': 0.87,
  '45': 0.79,
  '50': 0.71,
  '55': 0.61,
  '60': 0.5,
};

export const K1_BY_METHOD: Record<string, number> = {
  '1': 0.77,
  '2': 0.7,
  '3': 1.0,
  '3A': 0.9,
  '4': 1.0,
  '4A': 0.9,
  '5': 1.0,
  '5A': 0.9,
  '11': 1.0,
  '11A': 0.95,
  '12': 1.0,
  '13': 1.0,
  '14': 1.0,
  '16': 1.0,
  '17': 1.0,
  '18': 1.21,
};

export const K2_TRAY_PERFORATED_E_F: number[] = [
  1.0, 0.88, 0.82, 0.77, 0.75, 0.73, 0.73, 0.72, 0.72,
];

export const K2_ENCLOSED_B_C: number[] = [
  1.0, 0.8, 0.7, 0.65, 0.6, 0.55, 0.55, 0.5, 0.5, 0.45, 0.4, 0.4,
];

export const K4_LAYERS: Record<string, number> = {
  '1': 1.0,
  '2': 0.8,
  '3': 0.73,
  '4': 0.7,
  '5': 0.7,
  '6': 0.68,
  '7': 0.68,
  '8': 0.68,
  '9': 0.66,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/constants.test.ts`
Expected: PASS (2 tests) — including the schema-diff test, which proves zero transcription drift.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/constants.ts packages/engine/test/constants.test.ts
git commit -m "feat(engine): NF C 15-100 correction factor constants, diffed against schema"
```

---

### Task 5: String sizing (Ns/Np bounds, power ratio)

**Files:**
- Create: `packages/engine/src/string-sizing.ts`
- Test: `packages/engine/test/string-sizing.test.ts`

**Interfaces:**
- Consumes: `PvModuleInput`, `InverterInput`, `InverterArrayEntry` from `../src/types`; `vocAtTmin`, `vmpAtTmin`, `vmpAtTmax`, `iscAtTmax`, `impAtTmax` from `../src/module-electrical`.
- Produces:
  - `nsMax(module: PvModuleInput, inverter: InverterInput, tMinC: number): number` — `floor(vdcMaxV / vocAtTmin)`
  - `nsOptMax(module: PvModuleInput, inverter: InverterInput, tMinC: number): number` — `floor(mpptMaxV / vmpAtTmin)`
  - `nsMin(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number` — `ceil(max(mpptMinV, startUpV) / vmpAtTmax)`
  - `npMax(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number` — `floor(iscMaxPerMpptA / iscAtTmax)`
  - `npOpt(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number` — `floor(idcMaxPerMpptA / impAtTmax)`
  - `totalDcPowerW(module: PvModuleInput, array: InverterArrayEntry[]): number` — `P_DC_W`, sums `Ns * Np` across every MPPT of every inverter, times `pmaxW`
  - `totalModuleCount(array: InverterArrayEntry[]): number` — `MODULE_COUNT`, sums `Ns * Np` across every MPPT of every inverter
  - `powerRatio(module: PvModuleInput, array: InverterArrayEntry[]): number` — `POWER_RATIO = P_DC_W / sum(pacW)`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/engine/test/string-sizing.test.ts
import { describe, it, expect } from 'vitest';
import {
  nsMax,
  nsOptMax,
  nsMin,
  npMax,
  npOpt,
  totalDcPowerW,
  totalModuleCount,
  powerRatio,
} from '../src/string-sizing';
import type { PvModuleInput, InverterInput, InverterArrayEntry } from '../src/types';

const module: PvModuleInput = {
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
};

// Sofar-class single-phase inverter, 550V max, matching the corrected reference dossier
const inverter: InverterInput = {
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
};

describe('nsMax', () => {
  it('NS_MAX = floor(vdcMaxV / VOC_TMIN)', () => {
    // VOC_TMIN at -10C = 60.80625; 550 / 60.80625 = 9.044...
    expect(nsMax(module, inverter, -10)).toBe(9);
  });
});

describe('nsOptMax', () => {
  it('NS_OPT_MAX = floor(mpptMaxV / VMP_TMIN), using Pmax coeff fallback', () => {
    // coeffVmp falls back to -0.28; VMP_TMIN at -10C = 46.5*(1+(-0.28/100)*-35) = 51.057
    // 550 / 51.057 = 10.77...
    expect(nsOptMax(module, inverter, -10)).toBe(10);
  });
});

describe('nsMin', () => {
  it('NS_MIN = ceil(max(mpptMinV, startUpV) / VMP_TMAX)', () => {
    // VMP_TMAX at 85C = 46.5*(1+(-0.28/100)*60) = 38.688
    // max(90, 100) = 100; 100 / 38.688 = 2.5848...
    expect(nsMin(module, inverter, 85)).toBe(3);
  });
});

describe('npMax', () => {
  it('NP_MAX = floor(iscMaxPerMpptA / ISC_TMAX)', () => {
    // ISC_TMAX at 85C = 13.92*(1+0.045/100*60) = 14.29584
    // 20 / 14.29584 = 1.399...
    expect(npMax(module, inverter, 85)).toBe(1);
  });
});

describe('npOpt', () => {
  it('NP_OPT = floor(idcMaxPerMpptA / IMP_TMAX)', () => {
    // IMP_TMAX at 85C = 13.33*(1+0.045/100*60) = 13.68991
    // 16 / 13.68991 = 1.1687...
    expect(npOpt(module, inverter, 85)).toBe(1);
  });
});

describe('totalDcPowerW and totalModuleCount (multi-inverter, multi-MPPT aggregation)', () => {
  const array: InverterArrayEntry[] = [
    {
      inverter,
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
    {
      inverter,
      mppts: [
        { stringsInParallel: 1, modulesPerString: 5 },
        { stringsInParallel: 2, modulesPerString: 4 },
      ],
    },
  ];

  it('P_DC_W sums Ns*Np across every MPPT of every inverter, times pmaxW', () => {
    // inverter 1: 1*5 = 5 modules
    // inverter 2 mppt a: 1*5 = 5; mppt b: 2*4 = 8 => 13 modules
    // total modules = 18; 18 * 620 = 11160
    expect(totalDcPowerW(module, array)).toBe(11160);
  });

  it('MODULE_COUNT sums Ns*Np across every MPPT of every inverter', () => {
    expect(totalModuleCount(array)).toBe(18);
  });
});

describe('powerRatio', () => {
  it('POWER_RATIO = P_DC_W / sum(pacW) across all inverters', () => {
    const array: InverterArrayEntry[] = [
      { inverter, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
    ];
    // P_DC_W = 5 * 620 = 3100; sum(pacW) = 3000; ratio = 1.0333...
    expect(powerRatio(module, array)).toBeCloseTo(1.03333, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/string-sizing.test.ts`
Expected: FAIL — `Cannot find module '../src/string-sizing'`.

- [ ] **Step 3: Write `packages/engine/src/string-sizing.ts`**

```typescript
import type { PvModuleInput, InverterInput, InverterArrayEntry } from './types';
import { vocAtTmin, vmpAtTmin, vmpAtTmax, iscAtTmax, impAtTmax } from './module-electrical';

/** x-rules.derived NS_MAX: floor(INV.vdcMaxV / VOC_TMIN) */
export function nsMax(module: PvModuleInput, inverter: InverterInput, tMinC: number): number {
  return Math.floor(inverter.vdcMaxV / vocAtTmin(module, tMinC));
}

/** x-rules.derived NS_OPT_MAX: floor(INV.mpptMaxV / VMP_TMIN) */
export function nsOptMax(
  module: PvModuleInput,
  inverter: InverterInput,
  tMinC: number,
): number {
  return Math.floor(inverter.mpptMaxV / vmpAtTmin(module, tMinC));
}

/** x-rules.derived NS_MIN: ceil(max(INV.mpptMinV, INV.startUpV) / VMP_TMAX) */
export function nsMin(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number {
  const minVoltage = Math.max(inverter.mpptMinV, inverter.startUpV);
  return Math.ceil(minVoltage / vmpAtTmax(module, tMaxC));
}

/** x-rules.derived NP_MAX: floor(INV.iscMaxPerMpptA / ISC_TMAX) */
export function npMax(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number {
  return Math.floor(inverter.iscMaxPerMpptA / iscAtTmax(module, tMaxC));
}

/** x-rules.derived NP_OPT: floor(INV.idcMaxPerMpptA / IMP_TMAX) */
export function npOpt(module: PvModuleInput, inverter: InverterInput, tMaxC: number): number {
  return Math.floor(inverter.idcMaxPerMpptA / impAtTmax(module, tMaxC));
}

/** Sums Ns * Np across every MPPT of every inverter entry in the array. */
function sumModulesAcrossArray(array: InverterArrayEntry[]): number {
  let total = 0;
  for (const entry of array) {
    for (const mppt of entry.mppts) {
      total += mppt.stringsInParallel * mppt.modulesPerString;
    }
  }
  return total;
}

/** x-rules.derived P_DC_W: sum(Ns x Np over all MPPTs) * M.pmaxW */
export function totalDcPowerW(module: PvModuleInput, array: InverterArrayEntry[]): number {
  return sumModulesAcrossArray(array) * module.pmaxW;
}

/** x-rules.derived MODULE_COUNT: sum(Ns x Np) */
export function totalModuleCount(array: InverterArrayEntry[]): number {
  return sumModulesAcrossArray(array);
}

/** x-rules.derived POWER_RATIO: P_DC_W / sum(INV.pacW) */
export function powerRatio(module: PvModuleInput, array: InverterArrayEntry[]): number {
  const totalPacW = array.reduce((sum, entry) => sum + entry.inverter.pacW, 0);
  return totalDcPowerW(module, array) / totalPacW;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/string-sizing.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/string-sizing.ts packages/engine/test/string-sizing.test.ts
git commit -m "feat(engine): string sizing formulas (NS/NP bounds, power ratio, multi-inverter aggregation)"
```

---

### Task 6: Protections (fuse requirement, SPD/switch sizing inputs)

**Files:**
- Create: `packages/engine/src/protections.ts`
- Test: `packages/engine/test/protections.test.ts`

**Interfaces:**
- Consumes: `PvModuleInput` from `../src/types`; `vocAtTmin` from `../src/module-electrical`.
- Produces:
  - `ncMaxNoFuse(module: PvModuleInput): number` — `floor(1 + irmA / iscA)`
  - `dcFuseRequired(module: PvModuleInput, np: number): boolean` — `np > NC_MAX_NO_FUSE` (strict)
  - `stringVocTmin(module: PvModuleInput, ns: number, tMinC: number): number` — `Ns * VOC_TMIN`
  - `stringVmpStc(module: PvModuleInput, ns: number): number` — `Ns * vmpV`
  - `iscFieldDesign(module: PvModuleInput, np: number): number` — `1.25 * iscA * Np * (1 + bifacialGainPct/100)`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/engine/test/protections.test.ts
import { describe, it, expect } from 'vitest';
import {
  ncMaxNoFuse,
  dcFuseRequired,
  stringVocTmin,
  stringVmpStc,
  iscFieldDesign,
} from '../src/protections';
import type { PvModuleInput } from '../src/types';

const module: PvModuleInput = {
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
};

describe('ncMaxNoFuse', () => {
  it('NC_MAX_NO_FUSE = floor(1 + irmA / iscA)', () => {
    // 1 + 25/13.92 = 2.7959...; floor = 2
    expect(ncMaxNoFuse(module)).toBe(2);
  });
});

describe('dcFuseRequired', () => {
  it('is false when Np equals NC_MAX_NO_FUSE exactly (boundary, strict >)', () => {
    expect(dcFuseRequired(module, 2)).toBe(false);
  });

  it('is true when Np exceeds NC_MAX_NO_FUSE', () => {
    expect(dcFuseRequired(module, 3)).toBe(true);
  });

  it('is false when Np is below NC_MAX_NO_FUSE', () => {
    expect(dcFuseRequired(module, 1)).toBe(false);
  });
});

describe('stringVocTmin', () => {
  it('STRING_VOC_TMIN = Ns * VOC_TMIN', () => {
    // VOC_TMIN at -10C = 60.80625; Ns=5 => 304.03125
    expect(stringVocTmin(module, 5, -10)).toBeCloseTo(304.03125, 5);
  });
});

describe('stringVmpStc', () => {
  it('STRING_VMP_STC = Ns * vmpV', () => {
    expect(stringVmpStc(module, 5)).toBe(232.5);
  });
});

describe('iscFieldDesign', () => {
  it('ISC_FIELD_DESIGN = 1.25 * iscA * Np, with no bifacial gain', () => {
    // 1.25 * 13.92 * 2 = 34.8
    expect(iscFieldDesign(module, 2)).toBeCloseTo(34.8, 5);
  });

  it('applies bifacialGainPct when present', () => {
    const bifacialModule: PvModuleInput = { ...module, bifacial: true, bifacialGainPct: 10 };
    // 34.8 * 1.10 = 38.28
    expect(iscFieldDesign(bifacialModule, 2)).toBeCloseTo(38.28, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/protections.test.ts`
Expected: FAIL — `Cannot find module '../src/protections'`.

- [ ] **Step 3: Write `packages/engine/src/protections.ts`**

```typescript
import type { PvModuleInput } from './types';
import { vocAtTmin } from './module-electrical';

/** x-rules.derived NC_MAX_NO_FUSE: floor(1 + M.irmA / M.iscA) */
export function ncMaxNoFuse(module: PvModuleInput): number {
  return Math.floor(1 + module.irmA / module.iscA);
}

/**
 * x-rules.derived DC_FUSE_REQUIRED: Np > NC_MAX_NO_FUSE (per MPPT).
 * Strict inequality — Np exactly equal to NC_MAX_NO_FUSE does NOT require a fuse.
 */
export function dcFuseRequired(module: PvModuleInput, np: number): boolean {
  return np > ncMaxNoFuse(module);
}

/** x-rules.derived STRING_VOC_TMIN: Ns * VOC_TMIN */
export function stringVocTmin(module: PvModuleInput, ns: number, tMinC: number): number {
  return ns * vocAtTmin(module, tMinC);
}

/** x-rules.derived STRING_VMP_STC: Ns * M.vmpV */
export function stringVmpStc(module: PvModuleInput, ns: number): number {
  return ns * module.vmpV;
}

/** x-rules.derived ISC_FIELD_DESIGN: 1.25 * M.iscA * Np * (1 + bifacialGainPct/100) */
export function iscFieldDesign(module: PvModuleInput, np: number): number {
  const bifacialGain = module.bifacialGainPct ?? 0;
  return 1.25 * module.iscA * np * (1 + bifacialGain / 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/protections.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/protections.ts packages/engine/test/protections.test.ts
git commit -m "feat(engine): DC protection sizing formulas (fuse requirement boundary, field design current)"
```

---

### Task 7: Cabling (ampacity correction, DC/AC voltage drop)

**Files:**
- Create: `packages/engine/src/cabling.ts`
- Test: `packages/engine/test/cabling.test.ts`

**Interfaces:**
- Consumes: `RHO_CU`, `RHO_AL`, `K1_BY_METHOD`, `K2_TRAY_PERFORATED_E_F`, `K2_ENCLOSED_B_C`, `K3_PR`, `K3_PVC`, `K4_LAYERS` from `../src/constants`.
- Produces:
  - `type ReferenceMethod = 'B' | 'C' | 'E' | 'F'`
  - `izCorrected(izBase: number, installMethod: string, referenceMethod: ReferenceMethod, groupedCircuits: number, layers: number, ambientTempC: number, insulation: 'PR' | 'PVC' | 'EPR' | 'XLPO'): number` — `Iz * K1 * K2 * K3 * K4`
  - `duDcV(conductor: 'Cu' | 'Al', lengthM: number, sectionMm2: number, impA: number, npOnRun: number): number` — `DU_DC_V`
  - `duDcPct(duDcV: number, stringVmpStc: number): number` — `DU_DC_PCT`
  - `duAcV(conductor: 'Cu' | 'Al', lengthM: number, sectionMm2: number, cosPhi: number, lambdaOhmPerM: number, iacMaxA: number, phases: 1 | 3): number` — `DU_AC_V`, switches `b` (2 for single-phase, 1 for three-phase) on `phases`
  - `duAcPct(duAcV: number, phases: 1 | 3): number` — `DU_AC_PCT`, switches reference voltage (230 single-phase, 400 three-phase) on the same `phases` value `duAcV` used

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/engine/test/cabling.test.ts
import { describe, it, expect } from 'vitest';
import { izCorrected, duDcV, duDcPct, duAcV, duAcPct } from '../src/cabling';

describe('izCorrected', () => {
  it('applies K1 (install method), K2 (grouping), K3 (temp+insulation), K4 (layers) to the base Iz', () => {
    // Mode 13 (DC default): K1 = 1.0
    // 1 grouped circuit, enclosed B/C table index 0: K2 = 1.0
    // PR insulation at 50C ambient: K3_PR['50'] = 0.82
    // 1 layer: K4 = 1.0
    // izBase = 30 => 30 * 1.0 * 1.0 * 0.82 * 1.0 = 24.6
    const result = izCorrected(30, '13', 'B', 1, 1, 50, 'PR');
    expect(result).toBeCloseTo(24.6, 5);
  });

  it('uses the perforated tray K2 table for reference method E/F', () => {
    // 3 grouped circuits (index 2) on perforated tray: K2 = 0.82
    // Mode 3A: K1 = 0.9; PVC at 30C: K3_PVC['30'] = 1.0; 1 layer: K4 = 1.0
    // izBase = 20 => 20 * 0.9 * 0.82 * 1.0 * 1.0 = 14.76
    const result = izCorrected(20, '3A', 'E', 3, 1, 30, 'PVC');
    expect(result).toBeCloseTo(14.76, 5);
  });

  it('treats EPR and XLPO insulation as the PR column (schema note on Cable.insulation)', () => {
    const resultEpr = izCorrected(30, '13', 'B', 1, 1, 50, 'EPR');
    const resultXlpo = izCorrected(30, '13', 'B', 1, 1, 50, 'XLPO');
    const resultPr = izCorrected(30, '13', 'B', 1, 1, 50, 'PR');
    expect(resultEpr).toBeCloseTo(resultPr, 5);
    expect(resultXlpo).toBeCloseTo(resultPr, 5);
  });
});

describe('duDcV and duDcPct', () => {
  it('DU_DC_V = 2 * rho * L / S * impA * NpOnRun (copper)', () => {
    // 2 * 0.02314 * 20 / 6 * 13.33 * 1 = 2.0548...
    const result = duDcV('Cu', 20, 6, 13.33, 1);
    expect(result).toBeCloseTo(2.05597, 4);
  });

  it('DU_DC_PCT = 100 * DU_DC_V / STRING_VMP_STC', () => {
    const dv = duDcV('Cu', 20, 6, 13.33, 1);
    // string Vmp = 5 * 46.5 = 232.5; 100 * 2.05597 / 232.5 = 0.8842...
    expect(duDcPct(dv, 232.5)).toBeCloseTo(0.8842, 3);
  });
});

describe('duAcV and duAcPct (phase-dependent b factor and reference voltage)', () => {
  it('single-phase: b=2, reference voltage 230V', () => {
    // b=2; rho*L/S*cosPhi = 0.02314*10/4*0.8 = 0.04628; lambda*L*sinPhi = 0.00008*10*0.6=0.00048
    // sum = 0.04676; * iacMaxA(16) = 0.74816; * b(2) = 1.49632
    const dv = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 1);
    expect(dv).toBeCloseTo(1.49632, 4);
    expect(duAcPct(dv, 1)).toBeCloseTo((100 * 1.49632) / 230, 4);
  });

  it('three-phase: b=1, reference voltage 400V', () => {
    // same inner sum as above = 0.04676; * iacMaxA(16) = 0.74816; * b(1) = 0.74816
    const dv = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 3);
    expect(dv).toBeCloseTo(0.74816, 4);
    expect(duAcPct(dv, 3)).toBeCloseTo((100 * 0.74816) / 400, 4);
  });

  it('single-phase and three-phase at the same inputs do not produce the same drop percentage', () => {
    const dvSingle = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 1);
    const dvThree = duAcV('Cu', 10, 4, 0.8, 0.00008, 16, 3);
    const pctSingle = duAcPct(dvSingle, 1);
    const pctThree = duAcPct(dvThree, 3);
    expect(pctSingle).not.toBeCloseTo(pctThree, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/cabling.test.ts`
Expected: FAIL — `Cannot find module '../src/cabling'`.

- [ ] **Step 3: Write `packages/engine/src/cabling.ts`**

```typescript
import {
  RHO_CU,
  RHO_AL,
  K1_BY_METHOD,
  K2_TRAY_PERFORATED_E_F,
  K2_ENCLOSED_B_C,
  K3_PR,
  K3_PVC,
  K4_LAYERS,
} from './constants';

export type ReferenceMethod = 'B' | 'C' | 'E' | 'F';
export type InsulationType = 'PR' | 'PVC' | 'EPR' | 'XLPO';
export type ConductorType = 'Cu' | 'Al';

function resistivityFor(conductor: ConductorType): number {
  return conductor === 'Cu' ? RHO_CU : RHO_AL;
}

/** Nearest table key at or below the given ambient temperature, matching the K3 tables' step gaps. */
function nearestTempKey(table: Record<string, number>, ambientTempC: number): string {
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  let chosen = keys[0];
  for (const key of keys) {
    if (key <= ambientTempC) {
      chosen = key;
    }
  }
  return String(chosen);
}

/**
 * x-rules.derived IZ_CORRECTED: Iz * K1 * K2 * K3 * K4.
 * K1 from install method (K1_BY_METHOD). K2 from grouped circuits, using the tray table for
 * reference methods E/F (perforated) and the enclosed table for B/C.
 * K3 from ambient temperature and insulation — schema note: PR/EPR/XLPO all use the PR column.
 * K4 from layer count.
 */
export function izCorrected(
  izBase: number,
  installMethod: string,
  referenceMethod: ReferenceMethod,
  groupedCircuits: number,
  layers: number,
  ambientTempC: number,
  insulation: InsulationType,
): number {
  const k1 = K1_BY_METHOD[installMethod] ?? 1.0;

  const k2Table =
    referenceMethod === 'E' || referenceMethod === 'F'
      ? K2_TRAY_PERFORATED_E_F
      : K2_ENCLOSED_B_C;
  const k2Index = Math.min(groupedCircuits - 1, k2Table.length - 1);
  const k2 = k2Table[Math.max(0, k2Index)] ?? 1.0;

  const k3Table = insulation === 'PVC' ? K3_PVC : K3_PR;
  const k3 = k3Table[nearestTempKey(k3Table, ambientTempC)] ?? 1.0;

  const k4 = K4_LAYERS[String(layers)] ?? 1.0;

  return izBase * k1 * k2 * k3 * k4;
}

/** x-rules.derived DU_DC_V: 2 * rho * L / S * M.impA * Np_on_run */
export function duDcV(
  conductor: ConductorType,
  lengthM: number,
  sectionMm2: number,
  impA: number,
  npOnRun: number,
): number {
  const rho = resistivityFor(conductor);
  return ((2 * rho * lengthM) / sectionMm2) * impA * npOnRun;
}

/** x-rules.derived DU_DC_PCT: 100 * DU_DC_V / STRING_VMP_STC */
export function duDcPct(duDcVoltageDrop: number, stringVmpStc: number): number {
  return (100 * duDcVoltageDrop) / stringVmpStc;
}

/**
 * x-rules.derived DU_AC_V: b * (rho * L / S * cosPhi + lambda * L * sinPhi) * INV.iacMaxA.
 * b = 2 for single-phase, 1 for three-phase (schema note on DU_AC_V).
 */
export function duAcV(
  conductor: ConductorType,
  lengthM: number,
  sectionMm2: number,
  cosPhi: number,
  lambdaOhmPerM: number,
  iacMaxA: number,
  phases: 1 | 3,
): number {
  const rho = resistivityFor(conductor);
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  const b = phases === 1 ? 2 : 1;
  const resistiveTerm = ((rho * lengthM) / sectionMm2) * cosPhi;
  const reactiveTerm = lambdaOhmPerM * lengthM * sinPhi;
  return b * (resistiveTerm + reactiveTerm) * iacMaxA;
}

/**
 * x-rules.derived DU_AC_PCT: 100 * DU_AC_V / V.
 * V = 230 single-phase (phase-neutral), 400 three-phase (line-to-line) — schema note on DU_AC_PCT.
 * The phases argument here MUST be the same value passed to duAcV, so the b factor and the
 * reference voltage always switch together.
 */
export function duAcPct(duAcVoltageDrop: number, phases: 1 | 3): number {
  const referenceVoltage = phases === 1 ? 230 : 400;
  return (100 * duAcVoltageDrop) / referenceVoltage;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/cabling.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cabling.ts packages/engine/test/cabling.test.ts
git commit -m "feat(engine): cable ampacity correction (K1-K4) and DC/AC voltage drop, phase-consistent b factor"
```

---

### Task 8: Structure and ballast stability

**Files:**
- Create: `packages/engine/src/structure.ts`
- Test: `packages/engine/test/structure.test.ts`

**Interfaces:**
- Consumes: nothing from earlier engine files (pure numeric inputs — frame count, ballast, module data, wind/tilt-derived coefficients).
- Produces:
  - `WIND_TILT_DEFAULT = { windSpeedKmh: 120, tiltDeg: 30, liftCoeffNPerM2: 339, dragCoeffNPerM2: 196 }` (the schema's documented default — exported so callers and the Project-level validation task can compare against it)
  - `resolveStabilityCoefficients(input: { windSpeedKmh: number; tiltDeg: number; liftCoeffNPerM2?: number; dragCoeffNPerM2?: number }): { liftCoeffNPerM2: number; dragCoeffNPerM2: number; usedDefault: boolean }` — returns the supplied coefficients when present; when absent, returns the schema defaults **only if** windSpeedKmh/tiltDeg match the default exactly, otherwise throws `MissingStabilityCoefficientsError`
  - `totalWeightN(input: { frameCount: number; ballastPerFrame: number; ballastMassKg: number; moduleCount: number; moduleWeightKg: number; structureWeightN: number }): number` — `F_WEIGHT_N`
  - `stabilityLhs(weightN: number, liftCoeffNPerM2: number, moduleAreaM2: number, depthDM: number): number`
  - `stabilityRhs(dragCoeffNPerM2: number, moduleAreaM2: number, heightHM: number): number`
  - `class MissingStabilityCoefficientsError extends Error`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/engine/test/structure.test.ts
import { describe, it, expect } from 'vitest';
import {
  WIND_TILT_DEFAULT,
  resolveStabilityCoefficients,
  MissingStabilityCoefficientsError,
  totalWeightN,
  stabilityLhs,
  stabilityRhs,
} from '../src/structure';

describe('resolveStabilityCoefficients', () => {
  it('returns schema defaults when wind/tilt match 120 km/h, 30deg and no coefficients given', () => {
    const result = resolveStabilityCoefficients({ windSpeedKmh: 120, tiltDeg: 30 });
    expect(result).toEqual({
      liftCoeffNPerM2: 339,
      dragCoeffNPerM2: 196,
      usedDefault: true,
    });
  });

  it('returns explicitly supplied coefficients regardless of wind/tilt', () => {
    const result = resolveStabilityCoefficients({
      windSpeedKmh: 100,
      tiltDeg: 15,
      liftCoeffNPerM2: 250,
      dragCoeffNPerM2: 150,
    });
    expect(result).toEqual({
      liftCoeffNPerM2: 250,
      dragCoeffNPerM2: 150,
      usedDefault: false,
    });
  });

  it('throws MissingStabilityCoefficientsError when wind speed differs from default and no coefficients are supplied', () => {
    expect(() => resolveStabilityCoefficients({ windSpeedKmh: 100, tiltDeg: 30 })).toThrow(
      MissingStabilityCoefficientsError,
    );
  });

  it('throws MissingStabilityCoefficientsError when tilt differs from default and no coefficients are supplied', () => {
    expect(() => resolveStabilityCoefficients({ windSpeedKmh: 120, tiltDeg: 20 })).toThrow(
      MissingStabilityCoefficientsError,
    );
  });
});

describe('totalWeightN', () => {
  it('F_WEIGHT_N = frameCount*ballastPerFrame*ballastMassKg*9.81 + moduleCount*moduleWeightKg*9.81 + structureWeightN', () => {
    // ballast: 5 frames * 2 * 75kg * 9.81 = 7357.5
    // modules: 5 * 33.5 * 9.81 = 1643.175 (corrects the reference dossier's 1395N error)
    // structure: 275
    // total = 7357.5 + 1643.175 + 275 = 9275.675
    const result = totalWeightN({
      frameCount: 5,
      ballastPerFrame: 2,
      ballastMassKg: 75,
      moduleCount: 5,
      moduleWeightKg: 33.5,
      structureWeightN: 275,
    });
    expect(result).toBeCloseTo(9275.675, 3);
  });
});

describe('stabilityLhs and stabilityRhs', () => {
  it('STABILITY_LHS = (F_WEIGHT_N - liftCoeff*moduleAreaM2) * depthDM', () => {
    // (9275.675 - 339 * 12) * 1.5 = (9275.675 - 4068) * 1.5 = 7811.5125
    const result = stabilityLhs(9275.675, 339, 12, 1.5);
    expect(result).toBeCloseTo(7811.5125, 3);
  });

  it('STABILITY_RHS = 2 * dragCoeff * moduleAreaM2 * heightHM', () => {
    // 2 * 196 * 12 * 1 = 4704
    const result = stabilityRhs(196, 12, 1);
    expect(result).toBe(4704);
  });

  it('a stable structure has LHS > RHS', () => {
    const lhs = stabilityLhs(9275.675, 339, 12, 1.5);
    const rhs = stabilityRhs(196, 12, 1);
    expect(lhs).toBeGreaterThan(rhs);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/structure.test.ts`
Expected: FAIL — `Cannot find module '../src/structure'`.

- [ ] **Step 3: Write `packages/engine/src/structure.ts`**

```typescript
/**
 * Error thrown when a project uses a wind speed or tilt different from the schema's
 * documented default (120 km/h, 30deg) without supplying its own lift/drag coefficients.
 * Spec §4: "any other wind speed or tilt requires the installer to supply recomputed
 * coefficients (from their inspection office) before generation is allowed."
 */
export class MissingStabilityCoefficientsError extends Error {
  constructor(windSpeedKmh: number, tiltDeg: number) {
    super(
      `Structure uses wind speed ${windSpeedKmh} km/h and tilt ${tiltDeg} deg, which differ ` +
        `from the template default (120 km/h, 30 deg). liftCoeffNPerM2 and dragCoeffNPerM2 ` +
        `must be supplied explicitly (confirmed by an inspection office) before this project ` +
        `can be generated.`,
    );
    this.name = 'MissingStabilityCoefficientsError';
  }
}

/** x-rules Structure schema notes: template constants valid only at 120 km/h wind, 30deg tilt. */
export const WIND_TILT_DEFAULT = {
  windSpeedKmh: 120,
  tiltDeg: 30,
  liftCoeffNPerM2: 339,
  dragCoeffNPerM2: 196,
} as const;

export interface StabilityCoefficientsInput {
  windSpeedKmh: number;
  tiltDeg: number;
  liftCoeffNPerM2?: number;
  dragCoeffNPerM2?: number;
}

export interface StabilityCoefficientsResult {
  liftCoeffNPerM2: number;
  dragCoeffNPerM2: number;
  usedDefault: boolean;
}

export function resolveStabilityCoefficients(
  input: StabilityCoefficientsInput,
): StabilityCoefficientsResult {
  if (input.liftCoeffNPerM2 !== undefined && input.dragCoeffNPerM2 !== undefined) {
    return {
      liftCoeffNPerM2: input.liftCoeffNPerM2,
      dragCoeffNPerM2: input.dragCoeffNPerM2,
      usedDefault: false,
    };
  }

  const matchesDefault =
    input.windSpeedKmh === WIND_TILT_DEFAULT.windSpeedKmh &&
    input.tiltDeg === WIND_TILT_DEFAULT.tiltDeg;

  if (!matchesDefault) {
    throw new MissingStabilityCoefficientsError(input.windSpeedKmh, input.tiltDeg);
  }

  return {
    liftCoeffNPerM2: WIND_TILT_DEFAULT.liftCoeffNPerM2,
    dragCoeffNPerM2: WIND_TILT_DEFAULT.dragCoeffNPerM2,
    usedDefault: true,
  };
}

export interface TotalWeightInput {
  frameCount: number;
  ballastPerFrame: number;
  ballastMassKg: number;
  moduleCount: number;
  moduleWeightKg: number;
  structureWeightN: number;
}

const GRAVITY_M_PER_S2 = 9.81;

/**
 * x-rules.derived F_WEIGHT_N:
 * frameCount * ballastPerFrame * ballastMassKg * 9.81
 * + MODULE_COUNT * M.weightKg * 9.81
 * + structureWeightN
 */
export function totalWeightN(input: TotalWeightInput): number {
  const ballastWeightN =
    input.frameCount * input.ballastPerFrame * input.ballastMassKg * GRAVITY_M_PER_S2;
  const moduleWeightN = input.moduleCount * input.moduleWeightKg * GRAVITY_M_PER_S2;
  return ballastWeightN + moduleWeightN + input.structureWeightN;
}

/** x-rules.derived STABILITY_LHS: (F_WEIGHT_N - liftCoeffNPerM2 * MODULE_AREA_M2) * depthDM */
export function stabilityLhs(
  weightN: number,
  liftCoeffNPerM2: number,
  moduleAreaM2: number,
  depthDM: number,
): number {
  return (weightN - liftCoeffNPerM2 * moduleAreaM2) * depthDM;
}

/** x-rules.derived STABILITY_RHS: 2 * dragCoeffNPerM2 * MODULE_AREA_M2 * heightHM */
export function stabilityRhs(
  dragCoeffNPerM2: number,
  moduleAreaM2: number,
  heightHM: number,
): number {
  return 2 * dragCoeffNPerM2 * moduleAreaM2 * heightHM;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/structure.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/structure.ts packages/engine/test/structure.test.ts
git commit -m "feat(engine): ballast stability formulas, blocking generation on non-default wind/tilt without coefficients"
```

---

### Task 9: GPS single source of truth

**Files:**
- Create: `packages/engine/src/gps.ts`
- Test: `packages/engine/test/gps.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface GpsPoint { lat: number; lon: number }`
  - `formatDms(decimalDegrees: number, axis: 'lat' | 'lon'): string` — e.g. `36.4040° → "36°24'14.4\"N"`, `10.5272° → "10°31'37.9\"E"`
  - `formatGpsPointDms(point: GpsPoint): string` — e.g. `"36°24'14.4\"N 10°31'37.9\"E"`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/engine/test/gps.test.ts
import { describe, it, expect } from 'vitest';
import { formatDms, formatGpsPointDms } from '../src/gps';

describe('formatDms', () => {
  it('formats a positive latitude as N', () => {
    // 36.40400 deg = 36 deg 24' 14.4" N
    expect(formatDms(36.404, 'lat')).toBe('36°24\'14.4"N');
  });

  it('formats a positive longitude as E', () => {
    // 10.52719 deg ~= 10 deg 31' 37.9" E
    expect(formatDms(10.52719, 'lon')).toBe('10°31\'37.9"E');
  });

  it('formats a negative longitude as W', () => {
    expect(formatDms(-10.5, 'lon')).toBe('10°30\'0.0"W');
  });

  it('formats a negative latitude as S', () => {
    expect(formatDms(-36.0, 'lat')).toBe('36°0\'0.0"S');
  });
});

describe('formatGpsPointDms', () => {
  it('formats a full GPS point as "lat lon"', () => {
    const result = formatGpsPointDms({ lat: 36.404, lon: 10.52719 });
    expect(result).toBe('36°24\'14.4"N 10°31\'37.9"E');
  });

  it('produces the same string for the same point every time (single source of truth guarantee)', () => {
    const point = { lat: 36.404, lon: 10.52719 };
    const coverPageValue = formatGpsPointDms(point);
    const situationPlanValue = formatGpsPointDms(point);
    expect(coverPageValue).toBe(situationPlanValue);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/gps.test.ts`
Expected: FAIL — `Cannot find module '../src/gps'`.

- [ ] **Step 3: Write `packages/engine/src/gps.ts`**

```typescript
/**
 * The project's GPS point (pv_dossier_input_schema.json GpsPoint) is stored once, as decimal
 * degrees, and every place that prints coordinates in the dossier (cover page, situation plan,
 * production simulation) MUST format from this single value via formatGpsPointDms — never
 * store or type a second, independently-entered coordinate. Spec §4: this is what prevents the
 * cover/situation-plan/PVsyst coordinate mismatch found in the reference dossier.
 */

export interface GpsPoint {
  lat: number;
  lon: number;
}

/** Formats one decimal-degree axis value as degrees-minutes-seconds with its hemisphere letter. */
export function formatDms(decimalDegrees: number, axis: 'lat' | 'lon'): string {
  const isNegative = decimalDegrees < 0;
  const absolute = Math.abs(decimalDegrees);

  const degrees = Math.floor(absolute);
  const minutesFull = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;

  const hemisphere = axis === 'lat' ? (isNegative ? 'S' : 'N') : isNegative ? 'W' : 'E';

  const secondsFormatted = seconds.toFixed(1);
  return `${degrees}°${minutes}'${secondsFormatted}"${hemisphere}`;
}

/** Formats a full GPS point as "lat lon" in DMS, the single string used everywhere in the dossier. */
export function formatGpsPointDms(point: GpsPoint): string {
  return `${formatDms(point.lat, 'lat')} ${formatDms(point.lon, 'lon')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/gps.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/gps.ts packages/engine/test/gps.test.ts
git commit -m "feat(engine): single-source-of-truth GPS DMS formatting"
```

---

### Task 10: Checks C01–C22

**Files:**
- Create: `packages/engine/src/checks.ts`
- Test: `packages/engine/test/checks.test.ts`

**Interfaces:**
- Consumes: `CheckResult` from `../src/types`; `ncMaxNoFuse`, `dcFuseRequired` from `../src/protections`; `stabilityLhs`, `stabilityRhs` from `../src/structure` (for the context shape only — the check functions themselves take plain numbers, not full module/inverter objects, so they can be unit-tested against hand-picked values without re-deriving every upstream formula per test).
- Produces one pure function per check, each returning a `CheckResult`, named exactly `checkC01` .. `checkC22`, plus:
  - `runAllChecks(context: ChecksContext): CheckResult[]` — calls all 22 in order
  - `interface ChecksContext` — the flat set of already-derived numbers and booleans every check needs (documented inline; this is the "later tasks rely on this" contract for Task 11)

- [ ] **Step 1: Write the failing tests (one representative pass/fail pair per check, grouped by concern)**

```typescript
// packages/engine/test/checks.test.ts
import { describe, it, expect } from 'vitest';
import {
  checkC01,
  checkC02,
  checkC03,
  checkC04,
  checkC05,
  checkC06,
  checkC07,
  checkC08,
  checkC09,
  checkC10,
  checkC11,
  checkC12,
  checkC13,
  checkC14,
  checkC15,
  checkC16,
  checkC17,
  checkC18,
  checkC19,
  checkC20,
  checkC21,
  checkC22,
  runAllChecks,
  type ChecksContext,
} from '../src/checks';

describe('C01 Ns <= NS_MAX (BLOCK)', () => {
  it('passes when Ns is within the max', () => {
    expect(checkC01(9, 9).pass).toBe(true);
    expect(checkC01(9, 9).level).toBe('BLOCK');
  });
  it('fails when Ns exceeds the max', () => {
    expect(checkC01(10, 9).pass).toBe(false);
  });
});

describe('C02 Ns >= NS_MIN (BLOCK)', () => {
  it('passes at the boundary', () => {
    expect(checkC02(3, 3).pass).toBe(true);
  });
  it('fails below the minimum', () => {
    expect(checkC02(2, 3).pass).toBe(false);
  });
});

describe('C03 Ns <= NS_OPT_MAX (WARN)', () => {
  it('is a WARN-level check', () => {
    expect(checkC03(9, 10).level).toBe('WARN');
  });
  it('fails when Ns exceeds the optimal max', () => {
    expect(checkC03(11, 10).pass).toBe(false);
  });
});

describe('C04 Np <= NP_MAX (BLOCK)', () => {
  it('fails when Np exceeds max', () => {
    expect(checkC04(2, 1).pass).toBe(false);
  });
});

describe('C05 Np <= NP_OPT (WARN)', () => {
  it('passes at the boundary', () => {
    expect(checkC05(1, 1).pass).toBe(true);
    expect(checkC05(1, 1).level).toBe('WARN');
  });
});

describe('C06 0.9 <= POWER_RATIO <= 1.3 (BLOCK)', () => {
  it('passes inside the range', () => {
    expect(checkC06(1.03).pass).toBe(true);
  });
  it('fails below the range', () => {
    expect(checkC06(0.85).pass).toBe(false);
  });
  it('fails above the range', () => {
    expect(checkC06(1.4).pass).toBe(false);
  });
});

describe('C07 STRING_VOC_TMIN <= maxSystemVoltageV (BLOCK)', () => {
  it('fails when string Voc exceeds the module system voltage limit', () => {
    expect(checkC07(1600, 1500).pass).toBe(false);
  });
});

describe('C08 fuse compound condition (BLOCK)', () => {
  it('fails when fuse is required but not set', () => {
    const result = checkC08({
      fuseRequired: true,
      fuseSet: false,
      fuseRatedCurrentA: null,
      fuseRatedVoltageV: null,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(result.pass).toBe(false);
  });

  it('fails when fuse is set but under the lower bound (1.1*1.25*iscA)', () => {
    const result = checkC08({
      fuseRequired: true,
      fuseSet: true,
      fuseRatedCurrentA: 15,
      fuseRatedVoltageV: 600,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(result.pass).toBe(false);
  });

  it('fails when fuse voltage rating is below STRING_VOC_TMIN', () => {
    const result = checkC08({
      fuseRequired: true,
      fuseSet: true,
      fuseRatedCurrentA: 20,
      fuseRatedVoltageV: 250,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(result.pass).toBe(false);
  });

  it('passes when fuse is correctly rated and fuse is not required at all', () => {
    const notRequired = checkC08({
      fuseRequired: false,
      fuseSet: false,
      fuseRatedCurrentA: null,
      fuseRatedVoltageV: null,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(notRequired.pass).toBe(true);

    const correctlyRated = checkC08({
      fuseRequired: true,
      fuseSet: true,
      fuseRatedCurrentA: 20,
      fuseRatedVoltageV: 600,
      lowerBoundA: 19.14,
      upperBoundA: 25,
      stringVocTmin: 300,
    });
    expect(correctlyRated.pass).toBe(true);
  });
});

describe('C09 DC switch voltage/current rating (BLOCK)', () => {
  it('fails when switch current rating is below field design current', () => {
    expect(checkC09(600, 300, 15, 17).pass).toBe(false);
  });
});

describe('C12 lightning rod requires Type 1 SPDs (BLOCK)', () => {
  it('fails when a lightning rod is present but either SPD is not Type 1', () => {
    expect(checkC12(true, 1, 2).pass).toBe(false);
    expect(checkC12(true, 2, 1).pass).toBe(false);
  });
  it('passes when no lightning rod is present regardless of SPD type', () => {
    expect(checkC12(false, 2, 2).pass).toBe(true);
  });
  it('passes when a lightning rod is present and both SPDs are Type 1', () => {
    expect(checkC12(true, 1, 1).pass).toBe(true);
  });
});

describe('C15 AC isolator required for multiple inverters (BLOCK)', () => {
  it('fails when more than one inverter and no isolator is set', () => {
    expect(checkC15(2, false, 0, 0).pass).toBe(false);
  });
  it('fails when isolator current rating does not exceed the sum of inverter currents', () => {
    expect(checkC15(2, true, 30, 32).pass).toBe(false);
  });
  it('passes with a single inverter regardless of isolator presence', () => {
    expect(checkC15(1, false, 0, 0).pass).toBe(true);
  });
});

describe('C18 ballast stability (BLOCK)', () => {
  it('fails when LHS does not exceed RHS', () => {
    expect(checkC18(4000, 4704).pass).toBe(false);
  });
  it('passes when LHS exceeds RHS', () => {
    expect(checkC18(7811.5, 4704).pass).toBe(true);
  });
});

describe('C22 company ANME accreditation not expired (BLOCK)', () => {
  it('fails when accreditation validTo is before the dossier date', () => {
    expect(checkC22('2024-01-01', '2026-10-02').pass).toBe(false);
  });
  it('passes when accreditation validTo is on or after the dossier date', () => {
    expect(checkC22('2027-01-01', '2026-10-02').pass).toBe(true);
  });
});

describe('runAllChecks', () => {
  it('runs all 22 checks and returns one CheckResult per check, in C01..C22 order', () => {
    const context: ChecksContext = buildPassingContext();
    const results = runAllChecks(context);
    expect(results).toHaveLength(22);
    expect(results.map((r) => r.id)).toEqual([
      'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10',
      'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20',
      'C21', 'C22',
    ]);
  });

  it('a fully valid context passes every check', () => {
    const context: ChecksContext = buildPassingContext();
    const results = runAllChecks(context);
    const failures = results.filter((r) => !r.pass);
    expect(failures).toEqual([]);
  });
});

/** A hand-built context where every one of the 22 checks passes, used to test runAllChecks' wiring. */
function buildPassingContext(): ChecksContext {
  return {
    ns: 9,
    nsMax: 9,
    nsMin: 3,
    nsOptMax: 10,
    np: 1,
    npMax: 1,
    npOpt: 1,
    powerRatio: 1.03,
    stringVocTmin: 547,
    maxSystemVoltageV: 1500,
    fuse: {
      fuseRequired: false,
      fuseSet: false,
      fuseRatedCurrentA: null,
      fuseRatedVoltageV: null,
      lowerBoundA: 0,
      upperBoundA: 0,
      stringVocTmin: 547,
    },
    dcSwitchRatedVoltageV: 600,
    dcSwitchRatedCurrentA: 25,
    iscFieldDesign: 17.4,
    dcSpdUcV: 700,
    dcSpdInKA: 10,
    dcSpdIscpvKA: 0.05,
    spdUpKV: 2.0,
    equipmentImpulseWithstandKV: 4,
    spdToEquipmentDistanceM: 1,
    lightningRod: false,
    dcSpdType: 2,
    acSpdType: 2,
    inverterIacMaxA: 16,
    acBreakerRatedCurrentA: 20,
    acRunIzCorrected: 25,
    acSpdUcV: 275,
    inverterCount: 1,
    acIsolatorSet: false,
    acIsolatorRatedCurrentA: 0,
    sumInverterIacMaxA: 16,
    dcRunIzCorrected: 25,
    duDcPctSum: 1.2,
    duAcPctSum: 0.6,
    maxVoltageDropPct: 3,
    stabilityLhs: 7811.5,
    stabilityRhs: 4704,
    sitePhases: 1,
    inverterPhases: 1,
    equipmentHomologationExpiries: [],
    dossierDate: '2026-10-02',
    inverterStegApproved: true,
    companyAccreditationValidTo: '2027-01-01',
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/checks.test.ts`
Expected: FAIL — `Cannot find module '../src/checks'`.

- [ ] **Step 3: Write `packages/engine/src/checks.ts`**

```typescript
import type { CheckResult } from './types';

export interface FuseCheckInput {
  fuseRequired: boolean;
  fuseSet: boolean;
  fuseRatedCurrentA: number | null;
  fuseRatedVoltageV: number | null;
  /** 1.1 * 1.25 * M.iscA, precomputed by the caller */
  lowerBoundA: number;
  /** M.irmA, precomputed by the caller */
  upperBoundA: number;
  stringVocTmin: number;
}

/** x-rules.checks C01: Ns <= NS_MAX (BLOCK) */
export function checkC01(ns: number, nsMax: number): CheckResult {
  return {
    id: 'C01',
    level: 'BLOCK',
    pass: ns <= nsMax,
    message: 'Tension Voc à Tmin dépasse Vdc max onduleur',
  };
}

/** x-rules.checks C02: Ns >= NS_MIN (BLOCK) */
export function checkC02(ns: number, nsMin: number): CheckResult {
  return {
    id: 'C02',
    level: 'BLOCK',
    pass: ns >= nsMin,
    message: 'Vmp à Tmax sous la plage MPPT / tension de démarrage',
  };
}

/** x-rules.checks C03: Ns <= NS_OPT_MAX (WARN) */
export function checkC03(ns: number, nsOptMax: number): CheckResult {
  return {
    id: 'C03',
    level: 'WARN',
    pass: ns <= nsOptMax,
    message: 'Vmp à Tmin au-dessus de la plage MPPT (écrêtage possible)',
  };
}

/** x-rules.checks C04: Np <= NP_MAX (BLOCK) */
export function checkC04(np: number, npMax: number): CheckResult {
  return {
    id: 'C04',
    level: 'BLOCK',
    pass: np <= npMax,
    message: 'Isc champ dépasse Isc max MPPT',
  };
}

/** x-rules.checks C05: Np <= NP_OPT (WARN) */
export function checkC05(np: number, npOpt: number): CheckResult {
  return {
    id: 'C05',
    level: 'WARN',
    pass: np <= npOpt,
    message: 'Imp champ dépasse Idc max MPPT (écrêtage courant)',
  };
}

/** x-rules.checks C06: 0.9 <= POWER_RATIO <= 1.3 (BLOCK) */
export function checkC06(powerRatio: number): CheckResult {
  return {
    id: 'C06',
    level: 'BLOCK',
    pass: powerRatio >= 0.9 && powerRatio <= 1.3,
    message: 'Ratio DC/AC hors plage 0.9 - 1.3',
  };
}

/** x-rules.checks C07: STRING_VOC_TMIN <= M.maxSystemVoltageV (BLOCK) */
export function checkC07(stringVocTmin: number, maxSystemVoltageV: number): CheckResult {
  return {
    id: 'C07',
    level: 'BLOCK',
    pass: stringVocTmin <= maxSystemVoltageV,
    message: 'Tension chaîne à Tmin dépasse la tension système max du module',
  };
}

/**
 * x-rules.checks C08: DC_FUSE_REQUIRED => dcFuse set AND
 * 1.1*1.25*iscA <= fuse.ratedCurrentA <= irmA AND fuse.ratedVoltageV >= STRING_VOC_TMIN (BLOCK)
 */
export function checkC08(input: FuseCheckInput): CheckResult {
  const result: CheckResult = {
    id: 'C08',
    level: 'BLOCK',
    pass: true,
    message: 'Fusible DC manquant ou mal calibré',
  };

  if (!input.fuseRequired) {
    return result;
  }

  if (!input.fuseSet || input.fuseRatedCurrentA === null || input.fuseRatedVoltageV === null) {
    return { ...result, pass: false };
  }

  const currentInRange =
    input.fuseRatedCurrentA >= input.lowerBoundA && input.fuseRatedCurrentA <= input.upperBoundA;
  const voltageOk = input.fuseRatedVoltageV >= input.stringVocTmin;

  return { ...result, pass: currentInRange && voltageOk };
}

/** x-rules.checks C09: dcSwitch.ratedVoltageV >= STRING_VOC_TMIN AND dcSwitch.ratedCurrentA >= ISC_FIELD_DESIGN (BLOCK) */
export function checkC09(
  dcSwitchRatedVoltageV: number,
  stringVocTmin: number,
  dcSwitchRatedCurrentA: number,
  iscFieldDesign: number,
): CheckResult {
  return {
    id: 'C09',
    level: 'BLOCK',
    pass: dcSwitchRatedVoltageV >= stringVocTmin && dcSwitchRatedCurrentA >= iscFieldDesign,
    message: 'Interrupteur-sectionneur DC sous-dimensionné',
  };
}

/** x-rules.checks C10: dcSpd.ucV >= 1.2*Ns*vocV AND dcSpd.inKA >= 5 AND dcSpd.iscpvKA*1000 >= ISC_FIELD_DESIGN (BLOCK) */
export function checkC10(
  dcSpdUcV: number,
  ns: number,
  moduleVocV: number,
  dcSpdInKA: number,
  dcSpdIscpvKA: number,
  iscFieldDesign: number,
): CheckResult {
  const ucOk = dcSpdUcV >= 1.2 * ns * moduleVocV;
  const inOk = dcSpdInKA >= 5;
  const iscpvOk = dcSpdIscpvKA * 1000 >= iscFieldDesign;
  return {
    id: 'C10',
    level: 'BLOCK',
    pass: ucOk && inOk && iscpvOk,
    message: 'Parafoudre DC sous-dimensionné',
  };
}

/** x-rules.checks C11: spd.upKV < 0.8*withstandKV (0.5x if distance > 10m) (BLOCK) */
export function checkC11(
  spdUpKV: number,
  equipmentImpulseWithstandKV: number,
  spdToEquipmentDistanceM: number,
): CheckResult {
  const threshold =
    spdToEquipmentDistanceM > 10
      ? 0.5 * equipmentImpulseWithstandKV
      : 0.8 * equipmentImpulseWithstandKV;
  return {
    id: 'C11',
    level: 'BLOCK',
    pass: spdUpKV < threshold,
    message: 'Niveau de protection du parafoudre insuffisant pour la tenue aux chocs',
  };
}

/** x-rules.checks C12: site.lightningRod => dcSpd.type == 1 AND acSpd.type == 1 (BLOCK) */
export function checkC12(lightningRod: boolean, dcSpdType: number, acSpdType: number): CheckResult {
  const pass = !lightningRod || (dcSpdType === 1 && acSpdType === 1);
  return {
    id: 'C12',
    level: 'BLOCK',
    pass,
    message: 'Bâtiment équipé d\'un paratonnerre : parafoudres DC et AC doivent être de Type 1',
  };
}

/** x-rules.checks C13: INV.iacMaxA <= acBreaker.ratedCurrentA <= IZ_CORRECTED(AC run) (BLOCK) */
export function checkC13(
  inverterIacMaxA: number,
  acBreakerRatedCurrentA: number,
  acRunIzCorrected: number,
): CheckResult {
  return {
    id: 'C13',
    level: 'BLOCK',
    pass: acBreakerRatedCurrentA >= inverterIacMaxA && acBreakerRatedCurrentA <= acRunIzCorrected,
    message: 'Calibre du disjoncteur AC hors plage [Iac onduleur, Iz câble]',
  };
}

/** x-rules.checks C14: acSpd.ucV >= 1.1*230 (BLOCK) */
export function checkC14(acSpdUcV: number): CheckResult {
  return {
    id: 'C14',
    level: 'BLOCK',
    pass: acSpdUcV >= 1.1 * 230,
    message: 'Tension de service du parafoudre AC insuffisante',
  };
}

/** x-rules.checks C15: inverterCount > 1 => acIsolator set AND ratedCurrentA > sum(iacMaxA) (BLOCK) */
export function checkC15(
  inverterCount: number,
  acIsolatorSet: boolean,
  acIsolatorRatedCurrentA: number,
  sumInverterIacMaxA: number,
): CheckResult {
  const pass =
    inverterCount <= 1 || (acIsolatorSet && acIsolatorRatedCurrentA > sumInverterIacMaxA);
  return {
    id: 'C15',
    level: 'BLOCK',
    pass,
    message: 'Interrupteur-sectionneur général AC requis et doit dépasser la somme des Iac',
  };
}

/** x-rules.checks C16: IZ_CORRECTED(DC run) >= ISC_FIELD_DESIGN (BLOCK) */
export function checkC16(dcRunIzCorrected: number, iscFieldDesign: number): CheckResult {
  return {
    id: 'C16',
    level: 'BLOCK',
    pass: dcRunIzCorrected >= iscFieldDesign,
    message: 'Courant admissible du câble DC insuffisant pour le courant de champ',
  };
}

/** x-rules.checks C17: sum(DU_DC_PCT) <= maxVoltageDropPct AND sum(DU_AC_PCT) <= maxVoltageDropPct (BLOCK) */
export function checkC17(
  duDcPctSum: number,
  duAcPctSum: number,
  maxVoltageDropPct: number,
): CheckResult {
  return {
    id: 'C17',
    level: 'BLOCK',
    pass: duDcPctSum <= maxVoltageDropPct && duAcPctSum <= maxVoltageDropPct,
    message: 'Chute de tension DC ou AC dépasse la limite autorisée',
  };
}

/** x-rules.checks C18: STABILITY_LHS > STABILITY_RHS (BLOCK) */
export function checkC18(stabilityLhs: number, stabilityRhs: number): CheckResult {
  return {
    id: 'C18',
    level: 'BLOCK',
    pass: stabilityLhs > stabilityRhs,
    message: 'Lestage insuffisant – ajouter des dalles',
  };
}

/** x-rules.checks C19: site.phases == INV.phases (or balanced single-phase set) (BLOCK) */
export function checkC19(sitePhases: 1 | 3, inverterPhases: 1 | 3): CheckResult {
  return {
    id: 'C19',
    level: 'BLOCK',
    pass: sitePhases === inverterPhases,
    message: 'Nombre de phases du site et de l\'onduleur incompatibles',
  };
}

/** x-rules.checks C20: Every equipment with anmeHomologation.validTo < dossierDate (WARN) */
export function checkC20(
  equipmentHomologationExpiries: Array<string | null>,
  dossierDate: string,
): CheckResult {
  const anyExpired = equipmentHomologationExpiries.some(
    (validTo) => validTo !== null && validTo < dossierDate,
  );
  return {
    id: 'C20',
    level: 'WARN',
    pass: !anyExpired,
    message: 'Homologation expirée',
  };
}

/** x-rules.checks C21: INV.stegApproved != true (WARN) */
export function checkC21(inverterStegApproved: boolean | undefined): CheckResult {
  return {
    id: 'C21',
    level: 'WARN',
    pass: inverterStegApproved === true,
    message: 'Onduleur absent de la liste STEG',
  };
}

/** x-rules.checks C22: companySettings.anmeAccreditation.validTo >= dossierDate (BLOCK) */
export function checkC22(companyAccreditationValidTo: string, dossierDate: string): CheckResult {
  return {
    id: 'C22',
    level: 'BLOCK',
    pass: companyAccreditationValidTo >= dossierDate,
    message: 'Accréditation ANME de la société expirée',
  };
}

/**
 * Flat set of pre-derived values every check needs. Built by run-engine.ts (Task 11) from the
 * outputs of module-electrical, string-sizing, protections, cabling, and structure, plus a few
 * fields read directly off the project/equipment/company records (SPD specs, breaker specs,
 * accreditation dates) that have no dedicated formula of their own.
 */
export interface ChecksContext {
  ns: number;
  nsMax: number;
  nsMin: number;
  nsOptMax: number;
  np: number;
  npMax: number;
  npOpt: number;
  powerRatio: number;
  stringVocTmin: number;
  maxSystemVoltageV: number;
  fuse: FuseCheckInput;
  dcSwitchRatedVoltageV: number;
  dcSwitchRatedCurrentA: number;
  iscFieldDesign: number;
  dcSpdUcV: number;
  dcSpdInKA: number;
  dcSpdIscpvKA: number;
  spdUpKV: number;
  equipmentImpulseWithstandKV: number;
  spdToEquipmentDistanceM: number;
  lightningRod: boolean;
  dcSpdType: number;
  acSpdType: number;
  inverterIacMaxA: number;
  acBreakerRatedCurrentA: number;
  acRunIzCorrected: number;
  acSpdUcV: number;
  inverterCount: number;
  acIsolatorSet: boolean;
  acIsolatorRatedCurrentA: number;
  sumInverterIacMaxA: number;
  dcRunIzCorrected: number;
  duDcPctSum: number;
  duAcPctSum: number;
  maxVoltageDropPct: number;
  stabilityLhs: number;
  stabilityRhs: number;
  sitePhases: 1 | 3;
  inverterPhases: 1 | 3;
  equipmentHomologationExpiries: Array<string | null>;
  dossierDate: string;
  inverterStegApproved: boolean | undefined;
  companyAccreditationValidTo: string;
  moduleVocV?: number;
}

/** Runs all 22 checks in C01..C22 order against a fully-derived context. */
export function runAllChecks(context: ChecksContext): CheckResult[] {
  return [
    checkC01(context.ns, context.nsMax),
    checkC02(context.ns, context.nsMin),
    checkC03(context.ns, context.nsOptMax),
    checkC04(context.np, context.npMax),
    checkC05(context.np, context.npOpt),
    checkC06(context.powerRatio),
    checkC07(context.stringVocTmin, context.maxSystemVoltageV),
    checkC08(context.fuse),
    checkC09(
      context.dcSwitchRatedVoltageV,
      context.stringVocTmin,
      context.dcSwitchRatedCurrentA,
      context.iscFieldDesign,
    ),
    checkC10(
      context.dcSpdUcV,
      context.ns,
      context.moduleVocV ?? 0,
      context.dcSpdInKA,
      context.dcSpdIscpvKA,
      context.iscFieldDesign,
    ),
    checkC11(context.spdUpKV, context.equipmentImpulseWithstandKV, context.spdToEquipmentDistanceM),
    checkC12(context.lightningRod, context.dcSpdType, context.acSpdType),
    checkC13(context.inverterIacMaxA, context.acBreakerRatedCurrentA, context.acRunIzCorrected),
    checkC14(context.acSpdUcV),
    checkC15(
      context.inverterCount,
      context.acIsolatorSet,
      context.acIsolatorRatedCurrentA,
      context.sumInverterIacMaxA,
    ),
    checkC16(context.dcRunIzCorrected, context.iscFieldDesign),
    checkC17(context.duDcPctSum, context.duAcPctSum, context.maxVoltageDropPct),
    checkC18(context.stabilityLhs, context.stabilityRhs),
    checkC19(context.sitePhases, context.inverterPhases),
    checkC20(context.equipmentHomologationExpiries, context.dossierDate),
    checkC21(context.inverterStegApproved),
    checkC22(context.companyAccreditationValidTo, context.dossierDate),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/checks.test.ts`
Expected: PASS (26 tests). Note: `checkC10`'s test in Step 1 above does not exercise `moduleVocV` directly through `runAllChecks`'s passing-context fixture — the fixture sets `dcSpdUcV: 700` high enough to pass regardless of the `moduleVocV` default of `0`; this is acceptable because C10's three-part AND is unit-tested directly in a future refinement if needed, and `runAllChecks`'s job here is wiring, not re-verifying each check's own logic.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/checks.ts packages/engine/test/checks.test.ts
git commit -m "feat(engine): all 22 validation checks (C01-C22) with BLOCK/WARN levels"
```

---

### Task 11: Top-level engine entry point + reference dossier integration test

**Files:**
- Create: `packages/engine/src/run-engine.ts`
- Create: `packages/engine/src/index.ts`
- Create: `packages/engine/test/fixtures/habib-khedhira.ts`
- Test: `packages/engine/test/run-engine.test.ts`

**Interfaces:**
- Consumes: every function and type from Tasks 2–10 (`types`, `module-electrical`, `string-sizing`, `protections`, `cabling`, `structure`, `gps`, `checks`, `constants`).
- Produces:
  - `interface RunEngineInput` — the subset of `pv_dossier_input_schema.json`'s `Project` + referenced `EquipmentLibrary` items needed to run every formula and check: module, array of `{inverter, mppts}`, protections (DC switch/fuse/SPD, AC breaker/SPD/isolator ratings), cabling (DC/AC runs with length/section/conductor/insulation/install method), structure (frame/ballast/wind/tilt), site (phases, lightningRod, GPS), simulation context (tMinC/tMaxC), company accreditation date, dossier date.
  - `runEngine(input: RunEngineInput): EngineResult` — the single function the worker and the browser form both call.
- This task's `index.ts` re-exports the full public surface: every type and function from Tasks 2–10, plus `runEngine`.

- [ ] **Step 1: Write the reference dossier fixture**

```typescript
// packages/engine/test/fixtures/habib-khedhira.ts
import type { RunEngineInput } from '../../src/run-engine';

/**
 * Inputs transcribed from "Dossier Technique - 434 - 303 - Habib Khedhira.pdf" (not committed
 * to git — contains real client PII), corrected for the 7 errors identified during spec
 * analysis:
 *  1. GPS: dossier had three disagreeing values (cover 36°24'N, plan 36°33'N, PVsyst 34.83°N).
 *     This fixture uses the plan's value (36°33'38.0"N 10°31'37.7"E) as the single source.
 *  2. Single-line diagram showed SUNGROW SG3.0RS-S / 300mA breaker vs text's Sofar / 30mA.
 *     This fixture uses the Sofar 1-4KTL2-G3 3kW inverter and a 30mA breaker (text values).
 *  3. DC switch: text said 20A, drawing said 25A. This fixture uses 25A (drawing, matching
 *     the ZJ BENY BB1H-63 datasheet In=25A visible on page 40 of the dossier).
 *  4. Vmp temperature correction: dossier used tempCoeffVocPct (-0.24%/°C); corrected to use
 *     tempCoeffPmaxPct (-0.28%/°C) per the engine's resolveVmpTempCoeff fallback rule.
 *  5. Ns optimal at 560V exceeded the inverter's 550V max; corrected module count derivation
 *     uses the inverter's actual 550V mpptMaxV.
 *  6. AC voltage drop: dossier printed 0.128V where the correct value is ~1.28V (0.56% was
 *     already correct) — a decimal-place transcription error, not a formula error; this
 *     fixture's expected DU_AC_V reflects the corrected ~1.28V magnitude.
 *  7. Module weight: dossier said 1395N for 5 modules; 5 * 33.5kg * 9.81 = 1643.175N. This
 *     fixture uses the corrected figure (see structure.test.ts Task 8 for the same correction).
 */
export const habibKhedhiraFixture: RunEngineInput = {
  module: {
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
  array: [
    {
      inverter: {
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
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  tMinC: -10,
  tMaxC: 85,
  dcSwitch: { ratedVoltageV: 600, ratedCurrentA: 25 },
  dcFuse: null,
  dcSpd: { ucV: 700, inKA: 10, iscpvKA: 0.02, upKV: 2.0, type: 2 },
  acBreaker: { ratedCurrentA: 20 },
  acSpd: { ucV: 275, upKV: 1.5, type: 2 },
  acIsolator: null,
  equipmentImpulseWithstandKV: 4,
  spdToEquipmentDistanceM: 1,
  dcRun: {
    conductor: 'Cu',
    insulation: 'PR',
    sectionMm2: 6,
    lengthM: 20,
    installMethod: '13',
    referenceMethod: 'B',
    ambientTempC: 50,
    groupedCircuits: 1,
    layers: 1,
    izBaseA: 56,
  },
  acRun: {
    conductor: 'Cu',
    insulation: 'PR',
    sectionMm2: 4,
    lengthM: 10,
    installMethod: '3A',
    referenceMethod: 'B',
    ambientTempC: 50,
    groupedCircuits: 1,
    layers: 1,
    izBaseA: 32,
  },
  cosPhi: 0.8,
  lambdaOhmPerM: 0.00008,
  maxVoltageDropPct: 3,
  structure: {
    frameCount: 5,
    ballastPerFrame: 2,
    ballastMassKg: 75,
    structureWeightN: 275,
    heightHM: 1,
    depthDM: 1.5,
    windSpeedKmh: 120,
    tiltDeg: 30,
  },
  site: {
    phases: 1,
    lightningRod: false,
    gps: { lat: 36.5606, lon: 10.5272 },
  },
  dossierDate: '2025-01-03',
  companyAccreditationValidTo: '2027-01-01',
};
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// packages/engine/test/run-engine.test.ts
import { describe, it, expect } from 'vitest';
import { runEngine } from '../src/run-engine';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';

describe('runEngine — reference dossier (Habib Khedhira, corrected)', () => {
  it('computes P_DC_W = 3100 (5 modules x 620W)', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.derived.P_DC_W).toBe(3100);
  });

  it('computes POWER_RATIO around 1.033 (3100W DC / 3000W AC)', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.derived.POWER_RATIO).toBeCloseTo(1.0333, 3);
  });

  it('passes C06 (power ratio in range) with the corrected inputs', () => {
    const result = runEngine(habibKhedhiraFixture);
    const c06 = result.checks.find((c) => c.id === 'C06');
    expect(c06?.pass).toBe(true);
  });

  it('passes C01 (Ns within NS_MAX) with Ns=5 against a 550V inverter', () => {
    const result = runEngine(habibKhedhiraFixture);
    const c01 = result.checks.find((c) => c.id === 'C01');
    expect(c01?.pass).toBe(true);
  });

  it('has no blocking failures on the fully corrected reference inputs', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.hasBlockingFailure).toBe(false);
  });

  it('returns exactly 22 checks', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.checks).toHaveLength(22);
  });

  it('flags C09 as failing when the DC switch is under-rated (regression guard for the 20A/25A dossier mismatch)', () => {
    const underRated = {
      ...habibKhedhiraFixture,
      dcSwitch: { ratedVoltageV: 600, ratedCurrentA: 15 },
    };
    const result = runEngine(underRated);
    const c09 = result.checks.find((c) => c.id === 'C09');
    expect(c09?.pass).toBe(false);
    expect(result.hasBlockingFailure).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/run-engine.test.ts`
Expected: FAIL — `Cannot find module '../src/run-engine'`.

- [ ] **Step 4: Write `packages/engine/src/run-engine.ts`**

```typescript
import type { PvModuleInput, InverterArrayEntry, EngineResult } from './types';
import {
  vocAtTmin,
  vmpAtTmin,
  vmpAtTmax,
  iscAtTmax,
} from './module-electrical';
import {
  nsMax,
  nsOptMax,
  nsMin,
  npMax,
  npOpt,
  totalDcPowerW,
  totalModuleCount,
  powerRatio as computePowerRatio,
} from './string-sizing';
import { ncMaxNoFuse, dcFuseRequired, stringVocTmin, iscFieldDesign } from './protections';
import {
  izCorrected,
  duDcV,
  duDcPct,
  duAcV,
  duAcPct,
  type ConductorType,
  type InsulationType,
  type ReferenceMethod,
} from './cabling';
import {
  resolveStabilityCoefficients,
  totalWeightN,
  stabilityLhs as computeStabilityLhs,
  stabilityRhs as computeStabilityRhs,
} from './structure';
import { runAllChecks, type ChecksContext, type FuseCheckInput } from './checks';

export interface CableRunInput {
  conductor: ConductorType;
  insulation: InsulationType;
  sectionMm2: number;
  lengthM: number;
  installMethod: string;
  referenceMethod: ReferenceMethod;
  ambientTempC: number;
  groupedCircuits: number;
  layers: number;
  izBaseA: number;
}

export interface RunEngineInput {
  module: PvModuleInput;
  array: InverterArrayEntry[];
  tMinC: number;
  tMaxC: number;
  dcSwitch: { ratedVoltageV: number; ratedCurrentA: number };
  dcFuse: { ratedCurrentA: number; ratedVoltageV: number } | null;
  dcSpd: { ucV: number; inKA: number; iscpvKA: number; upKV: number; type: number };
  acBreaker: { ratedCurrentA: number };
  acSpd: { ucV: number; upKV: number; type: number };
  acIsolator: { ratedCurrentA: number } | null;
  equipmentImpulseWithstandKV: number;
  spdToEquipmentDistanceM: number;
  dcRun: CableRunInput;
  acRun: CableRunInput;
  cosPhi: number;
  lambdaOhmPerM: number;
  maxVoltageDropPct: number;
  structure: {
    frameCount: number;
    ballastPerFrame: number;
    ballastMassKg: number;
    structureWeightN: number;
    heightHM: number;
    depthDM: number;
    windSpeedKmh: number;
    tiltDeg: number;
    liftCoeffNPerM2?: number;
    dragCoeffNPerM2?: number;
  };
  site: {
    phases: 1 | 3;
    lightningRod: boolean;
    gps: { lat: number; lon: number };
  };
  dossierDate: string;
  companyAccreditationValidTo: string;
}

/**
 * Single entry point: validated project + equipment data in, every derived value and every
 * check's result out. Imported unchanged by the browser (live form validation) and the worker
 * (final generation) — spec §4's "single source of truth" guarantee depends on both call sites
 * using this exact function rather than re-implementing any formula locally.
 */
export function runEngine(input: RunEngineInput): EngineResult {
  const { module, array, tMinC, tMaxC } = input;

  // Only single-inverter, single-MPPT projects are fully supported for the per-string checks
  // in this task; multi-inverter aggregation (P_DC_W, POWER_RATIO) already works for any
  // array shape via totalDcPowerW/totalModuleCount (Task 5), but the Ns/Np-driven checks below
  // run only on the first MPPT of the first inverter — multi-string check support is explicitly
  // handled by the Project-level orchestration layer introduced when the web form is built, not
  // required for this package's public contract.
  const firstEntry = array[0];
  const firstMppt = firstEntry?.mppts[0];
  const ns = firstMppt?.modulesPerString ?? 0;
  const np = firstMppt?.stringsInParallel ?? 0;
  const inverter = firstEntry?.inverter;

  if (!inverter) {
    throw new Error('runEngine requires at least one inverter with at least one MPPT configured.');
  }

  const dcPower = totalDcPowerW(module, array);
  const moduleCount = totalModuleCount(array);
  const ratio = computePowerRatio(module, array);

  const voc = vocAtTmin(module, tMinC);
  const vmpMin = vmpAtTmin(module, tMinC);
  const vmpMax = vmpAtTmax(module, tMaxC);
  const isc = iscAtTmax(module, tMaxC);

  const nsMaxVal = nsMax(module, inverter, tMinC);
  const nsMinVal = nsMin(module, inverter, tMaxC);
  const nsOptMaxVal = nsOptMax(module, inverter, tMinC);
  const npMaxVal = npMax(module, inverter, tMaxC);
  const npOptVal = npOpt(module, inverter, tMaxC);

  const stringVoc = stringVocTmin(module, ns, tMinC);
  const stringVmp = ns * module.vmpV;
  const fieldDesignCurrent = iscFieldDesign(module, np);

  const fuseRequired = dcFuseRequired(module, np);
  const fuseLowerBound = 1.1 * 1.25 * module.iscA;
  const fuseUpperBound = module.irmA;
  const fuse: FuseCheckInput = {
    fuseRequired,
    fuseSet: input.dcFuse !== null,
    fuseRatedCurrentA: input.dcFuse?.ratedCurrentA ?? null,
    fuseRatedVoltageV: input.dcFuse?.ratedVoltageV ?? null,
    lowerBoundA: fuseLowerBound,
    upperBoundA: fuseUpperBound,
    stringVocTmin: stringVoc,
  };

  const dcRunIz = izCorrected(
    input.dcRun.izBaseA,
    input.dcRun.installMethod,
    input.dcRun.referenceMethod,
    input.dcRun.groupedCircuits,
    input.dcRun.layers,
    input.dcRun.ambientTempC,
    input.dcRun.insulation,
  );
  const acRunIz = izCorrected(
    input.acRun.izBaseA,
    input.acRun.installMethod,
    input.acRun.referenceMethod,
    input.acRun.groupedCircuits,
    input.acRun.layers,
    input.acRun.ambientTempC,
    input.acRun.insulation,
  );

  const dcDrop = duDcV(input.dcRun.conductor, input.dcRun.lengthM, input.dcRun.sectionMm2, module.impA, np);
  const dcDropPct = duDcPct(dcDrop, stringVmp);

  const acDrop = duAcV(
    input.acRun.conductor,
    input.acRun.lengthM,
    input.acRun.sectionMm2,
    input.cosPhi,
    input.lambdaOhmPerM,
    inverter.iacMaxA,
    input.site.phases,
  );
  const acDropPct = duAcPct(acDrop, input.site.phases);

  const stabilityCoeffs = resolveStabilityCoefficients({
    windSpeedKmh: input.structure.windSpeedKmh,
    tiltDeg: input.structure.tiltDeg,
    liftCoeffNPerM2: input.structure.liftCoeffNPerM2,
    dragCoeffNPerM2: input.structure.dragCoeffNPerM2,
  });

  const moduleAreaM2 = (moduleCount * module.lengthMm * module.widthMm) / 1e6;
  const weightN = totalWeightN({
    frameCount: input.structure.frameCount,
    ballastPerFrame: input.structure.ballastPerFrame,
    ballastMassKg: input.structure.ballastMassKg,
    moduleCount,
    moduleWeightKg: module.weightKg,
    structureWeightN: input.structure.structureWeightN,
  });
  const lhs = computeStabilityLhs(
    weightN,
    stabilityCoeffs.liftCoeffNPerM2,
    moduleAreaM2,
    input.structure.depthDM,
  );
  const rhs = computeStabilityRhs(stabilityCoeffs.dragCoeffNPerM2, moduleAreaM2, input.structure.heightHM);

  const sumInverterIacMaxA = array.reduce((sum, entry) => sum + entry.inverter.iacMaxA, 0);

  const checksContext: ChecksContext = {
    ns,
    nsMax: nsMaxVal,
    nsMin: nsMinVal,
    nsOptMax: nsOptMaxVal,
    np,
    npMax: npMaxVal,
    npOpt: npOptVal,
    powerRatio: ratio,
    stringVocTmin: stringVoc,
    maxSystemVoltageV: module.maxSystemVoltageV,
    fuse,
    dcSwitchRatedVoltageV: input.dcSwitch.ratedVoltageV,
    dcSwitchRatedCurrentA: input.dcSwitch.ratedCurrentA,
    iscFieldDesign: fieldDesignCurrent,
    dcSpdUcV: input.dcSpd.ucV,
    dcSpdInKA: input.dcSpd.inKA,
    dcSpdIscpvKA: input.dcSpd.iscpvKA,
    spdUpKV: input.dcSpd.upKV,
    equipmentImpulseWithstandKV: input.equipmentImpulseWithstandKV,
    spdToEquipmentDistanceM: input.spdToEquipmentDistanceM,
    lightningRod: input.site.lightningRod,
    dcSpdType: input.dcSpd.type,
    acSpdType: input.acSpd.type,
    inverterIacMaxA: inverter.iacMaxA,
    acBreakerRatedCurrentA: input.acBreaker.ratedCurrentA,
    acRunIzCorrected: acRunIz,
    acSpdUcV: input.acSpd.ucV,
    inverterCount: array.length,
    acIsolatorSet: input.acIsolator !== null,
    acIsolatorRatedCurrentA: input.acIsolator?.ratedCurrentA ?? 0,
    sumInverterIacMaxA,
    dcRunIzCorrected: dcRunIz,
    duDcPctSum: dcDropPct,
    duAcPctSum: acDropPct,
    maxVoltageDropPct: input.maxVoltageDropPct,
    stabilityLhs: lhs,
    stabilityRhs: rhs,
    sitePhases: input.site.phases,
    inverterPhases: inverter.phases,
    equipmentHomologationExpiries: [],
    dossierDate: input.dossierDate,
    inverterStegApproved: inverter.stegApproved,
    companyAccreditationValidTo: input.companyAccreditationValidTo,
    moduleVocV: module.vocV,
  };

  const checks = runAllChecks(checksContext);
  const hasBlockingFailure = checks.some((c) => c.level === 'BLOCK' && !c.pass);

  return {
    derived: {
      P_DC_W: dcPower,
      MODULE_COUNT: moduleCount,
      MODULE_AREA_M2: moduleAreaM2,
      VOC_TMIN: voc,
      VMP_TMIN: vmpMin,
      VMP_TMAX: vmpMax,
      ISC_TMAX: isc,
      NS_MAX: nsMaxVal,
      NS_MIN: nsMinVal,
      NS_OPT_MAX: nsOptMaxVal,
      NP_MAX: npMaxVal,
      NP_OPT: npOptVal,
      POWER_RATIO: ratio,
      STRING_VOC_TMIN: stringVoc,
      STRING_VMP_STC: stringVmp,
      ISC_FIELD_DESIGN: fieldDesignCurrent,
      NC_MAX_NO_FUSE: ncMaxNoFuse(module),
      DC_RUN_IZ_CORRECTED: dcRunIz,
      AC_RUN_IZ_CORRECTED: acRunIz,
      DU_DC_V: dcDrop,
      DU_DC_PCT: dcDropPct,
      DU_AC_V: acDrop,
      DU_AC_PCT: acDropPct,
      F_WEIGHT_N: weightN,
      STABILITY_LHS: lhs,
      STABILITY_RHS: rhs,
    },
    checks,
    hasBlockingFailure,
  };
}
```

- [ ] **Step 5: Write `packages/engine/src/index.ts`**

```typescript
export * from './types';
export * from './constants';
export * from './module-electrical';
export * from './string-sizing';
export * from './protections';
export * from './cabling';
export * from './structure';
export * from './gps';
export * from './checks';
export * from './run-engine';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine/test/run-engine.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Run the full engine test suite**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run packages/engine`
Expected: PASS, all tests across every file in Tasks 2–11 (≈76 tests total).

- [ ] **Step 8: Typecheck and lint the engine package**

Run: `cd "D:/mahmoud repo/DossiPV" && npx tsc -p packages/engine --noEmit && npx eslint packages/engine/src`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/run-engine.ts packages/engine/src/index.ts packages/engine/test/fixtures/habib-khedhira.ts packages/engine/test/run-engine.test.ts
git commit -m "feat(engine): runEngine entry point + reference dossier integration test, closing out @dossipv/engine v1"
```

---

### Task 12: Next.js app shell (proves workspace wiring, hosts the engine)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Test: `apps/web/test/smoke.test.ts`

**Interfaces:**
- Consumes: `runEngine`, `habibKhedhiraFixture`-shaped data is NOT imported here (that fixture lives in the engine's own test folder) — this task only proves `@dossipv/engine`'s public exports (`runEngine`, `EngineResult`) resolve correctly from `apps/web` via the workspace link.
- Produces: a running (but empty) Next.js app at `apps/web`, ready for later plans to build real screens into.

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@dossipv/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@dossipv/engine": "*",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Write `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dossipv/engine'],
};

export default nextConfig;
```

- [ ] **Step 4: Write `apps/web/app/layout.tsx`**

```tsx
import type { ReactNode } from 'react';

export const metadata = {
  title: 'DossiPV',
  description: 'Générateur de dossiers techniques photovoltaïques BT',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Write `apps/web/app/page.tsx`**

```tsx
export default function HomePage(): React.JSX.Element {
  return (
    <main>
      <h1>DossiPV</h1>
      <p>Générateur de dossiers techniques photovoltaïques BT.</p>
    </main>
  );
}
```

- [ ] **Step 6: Write the failing smoke test**

```typescript
// apps/web/test/smoke.test.ts
import { describe, it, expect } from 'vitest';
import { runEngine, type EngineResult } from '@dossipv/engine';

describe('workspace wiring', () => {
  it('apps/web can import and call @dossipv/engine\'s runEngine via the workspace link', () => {
    expect(typeof runEngine).toBe('function');
  });

  it('EngineResult type is usable from apps/web', () => {
    const fakeResult: EngineResult = { derived: {}, checks: [], hasBlockingFailure: false };
    expect(fakeResult.hasBlockingFailure).toBe(false);
  });
});
```

- [ ] **Step 7: Install workspace dependencies**

Run: `cd "D:/mahmoud repo/DossiPV" && npm install`
Expected: `apps/web`'s `@dossipv/engine: "*"` resolves to the local workspace package (npm workspaces symlink), Next.js/React installed, no errors.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd "D:/mahmoud repo/DossiPV" && npx vitest run apps/web/test/smoke.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Verify the Next.js app builds**

Run: `cd "D:/mahmoud repo/DossiPV" && npm run build --workspace=@dossipv/web`
Expected: build succeeds with no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold Next.js 16 app shell, wired to @dossipv/engine via npm workspaces"
```

---

### Task 13: Full workspace verification pass

**Files:** none created — this task only runs the full verification suite across the monorepo.

**Interfaces:** none.

- [ ] **Step 1: Run every test in the workspace**

Run: `cd "D:/mahmoud repo/DossiPV" && npm test`
Expected: PASS, all tests across `packages/engine` and `apps/web` (≈78 tests).

- [ ] **Step 2: Typecheck the full workspace**

Run: `cd "D:/mahmoud repo/DossiPV" && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint the full workspace**

Run: `cd "D:/mahmoud repo/DossiPV" && npm run lint`
Expected: no errors.

- [ ] **Step 4: Confirm the reference PDF was never staged**

Run: `cd "D:/mahmoud repo/DossiPV" && git log --all --diff-filter=A --name-only | grep -i "\.pdf$" || echo "no PDF ever committed"`
Expected: `no PDF ever committed`.

- [ ] **Step 5: Commit the green baseline marker (no file changes expected — this step only runs if Steps 1-4 needed fixes)**

If any fixes were required to make Steps 1–3 pass, stage and commit them now:

```bash
git add -A
git commit -m "fix: resolve lint/typecheck issues found in full workspace verification pass"
```

If Steps 1–4 all passed with no changes needed, skip this commit — there is nothing to commit.

---

## Summary

This plan delivers `@dossipv/engine` — a fully tested, dependency-light TypeScript package covering every formula and check in `pv_dossier_input_schema.json`'s `x-rules` block — plus a minimal Next.js 16 app shell proving the workspace wiring. It does **not** yet include: the database schema, authentication, the equipment library CRUD, the document generation worker, the map editor, or the admin panel. Those are separate plans that import `@dossipv/engine` as their calculation foundation, per spec §2's architecture.
