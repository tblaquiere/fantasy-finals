FROM node:20-alpine

WORKDIR /app

# Enable pnpm via corepack (project uses pnpm@10.31.0 per package.json)
RUN corepack enable

# Copy package files, lockfile, and prisma schema before install
# (postinstall runs: prisma generate, which needs the schema)
COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma/

# Install all deps (pnpm installs platform-appropriate optional deps by default,
# which is required for @tailwindcss/oxide Linux native bindings).
# NOTE: devDependencies are included because the worker process uses tsx at runtime.
# TODO Story 1.6: Switch to multi-stage build after worker is compiled to JS,
# then use --prod to reduce image size.
RUN pnpm install --frozen-lockfile

# Copy rest of source
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

RUN pnpm run build

# Standalone output doesn't include static assets — copy them in
RUN cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

CMD ["node", ".next/standalone/server.js"]
