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

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Push schema (creates/updates tables) then start the server
CMD ["sh", "-c", "npx drizzle-kit push --force && node dist/index.cjs"]
