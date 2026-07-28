import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Search, Send, RefreshCw, CheckCircle2, History } from "lucide-react";

interface EmployeeRow {
  id: number;
  status: string;
  candidate?: { name?: string; phone?: string | null; office?: string | null } | null;
}

interface Template {
  sid: string;
  friendlyName: string;
  language: string;
  body: string;
  variables: string[];
}

interface BulkSendLog {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  phone: string;
  templateName: string;
  status: "sent" | "failed";
  error: string | null;
  createdAt: string;
}

function useActiveAdvisors() {
  return useQuery<EmployeeRow[]>({
    queryKey: ["/api/employees"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then((r) => r.json()),
  });
}

function useTemplates() {
  return useQuery<Template[]>({
    queryKey: ["/api/whatsapp/templates"],
    queryFn: () => fetch("/api/whatsapp/templates", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

function useBulkHistory() {
  return useQuery<BulkSendLog[]>({
    queryKey: ["/api/whatsapp/bulk-sends"],
    queryFn: () => fetch("/api/whatsapp/bulk-sends", { credentials: "include" }).then((r) => r.json()),
  });
}

export default function WhatsappBulk() {
  const { toast } = useToast();
  const { data: employeesRaw, isLoading: loadingEmps } = useActiveAdvisors();
  const { data: templatesRaw, isLoading: loadingTemplates } = useTemplates();
  const { data: history = [], refetch: refetchHistory } = useBulkHistory();

  const employees = useMemo(
    () => (Array.isArray(employeesRaw) ? employeesRaw : [])
      .filter((e) => e.status === "active" && e.candidate?.phone),
    [employeesRaw],
  );
  const templates = Array.isArray(templatesRaw) ? templatesRaw : [];

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [templateSid, setTemplateSid] = useState<string>("");
  const [autoFillName, setAutoFillName] = useState(true);
  const [sharedVars, setSharedVars] = useState<Record<string, string>>({});

  const [sending, setSending] = useState(false);
  const stopRef = useRef(false);
  const [progress, setProgress] = useState<{
    active: boolean; total: number; sent: number; failed: number; current: string | null; done: boolean; stopped: boolean;
  } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      (e.candidate?.name ?? "").toLowerCase().includes(q) || (e.candidate?.phone ?? "").includes(q));
  }, [employees, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((e) => next.delete(e.id));
      else filtered.forEach((e) => next.add(e.id));
      return next;
    });
  };
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedTemplate = templates.find((t) => t.sid === templateSid) ?? null;
  const otherVariables = (selectedTemplate?.variables ?? []).filter((v) => !(autoFillName && v === "1"));

  const handleSend = async () => {
    if (!selectedTemplate || selected.size === 0 || sending) return;
    stopRef.current = false;
    setSending(true);
    const ids = Array.from(selected);
    setProgress({ active: true, total: ids.length, sent: 0, failed: 0, current: null, done: false, stopped: false });

    let sent = 0, failed = 0;
    for (let i = 0; i < ids.length; i++) {
      if (stopRef.current) break;
      const emp = employees.find((e) => e.id === ids[i]);
      const name = emp?.candidate?.name ?? `#${ids[i]}`;
      setProgress((s) => (s ? { ...s, current: name } : s));

      const vars: Record<string, string> = { ...sharedVars };
      if (autoFillName && selectedTemplate.variables.includes("1")) vars["1"] = name;

      try {
        const res = await fetch("/api/whatsapp/bulk-send-one", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            employeeId: ids[i],
            templateSid: selectedTemplate.sid,
            templateName: selectedTemplate.friendlyName,
            variables: vars,
          }),
        });
        if (res.ok) sent++; else failed++;
      } catch {
        failed++;
      }
      setProgress((s) => (s ? { ...s, sent, failed } : s));
      if (i < ids.length - 1 && !stopRef.current) await new Promise((r) => setTimeout(r, 1000));
    }

    const wasStopped = stopRef.current;
    setSending(false);
    setProgress((s) => (s ? { ...s, active: false, done: true, current: null, stopped: wasStopped } : s));
    toast({
      title: wasStopped ? "Gönderim durduruldu" : "Toplu gönderim tamamlandı",
      description: `${sent} gönderildi, ${failed} başarısız`,
    });
    refetchHistory();
  };

  const stopSend = () => { stopRef.current = true; };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-primary" /> WhatsApp Toplu Mesaj
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Danışmanlara Twilio onaylı şablon ile bilgilendirme amaçlı toplu mesaj gönderin
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Danışman seçimi */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Danışmanlar ({selected.size} / {employees.length} seçili)</h2>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={toggleAll}>
                {allFilteredSelected ? "Tümünü Kaldır" : "Tümünü Seç"}
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="İsim / telefon ara..." className="h-8 pl-8 text-xs" />
            </div>
            <div className="border border-border rounded-lg max-h-[420px] overflow-y-auto divide-y divide-border">
              {loadingEmps ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Yükleniyor…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Danışman bulunamadı.</div>
              ) : filtered.map((e) => (
                <label key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleOne(e.id)} />
                  <span className="flex-1 font-medium truncate">{e.candidate?.name ?? `#${e.id}`}</span>
                  <span className="text-xs text-muted-foreground">{e.candidate?.phone}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Şablon + gönderim */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold">Şablon</h2>
            <Select value={templateSid} onValueChange={setTemplateSid}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={loadingTemplates ? "Yükleniyor…" : "Şablon seçin…"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.sid} value={t.sid}>{t.friendlyName} ({t.language})</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedTemplate && (
              <>
                <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs whitespace-pre-wrap">
                  {selectedTemplate.body || <span className="italic text-muted-foreground">Önizleme yok</span>}
                </div>

                {selectedTemplate.variables.includes("1") && (
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={autoFillName} onCheckedChange={(v) => setAutoFillName(!!v)} />
                    İlk değişkeni ({"{{1}}"}) her danışmanın kendi adıyla otomatik doldur
                  </label>
                )}

                {otherVariables.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Diğer değişkenler (tüm alıcılar için aynı değer)</p>
                    {otherVariables.map((v) => (
                      <div key={v} className="flex items-center gap-2">
                        <span className="text-xs w-8 shrink-0">{"{{" + v + "}}"}</span>
                        <Input
                          value={sharedVars[v] ?? ""}
                          onChange={(e) => setSharedVars((s) => ({ ...s, [v]: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <Button
              className="w-full gap-2"
              disabled={!selectedTemplate || selected.size === 0 || sending}
              onClick={handleSend}
            >
              {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {selected.size} Danışmana Gönder
            </Button>

            {progress && (progress.active || progress.done) && (
              <div className={`rounded-xl border bg-card p-3 space-y-2 ${progress.stopped ? "border-orange-300" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-2">
                    {progress.active
                      ? <><RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /> Gönderiliyor…</>
                      : <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {progress.stopped ? "Durduruldu" : "Tamamlandı"}</>}
                  </span>
                  {progress.active && (
                    <button onClick={stopSend} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium">Durdur</button>
                  )}
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${progress.stopped ? "bg-orange-400" : "bg-primary"}`}
                    style={{ width: `${progress.total ? Math.round((progress.sent + progress.failed) / progress.total * 100) : 0}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Toplam: <b>{progress.total}</b></span>
                  <span className="text-emerald-600">Gönderildi: <b>{progress.sent}</b></span>
                  {progress.failed > 0 && <span className="text-red-600">Başarısız: <b>{progress.failed}</b></span>}
                  {progress.current && <span className="text-primary">Şu an: <b>{progress.current}</b></span>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Geçmiş */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Gönderim Geçmişi</h2>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Tarih</th>
                  <th className="px-3 py-2 font-medium">Danışman</th>
                  <th className="px-3 py-2 font-medium">Telefon</th>
                  <th className="px-3 py-2 font-medium">Şablon</th>
                  <th className="px-3 py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Henüz gönderim yok.</td></tr>
                ) : history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(h.createdAt).toLocaleString("tr-TR")}</td>
                    <td className="px-3 py-2">{h.employeeName ?? "—"}</td>
                    <td className="px-3 py-2">{h.phone}</td>
                    <td className="px-3 py-2">{h.templateName}</td>
                    <td className="px-3 py-2">
                      {h.status === "sent" ? (
                        <span className="text-emerald-600 font-medium">Gönderildi</span>
                      ) : (
                        <span className="text-red-600 font-medium" title={h.error ?? ""}>Başarısız</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
