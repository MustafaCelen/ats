import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { User, ChevronDown, Check, Wallet, CalendarClock, Target, Award, Timer, PieChartIcon, MessageSquare, Send, Trash2, CalendarPlus, CalendarCheck, Plus } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useEmployees } from "@/hooks/use-employees";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import {
  useAdvisorBhbTargets, useUpsertAdvisorBhbTarget,
  useAdvisorNotes, useCreateAdvisorNote, useDeleteAdvisorNote,
  useAdvisorAppointments, useCreateAdvisorAppointment, useUpdateAdvisorAppointmentStatus,
  useDeleteAdvisorAppointment, useSyncAdvisorAppointmentCalendar,
} from "@/hooks/use-advisor-scorecard";
import type { AdvisorAppointment } from "@shared/schema";

function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}
function fmtPct(n: number) {
  return `%${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDays(n: number | null) {
  return n == null ? "—" : `${n.toLocaleString("tr-TR")} gün`;
}

type MonthBucket = { total: number; months: number[] };
interface PersonalScorecardData {
  employeeId: number; employeeName: string; kwuid: string;
  ukStartDate: string | null;
  cap: { capAmount: number | null; capUsed: number; capRemaining: number | null; periodStart: string; capYear: number; isCapper: boolean };
  years: number[];
  bhbByYear: Record<number, MonthBucket>;
  islemByYear: { toplam: Record<number, MonthBucket>; satilik: Record<number, MonthBucket>; kiralik: Record<number, MonthBucket> };
  sozlesmeByYear: Record<number, MonthBucket>;
  satilikStatsByYear: Record<number, { avgCommissionRate: number; totalVolume: number }>;
  portfolio: {
    satilik: { activeCount: number; activeVolume: number; lastDate: string | null; daysSinceLast: number | null };
    kiralik: { activeCount: number; activeVolume: number; lastDate: string | null; daysSinceLast: number | null };
  };
  donusSuresi: { satilikAvgDays: number | null; kiralikAvgDays: number | null };
}

function useAdvisorPersonalScorecard(employeeId: number | null) {
  return useQuery<PersonalScorecardData>({
    queryKey: [`/api/employees/${employeeId}/personal-scorecard`],
    queryFn: async () => {
      const r = await fetch(`/api/employees/${employeeId}/personal-scorecard`, { credentials: "include" });
      if (!r.ok) throw new Error("Karne yüklenemedi");
      return r.json();
    },
    enabled: employeeId != null,
  });
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-lg font-bold truncate">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function AdvisorPicker({ employeeId, onChange }: { employeeId: number | null; onChange: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const { data: employees = [] } = useEmployees();
  const active = (employees as any[]).filter((e) => e.status === "active");
  const selected = (employees as any[]).find((e) => e.id === employeeId);
  const label = selected ? `${selected.candidate?.name ?? `#${selected.id}`}${selected.candidate?.office ? ` — ${selected.candidate.office}` : ""}` : "Danışman seçin…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[260px] justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Danışman ara…" className="text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs">Danışman bulunamadı.</CommandEmpty>
            <CommandGroup>
              {active.map((e: any) => (
                <CommandItem
                  key={e.id}
                  value={`${e.candidate?.name ?? ""} ${e.kwuid ?? ""}`}
                  onSelect={() => { onChange(e.id); setOpen(false); }}
                  className="text-xs cursor-pointer"
                >
                  <Check className={`h-3.5 w-3.5 ${employeeId === e.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{e.candidate?.name ?? `#${e.id}`}</span>
                  {e.candidate?.office && <span className="ml-auto text-muted-foreground">{e.candidate.office}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const MONTH_LABELS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function MonthTable({ title, years, byYear, format }: {
  title: string; years: number[]; byYear: Record<number, MonthBucket>; format: (n: number) => string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium"></th>
              {years.map((y) => <th key={y} className="text-right px-3 py-2 font-medium">{y}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="font-semibold bg-muted/20">
              <td className="px-3 py-1.5">Toplam</td>
              {years.map((y) => <td key={y} className="text-right px-3 py-1.5 font-mono">{format(byYear[y]?.total ?? 0)}</td>)}
            </tr>
            {MONTH_LABELS.map((label, i) => (
              <tr key={label}>
                <td className="px-3 py-1.5">{label}</td>
                {years.map((y) => (
                  <td key={y} className="text-right px-3 py-1.5 font-mono">{format(byYear[y]?.months?.[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PortfolioCategoryBlock({ title, stat }: {
  title: string;
  stat: { activeCount: number; activeVolume: number; lastDate: string | null; daysSinceLast: number | null };
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">Aktif Portföy Adedi</p>
          <p className="text-base font-bold">{stat.activeCount.toLocaleString("tr-TR")}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Aktif Portföy Hacmi</p>
          <p className="text-base font-bold">{fmtTRY(stat.activeVolume)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Son Portföy Tarihi</p>
          <p className="text-base font-bold">{fmtDate(stat.lastDate)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Kaç Gündür Portföy Almıyor</p>
          <p className="text-base font-bold">{fmtDays(stat.daysSinceLast)}</p>
        </div>
      </div>
    </div>
  );
}

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});
const toTurkeyISO = (d: string, t: string) => (d && t ? `${d}T${t}:00+03:00` : "");

function currentQuarter(month: number) {
  return Math.floor(month / 3) + 1;
}

// ── Hedef & Gerçekleşen (Pie Chart) ─────────────────────────────────────────────

function BhbTargetSection({ employeeId, data }: { employeeId: number; data: PersonalScorecardData }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter(now.getMonth()));
  const [targetInput, setTargetInput] = useState("");

  const { data: targets = [] } = useAdvisorBhbTargets(employeeId);
  const { mutate: upsertTarget, isPending: isSaving } = useUpsertAdvisorBhbTarget(employeeId);

  const currentTarget = targets.find((t) => t.year === year && t.quarter === quarter);
  const targetValue = targetInput !== "" ? Number(targetInput) || 0 : Number(currentTarget?.bhbTarget ?? 0);

  const realized = useMemo(() => {
    const months = data.bhbByYear[year]?.months ?? [];
    const startMonth = (quarter - 1) * 3;
    return months.slice(startMonth, startMonth + 3).reduce((sum, v) => sum + (v ?? 0), 0);
  }, [data.bhbByYear, year, quarter]);

  const remaining = Math.max(targetValue - realized, 0);
  const pieData = [
    { name: "Gerçekleşen", value: realized, color: "#10b981" },
    { name: "Kalan", value: remaining || (targetValue === 0 ? 1 : 0), color: "#e5e7eb" },
  ];
  const pct = targetValue > 0 ? Math.min(Math.round((realized / targetValue) * 100), 999) : null;

  const handleSave = () => {
    upsertTarget({ year, quarter, bhbTarget: targetValue }, { onSuccess: () => setTargetInput("") });
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-1.5">
        <PieChartIcon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">BHB Hedefi (Çeyreklik)</h3>
      </div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {data.years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Hedef BHB (₺)"
              value={targetInput !== "" ? targetInput : (currentTarget?.bhbTarget ?? "")}
              onChange={(e) => setTargetInput(e.target.value)}
              className="max-w-[180px]"
            />
            <Button size="sm" onClick={handleSave} disabled={isSaving}>{isSaving ? "Kaydediliyor…" : "Kaydet"}</Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1 pt-1">
            <p>Gerçekleşen: <span className="font-semibold text-foreground">{fmtTRY(realized)}</span></p>
            <p>Hedef: <span className="font-semibold text-foreground">{fmtTRY(targetValue)}</span></p>
            {pct != null && <p>Gerçekleşme oranı: <span className="font-semibold text-foreground">%{pct}</span></p>}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                formatter={(v: number) => [fmtTRY(v), ""]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-xs">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="font-medium">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Notlar ───────────────────────────────────────────────────────────────────────

function AdvisorNotesSection({ employeeId }: { employeeId: number }) {
  const [noteText, setNoteText] = useState("");
  const { data: notes = [] } = useAdvisorNotes(employeeId);
  const { mutate: createNote, isPending: isNoting } = useCreateAdvisorNote(employeeId);
  const { mutate: deleteNote } = useDeleteAdvisorNote(employeeId);

  const handleAdd = () => {
    if (!noteText.trim()) return;
    createNote(noteText.trim(), { onSuccess: () => setNoteText("") });
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Notlar</h3>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Bu danışman hakkında not ekleyin…"
            rows={3}
            className="mb-2"
          />
          <Button size="sm" onClick={handleAdd} disabled={isNoting || !noteText.trim()}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {isNoting ? "Ekleniyor…" : "Not Ekle"}
          </Button>
        </div>

        {!notes.length ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Henüz not yok.</div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{note.authorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {note.createdAt ? formatDistanceToNow(new Date(note.createdAt), { addSuffix: true }) : ""}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                    onClick={() => deleteNote(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Randevular ───────────────────────────────────────────────────────────────────

const APPT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Planlandı", color: "bg-blue-100 text-blue-700 border-blue-200" },
  completed: { label: "Tamamlandı", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "İptal Edildi", color: "bg-red-100 text-red-700 border-red-200" },
};

function NewAppointmentDialog({ open, onOpenChange, employeeId }: { open: boolean; onOpenChange: (v: boolean) => void; employeeId: number }) {
  const [title, setTitle] = useState("Görüşme");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const { mutate: createAppointment, isPending } = useCreateAdvisorAppointment(employeeId);

  const reset = () => { setTitle("Görüşme"); setDate(""); setStartTime(""); setEndTime(""); setLocation(""); setNotes(""); };

  const handleSubmit = () => {
    if (!date || !startTime || !endTime) return;
    createAppointment(
      { title, startTime: toTurkeyISO(date, startTime), endTime: toTurkeyISO(date, endTime), location, notes },
      { onSuccess: () => { reset(); onOpenChange(false); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Yeni Randevu</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger><SelectValue placeholder="Başlangıç" /></SelectTrigger>
              <SelectContent>{TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={endTime} onValueChange={setEndTime}>
              <SelectTrigger><SelectValue placeholder="Bitiş" /></SelectTrigger>
              <SelectContent>{TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input placeholder="Konum (opsiyonel)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Textarea placeholder="Not (opsiyonel)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <Button className="w-full" onClick={handleSubmit} disabled={isPending || !date || !startTime || !endTime}>
            {isPending ? "Oluşturuluyor…" : "Randevu Oluştur"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentRow({ appointment, employeeId }: { appointment: AdvisorAppointment; employeeId: number }) {
  const { data: authUser } = useAuth();
  const { mutate: updateStatus } = useUpdateAdvisorAppointmentStatus(employeeId);
  const { mutate: deleteAppointment } = useDeleteAdvisorAppointment(employeeId);
  const { mutate: syncCalendar, isPending: isSyncing } = useSyncAdvisorAppointmentCalendar(employeeId);
  const status = APPT_STATUS_CONFIG[appointment.status] ?? APPT_STATUS_CONFIG.scheduled;
  const start = new Date(appointment.startTime);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{appointment.title}</span>
          <Badge variant="outline" className={`text-[10px] ${status.color}`}>{status.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {start.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })} · {start.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          {appointment.location ? ` · ${appointment.location}` : ""}
        </p>
        {appointment.notes && <p className="text-xs text-muted-foreground mt-1">{appointment.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {appointment.status === "scheduled" && authUser?.hasGoogleCalendar && (
          <Button
            size="sm" variant="ghost" className="h-7 px-2 text-xs"
            disabled={isSyncing || !!appointment.calendarEventId}
            onClick={() => syncCalendar(appointment.id)}
          >
            {appointment.calendarEventId
              ? <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />
              : <CalendarPlus className="h-3.5 w-3.5" />}
          </Button>
        )}
        {appointment.status === "scheduled" && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => updateStatus({ id: appointment.id, status: "completed" })}>
            Tamamlandı
          </Button>
        )}
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
          onClick={() => deleteAppointment(appointment.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function GoogleCalendarBanner() {
  const { data: authUser } = useAuth();
  if (!authUser) return null;

  const connect = async () => {
    const res = await fetch("/api/auth/google?link=1");
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url;
  };

  if (authUser.hasGoogleCalendar) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">Google Takvim bağlı</span>
          <span className="text-emerald-600">— randevuları takvime ekleyebilirsiniz</span>
        </div>
        <button className="text-xs text-emerald-600 underline underline-offset-2 hover:text-emerald-800 shrink-0" onClick={connect}>
          Yeniden bağla
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 mb-3">
      <div className="flex items-center gap-2">
        <SiGoogle className="h-4 w-4 text-[#4285F4] shrink-0" />
        <p className="text-xs text-blue-800 font-medium">Google Takvim'i bağlayarak randevuları otomatik ekleyin</p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100 h-7 text-xs" onClick={connect}>
        Bağla
      </Button>
    </div>
  );
}

function AdvisorAppointmentsSection({ employeeId }: { employeeId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: appointments = [] } = useAdvisorAppointments(employeeId);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Randevular</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Yeni Randevu
        </Button>
      </div>
      <div className="p-4 space-y-2">
        <GoogleCalendarBanner />
        {!appointments.length ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Henüz randevu yok.</div>
        ) : (
          appointments.map((a) => <AppointmentRow key={a.id} appointment={a} employeeId={employeeId} />)
        )}
      </div>
      <NewAppointmentDialog open={dialogOpen} onOpenChange={setDialogOpen} employeeId={employeeId} />
    </div>
  );
}

export default function AdvisorPersonalScorecard() {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const { data, isLoading } = useAdvisorPersonalScorecard(employeeId);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <User className="h-6 w-6 text-primary" />
              Danışman Karnesi
              {data?.cap.isCapper && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-300">
                  CAPPER
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tek bir danışmanın Cap durumu, aylık BHB/işlem geçmişi ve portföyü
            </p>
          </div>
          <AdvisorPicker employeeId={employeeId} onChange={setEmployeeId} />
        </div>

        {!employeeId && (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Başlamak için yukarıdan bir danışman seçin.
          </div>
        )}

        {employeeId && isLoading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Yükleniyor…</div>
        )}

        {employeeId && !isLoading && data && (
          <>
            {/* ── Cap + ÜK ── */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <StatTile
                icon={<Wallet className="h-4.5 w-4.5" />}
                label="Cap'e Kalan Tutar"
                value={data.cap.capRemaining != null ? fmtTRY(data.cap.capRemaining) : "—"}
                sub={data.cap.capAmount != null ? `Cap: ${fmtTRY(data.cap.capAmount)} · Kullanılan: ${fmtTRY(data.cap.capUsed)}` : undefined}
              />
              <StatTile icon={<CalendarClock className="h-4.5 w-4.5" />} label="CAP Yıldönümü" value={fmtDate(data.cap.periodStart)} />
              <StatTile icon={<Target className="h-4.5 w-4.5" />} label="CAP Tutarı" value={data.cap.capAmount != null ? fmtTRY(data.cap.capAmount) : "—"} />
              <StatTile icon={<Award className="h-4.5 w-4.5" />} label="ÜK Giriş Tarihi" value={data.ukStartDate ? fmtDate(data.ukStartDate) : "—"} />
            </div>

            {/* ── BHB Hedefi & Gerçekleşen (Pie Chart) ── */}
            <BhbTargetSection employeeId={employeeId} data={data} />

            {/* ── BHB aylık ── */}
            <MonthTable title="BHB" years={data.years} byYear={data.bhbByYear} format={fmtTRY} />

            {/* ── İşlem adedi aylık: Toplam / Satılık / Kiralık ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <MonthTable title="Toplam İşlem" years={data.years} byYear={data.islemByYear.toplam} format={(n) => n.toLocaleString("tr-TR")} />
              <MonthTable title="Satılık İşlem" years={data.years} byYear={data.islemByYear.satilik} format={(n) => n.toLocaleString("tr-TR")} />
              <MonthTable title="Kiralık İşlem" years={data.years} byYear={data.islemByYear.kiralik} format={(n) => n.toLocaleString("tr-TR")} />
            </div>

            {/* ── Alınan Sözleşme Sayıları (aylık, portföye eklenen yeni ilan) ── */}
            <MonthTable title="Alınan Sözleşme Sayıları" years={data.years} byYear={data.sozlesmeByYear} format={(n) => n.toLocaleString("tr-TR")} />

            {/* ── Yıllık satılık özet ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border">
                <h3 className="text-sm font-semibold">Yıllık Satılık Özeti</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium"></th>
                      {data.years.map((y) => <th key={y} className="text-right px-3 py-2 font-medium">{y}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="px-3 py-1.5">Ortalama Satılık BHB Oranı</td>
                      {data.years.map((y) => (
                        <td key={y} className="text-right px-3 py-1.5 font-mono">{fmtPct(data.satilikStatsByYear[y]?.avgCommissionRate ?? 0)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5">Toplam Satılık Hacmi</td>
                      {data.years.map((y) => (
                        <td key={y} className="text-right px-3 py-1.5 font-mono">{fmtTRY(data.satilikStatsByYear[y]?.totalVolume ?? 0)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── İşleme Dönme Süresi ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatTile icon={<Timer className="h-4.5 w-4.5" />} label="Satılık İşleme Dönme Süresi" value={fmtDays(data.donusSuresi.satilikAvgDays)} />
              <StatTile icon={<Timer className="h-4.5 w-4.5" />} label="Kiralık İşleme Dönme Süresi" value={fmtDays(data.donusSuresi.kiralikAvgDays)} />
            </div>

            {/* ── Portföy: Satılık / Kiralık ayrı ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PortfolioCategoryBlock title="Aktif Satılık Portföy" stat={data.portfolio.satilik} />
              <PortfolioCategoryBlock title="Aktif Kiralık Portföy" stat={data.portfolio.kiralik} />
            </div>

            {/* ── Notlar ── */}
            <AdvisorNotesSection employeeId={employeeId} />

            {/* ── Randevular ── */}
            <AdvisorAppointmentsSection employeeId={employeeId} />
          </>
        )}
      </div>
    </Layout>
  );
}
