# Seoudi PIM – production image (Next.js standalone + Prisma)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/uploads && chown -R node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# prisma CLI + schema/migrations/seed for `docker compose run app npm run db:setup`
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/package.json /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src/lib ./src/lib
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
