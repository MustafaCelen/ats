import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmployeePicker } from "@/components/EmployeePicker";
import { useToast } from "@/hooks/use-toast";
import { Info, Loader2 } from "lucide-react";

// 45+45 Başarı Rotası'na manuel danışman ekleme (admin). ÜK işaretine ve ÜK payına
// dokunmaz; katılım uk_program_enrollments'ta tutulur (bkz. server/uk-program.ts).
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
  const [coachId, setCoachId] = useState<string>("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then((r) => r.json()),
    enabled: open,
  });
  const { data: coaches = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/hiring-managers"],
    queryFn: () => fetch("/api/hiring-managers", { credentials: "include" }).then((r) => r.json()),
    enabled: open,
  });

  const options = useMemo(() => {
    const ex = new Set(excludeIds);
    return employees
      .filter((e) => e.status === "active" && !ex.has(e.id))
      .map((e) => ({ id: e.id, name: e.candidate?.name ?? `Çalışan #${e.id}`, kwuid: e.kwuid }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [employees, excludeIds]);

  const submit = async () => {
    if (!employeeId) return;
    setSaving(true);
    try {
      const r = await fetch("/api/uk-program/enrollments", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, coachUserId: coachId ? Number(coachId) : null, startDate }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Eklenemedi");
      toast({ title: "Danışman programa eklendi" });
      onOpenChange(false);
      setEmployeeId(null);
      setCoachId("");
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
            <EmployeePicker employees={options} value={employeeId} onChange={setEmployeeId} placeholder="Aktif danışman seçin…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Koç</label>
            <select
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Koç atanmasın (yalnızca admin yönetir)</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Program başlangıcı</label>
            <input
              type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground">1. hafta bu tarihin haftasının pazartesi günü başlar.</p>
          </div>
          <div className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Danışmanın profilindeki Üretkenlik Koçluğu işareti ve ÜK payı değişmez; yalnızca 45+45 programına eklenir.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button className="flex-1 gap-1.5" disabled={!employeeId || !startDate || saving} onClick={submit}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Programa Ekle
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
