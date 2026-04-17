import { useState, useMemo, useCallback, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Handshake, Plus, Trash2, TrendingUp, DollarSign, Users,
  AlertCircle, CheckCircle2, Settings,
  Download, Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DEAL_TYPES, DEAL_CATEGORIES, type DealCategory, type CapStatus, type ClosingWithDetails } from "@shared/schema";
import { format } from "date-fns";

// ── Formatting ────────────────────────────────────────────────────────────────
function fmtTRY(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + " ₺";
}

/** Safely parse a date string from Postgres (handles both ISO and "YYYY-MM-DD HH:MM:SS" format) */
function safeFormatDate(value: string | Date | null | undefined, fmt: string): string {
  if (!value) return "—";
  const str = typeof value === "string" ? value.replace(" ", "T") : value.toISOString();
  const d = new Date(str);
  if (isNaN(d.getTime())) return "—";
  return format(d, fmt);
}

// ── Business logic calculation ────────────────────────────────────────────────
interface AgentBreakdown {
  bhbShare: number;
  mainBranchShare: number;
  kwtrKdv: number;
  marketCenterDue: number;
  marketCenterActual: number;
  bmKdv: number;
  ukShare: number;
  employeeNet: number;
  capRemaining: number | null; // null = unlimited
  capAmount: number | null;    // null = unlimited
  capUsedAfter: number;
}

// ── Inline editable cell components ──────────────────────────────────────────
function InlineCell({ value, onSave, type = "text", className = "" }: {
  value: string; onSave: (v: string) => void; type?: string; className?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <input
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`bg-transparent border-0 outline-none w-full min-w-[60px] px-1 py-0 text-xs hover:bg-muted/60 focus:bg-white dark:focus:bg-muted focus:ring-1 focus:ring-primary/50 focus:rounded ${className}`}
    />
  );
}

function InlineSelect({ value, options, onSave, className = "" }: {
  value: string; options: readonly string[]; onSave: (v: string) => void; className?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <select
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local); }}
      className={`bg-transparent border-0 outline-none text-xs w-full min-w-[70px] px-1 py-0 hover:bg-muted/60 focus:bg-white dark:focus:bg-muted focus:ring-1 focus:ring-primary/50 focus:rounded ${className}`}
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function calcAgentBreakdown(
  saleValue: number,
  splitPct: number,
  employee: any,
  capUsedSoFar: number,
  capAmount: number | null, // null = unlimited (no cap configured)
  commissionRatePct: number = 2, // e.g. 2 → 2%
): AgentBreakdown {
  const sideBHB = saleValue * (commissionRatePct / 100);
  const bhbShare = sideBHB * (splitPct / 100);
  const mainBranchShare = bhbShare * 0.10;         // KWTR = 10% of agent BHB
  const kwtrKdv = mainBranchShare * 0.20;          // 20% KDV on KWTR

  // BM = 30% of (BHB - KWTR) = 27% effective
  const marketCenterDue = (bhbShare - mainBranchShare) * 0.30;

  // null capAmount = unlimited — full marketCenterDue is paid, no cap reduction
  const marketCenterActual = capAmount === null
    ? marketCenterDue
    : Math.min(marketCenterDue, Math.max(0, capAmount - capUsedSoFar));
  const capUsedAfter = capUsedSoFar + marketCenterActual;

  // BM KDV proportional to actual BM paid (= bhbShare × 1.6% when not capped)
  const bmKdv = marketCenterDue > 0
    ? marketCenterActual * (0.016 / 0.27)
    : 0;

  let ukShare = 0;
  if (employee?.uretkenlikKoclugu && employee?.uretkenlikKocluguOran) {
    const ukRate = employee.uretkenlikKocluguOran === "10%" ? 0.10 : 0.05;
    ukShare = bhbShare * ukRate;
  }

  const employeeNet = bhbShare - mainBranchShare - kwtrKdv - marketCenterActual - bmKdv - ukShare;

  return {
    bhbShare,
    mainBranchShare,
    kwtrKdv,
    marketCenterDue,
    marketCenterActual,
    bmKdv,
    ukShare,
    employeeNet,
    capRemaining: capAmount === null ? null : Math.max(0, capAmount - capUsedAfter),
    capAmount,
    capUsedAfter,
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useEmployees() {
  return useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load employees");
      return res.json();
    },
  });
}

function useCapStatuses() {
  return useQuery<Record<number, CapStatus>>({
    queryKey: ["/api/employees/cap-statuses"],
    queryFn: async () => {
      const res = await fetch("/api/employees/cap-statuses", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load cap statuses");
      return res.json();
    },
  });
}

function useClosings() {
  return useQuery<ClosingWithDetails[]>({
    queryKey: ["/api/closings"],
    queryFn: async () => {
      const res = await fetch("/api/closings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load closings");
      return res.json();
    },
  });
}

function useCreateClosing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/closings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/closings"] });
      qc.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
    },
  });
}

function useDeleteClosing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/closings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/closings"] });
      qc.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
    },
  });
}

function useCapSettings() {
  return useQuery<any[]>({
    queryKey: ["/api/cap-settings"],
    queryFn: async () => {
      const res = await fetch("/api/cap-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load cap settings");
      return res.json();
    },
  });
}

function useUpsertCapSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year: number; amount: string }) =>
      apiRequest("POST", "/api/cap-settings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cap-settings"] });
      qc.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
    },
  });
}

function useDeleteCapSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/cap-settings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cap-settings"] });
      qc.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
    },
  });
}

// ── Agent row inside side ─────────────────────────────────────────────────────
interface AgentInputRow {
  id: string;
  employeeId: number | null;
  splitPercentage: string;
  // Breakdown values — auto-filled from calcAgentBreakdown, user can override any field
  bhbShare: string;
  mainBranchShare: string;
  kwtrKdv: string;
  marketCenterActual: string;
  bmKdv: string;
  ukShare: string;
  employeeNet: string;
  isManuallyEdited: boolean; // true = user has changed at least one field
}

interface SideState {
  enabled: boolean;
  agents: AgentInputRow[];
}

function newAgent(): AgentInputRow {
  return {
    id: Math.random().toString(36).slice(2),
    employeeId: null,
    splitPercentage: "100",
    bhbShare: "",
    mainBranchShare: "",
    kwtrKdv: "",
    marketCenterActual: "",
    bmKdv: "",
    ukShare: "",
    employeeNet: "",
    isManuallyEdited: false,
  };
}

function applyBreakdown(agent: AgentInputRow, bd: AgentBreakdown): AgentInputRow {
  return {
    ...agent,
    bhbShare: bd.bhbShare.toFixed(2),
    mainBranchShare: bd.mainBranchShare.toFixed(2),
    kwtrKdv: bd.kwtrKdv.toFixed(2),
    marketCenterActual: bd.marketCenterActual.toFixed(2),
    bmKdv: bd.bmKdv.toFixed(2),
    ukShare: bd.ukShare.toFixed(2),
    employeeNet: bd.employeeNet.toFixed(2),
    isManuallyEdited: false,
  };
}

/** Recompute employeeNet from the stored deduction fields */
function deriveNet(a: AgentInputRow): string {
  const bhb = parseFloat(a.bhbShare || "0");
  const kwtr = parseFloat(a.mainBranchShare || "0");
  const kwtrKdv = parseFloat(a.kwtrKdv || "0");
  const bm = parseFloat(a.marketCenterActual || "0");
  const bmKdv = parseFloat(a.bmKdv || "0");
  const uk = parseFloat(a.ukShare || "0");
  return (bhb - kwtr - kwtrKdv - bm - bmKdv - uk).toFixed(2);
}

// ── Cap badge ─────────────────────────────────────────────────────────────────
function CapBadge({ remaining, amount }: { remaining: number | null; amount: number | null }) {
  if (amount === null) {
    // No cap configured — unlimited, nothing to show
    return null;
  }
  if (remaining !== null && remaining <= 0) {
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertCircle className="h-3 w-3 mr-1" />
        Cap Doldu
      </Badge>
    );
  }
  if (remaining !== null && remaining < amount) {
    return (
      <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
        Cap: {fmtTRY(remaining)} kaldı
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Cap OK
    </Badge>
  );
}

// ── Editable breakdown field ──────────────────────────────────────────────────
function BreakdownField({
  label,
  value,
  onChange,
  highlight,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  highlight?: boolean;
  prefix?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 text-xs ${highlight ? "font-semibold" : "text-muted-foreground"}`}>
      <span className="shrink-0 w-36">{label}</span>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-muted-foreground">{prefix}</span>}
        <Input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-6 w-32 text-xs text-right px-1.5 ${highlight ? "font-semibold" : ""}`}
        />
        <span className="text-muted-foreground shrink-0">₺</span>
      </div>
    </div>
  );
}

// ── Side section ──────────────────────────────────────────────────────────────
function SideSection({
  sideLabel,
  sideKey,
  side,
  setSide,
  saleValue,
  commissionRatePct,
  employees,
  capStatuses,
  runningCapUsed,
}: {
  sideLabel: string;
  sideKey: "buyer" | "seller";
  side: SideState;
  setSide: (s: SideState) => void;
  saleValue: number;
  commissionRatePct: number;
  employees: any[];
  capStatuses: Record<number, CapStatus>;
  runningCapUsed: Record<number, number>;
}) {
  const activeEmployees = employees.filter((e) => e.status === "active");

  const toggle = () => {
    if (side.enabled) {
      setSide({ enabled: false, agents: [newAgent()] });
    } else {
      setSide({ enabled: true, agents: [newAgent()] });
    }
  };

  const addAgent = () => {
    setSide({ ...side, agents: [...side.agents, newAgent()] });
  };

  const removeAgent = (id: string) => {
    setSide({ ...side, agents: side.agents.filter((a) => a.id !== id) });
  };

  const updateAgent = (id: string, patch: Partial<AgentInputRow>) => {
    setSide({
      ...side,
      agents: side.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  };

  const splitTotal = side.agents.reduce((s, a) => s + parseFloat(a.splitPercentage || "0"), 0);
  const splitOk = Math.abs(splitTotal - 100) < 0.01;

  return (
    <div className={`border rounded-lg p-4 transition-colors ${side.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
              side.enabled ? "bg-primary border-primary text-white" : "border-input bg-background"
            }`}
          >
            {side.enabled && <CheckCircle2 className="h-3 w-3" />}
          </button>
          <span className="font-medium text-sm">{sideLabel}</span>
        </div>
        {side.enabled && (
          <span className="text-xs text-muted-foreground">
            BHB: {fmtTRY(saleValue * (commissionRatePct / 100))}
          </span>
        )}
      </div>

      {side.enabled && (
        <div className="space-y-3">
          {side.agents.map((agent, idx) => {
            const emp = activeEmployees.find((e) => e.id === agent.employeeId);
            const capStatus = agent.employeeId ? capStatuses[agent.employeeId] : null;
            const capAmount = capStatus?.capAmount ?? null;
            const capUsedSoFar = agent.employeeId ? (runningCapUsed[agent.employeeId] ?? capStatus?.capUsed ?? 0) : 0;
            const splitPct = parseFloat(agent.splitPercentage || "0");

            const recalc = () => {
              if (!emp || saleValue <= 0 || splitPct <= 0) return;
              const bd = calcAgentBreakdown(saleValue, splitPct, emp, capUsedSoFar, capAmount, commissionRatePct);
              updateAgent(agent.id, applyBreakdown(agent, bd));
            };

            // Auto-fill when agent/split is first set and fields are empty
            const showBreakdown = !!emp && saleValue > 0 && splitPct > 0;
            if (showBreakdown && !agent.isManuallyEdited && agent.bhbShare === "") {
              const bd = calcAgentBreakdown(saleValue, splitPct, emp, capUsedSoFar, capAmount, commissionRatePct);
              // Trigger in next tick to avoid render-time setState
              setTimeout(() => updateAgent(agent.id, applyBreakdown(agent, bd)), 0);
            }

            const updateField = (field: keyof AgentInputRow, val: string) => {
              const updated = { ...agent, [field]: val, isManuallyEdited: true };
              // Auto-derive net whenever a deduction field changes (except net itself)
              if (field !== "employeeNet") {
                updated.employeeNet = deriveNet({ ...updated, [field]: val });
              }
              updateAgent(agent.id, updated);
            };

            return (
              <div key={agent.id} className="border border-border rounded-md p-3 bg-background space-y-2">
                {/* Agent selector + split */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground w-5">{idx + 1}.</span>
                  <div className="flex-1">
                    <Select
                      value={agent.employeeId ? String(agent.employeeId) : ""}
                      onValueChange={(v) => {
                        updateAgent(agent.id, { ...newAgent(), id: agent.id, employeeId: Number(v), splitPercentage: agent.splitPercentage });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Danışman seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeEmployees.map((e) => (
                          <SelectItem key={e.id} value={String(e.id)} className="text-xs">
                            {e.candidate?.name ?? `Çalışan #${e.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={agent.splitPercentage}
                      onChange={(e) => updateAgent(agent.id, { ...newAgent(), id: agent.id, employeeId: agent.employeeId, splitPercentage: e.target.value })}
                      className="h-8 text-xs text-right"
                      placeholder="% Pay"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">%</span>
                  {side.agents.length > 1 && (
                    <button type="button" onClick={() => removeAgent(agent.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Editable breakdown */}
                {showBreakdown && agent.bhbShare !== "" && (
                  <div className="ml-5 p-2 bg-muted/50 rounded space-y-1.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Hesaplama</span>
                        {agent.isManuallyEdited && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Manuel</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CapBadge remaining={capStatus?.capRemaining ?? null} amount={capAmount} />
                        <button
                          type="button"
                          onClick={recalc}
                          title="Otomatik hesapla"
                          className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                        >
                          ↺ Hesapla
                        </button>
                      </div>
                    </div>
                    <BreakdownField label="BHB Payı" value={agent.bhbShare} onChange={(v) => updateField("bhbShare", v)} />
                    <BreakdownField label="KWTR (10%)" prefix="−" value={agent.mainBranchShare} onChange={(v) => updateField("mainBranchShare", v)} />
                    <BreakdownField label="KWTR KDV (20%)" prefix="−" value={agent.kwtrKdv} onChange={(v) => updateField("kwtrKdv", v)} />
                    <BreakdownField label="BM (27%)" prefix="−" value={agent.marketCenterActual} onChange={(v) => updateField("marketCenterActual", v)} />
                    <BreakdownField label="BM KDV (1.6%)" prefix="−" value={agent.bmKdv} onChange={(v) => updateField("bmKdv", v)} />
                    <BreakdownField label="Üretkenlik Koçluğu" prefix="−" value={agent.ukShare} onChange={(v) => updateField("ukShare", v)} />
                    <div className="border-t border-border mt-1 pt-1.5">
                      <BreakdownField label="Danışman Net" value={agent.employeeNet} onChange={(v) => updateField("employeeNet", v)} highlight />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={addAgent} className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" />
              Danışman Ekle
            </Button>
            {!splitOk && side.agents.length > 0 && (
              <span className="text-xs text-destructive">
                Pay toplamı %100 olmalı (şu an: %{splitTotal.toFixed(2)})
              </span>
            )}
            {splitOk && (
              <span className="text-xs text-emerald-600">Pay: %100 ✓</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary table ─────────────────────────────────────────────────────────────
interface SummaryRow {
  name: string;
  side: string;
  splitPct: number;
  bhbShare: number;
  mainBranch: number;
  kwtrKdv: number;
  mcActual: number;
  bmKdv: number;
  uk: number;
  net: number;
}

function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  if (rows.length === 0) return null;
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const totalKdv = rows.reduce((s, r) => s + r.kwtrKdv + r.bmKdv, 0);
  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs">Danışman</TableHead>
            <TableHead className="text-xs">Taraf</TableHead>
            <TableHead className="text-xs text-right">Pay %</TableHead>
            <TableHead className="text-xs text-right">BHB</TableHead>
            <TableHead className="text-xs text-right">KWTR</TableHead>
            <TableHead className="text-xs text-right">BM</TableHead>
            <TableHead className="text-xs text-right text-amber-600">KDV</TableHead>
            <TableHead className="text-xs text-right">UK</TableHead>
            <TableHead className="text-xs text-right font-semibold">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs font-medium">{r.name}</TableCell>
              <TableCell className="text-xs">
                <Badge variant="outline" className="text-[10px]">
                  {r.side === "buyer" ? "Alıcı" : "Satıcı"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-right">%{r.splitPct.toFixed(2)}</TableCell>
              <TableCell className="text-xs text-right">{fmtTRY(r.bhbShare)}</TableCell>
              <TableCell className="text-xs text-right text-muted-foreground">{fmtTRY(r.mainBranch)}</TableCell>
              <TableCell className="text-xs text-right text-muted-foreground">{fmtTRY(r.mcActual)}</TableCell>
              <TableCell className="text-xs text-right text-amber-600">{fmtTRY(r.kwtrKdv + r.bmKdv)}</TableCell>
              <TableCell className="text-xs text-right text-muted-foreground">{fmtTRY(r.uk)}</TableCell>
              <TableCell className="text-xs text-right font-semibold text-emerald-700">{fmtTRY(r.net)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/30 font-semibold">
            <TableCell colSpan={6} className="text-xs">Toplam</TableCell>
            <TableCell className="text-xs text-right text-amber-600">{fmtTRY(totalKdv)}</TableCell>
            <TableCell />
            <TableCell className="text-xs text-right text-emerald-700">{fmtTRY(totalNet)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

// ── Cap Settings Panel ────────────────────────────────────────────────────────
function CapSettingsPanel() {
  const { toast } = useToast();
  const { data: settings = [] } = useCapSettings();
  const upsert = useUpsertCapSetting();
  const del = useDeleteCapSetting();

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [amount, setAmount] = useState("");

  const handleSave = async () => {
    const y = parseInt(year);
    const a = parseFloat(amount);
    if (!y || !a || a <= 0) {
      toast({ title: "Hata", description: "Geçerli bir yıl ve tutar girin.", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({ year: y, amount: String(a) });
      toast({ title: "Kaydedildi", description: `${y} yılı cap tutarı güncellendi.` });
      setAmount("");
    } catch {
      toast({ title: "Hata", description: "Kayıt başarısız.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Yıllık Cap Tutarları
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Her yıl için danışman başına ofise ödenen maksimum BHB tutarını ayarlayın. Cap dolduktan sonra ofis payı sıfıra düşer.
        </p>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">Yıl</Label>
            <Input
              type="number"
              className="mt-1 h-8 text-sm w-24"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2026"
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Cap Tutarı (₺)</Label>
            <Input
              type="number"
              className="mt-1 h-8 text-sm"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button size="sm" className="h-8" onClick={handleSave} disabled={upsert.isPending}>
            Kaydet
          </Button>
        </div>
        {settings.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Yıl</TableHead>
                <TableHead className="text-xs text-right">Cap Tutarı</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm font-medium">{s.year}</TableCell>
                  <TableCell className="text-sm text-right">{fmtTRY(parseFloat(s.amount))}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => del.mutate(s.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {settings.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Henüz cap tutarı tanımlanmamış. Cap tanımlanmayan yıllar sınırsız sayılır.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Employee Cap Status Panel ─────────────────────────────────────────────────
function EmployeeCapStatusPanel({
  employees,
  capStatuses,
}: {
  employees: any[];
  capStatuses: Record<number, CapStatus>;
}) {
  const active = employees.filter((e) => e.status === "active");
  if (active.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Danışman Cap Durumu
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground italic">Aktif danışman bulunamadı.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Danışman Cap Durumu
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs pl-4">Danışman</TableHead>
              <TableHead className="text-xs">Dönem Başı</TableHead>
              <TableHead className="text-xs text-right">Cap Tutarı</TableHead>
              <TableHead className="text-xs text-right">Ödenen</TableHead>
              <TableHead className="text-xs text-right">Kalan</TableHead>
              <TableHead className="text-xs text-center">Durum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((emp) => {
              const status = capStatuses[emp.id];
              const name = emp.candidate?.name ?? `Danışman #${emp.id}`;
              if (!status) {
                return (
                  <TableRow key={emp.id}>
                    <TableCell className="text-xs font-medium pl-4">{name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground italic">—</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground italic">Cap tanımsız</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Tanımsız</Badge>
                    </TableCell>
                  </TableRow>
                );
              }
              const pct = status.capAmount ? Math.min(100, (status.capUsed / status.capAmount) * 100) : 0;
              const isFull = status.capAmount !== null && status.capRemaining !== null && status.capRemaining <= 0;
              const isUnlimited = status.capAmount === null;
              return (
                <TableRow key={emp.id}>
                  <TableCell className="text-xs font-medium pl-4">{name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {safeFormatDate(status.periodStart as any, "MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    {isUnlimited ? <span className="text-muted-foreground italic">Tanımsız</span> : fmtTRY(status.capAmount!)}
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium">{fmtTRY(status.capUsed)}</TableCell>
                  <TableCell className="text-xs text-right">
                    {isUnlimited
                      ? <span className="text-muted-foreground italic">—</span>
                      : <span className={isFull ? "text-destructive font-semibold" : "text-emerald-700 font-semibold"}>
                          {fmtTRY(status.capRemaining!)}
                        </span>
                    }
                  </TableCell>
                  <TableCell className="text-center">
                    {isUnlimited ? (
                      <Badge variant="outline" className="text-[10px]">Sınırsız</Badge>
                    ) : isFull ? (
                      <Badge variant="destructive" className="text-[10px]">Cap Doldu</Badge>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground">{pct.toFixed(0)}%</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── New Closing Dialog ────────────────────────────────────────────────────────
function NewClosingDialog({
  open,
  onClose,
  employees,
  capStatuses,
}: {
  open: boolean;
  onClose: () => void;
  employees: any[];
  capStatuses: Record<number, CapStatus>;
}) {
  const { toast } = useToast();
  const createClosing = useCreateClosing();

  const [propertyAddress, setPropertyAddress] = useState("");
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [mahalle, setMahalle] = useState("");
  const [propertyDetails, setPropertyDetails] = useState("");
  const [dealCategory, setDealCategory] = useState<DealCategory>("Satış");
  const [dealType, setDealType] = useState<string>("Çift Taraflı");
  const [saleValue, setSaleValue] = useState("");
  const [commissionRate, setCommissionRate] = useState("2");
  const [openingPrice, setOpeningPrice] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [customerSource, setCustomerSource] = useState("");
  const [referralInfo, setReferralInfo] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [kasa, setKasa] = useState("");
  const [nakit, setNakit] = useState("");
  const [banka, setBanka] = useState("");
  const [closingDate, setClosingDate] = useState(new Date().toISOString().split("T")[0]);
  const [buyerName, setBuyerName] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [notes, setNotes] = useState("");
  const [buyerSide, setBuyerSide] = useState<SideState>({ enabled: false, agents: [newAgent()] });
  const [sellerSide, setSellerSide] = useState<SideState>({ enabled: false, agents: [newAgent()] });

  const saleValueNum = parseFloat(saleValue || "0");
  const commissionRatePct = Math.max(0, parseFloat(commissionRate || (dealCategory === "Kiralık" ? "50" : "2")));
  const sideBHBPreview = saleValueNum > 0 ? saleValueNum * (commissionRatePct / 100) : 0;
  const saleValueLabel = dealCategory === "Kiralık" ? "Aylık Kira Bedeli (₺) *" : "Satış Bedeli (₺) *";

  // Compute per-side starting cap used:
  // buyerRunningCap = DB values (cap used before this closing)
  // sellerRunningCap = DB values + any buyer-side contributions for same employee
  const { buyerRunningCap, sellerRunningCap } = useMemo(() => {
    // Initialize from DB cap status
    const allIds = new Set<number>();
    buyerSide.agents.forEach((a) => { if (a.employeeId) allIds.add(a.employeeId); });
    sellerSide.agents.forEach((a) => { if (a.employeeId) allIds.add(a.employeeId); });

    const buyerStart: Record<number, number> = {};
    const afterBuyer: Record<number, number> = {};
    for (const empId of allIds) {
      const dbUsed = capStatuses[empId]?.capUsed ?? 0;
      buyerStart[empId] = dbUsed;
      afterBuyer[empId] = dbUsed;
    }

    // Process buyer agents to update afterBuyer (which becomes seller starting point)
    if (buyerSide.enabled) {
      for (const agent of buyerSide.agents) {
        if (!agent.employeeId) continue;
        const emp = employees.find((e) => e.id === agent.employeeId);
        if (!emp) continue;
        const capAmount = capStatuses[agent.employeeId]?.capAmount ?? null;
        const capUsedSoFar = afterBuyer[agent.employeeId] ?? 0;
        const splitPct = parseFloat(agent.splitPercentage || "0");
        if (splitPct <= 0 || saleValueNum <= 0) continue;
        const bd = calcAgentBreakdown(saleValueNum, splitPct, emp, capUsedSoFar, capAmount, commissionRatePct);
        afterBuyer[agent.employeeId] = bd.capUsedAfter;
      }
    }

    return { buyerRunningCap: buyerStart, sellerRunningCap: afterBuyer };
  }, [buyerSide, sellerSide, saleValueNum, commissionRatePct, employees, capStatuses]);

  // Build summary rows — reads directly from stored agent fields (which may be manually edited)
  const summaryRows = useMemo((): SummaryRow[] => {
    const rows: SummaryRow[] = [];

    const processAgents = (agents: AgentInputRow[], sideType: string) => {
      for (const agent of agents) {
        if (!agent.employeeId || agent.bhbShare === "") continue;
        const emp = employees.find((e) => e.id === agent.employeeId);
        if (!emp) continue;
        const splitPct = parseFloat(agent.splitPercentage || "0");
        if (splitPct <= 0) continue;
        rows.push({
          name: emp.candidate?.name ?? `Danışman #${agent.employeeId}`,
          side: sideType,
          splitPct,
          bhbShare: parseFloat(agent.bhbShare || "0"),
          mainBranch: parseFloat(agent.mainBranchShare || "0"),
          kwtrKdv: parseFloat(agent.kwtrKdv || "0"),
          mcActual: parseFloat(agent.marketCenterActual || "0"),
          bmKdv: parseFloat(agent.bmKdv || "0"),
          uk: parseFloat(agent.ukShare || "0"),
          net: parseFloat(agent.employeeNet || "0"),
        });
      }
    };

    if (buyerSide.enabled) processAgents(buyerSide.agents, "buyer");
    if (sellerSide.enabled) processAgents(sellerSide.agents, "seller");

    return rows;
  }, [buyerSide, sellerSide, employees]);

  const resetForm = () => {
    setPropertyAddress(""); setIl(""); setIlce(""); setMahalle(""); setPropertyDetails("");
    setDealCategory("Satış"); setDealType("Çift Taraflı");
    setSaleValue(""); setCommissionRate("2"); setOpeningPrice(""); setDurationDays("");
    setCustomerSource(""); setReferralInfo(""); setContractStartDate(""); setContractEndDate("");
    setKasa(""); setNakit(""); setBanka("");
    setClosingDate(new Date().toISOString().split("T")[0]);
    setBuyerName(""); setSellerName(""); setNotes("");
    setBuyerSide({ enabled: false, agents: [newAgent()] });
    setSellerSide({ enabled: false, agents: [newAgent()] });
  };

  const validate = (): string | null => {
    if (!saleValue || saleValueNum <= 0) return "Geçerli bir satış bedeli girin.";
    if (!closingDate) return "Kapanış tarihi zorunludur.";
    if (!buyerSide.enabled && !sellerSide.enabled) return "En az bir taraf seçilmelidir.";
    if (buyerSide.enabled) {
      if (buyerSide.agents.length === 0) return "Alıcı tarafında en az bir danışman olmalıdır.";
      if (buyerSide.agents.some((a) => !a.employeeId)) return "Alıcı tarafındaki tüm danışmanları seçin.";
      const total = buyerSide.agents.reduce((s, a) => s + parseFloat(a.splitPercentage || "0"), 0);
      if (Math.abs(total - 100) > 0.01) return `Alıcı tarafı pay toplamı %100 olmalı (şu an: %${total.toFixed(2)}).`;
    }
    if (sellerSide.enabled) {
      if (sellerSide.agents.length === 0) return "Satıcı tarafında en az bir danışman olmalıdır.";
      if (sellerSide.agents.some((a) => !a.employeeId)) return "Satıcı tarafındaki tüm danışmanları seçin.";
      const total = sellerSide.agents.reduce((s, a) => s + parseFloat(a.splitPercentage || "0"), 0);
      if (Math.abs(total - 100) > 0.01) return `Satıcı tarafı pay toplamı %100 olmalı (şu an: %${total.toFixed(2)}).`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast({ title: "Hata", description: err, variant: "destructive" });
      return;
    }

    const mapAgents = (agents: AgentInputRow[]) =>
      agents.map((a) => ({
        employeeId: a.employeeId,
        splitPercentage: String(parseFloat(a.splitPercentage || "0")),
        bhbShare: a.bhbShare || "0",
        mainBranchShare: a.mainBranchShare || "0",
        kwtrKdv: a.kwtrKdv || "0",
        marketCenterActual: a.marketCenterActual || "0",
        bmKdv: a.bmKdv || "0",
        ukShare: a.ukShare || "0",
        employeeNet: a.employeeNet || "0",
      }));

    const sides = [];
    if (buyerSide.enabled) sides.push({ sideType: "buyer", agents: mapAgents(buyerSide.agents) });
    if (sellerSide.enabled) sides.push({ sideType: "seller", agents: mapAgents(sellerSide.agents) });

    try {
      await createClosing.mutateAsync({
        propertyAddress: propertyAddress.trim(),
        il: il.trim() || null,
        ilce: ilce.trim() || null,
        mahalle: mahalle.trim() || null,
        propertyDetails: propertyDetails.trim() || null,
        dealCategory,
        dealType,
        saleValue: String(saleValueNum),
        commissionRate: String(commissionRatePct),
        openingPrice: openingPrice ? openingPrice : null,
        durationDays: durationDays ? Number(durationDays) : null,
        customerSource: customerSource.trim() || null,
        referralInfo: referralInfo.trim() || null,
        contractStartDate: contractStartDate ? new Date(contractStartDate).toISOString() : null,
        contractEndDate: contractEndDate ? new Date(contractEndDate).toISOString() : null,
        kasa: kasa || null,
        nakit: nakit || null,
        banka: banka || null,
        closingDate: new Date(closingDate).toISOString(),
        buyerName: buyerName.trim() || null,
        sellerName: sellerName.trim() || null,
        notes: notes.trim() || null,
        sides,
      });
      toast({ title: "Başarılı", description: "Kapanış kaydedildi." });
      resetForm();
      onClose();
    } catch (e: any) {
      toast({ title: "Hata", description: e?.message ?? "Kapanış kaydedilemedi.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" />
            Yeni Kapanış
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Mülk Bilgileri */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-foreground">Mülk Bilgileri</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Mülk Adresi</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="Adres..."
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">İl</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="İl..."
                  value={il}
                  onChange={(e) => setIl(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">İlçe</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="İlçe..." value={ilce} onChange={(e) => setIlce(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Semt/Mahalle</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="Mahalle..." value={mahalle} onChange={(e) => setMahalle(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Mülkle İlgili Detay Bilgiler</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="Detay bilgiler..." value={propertyDetails} onChange={(e) => setPropertyDetails(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Tür</Label>
                <Select value={dealCategory} onValueChange={(v) => {
                  const cat = v as DealCategory;
                  setDealCategory(cat);
                  setCommissionRate(cat === "Kiralık" ? "50" : "2");
                }}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_CATEGORIES.map((dc) => (
                      <SelectItem key={dc} value={dc} className="text-sm">{dc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">İşlem Tipi</Label>
                <Select value={dealType} onValueChange={setDealType}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_TYPES.map((dt) => (
                      <SelectItem key={dt} value={dt} className="text-sm">{dt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Komisyon Oranı (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="mt-1 h-8 text-sm"
                  placeholder={dealCategory === "Kiralık" ? "50" : "2"}
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">{saleValueLabel}</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 h-8 text-sm"
                  placeholder="0"
                  value={saleValue}
                  onChange={(e) => setSaleValue(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-md border border-border bg-muted/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">BHB (taraf başına)</p>
                  <p className="text-sm font-semibold text-foreground">{sideBHBPreview > 0 ? fmtTRY(sideBHBPreview) : "—"}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs">Kapanış Tarihi *</Label>
                <Input type="date" className="mt-1 h-8 text-sm" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Açılış Rakamı (₺)</Label>
                <Input type="number" min="0" className="mt-1 h-8 text-sm" placeholder="Liste fiyatı..." value={openingPrice} onChange={(e) => setOpeningPrice(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Süre/Gün</Label>
                <Input type="number" min="0" className="mt-1 h-8 text-sm" placeholder="Pazarlama süresi..." value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Sözleşme Başlangıç Tarihi</Label>
                <Input type="date" className="mt-1 h-8 text-sm" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Sözleşme Bitiş Tarihi</Label>
                <Input type="date" className="mt-1 h-8 text-sm" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Müşteri nereden buldu?</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="Sosyal medya, tavsiye..." value={customerSource} onChange={(e) => setCustomerSource(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Yönlendirme Bilgisi</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="Kim yönlendirdi..." value={referralInfo} onChange={(e) => setReferralInfo(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Kasa (₺)</Label>
                <Input type="number" min="0" className="mt-1 h-8 text-sm" placeholder="0" value={kasa} onChange={(e) => setKasa(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Nakit (₺)</Label>
                <Input type="number" min="0" className="mt-1 h-8 text-sm" placeholder="0" value={nakit} onChange={(e) => setNakit(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Banka (₺)</Label>
                <Input type="number" min="0" className="mt-1 h-8 text-sm" placeholder="0" value={banka} onChange={(e) => setBanka(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Alıcı Adı</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="Alıcı adı..."
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Satıcı Adı</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="Satıcı adı..."
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Notlar</Label>
                <Textarea
                  className="mt-1 text-sm resize-none"
                  rows={2}
                  placeholder="Ek notlar..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Temsil Tarafları */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-foreground">Temsil Tarafları</h3>
            {saleValueNum <= 0 && (
              <p className="text-xs text-muted-foreground mb-3">
                Hesaplama için önce satış bedeli girin.
              </p>
            )}
            <div className="space-y-3">
              <SideSection
                sideLabel="Alıcı Tarafı"
                sideKey="buyer"
                side={buyerSide}
                setSide={setBuyerSide}
                saleValue={saleValueNum}
                commissionRatePct={commissionRatePct}
                employees={employees}
                capStatuses={capStatuses}
                runningCapUsed={buyerRunningCap}
              />
              <SideSection
                sideLabel="Satıcı Tarafı"
                sideKey="seller"
                side={sellerSide}
                setSide={setSellerSide}
                saleValue={saleValueNum}
                commissionRatePct={commissionRatePct}
                employees={employees}
                capStatuses={capStatuses}
                runningCapUsed={sellerRunningCap}
              />
            </div>
          </section>

          {/* Summary */}
          {summaryRows.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-3 text-foreground">Hesap Özeti</h3>
              <SummaryTable rows={summaryRows} />
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onClose(); }}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={createClosing.isPending}>
            {createClosing.isPending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "closings" | "cap";

export default function Closings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("closings");

  const { data: closings = [], isLoading: closingsLoading } = useClosings();
  const { data: employees = [] } = useEmployees();
  const { data: capStatuses = {} } = useCapStatuses();
  const deleteClosing = useDeleteClosing();

  // Summary stats (each side = 1 count)
  const totalSides = closings.reduce((s, c) => s + c.sides.length, 0);
  const totalVolume = closings.reduce((s, c) => s + parseFloat(c.saleValue ?? "0"), 0);
  const totalBHB = closings.reduce((s, c) =>
    s + c.sides.reduce((ss, side) => ss + parseFloat(side.bhbTotal ?? "0"), 0), 0
  );
  const totalBM = closings.reduce((s, c) =>
    s + c.sides.reduce((ss, side) =>
      ss + side.agents.reduce((sa, a) => sa + parseFloat(a.marketCenterActual ?? "0"), 0), 0), 0
  );

  // Flatten closings into one row per agent per side
  type FlatRow = {
    closingId: number; sideId: number; agentId: number;
    closingDate: string; propertyAddress: string; il: string; ilce: string;
    dealCategory: string; dealType: string; saleValue: string; commissionRate: string;
    buyerName: string; sellerName: string; notes: string;
    sideType: string;
    employeeId: number; employeeName: string;
    splitPercentage: string; bhbShare: string; mainBranchShare: string;
    kwtrKdv: string; marketCenterActual: string; marketCenterDue: string;
    bmKdv: string; ukShare: string; employeeNet: string;
    isFirstOfClosing: boolean;
    closingAgentCount: number;
  };

  const flatRows: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = [];
    for (const c of closings) {
      let firstOfClosing = true;
      const agentCount = c.sides.reduce((s, side) => s + side.agents.length, 0);
      for (const side of c.sides) {
        for (const agent of side.agents) {
          rows.push({
            closingId: c.id,
            sideId: side.id,
            agentId: agent.id,
            closingDate: c.closingDate ? new Date(c.closingDate).toISOString().split("T")[0] : "",
            propertyAddress: c.propertyAddress ?? "",
            il: (c as any).il ?? "",
            ilce: (c as any).ilce ?? "",
            dealCategory: c.dealCategory ?? "Satış",
            dealType: c.dealType ?? "",
            saleValue: c.saleValue ?? "",
            commissionRate: c.commissionRate ?? "2",
            buyerName: c.buyerName ?? "",
            sellerName: c.sellerName ?? "",
            notes: c.notes ?? "",
            sideType: side.sideType,
            employeeId: agent.employeeId,
            employeeName: agent.candidateName ?? agent.employeeName ?? `#${agent.employeeId}`,
            splitPercentage: agent.splitPercentage ?? "100",
            bhbShare: agent.bhbShare ?? "0",
            mainBranchShare: agent.mainBranchShare ?? "0",
            kwtrKdv: agent.kwtrKdv ?? "0",
            marketCenterActual: agent.marketCenterActual ?? "0",
            marketCenterDue: agent.marketCenterDue ?? "0",
            bmKdv: agent.bmKdv ?? "0",
            ukShare: agent.ukShare ?? "0",
            employeeNet: agent.employeeNet ?? "0",
            isFirstOfClosing: firstOfClosing,
            closingAgentCount: agentCount,
          });
          firstOfClosing = false;
        }
      }
    }
    return rows;
  }, [closings]);

  // Save a closing-level field on blur
  const saveClosingField = useCallback(async (closingId: number, field: string, value: string) => {
    try {
      let body: Record<string, any> = { [field]: value };
      if (field === "closingDate") body = { closingDate: new Date(value).toISOString() };
      await fetch(`/api/closings/${closingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/closings"] });
    } catch { /* silent */ }
  }, [queryClient]);

  // Save an agent-level field on blur
  const saveAgentField = useCallback(async (agentId: number, field: string, value: string) => {
    try {
      await fetch(`/api/closing-agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/closings"] });
    } catch { /* silent */ }
  }, [queryClient]);

  const handleDelete = async (id: number) => {
    if (!window.confirm("Bu kapanışı silmek istediğinize emin misiniz?")) return;
    try {
      await deleteClosing.mutateAsync(id);
      toast({ title: "Silindi", description: "Kapanış kaydı silindi." });
    } catch {
      toast({ title: "Hata", description: "Kapanış silinemedi.", variant: "destructive" });
    }
  };

  const handleExport = () => {
    window.open("/api/closings/export", "_blank");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { toast({ title: "Hata", description: "CSV boş veya geçersiz.", variant: "destructive" }); return; }

      const parseRow = (line: string): string[] => {
        const result: string[] = [];
        let cur = "", inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
          } else if (ch === ',' && !inQuote) { result.push(cur); cur = ""; }
          else cur += ch;
        }
        result.push(cur);
        return result;
      };

      const headers = parseRow(lines[0]);
      const rows = lines.slice(1).map((line) => {
        const vals = parseRow(line);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? "").trim(); });
        return obj;
      }).filter((r) => r["Mülk Adresi"]);

      if (rows.length === 0) { toast({ title: "Hata", description: "İçe aktarılacak satır bulunamadı.", variant: "destructive" }); return; }

      const res = await fetch("/api/closings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Hata", description: data.message, variant: "destructive" }); return; }

      queryClient.invalidateQueries({ queryKey: ["/api/closings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });

      const msg = data.errors?.length
        ? `${data.created} kapanış eklendi. ${data.errors.length} hata: ${data.errors.slice(0, 3).join("; ")}`
        : `${data.created} kapanış başarıyla içe aktarıldı.`;
      toast({ title: data.errors?.length ? "Kısmi başarı" : "Başarılı", description: msg });
    } catch {
      toast({ title: "Hata", description: "Dosya işlenemedi.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Handshake className="h-6 w-6 text-primary" />
              İşlem Kapanışı
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gayrimenkul kapanış işlemlerini ve BHB hesaplamalarını yönetin
            </p>
          </div>
          {tab === "closings" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs h-8">
                <Download className="h-3.5 w-3.5" />
                Dışa Aktar
              </Button>
              <label className="cursor-pointer">
                <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
                <span className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md border border-input bg-background hover:bg-muted transition-colors font-medium">
                  <Upload className="h-3.5 w-3.5" />
                  İçe Aktar
                </span>
              </label>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Yeni Kapanış
              </Button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          <button
            onClick={() => setTab("closings")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "closings" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Kapanışlar
          </button>
          <button
            onClick={() => setTab("cap")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "cap" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Cap Yönetimi
          </button>
        </div>

        {/* ── Closings tab ── */}
        {tab === "cap" && (
          <div className="space-y-6">
            <CapSettingsPanel />
            <EmployeeCapStatusPanel employees={employees} capStatuses={capStatuses} />
          </div>
        )}

        {tab === "closings" && <>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Handshake className="h-3.5 w-3.5" />
                Toplam Kapanış
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{totalSides}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                İşlem Hacmi
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-bold truncate">{fmtTRY(totalVolume)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Toplam BHB
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-bold truncate">{fmtTRY(totalBHB)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Toplam BM Payı
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-bold truncate text-blue-700">{fmtTRY(totalBM)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Flat inline-editable table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {closingsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : flatRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Handshake className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Henüz kapanış kaydı yok</p>
                <p className="text-xs mt-1">Yeni bir kapanış ekleyin</p>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse min-w-[1400px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Tarih","Mülk Adresi","İl","İlçe","Tür","İşlem Tipi","Bedel","Kom%","Taraf","Danışman","Pay%","BHB","KWTR","KWTR KDV","BM","BM KDV","Net",""].map((h) => (
                      <th key={h} className="text-left font-medium py-2 px-2 text-muted-foreground whitespace-nowrap text-[11px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flatRows.map((row) => {
                    const sc = (field: string) => (v: string) => saveClosingField(row.closingId, field, v);
                    const sa = (field: string) => (v: string) => saveAgentField(row.agentId, field, v);
                    const isCapped = parseFloat(row.marketCenterDue) > parseFloat(row.marketCenterActual);
                    return (
                      <tr key={row.agentId} className={`border-b border-border/50 hover:bg-muted/30 ${row.isFirstOfClosing ? "border-t-2 border-t-border" : ""}`}>
                        <td className="px-2 py-1"><InlineCell value={row.closingDate} type="date" onSave={sc("closingDate")} /></td>
                        <td className="px-2 py-1 min-w-[140px]"><InlineCell value={row.propertyAddress} onSave={sc("propertyAddress")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.il} onSave={sc("il")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.ilce} onSave={sc("ilce")} /></td>
                        <td className="px-2 py-1"><InlineSelect value={row.dealCategory} options={DEAL_CATEGORIES} onSave={sc("dealCategory")} /></td>
                        <td className="px-2 py-1"><InlineSelect value={row.dealType} options={DEAL_TYPES} onSave={sc("dealType")} /></td>
                        <td className="px-2 py-1 min-w-[90px]"><InlineCell value={row.saleValue} type="number" onSave={sc("saleValue")} /></td>
                        <td className="px-2 py-1 min-w-[50px]"><InlineCell value={row.commissionRate} type="number" onSave={sc("commissionRate")} /></td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <Badge variant={row.sideType === "buyer" ? "default" : "secondary"} className="text-[10px]">
                            {row.sideType === "buyer" ? "Alıcı" : "Satıcı"}
                          </Badge>
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap font-medium text-xs">{row.employeeName}</td>
                        <td className="px-2 py-1 min-w-[50px]"><InlineCell value={row.splitPercentage} type="number" onSave={sa("splitPercentage")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.bhbShare} type="number" onSave={sa("bhbShare")} /></td>
                        <td className="px-2 py-1 min-w-[80px] text-muted-foreground"><InlineCell value={row.mainBranchShare} type="number" onSave={sa("mainBranchShare")} /></td>
                        <td className="px-2 py-1 min-w-[80px] text-muted-foreground"><InlineCell value={row.kwtrKdv} type="number" onSave={sa("kwtrKdv")} /></td>
                        <td className="px-2 py-1 min-w-[80px] text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <InlineCell value={row.marketCenterActual} type="number" onSave={sa("marketCenterActual")} />
                            {isCapped && <span className="text-amber-500 text-[9px] shrink-0">caplı</span>}
                          </div>
                        </td>
                        <td className="px-2 py-1 min-w-[70px] text-amber-600"><InlineCell value={row.bmKdv} type="number" onSave={sa("bmKdv")} /></td>
                        <td className="px-2 py-1 min-w-[80px] font-semibold text-emerald-700"><InlineCell value={row.employeeNet} type="number" onSave={sa("employeeNet")} /></td>
                        <td className="px-2 py-1 text-center">
                          {row.isFirstOfClosing && (
                            <button onClick={() => handleDelete(row.closingId)} className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded" title="Kapanışı sil">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        </>}
      </div>

      <NewClosingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        employees={employees}
        capStatuses={capStatuses}
      />
    </Layout>
  );
}
