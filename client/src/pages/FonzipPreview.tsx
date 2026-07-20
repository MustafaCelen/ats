import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle2, XCircle, Loader2, AlertTriangle, TrendingUp, Users, Clock, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// Excel tarih (Date obj veya "YYYY-MM-DD HH:mm:ss" string) → YYYY-MM-DD
function normalizeDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n);

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function JsonViewer({ data }: { data: any }) {
  if (!data) return null;
  if (data.error) return (
    <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{data.error}</div>
  );
  return (
    <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap break-words">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function FonzipPreview() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [previewEnabled, setPreviewEnabled] = useState(false);

  const { data: status } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/fonzip/status"],
    queryFn: () => fetch("/api/fonzip/status", { credentials: "include" }).then(r => r.json()),
    staleTime: 0,
  });

  const { data: stats, refetch: refetchStats } = useQuery<{
    total: number; paid: number; pending: number; matched: number; unmatched: number; syncedToExpenses: number; lastSyncAt: string | null;
  }>({
    queryKey: ["/api/fonzip/sync/stats"],
    queryFn: () => fetch("/api/fonzip/sync/stats", { credentials: "include" }).then(r => r.json()),
    staleTime: 0,
  });

  const { data: duesReport } = useQuery<{
    employeeId: number; employeeName: string; kwuid: string | null;
    paidTotal: number; pendingTotal: number; paidCount: number; pendingCount: number;
    lastPaymentDate: string | null;
  }[]>({
    queryKey: ["/api/fonzip/dues-report"],
    queryFn: () => fetch("/api/fonzip/dues-report", { credentials: "include" }).then(r => r.json()),
    staleTime: 0,
  });

  const { data: unmatched } = useQuery<any[]>({
    queryKey: ["/api/fonzip/synced-debts", "unmatched"],
    queryFn: () => fetch("/api/fonzip/synced-debts?unmatched=true", { credentials: "include" }).then(r => r.json()),
    staleTime: 0,
  });

  const { data: preview, isLoading: previewLoading, refetch: refetchPreview } = useQuery<{
    users: any; debts: any; donations: any;
  }>({
    queryKey: ["/api/fonzip/preview"],
    queryFn: () => fetch("/api/fonzip/preview", { credentials: "include" }).then(r => r.json()),
    enabled: previewEnabled,
    staleTime: 0,
    retry: false,
  });

  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery<{ running: boolean; lastResult: any }>({
    queryKey: ["/api/fonzip/sync/status"],
    queryFn: () => fetch("/api/fonzip/sync/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: (q) => q.state.data?.running ? 3000 : false,
    staleTime: 0,
  });

  const syncMutation = useMutation({
    mutationFn: () => fetch("/api/fonzip/sync", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) {
        toast({ title: "Sync hatası", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Sync başlatıldı", description: "Arka planda çalışıyor. İstatistikler otomatik güncellenir." });
      refetchSyncStatus();
      const interval = setInterval(() => {
        refetchStats();
        refetchSyncStatus().then(r => { if (!r.data?.running) clearInterval(interval); });
      }, 5000);
    },
    onError: () => toast({ title: "Hata", description: "Senkronizasyon başarısız.", variant: "destructive" }),
  });

  const isSyncRunning = syncMutation.isPending || syncStatus?.running;

  const { data: usersSyncStatus, refetch: refetchUsersSyncStatus } = useQuery<{ running: boolean; lastResult: any }>({
    queryKey: ["/api/fonzip/sync-users/status"],
    queryFn: () => fetch("/api/fonzip/sync-users/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: (q) => q.state.data?.running ? 3000 : false,
    staleTime: 0,
  });

  const { data: userFinancials, refetch: refetchUserFinancials } = useQuery<any[]>({
    queryKey: ["/api/fonzip/user-financials"],
    queryFn: () => fetch("/api/fonzip/user-financials", { credentials: "include" }).then(r => r.json()),
    staleTime: 0,
  });

  const usersSyncMutation = useMutation({
    mutationFn: () => fetch("/api/fonzip/sync-users", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) {
        toast({ title: "Sync hatası", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Kullanıcı borç sync'i başlatıldı", description: "~1 dakika sürer." });
      refetchUsersSyncStatus();
      const interval = setInterval(() => {
        refetchUserFinancials();
        refetchUsersSyncStatus().then(r => { if (!r.data?.running) clearInterval(interval); });
      }, 5000);
    },
    onError: () => toast({ title: "Hata", description: "Kullanıcı sync'i başarısız.", variant: "destructive" }),
  });

  const isUsersSyncRunning = usersSyncMutation.isPending || usersSyncStatus?.running;

  const { data: recentSyncStatus, refetch: refetchRecentSyncStatus } = useQuery<{ running: boolean; lastResult: any }>({
    queryKey: ["/api/fonzip/sync-recent/status"],
    queryFn: () => fetch("/api/fonzip/sync-recent/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: (q) => q.state.data?.running ? 3000 : false,
    staleTime: 0,
  });

  const recentSyncMutation = useMutation({
    mutationFn: (days: number = 3) => fetch("/api/fonzip/sync-recent", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }),
    }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Sync hatası", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Günlük sync başlatıldı", description: "Son 3 gün taranıyor, ~30 saniye." });
      refetchRecentSyncStatus();
      const interval = setInterval(() => {
        refetchStats();
        refetchRecentSyncStatus().then(r => { if (!r.data?.running) clearInterval(interval); });
      }, 3000);
    },
    onError: () => toast({ title: "Hata", description: "Günlük sync başarısız.", variant: "destructive" }),
  });

  const isRecentSyncRunning = recentSyncMutation.isPending || recentSyncStatus?.running;

  const [excelImporting, setExcelImporting] = useState(false);

  const { data: excelImportStatus, refetch: refetchExcelStatus } = useQuery<{ running: boolean; lastResult: any; progress?: { current: number; total: number } }>({
    queryKey: ["/api/fonzip/import-excel/status"],
    queryFn: () => fetch("/api/fonzip/import-excel/status", { credentials: "include", cache: "no-store" }).then(r => r.json()),
    refetchInterval: (q) => q.state.data?.running ? 2000 : false,
    staleTime: 0,
  });

  const resetImportMutation = useMutation({
    mutationFn: () => fetch("/api/fonzip/import-excel/reset", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Import sıfırlandı", description: "Tekrar Excel yükleyebilirsiniz." });
      refetchExcelStatus();
    },
  });

  const showExcelResult = (data: any) => {
    if (!data) return;
    if (data.error) {
      toast({ title: "Import hatası", description: data.error, variant: "destructive" });
      return;
    }
    const modeLabel = data.mode === "debts" ? "Borçlar" : "Ödemeler";
    const detailPart = data.mode === "debts"
      ? `${data.detailsUpdated} açıklama güncellendi, ${data.upserted} yeni borç`
      : `${data.upserted} kayıt, ${data.expensesCreated} gelir`;
    toast({
      title: `${modeLabel} import tamamlandı`,
      description: `${detailPart}, ${data.matched} eşleşme, ${data.skipped} atlandı.`,
    });
    qc.invalidateQueries({ queryKey: ["/api/fonzip"] });
    qc.invalidateQueries({ queryKey: ["/api/office-expenses"] });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useMutation({
    mutationFn: async ({ rows, mode }: { rows: any[]; mode: "payments" | "debts" }) => {
      const res = await fetch("/api/fonzip/import-excel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mode }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.error) {
        toast({ title: "Import hatası", description: data.error, variant: "destructive" });
        setExcelImporting(false);
        return;
      }
      if (data.running) {
        // Arka planda çalışıyor — poll et
        const interval = setInterval(() => {
          refetchExcelStatus().then(r => {
            if (!r.data?.running) {
              clearInterval(interval);
              setExcelImporting(false);
              showExcelResult(r.data?.lastResult);
              qc.invalidateQueries({ queryKey: ["/api/fonzip"] });
              qc.invalidateQueries({ queryKey: ["/api/office-expenses"] });
            }
          });
        }, 2000);
        return;
      }
      setExcelImporting(false);
      showExcelResult(data);
    },
    onError: (e: any) => {
      setExcelImporting(false);
      toast({ title: "Import hatası", description: e?.message, variant: "destructive" });
    },
  });

  const handleExcelUpload = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      // Dosya tipini algıla: "Durum" ve "Kart Bankası" varsa ödemeler dosyası → uyarı
      const firstRow = raw[0] ?? {};
      const isPayments = "Durum" in firstRow || "Kart Bankası" in firstRow;
      if (isPayments) {
        toast({
          title: "Bu dosya 'Ödemeler' dosyası",
          description: "Yalnızca 'Borçlar/Aidatlar' dosyasını yüklemelisin. Gelir kayıtları borçlardan oluşturuluyor.",
          variant: "destructive",
        });
        return;
      }
      const mode: "payments" | "debts" = "debts";

      const rows = raw.map((r) => {
        const amount = r["Ödeme Miktarı"] ?? r["Odeme Miktari"];
        const status = String(r["Durum"] ?? "").toLowerCase().includes("başarı") ? 1 : 8;
        return {
          fonzipId: Number(r["Aidat Kayıt No"] ?? r["Aidat Kayit No"]),
          fonzipUserId: r["Üyelik > Kişi/Kurum Kayıt No"] ?? r["Kişi/Kurum Kayıt No"] ?? null,
          membershipNo: r["Üyelik > Üye No"] != null ? String(r["Üyelik > Üye No"]) : (r["Üye No"] != null ? String(r["Üye No"]) : null),
          userName: r["Kişisel > Ad Soyad"] ?? r["Ad Soyad"] ?? r["Üye Adı"] ?? "",
          amount: amount != null ? String(amount) : "0",
          operationDate: normalizeDate(r["İşlem Tarihi"] ?? r["Islem Tarihi"]),
          details: r["Açıklama"] ?? r["Aciklama"] ?? null,
          period: r["Dönem"] ?? r["Donem"] ?? null,
          addedByName: r["Ekleyen Kişi"] ?? r["Ekleyen Kisi"] ?? null,
          ...(isPayments ? { status } : {}),
        };
      }).filter((r) => r.fonzipId && !isNaN(r.fonzipId));

      if (rows.length === 0) {
        toast({ title: "Excel okundu ama uygun kayıt bulunamadı", description: "Kolon başlıklarını kontrol edin.", variant: "destructive" });
        return;
      }
      toast({ title: `${rows.length} satır (${mode === "payments" ? "Ödemeler" : "Borçlar"})`, description: "Arka planda işleniyor, lütfen bekleyin..." });
      setExcelImporting(true);
      importMutation.mutate({ rows, mode });
    } catch (e: any) {
      toast({ title: "Excel okunamadı", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fonzip Entegrasyonu</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aidat ve ödeme takibi</p>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <Badge variant={status.configured ? "default" : "destructive"} className="gap-1">
              {status.configured ? <><CheckCircle2 className="h-3 w-3" /> Bağlı</> : <><XCircle className="h-3 w-3" /> Yapılandırılmamış</>}
            </Badge>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleExcelUpload(f);
              if (e.target) e.target.value = "";
            }}
          />
          {(excelImporting || excelImportStatus?.running) && (
            <Button
              onClick={() => resetImportMutation.mutate()}
              size="sm"
              variant="destructive"
            >
              İptal / Sıfırla
            </Button>
          )}
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={excelImporting || excelImportStatus?.running}
            size="sm"
            variant="outline"
          >
            {(excelImporting || excelImportStatus?.running)
              ? (() => {
                  const p = excelImportStatus?.progress;
                  if (p && p.total > 0) {
                    const pct = Math.round(p.current / p.total * 100);
                    return <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{pct}% ({p.current}/{p.total})</>;
                  }
                  return <><Loader2 className="h-4 w-4 mr-2 animate-spin" />İşleniyor...</>;
                })()
              : <><Upload className="h-4 w-4 mr-2" />Excel İçe Aktar</>}
          </Button>
          <Button
            onClick={() => recentSyncMutation.mutate(3)}
            disabled={isRecentSyncRunning || !status?.configured}
            size="sm"
            variant="outline"
          >
            {isRecentSyncRunning
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Günlük sync...</>
              : <><Clock className="h-4 w-4 mr-2" />Günlük Sync (3 gün)</>}
          </Button>
          <Button
            onClick={() => usersSyncMutation.mutate()}
            disabled={isUsersSyncRunning || !status?.configured}
            size="sm"
            variant="outline"
          >
            {isUsersSyncRunning
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Borçlar sync...</>
              : <><Users className="h-4 w-4 mr-2" />Toplam Borç Sync</>}
          </Button>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={isSyncRunning || !status?.configured}
            size="sm"
          >
            {isSyncRunning
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Detay sync...</>
              : <><RefreshCw className="h-4 w-4 mr-2" />Detaylı Sync</>}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Toplam Kayıt" value={(stats.total ?? 0).toLocaleString("tr-TR")} />
          <StatCard label="Ödendi" value={(stats.paid ?? 0).toLocaleString("tr-TR")} />
          <StatCard label="Bekliyor" value={(stats.pending ?? 0).toLocaleString("tr-TR")} />
          <StatCard label="Eşleşti" value={(stats.matched ?? 0).toLocaleString("tr-TR")} />
          <StatCard label="Eşleşmedi" value={(stats.unmatched ?? 0).toLocaleString("tr-TR")} />
          <StatCard label="Gelir Kaydı" value={(stats.syncedToExpenses ?? 0).toLocaleString("tr-TR")}
            sub={stats.lastSyncAt ? `Son: ${new Date(stats.lastSyncAt).toLocaleDateString("tr-TR")}` : "Henüz sync yok"} />
        </div>
      )}

      {!stats?.total && !userFinancials?.length && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
            <RefreshCw className="h-8 w-8 opacity-30" />
            <p className="text-sm">Henüz senkronizasyon yapılmadı. Hızlı başlangıç için "Toplam Borç Sync" butonuna basın.</p>
          </CardContent>
        </Card>
      )}

      {((stats?.total ?? 0) > 0 || (userFinancials?.length ?? 0) > 0) && (
        <Tabs defaultValue="debts">
          <TabsList>
            <TabsTrigger value="debts">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Borçlu Danışmanlar
              {(userFinancials?.length ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-4 text-[10px]">{userFinancials!.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="report"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Aidat Raporu (Detay)</TabsTrigger>
            <TabsTrigger value="unmatched">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Eşleşmeyenler
              {(unmatched?.length ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-4 text-[10px]">{unmatched!.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="preview"><Users className="h-3.5 w-3.5 mr-1.5" />Ham Veri</TabsTrigger>
          </TabsList>

          <TabsContent value="debts" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Borçlu Danışman Listesi
                  {userFinancials && userFinancials.length > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      Toplam: {formatCurrency(userFinancials.reduce((s, r) => s + parseFloat(r.total_financial), 0))}
                    </span>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Fonzip'teki tüm üyelerin toplam borç durumu. "Toplam Borç Sync" ile güncellenir.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {!userFinancials?.length ? (
                  <p className="text-sm text-muted-foreground p-4">Henüz borç verisi yok. "Toplam Borç Sync" butonuna basın.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fonzip Adı</TableHead>
                        <TableHead>Danışman (Sistemde)</TableHead>
                        <TableHead>KW UID</TableHead>
                        <TableHead className="text-right">Borç Tutarı</TableHead>
                        <TableHead>İletişim</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userFinancials.map((r: any) => (
                        <TableRow key={r.fonzip_user_id}>
                          <TableCell className="font-medium">{r.user_name}</TableCell>
                          <TableCell>
                            {r.employee_name ? (
                              <span className="text-green-700">{r.employee_name}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">Eşleşmedi</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">{r.membership_no ?? "—"}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {formatCurrency(parseFloat(r.total_financial))}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.phone ?? r.email ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="report" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Danışman Bazlı Aidat Özeti</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!duesReport?.length ? (
                  <p className="text-sm text-muted-foreground p-4">Eşleşmiş kayıt yok.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Danışman</TableHead>
                        <TableHead>KW UID</TableHead>
                        <TableHead className="text-right">Ödendi</TableHead>
                        <TableHead className="text-right">Bekliyor</TableHead>
                        <TableHead className="text-right">Ödeme Sayısı</TableHead>
                        <TableHead>Son Ödeme</TableHead>
                        <TableHead>Durum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {duesReport.map(r => (
                        <TableRow key={r.employeeId}>
                          <TableCell className="font-medium">{r.employeeName}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{r.kwuid ?? "—"}</TableCell>
                          <TableCell className="text-right text-green-700 font-medium">
                            {r.paidTotal > 0 ? formatCurrency(r.paidTotal) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {r.pendingTotal > 0 ? formatCurrency(r.pendingTotal) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{r.paidCount}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {r.lastPaymentDate ? new Date(r.lastPaymentDate).toLocaleDateString("tr-TR") : "—"}
                          </TableCell>
                          <TableCell>
                            {r.pendingTotal > 0 ? (
                              <Badge variant="destructive" className="text-[10px]">Borçlu</Badge>
                            ) : (
                              <Badge variant="default" className="text-[10px] bg-green-600">Temiz</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unmatched" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Eşleştirilemeyen Fonzip Kayıtları</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Bu kayıtlar için sistemde kwuid eşleşmesi bulunamadı. Danışmanların kwuid alanını doldurun.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {!unmatched?.length ? (
                  <p className="text-sm text-muted-foreground p-4">Eşleşmeyen kayıt yok.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fonzip Adı</TableHead>
                        <TableHead>Üye No</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                        <TableHead>Detay</TableHead>
                        <TableHead>Tarih</TableHead>
                        <TableHead>Durum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatched.slice(0, 100).map((d: any) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.userName}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{d.membershipNo ?? "—"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(parseFloat(d.amount))}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{d.details ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {d.operationDate ? new Date(d.operationDate).toLocaleDateString("tr-TR") : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={d.status === 1 ? "default" : "secondary"} className="text-[10px]">
                              {d.status === 1 ? "Ödendi" : "Bekliyor"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button
                size="sm" variant="outline"
                onClick={() => { if (previewEnabled) refetchPreview(); else setPreviewEnabled(true); }}
                disabled={previewLoading}
              >
                {previewLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Ham Veriyi Çek
              </Button>
            </div>
            {preview && (
              <Tabs defaultValue="users">
                <TabsList>
                  <TabsTrigger value="users">Üyeler</TabsTrigger>
                  <TabsTrigger value="debts">Aidatlar</TabsTrigger>
                  <TabsTrigger value="donations">Bağışlar</TabsTrigger>
                </TabsList>
                <TabsContent value="users"><Card><CardContent className="pt-4"><JsonViewer data={preview.users} /></CardContent></Card></TabsContent>
                <TabsContent value="debts"><Card><CardContent className="pt-4"><JsonViewer data={preview.debts} /></CardContent></Card></TabsContent>
                <TabsContent value="donations"><Card><CardContent className="pt-4"><JsonViewer data={preview.donations} /></CardContent></Card></TabsContent>
              </Tabs>
            )}
            {!preview && !previewLoading && (
              <Card className="border-dashed">
                <CardContent className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  Ham veriyi görmek için "Ham Veriyi Çek" butonuna basın.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
