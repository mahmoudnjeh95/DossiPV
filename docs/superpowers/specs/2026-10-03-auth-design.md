# DossiPV — Auth & Accounts Design Spec

## 1. Purpose and scope

Sub-project #2 of the "full application" build (per the decomposition agreed during the data
model sub-project): credential-based authentication for company users and the super-admin,
session management with the concurrent-session anti-sharing cap already designed into the
`@dossipv/db` schema (`CompanyUser`, `Session`, `SuperAdmin` models — already migrated, see
`docs/superpowers/specs/2026-10-03-data-model-design.md`).

This covers:
- Password hashing and verification.
- Login/logout for company users, enforcing the per-company concurrent-session cap.
- Login/logout for the super-admin (separate login, no session cap).
- Session validation (given a raw token, resolve the authenticated user).

**Explicitly out of scope** (later sub-projects): the actual login/logout UI screens and
cookie-setting Next.js route handlers (sub-project #4, consumes this package's functions),
the super-admin UI (#3), password reset flows (not yet designed — flagged as an open item
below), email verification, and any OAuth/SSO provider (not requested).

## 2. Decisions carried from brainstorming

- **Password hashing**: `bcrypt` (native bindings, actively maintained, v6 as of this spec),
  cost factor 12 — a widely-used, well-understood default for this traffic scale.
- **Session mechanism**: signed httpOnly cookie holding a raw random session token. The
  server never stores the raw token — only `sha256(rawToken)` goes into `Session.tokenHash`
  (matching the schema's existing `tokenHash String @unique` column), so a database leak
  alone can't be used to forge sessions. Cookie-setting itself happens in `apps/web` (Next.js
  response/cookie APIs) — `@dossipv/auth` stays framework-agnostic, dealing only in raw
  token strings in and out.
- **Session cap enforcement**: a configurable constant (not hardcoded inline),
  `MAX_CONCURRENT_SESSIONS_PER_COMPANY = 3`. Enforced inside `login()` at the moment a new
  session would be created: count active (non-expired) sessions across every `CompanyUser`
  row belonging to the same `companyId` (the join the data model's seed script already
  proved resolves cleanly); if at or above the cap, delete the single oldest session
  (`ORDER BY createdAt ASC LIMIT 1`) before creating the new one. This evicts silently rather
  than rejecting the new login — no friction for legitimate multi-device use, while still
  capping total simultaneous company-wide usage (the actual anti-sharing goal).
- **Package**: new `@dossipv/auth`, depending on `@dossipv/db` and `bcrypt`, mirroring the
  monorepo's existing per-concern package pattern (`engine`, `document-text`,
  `dossier-worker`, `db`).
- **Super-admin path**: mirrors the company-user path (`loginSuperAdmin`,
  `validateSuperAdminSession`) but against the separate `SuperAdmin` table, with no session
  cap — there are only ever a handful of super-admin accounts, and sharing isn't a commercial
  concern for that role the way it is for paying company accounts. Requires a small
  `@dossipv/db` migration adding a new `SuperAdminSession` model (own table, not a nullable
  FK added to the existing `Session` table) — keeps company-tenant auth and platform-admin
  auth fully decoupled, so a future change to one's session shape never risks the other.
- **Rate limiting**: a simple in-memory failed-attempt counter keyed by email (not IP — email
  is the attacker-controlled input space that actually matters for a credential-stuffing
  attempt against one account), reset on success, capped at a small threshold within a
  rolling time window. In-process memory is an accepted limitation (resets on server
  restart/redeploy, doesn't share state across multiple server instances) — sufficient for
  this scale; a durable store (Redis) is a future upgrade if the app ever runs multiple
  instances behind a load balancer.
- **Testing**: each test creates its own throwaway `Company`+`CompanyUser` rows against the
  real tunneled dev database (same philosophy as `@dossipv/db`'s own seed script: no mocking
  Prisma, test against the real thing) and deletes them in an `afterEach`/`afterAll` — not
  transaction-wrapped, since that would require threading an optional transaction client
  through every function signature for no benefit at this package's test volume.

## 3. Public API

```ts
// packages/auth/src/index.ts

export interface AuthenticatedCompanyUser {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  role: 'OWNER' | 'MEMBER';
}

export interface LoginResult {
  user: AuthenticatedCompanyUser;
  /** Raw session token — caller sets this as the httpOnly cookie value. Never stored raw. */
  token: string;
}

/** Thrown by login() when the email doesn't exist or the password doesn't match. Deliberately
 *  generic (never reveals which of the two failed) to avoid leaking account existence. */
export class InvalidCredentialsError extends Error {}

export async function hashPassword(plainPassword: string): Promise<string>;
export async function verifyPassword(plainPassword: string, hash: string): Promise<boolean>;

/**
 * Verifies credentials, enforces the per-company concurrent-session cap (evicting the oldest
 * session if already at MAX_CONCURRENT_SESSIONS_PER_COMPANY), creates a new Session row, and
 * returns the raw token for the caller to set as a cookie.
 * Throws InvalidCredentialsError on any failure (unknown email, wrong password).
 */
export async function login(email: string, plainPassword: string): Promise<LoginResult>;

/** Deletes the Session row matching this raw token's hash. No-op (does not throw) if the
 *  token doesn't match any session — logging out an already-expired/invalid session is not
 *  an error. */
export async function logout(rawToken: string): Promise<void>;

/**
 * Resolves a raw session token to its authenticated user, or null if the token is missing,
 * unknown, or expired. Updates Session.lastSeenAt on every successful validation.
 */
export async function validateSession(rawToken: string): Promise<AuthenticatedCompanyUser | null>;

export interface AuthenticatedSuperAdmin {
  id: string;
  email: string;
}

export async function loginSuperAdmin(email: string, plainPassword: string): Promise<{ admin: AuthenticatedSuperAdmin; token: string }>;
export async function logoutSuperAdmin(rawToken: string): Promise<void>;
export async function validateSuperAdminSession(rawToken: string): Promise<AuthenticatedSuperAdmin | null>;

/** Default session lifetime for a newly created session, applied as `expiresAt = now + this`. */
export const SESSION_LIFETIME_MS: number;

/** The per-company concurrent-session cap enforced by login(). */
export const MAX_CONCURRENT_SESSIONS_PER_COMPANY: number;

/** Thrown by login()/loginSuperAdmin() when the email has too many recent failed attempts. */
export class TooManyAttemptsError extends Error {}

/** Max failed login attempts per email within RATE_LIMIT_WINDOW_MS before TooManyAttemptsError. */
export const RATE_LIMIT_MAX_ATTEMPTS: number;
export const RATE_LIMIT_WINDOW_MS: number;
```

`SuperAdmin` has no `Session`-table equivalent in the current `@dossipv/db` schema (only
`CompanyUser` has a `sessions Session[]` relation) — this spec adds a new, parallel model:

```prisma
model SuperAdminSession {
  id            String     @id @default(uuid())
  superAdminId  String
  superAdmin    SuperAdmin @relation(fields: [superAdminId], references: [id])
  tokenHash     String     @unique
  createdAt     DateTime   @default(now())
  lastSeenAt    DateTime   @default(now())
  expiresAt     DateTime

  @@map("super_admin_session")
}
```

Plus the corresponding `sessions SuperAdminSession[]` back-relation field added to the
existing `SuperAdmin` model. The implementation plan's first task adds this via a normal
`prisma migrate dev` migration against the already-running database — no change to any
existing table, purely additive.

## 4. Session token format

- Generated via `crypto.randomBytes(32).toString('hex')` (64 hex characters, 256 bits of
  entropy) — the raw token, sent to the client as the cookie value.
- Stored as `sha256(rawToken)` in `Session.tokenHash` — `validateSession()` hashes the
  incoming cookie value the same way and looks up by that hash. A leaked database dump alone
  cannot be used to impersonate a session (the attacker would need the raw token, which only
  ever existed in the client's cookie and the HTTPS response that set it).
- `expiresAt` set to `now + SESSION_LIFETIME_MS` at creation (default 30 days — a config
  constant, not re-derived at validation time). `validateSession()` checks
  `expiresAt > now` and treats an expired session identically to a missing one (returns
  `null`, does not throw) — the row itself is left in place for the caller to clean up via a
  future scheduled job (out of scope here; not needed for correctness since expired rows
  simply stop validating).

## 5. Session cap and rate-limiting algorithm (inside `login()`)

```
1. Check the in-memory rate limiter for this email: if it has RATE_LIMIT_MAX_ATTEMPTS or more
   failed attempts within the last RATE_LIMIT_WINDOW_MS -> throw TooManyAttemptsError.
2. Look up CompanyUser by email. If not found -> record a failed attempt for this email,
   throw InvalidCredentialsError.
3. verifyPassword(plainPassword, user.passwordHash). If false -> record a failed attempt,
   throw InvalidCredentialsError.
4. On success: clear this email's failed-attempt record.
5. Count Session rows where companyUser.companyId == user.companyId AND expiresAt > now().
6. If count >= MAX_CONCURRENT_SESSIONS_PER_COMPANY:
   - Find the one such session with the oldest createdAt.
   - Delete it.
7. Generate a new raw token; create a new Session row (companyUserId: user.id, tokenHash,
   expiresAt: now + SESSION_LIFETIME_MS).
8. Return { user, token: rawToken }.
```

The rate limiter (step 1/2/3/4) is a module-level `Map<email, { count, windowStart }>` —
in-process memory, not persisted, not shared across server instances (see §2's note on this
being an accepted limitation at current scale). `loginSuperAdmin()` uses the same limiter
function against a separate map, keyed the same way.

Steps 3-5 are not wrapped in an explicit database transaction in this spec — a race between
two near-simultaneous logins for the same company could in theory let the count briefly
exceed the cap by one session before the next login's count corrects it. Given the cap's
purpose (a soft deterrent against obvious sharing, not a hard security boundary), this
is an acceptable simplification; revisit with a transaction (`db.$transaction`) if the cap
is later used as a hard billing-enforcement mechanism rather than a deterrent signal.

## 6. Testing

TDD throughout, following this monorepo's existing style (no comment above a test unless the
WHY is non-obvious):

- `hashPassword`/`verifyPassword`: round-trip test (hash then verify succeeds), wrong-password
  test (verify fails for a different plaintext), and a test that two hashes of the same
  password differ (bcrypt's salt is random per call — proves salting is actually happening,
  not just trusting the library).
- `login`: success path (correct credentials return a token, and a corresponding `Session`
  row exists in the database with the expected `tokenHash`); `InvalidCredentialsError` for an
  unknown email; `InvalidCredentialsError` for a wrong password on a known email (and the
  error must not distinguish the two cases observably — same error type, same message);
  session-cap eviction (seed `MAX_CONCURRENT_SESSIONS_PER_COMPANY` existing sessions for one
  company via direct `db.session.create()` calls with distinct `createdAt` timestamps, call
  `login()` again, assert the oldest is gone and the total count is still at the cap, not
  cap+1).
- `validateSession`: success path (valid token resolves to the right user, and `lastSeenAt`
  is updated); `null` for an unknown token; `null` for an expired token (create a `Session`
  row with `expiresAt` in the past directly via the Prisma client, since `login()` itself
  never creates an already-expired session).
- `logout`: deletes the matching session (post-logout, `validateSession` on that same token
  returns `null`); no-op (does not throw) for a token that doesn't match any session.
- Super-admin path: mirrors the above at reduced depth (no session-cap test needed, since
  that path has no cap) — success/unknown-email/wrong-password/expired/logout, against the
  new `SuperAdminSession` table.
- Rate limiting: `RATE_LIMIT_MAX_ATTEMPTS` consecutive wrong-password calls for the same
  email, followed by one more call (even with the CORRECT password this time) — asserts
  `TooManyAttemptsError`, not success, proving the lockout actually blocks the account rather
  than just the specific bad password. A successful login clears the counter — test that a
  login succeeding after a few (but fewer than the max) failed attempts resets the count back
  to zero (verified by then making `RATE_LIMIT_MAX_ATTEMPTS - 1` more failed attempts and
  confirming the next one still succeeds/fails on credentials rather than on the limiter).

## 7. Open items for the implementation plan to resolve

- **`bcrypt`'s native bindings** on this Windows dev machine vs. the Linux deployment target:
  confirm `npm install` succeeds cleanly on both during implementation; fall back to
  `bcryptjs` (pure JS, slightly slower, zero native-binding risk) if the native package proves
  troublesome — not expected, but not pre-verified by this spec.
- **Password reset / forgot-password flow**: not designed here. Spec §8 of the original
  design spec only mentions "super-admin can reset a company's password or login email from
  `/admin`" — a self-serve reset-via-email flow is not currently in scope anywhere and should
  be raised with the user if/when it becomes relevant.
