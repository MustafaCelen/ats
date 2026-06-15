function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 11) return "+90" + digits.slice(1);
  if (digits.length === 10) return "+90" + digits;
  return null;
}

/** Public base URL advisors use to open self-service links (agreement upload / close reason). */
export function publicBaseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  return "";
}

/**
 * Send a WhatsApp message via Twilio.
 * Returns the Twilio MessageSid on success, or null on failure.
 */
export async function sendWhatsApp(phone: string, message: string): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) return null;

  const e164 = toE164(phone);
  if (!e164) {
    console.warn(`[WhatsApp] Invalid phone number: ${phone}`);
    return null;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: `whatsapp:${from}`,
      To: `whatsapp:${e164}`,
      Body: message,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
      body: body.toString(),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(`[WhatsApp] Twilio error (${res.status}):`, data);
      return null;
    }
    return data?.sid ?? null;
  } catch (err) {
    console.warn("[WhatsApp] Network error:", err);
    return null;
  }
}

/**
 * Check delivery status of a previously sent message via Twilio.
 * Returns one of: "pending" | "sent" | "delivered" | "read" | "failed" | null
 */
export async function checkWhatsAppStatus(phone: string, messageSid: string): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`;
    const res = await fetch(url, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
    });
    if (!res.ok) return "failed";
    const data = await res.json().catch(() => null);

    const statusMap: Record<string, string> = {
      queued: "pending",
      sending: "pending",
      sent: "sent",
      delivered: "delivered",
      read: "read",
      undelivered: "failed",
      failed: "failed",
    };
    return statusMap[data?.status] ?? data?.status ?? null;
  } catch {
    return null;
  }
}
