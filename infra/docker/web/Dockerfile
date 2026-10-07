# Panel web de Nubera. Build en dos etapas: la imagen final solo lleva la salida
# "standalone" de Next.js (el servidor mínimo y las dependencias que realmente usa).
FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter "@nubera/web..."

COPY apps/web apps/web
COPY packages/core packages/core
RUN pnpm --filter @nubera/web build

FROM node:22-alpine AS run

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
