FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./app/
ENV EC_DB=/data/trump-card.db
ENV PORT=3001
ENV NODE_ENV=production
RUN mkdir -p /data && chown -R appuser:appgroup /app /data
USER appuser
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "app/main.js"]