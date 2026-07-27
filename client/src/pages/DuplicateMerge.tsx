import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, ArrowRight, Search, History, AlertTriangle, RotateCcw, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DuplicateGroup {
  key: string;
  reason: "name" | "phone" | "email";
  ids: number[];
}

interface Candidate {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  office: string | null;
  category: string | null;
}

interface PreviewData {
  source: any;
  sourceEmployees: number;
  target: any;
  targetHasEmployee: boolean;
  counts: Record<string, number>;
}

const REASON_LABEL: Record<string, string> = {
  name: "Aynı İsim",
  phone: "Aynı Telefon",
  email: "Aynı E-posta",
};

const REASON_COLOR: Record<string, string> = {
  name: "bg-blue-100 text-blue-700",
  phone: "bg-emerald-100 text-emerald-700",
  email: "bg-purple-100 text-purple-700",
};

export default function DuplicateMerge() {
  const [tab, setTab] = useState<"auto" | "manual" | "history">("auto");
  const [sourceId, setSourceId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: duplicates = [], isLoading: loadingDup } = useQuery<DuplicateGroup[]>({
    queryKey: ["/api/candidates/duplicates"],
    queryFn: () => fetch("/api/candidates/duplicates", { credentials: "include" }).then(r => r.json()),
    enabled: tab === "auto",
  });

  const { data: allCandidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
    queryFn: () => fetch("/api/candidates", { credentials: "include" }).then(r => r.json()),
  });

  const candidatesById = useMemo(() => {
    const m = new Map<number, Candidate>();
    for (const c of allCandidates) m.set(c.id, c);
    return m;
  }, [allCandidates]);

  const { data: mergeLog = [] } = useQuery<any[]>({
    queryKey: ["/api/candidates/merge/log"],
    queryFn: () => fetch("/api/candidates/merge/log", { credentials: "include" }).then(r => r.json()),
    enabled: tab === "history",
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/candidates/merge/preview", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: Number(sourceId), targetId: Number(targetId) }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Hata");
      return res.json() as Promise<PreviewData>;
    },
    onSuccess: (data) => setPreview(data),
    onError: (e: any) => toast({ title: "Önizleme hatası", description: e?.message, variant: "destructive" }),
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/candidates/merge", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: Number(sourceId), targetId: Number(targetId) }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Hata");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Merge tamamlandı", description: `Log #${data.logId} - geri alınabilir` });
      setPreview(null); setSourceId(""); setTargetId("");
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
      qc.invalidateQueries({ queryKey: ["/api/candidates/duplicates"] });
      qc.invalidateQueries({ queryKey: ["/api/candidates/merge/log"] });
    },
    onError: (e: any) => toast({ title: "Merge hatası", description: e?.message, variant: "destructive" }),
  });

  const undoMutation = useMutation({
    mutationFn: async (logId: number) => {
      const res = await fetch(`/api/candidates/merge/${logId}/undo`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message ?? "Hata");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Merge geri alındı" });
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
      qc.invalidateQueries({ queryKey: ["/api/candidates/merge/log"] });
    },
    onError: (e: any) => toast({ title: "Geri alma hatası", description: e?.message, variant: "destructive" }),
  });

  const setPair = (a: number, b: number) => {
    setSourceId(String(a));
    setTargetId(String(b));
    setTab("manual");
    setPreview(null);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Danışman Birleştirme (Merge)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Duplicate danışman kayıtlarını birleştir · veri kaybı = 0 · geri alınabilir
          </p>
        </div>

        {/* Uyarı */}
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Nasıl Çalışır?</p>
            <p className="text-amber-700 mt-1">
              <b>Kaynak</b> silinir, tüm ilişkileri (kapanışlar, ilanlar, ödemeler, notlar vs) <b>hedef</b>e taşınır.
              Snapshot alınır — istersen geri alabilirsin. Hedefte boş olan alanlar (email/telefon/ofis) kaynaktakiyle doldurulur.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {([
            { key: "auto",    label: "Otomatik Öneriler", icon: Search },
            { key: "manual",  label: "Manuel Merge",       icon: ArrowRight },
            { key: "history", label: "Geçmiş",             icon: History },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPreview(null); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Otomatik Öneriler */}
        {tab === "auto" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tespit Edilen Muhtemel Duplike'ler</CardTitle>
              <p className="text-xs text-muted-foreground">İsim, telefon veya e-posta eşleşmelerine göre gruplar</p>
            </CardHeader>
            <CardContent>
              {loadingDup ? (
                <p className="text-sm text-muted-foreground p-2">Taranıyor...</p>
              ) : duplicates.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">Duplike tespit edilmedi.</p>
              ) : (
                <div className="space-y-2">
                  {duplicates.map((d, i) => (
                    <div key={i} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${REASON_COLOR[d.reason]}`}>
                          {REASON_LABEL[d.reason]}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono truncate">{d.key}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{d.ids.length} kayıt</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {d.ids.map((id) => {
                          const c = candidatesById.get(id);
                          return (
                            <div key={id} className="rounded border border-border bg-muted/20 p-2 flex items-center gap-2 text-xs">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{c?.name ?? `#${id}`}</div>
                                <div className="text-muted-foreground truncate">
                                  #{id} · {c?.phone ?? "-"} · {c?.email ?? "-"} · {c?.office ?? "-"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {d.ids.length === 2 && (
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => setPair(d.ids[0], d.ids[1])}>
                            #{d.ids[0]} → #{d.ids[1]}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPair(d.ids[1], d.ids[0])}>
                            #{d.ids[1]} → #{d.ids[0]}
                          </Button>
                        </div>
                      )}
                      {d.ids.length > 2 && (
                        <p className="text-[10px] text-muted-foreground mt-2 italic">
                          3+ kayıt — Manuel sekmesinden ikişer ikişer birleştir
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Manuel Merge */}
        {tab === "manual" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Kaynak → Hedef Seç</CardTitle>
                <p className="text-xs text-muted-foreground">
                  <b>Kaynak</b> silinecek olan · <b>Hedef</b> kalıcı olan (ana kayıt)
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
                <div>
                  <Label className="text-xs">Kaynak Danışman ID</Label>
                  <Input value={sourceId} onChange={e => { setSourceId(e.target.value); setPreview(null); }} placeholder="ör: 1234" />
                  {sourceId && candidatesById.get(Number(sourceId)) && (
                    <p className="text-xs text-muted-foreground mt-1">{candidatesById.get(Number(sourceId))!.name}</p>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground mb-2 hidden md:block" />
                <div>
                  <Label className="text-xs">Hedef Danışman ID</Label>
                  <Input value={targetId} onChange={e => { setTargetId(e.target.value); setPreview(null); }} placeholder="ör: 5678" />
                  {targetId && candidatesById.get(Number(targetId)) && (
                    <p className="text-xs text-muted-foreground mt-1">{candidatesById.get(Number(targetId))!.name}</p>
                  )}
                </div>
                <Button
                  onClick={() => previewMutation.mutate()}
                  disabled={!sourceId || !targetId || sourceId === targetId || previewMutation.isPending}
                >
                  Önizle
                </Button>
              </CardContent>
            </Card>

            {preview && (
              <Card className="border-primary/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Önizleme</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded border border-red-300 bg-red-50/40 p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">🗑 Kaynak (silinecek)</p>
                      <p className="font-medium">{preview.source.name}</p>
                      <p className="text-xs text-muted-foreground">
                        #{preview.source.id} · {preview.source.phone ?? "-"} · {preview.source.email ?? "-"}
                      </p>
                      <p className="text-xs mt-1">
                        <b>{preview.sourceEmployees}</b> danışman kaydı
                      </p>
                    </div>
                    <div className="rounded border border-emerald-300 bg-emerald-50/40 p-3">
                      <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Hedef (kalıcı)</p>
                      <p className="font-medium">{preview.target.name}</p>
                      <p className="text-xs text-muted-foreground">
                        #{preview.target.id} · {preview.target.phone ?? "-"} · {preview.target.email ?? "-"}
                      </p>
                      <p className="text-xs mt-1">
                        Danışman kaydı: {preview.targetHasEmployee ? "var" : "yok"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-2">Taşınacak İlişkiler</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(preview.counts).map(([tbl, count]) => (
                        <div key={tbl} className="rounded border border-border bg-muted/20 px-3 py-1.5 text-xs flex items-center justify-between">
                          <span>{tbl.replace("emp:", "")}</span>
                          <span className="font-semibold">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button variant="outline" onClick={() => setPreview(null)}>İptal</Button>
                    <Button
                      onClick={() => { if (confirm(`${preview.source.name} silinecek. Onaylıyor musunuz?`)) mergeMutation.mutate(); }}
                      disabled={mergeMutation.isPending}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {mergeMutation.isPending ? "Birleştiriliyor..." : "Birleştir"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Merge Geçmişi */}
        {tab === "history" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Son Merge İşlemleri</CardTitle>
              <p className="text-xs text-muted-foreground">Son 100 işlem · geri alınabilir</p>
            </CardHeader>
            <CardContent className="p-0">
              {mergeLog.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">Henüz merge yapılmadı</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Kaynak</TableHead>
                      <TableHead>Hedef</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mergeLog.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">#{log.id}</TableCell>
                        <TableCell className="text-xs">{new Date(log.performed_at).toLocaleString("tr-TR")}</TableCell>
                        <TableCell className="text-xs">#{log.source_id}</TableCell>
                        <TableCell className="text-xs">#{log.target_id}</TableCell>
                        <TableCell>
                          {log.undone_at ? (
                            <span className="text-xs text-muted-foreground">Geri alındı</span>
                          ) : (
                            <span className="text-xs text-emerald-700 font-medium">Aktif</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!log.undone_at && (
                            <Button
                              size="sm" variant="outline"
                              onClick={() => { if (confirm(`Merge #${log.id} geri alınsın mı?`)) undoMutation.mutate(log.id); }}
                              className="text-xs h-7"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Geri Al
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
