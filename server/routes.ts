import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { requireAuth, requireAdmin, requireHiringManagerOrAdmin, requireFinancialsAccess } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertInterviewSchema, insertOfferSchema, type InsertTask, TASK_STATUSES } from "@shared/schema";
import { getAuthUrl, createOAuth2Client, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "./google";
import { sendWhatsApp, sendWhatsAppTemplate, checkWhatsAppStatus, publicBaseUrl } from "./whatsapp";
import { sendEmail } from "./email";

// Scoping helper:
//   admin      → undefined (all jobs)
//   assistant  → strictly their assigned job IDs (empty array = see nothing)
//   HM         → assigned job IDs, or undefined if none assigned (legacy: sees all)
function jobFilter(req: Request): number[] | undefined {
  const { role, assignedJobIds } = req.user!;
  if (role === "admin") return undefined;
  if (role === "assistant") return assignedJobIds; // always scoped, even if empty
  return assignedJobIds.length ? assignedJobIds : undefined;
}

// Send each agent of a closing a WhatsApp breakdown of their side. Returns delivery counts.
async function sendClosingNotifications(_closingId: number, _agentIdFilter?: number): Promise<{ sent: number; skipped: number }> {
  return { sent: 0, skipped: 0 };
  // WhatsApp closing notifications disabled
  let sent = 0, skipped = 0;
  const details = await storage.getClosing(_closingId) as any;
  if (!details) return { sent, skipped };

  const sideLabel: Record<string, string> = { buyer: "Alıcı", seller: "Satıcı", referral: "Referans" };
  const fmt = (n: string | null | undefined) =>
    n ? Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

  for (const side of details.sides) {
    for (const agent of side.agents) {
      if (agentIdFilter !== undefined && agent.id !== agentIdFilter) continue;
      // Use agent's own date if set; otherwise fallback to closing-level date
      const agentDate = (agent as any).closingDate ?? details.closingDate;
      const dateStr = agentDate ? new Date(agentDate).toLocaleDateString("tr-TR") : "—";
      const emp = await storage.getEmployee(agent.employeeId);
      if (!emp?.candidate?.phone) { skipped++; continue; }
      const name = emp.candidate.name ?? "Danışman";

      const paymentLines: string[] = [];
      if (Number(agent.banka) > 0) paymentLines.push(`🏦 Banka: ₺${fmt(agent.banka)}`);
      if (Number(agent.nakit) > 0) paymentLines.push(`💵 Nakit: ₺${fmt(agent.nakit)}`);
      if (Number(agent.kasa)  > 0) paymentLines.push(`🗄️ Kasa: ₺${fmt(agent.kasa)}`);

      const message = [
        `Merhaba ${name} 👋`,
        "",
        `Bir kapanış kaydınız mevcut:`,
        "",
        `📍 ${details.propertyAddress || "—"}`,
        `📅 Tarih: ${dateStr}`,
        `💰 Satış Değeri: ₺${fmt(details.saleValue)}`,
        `🤝 Taraf: ${sideLabel[side.sideType] ?? side.sideType}`,
        "",
        `BHB Payınız: ₺${fmt(agent.bhbShare)}`,
        `Ana Merkez Payı: ₺${fmt(agent.mainBranchShare)}`,
        `KWTR KDV: ₺${fmt(agent.kwtrKdv)}`,
        `BM Payı (Hesaplanan): ₺${fmt(agent.marketCenterDue)}`,
        `BM Payı (Uygulanan): ₺${fmt(agent.marketCenterActual)}`,
        `BM KDV: ₺${fmt(agent.bmKdv)}`,
        ...(Number(agent.ukShare) > 0 ? [`ÜK Payı: ₺${fmt(agent.ukShare)}`] : []),
        `Net Geliriniz: ₺${fmt(agent.employeeNet)}`,
        ...(paymentLines.length > 0 ? ["", "Ödeme Detayı:", ...paymentLines] : []),
      ].join("\n");

      const id = await sendWhatsApp(emp.candidate.phone, message);
      if (id) sent++; else skipped++;
    }
  }
  return { sent, skipped };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Seed default admin on startup
  await storage.seedAdminIfEmpty();

  // ── Auth ─────────────────────────────────────────────────────────────────────

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email and password are required" });
      const user = await storage.getUserByEmailFull(email);
      if (!user) return res.status(401).json({ message: "Invalid email or password" });
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });
      req.session.userId = user.id;
      const { passwordHash: _, ...publicUser } = user;
      res.json(publicUser);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {});
    res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  // ── Listings (Portal İlanları) ──────────────────────────────────────────────

  app.post("/api/listings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { listingNumber, price, publishedDate, durationDays, advisorName, employeeId, office, store, status } = req.body;
      if (!listingNumber?.trim()) return res.status(400).json({ message: "İlan numarası zorunludur" });
      const listing = await storage.createListing({
        listingNumber: listingNumber.trim(),
        price: price ? String(price).replace(/[^0-9.]/g, "") || null : null,
        publishedDate: publishedDate || null,
        durationDays: durationDays ? Number(durationDays) : null,
        advisorName: advisorName || null,
        employeeId: employeeId ? Number(employeeId) : null,
        office: office || null,
        store: store || null,
        status: status ?? "active",
      });
      res.status(201).json(listing);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Bu ilan numarası zaten mevcut" });
      console.error("[POST /api/listings]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/summary", requireAuth, requireAdmin, async (_req, res) => {
    try { res.json(await storage.getListingsSummary()); }
    catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/listings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const q = req.query;
      res.json(await storage.getListings({
        status: q.status ? String(q.status) : undefined,
        needsAgreement: q.needsAgreement === "1",
        needsReason: q.needsReason === "1",
        needsAny: q.needsAny === "1",
        hasAgreement: q.hasAgreement === "1",
        hasReason: q.hasReason === "1",
        onlyMatched: q.onlyMatched === "1",
        onlyUnmatched: q.onlyUnmatched === "1",
        missingPhone: q.missingPhone === "1",
        missingEmail: q.missingEmail === "1",
        search: q.search ? String(q.search) : undefined,
      }));
    } catch (err) {
      console.error("[GET /api/listings]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Import a portal report (active or passive sheet). Optionally WhatsApp advisors.
  app.post("/api/listings/import", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { type, rows, notify } = req.body as { type: "active" | "passive"; rows: any[]; notify?: boolean };
      if ((type !== "active" && type !== "passive") || !Array.isArray(rows)) {
        return res.status(400).json({ message: "type ('active'|'passive') ve rows[] gerekli" });
      }
      const result = await storage.importListings(type, rows);
      res.json({
        created: result.created,
        updated: result.updated,
        newActive: result.newActive.length,
        newlyPassive: result.newlyPassive.length,
      });

      if (notify) (async () => {
        const base = publicBaseUrl();
        const targets = type === "active" ? result.newActive : result.newlyPassive;
        const kind = type === "active" ? "new" : "passive";
        for (let i = 0; i < targets.length; i++) {
          const l = targets[i];
          try {
            if (!l.employeeId) continue;
            const emp = await storage.getEmployee(l.employeeId);
            const phone = emp?.candidate?.phone;
            const name = emp?.candidate?.name ?? "Danışman";
            if (!phone) continue;
            const link = `${base}/l/${l.publicToken}`;
            const isActive = type === "active";
            const msgId = await sendWhatsAppTemplate(phone, {
              "1": name,
              "2": isActive ? "1" : "0",
              "3": isActive ? "0" : "1",
              "4": link,
            });
            await storage.markListingNotified(l.id, kind, msgId);
            console.log(`[listings notify] ${l.listingNumber} → ${phone} msgId=${msgId ?? "n/a"}`);
          } catch (e) { console.warn("[listings notify]", e); }
          if (i < targets.length - 1) await new Promise(r => setTimeout(r, 300));
        }
      })();
    } catch (err) {
      console.error("[POST /api/listings/import]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Check Green API delivery status for a sent notification
  app.get("/api/listings/:id/notify-status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const kind = (req.query.kind as string) === "passive" ? "passive" : "new";
      const listing = await storage.getListing(id);
      if (!listing) return res.status(404).json({ message: "Not found" });

      const msgId = kind === "new" ? (listing as any).notifyMsgIdNew : (listing as any).notifyMsgIdPassive;
      if (!msgId) return res.json({ status: null, msgId: null, note: "Mesaj ID kaydedilmemiş" });

      if (!listing.employeeId) return res.json({ status: null, msgId, note: "Danışman eşleşmesi yok" });
      const emp = await storage.getEmployee(listing.employeeId);
      const phone = emp?.candidate?.phone;
      if (!phone) return res.json({ status: null, msgId, note: "Telefon numarası yok" });

      const status = await checkWhatsAppStatus(phone, msgId);
      res.json({ status, msgId });
    } catch (err) {
      console.error("[GET /api/listings/:id/notify-status]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/listings/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { employeeId, status, clearAgreement, passiveAt } = req.body;
      const id = Number(req.params.id);
      if (clearAgreement) {
        await storage.clearListingAgreement(id);
        return res.json({ ok: true });
      }
      const patch: any = {};
      if (employeeId !== undefined) patch.employeeId = employeeId === null ? null : Number(employeeId);
      if (status) patch.status = status;
      if (passiveAt !== undefined) patch.passiveAt = passiveAt ? new Date(passiveAt) : null;
      res.json(await storage.updateListing(id, patch));
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  // (Re)send the advisor self-service notification for one listing
  app.post("/api/listings/:id/notify", requireAuth, requireAdmin, async (req, res) => {
    try {
      const l = await storage.getListing(Number(req.params.id));
      if (!l) return res.status(404).json({ message: "İlan bulunamadı" });
      if (!l.employeeId) return res.status(400).json({ message: "İlan bir danışmanla eşleşmemiş" });

      // Cooldown: aynı ilana 5 dakika içinde tekrar gönderilemez
      const COOLDOWN_MS = 5 * 60 * 1000;
      const kind: "new" | "passive" = l.status === "active" ? "new" : "passive";
      const lastSent = kind === "new" ? (l as any).notifiedNewAt : (l as any).notifiedPassiveAt;
      if (lastSent && Date.now() - new Date(lastSent).getTime() < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(lastSent).getTime())) / 1000);
        return res.status(429).json({ message: `Son bildirimden ${remaining} saniye sonra tekrar gönderilebilir` });
      }

      const emp = await storage.getEmployee(l.employeeId);
      const phone = emp?.candidate?.phone;
      if (!phone) return res.status(400).json({ message: "Danışmanın telefonu kayıtlı değil" });
      const name = emp?.candidate?.name ?? "Danışman";
      const link = `${publicBaseUrl()}/l/${l.publicToken}`;
      const msgId = await sendWhatsAppTemplate(phone, {
        "1": name,
        "2": kind === "new" ? "1" : "0",
        "3": kind === "new" ? "0" : "1",
        "4": link,
      });
      await storage.markListingNotified(l.id, kind, msgId);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  // In-memory bulk notify progress state (single concurrent job)
  const bulkNotifyState = {
    active: false,
    total: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    current: null as string | null,
    done: false,
    startedAt: null as Date | null,
  };

  app.get("/api/listings/notify-bulk/status", requireAuth, requireAdmin, (_req, res) => {
    res.json({ ...bulkNotifyState });
  });

  // Bulk WhatsApp notify for a set of listing IDs (fire-and-forget, random 45-60 s delay)
  app.post("/api/listings/notify-bulk", requireAuth, requireAdmin, async (req, res) => {
    if (bulkNotifyState.active)
      return res.status(409).json({ message: "Zaten bir gönderim devam ediyor. Bitmesini bekleyin." });
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "ids[] gerekli" });

    bulkNotifyState.active = true;
    bulkNotifyState.total = ids.length;
    bulkNotifyState.sent = 0;
    bulkNotifyState.skipped = 0;
    bulkNotifyState.failed = 0;
    bulkNotifyState.current = null;
    bulkNotifyState.done = false;
    bulkNotifyState.startedAt = new Date();

    res.json({ queued: ids.length });

    (async () => {
      const base = publicBaseUrl();
      const COOLDOWN_MS = 5 * 60 * 1000;
      for (let i = 0; i < ids.length; i++) {
        try {
          const l = await storage.getListing(ids[i]);
          if (!l || !l.employeeId) { bulkNotifyState.skipped++; continue; }
          bulkNotifyState.current = l.listingNumber;
          const kind: "new" | "passive" = l.status === "active" ? "new" : "passive";
          const lastSent = kind === "new" ? (l as any).notifiedNewAt : (l as any).notifiedPassiveAt;
          if (lastSent && Date.now() - new Date(lastSent).getTime() < COOLDOWN_MS) {
            bulkNotifyState.skipped++; continue;
          }
          const emp = await storage.getEmployee(l.employeeId);
          const phone = emp?.candidate?.phone;
          const name = emp?.candidate?.name ?? "Danışman";
          if (!phone) { bulkNotifyState.skipped++; continue; }
          const link = `${base}/l/${l.publicToken}`;
          const msgId = await sendWhatsAppTemplate(phone, {
            "1": name,
            "2": kind === "new" ? "1" : "0",
            "3": kind === "new" ? "0" : "1",
            "4": link,
          });
          await storage.markListingNotified(l.id, kind, msgId);
          bulkNotifyState.sent++;
          console.log(`[bulk notify] ${l.listingNumber} → ${phone} msgId=${msgId ?? "n/a"}`);
        } catch (e) {
          bulkNotifyState.failed++;
          console.warn("[bulk notify]", e);
        }
        if (i < ids.length - 1) await new Promise(r => setTimeout(r, 300));
      }
      bulkNotifyState.active = false;
      bulkNotifyState.done = true;
      bulkNotifyState.current = null;
    })();
  });

  app.get("/api/listings/:id/agreement-files", requireAuth, requireAdmin, async (req, res) => {
    try {
      const files = await storage.getListingAgreementFileMetas(Number(req.params.id));
      res.json(files);
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/listings/:id/agreement-files/:fileId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const file = await storage.getListingAgreementFileById(Number(req.params.fileId));
      if (!file) return res.status(404).json({ message: "Dosya yok" });
      res.setHeader("Content-Type", file.mime);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.name)}"`);
      res.send(Buffer.from(file.data, "base64"));
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.delete("/api/listings/:id/agreement-files/:fileId", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteListingAgreementFile(Number(req.params.fileId), Number(req.params.id));
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  // Download the uploaded yetki sözleşmesi
  app.get("/api/listings/:id/agreement", requireAuth, requireAdmin, async (req, res) => {
    try {
      const f = await storage.getListingAgreementFile(Number(req.params.id));
      if (!f) return res.status(404).json({ message: "Dosya yok" });
      res.setHeader("Content-Type", f.mime);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.name)}"`);
      res.send(Buffer.from(f.data, "base64"));
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  // Wipe all listings (re-baseline before a fresh import)
  app.delete("/api/listings", requireAuth, requireAdmin, async (_req, res) => {
    try { await storage.clearListings(); res.status(204).send(); }
    catch { res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Listing Reports ──────────────────────────────────────────────────────────

  // Feature 1: Danışman bazlı rapor
  app.get("/api/listings/reports/advisor", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    try { res.json(await storage.getListingReportByAdvisor()); }
    catch (err) { console.error("[GET /api/listings/reports/advisor]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // Feature 2: Ofis bazlı kırılım
  app.get("/api/listings/reports/office", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    try { res.json(await storage.getListingReportByOffice()); }
    catch (err) { console.error("[GET /api/listings/reports/office]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // Feature 3: Kalkış sebebi analizi
  app.get("/api/listings/reports/close-reasons", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    try { res.json(await storage.getListingCloseReasonStats()); }
    catch (err) { console.error("[GET /api/listings/reports/close-reasons]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // Feature 4: Aylık trend
  app.get("/api/listings/reports/monthly-trend", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    try { res.json(await storage.getListingMonthlyTrend()); }
    catch (err) { console.error("[GET /api/listings/reports/monthly-trend]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // Satılık / Kiralık özet istatistikleri
  app.get("/api/listings/reports/type-stats", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    try { res.json(await storage.getListingTypeStats()); }
    catch (err) { console.error("[GET /api/listings/reports/type-stats]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // İlan tarihi bazlı rapor
  app.get("/api/listings/reports/date-report", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    try { res.json(await storage.getListingDateReport()); }
    catch (err) { console.error("[GET /api/listings/reports/date-report]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/listings/reports/age-groups", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    try { res.json(await storage.getListingAgeGroups()); }
    catch (err) { console.error("[GET /api/listings/reports/age-groups]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/listings/reports/over-90-days", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    try { res.json(await storage.getListingsOver90Days()); }
    catch (err) { console.error("[GET /api/listings/reports/over-90-days]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // Feature 5 & 6: Otomatik hatırlatma (manual trigger)
  app.post("/api/listings/reminders/run", requireAuth, requireAdmin, async (req, res) => {
    try {
      const agreementDays = Number(req.body?.agreementDays ?? 3);
      const closeReasonDays = Number(req.body?.closeReasonDays ?? 3);
      const { agreementListings, closeReasonListings } = await storage.runListingReminders(agreementDays, closeReasonDays);

      res.json({
        agreementQueued: agreementListings.length,
        closeReasonQueued: closeReasonListings.length,
      });

      // WhatsApp listing reminders disabled
    } catch (err) {
      console.error("[POST /api/listings/reminders/run]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Feature 8: Fiyat geçmişi
  app.get("/api/listings/:id/price-history", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await storage.getListingPriceHistory(Number(req.params.id))); }
    catch (err) { console.error("[GET /api/listings/:id/price-history]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // Unmatched advisors grouped by name
  app.get("/api/listings/unmatched-advisors", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await storage.getUnmatchedAdvisors()); }
    catch (err) { console.error("[GET /api/listings/unmatched-advisors]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/listings/fuzzy-suggestions", requireAuth, requireAdmin, async (_req, res) => {
    try { res.json(await storage.getFuzzySuggestions()); }
    catch (err) { console.error("[GET /api/listings/fuzzy-suggestions]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // Bulk assign all unmatched listings for a given advisor name
  app.post("/api/listings/assign-by-name", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { advisorName, employeeId } = req.body;
      if (!advisorName || !employeeId) return res.status(400).json({ message: "advisorName and employeeId are required" });
      const updated = await storage.assignListingsByAdvisorName(String(advisorName), Number(employeeId));
      res.json({ updated });
    } catch (err) { console.error("[POST /api/listings/assign-by-name]", err); res.status(500).json({ message: "Internal server error" }); }
  });

  // Daily reminder scheduler disabled (WhatsApp listing reminders turned off)

  // ── Public listing self-service (token, no auth) ────────────────────────────

  app.get("/api/public/listings/:token", async (req, res) => {
    try {
      const l = await storage.getListingByToken(req.params.token);
      if (!l) return res.status(404).json({ message: "Bağlantı geçersiz" });
      res.json({
        listingNumber: l.listingNumber,
        price: l.price,
        status: l.status,
        office: l.office,
        store: l.store,
        publishedDate: l.publishedDate,
        removedDate: l.removedDate,
        employeeName: l.employeeName,
        agreementUploaded: !!l.agreementUploadedAt,
        closeReason: l.closeReason,
        closeReasonSubmitted: !!l.closeReasonSubmittedAt,
      });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/public/listings/:token/agreement", async (req, res) => {
    try {
      const listing = await storage.getListingByToken(req.params.token);
      if (!listing) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const body = req.body as { files?: { fileName?: string; mime?: string; data?: string }[]; fileName?: string; mime?: string; data?: string };
      const rawFiles = body.files ?? (body.data ? [{ fileName: body.fileName, mime: body.mime, data: body.data }] : []);
      if (!rawFiles.length) return res.status(400).json({ message: "Dosya gerekli" });
      for (const f of rawFiles) {
        if (!f.data) return res.status(400).json({ message: "Dosya gerekli" });
        if (f.data.length > 9_500_000) return res.status(413).json({ message: "Dosya çok büyük (en fazla ~7MB)" });
      }
      const saved = await storage.addListingAgreementFiles(listing.id, rawFiles.map(f => ({
        name: f.fileName || "yetki-sozlesmesi",
        mime: f.mime || "application/octet-stream",
        data: f.data!,
      })));
      res.json({ ok: true, files: saved });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/public/listings/:token/files", async (req, res) => {
    try {
      const listing = await storage.getListingByToken(req.params.token);
      if (!listing) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const files = await storage.getListingAgreementFileMetas(listing.id);
      res.json(files);
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.delete("/api/public/listings/:token/files/:fileId", async (req, res) => {
    try {
      const listing = await storage.getListingByToken(req.params.token);
      if (!listing) return res.status(404).json({ message: "Bağlantı geçersiz" });
      await storage.deleteListingAgreementFile(Number(req.params.fileId), listing.id);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/public/listings/:token/reason", async (req, res) => {
    try {
      const { reason, note } = req.body as { reason?: string; note?: string };
      if (!reason) return res.status(400).json({ message: "Sebep gerekli" });
      const row = await storage.setListingCloseReason(req.params.token, reason, note || null);
      if (!row) return res.status(404).json({ message: "Bağlantı geçersiz" });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Public advisor batch self-service (token, no auth) ──────────────────────

  app.get("/api/public/advisor/:token", async (req, res) => {
    try {
      const emp = await storage.getAdvisorByToken(req.params.token);
      if (!emp) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const pending = await storage.getAdvisorPendingListings(emp.id);
      res.json({
        name: (emp as any).candidate?.name ?? "Danışman",
        active: pending.active.map((l) => ({
          id: l.id, listingNumber: l.listingNumber, price: l.price,
          publishedDate: l.publishedDate, office: l.office, store: l.store,
          publicToken: l.publicToken,
          noAgreementAt: (l as any).noAgreementAt ?? null,
        })),
        passive: pending.passive.map((l) => ({
          id: l.id, listingNumber: l.listingNumber, price: l.price,
          removedDate: l.removedDate, office: l.office, store: l.store,
          publicToken: l.publicToken,
        })),
      });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/public/advisor/:token/listings/:listingId/agreement", async (req, res) => {
    try {
      const emp = await storage.getAdvisorByToken(req.params.token);
      if (!emp) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const listing = await storage.getListing(Number(req.params.listingId));
      if (!listing || listing.employeeId !== emp.id) return res.status(404).json({ message: "İlan bulunamadı" });
      const body = req.body as { files?: { fileName?: string; mime?: string; data?: string }[]; fileName?: string; mime?: string; data?: string };
      const rawFiles = body.files ?? (body.data ? [{ fileName: body.fileName, mime: body.mime, data: body.data }] : []);
      if (!rawFiles.length) return res.status(400).json({ message: "Dosya gerekli" });
      for (const f of rawFiles) {
        if (!f.data) return res.status(400).json({ message: "Dosya gerekli" });
        if (f.data.length > 9_500_000) return res.status(413).json({ message: "Dosya çok büyük (en fazla ~7MB)" });
      }
      const saved = await storage.addListingAgreementFiles(listing.id, rawFiles.map(f => ({
        name: f.fileName || "yetki-sozlesmesi",
        mime: f.mime || "application/octet-stream",
        data: f.data!,
      })));
      res.json({ ok: true, files: saved });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/public/advisor/:token/listings/:listingId/files", async (req, res) => {
    try {
      const emp = await storage.getAdvisorByToken(req.params.token);
      if (!emp) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const listing = await storage.getListing(Number(req.params.listingId));
      if (!listing || listing.employeeId !== emp.id) return res.status(404).json({ message: "İlan bulunamadı" });
      const files = await storage.getListingAgreementFileMetas(listing.id);
      res.json(files);
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.delete("/api/public/advisor/:token/listings/:listingId/files/:fileId", async (req, res) => {
    try {
      const emp = await storage.getAdvisorByToken(req.params.token);
      if (!emp) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const listing = await storage.getListing(Number(req.params.listingId));
      if (!listing || listing.employeeId !== emp.id) return res.status(404).json({ message: "İlan bulunamadı" });
      await storage.deleteListingAgreementFile(Number(req.params.fileId), listing.id);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/public/advisor/:token/listings/:listingId/to-passive", async (req, res) => {
    try {
      const emp = await storage.getAdvisorByToken(req.params.token);
      if (!emp) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const ok = await storage.setListingToPassive(Number(req.params.listingId), emp.id);
      if (!ok) return res.status(404).json({ message: "İlan bulunamadı veya zaten pasif" });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/public/advisor/:token/listings/:listingId/no-agreement", async (req, res) => {
    try {
      const emp = await storage.getAdvisorByToken(req.params.token);
      if (!emp) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const row = await storage.toggleListingNoAgreement(Number(req.params.listingId), emp.id);
      if (!row) return res.status(404).json({ message: "İlan bulunamadı" });
      res.json({ ok: true, noAgreementAt: (row as any).noAgreementAt });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/public/advisor/:token/listings/:listingId/hand-delivered", async (req, res) => {
    try {
      const emp = await storage.getAdvisorByToken(req.params.token);
      if (!emp) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const ok = await storage.setListingHandDelivered(Number(req.params.listingId), emp.id);
      if (!ok) return res.status(404).json({ message: "İlan bulunamadı" });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/public/advisor/:token/listings/:listingId/reason", async (req, res) => {
    try {
      const emp = await storage.getAdvisorByToken(req.params.token);
      if (!emp) return res.status(404).json({ message: "Bağlantı geçersiz" });
      const listing = await storage.getListing(Number(req.params.listingId));
      if (!listing || listing.employeeId !== emp.id) return res.status(404).json({ message: "İlan bulunamadı" });
      const { reason, note } = req.body as { reason?: string; note?: string };
      if (!reason) return res.status(400).json({ message: "Sebep gerekli" });
      const row = await storage.setListingCloseReason(listing.publicToken!, reason, note || null);
      if (!row) return res.status(404).json({ message: "İlan bulunamadı" });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Get (or create) advisor self-service link without sending WA ─────────────

  app.get("/api/listings/advisor-link/:employeeId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const token = await storage.ensureAdvisorToken(employeeId);
      res.json({ link: `${publicBaseUrl()}/a/${token}`, token });
    } catch (err) {
      console.error("[GET /api/listings/advisor-link]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Notify a single advisor (one WhatsApp with link to all their pending listings) ──

  app.post("/api/listings/notify-advisor/:employeeId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const channel: "wa" | "email" = req.body?.channel === "email" ? "email" : "wa";
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "Danışman bulunamadı" });
      const name = (emp as any).candidate?.name ?? "Danışman";

      const pending = await storage.getAdvisorPendingListings(employeeId);
      if (pending.active.length === 0 && pending.passive.length === 0) {
        return res.status(400).json({ message: "Bu danışmanın bekleyen ilanı yok" });
      }

      const advisorToken = await storage.ensureAdvisorToken(employeeId);
      const link = `${publicBaseUrl()}/a/${advisorToken}`;
      const activeCount = pending.active.length;
      const passiveCount = pending.passive.length;

      if (channel === "wa") {
        const phone = (emp as any).candidate?.phone;
        if (!phone) return res.status(400).json({ message: "Danışmanın telefonu kayıtlı değil" });

        const COOLDOWN_MS = 5 * 60 * 1000;
        const lastNotified = (emp as any).advisorLastNotifiedAt;
        if (lastNotified && Date.now() - new Date(lastNotified).getTime() < COOLDOWN_MS) {
          const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(lastNotified).getTime())) / 1000);
          return res.status(429).json({ message: `Son bildirimden ${remaining} saniye sonra tekrar gönderilebilir` });
        }

        const msgId = await sendWhatsAppTemplate(phone, {
          "1": name,
          "2": String(activeCount),
          "3": String(passiveCount),
          "4": link,
        });
        await storage.markAdvisorNotified(employeeId, msgId);
        return res.json({ ok: true, channel: "wa", msgId });
      }

      // email channel
      const email = (emp as any).candidate?.email;
      if (!email) return res.status(400).json({ message: "Danışmanın email adresi kayıtlı değil" });

      const htmlLines: string[] = [`<p>Merhaba <b>${name}</b> 👋</p>`];
      if (activeCount > 0) htmlLines.push(`<p>📋 <b>${activeCount}</b> aktif ilanınız için yetki sözleşmesi bekleniyor.</p>`);
      if (passiveCount > 0) htmlLines.push(`<p>📋 <b>${passiveCount}</b> pasife düşen ilanınız için kapanış sebebi bekleniyor.</p>`);
      htmlLines.push(`<p>Tüm ilanlarınızı aşağıdaki <b>size özel</b> link üzerinden görüntüleyip işlem yapabilirsiniz. Bu bağlantıyı lütfen başkalarıyla paylaşmayın:</p>`);
      htmlLines.push(`<p><a href="${link}">${link}</a></p>`);
      const sent = await sendEmail(email, "İlan Bildirimi — KW Platin & Karma", htmlLines.join(""));
      if (sent) await storage.markAdvisorEmailNotified(employeeId);
      return res.json({ ok: sent, channel: "email" });
    } catch (err) {
      console.error("[POST /api/listings/notify-advisor]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Advisor notification status ──────────────────────────────────────────────

  // GET /api/employees/notify-status
  // Returns all active employees that have at least one pending listing,
  // together with their last notification timestamp and WP message id.
  app.get("/api/employees/notify-status", requireAuth, requireAdmin, async (req, res) => {
    try {
      // 2 queries total instead of 1 + N*2
      const [emps, pendingCounts] = await Promise.all([
        storage.getEmployees({ status: "active" }),
        storage.getAllAdvisorPendingCounts(),
      ]);
      const rows = (emps as any[]).map((emp) => {
        const p = pendingCounts[emp.id] ?? { active: 0, passive: 0 };
        return {
          id: emp.id,
          name: emp.candidate?.name ?? `Danışman #${emp.id}`,
          phone: emp.candidate?.phone ?? null,
          email: emp.candidate?.email ?? null,
          totalPending: p.active + p.passive,
          activePending: p.active,
          passivePending: p.passive,
          lastNotifiedAt: emp.advisorLastNotifiedAt ?? null,
          notifyMsgId: emp.advisorNotifyMsgId ?? null,
          lastEmailNotifiedAt: (emp as any).advisorLastEmailNotifiedAt ?? null,
        };
      });
      const filtered = rows.filter((r) => r.totalPending > 0 || r.lastNotifiedAt);
      res.json(filtered);
    } catch (err) {
      console.error("[GET /api/employees/notify-status]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/employees/:id/check-wp-status
  // Checks the WP delivery status of the last advisor notification message.
  app.post("/api/employees/:id/check-wp-status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const employeeId = parseInt(req.params.id, 10);
      if (isNaN(employeeId)) return res.status(400).json({ message: "Geçersiz ID" });
      const emp = await storage.getEmployee(employeeId) as any;
      if (!emp) return res.status(404).json({ message: "Danışman bulunamadı" });
      const phone = emp.candidate?.phone;
      const msgId = emp.advisorNotifyMsgId;
      if (!phone || !msgId) return res.json({ status: null });
      const status = await checkWhatsAppStatus(phone, msgId);
      res.json({ status });
    } catch (err) {
      console.error("[POST /api/employees/:id/check-wp-status]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Google OAuth ─────────────────────────────────────────────────────────────

  app.get("/api/auth/google", (req, res) => {
    try {
      const isLink = typeof req.query.link === "string";
      const state = isLink ? "link" : undefined;
      const url = getAuthUrl(state, isLink);
      return res.json({ url });
    } catch (err) {
      console.error("[GOOGLE AUTH ERROR]:", err);
      return res.status(500).json({ message: "Google auth not configured", detail: String(err) });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };

    const htmlRedirect = (path: string) =>
      res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${path}"></head><body><script>window.location.replace('${path}');</script></body></html>`);

    if (!code) return htmlRedirect("/?error=no_code");

    try {
      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const { google: gApis } = await import("googleapis");
      const oauth2 = gApis.oauth2({ version: "v2", auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();

      if (!profile.id || !profile.email) return htmlRedirect("/?error=no_profile");

      if (state === "link" && req.session?.userId) {
        await storage.updateUserGoogleTokens(req.session.userId, {
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token ?? undefined,
          expiryDate: tokens.expiry_date ?? undefined,
        });
        const { db } = await import("./db");
        const { users: usersTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(usersTable).set({ googleId: profile.id }).where(eq(usersTable.id, req.session.userId));
        return htmlRedirect("/dashboard?google=linked");
      }

      const user = await storage.upsertGoogleUser({
        googleId: profile.id,
        email: profile.email,
        name: profile.name ?? profile.email,
      });

      if (!user) return htmlRedirect("/login?error=not_authorized");

      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
      return htmlRedirect("/dashboard");
    } catch (err) {
      console.error("Google OAuth error:", err);
      return htmlRedirect("/login?error=google_failed");
    }
  });

  // ── Google Calendar ───────────────────────────────────────────────────────────

  app.post("/api/interviews/:id/calendar", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const interview = await storage.getInterview(id);
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    const user = await storage.getUserById(req.user!.id);
    if (!user?.googleAccessToken) {
      return res.status(400).json({ message: "Google Calendar not connected" });
    }

    const candidate = interview.candidate;
    const title = `Randevu: ${candidate?.name ?? "Aday"}`;
    const refLines: string[] = [];
    if (candidate?.phone) refLines.push(`Telefon: ${candidate.phone}`);
    if (candidate?.referredBy) refLines.push(`Referans: ${candidate.referredBy}`);
    const description = [...refLines, ...(interview.notes ? [interview.notes] : [])].join("\n");

    // Collect attendee emails: candidate + all hiring managers assigned to this job
    const assignees = await storage.getJobAssignees(interview.jobId);
    const attendeeEmails: string[] = [];
    if (candidate?.email) attendeeEmails.push(candidate.email);
    for (const assignee of assignees) {
      if (assignee.email && !attendeeEmails.includes(assignee.email)) {
        attendeeEmails.push(assignee.email);
      }
    }

    try {
      const eventId = await createCalendarEvent(user, {
        title,
        description,
        startTime: new Date(interview.startTime),
        endTime: new Date(interview.endTime),
        location: interview.location ?? undefined,
        attendeeEmails,
      });

      if (eventId) {
        await storage.setInterviewCalendarEventId(id, eventId);
      }

      res.json({ success: true, eventId });
    } catch (err: any) {
      console.error("Calendar error:", err);
      res.status(500).json({ message: err.message || "Calendar error" });
    }
  });

  app.delete("/api/interviews/:id/calendar", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const interview = await storage.getInterview(id);
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    const user = await storage.getUserById(req.user!.id);
    if (!user?.googleAccessToken || !interview.calendarEventId) {
      return res.status(400).json({ message: "No calendar event to remove" });
    }

    try {
      await deleteCalendarEvent(user, interview.calendarEventId);
      await storage.setInterviewCalendarEventId(id, "");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Calendar delete error" });
    }
  });

  // ── Users (admin only) ────────────────────────────────────────────────────────

  app.get("/api/users", requireAuth, requireAdmin, async (_req, res) => {
    res.json(await storage.getUsers());
  });

  app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, email, password, role } = req.body;
      if (!name || !email || !password) return res.status(400).json({ message: "Name, email, and password are required" });
      const hash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ name, email, passwordHash: hash, role: role || "hiring_manager" });
      res.status(201).json(user);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Email already in use" });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, email, password, role, canViewFinancials } = req.body;
      const update: any = {};
      if (name) update.name = name;
      if (email) update.email = email;
      if (role) update.role = role;
      if (canViewFinancials !== undefined) update.canViewFinancials = canViewFinancials;
      if (password) update.passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.updateUser(Number(req.params.id), update);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Email already in use" });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (req.user!.id === id) return res.status(400).json({ message: "Kendi hesabınızı silemezsiniz" });
      await storage.deleteUser(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Kullanıcı silinemedi" });
    }
  });

  // ── Job Assignments ───────────────────────────────────────────────────────────

  app.get("/api/jobs/:id/assignees", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    res.json(await storage.getJobAssignees(Number(req.params.id)));
  });

  app.post("/api/jobs/:id/assign", requireAuth, requireAdmin, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    await storage.assignJob(Number(req.params.id), Number(userId));
    res.json({ message: "Assigned" });
  });

  app.delete("/api/jobs/:id/assign/:userId", requireAuth, requireAdmin, async (req, res) => {
    await storage.unassignJob(Number(req.params.id), Number(req.params.userId));
    res.status(204).send();
  });

  // ── Jobs ────────────────────────────────────────────────────────────────────

  app.get(api.jobs.list.path, requireAuth, async (req, res) => {
    // ?all=true lets any role fetch every job (e.g. dashboard overview, candidate-assignment dropdowns)
    const bypassScope = req.query.all === "true";
    res.json(await storage.getJobs(bypassScope ? undefined : jobFilter(req)));
  });

  app.get(api.jobs.get.path, requireAuth, async (req, res) => {
    const job = await storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ message: "Job not found" });
    const filter = jobFilter(req);
    if (filter !== undefined && !filter.includes(job.id)) return res.status(403).json({ message: "Forbidden" });
    res.json(job);
  });

  app.post(api.jobs.create.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.jobs.create.input.parse(req.body);
      const job = await storage.createJob(input);
      res.status(201).json(job);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.jobs.update.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.jobs.update.input.parse(req.body);
      const job = await storage.updateJob(Number(req.params.id), input);
      if (!job) return res.status(404).json({ message: "Job not found" });
      res.json(job);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.jobs.delete.path, requireAuth, requireAdmin, async (req, res) => {
    await storage.deleteJob(Number(req.params.id));
    res.status(204).send();
  });

  // ── Candidates ──────────────────────────────────────────────────────────────

  app.get(api.candidates.list.path, requireAuth, async (req, res) => {
    const { role, id: userId } = req.user!;
    if (role === "assistant") {
      res.json(await storage.getCandidates());
    } else if (role === "hiring_manager") {
      const filter = jobFilter(req);
      res.json(await storage.getCandidates(filter, userId));
    } else {
      res.json(await storage.getCandidates());
    }
  });

  app.get(api.candidates.get.path, requireAuth, async (req, res) => {
    const candidate = await storage.getCandidate(Number(req.params.id));
    if (!candidate) return res.status(404).json({ message: "Candidate not found" });
    if (req.user!.role === "hiring_manager") {
      // Allow if HM created this candidate
      if (candidate.createdByUserId === req.user!.id) {
        return res.json(candidate);
      }
      // Allow if the candidate is an active employee (danışman profili)
      const emp = await storage.getEmployeeByCandidateId(candidate.id);
      if (emp) return res.json(candidate);
      // Or if candidate has applied to one of HM's assigned jobs
      const filter = jobFilter(req);
      if (filter !== undefined) {
        const apps = await storage.getApplications(undefined, candidate.id, filter);
        if (apps.length === 0) return res.status(403).json({ message: "Forbidden" });
      }
    }
    res.json(candidate);
  });

  const PHONE_RE = /^05\d{9}$/;

  app.post(api.candidates.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.candidates.create.input.parse(req.body);
      if (input.phone) {
        if (!PHONE_RE.test(input.phone))
          return res.status(400).json({ message: "Telefon numarası 05xxxxxxxxx formatında olmalıdır (11 haneli)" });
        const dup = await storage.getCandidateByPhone(input.phone);
        if (dup) return res.status(409).json({ message: `Bu telefon numarası zaten kayıtlı: ${dup.name}` });
      }
      const candidate = await storage.createCandidate({ ...input, createdByUserId: req.user!.id });
      res.status(201).json(candidate);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.candidates.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.candidates.update.input.parse(req.body);
      if (input.phone) {
        if (!PHONE_RE.test(input.phone))
          return res.status(400).json({ message: "Telefon numarası 05xxxxxxxxx formatında olmalıdır (11 haneli)" });
        const dup = await storage.getCandidateByPhone(input.phone);
        if (dup && dup.id !== Number(req.params.id))
          return res.status(409).json({ message: `Bu telefon numarası zaten kayıtlı: ${dup.name}` });
      }
      const candidate = await storage.updateCandidate(Number(req.params.id), input);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });
      res.json(candidate);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/candidates/:id", requireAuth, requireAdmin, async (req, res) => {
    await storage.deleteCandidate(Number(req.params.id));
    res.status(204).send();
  });

  // ── Candidate Notes ─────────────────────────────────────────────────────────

  app.get("/api/candidates/:id/history", requireAuth, async (req, res) => {
    res.json(await storage.getCandidateHistory(Number(req.params.id)));
  });

  app.get("/api/candidates/:id/employee", requireAuth, async (req, res) => {
    try {
      const emp = await storage.getEmployeeByCandidateId(Number(req.params.id));
      if (!emp) return res.json(null);
      // Enrich with hiring manager name if applicable
      let uretkenlikKocluguManagerName: string | null = null;
      if (emp.uretkenlikKocluguManagerId) {
        const managers = await storage.getHiringManagers();
        const mgr = managers.find((m) => m.id === emp.uretkenlikKocluguManagerId);
        uretkenlikKocluguManagerName = mgr?.name ?? null;
      }
      res.json({ ...emp, uretkenlikKocluguManagerName });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/candidates/:id/notes", requireAuth, async (req, res) => {
    res.json(await storage.getCandidateNotes(Number(req.params.id)));
  });

  app.post("/api/candidates/:id/notes", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const { content, authorName } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });
      const note = await storage.createCandidateNote({
        candidateId: Number(req.params.id),
        content,
        authorName: authorName || req.user!.name,
      });

      // Parse @mentions and auto-create tasks for matched assistants
      const mentionRegex = /@(\w+)/g;
      const mentions: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = mentionRegex.exec(content)) !== null) {
        mentions.push(m[1].toLowerCase());
      }
      if (mentions.length > 0) {
        const assistants = await storage.getAssistants();
        const dueDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const seen = new Set<number>();
        for (const mention of mentions) {
          const assistant = assistants.find((a) => {
            const firstName = a.name.split(" ")[0].toLowerCase();
            return firstName === mention || a.name.toLowerCase() === mention;
          });
          if (assistant && !seen.has(assistant.id)) {
            seen.add(assistant.id);
            await storage.createTask({
              title: `Not: @${assistant.name.split(" ")[0]} — ${req.user!.name}`,
              description: content,
              dueDate,
              status: "pending",
              assignedToUserId: assistant.id,
              createdByUserId: req.user!.id,
              jobId: null,
              candidateId: Number(req.params.id),
            });
          }
        }
      }

      res.status(201).json(note);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/notes/:id", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    await storage.deleteCandidateNote(Number(req.params.id));
    res.status(204).send();
  });

  // ── Applications ─────────────────────────────────────────────────────────────

  app.get(api.applications.list.path, requireAuth, async (req, res) => {
    const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
    const candidateId = req.query.candidateId ? Number(req.query.candidateId) : undefined;
    const filter = req.user!.role === "assistant" ? undefined : jobFilter(req);
    res.json(await storage.getApplications(jobId, candidateId, filter));
  });

  app.post(api.applications.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.applications.create.input.parse(req.body);
      const role = req.user!.role;
      // HMs can only add applications to their own jobs; assistants can apply to any open job
      if (role === "hiring_manager") {
        const filter = jobFilter(req);
        if (filter !== undefined && !filter.includes(input.jobId)) {
          return res.status(403).json({ message: "Forbidden" });
        }
      } else if (role === "assistant") {
        // Verify the target job exists and is open
        const job = await storage.getJob(input.jobId);
        if (!job) return res.status(404).json({ message: "Job not found" });
        if (job.status !== "open") return res.status(403).json({ message: "Can only apply to open jobs" });
      }
      const existing = await storage.getApplications(input.jobId, input.candidateId);
      if (existing.length > 0) return res.status(409).json({ message: "Bu aday zaten bu pozisyona başvurmuş." });

      // A candidate can only be in one active pipeline at a time
      const allApps = await storage.getApplications(undefined, input.candidateId);
      const activeApp = allApps.find((a) => a.status !== "employed" && a.status !== "rejected");
      if (activeApp) {
        return res.status(409).json({
          message: `Bu aday zaten başka bir pozisyonda aktif süreçte (${activeApp.job?.title ?? "bilinmeyen ilan"}). Bir aday aynı anda yalnızca 1 pozisyona atanabilir.`,
        });
      }

      const application = await storage.createApplication(input);
      await storage.addStageHistory({ applicationId: application.id, candidateId: application.candidateId, jobId: application.jobId, fromStatus: null, toStatus: application.status });
      res.status(201).json(application);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.applications.updateStatus.path, requireAuth, async (req, res) => {
    try {
      const { status } = api.applications.updateStatus.input.parse(req.body);
      const existing = await storage.getApplication(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Application not found" });
      const filter = jobFilter(req);
      if (filter !== undefined && !filter.includes(existing.jobId)) return res.status(403).json({ message: "Forbidden" });
      const fromStatus = existing.status;
      const application = await storage.updateApplicationStatus(Number(req.params.id), status);
      if (!application) return res.status(404).json({ message: "Not found" });
      await storage.addStageHistory({ applicationId: application.id, candidateId: application.candidateId, jobId: application.jobId, fromStatus, toStatus: status });
      // Auto-complete scheduled interviews when candidate reaches hired or beyond
      const AUTO_COMPLETE_STAGES = ["offer", "hired", "myk_training", "account_setup", "documents"];
      if (AUTO_COMPLETE_STAGES.includes(status)) {
        await storage.completeScheduledInterviews(application.candidateId);
      }
      if (status === "documents") {
        // Entering documents → immediately become an active employee
        const existingEmp = await storage.getEmployeeByCandidateId(existing.candidateId);
        if (!existingEmp) {
          await storage.createEmployee({
            candidateId: existing.candidateId,
            jobId: existing.jobId,
            applicationId: existing.id,
            status: "active",
          });
        }
      } else if (fromStatus === "documents" && status !== "employed") {
        // Moved back out of documents → remove the auto-created employee record
        const existingEmp = await storage.getEmployeeByCandidateId(existing.candidateId);
        if (existingEmp) {
          await storage.deleteEmployee(existingEmp.id);
        }
      }
      res.json(application);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/applications/:id/score", requireAuth, async (req, res) => {
    const { score } = req.body;
    if (typeof score !== "number") return res.status(400).json({ message: "Score must be a number" });
    const application = await storage.updateApplicationScore(Number(req.params.id), score);
    if (!application) return res.status(404).json({ message: "Not found" });
    res.json(application);
  });

  // ── Application Documents ──────────────────────────────────────────────────
  app.get("/api/applications/:id/documents", requireAuth, async (req, res) => {
    try {
      const appId = Number(req.params.id);
      const existing = await storage.getApplication(appId);
      if (!existing) return res.status(404).json({ message: "Application not found" });
      const filter = jobFilter(req);
      if (filter !== undefined && !filter.includes(existing.jobId)) return res.status(403).json({ message: "Forbidden" });
      const docs = await storage.getApplicationDocuments(appId);
      res.json(docs ?? { applicationId: appId, receivedDocs: [] });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/applications/:id/documents", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const appId = Number(req.params.id);
      const existing = await storage.getApplication(appId);
      if (!existing) return res.status(404).json({ message: "Application not found" });
      const filter = jobFilter(req);
      if (filter !== undefined && !filter.includes(existing.jobId)) return res.status(403).json({ message: "Forbidden" });
      const { receivedDocs } = req.body;
      if (!Array.isArray(receivedDocs)) return res.status(400).json({ message: "receivedDocs must be an array" });
      const docs = await storage.upsertApplicationDocuments(appId, receivedDocs);
      res.json(docs);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Interviews ─────────────────────────────────────────────────────────────

  app.get(api.interviews.list.path, requireAuth, async (req, res) => {
    // ?all=true bypasses job scoping (used by dashboard for full overview)
    const bypassScope = req.query.all === "true";
    const scopeFilter = bypassScope ? undefined : (req.user!.role === "assistant" ? undefined : jobFilter(req));
    const jobIdParam = req.query.jobId ? Number(req.query.jobId) : undefined;
    const filter = jobIdParam ? [jobIdParam] : scopeFilter;
    res.json(await storage.getInterviews(undefined, filter));
  });

  app.post(api.interviews.create.path, requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : req.body.startTime,
        endTime: req.body.endTime ? new Date(req.body.endTime) : req.body.endTime,
      };
      const input = insertInterviewSchema.parse(body);
      // Assistants see all applications (same bypass as GET /api/applications),
      // so they must be able to create interviews for any application they can access.
      if (req.user!.role !== "assistant") {
        const filter = jobFilter(req);
        if (filter !== undefined && !filter.includes(input.jobId)) return res.status(403).json({ message: "Forbidden" });
      }
      const interview = await storage.createInterview(input);
      res.status(201).json(interview);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.interviews.update.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { status, startTime, endTime } = req.body;

    // Reschedule: update times + increment rescheduleCount + sync calendar
    if (startTime && endTime) {
      const updated = await storage.updateInterview(id, {
        startTime: new Date(startTime),
        endTime: new Date(endTime),
      });
      if (!updated) return res.status(404).json({ message: "Not found" });

      // Update Google Calendar event if one is linked
      if (updated.calendarEventId) {
        try {
          const user = await storage.getUserById(req.user!.id);
          if (!user?.googleAccessToken) throw new Error("No Google token");
          const full = await storage.getInterview(id);
          const candidate = full?.candidate;
          const job = full?.job;
          const title = `Randevu: ${candidate?.name ?? "Aday"}`;
          const assignees = await storage.getJobAssignees(updated.jobId);
          const attendeeEmails = [
            ...(candidate?.email ? [candidate.email] : []),
            ...assignees.map((a) => a.email).filter(Boolean),
          ] as string[];
          const updRefLines: string[] = [];
          if (candidate?.phone) updRefLines.push(`Telefon: ${candidate.phone}`);
          if (candidate?.referredBy) updRefLines.push(`Referans: ${candidate.referredBy}`);
          const updDescription = [...updRefLines, ...(updated.notes ? [updated.notes] : [])].join("\n");
          await updateCalendarEvent(user, updated.calendarEventId, {
            title,
            description: updDescription || undefined,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            location: updated.location ?? undefined,
            attendeeEmails,
          });
        } catch (err) {
          console.error("Calendar update failed (non-fatal):", err);
        }
      }

      return res.json(updated);
    }

    // Status update
    const interview = await storage.updateInterviewStatus(id, status);
    if (!interview) return res.status(404).json({ message: "Not found" });

    // Delete calendar event when interview is cancelled
    if (status === "cancelled" && interview.calendarEventId) {
      try {
        const user = await storage.getUserById(req.user!.id);
        if (user?.googleAccessToken) {
          await deleteCalendarEvent(user, interview.calendarEventId);
          await storage.setInterviewCalendarEventId(id, "");
        }
      } catch (err) {
        console.error("Calendar delete failed (non-fatal):", err);
      }
    }

    res.json(interview);
  });

  app.delete(api.interviews.delete.path, requireAuth, requireAdmin, async (req, res) => {
    await storage.deleteInterview(Number(req.params.id));
    res.status(204).send();
  });

  // ── Offers ─────────────────────────────────────────────────────────────────

  app.get(api.offers.list.path, requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    res.json(await storage.getOffers(undefined, jobFilter(req)));
  });

  app.post(api.offers.create.path, requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const input = insertOfferSchema.parse(req.body);
      const filter = jobFilter(req);
      if (filter !== undefined && !filter.includes(input.jobId)) return res.status(403).json({ message: "Forbidden" });
      const offer = await storage.createOffer(input);
      res.status(201).json(offer);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.offers.update.path, requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    const { status } = req.body;
    const offer = await storage.updateOfferStatus(Number(req.params.id), status);
    if (!offer) return res.status(404).json({ message: "Not found" });
    res.json(offer);
  });

  app.delete(api.offers.delete.path, requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    await storage.deleteOffer(Number(req.params.id));
    res.status(204).send();
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  app.get(api.stats.dashboard.path, requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    res.json(await storage.getDashboardStats(jobFilter(req)));
  });

  app.get(api.stats.reports.path, requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const office = req.query.office ? (req.query.office as string) : undefined;
    res.json(await storage.getReportStats(startDate, endDate, jobFilter(req), office));
  });

  app.get("/api/reports/churn", requireAuth, requireHiringManagerOrAdmin, async (_req: any, res: any) => {
    try {
      res.json(await storage.getChurnReport());
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Assistants list (for task assignment) ──────────────────────────────────

  app.get("/api/assistants", requireAuth, async (_req, res) => {
    res.json(await storage.getAssistants());
  });

  // ── All assignable users (for task assignment) ──────────────────────────────

  app.get("/api/assignable-users", requireAuth, requireHiringManagerOrAdmin, async (_req, res) => {
    res.json(await storage.getAllUsers());
  });

  app.get("/api/hiring-managers", requireAuth, async (_req, res) => {
    res.json(await storage.getHiringManagers());
  });

  // ── Tasks ───────────────────────────────────────────────────────────────────

  app.get("/api/tasks", requireAuth, async (req, res) => {
    const role = req.user!.role;
    const userId = req.user!.id;
    if (role === "admin") {
      res.json(await storage.getTasks({}));
    } else if (role === "hiring_manager") {
      res.json(await storage.getTasks({ createdByUserId: userId }));
    } else {
      res.json(await storage.getTasks({ assignedToUserId: userId }));
    }
  });

  app.post("/api/tasks", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const { title, description, dueDate, assignedToUserId, jobId } = req.body;
      if (!title || !assignedToUserId) {
        return res.status(400).json({ message: "title and assignedToUserId are required" });
      }
      const assigneeId = Number(assignedToUserId);
      const assignee = await storage.getUserById(assigneeId);
      if (!assignee) {
        return res.status(400).json({ message: "Geçersiz kullanıcı" });
      }
      const task = await storage.createTask({
        title,
        description: description || null,
        dueDate: dueDate ? new Date(dueDate as string) : null,
        status: "pending",
        assignedToUserId: assigneeId,
        createdByUserId: req.user!.id,
        jobId: jobId ? Number(jobId) : null,
      });
      // Email notification to assignee
      if (assignee.email) {
        const creator = await storage.getUserById(req.user!.id);
        const dueDateStr = dueDate ? new Date(dueDate as string).toLocaleDateString("tr-TR") : null;
        await sendEmail(
          assignee.email,
          `Yeni Görev: ${title}`,
          `<p>Merhaba ${assignee.name},</p>
           <p><strong>${creator?.name ?? "Bir yönetici"}</strong> size yeni bir görev atadı:</p>
           <p><strong>${title}</strong>${description ? `<br/>${description}` : ""}</p>
           ${dueDateStr ? `<p>Son tarih: <strong>${dueDateStr}</strong></p>` : ""}
           <p style="color:#6b7280;font-size:12px;">KW Platin &amp; Karma</p>`
        );
      }
      res.status(201).json(task);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      const role = req.user!.role;
      const userId = req.user!.id;

      if (role === "assistant") {
        if (task.assignedToUserId !== userId) return res.status(403).json({ message: "Forbidden" });
        const { status } = req.body;
        if (!status) return res.status(400).json({ message: "status is required" });
        if (!TASK_STATUSES.includes(status as typeof TASK_STATUSES[number])) {
          return res.status(400).json({ message: `status must be one of: ${TASK_STATUSES.join(", ")}` });
        }
        const updated = await storage.updateTask(id, { status: status as string });
        return res.json(updated);
      }

      if (role === "hiring_manager" && task.createdByUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { title, description, dueDate, assignedToUserId, status, jobId } = req.body;
      const update: Partial<InsertTask> = {};
      if (title !== undefined) update.title = title as string;
      if (description !== undefined) update.description = (description as string | null) ?? null;
      if (dueDate !== undefined) update.dueDate = dueDate ? new Date(dueDate as string) : null;
      if (assignedToUserId !== undefined) {
        const newAssigneeId = Number(assignedToUserId);
        const newAssignee = await storage.getUserById(newAssigneeId);
        if (!newAssignee) {
          return res.status(400).json({ message: "Geçersiz kullanıcı" });
        }
        update.assignedToUserId = newAssigneeId;
      }
      if (status !== undefined) {
        if (!TASK_STATUSES.includes(status as typeof TASK_STATUSES[number])) {
          return res.status(400).json({ message: `status must be one of: ${TASK_STATUSES.join(", ")}` });
        }
        update.status = status as string;
      }
      if (jobId !== undefined) update.jobId = jobId ? Number(jobId) : null;

      const updated = await storage.updateTask(id, update);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:id", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const task = await storage.getTask(id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    const role = req.user!.role;
    if (role === "hiring_manager" && task.createdByUserId !== req.user!.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteTask(id);
    res.status(204).send();
  });

  // ── Employees ─────────────────────────────────────────────────────────────────

  app.get("/api/employees", requireAuth, async (req, res) => {
    try {
      const list = await storage.getEmployees();
      res.json(list);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/employees", requireAuth, async (req, res) => {
    try {
      const { candidateId, jobId, applicationId, startDate, title, notes } = req.body;
      if (!candidateId || !jobId || !applicationId) {
        return res.status(400).json({ message: "candidateId, jobId and applicationId are required" });
      }
      const existing = await storage.getEmployeeByCandidateId(candidateId);
      const currentApp = await storage.getApplication(applicationId);
      // Employee may already exist (auto-created when candidate reached documents stage)
      const emp = existing ?? await storage.createEmployee({
        candidateId, jobId, applicationId,
        startDate: startDate ? new Date(startDate) : new Date(),
        status: "active",
        title: title ?? null,
        notes: notes ?? null,
      });
      // Archive the application so it disappears from the pipeline and candidate list
      await storage.updateApplicationStatus(applicationId, "employed");
      // Record the completion in stage history so it appears in hiring manager reports
      await storage.addStageHistory({
        applicationId,
        candidateId,
        jobId,
        fromStatus: currentApp?.status ?? "documents",
        toStatus: "employed",
      });
      res.status(201).json(emp);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/employees/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status, passiveAt, title, notes, startDate, kwuid, kwMail, contractType, uretkenlikKoclugu, uretkenlikKocluguManagerId, uretkenlikKocluguOran, dua, duaManagerId, ukStartDate, ukEndDate, capMonth, capValue, billingName, billingAddress, billingDistrict, billingCity, billingCountry, taxOffice, taxId, birthDate } = req.body;
      const update: any = {};
      if (status !== undefined) update.status = status;
      if (passiveAt !== undefined) update.passiveAt = passiveAt ? new Date(passiveAt) : null;
      if (title !== undefined) update.title = title;
      if (notes !== undefined) update.notes = notes;
      if (startDate !== undefined) update.startDate = new Date(startDate);
      if (kwuid !== undefined) update.kwuid = kwuid;
      if (kwMail !== undefined) update.kwMail = kwMail;
      if (contractType !== undefined) update.contractType = contractType;
      if (uretkenlikKoclugu !== undefined) update.uretkenlikKoclugu = uretkenlikKoclugu;
      if (uretkenlikKocluguManagerId !== undefined) update.uretkenlikKocluguManagerId = uretkenlikKocluguManagerId || null;
      if (uretkenlikKocluguOran !== undefined) update.uretkenlikKocluguOran = uretkenlikKocluguOran || null;
      if (dua !== undefined) update.dua = dua;
      if (duaManagerId !== undefined) update.duaManagerId = duaManagerId || null;
      if (ukStartDate !== undefined) update.ukStartDate = ukStartDate || null;
      if (ukEndDate !== undefined) update.ukEndDate = ukEndDate || null;
      if (capMonth !== undefined) update.capMonth = capMonth || null;

      if (capValue !== undefined) update.capValue = capValue || null;
      if (billingName !== undefined) update.billingName = billingName || null;
      if (billingAddress !== undefined) update.billingAddress = billingAddress || null;
      if (billingDistrict !== undefined) update.billingDistrict = billingDistrict || null;
      if (billingCity !== undefined) update.billingCity = billingCity || null;
      if (billingCountry !== undefined) update.billingCountry = billingCountry || null;
      if (taxOffice !== undefined) update.taxOffice = taxOffice || null;
      if (taxId !== undefined) update.taxId = taxId || null;
      if (birthDate !== undefined) update.birthDate = birthDate || null;
      const emp = await storage.updateEmployee(id, update);
      if (!emp) return res.status(404).json({ message: "Employee not found" });
      res.json(emp);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Stage history date override ──────────────────────────────────────────────
  app.patch("/api/stage-history/:id", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { enteredAt } = req.body;
      if (!enteredAt) return res.status(400).json({ message: "enteredAt required" });
      const updated = await storage.updateStageHistoryDate(id, new Date(enteredAt));
      if (!updated) return res.status(404).json({ message: "Stage history entry not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/employees/:id", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteEmployee(id);
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/employees/:id/closings", requireAuth, async (req: any, res: any) => {
    try {
      const id = Number(req.params.id);
      const { role, id: userId } = req.user!;
      if (role === "hiring_manager") {
        const emp = await storage.getEmployee(id);
        const isAssigned = emp &&
          (emp.uretkenlikKocluguManagerId === userId || emp.duaManagerId === userId);
        if (!isAssigned) return res.status(403).json({ message: "Forbidden" });
      }
      const rows = await storage.getClosingsByEmployee(id);
      res.json(rows);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export employees as CSV
  app.get("/api/employees/export", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const list = await storage.getEmployees();
      const headers = [
        "Ad Soyad", "E-posta", "Telefon", "Şehir", "Kategori",
        "KWUID", "KW E-posta", "Ünvan", "Başlangıç Tarihi", "Durum",
        "Doğum Tarihi", "Sözleşme Tipi", "Üretkenlik Koçluğu", "Koçluk Oranı",
        "Cap Ayı", "Cap Miktarı",
        "Fatura Adı", "Fatura Adresi", "Fatura İlçesi", "Fatura İli", "Fatura Ülkesi",
        "Vergi Dairesi", "Vergi No / TCKN", "Notlar",
      ];
      const rows = list.map((e: any) => [
        e.candidate?.name ?? "",
        e.candidate?.email ?? "",
        e.candidate?.phone ?? "",
        e.candidate?.city ?? "",
        e.candidate?.category ?? "",
        e.kwuid ?? "",
        e.kwMail ?? "",
        e.title ?? "",
        e.startDate ? new Date(e.startDate).toISOString().split("T")[0] : "",
        e.status ?? "active",
        e.birthDate ?? "",
        e.contractType ?? "",
        e.uretkenlikKoclugu ? "Evet" : "Hayır",
        e.uretkenlikKocluguOran ?? "",
        e.capMonth ?? "",
        e.capValue ?? "",
        e.billingName ?? "",
        e.billingAddress ?? "",
        e.billingDistrict ?? "",
        e.billingCity ?? "",
        e.billingCountry ?? "",
        e.taxOffice ?? "",
        e.taxId ?? "",
        e.notes ?? "",
      ]);
      const csv = [headers, ...rows]
        .map((r) => r.map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="calisanlar_${new Date().toISOString().split("T")[0]}.csv"`);
      res.send("\uFEFF" + csv); // BOM for Excel UTF-8
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Import employees from CSV
  app.post("/api/employees/import", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const { rows } = req.body as { rows: Record<string, string>[] };
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }
      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      // Parse Turkish DD.MM.YYYY date strings
      const parseTRDate = (s: string | null): Date | null => {
        if (!s) return null;
        const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      };
      // Map Turkish status words to internal values
      const mapStatus = (s: string | null) => {
        if (!s) return "active";
        const l = s.toLowerCase().trim();
        if (l === "aktif" || l === "active") return "active";
        if (l === "pasif" || l === "inactive") return "inactive";
        if (l === "ayrıldı" || l === "left") return "left";
        return s;
      };

      // Build name → userId map for ÜK coach lookup
      const allUsers = await storage.getUsers();
      const userByName = new Map(allUsers.map(u => [u.name.trim().toLowerCase(), u.id]));

      // Treat spreadsheet error values as empty
      const EMPTY_VALS = new Set(["#n/a", "#na", "n/a", "#ref!", "#value!", "#div/0!", "#name?", "#null!", "-"]);
      const cleanCell = (v: string) => { const t = v.trim(); return EMPTY_VALS.has(t.toLowerCase()) ? "" : t; };

      for (const row of rows) {
        const name = cleanCell(row["Ad Soyad"] ?? row["İSİM SOYİSİM"] ?? row.name ?? "");
        const email = cleanCell((row["E-posta"] ?? row["E-mail Adresi"] ?? row.email ?? "").toLowerCase());
        if (!name) {
          errors.push(`Eksik ad: ${JSON.stringify(row)}`);
          continue;
        }

        try {
          // Helper to pick first non-empty, non-error string from row columns
          const col = (...keys: string[]) => {
            for (const k of keys) { const v = cleanCell(row[k] ?? ""); if (v) return v; }
            return null;
          };
          const boolCol = (...keys: string[]) => {
            const v = col(...keys);
            if (!v) return undefined;
            return v === "Evet" || v === "true" || v === "1" || v.toLowerCase() === "yes" || v === "ÜK" || v.toLowerCase() === "ük" || v === "ÖHB" || v.toLowerCase() === "öhb";
          };

          const kwuid   = col("KWUID", "KW UID", "kwuid");

          // Lookup order: KWUID → email only. Phone and name are never used as identifiers.
          let cand: any = null;
          let existingEmployee: any = null;
          const importedPhone = col("Telefon", "Telefon No", "TelefonNo", "phone")?.replace(/\s+/g, "");

          if (kwuid) {
            existingEmployee = await storage.getEmployeeByKwuid(kwuid);
            if (existingEmployee) cand = existingEmployee.candidate;
          }
          if (!cand && email) cand = await storage.getCandidateByEmail(email);
          const referredBy = col("SPONSORU", "referredBy");
          const office = col("Ofis", "OFİS", "office");
          if (!cand) {
            cand = await storage.createCandidate({
              name,
              email: email || undefined,
              phone: importedPhone ?? undefined,
              city: col("Şehir", "city", "Fatura İli", "İl") ?? undefined,
              category: (col("Kategori", "category") ?? "K0") as any,
              referredBy: referredBy ?? undefined,
              office: office ?? undefined,
            });
          } else {
            const candUpdate: any = {};
            if (name && name !== cand.name) candUpdate.name = name;
            if (referredBy) candUpdate.referredBy = referredBy;
            if (office) candUpdate.office = office;
            if (importedPhone) candUpdate.phone = importedPhone;
            const importedEmail = col("E-posta", "E-mail Adresi", "email");
            if (importedEmail) candUpdate.email = importedEmail;
            const importedCity = col("Şehir", "city", "Fatura İli", "İl");
            if (importedCity) candUpdate.city = importedCity;
            const importedCategory = col("Kategori", "category");
            if (importedCategory) candUpdate.category = importedCategory;
            if (Object.keys(candUpdate).length) await storage.updateCandidate(cand.id, candUpdate);
          }

          const kwMail  = col("KW E-posta", "kwmail", "kwMail");
          const title   = col("Ünvan", "title");
          const status  = col("Durum", "AKTİF PASİF", "AKTİF\nPASİF", "AKTİF/PASİF", "status");
          const birthDate     = col("Doğum Tarihi", "DOĞUM TARİHİ", "birthDate");
          const contractType  = col("SÖZLEŞME TİPİ", "Sözleşme Tipi", "Sözleşme", "contractType");
          const ukRaw         = col("ÜK", "Üretkenlik Koçluğu", "uretkenlikKoclugu");
          const koçlukOran    = col("ÜK Oranı", "Koçluk Oranı", "uretkenlikKocluguOran");
          const koçAdı        = col("ÜK Koçu", "uretkenlikKocluguManagerName");
          const koçId         = koçAdı ? (userByName.get(koçAdı.trim().toLowerCase()) ?? null) : null;
          // ÜK/ÜHB değerleri → uretkenlikKoclugu true; yoksa normal boolCol
          const ukFilled      = !!ukRaw && ["ük", "ühb"].includes(ukRaw.trim().toLowerCase());
          const uretkenlik    = ukFilled ? true : boolCol("ÜK", "Üretkenlik Koçluğu", "uretkenlikKoclugu");
          // ÜK kolonu boş + koç varsa → DUA programı
          const isDua         = !uretkenlik && !!koçId;
          const capMonth      = col("KEP AYI", "Cap Ayı", "capMonth");
          const capValueRaw   = col("KEP TUTARI", "Cap Miktarı", "capValue");
          // Normalize Turkish number format: "540.000" → "540000", "540.000,50" → "540000.50"
          const capValue      = capValueRaw
            ? capValueRaw.includes(",")
              ? capValueRaw.replace(/\./g, "").replace(",", ".")
              : capValueRaw.replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
            : null;
          const billingName   = col("Fatura Adı", "Şirket / Şahıs İsmi", "billingName");
          const billingAddr   = col("Fatura Adresi", "billingAddress");
          const billingDist   = col("Fatura İlçesi", "İlçe", "billingDistrict");
          const billingCity   = col("Fatura İli", "İl", "billingCity");
          const billingCountry= col("Fatura Ülkesi", "Ülke", "billingCountry");
          const taxOffice     = col("Vergi Dairesi", "taxOffice");
          const taxId         = col("Vergi No / TCKN", "Vergi / TCK No", "taxId");
          const notes         = col("Notlar", "notes");
          const passiveAtStr  = col("ÇIKIŞ TARİHİ", "passiveAt");
          const parsedBirth   = parseTRDate(birthDate);
          const parsedPassiveAt = parseTRDate(passiveAtStr);
          const mappedStatus  = mapStatus(status);

          const patch: any = {};
          if (kwuid) patch.kwuid = kwuid;
          if (kwMail) patch.kwMail = kwMail;
          if (title) patch.title = title;
          if (mappedStatus) patch.status = mappedStatus;
          if (parsedBirth) patch.birthDate = parsedBirth.toISOString().split("T")[0];
          if (contractType) patch.contractType = contractType;
          patch.uretkenlikKoclugu = !!uretkenlik && !isDua;
          patch.dua = isDua;
          if (isDua) {
            patch.duaManagerId = koçId;
            patch.uretkenlikKocluguManagerId = null;
          } else {
            patch.duaManagerId = null;
            patch.uretkenlikKocluguManagerId = koçId ?? null;
            if (koçlukOran) patch.uretkenlikKocluguOran = koçlukOran;
          }
          if (capMonth) patch.capMonth = capMonth;
          if (capValue) patch.capValue = capValue;
          if (billingName) patch.billingName = billingName;
          if (billingAddr) patch.billingAddress = billingAddr;
          if (billingDist) patch.billingDistrict = billingDist;
          if (billingCity) patch.billingCity = billingCity;
          if (billingCountry) patch.billingCountry = billingCountry;
          if (taxOffice) patch.taxOffice = taxOffice;
          if (taxId) patch.taxId = taxId;
          if (notes) patch.notes = notes;
          if (parsedPassiveAt) patch.passiveAt = parsedPassiveAt;

          // Parse startDate — used both for update patch and new employee creation
          const startDateStr = col("Başlangıç Tarihi", "GİRİŞ TARİHİ", "startDate") ?? "";
          const parsedStart = parseTRDate(startDateStr);
          if (parsedStart) patch.startDate = parsedStart;

          // Check if already an employee (re-use existingEmployee found by KWUID above)
          if (!existingEmployee) existingEmployee = await storage.getEmployeeByCandidateId(cand.id);
          if (existingEmployee) {
            if (Object.keys(patch).length) await storage.updateEmployee(existingEmployee.id, patch);
            updated++;
          } else {
            await storage.createEmployee({
              candidateId: cand.id,
              jobId: null as any,
              applicationId: null as any,
              startDate: parsedStart ?? null,
              status: (mappedStatus ?? "active") as any,
              title: patch.title ?? null,
              notes: patch.notes ?? null,
              kwuid: patch.kwuid ?? null,
              kwMail: patch.kwMail ?? null,
              contractType: patch.contractType ?? null,
              uretkenlikKoclugu: patch.uretkenlikKoclugu ?? false,
              uretkenlikKocluguManagerId: patch.uretkenlikKocluguManagerId ?? null,
              uretkenlikKocluguOran: patch.uretkenlikKocluguOran ?? null,
              capMonth: patch.capMonth ?? null,
              capValue: patch.capValue ?? null,
              billingName: patch.billingName ?? null,
              billingAddress: patch.billingAddress ?? null,
              billingDistrict: patch.billingDistrict ?? null,
              billingCity: patch.billingCity ?? null,
              billingCountry: patch.billingCountry ?? null,
              taxOffice: patch.taxOffice ?? null,
              taxId: patch.taxId ?? null,
              birthDate: patch.birthDate ?? null,
              passiveAt: patch.passiveAt ?? null,
            });
            created++;
          }
        } catch (e: any) {
          errors.push(`${name}: ${e?.message ?? "Bilinmeyen hata"}`);
        }
      }

      res.json({ created, updated, errors });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Interview Targets ─────────────────────────────────────────────────────────

  app.get("/api/interview-targets", requireAuth, async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const jobIds = jobFilter(req);
      res.json(await storage.getInterviewTargets(year, month, jobIds));
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/interview-targets", requireAuth, async (req, res) => {
    try {
      const { jobId, year, month, category, target } = req.body;
      if (!jobId || !year || !month || !category) return res.status(400).json({ message: "Missing fields" });
      await storage.upsertInterviewTarget({ jobId: Number(jobId), year: Number(year), month: Number(month), category, target: Number(target) || 0 });
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Closings ──────────────────────────────────────────────────────────────────

  app.get("/api/closings/export", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const allClosings = await storage.getClosings();
      const headers = [
        "Danışman", "KWUID", "İlgili Ay", "İşlem", "İşlem Tipi", "Taraf", "CAP", "ÜK",
        "İşlem Tarihi", "İşlem Değeri", "BHB", "KWTR", "KWTR (+KDV)", "PlatinKarma", "PlatinKarma (KDV)",
        "ÜK Tutarı", "Danışman Net", "Kasa", "Nakit", "Banka",
        "BHB Oranı", "İşlem Hacmi", "İşlem Oranı (Taraf Sayısı)",
        "İl", "İlçe", "Semt/Mahalle", "Adres", "Mülkle İlgili Detay Bilgiler",
        "Açılış Rakamı", "Kapanış Rakamı", "İndirim Oranı",
        "Süre/Gün", "Müşteri nereden buldu?", "Yönlendirme Bilgisi",
        "Sözleşme Başlangıç Tarihi", "Sözleşme Bitiş Tarihi",
        "Alıcı Adı", "Satıcı Adı", "Pay (%)", "Notlar",
      ];
      const fmtDate = (v: any) => v ? new Date(v).toISOString().split("T")[0] : "";
      const fmtMonth = (v: any) => {
        if (!v) return "";
        const d = new Date(v);
        return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      };
      const rows: string[][] = [];
      for (const c of allClosings) {
        const cv = c as any;
        const saleVal = parseFloat(c.saleValue ?? "0");
        const openingVal = parseFloat(cv.openingPrice ?? "0");
        const discountRate = openingVal > 0 ? ((openingVal - saleVal) / openingVal * 100).toFixed(2) : "";
        const sidesCount = c.sides.length;
        for (const side of c.sides) {
          for (const agent of side.agents) {
            const capAmt = parseFloat(agent.capAmountApplied ?? "0");
            rows.push([
              agent.candidateName ?? agent.employeeName ?? "",
              (agent as any).kwuid ?? "",
              fmtMonth(c.closingDate),
              cv.dealCategory ?? "Satış",
              cv.dealType ?? "Konut",
              (side as any).sideType === "buyer" ? "Alıcı" : (side as any).sideType === "referral" ? "Yönlendirme" : "Satıcı",
              capAmt > 0 ? String(capAmt) : "",
              "",
              fmtDate(c.closingDate),
              c.saleValue,
              agent.bhbShare ?? "0",
              agent.mainBranchShare ?? "0",
              (agent as any).kwtrKdv ?? "0",
              agent.marketCenterActual ?? "0",
              (agent as any).bmKdv ?? "0",
              agent.ukShare ?? "0",
              agent.employeeNet ?? "0",
              (agent as any).kasa ?? "0",
              (agent as any).nakit ?? "0",
              (agent as any).banka ?? "0",
              c.commissionRate ?? "2",
              c.saleValue,
              String(sidesCount),
              cv.il ?? "",
              cv.ilce ?? "",
              cv.mahalle ?? "",
              c.propertyAddress,
              cv.propertyDetails ?? "",
              cv.openingPrice ?? "",
              c.saleValue,
              discountRate,
              cv.durationDays ?? "",
              cv.customerSource ?? "",
              cv.referralInfo ?? "",
              fmtDate(cv.contractStartDate),
              fmtDate(cv.contractEndDate),
              c.buyerName ?? "",
              c.sellerName ?? "",
              agent.splitPercentage,
              c.notes ?? "",
            ]);
          }
        }
      }
      const csv = [headers, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="kapanislar_${new Date().toISOString().split("T")[0]}.csv"`);
      res.send("\uFEFF" + csv);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/closings/import", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { rows } = req.body as { rows: Record<string, string>[] };
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }

      // Normalize Turkish number format: "30.000,00" → "30000.00", "4,17%" → "4.17"
      const normNum = (v: string | undefined | null): string | null => {
        if (v == null) return null;
        let s = v.trim().replace(/\s/g, "").replace(/%/g, "").replace(/[₺$€£]/gi, "").replace(/[a-zA-Z]+$/g, "");
        if (!s || s === "-") return null;
        if (s.includes(",")) {
          // Turkish format: dots are thousands separators, comma is decimal
          s = s.replace(/\./g, "").replace(",", ".");
        } else {
          // Remove thousands-separating dots (followed by groups of 3 digits)
          s = s.replace(/\.(?=(\d{3})+(?:\.|$))/g, "");
        }
        const n = parseFloat(s);
        return isNaN(n) ? null : String(n);
      };

      // Look up all employees once for KWUID / name matching
      const allEmployees = await storage.getEmployees() as any[];
      const byKwuid: Record<string, number> = {};
      const byName: Record<string, number> = {};
      for (const emp of allEmployees) {
        if (emp.kwuid) byKwuid[emp.kwuid.trim()] = emp.id;
        const name = emp.candidate?.name?.trim().toLowerCase();
        if (name) byName[name] = emp.id;
      }

      const resolveEmployee = (kwuid: string, name: string): number | null => {
        if (kwuid && byKwuid[kwuid.trim()]) return byKwuid[kwuid.trim()];
        if (name && byName[name.trim().toLowerCase()]) return byName[name.trim().toLowerCase()];
        return null;
      };

      // Group rows into closings by date + transaction value + deal type + address.
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const tarih = row["İşlem Tarihi"] ?? row["Tarih"] ?? "";
        const bedel = normNum(row["İşlem Değeri"] ?? row["Kapanış Rakamı"] ?? row["Satış Bedeli"] ?? "") ?? "";
        const islem = row["İşlem"] ?? "";
        const tip   = row["İşlem Tipi"] ?? "";
        const adres  = (row["Adres"] ?? row["Mülk Adresi"] ?? "").trim().toLowerCase();
        const detay  = (row["Mülk Detayları"] ?? row["Mülkle İlgili Detay Bilgiler"] ?? row["propertyDetails"] ?? "").trim().toLowerCase();
        const key = `${tarih}||${bedel}||${islem}||${tip}||${adres}||${detay}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      let created = 0;
      const errors: string[] = [];

      const safeDate = (v: string | undefined): Date | null => {
        if (!v) return null;
        const d = new Date(v.replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1"));
        return isNaN(d.getTime()) ? null : d;
      };

      // Process in parallel batches of 10
      const groupEntries = Array.from(groups.values());
      const BATCH = 10;
      for (let i = 0; i < groupEntries.length; i += BATCH) {
        await Promise.allSettled(groupEntries.slice(i, i + BATCH).map(async (groupRows) => {
        try {
          const first = groupRows[0];
          const dateStr = first["İşlem Tarihi"] ?? first["Tarih"] ?? "";
          const closingDate = safeDate(dateStr);
          const status = closingDate ? "completed" : "expected";

          const contractStartDate = safeDate(first["Sözleşme Başlangıç Tarihi"] ?? "");
          const contractEndDate = safeDate(first["Sözleşme Bitiş Tarihi"] ?? "");

          const sidesMap = new Map<string, typeof rows>();
          for (const row of groupRows) {
            const taraf = row["Taraf"] ?? "";
            const sideKey = taraf === "Alıcı" ? "buyer" : taraf === "Yönlendirme" ? "referral" : "seller";
            if (!sidesMap.has(sideKey)) sidesMap.set(sideKey, []);
            sidesMap.get(sideKey)!.push(row);
          }

          const sides = [];
          for (const [sideType, sideRows] of sidesMap) {
            const agents = [];
            for (const row of sideRows) {
              const kwuid = row["KWUID"] ?? "";
              const name = row["Danışman"] ?? row["Danışman Adı"] ?? "";
              const empId = resolveEmployee(kwuid, name);
              if (!empId) { errors.push(`Danışman bulunamadı: ${name || kwuid || "?"}`); continue; }
              // Default all numeric fields to "0" so the server never auto-calculates them.
              agents.push({
                employeeId: empId,
                splitPercentage: normNum(row["Pay (%)"]) || "100",
                bhbShare: normNum(row["BHB"]) ?? "0",
                mainBranchShare: normNum(row["KWTR"]) ?? "0",
                kwtrKdv: normNum(row["KWTR (+KDV)"]) ?? "0",
                marketCenterActual: normNum(row["PlatinKarma"] ?? row["BM (PlatinKarma)"] ?? row["BM"]) ?? "0",
                bmKdv: normNum(row["PlatinKarma (KDV)"] ?? row["PlatinKarma (KDV)_1"]) ?? "0",
                ukShare: normNum(row["ÜK_1"] ?? row["ÜK Tutarı"]) ?? "0",
                employeeNet: normNum(row["Danışman_1"] ?? row["Danışman Net"]) ?? "0",
                kasa: normNum(row["Kasa"]) ?? "0",
                nakit: normNum(row["Nakit"]) ?? "0",
                banka: normNum(row["Banka"]) ?? "0",
                // Default: completed (date-set) closings are considered paid; expected ones aren't.
                paymentCollected: !!closingDate,
              });
            }
            if (agents.length > 0) sides.push({ sideType, agents });
          }

          if (sides.length === 0) { errors.push(`Taraf bulunamadı: ${first["Adres"] ?? first["Mülk Adresi"] ?? ""}`); return; }

          const adres = first["Adres"] ?? first["Mülk Adresi"] ?? "";
          const islemCol = first["İşlem"] ?? "";
          const dealCategory = islemCol === "Kiralama" ? "Kiralık" : islemCol === "Kiralık" ? "Kiralık" : islemCol === "Yönlendirme" ? "Yönlendirme" : "Satış";

          await storage.createClosing({
            disableCap: true,
            propertyAddress: adres,
            il: first["İl"] || null,
            ilce: first["İlçe"] || null,
            mahalle: first["Semt/Mahalle"] || null,
            propertyDetails: first["Mülkle İlgili Detay Bilgiler"] || null,
            dealCategory: dealCategory as any,
            dealType: (first["İşlem Tipi"] ?? "Konut") as any,
            saleValue: normNum(first["İşlem Değeri"] ?? first["Kapanış Rakamı"] ?? first["Satış Bedeli"]) ?? "0",
            commissionRate: normNum(first["BHB Oranı"] ?? first["Komisyon Oranı (%)"]) || "2",
            openingPrice: normNum(first["Açılış Rakamı"] || null),
            durationDays: (() => {
              const v = first["Süre/Gün"] ? parseInt(first["Süre/Gün"]) : null;
              // Reject absurd values (e.g. CSV with date misparsed as int) — anything beyond ~10 years is bogus
              return v && v > 0 && v <= 3650 ? v : null;
            })(),
            customerSource: first["Müşteri nereden buldu?"] || null,
            referralInfo: first["Yönlendirme Bilgisi"] || null,
            contractStartDate,
            contractEndDate,
            buyerName: first["Alıcı Adı"] || null,
            sellerName: first["Satıcı Adı"] || null,
            notes: first["Notlar"] || null,
            closingDate: closingDate ?? null,
            status,
            sides,
          });
          created++;
        } catch (e: any) {
          errors.push(e?.message ?? "Bilinmeyen hata");
        }
        })); // end map + Promise.allSettled
      } // end batch for

      res.json({ created, errors });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/closings", requireAuth, requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getClosings());
    } catch (err) {
      console.error("[GET /api/closings] error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/closings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const {
        propertyAddress, il, ilce, mahalle, propertyDetails,
        dealCategory, dealType, saleValue, commissionRate, openingPrice,
        durationDays, customerSource, referralInfo, contractStartDate, contractEndDate,
        closingDate, buyerName, sellerName, notes, sides,
      } = req.body;
      if (!saleValue || !sides) {
        return res.status(400).json({ message: "saleValue and sides are required" });
      }
      // Convert per-agent closingDate from ISO string to Date
      const normalizedSides = (sides as any[]).map((s: any) => ({
        ...s,
        agents: (s.agents ?? []).map((a: any) => ({
          ...a,
          closingDate: a.closingDate ? new Date(a.closingDate) : null,
          status: a.status ?? null,
          // Default: agents approved as "completed" are paid; expected ones aren't.
          // Admin can override via the explicit toggle in the form.
          paymentCollected: typeof a.paymentCollected === "boolean"
            ? a.paymentCollected
            : (a.status === "completed"),
        })),
      }));
      const closing = await storage.createClosing({
        propertyAddress: propertyAddress ?? "",
        il: il ?? null,
        ilce: ilce ?? null,
        mahalle: mahalle ?? null,
        propertyDetails: propertyDetails ?? null,
        dealCategory: dealCategory ?? "Satış",
        dealType: dealType ?? "Çift Taraflı",
        saleValue: String(saleValue),
        commissionRate: commissionRate ? String(commissionRate) : "2.00",
        openingPrice: openingPrice ? String(openingPrice) : null,
        durationDays: durationDays ? Number(durationDays) : null,
        customerSource: customerSource ?? null,
        referralInfo: referralInfo ?? null,
        contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
        contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
        closingDate: closingDate ? new Date(closingDate) : null,
        buyerName: buyerName ?? null,
        sellerName: sellerName ?? null,
        notes: notes ?? null,
        createdByUserId: req.user!.id,
        sides: normalizedSides,
      });
      res.status(201).json(closing);

      // Fire WhatsApp per agent whose effective status is "completed".
      // (Agent-level status overrides closing-level when explicitly set.)
      (async () => {
        try {
          const details = await storage.getClosing(closing.id) as any;
          if (!details) return;
          for (const side of details.sides ?? []) {
            for (const agent of side.agents ?? []) {
              const effStatus = (agent.status ?? details.status) === "completed";
              if (effStatus) await sendClosingNotifications(closing.id, agent.id);
            }
          }
        } catch (err) {
          console.warn("[WhatsApp notify (per-agent on create)]", err);
        }
      })();
    } catch (err) {
      console.error("[POST /api/closings]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Manually (re)send the WhatsApp breakdown to a closing's agents
  app.post("/api/closings/:id/notify", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await sendClosingNotifications(Number(req.params.id));
      res.json(result);
    } catch (err) {
      console.error("[POST /api/closings/:id/notify]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Send WhatsApp breakdown to a single agent within a closing
  app.post("/api/closing-agents/:id/notify", requireAuth, requireAdmin, async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      const closingId = await storage.getClosingIdForAgent(agentId);
      if (!closingId) return res.status(404).json({ message: "Agent not found" });
      const result = await sendClosingNotifications(closingId, agentId);
      res.json(result);
    } catch (err) {
      console.error("[POST /api/closing-agents/:id/notify]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/closings/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteClosing(Number(req.params.id));
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/closings/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { sides, ...rest } = req.body;
      const data = { ...rest };
      if (data.closingDate) data.closingDate = new Date(data.closingDate);
      if (data.contractStartDate) data.contractStartDate = new Date(data.contractStartDate);
      if (data.contractEndDate) data.contractEndDate = new Date(data.contractEndDate);
      await storage.updateClosing(Number(req.params.id), data);
      if (sides && Array.isArray(sides)) {
        const normalizedSides = sides.map((s: any) => ({
          ...s,
          agents: (s.agents ?? []).map((a: any) => ({
            ...a,
            closingDate: a.closingDate ? new Date(a.closingDate) : null,
            status: a.status ?? null,
          })),
        }));
        await storage.replaceClosingSides(Number(req.params.id), String(rest.saleValue ?? "0"), String(rest.commissionRate ?? "2"), normalizedSides);
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/closing-agents/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      const body = { ...req.body };
      if (body.closingDate !== undefined && body.closingDate !== null && typeof body.closingDate === "string") {
        body.closingDate = new Date(body.closingDate);
      }
      if (body.paymentCollected !== undefined && typeof body.paymentCollected === "string") {
        body.paymentCollected = body.paymentCollected === "true";
      }
      // Capture status transition to "completed" so we can fire WhatsApp
      const becameCompleted = body.status === "completed";
      await storage.updateClosingAgent(agentId, body);
      res.status(204).send();

      // Fire-and-forget WhatsApp notification for the freshly approved agent
      if (becameCompleted) {
        (async () => {
          try {
            const closingId = await storage.getClosingIdForAgent(agentId);
            if (closingId) await sendClosingNotifications(closingId, agentId);
          } catch (err) {
            console.warn("[WhatsApp notify (agent)]", err);
          }
        })();
      }
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/closing-sides/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.updateClosingSide(Number(req.params.id), req.body);
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Cap Settings ──────────────────────────────────────────────────────────────

  app.get("/api/cap-settings", requireAuth, requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getCapSettings());
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/cap-settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { year, amount } = req.body;
      if (!year || !amount) return res.status(400).json({ message: "year and amount are required" });
      const setting = await storage.upsertCapSetting(Number(year), String(amount));
      res.status(201).json(setting);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/cap-settings/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteCapSetting(Number(req.params.id));
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Cap Statuses ──────────────────────────────────────────────────────────────

  app.get("/api/employees/cap-statuses", requireAuth, requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAllEmployeesCapStatus());
    } catch (err) {
      console.error("[GET /api/employees/cap-statuses] error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/employees/cap-achievement", requireAuth, requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getCapAchievementReport());
    } catch (err) {
      console.error("cap-achievement error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Coaching Stats ────────────────────────────────────────────────────────────

  app.get("/api/coaching/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const now = new Date();
      const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), 0, 1);
      const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), 11, 31);
      // Admin + hiring_manager see all coaches; everyone else only sees their own students
      const seesAll = user.role === "admin" || user.role === "hiring_manager";
      const coachUserId = seesAll ? undefined : user.id;
      const includePassive = req.query.includePassive === "true";
      res.json(await storage.getCoachingStats(start, end, coachUserId, includePassive));
    } catch (err) {
      console.error("[GET /api/coaching/stats]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Office Expenses ────────────────────────────────────────────────────────

  app.get("/api/office-expenses/monthly-pl", requireAuth, requireAdmin, async (req, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      res.json(await storage.getMonthlyPL(year));
    } catch (err) {
      console.error("[GET /api/office-expenses/monthly-pl]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/office-expenses", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { type, year, month } = req.query as { type?: string; year?: string; month?: string };
      const rows = await storage.getOfficeExpenses({
        type,
        year: year ? parseInt(year) : undefined,
        month: month ? parseInt(month) : undefined,
      });
      res.json(rows);
    } catch (err) {
      console.error("[GET /api/office-expenses]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/office-expenses", requireAuth, requireAdmin, async (req, res) => {
    try {
      const row = await storage.createOfficeExpense({ ...req.body, createdByUserId: req.user!.id });
      res.status(201).json(row);
    } catch (err) {
      console.error("[POST /api/office-expenses]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/office-expenses/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const row = await storage.updateOfficeExpense(Number(req.params.id), req.body);
      res.json(row);
    } catch (err) {
      console.error("[PATCH /api/office-expenses/:id]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/office-expenses/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteOfficeExpense(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      console.error("[DELETE /api/office-expenses/:id]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Closing Stats (Financial Reports) ────────────────────────────────────────

  app.get("/api/closings/stats", requireAuth, requireFinancialsAccess, async (req, res) => {
    try {
      const { startDate, endDate, office, dealType, dealCategory } = req.query as { startDate?: string; endDate?: string; office?: string; dealType?: string; dealCategory?: string };
      const now = new Date();
      const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
      const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
      res.json(await storage.getClosingStats(start, end, office, dealType, dealCategory));
    } catch (err) {
      console.error("[GET /api/closings/stats]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Financial Targets ─────────────────────────────────────────────────────────

  app.get("/api/financial-targets", requireAuth, requireFinancialsAccess, async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const office = (req.query.office as string) ?? "";
      res.json(await storage.getFinancialTargets(year, office));
    } catch (err) {
      console.error("[GET /api/financial-targets]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/financial-targets/:year/:month", requireAuth, requireAdmin, async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      if (!year || !month || month < 1 || month > 12) return res.status(400).json({ message: "Geçersiz yıl/ay" });
      const { office = "", bhbTarget, bhbHighTarget, bmTarget, bmHighTarget, satilikAdetTarget, satilikAdetHighTarget, kiralikAdetTarget, kiralikAdetHighTarget } = req.body;
      const n = (v: any) => v != null ? Number(v) : null;
      await storage.upsertFinancialTarget(year, month, office, {
        bhbTarget: n(bhbTarget), bhbHighTarget: n(bhbHighTarget),
        bmTarget: n(bmTarget), bmHighTarget: n(bmHighTarget),
        satilikAdetTarget: n(satilikAdetTarget), satilikAdetHighTarget: n(satilikAdetHighTarget),
        kiralikAdetTarget: n(kiralikAdetTarget), kiralikAdetHighTarget: n(kiralikAdetHighTarget),
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[PUT /api/financial-targets]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
