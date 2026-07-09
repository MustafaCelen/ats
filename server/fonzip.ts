const FONZIP_BASE = "https://fonzip.com/api/v2";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const clientId = process.env.FONZIP_CLIENT_ID;
  const clientSecret = process.env.FONZIP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("FONZIP_CLIENT_ID ve FONZIP_CLIENT_SECRET env değişkenleri tanımlı değil.");
  }

  const res = await fetch(`${FONZIP_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fonzip token alınamadı: ${res.status} ${text}`);
  }

  const data = await res.json();
  const token = data.access_token as string;
  // Tokens expire in 1h; cache for 55 min to be safe
  tokenCache = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token;
}

async function fonzipGet(path: string, params?: Record<string, string>): Promise<any> {
  const token = await getToken();
  const url = new URL(`${FONZIP_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fonzip ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

export function isFonzipConfigured(): boolean {
  return !!(process.env.FONZIP_CLIENT_ID && process.env.FONZIP_CLIENT_SECRET);
}

export async function fetchFonzipPreview() {
  const [members, dues, donations] = await Promise.allSettled([
    fonzipGet("/members", { per_page: "5" }),
    fonzipGet("/dues", { per_page: "5" }),
    fonzipGet("/donations", { per_page: "5" }),
  ]);

  return {
    members:   members.status   === "fulfilled" ? members.value   : { error: (members   as any).reason?.message },
    dues:      dues.status      === "fulfilled" ? dues.value      : { error: (dues      as any).reason?.message },
    donations: donations.status === "fulfilled" ? donations.value : { error: (donations as any).reason?.message },
  };
}

export async function fetchFonzipMembers(page = 1, perPage = 100): Promise<any> {
  return fonzipGet("/members", { page: String(page), per_page: String(perPage) });
}

export async function fetchFonzipDues(page = 1, perPage = 100): Promise<any> {
  return fonzipGet("/dues", { page: String(page), per_page: String(perPage) });
}

export async function fetchFonzipDonations(page = 1, perPage = 100): Promise<any> {
  return fonzipGet("/donations", { page: String(page), per_page: String(perPage) });
}
