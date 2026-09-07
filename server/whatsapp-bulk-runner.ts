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
  stopRequested: boolean;
  startedAt: Date;
};

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
    stopRequested: false,
    startedAt: new Date(),
  };
  activeBatches.set(batchId, state);

  // Fire-and-forget — the HTTP handler returns immediately with batchId; this
  // keeps running on the server regardless of what the client does afterward.
  runBatch(state, params.templateSid, params.items).catch((err) => {
    console.error(`[whatsapp-bulk] batch ${batchId} crashed`, err);
    state.status = "stopped";
  });

  return batchId;
}

async function runBatch(state: BatchState, templateSid: string, items: BulkSendItem[]) {
  for (let i = 0; i < items.length; i++) {
    if (state.stopRequested) {
      state.status = "stopped";
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
      if (msgId) state.sent++; else state.failed++;
    }

    // Twilio WhatsApp kanal hız limitine (63018) takılmamak için mesajlar arası
    // bekleme — sunucu tarafı postTwilioMessage() içinde de 63018'de otomatik
    // retry+backoff yapıyor (server/whatsapp.ts).
    if (i < items.length - 1 && !state.stopRequested) await sleep(1500);
  }
  state.status = "done";
  state.current = null;
}
