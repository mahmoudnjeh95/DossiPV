# DossiPV production image for apps/web.
#
# Why the whole npm workspace is shipped (not Next's `output: standalone`):
# the @dossipv/* packages are TS-source-only (no build step, "main" points
# straight at src/index.ts) and are resolved at runtime via npm workspace
# symlinks. Next's file tracer doesn't vendor them into
# `.next/standalone/node_modules`, so a bare standalone copy can't run on
# its own. This image instead installs the full workspace and runs
# `next start` against a full `next build`.
#
# package.json requires Node >=25; the server's own system Node (v20) is
# intentionally NOT used — everything runs inside this container.

ARG NODE_VERSION=25-alpine

# ---- deps: install once, reused by builder ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/docx-template/package.json packages/docx-template/package.json
COPY packages/document-text/package.json packages/document-text/package.json
COPY packages/dossier-worker/package.json packages/dossier-worker/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/file-storage/package.json packages/file-storage/package.json
COPY packages/pvgis-client/package.json packages/pvgis-client/package.json

RUN npm ci

# ---- builder: generate the Prisma client, build Next ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# DATABASE_URL isn't needed to generate the client (only to connect at
# runtime), but prisma.config.ts loads it eagerly — a placeholder is enough.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run --workspace=@dossipv/db generate

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@dossipv/web

# ---- runner: smallest image that can actually run next start ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S dossipv && adduser -S dossipv -G dossipv

COPY --from=builder /app ./
RUN mkdir -p /app/apps/web/.file-storage && chown -R dossipv:dossipv /app/apps/web/.file-storage

USER dossipv
EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=@dossipv/web"]
