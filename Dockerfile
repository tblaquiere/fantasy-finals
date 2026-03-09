FROM node:20-alpine

WORKDIR /app

# Copy package files and prisma schema before install
# (postinstall runs: prisma generate, which needs the schema)
COPY package.json ./
COPY prisma ./prisma/

# Install all deps including optional platform-specific native binaries
# (required for @tailwindcss/oxide Linux bindings)
# NOTE: devDependencies are included because the worker process uses ts-node at runtime.
# TODO Story 1.6: Switch to multi-stage build after worker is compiled to JS,
# then use --omit=dev to reduce image size.
RUN npm install --include=optional

# Copy rest of source
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

RUN npm run build

# Standalone output doesn't include static assets — copy them in
RUN cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

CMD ["node", ".next/standalone/server.js"]
