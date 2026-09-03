import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { User, ChevronDown, Check, Wallet, CalendarClock, Target, Award, Timer, PieChartIcon, MessageSquare, Send, Trash2, CalendarPlus, CalendarCheck, Plus, Eye, EyeOff, Home, Building2 } from "lucide-react";
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
import type { AdvisorAppointment, AdvisorNote } from "@shared/schema";

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
function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type MonthBucket = { total: number; months: number[] };
type PortfolioListing = {
  id: number; listingNumber: string | null; price: string | null; dealCategory: string | null;
  firstSeenAt: string | null; publishedDate: string | null;
  ilce: string | null; mahalle: string | null; emlakTipi: string | null; odaSayisi: string | null; m2Net: string | null;
};
type PortfolioStat = { activeCount: number; activeVolume: number; lastDate: string | null; daysSinceLast: number | null; listings: PortfolioListing[] };
interface PersonalScorecardData {
  employeeId: number; employeeName: string; kwuid: string;
  ukStartDate: string | null;
  coachingType: "uk" | "dua" | "performans" | null;
  cap: {
    capAmount: number | null; capUsed: number; capRemaining: number | null; periodStart: string; capYear: number; isCapper: boolean;
    contractType: string | null; grossBhbRemaining: number | null;
  };
  years: number[];
  bhbByYear: Record<number, MonthBucket>;
  islemByYear: { toplam: Record<number, MonthBucket>; satilik: Record<number, MonthBucket>; kiralik: Record<number, MonthBucket> };
  sozlesmeByYear: Record<number, MonthBucket>;
  satilikStatsByYear: Record<number, { avgCommissionRate: number; totalVolume: number }>;
  portfolio: { satilik: PortfolioStat; kiralik: PortfolioStat };
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

function fmtPrice(p: string | null): string {
  if (!p) return "—";
  return Number(p).toLocaleString("tr-TR") + " ₺";
}

function ListingsTable({ title, listings, isKiralik }: { title: string; listings: PortfolioListing[]; isKiralik: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-1.5">
        {isKiralik ? <Building2 className="h-4 w-4 text-blue-600" /> : <Home className="h-4 w-4 text-emerald-600" />}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">{listings.length} ilan</span>
      </div>
      {!listings.length ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Aktif ilan yok.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">İlan No</th>
                <th className="text-left px-3 py-2 font-medium">Mahalle</th>
                <th className="text-left px-3 py-2 font-medium">Tip / Oda</th>
                <th className="text-right px-3 py-2 font-medium">m²</th>
                <th className="text-right px-3 py-2 font-medium">Fiyat</th>
                <th className="text-right px-3 py-2 font-medium">Yayın Tarihi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listings.map((l) => (
                <tr key={l.id} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-medium">{l.listingNumber ?? `#${l.id}`}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{[l.ilce, l.mahalle].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{[l.emlakTipi, l.odaSayisi].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{l.m2Net ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{fmtPrice(l.price)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{fmtDate(l.publishedDate ?? l.firstSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

// ── Hedef & Gerçekleşen (Pie Chart) — Çeyreklik + Yıllık yan yana ──────────────────

function BhbTargetCard({ employeeId, data, mode }: { employeeId: number; data: PersonalScorecardData; mode: "quarterly" | "annual" }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter(now.getMonth()));
  const [targetInput, setTargetInput] = useState("");

  const effectiveQuarter = mode === "annual" ? 0 : quarter;

  const { data: targets = [] } = useAdvisorBhbTargets(employeeId);
  const { mutate: upsertTarget, isPending: isSaving } = useUpsertAdvisorBhbTarget(employeeId);

  const currentTarget = targets.find((t) => t.year === year && t.quarter === effectiveQuarter);
  const targetValue = targetInput !== "" ? Number(targetInput) || 0 : Number(currentTarget?.bhbTarget ?? 0);

  const realized = useMemo(() => {
    if (mode === "annual") return data.bhbByYear[year]?.total ?? 0;
    const months = data.bhbByYear[year]?.months ?? [];
    const startMonth = (quarter - 1) * 3;
    return months.slice(startMonth, startMonth + 3).reduce((sum, v) => sum + (v ?? 0), 0);
  }, [data.bhbByYear, year, quarter, mode]);

  const remaining = Math.max(targetValue - realized, 0);
  const pieData = [
    { name: "Gerçekleşen", value: realized, color: "#10b981" },
    { name: "Kalan", value: remaining || (targetValue === 0 ? 1 : 0), color: "#e5e7eb" },
  ];
  const pct = targetValue > 0 ? Math.min(Math.round((realized / targetValue) * 100), 999) : null;

  const handleSave = () => {
    upsertTarget({ year, quarter: effectiveQuarter, bhbTarget: targetValue }, { onSuccess: () => setTargetInput("") });
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-1.5">
        <PieChartIcon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">BHB Hedefi ({mode === "annual" ? "Yıllık" : "Çeyreklik"})</h3>
      </div>
      <div className="p-4 grid grid-cols-1 gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {mode === "quarterly" && (
              <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
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
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="value" paddingAngle={3}>
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

function BhbTargetSection({ employeeId, data }: { employeeId: number; data: PersonalScorecardData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <BhbTargetCard employeeId={employeeId} data={data} mode="quarterly" />
      <BhbTargetCard employeeId={employeeId} data={data} mode="annual" />
    </div>
  );
}

// ── Notlar ───────────────────────────────────────────────────────────────────────

function NewNoteDialog({ open, onOpenChange, employeeId }: { open: boolean; onOpenChange: (v: boolean) => void; employeeId: number }) {
  const [meetingDate, setMeetingDate] = useState(todayYMD());
  const [agenda, setAgenda] = useState("");
  const [coachNote, setCoachNote] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [content, setContent] = useState("");
  const { mutate: createNote, isPending } = useCreateAdvisorNote(employeeId);

  const reset = () => { setMeetingDate(todayYMD()); setAgenda(""); setCoachNote(""); setNextStep(""); setContent(""); };

  const handleSubmit = () => {
    if (!agenda.trim() && !coachNote.trim() && !nextStep.trim() && !content.trim()) return;
    createNote(
      { meetingDate: meetingDate || undefined, agenda: agenda || undefined, coachNote: coachNote || undefined, nextStep: nextStep || undefined, content: content || "" },
      { onSuccess: () => { reset(); onOpenChange(false); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Yeni Not</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Görüşme Tarihi</p>
            <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Gündem</p>
            <Input value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="Görüşmenin gündemi…" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Koçun Notu</p>
            <Textarea value={coachNote} onChange={(e) => setCoachNote(e.target.value)} placeholder="Koçun gözlem ve değerlendirmesi…" rows={2} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Sonraki Adım</p>
            <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Bir sonraki adım…" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Not (serbest metin)</p>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Diğer notlar…" rows={2} />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Kaydediliyor…" : "Notu Kaydet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdvisorNotesSection({ employeeId }: { employeeId: number }) {
  const [hidden, setHidden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: notes = [] } = useAdvisorNotes(employeeId);
  const { mutate: deleteNote } = useDeleteAdvisorNote(employeeId);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Notlar</h3>
        <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setHidden((v) => !v)} title={hidden ? "Notları göster" : "Notları gizle (ekran paylaşırken)"}>
            {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          {!hidden && (
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Yeni Not
            </Button>
          )}
        </span>
      </div>
      {hidden ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Notlar gizlendi. Tekrar göstermek için göz ikonuna tıklayın.</div>
      ) : (
        <div className="p-4">
          {!notes.length ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Henüz not yok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Tarih</th>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Görüşme Tarihi</th>
                    <th className="text-left px-3 py-2 font-medium">Gündem</th>
                    <th className="text-left px-3 py-2 font-medium">Koçun Notu</th>
                    <th className="text-left px-3 py-2 font-medium">Sonraki Adım</th>
                    <th className="text-left px-3 py-2 font-medium">Not</th>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Yazar</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(notes as AdvisorNote[]).map((note) => (
                    <tr key={note.id} className="hover:bg-muted/20 align-top">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {note.createdAt ? formatDistanceToNow(new Date(note.createdAt), { addSuffix: true }) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{(note as any).meetingDate ? fmtDate((note as any).meetingDate) : "—"}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate" title={(note as any).agenda ?? ""}>{(note as any).agenda || "—"}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={(note as any).coachNote ?? ""}>{(note as any).coachNote || "—"}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate" title={(note as any).nextStep ?? ""}>{(note as any).nextStep || "—"}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={note.content}>{note.content || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{note.authorName}</td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600" onClick={() => deleteNote(note.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <NewNoteDialog open={dialogOpen} onOpenChange={setDialogOpen} employeeId={employeeId} />
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
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatTile
                icon={<Wallet className="h-4.5 w-4.5" />}
                label="Cap'e Kalan Tutar"
                value={data.cap.capRemaining != null ? fmtTRY(data.cap.capRemaining) : "—"}
                sub={data.cap.capAmount != null ? `Cap: ${fmtTRY(data.cap.capAmount)} · Kullanılan: ${fmtTRY(data.cap.capUsed)}` : undefined}
              />
              <StatTile
                icon={<Wallet className="h-4.5 w-4.5" />}
                label="Cap'e Kalan Brüt BHB"
                value={data.cap.grossBhbRemaining != null ? fmtTRY(data.cap.grossBhbRemaining) : "—"}
                sub={data.cap.contractType ? `Sözleşme: ${data.cap.contractType}` : undefined}
              />
              <StatTile icon={<CalendarClock className="h-4.5 w-4.5" />} label="CAP Yıldönümü" value={fmtDate(data.cap.periodStart)} />
              <StatTile icon={<Target className="h-4.5 w-4.5" />} label="CAP Tutarı" value={data.cap.capAmount != null ? fmtTRY(data.cap.capAmount) : "—"} />
              <StatTile
                icon={<Award className="h-4.5 w-4.5" />}
                label={data.coachingType === "performans" ? "PK Giriş Tarihi" : data.coachingType === "dua" ? "DÜA Giriş Tarihi" : "ÜK Giriş Tarihi"}
                value={data.ukStartDate ? fmtDate(data.ukStartDate) : "—"}
              />
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

            {/* ── Yıllık satılık ve kiralık özet ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border">
                <h3 className="text-sm font-semibold">Yıllık Satılık ve Kiralık Özeti</h3>
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
                    <tr>
                      <td className="px-3 py-1.5">Toplam Kiralık Portföy Hacmi (Güncel)</td>
                      {data.years.map((y, i) => (
                        <td key={y} className="text-right px-3 py-1.5 font-mono">
                          {i === data.years.length - 1 ? fmtTRY(data.portfolio.kiralik.activeVolume) : "—"}
                        </td>
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

            {/* ── Danışmanın Tüm Portföy Listesi ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <ListingsTable title="Satılık İlanlar" listings={data.portfolio.satilik.listings} isKiralik={false} />
              <ListingsTable title="Kiralık İlanlar" listings={data.portfolio.kiralik.listings} isKiralik={true} />
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
