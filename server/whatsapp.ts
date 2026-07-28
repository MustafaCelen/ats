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

const TWILIO_API = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

function twilioAuth(accountSid: string, authToken: string) {
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

/**
 * Send a WhatsApp message via Twilio using a pre-approved Content Template.
 * vars: { "1": "Danışman Adı", "2": "3", "3": "1", "4": "https://..." }
 * Returns the Twilio MessageSid on success, or null on failure.
 */
export async function sendWhatsAppTemplate(
  phone: string,
  vars: Record<string, string>,
  contentSid?: string,
): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_WHATSAPP_FROM;
  const sid        = contentSid ?? process.env.TWILIO_WA_TEMPLATE_SID;
  if (!accountSid || !authToken || !from || !sid) {
    console.warn("[WhatsApp] Missing Twilio config (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM / TWILIO_WA_TEMPLATE_SID)");
    return null;
  }

  const e164 = toE164(phone);
  if (!e164) { console.warn(`[WhatsApp] Invalid phone: ${phone}`); return null; }

  try {
    const body = new URLSearchParams({
      From: `whatsapp:${from}`,
      To:   `whatsapp:${e164}`,
      ContentSid: sid,
      ContentVariables: JSON.stringify(vars),
    });

    const res = await fetch(TWILIO_API(accountSid), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: twilioAuth(accountSid, authToken) },
      body: body.toString(),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) { console.warn(`[WhatsApp] Twilio template error (${res.status}):`, data); return null; }
    return data?.sid ?? null;
  } catch (err) {
    console.warn("[WhatsApp] Network error:", err);
    return null;
  }
}

/**
 * Send a free-form WhatsApp message via Twilio (used for non-template paths).
 * Returns the Twilio MessageSid on success, or null on failure.
 */
export async function sendWhatsApp(phone: string, message: string): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) return null;

  const e164 = toE164(phone);
  if (!e164) { console.warn(`[WhatsApp] Invalid phone number: ${phone}`); return null; }

  try {
    const body = new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${e164}`, Body: message });
    const res = await fetch(TWILIO_API(accountSid), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: twilioAuth(accountSid, authToken) },
      body: body.toString(),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) { console.warn(`[WhatsApp] Twilio error (${res.status}):`, data); return null; }
    return data?.sid ?? null;
  } catch (err) {
    console.warn("[WhatsApp] Network error:", err);
    return null;
  }
}

export interface WhatsAppTemplate {
  sid: string;
  friendlyName: string;
  language: string;
  body: string;
  variables: string[]; // ör. ["1","2"]
}

/**
 * Twilio Content API'den onaylı mesaj şablonlarını çeker (toplu mesaj modülü için).
 */
export async function listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.warn("[WhatsApp] Missing Twilio config for template list");
    return [];
  }

  const templates: WhatsAppTemplate[] = [];
  let pageUrl: string | null = "https://content.twilio.com/v1/Content?PageSize=100";
  const auth = twilioAuth(accountSid, authToken);

  try {
    while (pageUrl) {
      const res: Response = await fetch(pageUrl, { headers: { Authorization: auth } });
      if (!res.ok) break;
      const data: any = await res.json().catch(() => null);
      if (!data) break;
      for (const c of data.contents ?? []) {
        const typeKey = Object.keys(c.types ?? {})[0];
        const body = typeKey ? (c.types[typeKey]?.body ?? "") : "";
        templates.push({
          sid: c.sid,
          friendlyName: c.friendly_name ?? c.sid,
          language: c.language ?? "",
          body,
          variables: Object.keys(c.variables ?? {}),
        });
      }
      pageUrl = data.meta?.next_page_url ?? null;
    }
  } catch (err) {
    console.warn("[WhatsApp] Template list error:", err);
  }
  return templates;
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
