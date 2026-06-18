import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { LISTING_CLOSE_REASONS } from "@shared/schema";
import {
  Building2, UploadCloud, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronUp, XCircle, Trash2, ArrowDownToLine,
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

interface UploadedFile { id: number; name: string; mime: string; }

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

function ActiveCard({ listing, token, onRefresh }: { listing: PendingListing; token: string; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [noAgreement, setNoAgreement] = useState(!!listing.noAgreementAt);
  const [togglingNoAgreement, setTogglingNoAgreement] = useState(false);
  const [confirmPassive, setConfirmPassive] = useState(false);
  const [movingToPassive, setMovingToPassive] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmHandDelivery, setConfirmHandDelivery] = useState(false);
  const [submittingHandDelivery, setSubmittingHandDelivery] = useState(false);

  const hasFiles = uploadedFiles.length > 0;

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/advisor/${token}/listings/${listing.id}/files`);
      if (res.ok) setUploadedFiles(await res.json());
    } catch { /* silent */ }
  }, [token, listing.id]);

  useEffect(() => { if (open) loadFiles(); }, [open, loadFiles]);

  const readFileAsBase64 = (file: File): Promise<{ data: string; mime: string; fileName: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        resolve({ data: dataUrl.split(",")[1] ?? "", mime: file.type, fileName: file.name });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const submit = async () => {
    if (!selectedFiles.length) return;
    setUploading(true);
    setError(null);
    try {
      const files = await Promise.all(selectedFiles.map(readFileAsBase64));
      const res = await fetch(`/api/public/advisor/${token}/listings/${listing.id}/agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message); }
      const data = await res.json();
      setUploadedFiles((prev) => [...prev, ...(data.files ?? [])]);
      setSelectedFiles([]);
    } catch (e: any) {
      setError(e?.message || "Yükleme başarısız.");
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (fileId: number) => {
    setDeletingId(fileId);
    try {
      await fetch(`/api/public/advisor/${token}/listings/${listing.id}/files/${fileId}`, { method: "DELETE" });
      setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      setError("Silme başarısız.");
    } finally {
      setDeletingId(null);
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

  const handDeliver = async () => {
    setSubmittingHandDelivery(true);
    try {
      const res = await fetch(`/api/public/advisor/${token}/listings/${listing.id}/hand-delivered`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      onRefresh();
    } catch {
      setError("İşlem başarısız.");
      setSubmittingHandDelivery(false);
    }
  };

  const moveToPassive = async () => {
    setMovingToPassive(true);
    try {
      const res = await fetch(`/api/public/advisor/${token}/listings/${listing.id}/to-passive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      onRefresh();
    } catch {
      setError("İşlem başarısız.");
      setMovingToPassive(false);
    }
  };

  return (
    <Card className={noAgreement ? "opacity-70" : ""}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm">{listing.listingNumber}</span>
            {hasFiles && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5"><CheckCircle2 className="h-3 w-3" />Yüklendi ({uploadedFiles.length})</span>}
            {noAgreement && !hasFiles && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"><XCircle className="h-3 w-3" />Sözleşme Yok</span>}
            {!hasFiles && !noAgreement && <span className="inline-flex text-[11px] font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">Sözleşme Bekleniyor</span>}
          </div>
          <div className="text-sm font-bold mt-0.5">{fmtPrice(listing.price)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 space-x-2">
            {listing.publishedDate && <span>📅 {listing.publishedDate}</span>}
            {listing.office && <span>{listing.office}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!confirmPassive ? (
            <button
              onClick={() => setConfirmPassive(true)}
              className="text-xs font-medium text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-300 rounded-lg px-2 py-1 transition-colors"
            >
              Pasife Çek
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConfirmPassive(false)}
                className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1"
              >İptal</button>
              <button
                disabled={movingToPassive}
                onClick={moveToPassive}
                className="text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg px-2 py-1 flex items-center gap-1 disabled:opacity-50"
              >
                {movingToPassive ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Onayla
              </button>
            </div>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-primary"
          >
            {open ? <><ChevronUp className="h-4 w-4" />Kapat</> : <><ChevronDown className="h-4 w-4" />{hasFiles ? "Yönet" : "Yükle"}</>}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 border-t border-border pt-4 space-y-3">
          {/* Uploaded files list */}
          {hasFiles && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Yüklenen Dosyalar</p>
              {uploadedFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30">
                  <span className="flex-1 text-xs truncate font-medium">{f.name}</span>
                  <button
                    disabled={deletingId === f.id}
                    onClick={() => deleteFile(f.id)}
                    className="shrink-0 text-destructive hover:text-destructive/80 disabled:opacity-40"
                    title="Sil"
                  >
                    {deletingId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload section */}
          {!noAgreement && (
            <div className="space-y-2">
              {hasFiles && <p className="text-xs font-medium text-muted-foreground">Ek Dosya Ekle</p>}
              {!hasFiles && (
                <p className="text-sm text-muted-foreground">
                  Bu ilana ait imzalı yetki sözleşmesini (PDF veya fotoğraf) yükleyin.
                </p>
              )}
              <label className="block border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary transition-colors">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))}
                />
                <UploadCloud className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
                {selectedFiles.length === 0 ? (
                  <span className="text-sm font-medium">Dosya seçmek için dokunun</span>
                ) : (
                  <span className="text-sm font-medium">{selectedFiles.length} dosya seçildi</span>
                )}
                {selectedFiles.length > 0 && (
                  <span className="block text-[11px] text-muted-foreground mt-1">
                    {selectedFiles.map((f) => f.name).join(", ")}
                  </span>
                )}
              </label>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                disabled={!selectedFiles.length || uploading}
                onClick={submit}
                className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Yükle
              </button>
            </div>
          )}

          {!noAgreement && !hasFiles && (
            <div className="space-y-2">
              {!confirmHandDelivery ? (
                <button
                  onClick={() => setConfirmHandDelivery(true)}
                  className="w-full h-9 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Sözleşmeyi elden teslim ettim
                </button>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                  <p className="text-xs text-emerald-800 font-medium">Sözleşmeyi fiziksel olarak ofise teslim ettiğinizi onaylıyor musunuz?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmHandDelivery(false)}
                      className="flex-1 h-8 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-50"
                    >İptal</button>
                    <button
                      disabled={submittingHandDelivery}
                      onClick={handDeliver}
                      className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {submittingHandDelivery ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Evet, teslim ettim
                    </button>
                  </div>
                </div>
              )}
            </div>
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

  const loadData = useCallback(() => {
    setLoading(true);
    fetch(`/api/public/advisor/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => { setData(d); setError(null); })
      .catch(() => setError("Bağlantı geçersiz veya bir hata oluştu."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

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
            <ActiveCard key={l.id} listing={l} token={token} onRefresh={loadData} />
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
