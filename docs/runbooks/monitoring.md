# Runbook: monitoring, alerts and e-mail settings

What tells you DossiPV is broken, and where each signal comes from:

| Signal | Source | Who is told |
| --- | --- | --- |
| Site down / database unreachable | External uptime check on `GET /api/health` (§2) | E-mail from the uptime service |
| Errors in the web app (server and browser) and the worker | Sentry (§1), off until the DSNs are set | E-mail from Sentry |
| A dossier job failed | The worker, by e-mail over SMTP (§3) | `ADMIN_EMAIL` |
| Subscription expiring (7 days, 1 day, expired) | The worker's daily run, by e-mail over SMTP (§3) | The installer company |
| Nightly backup did not run | `BACKUP_HEARTBEAT_URL` (see backup-and-restore.md) | E-mail from the heartbeat service |

## Where settings go

The deploy workflow **rewrites** `/home/debian/dossipv/.env` on every deploy from the GitHub
repository secrets (Settings → Secrets and variables → Actions → *production* environment), so set
values there, not by editing `.env` on the server (a manual edit is lost at the next deploy).

| GitHub secret | Becomes | Used by |
| --- | --- | --- |
| `DEPLOY_APP_URL` | `APP_URL` — public base URL, e.g. `https://app.dossipv.tn` (no trailing slash) | links in e-mails |
| `DEPLOY_SMTP_HOST`, `DEPLOY_SMTP_PORT`, `DEPLOY_SMTP_USER`, `DEPLOY_SMTP_PASSWORD`, `DEPLOY_SMTP_FROM` | `SMTP_*` | all e-mail (app and worker) |
| `DEPLOY_ADMIN_EMAIL` | `ADMIN_EMAIL` | failed-job and sign-up alerts |
| `DEPLOY_SENTRY_DSN` | `SENTRY_DSN` (runtime) | Sentry, web server + worker |
| `DEPLOY_NEXT_PUBLIC_SENTRY_DSN` | `NEXT_PUBLIC_SENTRY_DSN` (Docker **build arg**) | Sentry, browser |

All are optional: an unset secret is an empty value and that feature stays off
(`SMTP_PORT` defaults to 587). Values must not contain `$` or a newline (Docker Compose would
interpolate or cut them). After changing a secret, re-run the latest *CI & Deploy* workflow
(Actions → the last run on `main` → *Re-run jobs*): runtime values are applied when the containers
are recreated, and the browser DSN only when the image is rebuilt.

## 1. Sentry (errors)

Wired in but inactive until a DSN is set: `apps/web/instrumentation.ts` (server),
`apps/web/instrumentation-client.ts` (browser), `apps/web/app/global-error.tsx` (root-layout
crashes), `packages/dossier-worker/src/monitoring.ts` (worker).

Personal data stays out: the SDK runs with `sendDefaultPii: false` and no tracing, and every event
is scrubbed before it leaves (`apps/web/lib/monitoring.ts`, and its worker copy): request
bodies, cookies, headers and query strings, user e-mail and IP, console breadcrumbs and local
variables are dropped; e-mail addresses and 8+ digit numbers (CIN, phone, STEG references) in
error messages become `[email]` / `[number]`.

Setup:

1. Create an account at [sentry.io](https://sentry.io) (free *Developer* plan: 5k errors/month,
   one user). Choose the **EU data region** (`de.sentry.io`) when asked: the data stays in the EU.
2. Create one project, platform **Next.js**, named `dossipv`. The worker reports into the same
   project, tagged `service: dossier-worker` (filter on that tag in the Issues view).
3. In the project: *Settings → Security & Privacy*: turn on **Data Scrubber**, **Use Default
   Scrubbers** and **Prevent Storing of IP Addresses** (a second safety net behind the SDK
   scrubbing).
4. *Settings → Client Keys (DSN)*: copy the DSN. Set it as both `DEPLOY_SENTRY_DSN` and
   `DEPLOY_NEXT_PUBLIC_SENTRY_DSN` (the DSN is public by design: it ships in the browser bundle and
   only allows sending events).
5. *Alerts*: the default "new issue" alert e-mails you; add yourself as the project owner.
6. Re-run the deploy, then check it receives events:
   ```bash
   ssh debian@<server>
   docker exec dossipv-worker-1 node --input-type=module -e \
     "import * as S from '@sentry/node'; S.init({ dsn: process.env.SENTRY_DSN }); S.captureMessage('DossiPV Sentry test (worker)'); await S.flush(5000);"
   ```
   The message appears in Issues within a minute. For the browser, open the site and run in the
   devtools console `setTimeout(() => { throw new Error('DossiPV Sentry test (browser)') })` (an
   error thrown directly at the console prompt is not reported; one from a callback is).

Not set up (no auth token, the build stays unchanged): source-map upload and releases. Server
stack traces are readable as is; browser stack traces point at minified bundles. If they become
needed, wrap `next.config.ts` with `withSentryConfig` from `@sentry/nextjs/config` and add a
`SENTRY_AUTH_TOKEN` build secret.

To turn Sentry off again, empty both secrets and re-deploy.

## 2. Uptime check

`GET /api/health` is public and answers `200 {"status":"ok"}` when the app is up **and** the
database answers within 3 s, `503 {"status":"error"}` otherwise (no details in the response; the
reason goes to `docker logs dossipv-app-1`). Docker uses the same endpoint as the `app` container
healthcheck: `docker ps` shows `(healthy)` / `(unhealthy)`, and
`docker inspect --format '{{json .State.Health}}' dossipv-app-1` shows the last checks. Docker does
not restart an unhealthy container by itself; the external check is what alerts you.

Set up an external monitor (free tiers are enough):

- **UptimeRobot**: *Add New Monitor* → type **HTTP(s)** (or **Keyword**, keyword `"status":"ok"`) →
  URL `https://<domain>/api/health` (until the domain exists: `http://217.182.205.137:3001/api/health`)
  → interval **5 minutes** → alert contact: your e-mail.
- or **Better Stack Uptime**: *Create monitor* → "URL becomes unavailable" → same URL → check every
  3–5 min → e-mail on-call.

Test it: `docker stop dossipv-postgres-1` on a quiet moment makes the endpoint answer 503 and the
monitor alert within one interval; `docker start dossipv-postgres-1` clears it. (Or just trust the
first real incident: but do check the alert reaches your inbox, not spam.)

## 3. E-mail (SMTP): alerts and expiry e-mails

The app and the worker send e-mail through a transactional provider over SMTP: password resets,
e-mail verification, invitations, sign-up notifications, the admin alert when a dossier job fails
(to `ADMIN_EMAIL`), and the daily subscription expiry e-mails (7 days, 1 day, expired) sent by the
worker. Without `SMTP_HOST` no e-mail goes out — check the app and worker logs
(`docker logs dossipv-worker-1 --since 1h`).

Pick a provider (all have a free tier or pay-per-use): Brevo (300 e-mails/day free), Mailjet,
Amazon SES, or the SMTP of your mail host. Then:

| Secret | Value |
| --- | --- |
| `DEPLOY_SMTP_HOST` | e.g. `smtp-relay.brevo.com` |
| `DEPLOY_SMTP_PORT` | `587` (STARTTLS) — or `465` for implicit TLS if the provider requires it |
| `DEPLOY_SMTP_USER` | the SMTP login the provider gives you |
| `DEPLOY_SMTP_PASSWORD` | the SMTP key/password (not your account password) |
| `DEPLOY_SMTP_FROM` | e.g. `DossiPV <no-reply@dossipv.tn>` — an address on a domain verified with the provider |
| `DEPLOY_ADMIN_EMAIL` | the mailbox that gets failed-job and sign-up alerts |
| `DEPLOY_APP_URL` | the public URL used in e-mail links |

Verify the sending domain with the provider (SPF and DKIM DNS records, and a DMARC record), or the
e-mails land in spam. After the deploy, trigger a password reset for your own account and check it
arrives.
