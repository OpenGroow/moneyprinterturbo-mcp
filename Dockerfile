# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --- dev: all deps, code mounted as a volume, hot reload via tsx watch
FROM base AS dev
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
EXPOSE 4600
CMD ["pnpm", "dev"]

# --- build : compile le TypeScript
FROM dev AS build
RUN pnpm build

# --- prod : deps de prod uniquement + dist/
FROM base AS prod
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
EXPOSE 4600
USER node
CMD ["node", "dist/index.js"]
