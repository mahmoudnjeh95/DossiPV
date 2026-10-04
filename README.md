# DossiPV

Web app that builds photovoltaic installation dossiers: installers enter a project, the
engine runs the electrical checks, and the document pipeline produces the dossier.

- `apps/web` — Next.js 16 app. `/login` for installer companies, `/admin/login` for the super admin.
- `packages/*` — db (Prisma + PostgreSQL), auth, engine, file-storage, docx-template,
  document-text, dossier-worker, pvgis-client. They are TypeScript source, not built separately.
- `docs/superpowers` — design specs and implementation plans.

## Run it locally

Needs Node 25+ and Docker.

```bash
npm ci
npm run db:up                        # local Postgres on 127.0.0.1:5432 (docker-compose.dev.yml)
npm run setup:env                    # creates apps/web/.env and packages/db/.env from .env.example
npm run generate --workspace=@dossipv/db
npm run db:migrate                   # applies the migrations
npm run db:seed                      # optional demo data; refuses to run on a non-empty database
SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='at-least-12-chars' npm run create-super-admin
npm run dev --workspace=@dossipv/web
```

Then open <http://localhost:3000/login> (installers) or <http://localhost:3000/admin/login> (super admin).
The seeded installer accounts have placeholder password hashes and cannot log in; use the super admin to
manage installers.

Checks, the same ones CI runs: `npm run lint`, `npm run typecheck`, `npm test` (tests need `DATABASE_URL`).

**Never point local work at the production database.** Production Postgres is only reachable on the
server's `127.0.0.1:5433`, which is what an SSH tunnel forwards. Local development uses port 5432 on
purpose, so the two cannot be confused.

## Production

Live at <http://217.182.205.137:3001> (plain HTTP, no domain yet).

Everything runs in Docker on the server under `/home/debian`:

| Thing                           | Where                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| Compose file and secrets `.env` | `/home/debian/dossipv/` (keep this folder)                  |
| Build scratch folder            | `/home/debian/dossipv-release/` (temporary; safe to delete) |
| App container                   | `dossipv-app-1`, bound to `127.0.0.1:3100`                  |
| Database container              | `dossipv-postgres-1`, data in volume `dossipv_pgdata`       |
| Uploaded files                  | volume `dossipv_files`                                      |
| Public entry point              | nginx on port 3001, config in `deploy/nginx-dossipv.conf`   |

Pushing to `main` runs lint, typecheck and tests, then `.github/workflows/deploy.yml` builds the image
on the server and restarts the app.

### Database migrations on the server

The deploy does **not** apply migrations yet. After merging a change that adds a migration, run on the server:

```bash
cd /home/debian/dossipv
docker compose run --rm --no-deps -w /app/packages/db app npx prisma migrate deploy
```

### Create or reset the production super admin

```bash
docker exec -e SUPER_ADMIN_EMAIL=you@example.com -e SUPER_ADMIN_PASSWORD='at-least-12-chars' \
  dossipv-app-1 node packages/auth/scripts/create-super-admin.mjs
```

### Inspect the server

```bash
docker ps -a --filter name=dossipv
docker volume ls | grep dossipv
docker images dossipv-web
docker logs --tail 100 dossipv-app-1
docker exec -it dossipv-postgres-1 psql -U dossipv -d dossipv
```
