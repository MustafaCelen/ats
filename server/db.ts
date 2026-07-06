import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool, types } = pg;

// Force pg to parse "timestamp without time zone" (OID 1114) as UTC.
// By default, pg appends no timezone when parsing these values, causing
// them to be interpreted as local time — which shifts dates in non-UTC servers.
types.setTypeParser(1114, (val: string) => new Date(val + "Z"));

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
