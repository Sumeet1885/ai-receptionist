# Build context: repository root (npm workspaces).
#   docker build -f apps/api/Dockerfile .
FROM node:20-alpine

WORKDIR /repo

# Manifests first so the dependency layer is cached independently of source changes.
# Every workspace manifest is copied so `npm ci` can validate the shared lockfile.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci -w @ai-receptionist/api

COPY --chown=node:node packages/contracts packages/contracts
COPY --chown=node:node apps/api apps/api

WORKDIR /repo/apps/api

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

USER node

CMD ["npm", "start"]
