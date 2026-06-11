import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart2, Building2, Users, TrendingDown, TrendingUp, Bell, RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdvisorReport {
  employeeId: number | null;
  advisorName: string | null;
  employeeName: string | null;
  totalActive: number;
  totalPassive: number;
  agreementUploaded: number;
  agreementPending: number;
  closeReasonSubmitted: number;
  closeReasonPending: number;
}

interface OfficeReport {
  office: string | null;
  totalActive: number;
  totalPassive: number;
  agreementUploaded: number;
  closeReasonSubmitted: number;
}

interface CloseReasonStat {
  closeReason: string;
  count: number;
}

interface MonthlyTrend {
  month: string;
  newActive: number;
  newPassive: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const m = parseInt(month, 10);
  return `${monthNames[m - 1] ?? month} ${year}`;
}

function SectionCard({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ListingReports() {
  const { toast } = useToast();
  const [agreementDays, setAgreementDays] = useState(3);
  const [closeReasonDays, setCloseReasonDays] = useState(3);
  const [runningReminders, setRunningReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ agreementQueued: number; closeReasonQueued: number } | null>(null);

  const { data: advisorData = [], isLoading: loadingAdvisor } = useQuery<AdvisorReport[]>({
    queryKey: ["/api/listings/reports/advisor"],
    queryFn: () => fetch("/api/listings/reports/advisor", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: officeData = [], isLoading: loadingOffice } = useQuery<OfficeReport[]>({
    queryKey: ["/api/listings/reports/office"],
    queryFn: () => fetch("/api/listings/reports/office", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: closeReasonData = [], isLoading: loadingCloseReason } = useQuery<CloseReasonStat[]>({
    queryKey: ["/api/listings/reports/close-reasons"],
    queryFn: () => fetch("/api/listings/reports/close-reasons", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: trendData = [], isLoading: loadingTrend } = useQuery<MonthlyTrend[]>({
    queryKey: ["/api/listings/reports/monthly-trend"],
    queryFn: () => fetch("/api/listings/reports/monthly-trend", { credentials: "include" }).then((r) => r.json()),
  });

  const totalCloseReasons = closeReasonData.reduce((s, r) => s + r.count, 0);

  const handleRunReminders = async () => {
    setRunningReminders(true);
    setReminderResult(null);
    try {
      const res = await fetch("/api/listings/reminders/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agreementDays, closeReasonDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Hata", description: data.message, variant: "destructive" });
        return;
      }
      setReminderResult(data);
      toast({
        title: "Hatırlatmalar gönderiliyor",
        description: `Sözleşme: ${data.agreementQueued}, Kalkış sebebi: ${data.closeReasonQueued} ilan`,
      });
    } catch {
      toast({ title: "Hata", description: "İstek gönderilemedi.", variant: "destructive" });
    } finally {
      setRunningReminders(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            İlan Raporları
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Danışman, ofis ve kalkış sebebi bazlı detaylı ilan analizleri
          </p>
        </div>

        {/* Feature 1: Danışman bazlı rapor */}
        <SectionCard title="Danışman Bazlı Rapor" icon={Users}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Danışman</th>
                <th className="px-3 py-2.5 font-medium text-right">Aktif</th>
                <th className="px-3 py-2.5 font-medium text-right">Pasif</th>
                <th className="px-3 py-2.5 font-medium text-right">Söz. Yüklendi</th>
                <th className="px-3 py-2.5 font-medium text-right">Söz. Bekleyen</th>
                <th className="px-3 py-2.5 font-medium text-right">Sebep Girildi</th>
                <th className="px-3 py-2.5 font-medium text-right">Sebep Bekleyen</th>
              </tr>
            </thead>
            <tbody>
              {loadingAdvisor ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>
              ) : advisorData.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Veri yok.</td></tr>
              ) : advisorData.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-sm">{r.employeeName ?? r.advisorName ?? "—"}</div>
                    {r.employeeName && r.advisorName && r.employeeName !== r.advisorName && (
                      <div className="text-[11px] text-muted-foreground">{r.advisorName}</div>
                    )}
                    {!r.employeeId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Eşleşmemiş</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{r.totalActive}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{r.totalPassive}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">{r.agreementUploaded}</td>
                  <td className="px-3 py-2.5 text-right text-amber-600">{r.agreementPending}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">{r.closeReasonSubmitted}</td>
                  <td className="px-3 py-2.5 text-right text-violet-600">{r.closeReasonPending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        {/* Feature 2: Ofis bazlı kırılım */}
        <SectionCard title="Ofis Bazlı Kırılım" icon={Building2}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Ofis</th>
                <th className="px-3 py-2.5 font-medium text-right">Aktif</th>
                <th className="px-3 py-2.5 font-medium text-right">Pasif</th>
                <th className="px-3 py-2.5 font-medium text-right">Söz. Yüklendi</th>
                <th className="px-3 py-2.5 font-medium text-right">Sebep Girildi</th>
              </tr>
            </thead>
            <tbody>
              {loadingOffice ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>
              ) : officeData.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Veri yok.</td></tr>
              ) : officeData.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium">{r.office ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{r.totalActive}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{r.totalPassive}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">{r.agreementUploaded}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">{r.closeReasonSubmitted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        {/* Feature 3: Kalkış sebebi analizi */}
        <SectionCard title="Kalkış Sebebi Analizi" icon={TrendingDown}>
          {loadingCloseReason ? (
            <div className="px-4 py-8 text-center text-muted-foreground">Yükleniyor…</div>
          ) : closeReasonData.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">Henüz kalkış sebebi girilmemiş.</div>
          ) : (
            <div className="p-4 space-y-3">
              {closeReasonData.map((r, i) => {
                const pct = totalCloseReasons > 0 ? Math.round((r.count / totalCloseReasons) * 100) : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{r.closeReason}</span>
                      <span className="text-muted-foreground">{r.count} <span className="text-xs">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-1 text-xs text-muted-foreground">
                Toplam: {totalCloseReasons} kalkış
              </div>
            </div>
          )}
        </SectionCard>

        {/* Feature 4: Aylık trend */}
        <SectionCard title="Aylık Trend (Son 12 Ay)" icon={TrendingUp}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Ay</th>
                <th className="px-3 py-2.5 font-medium text-right">Yeni Aktif</th>
                <th className="px-3 py-2.5 font-medium text-right">Yeni Pasif</th>
              </tr>
            </thead>
            <tbody>
              {loadingTrend ? (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>
              ) : trendData.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">Veri yok.</td></tr>
              ) : [...trendData].reverse().map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium">{fmtMonth(r.month)}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">{r.newActive}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{r.newPassive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        {/* Feature 5 & 6: Hatırlatma Ayarları */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Hatırlatma Ayarları</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Belirtilen gün sayısını geçmiş, henüz sözleşme/sebep girilmemiş danışmanlara WhatsApp hatırlatması gönderir.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Sözleşme hatırlatma (gün)</Label>
              <Input
                type="number"
                min={1}
                value={agreementDays}
                onChange={(e) => setAgreementDays(Math.max(1, Number(e.target.value)))}
                className="h-8 text-sm w-32"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kalkış sebebi hatırlatma (gün)</Label>
              <Input
                type="number"
                min={1}
                value={closeReasonDays}
                onChange={(e) => setCloseReasonDays(Math.max(1, Number(e.target.value)))}
                className="h-8 text-sm w-32"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={runningReminders}
              onClick={handleRunReminders}
            >
              {runningReminders
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Bell className="h-3.5 w-3.5" />}
              Hatırlatmaları Çalıştır
            </Button>
            {reminderResult && (
              <span className="text-xs text-muted-foreground">
                Sözleşme kuyruğu: <b className="text-foreground">{reminderResult.agreementQueued}</b>,
                &nbsp;Kalkış sebebi kuyruğu: <b className="text-foreground">{reminderResult.closeReasonQueued}</b>
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Not: Sistem her gece otomatik olarak da 3 günlük hatırlatmaları çalıştırır.
          </p>
        </div>
      </div>
    </Layout>
  );
}
