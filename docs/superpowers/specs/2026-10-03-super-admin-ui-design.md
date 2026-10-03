# DossiPV — Super-Admin UI (Slice 1) Design Spec

## 1. Purpose and scope

Sub-project #3 of the "full application" build: the super-admin panel at `/admin`, consuming
`@dossipv/auth`'s already-built (sub-project #2) super-admin login path
(`loginSuperAdmin`/`logoutSuperAdmin`/`validateSuperAdminSession`), which has existed since
sub-project #2 but had no UI until now.

Per the master spec (`docs/superpowers/specs/2026-10-02-dossipv-design.md` §2), the full
super-admin panel covers: installer list, installer detail (edit/suspend/payments/dossiers),
shared equipment catalog CRUD (9 catalog types), settings (map provider, Claude model, plan
definitions), and a revenue/usage dashboard.

**This spec covers Slice 1 only** — the highest-value, most load-bearing pieces:
- Super-admin login/logout (mirrors sub-project #4's installer login shell, same
  Server-Action pattern, separate route tree and cookie name so a super-admin session and a
  company-user session can never be confused with each other).
- A dashboard: active installers count, dossiers generated this month (all companies), Claude
  cost this month (all companies), total revenue.
- An installer list: company name, plan, subscription status/end date (highlighted if <7 days
  or expired), dossier count this month, last login.
- An installer detail page: view company details, activate/suspend the subscription, record a
  manual payment, view payment history.

**Explicitly out of scope for this slice** (follow-up slices under the same sub-project #3):
equipment catalog CRUD (9 types × create/edit/delete is a large, separable piece deserving its
own brainstorm), settings (map provider/Claude model/plan definitions), editing company
details/login email/password from the admin side, viewing a company's actual dossier list/
files. None of these block the dashboard/list/detail slice from being useful on its own —
the user explicitly asked to "finish the entire application" overnight without skipping
subsystems, so this decomposition only reorders the work, it doesn't drop anything.

**Note on how this spec was produced**: written autonomously (user asleep, explicit standing
instruction to keep building using the recommended option at each decision point). Every
choice below follows the same reasoning as sub-project #4's spec and is documented here for
review rather than approved in advance.

## 2. Decisions

- **Separate route tree, separate cookie.** `/admin/login`, `/admin` (dashboard),
  `/admin/installers`, `/admin/installers/[id]`. Cookie name `dossipv_admin_session` (distinct
  from the installer-facing `dossipv_session`) — this is a deliberate hard separation, not
  just a different page: a leaked or copy-pasted installer session cookie must never be
  readable as an admin session, and vice versa. Same cookie options as sub-project #4
  (httpOnly, secure in production, sameSite lax, path `/`), `maxAge` matching
  `@dossipv/auth`'s `SESSION_LIFETIME_MS` (admin sessions use the same constant — there's no
  separate super-admin session lifetime in the auth package, and this slice doesn't add one).
- **Server Actions, not API routes** — same reasoning as sub-project #4: `/admin/login`'s form
  posts to a `loginAdminAction`, `/admin`'s logout button posts to `logoutAdminAction`, and the
  installer-detail page's suspend/activate/record-payment actions are each their own Server
  Action (`suspendSubscriptionAction`, `activateSubscriptionAction`, `recordPaymentAction`) —
  consistent with how every other mutation in this app works, no new pattern introduced.
- **Route-group layout guard** (`/admin/(protected)/layout.tsx`) mirrors sub-project #4's
  `requireAuthenticatedCompanyUser` pattern exactly, but calls
  `validateSuperAdminSession`/redirects to `/admin/login` instead. `/admin/login` itself sits
  outside the `(protected)` group, same structural split as `/login` vs `(app)` in sub-project
  #4.
- **No separate admin bootstrap/signup UI.** `SuperAdmin` rows are created directly in the
  database (e.g. via a one-off script or `prisma studio`) — there is exactly one or a small
  handful of super-admins (the product's own operators), not a self-serve signup flow. This
  matches the master spec's framing of super-admin as "a separate login, not listed among
  companies" with no mention of a signup screen.
- **Dashboard aggregates computed with a handful of direct Prisma aggregate queries**, not a
  pre-computed summary table or caching layer — the data volumes here (companies, dossier
  jobs, usage logs) are small enough for v1 that computing them on each dashboard load is
  simpler and correct-by-construction; a caching layer would be solving a performance problem
  that doesn't exist yet.
- **"This month" means calendar month in the server's own timezone** — no per-admin timezone
  preference, no explicit UTC-vs-local decision surfaced to the user. This is a reasonable
  default for a single-admin-timezone product and matches how "this month" is used
  informally elsewhere in the master spec.
- **Suspend/activate are the only subscription-status mutations in this slice.** The spec's
  `SubscriptionStatus` enum also has `EXPIRED`, but nothing in this slice sets a subscription
  to `EXPIRED` — that's naturally a scheduled/computed state (current date past `periodEnd`)
  that a future sub-project's job-queue/cron piece should set, not something an admin clicks.
  Suspend/activate here are explicit manual overrides layered on top of whatever the
  (currently absent) expiry computation would do; this slice does not add that computation.
- **Recording a manual payment does not automatically extend the subscription's `periodEnd`.**
  The master spec's §2 says manual renewal is "super-admin records a payment... in `/admin`"
  but doesn't specify whether that auto-extends the period or if the admin sets the new
  `periodEnd` separately. This slice keeps `recordPaymentAction` as a pure bookkeeping action
  (creates a `Payment` row only) and leaves `periodEnd` as a manually-editable value on the
  same detail page — simpler to reason about than guessing a renewal-duration formula from a
  plan's price, and matches "admin records a payment" literally rather than inferring an
  auto-renewal side effect the spec doesn't state.
- **No pagination for the installer list in this slice.** A single admin-facing list is
  expected to stay in the tens-to-low-hundreds of rows for the foreseeable future of this
  product; adding pagination now would be solving a problem this app doesn't have yet (YAGNI).

## 3. Page/route structure

```
apps/web/app/admin/
  login/
    page.tsx                  — admin login form (mirrors apps/web/app/login/page.tsx)
    actions.ts                 — 'use server' — loginAdminAction
  (protected)/
    layout.tsx                 — route-group layout: calls validateSuperAdminSession(),
                                  redirects to /admin/login if null
    actions.ts                  — 'use server' — logoutAdminAction
    page.tsx                    — dashboard (installers count, dossiers/month, cost/month, revenue)
    installers/
      page.tsx                   — installer list table
      [id]/
        page.tsx                  — installer detail (company info, subscription, payments)
        actions.ts                 — 'use server' — suspendSubscriptionAction,
                                      activateSubscriptionAction, recordPaymentAction,
                                      updatePeriodEndAction
```

Mirrors sub-project #4's `login/` vs `(app)/` split one level deeper under `/admin`, for the
same reason: `/admin/login` must never go through the guard that protects everything else
under `/admin`.

## 4. Login flow

Structurally identical to sub-project #4's company-user login flow, substituting the
super-admin functions and cookie name:

1. `GET /admin/login` renders a plain email/password form (`useActionState`), same French
   copy pattern.
2. `loginAdminAction(prevState, formData)`:
   - Validates both fields are strings (not `File`s) before calling `loginSuperAdmin` —
     reusing the exact fix from sub-project #4's own final review, applied proactively here
     rather than waiting to rediscover it.
   - Calls `@dossipv/auth`'s `loginSuperAdmin(email, password)`.
   - On success: sets the `dossipv_admin_session` cookie to the returned token, redirects to
     `/admin`.
   - On `InvalidCredentialsError`: returns `{ error: 'Email ou mot de passe incorrect.' }`.
   - On `TooManyAttemptsError`: returns `{ error: 'Trop de tentatives échouées. Réessayez plus
     tard.' }`.
3. `(protected)/layout.tsx`: reads the `dossipv_admin_session` cookie; if absent, redirect to
   `/admin/login`. If present, calls `validateSuperAdminSession(token)`; if `null`, redirect to
   `/admin/login`. Otherwise render `children`.
4. `logoutAdminAction()`: reads the cookie, calls `logoutSuperAdmin(token)` if present, deletes
   the cookie regardless, redirects to `/admin/login`.

## 5. Dashboard

`(protected)/page.tsx`, a Server Component computing four numbers on each load:

- **Active installers**: `db.company.count()` — every row in `Company` is an installer; there
  is no separate "active" flag on `Company` itself, so this counts all companies. (A company
  whose subscription is suspended still counts as an installer for this purpose — "active"
  here means "exists as a customer," not "currently able to generate dossiers." This slice
  does not add a second, subscription-filtered count; if that distinction matters later, it's
  a one-line addition once asked for.)
- **Dossiers this month**: `db.dossierJob.count()` filtered to `startedAt >= <first day of
  current month>`.
- **Claude cost this month**: `db.claudeUsageLog.aggregate({ _sum: { costUsd: true } })`
  filtered to `createdAt >= <first day of current month>`, joined implicitly through
  `ClaudeUsageLog.jobId`'s own `createdAt` (not the parent job's `startedAt` — cost is logged
  per Claude call, so its own timestamp is the right filter).
- **Total revenue**: `db.payment.aggregate({ _sum: { amountTnd: true } })`, no date filter —
  "revenue" in the master spec's dashboard line isn't qualified to a period, unlike the other
  three figures which explicitly say "this month," so this one stays all-time.

## 6. Installer list

`(protected)/installers/page.tsx`, a Server Component. One query:
`db.company.findMany({ include: { subscription: { include: { plan: true } }, users: true,
projects: { include: { jobs: true } } } })`, ordered by `name`.

Per row:
- Company name.
- Plan name (`subscription.plan.name`), or "Aucun abonnement" if `subscription` is `null`
  (the schema allows a `Company` to exist with no `Subscription` row — `Subscription` is
  optional on `Company`, confirmed from the schema).
- Subscription status + `periodEnd`, with a visual highlight (different text/background,
  plain CSS — no new design-system dependency) when `periodEnd` is within 7 days of now or
  already past, regardless of the stored `status` enum value (an admin should see "this is
  expiring" even if nobody has flipped the status to `EXPIRED` yet, since this slice doesn't
  add that automatic transition — see §2's decision on this).
- Dossier count this month: computed in the same query by filtering each company's
  `projects[].jobs[]` client-side (in the Server Component, after the one query) to
  `startedAt` within the current month and summing — avoids a second round-trip per row (an
  N+1 query), which matters once there are more than a handful of installers.
- Last login: this slice has no direct "last login" field on `Company`/`CompanyUser` — the
  closest existing data is `Session.createdAt`/nothing tracking a "last successful login"
  timestamp distinct from session creation. Rather than adding a new column (a schema change
  this slice's own scope doesn't otherwise require), this column shows the most recent
  `CompanyUser.sessions[].createdAt` across all of that company's users, computed via one
  extra `include` on the same query (`users: { include: { sessions: { orderBy: { createdAt:
  'desc' }, take: 1 } } }`) — "last login" is approximated as "most recent session creation,"
  which is accurate as long as a session row is only ever created at login time (true today,
  per `@dossipv/auth`'s `login()`).

## 7. Installer detail

`(protected)/installers/[id]/page.tsx`, a Server Component fetching one company by id (404 via
Next's `notFound()` if the id doesn't resolve) with its subscription, plan, and payment
history (`orderBy: { createdAt: 'desc' }`).

Renders:
- Read-only company info block (name, address, phone, email, ANME code/category/validity —
  all fields that exist on `Company` today; no edit form in this slice per §1's scope cut).
- Subscription block: plan name, status, period start/end. Two buttons —
  "Suspendre l'abonnement" (`suspendSubscriptionAction`, sets `status: 'SUSPENDED'`) and
  "Activer l'abonnement" (`activateSubscriptionAction`, sets `status: 'ACTIVE'`) — only the
  action matching the *other* current state is rendered (no "activate" button shown when
  already active), avoiding a confusing no-op click.
- A `periodEnd` field editable via `updatePeriodEndAction` (a simple date input + submit
  button) — this is how an admin manually extends a subscription's period, per §2's decision
  that payment recording doesn't auto-extend it.
- "Enregistrer un paiement" form: amount (TND), method (`MANUAL`|`KONNECT` — a `<select>`),
  optional note. `recordPaymentAction` creates a `Payment` row with `recordedByAdmin: true`
  (always true for anything created through this admin-only form) and redirects back to the
  same detail page (Next's `revalidatePath` or a redirect-to-self — this spec picks
  redirect-to-self via `redirect(`/admin/installers/${companyId}`)` for consistency with how
  every other mutation in this app already redirects rather than revalidates).
- Payment history table: date, amount, method, note, recorded-by (always "Admin" in this
  slice, since every payment created here has `recordedByAdmin: true` — the schema's
  `recordedByAdmin` flag exists to distinguish this from a future Konnect-webhook-recorded
  payment, which this slice does not implement).

A company with no `Subscription` row shows "Aucun abonnement" in place of the subscription
block, with no suspend/activate/payment actions available — creating a brand-new subscription
for a company that has none yet is out of scope for this slice (every seeded/future company is
expected to get a `Subscription` row at signup time, which is itself a future sub-project not
yet built — there is no signup flow at all today).

## 8. Testing

Following the same honest-caveat approach as sub-project #4's spec: Server Actions
(`loginAdminAction`, `logoutAdminAction`, `suspendSubscriptionAction`,
`activateSubscriptionAction`, `recordPaymentAction`, `updatePeriodEndAction`) and the
`(protected)/layout.tsx` guard function are unit-testable by mocking `next/headers`,
`next/navigation`, and `@dossipv/auth`/`@dossipv/db` calls, exactly as sub-project #4's test
files already do (same `vi.hoisted()` pattern, applied from the start this time since it's
now a known, ledgered fix rather than something to rediscover).

**Not tested at this layer**: rendered HTML output, real browser form submission, the
dashboard's aggregate query correctness against real seeded data. The implementation plan's
own verification task runs `next dev` and exercises the GET-based pages (dashboard, list,
detail) against the real dev server and real database with `curl` — the same proven substitute
sub-project #4 used, including the same documented inability to drive Server-Action POSTs
through raw curl (login/logout/suspend/activate/record-payment stay unit-test-only for the
actual mutation, GET-rendering of their resulting state is what gets live-verified).

## 9. Open items for the implementation plan to resolve

- Exact French copy for every label/button/status string — this spec gives the pattern
  (reuse sub-project #4's tone), the plan should write concrete strings rather than leaving
  them as placeholders.
- Whether the "last login" approximation (most recent session `createdAt`) needs a dedicated
  column later — flagged in §6, not blocking this slice.
