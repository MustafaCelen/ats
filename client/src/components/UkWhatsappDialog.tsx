import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type UkWaKind = "welcome" | "reminder";
export type UkWaChannel = "whatsapp" | "mail";   // mail yalnız reminder için

type Recipient = {
  employeeId: number; name: string; phone: string | null; hasPhone: boolean; coachName: string | null;
  currentWeek: number; doneThisWeek: number; totalThisWeek: number; actualsEntered: boolean;
  sentBefore: boolean; sentAt: string | null;
  emails: string[]; hasEmail: boolean; mailSentBefore: boolean; mailSentAt: string | null;
  link: string;
};
// Kanala göre normalize: hasContact / contactSentBefore.
type Row = Recipient & { hasContact: boolean; contactSentBefore: boolean; contactSentAt: string | null };
type Template = { sid: string; friendlyName: string; language: string; body: string; variables: string[] };
type LastRun = { trigger: string; candidates: number; mailed: number; failed: number; error: string | null; at: string };
type Payload = { kind?: UkWaKind; label?: string; defaultTemplateSid?: string | null; variablesHint?: string; templates?: Template[]; recipients: Recipient[]; lastRun?: LastRun | null; autoCron?: string | null };
type Batch = { batchId: string; status: "running" | "done" | "stopped"; total: number; sent: number; failed: number; current: string | null; stopReason: string | null };
type MailResult = { results: { employeeId: number; name: string; mailed: boolean; error: string | null }[]; mailed: number; stopped: string | null };

const TITLES: Record<UkWaKind, string> = {
  welcome: "WhatsApp Hoş Geldin Mesajı",
  reminder: "WhatsApp Haftalık Hatırlatma",
};
const LS_KEY = (kind: UkWaKind) => `ukWaTemplate:${kind}`;

// 45+45: programdaki danışmanlara WhatsApp (Twilio onaylı şablon) ya da e-posta (channel="mail",
// yalnız hatırlatma). Hoş geldin: programdaki herkes (daha önce gönderilenler işaretli).
// Hatırlatma: bu hafta hiç aktivite işaretlememiş olanlar; kanal bazında "bu hafta gitti" bayrağı.
export function UkWhatsappDialog({ kind, channel = "whatsapp", open, onOpenChange }: { kind: UkWaKind; channel?: UkWaChannel; open: boolean; onOpenChange: (v: boolean) => void }) {
  const isMail = channel === "mail";
  const [templateSid, setTemplateSid] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [includeSent, setIncludeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [mailResult, setMailResult] = useState<MailResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery<Payload>({
    queryKey: isMail ? ["/api/uk-program/reminder-mail/recipients"] : ["/api/uk-program/whatsapp", kind, "recipients"],
    queryFn: async () => {
      const r = await fetch(isMail ? "/api/uk-program/reminder-mail/recipients" : `/api/uk-program/whatsapp/${kind}/recipients`, { credentials: "include" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) throw new Error(d?.error ?? `HTTP ${r.status}`);
      return d;
    },
    enabled: open,
    staleTime: 0,   // her açılışta taze liste (global staleTime Infinity)
  });
  const recipients: Row[] = useMemo(() => (data?.recipients ?? []).map((r) => ({
    ...r,
    hasContact: isMail ? r.hasEmail : r.hasPhone,
    contactSentBefore: isMail ? r.mailSentBefore : r.sentBefore,
    contactSentAt: isMail ? r.mailSentAt : r.sentAt,
  })), [data, isMail]);
  const templates = data?.templates ?? [];

  // Açılışta: şablon (son seçilen → env varsayılanı → ilk), seçim = iletişim bilgisi olan ve daha önce gitmemiş.
  useEffect(() => {
    if (!open || !data) return;
    if (!isMail) {
      let sid = "";
      try { sid = localStorage.getItem(LS_KEY(kind)) ?? ""; } catch {}
      if (!templates.some((t) => t.sid === sid)) sid = data.defaultTemplateSid && templates.some((t) => t.sid === data.defaultTemplateSid) ? data.defaultTemplateSid : (templates[0]?.sid ?? "");
      setTemplateSid(sid);
    }
    setSelected(new Set(recipients.filter((r) => r.hasContact && !r.contactSentBefore).map((r) => r.employeeId)));
  }, [open, data]);   // eslint-disable-line react-hooks/exhaustive-deps
  // İlerleme paneli yalnız dialog yeniden açılınca sıfırlanır (gönderim sonrası refetch silmesin).
  useEffect(() => { if (open) { setBatch(null); setMailResult(null); setErr(null); } }, [open]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const changeTemplate = (sid: string) => { setTemplateSid(sid); try { localStorage.setItem(LS_KEY(kind), sid); } catch {} };
  const template = templates.find((t) => t.sid === templateSid) ?? null;

  const visible = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr-TR");
    return recipients
      .filter((r) => includeSent || !r.contactSentBefore)
      .filter((r) => !s || r.name.toLocaleLowerCase("tr-TR").includes(s) || (r.coachName ?? "").toLocaleLowerCase("tr-TR").includes(s));
  }, [recipients, q, includeSent]);
  const byCoach = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of visible) { const k = r.coachName ?? "—"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return Array.from(m.entries());
  }, [visible]);
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setAll = (ids: number[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const id of ids) on ? n.add(id) : n.delete(id); return n; });
  const selectedList = recipients.filter((r) => selected.has(r.employeeId));
  const noContact = selectedList.filter((r) => !r.hasContact).length;

  // WhatsApp önizleme: ilk seçili alıcı için değişkenler yerine konmuş şablon metni.
  const preview = useMemo(() => {
    if (!template) return null;
    const r = selectedList[0] ?? recipients[0];
    if (!r) return template.body;
    const first = r.name.trim().split(/\s+/)[0] ?? r.name;
    const vars: Record<string, string> = kind === "reminder" ? { "1": first, "2": String(r.currentWeek), "3": r.link } : { "1": first, "2": r.link };
    return template.body.replace(/\{\{(\d+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  }, [template, selectedList, recipients, kind]);

  // Mail önizleme: ilk seçili alıcının gerçek maili (sunucuda üretilir).
  const previewId = isMail ? (selectedList[0] ?? recipients[0])?.employeeId ?? null : null;
  const { data: mailPreview, error: previewError } = useQuery<{ to: string[]; subject: string; html: string }>({
    queryKey: ["/api/uk-program/reminder-mail/preview", previewId],
    queryFn: async () => {
      const r = await fetch(`/api/uk-program/reminder-mail/preview/${previewId}`, { credentials: "include" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) throw new Error(d?.error ?? `HTTP ${r.status}`);
      return d;
    },
    enabled: open && isMail && previewId != null,
    staleTime: 60_000,
  });

  const poll = async (id: string) => {
    try {
      const r = await fetch(`/api/uk-program/whatsapp/batch/${id}`, { credentials: "include" });
      if (!r.ok) return;
      const b: Batch = await r.json();
      setBatch(b);
      if (b.status === "running") timer.current = window.setTimeout(() => poll(id), 1500);
      else refetch();
    } catch {}
  };

  const send = async () => {
    if (selected.size === 0) return;
    if (isMail) {
      if (!window.confirm(`${selected.size} danışmana hatırlatma maili gönderilsin mi?`)) return;
      setSending(true); setErr(null); setMailResult(null);
      try {
        const r = await fetch("/api/uk-program/reminder-mail/send", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeIds: Array.from(selected), allowResend: includeSent }),   // "gönderilmişleri göster" açıksa bilerek yineleme
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Gönderilemedi");
        setMailResult(d);
        refetch();
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setSending(false);
      }
      return;
    }
    if (!template) return;
    if (!window.confirm(`${selected.size} danışmana WhatsApp gönderilsin mi?`)) return;
    setSending(true); setErr(null);
    try {
      const r = await fetch(`/api/uk-program/whatsapp/${kind}/send`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: Array.from(selected), templateSid: template.sid }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gönderilemedi");
      setBatch({ batchId: d.batchId, status: "running", total: d.count, sent: 0, failed: 0, current: null, stopReason: null });
      poll(d.batchId);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const sentCount = recipients.filter((r) => r.contactSentBefore).length;
  const contactWord = isMail ? "E-posta" : "Telefon";
  const title = isMail ? "E-posta Haftalık Hatırlatma" : TITLES[kind];
  const failedMails = mailResult?.results.filter((x) => !x.mailed) ?? [];
  // Aynı hata N kez tekrarlanmasın: hata metnine göre grupla.
  const failedGroups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const x of failedMails) { const k = x.error ?? "Hata"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(x.name); }
    return Array.from(m.entries());
  }, [failedMails]);
  const cronText = (() => {
    const c = data?.autoCron;
    if (!c) return null;
    const m = /^(\d+) (\d+) \* \* (\d)$/.exec(c);
    const days = ["pazar", "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi"];
    return m ? `her ${days[Number(m[3])]} ${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")}` : c;
  })();
  const lastRun = data?.lastRun ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid={`uk-wa-dialog-${kind}${isMail ? "-mail" : ""}`}>
        <DialogHeader><DialogTitle>45+45 Başarı Rotası — {title}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {kind === "welcome"
              ? "Programdaki tüm aktif danışmanlar listelenir. Daha önce WhatsApp hoş geldin mesajı gidenler varsayılan olarak seçili değildir."
              : `İçinde bulunduğu haftada hiç aktivite işaretlememiş danışmanlar listelenir. Bu hafta ${isMail ? "hatırlatma maili" : "WhatsApp hatırlatması"} gidenler varsayılan olarak seçili değildir.`}
            {isMail
              ? ` Mail KW ve kişisel e-posta adreslerine gider${cronText ? `; ${cronText} otomatik de gönderilir` : " (otomatik gönderim bu ortamda kapalı)"}.`
              : ` Mesaj Twilio'da onaylı şablonla gider; değişkenler: ${data?.variablesHint ?? "…"}.`}
          </p>
          {isMail && lastRun && (
            <div className={`rounded-lg px-3 py-2 text-xs ring-1 ${lastRun.error ? "bg-rose-50 ring-rose-200 text-rose-700" : "bg-slate-50 ring-slate-200 text-slate-700"}`} data-testid="uk-mail-lastrun">
              Son gönderim: {new Date(lastRun.at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })} · {lastRun.trigger === "cron" || lastRun.trigger === "harici-cron" ? "otomatik" : "elle"} · {lastRun.mailed} gitti · {lastRun.failed} başarısız
              {lastRun.error ? ` · ${lastRun.error}` : ""}
            </div>
          )}
          {(error || err) && <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700">{(error as Error)?.message ?? err}</div>}

          {isMail ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Önizleme {mailPreview ? <span className="font-normal text-muted-foreground">· {mailPreview.subject}</span> : null}</label>
              {mailPreview
                ? <iframe title="Mail önizleme" srcDoc={mailPreview.html} className="w-full h-72 rounded-md border bg-white pointer-events-none" data-testid="uk-mail-preview" sandbox="" />
                : previewError
                  ? <div className="rounded-md border bg-rose-50 px-3 py-2 text-xs text-rose-700">Önizleme alınamadı: {(previewError as Error).message}</div>
                  : <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground min-h-9">{recipients.length === 0 ? "—" : "Yükleniyor…"}</div>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Twilio şablonu</label>
                <select value={templateSid} onChange={(e) => changeTemplate(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" data-testid="uk-wa-template">
                  {templates.length === 0 && <option value="">Şablon bulunamadı (Twilio ayarları / onaylı şablon yok)</option>}
                  {templates.map((t) => <option key={t.sid} value={t.sid}>{t.friendlyName} ({t.language}) · {t.variables.length} değişken</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Önizleme</label>
                <div className="rounded-md border bg-emerald-50/60 px-3 py-2 text-xs whitespace-pre-wrap min-h-9 max-h-40 overflow-y-auto" data-testid="uk-wa-preview">{preview ?? "—"}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara: ad, koç…" className="h-8 text-sm w-56" />
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAll(visible.filter((r) => r.hasContact).map((r) => r.employeeId), true)}>{isMail ? "E-postası" : "Telefonu"} olanları seç</Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAll(visible.map((r) => r.employeeId), false)}>Seçimi kaldır</Button>
            {sentCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs select-none cursor-pointer">
                <input type="checkbox" checked={includeSent} onChange={(e) => setIncludeSent(e.target.checked)} /> Gönderilmiş olanları da göster ({sentCount})
              </label>
            )}
            <span className="ml-auto text-xs text-muted-foreground" data-testid="uk-wa-count">{selected.size} seçili / {recipients.length} alıcı</span>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
            {isLoading ? <p className="p-4 text-sm text-muted-foreground">Yükleniyor…</p>
            : visible.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{kind === "reminder" ? "Bu hafta aktivite girmemiş danışman yok." : "Gönderilecek danışman yok."}</p>
            : byCoach.map(([coach, list]) => (
              <div key={coach}>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 text-xs font-semibold">
                  <input type="checkbox" className="accent-primary" checked={list.every((r) => selected.has(r.employeeId))} onChange={(e) => setAll(list.map((r) => r.employeeId), e.target.checked)} />
                  Koç: {coach} <span className="font-normal text-muted-foreground">({list.length})</span>
                </div>
                {list.map((r) => (
                  <label key={r.employeeId} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/20" data-testid={`uk-wa-row-${r.employeeId}`}>
                    <input type="checkbox" className="accent-primary" checked={selected.has(r.employeeId)} onChange={() => toggle(r.employeeId)} />
                    <span className="flex-1 truncate">{r.name}{isMail && r.emails.length > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">{r.emails.join(", ")}</span>}</span>
                    {r.currentWeek >= 1 && r.currentWeek <= 12
                      ? <span className="text-[10px] text-muted-foreground tabular-nums" title="Bu hafta işaretlenen aktivite">{r.currentWeek}. hafta · {r.doneThisWeek}/{r.totalThisWeek}{r.actualsEntered ? " · gerçekleşen girildi" : ""}</span>
                      : <span className="text-[10px] text-muted-foreground">{r.currentWeek === 0 ? "başlamadı" : "tamamlandı"}</span>}
                    {r.contactSentBefore && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" title={r.contactSentAt ? new Date(r.contactSentAt).toLocaleString("tr-TR") : ""}>gönderildi</span>}
                    {!r.hasContact && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 ring-1 ring-amber-200">{contactWord} yok</span>}
                  </label>
                ))}
              </div>
            ))}
          </div>

          {noContact > 0 && (
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[11px] text-amber-800">
              Seçilenlerden {noContact} danışmanın {isMail ? "e-postası" : "telefonu"} yok; onlara gönderilemez{isMail ? "" : " (başarısız olarak kaydedilir)"}.
            </div>
          )}

          {batch && (
            <div className="rounded-lg border px-3 py-2 text-sm" data-testid="uk-wa-progress">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {batch.status === "running" ? `Gönderiliyor… ${batch.current ?? ""}` : batch.status === "done" ? "Gönderim tamamlandı" : "Gönderim durdu"}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{batch.sent} gitti · {batch.failed} başarısız · {batch.total} toplam</span>
              </div>
              {batch.stopReason === "consecutive_failures" && (
                <p className="text-xs text-rose-700 mt-1">Art arda 3 gönderim başarısız oldu (Twilio/Meta hatası veya kota). Kalanlar gönderilmedi; WhatsApp Toplu sayfasındaki geçmişten ayrıntıya bakın.</p>
              )}
            </div>
          )}

          {mailResult && (
            <div className="rounded-lg border px-3 py-2 text-sm space-y-1" data-testid="uk-mail-result">
              <div className="flex items-center justify-between">
                <span className="font-medium">{mailResult.mailed === 0 && mailResult.results.length > 0 ? "Gönderim başarısız" : mailResult.stopped ? "Gönderim durdu" : "Gönderim tamamlandı"}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{mailResult.mailed} gitti · {failedMails.length} başarısız · {mailResult.results.length} toplam</span>
              </div>
              {mailResult.stopped && <p className="text-xs text-rose-700">{mailResult.stopped}</p>}
              {failedGroups.length > 0 && (
                <ul className="text-xs text-muted-foreground max-h-24 overflow-y-auto">
                  {failedGroups.map(([e, names]) => <li key={e}><b>{e}</b> ({names.length}): {names.join(", ")}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
            <Button onClick={send} disabled={sending || (!isMail && !template) || selected.size === 0 || batch?.status === "running"} data-testid="uk-wa-send">
              {sending ? (isMail ? "Gönderiliyor…" : "Başlatılıyor…") : `${selected.size} Danışmana Gönder`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
