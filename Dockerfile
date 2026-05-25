FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat sqlite
WORKDIR /app
COPY package.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev && \
    npx prisma generate && \
    rm -f prisma/dev.db
ENV DATABASE_URL=file:/app/prisma/seed.db
RUN npx prisma db push --skip-generate
COPY prisma/fts5-setup.sql /tmp/fts5-setup.sql
RUN sqlite3 /app/prisma/seed.db < /tmp/fts5-setup.sql

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN BUILD_VERSION=$(node -e "console.log(require('./package.json').version)") && \
    echo "${BUILD_VERSION}" > /tmp/version.txt && \
    echo "[DietLedger] Building version: ${BUILD_VERSION}" && \
    node scripts/version-sync.js && \
    sed -i 's|  images:|  output: "standalone",\n  images:|' next.config.ts && \
    sed -i 's|  output: "export"|  // output: "export"|' next.config.ts && \
    export BUILD_VERSION=$(cat /tmp/version.txt) && \
    NEXT_PUBLIC_APP_VERSION=${BUILD_VERSION} npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DOCKER=1

RUN apk add --no-cache wget sqlite && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 dietledger

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma/
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma/
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=deps /app/prisma/seed.db /app/db/seed.db
COPY prisma/fts5-setup.sql /app/db/fts5-setup.sql
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
