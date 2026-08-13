# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS dependencies

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install --no-install-recommends --yes openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS migrate

COPY apps/backend/prisma.config.ts apps/backend/prisma.config.ts
COPY apps/backend/prisma apps/backend/prisma
COPY apps/backend/src/checkpoint/setup.ts apps/backend/src/checkpoint/setup.ts

WORKDIR /workspace/apps/backend

CMD ["pnpm", "db:bootstrap"]

FROM dependencies AS build

COPY . .

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter @tuteur/backend db:generate \
    && pnpm build

FROM build AS backend-deploy

RUN pnpm --filter @tuteur/backend deploy --prod /runtime/backend

FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS backend

ENV NODE_ENV="production"
ENV PORT="3001"
ENV INGEST_UPLOAD_DIR="/data/uploads"

RUN apt-get update \
    && apt-get install --no-install-recommends --yes ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/uploads \
    && chown node:node /data/uploads

WORKDIR /app

COPY --from=backend-deploy --chown=node:node /runtime/backend/package.json ./package.json
COPY --from=backend-deploy --chown=node:node /runtime/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/backend/dist ./dist

USER node

EXPOSE 3001

CMD ["node", "dist/server.js"]

FROM nginxinc/nginx-unprivileged:1.30.2-alpine3.23-slim@sha256:59a7114c40708c891cc71f0338d116d9410d7c2a72d8d2e61ce4148219a20b10 AS frontend

COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html

EXPOSE 8080
