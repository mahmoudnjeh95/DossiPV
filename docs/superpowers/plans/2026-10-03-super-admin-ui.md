# Super-Admin UI (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the super-admin login, dashboard, installer list, and installer detail pages
(view + suspend/activate subscription + record manual payment + edit period end) under
`apps/web/app/admin`, consuming `@dossipv/auth`'s already-built super-admin session functions.

**Architecture:** Mirrors sub-project #4's company-user login shell exactly — Server Actions
for every mutation, a route-group layout guard calling `validateSuperAdminSession`, a separate
cookie (`dossipv_admin_session`) so admin and company-user sessions can never be confused.
Dashboard/list/detail pages are Server Components computing data with direct Prisma queries,
no caching layer.

**Tech Stack:** Next.js 16.3.8 (App Router, Server Actions), React 19.3, `@dossipv/auth`,
`@dossipv/db`, Vitest with `vi.hoisted()` + `vi.mock('next/headers')`/`vi.mock('next/navigation')`.

**Spec:** `docs/superpowers/specs/2026-10-03-super-admin-ui-design.md`

## Global Constraints

- Cookie name `dossipv_admin_session` (NOT `dossipv_session` — that name is already used by
  the installer-facing login from sub-project #4; reusing it would let one session type be
  read as the other). Same options otherwise: httpOnly, `secure: process.env.NODE_ENV ===
  'production'`, `sameSite: 'lax'`, `path: '/'`, `maxAge` = `SESSION_LIFETIME_MS` in seconds
  (`30 * 24 * 60 * 60`).
- Every Server Action file starts with `'use server'` as its first line.
- `cookies()` is `async` (Next 16.3.8) — every call site `await`s it.
- `redirect()` throws internally — never call it inside a `try` whose `catch` could intercept
  it; any code after it in the same function is unreachable, so in a function this plan's own
  tests mock `redirect()` as non-throwing, add an explicit `return undefined as never;`
  immediately after each call so the function's real control flow doesn't depend on the test
  double throwing (this exact fix was needed for sub-project #4's layout guard — apply it from
  the start here, not after a test failure rediscovers it).
- `vi.mock()` factories are hoisted above top-level `const` declarations by Vitest — any mock
  function referenced inside a `vi.mock()` factory must be declared via `vi.hoisted(() => {...})`,
  not a plain top-level `const` (this exact bug was hit and fixed in sub-project #4's first
  test file — apply the fix pattern from the start here).
- `formData.get(fieldName)` returns `FormDataEntryValue | null`, which can be a `File` — every
  Server Action reading form fields must check `typeof field !== 'string'` and treat that as
  invalid input, never pass the result through `String(...)` (this exact bug was found and
  fixed in sub-project #4's `loginAction` — apply the fix pattern from the start here).
- French-language user-facing strings throughout (this plan writes concrete copy; no
  placeholders).
- Needs the SSH tunnel to Postgres alive for the live-verification task (same convention as
  prior plans this session — check at that task's own first step).
- Every `Company` row may have a `null` `subscription` (it's optional on `Company`) — every
  query/page touching `subscription` must handle that case explicitly, never assume it exists.

## Review Focus

- **A company with no `Subscription` row must not crash the installer list or detail page.**
  The spec's §6/§7 both call this out explicitly. A test must exercise a company created
  without ever creating a `Subscription` row for it, on both pages.
- **The `(protected)` layout guard must be exercised for both the no-cookie and
  invalid-token cases, each with its own test** — mirroring the exact risk sub-project #4's
  plan flagged and that its own test suite caught (a redirect-call assertion that passes
  without the guard ever reaching `validateSuperAdminSession` proves nothing about the second
  case).
- **`suspendSubscriptionAction`/`activateSubscriptionAction` must each be a no-op-safe, not
  silently create a second `Subscription` row or throw, when called on a company whose
  subscription is already in the target state** — clicking "Suspendre" twice (e.g. a
  double-submit) must not error.
- **`recordPaymentAction` must reject a non-numeric or negative amount** before it ever
  reaches `db.payment.create` — the spec's form takes a TND amount from a text/number input,
  and a malformed or negative value reaching the database as a `Decimal` is a real path to bad
  financial records, not a hypothetical.
- **The dashboard's "this month" filters must use the current month's actual boundary, not a
  hardcoded 30-day lookback** — a test that seeds one `DossierJob`/`ClaudeUsageLog` dated
  yesterday and one dated on the first day of last month must show only the first one counted,
  proving the filter is a real calendar-month boundary and not an approximation.

---

## Task 1: Admin login — Server Action, page, and layout guard scaffolding

**Files:**
- Create: `apps/web/app/admin/login/actions.ts`
- Create: `apps/web/app/admin/login/page.tsx`
- Create: `apps/web/app/admin/(protected)/layout.tsx`
- Create: `apps/web/app/admin/(protected)/actions.ts`
- Create: `apps/web/app/admin/(protected)/page.tsx` (placeholder, filled in Task 3)
- Create: `apps/web/test/admin-login-actions.test.ts`
- Create: `apps/web/test/admin-layout-guard.test.ts`
- Create: `apps/web/test/admin-logout-actions.test.ts`

**Interfaces:**
- Consumes: `loginSuperAdmin`, `logoutSuperAdmin`, `validateSuperAdminSession`,
  `InvalidCredentialsError`, `TooManyAttemptsError` from `@dossipv/auth`.
- Produces: `requireAuthenticatedSuperAdmin(): Promise<AuthenticatedSuperAdmin>` from
  `(protected)/layout.tsx`, consumed by Task 3's dashboard page and Task 4's installer pages.

- [ ] **Step 1: Write the failing test for the login action**

```ts
// apps/web/test/admin-login-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSet, mockCookies, mockRedirect, mockLoginSuperAdmin } = vi.hoisted(() => {
  const mockSet = vi.fn();
  return {
    mockSet,
    mockCookies: vi.fn(() => Promise.resolve({ set: mockSet })),
    mockRedirect: vi.fn(),
    mockLoginSuperAdmin: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, loginSuperAdmin: mockLoginSuperAdmin };
});

import { loginAdminAction } from '../app/admin/login/actions';
import { InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';

beforeEach(() => {
  mockSet.mockClear();
  mockRedirect.mockClear();
  mockLoginSuperAdmin.mockClear();
});

describe('loginAdminAction', () => {
  it('sets the admin session cookie and redirects to /admin on success', async () => {
    mockLoginSuperAdmin.mockResolvedValue({ admin: { id: '1', email: 'admin@dossipv.tn' }, token: 'raw-admin-token' });

    const formData = new FormData();
    formData.set('email', 'admin@dossipv.tn');
    formData.set('password', 'correct-password');

    await loginAdminAction(undefined, formData);

    expect(mockSet).toHaveBeenCalledWith('dossipv_admin_session', 'raw-admin-token', expect.objectContaining({ httpOnly: true }));
    expect(mockRedirect).toHaveBeenCalledWith('/admin');
  });

  it('returns a French error and does not redirect on InvalidCredentialsError', async () => {
    mockLoginSuperAdmin.mockRejectedValue(new InvalidCredentialsError());

    const formData = new FormData();
    formData.set('email', 'admin@dossipv.tn');
    formData.set('password', 'wrong-password');

    const result = await loginAdminAction(undefined, formData);

    expect(result).toEqual({ error: 'Email ou mot de passe incorrect.' });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('returns a French error and does not redirect on TooManyAttemptsError', async () => {
    mockLoginSuperAdmin.mockRejectedValue(new TooManyAttemptsError());

    const formData = new FormData();
    formData.set('email', 'admin@dossipv.tn');
    formData.set('password', 'wrong-password');

    const result = await loginAdminAction(undefined, formData);

    expect(result).toEqual({ error: 'Trop de tentatives échouées. Réessayez plus tard.' });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('treats a non-string email field as invalid rather than stringifying it', async () => {
    const formData = new FormData();
    formData.set('email', new Blob(['x']), 'not-an-email.txt');
    formData.set('password', 'any-password');

    const result = await loginAdminAction(undefined, formData);

    expect(mockLoginSuperAdmin).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Email ou mot de passe incorrect.' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix apps/web test -- test/admin-login-actions.test.ts`
Expected: FAIL — `Cannot find module '../app/admin/login/actions'`.

- [ ] **Step 3: Implement the login action**

```ts
// apps/web/app/admin/login/actions.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSuperAdmin, InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';

const ADMIN_SESSION_COOKIE_NAME = 'dossipv_admin_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface LoginAdminActionState {
  error: string;
}

export async function loginAdminAction(
  _prevState: LoginAdminActionState | undefined,
  formData: FormData,
): Promise<LoginAdminActionState | undefined> {
  const emailField = formData.get('email');
  const passwordField = formData.get('password');

  if (typeof emailField !== 'string' || typeof passwordField !== 'string') {
    return { error: 'Email ou mot de passe incorrect.' };
  }

  let token: string;
  try {
    const result = await loginSuperAdmin(emailField, passwordField);
    token = result.token;
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return { error: 'Email ou mot de passe incorrect.' };
    }
    if (error instanceof TooManyAttemptsError) {
      return { error: 'Trop de tentatives échouées. Réessayez plus tard.' };
    }
    throw error;
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect('/admin');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix apps/web test -- test/admin-login-actions.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Implement the login page**

```tsx
// apps/web/app/admin/login/page.tsx
'use client';

import { useActionState } from 'react';
import { loginAdminAction } from './actions';

export default function AdminLoginPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(loginAdminAction, undefined);

  return (
    <main>
      <h1>Administration — Connexion</h1>
      <form action={formAction}>
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Mot de passe
          <input type="password" name="password" required />
        </label>
        <button type="submit" disabled={pending}>
          Se connecter
        </button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Write the failing test for the layout guard**

```ts
// apps/web/test/admin-layout-guard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockCookies, mockRedirect, mockValidateSuperAdminSession } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: mockValidateSuperAdminSession };
});

import { requireAuthenticatedSuperAdmin } from '../app/admin/(protected)/layout';

beforeEach(() => {
  mockGet.mockReset();
  mockRedirect.mockClear();
  mockValidateSuperAdminSession.mockClear();
});

describe('requireAuthenticatedSuperAdmin', () => {
  it('redirects to /admin/login when no session cookie is present', async () => {
    mockGet.mockReturnValue(undefined);

    await requireAuthenticatedSuperAdmin();

    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
    expect(mockValidateSuperAdminSession).not.toHaveBeenCalled();
  });

  it('redirects to /admin/login when the cookie is present but validateSuperAdminSession returns null', async () => {
    mockGet.mockReturnValue({ value: 'expired-or-unknown-token' });
    mockValidateSuperAdminSession.mockResolvedValue(null);

    await requireAuthenticatedSuperAdmin();

    expect(mockValidateSuperAdminSession).toHaveBeenCalledWith('expired-or-unknown-token');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('returns the authenticated admin and does not redirect when the session is valid', async () => {
    const admin = { id: '1', email: 'admin@dossipv.tn' };
    mockGet.mockReturnValue({ value: 'valid-token' });
    mockValidateSuperAdminSession.mockResolvedValue(admin);

    const result = await requireAuthenticatedSuperAdmin();

    expect(result).toEqual(admin);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm --prefix apps/web test -- test/admin-layout-guard.test.ts`
Expected: FAIL — `Cannot find module '../app/admin/(protected)/layout'`.

- [ ] **Step 8: Implement the layout guard**

```tsx
// apps/web/app/admin/(protected)/layout.tsx
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSuperAdminSession, type AuthenticatedSuperAdmin } from '@dossipv/auth';

const ADMIN_SESSION_COOKIE_NAME = 'dossipv_admin_session';

export async function requireAuthenticatedSuperAdmin(): Promise<AuthenticatedSuperAdmin> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/admin/login');
    return undefined as never;
  }

  const admin = await validateSuperAdminSession(token);

  if (!admin) {
    redirect('/admin/login');
    return undefined as never;
  }

  return admin;
}

export default async function AdminProtectedLayout({ children }: { children: ReactNode }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  return <>{children}</>;
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npm --prefix apps/web test -- test/admin-layout-guard.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 10: Write the failing test for the logout action**

```ts
// apps/web/test/admin-logout-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockDelete, mockCookies, mockRedirect, mockLogoutSuperAdmin } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockDelete = vi.fn();
  return {
    mockGet,
    mockDelete,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet, delete: mockDelete })),
    mockRedirect: vi.fn(),
    mockLogoutSuperAdmin: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, logoutSuperAdmin: mockLogoutSuperAdmin };
});

import { logoutAdminAction } from '../app/admin/(protected)/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockClear();
  mockRedirect.mockClear();
  mockLogoutSuperAdmin.mockClear();
});

describe('logoutAdminAction', () => {
  it('calls logoutSuperAdmin() with the cookie token, clears the cookie, and redirects to /admin/login', async () => {
    mockGet.mockReturnValue({ value: 'a-real-admin-token' });
    mockLogoutSuperAdmin.mockResolvedValue(undefined);

    await logoutAdminAction();

    expect(mockLogoutSuperAdmin).toHaveBeenCalledWith('a-real-admin-token');
    expect(mockDelete).toHaveBeenCalledWith('dossipv_admin_session');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('still clears the cookie and redirects even when there is no cookie to begin with', async () => {
    mockGet.mockReturnValue(undefined);

    await logoutAdminAction();

    expect(mockLogoutSuperAdmin).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('dossipv_admin_session');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npm --prefix apps/web test -- test/admin-logout-actions.test.ts`
Expected: FAIL — `Cannot find module '../app/admin/(protected)/actions'`.

- [ ] **Step 12: Implement the logout action**

```ts
// apps/web/app/admin/(protected)/actions.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { logoutSuperAdmin } from '@dossipv/auth';

const ADMIN_SESSION_COOKIE_NAME = 'dossipv_admin_session';

export async function logoutAdminAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (token) {
    await logoutSuperAdmin(token);
  }

  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
  redirect('/admin/login');
}
```

- [ ] **Step 13: Run it to verify it passes**

Run: `npm --prefix apps/web test -- test/admin-logout-actions.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 14: Create a placeholder dashboard page (filled in by Task 3)**

```tsx
// apps/web/app/admin/(protected)/page.tsx
export default function AdminDashboardPage(): React.JSX.Element {
  return <main>Admin dashboard placeholder — filled in by Task 3.</main>;
}
```

- [ ] **Step 15: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add "apps/web/app/admin/login/actions.ts" "apps/web/app/admin/login/page.tsx" "apps/web/app/admin/(protected)/layout.tsx" "apps/web/app/admin/(protected)/actions.ts" "apps/web/app/admin/(protected)/page.tsx" "apps/web/test/admin-login-actions.test.ts" "apps/web/test/admin-layout-guard.test.ts" "apps/web/test/admin-logout-actions.test.ts"
git commit -m "feat(admin): add super-admin login, logout, and layout guard"
```

---

## Task 2: Installer list page

**Files:**
- Create: `apps/web/app/admin/(protected)/installers/page.tsx`
- Create: `apps/web/test/admin-installer-list.test.ts`

**Interfaces:**
- Consumes: `db` from `@dossipv/db` (via a small pure helper function this task exports for
  testability — Prisma queries against a real Server Component are not directly unit-testable,
  same honest limitation as sub-project #4's spec documented, so the row-shaping logic is
  pulled into an exported, independently testable function).
- Produces: `shapeInstallerRow(company, now)` — a pure function, exported from
  `installers/page.tsx`, consumed only by this task's own test (no downstream task needs it).

- [ ] **Step 1: Write the failing test for the row-shaping logic**

```ts
// apps/web/test/admin-installer-list.test.ts
import { describe, it, expect } from 'vitest';
import { shapeInstallerRow, type CompanyWithRelationsForList } from '../app/admin/(protected)/installers/page';

function makeCompany(overrides: Partial<CompanyWithRelationsForList> = {}): CompanyWithRelationsForList {
  return {
    id: 'company-1',
    name: 'Solar Co',
    subscription: null,
    users: [],
    projects: [],
    ...overrides,
  };
}

describe('shapeInstallerRow', () => {
  const now = new Date('2026-10-15T00:00:00Z');

  it('shows "Aucun abonnement" and no expiry highlight when subscription is null', () => {
    const row = shapeInstallerRow(makeCompany({ subscription: null }), now);

    expect(row.planName).toBe('Aucun abonnement');
    expect(row.isExpiringOrExpired).toBe(false);
  });

  it('highlights a subscription expiring within 7 days', () => {
    const row = shapeInstallerRow(
      makeCompany({
        subscription: {
          status: 'ACTIVE',
          periodEnd: new Date('2026-10-18T00:00:00Z'),
          plan: { name: 'Standard' },
        },
      }),
      now,
    );

    expect(row.isExpiringOrExpired).toBe(true);
  });

  it('highlights an already-expired subscription even if status is still ACTIVE', () => {
    const row = shapeInstallerRow(
      makeCompany({
        subscription: {
          status: 'ACTIVE',
          periodEnd: new Date('2026-09-01T00:00:00Z'),
          plan: { name: 'Standard' },
        },
      }),
      now,
    );

    expect(row.isExpiringOrExpired).toBe(true);
  });

  it('does not highlight a subscription with more than 7 days remaining', () => {
    const row = shapeInstallerRow(
      makeCompany({
        subscription: {
          status: 'ACTIVE',
          periodEnd: new Date('2026-11-01T00:00:00Z'),
          plan: { name: 'Standard' },
        },
      }),
      now,
    );

    expect(row.isExpiringOrExpired).toBe(false);
  });

  it('counts only this-month dossier jobs across all of the company\'s projects', () => {
    const row = shapeInstallerRow(
      makeCompany({
        projects: [
          { jobs: [{ startedAt: new Date('2026-10-01T00:00:00Z') }, { startedAt: new Date('2026-09-15T00:00:00Z') }] },
          { jobs: [{ startedAt: new Date('2026-10-10T00:00:00Z') }] },
        ],
      }),
      now,
    );

    expect(row.dossiersThisMonth).toBe(2);
  });

  it('derives last login as the most recent session createdAt across all users', () => {
    const row = shapeInstallerRow(
      makeCompany({
        users: [
          { sessions: [{ createdAt: new Date('2026-10-01T00:00:00Z') }] },
          { sessions: [{ createdAt: new Date('2026-10-14T00:00:00Z') }] },
        ],
      }),
      now,
    );

    expect(row.lastLogin).toEqual(new Date('2026-10-14T00:00:00Z'));
  });

  it('shows null last login when no user has ever had a session', () => {
    const row = shapeInstallerRow(makeCompany({ users: [{ sessions: [] }] }), now);

    expect(row.lastLogin).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix apps/web test -- test/admin-installer-list.test.ts`
Expected: FAIL — `Cannot find module '../app/admin/(protected)/installers/page'`.

- [ ] **Step 3: Implement the installer list page**

```tsx
// apps/web/app/admin/(protected)/installers/page.tsx
import Link from 'next/link';
import { db } from '@dossipv/db';

export interface CompanyWithRelationsForList {
  id: string;
  name: string;
  subscription: { status: string; periodEnd: Date; plan: { name: string } } | null;
  users: { sessions: { createdAt: Date }[] }[];
  projects: { jobs: { startedAt: Date }[] }[];
}

export interface InstallerRow {
  id: string;
  name: string;
  planName: string;
  subscriptionStatus: string | null;
  periodEnd: Date | null;
  isExpiringOrExpired: boolean;
  dossiersThisMonth: number;
  lastLogin: Date | null;
}

const EXPIRY_WARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function shapeInstallerRow(company: CompanyWithRelationsForList, now: Date): InstallerRow {
  const periodEnd = company.subscription?.periodEnd ?? null;
  const isExpiringOrExpired = periodEnd !== null && periodEnd.getTime() - now.getTime() <= EXPIRY_WARNING_WINDOW_MS;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dossiersThisMonth = company.projects.reduce(
    (total, project) => total + project.jobs.filter((job) => job.startedAt >= monthStart).length,
    0,
  );

  const allSessionTimes = company.users.flatMap((user) => user.sessions.map((session) => session.createdAt.getTime()));
  const lastLogin = allSessionTimes.length > 0 ? new Date(Math.max(...allSessionTimes)) : null;

  return {
    id: company.id,
    name: company.name,
    planName: company.subscription?.plan.name ?? 'Aucun abonnement',
    subscriptionStatus: company.subscription?.status ?? null,
    periodEnd,
    isExpiringOrExpired,
    dossiersThisMonth,
    lastLogin,
  };
}

export default async function InstallerListPage(): Promise<React.JSX.Element> {
  const companies = await db.company.findMany({
    include: {
      subscription: { include: { plan: true } },
      users: { include: { sessions: { orderBy: { createdAt: 'desc' }, take: 1 } } },
      projects: { include: { jobs: true } },
    },
    orderBy: { name: 'asc' },
  });

  const rows = companies.map((company) => shapeInstallerRow(company, new Date()));

  return (
    <main>
      <h1>Installateurs</h1>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Plan</th>
            <th>Statut</th>
            <th>Fin d&apos;abonnement</th>
            <th>Dossiers ce mois</th>
            <th>Dernière connexion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={row.isExpiringOrExpired ? { background: '#ffe5e5' } : undefined}>
              <td>
                <Link href={`/admin/installers/${row.id}`}>{row.name}</Link>
              </td>
              <td>{row.planName}</td>
              <td>{row.subscriptionStatus ?? '—'}</td>
              <td>{row.periodEnd ? row.periodEnd.toLocaleDateString('fr-FR') : '—'}</td>
              <td>{row.dossiersThisMonth}</td>
              <td>{row.lastLogin ? row.lastLogin.toLocaleString('fr-FR') : 'Jamais'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix apps/web test -- test/admin-installer-list.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/admin/(protected)/installers/page.tsx" "apps/web/test/admin-installer-list.test.ts"
git commit -m "feat(admin): add installer list page"
```

---

## Task 3: Dashboard aggregates

**Files:**
- Modify: `apps/web/app/admin/(protected)/page.tsx`
- Create: `apps/web/test/admin-dashboard.test.ts`

**Interfaces:**
- Consumes: `db` from `@dossipv/db`.
- Produces: `getMonthStart(now)` and `computeDashboardStats(now)` — exported pure/DB-calling
  functions from `(protected)/page.tsx`, consumed only by this task's own test.

- [ ] **Step 1: Write the failing test for the month-boundary helper**

```ts
// apps/web/test/admin-dashboard.test.ts
import { describe, it, expect } from 'vitest';
import { getMonthStart } from '../app/admin/(protected)/page';

describe('getMonthStart', () => {
  it('returns the first instant of the given date\'s month', () => {
    const result = getMonthStart(new Date('2026-10-15T13:45:00Z'));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(9); // October is month index 9
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('crosses a year boundary correctly for January', () => {
    const result = getMonthStart(new Date('2027-01-05T00:00:00Z'));
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix apps/web test -- test/admin-dashboard.test.ts`
Expected: FAIL — `getMonthStart is not exported` (the placeholder page from Task 1 has no such export).

- [ ] **Step 3: Implement the dashboard page**

```tsx
// apps/web/app/admin/(protected)/page.tsx
import { db } from '@dossipv/db';

export function getMonthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export interface DashboardStats {
  activeInstallers: number;
  dossiersThisMonth: number;
  claudeCostThisMonthUsd: number;
  totalRevenueTnd: number;
}

export async function computeDashboardStats(now: Date): Promise<DashboardStats> {
  const monthStart = getMonthStart(now);

  const [activeInstallers, dossiersThisMonth, claudeCostAgg, revenueAgg] = await Promise.all([
    db.company.count(),
    db.dossierJob.count({ where: { startedAt: { gte: monthStart } } }),
    db.claudeUsageLog.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStart } } }),
    db.payment.aggregate({ _sum: { amountTnd: true } }),
  ]);

  return {
    activeInstallers,
    dossiersThisMonth,
    claudeCostThisMonthUsd: Number(claudeCostAgg._sum.costUsd ?? 0),
    totalRevenueTnd: Number(revenueAgg._sum.amountTnd ?? 0),
  };
}

export default async function AdminDashboardPage(): Promise<React.JSX.Element> {
  const stats = await computeDashboardStats(new Date());

  return (
    <main>
      <h1>Tableau de bord</h1>
      <ul>
        <li>Installateurs actifs : {stats.activeInstallers}</li>
        <li>Dossiers générés ce mois : {stats.dossiersThisMonth}</li>
        <li>Coût Claude ce mois : {stats.claudeCostThisMonthUsd.toFixed(2)} $</li>
        <li>Revenu total : {stats.totalRevenueTnd.toFixed(2)} TND</li>
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix apps/web test -- test/admin-dashboard.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/admin/(protected)/page.tsx" "apps/web/test/admin-dashboard.test.ts"
git commit -m "feat(admin): add dashboard aggregate stats"
```

---

## Task 4: Installer detail page and its mutation actions

**Files:**
- Create: `apps/web/app/admin/(protected)/installers/[id]/page.tsx`
- Create: `apps/web/app/admin/(protected)/installers/[id]/actions.ts`
- Create: `apps/web/test/admin-installer-detail-actions.test.ts`

**Interfaces:**
- Consumes: `db` from `@dossipv/db`, `redirect` from `next/navigation`, `notFound` from
  `next/navigation`.
- Produces: `suspendSubscriptionAction`, `activateSubscriptionAction`, `recordPaymentAction`,
  `updatePeriodEndAction` — Server Actions local to this task, not consumed elsewhere.

- [ ] **Step 1: Write the failing tests for the mutation actions**

```ts
// apps/web/test/admin-installer-detail-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockSubscriptionUpdate, mockPaymentCreate } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockSubscriptionUpdate: vi.fn(),
  mockPaymentCreate: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      subscription: { update: mockSubscriptionUpdate },
      payment: { create: mockPaymentCreate },
    },
  };
});

import {
  suspendSubscriptionAction,
  activateSubscriptionAction,
  recordPaymentAction,
  updatePeriodEndAction,
} from '../app/admin/(protected)/installers/[id]/actions';

beforeEach(() => {
  mockRedirect.mockClear();
  mockSubscriptionUpdate.mockClear();
  mockPaymentCreate.mockClear();
});

describe('suspendSubscriptionAction', () => {
  it('sets the subscription status to SUSPENDED and redirects back to the detail page', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    await suspendSubscriptionAction('company-1');

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { status: 'SUSPENDED' } });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('activateSubscriptionAction', () => {
  it('sets the subscription status to ACTIVE and redirects back to the detail page', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    await activateSubscriptionAction('company-1');

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { status: 'ACTIVE' } });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('recordPaymentAction', () => {
  it('creates a Payment row with recordedByAdmin true and redirects back', async () => {
    mockPaymentCreate.mockResolvedValue({});

    const formData = new FormData();
    formData.set('amountTnd', '150.00');
    formData.set('method', 'MANUAL');
    formData.set('note', 'Paiement en espèces');

    await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).toHaveBeenCalledWith({
      data: { companyId: 'company-1', amountTnd: 150, method: 'MANUAL', note: 'Paiement en espèces', recordedByAdmin: true },
    });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });

  it('rejects a non-numeric amount without creating a Payment row', async () => {
    const formData = new FormData();
    formData.set('amountTnd', 'not-a-number');
    formData.set('method', 'MANUAL');

    const result = await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Montant invalide.' });
  });

  it('rejects a negative amount without creating a Payment row', async () => {
    const formData = new FormData();
    formData.set('amountTnd', '-50');
    formData.set('method', 'MANUAL');

    const result = await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Montant invalide.' });
  });
});

describe('updatePeriodEndAction', () => {
  it('updates the subscription periodEnd and redirects back', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    const formData = new FormData();
    formData.set('periodEnd', '2027-01-01');

    await updatePeriodEndAction('company-1', formData);

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      data: { periodEnd: new Date('2027-01-01') },
    });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix apps/web test -- test/admin-installer-detail-actions.test.ts`
Expected: FAIL — `Cannot find module '../app/admin/(protected)/installers/[id]/actions'`.

- [ ] **Step 3: Implement the mutation actions**

```ts
// apps/web/app/admin/(protected)/installers/[id]/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';

export interface RecordPaymentActionState {
  error: string;
}

export async function suspendSubscriptionAction(companyId: string): Promise<void> {
  await db.subscription.update({ where: { companyId }, data: { status: 'SUSPENDED' } });
  redirect(`/admin/installers/${companyId}`);
}

export async function activateSubscriptionAction(companyId: string): Promise<void> {
  await db.subscription.update({ where: { companyId }, data: { status: 'ACTIVE' } });
  redirect(`/admin/installers/${companyId}`);
}

export async function recordPaymentAction(
  companyId: string,
  _prevState: RecordPaymentActionState | undefined,
  formData: FormData,
): Promise<RecordPaymentActionState | undefined> {
  const amountField = formData.get('amountTnd');
  const methodField = formData.get('method');
  const noteField = formData.get('note');

  if (typeof amountField !== 'string' || typeof methodField !== 'string') {
    return { error: 'Montant invalide.' };
  }

  const amountTnd = Number(amountField);
  if (!Number.isFinite(amountTnd) || amountTnd <= 0) {
    return { error: 'Montant invalide.' };
  }

  await db.payment.create({
    data: {
      companyId,
      amountTnd,
      method: methodField as 'MANUAL' | 'KONNECT',
      note: typeof noteField === 'string' && noteField.length > 0 ? noteField : null,
      recordedByAdmin: true,
    },
  });

  redirect(`/admin/installers/${companyId}`);
}

export async function updatePeriodEndAction(companyId: string, formData: FormData): Promise<void> {
  const periodEndField = formData.get('periodEnd');

  if (typeof periodEndField !== 'string') {
    redirect(`/admin/installers/${companyId}`);
    return undefined as never;
  }

  await db.subscription.update({ where: { companyId }, data: { periodEnd: new Date(periodEndField) } });
  redirect(`/admin/installers/${companyId}`);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix apps/web test -- test/admin-installer-detail-actions.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Implement the detail page**

```tsx
// apps/web/app/admin/(protected)/installers/[id]/page.tsx
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import {
  suspendSubscriptionAction,
  activateSubscriptionAction,
  recordPaymentAction,
  updatePeriodEndAction,
} from './actions';

export default async function InstallerDetailPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;

  const company = await db.company.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!company) {
    notFound();
  }

  const boundSuspend = suspendSubscriptionAction.bind(null, company.id);
  const boundActivate = activateSubscriptionAction.bind(null, company.id);
  const boundRecordPayment = recordPaymentAction.bind(null, company.id);
  const boundUpdatePeriodEnd = updatePeriodEndAction.bind(null, company.id);

  return (
    <main>
      <h1>{company.name}</h1>
      <section>
        <h2>Informations</h2>
        <p>Adresse : {company.address}</p>
        <p>Téléphone : {company.phone}</p>
        <p>Email : {company.email}</p>
        <p>Code ANME : {company.anmeCode} ({company.anmeCategory})</p>
      </section>

      <section>
        <h2>Abonnement</h2>
        {company.subscription ? (
          <>
            <p>Plan : {company.subscription.plan.name}</p>
            <p>Statut : {company.subscription.status}</p>
            <p>Fin de période : {company.subscription.periodEnd.toLocaleDateString('fr-FR')}</p>
            {company.subscription.status !== 'SUSPENDED' && (
              <form action={boundSuspend}>
                <button type="submit">Suspendre l&apos;abonnement</button>
              </form>
            )}
            {company.subscription.status !== 'ACTIVE' && (
              <form action={boundActivate}>
                <button type="submit">Activer l&apos;abonnement</button>
              </form>
            )}
            <form action={boundUpdatePeriodEnd}>
              <label>
                Nouvelle fin de période
                <input type="date" name="periodEnd" required />
              </label>
              <button type="submit">Mettre à jour</button>
            </form>
          </>
        ) : (
          <p>Aucun abonnement</p>
        )}
      </section>

      {company.subscription && (
        <section>
          <h2>Enregistrer un paiement</h2>
          <form action={boundRecordPayment}>
            <label>
              Montant (TND)
              <input type="number" name="amountTnd" step="0.01" required />
            </label>
            <label>
              Méthode
              <select name="method" required>
                <option value="MANUAL">Manuel</option>
                <option value="KONNECT">Konnect</option>
              </select>
            </label>
            <label>
              Note
              <input type="text" name="note" />
            </label>
            <button type="submit">Enregistrer</button>
          </form>
        </section>
      )}

      <section>
        <h2>Historique des paiements</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Montant</th>
              <th>Méthode</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {company.payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.createdAt.toLocaleDateString('fr-FR')}</td>
                <td>{payment.amountTnd.toString()} TND</td>
                <td>{payment.method}</td>
                <td>{payment.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/admin/(protected)/installers/[id]/page.tsx" "apps/web/app/admin/(protected)/installers/[id]/actions.ts" "apps/web/test/admin-installer-detail-actions.test.ts"
git commit -m "feat(admin): add installer detail page with subscription and payment actions"
```

---

## Task 5: Live verification and whole-package review

**Files:** none — verification and review only, code changes only if a real gap is found
(matching sub-project #4's Task 5/6 precedent, which did find and fix two real bugs this way).

**Interfaces:** none new.

- [ ] **Step 1: Confirm the SSH tunnel to Postgres is active**

Run: `node -e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);}); s.setTimeout(3000,()=>{console.error('TUNNEL DOWN: timeout');process.exit(1);});"`
Expected: `tunnel alive`. If down, re-establish with
`ssh -f -N -L 5433:127.0.0.1:5433 dossipv-server`.

- [ ] **Step 2: Seed a real super-admin and a company with varied subscription states**

Write and run a one-off script (via `npx tsx`, run from the repo root so workspace package
resolution works — place the script file directly at the repo root temporarily and delete it
immediately after running, same pattern used in sub-project #4's own Task 5) that:
- Creates a `SuperAdmin` row (`db.superAdmin.create`) with a real bcrypt hash of a known
  password, if one doesn't already exist for a fixed verification email.
- Confirms at least one seeded `Company` has a `Subscription` row and at least one has none
  (check what the existing seed data from `packages/db/prisma/seed.ts` already provides before
  creating new rows — reuse existing data where possible rather than duplicating).
Expected: a real super-admin login works, and both the "has subscription" and "no
subscription" cases in the installer list are exercisable.

- [ ] **Step 3: Start the dev server in the background**

Run: `npm run dev --workspace=@dossipv/web` (background). Confirm the actual port from its
own output (may not be 3000 if another process holds it — check for a stale process the way
sub-project #4's Task 5 did, and stop it if found before proceeding).

- [ ] **Step 4: Exercise the GET-based pages with curl**

```bash
# No cookie: every /admin/* page except /admin/login should redirect there.
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/admin
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/admin/installers

# /admin/login itself should render directly.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/login
```

Expected: both protected routes 307 to `/admin/login`; the login page itself returns 200.

- [ ] **Step 5: Mint a real super-admin session token and verify the protected pages render**

Using the same `npx tsx` ad hoc script pattern as sub-project #4's Task 5 (write to repo root,
run, delete immediately):

```ts
import { loginSuperAdmin } from '@dossipv/auth';
const result = await loginSuperAdmin('<verification admin email from Step 2>', '<its known password>');
console.log(result.token);
```

Then:

```bash
TOKEN="<token from above>"
curl -s -b "dossipv_admin_session=$TOKEN" http://localhost:3000/admin -o /tmp/admin-dashboard.html -w "%{http_code}\n"
grep -o "Installateurs actifs : [0-9]*" /tmp/admin-dashboard.html

curl -s -b "dossipv_admin_session=$TOKEN" http://localhost:3000/admin/installers -o /tmp/admin-list.html -w "%{http_code}\n"
```

Expected: both return 200; the dashboard shows a real, non-placeholder installer count; the
list page's HTML contains the names of the companies seeded in Step 2, including the one with
no subscription showing "Aucun abonnement" rather than crashing.

- [ ] **Step 6: Verify one installer detail page renders, including the no-subscription case**

```bash
# Replace <company-id> with a real seeded company id from Step 2/5's output.
curl -s -b "dossipv_admin_session=$TOKEN" http://localhost:3000/admin/installers/<company-id-with-subscription> -o /tmp/admin-detail-with-sub.html -w "%{http_code}\n"
grep -o "Abonnement" /tmp/admin-detail-with-sub.html

curl -s -b "dossipv_admin_session=$TOKEN" http://localhost:3000/admin/installers/<company-id-without-subscription> -o /tmp/admin-detail-no-sub.html -w "%{http_code}\n"
grep -o "Aucun abonnement" /tmp/admin-detail-no-sub.html
```

Expected: both return 200 (not 500) — this is the exact "no Subscription row" crash risk this
plan's own Review Focus names, and live-rendering both cases against the real database is the
only way to prove it, since no unit test renders the actual JSX.

- [ ] **Step 7: Stop the dev server**

Stop the background process started in Step 3.

- [ ] **Step 8: Run the full workspace suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS. (If a pre-existing flaky test from `packages/auth` times out under
full-workspace parallel load — as happened once in sub-project #4's own Task 5 — re-run just
that file in isolation to confirm it's a flake, not a regression, before treating the suite as
green; do not silently ignore a failure without that check.)

- [ ] **Step 9: Confirm no password or secret leaked into a committed file**

Run: `grep -rn "<verification password used in Step 2>" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: no matches outside of this task's own throwaway verification script, which must not
have been committed — confirm via `git status --porcelain` that no stray script file is
present at the repo root.

- [ ] **Step 10: Update project memory**

Update `C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
to record this slice as built, matching its existing style (what was built, what was
live-verified vs. unit-tested only, any real bugs found and fixed, what's deferred to a future
slice per the spec's own §1).

- [ ] **Step 11: Final commit if Steps 5, 6, or 9 found anything to fix**

```bash
git add -A
git commit -m "fix(admin): close a gap found in the super-admin UI's final review"
```

(Skip entirely if nothing was found.)
