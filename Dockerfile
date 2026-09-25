# syntax=docker/dockerfile:1

# node:24-alpine (Active LTS) — digest verificado con:
#   docker buildx imagetools inspect node:24-alpine
# Incluye linux/amd64 y linux/arm64.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

############ 1) deps de producción ############
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# bcrypt eliminado: no quedan módulos nativos; --ignore-scripts es seguro.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

############ 2) runtime ############
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    PORT=8000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

RUN apk add --no-cache dumb-init=1.2.5-r4 curl=8.22.0-r0 \
 && rm -rf /var/cache/apk/*

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node app.js server.js package.json ./
COPY --chown=node:node config ./config
COPY --chown=node:node routes ./routes
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node models ./models
COPY --chown=node:node middlewares ./middlewares
COPY --chown=node:node services ./services
COPY --chown=node:node jobs ./jobs
COPY --chown=node:node assets ./assets
COPY --chown=node:node scripts ./scripts

USER node
EXPOSE 8000

# Justificación: shell form es necesario para expandir ${PORT} en el healthcheck.
# hadolint ignore=DL3025
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
# Migraciones NUNCA en el arranque: ejecutarlas como job aparte:
#   docker run --rm --env-file .env <imagen> node scripts/migrate_full_schema.js
CMD ["node", "server.js"]
