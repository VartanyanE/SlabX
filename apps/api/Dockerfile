FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @slabx/api... build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build --chown=node:node /app /app
RUN chown node:node /app
USER node
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:5050/health/live || exit 1
CMD ["pnpm", "--filter", "@slabx/api", "start"]
