import { useState, useMemo } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DEAL_TYPES, type CapStatus, type ClosingWithDetails } from "@shared/schema";
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
  marketCenterDue: number;
  marketCenterActual: number;
  ukShare: number;
  employeeNet: number;
  capRemaining: number | null; // null = unlimited
  capAmount: number | null;    // null = unlimited
  capUsedAfter: number;
}

function calcAgentBreakdown(
  saleValue: number,
  splitPct: number,
  employee: any,
  capUsedSoFar: number,
  capAmount: number | null, // null = unlimited (no cap configured)
): AgentBreakdown {
  const sideBHB = saleValue * 0.02;
  const bhbShare = sideBHB * (splitPct / 100);
  const mainBranchShare = bhbShare * 0.10;

  const contractType = employee?.contractType ?? "70/30";
  const mcRate = contractType === "50/50" ? 0.30 : 0.20;
  const marketCenterDue = bhbShare * mcRate;

  // null capAmount = unlimited — full marketCenterDue is paid, no cap reduction
  const marketCenterActual = capAmount === null
    ? marketCenterDue
    : Math.min(marketCenterDue, Math.max(0, capAmount - capUsedSoFar));
  const capUsedAfter = capUsedSoFar + marketCenterActual;

  let ukShare = 0;
  if (employee?.uretkenlikKoclugu && employee?.uretkenlikKocluguOran) {
    const ukRate = employee.uretkenlikKocluguOran === "10%" ? 0.10 : 0.05;
    ukShare = bhbShare * ukRate;
  }

  const employeeNet = bhbShare - mainBranchShare - marketCenterActual - ukShare;

  return {
    bhbShare,
    mainBranchShare,
    marketCenterDue,
    marketCenterActual,
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
  id: string; // local key
  employeeId: number | null;
  splitPercentage: string;
}

interface SideState {
  enabled: boolean;
  agents: AgentInputRow[];
}

function newAgent(): AgentInputRow {
  return { id: Math.random().toString(36).slice(2), employeeId: null, splitPercentage: "100" };
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

// ── Agent calculation row display ─────────────────────────────────────────────
function AgentCalcRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex justify-between text-xs ${highlight ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span>{value}</span>
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
  employees,
  capStatuses,
  runningCapUsed,
}: {
  sideLabel: string;
  sideKey: "buyer" | "seller";
  side: SideState;
  setSide: (s: SideState) => void;
  saleValue: number;
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
            BHB: {fmtTRY(saleValue * 0.02)}
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
            const breakdown = emp && saleValue > 0 && splitPct > 0
              ? calcAgentBreakdown(saleValue, splitPct, emp, capUsedSoFar, capAmount)
              : null;

            return (
              <div key={agent.id} className="border border-border rounded-md p-3 bg-background space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground w-5">{idx + 1}.</span>
                  <div className="flex-1">
                    <Select
                      value={agent.employeeId ? String(agent.employeeId) : ""}
                      onValueChange={(v) => updateAgent(agent.id, { employeeId: Number(v) })}
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
                      onChange={(e) => updateAgent(agent.id, { splitPercentage: e.target.value })}
                      className="h-8 text-xs text-right"
                      placeholder="% Pay"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">%</span>
                  {side.agents.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAgent(agent.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {emp && breakdown && (
                  <div className="ml-5 p-2 bg-muted/50 rounded space-y-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">Hesaplama</span>
                      <CapBadge remaining={breakdown.capRemaining} amount={capAmount} />
                    </div>
                    <AgentCalcRow label="BHB Payı" value={fmtTRY(breakdown.bhbShare)} />
                    <AgentCalcRow label="Ana Merkez (10%)" value={`- ${fmtTRY(breakdown.mainBranchShare)}`} />
                    <AgentCalcRow
                      label={`Ofis (${emp.contractType === "50/50" ? "30" : "20"}%${breakdown.marketCenterDue > breakdown.marketCenterActual ? ", caplı" : ""})`}
                      value={`- ${fmtTRY(breakdown.marketCenterActual)}`}
                    />
                    {breakdown.ukShare > 0 && (
                      <AgentCalcRow label="Üretkenlik Koçluğu" value={`- ${fmtTRY(breakdown.ukShare)}`} />
                    )}
                    <div className="border-t border-border mt-1 pt-1">
                      <AgentCalcRow label="Danışman Net" value={fmtTRY(breakdown.employeeNet)} highlight />
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
  mcActual: number;
  uk: number;
  net: number;
}

function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  if (rows.length === 0) return null;
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs">Danışman</TableHead>
            <TableHead className="text-xs">Taraf</TableHead>
            <TableHead className="text-xs text-right">Pay %</TableHead>
            <TableHead className="text-xs text-right">BHB</TableHead>
            <TableHead className="text-xs text-right">A.Merkez</TableHead>
            <TableHead className="text-xs text-right">Ofis</TableHead>
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
              <TableCell className="text-xs text-right text-muted-foreground">{fmtTRY(r.uk)}</TableCell>
              <TableCell className="text-xs text-right font-semibold text-emerald-700">{fmtTRY(r.net)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/30 font-semibold">
            <TableCell colSpan={7} className="text-xs">Toplam</TableCell>
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
  const active = employees.filter((e) => e.status === "active" && e.capMonth);
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
          <p className="text-xs text-muted-foreground italic">Cap dönemi tanımlı aktif danışman bulunamadı.</p>
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
                    <TableCell colSpan={5} className="text-xs text-muted-foreground italic">Hesaplanıyor...</TableCell>
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
  const [dealType, setDealType] = useState<string>("Konut");
  const [saleValue, setSaleValue] = useState("");
  const [closingDate, setClosingDate] = useState(new Date().toISOString().split("T")[0]);
  const [buyerName, setBuyerName] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [notes, setNotes] = useState("");
  const [buyerSide, setBuyerSide] = useState<SideState>({ enabled: false, agents: [newAgent()] });
  const [sellerSide, setSellerSide] = useState<SideState>({ enabled: false, agents: [newAgent()] });

  const saleValueNum = parseFloat(saleValue || "0");

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
        const bd = calcAgentBreakdown(saleValueNum, splitPct, emp, capUsedSoFar, capAmount);
        afterBuyer[agent.employeeId] = bd.capUsedAfter;
      }
    }

    return { buyerRunningCap: buyerStart, sellerRunningCap: afterBuyer };
  }, [buyerSide, sellerSide, saleValueNum, employees, capStatuses]);

  // Build summary rows (uses the same buyer-then-seller order as server)
  const summaryRows = useMemo((): SummaryRow[] => {
    const rows: SummaryRow[] = [];
    // Start from DB cap used values
    const tmpCapUsed: Record<number, number> = {};

    const processAgents = (agents: AgentInputRow[], sideType: string) => {
      for (const agent of agents) {
        if (!agent.employeeId) continue;
        const emp = employees.find((e) => e.id === agent.employeeId);
        if (!emp) continue;
        const capStatus = capStatuses[agent.employeeId];
        const capAmount = capStatus?.capAmount ?? null;
        // Use accumulated value within this memo (starts from DB, accumulates across sides)
        const capUsedSoFar = tmpCapUsed[agent.employeeId] ?? capStatus?.capUsed ?? 0;
        const splitPct = parseFloat(agent.splitPercentage || "0");
        if (splitPct <= 0 || saleValueNum <= 0) continue;
        const bd = calcAgentBreakdown(saleValueNum, splitPct, emp, capUsedSoFar, capAmount);
        tmpCapUsed[agent.employeeId] = bd.capUsedAfter;
        rows.push({
          name: emp.candidate?.name ?? `Danışman #${agent.employeeId}`,
          side: sideType,
          splitPct,
          bhbShare: bd.bhbShare,
          mainBranch: bd.mainBranchShare,
          mcActual: bd.marketCenterActual,
          uk: bd.ukShare,
          net: bd.employeeNet,
        });
      }
    };

    if (buyerSide.enabled) processAgents(buyerSide.agents, "buyer");
    if (sellerSide.enabled) processAgents(sellerSide.agents, "seller");

    return rows;
  }, [buyerSide, sellerSide, saleValueNum, employees, capStatuses]);

  const resetForm = () => {
    setPropertyAddress("");
    setDealType("Konut");
    setSaleValue("");
    setClosingDate(new Date().toISOString().split("T")[0]);
    setBuyerName("");
    setSellerName("");
    setNotes("");
    setBuyerSide({ enabled: false, agents: [newAgent()] });
    setSellerSide({ enabled: false, agents: [newAgent()] });
  };

  const validate = (): string | null => {
    if (!propertyAddress.trim()) return "Mülk adresi zorunludur.";
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

    const sides = [];
    if (buyerSide.enabled) {
      sides.push({
        sideType: "buyer",
        agents: buyerSide.agents.map((a) => ({
          employeeId: a.employeeId,
          splitPercentage: String(parseFloat(a.splitPercentage || "0")),
        })),
      });
    }
    if (sellerSide.enabled) {
      sides.push({
        sideType: "seller",
        agents: sellerSide.agents.map((a) => ({
          employeeId: a.employeeId,
          splitPercentage: String(parseFloat(a.splitPercentage || "0")),
        })),
      });
    }

    try {
      await createClosing.mutateAsync({
        propertyAddress: propertyAddress.trim(),
        dealType,
        saleValue: String(saleValueNum),
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
                <Label className="text-xs">Mülk Adresi *</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="Adres..."
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                />
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
                <Label className="text-xs">Satış Bedeli (₺) *</Label>
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
              <div>
                <Label className="text-xs">Kapanış Tarihi *</Label>
                <Input
                  type="date"
                  className="mt-1 h-8 text-sm"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                />
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("closings");

  const { data: closings = [], isLoading: closingsLoading } = useClosings();
  const { data: employees = [] } = useEmployees();
  const { data: capStatuses = {} } = useCapStatuses();
  const deleteClosing = useDeleteClosing();

  // Summary stats
  const totalClosings = closings.length;
  const totalVolume = closings.reduce((s, c) => s + parseFloat(c.saleValue ?? "0"), 0);
  const totalBHB = closings.reduce((s, c) =>
    s + c.sides.reduce((ss, side) => ss + parseFloat(side.bhbTotal ?? "0"), 0), 0
  );
  const totalAgentNet = closings.reduce((s, c) => s + (c.totalAgentNet ?? 0), 0);

  const handleDelete = async (id: number) => {
    if (!window.confirm("Bu kapanışı silmek istediğinize emin misiniz?")) return;
    try {
      await deleteClosing.mutateAsync(id);
      toast({ title: "Silindi", description: "Kapanış kaydı silindi." });
    } catch {
      toast({ title: "Hata", description: "Kapanış silinemedi.", variant: "destructive" });
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
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Kapanış
            </Button>
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
              <p className="text-2xl font-bold">{totalClosings}</p>
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
                Danışman Net
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-bold truncate text-emerald-700">{fmtTRY(totalAgentNet)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {closingsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : closings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Handshake className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Henüz kapanış kaydı yok</p>
                <p className="text-xs mt-1">Yeni bir kapanış ekleyin</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tarih</TableHead>
                    <TableHead className="text-xs">Mülk Adresi</TableHead>
                    <TableHead className="text-xs">Tip</TableHead>
                    <TableHead className="text-xs text-right">Satış Bedeli</TableHead>
                    <TableHead className="text-xs">Taraflar</TableHead>
                    <TableHead className="text-xs text-right">Danışman Net</TableHead>
                    <TableHead className="text-xs w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closings.map((closing) => (
                    <TableRow key={closing.id} className="hover:bg-muted/40">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {safeFormatDate(closing.closingDate as any, "dd.MM.yyyy")}
                      </TableCell>
                      <TableCell className="text-xs font-medium max-w-[180px] truncate">
                        {closing.propertyAddress}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {closing.dealType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap">
                        {fmtTRY(parseFloat(closing.saleValue ?? "0"))}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {closing.sides.map((side) => (
                            <Badge key={side.id} variant="secondary" className="text-[10px]">
                              {side.sideType === "buyer" ? "Alıcı" : "Satıcı"}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold text-emerald-700 whitespace-nowrap">
                        {fmtTRY(closing.totalAgentNet ?? 0)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleDelete(closing.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                          title="Sil"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
