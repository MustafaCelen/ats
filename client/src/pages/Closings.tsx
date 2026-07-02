import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { EmployeePicker } from "@/components/EmployeePicker";
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
  AlertCircle, CheckCircle2, Settings, Pencil,
  Download, Upload, MessageCircle, ChevronUp, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DEAL_TYPES, DEAL_CATEGORIES, type DealCategory, type CapStatus, type ClosingWithDetails } from "@shared/schema";
import { format } from "date-fns";

// ── Formatting ────────────────────────────────────────────────────────────────
function fmtTRY(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + " ₺";
}

/** İşlem adedi oranı: bhbShare / per-side BHB.
 *  Satış/Yönlendirme: per-side BHB = saleValue × commissionRate / 100
 *  Kiralık: per-side BHB = saleValue / 2 (her taraftan kira bedelinin yarısı)
 */
function calcIslemOrani(bhbShare: string | number, saleValue: string | number, commissionRate: string | number, dealCategory?: string): number {
  const bhb = typeof bhbShare === "number" ? bhbShare : parseFloat(bhbShare || "0");
  const sale = typeof saleValue === "number" ? saleValue : parseFloat(saleValue || "0");
  const rate = typeof commissionRate === "number" ? commissionRate : parseFloat(commissionRate || "0");
  const perSideBhb = dealCategory === "Kiralık" ? sale / 2 : sale * rate / 100;
  if (perSideBhb <= 0) return 0;
  return bhb / perSideBhb;
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
const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

// tr-TR locale formatter: "1234567.5" → "1.234.567,5", "350000" → "350.000". Returns raw string if not finite.
const fmtNumberCell = (s: string): string => {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
};

// Read-only display cells. List editing is disabled — use the edit dialog (Pencil) instead.
function InlineCell({ value, type, className = "" }: {
  value: string; onSave?: (v: string) => void; type?: string; className?: string;
}) {
  const empty = value === "" || value == null;
  const display = !empty && type === "number" ? fmtNumberCell(value) : value;
  const alignCls = type === "number" ? "text-right tabular-nums" : "";
  return (
    <span className={`block w-full min-w-[60px] px-1 py-0 text-xs whitespace-nowrap ${alignCls} ${className}`}>
      {!empty ? display : <span className="text-muted-foreground">—</span>}
    </span>
  );
}

function InlineSelect({ value, className = "" }: {
  value: string; options?: readonly string[]; onSave?: (v: string) => void; className?: string;
}) {
  return (
    <span className={`block w-full min-w-[70px] px-1 py-0 text-xs ${className}`}>
      {value ? value : <span className="text-muted-foreground">—</span>}
    </span>
  );
}

function calcAgentBreakdown(
  saleValue: number,
  splitPct: number,
  employee: any,
  capUsedSoFar: number,
  capAmount: number | null, // null = unlimited (no cap configured)
  commissionRatePct: number = 2, // e.g. 2 → 2%
  bmKdvRatePct: number = 0, // % of BM payı, e.g. 20 → 20%
): AgentBreakdown {
  const sideBHB = saleValue * (commissionRatePct / 100);
  const bhbShare = sideBHB * (splitPct / 100);
  const mainBranchShare = bhbShare * 0.10;         // KWTR = 10% of agent BHB
  const kwtrKdv = mainBranchShare * 1.20;          // KWTR + %20 KDV toplamı

  const contractType = employee?.contractType ?? "70/30";
  const marketCenterDue = contractType === "50/50"
    ? (bhbShare * 0.5 - mainBranchShare) - (bhbShare * 0.1)  // BHB×%30
    : (bhbShare - mainBranchShare) * 0.30;                    // BHB×%27

  // null capAmount = unlimited — full marketCenterDue is paid, no cap reduction
  const marketCenterActual = capAmount === null
    ? marketCenterDue
    : Math.min(marketCenterDue, Math.max(0, capAmount - capUsedSoFar));
  const capUsedAfter = capUsedSoFar + marketCenterActual;

  const bmKdv = marketCenterActual > 0 ? marketCenterActual * (bmKdvRatePct / 100) : 0;

  let ukShare = 0;
  if (employee?.uretkenlikKoclugu && employee?.uretkenlikKocluguOran) {
    const ukRate = (parseInt(employee.uretkenlikKocluguOran.replace(/[^0-9]/g, "")) || 5) / 100;
    ukShare = bhbShare * ukRate;
  }

  const employeeNet = bhbShare - kwtrKdv - marketCenterActual - bmKdv - ukShare;

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
    staleTime: 0,
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

function useUpdateClosing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/closings/${id}`, data),
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
  kasa: string;
  nakit: string;
  banka: string;
  // Breakdown values — auto-filled from calcAgentBreakdown, user can override any field
  bhbShare: string;
  mainBranchShare: string;
  kwtrKdv: string;
  marketCenterActual: string;
  bmKdv: string;
  bmKdvRatePct: string; // BM KDV rate as % of BHB, e.g. "0.40" = 0.40%
  ukShare: string;
  employeeNet: string;
  closingDate: string; // per-agent transaction date (YYYY-MM-DD); "" = inherit from parent closing
  status: string;       // "completed" | "expected" | "" (inherit)
  paymentCollected: boolean; // BM payı tahsil edildi mi
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
    kasa: "",
    nakit: "",
    banka: "",
    bhbShare: "",
    mainBranchShare: "",
    kwtrKdv: "",
    marketCenterActual: "",
    bmKdv: "",
    bmKdvRatePct: "0",
    ukShare: "",
    employeeNet: "",
    closingDate: "",
    status: "",
    paymentCollected: false,
    isManuallyEdited: false,
  };
}

function applyBreakdown(agent: AgentInputRow, bd: AgentBreakdown): AgentInputRow {
  const kasa = bd.kwtrKdv + bd.marketCenterActual + bd.bmKdv + bd.ukShare;
  const nakit = bd.marketCenterActual > 0 ? bd.marketCenterActual + bd.ukShare - bd.bhbShare * 0.02 : 0;
  const banka = kasa - nakit;
  return {
    ...agent,
    bhbShare: bd.bhbShare.toFixed(2),
    mainBranchShare: bd.mainBranchShare.toFixed(2),
    kwtrKdv: bd.kwtrKdv.toFixed(2),
    marketCenterActual: bd.marketCenterActual.toFixed(2),
    bmKdv: bd.bmKdv.toFixed(2),
    ukShare: bd.ukShare.toFixed(2),
    employeeNet: bd.employeeNet.toFixed(2),
    kasa: kasa.toFixed(2),
    nakit: nakit.toFixed(2),
    banka: banka.toFixed(2),
    isManuallyEdited: false,
  };
}

function deriveKasaNakitBanka(a: AgentInputRow): { kasa: string; nakit: string; banka: string } {
  const kwtrKdv = parseFloat(a.kwtrKdv || "0");
  const bm = parseFloat(a.marketCenterActual || "0");
  const bmKdv = parseFloat(a.bmKdv || "0");
  const uk = parseFloat(a.ukShare || "0");
  const bhb = parseFloat(a.bhbShare || "0");
  const kasa = kwtrKdv + bm + bmKdv + uk;
  const nakit = bm > 0 ? bm + uk - bhb * 0.02 : 0;
  const banka = kasa - nakit;
  return { kasa: kasa.toFixed(2), nakit: nakit.toFixed(2), banka: banka.toFixed(2) };
}

/** Recompute employeeNet from the stored deduction fields */
function deriveNet(a: AgentInputRow): string {
  const bhb = parseFloat(a.bhbShare || "0");
  const kwtrKdv = parseFloat(a.kwtrKdv || "0");
  const bm = parseFloat(a.marketCenterActual || "0");
  const bmKdv = parseFloat(a.bmKdv || "0");
  const uk = parseFloat(a.ukShare || "0");
  return (bhb - kwtrKdv - bm - bmKdv - uk).toFixed(2);
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
  defaultClosingDate,
  defaultStatus,
}: {
  sideLabel: string;
  sideKey: "buyer" | "seller" | "referral";
  side: SideState;
  setSide: (s: SideState) => void;
  saleValue: number;
  commissionRatePct: number;
  employees: any[];
  capStatuses: Record<number, CapStatus>;
  runningCapUsed: Record<number, number>;
  defaultClosingDate: string;
  defaultStatus: string;
}) {
  const activeEmployees = employees.filter((e) => e.status === "active");
  const newAgentWithDefaults = () => ({
    ...newAgent(),
    closingDate: defaultClosingDate,
    status: defaultStatus,
    // Completed transactions are paid by default; expected ones aren't.
    paymentCollected: defaultStatus === "completed",
  });

  const toggle = () => {
    if (side.enabled) {
      setSide({ enabled: false, agents: [newAgentWithDefaults()] });
    } else {
      setSide({ enabled: true, agents: [newAgentWithDefaults()] });
    }
  };

  const addAgent = () => {
    setSide({ ...side, agents: [...side.agents, newAgentWithDefaults()] });
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
  const splitOk = splitTotal <= 100.01;

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

            const bmKdvRate = parseFloat(agent.bmKdvRatePct || "0.40");

            const recalc = () => {
              if (!emp || saleValue <= 0 || splitPct <= 0) return;
              const bd = calcAgentBreakdown(saleValue, splitPct, emp, capUsedSoFar, capAmount, commissionRatePct, bmKdvRate);
              updateAgent(agent.id, applyBreakdown(agent, bd));
            };

            // Auto-fill when agent/split is first set and fields are empty
            const showBreakdown = !!emp && saleValue > 0 && splitPct > 0;
            if (showBreakdown && !agent.isManuallyEdited && agent.bhbShare === "") {
              const bd = calcAgentBreakdown(saleValue, splitPct, emp, capUsedSoFar, capAmount, commissionRatePct, bmKdvRate);
              // Trigger in next tick to avoid render-time setState
              setTimeout(() => updateAgent(agent.id, applyBreakdown(agent, bd)), 0);
            }

            const updateField = (field: keyof AgentInputRow, val: string) => {
              if (field === "bmKdvRatePct") {
                const rate = parseFloat(val) || 0;
                const bm = parseFloat(agent.marketCenterActual || "0");
                const updated = { ...agent, bmKdvRatePct: val, isManuallyEdited: true };
                updated.bmKdv = bm > 0 ? (bm * rate / 100).toFixed(2) : "0";
                updated.employeeNet = deriveNet(updated);
                const dk = deriveKasaNakitBanka(updated);
                updated.kasa = dk.kasa; updated.nakit = dk.nakit; updated.banka = dk.banka;
                updateAgent(agent.id, updated);
                return;
              }
              const updated = { ...agent, [field]: val, isManuallyEdited: true };
              // BM payı sıfırlanınca BM KDV de sıfırlanmalı
              if (field === "marketCenterActual") {
                const bm = parseFloat(val || "0");
                if (bm === 0) updated.bmKdv = "0";
                else {
                  const rate = parseFloat(agent.bmKdvRatePct || "0");
                  updated.bmKdv = (bm * rate / 100).toFixed(2);
                }
              }
              if (field !== "employeeNet") {
                updated.employeeNet = deriveNet(updated);
              }
              if (!["kasa", "nakit", "banka", "employeeNet"].includes(field)) {
                const dk = deriveKasaNakitBanka({ ...updated, [field]: val });
                updated.kasa = dk.kasa;
                updated.nakit = dk.nakit;
                updated.banka = dk.banka;
              }
              updateAgent(agent.id, updated);
            };

            return (
              <div key={agent.id} className="border border-border rounded-md p-3 bg-background space-y-2">
                {/* Agent selector + split */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground w-5">{idx + 1}.</span>
                  <div className="flex-1">
                    <EmployeePicker
                      employees={activeEmployees.map((e) => ({
                        id: e.id,
                        name: e.candidate?.name ?? `Çalışan #${e.id}`,
                        kwuid: e.kwuid,
                      }))}
                      value={agent.employeeId}
                      onChange={(id) => {
                        if (id == null) return;
                        updateAgent(agent.id, {
                          ...newAgentWithDefaults(),
                          id: agent.id,
                          employeeId: id,
                          splitPercentage: agent.splitPercentage,
                          closingDate: agent.closingDate || defaultClosingDate,
                          status: agent.status || defaultStatus,
                        });
                      }}
                      triggerClassName="h-8 text-xs"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={agent.splitPercentage}
                      onChange={(e) => updateAgent(agent.id, {
                        ...newAgentWithDefaults(),
                        id: agent.id,
                        employeeId: agent.employeeId,
                        splitPercentage: e.target.value,
                        closingDate: agent.closingDate || defaultClosingDate,
                        status: agent.status || defaultStatus,
                      })}
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

                {/* Per-agent date + approval status */}
                <div className="flex items-center gap-2 ml-5">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">İşlem Tarihi</span>
                  <Input
                    type="date"
                    value={agent.closingDate}
                    onChange={(e) => updateAgent(agent.id, { ...agent, closingDate: e.target.value, isManuallyEdited: true })}
                    className="h-7 text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextStatus = agent.status === "completed" ? "expected" : "completed";
                      updateAgent(agent.id, {
                        ...agent,
                        status: nextStatus,
                        // Auto-flip payment: completed default = paid, expected default = unpaid.
                        paymentCollected: nextStatus === "completed",
                        isManuallyEdited: true,
                      });
                    }}
                    className={`h-7 px-2 text-xs rounded border transition-colors shrink-0 ${
                      agent.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                        : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    {agent.status === "completed" ? "✓ Onaylı" : "⏳ Beklemede"}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAgent(agent.id, { ...agent, paymentCollected: !agent.paymentCollected, isManuallyEdited: true })}
                    className={`h-7 px-2 text-xs rounded border transition-colors shrink-0 ${
                      agent.paymentCollected
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                        : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                    }`}
                    title="BM payı tahsil edildi mi?"
                  >
                    {agent.paymentCollected ? "💰 Tahsil Edildi" : "💸 Bekliyor"}
                  </button>
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
                    <BreakdownField label="KWTR (10%)" prefix=" " value={agent.mainBranchShare} onChange={(v) => updateField("mainBranchShare", v)} />
                    <BreakdownField label="KWTR + KDV (toplam)" prefix="−" value={agent.kwtrKdv} onChange={(v) => updateField("kwtrKdv", v)} />
                    <BreakdownField label="BM (27%)" prefix="−" value={agent.marketCenterActual} onChange={(v) => updateField("marketCenterActual", v)} />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">BM KDV Oranı (% BM)</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={agent.bmKdvRatePct}
                          onChange={(e) => updateField("bmKdvRatePct", e.target.value)}
                          className="h-6 w-20 text-xs text-right px-1.5 py-0"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </div>
                    <BreakdownField label="BM KDV" prefix="−" value={agent.bmKdv} onChange={(v) => updateField("bmKdv", v)} />
                    <BreakdownField label="Üretkenlik Koçluğu" prefix="−" value={agent.ukShare} onChange={(v) => updateField("ukShare", v)} />
                    <BreakdownField label="Kasa" value={agent.kasa} onChange={(v) => updateField("kasa", v)} />
                    <BreakdownField label="Nakit" value={agent.nakit} onChange={(v) => updateField("nakit", v)} />
                    <BreakdownField label="Banka" value={agent.banka} onChange={(v) => updateField("banka", v)} />
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
                Pay toplamı %100'ü geçemez (şu an: %{splitTotal.toFixed(2)})
              </span>
            )}
            {splitOk && side.agents.length > 0 && (
              <span className="text-xs text-emerald-600">Pay: %{splitTotal.toFixed(2)} ✓</span>
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
  const totalKwtrKdv = rows.reduce((s, r) => s + r.kwtrKdv, 0);
  const totalBm      = rows.reduce((s, r) => s + r.mcActual, 0);
  const totalBmKdv   = rows.reduce((s, r) => s + r.bmKdv, 0);
  const totalUk      = rows.reduce((s, r) => s + r.uk, 0);
  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs">Danışman</TableHead>
            <TableHead className="text-xs">Taraf</TableHead>
            <TableHead className="text-xs text-right">Pay %</TableHead>
            <TableHead className="text-xs text-right">BHB</TableHead>
            <TableHead className="text-xs text-right">KWTR+KDV</TableHead>
            <TableHead className="text-xs text-right">BM</TableHead>
            <TableHead className="text-xs text-right text-amber-600">BM KDV</TableHead>
            <TableHead className="text-xs text-right">UK</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs font-medium">{r.name}</TableCell>
              <TableCell className="text-xs">
                <Badge variant="outline" className="text-[10px]">
                  {r.side === "buyer" ? "Alıcı" : r.side === "referral" ? "Yönlendirme" : "Satıcı"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-right">%{r.splitPct.toFixed(2)}</TableCell>
              <TableCell className="text-xs text-right">{fmtTRY(r.bhbShare)}</TableCell>
              <TableCell className="text-xs text-right text-muted-foreground">{fmtTRY(r.kwtrKdv)}</TableCell>
              <TableCell className="text-xs text-right text-muted-foreground">{fmtTRY(r.mcActual)}</TableCell>
              <TableCell className="text-xs text-right text-amber-600">{fmtTRY(r.bmKdv)}</TableCell>
              <TableCell className="text-xs text-right text-muted-foreground">{fmtTRY(r.uk)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/30 font-semibold">
            <TableCell colSpan={4} className="text-xs">Toplam</TableCell>
            <TableCell className="text-xs text-right">{fmtTRY(totalKwtrKdv)}</TableCell>
            <TableCell className="text-xs text-right">{fmtTRY(totalBm)}</TableCell>
            <TableCell className="text-xs text-right text-amber-600">{fmtTRY(totalBmKdv)}</TableCell>
            <TableCell className="text-xs text-right">{fmtTRY(totalUk)}</TableCell>
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
  editingClosing,
}: {
  open: boolean;
  onClose: () => void;
  employees: any[];
  capStatuses: Record<number, CapStatus>;
  editingClosing?: ClosingWithDetails | null;
}) {
  const { toast } = useToast();
  const createClosing = useCreateClosing();
  const updateClosing = useUpdateClosing();
  const isEditing = !!editingClosing;

  const [propertyAddress, setPropertyAddress] = useState("");
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [mahalle, setMahalle] = useState("");
  const [propertyDetails, setPropertyDetails] = useState("");
  const [dealCategory, setDealCategory] = useState<DealCategory>("Satış");
  const [dealType, setDealType] = useState<string>("Konut");
  const [saleValue, setSaleValue] = useState("");
  const [commissionRate, setCommissionRate] = useState("2");
  const [openingPrice, setOpeningPrice] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [customerSource, setCustomerSource] = useState("");
  const [referralInfo, setReferralInfo] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [closingDate, setClosingDate] = useState(new Date().toISOString().split("T")[0]);
  const [isExpected, setIsExpected] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [notes, setNotes] = useState("");
  const [buyerSide, setBuyerSide] = useState<SideState>({ enabled: false, agents: [newAgent()] });
  const [sellerSide, setSellerSide] = useState<SideState>({ enabled: false, agents: [newAgent()] });
  const [referralSide, setReferralSide] = useState<SideState>({ enabled: false, agents: [newAgent()] });

  const saleValueNum = parseFloat(saleValue || "0");
  const commissionRatePct = Math.max(0, parseFloat(commissionRate || (dealCategory === "Kiralık" ? "50" : "2")));
  const sideBHBPreview = saleValueNum > 0 ? saleValueNum * (commissionRatePct / 100) : 0;
  const saleValueLabel = dealCategory === "Kiralık" ? "Aylık Kira Bedeli (₺) *" : "Satış Bedeli (₺) *";

  // Compute per-side starting cap used:
  // buyerRunningCap = DB values (cap used before this closing)
  // sellerRunningCap = DB values + any buyer-side contributions for same employee
  const { buyerRunningCap, sellerRunningCap, referralRunningCap } = useMemo(() => {
    const allIds = new Set<number>();
    buyerSide.agents.forEach((a) => { if (a.employeeId) allIds.add(a.employeeId); });
    sellerSide.agents.forEach((a) => { if (a.employeeId) allIds.add(a.employeeId); });
    referralSide.agents.forEach((a) => { if (a.employeeId) allIds.add(a.employeeId); });

    const buyerStart: Record<number, number> = {};
    const afterBuyer: Record<number, number> = {};
    const afterSeller: Record<number, number> = {};
    for (const empId of allIds) {
      const dbUsed = capStatuses[empId]?.capUsed ?? 0;
      buyerStart[empId] = dbUsed;
      afterBuyer[empId] = dbUsed;
    }

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

    for (const empId of allIds) afterSeller[empId] = afterBuyer[empId] ?? 0;
    if (sellerSide.enabled) {
      for (const agent of sellerSide.agents) {
        if (!agent.employeeId) continue;
        const emp = employees.find((e) => e.id === agent.employeeId);
        if (!emp) continue;
        const capAmount = capStatuses[agent.employeeId]?.capAmount ?? null;
        const capUsedSoFar = afterSeller[agent.employeeId] ?? 0;
        const splitPct = parseFloat(agent.splitPercentage || "0");
        if (splitPct <= 0 || saleValueNum <= 0) continue;
        const bd = calcAgentBreakdown(saleValueNum, splitPct, emp, capUsedSoFar, capAmount, commissionRatePct);
        afterSeller[agent.employeeId] = bd.capUsedAfter;
      }
    }

    return { buyerRunningCap: buyerStart, sellerRunningCap: afterBuyer, referralRunningCap: afterSeller };
  }, [buyerSide, sellerSide, referralSide, saleValueNum, commissionRatePct, employees, capStatuses]);

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
    if (referralSide.enabled) processAgents(referralSide.agents, "referral");

    return rows;
  }, [buyerSide, sellerSide, referralSide, employees]);

  const resetForm = () => {
    setPropertyAddress(""); setIl(""); setIlce(""); setMahalle(""); setPropertyDetails("");
    setDealCategory("Satış"); setDealType("Çift Taraflı");
    setSaleValue(""); setCommissionRate("2"); setOpeningPrice(""); setDurationDays("");
    setCustomerSource(""); setReferralInfo(""); setContractStartDate(""); setContractEndDate("");
    setClosingDate(new Date().toISOString().split("T")[0]);
    setIsExpected(false);
    setBuyerName(""); setSellerName(""); setNotes("");
    setBuyerSide({ enabled: false, agents: [newAgent()] });
    setSellerSide({ enabled: false, agents: [newAgent()] });
    setReferralSide({ enabled: false, agents: [newAgent()] });
  };

  // Populate form when editing an existing closing
  useEffect(() => {
    if (!editingClosing) return;
    const e = editingClosing as any;
    setPropertyAddress(e.propertyAddress ?? "");
    setIl(e.il ?? "");
    setIlce(e.ilce ?? "");
    setMahalle(e.mahalle ?? "");
    setPropertyDetails(e.propertyDetails ?? "");
    setDealCategory((e.dealCategory ?? "Satış") as DealCategory);
    setDealType(e.dealType ?? "Konut");
    setSaleValue(e.saleValue ?? "");
    setCommissionRate(e.commissionRate ?? "2");
    setOpeningPrice(e.openingPrice ?? "");
    setDurationDays(e.durationDays != null ? String(e.durationDays) : "");
    setCustomerSource(e.customerSource ?? "");
    setReferralInfo(e.referralInfo ?? "");
    setContractStartDate(e.contractStartDate ? new Date(e.contractStartDate).toISOString().split("T")[0] : "");
    setContractEndDate(e.contractEndDate ? new Date(e.contractEndDate).toISOString().split("T")[0] : "");
    setClosingDate(e.closingDate ? new Date(e.closingDate).toISOString().split("T")[0] : "");
    setIsExpected(e.status === "expected");
    setBuyerName(e.buyerName ?? "");
    setSellerName(e.sellerName ?? "");
    setNotes(e.notes ?? "");

    const makeSideState = (sideType: string): SideState => {
      const matching = (e.sides ?? []).filter((s: any) => s.sideType === sideType);
      if (!matching.length) return { enabled: false, agents: [newAgent()] };
      const s = matching[0];
      return {
        enabled: true,
        agents: s.agents.map((a: any) => ({
          id: Math.random().toString(36).slice(2),
          employeeId: a.employeeId,
          splitPercentage: a.splitPercentage ?? "100",
          kasa: a.kasa ?? "",
          nakit: a.nakit ?? "",
          banka: a.banka ?? "",
          bhbShare: a.bhbShare ?? "",
          mainBranchShare: a.mainBranchShare ?? "",
          kwtrKdv: a.kwtrKdv ?? "",
          marketCenterActual: a.marketCenterActual ?? "",
          bmKdv: a.bmKdv ?? "",
          bmKdvRatePct: (() => {
            const bhb = parseFloat(a.bhbShare ?? "0");
            const kdv = parseFloat(a.bmKdv ?? "0");
            if (bhb > 0 && kdv > 0) return (kdv / bhb * 100).toFixed(4).replace(/\.?0+$/, "") || "0.40";
            return "0.40";
          })(),
          ukShare: a.ukShare ?? "",
          employeeNet: a.employeeNet ?? "",
          closingDate: a.closingDate ? new Date(a.closingDate).toISOString().split("T")[0] : "",
          status: a.status ?? "",
          paymentCollected: !!a.paymentCollected,
          isManuallyEdited: true,
        })),
      };
    };
    setBuyerSide(makeSideState("buyer"));
    setSellerSide(makeSideState("seller"));
    setReferralSide(makeSideState("referral"));
  }, [editingClosing]);

  const validate = (): string | null => {
    if (!saleValue || saleValueNum <= 0) return "Geçerli bir satış bedeli girin.";
    if (!buyerSide.enabled && !sellerSide.enabled && !referralSide.enabled) return "En az bir taraf seçilmelidir.";
    if (buyerSide.enabled) {
      if (buyerSide.agents.length === 0) return "Alıcı tarafında en az bir danışman olmalıdır.";
      if (buyerSide.agents.some((a) => !a.employeeId)) return "Alıcı tarafındaki tüm danışmanları seçin.";
      const total = buyerSide.agents.reduce((s, a) => s + parseFloat(a.splitPercentage || "0"), 0);
      if (total > 100.01) return `Alıcı tarafı pay toplamı %100'ü geçemez (şu an: %${total.toFixed(2)}).`;
    }
    if (sellerSide.enabled) {
      if (sellerSide.agents.length === 0) return "Satıcı tarafında en az bir danışman olmalıdır.";
      if (sellerSide.agents.some((a) => !a.employeeId)) return "Satıcı tarafındaki tüm danışmanları seçin.";
      const total = sellerSide.agents.reduce((s, a) => s + parseFloat(a.splitPercentage || "0"), 0);
      if (total > 100.01) return `Satıcı tarafı pay toplamı %100'ü geçemez (şu an: %${total.toFixed(2)}).`;
    }
    if (referralSide.enabled) {
      if (referralSide.agents.length === 0) return "Yönlendirme tarafında en az bir danışman olmalıdır.";
      if (referralSide.agents.some((a) => !a.employeeId)) return "Yönlendirme tarafındaki tüm danışmanları seçin.";
      const total = referralSide.agents.reduce((s, a) => s + parseFloat(a.splitPercentage || "0"), 0);
      if (total > 100.01) return `Yönlendirme tarafı pay toplamı %100'ü geçemez (şu an: %${total.toFixed(2)}).`;
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
        kasa: a.kasa || "0",
        nakit: a.nakit || "0",
        banka: a.banka || "0",
        closingDate: a.closingDate || null,
        status: a.status || null,
        paymentCollected: a.paymentCollected,
      }));

    const sides = [];
    if (buyerSide.enabled) sides.push({ sideType: "buyer", agents: mapAgents(buyerSide.agents) });
    if (sellerSide.enabled) sides.push({ sideType: "seller", agents: mapAgents(sellerSide.agents) });
    if (referralSide.enabled) sides.push({ sideType: "referral", agents: mapAgents(referralSide.agents) });

    const payload = {
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
      closingDate: (!isExpected && closingDate) ? new Date(closingDate).toISOString() : null,
      status: isExpected ? "expected" : "completed",
      buyerName: buyerName.trim() || null,
      sellerName: sellerName.trim() || null,
      notes: notes.trim() || null,
      sides,
    };

    try {
      if (isEditing && editingClosing) {
        await updateClosing.mutateAsync({ id: editingClosing.id, ...payload });
        toast({ title: "Başarılı", description: "Kapanış güncellendi." });
      } else {
        await createClosing.mutateAsync(payload);
        toast({ title: "Başarılı", description: "Kapanış kaydedildi." });
      }
      resetForm();
      onClose();
    } catch (e: any) {
      toast({ title: "Hata", description: e?.message ?? "Kapanış kaydedilemedi.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" />
            {isEditing ? "Kapanışı Düzenle" : "Yeni Kapanış"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── 1. İşlem Bilgileri — en üstte */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-foreground">İşlem Bilgileri</h3>
            <div className="grid grid-cols-2 gap-3">
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
                <Label className="text-xs">Kapanış Durumu</Label>
                <div className="mt-1 flex items-center gap-1 border rounded-md p-0.5 bg-muted/30 w-fit">
                  <button
                    type="button"
                    onClick={() => setIsExpected(false)}
                    className={`px-3 py-1 text-xs rounded font-medium transition-colors ${!isExpected ? "bg-white dark:bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Tamamlanan
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExpected(true)}
                    className={`px-3 py-1 text-xs rounded font-medium transition-colors ${isExpected ? "bg-amber-100 text-amber-700 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Beklenen
                  </button>
                </div>
              </div>
              {!isExpected && (
                <div>
                  <Label className="text-xs">Kapanış Tarihi</Label>
                  <Input type="date" className="mt-1 h-8 text-sm" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
                </div>
              )}
            </div>
          </section>

          {/* ── 2. Temsil Tarafları */}
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
                defaultClosingDate={closingDate}
                defaultStatus={isExpected ? "expected" : "completed"}
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
                defaultClosingDate={closingDate}
                defaultStatus={isExpected ? "expected" : "completed"}
              />
              <SideSection
                sideLabel="Yönlendirme Tarafı"
                sideKey="referral"
                side={referralSide}
                setSide={setReferralSide}
                saleValue={saleValueNum}
                commissionRatePct={commissionRatePct}
                employees={employees}
                capStatuses={capStatuses}
                runningCapUsed={referralRunningCap}
                defaultClosingDate={closingDate}
                defaultStatus={isExpected ? "expected" : "completed"}
              />
            </div>
          </section>

          {/* ── 3. Hesap Özeti */}
          {summaryRows.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-3 text-foreground">Hesap Özeti</h3>
              <SummaryTable rows={summaryRows} />
            </section>
          )}

          {/* ── 4. Mülk & Diğer Bilgiler */}
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
                <Input className="mt-1 h-8 text-sm" placeholder="İl..." value={il} onChange={(e) => setIl(e.target.value)} />
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
                <Label className="text-xs">Alıcı Adı</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="Alıcı adı..." value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Satıcı Adı</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="Satıcı adı..." value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onClose(); }}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={createClosing.isPending || updateClosing.isPending}>
            {(createClosing.isPending || updateClosing.isPending) ? "Kaydediliyor..." : isEditing ? "Güncelle" : "Kaydet"}
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
  const [editingClosing, setEditingClosing] = useState<ClosingWithDetails | null>(null);
  const [tab, setTab] = useState<Tab>("closings");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "expected">("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [officeFilter, setOfficeFilter] = useState<"all" | "Akatlar" | "Zekeriyaköy">("all");
  const [advisorFilter, setAdvisorFilter] = useState("");
  const [advisorDropdownOpen, setAdvisorDropdownOpen] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<number>>(new Set());
  // null sortKey = default order (closingId DESC)
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const PAGE_SIZE = 50;

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [phantomWidth, setPhantomWidth] = useState(2800);

  useEffect(() => {
    const updateWidth = () => {
      if (tableScrollRef.current) {
        setPhantomWidth(tableScrollRef.current.scrollWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const syncFromTop = useCallback(() => {
    if (tableScrollRef.current && topScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  }, []);

  const syncFromTable = useCallback(() => {
    if (topScrollRef.current && tableScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
  }, []);

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingClosing(null);
  };

  const handleEdit = (closingId: number) => {
    const c = closings.find((x) => x.id === closingId);
    if (!c) return;
    setEditingClosing(c);
    setDialogOpen(true);
  };

  const { data: closings = [], isLoading: closingsLoading } = useClosings();
  const { data: employees = [] } = useEmployees();
  const { data: capStatuses = {} } = useCapStatuses();
  const deleteClosing = useDeleteClosing();

  // Available years from all agents (use agent's effective date or createdAt fallback)
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const c of closings) {
      for (const side of c.sides) {
        for (const agent of side.agents) {
          const d = (agent as any).closingDate ?? (c as any).closingDate ?? (c as any).createdAt;
          if (d) years.add(new Date(d).getFullYear().toString());
        }
      }
      // Always include closing-level even if it has no agents
      if (!c.sides.length || !c.sides.some(s => s.agents.length > 0)) {
        const d = (c as any).closingDate ?? (c as any).createdAt;
        if (d) years.add(new Date(d).getFullYear().toString());
      }
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [closings]);

  // Per-agent rows (with effective date/status from agent OR fallback to closing)
  // Used for both upper summary cards AND list view, so onay/tarih danışman bazında ilerler.
  const agentRowsAll = useMemo(() => {
    const rows: Array<{
      closing: any; agent: any; sideType: string;
      effectiveDate: string | null; effectiveStatus: string;
    }> = [];
    for (const c of closings) {
      for (const side of c.sides) {
        for (const agent of side.agents) {
          const agentDate = (agent as any).closingDate ?? null;
          const agentStatus = (agent as any).status ?? null;
          const effDateRaw = agentDate ?? (c as any).closingDate ?? null;
          const effDate = effDateRaw ? new Date(effDateRaw).toISOString().split("T")[0] : null;
          const effStatus = agentStatus ?? (c as any).status ?? "completed";
          rows.push({ closing: c, agent, sideType: side.sideType, effectiveDate: effDate, effectiveStatus: effStatus });
        }
      }
    }
    return rows;
  }, [closings]);

  const employeeOfficeMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const e of employees) {
      map[e.id] = (e as any).candidate?.office ?? "";
    }
    return map;
  }, [employees]);

  // Year + month filtered AGENT rows for stats
  const yearFilteredAgentRows = useMemo(() => {
    let rows = agentRowsAll;
    if (yearFilter !== "all" || monthFilter !== "all") {
      rows = rows.filter(r => {
        const dRef = r.effectiveStatus === "expected"
          ? (r.effectiveDate ?? ((r.closing as any).createdAt ? new Date((r.closing as any).createdAt).toISOString().split("T")[0] : null))
          : r.effectiveDate;
        if (!dRef) return false;
        const matchYear = yearFilter === "all" || dRef.slice(0, 4) === yearFilter;
        const matchMonth = monthFilter === "all" || dRef.slice(5, 7) === monthFilter;
        return matchYear && matchMonth;
      });
    }
    if (officeFilter !== "all") {
      rows = rows.filter(r => employeeOfficeMap[(r.agent as any).employeeId] === officeFilter);
    }
    if (advisorFilter) {
      const q = advisorFilter.toLowerCase();
      rows = rows.filter(r => {
        const name: string = (r.agent as any).candidateName ?? (r.agent as any).employeeName ?? "";
        return name.toLowerCase().includes(q);
      });
    }
    return rows;
  }, [agentRowsAll, yearFilter, monthFilter, officeFilter, advisorFilter, employeeOfficeMap]);

  const completedAgentRows = yearFilteredAgentRows.filter(r => r.effectiveStatus !== "expected");
  const expectedAgentRows  = yearFilteredAgentRows.filter(r => r.effectiveStatus === "expected");

  // Fractional işlem adedi per agent (BHB share / per-side BHB)
  const sumIslemAdetAgents = (rows: typeof agentRowsAll) => rows.reduce((s, r) => {
    const sale = parseFloat(r.closing.saleValue ?? "0");
    const perSide = r.closing.dealCategory === "Kiralık" ? sale / 2 : sale * parseFloat(r.closing.commissionRate ?? "0") / 100;
    if (perSide <= 0) return s;
    return s + parseFloat(r.agent.bhbShare ?? "0") / perSide;
  }, 0);
  const sumBHBAgents = (rows: typeof agentRowsAll) => rows.reduce((s, r) => s + parseFloat(r.agent.bhbShare ?? "0"), 0);
  const sumBMAgents  = (rows: typeof agentRowsAll) => rows.reduce((s, r) => s + parseFloat(r.agent.marketCenterActual ?? "0"), 0);
  // Volume = sum of unique closing sale values. Mixed-status closings (≥1 completed agent
  // + ≥1 expected agent) go to "completed" only — avoids double counting in Toplam row.
  const completedClosingIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of completedAgentRows) ids.add(r.closing.id);
    return ids;
  }, [completedAgentRows]);
  const sumVolumeAgents = (rows: typeof agentRowsAll, excludeIds?: Set<number>) => {
    const seen = new Set<number>();
    let total = 0;
    for (const r of rows) {
      if (seen.has(r.closing.id)) continue;
      if (excludeIds?.has(r.closing.id)) continue;
      seen.add(r.closing.id);
      total += parseFloat(r.closing.saleValue ?? "0");
    }
    return total;
  };

  const completedSides = sumIslemAdetAgents(completedAgentRows);
  const expectedSides  = sumIslemAdetAgents(expectedAgentRows);
  const completedVolume = sumVolumeAgents(completedAgentRows);
  const expectedVolume  = sumVolumeAgents(expectedAgentRows, completedClosingIds);
  const completedBHB = sumBHBAgents(completedAgentRows);
  const expectedBHB  = sumBHBAgents(expectedAgentRows);
  const completedBM  = sumBMAgents(completedAgentRows);
  const expectedBM   = sumBMAgents(expectedAgentRows);

  // Flatten closings into one row per agent per side
  type FlatRow = {
    closingId: number; sideId: number; agentId: number;
    status: string; createdAt: string;
    closingDate: string; propertyAddress: string; il: string; ilce: string;
    mahalle: string; propertyDetails: string;
    dealCategory: string; dealType: string; saleValue: string; commissionRate: string;
    openingPrice: string; durationDays: string;
    customerSource: string; referralInfo: string;
    contractStartDate: string; contractEndDate: string;
    kasa: string; nakit: string; banka: string;
    buyerName: string; sellerName: string; notes: string;
    sideType: string;
    employeeId: number; employeeName: string;
    splitPercentage: string; bhbShare: string; mainBranchShare: string;
    kwtrKdv: string; marketCenterActual: string; marketCenterDue: string;
    bmKdv: string; ukShare: string; employeeNet: string;
    paymentCollected: boolean;
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
          const agentDate = (agent as any).closingDate ?? null;
          const agentStatus = (agent as any).status ?? null;
          const effectiveDate = agentDate ?? c.closingDate ?? null;
          const effectiveStatus = agentStatus ?? (c as any).status ?? "completed";
          rows.push({
            closingId: c.id,
            sideId: side.id,
            agentId: agent.id,
            status: effectiveStatus,
            createdAt: (c as any).createdAt ? new Date((c as any).createdAt).toISOString().split("T")[0] : "",
            closingDate: effectiveDate ? new Date(effectiveDate).toISOString().split("T")[0] : "",
            propertyAddress: c.propertyAddress ?? "",
            il: (c as any).il ?? "",
            ilce: (c as any).ilce ?? "",
            mahalle: (c as any).mahalle ?? "",
            propertyDetails: (c as any).propertyDetails ?? "",
            dealCategory: c.dealCategory ?? "Satış",
            dealType: c.dealType ?? "",
            saleValue: c.saleValue ?? "",
            commissionRate: c.commissionRate ?? "2",
            openingPrice: (c as any).openingPrice ?? "",
            durationDays: (c as any).durationDays != null ? String((c as any).durationDays) : "",
            customerSource: (c as any).customerSource ?? "",
            referralInfo: (c as any).referralInfo ?? "",
            contractStartDate: (c as any).contractStartDate ? new Date((c as any).contractStartDate).toISOString().split("T")[0] : "",
            contractEndDate: (c as any).contractEndDate ? new Date((c as any).contractEndDate).toISOString().split("T")[0] : "",
            kasa: (agent as any).kasa ?? "",
            nakit: (agent as any).nakit ?? "",
            banka: (agent as any).banka ?? "",
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
            paymentCollected: !!(agent as any).paymentCollected,
            isFirstOfClosing: firstOfClosing,
            closingAgentCount: agentCount,
          });
          firstOfClosing = false;
        }
      }
    }
    return rows;
  }, [closings]);

  // Filter by status + year + search query
  const filteredRows = useMemo(() => {
    let rows = statusFilter === "all" ? flatRows : flatRows.filter(r => r.status === statusFilter);
    if (yearFilter !== "all" || monthFilter !== "all") rows = rows.filter(r => {
      const d = String(r.status === "expected" ? (r.closingDate || r.createdAt) : r.closingDate);
      const matchYear = yearFilter === "all" || d.slice(0, 4) === yearFilter;
      const matchMonth = monthFilter === "all" || d.slice(5, 7) === monthFilter;
      return matchYear && matchMonth;
    });
    if (officeFilter !== "all") rows = rows.filter(r => employeeOfficeMap[r.employeeId] === officeFilter);
    if (advisorFilter) {
      const q = advisorFilter.toLowerCase();
      rows = rows.filter(r => r.employeeName.toLowerCase().includes(q));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) =>
        row.propertyAddress.toLowerCase().includes(q) ||
        row.employeeName.toLowerCase().includes(q) ||
        row.buyerName.toLowerCase().includes(q) ||
        row.sellerName.toLowerCase().includes(q) ||
        row.il.toLowerCase().includes(q) ||
        row.ilce.toLowerCase().includes(q) ||
        row.closingDate.includes(q)
      );
    }
    // Default order: closingId DESC. Custom column sort overrides it.
    const collator = new Intl.Collator("tr", { sensitivity: "base" });
    const cmpNum = (a: string, b: string) => parseFloat(a || "0") - parseFloat(b || "0");
    const cmpStr = (a: string, b: string) => collator.compare(a || "", b || "");
    const islemAdediVal = (r: FlatRow) => calcIslemOrani(r.bhbShare, r.saleValue, r.commissionRate, r.dealCategory);
    const discountPctVal = (r: FlatRow) => {
      const o = parseFloat(r.openingPrice || "0");
      const s = parseFloat(r.saleValue || "0");
      return o > 0 ? (o - s) / o * 100 : -Infinity;
    };
    const sortCmp = (a: FlatRow, b: FlatRow): number => {
      if (!sortKey) return b.closingId - a.closingId;
      let v = 0;
      switch (sortKey) {
        case "islemAdedi":   v = islemAdediVal(a) - islemAdediVal(b); break;
        case "discountPct":  v = discountPctVal(a) - discountPctVal(b); break;
        case "saleValue": case "bhbShare": case "mainBranchShare": case "kwtrKdv":
        case "marketCenterActual": case "bmKdv": case "employeeNet": case "kasa":
        case "nakit": case "banka": case "commissionRate": case "openingPrice":
        case "splitPercentage": case "durationDays":
          v = cmpNum((a as any)[sortKey], (b as any)[sortKey]); break;
        default:
          v = cmpStr(String((a as any)[sortKey] ?? ""), String((b as any)[sortKey] ?? ""));
      }
      if (v === 0) return b.closingId - a.closingId; // stable secondary
      return sortDir === "asc" ? v : -v;
    };
    rows = [...rows].sort(sortCmp);
    // Recalculate isFirstOfClosing in current order so edit/delete buttons land on
    // the first row of each closing group regardless of sort/filter.
    const seenClosings = new Set<number>();
    return rows.map((row) => {
      const first = !seenClosings.has(row.closingId);
      if (first) seenClosings.add(row.closingId);
      return first === row.isFirstOfClosing ? row : { ...row, isFirstOfClosing: first };
    });
  }, [flatRows, search, statusFilter, yearFilter, monthFilter, officeFilter, advisorFilter, sortKey, sortDir, employeeOfficeMap]);

  // Reset to page 1 when filters or sort change
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, yearFilter, monthFilter, officeFilter, advisorFilter, sortKey, sortDir]);

  // Click handler for column headers: cycle through asc → desc → default
  const handleColumnSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("desc"); return; }
    if (sortDir === "desc") { setSortDir("asc"); return; }
    setSortKey(null); setSortDir("desc");
  };

  // Paginate by closing (keep agent rows of the same closing together)
  const { pagedRows, totalClosingsFiltered, totalPages } = useMemo(() => {
    const seenIds: number[] = [];
    const seen = new Set<number>();
    for (const row of filteredRows) {
      if (!seen.has(row.closingId)) { seenIds.push(row.closingId); seen.add(row.closingId); }
    }
    const total = seenIds.length;
    const pageIds = new Set(seenIds.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));
    return {
      pagedRows: filteredRows.filter((r) => pageIds.has(r.closingId)),
      totalClosingsFiltered: total,
      totalPages: Math.ceil(total / PAGE_SIZE) || 1,
    };
  }, [filteredRows, currentPage, PAGE_SIZE]);

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

  // Accepts YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY (and single-digit day/month). Returns Date or null.
  const parseUserDate = (input: string): Date | null => {
    const s = input.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? null : d; }
    m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return isNaN(d.getTime()) ? null : d; }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const handleApproveAgent = async (agentId: number, currentDate?: string | null) => {
    const def = currentDate || new Date().toISOString().split("T")[0];
    const date = window.prompt("Danışmanın işlem tarihini girin (GG.AA.YYYY veya YYYY-AA-GG):", def);
    if (!date) return;
    const parsed = parseUserDate(date);
    if (!parsed) {
      toast({ title: "Hata", description: "Geçersiz tarih. Örnek: 07.06.2026", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`/api/closing-agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Approval implies payment was collected — admin can flag pending separately if needed.
        body: JSON.stringify({ status: "completed", closingDate: parsed.toISOString(), paymentCollected: true }),
      });
      if (!res.ok) {
        toast({ title: "Onaylanamadı", description: `Sunucu hatası (${res.status})`, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/closings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
      toast({ title: "Onaylandı", description: "Danışman işlemi onaylandı." });
    } catch {
      toast({ title: "Hata", description: "Güncelleme başarısız (ağ hatası).", variant: "destructive" });
    }
  };

  const handleConfirm = async (closingId: number, currentDate?: string | null) => {
    const def = currentDate && currentDate.length >= 10
      ? currentDate.slice(0, 10)
      : new Date().toISOString().split("T")[0];
    const date = window.prompt("Kapanış tarihini girin (GG.AA.YYYY veya YYYY-AA-GG):", def);
    if (!date) return;
    const parsed = parseUserDate(date);
    if (!parsed) {
      toast({ title: "Hata", description: "Geçersiz tarih. Örnek: 07.06.2026", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`/api/closings/${closingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ closingDate: parsed.toISOString(), status: "completed" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Onaylanamadı", description: err.message || `Sunucu hatası (${res.status})`, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/closings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
      setStatusFilter("all");
      toast({ title: "Onaylandı", description: "Kapanış tamamlandı olarak işaretlendi." });
    } catch {
      toast({ title: "Hata", description: "Güncelleme başarısız (ağ hatası).", variant: "destructive" });
    }
  };

  const handleNotifyAgent = async (agentId: number, employeeName: string) => {
    if (!window.confirm(`${employeeName} danışmanına WhatsApp bildirimi gönderilsin mi?`)) return;
    try {
      const res = await fetch(`/api/closing-agents/${agentId}/notify`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Gönderilemedi", description: data.message || `Sunucu hatası (${res.status})`, variant: "destructive" });
        return;
      }
      if (data.sent > 0) {
        toast({ title: "Gönderildi", description: `${employeeName} kişisine WhatsApp gönderildi.` });
      } else {
        toast({ title: "Gönderilemedi", description: "Telefonu kayıtlı değil veya WhatsApp yapılandırılmamış.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Hata", description: "Bildirim gönderilemedi (ağ hatası).", variant: "destructive" });
    }
  };

  const advisorNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of flatRows) if (r.employeeName) names.add(r.employeeName);
    return [...names].sort((a, b) => a.localeCompare(b, "tr"));
  }, [flatRows]);

  const handleBulkApprove = async () => {
    if (selectedAgentIds.size === 0) return;
    const def = new Date().toISOString().split("T")[0];
    const date = window.prompt(`${selectedAgentIds.size} işlemi onaylamak için tarih girin (GG.AA.YYYY veya YYYY-AA-GG):`, def);
    if (!date) return;
    const parsed = parseUserDate(date);
    if (!parsed) {
      toast({ title: "Hata", description: "Geçersiz tarih. Örnek: 07.06.2026", variant: "destructive" });
      return;
    }
    let success = 0;
    for (const agentId of selectedAgentIds) {
      try {
        const res = await fetch(`/api/closing-agents/${agentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "completed", closingDate: parsed.toISOString(), paymentCollected: true }),
        });
        if (res.ok) success++;
      } catch { /* continue */ }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/closings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
    setSelectedAgentIds(new Set());
    toast({ title: "Onaylandı", description: `${success} / ${selectedAgentIds.size} işlem onaylandı.` });
  };

  const handleExport = () => {
    const fmtMonth = (d: string) => {
      if (!d) return "";
      const [y, m] = d.split("-");
      return m && y ? `${m}/${y}` : d;
    };
    const sideLabel = (t: string) => t === "buyer" ? "Alıcı" : t === "referral" ? "Yönlendirme" : "Satıcı";
    const discountRate = (opening: string, sale: string) => {
      const o = parseFloat(opening), s = parseFloat(sale);
      return o > 0 ? ((o - s) / o * 100).toFixed(2) : "";
    };
    // Build employee lookup for KWUID and ÜK rate
    const empMap = new Map<number, any>();
    for (const e of employees) empMap.set(e.id, e);

    const headers = [
      "No", "",
      "Danışman", "KWUID", "İlgili Ay", "İşlem", "İşlem Tipi", "Taraf", "CAP", "ÜK",
      "İşlem Tarihi", "İşlem Değeri", "BHB", "KWTR", "KWTR (+KDV)", "PlatinKarma", "PlatinKarma\n(KDV)",
      "ÜK", "Danışman", "Kasa", "Nakit", "Banka",
      "BHB Oranı", "İşlem Hacmi", "İşlem\nOranı \n(Taraf Sayısı)",
      "İl", "İlçe", "Semt/Mahalle", "Adres", "Mülkle İlgili Detay Bilgiler",
      "Açılış Rakamı", "Kapanış Rakamı", "İndirim \nOranı", "Süre/Gün",
      "Müşteri nereden buldu?", "Yönlendirme Bilgisi",
      "Sözleşme Başlangıç Tarihi", "Sözleşme Bitiş Tarihi",
      "İşlemi Alan", "Ödemeyi Alan", "notlar",
    ];

    const rowsData = filteredRows.map((r, idx) => {
      const emp = empMap.get(r.employeeId);
      const kwuid = emp?.kwuid ?? "";
      const ukRate = emp?.uretkenlikKoclugu && emp?.uretkenlikKocluguOran
        ? emp.uretkenlikKocluguOran
        : "";
      const capStatus = capStatuses[r.employeeId];
      const capLabel = capStatus
        ? (capStatus.capRemaining <= 0 ? "Capper" : "")
        : "";
      const totalBhb = (parseFloat(r.saleValue || "0") * parseFloat(r.commissionRate || "0") / 100).toFixed(2);
      const islemOrani = calcIslemOrani(r.bhbShare, r.saleValue, r.commissionRate, r.dealCategory).toFixed(4);

      return [
        idx + 1,                        // No
        "",                             // (empty)
        r.employeeName,                 // Danışman
        kwuid,                          // KWUID
        fmtMonth(r.closingDate),        // İlgili Ay
        r.dealCategory,                 // İşlem
        r.dealType,                     // İşlem Tipi
        sideLabel(r.sideType),          // Taraf
        capLabel,                       // CAP
        ukRate,                         // ÜK (oran)
        r.closingDate,                  // İşlem Tarihi
        r.bhbShare,                     // İşlem Değeri
        totalBhb,                       // BHB (toplam)
        r.mainBranchShare,              // KWTR
        r.kwtrKdv,                      // KWTR (+KDV)
        r.marketCenterActual,           // PlatinKarma
        r.bmKdv,                        // PlatinKarma (KDV)
        r.ukShare,                      // ÜK (tutar)
        r.employeeNet,                  // Danışman
        r.kasa,                         // Kasa
        r.nakit,                        // Nakit
        r.banka,                        // Banka
        r.commissionRate,               // BHB Oranı
        r.saleValue,                    // İşlem Hacmi
        islemOrani,                     // İşlem Oranı (Taraf Sayısı)
        r.il,                           // İl
        r.ilce,                         // İlçe
        r.mahalle,                      // Semt/Mahalle
        r.propertyAddress,              // Adres
        r.propertyDetails,              // Mülkle İlgili Detay Bilgiler
        r.openingPrice,                 // Açılış Rakamı
        r.saleValue,                    // Kapanış Rakamı
        discountRate(r.openingPrice, r.saleValue), // İndirim Oranı
        r.durationDays,                 // Süre/Gün
        r.customerSource,               // Müşteri nereden buldu?
        r.referralInfo,                 // Yönlendirme Bilgisi
        r.contractStartDate,            // Sözleşme Başlangıç Tarihi
        r.contractEndDate,              // Sözleşme Bitiş Tarihi
        r.buyerName,                    // İşlemi Alan
        r.sellerName,                   // Ödemeyi Alan
        r.notes,                        // notlar
      ];
    });

    const csv = [headers, ...rowsData]
      .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kapanislar_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const raw = await file.text();
      // Normalize newlines inside quoted fields before splitting \u2014 handles multiline Excel headers like "PlatinKarma\n(KDV)"
      let cleaned = raw.replace(/^\uFEFF/, "");
      {
        let result = "", inQ = false;
        for (let i = 0; i < cleaned.length; i++) {
          const c = cleaned[i];
          if (c === '"') { inQ = !inQ; result += c; }
          else if (inQ && (c === '\r' || c === '\n')) { result += ' '; }
          else result += c;
        }
        cleaned = result;
      }
      const lines = cleaned.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { toast({ title: "Hata", description: "CSV boş veya geçersiz.", variant: "destructive" }); return; }

      const isTab = lines[0].includes('\t');

      const parseRow = (line: string): string[] => {
        if (isTab) return line.split('\t');
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

      // Deduplicate headers — second "ÜK" becomes "ÜK_1", second "Danışman" → "Danışman_1", etc.
      const rawHeaders = parseRow(lines[0]);
      const seen: Record<string, number> = {};
      const headers = rawHeaders.map((h) => {
        const k = h.trim().replace(/\s+/g, " ");
        if (seen[k] !== undefined) { seen[k]++; return `${k}_${seen[k]}`; }
        seen[k] = 0; return k;
      });

      const rows = lines.slice(1).map((line) => {
        const vals = parseRow(line);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { if (h) obj[h] = (vals[i] ?? "").trim(); });
        return obj;
      }).filter((r) => r["Mülk Adresi"] || r["Adres"] || r["Danışman"] || r["KWUID"]);

      if (rows.length === 0) { toast({ title: "Hata", description: `İçe aktarılacak satır bulunamadı. Sütunlar: ${headers.slice(0, 8).join(", ")}`, variant: "destructive" }); return; }

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

        {/* Summary table */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-4 w-32"></th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-2 px-4">
                    <span className="flex items-center justify-end gap-1"><Handshake className="h-3 w-3" />Kapanış</span>
                  </th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-2 px-4">
                    <span className="flex items-center justify-end gap-1"><TrendingUp className="h-3 w-3" />İşlem Hacmi</span>
                  </th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-2 px-4">
                    <span className="flex items-center justify-end gap-1"><DollarSign className="h-3 w-3" />BHB</span>
                  </th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-2 px-4">
                    <span className="flex items-center justify-end gap-1"><Users className="h-3 w-3" />BM Payı</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 px-4 text-xs font-medium text-emerald-700">Tamamlanan</td>
                  <td className="py-2.5 px-4 text-right font-semibold">{Math.round(completedSides)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold">{fmtTRY(completedVolume)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold">{fmtTRY(completedBHB)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-blue-700">{fmtTRY(completedBM)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 px-4 text-xs font-medium text-amber-600">Beklenen</td>
                  <td className="py-2.5 px-4 text-right text-amber-600 font-semibold">{Math.round(expectedSides)}</td>
                  <td className="py-2.5 px-4 text-right text-amber-600 font-semibold">{fmtTRY(expectedVolume)}</td>
                  <td className="py-2.5 px-4 text-right text-amber-600 font-semibold">{fmtTRY(expectedBHB)}</td>
                  <td className="py-2.5 px-4 text-right text-amber-600 font-semibold">{fmtTRY(expectedBM)}</td>
                </tr>
                <tr className="bg-muted/30">
                  <td className="py-2.5 px-4 text-xs font-semibold">Toplam</td>
                  <td className="py-2.5 px-4 text-right font-bold">{Math.round(completedSides + expectedSides)}</td>
                  <td className="py-2.5 px-4 text-right font-bold">{fmtTRY(completedVolume + expectedVolume)}</td>
                  <td className="py-2.5 px-4 text-right font-bold">{fmtTRY(completedBHB + expectedBHB)}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-blue-700">{fmtTRY(completedBM + expectedBM)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Status filter + Year filter + Search bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/30">
            {(["all", "Akatlar", "Zekeriyaköy"] as const).map((o) => (
              <button
                key={o}
                onClick={() => { setOfficeFilter(o); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  officeFilter === o
                    ? "bg-white dark:bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o === "all" ? "Tüm Ofisler" : o}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/30">
            {(["all", ...availableYears] as string[]).map((y) => (
              <button
                key={y}
                onClick={() => { setYearFilter(y); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  yearFilter === y
                    ? "bg-white dark:bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {y === "all" ? "Tüm Yıllar" : y}
              </button>
            ))}
          </div>
          <select
            value={monthFilter}
            onChange={(e) => { setMonthFilter(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs rounded-md border bg-muted/30 px-2 font-medium"
          >
            <option value="all">Tüm Aylar</option>
            {MONTHS_TR.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/30">
            {(["all", "completed", "expected"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setStatusFilter(f); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  statusFilter === f
                    ? "bg-white dark:bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "Tümü" : f === "completed" ? "Tamamlanan" : "Beklenen"}
              </button>
            ))}
          </div>
          {/* Advisor combobox */}
          <div className="relative">
            <Input
              placeholder="Danışman filtrele..."
              value={advisorFilter}
              onChange={(e) => { setAdvisorFilter(e.target.value); setAdvisorDropdownOpen(true); }}
              onFocus={() => setAdvisorDropdownOpen(true)}
              onBlur={() => setTimeout(() => setAdvisorDropdownOpen(false), 150)}
              className="h-8 text-sm w-44"
            />
            {advisorFilter && (
              <button
                onClick={() => { setAdvisorFilter(""); setCurrentPage(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm leading-none"
              >
                ×
              </button>
            )}
            {advisorDropdownOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto w-44">
                {advisorNames
                  .filter(n => !advisorFilter || n.toLowerCase().includes(advisorFilter.toLowerCase()))
                  .slice(0, 12)
                  .map(name => (
                    <button
                      key={name}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
                      onMouseDown={() => { setAdvisorFilter(name); setAdvisorDropdownOpen(false); setCurrentPage(1); }}
                    >
                      {name}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <Input
            placeholder="Ara: adres, alıcı, satıcı, il, tarih..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm max-w-xs"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">
              Temizle
            </button>
          )}
          {selectedAgentIds.size > 0 && (
            <button
              onClick={handleBulkApprove}
              className="h-8 px-3 text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
            >
              {selectedAgentIds.size} işlemi onayla
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {totalClosingsFiltered} kapanış
            {totalPages > 1 && ` · Sayfa ${currentPage}/${totalPages}`}
          </span>
        </div>

        {/* Top phantom scrollbar — synced with table */}
        <div
          ref={topScrollRef}
          className="overflow-x-auto"
          onScroll={syncFromTop}
          style={{ height: 12 }}
        >
          <div style={{ width: phantomWidth, height: 1 }} />
        </div>

        {/* Flat inline-editable table */}
        <Card>
          <CardContent
            ref={tableScrollRef}
            className="p-0 overflow-x-auto"
            onScroll={syncFromTable}
          >
            {closingsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : pagedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Handshake className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Henüz kapanış kaydı yok</p>
                <p className="text-xs mt-1">Yeni bir kapanış ekleyin</p>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse min-w-[2880px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {([
                      { label: "Onay" },
                      { label: "Danışman",            sk: "employeeName" },
                      { label: "İşlem",               sk: "dealCategory" },
                      { label: "İşlem Tipi",          sk: "dealType" },
                      { label: "Taraf",               sk: "sideType" },
                      { label: "İşlem Tarihi",        sk: "closingDate" },
                      { label: "İşlem Değeri",        sk: "saleValue" },
                      { label: "BHB",                 sk: "bhbShare" },
                      { label: "İşlem Adedi",         sk: "islemAdedi" },
                      { label: "KWTR",                sk: "mainBranchShare" },
                      { label: "KWTR (+KDV)",         sk: "kwtrKdv" },
                      { label: "PlatinKarma",         sk: "marketCenterActual" },
                      { label: "PlatinKarma (KDV)",   sk: "bmKdv" },
                      { label: "Danışman Net",        sk: "employeeNet" },
                      { label: "Kasa",                sk: "kasa" },
                      { label: "Nakit",               sk: "nakit" },
                      { label: "Banka",               sk: "banka" },
                      { label: "BHB Oranı",           sk: "commissionRate" },
                      { label: "İl",                  sk: "il" },
                      { label: "İlçe",                sk: "ilce" },
                      { label: "Semt/Mahalle",        sk: "mahalle" },
                      { label: "Adres",               sk: "propertyAddress" },
                      { label: "Mülkle İlgili Detay", sk: "propertyDetails" },
                      { label: "Açılış Rakamı",       sk: "openingPrice" },
                      { label: "İndirim Oranı",       sk: "discountPct" },
                      { label: "Pay%",                sk: "splitPercentage" },
                      { label: "Süre/Gün",            sk: "durationDays" },
                      { label: "Söz. Başlangıç",      sk: "contractStartDate" },
                      { label: "Söz. Bitiş",          sk: "contractEndDate" },
                      { label: "Müşteri Kaynağı",     sk: "customerSource" },
                      { label: "Yönlendirme",         sk: "referralInfo" },
                      { label: "" },
                    ] as Array<{ label: string; sk?: string }>).map((col, i) => {
                      const isActive = col.sk && sortKey === col.sk;
                      const arrow = !col.sk ? null : isActive
                        ? (sortDir === "asc" ? <ChevronUp className="ml-0.5 h-3 w-3 inline opacity-80" /> : <ChevronDown className="ml-0.5 h-3 w-3 inline opacity-80" />)
                        : <ChevronUp className="ml-0.5 h-3 w-3 inline opacity-20" />;
                      return (
                        <th
                          key={`${col.label}-${i}`}
                          onClick={col.sk ? () => handleColumnSort(col.sk!) : undefined}
                          className={`text-left font-medium py-2 px-2 text-muted-foreground whitespace-nowrap text-[11px] ${col.sk ? "cursor-pointer select-none hover:text-foreground" : ""} ${isActive ? "text-foreground" : ""}`}
                        >
                          {col.label}{arrow}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => {
                    const sc = (field: string) => (v: string) => saveClosingField(row.closingId, field, v);
                    const sa = (field: string) => (v: string) => saveAgentField(row.agentId, field, v);
                    const isCapped = parseFloat(row.marketCenterDue) > parseFloat(row.marketCenterActual);
                    return (
                      <tr key={row.agentId} className={`border-b border-border/50 hover:bg-muted/30 ${row.isFirstOfClosing ? "border-t-2 border-t-border" : ""}`}>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {row.status === "expected" && (
                              <input
                                type="checkbox"
                                checked={selectedAgentIds.has(row.agentId)}
                                onChange={(e) => {
                                  const next = new Set(selectedAgentIds);
                                  if (e.target.checked) next.add(row.agentId); else next.delete(row.agentId);
                                  setSelectedAgentIds(next);
                                }}
                                className="h-3.5 w-3.5 shrink-0"
                              />
                            )}
                            {row.status === "expected" ? (
                              <button
                                onClick={() => handleApproveAgent(row.agentId, row.closingDate)}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-semibold transition-colors"
                                title="Danışmanı onayla"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Onayla
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium" title="Onaylı">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Onaylı
                              </span>
                            )}
                            <button
                              onClick={() => saveAgentField(row.agentId, "paymentCollected", String(!row.paymentCollected))}
                              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                row.paymentCollected
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                              }`}
                              title={row.paymentCollected ? "Tahsil edildi (kaldırmak için tıkla)" : "Tahsilat bekleniyor (ödendi olarak işaretle)"}
                            >
                              {row.paymentCollected ? "💰" : "💸"}
                            </button>
                            <button
                              onClick={() => handleNotifyAgent(row.agentId, row.employeeName)}
                              className="text-muted-foreground hover:text-emerald-600 transition-colors p-1 rounded"
                              title="Bu danışmana WhatsApp gönder"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
                            {row.isFirstOfClosing && (
                              <button
                                onClick={() => handleEdit(row.closingId)}
                                className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                                title="Kapanışı düzenle"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap font-medium text-xs">
                          <div className="flex items-center gap-1">
                            {row.employeeName}
                            {row.status === "expected" && (
                              <Badge className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-200 border">Beklenen</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1"><InlineSelect value={row.dealCategory} options={DEAL_CATEGORIES} onSave={sc("dealCategory")} /></td>
                        <td className="px-2 py-1"><InlineSelect value={row.dealType} options={DEAL_TYPES} onSave={sc("dealType")} /></td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <Badge variant={row.sideType === "buyer" ? "default" : row.sideType === "referral" ? "outline" : "secondary"} className="text-[10px]">
                            {row.sideType === "buyer" ? "Alıcı" : row.sideType === "referral" ? "Yönlendirme" : "Satıcı"}
                          </Badge>
                        </td>
                        <td className="px-2 py-1"><InlineCell value={row.closingDate} type="date" onSave={sa("closingDate")} /></td>
                        <td className="px-2 py-1 min-w-[90px]"><InlineCell value={row.saleValue} type="number" onSave={sc("saleValue")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.bhbShare} type="number" onSave={sa("bhbShare")} /></td>
                        <td className="px-2 py-1 min-w-[70px] text-center font-medium text-blue-700" title={row.dealCategory === "Kiralık" ? "Kiralık: BHB / (İşlem Değeri / 2)" : "BHB / (İşlem Değeri × BHB Oranı / 100)"}>
                          {calcIslemOrani(row.bhbShare, row.saleValue, row.commissionRate, row.dealCategory).toFixed(2)}
                        </td>
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
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.kasa} type="number" onSave={sa("kasa")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.nakit} type="number" onSave={sa("nakit")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.banka} type="number" onSave={sa("banka")} /></td>
                        <td className="px-2 py-1 min-w-[50px]"><InlineCell value={row.commissionRate} type="number" onSave={sc("commissionRate")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.il} onSave={sc("il")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.ilce} onSave={sc("ilce")} /></td>
                        <td className="px-2 py-1 min-w-[80px]"><InlineCell value={row.mahalle} onSave={sc("mahalle")} /></td>
                        <td className="px-2 py-1 min-w-[140px]"><InlineCell value={row.propertyAddress} onSave={sc("propertyAddress")} /></td>
                        <td className="px-2 py-1 min-w-[120px]"><InlineCell value={row.propertyDetails} onSave={sc("propertyDetails")} /></td>
                        <td className="px-2 py-1 min-w-[90px]"><InlineCell value={row.openingPrice} type="number" onSave={sc("openingPrice")} /></td>
                        <td className="px-2 py-1 min-w-[60px] text-muted-foreground text-right">
                          {row.openingPrice && parseFloat(row.openingPrice) > 0 && parseFloat(row.saleValue) > 0
                            ? `%${((parseFloat(row.openingPrice) - parseFloat(row.saleValue)) / parseFloat(row.openingPrice) * 100).toFixed(1)}`
                            : "—"}
                        </td>
                        <td className="px-2 py-1 min-w-[50px]"><InlineCell value={row.splitPercentage} type="number" onSave={sa("splitPercentage")} /></td>
                        <td className="px-2 py-1 min-w-[60px]"><InlineCell value={row.durationDays} type="number" onSave={sc("durationDays")} /></td>
                        <td className="px-2 py-1 min-w-[100px]"><InlineCell value={row.contractStartDate} type="date" onSave={sc("contractStartDate")} /></td>
                        <td className="px-2 py-1 min-w-[100px]"><InlineCell value={row.contractEndDate} type="date" onSave={sc("contractEndDate")} /></td>
                        <td className="px-2 py-1 min-w-[100px]"><InlineCell value={row.customerSource} onSave={sc("customerSource")} /></td>
                        <td className="px-2 py-1 min-w-[100px]"><InlineCell value={row.referralInfo} onSave={sc("referralInfo")} /></td>
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Sayfa {currentPage} / {totalPages} · {totalClosingsFiltered} kapanış
                </span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-xs" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>«</Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-xs" onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1}>‹</Button>
                  <span className="text-xs px-2">{currentPage}</span>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-xs" onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages}>›</Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-xs" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>»</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        </>}
      </div>

      <NewClosingDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        employees={employees}
        capStatuses={capStatuses}
        editingClosing={editingClosing}
      />
    </Layout>
  );
}
