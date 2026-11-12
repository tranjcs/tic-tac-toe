# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first so this layer is cached between code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public

USER node

# Cloud Run sets PORT=8080; src/config.js reads it.
ENV PORT=8080
# Cloud Run appends the real client address to X-Forwarded-For; per-address limits use it.
ENV TRUST_PROXY=1
EXPOSE 8080

# Exec form so SIGTERM reaches Node directly for graceful shutdown.
CMD ["node", "src/index.js"]
