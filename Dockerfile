FROM node:22-alpine AS base
RUN npm install -g npm@11.16.0

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json ./
RUN npm install

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

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DOCKER=1

RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 dietledger

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /app/package.json /app/package.json
RUN node -e "const v=require('./package.json').version;require('fs').writeFileSync('/app/BUILD_VERSION',v)" && \
    chown -R dietledger:nodejs /app && \
    sed -i 's/\r$//' docker-entrypoint.sh && \
    chmod +x docker-entrypoint.sh

USER dietledger

EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
