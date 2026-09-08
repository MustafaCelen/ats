import { randomUUID } from "crypto";
import { sendWhatsAppTemplate } from "./whatsapp";
import { storage } from "./storage";

// In-memory batch tracking so a page refresh doesn't stop the send loop and can
// resume live progress via polling. Persisted results still land in
// whatsapp_bulk_sends per message; only the *live* progress view is in-memory,
// so it's lost on a server restart (not on a browser refresh).

export type BulkSendItem = {
  employeeId: number;
  name: string;
  phone: string | null;
  variables: Record<string, string>;
};

type BatchState = {
  batchId: string;
  status: "running" | "done" | "stopped";
  total: number;
  sent: number;
  failed: number;
  current: string | null;
  templateName: string;
  createdByUserId: number;
  employeeIds: number[];
  stopRequested: boolean;
  stopReason: "manual" | "consecutive_failures" | "error" | null;
  startedAt: Date;
};

// "Kaldığı Yerden Devam Et" butonunun bir sayfa yenilemesinden sonra da çalışabilmesi için:
// bitmiş/durmuş batch'leri de (sadece "running" olanları değil) bu süre boyunca hafızada
// tutuyoruz — sunucu yeniden başlamadıkça hepsi ID ile sorgulanabilir kalır.
const LAST_BATCH_LOOKUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 saat

// Art arda bu kadar mesaj başarısız olursa (örn. Twilio/Meta hesap seviyesinde kalıcı bir
// hata — 24 saatlik mesajlaşma kotası dolması gibi) kampanyayı otomatik durdur. Tek bir
// geçersiz telefon numarası gibi tekil arızalarla karışmaması için art arda şartı var.
const CONSECUTIVE_FAILURE_LIMIT = 3;

const activeBatches = new Map<string, BatchState>();

function toPublicState(s: BatchState) {
  const { stopRequested, ...pub } = s;
  return pub;
}

export function getActiveBatchForUser(userId: number) {
  for (const s of Array.from(activeBatches.values())) {
    if (s.createdByUserId === userId && s.status === "running") return toPublicState(s);
  }
  return null;
}

// Sayfa yenilendiğinde "Kaldığı Yerden Devam Et" butonunun geri gelebilmesi için: aktif
// batch yoksa, bu kullanıcının yakın zamanda bitmiş/durmuş son batch'ini döner (varsa).
export function getLastBatchForUser(userId: number) {
  let latest: BatchState | null = null;
  const cutoff = Date.now() - LAST_BATCH_LOOKUP_WINDOW_MS;
  for (const s of Array.from(activeBatches.values())) {
    if (s.createdByUserId !== userId) continue;
    if (s.startedAt.getTime() < cutoff) continue;
    if (!latest || s.startedAt.getTime() > latest.startedAt.getTime()) latest = s;
  }
  return latest ? toPublicState(latest) : null;
}

export function getBatch(batchId: string) {
  const s = activeBatches.get(batchId);
  return s ? toPublicState(s) : null;
}

export function requestStop(batchId: string): boolean {
  const s = activeBatches.get(batchId);
  if (!s || s.status !== "running") return false;
  s.stopRequested = true;
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startBulkSendBatch(params: {
  createdByUserId: number;
  templateSid: string;
  templateName: string;
  items: BulkSendItem[];
}): string {
  const batchId = randomUUID();
  const state: BatchState = {
    batchId,
    status: "running",
    total: params.items.length,
    sent: 0,
    failed: 0,
    current: null,
    templateName: params.templateName,
    createdByUserId: params.createdByUserId,
    employeeIds: params.items.map((i) => i.employeeId),
    stopRequested: false,
    stopReason: null,
    startedAt: new Date(),
  };
  activeBatches.set(batchId, state);

  // Fire-and-forget — the HTTP handler returns immediately with batchId; this
  // keeps running on the server regardless of what the client does afterward.
  runBatch(state, params.templateSid, params.items).catch((err) => {
    console.error(`[whatsapp-bulk] batch ${batchId} crashed`, err);
    state.status = "stopped";
    state.stopReason = "error";
    state.current = null;
  });

  return batchId;
}

async function runBatch(state: BatchState, templateSid: string, items: BulkSendItem[]) {
  // Sadece gerçek Twilio gönderim hatalarını sayar — telefon numarası eksikliği bir veri
  // sorunudur, Twilio/Meta tarafında sistemik bir arızaya işaret etmez, o yüzden sayaca dahil
  // edilmez (ne artırır ne sıfırlar).
  let consecutiveFailures = 0;

  for (let i = 0; i < items.length; i++) {
    if (state.stopRequested) {
      state.status = "stopped";
      state.stopReason = "manual";
      state.current = null;
      return;
    }
    const item = items[i];
    state.current = item.name;

    if (!item.phone) {
      await storage.logWhatsappBulkSend({
        employeeId: item.employeeId, employeeName: item.name, phone: "",
        templateSid, templateName: state.templateName, variables: item.variables,
        status: "failed", error: "Telefon numarası yok",
        createdByUserId: state.createdByUserId, batchId: state.batchId,
      });
      state.failed++;
    } else {
      let msgId: string | null = null;
      try {
        msgId = await sendWhatsAppTemplate(item.phone, item.variables, templateSid);
      } catch {
        msgId = null;
      }
      await storage.logWhatsappBulkSend({
        employeeId: item.employeeId, employeeName: item.name, phone: item.phone,
        templateSid, templateName: state.templateName, variables: item.variables,
        status: msgId ? "sent" : "failed", messageSid: msgId,
        error: msgId ? null : "Twilio gönderim hatası",
        createdByUserId: state.createdByUserId, batchId: state.batchId,
      });
      if (msgId) {
        state.sent++;
        consecutiveFailures = 0;
      } else {
        state.failed++;
        consecutiveFailures++;
        // Art arda Twilio hatası (örn. 24 saatlik mesajlaşma kotası dolması gibi kalıcı bir
        // sorun) — kalan tüm alıcılara boşuna denemek yerine kampanyayı burada durdur.
        if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
          state.status = "stopped";
          state.stopReason = "consecutive_failures";
          state.current = null;
          return;
        }
      }
    }

    // Twilio WhatsApp kanal hız limitine (63018) takılmamak için mesajlar arası
    // bekleme — sunucu tarafı postTwilioMessage() içinde de 63018'de otomatik
    // retry+backoff yapıyor (server/whatsapp.ts).
    if (i < items.length - 1 && !state.stopRequested) await sleep(1500);
  }
  state.status = "done";
  state.current = null;
}
