import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { LISTING_CLOSE_REASONS } from "@shared/schema";
import {
  Building2, UploadCloud, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronUp, XCircle,
} from "lucide-react";

interface PendingListing {
  id: number;
  listingNumber: string;
  price: string | null;
  publishedDate?: string | null;
  removedDate?: string | null;
  office: string | null;
  store: string | null;
  publicToken: string;
  noAgreementAt?: string | null;
}

interface AdvisorData {
  name: string;
  active: PendingListing[];
  passive: PendingListing[];
}

function fmtPrice(p: string | null): string {
  if (!p) return "—";
  return Number(p).toLocaleString("tr-TR") + " ₺";
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40 flex flex-col items-center px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <div className="h-8 w-8 rounded-lg bg-[#CC0000] flex items-center justify-center">
          <Building2 className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <div className="font-bold leading-none">HireFlow</div>
          <div className="text-[10px] text-muted-foreground leading-none">KW Platin &amp; Karma</div>
        </div>
      </div>
      <div className="w-full max-w-lg space-y-4">
        {children}
      </div>
      <p className="text-[11px] text-muted-foreground mt-6 text-center max-w-lg">
        Bu bağlantı yalnızca size özeldir, lütfen başkalarıyla paylaşmayın.
      </p>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function ActiveCard({ listing, token }: { listing: PendingListing; token: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [noAgreement, setNoAgreement] = useState(!!listing.noAgreementAt);
  const [togglingNoAgreement, setTogglingNoAgreement] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      const res = await fetch(`/api/public/advisor/${token}/listings/${listing.id}/agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mime: file.type, data: base64 }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message); }
      setDone(true);
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Yükleme başarısız.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleNoAgreement = async () => {
    setTogglingNoAgreement(true);
    try {
      const res = await fetch(`/api/public/advisor/${token}/listings/${listing.id}/no-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNoAgreement(!!data.noAgreementAt);
      if (!!data.noAgreementAt) setOpen(false);
    } catch {
      setError("İşlem başarısız.");
    } finally {
      setTogglingNoAgreement(false);
    }
  };

  return (
    <Card className={noAgreement ? "opacity-70" : ""}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm">{listing.listingNumber}</span>
            {done && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5"><CheckCircle2 className="h-3 w-3" />Yüklendi</span>}
            {noAgreement && !done && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"><XCircle className="h-3 w-3" />Sözleşme Yok</span>}
            {!done && !noAgreement && <span className="inline-flex text-[11px] font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">Sözleşme Bekleniyor</span>}
          </div>
          <div className="text-sm font-bold mt-0.5">{fmtPrice(listing.price)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 space-x-2">
            {listing.publishedDate && <span>📅 {listing.publishedDate}</span>}
            {listing.office && <span>{listing.office}</span>}
          </div>
        </div>
        {!done && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 flex items-center gap-1 text-xs font-medium text-primary"
          >
            {open ? <><ChevronUp className="h-4 w-4" />Kapat</> : <><ChevronDown className="h-4 w-4" />Yükle</>}
          </button>
        )}
      </div>

      {open && !done && (
        <div className="mt-4 border-t border-border pt-4 space-y-3">
          {!noAgreement && (
            <>
              <p className="text-sm text-muted-foreground">
                Bu ilana ait imzalı yetki sözleşmesini (PDF veya fotoğraf) yükleyin.
              </p>
              <label className="block border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary transition-colors">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <UploadCloud className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
                <span className="text-sm font-medium">{file ? file.name : "Dosya seçmek için dokunun"}</span>
                {file && <span className="block text-[11px] text-muted-foreground mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</span>}
              </label>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                disabled={!file || submitting}
                onClick={submit}
                className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Yükle
              </button>
            </>
          )}
          <button
            disabled={togglingNoAgreement}
            onClick={toggleNoAgreement}
            className={`w-full h-9 rounded-lg border font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors ${
              noAgreement
                ? "border-primary text-primary hover:bg-primary/5"
                : "border-slate-300 text-slate-500 hover:bg-slate-50"
            }`}
          >
            {togglingNoAgreement ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            {noAgreement ? "Geri al — sözleşme mevcut" : "Yetki sözleşmem yok"}
          </button>
        </div>
      )}

      {noAgreement && !open && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            disabled={togglingNoAgreement}
            onClick={toggleNoAgreement}
            className="text-xs text-muted-foreground hover:text-primary underline"
          >
            Geri al — sözleşme mevcut
          </button>
        </div>
      )}
    </Card>
  );
}

function PassiveCard({ listing, token }: { listing: PendingListing; token: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/advisor/${token}/listings/${listing.id}/reason`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message); }
      setDone(true);
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Gönderim başarısız.");
    } finally {
      setSubmitting(false);
    }
  };

  const isSold = reason === "Satıldı" || reason === "Kiralandı";

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm">{listing.listingNumber}</span>
            {done && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5"><CheckCircle2 className="h-3 w-3" />Kaydedildi</span>}
            {!done && <span className="inline-flex text-[11px] font-medium text-red-600 bg-red-50 rounded-full px-2 py-0.5">Kapanış Sebebi Bekleniyor</span>}
          </div>
          <div className="text-sm font-bold mt-0.5">{fmtPrice(listing.price)}</div>
          {listing.office && <div className="text-[11px] text-muted-foreground">{listing.office}</div>}
        </div>
        {!done && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 flex items-center gap-1 text-xs font-medium text-primary"
          >
            {open ? <><ChevronUp className="h-4 w-4" />Kapat</> : <><ChevronDown className="h-4 w-4" />Gir</>}
          </button>
        )}
      </div>

      {open && !done && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Bu ilanın yayından kalkma sebebini belirtin.
          </p>
          <label className="text-xs font-medium text-muted-foreground">Sebep</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full mt-1 mb-3 h-10 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">Seçiniz…</option>
            {LISTING_CLOSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <label className="text-xs font-medium text-muted-foreground">Açıklama (opsiyonel)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Ek bilgi…"
            className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          {isSold && (
            <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
              Tebrikler! Kapanış işlemleri için ofisimiz sizinle iletişime geçecek.
            </div>
          )}
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          <button
            disabled={!reason || submitting}
            onClick={submit}
            className="w-full mt-3 h-10 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Gönder
          </button>
        </div>
      )}
    </Card>
  );
}

export default function AdvisorSelfService() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<AdvisorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/advisor/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => { setData(d); setError(null); })
      .catch(() => setError("Bağlantı geçersiz veya bir hata oluştu."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Shell>
        <Card className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </Card>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <Card>
          <div className="text-center py-6">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error ?? "Bir hata oluştu."}</p>
          </div>
        </Card>
      </Shell>
    );
  }

  const totalPending = data.active.length + data.passive.length;

  if (totalPending === 0) {
    return (
      <Shell>
        <Card>
          <div className="text-center py-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h2 className="font-semibold text-lg">Tüm İlanlar Tamamlandı</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Bekleyen işlem bulunmuyor, teşekkürler {data.name}!
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <h1 className="font-bold text-lg">Merhaba {data.name} 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalPending} ilanınız için işlem bekleniyor.
        </p>
      </Card>

      {data.active.length > 0 && (
        <>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Aktif İlanlar — Yetki Sözleşmesi ({data.active.length})
          </div>
          {data.active.map((l) => (
            <ActiveCard key={l.id} listing={l} token={token} />
          ))}
        </>
      )}

      {data.passive.length > 0 && (
        <>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mt-2">
            Pasif İlanlar — Kapanış Sebebi ({data.passive.length})
          </div>
          {data.passive.map((l) => (
            <PassiveCard key={l.id} listing={l} token={token} />
          ))}
        </>
      )}
    </Shell>
  );
}
