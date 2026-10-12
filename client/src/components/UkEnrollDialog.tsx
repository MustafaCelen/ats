import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmployeePicker } from "@/components/EmployeePicker";
import { useToast } from "@/hooks/use-toast";
import { Info, Loader2 } from "lucide-react";
import { sendUkWelcomeEmail } from "@/components/UkWelcomeEmailDialog";
import { UkMondaySelect, nextMondayYmd } from "@/components/UkMondaySelect";

// 45+45 Başarı Rotası'na manuel danışman ekleme (tüm personel). Koç her zaman danışman
// profilindeki ÜK koçudur; koçu olmayan danışman listelenmez ve eklenemez. ÜK işaretine ve
// ÜK payına dokunmaz; katılım uk_program_enrollments'ta tutulur (bkz. server/uk-program.ts).
export function UkEnrollDialog({
  open, onOpenChange, excludeIds, onEnrolled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  excludeIds: number[];
  onEnrolled: (employeeId: number) => void;
}) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(() => nextMondayYmd());
  const [saving, setSaving] = useState(false);
  const [sendWelcome, setSendWelcome] = useState(true);

  // Liste beklenirken sunucu hata döndürürse pencere çökmesin; hata mesajı gösterilsin.
  const fetchList = async (url: string) => {
    const r = await fetch(url, { credentials: "include" });
    const d = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(d)) throw new Error(`${url}: ${d?.message ?? d?.error ?? `HTTP ${r.status}`}`);
    return d;
  };
  const empQ = useQuery<any[]>({ queryKey: ["/api/employees"], queryFn: () => fetchList("/api/employees"), enabled: open });
  const coachQ = useQuery<{ id: number; name: string }[]>({ queryKey: ["/api/hiring-managers"], queryFn: () => fetchList("/api/hiring-managers"), enabled: open });
  const employees = Array.isArray(empQ.data) ? empQ.data : [];
  const coaches = Array.isArray(coachQ.data) ? coachQ.data : [];
  const loadError = (empQ.error ?? coachQ.error) as Error | null;

  // Koç = danışman profilindeki ÜK koçu (salt bilgi; değişiklik danışman profilinden).
  const selectedEmp = employeeId != null ? employees.find((e) => e.id === employeeId) : null;
  const profileCoachId: number | null = selectedEmp?.uretkenlikKocluguManagerId ?? null;
  const profileCoachName = profileCoachId != null ? coaches.find((c) => c.id === profileCoachId)?.name ?? `#${profileCoachId}` : null;
  const kocsuzSayisi = employees.filter((e) => e.status === "active" && !e.uretkenlikKocluguManagerId && !excludeIds.includes(e.id)).length;

  // Yalnız profilinde ÜK koçu olan aktif danışmanlar listelenir.
  const options = useMemo(() => {
    const ex = new Set(excludeIds);
    return employees
      .filter((e) => e.status === "active" && !ex.has(e.id) && !!e.uretkenlikKocluguManagerId)
      .map((e) => ({ id: e.id, name: e.candidate?.name ?? `Çalışan #${e.id}`, kwuid: e.kwuid }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [employees, excludeIds]);

  const submit = async () => {
    if (!employeeId) return;
    setSaving(true);
    try {
      const r = await fetch("/api/uk-program/enrollments", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, startDate }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Eklenemedi");
      if (sendWelcome) {
        const m = await sendUkWelcomeEmail(employeeId);
        toast({
          title: m.ok ? "Danışman eklendi, hoş geldin maili gönderildi" : "Danışman eklendi, mail gönderilemedi",
          description: m.ok ? m.message : `${m.message} Rota sayfasından tekrar gönderebilirsiniz.`,
          variant: m.ok ? undefined : "destructive",
        });
      } else {
        toast({ title: "Danışman programa eklendi", description: "Hoş geldin maili rota sayfasından gönderilebilir." });
      }
      onOpenChange(false);
      setEmployeeId(null);
      onEnrolled(employeeId);
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>45+45 Başarı Rotası'na Danışman Ekle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Danışman</label>
            <EmployeePicker employees={options} value={employeeId} onChange={setEmployeeId} placeholder={empQ.isLoading ? "Danışmanlar yükleniyor…" : "Aktif danışman seçin…"} />
            {loadError && <p className="text-xs text-red-600">Liste alınamadı — {loadError.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Koç</label>
            <div className="w-full border border-input rounded-md px-3 py-2 text-sm bg-muted/40 min-h-[38px]">
              {profileCoachName ?? <span className="text-muted-foreground">Danışman seçince profilindeki ÜK koçu görünür</span>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Koç danışman profilinden gelir; buradan değiştirilemez.
              {kocsuzSayisi > 0 && ` Profilinde ÜK koçu olmayan ${kocsuzSayisi} aktif danışman listelenmiyor; önce profilden koç atayın.`}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Program başlangıcı</label>
            <UkMondaySelect
              value={startDate}
              onChange={setStartDate}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground">Program her zaman pazartesi başlar; haftalar pazar 23:59'da kapanır.</p>
          </div>
          <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
            <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} />
            Hoş geldin mailini (erişim linkiyle) hemen gönder
          </label>
          <div className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Danışmanın profilindeki Üretkenlik Koçluğu işareti ve ÜK payı değişmez; yalnızca 45+45 programına eklenir.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button className="flex-1 gap-1.5" disabled={!employeeId || !startDate || saving || profileCoachId == null} onClick={submit}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Programa Ekle
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
