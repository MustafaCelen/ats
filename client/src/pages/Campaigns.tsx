import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Megaphone, Plus, Users, TrendingUp, Wallet, Calendar, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface CampaignRow {
  id: number;
  name: string;
  description: string | null;
  status: "active" | "paused" | "ended";
  platform: string;
  start_date: string | null;
  end_date: string | null;
  lead_count: number;
  converted_count: number;
  total_expense: string;
}

const fmtTRY = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-emerald-100 text-emerald-700" },
  paused: { label: "Duraklatıldı", cls: "bg-amber-100 text-amber-700" },
  ended: { label: "Bitti", cls: "bg-slate-100 text-slate-600" },
};

export default function Campaigns() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [createOpen, setCreateOpen] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery<CampaignRow[]>({
    queryKey: ["/api/campaigns"],
    queryFn: () => fetch("/api/campaigns", { credentials: "include" }).then(r => r.json()),
  });

  const { data: metaStatus } = useQuery<{ configured: boolean; webhookConfigured: boolean }>({
    queryKey: ["/api/meta/status"],
    queryFn: () => fetch("/api/meta/status", { credentials: "include" }).then(r => r.ok ? r.json() : { configured: false, webhookConfigured: false }),
    enabled: isAdmin,
  });

  const metaSync = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/meta/sync-campaigns", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message ?? "Hata");
      return res.json() as Promise<{ synced: number; errors: string[] }>;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Meta senkronu tamamlandı",
        description: `${d.synced} kampanya senkronlandı.` + (d.errors.length ? ` ${d.errors.length} hata.` : ""),
        variant: d.errors.length && d.synced === 0 ? "destructive" : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Meta senkronu başarısız", description: e?.message, variant: "destructive" }),
  });

  const totalLeads = campaigns.reduce((s, c) => s + c.lead_count, 0);
  const totalConverted = campaigns.reduce((s, c) => s + c.converted_count, 0);
  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.total_expense), 0);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" />
              Kampanyalar
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pazarlama / işe alım kampanyaları — lead ve masraf takibi
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              {metaStatus?.configured && (
                <Button variant="outline" onClick={() => metaSync.mutate()} disabled={metaSync.isPending} className="gap-1.5" title="Meta kampanyalarını ve harcamalarını senkronla">
                  <RefreshCw className={`h-4 w-4 ${metaSync.isPending ? "animate-spin" : ""}`} /> Meta Senkronla
                </Button>
              )}
              <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Yeni Kampanya
              </Button>
            </div>
          )}
        </div>

        {/* Özet kartları */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Toplam Kampanya</p>
              <p className="text-2xl font-bold mt-0.5">{campaigns.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Toplam Lead</p>
              <p className="text-2xl font-bold mt-0.5">{totalLeads}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Danışmana Dönüşen</p>
              <p className="text-2xl font-bold mt-0.5 text-emerald-600">{totalConverted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Toplam Masraf</p>
              <p className="text-2xl font-bold mt-0.5">{fmtTRY(totalSpend)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Kampanya listesi */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground p-8 text-center">Yükleniyor...</div>
        ) : campaigns.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Megaphone className="h-8 w-8 opacity-30" />
              <p className="text-sm">Henüz kampanya eklenmedi.</p>
              {isAdmin && (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> İlk Kampanyayı Ekle
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((c) => {
              const spend = parseFloat(c.total_expense);
              const costPerLead = c.lead_count > 0 ? spend / c.lead_count : null;
              const meta = STATUS_META[c.status] ?? STATUS_META.active;
              return (
                <Link key={c.id} href={`/campaigns/${c.id}`}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                    <CardContent className="pt-4 pb-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-base leading-tight flex items-center gap-1.5">
                          {c.platform === "meta" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold shrink-0">META</span>}
                          {c.name}
                        </h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {c.start_date ?? "—"} {c.end_date ? `→ ${c.end_date}` : "→ devam ediyor"}
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                        <div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Lead</p>
                          <p className="text-sm font-bold">{c.lead_count}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Dönüşen</p>
                          <p className="text-sm font-bold text-emerald-600">{c.converted_count}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" />Masraf</p>
                          <p className="text-sm font-bold">{fmtTRY(spend)}</p>
                        </div>
                      </div>
                      {costPerLead !== null && (
                        <p className="text-[10px] text-muted-foreground">
                          Lead başı maliyet: <span className="font-medium text-foreground">{fmtTRY(costPerLead)}</span>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateCampaignDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => { qc.invalidateQueries({ queryKey: ["/api/campaigns"] }); toast({ title: "Kampanya oluşturuldu" }); }}
        />
      )}
    </Layout>
  );
}

function CreateCampaignDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaigns", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, status, startDate: startDate || null, endDate: endDate || null }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Hata");
      return res.json();
    },
    onSuccess: () => { onCreated(); onOpenChange(false); },
    onError: (e: any) => toast({ title: "Oluşturulamadı", description: e?.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni Kampanya</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Kampanya Adı *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="ör: Instagram - Kasım 2026" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Açıklama</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Kampanya hakkında notlar..." className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Başlangıç</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Bitiş (opsiyonel)</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Durum</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="paused">Duraklatıldı</SelectItem>
                <SelectItem value="ended">Bitti</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Oluşturuluyor..." : "Kampanyayı Oluştur"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
