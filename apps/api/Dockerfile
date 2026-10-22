FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
COPY prisma prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @coroinha/api exec prisma generate --schema ../../prisma/schema.prisma
RUN pnpm --filter @coroinha/api build
EXPOSE 3333
CMD ["sh", "-c", "pnpm exec prisma migrate deploy --schema prisma/schema.prisma && pnpm --filter @coroinha/api start"]
