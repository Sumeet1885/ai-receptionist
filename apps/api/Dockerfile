# Build context: repository root (pnpm workspace).
#   docker build -f apps/api/Dockerfile .
FROM node:22-alpine

# Install the pnpm version declared in package.json directly, independent of bundled Corepack.
RUN npm install -g pnpm@10.34.7

WORKDIR /repo

# Manifests first so the dependency layer is cached independently of source changes.
# Every workspace manifest is copied so the shared lockfile can be checked (--frozen-lockfile).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/contracts/package.json packages/contracts/
# The api and the workspace packages it uses; dev dependencies included (tsx runs the server).
RUN pnpm install --frozen-lockfile --filter "@ai-receptionist/api..."

COPY --chown=node:node packages/contracts packages/contracts
COPY --chown=node:node apps/api apps/api

WORKDIR /repo/apps/api

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

USER node

# Same command as `pnpm start`, without needing pnpm at runtime.
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
