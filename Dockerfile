# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install build tools needed for native modules (bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# package-lock.json is generated on Replit, where 10 packages resolve through the
# internal package-firewall.replit.local proxy. Rewrite those to the public registry
# so npm install works outside Replit. Done at build time so the committed lock file
# stays byte-identical to Replit's (no merge conflicts).
RUN sed -i 's|https\?://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json
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
# drizzle-kit config/schema kept for manual `npm run db:push` if ever needed
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/shared ./shared

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# drizzle-kit push is NOT run automatically: its interactive prompts have
# mis-resolved to destructive DROPs before. Schema sync is handled additively
# inside the server on boot (server/ensure-schema.ts) — same code path on Docker
# and Replit. Any real column/table removal must be a deliberate, reviewed migration.
CMD ["node", "dist/index.cjs"]
