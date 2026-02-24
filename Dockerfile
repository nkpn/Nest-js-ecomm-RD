# syntax=docker/dockerfile:1.7

# Common base image for build/runtime stages.
# Debian base keeps native modules compatible with distroless Debian runtime.
FROM node:22-bookworm-slim AS base
WORKDIR /app

# 1) deps stage:
# Install all dependencies from lockfile for reproducible builds.
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Dev runtime for bind-mount workflow.
# Fast startup: dependencies are preinstalled at build time and reused from cache.
FROM deps AS dev
ENV NODE_ENV=development
CMD ["npm", "run", "start:dev"]

# 2) build stage:
# Compile TypeScript -> JavaScript (`dist/`) using dev toolchain.
FROM deps AS build
COPY . .
RUN npm run build

# Job image for one-off operational tasks.
# Contains source + dev toolchain (ts-node/typeorm CLI) for migrate/seed commands.
FROM deps AS jobs
COPY . .
ENV NODE_ENV=development

# Install runtime dependencies only (without devDependencies).
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev \
  && npm cache clean --force

# 3) prod stage:
# Runtime image with only what is needed to start Nest in production.
FROM node:22-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]

# 4) prod-distroless stage:
# Extra-minimal runtime with nonroot user and no shell/package manager.
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS prod-distroless
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
# Distroless node image already has node as entrypoint.
CMD ["dist/src/main.js"]
