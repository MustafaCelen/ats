// Global rate limit: minimum 45-60 seconds between any two WhatsApp sends
let lastSendTime = 0;

async function waitForSendSlot(): Promise<void> {
  const interval = 45_000 + Math.floor(Math.random() * 15_001);
  const wait = interval - (Date.now() - lastSendTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastSendTime = Date.now();
}

// Newer Green API instances use a subdomain derived from the first 4 digits of the instance ID
// e.g. instance 7107639535 → https://7107.api.greenapi.com
function getBaseUrl(instanceId: string): string {
  const prefix = instanceId.slice(0, 4);
  if (/^\d{4}$/.test(prefix)) return `https://${prefix}.api.greenapi.com`;
  return "https://api.green-api.com";
}

function toWhatsAppId(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  let normalized: string;
  if (digits.startsWith("90") && digits.length === 12) {
    normalized = digits;
  } else if (digits.startsWith("0") && digits.length === 11) {
    normalized = "90" + digits.slice(1);
  } else if (digits.length === 10) {
    normalized = "90" + digits;
  } else {
    return null;
  }
  return normalized + "@c.us";
}

/** Public base URL advisors use to open self-service links (agreement upload / close reason). */
export function publicBaseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  // Replit: newer environments expose REPLIT_DEV_DOMAIN
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  // Replit: legacy REPL_SLUG + REPL_OWNER
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  return "";
}

/**
 * Send a WhatsApp message via Green API.
 * Returns the Green API idMessage on success (message is queued for delivery),
 * or null if credentials are missing, phone is invalid, or the request failed.
 */
export async function sendWhatsApp(phone: string, message: string): Promise<string | null> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  if (!instanceId || !token) return null;

  const chatId = toWhatsAppId(phone);
  if (!chatId) {
    console.warn(`[WhatsApp] Invalid phone number: ${phone}`);
    return null;
  }

  await waitForSendSlot();

  try {
    const baseUrl = getBaseUrl(instanceId);
    const res = await fetch(
      `${baseUrl}/waInstance${instanceId}/sendMessage/${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[WhatsApp] Send failed (${res.status}): ${body}`);
      return null;
    }
    const data = await res.json().catch(() => null);
    return data?.idMessage ?? null;
  } catch (err) {
    console.warn("[WhatsApp] Network error:", err);
    return null;
  }
}

/**
 * Check delivery status of a previously sent message via Green API getMessage.
 * Returns one of: "pending" | "sent" | "delivered" | "read" | "played" | "failed" | null
 * null = credentials missing or API error
 */
export async function checkWhatsAppStatus(phone: string, idMessage: string): Promise<string | null> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  if (!instanceId || !token) return null;

  const chatId = toWhatsAppId(phone);
  if (!chatId) return null;

  try {
    const baseUrl = getBaseUrl(instanceId);
    const res = await fetch(
      `${baseUrl}/waInstance${instanceId}/getMessage/${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, idMessage }),
      }
    );
    if (!res.ok) return "failed";
    const data = await res.json().catch(() => null);
    // Green API returns statusMessage: "pending" | "sent" | "delivered" | "read" | "played"
    return data?.statusMessage ?? null;
  } catch {
    return null;
  }
}
