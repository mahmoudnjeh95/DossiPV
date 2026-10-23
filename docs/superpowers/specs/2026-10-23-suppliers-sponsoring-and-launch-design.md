# DossiPV — Suppliers, Sponsoring and Production Launch Design Spec

Status: approved by user (2026-10-23) in a brainstorm; the user's decisions are marked
**(user)**. The one default still open is listed in §10.

## 1. Purpose and scope

DossiPV goes to production with three ways to sell it:

1. **Direct installers** pay a Standard or Premium plan (exists today, admin-only). The 3D view
   becomes Premium-only for them **(user)**.
2. **Fournisseurs** (panel/inverter distributors) pay a fixed monthly fee **(user)** and give
   their installers the Standard plan for free. Those installers can use only the supplier's
   panels and inverters, and can pay for the 3D option or for Premium themselves **(user)**.
3. **Mise en avant**: a supplier pays to have its products shown and used first by every
   direct installer **(user)**.

Everything is managed from `/admin`. This spec also lists the production basics the app lacks
today (backups, email, monitoring), because suppliers and self sign-up depend on email.

What exists already and is reused: `Company`/`CompanyUser` with OWNER/MEMBER roles, `Plan`
(tier, monthly dossier limit, price), `Subscription` (status, `periodEnd`), `Payment`, the quota
and expiry checks on generation and bill import, the Premium gate on the map geometry, the
shared catalog with its DRAFT → PUBLISHED review, and the single catalog filter in
`apps/web/lib/project-access.ts` (`catalogScope`, `libraryScope`, `provenanceScope`,
`equipmentChoiceScope`).

## 2. Account types

| Account | Plan | Pays | Panels & inverters it can use | Other equipment | Own equipment | 3D view |
|---|---|---|---|---|---|---|
| Direct installer | Standard | Installer | Shared catalog; sponsored products first | Shared catalog | Yes (as today) | No: Premium only |
| Direct installer | Premium | Installer | Shared catalog; sponsored products first | Shared catalog | Yes | Included |
| Sponsored installer | Standard | Supplier (included in its fee) | Its supplier's products only | Shared catalog | No | With the 3D option, paid by the installer |
| Fournisseur | Supplier plan | Supplier, fixed monthly fee | — | — | Submits its products for review | — |

There are only two installer plans, Standard and Premium, plus a 3D option that only sponsored
installers can buy **(user)**. There is no supplier-specific Standard or Premium plan: sponsoring is a link
between an installer and a supplier, not a plan. While the link exists, the supplier pays the
installer's Standard plan and the installer is locked to the supplier's panels and inverters.

A sponsored installer can then:
- pay the **3D option**: it stays sponsored and locked;
- pay **Premium**, which includes 3D, its own equipment and every brand: it leaves its
  supplier **(user)** (§5.3).

Only panels and inverters are locked, because suppliers sell panels and inverters **(user)**.
Cables, DC switches, fuses, SPDs, AC breakers, isolators and accessories always come from the
shared catalog; otherwise a sponsored installer could never complete a dossier.

### 2.1 The 3D option

The 3D view of the array on the roof in the dossier, and the Claude roof placement that only
serves that view, become Premium features. Premium includes them; a sponsored installer can
buy them alone as the 3D option. A direct Standard installer cannot buy the option: it moves
to Premium to get 3D **(user)**.

Today the 3D view is drawn in every dossier whatever the tier (`process-job.ts` builds the 3D
input whenever there is a page-37 photo), so this is a restriction of Standard: a Standard
dossier without the option no longer has the 3D page. Drawing the roof contour on Emplacements
stays available to everyone, because the contour is also drawn on the implantation plan.

Like the tier, a project records whether it has 3D when it is created (`Project.with3d`), from
the company's subscription at that moment: Premium, or a sponsored Standard with the option
paid. The option is billed monthly at a price set in `/admin`.

## 3. Data model changes

- `enum CompanyKind { INSTALLER SUPPLIER }` and `Company.kind` (default `INSTALLER`). Suppliers
  reuse companies, users, sessions, login, subscriptions and payments.
- `Company.sponsorCompanyId String?` → the supplier `Company` (installers only). The catalog
  lock is `sponsorCompanyId !== null`; nothing else decides it.
- The ANME fields, legal representative, address and tax fields on `Company` become nullable:
  a supplier has none of them, and a self sign-up gives only its ANME code (§7). Dossier
  generation refuses until the installer's ANME code, category and validity dates are filled
  in (added to the generation checks, French message pointing to Paramètres). The ANME code is
  unique among installer companies.
- `enum PlanAudience { INSTALLER SUPPLIER }` and `Plan.audience`. Supplier plans are **packs**
  defined in `/admin`, each with its own price and number of installer accounts, e.g. 50, 100
  or 200 **(user)**: they add `maxSponsoredInstallers Int?` and
  `includesHighlight Boolean @default(false)` (highlighting is part of a pack, not a separate
  add-on **(user)**). `tier` and `monthlyDossierLimit` stay meaningful for installer plans
  only. Each installer account in a pack gets **5 dossiers per month** **(user)**, stored on
  the pack as `dossiersPerInstallerPerMonth Int @default(5)` so the admin can change it per
  pack; this keeps Claude costs bounded under a fixed fee. A sponsored installer's quota uses
  this number, not the Standard plan's limit. Seeded plans: Essai gratuit, Standard and Premium
  (installer); packs are created by the admin. All prices and limits are edited in `/admin`.
- `Plan.isTrial Boolean @default(false)`: a trial plan's dossier limit counts over the whole
  subscription period (from `periodStart`), not per calendar month (§7).
- `Subscription.option3dUntil DateTime?`: the 3D option is paid until this date (null: no
  option). It has its own date because a sponsored installer pays it while its supplier pays
  its Standard plan. The option's monthly price is an admin setting.
- `Project.with3d Boolean @default(false)`, set at creation (§2.1) and carried into the job
  snapshot next to `tier`.
- `SupplierProduct { supplierCompanyId, kind (PV_MODULE | INVERTER), pvModuleId?, inverterId?,
  highlighted Boolean, createdAt }`, unique per supplier and item. A supplier *carries* shared
  catalog items rather than owning rows, because several Tunisian distributors sell the same
  brand and model (two suppliers can carry the same Jinko panel).
- `SupplierProductDailyStat { supplierProductId, date, shownCount, appliedCount }` for the
  supplier report (§6.4).
- `SupplierInvitation { supplierCompanyId, email, tokenHash, expiresAt, acceptedAt? }`.
- `AdminAuditLog { superAdminId, action, targetCompanyId?, details Json, createdAt }`.
- `PaymentMethod` gains `FLOUCI`, `IZI`, `D17` in phase 5 (§8).
- `CompanyUser.disabledAt DateTime?` and an email-verification timestamp.

## 4. Super admin (`/admin`)

What exists: installer list and detail, suspend/activate, change `periodEnd`, record a payment,
catalog CRUD and review. To add:

- **Create a company** (installer or supplier) and its OWNER user. This replaces the
  `*-temp.mjs` scripts at the repo root.
- **Users of a company**: add, disable, reset password (sends a reset email), change login email.
- **Change a company's plan.** Per the master spec §8, the month's usage carries over.
- **Plan CRUD**, grouped by audience: installer plans and supplier packs. The settings page
  only lists plans today.
- **Recording a payment extends the subscription** by one period (a checkbox, ticked by
  default), so payments and `periodEnd` no longer drift apart.
- **Sponsoring**: link an installer to a supplier and unlink it; the supplier detail page shows
  its installers, seats used vs `maxSponsoredInstallers`, carried and highlighted products.
- **Sign-ups inbox**: self sign-ups waiting to be contacted (§7), with a "contacté" note.
- **Se connecter en tant que** (impersonation) for support: a time-limited installer or
  supplier session opened from the admin, with a banner and an audit log entry. Every admin
  mutation writes `AdminAuditLog`.
- **Cost per company**: Claude cost this month (`ClaudeUsageLog`) next to what the company pays.

## 5. Suppliers and sponsored installers

### 5.1 Supplier space (`/fournisseur`)

Login is the shared `/login`; a SUPPLIER company is redirected to `/fournisseur`, an INSTALLER
to the installer app. The `(app)` layout refuses supplier companies and the supplier layout
refuses installers, so a supplier can never create projects on its seats.

- **Produits**: pick the panels and inverters it distributes from the shared catalog, or submit
  a new one (datasheet file and source URL required). A submitted item enters the existing
  catalog review as DRAFT; once the admin publishes it, it is a shared item carried by that
  supplier. Homologation checks are unchanged: a sponsored or highlighted product that is not
  ANME/STEG approved is never proposed.
- **Installateurs**: invite by email (§5.3), see each one's dossiers this month, remove one.
- **Statistiques**: §6.4.

### 5.2 Catalog lock

For a sponsored installer, the panels and inverters in its library, project dropdowns and
sizing are exactly the published products its sponsor carries, and it cannot add others.
Implemented as one more scope next to `libraryScope` in `project-access.ts`, applied to
`PvModule` and `Inverter` wherever `libraryScope` is used (`loadSizingCatalog`,
`equipmentChoiceScope`, the library page). Own equipment creation is refused for sponsored
installers. Items already saved in a project stay valid (`equipmentChoiceScope` already
keeps them), so linking or unlinking never breaks a project.

If the sponsor carries no published inverter (or no panel), the proposals page says
"Votre fournisseur n'a pas encore de … dans DossiPV" instead of the generic missing-library
message.

### 5.3 Joining and leaving

- **Invitation**: the supplier enters an email; the invitee gets a link (7-day expiry). A new
  installer creates its account from the link; an existing installer accepts from its
  Paramètres. Either way it gets `sponsorCompanyId` and the Standard plan. Refused when the
  supplier's pack is full; the supplier then moves to a bigger pack. The admin can also link
  directly (§4).
- **3D option**: the installer pays it (manual payment now, online in phase 5); it stays
  sponsored and locked.
- **Premium**: the installer pays the full Premium plan itself; `sponsorCompanyId` is cleared,
  the seat is freed, and it gets its own equipment and every brand **(user)**. Any 3D option
  it had ends, since Premium includes 3D.
- **Removal by the supplier**: the installer becomes a direct installer with no active plan
  and sees a banner offering Standard or Premium.

### 5.4 Generation rights

A sponsored installer's Standard plan is active while its sponsor's subscription is active;
the installer's own `periodEnd` is not used. When the sponsor's subscription lapses, the
installer cannot generate, and its banner says so and offers to pay Standard or Premium
directly. The 3D option follows its own `option3dUntil`: when it lapses, projects created
afterwards have no 3D page.

## 6. Mise en avant (highlighted products)

Available to suppliers whose plan `includesHighlight` and whose subscription is active. The
supplier marks which of its carried products are highlighted (`SupplierProduct.highlighted`).
Highlighting applies to **direct installers only**: a sponsored installer only ever sees its
own supplier's panels and inverters.

### 6.1 Shown first

- Library catalog page: highlighted products listed first, with a "Sponsorisé" badge.
- Project panel/inverter dropdowns: highlighted products first, with the badge.

### 6.2 Used first in the proposals

`computeProjectProposals` runs the sizing twice:

1. **Sponsored pass**: panels and inverters = all currently highlighted products (whether or
   not they are in the installer's library); every other kind from the installer's library.
   Its RECOMMENDED result, if any, is shown **first** as "Proposition sponsorisée".
2. **Normal pass**: unchanged, from the library only. Its proposals follow.

Applying the sponsored proposal adds its panel and inverter to the installer's library. The
sponsored proposal goes through the same engine checks as every other proposal; highlighting
changes the order, never the technical validity. With several highlighted suppliers, the pass
picks the technically best fit among all of them, so no supplier can buy a ranking against
another.

### 6.3 Labelling

The badge and the "Proposition sponsorisée" title are always visible. Installers trust the
proposals; an unlabelled paid placement would cost their trust.

### 6.4 Supplier statistics

Per product and month: times shown in a sponsored proposal, times applied, dossiers generated
with it, kWc installed with it; per sponsored installer: dossiers this month. No client name,
CIN, address or STEG reference ever reaches the supplier: aggregates only.

## 7. Self sign-up (`/inscription`)

Both self sign-up and admin-created accounts **(user)**.

- Form: company name, contact full name, phone, email, password, governorate, and the
  installer's **ANME code, required** **(user)**, so the admin can check it is a real
  accredited installer. A sign-up with an ANME code already registered is refused ("Ce code
  ANME est déjà inscrit, contactez-nous"), so one installer cannot chain free trials.
- Creates an INSTALLER company with no subscription and its OWNER user, after email
  verification. Rate-limited with the existing auth rate limiter.
- Sends two emails **(user)**: to the installer (welcome, what happens next, your contact
  details) and to the admin address (new sign-up with the installer's details), so both sides
  can contact each other.
- **Free trial** **(user)**: once the email is verified, the company gets the Essai gratuit
  plan: Standard features, **3 dossiers in total**, for **30 days** **(user)**. Same quota rule as
  plans: a project counts once however many times it is regenerated, and a failed job never
  counts. Bill imports during the trial are capped at 10 in total, since each one is a paid
  Claude call.
- When the trial is used up or over, the installer keeps access to its projects and dossiers
  but cannot import a bill or generate until the admin assigns a paid plan; the banner says so
  and gives your contact details.

## 8. Production basics

- **Backups**: nightly `pg_dump` and a sync of the `dossipv_files` volume to storage outside the
  server, with retention (e.g. 7 daily, 4 weekly) and a documented, tested restore in
  `docs/runbooks/`. Nothing in the repo backs up the database or the uploaded files today.
  Required before launch **(user)**; the storage destination is still to be chosen with the
  user.
- **Email**: a transactional email provider over SMTP. Needed for password reset, email
  verification, invitations, sign-up notifications, and the expiry emails at 7 days, 1 day and
  on expiry that the master spec §8 already promised (only the in-app banner exists). The
  worker sends the daily expiry emails.
- **Error monitoring and uptime**: an error tracker for the web app and the worker, and an
  external uptime check. Failed dossier jobs alert the admin.
- **Cleanup**: remove or move the `*-temp.mjs` and `change_pwd.mjs` scripts from the repo root;
  `.dockerignore` does not exclude them and the Dockerfile copies the whole repo, so today they
  ship in the production image.
- **Legal** (user to resolve, as in master spec §9): CGU/CGV, privacy policy, INPDP declaration
  for CIN copies, STEG contracts and bills, and a data-retention rule.
- **Invoices**: a Tunisian invoice PDF per payment (matricule fiscal, VAT, timbre fiscal).
- **Online payment (phase 5)**: Flouci, izi and D17 **(user)**. Each provider's merchant API,
  fees and webhook support are checked before building. A "Renouveler" / upgrade button pays
  the plan price; the webhook extends `periodEnd` and writes a `Payment` with the gateway
  reference, as the master spec §8 describes for Konnect.

## 9. Phases

1. **Launch for direct installers**: backups, email (password reset, expiry emails), error
   monitoring, cleanup, admin creates companies and users, plan CRUD and plan change, payment
   extends the subscription, the 3D view becomes Premium-only (§2.1), audit log, impersonation.
   Selling to installers can start here.
2. **Self sign-up and free trial** (§7).
3. **Suppliers and sponsored installers** (§3, §5), with the 3D option (§2.1).
4. **Mise en avant** (§6).
5. **Online payment** (§8), invoices.

Phase 3 comes before phase 4 because the highlighting rules depend on the catalog lock.

## 10. Decisions and open defaults

Decided by the user on 2026-10-23:
- Highlighted products get their own first proposal card ("Proposition sponsorisée") next to
  the neutral proposals, rather than replacing the neutral RECOMMENDED one.
- Highlighting is part of a supplier pack, not a separate add-on.
- Suppliers buy packs of installer accounts (e.g. 50, 100, 200), each priced in `/admin`.
  Each account in a pack has 5 dossiers per month.
- Direct Standard installers keep the right to add their own equipment (today's behaviour);
  only sponsored installers lose it.
- Free trial of 3 dossiers after self sign-up, limited to 30 days.
- Backups are required before launch; their destination is decided later.

Still open (default chosen here):
1. Bill imports during the trial are capped at 10 in total.
