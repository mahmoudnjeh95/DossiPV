# Runbook: importing the shared catalog into production

Loads the extracted catalog (`data/catalog/pv-modules.json`, `inverters.json`, `cables.json`,
`protections.json`) into the production database as **DRAFT** shared items, ships their datasheet
PDFs to the server, then removes the old unsourced test items.

The import runs on a workstation. File rows go to the production database, but the PDF bytes are
written to the local `FILE_STORAGE_ROOT`. They must therefore be written to a staging folder and
copied into the server's file volume **before** any imported item is published. (The worker now
skips a missing equipment datasheet with a warning instead of failing the job, but the dossier is
then incomplete.)

## 1. Prerequisites

- **Migrations first.** Apply the branch's migrations to production with `migrate:deploy` **before**
  deploying the new image (the deploy workflow does not migrate). Through the SSH tunnel
  (`ssh -L 5433:127.0.0.1:5433 <user>@<server>`):

  ```bash
  cd packages/db
  DATABASE_URL='postgresql://dossipv:<password>@localhost:5433/dossipv' npm run migrate:deploy
  ```

  The `library_item_one_fk_matches_kind` CHECK constraint (migration
  `20261021130000_installer_library`) is hand-written SQL that Prisma's schema does not show, so
  `prisma db push` or a schema diff will not create or show it. Use `migrate deploy` only, and check
  that it exists:

  ```sql
  SELECT conname FROM pg_constraint WHERE conname = 'library_item_one_fk_matches_kind';
  ```

- `data/catalog/*.json` reviewed and committed (`fetch-lists` and `extract` already run).
- An **empty** local staging folder, e.g. `~/catalog-staging`.

## 2. Import (dry run, then apply)

From `packages/catalog-import`, with the tunnel open. Shell variables override the `.env` files the
`catalog` script loads:

```bash
export DATABASE_URL='postgresql://dossipv:<password>@localhost:5433/dossipv'   # production tunnel
export FILE_STORAGE_ROOT="$HOME/catalog-staging"                               # empty staging folder

npm run catalog -- import            # dry run: prints the counts, writes nothing
npm run catalog -- import --apply    # creates/updates DRAFT items, writes PDFs to the staging folder
```

Run `echo "$DATABASE_URL"` before `--apply` and make sure it points at production.

When a datasheet cannot be downloaded or saved, the item is still imported, without a datasheet.
Its `importNotes` gets the line `Fiche technique non téléchargée : <url>`. Find these items in the
admin catalog review and attach the datasheet by hand before publishing them.

## 3. Copy the PDFs into the server's file volume (before publishing)

The `app` and `worker` services in `deploy/docker-compose.yml` mount the named volume
`dossipv_files` at `/app/apps/web/.file-storage` (= their `FILE_STORAGE_ROOT`). The staging folder
holds `equipment/<uuid>-<model>.pdf` files whose storage keys are already in the database. Copy
them over without changing their paths:

```bash
scp -r ~/catalog-staging <user>@<server>:/home/debian/catalog-staging
ssh <user>@<server>
docker cp /home/debian/catalog-staging/. dossipv-app-1:/app/apps/web/.file-storage/
docker exec -u root dossipv-app-1 chown -R dossipv:dossipv /app/apps/web/.file-storage/equipment
rm -rf /home/debian/catalog-staging
```

Check that every catalog file is present. Run this query on the database and compare its output
with the listing of `/app/apps/web/.file-storage/equipment` (`docker exec dossipv-app-1 ls ...`):

```sql
SELECT f."storageKey" FROM file f
JOIN pv_module m ON m."datasheetFileId" = f.id WHERE m."ownerCompanyId" IS NULL
UNION
SELECT f."storageKey" FROM file f
JOIN inverter i ON i."datasheetFileId" = f.id WHERE i."ownerCompanyId" IS NULL;
```

Publish drafts in the admin catalog review only after this step.

## 4. Purge the old test items

Same environment variables as step 2:

```bash
npm run catalog -- purge-test-items          # dry run: prints "Base : <host/db>", then the deletable and still-referenced items
npm run catalog -- purge-test-items --apply  # after reviewing the list
```

Only shared items with no `datasheetSourceUrl` that no project uses are deleted. Items that a
project still uses are listed and kept.

## Known gap: run this import only once until expiry is implemented

The import does **not** yet mark catalog items that have dropped off the official STEG/ANME lists
as expired. This must be built before a **second** production import. Otherwise, items removed
from the lists stay selectable as if they were still approved.
