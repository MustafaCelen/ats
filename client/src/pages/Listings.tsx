import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2, Upload, Search, FileCheck2, FileWarning, HelpCircle,
  CheckCircle2, Clock, Send, Trash2, ExternalLink,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Listing {
  id: number;
  listingNumber: string;
  price: string | null;
  publishedDate: string | null;
  removedDate: string | null;
  durationDays: number | null;
  advisorName: string | null;
  employeeId: number | null;
  employeeName?: string;
  office: string | null;
  store: string | null;
  status: "active" | "passive";
  agreementUploadedAt: string | null;
  agreementRequestedAt: string | null;
  closeReason: string | null;
  closeReasonNote: string | null;
  closeReasonSubmittedAt: string | null;
  publicToken: string;
}

interface Summary {
  totalActive: number; totalPassive: number; matchedActive: number;
  needsAgreement: number; needsReason: number; soldPassive: number;
}

type FilterTab = "all" | "needsAgreement" | "needsReason" | "passive";

// ── CSV helpers ─────────────────────────────────────────────────────────────────

function deaccent(s: string): string {
  return s
    .replace(/[İıİ]/g, "i").replace(/[Şş]/g, "s").replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u").replace(/[Öö]/g, "o").replace(/[Çç]/g, "c")
    .toLowerCase();
}

/** Map a CSV header to a normalized listing field key. */
function headerToKey(header: string): string | null {
  const h = deaccent(header.trim().replace(/\s+/g, " "));
  if (h.includes("kaldir") || h.includes("yayindan")) return "removedDate"; // before "yayin..."
  if (h.includes("numara")) return "listingNumber";
  if (h === "fiyat" || h.includes("fiyat")) return "price";
  if (h.includes("yayinlanma")) return "publishedDate";
  if (h === "sure" || h.includes("sure")) return "durationDays";
  if (h.includes("danisman")) return "advisorName";
  if (h === "ofis" || h.includes("ofis")) return "office";
  if (h.includes("magaza")) return "store";
  return null;
}

function parseListingCsv(raw: string): Record<string, any>[] {
  let cleaned = raw.replace(/^﻿/, "");
  // flatten newlines inside quoted fields
  {
    let out = "", inQ = false;
    for (let i = 0; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (c === '"') { inQ = !inQ; out += c; }
      else if (inQ && (c === "\r" || c === "\n")) out += " ";
      else out += c;
    }
    cleaned = out;
  }
  const lines = cleaned.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const res: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) { res.push(cur); cur = ""; }
      else cur += ch;
    }
    res.push(cur);
    return res;
  };

  const keys = parseRow(lines[0]).map(headerToKey);

  return lines.slice(1).map((line) => {
    const vals = parseRow(line);
    const obj: Record<string, any> = {};
    keys.forEach((k, i) => {
      if (!k) return;
      let v = (vals[i] ?? "").trim();
      if (v === "" || v === "null" || v === "#VALUE!" || v === "#REF!") {
        obj[k] = null; return;
      }
      if (k === "durationDays") {
        const n = parseInt(v, 10);
        obj[k] = isNaN(n) ? null : n;
      } else if (k === "price") {
        const n = v.replace(/[^0-9.]/g, "");
        obj[k] = n || null;
      } else {
        obj[k] = v;
      }
    });
    return obj;
  }).filter((r) => r.listingNumber);
}

// ── Small UI bits ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: number; tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone}`} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1.5">{value.toLocaleString("tr-TR")}</p>
    </div>
  );
}

function fmtPrice(p: string | null): string {
  if (!p) return "—";
  return Number(p).toLocaleString("tr-TR") + " ₺";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Listings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FilterTab>("needsAgreement");
  const [search, setSearch] = useState("");
  const [notify, setNotify] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: summary } = useQuery<Summary>({
    queryKey: ["/api/listings/summary"],
    queryFn: () => fetch("/api/listings/summary", { credentials: "include" }).then((r) => r.json()),
  });

  const listQuery = (() => {
    const params = new URLSearchParams();
    if (tab === "needsAgreement") { params.set("needsAgreement", "1"); params.set("onlyMatched", "1"); }
    else if (tab === "needsReason") { params.set("needsReason", "1"); params.set("onlyMatched", "1"); }
    else if (tab === "passive") params.set("status", "passive");
    else params.set("onlyMatched", "1");
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  })();

  const { data: rows = [], isLoading } = useQuery<Listing[]>({
    queryKey: ["/api/listings", listQuery],
    queryFn: () => fetch(`/api/listings?${listQuery}`, { credentials: "include" }).then((r) => r.json()),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/listings/summary"] });
  };

  const handleImport = (type: "active" | "passive") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const parsed = parseListingCsv(await file.text());
      if (parsed.length === 0) {
        toast({ title: "Hata", description: "CSV boş veya sütunlar tanınamadı.", variant: "destructive" });
        return;
      }
      const res = await fetch("/api/listings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, rows: parsed, notify }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Hata", description: data.message, variant: "destructive" }); return; }
      refresh();
      const notifyCount = type === "active" ? data.newActive : data.newlyPassive;
      toast({
        title: "İçe aktarıldı",
        description: `${data.created} yeni, ${data.updated} güncellendi.` +
          (notify ? ` ${notifyCount} danışmana bildirim gönderildi.` : ` ${notifyCount} bildirim adayı (bildirim kapalı).`),
      });
    } catch {
      toast({ title: "Hata", description: "Dosya işlenemedi.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const sendNotify = async (id: number) => {
    try {
      await apiRequest("POST", `/api/listings/${id}/notify`, {});
      toast({ title: "Bildirim gönderildi" });
      refresh();
    } catch (err: any) {
      toast({ title: "Gönderilemedi", description: err?.message, variant: "destructive" });
    }
  };

  const clearAll = async () => {
    if (!confirm("Tüm ilan kayıtları silinecek. Emin misiniz?")) return;
    try {
      await apiRequest("DELETE", "/api/listings");
      toast({ title: "Tüm ilanlar silindi" });
      refresh();
    } catch {
      toast({ title: "Silinemedi", variant: "destructive" });
    }
  };

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "needsAgreement", label: "Yetki Sözleşmesi Bekleyen", count: summary?.needsAgreement },
    { key: "needsReason", label: "Kalkış Sebebi Bekleyen", count: summary?.needsReason },
    { key: "passive", label: "Pasif İlanlar", count: summary?.totalPassive },
    { key: "all", label: "Tüm Eşleşen İlanlar", count: summary?.matchedActive },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Portal İlanları
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              KW Platin &amp; Karma ilan raporlarını içe aktarın, yetki sözleşmesi ve kalkış sebeplerini takip edin
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mr-1 select-none cursor-pointer">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-primary" />
              Danışmanlara WhatsApp gönder
            </label>
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={handleImport("active")} />
              <span className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md border border-input bg-background hover:bg-muted transition-colors font-medium">
                <Upload className="h-3.5 w-3.5" /> Aktif İlanlar
              </span>
            </label>
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={handleImport("passive")} />
              <span className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md border border-input bg-background hover:bg-muted transition-colors font-medium">
                <Upload className="h-3.5 w-3.5" /> Pasif İlanlar
              </span>
            </label>
            <Button variant="ghost" size="sm" className="text-xs h-8 text-destructive hover:text-destructive" onClick={clearAll}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Sıfırla
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={FileWarning} label="Yetki Sözleşmesi Bekleyen" value={summary?.needsAgreement ?? 0} tone="text-amber-500" />
          <StatCard icon={HelpCircle} label="Kalkış Sebebi Bekleyen" value={summary?.needsReason ?? 0} tone="text-violet-500" />
          <StatCard icon={CheckCircle2} label="Satılan / Kiralanan" value={summary?.soldPassive ?? 0} tone="text-emerald-500" />
          <StatCard icon={FileCheck2} label="Eşleşen Aktif İlan" value={summary?.matchedActive ?? 0} tone="text-primary" />
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İlan no / danışman ara..."
              className="h-8 pl-8 w-56 text-xs"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">İlan No</th>
                  <th className="px-3 py-2.5 font-medium">Danışman</th>
                  <th className="px-3 py-2.5 font-medium">Fiyat</th>
                  <th className="px-3 py-2.5 font-medium">Yayın</th>
                  <th className="px-3 py-2.5 font-medium">Durum</th>
                  <th className="px-3 py-2.5 font-medium">Yetki Sözleşmesi</th>
                  <th className="px-3 py-2.5 font-medium">Kalkış Sebebi</th>
                  <th className="px-3 py-2.5 font-medium text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Yükleniyor…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Kayıt yok. Bir CSV içe aktarın.</td></tr>
                ) : rows.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-mono text-xs">{l.listingNumber}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{l.employeeName ?? l.advisorName ?? "—"}</div>
                      {l.office && <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">{l.office}</div>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtPrice(l.price)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{l.publishedDate ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {l.status === "active" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Aktif</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Pasif</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.agreementUploadedAt ? (
                        <a
                          href={`/api/listings/${l.id}/agreement`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        >
                          <FileCheck2 className="h-3 w-3" /> Yüklendi
                        </a>
                      ) : l.agreementRequestedAt ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <Clock className="h-3 w-3" /> İstendi
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.closeReasonSubmittedAt ? (
                        <div>
                          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
                            l.closeReason === "Satıldı" || l.closeReason === "Kiralandı"
                              ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}>{l.closeReason}</span>
                          {l.closeReasonNote && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[180px] truncate">{l.closeReasonNote}</div>}
                        </div>
                      ) : l.status === "passive" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                          <Clock className="h-3 w-3" /> Bekliyor
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/l/${l.publicToken}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Danışman bağlantısını aç"
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {l.employeeId && (
                          <button
                            onClick={() => sendNotify(l.id)}
                            title="WhatsApp bildirimi gönder"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-primary"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
