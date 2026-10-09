import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";

// 45+45 hoş geldin maili: önizleme + manuel gönderim (koç/admin).
// Sunucu: GET/POST /api/uk-program/:employeeId/welcome-email
export async function sendUkWelcomeEmail(employeeId: number): Promise<{ ok: boolean; message: string }> {
  const r = await fetch(`/api/uk-program/${employeeId}/welcome-email`, { method: "POST", credentials: "include" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: d.error ?? "Mail gönderilemedi." };
  return { ok: true, message: `Gönderildi: ${(d.to ?? []).join(", ")}` };
}

export function UkWelcomeEmailDialog({
  employeeId, open, onOpenChange,
}: { employeeId: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const { data, isLoading } = useQuery<{ to: string[]; subject: string; html: string; lastSentAt: string | null; error?: string }>({
    queryKey: ["/api/uk-program", employeeId, "welcome-email"],
    queryFn: () => fetch(`/api/uk-program/${employeeId}/welcome-email`, { credentials: "include" }).then((r) => r.json()),
    enabled: open,
    staleTime: 0,
  });

  const send = async () => {
    setSending(true);
    const res = await sendUkWelcomeEmail(employeeId);
    setSending(false);
    toast({ title: res.ok ? "Hoş geldin maili gönderildi" : "Mail gönderilemedi", description: res.message, variant: res.ok ? undefined : "destructive" });
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ["/api/uk-program"] });
      onOpenChange(false);
    }
  };

  const noRecipient = !!data && !data.error && data.to.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Hoş Geldin Maili</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : data.error ? (
          <p className="text-sm text-red-600">{data.error}</p>
        ) : (
          <div className="space-y-3 min-h-0 flex flex-col">
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Alıcı:</span> {data.to.length ? <b>{data.to.join(", ")}</b> : <span className="text-red-600">kayıtlı e-posta yok</span>}</p>
              <p><span className="text-muted-foreground">Konu:</span> {data.subject}</p>
              {data.lastSentAt
                ? <p className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Son gönderim: {new Date(data.lastSentAt).toLocaleString("tr-TR")}</p>
                : <p className="text-xs text-muted-foreground">Henüz gönderilmedi.</p>}
            </div>
            {noRecipient && (
              <div className="flex gap-2 rounded-lg bg-red-50 ring-1 ring-red-200 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> Danışmanın profiline KW e-posta veya kişisel e-posta girilmeden mail gönderilemez (giriş de bu adreslerle yapılır).
              </div>
            )}
            <iframe
              title="Mail önizleme"
              srcDoc={data.html}
              sandbox=""
              className="w-full flex-1 min-h-[420px] rounded-lg border border-border bg-white"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
              <Button className="gap-1.5" disabled={sending || noRecipient} onClick={send}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {data.lastSentAt ? "Tekrar Gönder" : "Gönder"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
