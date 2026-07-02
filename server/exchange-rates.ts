// Exchange rate backfill + updates.
// Data sources:
//   USD/TRY: Frankfurter API (free, historical range in one call)
//   Gold gr/TRY: not yet — no free historical source. Manual CSV or future integration.

import { db } from "./db";
import { exchangeRates } from "@shared/schema";
import { sql } from "drizzle-orm";

type FrankfurterRange = {
  amount: number;
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, { TRY?: number }>;
};

async function fetchUsdRange(startDate: string, endDate: string): Promise<Map<string, number>> {
  const url = `https://api.frankfurter.dev/v1/${startDate}..${endDate}?base=USD&symbols=TRY`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Frankfurter fetch failed: ${res.status}`);
  const body = (await res.json()) as FrankfurterRange;
  const out = new Map<string, number>();
  for (const [date, obj] of Object.entries(body.rates)) {
    if (obj?.TRY != null) out.set(date, obj.TRY);
  }
  return out;
}

// Fill in weekend/holiday gaps by forward-filling from the previous known rate,
// so every date between start and end has a value (needed for daily closings).
function forwardFill(rates: Map<string, number>, startDate: string, endDate: string): Map<string, number> {
  const filled = new Map<string, number>();
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  let lastVal: number | null = null;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    if (rates.has(key)) lastVal = rates.get(key)!;
    if (lastVal != null) filled.set(key, lastVal);
  }
  return filled;
}

/**
 * Backfill USD/TRY rates from startDate to today (inclusive).
 * Existing rows are overwritten via upsert.
 * Returns count of rows written.
 */
export async function backfillUsdRates(startDate: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const rawRates = await fetchUsdRange(startDate, today);
  const filled = forwardFill(rawRates, startDate, today);
  if (filled.size === 0) return 0;

  // Upsert each row
  for (const [date, usdTry] of filled) {
    await db.execute(sql`
      INSERT INTO exchange_rates (date, usd_try, updated_at)
      VALUES (${date}, ${usdTry.toString()}, NOW())
      ON CONFLICT (date) DO UPDATE SET usd_try = EXCLUDED.usd_try, updated_at = NOW()
    `);
  }
  return filled.size;
}

/**
 * Ensure exchange_rates has recent data. Runs cheaply on startup.
 * If the table is empty → backfill from 2024-01-01 (matches closings history).
 * If the latest row is >2 days old → refresh from (latest+1) to today.
 */
export async function ensureExchangeRatesFresh(): Promise<void> {
  try {
    const rows = await db.execute(sql`SELECT MAX(date) AS max_date FROM exchange_rates`);
    const maxDate = (rows.rows[0] as any)?.max_date as string | null;
    const today = new Date().toISOString().slice(0, 10);
    if (!maxDate) {
      const n = await backfillUsdRates("2024-01-01");
      console.log(`[exchange-rates] initial backfill: ${n} rows`);
      return;
    }
    if (maxDate >= today) return;
    // Refresh from day after latest → today
    const nextDay = new Date(maxDate + "T00:00:00Z");
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const startDate = nextDay.toISOString().slice(0, 10);
    if (startDate > today) return;
    const n = await backfillUsdRates(startDate);
    if (n > 0) console.log(`[exchange-rates] refreshed: ${n} rows (${startDate} → ${today})`);
  } catch (err) {
    // Non-fatal — analytics still works in TL
    console.warn("[exchange-rates] refresh skipped:", (err as Error).message);
  }
}
