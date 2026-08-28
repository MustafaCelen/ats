import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, AlertTriangle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DuplicateGroup {
  propertyAddress: string;
  closingDate: string | null;
  saleValue: string;
  keepId: number;
  deleteIds: number[];
  agentNames: string[];
}

function fmtTRY(v: string) {
  const n = parseFloat(v || "0");
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}
function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("tr-TR");
}

export default function DuplicateClosings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cleaning, setCleaning] = useState(false);

  const { data: groups = [], isLoading } = useQuery<DuplicateGroup[]>({
    queryKey: ["/api/closings/duplicates"],
    queryFn: async () => {
      const r = await fetch("/api/closings/duplicates", { credentials: "include" });
      if (!r.ok) throw new Error("Yüklenemedi");
      return r.json();
    },
  });

  const totalExtra = groups.reduce((s, g) => s + g.deleteIds.length, 0);
  const totalExtraVolume = groups.reduce((s, g) => s + parseFloat(g.saleValue || "0") * g.deleteIds.length, 0);

  const cleanupMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const r = await fetch("/api/closings/duplicates/cleanup", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) throw new Error("Temizleme başarısız");
      return r.json() as Promise<{ deleted: number; skipped: number }>;
    },
    onSuccess: (res) => {
      toast({ title: `${res.deleted} fazladan kapanış silindi`, description: res.skipped > 0 ? `${res.skipped} kayıt bu sırada değişmiş olduğu için atlandı.` : undefined });
      qc.invalidateQueries({ queryKey: ["/api/closings/duplicates"] });
      qc.invalidateQueries({ queryKey: ["/api/closings"] });
      setCleaning(false);
    },
    onError: () => {
      toast({ title: "Temizleme başarısız", variant: "destructive" });
      setCleaning(false);
    },
  });

  const handleCleanupAll = () => {
    const allDeleteIds = groups.flatMap((g) => g.deleteIds);
    if (allDeleteIds.length === 0) return;
    const ok = confirm(
      `${groups.length} grupta toplam ${allDeleteIds.length} fazladan kapanış kalıcı olarak silinecek ` +
      `(her grupta en yeni kayıt tutulacak, eskiler silinecek). Bu işlem geri alınamaz. Devam edilsin mi?`
    );
    if (!ok) return;
    setCleaning(true);
    cleanupMutation.mutate(allDeleteIds);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Copy className="h-6 w-6 text-primary" />
              Duplike Kapanışlar
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Aynı adres + tarih + bedelle tekrar tekrar import edilmiş kapanışlar — muhtemelen aynı CSV'nin birden fazla kez yüklenmesinden.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Yükleniyor…</div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Duplike kapanış bulunamadı.
          </div>
        )}

        {!isLoading && groups.length > 0 && (
          <>
            <Card className="border-amber-300 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="h-4.5 w-4.5" />
                  {groups.length} duplike grup, {totalExtra} fazladan kapanış
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <p className="text-sm text-amber-800">
                  Bu fazladan kapanışlar toplam <strong>{fmtTRY(String(totalExtraVolume))}</strong> yanlış İşlem Hacmi olarak
                  raporlara yansıyor (BHB, cap, ÜK geliri dahil her yerde). Her grupta en yeni kayıt tutulacak, diğerleri silinecek.
                </p>
                <Button variant="destructive" className="gap-1.5 shrink-0" onClick={handleCleanupAll} disabled={cleaning}>
                  <Trash2 className="h-4 w-4" /> {cleaning ? "Siliniyor…" : "Tümünü Temizle"}
                </Button>
              </CardContent>
            </Card>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adres</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="text-right">Bedel</TableHead>
                    <TableHead>Danışman</TableHead>
                    <TableHead className="text-center">Kaç Kez</TableHead>
                    <TableHead className="text-center">Tutulacak ID</TableHead>
                    <TableHead>Silinecek ID'ler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <TableRow key={`${g.propertyAddress}-${g.closingDate}-${g.saleValue}`}>
                      <TableCell className="max-w-[220px] truncate" title={g.propertyAddress}>{g.propertyAddress}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(g.closingDate)}</TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">{fmtTRY(g.saleValue)}</TableCell>
                      <TableCell className="max-w-[160px] truncate" title={g.agentNames.join(", ")}>{g.agentNames.join(", ") || "—"}</TableCell>
                      <TableCell className="text-center">{g.deleteIds.length + 1}</TableCell>
                      <TableCell className="text-center font-mono text-emerald-700">#{g.keepId}</TableCell>
                      <TableCell className="font-mono text-red-600">{g.deleteIds.map((id) => `#${id}`).join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
