import { pool } from "./db";

/**
 * Additive schema self-heal, run on every server boot (dev + production, Docker + Replit).
 *
 * drizzle-kit push is intentionally NOT run automatically (its interactive prompts have
 * mis-resolved to destructive DROPs before). Instead we keep this single, additive-only
 * block: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX. The only
 * DROP is on an index (never data), and the one UPDATE only backfills deal_category from
 * price. No DROP TABLE, DROP COLUMN or DELETE — so it cannot lose data.
 *
 * This is the single source of truth for the "extra" tables that live outside the main
 * drizzle boot SQL. Any real column/table removal must be a deliberate, reviewed migration.
 */
export async function ensureSchema(): Promise<void> {
  const sql = `
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
      user_id INTEGER, office TEXT NOT NULL DEFAULT '',
      brut_target_k0 INTEGER NOT NULL DEFAULT 0, brut_target_k1 INTEGER NOT NULL DEFAULT 0,
      brut_target_k2 INTEGER NOT NULL DEFAULT 0, net_target INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE growth_targets ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE growth_targets ADD COLUMN IF NOT EXISTS office TEXT NOT NULL DEFAULT '';
    ALTER TABLE growth_targets ADD COLUMN IF NOT EXISTS brut_target_k0 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE growth_targets ADD COLUMN IF NOT EXISTS brut_target_k1 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE growth_targets ADD COLUMN IF NOT EXISTS brut_target_k2 INTEGER NOT NULL DEFAULT 0;
    DROP INDEX IF EXISTS growth_targets_uq;
    CREATE UNIQUE INDEX IF NOT EXISTS growth_targets_uq ON growth_targets(year, month, user_id, office);
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

    -- Firebase Realtime Database ilan zenginleştirme kolonları
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS il TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS ilce TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS mahalle TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS emlak_tipi TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS oda_sayisi TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS banyo_sayisi TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS bina_yasi TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS m2_brut NUMERIC(12,2);
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS m2_net NUMERIC(12,2);
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS enlem NUMERIC(12,8);
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS boylam NUMERIC(12,8);
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS baslik TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS aciklama TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS ilan_link TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS ilan_tarihi TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS site_adi TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS firebase_raw TEXT;
    ALTER TABLE listings ADD COLUMN IF NOT EXISTS firebase_synced_at TIMESTAMP;
    CREATE INDEX IF NOT EXISTS listings_ilce_idx ON listings(ilce);
    CREATE INDEX IF NOT EXISTS listings_mahalle_idx ON listings(mahalle);

    -- Meta (Facebook) entegrasyonu
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS spend NUMERIC(15,2) NOT NULL DEFAULT 0;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS meta_synced_at TIMESTAMP;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS objective TEXT;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS daily_budget NUMERIC(15,2);
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS lifetime_budget NUMERIC(15,2);
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS currency TEXT;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS impressions INTEGER;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS clicks INTEGER;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reach INTEGER;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cpc NUMERIC(10,4);
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cpm NUMERIC(10,4);
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS meta_raw TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS campaigns_platform_external_idx ON campaigns(platform, external_id) WHERE external_id IS NOT NULL;

    -- Meta Lead Ads: gelen her lead için dedup + audit (webhook retry'lerine karşı)
    CREATE TABLE IF NOT EXISTS meta_leads (
      leadgen_id TEXT PRIMARY KEY,
      campaign_external_id TEXT, form_id TEXT, ad_id TEXT,
      candidate_id INTEGER, campaign_id INTEGER,
      raw_fields TEXT, error TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS meta_leads_candidate_idx ON meta_leads(candidate_id);

    -- Genel değişiklik günlüğü (audit log) — kullanıcı bilgisi olmadan, sadece
    -- "hangi alan ne zaman neyden neye değişti / silindi". DB trigger ile dolduruluyor,
    -- böylece uygulama kodundaki ham SQL UPDATE'ler (Drizzle dışından yapılanlar dahil) de
    -- kaçmadan yakalanır.
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      action TEXT NOT NULL DEFAULT 'update',
      changed_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS audit_log_record_idx ON audit_log(table_name, record_id);
    CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx ON audit_log(changed_at);

    CREATE OR REPLACE FUNCTION employees_audit_trigger() RETURNS TRIGGER AS $func$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.contract_type IS DISTINCT FROM OLD.contract_type THEN
          INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
          VALUES ('employees', NEW.id, 'contract_type', OLD.contract_type, NEW.contract_type, 'update');
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
          VALUES ('employees', NEW.id, 'status', OLD.status, NEW.status, 'update');
        END IF;
        IF NEW.cap_month IS DISTINCT FROM OLD.cap_month THEN
          INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
          VALUES ('employees', NEW.id, 'cap_month', OLD.cap_month, NEW.cap_month, 'update');
        END IF;
        IF NEW.uretkenlik_koclugu IS DISTINCT FROM OLD.uretkenlik_koclugu THEN
          INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
          VALUES ('employees', NEW.id, 'uretkenlik_koclugu', OLD.uretkenlik_koclugu::text, NEW.uretkenlik_koclugu::text, 'update');
        END IF;
        IF NEW.uretkenlik_koclugu_oran IS DISTINCT FROM OLD.uretkenlik_koclugu_oran THEN
          INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
          VALUES ('employees', NEW.id, 'uretkenlik_koclugu_oran', OLD.uretkenlik_koclugu_oran, NEW.uretkenlik_koclugu_oran, 'update');
        END IF;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
        VALUES
          ('employees', OLD.id, 'contract_type', OLD.contract_type, NULL, 'delete'),
          ('employees', OLD.id, 'status', OLD.status, NULL, 'delete'),
          ('employees', OLD.id, 'cap_month', OLD.cap_month, NULL, 'delete'),
          ('employees', OLD.id, 'uretkenlik_koclugu', OLD.uretkenlik_koclugu::text, NULL, 'delete'),
          ('employees', OLD.id, 'uretkenlik_koclugu_oran', OLD.uretkenlik_koclugu_oran, NULL, 'delete');
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $func$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS employees_audit ON employees;
    CREATE TRIGGER employees_audit
      AFTER UPDATE OR DELETE ON employees
      FOR EACH ROW EXECUTE FUNCTION employees_audit_trigger();

    -- candidates: kategori (K0/K1/K2) ve lisans durumu değişiklikleri. office kasıtlı olarak
    -- hariç — o zaten employee_office_history üzerinden etkin-tarihli şekilde takip ediliyor.
    CREATE OR REPLACE FUNCTION candidates_audit_trigger() RETURNS TRIGGER AS $func$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.category IS DISTINCT FROM OLD.category THEN
          INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
          VALUES ('candidates', NEW.id, 'category', OLD.category, NEW.category, 'update');
        END IF;
        IF NEW.license_status IS DISTINCT FROM OLD.license_status THEN
          INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
          VALUES ('candidates', NEW.id, 'license_status', OLD.license_status, NEW.license_status, 'update');
        END IF;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, record_id, field_name, old_value, new_value, action)
        VALUES
          ('candidates', OLD.id, 'category', OLD.category, NULL, 'delete'),
          ('candidates', OLD.id, 'license_status', OLD.license_status, NULL, 'delete');
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $func$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS candidates_audit ON candidates;
    CREATE TRIGGER candidates_audit
      AFTER UPDATE OR DELETE ON candidates
      FOR EACH ROW EXECUTE FUNCTION candidates_audit_trigger();

    -- Danışman karnesi: çeyreklik BHB hedefi, notlar, randevu/takvim
    CREATE TABLE IF NOT EXISTS advisor_bhb_targets (
      id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL,
      year INTEGER NOT NULL, quarter INTEGER NOT NULL,
      bhb_target NUMERIC(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS advisor_bhb_targets_uq ON advisor_bhb_targets(employee_id, year, quarter);
    CREATE INDEX IF NOT EXISTS advisor_bhb_targets_emp_idx ON advisor_bhb_targets(employee_id);

    CREATE TABLE IF NOT EXISTS advisor_notes (
      id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL,
      content TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT 'Coach',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS advisor_notes_employee_id_idx ON advisor_notes(employee_id);

    CREATE TABLE IF NOT EXISTS advisor_appointments (
      id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT 'Görüşme',
      start_time TIMESTAMP NOT NULL, end_time TIMESTAMP NOT NULL,
      location TEXT, status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT,
      calendar_event_id TEXT, reschedule_count INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS advisor_appointments_employee_id_idx ON advisor_appointments(employee_id);

    -- Masraf kayıtlarına ofis + yüzdesel bölme (kart/banka ekstresi import + manuel giriş)
    ALTER TABLE office_expenses ADD COLUMN IF NOT EXISTS office TEXT NOT NULL DEFAULT '';
    ALTER TABLE office_expenses ADD COLUMN IF NOT EXISTS split_group_id TEXT;
    ALTER TABLE office_expenses ADD COLUMN IF NOT EXISTS split_percent INTEGER;
    CREATE INDEX IF NOT EXISTS office_expenses_office_idx ON office_expenses(office);

    -- Performans Kariyer Koçluğu: ÜK/DÜA ile aynı mantıkta 3. bağımsız koçluk tipi (oran yok)
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS performans_kariyer_koclugu BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS performans_kariyer_koclugu_manager_id INTEGER;

    -- Danışman notları: yapılandırılmış 4 alan (Görüşme Tarihi/Gündem/Koçun Notu/Sonraki Adım),
    -- content serbest metin 5. alan olarak kalır
    ALTER TABLE advisor_notes ADD COLUMN IF NOT EXISTS meeting_date TEXT;
    ALTER TABLE advisor_notes ADD COLUMN IF NOT EXISTS agenda TEXT;
    ALTER TABLE advisor_notes ADD COLUMN IF NOT EXISTS coach_note TEXT;
    ALTER TABLE advisor_notes ADD COLUMN IF NOT EXISTS next_step TEXT;
  `;
  try {
    await pool.query(sql);
    console.log("[ensure-schema] OK");
  } catch (e: any) {
    // Non-fatal: never block server startup on a schema self-heal hiccup.
    console.error("[ensure-schema]", e?.message ?? e);
  }
}
