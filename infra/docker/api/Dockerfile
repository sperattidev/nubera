# API de Nubera (imagen de desarrollo/staging). Ejecuta TypeScript con tsx;
# para producción conviene compilar a JavaScript.
FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter "@nubera/api..."

# El código pertenece al usuario sin privilegios con el que corre la API.
COPY --chown=node:node apps/api apps/api
COPY --chown=node:node packages/db packages/db
COPY --chown=node:node packages/core packages/core

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
USER node
EXPOSE 3000

# Aplica las migraciones pendientes y arranca la API.
CMD ["sh", "-c", "cd /app/packages/db && ./node_modules/.bin/tsx src/migrate.ts && cd /app/apps/api && ./node_modules/.bin/tsx src/server.ts"]
