import { useState } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Megaphone, ArrowLeft, Users, TrendingUp, Wallet, Calendar, Plus, Trash2, Pencil, Target,
  Eye, MousePointerClick, Radar, PiggyBank, Gauge,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface CampaignDetailData {
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
  // Meta detayları (platform === 'meta' iken dolu)
  objective: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  currency: string | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  cpc: string | null;
  cpm: string | null;
  meta_synced_at: string | null;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Potansiyel Müşteri (Lead)",
  OUTCOME_TRAFFIC: "Trafik",
  OUTCOME_ENGAGEMENT: "Etkileşim",
  OUTCOME_AWARENESS: "Bilinirlik",
  OUTCOME_SALES: "Satış",
  OUTCOME_APP_PROMOTION: "Uygulama Tanıtımı",
  LEAD_GENERATION: "Potansiyel Müşteri (Lead)",
  LINK_CLICKS: "Bağlantı Tıklamaları",
  CONVERSIONS: "Dönüşümler",
};
const fmtInt = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

interface ExpenseRow {
  id: number;
  campaign_id: number;
  amount: string;
  date: string;
  notes: string | null;
}

interface LeadRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  office: string | null;
  created_at: string;
  employee_id: number | null;
  employee_status: string | null;
}

const fmtTRY = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-emerald-100 text-emerald-700" },
  paused: { label: "Duraklatıldı", cls: "bg-amber-100 text-amber-700" },
  ended: { label: "Bitti", cls: "bg-slate-100 text-slate-600" },
};

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const id = Number(params?.id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [editOpen, setEditOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseNotes, setExpenseNotes] = useState("");

  const { data: campaign, isLoading } = useQuery<CampaignDetailData>({
    queryKey: ["/api/campaigns", id],
    queryFn: () => fetch(`/api/campaigns/${id}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });

  const { data: expenses = [] } = useQuery<ExpenseRow[]>({
    queryKey: [`/api/campaigns/${id}/expenses`],
    queryFn: () => fetch(`/api/campaigns/${id}/expenses`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!id && isAdmin,
  });

  const { data: leads = [] } = useQuery<LeadRow[]>({
    queryKey: [`/api/campaigns/${id}/leads`],
    queryFn: () => fetch(`/api/campaigns/${id}/leads`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!id,
  });

  const addExpenseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/campaigns/${id}/expenses`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: expenseAmount, date: expenseDate, notes: expenseNotes || null }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Hata");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Masraf eklendi" });
      qc.invalidateQueries({ queryKey: [`/api/campaigns/${id}/expenses`] });
      qc.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      qc.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setExpenseAmount(""); setExpenseNotes("");
    },
    onError: (e: any) => toast({ title: "Eklenemedi", description: e?.message, variant: "destructive" }),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expId: number) => {
      const res = await fetch(`/api/campaigns/expenses/${expId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Silinemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/campaigns/${id}/expenses`] });
      qc.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      qc.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
  });

  if (isLoading || !campaign) {
    return (
      <Layout>
        <div className="text-sm text-muted-foreground p-8 text-center">Yükleniyor...</div>
      </Layout>
    );
  }

  const spend = parseFloat(campaign.total_expense);
  const costPerLead = campaign.lead_count > 0 ? spend / campaign.lead_count : null;
  const costPerHire = campaign.converted_count > 0 ? spend / campaign.converted_count : null;
  const meta = STATUS_META[campaign.status] ?? STATUS_META.active;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Kampanyalar
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Megaphone className="h-6 w-6 text-primary" />
                {campaign.name}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.cls}`}>{meta.label}</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {campaign.start_date ?? "—"} {campaign.end_date ? `→ ${campaign.end_date}` : "→ devam ediyor"}
              </p>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Düzenle
              </Button>
            )}
          </div>
        </div>

        {campaign.description && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{campaign.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Meta kampanya detayları + bütçe (sadece platform='meta') */}
        {campaign.platform === "meta" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">META</span>
                Kampanya Detayları &amp; Bütçe
              </CardTitle>
              {campaign.meta_synced_at && (
                <p className="text-[11px] text-muted-foreground">Son senkron: {new Date(campaign.meta_synced_at).toLocaleString("tr-TR")}</p>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {campaign.objective && (
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />Hedef</p>
                    <p className="text-sm font-semibold mt-0.5">{OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective}</p>
                  </div>
                )}
                {campaign.daily_budget && (
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><PiggyBank className="h-3 w-3" />Günlük Bütçe</p>
                    <p className="text-sm font-semibold mt-0.5">{fmtTRY(parseFloat(campaign.daily_budget))}</p>
                  </div>
                )}
                {campaign.lifetime_budget && (
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><PiggyBank className="h-3 w-3" />Toplam Bütçe</p>
                    <p className="text-sm font-semibold mt-0.5">{fmtTRY(parseFloat(campaign.lifetime_budget))}</p>
                  </div>
                )}
                {campaign.impressions != null && (
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" />Gösterim</p>
                    <p className="text-sm font-semibold mt-0.5">{fmtInt(campaign.impressions)}</p>
                  </div>
                )}
                {campaign.reach != null && (
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Radar className="h-3 w-3" />Erişim</p>
                    <p className="text-sm font-semibold mt-0.5">{fmtInt(campaign.reach)}</p>
                  </div>
                )}
                {campaign.clicks != null && (
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MousePointerClick className="h-3 w-3" />Tıklama</p>
                    <p className="text-sm font-semibold mt-0.5">{fmtInt(campaign.clicks)}</p>
                  </div>
                )}
                {campaign.cpc != null && (
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" />CPC (Tıklama Başı)</p>
                    <p className="text-sm font-semibold mt-0.5">{fmtTRY(parseFloat(campaign.cpc))}</p>
                  </div>
                )}
                {campaign.cpm != null && (
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" />CPM (1000 Gösterim)</p>
                    <p className="text-sm font-semibold mt-0.5">{fmtTRY(parseFloat(campaign.cpm))}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stat kartları */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Toplam Lead</p>
              <p className="text-2xl font-bold mt-0.5">{campaign.lead_count}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Dönüşen</p>
              <p className="text-2xl font-bold mt-0.5 text-emerald-600">{campaign.converted_count}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" />Toplam Masraf</p>
              <p className="text-2xl font-bold mt-0.5">{fmtTRY(spend)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />Lead Başı Maliyet</p>
              <p className="text-2xl font-bold mt-0.5">{costPerLead !== null ? fmtTRY(costPerLead) : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />Dönüşüm Başı Maliyet</p>
              <p className="text-2xl font-bold mt-0.5">{costPerHire !== null ? fmtTRY(costPerHire) : "—"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Masraflar (sadece admin) */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Kampanya Masrafları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-[10px]">Tutar (₺)</Label>
                  <Input type="text" inputMode="decimal" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} placeholder="ör: 5000" className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Tarih</Label>
                  <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Not (opsiyonel)</Label>
                  <Input value={expenseNotes} onChange={e => setExpenseNotes(e.target.value)} placeholder="ör: Instagram reklam bütçesi" className="h-8 text-xs" />
                </div>
                <Button size="sm" className="gap-1" onClick={() => addExpenseMutation.mutate()} disabled={!expenseAmount || !expenseDate || addExpenseMutation.isPending}>
                  <Plus className="h-3.5 w-3.5" /> Ekle
                </Button>
              </div>

              {expenses.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Henüz masraf kaydı yok</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Not</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{e.date}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.notes ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">{fmtTRY(parseFloat(e.amount))}</TableCell>
                        <TableCell>
                          <button
                            className="text-muted-foreground hover:text-red-600"
                            onClick={() => { if (confirm("Bu masraf silinsin mi?")) deleteExpenseMutation.mutate(e.id); }}
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
        )}

        {/* Leadler */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Kampanyaya Gelen Leadler
            </CardTitle>
            <p className="text-xs text-muted-foreground">Bu kampanya kaynağıyla eklenmiş tüm adaylar</p>
          </CardHeader>
          <CardContent className="p-0">
            {leads.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Bu kampanyaya henüz lead eklenmedi.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad Soyad</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Ofis</TableHead>
                    <TableHead>Eklenme Tarihi</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        <Link href={`/candidates/${l.id}`} className="hover:underline text-primary">{l.name}</Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.phone ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.category ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.office ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString("tr-TR")}</TableCell>
                      <TableCell>
                        {l.employee_id ? (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${l.employee_status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                            {l.employee_status === "active" ? "Danışman (Aktif)" : "Danışman (Pasif)"}
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">Aday</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {editOpen && (
        <EditCampaignDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          campaign={campaign}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["/api/campaigns", id] });
            qc.invalidateQueries({ queryKey: ["/api/campaigns"] });
            toast({ title: "Kampanya güncellendi" });
          }}
        />
      )}
    </Layout>
  );
}

function EditCampaignDialog({ open, onOpenChange, campaign, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; campaign: CampaignDetailData; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [status, setStatus] = useState(campaign.status);
  const [startDate, setStartDate] = useState(campaign.start_date ?? "");
  const [endDate, setEndDate] = useState(campaign.end_date ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, status, startDate: startDate || null, endDate: endDate || null }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Hata");
      return res.json();
    },
    onSuccess: () => { onSaved(); onOpenChange(false); },
    onError: (e: any) => toast({ title: "Kaydedilemedi", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => onOpenChange(false)}>
      <div className="bg-card rounded-xl shadow-xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold">Kampanyayı Düzenle</h3>
        <div>
          <Label className="text-xs">Kampanya Adı</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Açıklama</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Başlangıç</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Bitiş</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Durum</Label>
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="paused">Duraklatıldı</SelectItem>
              <SelectItem value="ended">Bitti</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button className="flex-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
