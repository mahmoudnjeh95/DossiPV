# DossiPV — Web UI Login & Session Shell Design Spec

## 1. Purpose and scope

Sub-project #4 of the "full application" build: the installer-facing login flow and the
authenticated shell of `apps/web` (Next.js 16, App Router), consuming the now-complete
`@dossipv/auth` package (sub-project #2).

This covers:
- A login page (email + password form).
- A logout action.
- A route-group layout guard that redirects unauthenticated requests to `/login`.
- A minimal authenticated dashboard page proving the whole loop works.

**Explicitly out of scope** (later sub-projects, per the existing decomposition): the
super-admin UI (#3), the actual multi-section project-creation form (a large piece deserving
its own brainstorming pass against `pv_dossier_input_schema.json`'s ~15 sections), the map
editor, and anything from the document generation pipeline.

**Note on how this spec was produced**: the original plan was to brainstorm this sub-project
interactively. The user went to sleep mid-session with explicit instructions to keep
building using the recommended option at each decision point rather than wait for answers.
Every design choice below is therefore a judgment call made on the user's behalf, following
the same reasoning that would have been presented as "Recommended" in an interactive
brainstorm — documented here for review rather than approved in advance.

## 2. Decisions

- **Server Actions, not API routes**, for `login`/`logout`. Both are naturally form-submission
  mutations in the App Router model; Server Actions avoid hand-rolling a fetch+JSON round trip
  for what a `<form action={...}>` already does natively, and they're the pattern Next 16's
  own App Router documentation leads with for this exact case.
- **Cookie-setting lives in the Server Action itself**, via Next's `cookies()` API (`await
  cookies()` — this returns a `Promise` in the installed Next 16.3.8, a change from older
  Next versions worth noting since it's easy to forget the `await`). `cookies().set()` is only
  writable inside a Server Action or Route Handler (Next enforces this at runtime, not just in
  types) — this is exactly where the login/logout logic already lives, so no extra plumbing is
  needed.
- **Route-group layout guard**, not `middleware.ts`. A `(app)` route group's `layout.tsx` reads
  the session cookie, calls `@dossipv/auth`'s `validateSession()`, and redirects to `/login` if
  it returns `null`. Chosen over Next middleware because `validateSession()` needs
  `@dossipv/db`'s Prisma client, which needs a real Node runtime (Prisma's query engine isn't
  Edge-runtime-compatible) — Next middleware runs on the Edge runtime by default, which would
  need an explicit `runtime: 'nodejs'` opt-in with its own caveats. A layout-level check runs
  in the same Node server environment as the rest of the app with no such friction, at the
  (accepted) cost of the auth check happening per-route-tree-render rather than before Next's
  routing layer — acceptable for this app's traffic scale.
- **Cookie name**: `dossipv_session`, `httpOnly: true`, `secure: process.env.NODE_ENV ===
  'production'` (allows plain HTTP in local dev), `sameSite: 'lax'`, `path: '/'`,
  `maxAge` matching `@dossipv/auth`'s `SESSION_LIFETIME_MS` (converted to seconds).
- **Error display**: the login Server Action returns a plain `{ error: string } | void` result
  (via `useActionState`, React 19's replacement for the old `useFormState`) rather than
  throwing past the client boundary — `InvalidCredentialsError`/`TooManyAttemptsError` are
  caught inside the action and translated to a user-facing French message, never left as a raw
  stack trace reaching the browser.
- **No client-side session state library** (no React Context/Zustand/etc. for "current user").
  The authenticated layout fetches the user once via `validateSession()` and passes it down as
  a prop/React Server Component tree value — there's exactly one place that needs "who is
  logged in" right now (the dashboard's greeting + a logout button), so a dedicated client
  state layer would be premature.
- **Package dependency**: `apps/web`'s `package.json` gains `"@dossipv/auth": "*"` and
  `"@dossipv/db": "*"` (the layout guard needs the Prisma-backed `validateSession`, which
  transitively needs `@dossipv/db`'s singleton client — already a workspace dependency,
  nothing new to install beyond the version pin).

## 3. Page/route structure

```
apps/web/app/
  layout.tsx                 — unchanged root layout (html/body, French lang, metadata)
  page.tsx                   — unchanged public landing page (stays as-is, not part of this scope)
  login/
    page.tsx                 — the login form (Server Component rendering a form bound to the action)
    actions.ts                — 'use server' — loginAction(formData): sets the cookie on success
  (app)/
    layout.tsx                — route-group layout: calls validateSession(), redirects to /login if null,
                                 renders children with the resolved user passed down
    dashboard/
      page.tsx                 — minimal authenticated home: "Bienvenue, {fullName}" + logout button
    actions.ts                 — 'use server' — logoutAction(): clears the cookie, redirects to /login
```

The `(app)` route group (parentheses mean the segment doesn't appear in the URL) lets every
page under it share one layout-level auth guard without repeating the check per-page — adding
a new authenticated page later (e.g. the eventual project list/creation flow) means dropping
it into `(app)/` and getting the guard for free.

## 4. Login flow

1. `GET /login` renders `login/page.tsx` — a plain `<form>` with `email`/`password` fields,
   `action={loginAction}`, using `useActionState` to show a validation/error message inline.
2. On submit, `loginAction(prevState, formData)` (in `login/actions.ts`, `'use server'`):
   - Reads `email`/`password` from `formData`.
   - Calls `@dossipv/auth`'s `login(email, password)`.
   - On success: `(await cookies()).set('dossipv_session', result.token, { ...cookie options
     above })`, then `redirect('/dashboard')` (Next's `redirect()` from `next/navigation`,
     thrown internally — not a normal return).
   - On `InvalidCredentialsError`: returns `{ error: 'Email ou mot de passe incorrect.' }`.
   - On `TooManyAttemptsError`: returns `{ error: 'Trop de tentatives échouées. Réessayez plus
     tard.' }`.
   - Any other thrown error propagates (Next's own error boundary handles truly unexpected
     failures — this spec doesn't add a second layer of catch-all swallowing for genuine bugs).
3. `(app)/layout.tsx` (runs for every request under the route group): reads the
   `dossipv_session` cookie via `(await cookies()).get('dossipv_session')?.value`; if absent,
   `redirect('/login')` immediately. If present, calls `validateSession(token)`; if it returns
   `null` (expired or unknown token), `redirect('/login')`. Otherwise renders `children` — the
   resolved `AuthenticatedCompanyUser` is NOT passed as a prop to `children` (Next layouts
   can't inject props into their children this way) — instead, `dashboard/page.tsx` calls
   `validateSession()` again itself. This is a deliberate, accepted duplication: the layout's
   check is the guard (redirect-or-continue), each page's own check is how that page actually
   gets the user's data to render with. Both calls hit the same cheap Prisma lookup; no
   caching layer is introduced for this scope.
4. `dashboard/page.tsx` calls `validateSession()`, renders "Bienvenue, {fullName}" and a
   `<form action={logoutAction}><button>Se déconnecter</button></form>`.
5. `logoutAction()` (in `(app)/actions.ts`, `'use server'`): reads the cookie, calls
   `@dossipv/auth`'s `logout(token)`, deletes the cookie (`(await cookies()).delete(...)`),
   `redirect('/login')`.

## 5. Testing

Following this monorepo's existing style, but with an honest caveat: UI/page-rendering code in
Next's App Router doesn't lend itself to the same unit-test style as the backend packages (no
existing precedent in this repo for testing React Server Components or Server Actions in
isolation — `apps/web`'s only existing test is a trivial smoke test). This plan's testing
approach:

- `login/actions.ts`'s `loginAction` and `(app)/actions.ts`'s `logoutAction` are plain async
  functions that call `@dossipv/auth` and Next's `cookies()`/`redirect()` — these ARE unit
  -testable by mocking `next/headers`' `cookies` and `next/navigation`'s `redirect`, following
  Vitest's standard module-mocking pattern. Both action functions get real unit tests this way:
  success sets the cookie and redirects; `InvalidCredentialsError`/`TooManyAttemptsError` each
  produce the right French message and do NOT redirect.
- The layout guard's redirect logic is tested the same way: mock `validateSession` to return
  `null` vs. a real user, assert `redirect('/login')` is/isn't called.
- **Not tested at this layer** (explicitly deferred, not silently skipped): actual rendered
  HTML output, real browser form submission, real cookie round-tripping through an actual
  HTTP response. The implementation plan's own verification step runs `next dev` and exercises
  the flow with a real HTTP client (`fetch`/`curl` against the dev server) as the practical
  substitute for a full browser-based E2E test, which this repo has no existing tooling for
  (no Playwright/Cypress setup) and which this scope does not justify introducing.

## 6. Open items for the implementation plan to resolve

- Exact French copy for every user-facing string (error messages, button labels, page titles)
  — this spec gives reasonable defaults above; the plan should use them verbatim rather than
  re-deciding, but isn't blocked on further wordsmithing.
- Whether `(app)/layout.tsx`'s per-request `validateSession()` call (and `dashboard/page.tsx`'s
  second one) should eventually be memoized via React's `cache()` to avoid the duplicate
  Prisma round-trip within one request — not needed for this scope's single-page dashboard,
  flagged for whoever adds the next authenticated page to reconsider if duplication grows.
