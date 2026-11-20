# Reviewed linux/amd64 upstream manifest, 2026-11-19; update with release scans.
FROM node:22.23.2-alpine@sha256:b64da1de5a51067ab8e75f0bc8dbd0905d8894baa22261f439a4572f41291e50 AS base
ARG BUILD_VERSION=dev
LABEL org.opencontainers.image.version=${BUILD_VERSION}
# Existing Node/Alpine libraries only; reviewed security floors, 2026-11-19.
RUN test "$(node --version)" = "v22.23.2" && \
    apk add --no-cache --upgrade 'musl>=1.2.6-r3' 'musl-utils>=1.2.6-r3' 'zlib>=1.4-r0' \
        'libcrypto3>=3.5.9-r1' 'libssl3>=3.5.9-r1' && \
    npm install -g npm@11.16.0

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN BUILD_VERSION=$(node -e "console.log(require('./package.json').version)") && \
    echo "${BUILD_VERSION}" > /tmp/version.txt && \
    echo "[DietLedger] Building version: ${BUILD_VERSION}" && \
    node scripts/version-sync.js && \
    node scripts/docker-prep.js && \
    export BUILD_VERSION=$(cat /tmp/version.txt) && \
    NEXT_PUBLIC_APP_VERSION=${BUILD_VERSION} \
    npx next build --webpack

# Final services execute Node directly. Retain npm/npx only in build stages;
# remove bundled package-manager code as well as every associated CLI shim.
FROM base AS runtime
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
        /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx && \
    test "$(node --version)" = "v22.23.2" && \
    for tool in npm npx yarn yarnpkg corepack pnpm pnpx; do \
        if command -v "$tool"; then exit 1; fi; \
    done

FROM runtime AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DOCKER=1
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 dietledger

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /app/package.json /app/package.json
RUN (test "$BUILD_VERSION" = dev || node -e 'if(require("./package.json").version!==process.argv[1])process.exit(1)' "$BUILD_VERSION") && \
    node -e "const v=require('./package.json').version;require('fs').writeFileSync('/app/BUILD_VERSION',v)" && \
    chown -R dietledger:nodejs /app && \
    sed -i 's/\r$//' docker-entrypoint.sh && \
    chmod +x docker-entrypoint.sh

USER dietledger

EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
