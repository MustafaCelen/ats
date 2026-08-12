import crypto from "crypto";
import { storage } from "./storage";

// Meta (Facebook) Marketing + Lead Ads entegrasyonu.
// Tüm env yoksa sessizce devre dışı (no-op) — mevcut akışları hiç etkilemez.
//
// Gerekli env (Aşama 0'da Meta Developers'tan alınır):
//   META_APP_SECRET          — App secret (webhook imza doğrulaması için)
//   META_ACCESS_TOKEN        — Uzun ömürlü / System User token (Graph API çağrıları)
//   META_AD_ACCOUNT_ID       — Reklam hesabı ID'si ("act_" öneki olsun ya da olmasın)
//   META_PAGE_ID             — (opsiyonel) Sayfa ID'si
//   META_WEBHOOK_VERIFY_TOKEN— Webhook doğrulama sırasında kendi belirlediğiniz gizli dize
//   META_API_VERSION         — (opsiyonel) Graph API sürümü, varsayılan v21.0
const API_VERSION = process.env.META_API_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

export const metaConfig = {
  appSecret: process.env.META_APP_SECRET || "",
  accessToken: process.env.META_ACCESS_TOKEN || "",
  adAccountId: (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, ""),
  pageId: process.env.META_PAGE_ID || "",
  verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
};

export function isMetaConfigured(): boolean {
  return !!(metaConfig.accessToken && metaConfig.adAccountId);
}
export function isMetaWebhookConfigured(): boolean {
  return !!(metaConfig.appSecret && metaConfig.verifyToken && metaConfig.accessToken);
}

async function graphGet(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", metaConfig.accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`[meta] Graph API hata: ${json?.error?.message ?? res.status} (${path})`);
  }
  return json;
}

// ── Webhook imza doğrulaması (X-Hub-Signature-256) ──
export function verifyWebhookSignature(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
  if (!metaConfig.appSecret) return false;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", metaConfig.appSecret)
    .update(rawBody)
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  // Sabit süreli karşılaştırma
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

// ── Kampanya + harcama senkronu (Marketing API) ──
// Reklam hesabındaki kampanyaları çeker, her biri için insights (spend) alır,
// campaigns tablosuna platform='meta' + externalId ile upsert eder, harcamayı yansıtır.
export async function syncMetaCampaigns(): Promise<{ synced: number; errors: string[] }> {
  if (!isMetaConfigured()) return { synced: 0, errors: ["Meta yapılandırılmamış (META_ACCESS_TOKEN / META_AD_ACCOUNT_ID yok)"] };
  const errors: string[] = [];
  let synced = 0;

  // 0) Hesap para birimi — daily_budget/lifetime_budget Meta'da hesabın en küçük para
  // birimi cinsinden gelir (TRY için kuruş) — normal tutara çevirmek için /100 gerekiyor.
  // spend/cpc/cpm insights'ta zaten normal birimde geliyor, onlara dokunmuyoruz.
  let currency = "TRY";
  try {
    const acc = await graphGet(`act_${metaConfig.adAccountId}`, { fields: "currency" });
    currency = acc.currency ?? "TRY";
  } catch { /* alınamazsa varsayılan TRY ile devam */ }

  // 1) Kampanyalar (bütçe + hedef dahil)
  let after: string | undefined;
  const campaigns: any[] = [];
  do {
    const page = await graphGet(`act_${metaConfig.adAccountId}/campaigns`, {
      fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
      limit: 100,
      ...(after ? { after } : {}),
    });
    campaigns.push(...(page.data ?? []));
    after = page.paging?.cursors?.after && page.paging?.next ? page.paging.cursors.after : undefined;
  } while (after);

  // 2) Her kampanya için insights (spend, gösterim, tıklama, CPC/CPM, reach) — lifetime
  for (const c of campaigns) {
    try {
      let insights: any = {};
      try {
        const ins = await graphGet(`${c.id}/insights`, {
          fields: "spend,impressions,clicks,cpc,cpm,reach",
          date_preset: "maximum",
        });
        insights = ins.data?.[0] ?? {};
      } catch { /* insights yoksa (hiç yayınlanmamış kampanya) boş kalır */ }

      const statusMap: Record<string, string> = { ACTIVE: "active", PAUSED: "paused", ARCHIVED: "ended", DELETED: "ended" };
      await storage.upsertMetaCampaign({
        externalId: String(c.id),
        name: c.name ?? `Meta #${c.id}`,
        status: statusMap[c.status] ?? "active",
        objective: c.objective ?? null,
        startDate: c.start_time ? String(c.start_time).slice(0, 10) : null,
        endDate: c.stop_time ? String(c.stop_time).slice(0, 10) : null,
        currency,
        dailyBudget: c.daily_budget != null ? parseFloat(c.daily_budget) / 100 : null,
        lifetimeBudget: c.lifetime_budget != null ? parseFloat(c.lifetime_budget) / 100 : null,
        spend: parseFloat(insights.spend ?? "0") || 0,
        impressions: insights.impressions != null ? parseInt(insights.impressions, 10) : null,
        clicks: insights.clicks != null ? parseInt(insights.clicks, 10) : null,
        reach: insights.reach != null ? parseInt(insights.reach, 10) : null,
        cpc: insights.cpc != null ? parseFloat(insights.cpc) : null,
        cpm: insights.cpm != null ? parseFloat(insights.cpm) : null,
        metaRaw: JSON.stringify({ campaign: c, insights }),
      });
      synced++;
    } catch (e: any) {
      errors.push(`${c.id}: ${e?.message ?? e}`);
    }
  }
  return { synced, errors };
}

// ── Tek bir lead'i Graph API'den çek ──
// leadgen webhook'u sadece leadgen_id verir; alan verisi bu çağrıyla alınır.
export async function fetchMetaLead(leadgenId: string): Promise<{
  id: string;
  createdTime: string | null;
  formId: string | null;
  campaignId: string | null;
  adId: string | null;
  fields: Record<string, string>;
} | null> {
  if (!metaConfig.accessToken) return null;
  const data = await graphGet(leadgenId, {
    fields: "id,created_time,form_id,campaign_id,ad_id,field_data",
  });
  const fields: Record<string, string> = {};
  for (const f of data.field_data ?? []) {
    const key = String(f.name ?? "").toLowerCase();
    const val = Array.isArray(f.values) ? f.values.join(", ") : String(f.values ?? "");
    if (key) fields[key] = val;
  }
  return {
    id: String(data.id ?? leadgenId),
    createdTime: data.created_time ?? null,
    formId: data.form_id ? String(data.form_id) : null,
    campaignId: data.campaign_id ? String(data.campaign_id) : null,
    adId: data.ad_id ? String(data.ad_id) : null,
    fields,
  };
}

// Meta lead alanlarından aday alanlarına eşleme. Meta form alan adları serbest
// olabildiği için yaygın anahtarları (tr + en) tarıyoruz.
export function mapLeadToCandidate(fields: Record<string, string>): { name: string; email: string | null; phone: string | null } {
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const hit = Object.keys(fields).find(fk => fk === k || fk.includes(k));
      if (hit && fields[hit]?.trim()) return fields[hit].trim();
    }
    return null;
  };
  const fullName = pick("full_name", "ad_soyad", "isim", "name");
  const first = pick("first_name", "ad");
  const last = pick("last_name", "soyad");
  const name = fullName || [first, last].filter(Boolean).join(" ") || "Meta Lead";
  const email = pick("email", "e-mail", "eposta", "e-posta");
  const phone = pick("phone_number", "phone", "telefon", "tel", "gsm");
  return { name, email, phone };
}
