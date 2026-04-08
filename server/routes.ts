import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { requireAuth, requireAdmin, requireHiringManagerOrAdmin } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertInterviewSchema, insertOfferSchema, type InsertTask, TASK_STATUSES } from "@shared/schema";
import { getAuthUrl, createOAuth2Client, createCalendarEvent, deleteCalendarEvent } from "./google";

// Scoping helper — admin sees everything; HMs and assistants are limited to their assigned jobs
function jobFilter(req: Request): number[] | undefined {
  if (req.user!.role === "admin") return undefined;
  return req.user!.assignedJobIds.length ? req.user!.assignedJobIds : undefined;
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

      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
      return htmlRedirect("/dashboard");
    } catch (err) {
      console.error("Google OAuth error:", err);
      return htmlRedirect("/login?error=google_failed");
    }
  });

  // ── Google Calendar ───────────────────────────────────────────────────────────

  app.post("/api/interviews/:id/calendar", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const interview = await storage.getInterview(id);
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    const user = await storage.getUserById(req.user!.id);
    if (!user?.googleAccessToken) {
      return res.status(400).json({ message: "Google Calendar not connected" });
    }

    const candidate = interview.candidate;
    const title = `Mülakat: ${candidate?.name ?? "Aday"} — ${interview.job?.title ?? ""}`;
    const description = interview.notes ?? "";

    try {
      const eventId = await createCalendarEvent(user, {
        title,
        description,
        startTime: new Date(interview.startTime),
        endTime: new Date(interview.endTime),
        location: interview.location ?? undefined,
        attendeeEmail: candidate?.email,
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
      const { name, email, password, role } = req.body;
      const update: any = {};
      if (name) update.name = name;
      if (email) update.email = email;
      if (role) update.role = role;
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
    res.json(await storage.getJobs(jobFilter(req)));
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
      // Or if candidate has applied to one of HM's assigned jobs
      const filter = jobFilter(req);
      if (filter !== undefined) {
        const apps = await storage.getApplications(undefined, candidate.id, filter);
        if (apps.length === 0) return res.status(403).json({ message: "Forbidden" });
      }
    }
    res.json(candidate);
  });

  app.post(api.candidates.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.candidates.create.input.parse(req.body);
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
      res.json(application);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/applications/:id/score", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
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
    res.json(await storage.getInterviews(undefined, jobFilter(req)));
  });

  app.post(api.interviews.create.path, requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : req.body.startTime,
        endTime: req.body.endTime ? new Date(req.body.endTime) : req.body.endTime,
      };
      const input = insertInterviewSchema.parse(body);
      const filter = jobFilter(req);
      if (filter !== undefined && !filter.includes(input.jobId)) return res.status(403).json({ message: "Forbidden" });
      const interview = await storage.createInterview(input);
      res.status(201).json(interview);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.interviews.update.path, requireAuth, async (req, res) => {
    const { status } = req.body;
    if (req.user!.role === "assistant" && status !== "cancelled") {
      return res.status(403).json({ message: "Assistants can only cancel interviews" });
    }
    const interview = await storage.updateInterviewStatus(Number(req.params.id), status);
    if (!interview) return res.status(404).json({ message: "Not found" });
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
    res.json(await storage.getReportStats(startDate, endDate, jobFilter(req)));
  });

  // ── Assistants list (for task assignment) ──────────────────────────────────

  app.get("/api/assistants", requireAuth, async (_req, res) => {
    res.json(await storage.getAssistants());
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
      if (!assignee || assignee.role !== "assistant") {
        return res.status(400).json({ message: "assignedToUserId must be a user with role 'assistant'" });
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
        if (!newAssignee || newAssignee.role !== "assistant") {
          return res.status(400).json({ message: "assignedToUserId must be a user with role 'assistant'" });
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
      if (existing) {
        return res.status(409).json({ message: "Candidate is already an active employee" });
      }
      const currentApp = await storage.getApplication(applicationId);
      const emp = await storage.createEmployee({
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
      const { status, title, notes, startDate, kwuid, kwMail, contractType, uretkenlikKoclugu, uretkenlikKocluguManagerId, uretkenlikKocluguOran, capMonth, capValue, billingName, billingAddress, billingDistrict, billingCity, billingCountry, taxOffice, taxId, birthDate } = req.body;
      const update: any = {};
      if (status !== undefined) update.status = status;
      if (title !== undefined) update.title = title;
      if (notes !== undefined) update.notes = notes;
      if (startDate !== undefined) update.startDate = new Date(startDate);
      if (kwuid !== undefined) update.kwuid = kwuid;
      if (kwMail !== undefined) update.kwMail = kwMail;
      if (contractType !== undefined) update.contractType = contractType;
      if (uretkenlikKoclugu !== undefined) update.uretkenlikKoclugu = uretkenlikKoclugu;
      if (uretkenlikKocluguManagerId !== undefined) update.uretkenlikKocluguManagerId = uretkenlikKocluguManagerId || null;
      if (uretkenlikKocluguOran !== undefined) update.uretkenlikKocluguOran = uretkenlikKocluguOran || null;
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

  app.delete("/api/employees/:id", requireAuth, requireHiringManagerOrAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteEmployee(id);
      res.status(204).send();
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

      for (const row of rows) {
        const name = (row["Ad Soyad"] ?? row.name ?? "").trim();
        const email = (row["E-posta"] ?? row.email ?? "").trim().toLowerCase();
        if (!name || !email) {
          errors.push(`Eksik ad veya e-posta: ${JSON.stringify(row)}`);
          continue;
        }

        try {
          // Find or create candidate
          let cand = await storage.getCandidateByEmail(email);
          if (!cand) {
            cand = await storage.createCandidate({
              name,
              email,
              phone: row["Telefon"] ?? row.phone ?? null,
              city: row["Şehir"] ?? row.city ?? null,
              category: (row["Kategori"] ?? row.category ?? "K0") as any,
            });
          }

          // Helper to pick first non-empty string from row columns
          const col = (...keys: string[]) => {
            for (const k of keys) { const v = (row[k] ?? "").trim(); if (v) return v; }
            return null;
          };
          const boolCol = (...keys: string[]) => {
            const v = col(...keys);
            if (!v) return undefined;
            return v === "Evet" || v === "true" || v === "1" || v.toLowerCase() === "yes";
          };

          const patch: any = {};
          const kwuid   = col("KWUID", "kwuid");
          const kwMail  = col("KW E-posta", "kwmail", "kwMail");
          const title   = col("Ünvan", "title");
          const status  = col("Durum", "status");
          const birthDate     = col("Doğum Tarihi", "birthDate");
          const contractType  = col("Sözleşme Tipi", "contractType");
          const uretkenlik    = boolCol("Üretkenlik Koçluğu", "uretkenlikKoclugu");
          const koçlukOran    = col("Koçluk Oranı", "uretkenlikKocluguOran");
          const capMonth      = col("Cap Ayı", "capMonth");
          const capValue      = col("Cap Miktarı", "capValue");
          const billingName   = col("Fatura Adı", "billingName");
          const billingAddr   = col("Fatura Adresi", "billingAddress");
          const billingDist   = col("Fatura İlçesi", "billingDistrict");
          const billingCity   = col("Fatura İli", "billingCity");
          const billingCountry= col("Fatura Ülkesi", "billingCountry");
          const taxOffice     = col("Vergi Dairesi", "taxOffice");
          const taxId         = col("Vergi No / TCKN", "taxId");
          const notes         = col("Notlar", "notes");

          if (kwuid) patch.kwuid = kwuid;
          if (kwMail) patch.kwMail = kwMail;
          if (title) patch.title = title;
          if (status) patch.status = status;
          if (birthDate) patch.birthDate = birthDate;
          if (contractType) patch.contractType = contractType;
          if (uretkenlik !== undefined) patch.uretkenlikKoclugu = uretkenlik;
          if (koçlukOran) patch.uretkenlikKocluguOran = koçlukOran;
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

          // Check if already an employee
          const existing = await storage.getEmployeeByCandidateId(cand.id);
          if (existing) {
            if (Object.keys(patch).length) await storage.updateEmployee(existing.id, patch);
            updated++;
          } else {
            const startDateStr = col("Başlangıç Tarihi", "startDate") ?? "";
            await storage.createEmployee({
              candidateId: cand.id,
              jobId: null as any,
              applicationId: null as any,
              startDate: startDateStr ? new Date(startDateStr) : new Date(),
              status: (patch.status ?? "active") as any,
              title: patch.title ?? null,
              notes: patch.notes ?? null,
              kwuid: patch.kwuid ?? null,
              kwMail: patch.kwMail ?? null,
              contractType: patch.contractType ?? null,
              uretkenlikKoclugu: patch.uretkenlikKoclugu ?? false,
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

  return httpServer;
}
