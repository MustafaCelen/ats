# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install build tools needed for native modules (bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim AS runner
WORKDIR /app

# Copy built artifacts and deps from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# drizzle-kit needs the config and schema to push migrations
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/script ./script

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# drizzle-kit push is NOT run automatically here: its interactive prompts don't
# behave reliably with piped input in a non-TTY context (a piped "No" was once
# observed resolving to "Yes, delete this column" — see git history). Schema
# sync relies solely on ensure-tables.sh, which is additive-only (no DROPs) and
# fully under our control. Any actual column/table removal must be a deliberate,
# manually-reviewed migration, never part of the automated boot sequence.
CMD ["sh", "-c", "sh script/ensure-tables.sh; node dist/index.cjs"]
