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

export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  if (!instanceId || !token) return;

  const chatId = toWhatsAppId(phone);
  if (!chatId) {
    console.warn(`[WhatsApp] Invalid phone number: ${phone}`);
    return;
  }

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
    }
  } catch (err) {
    console.warn("[WhatsApp] Network error:", err);
  }
}
