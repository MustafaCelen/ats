import { cleanupE2E } from "./fixtures";

// Önceki yarım kalmış koşulardan kalan E2E verisini temizle.
export default async function globalSetup() {
  await cleanupE2E();
}
