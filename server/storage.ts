import { db } from "./db";
import {
  jobs, candidates, applications, stageHistory, interviews, offers, candidateNotes,
  users, jobAssignments, applicationDocuments, tasks, employees,
  APPLICATION_STAGES,
  type Job, type InsertJob,
  type Candidate, type InsertCandidate,
  type Application, type InsertApplication,
  type StageHistory,
  type Interview, type InsertInterview,
  type Offer, type InsertOffer,
  type CandidateNote, type InsertCandidateNote,
  type User, type PublicUser,
  type ApplicationDocuments,
  type Task, type InsertTask,
  type Employee, type InsertEmployee, type EmployeeWithRelations,
} from "@shared/schema";
import { eq, desc, count, sql, gte, lte, and, or, isNull, inArray, notInArray } from "drizzle-orm";
import { differenceInDays } from "date-fns";

export type ApplicationWithRelations = Application & { candidate?: Candidate; job?: Job };
export type InterviewWithRelations = Interview & { candidate?: Candidate; job?: Job; application?: Application };
export type OfferWithRelations = Offer & { candidate?: Candidate; job?: Job; application?: Application };
export type TaskWithRelations = Task & { assignedTo?: PublicUser; createdBy?: PublicUser; candidate?: Pick<Candidate, 'id' | 'name'> };

export interface FunnelStage { stage: string; count: number; }
export interface StageTime { stage: string; avgDays: number; }
export interface ManagerEfficiency {
  userId: number; name: string; role: string;
  avgTimeToContractSign: number; avgTimeToEmploy: number; interviews: number; totalHires: number; employedCount: number;
}
export interface JobPerformance {
  jobId: number; title: string; department: string; daysOpen: number;
  applicants: number; k0: number; k1: number; k2: number;
  health: string; hired: number; interviewRate: number; offerRate: number;
}

export interface DashboardStats {
  totalJobs: number; openJobs: number; totalCandidates: number; totalApplications: number;
  inPipeline: number; interviews: number; offers: number; hired: number;
  funnel: FunnelStage[]; recentApplications: ApplicationWithRelations[];
  upcomingInterviews: InterviewWithRelations[]; staleJobs: Job[]; offerAcceptanceRate: number;
}

export interface RejectionDropoff { fromStage: string; count: number; }

export interface PassiveEmployee {
  id: number; name: string; passiveAt: Date | null; title: string | null; jobTitle: string | null;
}

export interface ReportStats {
  funnel: FunnelStage[]; stageTimes: StageTime[]; total: number; hired: number;
  rejected: number; conversionRate: number; avgTimeToContractSign: number; avgTimeToEmploy: number;
  weeklyApplications: { week: string; count: number }[];
  totalInterviews: number; totalOffers: number;
  hiringManagerEfficiency: ManagerEfficiency[];
  activeJobPerformance: JobPerformance[];
  rejectionDropoff: RejectionDropoff[];
  passiveEmployees: PassiveEmployee[];
  passiveEmployeeCount: number;
}

function toPublicUser(u: User): PublicUser {
  const { passwordHash: _, ...pub } = u;
  return pub;
}

export interface IStorage {
  getUserById(id: number): Promise<PublicUser | undefined>;
  getUserByEmailFull(email: string): Promise<User | undefined>;
  getUsers(): Promise<PublicUser[]>;
  createUser(data: { name: string; email: string; passwordHash: string; role: string }): Promise<PublicUser>;
  updateUser(id: number, data: Partial<{ name: string; email: string; passwordHash: string; role: string }>): Promise<PublicUser | undefined>;
  deleteUser(id: number): Promise<void>;
  seedAdminIfEmpty(): Promise<void>;
  getAssignedJobIds(userId: number): Promise<number[]>;
  getJobAssignees(jobId: number): Promise<PublicUser[]>;
  assignJob(jobId: number, userId: number): Promise<void>;
  unassignJob(jobId: number, userId: number): Promise<void>;
  getJobs(jobIds?: number[]): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, job: Partial<InsertJob>): Promise<Job | undefined>;
  deleteJob(id: number): Promise<void>;
  getCandidates(jobIds?: number[], createdByUserId?: number): Promise<Candidate[]>;
  getCandidate(id: number): Promise<Candidate | undefined>;
  getCandidateByEmail(email: string): Promise<Candidate | undefined>;
  getCandidateByName(name: string): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate & { createdByUserId?: number }): Promise<Candidate>;
  updateCandidate(id: number, candidate: Partial<InsertCandidate>): Promise<Candidate | undefined>;
  deleteCandidate(id: number): Promise<void>;
  getCandidateNotes(candidateId: number): Promise<CandidateNote[]>;
  createCandidateNote(note: InsertCandidateNote): Promise<CandidateNote>;
  deleteCandidateNote(id: number): Promise<void>;
  getApplications(jobId?: number, candidateId?: number, jobIds?: number[]): Promise<ApplicationWithRelations[]>;
  getApplication(id: number): Promise<ApplicationWithRelations | undefined>;
  createApplication(application: InsertApplication): Promise<Application>;
  updateApplicationStatus(id: number, status: string): Promise<Application | undefined>;
  updateApplicationScore(id: number, score: number): Promise<Application | undefined>;
  addStageHistory(data: { applicationId: number; candidateId: number; jobId: number; fromStatus: string | null; toStatus: string; enteredAt?: Date }): Promise<StageHistory>;
  getCandidateHistory(candidateId: number): Promise<(StageHistory & { jobTitle: string | null })[]>;
  getInterviews(applicationId?: number, jobIds?: number[]): Promise<InterviewWithRelations[]>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterviewStatus(id: number, status: string): Promise<Interview | undefined>;
  deleteInterview(id: number): Promise<void>;
  getOffers(applicationId?: number, jobIds?: number[]): Promise<OfferWithRelations[]>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  updateOfferStatus(id: number, status: string): Promise<Offer | undefined>;
  deleteOffer(id: number): Promise<void>;
  getDashboardStats(jobIds?: number[]): Promise<DashboardStats>;
  getReportStats(startDate?: Date, endDate?: Date, jobIds?: number[]): Promise<ReportStats>;
  getApplicationDocuments(applicationId: number): Promise<ApplicationDocuments | null>;
  upsertApplicationDocuments(applicationId: number, receivedDocs: string[]): Promise<ApplicationDocuments>;
  getTasks(options: { assignedToUserId?: number; createdByUserId?: number }): Promise<TaskWithRelations[]>;
  getTask(id: number): Promise<TaskWithRelations | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;
  getAssistants(): Promise<PublicUser[]>;
  getHiringManagers(): Promise<PublicUser[]>;
  getEmployees(): Promise<EmployeeWithRelations[]>;
  getEmployee(id: number): Promise<EmployeeWithRelations | undefined>;
  getEmployeeByCandidateId(candidateId: number): Promise<EmployeeWithRelations | undefined>;
  getEmployeeByKwuid(kwuid: string): Promise<EmployeeWithRelations | undefined>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUserById(id: number): Promise<PublicUser | undefined> {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u ? toPublicUser(u) : undefined;
  }
  async getUserByEmailFull(email: string): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return u;
  }
  async getUsers(): Promise<PublicUser[]> {
    const all = await db.select().from(users).orderBy(users.name);
    return all.map(toPublicUser);
  }
  async createUser(data: { name: string; email: string; passwordHash: string; role: string }): Promise<PublicUser> {
    const [u] = await db.insert(users).values({
      name: data.name, email: data.email.toLowerCase(),
      passwordHash: data.passwordHash, role: data.role,
    }).returning();
    return toPublicUser(u);
  }
  async updateUser(id: number, data: Partial<{ name: string; email: string; passwordHash: string; role: string }>): Promise<PublicUser | undefined> {
    const updateData: any = { ...data };
    if (data.email) updateData.email = data.email.toLowerCase();
    const [u] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return u ? toPublicUser(u) : undefined;
  }
  async deleteUser(id: number): Promise<void> {
    // Clear job assignments for this user
    await db.delete(jobAssignments).where(eq(jobAssignments.userId, id));
    // Null out coaching manager references so employee records stay intact
    await db.update(employees)
      .set({ uretkenlikKocluguManagerId: null })
      .where(eq(employees.uretkenlikKocluguManagerId, id));
    // Null out createdByUserId on candidates (nullable column)
    await db.update(candidates)
      .set({ createdByUserId: null })
      .where(eq(candidates.createdByUserId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  async seedAdminIfEmpty(): Promise<void> {
    const [existing] = await db.select({ count: count() }).from(users);
    if (existing.count > 0) return;
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("admin123", 10);
    await this.createUser({ name: "Admin", email: "admin@kw.com.tr", passwordHash: hash, role: "admin" });
    console.log("[seed] Created default admin — email: admin@kw.com.tr, password: admin123");
  }
  async getAssignedJobIds(userId: number): Promise<number[]> {
    const rows = await db.select({ jobId: jobAssignments.jobId }).from(jobAssignments).where(eq(jobAssignments.userId, userId));
    return rows.map((r) => r.jobId);
  }
  async getJobAssignees(jobId: number): Promise<PublicUser[]> {
    const rows = await db
      .select({ user: users })
      .from(jobAssignments)
      .innerJoin(users, eq(jobAssignments.userId, users.id))
      .where(eq(jobAssignments.jobId, jobId));
    return rows.map((r) => toPublicUser(r.user));
  }
  async assignJob(jobId: number, userId: number): Promise<void> {
    const [existing] = await db.select().from(jobAssignments)
      .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, userId)));
    if (!existing) await db.insert(jobAssignments).values({ jobId, userId });
  }
  async unassignJob(jobId: number, userId: number): Promise<void> {
    await db.delete(jobAssignments)
      .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, userId)));
  }
  async getJobs(jobIds?: number[]): Promise<Job[]> {
    if (jobIds !== undefined) {
      if (jobIds.length === 0) return [];
      return db.select().from(jobs).where(inArray(jobs.id, jobIds)).orderBy(desc(jobs.createdAt));
    }
    return db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }
  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }
  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(insertJob).returning();
    return job;
  }
  async updateJob(id: number, update: Partial<InsertJob>): Promise<Job | undefined> {
    const [job] = await db.update(jobs).set(update).where(eq(jobs.id, id)).returning();
    return job;
  }
  async deleteJob(id: number): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }
  async getCandidates(jobIds?: number[], createdByUserId?: number): Promise<Candidate[]> {
    // Exclude candidates who are already active employees
    const empRows = await db.select({ candidateId: employees.candidateId }).from(employees);
    const empIds = empRows.map((e) => e.candidateId);

    if (jobIds !== undefined) {
      // Hiring manager: show candidates who applied to their jobs OR who they personally created
      let appCandidateIds: number[] = [];
      if (jobIds.length > 0) {
        const rows = await db.selectDistinct({ id: applications.candidateId })
          .from(applications)
          .where(inArray(applications.jobId, jobIds));
        appCandidateIds = rows.map((r) => r.id);
      }

      // Also include candidates created by this HM
      let createdIds: number[] = [];
      if (createdByUserId !== undefined) {
        const created = await db.select({ id: candidates.id })
          .from(candidates)
          .where(eq(candidates.createdByUserId, createdByUserId));
        createdIds = created.map((r) => r.id);
      }

      const allIds = Array.from(new Set([...appCandidateIds, ...createdIds])).filter((id) => !empIds.includes(id));
      if (allIds.length === 0) return [];
      return db.select().from(candidates).where(inArray(candidates.id, allIds)).orderBy(desc(candidates.createdAt));
    }

    if (empIds.length > 0) {
      return db.select().from(candidates).where(notInArray(candidates.id, empIds)).orderBy(desc(candidates.createdAt));
    }
    return db.select().from(candidates).orderBy(desc(candidates.createdAt));
  }
  async getCandidate(id: number): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate;
  }
  async getCandidateByEmail(email: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.email, email));
    return candidate;
  }
  async getCandidateByName(name: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.name, name));
    return candidate;
  }
  async createCandidate(insertCandidate: InsertCandidate & { createdByUserId?: number }): Promise<Candidate> {
    const [candidate] = await db.insert(candidates).values(insertCandidate).returning();
    return candidate;
  }
  async updateCandidate(id: number, update: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    const [candidate] = await db.update(candidates).set(update).where(eq(candidates.id, id)).returning();
    return candidate;
  }
  async deleteCandidate(id: number): Promise<void> {
    await db.delete(candidates).where(eq(candidates.id, id));
  }
  async getCandidateNotes(candidateId: number): Promise<CandidateNote[]> {
    return db.select().from(candidateNotes).where(eq(candidateNotes.candidateId, candidateId)).orderBy(desc(candidateNotes.createdAt));
  }
  async createCandidateNote(note: InsertCandidateNote): Promise<CandidateNote> {
    const [n] = await db.insert(candidateNotes).values(note).returning();
    return n;
  }
  async deleteCandidateNote(id: number): Promise<void> {
    await db.delete(candidateNotes).where(eq(candidateNotes.id, id));
  }

  private async joinedApplications(jobId?: number, candidateId?: number, jobIds?: number[]): Promise<ApplicationWithRelations[]> {
    if (jobIds !== undefined && jobIds.length === 0) return [];
    const base = db
      .select({ applications, candidate: candidates, job: jobs })
      .from(applications)
      .leftJoin(candidates, eq(applications.candidateId, candidates.id))
      .leftJoin(jobs, eq(applications.jobId, jobs.id))
      .orderBy(desc(applications.appliedAt));
    const conditions: any[] = [];
    if (jobId) conditions.push(eq(applications.jobId, jobId));
    if (candidateId) conditions.push(eq(applications.candidateId, candidateId));
    if (jobIds && jobIds.length > 0) conditions.push(inArray(applications.jobId, jobIds));
    const results = conditions.length > 0 ? await base.where(and(...conditions)) : await base;
    return results.map((r) => ({ ...r.applications, candidate: r.candidate ?? undefined, job: r.job ?? undefined }));
  }

  async getApplications(jobId?: number, candidateId?: number, jobIds?: number[]): Promise<ApplicationWithRelations[]> {
    return this.joinedApplications(jobId, candidateId, jobIds);
  }
  async getApplication(id: number): Promise<ApplicationWithRelations | undefined> {
    const [r] = await db
      .select({ applications, candidate: candidates, job: jobs })
      .from(applications)
      .leftJoin(candidates, eq(applications.candidateId, candidates.id))
      .leftJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(applications.id, id));
    if (!r) return undefined;
    return { ...r.applications, candidate: r.candidate ?? undefined, job: r.job ?? undefined };
  }
  async createApplication(insertApplication: InsertApplication): Promise<Application> {
    const [application] = await db.insert(applications).values({ ...insertApplication, score: 0 }).returning();
    return application;
  }
  async updateApplicationStatus(id: number, status: string): Promise<Application | undefined> {
    const [application] = await db.update(applications).set({ status }).where(eq(applications.id, id)).returning();
    return application;
  }
  async updateApplicationScore(id: number, score: number): Promise<Application | undefined> {
    const [application] = await db.update(applications).set({ score: Math.max(0, Math.min(10, score)) }).where(eq(applications.id, id)).returning();
    return application;
  }
  async addStageHistory(data: { applicationId: number; candidateId: number; jobId: number; fromStatus: string | null; toStatus: string; enteredAt?: Date }): Promise<StageHistory> {
    const [entry] = await db.insert(stageHistory).values(data).returning();
    return entry;
  }

  async getCandidateHistory(candidateId: number): Promise<(StageHistory & { jobTitle: string | null })[]> {
    const rows = await db
      .select({
        id: stageHistory.id,
        applicationId: stageHistory.applicationId,
        candidateId: stageHistory.candidateId,
        jobId: stageHistory.jobId,
        fromStatus: stageHistory.fromStatus,
        toStatus: stageHistory.toStatus,
        enteredAt: stageHistory.enteredAt,
        jobTitle: jobs.title,
      })
      .from(stageHistory)
      .leftJoin(jobs, eq(stageHistory.jobId, jobs.id))
      .where(eq(stageHistory.candidateId, candidateId))
      .orderBy(stageHistory.enteredAt);
    return rows;
  }

  async getInterviews(applicationId?: number, jobIds?: number[]): Promise<InterviewWithRelations[]> {
    if (jobIds !== undefined && jobIds.length === 0) return [];
    const base = db
      .select({ interviews, candidate: candidates, job: jobs, application: applications })
      .from(interviews)
      .leftJoin(candidates, eq(interviews.candidateId, candidates.id))
      .leftJoin(jobs, eq(interviews.jobId, jobs.id))
      .leftJoin(applications, eq(interviews.applicationId, applications.id))
      .orderBy(interviews.startTime);
    const conditions: any[] = [];
    if (applicationId) conditions.push(eq(interviews.applicationId, applicationId));
    if (jobIds && jobIds.length > 0) conditions.push(inArray(interviews.jobId, jobIds));
    const results = conditions.length > 0 ? await base.where(and(...conditions)) : await base;
    return results.map((r) => ({ ...r.interviews, candidate: r.candidate ?? undefined, job: r.job ?? undefined, application: r.application ?? undefined }));
  }
  async getInterview(id: number): Promise<InterviewWithRelations | null> {
    const [r] = await db
      .select({ interviews, candidate: candidates, job: jobs, application: applications })
      .from(interviews)
      .leftJoin(candidates, eq(interviews.candidateId, candidates.id))
      .leftJoin(jobs, eq(interviews.jobId, jobs.id))
      .leftJoin(applications, eq(interviews.applicationId, applications.id))
      .where(eq(interviews.id, id));
    if (!r) return null;
    return { ...r.interviews, candidate: r.candidate ?? undefined, job: r.job ?? undefined, application: r.application ?? undefined };
  }
  async createInterview(interview: InsertInterview): Promise<Interview> {
    const [iv] = await db.insert(interviews).values(interview).returning();
    return iv;
  }
  async updateInterviewStatus(id: number, status: string): Promise<Interview | undefined> {
    const [iv] = await db.update(interviews).set({ status }).where(eq(interviews.id, id)).returning();
    return iv;
  }
  async deleteInterview(id: number): Promise<void> {
    await db.delete(interviews).where(eq(interviews.id, id));
  }

  async getOffers(applicationId?: number, jobIds?: number[]): Promise<OfferWithRelations[]> {
    if (jobIds !== undefined && jobIds.length === 0) return [];
    const base = db
      .select({ offers, candidate: candidates, job: jobs })
      .from(offers)
      .leftJoin(candidates, eq(offers.candidateId, candidates.id))
      .leftJoin(jobs, eq(offers.jobId, jobs.id))
      .orderBy(desc(offers.createdAt));
    const conditions: any[] = [];
    if (applicationId) conditions.push(eq(offers.applicationId, applicationId));
    if (jobIds && jobIds.length > 0) conditions.push(inArray(offers.jobId, jobIds));
    const results = conditions.length > 0 ? await base.where(and(...conditions)) : await base;
    return results.map((r) => ({ ...r.offers, candidate: r.candidate ?? undefined, job: r.job ?? undefined }));
  }
  async createOffer(offer: InsertOffer): Promise<Offer> {
    const [o] = await db.insert(offers).values(offer).returning();
    return o;
  }
  async updateOfferStatus(id: number, status: string): Promise<Offer | undefined> {
    const [o] = await db.update(offers).set({ status }).where(eq(offers.id, id)).returning();
    return o;
  }
  async deleteOffer(id: number): Promise<void> {
    await db.delete(offers).where(eq(offers.id, id));
  }

  async getDashboardStats(jobIds?: number[]): Promise<DashboardStats> {
    // Scoped filters
    const scoped = jobIds !== undefined;
    const jobCond = scoped && jobIds!.length > 0 ? inArray(applications.jobId, jobIds!) : undefined;

    // Total jobs
    const allJobs = await this.getJobs(jobIds);
    const totalJobs = allJobs.length;
    const openJobs = allJobs.filter((j) => j.status === "open").length;

    // Candidates
    const allCandidates = await this.getCandidates(jobIds);
    const totalCandidates = allCandidates.length;

    // Applications counts by status
    const appCounts = jobCond
      ? await db.select({ status: applications.status, count: count() }).from(applications).where(jobCond).groupBy(applications.status)
      : scoped && jobIds!.length === 0
        ? []
        : await db.select({ status: applications.status, count: count() }).from(applications).groupBy(applications.status);

    const appMap = Object.fromEntries(appCounts.map((r) => [r.status, r.count]));
    const totalApplications = Object.values(appMap).reduce((s, c) => s + c, 0);
    const hired = appMap["hired"] || 0;
    const offersCount = appMap["offer"] || 0;
    const inPipeline = totalApplications - hired - (appMap["rejected"] || 0);

    // Interviews count
    const ivCond = scoped && jobIds!.length > 0 ? [inArray(interviews.jobId, jobIds!)] : scoped ? null : [];
    const ivRows = ivCond === null ? [{ count: 0 }] : (ivCond.length > 0
      ? await db.select({ count: count() }).from(interviews).where(and(...ivCond))
      : await db.select({ count: count() }).from(interviews));
    const interviewsCount = ivRows[0]?.count || 0;

    // Funnel
    const funnel = APPLICATION_STAGES.map((stage) => ({ stage, count: appMap[stage] || 0 }));

    // Offer acceptance rate
    const offerRows = scoped && jobIds!.length > 0
      ? await db.select({ status: offers.status, count: count() }).from(offers).where(inArray(offers.jobId, jobIds!)).groupBy(offers.status)
      : scoped ? []
      : await db.select({ status: offers.status, count: count() }).from(offers).groupBy(offers.status);
    const offerMap = Object.fromEntries(offerRows.map((r) => [r.status, r.count]));
    const accepted = offerMap["accepted"] || 0;
    const decided = accepted + (offerMap["rejected"] || 0);
    const offerAcceptanceRate = decided > 0 ? Math.round((accepted / decided) * 100) : 0;

    // Recent applications
    const recentApplications = await this.joinedApplications(undefined, undefined, jobIds);
    const recent = recentApplications.slice(0, 10);

    // Upcoming interviews
    const allInterviews = await this.getInterviews(undefined, jobIds);
    const now = new Date();
    const upcomingInterviews = allInterviews
      .filter((iv) => iv.startTime && new Date(iv.startTime) >= now)
      .slice(0, 5);

    // Stale jobs (open > 60 days, no recent applications)
    const staleJobs = allJobs.filter((j) => {
      if (j.status !== "open") return false;
      const daysOpen = j.createdAt ? differenceInDays(now, new Date(j.createdAt)) : 0;
      return daysOpen > 60;
    }).slice(0, 5);

    return {
      totalJobs, openJobs, totalCandidates, totalApplications,
      inPipeline, interviews: interviewsCount, offers: offersCount, hired,
      funnel, recentApplications: recent, upcomingInterviews, staleJobs,
      offerAcceptanceRate,
    };
  }

  async getReportStats(startDate?: Date, endDate?: Date, jobIds?: number[]): Promise<ReportStats> {
    // Normalize date range
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Push end to 23:59:59.999 so date-only strings (e.g. "2026-04-08") include the full day
    const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const scoped = jobIds !== undefined;
    const hasJobScope = scoped && jobIds!.length > 0;

    // ── 1. FUNNEL: all-time stage distribution (not date-filtered)
    // The funnel shows the current state of every application in the pipeline,
    // regardless of when the candidate applied. Date range only affects the
    // other metrics (time-to-hire, weekly volume, etc.).
    const funnelConds: any[] = [];
    if (hasJobScope) funnelConds.push(inArray(applications.jobId, jobIds!));

    const byStageRaw = scoped && !hasJobScope
      ? []
      : funnelConds.length > 0
        ? await db
            .select({ status: applications.status, count: count() })
            .from(applications)
            .where(and(...funnelConds))
            .groupBy(applications.status)
        : await db
            .select({ status: applications.status, count: count() })
            .from(applications)
            .groupBy(applications.status);

    const byStageMap: Record<string, number> = {};
    for (const r of byStageRaw) byStageMap[r.status] = r.count;

    const funnel = APPLICATION_STAGES.map((stage) => ({ stage, count: byStageMap[stage] || 0 }));

    // ── Metric totals: date-scoped (separate from the all-time funnel) ─────────
    const metricConds: any[] = [
      gte(applications.appliedAt, start),
      lte(applications.appliedAt, end),
    ];
    if (hasJobScope) metricConds.push(inArray(applications.jobId, jobIds!));

    const metricRaw = scoped && !hasJobScope
      ? []
      : await db
          .select({ status: applications.status, count: count() })
          .from(applications)
          .where(and(...metricConds))
          .groupBy(applications.status);

    const metricMap: Record<string, number> = {};
    for (const r of metricRaw) metricMap[r.status] = r.count;

    const total = Object.values(metricMap).reduce((s, c) => s + c, 0);
    // Count all post-contract stages: hired + every stage beyond it
    const hired = (metricMap["hired"] || 0)
      + (metricMap["myk_training"] || 0)
      + (metricMap["account_setup"] || 0)
      + (metricMap["documents"] || 0)
      + (metricMap["employed"] || 0);
    const rejected = metricMap["rejected"] || 0;
    const conversionRate = total > 0 ? Math.round((hired / total) * 100) : 0;

    // ── 2. STAGE TIMES ────────────────────────────────────────────────────────
    // Use a separate date-scoped condition set so stage times respect the date filter
    const dateScopedConds: any[] = [
      gte(applications.appliedAt, start),
      lte(applications.appliedAt, end),
    ];
    if (hasJobScope) dateScopedConds.push(inArray(applications.jobId, jobIds!));

    // Fetch applications in range WITH their appliedAt so we can compute "applied" stage time
    const relevantApps = scoped && !hasJobScope
      ? []
      : await db
          .select({ id: applications.id, appliedAt: applications.appliedAt })
          .from(applications)
          .where(and(...dateScopedConds));

    const relevantAppIds = relevantApps.map((r) => r.id);
    const appliedAtMap = Object.fromEntries(relevantApps.map((r) => [r.id, r.appliedAt]));

    const histories = relevantAppIds.length === 0
      ? []
      : await db
          .select()
          .from(stageHistory)
          .where(inArray(stageHistory.applicationId, relevantAppIds))
          .orderBy(stageHistory.enteredAt);

    const byApp = new Map<number, typeof histories[number][]>();
    for (const h of histories) {
      const arr = byApp.get(h.applicationId) ?? [];
      arr.push(h);
      byApp.set(h.applicationId, arr);
    }

    const totals: Record<string, { sum: number; count: number }> = Object.fromEntries(
      APPLICATION_STAGES.map((s) => [s, { sum: 0, count: 0 }]),
    );

    for (const [appId, rows] of Array.from(byApp.entries())) {
      // Accumulate total time per stage for THIS application first, then contribute
      // one data point per stage — prevents back-and-forth moves from inflating counts.
      const appStageTotals: Record<string, number> = {};

      // "applied" stage time: from appliedAt to first stage history entry
      const appAppliedAt = appliedAtMap[appId];
      if (appAppliedAt && rows.length > 0 && rows[0].enteredAt) {
        const diff = differenceInDays(new Date(rows[0].enteredAt!), new Date(appAppliedAt));
        if (diff > 0) appStageTotals["applied"] = (appStageTotals["applied"] ?? 0) + diff;
      }

      // All other stages: sum up time across all visits to the same stage
      for (let i = 0; i < rows.length - 1; i++) {
        const stage = rows[i].toStatus;
        if (!totals[stage]) continue;
        const startAt = rows[i].enteredAt ? new Date(rows[i].enteredAt!) : undefined;
        const nextAt = rows[i + 1].enteredAt ? new Date(rows[i + 1].enteredAt!) : undefined;
        if (!startAt || !nextAt) continue;
        const diff = differenceInDays(nextAt, startAt);
        if (diff > 0) appStageTotals[stage] = (appStageTotals[stage] ?? 0) + diff;
      }

      // Each application contributes exactly one data point per stage it passed through
      for (const [stage, total] of Object.entries(appStageTotals)) {
        if (totals[stage]) {
          totals[stage].sum += total;
          totals[stage].count += 1;
        }
      }
    }

    const stageTimes = APPLICATION_STAGES.map((stage) => ({
      stage,
      avgDays: totals[stage].count ? Math.round((totals[stage].sum / totals[stage].count) * 10) / 10 : 0,
    }));

    // ── 3a. AVG TIME TO CONTRACT SIGN: from appliedAt to first post-contract stage ─────
    // Counts ANY entry into hired/myk_training/account_setup/documents/employed so direct
    // skips (e.g. offer → myk_training) are included. Deduplicate per application, keep earliest.
    const POST_CONTRACT_STAGES = ["hired", "myk_training", "account_setup", "documents", "employed"] as const;
    const hiredHistoryConds: any[] = [
      inArray(stageHistory.toStatus, [...POST_CONTRACT_STAGES]),
      gte(stageHistory.enteredAt, start),
      lte(stageHistory.enteredAt, end),
    ];
    if (hasJobScope) hiredHistoryConds.push(inArray(stageHistory.jobId, jobIds!));

    const hiredHistoryRaw = scoped && !hasJobScope
      ? []
      : await db
          .select({ applicationId: stageHistory.applicationId, hiredAt: stageHistory.enteredAt })
          .from(stageHistory)
          .innerJoin(applications, eq(applications.id, stageHistory.applicationId))
          .where(and(...hiredHistoryConds, inArray(applications.status, [...POST_CONTRACT_STAGES])));

    // Keep only the earliest post-contract entry per application
    const hiredEarliestMap = new Map<number, string>();
    for (const row of hiredHistoryRaw) {
      const existing = hiredEarliestMap.get(row.applicationId);
      if (!existing || (row.hiredAt && row.hiredAt < existing)) {
        hiredEarliestMap.set(row.applicationId, row.hiredAt!);
      }
    }
    const hiredHistoryRows = Array.from(hiredEarliestMap.entries()).map(([applicationId, hiredAt]) => ({ applicationId, hiredAt }));

    let avgTimeToContractSign = 0;
    if (hiredHistoryRows.length > 0) {
      const appIds = hiredHistoryRows.map((r) => r.applicationId);
      const appRows = await db
        .select({ id: applications.id, appliedAt: applications.appliedAt })
        .from(applications)
        .where(inArray(applications.id, appIds));
      const appAppliedMap = Object.fromEntries(appRows.map((r) => [r.id, r.appliedAt]));

      const diffs = hiredHistoryRows
        .map((h) => {
          const appliedAt = appAppliedMap[h.applicationId];
          if (!appliedAt || !h.hiredAt) return null;
          return differenceInDays(new Date(h.hiredAt), new Date(appliedAt));
        })
        .filter((d): d is number => d !== null && d >= 0);

      avgTimeToContractSign = diffs.length > 0 ? Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length) : 0;
    }

    // ── 3b. AVG TIME TO EMPLOY: from appliedAt to when they first reached 'documents' stage ─────
    const employedHistoryConds: any[] = [
      eq(stageHistory.toStatus, "documents"),
      gte(stageHistory.enteredAt, start),
      lte(stageHistory.enteredAt, end),
    ];
    if (hasJobScope) employedHistoryConds.push(inArray(stageHistory.jobId, jobIds!));

    const employedHistoryRows = scoped && !hasJobScope
      ? []
      : await db
          .select({ applicationId: stageHistory.applicationId, employedAt: stageHistory.enteredAt })
          .from(stageHistory)
          .innerJoin(applications, eq(applications.id, stageHistory.applicationId))
          .where(and(...employedHistoryConds, inArray(applications.status, ["documents", "employed"])));

    let avgTimeToEmploy = 0;
    if (employedHistoryRows.length > 0) {
      const empAppIds = employedHistoryRows.map((r) => r.applicationId);
      const empAppRows = await db
        .select({ id: applications.id, appliedAt: applications.appliedAt })
        .from(applications)
        .where(inArray(applications.id, empAppIds));
      const empAppliedMap = Object.fromEntries(empAppRows.map((r) => [r.id, r.appliedAt]));

      const empDiffs = employedHistoryRows
        .map((h) => {
          const appliedAt = empAppliedMap[h.applicationId];
          if (!appliedAt || !h.employedAt) return null;
          return differenceInDays(new Date(h.employedAt), new Date(appliedAt));
        })
        .filter((d): d is number => d !== null && d >= 0);

      avgTimeToEmploy = empDiffs.length > 0 ? Math.round(empDiffs.reduce((s, d) => s + d, 0) / empDiffs.length) : 0;
    }

    // ── 4. WEEKLY APPLICATIONS: within selected date range ────────────────────
    const weeklyResult = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('week', applied_at), 'Mon DD') AS week,
        DATE_TRUNC('week', applied_at) AS week_start,
        COUNT(*)::int AS count
      FROM applications
      WHERE applied_at >= ${start} AND applied_at <= ${end}
      ${hasJobScope ? sql`AND job_id IN (${sql.join(jobIds!.map((id) => sql`${id}`), sql`, `)})` : scoped ? sql`AND 1=0` : sql``}
      GROUP BY DATE_TRUNC('week', applied_at)
      ORDER BY DATE_TRUNC('week', applied_at)
    `);
    const weeklyApplications = (weeklyResult.rows as { week: string; count: number }[]).map((r) => ({
      week: r.week,
      count: r.count,
    }));

    // ── 5. OFFER ACCEPTANCE RATE within date range ────────────────────────────
    const offerConds: any[] = [gte(offers.createdAt, start), lte(offers.createdAt, end)];
    if (hasJobScope) offerConds.push(inArray(offers.jobId, jobIds!));

    const offersByStatus = scoped && !hasJobScope
      ? []
      : await db
          .select({ status: offers.status, count: count() })
          .from(offers)
          .where(and(...offerConds))
          .groupBy(offers.status);

    const offerMap: Record<string, number> = {};
    for (const r of offersByStatus) offerMap[r.status] = r.count;
    const accOffers = offerMap["accepted"] || 0;
    const decOffers = accOffers + (offerMap["rejected"] || 0);
    const offerAcceptanceRate = decOffers > 0 ? Math.round((accOffers / decOffers) * 100) : 0;

    // ── 6. TOTAL INTERVIEWS & OFFERS within date range ────────────────────────
    const ivConds: any[] = [gte(interviews.createdAt, start), lte(interviews.createdAt, end)];
    if (hasJobScope) ivConds.push(inArray(interviews.jobId, jobIds!));

    const ivRow = scoped && !hasJobScope
      ? [{ count: 0 }]
      : await db.select({ count: count() }).from(interviews).where(and(...ivConds));

    const ofRow = scoped && !hasJobScope
      ? [{ count: 0 }]
      : await db.select({ count: count() }).from(offers).where(and(...offerConds));

    // ── 7. HIRING MANAGER EFFICIENCY within date range ────────────────────────
    const managerIdRows = hasJobScope
      ? await db.select({ userId: jobAssignments.userId }).from(jobAssignments).where(inArray(jobAssignments.jobId, jobIds!))
      : scoped
        ? []
        : await db.select({ userId: users.id }).from(users).where(eq(users.role, "hiring_manager"));

    // Deduplicate manager IDs
    const uniqueManagerIds = Array.from(new Set(managerIdRows.map((m) => m.userId)));

    const managerRows = await Promise.all(
      uniqueManagerIds.map(async (userId) => {
        const [u] = await db.select().from(users).where(eq(users.id, userId));
        const assignedJobs = await this.getAssignedJobIds(userId);
        if (assignedJobs.length === 0) {
          return { userId, name: u?.name ?? "Manager", role: u?.role ?? "hiring_manager", avgTimeToContractSign: 0, avgTimeToEmploy: 0, interviews: 0, totalHires: 0, employedCount: 0 };
        }

        // Applications within date range for this manager's jobs
        const mgrAppConds: any[] = [
          inArray(applications.jobId, assignedJobs),
          gte(applications.appliedAt, start),
          lte(applications.appliedAt, end),
        ];
        const mgrApps = await db.select().from(applications).where(and(...mgrAppConds));

        // Contract signed: first time entered ANY post-contract stage within date range
        // (hired, myk_training, account_setup, documents, employed) — handles direct skips (e.g. offer → myk_training)
        // Deduplicate by applicationId keeping earliest entry so back-and-forth moves don't inflate the count
        const POST_CONTRACT = ["hired", "myk_training", "account_setup", "documents", "employed"] as const;
        const mgrHiredHistoryRaw = await db
          .select({ applicationId: stageHistory.applicationId, hiredAt: stageHistory.enteredAt })
          .from(stageHistory)
          .innerJoin(applications, eq(applications.id, stageHistory.applicationId))
          .where(and(
            inArray(stageHistory.toStatus, [...POST_CONTRACT]),
            inArray(stageHistory.jobId, assignedJobs),
            gte(stageHistory.enteredAt, start),
            lte(stageHistory.enteredAt, end),
            inArray(applications.status, [...POST_CONTRACT]),
          ));
        // Keep only the earliest entry per application
        const mgrHiredMap = new Map<number, { applicationId: number; hiredAt: string | null }>();
        for (const row of mgrHiredHistoryRaw) {
          const existing = mgrHiredMap.get(row.applicationId);
          if (!existing || (row.hiredAt && existing.hiredAt && row.hiredAt < existing.hiredAt)) {
            mgrHiredMap.set(row.applicationId, row);
          }
        }
        const mgrHiredHistory = Array.from(mgrHiredMap.values());

        let mgrAvgTimeToContractSign = 0;
        if (mgrHiredHistory.length > 0) {
          const hiredAppIds = mgrHiredHistory.map((r) => r.applicationId);
          const hiredAppRows = await db
            .select({ id: applications.id, appliedAt: applications.appliedAt })
            .from(applications)
            .where(inArray(applications.id, hiredAppIds));
          const appliedMap = Object.fromEntries(hiredAppRows.map((r) => [r.id, r.appliedAt]));
          const diffs = mgrHiredHistory
            .map((h) => {
              const a = appliedMap[h.applicationId];
              return a && h.hiredAt ? differenceInDays(new Date(h.hiredAt), new Date(a)) : null;
            })
            .filter((d): d is number => d !== null && d >= 0);
          mgrAvgTimeToContractSign = diffs.length > 0 ? Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length) : 0;
        }

        // Completed interviews where the interview took place within the date range
        const mgrIvConds: any[] = [
          inArray(interviews.jobId, assignedJobs),
          eq(interviews.status, "completed"),
          gte(interviews.startTime, start),
          lte(interviews.startTime, end),
        ];
        const mgrInterviewRows = await db
          .select({
            category: candidates.category,
            count: count(),
          })
          .from(interviews)
          .leftJoin(candidates, eq(interviews.candidateId, candidates.id))
          .where(and(...mgrIvConds))
          .groupBy(candidates.category);
        const mgrIvMap = Object.fromEntries(mgrInterviewRows.map((r) => [r.category, r.count]));
        const mgrIvRow = await db.select({ count: count() }).from(interviews).where(and(...mgrIvConds));

        // Offers within date range
        const mgrOfferConds: any[] = [
          inArray(offers.jobId, assignedJobs),
          gte(offers.createdAt, start),
          lte(offers.createdAt, end),
        ];
        const mgrOfferRows = await db.select({ status: offers.status, count: count() })
          .from(offers).where(and(...mgrOfferConds)).groupBy(offers.status);
        const mgrOfferMap = Object.fromEntries(mgrOfferRows.map((r) => [r.status, r.count]));
        const mgrAcc = mgrOfferMap["accepted"] || 0;
        const mgrDec = mgrAcc + (mgrOfferMap["rejected"] || 0);

        // Employed candidates: current status is "documents" or "employed"
        // Check current application status (not history) so moving a candidate back removes them from the count
        const mgrEmployedRaw = await db
          .select({ id: applications.id })
          .from(applications)
          .where(and(
            inArray(applications.jobId, assignedJobs),
            inArray(applications.status, ["documents", "employed"]),
            gte(applications.appliedAt, start),
            lte(applications.appliedAt, end),
          ));
        const employedCount = mgrEmployedRaw.length;

        // Avg time to employ per manager: from appliedAt to when they first reached 'documents' stage
        // Deduplicate by applicationId — keep earliest entry to avoid inflating averages from stage bouncing
        const mgrEmployedHistoryRaw = await db
          .select({ applicationId: stageHistory.applicationId, employedAt: stageHistory.enteredAt })
          .from(stageHistory)
          .innerJoin(applications, eq(applications.id, stageHistory.applicationId))
          .where(and(
            eq(stageHistory.toStatus, "documents"),
            inArray(stageHistory.jobId, assignedJobs),
            gte(stageHistory.enteredAt, start),
            lte(stageHistory.enteredAt, end),
            inArray(applications.status, ["documents", "employed"]),
          ));
        const mgrEmployedMap = new Map<number, { applicationId: number; employedAt: string | null }>();
        for (const row of mgrEmployedHistoryRaw) {
          const existing = mgrEmployedMap.get(row.applicationId);
          if (!existing || (row.employedAt && existing.employedAt && row.employedAt < existing.employedAt)) {
            mgrEmployedMap.set(row.applicationId, row);
          }
        }
        const mgrEmployedHistoryRows = Array.from(mgrEmployedMap.values());
        let mgrAvgTimeToEmploy = 0;
        if (mgrEmployedHistoryRows.length > 0) {
          const empAppIds = mgrEmployedHistoryRows.map((r) => r.applicationId);
          const empAppRows = await db
            .select({ id: applications.id, appliedAt: applications.appliedAt })
            .from(applications)
            .where(inArray(applications.id, empAppIds));
          const empAppliedMap = Object.fromEntries(empAppRows.map((r) => [r.id, r.appliedAt]));
          const empDiffs = mgrEmployedHistoryRows
            .map((h) => {
              const a = empAppliedMap[h.applicationId];
              return a && h.employedAt ? differenceInDays(new Date(h.employedAt), new Date(a)) : null;
            })
            .filter((d): d is number => d !== null && d >= 0);
          mgrAvgTimeToEmploy = empDiffs.length > 0 ? Math.round(empDiffs.reduce((s, d) => s + d, 0) / empDiffs.length) : 0;
        }

        return {
          userId,
          name: u?.name ?? "Manager",
          role: u?.role ?? "hiring_manager",
          avgTimeToContractSign: mgrAvgTimeToContractSign,
          avgTimeToEmploy: mgrAvgTimeToEmploy,
          interviews: mgrIvRow[0]?.count || 0,
          k0: mgrIvMap["K0"] || 0,
          k1: mgrIvMap["K1"] || 0,
          k2: mgrIvMap["K2"] || 0,
          totalHires: mgrHiredHistory.length,
          employedCount,
        };
      }),
    );

    // ── 8. ACTIVE JOB PERFORMANCE within date range ───────────────────────────
    const activeJobRows = hasJobScope
      ? await db.select().from(jobs).where(inArray(jobs.id, jobIds!))
      : scoped
        ? []
        : await db.select().from(jobs).where(eq(jobs.status, "open"));

    const activeJobPerformance = await Promise.all(
      activeJobRows.map(async (job) => {
        // Applicants who applied within the date range
        const appConds: any[] = [
          eq(applications.jobId, job.id),
          gte(applications.appliedAt, start),
          lte(applications.appliedAt, end),
        ];
        const jobApps = await db
          .select({ applications, candidate: candidates })
          .from(applications)
          .leftJoin(candidates, eq(applications.candidateId, candidates.id))
          .where(and(...appConds));

        const applicants = jobApps.length;
        const k0 = jobApps.filter((a) => a.candidate?.category === "K0").length;
        const k1 = jobApps.filter((a) => a.candidate?.category === "K1").length;
        const k2 = jobApps.filter((a) => a.candidate?.category === "K2").length;
        const hiredCount = jobApps.filter((a) => a.applications.status === "hired").length;

        // Interviews and offers within date range for this job
        const [ivCountRow] = await db.select({ count: count() }).from(interviews)
          .where(and(eq(interviews.jobId, job.id), gte(interviews.createdAt, start), lte(interviews.createdAt, end)));
        const [ofCountRow] = await db.select({ count: count() }).from(offers)
          .where(and(eq(offers.jobId, job.id), gte(offers.createdAt, start), lte(offers.createdAt, end)));

        const interviewsCount = ivCountRow?.count || 0;
        const offersCount = ofCountRow?.count || 0;
        const daysOpen = job.createdAt ? differenceInDays(new Date(), new Date(job.createdAt)) : 0;
        const interviewRate = applicants ? Math.round((interviewsCount / applicants) * 100) : 0;
        const offerRate = interviewsCount ? Math.round((offersCount / interviewsCount) * 100) : 0;
        const health = applicants >= 50 && interviewRate >= 10
          ? "Healthy"
          : applicants >= 20
            ? "Watch"
            : "Low";

        return { jobId: job.id, title: job.title, department: job.department, daysOpen, applicants, k0, k1, k2, health, hired: hiredCount, interviewRate, offerRate };
      }),
    );

    // ── 9. REJECTION DROP-OFF: which stage did rejected candidates come from ─────
    // Rejection dropoff: for each application currently 'rejected', take the most recent
    // stageHistory entry with toStatus='rejected' within the date range.
    // Deduplicating by applicationId prevents counting back-and-forth moves multiple times.
    const rejConds: any[] = [
      eq(stageHistory.toStatus, "rejected"),
      eq(applications.status, "rejected"),
      gte(stageHistory.enteredAt, start),
      lte(stageHistory.enteredAt, end),
    ];
    if (hasJobScope) rejConds.push(inArray(stageHistory.jobId, jobIds!));

    const rejAllRows = scoped && !hasJobScope
      ? []
      : await db
          .select({ applicationId: stageHistory.applicationId, fromStatus: stageHistory.fromStatus, enteredAt: stageHistory.enteredAt })
          .from(stageHistory)
          .innerJoin(applications, eq(applications.id, stageHistory.applicationId))
          .where(and(...rejConds));

    // Keep only the most recent rejection entry per application
    const rejByApp = new Map<number, { fromStatus: string | null; enteredAt: string | null }>();
    for (const row of rejAllRows) {
      const existing = rejByApp.get(row.applicationId);
      if (!existing || (row.enteredAt && existing.enteredAt && row.enteredAt > existing.enteredAt)) {
        rejByApp.set(row.applicationId, { fromStatus: row.fromStatus, enteredAt: row.enteredAt });
      }
    }

    // Group deduplicated entries by fromStatus
    const rejCountMap = new Map<string, number>();
    for (const { fromStatus } of rejByApp.values()) {
      const key = fromStatus ?? "unknown";
      rejCountMap.set(key, (rejCountMap.get(key) ?? 0) + 1);
    }

    const rejectionDropoff: RejectionDropoff[] = Array.from(rejCountMap.entries())
      .map(([fromStage, count]) => ({ fromStage, count }))
      .sort((a, b) => b.count - a.count);

    // ── 10. PASSIVE EMPLOYEES: became inactive within the date range ──────────────
    // Include employees with null passiveAt (set inactive before tracking existed) always,
    // and date-filtered ones within the selected range
    const passiveConds = and(
      eq(employees.status, "inactive"),
      or(
        isNull(employees.passiveAt),
        and(gte(employees.passiveAt, start), lte(employees.passiveAt, end))
      )
    );

    const passiveRaw = await db
      .select({
        id: employees.id,
        title: employees.title,
        passiveAt: employees.passiveAt,
        candidateName: candidates.name,
        jobTitle: jobs.title,
      })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .leftJoin(jobs, eq(employees.jobId, jobs.id))
      .where(passiveConds)
      .orderBy(desc(employees.passiveAt));

    const passiveEmployees: PassiveEmployee[] = passiveRaw.map((r) => ({
      id: r.id,
      name: r.candidateName ?? "—",
      passiveAt: r.passiveAt,
      title: r.title,
      jobTitle: r.jobTitle ?? null,
    }));

    return {
      funnel, stageTimes, total, hired, rejected, conversionRate,
      avgTimeToContractSign, avgTimeToEmploy,
      weeklyApplications,
      totalInterviews: ivRow[0]?.count || 0,
      totalOffers: ofRow[0]?.count || 0,
      hiringManagerEfficiency: managerRows,
      activeJobPerformance,
      rejectionDropoff,
      passiveEmployees,
      passiveEmployeeCount: passiveEmployees.length,
    };
  }

  async getApplicationDocuments(applicationId: number): Promise<ApplicationDocuments | null> {
    const [row] = await db
      .select()
      .from(applicationDocuments)
      .where(eq(applicationDocuments.applicationId, applicationId));
    return row ?? null;
  }

  async upsertApplicationDocuments(applicationId: number, receivedDocs: string[]): Promise<ApplicationDocuments> {
    const existing = await this.getApplicationDocuments(applicationId);
    if (existing) {
      const [updated] = await db
        .update(applicationDocuments)
        .set({ receivedDocs, updatedAt: new Date() })
        .where(eq(applicationDocuments.applicationId, applicationId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(applicationDocuments)
      .values({ applicationId, receivedDocs })
      .returning();
    return created;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user ?? null;
  }

  async upsertGoogleUser(data: {
    googleId: string;
    email: string;
    name: string;
  }): Promise<User> {
    const existing = await this.getUserByGoogleId(data.googleId);

    if (existing) {
      return existing;
    }

    const byEmail = await this.getUserByEmailFull(data.email);
    if (byEmail) {
      const [updated] = await db
        .update(users)
        .set({ googleId: data.googleId })
        .where(eq(users.id, byEmail.id))
        .returning();
      return updated;
    }

    const hash = await import("bcrypt").then((m) => m.default.hash(Math.random().toString(36), 10));
    const [created] = await db
      .insert(users)
      .values({
        googleId: data.googleId,
        email: data.email,
        name: data.name,
        passwordHash: hash,
        role: "hiring_manager",
      })
      .returning();
    return created;
  }

  async updateUserGoogleTokens(userId: number, tokens: {
    accessToken: string;
    refreshToken?: string;
    expiryDate?: number;
  }): Promise<void> {
    await db.update(users).set({
      googleAccessToken: tokens.accessToken,
      googleRefreshToken: tokens.refreshToken,
      googleTokenExpiry: tokens.expiryDate ? new Date(tokens.expiryDate) : null,
    }).where(eq(users.id, userId));
  }

  async setInterviewCalendarEventId(interviewId: number, eventId: string): Promise<void> {
    await db.update(interviews).set({ calendarEventId: eventId }).where(eq(interviews.id, interviewId));
  }

  async getAssistants(): Promise<PublicUser[]> {
    const all = await db.select().from(users).where(eq(users.role, "assistant")).orderBy(users.name);
    return all.map(toPublicUser);
  }
  async getHiringManagers(): Promise<PublicUser[]> {
    const all = await db.select().from(users).where(inArray(users.role, ["hiring_manager", "admin"])).orderBy(users.name);
    return all.map(toPublicUser);
  }

  async getEmployees(): Promise<EmployeeWithRelations[]> {
    const rows = await db
      .select({ employee: employees, candidate: candidates, job: jobs })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .leftJoin(jobs, eq(employees.jobId, jobs.id))
      .orderBy(desc(employees.startDate));
    return rows.map((r) => ({ ...r.employee, candidate: r.candidate ?? undefined, job: r.job ?? undefined }));
  }

  async getEmployee(id: number): Promise<EmployeeWithRelations | undefined> {
    const [r] = await db
      .select({ employee: employees, candidate: candidates, job: jobs })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .leftJoin(jobs, eq(employees.jobId, jobs.id))
      .where(eq(employees.id, id));
    if (!r) return undefined;
    return { ...r.employee, candidate: r.candidate ?? undefined, job: r.job ?? undefined };
  }

  async getEmployeeByCandidateId(candidateId: number): Promise<EmployeeWithRelations | undefined> {
    const [r] = await db
      .select({ employee: employees, candidate: candidates, job: jobs })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .leftJoin(jobs, eq(employees.jobId, jobs.id))
      .where(eq(employees.candidateId, candidateId));
    if (!r) return undefined;
    return { ...r.employee, candidate: r.candidate ?? undefined, job: r.job ?? undefined };
  }

  async getEmployeeByKwuid(kwuid: string): Promise<EmployeeWithRelations | undefined> {
    const [r] = await db
      .select({ employee: employees, candidate: candidates, job: jobs })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .leftJoin(jobs, eq(employees.jobId, jobs.id))
      .where(eq(employees.kwuid, kwuid));
    if (!r) return undefined;
    return { ...r.employee, candidate: r.candidate ?? undefined, job: r.job ?? undefined };
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> {
    const [emp] = await db.insert(employees).values(data).returning();
    return emp;
  }

  async updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const update: any = { ...data };
    if (data.status === "inactive") {
      // Always stamp the latest passive date so the report date filter works correctly
      update.passiveAt = new Date();
    }
    const [emp] = await db.update(employees).set(update).where(eq(employees.id, id)).returning();
    return emp;
  }

  async deleteEmployee(id: number): Promise<void> {
    await db.delete(employees).where(eq(employees.id, id));
  }

  async getTasks(options: { assignedToUserId?: number; createdByUserId?: number }): Promise<TaskWithRelations[]> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (options.assignedToUserId !== undefined) conditions.push(eq(tasks.assignedToUserId, options.assignedToUserId));
    if (options.createdByUserId !== undefined) conditions.push(eq(tasks.createdByUserId, options.createdByUserId));

    const rows = await db
      .select({ task: tasks, assignedTo: users, candidate: candidates })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedToUserId, users.id))
      .leftJoin(candidates, eq(tasks.candidateId, candidates.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tasks.createdAt));

    const creatorIds = Array.from(new Set(rows.map((r) => r.task.createdByUserId)));
    const creators = creatorIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, creatorIds))
      : [];
    const creatorMap = Object.fromEntries(creators.map((c) => [c.id, toPublicUser(c)]));

    return rows.map((r) => ({
      ...r.task,
      assignedTo: r.assignedTo ? toPublicUser(r.assignedTo) : undefined,
      createdBy: creatorMap[r.task.createdByUserId],
      candidate: r.candidate ? { id: r.candidate.id, name: r.candidate.name } : undefined,
    }));
  }

  async getTask(id: number): Promise<TaskWithRelations | undefined> {
    const [row] = await db
      .select({ task: tasks, assignedTo: users })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedToUserId, users.id))
      .where(eq(tasks.id, id));
    if (!row) return undefined;

    const [creator] = await db.select().from(users).where(eq(users.id, row.task.createdByUserId));
    return {
      ...row.task,
      assignedTo: row.assignedTo ? toPublicUser(row.assignedTo) : undefined,
      createdBy: creator ? toPublicUser(creator) : undefined,
    };
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [t] = await db.insert(tasks).values(task).returning();
    return t;
  }

  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined> {
    const [t] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return t;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }
}

export const storage = new DatabaseStorage();
