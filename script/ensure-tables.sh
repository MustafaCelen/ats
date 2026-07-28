#!/bin/sh
# Drizzle-kit push bazen özel indeksleri/tabloları silebiliyor.
# Bu script startup'ta çalışıp eksik olanları garanti oluşturur.

if [ -z "$DATABASE_URL" ]; then
  echo "[ensure-tables] DATABASE_URL yok, atlanıyor"
  exit 0
fi

# psql wrapper (docker container'da olmayabilir; node-postgres via node kullanıyoruz)
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = \`
    CREATE TABLE IF NOT EXISTS employee_office_history (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      office TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS employee_office_history_emp_idx ON employee_office_history(employee_id);
    CREATE INDEX IF NOT EXISTS employee_office_history_eff_idx ON employee_office_history(employee_id, effective_from);

    CREATE TABLE IF NOT EXISTS expense_targets (
      id SERIAL PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL,
      type TEXT NOT NULL, category TEXT NOT NULL,
      amount NUMERIC(15,2) NOT NULL, updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS expense_targets_uq ON expense_targets(year, month, type, category);
    CREATE INDEX IF NOT EXISTS expense_targets_ym_idx ON expense_targets(year, month);

    CREATE TABLE IF NOT EXISTS growth_targets (
      id SERIAL PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL,
      user_id INTEGER,
      brut_target INTEGER NOT NULL DEFAULT 0, net_target INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE growth_targets ADD COLUMN IF NOT EXISTS user_id INTEGER;
    DROP INDEX IF EXISTS growth_targets_uq;
    CREATE UNIQUE INDEX IF NOT EXISTS growth_targets_uq ON growth_targets(year, month, user_id);
    CREATE INDEX IF NOT EXISTS growth_targets_ym_idx ON growth_targets(year, month);

    CREATE TABLE IF NOT EXISTS fonzip_user_financials (
      fonzip_user_id INTEGER PRIMARY KEY,
      employee_id INTEGER, membership_no TEXT, user_name TEXT NOT NULL,
      email TEXT, phone TEXT,
      total_financial NUMERIC(15,2) NOT NULL DEFAULT 0,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS fonzip_user_financials_employee_idx ON fonzip_user_financials(employee_id);

    CREATE TABLE IF NOT EXISTS _fonzip_config (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ
    );

    ALTER TABLE closing_agents ADD COLUMN IF NOT EXISTS uk_expense_id INTEGER;
    ALTER TABLE closing_agents ADD COLUMN IF NOT EXISTS office_snapshot TEXT;
    CREATE INDEX IF NOT EXISTS closing_agents_uk_expense_idx ON closing_agents(uk_expense_id);
    CREATE INDEX IF NOT EXISTS closing_agents_office_snapshot_idx ON closing_agents(office_snapshot);

    CREATE TABLE IF NOT EXISTS candidate_merge_log (
      id SERIAL PRIMARY KEY, source_id INTEGER NOT NULL, target_id INTEGER NOT NULL,
      source_snapshot TEXT NOT NULL, performed_by_user_id INTEGER,
      performed_at TIMESTAMP DEFAULT NOW(), undone_at TIMESTAMP, notes TEXT
    );
    CREATE INDEX IF NOT EXISTS candidate_merge_log_target_idx ON candidate_merge_log(target_id);
    CREATE INDEX IF NOT EXISTS candidate_merge_log_performed_idx ON candidate_merge_log(performed_at);

    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS campaign_id INTEGER;
    CREATE INDEX IF NOT EXISTS candidates_campaign_idx ON candidates(campaign_id);

    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      status TEXT NOT NULL DEFAULT 'active', platform TEXT NOT NULL DEFAULT 'manual',
      external_id TEXT, start_date TEXT, end_date TEXT,
      created_by_user_id INTEGER, created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaign_expenses (
      id SERIAL PRIMARY KEY, campaign_id INTEGER NOT NULL,
      amount NUMERIC(15,2) NOT NULL, date TEXT NOT NULL, notes TEXT,
      created_by_user_id INTEGER, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS campaign_expenses_campaign_idx ON campaign_expenses(campaign_id);

    ALTER TABLE listings ADD COLUMN IF NOT EXISTS deal_category TEXT NOT NULL DEFAULT 'Satılık';
    UPDATE listings SET deal_category = CASE WHEN price IS NOT NULL AND price::numeric < 1000000 THEN 'Kiralık' ELSE 'Satılık' END WHERE deal_category = 'Satılık';
    CREATE INDEX IF NOT EXISTS listings_deal_category_idx ON listings(deal_category);

    CREATE TABLE IF NOT EXISTS whatsapp_bulk_sends (
      id SERIAL PRIMARY KEY, employee_id INTEGER, employee_name TEXT, phone TEXT NOT NULL,
      template_sid TEXT NOT NULL, template_name TEXT NOT NULL, variables TEXT,
      status TEXT NOT NULL, message_sid TEXT, error TEXT,
      created_by_user_id INTEGER, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS whatsapp_bulk_sends_created_idx ON whatsapp_bulk_sends(created_at);
  \`;
  await pool.query(sql);
  console.log('[ensure-tables] OK');
  await pool.end();
}

run().catch(e => { console.error('[ensure-tables]', e.message); process.exit(0); });
"
