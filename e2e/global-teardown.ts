import { cleanupE2E, db } from "./fixtures";

export default async function globalTeardown() {
  if (!process.env.E2E_KEEP_DATA) await cleanupE2E();
  await db?.end();
}
