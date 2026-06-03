import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { LISTING_CLOSE_REASONS } from "@shared/schema";
import {
  Building2, UploadCloud, CheckCircle2, Loader2, AlertCircle,
} from "lucide-react";

interface PublicListing {
  listingNumber: string;
  price: string | null;
  status: "active" | "passive";
  office: string | null;
  store: string | null;
  publishedDate: string | null;
  removedDate: string | null;
  employeeName?: string;
  agreementUploaded: boolean;
  closeReason: string | null;
  closeReasonSubmitted: boolean;
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
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        {children}
      </div>
      <p className="text-[11px] text-muted-foreground mt-6 text-center max-w-md">
        Bu bağlantı yalnızca size özeldir, lütfen başkalarıyla paylaşmayın.
      </p>
    </div>
  );
}

export default function PublicListing() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // agreement
  const [file, setFile] = useState<File | null>(null);
  // reason
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/public/listings/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => { setData(d); setError(null); })
      .catch(() => setError("Bağlantı geçersiz veya süresi dolmuş."))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const submitAgreement = async () => {
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
      const res = await fetch(`/api/public/listings/${token}/agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mime: file.type, data: base64 }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message); }
      setDone(true);
    } catch (e: any) {
      setError(e?.message || "Yükleme başarısız.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReason = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/listings/${token}/reason`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message); }
      setDone(true);
    } catch (e: any) {
      setError(e?.message || "Gönderim başarısız.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Shell><div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></Shell>;
  }
  if (error && !data) {
    return <Shell><div className="text-center py-6"><AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" /><p className="text-sm text-muted-foreground">{error}</p></div></Shell>;
  }
  if (!data) return null;

  const ListingHeader = () => (
    <div className="mb-5">
      <div className="text-xs text-muted-foreground">İlan No</div>
      <div className="font-mono font-semibold">{data.listingNumber}</div>
      <div className="flex items-center gap-3 mt-2 text-sm">
        <span className="font-bold">{fmtPrice(data.price)}</span>
        {data.employeeName && <span className="text-muted-foreground">· {data.employeeName}</span>}
      </div>
      {data.office && <div className="text-[11px] text-muted-foreground mt-0.5">{data.office}</div>}
    </div>
  );

  if (done) {
    return (
      <Shell>
        <div className="text-center py-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <h2 className="font-semibold text-lg">Teşekkürler!</h2>
          <p className="text-sm text-muted-foreground mt-1">Bilgileriniz kaydedildi.</p>
        </div>
      </Shell>
    );
  }

  // Active listing → request agreement
  if (data.status === "active") {
    if (data.agreementUploaded) {
      return (
        <Shell>
          <ListingHeader />
          <div className="text-center py-4">
            <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Bu ilan için yetki sözleşmesi zaten yüklenmiş.</p>
          </div>
        </Shell>
      );
    }
    return (
      <Shell>
        <ListingHeader />
        <h2 className="font-semibold mb-1">Yetki Sözleşmesi Yükle</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Bu ilana ait imzalı yetki sözleşmesini (PDF veya fotoğraf) yükleyin.
        </p>
        <label className="block border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary transition-colors">
          <input
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <UploadCloud className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <span className="text-sm font-medium">{file ? file.name : "Dosya seçmek için dokunun"}</span>
          {file && <span className="block text-[11px] text-muted-foreground mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</span>}
        </label>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        <button
          disabled={!file || submitting}
          onClick={submitAgreement}
          className="w-full mt-4 h-10 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Yükle
        </button>
      </Shell>
    );
  }

  // Passive listing → request close reason
  if (data.closeReasonSubmitted) {
    return (
      <Shell>
        <ListingHeader />
        <div className="text-center py-4">
          <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Kalkış sebebi alınmış: <b>{data.closeReason}</b></p>
        </div>
      </Shell>
    );
  }
  const isSold = reason === "Satıldı" || reason === "Kiralandı";
  return (
    <Shell>
      <ListingHeader />
      <h2 className="font-semibold mb-1">İlan Yayından Kalktı</h2>
      <p className="text-sm text-muted-foreground mb-4">
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
        onClick={submitReason}
        className="w-full mt-4 h-10 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Gönder
      </button>
    </Shell>
  );
}
