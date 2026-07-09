import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle2, XCircle, Loader2, AlertTriangle, TrendingUp, Users, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const syncMutation = useMutation({
    mutationFn: () => fetch("/api/fonzip/sync", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) {
        toast({ title: "Sync hatası", description: data.error, variant: "destructive" });
        return;
      }
      toast({
        title: "Senkronizasyon tamamlandı",
        description: `${data.upserted} kayıt güncellendi, ${data.matched} danışman eşleştirildi, ${data.expensesCreated} gelir kaydı oluşturuldu.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/fonzip"] });
      qc.invalidateQueries({ queryKey: ["/api/office-expenses"] });
      refetchStats();
    },
    onError: () => toast({ title: "Hata", description: "Senkronizasyon başarısız.", variant: "destructive" }),
  });

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
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !status?.configured}
            size="sm"
          >
            {syncMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Senkronize ediliyor...</>
              : <><RefreshCw className="h-4 w-4 mr-2" />Fonzip'ten Senkronize Et</>}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Toplam Kayıt" value={stats.total.toLocaleString("tr-TR")} />
          <StatCard label="Ödendi" value={stats.paid.toLocaleString("tr-TR")} />
          <StatCard label="Bekliyor" value={stats.pending.toLocaleString("tr-TR")} />
          <StatCard label="Eşleşti" value={stats.matched.toLocaleString("tr-TR")} />
          <StatCard label="Eşleşmedi" value={stats.unmatched.toLocaleString("tr-TR")} />
          <StatCard label="Gelir Kaydı" value={stats.syncedToExpenses.toLocaleString("tr-TR")}
            sub={stats.lastSyncAt ? `Son: ${new Date(stats.lastSyncAt).toLocaleDateString("tr-TR")}` : "Henüz sync yok"} />
        </div>
      )}

      {!stats?.total && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
            <RefreshCw className="h-8 w-8 opacity-30" />
            <p className="text-sm">Henüz senkronizasyon yapılmadı. "Fonzip'ten Senkronize Et" butonuna basın.</p>
          </CardContent>
        </Card>
      )}

      {(stats?.total ?? 0) > 0 && (
        <Tabs defaultValue="report">
          <TabsList>
            <TabsTrigger value="report"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Aidat Raporu</TabsTrigger>
            <TabsTrigger value="unmatched">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Eşleşmeyenler
              {(unmatched?.length ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-4 text-[10px]">{unmatched!.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="preview"><Users className="h-3.5 w-3.5 mr-1.5" />Ham Veri</TabsTrigger>
          </TabsList>

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
