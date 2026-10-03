# Web UI Login & Session Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the installer-facing login page, logout action, an authenticated route-group
layout guard, and a minimal authenticated dashboard in `apps/web`, consuming the finished
`@dossipv/auth` package end to end.

**Architecture:** Server Actions for `login`/`logout` (not API routes), cookie-setting inside
those actions via Next's `cookies()`, a `(app)` route-group layout that calls
`validateSession()` and redirects unauthenticated requests to `/login`. No client-side session
state library — each authenticated page calls `validateSession()` itself to get the current
user.

**Tech Stack:** Next.js 16.3.8 (App Router, Server Actions), React 19.3 (`useActionState`),
`@dossipv/auth`, `@dossipv/db` (transitively, via `validateSession`), Vitest with
`vi.mock('next/headers')`/`vi.mock('next/navigation')` for action-level unit tests.

**Spec:** `docs/superpowers/specs/2026-10-03-web-ui-login-design.md`

## Global Constraints

- `apps/web` gains `"@dossipv/auth": "*"` and `"@dossipv/db": "*"` as dependencies — both
  already exist as workspace packages (`@dossipv/db` is already an indirect dependency of
  `@dossipv/auth`), so this only adds the explicit `package.json` entries and npm workspace
  symlinks, no new external packages.
- Every Server Action file starts with the `'use server'` directive as its first line — Next
  enforces this at build time, not just a convention.
- `cookies()` is `async` in this Next version (returns a `Promise<ReadonlyRequestCookies>`) —
  every call site must `await` it. This is a real, confirmed-against-the-installed-version
  API shape, not an assumption (verified via `node_modules/next/dist/server/request/cookies.d.ts`
  during this plan's own writing).
- `redirect()` from `next/navigation` throws internally (Next's own control-flow mechanism) —
  any code written after a `redirect()` call in the same function is unreachable and must not
  be relied upon to run. Tests that mock `redirect` must mock it as a function that does NOT
  actually throw (a plain `vi.fn()`), so the mocked test can inspect "was redirect called with
  the right path" without the test itself throwing.
- French-language user-facing strings exactly as given in the design spec §4 — do not
  re-wordsmith them mid-implementation.
- Needs the SSH tunnel to Postgres alive for any step that runs `next dev` and actually
  exercises `validateSession()` against a real session (the live-verification task) — check
  per that task's own first step, same convention as the `@dossipv/db`/`@dossipv/auth` plans.

## Review Focus

- **`redirect()` called from inside a `try/catch` that might swallow it**: `redirect()`'s
  internal throw must propagate all the way up to Next's router — a `catch` block written to
  handle `InvalidCredentialsError`/`TooManyAttemptsError` around the whole action body could
  accidentally also catch `redirect()`'s internal signal if the redirect call is placed inside
  the same `try` as the error-prone `login()` call. The task that writes `loginAction` must
  structure the `try/catch` so `redirect()` runs OUTSIDE any catch that could intercept it (i.e.
  catch only around the `login()` call itself, then call `redirect()` after the catch block
  entirely, not inside the `try`).
- **The layout guard must redirect on a missing cookie AND on an invalid/expired session
  distinctly covered** — a test that only checks "no cookie → redirect" could pass even if the
  code never actually calls `validateSession()` at all for the present-but-invalid-token case.
  Both branches need their own test with their own mock setup.
- **The logout action must clear the cookie even if `@dossipv/auth`'s `logout()` call fails or
  the token was already invalid** — `logout()` itself is designed to be a no-op (not throw) for
  an unknown token (confirmed in `@dossipv/auth`'s own test suite), but the action's own cookie
  deletion must not be skipped if that call is reordered carelessly during implementation.
- **The dashboard page must not render any part of its authenticated content before confirming
  `validateSession()` succeeded** — i.e. no flash of "Bienvenue, undefined" before a redirect
  resolves. Since this is a Server Component awaiting `validateSession()` before returning any
  JSX, this is naturally satisfied by the architecture, but the task implementing it should
  structure the code so the `null` case returns/redirects before any JSX referencing the user
  object is constructed, not after.
- **The login form's password field must never be logged or included in any error object
  returned to the client** — `loginAction`'s returned `{ error: string }` must never echo back
  the submitted password or any part of the thrown error's internal details (e.g. a raw Prisma
  error message) — only the two hand-written French strings from the design spec.

---

## Task 1: Add dependencies and scaffold the route structure

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/app/login/page.tsx` (placeholder)
- Create: `apps/web/app/(app)/layout.tsx` (placeholder)
- Create: `apps/web/app/(app)/dashboard/page.tsx` (placeholder)

**Interfaces:**
- Consumes: `@dossipv/auth`, `@dossipv/db` (added as dependencies, not yet imported).
- Produces: the route skeleton later tasks fill in.

- [ ] **Step 1: Add dependencies to `apps/web/package.json`**

Read the current file first. Add to its `dependencies`:

```json
"@dossipv/auth": "*",
"@dossipv/db": "*",
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: no errors; `node_modules/@dossipv/auth` and `node_modules/@dossipv/db` symlinked
into place (if not already, from the earlier sub-projects).

- [ ] **Step 3: Create placeholder pages**

```tsx
// apps/web/app/login/page.tsx
export default function LoginPage(): React.JSX.Element {
  return <main>Login page placeholder — filled in by Task 2.</main>;
}
```

```tsx
// apps/web/app/(app)/layout.tsx
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return <>{children}</>;
}
```

```tsx
// apps/web/app/(app)/dashboard/page.tsx
export default function DashboardPage(): React.JSX.Element {
  return <main>Dashboard placeholder — filled in by Task 4.</main>;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/app/login/page.tsx "apps/web/app/(app)/layout.tsx" "apps/web/app/(app)/dashboard/page.tsx" package-lock.json
git commit -m "chore(web): add auth dependencies, scaffold login/dashboard route structure"
```

---

## Task 2: Login Server Action and page

**Files:**
- Create: `apps/web/app/login/actions.ts`
- Create: `apps/web/test/login-actions.test.ts`
- Modify: `apps/web/app/login/page.tsx`

**Interfaces:**
- Consumes: `login`, `InvalidCredentialsError`, `TooManyAttemptsError` from `@dossipv/auth`;
  `cookies` from `next/headers`; `redirect` from `next/navigation`.
- Produces: `loginAction(prevState, formData): Promise<{ error: string } | undefined>` —
  consumed by `login/page.tsx`'s form via `useActionState`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/login-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn();
const mockCookies = vi.fn(() => Promise.resolve({ set: mockSet }));
const mockRedirect = vi.fn();
const mockLogin = vi.fn();

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, login: mockLogin };
});

import { loginAction } from '../app/login/actions';
import { InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';

beforeEach(() => {
  mockSet.mockClear();
  mockRedirect.mockClear();
  mockLogin.mockClear();
});

describe('loginAction', () => {
  it('sets the session cookie and redirects to /dashboard on success', async () => {
    mockLogin.mockResolvedValue({ user: { id: '1', companyId: 'c1', email: 'a@b.com', fullName: 'A', role: 'OWNER' }, token: 'raw-token' });

    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'correct-password');

    await loginAction(undefined, formData);

    expect(mockSet).toHaveBeenCalledWith('dossipv_session', 'raw-token', expect.objectContaining({ httpOnly: true }));
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('returns a French error and does not redirect on InvalidCredentialsError', async () => {
    mockLogin.mockRejectedValue(new InvalidCredentialsError());

    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'wrong-password');

    const result = await loginAction(undefined, formData);

    expect(result).toEqual({ error: 'Email ou mot de passe incorrect.' });
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns a French error and does not redirect on TooManyAttemptsError', async () => {
    mockLogin.mockRejectedValue(new TooManyAttemptsError());

    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'wrong-password');

    const result = await loginAction(undefined, formData);

    expect(result).toEqual({ error: 'Trop de tentatives échouées. Réessayez plus tard.' });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('never echoes the submitted password back in the error result', async () => {
    mockLogin.mockRejectedValue(new InvalidCredentialsError());

    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'super-secret-password-value');

    const result = await loginAction(undefined, formData);

    expect(JSON.stringify(result)).not.toContain('super-secret-password-value');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run test/login-actions.test.ts`
Expected: FAIL — `Cannot find module '../app/login/actions'`.

- [ ] **Step 3: Implement `login/actions.ts`**

```ts
// apps/web/app/login/actions.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { login, InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';

const SESSION_COOKIE_NAME = 'dossipv_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // matches @dossipv/auth's SESSION_LIFETIME_MS

export interface LoginActionState {
  error: string;
}

export async function loginAction(
  _prevState: LoginActionState | undefined,
  formData: FormData,
): Promise<LoginActionState | undefined> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  // Only the login() call is inside this try — redirect() below runs outside any catch that
  // could intercept its internal throw (see this plan's Review Focus on this exact risk).
  let token: string;
  try {
    const result = await login(email, password);
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
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect('/dashboard');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run test/login-actions.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Implement the login page**

```tsx
// apps/web/app/login/page.tsx
'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <main>
      <h1>Connexion</h1>
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

Note: the page itself is a Client Component (`'use client'`) because `useActionState` is a
React hook — the Server Action it calls (`loginAction`) still runs on the server; only the
form-rendering/state-tracking code runs client-side, which is the standard Next App Router
pattern for this exact case.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/login/actions.ts" "apps/web/app/login/page.tsx" "apps/web/test/login-actions.test.ts"
git commit -m "feat(web): add login Server Action and form page"
```

---

## Task 3: Authenticated layout guard

**Files:**
- Modify: `apps/web/app/(app)/layout.tsx`
- Create: `apps/web/test/app-layout-guard.test.ts`

**Interfaces:**
- Consumes: `validateSession` from `@dossipv/auth`; `cookies` from `next/headers`; `redirect`
  from `next/navigation`.
- Produces: a layout that redirects to `/login` for any unauthenticated request under `(app)`.

This task's own code is hard to unit-test as a React component directly (Server Component
layouts aren't easily rendered in Vitest without a full Next test harness, which this repo
doesn't have). Per the design spec §5's testing caveat, this task extracts the actual guard
logic into a plain, testable function and has the layout component call it — the function
gets real unit tests; the component itself is verified live in Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/app-layout-guard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockCookies = vi.fn(() => Promise.resolve({ get: mockGet }));
const mockRedirect = vi.fn();
const mockValidateSession = vi.fn();

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mockValidateSession };
});

import { requireAuthenticatedCompanyUser } from '../app/(app)/layout';

beforeEach(() => {
  mockGet.mockReset();
  mockRedirect.mockClear();
  mockValidateSession.mockClear();
});

describe('requireAuthenticatedCompanyUser', () => {
  it('redirects to /login when no session cookie is present', async () => {
    mockGet.mockReturnValue(undefined);

    await requireAuthenticatedCompanyUser();

    expect(mockRedirect).toHaveBeenCalledWith('/login');
    expect(mockValidateSession).not.toHaveBeenCalled();
  });

  it('redirects to /login when the cookie is present but validateSession returns null', async () => {
    mockGet.mockReturnValue({ value: 'some-expired-or-unknown-token' });
    mockValidateSession.mockResolvedValue(null);

    await requireAuthenticatedCompanyUser();

    expect(mockValidateSession).toHaveBeenCalledWith('some-expired-or-unknown-token');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('returns the authenticated user and does not redirect when the session is valid', async () => {
    const user = { id: '1', companyId: 'c1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };
    mockGet.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue(user);

    const result = await requireAuthenticatedCompanyUser();

    expect(result).toEqual(user);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run test/app-layout-guard.test.ts`
Expected: FAIL — `Cannot find module '../app/(app)/layout'` or
`requireAuthenticatedCompanyUser is not exported`.

- [ ] **Step 3: Implement the layout with the extracted guard function**

```tsx
// apps/web/app/(app)/layout.tsx
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSession, type AuthenticatedCompanyUser } from '@dossipv/auth';

const SESSION_COOKIE_NAME = 'dossipv_session';

/**
 * Exported separately from the layout component so it has its own direct unit tests (a
 * Server Component layout isn't easily rendered in this repo's Vitest setup — see the plan's
 * own note on this). redirect() throws internally; when it's called here, the function never
 * returns, which TypeScript can't express without an explicit `never`-returning branch, so the
 * return type stays the resolved user type and callers rely on redirect() having already
 * thrown before reaching any code that would need a user value.
 */
export async function requireAuthenticatedCompanyUser(): Promise<AuthenticatedCompanyUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/login');
  }

  const user = await validateSession(token);

  if (!user) {
    redirect('/login');
  }

  return user;
}

export default async function AppLayout({ children }: { children: ReactNode }): Promise<React.JSX.Element> {
  await requireAuthenticatedCompanyUser();
  return <>{children}</>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run test/app-layout-guard.test.ts`
Expected: PASS, all 3 tests green. Note: in the mocked test environment, `redirect()` is a
plain `vi.fn()` that does NOT throw — so after `redirect('/login')` is "called" in the no-token
case, execution continues to `validateSession(token)` with `token` being `undefined`. The test
asserts `mockValidateSession` was NOT called for that case specifically because the real
`redirect()` would have already stopped execution — if this test ever shows
`mockValidateSession` being called in the no-token case, that is a sign the mock doesn't match
real `redirect()` behavior closely enough; add an early `return` after each `redirect()` call
in the implementation (not relying on the mock to stop execution) to make the function's
actual control flow correct independent of the test double's limitations.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(app)/layout.tsx" "apps/web/test/app-layout-guard.test.ts"
git commit -m "feat(web): add authenticated layout guard for the (app) route group"
```

---

## Task 4: Dashboard page and logout action

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx`
- Create: `apps/web/app/(app)/actions.ts`
- Create: `apps/web/test/logout-actions.test.ts`

**Interfaces:**
- Consumes: `requireAuthenticatedCompanyUser` (Task 3), `logout` from `@dossipv/auth`,
  `cookies` from `next/headers`, `redirect` from `next/navigation`.
- Produces: `logoutAction(): Promise<never>` and the rendered dashboard page — the final
  pieces completing the login→session→protected-page→logout loop.

- [ ] **Step 1: Write the failing tests for logoutAction**

```ts
// apps/web/test/logout-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockDelete = vi.fn();
const mockCookies = vi.fn(() => Promise.resolve({ get: mockGet, delete: mockDelete }));
const mockRedirect = vi.fn();
const mockLogout = vi.fn();

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, logout: mockLogout };
});

import { logoutAction } from '../app/(app)/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockClear();
  mockRedirect.mockClear();
  mockLogout.mockClear();
});

describe('logoutAction', () => {
  it('calls logout() with the cookie token, clears the cookie, and redirects to /login', async () => {
    mockGet.mockReturnValue({ value: 'a-real-token' });
    mockLogout.mockResolvedValue(undefined);

    await logoutAction();

    expect(mockLogout).toHaveBeenCalledWith('a-real-token');
    expect(mockDelete).toHaveBeenCalledWith('dossipv_session');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('still clears the cookie and redirects even when there is no cookie to begin with', async () => {
    mockGet.mockReturnValue(undefined);

    await logoutAction();

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('dossipv_session');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run test/logout-actions.test.ts`
Expected: FAIL — `Cannot find module '../app/(app)/actions'`.

- [ ] **Step 3: Implement `(app)/actions.ts`**

```ts
// apps/web/app/(app)/actions.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { logout } from '@dossipv/auth';

const SESSION_COOKIE_NAME = 'dossipv_session';

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await logout(token);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run test/logout-actions.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 5: Implement the dashboard page**

```tsx
// apps/web/app/(app)/dashboard/page.tsx
import { requireAuthenticatedCompanyUser } from '../layout';
import { logoutAction } from '../actions';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();

  return (
    <main>
      <h1>Bienvenue, {user.fullName}</h1>
      <form action={logoutAction}>
        <button type="submit">Se déconnecter</button>
      </form>
    </main>
  );
}
```

Note: calling `requireAuthenticatedCompanyUser()` again here (on top of the layout already
calling it) is the deliberate, documented duplication from the design spec §4 step 3 — the
layout's call is the guard (redirect-or-continue), this page's own call is how the page
actually gets `user.fullName` to render with. Per the plan's Review Focus on this page: the
`await` happens before any JSX referencing `user` is constructed, so there is no flash of
unauthenticated content — this is naturally satisfied by awaiting before the `return`, not an
extra mechanism to add.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(app)/dashboard/page.tsx" "apps/web/app/(app)/actions.ts" "apps/web/test/logout-actions.test.ts"
git commit -m "feat(web): add dashboard page and logout Server Action"
```

---

## Task 5: Live verification against a real running dev server

**Files:** none — this task only runs and exercises the app, no code changes expected unless
verification surfaces a real bug.

**Interfaces:** none new.

- [ ] **Step 1: Confirm the SSH tunnel to Postgres is active**

Run: `node -e "const net=require('net'); const s=net.createConnection(5433,'127.0.0.1',()=>{console.log('tunnel alive');s.end();}); s.on('error',e=>{console.error('TUNNEL DOWN:',e.message);process.exit(1);}); s.setTimeout(3000,()=>{console.error('TUNNEL DOWN: timeout');process.exit(1);});"`
Expected: `tunnel alive`.

- [ ] **Step 2: Ensure a real company user exists to log in as**

The `@dossipv/db` seed script (`packages/db/prisma/seed.ts`) already creates
`owner@solarpro.tn` with password `correct-horse-battery-staple`... actually check: that
password belongs to the `@dossipv/auth` test suite's fixtures, NOT the seed script's
`passwordHash: 'placeholder-hash'` (a literal non-bcrypt string, intentionally not a real
loginable password — re-check `packages/db/prisma/seed.ts` directly before assuming). If the
seed data's password hash isn't a real bcrypt hash of a known password, create one ad hoc for
this verification:

```bash
node --experimental-strip-types -e "
import { db } from './packages/db/src/index.ts';
import { hashPassword } from './packages/auth/src/index.ts';
const company = await db.company.findFirst();
if (!company) throw new Error('No seeded company found — run packages/db/prisma/seed.ts first');
await db.companyUser.upsert({
  where: { email: 'verify-login@example.com' },
  create: { companyId: company.id, email: 'verify-login@example.com', passwordHash: await hashPassword('verify-password-123'), fullName: 'Verification User', role: 'MEMBER' },
  update: { passwordHash: await hashPassword('verify-password-123') },
});
console.log('verification user ready: verify-login@example.com / verify-password-123');
await db.\$disconnect();
"
```
Run from the repo root. Expected: `verification user ready: ...`.

- [ ] **Step 3: Start the dev server in the background**

Run (from repo root, background): `npm run dev --workspace=@dossipv/web`
Expected: server starts, typically on `http://localhost:3000` — confirm the actual port from
the command's own output (Next picks the next free port if 3000 is taken).

- [ ] **Step 4: Exercise the full login → dashboard → logout loop with a real HTTP client**

This repo has no browser-automation tooling (no Playwright/Cypress) — use `curl` with cookie
persistence as the practical substitute, per the design spec §5's own note on this gap.

```bash
# 1. GET /login should succeed (200) and NOT redirect.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login

# 2. GET /dashboard without a session cookie should redirect to /login.
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/dashboard

# 3. Submit the login form with real credentials, save the cookie.
curl -s -c /tmp/dossipv-cookies.txt -X POST http://localhost:3000/login \
  -d "email=verify-login@example.com" -d "password=verify-password-123" \
  -L -o /tmp/dossipv-login-response.html -w "%{http_code}\n"

# 4. GET /dashboard WITH the saved cookie should now succeed and show the user's name.
curl -s -b /tmp/dossipv-cookies.txt http://localhost:3000/dashboard | grep -o "Bienvenue, [A-Za-z ]*"

# 5. POST to the logout action (find its exact Server Action endpoint from the dashboard
#    HTML's form — Next encodes Server Action calls as a POST to the same page URL with a
#    special header; the simplest practical check here is: after this, GET /dashboard again
#    with the same cookie jar should redirect back to /login).
```

Expected: step 1 returns `200`; step 2 returns a redirect to `/login`; step 3 succeeds and the
cookie jar file contains a `dossipv_session` entry; step 4's grep finds
`Bienvenue, Verification User`. If Server-Action-via-curl proves impractical for step 5 (Next's
Server Action POST protocol needs specific headers curl won't send by default), it's
acceptable to verify logout's own unit tests (Task 4) as sufficient proof for that one step,
and note this explicitly rather than claiming a live verification that didn't actually happen.

- [ ] **Step 5: Stop the dev server**

Run: stop the background `next dev` process started in Step 3.

- [ ] **Step 6: Clean up the verification user (optional, judgment call)**

If Step 2 created a throwaway `verify-login@example.com` user, either leave it (harmless
seed-adjacent data) or delete it — this plan does not require cleanup, but note the decision
either way in the final commit/report.

- [ ] **Step 7: Run the full workspace suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS.

- [ ] **Step 8: Commit if Step 2 created any ad hoc data/script worth keeping**

Only if a reusable seed/verification script was created and is worth keeping in the repo
(judgment call) — otherwise skip, since this task is primarily verification, not a code
change.

---

## Task 6: Whole-package review pass

**Files:** none new — this task re-reads everything Tasks 1-5 produced.

**Interfaces:** none new.

- [ ] **Step 1: Re-run the full suite from the repo root**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three PASS.

- [ ] **Step 2: Confirm no password value ever appears in a committed file**

Run: `grep -rn "verify-password-123\|correct-horse-battery-staple" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: only test-fixture occurrences inside `test/` directories (the existing
`@dossipv/auth` test suite's own `TEST_PASSWORD` constant, and this plan's own
`login-actions.test.ts`/`logout-actions.test.ts` if they happen to reuse a literal password
string) — no occurrence inside `app/` (actual application code) or any non-test file.

- [ ] **Step 3: Confirm the Review Focus items are each covered by a real test**

Re-read `login/actions.ts`'s `try/catch` structure and confirm `redirect('/dashboard')` is
physically outside the `try` block (not just logically unreachable after a `return` inside
it) — a visual, not automated, check for this specific Review Focus item, since the
test suite's mocked `redirect()` doesn't throw and so can't itself prove this structurally.

- [ ] **Step 4: Update project memory**

Judgment call, not scripted: update
`C:\Users\mahmoudn\.claude\projects\d--mahmoud-repo-DossiPV\memory\dossipv-project-status.md`
to record the web UI login shell as built, what was verified live vs. only by test, and move
the sub-project decomposition's "next planned piece" forward — matching that file's existing
style.

- [ ] **Step 5: Final commit if Steps 2-3 found anything**

```bash
git add -A
git commit -m "fix(web): close a gap found in the login shell's final review"
```

(Skip entirely if nothing was found.)
