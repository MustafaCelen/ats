import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cron from "node-cron";
import { pool } from "./db";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { isFonzipConfigured, syncFonzipRecentDebts, syncFonzipUsersFinancials } from "./fonzip";

const PgStore = connectPgSimple(session);

const app = express();
app.set("trust proxy", 1);
app.use(compression());
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const sessionStore = new PgStore({
  pool,
  tableName: "user_sessions",
});

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
  }),
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar PRIMARY KEY NOT NULL,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");

    ALTER TABLE "office_expenses" ADD COLUMN IF NOT EXISTS "employee_id" integer;

    ALTER TABLE "closing_agents" ADD COLUMN IF NOT EXISTS "closing_date" timestamp;
    ALTER TABLE "closing_agents" ADD COLUMN IF NOT EXISTS "status" text;
    ALTER TABLE "closing_agents" ADD COLUMN IF NOT EXISTS "payment_collected" boolean NOT NULL DEFAULT false;
    ALTER TABLE "closing_agents" ADD COLUMN IF NOT EXISTS "ilgili_ay" text;
    ALTER TABLE "closings" ADD COLUMN IF NOT EXISTS "ilgili_ay" text;
    CREATE INDEX IF NOT EXISTS "closing_agents_closing_date_idx" ON "closing_agents" ("closing_date");
    CREATE INDEX IF NOT EXISTS "closing_agents_status_idx" ON "closing_agents" ("status");

    CREATE TABLE IF NOT EXISTS "office_expenses" (
      "id" serial PRIMARY KEY NOT NULL,
      "type" text NOT NULL,
      "category" text NOT NULL,
      "amount" numeric(15, 2) NOT NULL,
      "date" text NOT NULL,
      "notes" text,
      "created_by_user_id" integer,
      "created_at" timestamp DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "financial_targets" (
      "id" serial PRIMARY KEY NOT NULL,
      "year" integer NOT NULL,
      "month" integer NOT NULL,
      "bhb_target" numeric(15, 2),
      "bm_target" numeric(15, 2),
      "satilik_adet_target" integer,
      "kiralik_adet_target" integer,
      "created_at" timestamp DEFAULT now()
    );
    ALTER TABLE "financial_targets" ADD COLUMN IF NOT EXISTS "bhb_high_target" numeric(15,2);
    ALTER TABLE "financial_targets" ADD COLUMN IF NOT EXISTS "bm_high_target" numeric(15,2);
    ALTER TABLE "financial_targets" ADD COLUMN IF NOT EXISTS "satilik_adet_high_target" integer;
    ALTER TABLE "financial_targets" ADD COLUMN IF NOT EXISTS "kiralik_adet_high_target" integer;
    ALTER TABLE "financial_targets" ADD COLUMN IF NOT EXISTS "office" text NOT NULL DEFAULT '';
    DROP INDEX IF EXISTS "financial_targets_year_month_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "financial_targets_year_month_office_idx" ON "financial_targets" ("year", "month", "office");

    ALTER TABLE "interview_targets" ADD COLUMN IF NOT EXISTS "office" text NOT NULL DEFAULT '';
    DROP INDEX IF EXISTS "interview_targets_unique_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "interview_targets_job_year_month_cat_office_idx" ON "interview_targets" ("job_id", "year", "month", "category", "office");

    CREATE TABLE IF NOT EXISTS "listing_price_history" (
      "id" serial PRIMARY KEY,
      "listing_id" integer NOT NULL,
      "old_price" numeric(15,2),
      "new_price" numeric(15,2),
      "changed_at" timestamp DEFAULT now()
    );
    ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "advisor_token" text UNIQUE;
    ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "advisor_last_notified_at" timestamp;
    ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "advisor_notify_msg_id" text;
    ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "advisor_last_email_notified_at" timestamp;

    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "agreement_reminder_sent_at" timestamp;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "close_reason_reminder_sent_at" timestamp;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "no_agreement_at" timestamp;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "notify_msg_id_new" text;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "notify_msg_id_passive" text;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "close_reason_requested_at" timestamp;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "close_reason" text;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "close_reason_note" text;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "close_reason_submitted_at" timestamp;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "agreement_uploaded_at" timestamp;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "passive_at" timestamp;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "can_view_financials" boolean NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS "listing_agreement_files" (
      "id" serial PRIMARY KEY NOT NULL,
      "listing_id" integer NOT NULL,
      "name" text NOT NULL,
      "mime" text NOT NULL,
      "data" text NOT NULL,
      "uploaded_at" timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "laf_listing_id_idx" ON "listing_agreement_files" ("listing_id");

    CREATE TABLE IF NOT EXISTS "teams" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" text NOT NULL UNIQUE,
      "created_at" timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS "team_members" (
      "id" serial PRIMARY KEY NOT NULL,
      "team_id" integer NOT NULL,
      "employee_id" integer NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_employee_idx" ON "team_members" ("team_id", "employee_id");

    CREATE TABLE IF NOT EXISTS "exchange_rates" (
      "date" text PRIMARY KEY,
      "usd_try" numeric(15, 4),
      "gold_gram_try" numeric(15, 4),
      "updated_at" timestamp DEFAULT now()
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS "applications_job_id_idx" ON "applications" ("job_id");
    CREATE INDEX IF NOT EXISTS "applications_candidate_id_idx" ON "applications" ("candidate_id");
    CREATE INDEX IF NOT EXISTS "applications_status_idx" ON "applications" ("status");
    CREATE INDEX IF NOT EXISTS "stage_history_application_id_idx" ON "stage_history" ("application_id");
    CREATE INDEX IF NOT EXISTS "stage_history_candidate_id_idx" ON "stage_history" ("candidate_id");
    CREATE INDEX IF NOT EXISTS "stage_history_job_id_idx" ON "stage_history" ("job_id");
    CREATE INDEX IF NOT EXISTS "interviews_application_id_idx" ON "interviews" ("application_id");
    CREATE INDEX IF NOT EXISTS "interviews_candidate_id_idx" ON "interviews" ("candidate_id");
    CREATE INDEX IF NOT EXISTS "offers_application_id_idx" ON "offers" ("application_id");
    CREATE INDEX IF NOT EXISTS "offers_candidate_id_idx" ON "offers" ("candidate_id");
    CREATE INDEX IF NOT EXISTS "candidate_notes_candidate_id_idx" ON "candidate_notes" ("candidate_id");
    CREATE INDEX IF NOT EXISTS "office_expenses_date_idx" ON "office_expenses" ("date");
    CREATE INDEX IF NOT EXISTS "office_expenses_type_idx" ON "office_expenses" ("type");
    CREATE INDEX IF NOT EXISTS "employees_status_idx" ON "employees" ("status");
    CREATE INDEX IF NOT EXISTS "tasks_assigned_to_idx" ON "tasks" ("assigned_to_user_id");
    CREATE INDEX IF NOT EXISTS "tasks_candidate_id_idx" ON "tasks" ("candidate_id");
    CREATE INDEX IF NOT EXISTS "tasks_job_id_idx" ON "tasks" ("job_id");

    -- Migrate old single-file agreement data into the new multi-file table
    INSERT INTO listing_agreement_files (listing_id, name, mime, data, uploaded_at)
    SELECT
      l.id,
      COALESCE(l.agreement_file_name, 'sozlesme'),
      COALESCE(l.agreement_file_mime, 'application/octet-stream'),
      l.agreement_file_data,
      COALESCE(l.agreement_uploaded_at, NOW())
    FROM listings l
    WHERE l.agreement_file_data IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM listing_agreement_files laf WHERE laf.listing_id = l.id
      );
  `);

  // One-time migration: interview targets moved from a global ("") bucket to per-office.
  // Move legacy global targets to "Akatlar" (main office), skipping rows that would collide
  // with an existing Akatlar target, then drop leftover global rows. Idempotent: after the
  // first run there are no office='' rows, so subsequent boots are no-ops.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interview_targets') THEN
        UPDATE interview_targets g SET office = 'Akatlar'
        WHERE g.office = ''
          AND NOT EXISTS (
            SELECT 1 FROM interview_targets a
            WHERE a.office = 'Akatlar' AND a.job_id = g.job_id AND a.year = g.year
              AND a.month = g.month AND a.category = g.category
          );
        DELETE FROM interview_targets WHERE office = '';
      END IF;
    END $$;
  `);

  await registerRoutes(httpServer, app);

  // Kick off exchange-rate refresh in the background — non-blocking, non-fatal.
  import("./exchange-rates")
    .then((m) => m.ensureExchangeRatesFresh())
    .catch((err) => console.warn("[exchange-rates] load failed:", err.message));

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // ── Günlük Fonzip sync scheduler (her gece 03:00 TR saati) ─────────────────
  if (isFonzipConfigured()) {
    cron.schedule("0 3 * * *", async () => {
      log("[cron] Fonzip günlük sync başlıyor");
      try {
        const debtsResult = await syncFonzipRecentDebts(1, 3); // son 3 gün, admin userId=1
        log(`[cron] Borç sync: ${JSON.stringify(debtsResult)}`);
      } catch (e: any) {
        log(`[cron] Borç sync hata: ${e.message}`);
      }
      try {
        const usersResult = await syncFonzipUsersFinancials();
        log(`[cron] Bakiye sync: ${JSON.stringify(usersResult)}`);
      } catch (e: any) {
        log(`[cron] Bakiye sync hata: ${e.message}`);
      }
    }, { timezone: "Europe/Istanbul" });
    log("[cron] Fonzip günlük sync planlandı: her gün 03:00");
  }
})();
