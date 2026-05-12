FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN sed -i 's|// output: "standalone"|  output: "standalone"|' next.config.ts
RUN sed -i 's|  output: "export"|  // output: "export"|' next.config.ts
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DOCKER=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nutrilabel

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p db && chown -R nutrilabel:nodejs /app

USER nutrilabel

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
