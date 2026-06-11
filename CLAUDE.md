# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"HireFlow" — the operations system for the **KW Platin & Karma** real estate office. It started as an
ATS (jobs/candidates/applications/interviews/offers) but now also covers **Employees** (active realtors),
**Closings** (İşlem Kapanışı — commission/BHB/cap financial calculations), **Expenses**, **P&L**,
**Coaching** (ÜK/DÜA), and **Portal Listings** (İlanlar — weekly sahibinden/hepsiemlak CSV import with
advisor matching + WhatsApp self-service). The legacy `replit.md` describes only the original ATS and is
out of date for the financial/listing modules — trust the code over it.

All user-facing text is **Turkish**.

## Commands

Development is done through **Docker Compose** (the `npm run dev` script uses bash-style `NODE_ENV=...`
inline env vars which don't work in Windows PowerShell). After any source change, rebuild the image — the
container runs the bundled `dist`, not the source.

```bash
docker compose build --no-cache && docker compose up -d   # rebuild + (re)start app on :5000
docker compose logs app --since=30s                       # app logs
docker compose exec postgres psql -U hireflow -d hireflow # DB shell (db/user/pass: hireflow / hireflow / hireflow_password)
```

Other scripts:

```bash
npm run build     # tsx script/build.ts → vite build (client) + esbuild bundle server to dist/index.cjs
npm run check     # tsc typecheck (the build itself does NOT typecheck — esbuild strips types)
npm run db:push   # drizzle-kit push (apply shared/schema.ts to the DB)
```

There is **no test suite** and no linter configured. `npm run check` is the only static gate.

Default seeded admin login: **admin@kw.com.tr / admin123** (created on startup if the users table is empty).

## Architecture

**Single Express server serves both the API and the React SPA on port 5000.**
- Dev: Vite middleware (`server/vite.ts`). Prod: `server/static.ts` serves `dist/public` with an SPA
  fallback (`/{*path}` → `index.html`) — this is why public client routes like `/l/:token` work on reload.
- API routes are all under `/api/*` and registered in `server/routes.ts` via `registerRoutes()`.

**`shared/schema.ts` is the single source of truth.** It defines every Drizzle table plus the
enums/constants/derived types shared by client and server (imported via the `@shared` alias). Path aliases:
`@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`.

**`server/storage.ts` is one large `DatabaseStorage` class (~3000 lines) holding nearly all DB access and
business logic** — cap/BHB calculations, P&L aggregation, listing import diff + fuzzy advisor matching, etc.
Routes are thin wrappers around storage methods. When adding a feature, put logic here, not in routes.

**Schema changes:** edit `shared/schema.ts`, then the table is created/updated by `drizzle-kit push`. In
Docker this runs automatically on container start (`Dockerfile` CMD: `npx drizzle-kit push --force && node dist/index.cjs`),
so a `docker compose build && up` is enough to apply schema changes. Migration files under `./migrations`
are not used in practice (`push --force` is the workflow). `server/index.ts` also creates the
`user_sessions` and `office_expenses` tables via raw SQL on boot as a belt-and-suspenders measure.

**Auth:** session-based (`express-session` + `connect-pg-simple`, `user_sessions` table). Middleware
`requireAuth` / `requireAdmin` in `server/auth.ts`. Three roles drive both API scoping and client nav:
`admin`, `hiring_manager`, `assistant` (see `jobFilter()` in routes.ts and the nav lists in
`client/src/components/Layout.tsx`). Most financial modules (closings, expenses, P&L, listings) are
admin-only. There are also intentionally **public, unauthenticated** routes for advisor self-service:
`GET/POST /api/public/listings/:token/*`, rendered by the client route `/l/:token` (`PublicListing.tsx`).

**Client:** React 18 + Wouter (routing in `client/src/App.tsx`) + TanStack Query + shadcn/ui
(`client/src/components/ui`) + Recharts. Query keys are the API path strings; mutations invalidate those keys.

## WhatsApp (Green API) — `server/whatsapp.ts`

Env vars: `GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN`, `PUBLIC_BASE_URL` (set in `docker-compose.yml`; real
values via a gitignored `.env`). The API base URL is derived from the **first 4 digits** of the instance ID
(`https://{prefix}.api.greenapi.com`). `sendWhatsApp()` returns the Green API `idMessage` (stored to track
delivery); `checkWhatsAppStatus()` polls delivery state. Used for closing breakdowns (per agent) and for
listing agreement/close-reason request links. `PUBLIC_BASE_URL` must point at the real domain in production
or the advisor `/l/:token` links will be wrong.

## Conventions & gotchas

- **Rebuild required:** the prod container runs `dist/index.cjs`; source edits don't take effect until
  `docker compose build`. There is no hot reload in the Docker setup.
- **CSV imports are parsed client-side** (handling quoted fields/Turkish headers) and POSTed as JSON `rows`.
  Closings: `/api/closings/import`. Listings: `/api/listings/import` with `type: "active" | "passive"` and a
  `notify` flag. Header matching is accent/spacing-insensitive.
- **Listing advisor → employee matching is fuzzy** (`resolveEmployeeId` in storage.ts): exact deaccented
  full name → first+surname (tolerates middle names) → abbreviated surname → token-subset; it only assigns
  when the match is **unique**, otherwise leaves it unmatched (so no wrong advisor gets messaged).
- **Uploaded files (yetki sözleşmesi) are stored as base64 in the DB** (`listings.agreementFileData`), not on
  disk. `express.json` limit is `10mb`.
- **ÜK rate parsing:** the DB may store `"10"` rather than `"10%"`. Always parse with
  `parseInt(str.replace(/[^0-9]/g, "")) || 5` before dividing by 100 (used in both storage.ts and Closings.tsx).
- **Closings list editing** is read-only inline (`InlineCell`/`InlineSelect` render plain text); edits go
  through the Pencil dialog. Approve flow accepts TR (`GG.AA.YYYY`) and ISO date formats.
- **Git:** end commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Remote is
  `MustafaCelen/ats`, default branch `main`.
