import { db } from "./db";
import {
  jobs, candidates, applications, stageHistory, interviews, offers, candidateNotes,
  users, jobAssignments, applicationDocuments, tasks, employees,
  capSettings, closings, closingSides, closingAgents, interviewTargets,
  officeExpenses, listings, financialTargets,
  APPLICATION_STAGES, BM_PREPAYMENT_CATEGORY,
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
  type CapSetting, type Closing, type ClosingSide, type ClosingAgent,
  type CapStatus, type ClosingWithDetails, type InterviewTarget,
  type OfficeExpense, type InsertOfficeExpense,
  type Listing, type ListingWithEmployee,
  type FinancialTarget,
} from "@shared/schema";
import { eq, desc, asc, count, sql, gte, lte, lt, and, or, isNull, isNotNull, inArray, notInArray } from "drizzle-orm";
import { differenceInDays } from "date-fns";
import { randomBytes } from "crypto";

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

export interface NewEmployee {
  id: number; name: string; startDate: Date | null; title: string | null;
  kwuid: string | null; contractType: string | null; category: string | null; city: string | null;
  jobTitle: string | null;
}

export interface NewContractSigner {
  applicationId: number; candidateName: string; jobTitle: string | null;
  category: string | null; city: string | null; signedAt: string | null;
}

export interface EmployeeClosingRow {
  closingId: number;
  propertyAddress: string;
  dealCategory: string;
  dealType: string;
  saleValue: string;
  employeeNet: string;
  closingDate: Date | null;
  sideType: string;
  status: string;
}

export interface ChurnRow {
  employeeId: number;
  name: string;
  kwuid: string | null;
  category: string | null;
  tenureMonths: number;
  lastClosingDate: string | null;
  daysSinceLast: number | null;
  closings3m: number;
  closingsPrev3m: number;
  trend: "up" | "flat" | "down";
  score: number;
  risk: "high" | "medium" | "low";
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
  newEmployees: NewEmployee[];
  newEmployeeCount: number;
  newContractSigners: NewContractSigner[];
  newContractSignerCount: number;
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
  getCandidateByPhone(phone: string): Promise<Candidate | undefined>;
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
  completeScheduledInterviews(candidateId: number): Promise<number>;
  updateInterview(id: number, data: { startTime: Date; endTime: Date }): Promise<Interview | undefined>;
  deleteInterview(id: number): Promise<void>;
  getOffers(applicationId?: number, jobIds?: number[]): Promise<OfferWithRelations[]>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  updateOfferStatus(id: number, status: string): Promise<Offer | undefined>;
  deleteOffer(id: number): Promise<void>;
  getDashboardStats(jobIds?: number[]): Promise<DashboardStats>;
  getReportStats(startDate?: Date, endDate?: Date, jobIds?: number[], office?: string): Promise<ReportStats>;
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
  updateStageHistoryDate(id: number, enteredAt: Date): Promise<{ id: number; enteredAt: Date | null } | undefined>;
  deleteEmployee(id: number): Promise<void>;
  updateEmployeeCapAdjustment(id: number, amount: string): Promise<void>;
  getCapSettings(): Promise<CapSetting[]>;
  upsertCapSetting(year: number, amount: string): Promise<CapSetting>;
  deleteCapSetting(id: number): Promise<void>;
  getEmployeeCapStatus(employeeId: number): Promise<CapStatus | null>;
  getAllEmployeesCapStatus(): Promise<Record<number, CapStatus & { name: string; kwuid: string }>>;
  getClosings(): Promise<ClosingWithDetails[]>;
  getClosing(id: number): Promise<ClosingWithDetails | null>;
  getClosingsByEmployee(employeeId: number): Promise<EmployeeClosingRow[]>;
  getChurnReport(): Promise<ChurnRow[]>;
  updateClosing(id: number, data: Partial<{
    propertyAddress: string; il: string | null; ilce: string | null;
    dealCategory: string; dealType: string; saleValue: string;
    commissionRate: string; closingDate: Date; buyerName: string | null;
    sellerName: string | null; notes: string | null;
  }>): Promise<void>;
  updateClosingAgent(id: number, data: Partial<{
    splitPercentage: string; bhbShare: string; mainBranchShare: string;
    kwtrKdv: string; marketCenterActual: string; bmKdv: string;
    ukShare: string; employeeNet: string; kasa: string; nakit: string; banka: string;
    closingDate: Date | null; status: string | null; paymentCollected: boolean;
  }>): Promise<void>;
  updateClosingSide(id: number, data: Partial<{ kasa: string; nakit: string; banka: string }>): Promise<void>;
  getClosingIdForAgent(agentId: number): Promise<number | null>;
  createClosing(data: {
    propertyAddress: string;
    il?: string | null;
    ilce?: string | null;
    mahalle?: string | null;
    propertyDetails?: string | null;
    dealCategory?: string | null;
    dealType: string;
    saleValue: string;
    commissionRate?: string | null;
    openingPrice?: string | null;
    durationDays?: number | null;
    customerSource?: string | null;
    referralInfo?: string | null;
    contractStartDate?: Date | null;
    contractEndDate?: Date | null;
    kasa?: string | null;
    nakit?: string | null;
    banka?: string | null;
    closingDate?: Date | null;
    status?: string;
    buyerName?: string | null;
    sellerName?: string | null;
    notes?: string | null;
    createdByUserId?: number | null;
    sides: Array<{
      sideType: string;
      agents: Array<{
        employeeId: number;
        splitPercentage: string;
        bhbShare?: string;
        mainBranchShare?: string;
        kwtrKdv?: string;
        marketCenterActual?: string;
        bmKdv?: string;
        ukShare?: string;
        employeeNet?: string;
        closingDate?: Date | null;
        status?: string | null;
        paymentCollected?: boolean;
      }>;
    }>;
  }): Promise<Closing>;
  deleteClosing(id: number): Promise<void>;
  replaceClosingSides(closingId: number, saleValue: string, commissionRate: string, sides: Array<{
    sideType: string;
    agents: Array<{
      employeeId: number;
      splitPercentage: string;
      bhbShare?: string;
      mainBranchShare?: string;
      kwtrKdv?: string;
      marketCenterActual?: string;
      bmKdv?: string;
      ukShare?: string;
      employeeNet?: string;
      closingDate?: Date | null;
      status?: string | null;
      paymentCollected?: boolean;
    }>;
  }>): Promise<void>;
  getInterviewTargets(year: number, month: number, jobIds?: number[]): Promise<import("@shared/schema").InterviewTarget[]>;
  upsertInterviewTarget(data: { jobId: number; year: number; month: number; category: string; target: number }): Promise<void>;
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
    // Delete tasks assigned to or created by this user
    await db.delete(tasks).where(eq(tasks.assignedToUserId, id));
    await db.delete(tasks).where(eq(tasks.createdByUserId, id));
    // Clear job assignments for this user
    await db.delete(jobAssignments).where(eq(jobAssignments.userId, id));
    // Null out coaching manager references so employee records stay intact
    await db.update(employees)
      .set({ uretkenlikKocluguManagerId: null })
      .where(eq(employees.uretkenlikKocluguManagerId, id));
    await db.update(employees)
      .set({ duaManagerId: null } as any)
      .where(eq((employees as any).duaManagerId, id));
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
    const [candidate] = await db.select().from(candidates).where(sql`lower(${candidates.name}) = lower(${name})`);
    return candidate;
  }
  async getCandidateByPhone(phone: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.phone, phone));
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
    await db.transaction(async (tx) => {
      const appRows = await tx.select({ id: applications.id }).from(applications).where(eq(applications.candidateId, id));
      const appIds = appRows.map((r) => r.id);

      await tx.delete(stageHistory).where(eq(stageHistory.candidateId, id));
      await tx.delete(interviews).where(eq(interviews.candidateId, id));
      await tx.delete(offers).where(eq(offers.candidateId, id));
      if (appIds.length) await tx.delete(applicationDocuments).where(inArray(applicationDocuments.applicationId, appIds));
      await tx.delete(tasks).where(eq(tasks.candidateId, id));
      await tx.delete(candidateNotes).where(eq(candidateNotes.candidateId, id));
      await tx.delete(employees).where(eq(employees.candidateId, id));
      await tx.delete(applications).where(eq(applications.candidateId, id));
      await tx.delete(candidates).where(eq(candidates.id, id));
    });
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

    // Batch-fetch latest note per candidate
    const candidateIds = [...new Set(results.map((r) => r.applications.candidateId).filter(Boolean))] as number[];
    const noteRows = candidateIds.length > 0
      ? await db.select({ candidateId: candidateNotes.candidateId, content: candidateNotes.content })
          .from(candidateNotes)
          .where(inArray(candidateNotes.candidateId, candidateIds))
          .orderBy(desc(candidateNotes.createdAt))
      : [];
    const latestNoteMap = new Map<number, string>();
    for (const n of noteRows) {
      if (!latestNoteMap.has(n.candidateId)) latestNoteMap.set(n.candidateId, n.content);
    }

    return results.map((r) => ({
      ...r.applications,
      candidate: r.candidate ?? undefined,
      job: r.job ?? undefined,
      latestNote: latestNoteMap.get(r.applications.candidateId) ?? null,
    }));
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
      .orderBy(desc(interviews.startTime));
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
  async completeScheduledInterviews(candidateId: number): Promise<number> {
    const result = await db
      .update(interviews)
      .set({ status: "completed" })
      .where(and(eq(interviews.candidateId, candidateId), eq(interviews.status, "scheduled")))
      .returning({ id: interviews.id });
    return result.length;
  }
  async updateInterview(id: number, data: { startTime: Date; endTime: Date }): Promise<Interview | undefined> {
    const [iv] = await db
      .update(interviews)
      .set({ startTime: data.startTime, endTime: data.endTime, rescheduleCount: sql`${interviews.rescheduleCount} + 1` })
      .where(eq(interviews.id, id))
      .returning();
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

  async getReportStats(startDate?: Date, endDate?: Date, jobIds?: number[], office?: string): Promise<ReportStats> {
    // Normalize date range
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Push end to 23:59:59.999 so date-only strings (e.g. "2026-04-08") include the full day
    const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const scoped = jobIds !== undefined;
    const hasJobScope = scoped && jobIds!.length > 0;

    // ── Pre-compute office candidate IDs (null = no filter, [] = empty = no data) ──
    let officeCandidateIds: number[] | null = null;
    if (office) {
      const officeRows = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.office, office));
      officeCandidateIds = officeRows.map((r) => r.id);
    }
    const hasOfficeFilter = officeCandidateIds !== null;
    const hasOfficeCandidates = hasOfficeFilter && officeCandidateIds!.length > 0;

    // ── 1. FUNNEL: all-time stage distribution (not date-filtered)
    // The funnel shows the current state of every application in the pipeline,
    // regardless of when the candidate applied. Date range only affects the
    // other metrics (time-to-hire, weekly volume, etc.).
    const funnelConds: any[] = [];
    if (hasJobScope) funnelConds.push(inArray(applications.jobId, jobIds!));
    if (hasOfficeCandidates) funnelConds.push(inArray(applications.candidateId, officeCandidateIds!));

    const byStageRaw = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
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
    if (hasOfficeCandidates) metricConds.push(inArray(applications.candidateId, officeCandidateIds!));

    const metricRaw = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
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
    if (hasOfficeCandidates) dateScopedConds.push(inArray(applications.candidateId, officeCandidateIds!));

    // Fetch applications in range WITH their appliedAt so we can compute "applied" stage time
    const relevantApps = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
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
    if (hasOfficeCandidates) hiredHistoryConds.push(inArray(stageHistory.candidateId, officeCandidateIds!));

    const hiredHistoryRaw = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
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
    if (hasOfficeCandidates) employedHistoryConds.push(inArray(stageHistory.candidateId, officeCandidateIds!));

    const employedHistoryRows = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
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
    const weeklyResult = hasOfficeFilter && !hasOfficeCandidates
      ? { rows: [] }
      : await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('week', applied_at), 'Mon DD') AS week,
        DATE_TRUNC('week', applied_at) AS week_start,
        COUNT(*)::int AS count
      FROM applications
      WHERE applied_at >= ${start} AND applied_at <= ${end}
      ${hasJobScope ? sql`AND job_id IN (${sql.join(jobIds!.map((id) => sql`${id}`), sql`, `)})` : scoped ? sql`AND 1=0` : sql``}
      ${hasOfficeCandidates ? sql`AND candidate_id IN (${sql.join(officeCandidateIds!.map((id) => sql`${id}`), sql`, `)})` : sql``}
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
    if (hasOfficeCandidates) offerConds.push(inArray(offers.candidateId, officeCandidateIds!));

    const offersByStatus = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
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
    if (hasOfficeCandidates) ivConds.push(inArray(interviews.candidateId, officeCandidateIds!));

    const ivRow = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
      ? [{ count: 0 }]
      : await db.select({ count: count() }).from(interviews).where(and(...ivConds));

    const ofRow = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
      ? [{ count: 0 }]
      : await db.select({ count: count() }).from(offers).where(and(...offerConds));

    // ── 7. HIRING MANAGER EFFICIENCY within date range ────────────────────────
    const managerIdRows = (hasOfficeFilter && !hasOfficeCandidates)
      ? []
      : hasJobScope
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
        if (hasOfficeCandidates) mgrAppConds.push(inArray(applications.candidateId, officeCandidateIds!));
        const mgrApps = await db.select().from(applications).where(and(...mgrAppConds));

        // Contract signed: first time entered ANY post-contract stage within date range
        // (hired, myk_training, account_setup, documents, employed) — handles direct skips (e.g. offer → myk_training)
        // Deduplicate by applicationId keeping earliest entry so back-and-forth moves don't inflate the count
        const POST_CONTRACT = ["hired", "myk_training", "account_setup", "documents", "employed"] as const;
        const mgrHiredHistoryConds: any[] = [
          inArray(stageHistory.toStatus, [...POST_CONTRACT]),
          inArray(stageHistory.jobId, assignedJobs),
          gte(stageHistory.enteredAt, start),
          lte(stageHistory.enteredAt, end),
          inArray(applications.status, [...POST_CONTRACT]),
        ];
        if (hasOfficeCandidates) mgrHiredHistoryConds.push(inArray(stageHistory.candidateId, officeCandidateIds!));
        const mgrHiredHistoryRaw = await db
          .select({ applicationId: stageHistory.applicationId, hiredAt: stageHistory.enteredAt })
          .from(stageHistory)
          .innerJoin(applications, eq(applications.id, stageHistory.applicationId))
          .where(and(...mgrHiredHistoryConds));
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
        if (hasOfficeCandidates) mgrIvConds.push(inArray(interviews.candidateId, officeCandidateIds!));
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
        if (hasOfficeCandidates) mgrOfferConds.push(inArray(offers.candidateId, officeCandidateIds!));
        const mgrOfferRows = await db.select({ status: offers.status, count: count() })
          .from(offers).where(and(...mgrOfferConds)).groupBy(offers.status);
        const mgrOfferMap = Object.fromEntries(mgrOfferRows.map((r) => [r.status, r.count]));
        const mgrAcc = mgrOfferMap["accepted"] || 0;
        const mgrDec = mgrAcc + (mgrOfferMap["rejected"] || 0);


        // Avg time to employ per manager: from appliedAt to when they first reached 'documents' stage
        // Deduplicate by applicationId — keep earliest entry to avoid inflating averages from stage bouncing
        const mgrEmpHistConds: any[] = [
          eq(stageHistory.toStatus, "documents"),
          inArray(stageHistory.jobId, assignedJobs),
          gte(stageHistory.enteredAt, start),
          lte(stageHistory.enteredAt, end),
          inArray(applications.status, ["documents", "employed"]),
        ];
        if (hasOfficeCandidates) mgrEmpHistConds.push(inArray(stageHistory.candidateId, officeCandidateIds!));
        const mgrEmployedHistoryRaw = await db
          .select({ applicationId: stageHistory.applicationId, employedAt: stageHistory.enteredAt })
          .from(stageHistory)
          .innerJoin(applications, eq(applications.id, stageHistory.applicationId))
          .where(and(...mgrEmpHistConds));
        const mgrEmployedMap = new Map<number, { applicationId: number; employedAt: string | null }>();
        for (const row of mgrEmployedHistoryRaw) {
          const existing = mgrEmployedMap.get(row.applicationId);
          if (!existing || (row.employedAt && existing.employedAt && row.employedAt < existing.employedAt)) {
            mgrEmployedMap.set(row.applicationId, row);
          }
        }
        const mgrEmployedHistoryRows = Array.from(mgrEmployedMap.values());
        const employedCount = mgrEmployedHistoryRows.length;
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
    const activeJobRows = (hasOfficeFilter && !hasOfficeCandidates)
      ? []
      : hasJobScope
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
        if (hasOfficeCandidates) appConds.push(inArray(applications.candidateId, officeCandidateIds!));
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
    if (hasOfficeCandidates) rejConds.push(inArray(stageHistory.candidateId, officeCandidateIds!));

    const rejAllRows = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
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
    const passiveCondsArr: any[] = [
      eq(employees.status, "inactive"),
      or(
        isNull(employees.passiveAt),
        and(gte(employees.passiveAt, start), lte(employees.passiveAt, end))
      ),
    ];
    if (hasOfficeCandidates) passiveCondsArr.push(inArray(employees.candidateId, officeCandidateIds!));

    const passiveRaw = hasOfficeFilter && !hasOfficeCandidates
      ? []
      : await db
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
          .where(and(...passiveCondsArr))
          .orderBy(desc(employees.passiveAt));

    const passiveEmployees: PassiveEmployee[] = passiveRaw.map((r) => ({
      id: r.id,
      name: r.candidateName ?? "—",
      passiveAt: r.passiveAt,
      title: r.title,
      jobTitle: r.jobTitle ?? null,
    }));

    // ── New employees who started in the selected period ──
    const newCondsArr: any[] = [
      isNotNull(employees.startDate),
      gte(employees.startDate, start),
      lte(employees.startDate, end),
    ];
    if (hasOfficeCandidates) newCondsArr.push(inArray(employees.candidateId, officeCandidateIds!));

    const newRaw = hasOfficeFilter && !hasOfficeCandidates
      ? []
      : await db
          .select({
            id: employees.id,
            title: employees.title,
            startDate: employees.startDate,
            kwuid: employees.kwuid,
            contractType: employees.contractType,
            candidateName: candidates.name,
            category: candidates.category,
            city: candidates.city,
            jobTitle: jobs.title,
          })
          .from(employees)
          .leftJoin(candidates, eq(employees.candidateId, candidates.id))
          .leftJoin(jobs, eq(employees.jobId, jobs.id))
          .where(and(...newCondsArr))
          .orderBy(asc(employees.startDate));

    const newEmployees: NewEmployee[] = newRaw.map((r) => ({
      id: r.id,
      name: r.candidateName ?? "—",
      startDate: r.startDate,
      title: r.title,
      kwuid: r.kwuid ?? null,
      contractType: r.contractType ?? null,
      category: r.category ?? null,
      city: r.city ?? null,
      jobTitle: r.jobTitle ?? null,
    }));

    // ── New contract signers: first time reaching 'hired' stage in the period ──
    const contractConds: any[] = [
      eq(stageHistory.toStatus, "hired"),
      gte(stageHistory.enteredAt, start),
      lte(stageHistory.enteredAt, end),
    ];
    if (hasJobScope) contractConds.push(inArray(stageHistory.jobId, jobIds!));
    if (hasOfficeCandidates) contractConds.push(inArray(stageHistory.candidateId, officeCandidateIds!));

    const contractRaw = (scoped && !hasJobScope) || (hasOfficeFilter && !hasOfficeCandidates)
      ? []
      : await db
          .select({
            applicationId: stageHistory.applicationId,
            signedAt: stageHistory.enteredAt,
            candidateName: candidates.name,
            category: candidates.category,
            city: candidates.city,
            jobTitle: jobs.title,
          })
          .from(stageHistory)
          .innerJoin(candidates, eq(stageHistory.candidateId, candidates.id))
          .leftJoin(jobs, eq(stageHistory.jobId, jobs.id))
          .where(and(...contractConds))
          .orderBy(asc(stageHistory.enteredAt));

    // Deduplicate by applicationId — keep earliest entry
    const contractMap = new Map<number, typeof contractRaw[number]>();
    for (const row of contractRaw) {
      const existing = contractMap.get(row.applicationId);
      if (!existing || (row.signedAt && existing.signedAt && row.signedAt < existing.signedAt)) {
        contractMap.set(row.applicationId, row);
      }
    }

    const newContractSigners: NewContractSigner[] = Array.from(contractMap.values()).map((r) => ({
      applicationId: r.applicationId,
      candidateName: r.candidateName ?? "—",
      jobTitle: r.jobTitle ?? null,
      category: r.category ?? null,
      city: r.city ?? null,
      signedAt: r.signedAt,
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
      newEmployees,
      newEmployeeCount: newEmployees.length,
      newContractSigners,
      newContractSignerCount: newContractSigners.length,
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
  }): Promise<User | null> {
    const existing = await this.getUserByGoogleId(data.googleId);
    if (existing) return existing;

    // Link googleId to an existing account that shares the same email
    const byEmail = await this.getUserByEmailFull(data.email);
    if (byEmail) {
      const [updated] = await db
        .update(users)
        .set({ googleId: data.googleId })
        .where(eq(users.id, byEmail.id))
        .returning();
      return updated;
    }

    // No matching account — do not auto-create
    return null;
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
    if (data.status === "inactive" && !data.passiveAt) {
      update.passiveAt = new Date();
    }
    const [emp] = await db.update(employees).set(update).where(eq(employees.id, id)).returning();
    return emp;
  }

  async updateStageHistoryDate(id: number, enteredAt: Date): Promise<{ id: number; enteredAt: Date | null } | undefined> {
    const [row] = await db
      .update(stageHistory)
      .set({ enteredAt })
      .where(eq(stageHistory.id, id))
      .returning({ id: stageHistory.id, enteredAt: stageHistory.enteredAt });
    return row;
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

  async updateEmployeeCapAdjustment(id: number, amount: string): Promise<void> {
    await db.update(employees).set({ capManualAdjustment: amount } as any).where(eq(employees.id, id));
  }

  async getCapSettings(): Promise<CapSetting[]> {
    return db.select().from(capSettings).orderBy(capSettings.year);
  }

  async upsertCapSetting(year: number, amount: string): Promise<CapSetting> {
    const existing = await db.select().from(capSettings).where(eq(capSettings.year, year));
    if (existing.length > 0) {
      const [updated] = await db.update(capSettings).set({ amount }).where(eq(capSettings.year, year)).returning();
      return updated;
    }
    const [created] = await db.insert(capSettings).values({ year, amount }).returning();
    return created;
  }

  async deleteCapSetting(id: number): Promise<void> {
    await db.delete(capSettings).where(eq(capSettings.id, id));
  }

  async getEmployeeCapStatus(employeeId: number): Promise<CapStatus | null> {
    const emp = await this.getEmployee(employeeId);
    if (!emp || !emp.capMonth) return null;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based

    // Turkish month name → number mapping
    const TR_MONTHS: Record<string, number> = {
      "Ocak": 1, "Şubat": 2, "Mart": 3, "Nisan": 4, "Mayıs": 5, "Haziran": 6,
      "Temmuz": 7, "Ağustos": 8, "Eylül": 9, "Ekim": 10, "Kasım": 11, "Aralık": 12,
    };

    // Parse capMonth: supports "YYYY-MM", "MM", single number, or Turkish month name
    let capMonthNum: number;
    const trimmed = emp.capMonth.trim();
    if (TR_MONTHS[trimmed]) {
      capMonthNum = TR_MONTHS[trimmed];
    } else {
      const parts = trimmed.split("-");
      capMonthNum = parseInt(parts[1] ?? parts[0], 10);
    }

    if (isNaN(capMonthNum) || capMonthNum < 1 || capMonthNum > 12) return null;

    let capYear: number;
    if (currentMonth >= capMonthNum) {
      capYear = currentYear;
    } else {
      capYear = currentYear - 1;
    }

    const periodStart = new Date(capYear, capMonthNum - 1, 1);

    // Per-employee capValue takes precedence; fall back to global cap setting for the year
    const empCapValue = emp.capValue ? parseFloat(emp.capValue) : null;
    let capAmount: number | null = empCapValue && empCapValue > 0 ? empCapValue : null;
    if (capAmount === null) {
      const [capRow] = await db.select().from(capSettings).where(eq(capSettings.year, capYear));
      capAmount = capRow ? parseFloat(capRow.amount) : null;
    }

    // Effective date: agent-level overrides closing-level when present.
    // NOTE: cap deliberately counts ALL closings (including expected/pending) — payment
    // collection status is tracked separately; the agent's BM payı çıkar çıkmaz cap'a sayılır.
    const effDateCap   = sql<Date>`COALESCE(${closingAgents.closingDate}, ${closings.closingDate})`;

    // Sum marketCenterActual from ALL closingAgents for this employee in current period
    const agentRows = await db
      .select({ marketCenterActual: closingAgents.marketCenterActual })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .innerJoin(closings, eq(closingSides.closingId, closings.id))
      .where(
        and(
          eq(closingAgents.employeeId, employeeId),
          sql`${effDateCap} IS NOT NULL`,
          sql`${effDateCap} >= ${periodStart}`,
        )
      );

    const capUsedFromClosings = agentRows.reduce((sum, r) => sum + parseFloat(r.marketCenterActual ?? "0"), 0);
    const manualAdj = parseFloat((emp as any).capManualAdjustment ?? "0");

    // BM Payı Ön Ödemesi (logged as office income) — counts toward cap by payment date
    const periodStartYMD = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}-01`;
    const prepayRows = await db
      .select({ amount: officeExpenses.amount })
      .from(officeExpenses)
      .where(
        and(
          eq(officeExpenses.type, "income"),
          eq(officeExpenses.category, BM_PREPAYMENT_CATEGORY),
          eq(officeExpenses.employeeId, employeeId),
          gte(officeExpenses.date, periodStartYMD),
        )
      );
    const prepayments = prepayRows.reduce((sum, r) => sum + parseFloat(r.amount ?? "0"), 0);

    const capUsed = capUsedFromClosings + manualAdj + prepayments;
    const capRemaining: number | null = capAmount === null ? null : Math.max(0, capAmount - capUsed);

    // Previous 12-month period (needed to evaluate current-month resets)
    const prevPeriodStart = new Date(capYear - 1, capMonthNum - 1, 1);
    const prevRows = await db
      .select({ marketCenterActual: closingAgents.marketCenterActual })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .innerJoin(closings, eq(closingSides.closingId, closings.id))
      .where(
        and(
          eq(closingAgents.employeeId, employeeId),
          sql`${effDateCap} IS NOT NULL`,
          sql`${effDateCap} >= ${prevPeriodStart}`,
          sql`${effDateCap} < ${periodStart}`,
        )
      );
    const prevCapUsed = prevRows.reduce((sum, r) => sum + parseFloat(r.marketCenterActual ?? "0"), 0);

    return { employeeId, capAmount, capUsed, capRemaining, periodStart, capYear, prevCapUsed };
  }

  async getAllEmployeesCapStatus(): Promise<Record<number, CapStatus & { name: string; kwuid: string }>> {
    const allEmployees = await this.getEmployees();
    const active = allEmployees.filter((e) => e.status === "active");
    const results = await Promise.all(active.map((e) => this.getEmployeeCapStatus(e.id)));
    const record: Record<number, CapStatus & { name: string; kwuid: string }> = {};
    for (let i = 0; i < active.length; i++) {
      const status = results[i];
      if (status) {
        const emp = active[i] as any;
        record[active[i].id] = {
          ...status,
          name: emp.candidate?.name ?? `#${active[i].id}`,
          kwuid: emp.kwuid ?? "",
        };
      }
    }
    return record;
  }

  private async buildClosingWithDetails(closing: Closing): Promise<ClosingWithDetails> {
    const sides = await db.select().from(closingSides).where(eq(closingSides.closingId, closing.id));
    const sidesWithAgents = await Promise.all(
      sides.map(async (side) => {
        const agents = await db
          .select({ agent: closingAgents, candidate: candidates, emp: employees })
          .from(closingAgents)
          .leftJoin(employees, eq(closingAgents.employeeId, employees.id))
          .leftJoin(candidates, eq(employees.candidateId, candidates.id))
          .where(eq(closingAgents.closingSideId, side.id));
        return {
          ...side,
          agents: agents.map((r) => ({
            ...r.agent,
            employeeName: r.candidate?.name ?? undefined,
            candidateName: r.candidate?.name ?? undefined,
            kwuid: r.emp?.kwuid ?? undefined,
          })),
        };
      })
    );

    const totalAgentNet = sidesWithAgents.reduce((sum, side) =>
      sum + side.agents.reduce((s, a) => s + parseFloat(a.employeeNet ?? "0"), 0), 0
    );

    return { ...closing, sides: sidesWithAgents, totalAgentNet };
  }

  async getClosings(): Promise<ClosingWithDetails[]> {
    const rows = await db
      .select({
        closing: closings,
        side: closingSides,
        agent: closingAgents,
        candidate: candidates,
        emp: employees,
      })
      .from(closings)
      .leftJoin(closingSides, eq(closingSides.closingId, closings.id))
      .leftJoin(closingAgents, eq(closingAgents.closingSideId, closingSides.id))
      .leftJoin(employees, eq(employees.id, closingAgents.employeeId))
      .leftJoin(candidates, eq(candidates.id, employees.candidateId))
      .orderBy(desc(closings.closingDate));

    const closingMap = new Map<number, ClosingWithDetails>();
    const sideMap = new Map<number, any>();

    for (const r of rows) {
      if (!closingMap.has(r.closing.id)) {
        closingMap.set(r.closing.id, { ...r.closing, sides: [], totalAgentNet: 0 });
      }
      if (!r.side) continue;
      const c = closingMap.get(r.closing.id)!;
      if (!sideMap.has(r.side.id)) {
        const side = { ...r.side, agents: [] as any[] };
        sideMap.set(r.side.id, side);
        c.sides.push(side);
      }
      if (!r.agent) continue;
      const side = sideMap.get(r.side.id)!;
      side.agents.push({
        ...r.agent,
        employeeName: r.candidate?.name ?? undefined,
        candidateName: r.candidate?.name ?? undefined,
        kwuid: r.emp?.kwuid ?? undefined,
      });
    }

    for (const c of closingMap.values()) {
      c.totalAgentNet = c.sides.reduce((sum: number, s: any) =>
        sum + s.agents.reduce((a: number, ag: any) => a + parseFloat(ag.employeeNet ?? "0"), 0), 0);
    }

    return Array.from(closingMap.values());
  }

  async getClosing(id: number): Promise<ClosingWithDetails | null> {
    const [closing] = await db.select().from(closings).where(eq(closings.id, id));
    if (!closing) return null;
    return this.buildClosingWithDetails(closing);
  }

  async getClosingsByEmployee(employeeId: number): Promise<EmployeeClosingRow[]> {
    const effDate   = sql<Date>`COALESCE(${closingAgents.closingDate}, ${closings.closingDate})`;
    const effStatus = sql<string>`COALESCE(${closingAgents.status}, ${closings.status})`;
    const rows = await db
      .select({
        closingId: closings.id,
        propertyAddress: closings.propertyAddress,
        dealCategory: closings.dealCategory,
        dealType: closings.dealType,
        saleValue: closings.saleValue,
        employeeNet: closingAgents.employeeNet,
        closingDate: effDate,
        sideType: closingSides.sideType,
        status: effStatus,
      })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .innerJoin(closings, eq(closingSides.closingId, closings.id))
      .where(eq(closingAgents.employeeId, employeeId))
      .orderBy(sql`${effDate} DESC NULLS LAST`);
    return rows;
  }

  async getChurnReport(): Promise<ChurnRow[]> {
    const now = new Date();
    const cut3m = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const cut6m = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Fetch all active employees + all their completed closings in one query.
    // Agent-level closingDate/status override closing-level when set.
    const effDate   = sql<Date>`COALESCE(${closingAgents.closingDate}, ${closings.closingDate})`;
    const effStatus = sql<string>`COALESCE(${closingAgents.status}, ${closings.status})`;
    const rows = await db
      .select({
        empId: employees.id,
        name: candidates.name,
        kwuid: employees.kwuid,
        category: candidates.category,
        startDate: employees.startDate,
        closingDate: effDate,
      })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .leftJoin(closingAgents, eq(closingAgents.employeeId, employees.id))
      .leftJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .leftJoin(closings, and(
        eq(closingSides.closingId, closings.id),
        sql`${effStatus} = 'completed'`,
      ))
      .where(eq(employees.status, "active"))
      .orderBy(asc(employees.id));

    // Group by employee
    const empMap = new Map<number, {
      name: string; kwuid: string | null; category: string | null;
      startDate: Date | null; closingDates: Date[];
    }>();

    for (const r of rows) {
      if (!empMap.has(r.empId)) {
        empMap.set(r.empId, {
          name: r.name ?? "—", kwuid: r.kwuid ?? null,
          category: r.category ?? null, startDate: r.startDate,
          closingDates: [],
        });
      }
      if (r.closingDate) empMap.get(r.empId)!.closingDates.push(new Date(r.closingDate));
    }

    const result: ChurnRow[] = [];

    for (const [empId, emp] of empMap) {
      const tenureMs = emp.startDate ? now.getTime() - new Date(emp.startDate).getTime() : 0;
      const tenureMonths = Math.floor(tenureMs / (1000 * 60 * 60 * 24 * 30));

      const sorted = emp.closingDates.sort((a, b) => b.getTime() - a.getTime());
      const lastClosingDate = sorted[0] ?? null;
      const daysSinceLast = lastClosingDate ? differenceInDays(now, lastClosingDate) : null;

      const closings3m = sorted.filter(d => d >= cut3m).length;
      const closingsPrev3m = sorted.filter(d => d >= cut6m && d < cut3m).length;

      const trend: "up" | "flat" | "down" =
        closings3m > closingsPrev3m ? "up" :
        closings3m < closingsPrev3m ? "down" : "flat";

      // Scoring
      let score = 0;

      // Days since last closing
      const effectiveDays = daysSinceLast ?? (tenureMonths * 30);
      if (effectiveDays > 180) score += 40;
      else if (effectiveDays > 90) score += 25;
      else if (effectiveDays > 60) score += 10;

      // Recent production
      if (closings3m === 0) score += 30;
      else if (closings3m === 1) score += 10;

      // Trend
      if (trend === "down") score += 15;
      else if (trend === "up") score -= 10;

      // Tenure — new agents are expected to have low production
      if (tenureMonths < 6) score += 5;
      else if (tenureMonths >= 6 && closings3m === 0) score += 5; // no excuse for established agents

      // Category
      if (emp.category === "K0") score += 10;

      score = Math.max(0, score);

      const risk: "high" | "medium" | "low" =
        score >= 60 ? "high" : score >= 30 ? "medium" : "low";

      result.push({
        employeeId: empId,
        name: emp.name,
        kwuid: emp.kwuid,
        category: emp.category,
        tenureMonths,
        lastClosingDate: lastClosingDate ? lastClosingDate.toISOString() : null,
        daysSinceLast,
        closings3m,
        closingsPrev3m,
        trend,
        score,
        risk,
      });
    }

    return result.sort((a, b) => b.score - a.score);
  }

  async updateClosing(id: number, data: Partial<{
    propertyAddress: string; il: string | null; ilce: string | null;
    dealCategory: string; dealType: string; saleValue: string;
    commissionRate: string; closingDate: Date | null; status: string;
    buyerName: string | null; sellerName: string | null; notes: string | null;
  }>): Promise<void> {
    if (Object.keys(data).length === 0) return;
    await db.update(closings).set(data as any).where(eq(closings.id, id));
  }

  async updateClosingAgent(id: number, data: Partial<{
    splitPercentage: string; bhbShare: string; mainBranchShare: string;
    kwtrKdv: string; marketCenterActual: string; bmKdv: string;
    ukShare: string; employeeNet: string; kasa: string; nakit: string; banka: string;
    closingDate: Date | null; status: string | null; paymentCollected: boolean;
  }>): Promise<void> {
    if (Object.keys(data).length === 0) return;
    await db.update(closingAgents).set(data as any).where(eq(closingAgents.id, id));
  }

  async updateClosingSide(id: number, data: Partial<{ kasa: string; nakit: string; banka: string }>): Promise<void> {
    if (Object.keys(data).length === 0) return;
    await db.update(closingSides).set(data as any).where(eq(closingSides.id, id));
  }

  async getClosingIdForAgent(agentId: number): Promise<number | null> {
    const [row] = await db
      .select({ closingId: closingSides.closingId })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .where(eq(closingAgents.id, agentId))
      .limit(1);
    return row?.closingId ?? null;
  }

  async createClosing(data: {
    propertyAddress: string;
    il?: string | null;
    ilce?: string | null;
    mahalle?: string | null;
    propertyDetails?: string | null;
    dealCategory?: string | null;
    dealType: string;
    saleValue: string;
    commissionRate?: string | null;
    openingPrice?: string | null;
    durationDays?: number | null;
    customerSource?: string | null;
    referralInfo?: string | null;
    contractStartDate?: Date | null;
    contractEndDate?: Date | null;
    closingDate?: Date | null;
    status?: string;
    buyerName?: string | null;
    sellerName?: string | null;
    notes?: string | null;
    createdByUserId?: number | null;
    disableCap?: boolean; // true during CSV import — skips cap restriction in fallback calculation
    sides: Array<{
      sideType: string;
      agents: Array<{
        employeeId: number;
        splitPercentage: string;
        bhbShare?: string;
        mainBranchShare?: string;
        kwtrKdv?: string;
        marketCenterActual?: string;
        bmKdv?: string;
        ukShare?: string;
        employeeNet?: string;
        kasa?: string;
        nakit?: string;
        banka?: string;
        closingDate?: Date | null;
        status?: string | null;
        paymentCollected?: boolean;
      }>;
    }>;
  }): Promise<Closing> {
    const saleValue = parseFloat(data.saleValue);
    const commissionRate = parseFloat(data.commissionRate ?? "2") / 100; // e.g. "2.00" → 0.02

    // Pre-calculate cap statuses for all involved employees
    const allEmployeeIds = Array.from(new Set(data.sides.flatMap((s) => s.agents.map((a) => a.employeeId))));
    const capStatusMap: Record<number, CapStatus | null> = {};
    // Skip cap lookups during import — disableCap means cap values are never used
    if (!data.disableCap) {
      await Promise.all(allEmployeeIds.map(async (empId) => {
        capStatusMap[empId] = await this.getEmployeeCapStatus(empId);
      }));
    }

    // Fetch all employee records in parallel
    const empMap: Record<number, EmployeeWithRelations> = {};
    await Promise.all(allEmployeeIds.map(async (empId) => {
      const emp = await this.getEmployee(empId);
      if (emp) empMap[empId] = emp;
    }));

    // runningCap tracks how much cap has been used within this closing (buyer processed before seller)
    const runningCapUsed: Record<number, number> = {};
    for (const empId of allEmployeeIds) {
      runningCapUsed[empId] = capStatusMap[empId]?.capUsed ?? 0;
    }

    return db.transaction(async (tx) => {
      const [closing] = await tx.insert(closings).values({
        propertyAddress: data.propertyAddress,
        il: data.il ?? null,
        ilce: data.ilce ?? null,
        mahalle: data.mahalle ?? null,
        propertyDetails: data.propertyDetails ?? null,
        dealCategory: data.dealCategory ?? "Satış",
        dealType: data.dealType,
        saleValue: data.saleValue,
        commissionRate: data.commissionRate ?? "2.00",
        openingPrice: data.openingPrice ?? null,
        durationDays: data.durationDays ?? null,
        customerSource: data.customerSource ?? null,
        referralInfo: data.referralInfo ?? null,
        contractStartDate: data.contractStartDate ?? null,
        contractEndDate: data.contractEndDate ?? null,
        closingDate: data.closingDate ?? null,
        status: data.status ?? (data.closingDate ? "completed" : "expected"),
        buyerName: data.buyerName ?? null,
        sellerName: data.sellerName ?? null,
        notes: data.notes ?? null,
        createdByUserId: data.createdByUserId ?? null,
      }).returning();

      // Process buyer side before seller side
      const sortedSides = [...data.sides].sort((a, b) => {
        if (a.sideType === "buyer") return -1;
        if (b.sideType === "buyer") return 1;
        return 0;
      });

      for (const side of sortedSides) {
        // BHB = commissionRate% of saleValue per side
        const sideBHB = saleValue * commissionRate;

        const [closingSide] = await tx.insert(closingSides).values({
          closingId: closing.id,
          sideType: side.sideType,
          bhbTotal: String(sideBHB),
        }).returning();

        for (const agentInput of side.agents) {
          const emp = empMap[agentInput.employeeId];
          if (!emp) continue;

          const splitPct = parseFloat(agentInput.splitPercentage);
          const contractType = emp.contractType ?? "70/30";
          const capStatus = capStatusMap[agentInput.employeeId];
          const capAmount = capStatus?.capAmount ?? null;
          const capUsedSoFar = runningCapUsed[agentInput.employeeId] ?? 0;

          let bhbShare: number;
          let mainBranchShare: number;
          let kwtrKdv: number;
          let marketCenterDue: number;
          let marketCenterActual: number;
          let bmKdv: number;
          let ukShare: number;
          let ukRateSnapshot = 0;
          let employeeNet: number;

          const bmRate = contractType === "50/50" ? null : 0.30; // null = use 50/50 formula

          if (agentInput.bhbShare !== undefined) {
            // Use frontend pre-calculated (possibly manually edited) values
            bhbShare = parseFloat(agentInput.bhbShare);
            mainBranchShare = parseFloat(agentInput.mainBranchShare ?? "0");
            kwtrKdv = parseFloat(agentInput.kwtrKdv ?? "0");
            marketCenterDue = bmRate === null
              ? (bhbShare * 0.5 - mainBranchShare) - (bhbShare * 0.1)
              : (bhbShare - mainBranchShare) * bmRate;
            // If marketCenterActual not provided (missing CSV column), derive it without cap
            marketCenterActual = agentInput.marketCenterActual !== undefined
              ? parseFloat(agentInput.marketCenterActual)
              : (data.disableCap
                ? marketCenterDue
                : (capAmount === null ? marketCenterDue : Math.min(marketCenterDue, Math.max(0, capAmount - capUsedSoFar))));
            bmKdv = parseFloat(agentInput.bmKdv ?? "0");
            ukShare = parseFloat(agentInput.ukShare ?? "0");
            employeeNet = parseFloat(agentInput.employeeNet ?? "0");
            if (emp.uretkenlikKoclugu && emp.uretkenlikKocluguOran) {
              ukRateSnapshot = parseInt(emp.uretkenlikKocluguOran.replace(/[^0-9]/g, "")) || 5;
            }
          } else {
            // Fallback: calculate on the server (legacy path)
            bhbShare = sideBHB * (splitPct / 100);
            mainBranchShare = bhbShare * 0.10;
            kwtrKdv = mainBranchShare * 1.20;  // KWTR + %20 KDV toplamı
            marketCenterDue = bmRate === null
              ? (bhbShare * 0.5 - mainBranchShare) - (bhbShare * 0.1)
              : (bhbShare - mainBranchShare) * bmRate;
            // Skip cap restriction when importing historical data (disableCap = true)
            marketCenterActual = (data.disableCap || capAmount === null)
              ? marketCenterDue
              : Math.min(marketCenterDue, Math.max(0, capAmount - capUsedSoFar));
            bmKdv = bhbShare * 0.004; // BHB × %2 × %20
            ukShare = 0;
            if (emp.uretkenlikKoclugu && emp.uretkenlikKocluguOran) {
              ukRateSnapshot = parseInt(emp.uretkenlikKocluguOran.replace(/[^0-9]/g, "")) || 5;
              ukShare = bhbShare * (ukRateSnapshot / 100);
            }
            employeeNet = bhbShare - kwtrKdv - marketCenterActual - bmKdv - ukShare;
          }

          // Update running cap regardless of which path was taken
          runningCapUsed[agentInput.employeeId] = capUsedSoFar + marketCenterActual;

          await tx.insert(closingAgents).values({
            closingSideId: closingSide.id,
            employeeId: agentInput.employeeId,
            splitPercentage: agentInput.splitPercentage,
            bhbShare: String(bhbShare),
            mainBranchShare: String(mainBranchShare),
            kwtrKdv: String(kwtrKdv),
            marketCenterDue: String(marketCenterDue ?? 0),
            marketCenterActual: String(marketCenterActual),
            bmKdv: String(bmKdv),
            ukShare: String(ukShare),
            employeeNet: String(employeeNet),
            kasa: agentInput.kasa ?? "0",
            nakit: agentInput.nakit ?? "0",
            banka: agentInput.banka ?? "0",
            contractTypeSnapshot: contractType,
            ukRateSnapshot: String(ukRateSnapshot),
            capAmountApplied: capAmount !== null ? String(capAmount) : null,
            capUsedBefore: String(capUsedSoFar),
            closingDate: agentInput.closingDate ?? null,
            status: agentInput.status ?? null,
            paymentCollected: agentInput.paymentCollected ?? false,
          });
        }
      }

      return closing;
    });
  }

  async deleteClosing(id: number): Promise<void> {
    const sides = await db.select().from(closingSides).where(eq(closingSides.closingId, id));
    for (const side of sides) {
      await db.delete(closingAgents).where(eq(closingAgents.closingSideId, side.id));
    }
    await db.delete(closingSides).where(eq(closingSides.closingId, id));
    await db.delete(closings).where(eq(closings.id, id));
  }

  async replaceClosingSides(closingId: number, saleValue: string, commissionRate: string, sides: Array<{
    sideType: string;
    agents: Array<{
      employeeId: number;
      splitPercentage: string;
      bhbShare?: string;
      mainBranchShare?: string;
      kwtrKdv?: string;
      marketCenterActual?: string;
      bmKdv?: string;
      ukShare?: string;
      employeeNet?: string;
      kasa?: string;
      nakit?: string;
      banka?: string;
      closingDate?: Date | null;
      status?: string | null;
      paymentCollected?: boolean;
    }>;
  }>): Promise<void> {
    const saleValueNum = parseFloat(saleValue);
    const commissionRateNum = parseFloat(commissionRate ?? "2") / 100;

    const allEmployeeIds = Array.from(new Set(sides.flatMap((s) => s.agents.map((a) => a.employeeId))));
    const capStatusMap: Record<number, CapStatus | null> = {};
    for (const empId of allEmployeeIds) {
      capStatusMap[empId] = await this.getEmployeeCapStatus(empId);
    }
    const empMap: Record<number, EmployeeWithRelations> = {};
    for (const empId of allEmployeeIds) {
      const emp = await this.getEmployee(empId);
      if (emp) empMap[empId] = emp;
    }
    const runningCapUsed: Record<number, number> = {};
    for (const empId of allEmployeeIds) {
      runningCapUsed[empId] = capStatusMap[empId]?.capUsed ?? 0;
    }

    await db.transaction(async (tx) => {
      const existingSides = await tx.select().from(closingSides).where(eq(closingSides.closingId, closingId));
      for (const side of existingSides) {
        await tx.delete(closingAgents).where(eq(closingAgents.closingSideId, side.id));
      }
      await tx.delete(closingSides).where(eq(closingSides.closingId, closingId));

      const sortedSides = [...sides].sort((a, b) => {
        if (a.sideType === "buyer") return -1;
        if (b.sideType === "buyer") return 1;
        return 0;
      });

      for (const side of sortedSides) {
        const sideBHB = saleValueNum * commissionRateNum;
        const [closingSide] = await tx.insert(closingSides).values({
          closingId,
          sideType: side.sideType,
          bhbTotal: String(sideBHB),
        }).returning();

        for (const agentInput of side.agents) {
          const emp = empMap[agentInput.employeeId];
          if (!emp) continue;

          const splitPct = parseFloat(agentInput.splitPercentage);
          const contractType = emp.contractType ?? "70/30";
          const capStatus = capStatusMap[agentInput.employeeId];
          const capAmount = capStatus?.capAmount ?? null;
          const capUsedSoFar = runningCapUsed[agentInput.employeeId] ?? 0;

          let bhbShare: number, mainBranchShare: number, kwtrKdv: number;
          let marketCenterDue: number, marketCenterActual: number, bmKdv: number;
          let ukShare: number, ukRateSnapshot = 0, employeeNet: number;

          const bmRate2 = contractType === "50/50" ? null : 0.30;

          if (agentInput.bhbShare !== undefined) {
            bhbShare = parseFloat(agentInput.bhbShare);
            mainBranchShare = parseFloat(agentInput.mainBranchShare ?? "0");
            kwtrKdv = parseFloat(agentInput.kwtrKdv ?? "0");
            marketCenterDue = bmRate2 === null
              ? (bhbShare * 0.5 - mainBranchShare) - (bhbShare * 0.1)
              : (bhbShare - mainBranchShare) * bmRate2;
            marketCenterActual = parseFloat(agentInput.marketCenterActual ?? "0");
            bmKdv = parseFloat(agentInput.bmKdv ?? "0");
            ukShare = parseFloat(agentInput.ukShare ?? "0");
            employeeNet = parseFloat(agentInput.employeeNet ?? "0");
            if (emp.uretkenlikKoclugu && emp.uretkenlikKocluguOran) {
              ukRateSnapshot = parseInt(emp.uretkenlikKocluguOran.replace(/[^0-9]/g, "")) || 5;
            }
          } else {
            bhbShare = sideBHB * (splitPct / 100);
            mainBranchShare = bhbShare * 0.10;
            kwtrKdv = mainBranchShare * 1.20;
            marketCenterDue = bmRate2 === null
              ? (bhbShare * 0.5 - mainBranchShare) - (bhbShare * 0.1)
              : (bhbShare - mainBranchShare) * bmRate2;
            marketCenterActual = capAmount === null
              ? marketCenterDue
              : Math.min(marketCenterDue, Math.max(0, capAmount - capUsedSoFar));
            bmKdv = bhbShare * 0.004; // BHB × %2 × %20
            ukShare = 0;
            if (emp.uretkenlikKoclugu && emp.uretkenlikKocluguOran) {
              ukRateSnapshot = parseInt(emp.uretkenlikKocluguOran.replace(/[^0-9]/g, "")) || 5;
              ukShare = bhbShare * (ukRateSnapshot / 100);
            }
            employeeNet = bhbShare - kwtrKdv - marketCenterActual - bmKdv - ukShare;
          }

          runningCapUsed[agentInput.employeeId] = capUsedSoFar + marketCenterActual;

          await tx.insert(closingAgents).values({
            closingSideId: closingSide.id,
            employeeId: agentInput.employeeId,
            splitPercentage: agentInput.splitPercentage,
            bhbShare: String(bhbShare),
            mainBranchShare: String(mainBranchShare),
            kwtrKdv: String(kwtrKdv),
            marketCenterDue: String(marketCenterDue ?? 0),
            marketCenterActual: String(marketCenterActual),
            bmKdv: String(bmKdv),
            ukShare: String(ukShare),
            employeeNet: String(employeeNet),
            kasa: agentInput.kasa ?? "0",
            nakit: agentInput.nakit ?? "0",
            banka: agentInput.banka ?? "0",
            contractTypeSnapshot: contractType,
            ukRateSnapshot: String(ukRateSnapshot),
            capAmountApplied: capAmount !== null ? String(capAmount) : null,
            capUsedBefore: String(capUsedSoFar),
            closingDate: agentInput.closingDate ?? null,
            status: agentInput.status ?? null,
            paymentCollected: agentInput.paymentCollected ?? false,
          });
        }
      }
    });
  }

  async getInterviewTargets(year: number, month: number, jobIds?: number[]): Promise<InterviewTarget[]> {
    let query = db.select().from(interviewTargets)
      .where(and(eq(interviewTargets.year, year), eq(interviewTargets.month, month)));
    if (jobIds && jobIds.length > 0) {
      query = db.select().from(interviewTargets)
        .where(and(
          eq(interviewTargets.year, year),
          eq(interviewTargets.month, month),
          inArray(interviewTargets.jobId, jobIds),
        ));
    }
    return query;
  }

  async getClosingStats(startDate: Date, endDate: Date, office?: string, dealType?: string, dealCategory?: string) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // ── Pre-compute office employee IDs (same pattern as getReportStats) ──
    let officeEmpIds: number[] | null = null;
    if (office) {
      const rows = await db
        .select({ id: employees.id })
        .from(employees)
        .innerJoin(candidates, eq(employees.candidateId, candidates.id))
        .where(eq(candidates.office, office));
      officeEmpIds = rows.map(r => r.id);
    }
    const hasOfficeFilter = officeEmpIds !== null;
    const hasOfficeData   = hasOfficeFilter && officeEmpIds!.length > 0;

    const completedAgentCond = hasOfficeFilter
      ? (hasOfficeData ? inArray(closingAgents.employeeId, officeEmpIds!) : sql`1=0`)
      : undefined;
    const expectedAgentCond = completedAgentCond;

    // Per-agent date/status take precedence; closing-level used as fallback.
    const effectiveStatus = sql<string>`COALESCE(${closingAgents.status}, ${closings.status})`;
    const effectiveDate   = sql<Date>`COALESCE(${closingAgents.closingDate}, ${closings.closingDate})`;

    const completedRows = await db
      .select({
        closingId: closings.id,
        saleValue: closings.saleValue,
        commissionRate: closings.commissionRate,
        dealCategory: closings.dealCategory,
        dealType: closings.dealType,
        il: closings.il,
        ilce: closings.ilce,
        mahalle: closings.mahalle,
        closingDate: effectiveDate,
        durationDays: closings.durationDays,
        sideId: closingSides.id,
        sideType: closingSides.sideType,
        bhbShare: closingAgents.bhbShare,
        marketCenterActual: closingAgents.marketCenterActual,
        employeeNet: closingAgents.employeeNet,
        employeeId: closingAgents.employeeId,
      })
      .from(closings)
      .leftJoin(closingSides, eq(closingSides.closingId, closings.id))
      .leftJoin(closingAgents, eq(closingAgents.closingSideId, closingSides.id))
      .where(and(
        sql`${effectiveStatus} = 'completed'`,
        sql`${effectiveDate} IS NOT NULL`,
        sql`${effectiveDate} >= ${startDate}`,
        sql`${effectiveDate} <= ${end}`,
        ...(completedAgentCond ? [completedAgentCond] : []),
        ...(dealCategory ? [eq(closings.dealCategory, dealCategory)] : []),
        ...(dealType ? [eq(closings.dealType, dealType)] : []),
      ));

    const expectedRows = await db
      .select({ closingId: closings.id, saleValue: closings.saleValue, commissionRate: closings.commissionRate, dealCategory: closings.dealCategory, bhbShare: closingAgents.bhbShare, marketCenterActual: closingAgents.marketCenterActual, employeeId: closingAgents.employeeId })
      .from(closings)
      .leftJoin(closingSides, eq(closingSides.closingId, closings.id))
      .leftJoin(closingAgents, eq(closingAgents.closingSideId, closingSides.id))
      .where(and(
        sql`${effectiveStatus} = 'expected'`,
        ...(expectedAgentCond ? [expectedAgentCond] : []),
      ));

    const empRows = await db
      .select({ id: employees.id, kwuid: employees.kwuid, name: candidates.name })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id));
    const empMap = new Map(empRows.map(e => [e.id, { name: e.name ?? `#${e.id}`, kwuid: e.kwuid ?? "" }]));

    // İşlem adedi (taraf başı): bhbShare / perSideBhb
    // Kiralık: perSideBhb = saleValue / 2 · Diğer: perSideBhb = saleValue × commissionRate / 100
    const islemOrani = (r: { saleValue: string | null; commissionRate?: string | null; dealCategory?: string | null; bhbShare: string | null }) => {
      const sale = parseFloat(r.saleValue ?? "0");
      const rate = parseFloat(r.commissionRate ?? "0");
      const perSide = r.dealCategory === "Kiralık" ? sale / 2 : sale * rate / 100;
      if (perSide <= 0) return 0;
      return parseFloat(r.bhbShare ?? "0") / perSide;
    };

    // ── Completed summary ──
    const cIds = new Set<number>();
    let completedVolume = 0, completedBHB = 0, completedBM = 0, completedIslem = 0;
    let completedSatilikIslem = 0, completedKiralikIslem = 0;
    for (const r of completedRows) {
      if (!cIds.has(r.closingId)) { completedVolume += parseFloat(r.saleValue ?? "0"); cIds.add(r.closingId); }
      if (r.bhbShare) completedBHB += parseFloat(r.bhbShare);
      if (r.marketCenterActual) completedBM += parseFloat(r.marketCenterActual);
      const ratio = islemOrani(r);
      completedIslem += ratio;
      if (r.dealCategory === "Kiralık") completedKiralikIslem += ratio;
      else completedSatilikIslem += ratio;
    }

    // ── Side type counts (işlem adedi) ──
    const bySideType = { buyer: 0, seller: 0, referral: 0 } as Record<string, number>;
    for (const r of completedRows) {
      const k = r.sideType === "buyer" ? "buyer" : r.sideType === "referral" ? "referral" : "seller";
      bySideType[k] = (bySideType[k] ?? 0) + islemOrani(r);
    }
    bySideType.buyer = Math.round(bySideType.buyer);
    bySideType.seller = Math.round(bySideType.seller);
    bySideType.referral = Math.round(bySideType.referral);

    // ── Expected summary ──
    // Volume is closing-level. Skip closings that already counted in the completed bucket
    // (mixed-status closings: ≥1 completed agent + ≥1 expected agent) to avoid double-counting.
    const eIds = new Set<number>();
    let expectedVolume = 0, expectedBHB = 0, expectedBM = 0, expectedIslem = 0;
    for (const r of expectedRows) {
      if (!eIds.has(r.closingId) && !cIds.has(r.closingId)) {
        expectedVolume += parseFloat(r.saleValue ?? "0");
        eIds.add(r.closingId);
      }
      if (r.bhbShare) expectedBHB += parseFloat(r.bhbShare);
      if (r.marketCenterActual) expectedBM += parseFloat(r.marketCenterActual);
      expectedIslem += islemOrani(r);
    }

    // ── Monthly trend ──
    const monthMap = new Map<string, { volume: number; bhb: number; bm: number; count: number; satilikCount: number; kiralikCount: number; ids: Set<number> }>();
    for (const r of completedRows) {
      if (!r.closingDate) continue;
      const d = new Date(r.closingDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(key)) monthMap.set(key, { volume: 0, bhb: 0, bm: 0, count: 0, satilikCount: 0, kiralikCount: 0, ids: new Set() });
      const m = monthMap.get(key)!;
      if (!m.ids.has(r.closingId)) { m.volume += parseFloat(r.saleValue ?? "0"); m.ids.add(r.closingId); }
      const ratio = islemOrani(r);
      m.count += ratio;
      if (r.dealCategory === "Kiralık") m.kiralikCount += ratio;
      else m.satilikCount += ratio;
      if (r.bhbShare) m.bhb += parseFloat(r.bhbShare);
      if (r.marketCenterActual) m.bm += parseFloat(r.marketCenterActual);
    }
    const monthlyTrend = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, volume: v.volume, bhb: v.bhb, bm: v.bm, count: Math.round(v.count), satilikCount: Math.round(v.satilikCount), kiralikCount: Math.round(v.kiralikCount) }));

    // ── By agent ──
    const agentMap = new Map<number, { bhb: number; bm: number; net: number; count: number }>();
    for (const r of completedRows) {
      if (!r.employeeId) continue;
      if (!agentMap.has(r.employeeId)) agentMap.set(r.employeeId, { bhb: 0, bm: 0, net: 0, count: 0 });
      const a = agentMap.get(r.employeeId)!;
      a.count += islemOrani(r);
      if (r.bhbShare) a.bhb += parseFloat(r.bhbShare);
      if (r.marketCenterActual) a.bm += parseFloat(r.marketCenterActual);
      if (r.employeeNet) a.net += parseFloat(r.employeeNet);
    }
    const byAgent = Array.from(agentMap.entries())
      .map(([id, v]) => ({ name: empMap.get(id)?.name ?? `#${id}`, kwuid: empMap.get(id)?.kwuid ?? "", bhb: v.bhb, bm: v.bm, net: v.net, count: Math.round(v.count) }))
      .sort((a, b) => b.bhb - a.bhb);

    // ── By category ──
    const catMap = new Map<string, { count: number; volume: number; bhb: number; ids: Set<number> }>();
    for (const r of completedRows) {
      const cat = r.dealCategory ?? "Satış";
      if (!catMap.has(cat)) catMap.set(cat, { count: 0, volume: 0, bhb: 0, ids: new Set() });
      const c = catMap.get(cat)!;
      if (!c.ids.has(r.closingId)) { c.volume += parseFloat(r.saleValue ?? "0"); c.ids.add(r.closingId); }
      c.count += islemOrani(r);
      if (r.bhbShare) c.bhb += parseFloat(r.bhbShare);
    }
    const byCategory = Array.from(catMap.entries()).map(([category, v]) => ({ category, count: Math.round(v.count), volume: v.volume, bhb: v.bhb }));

    // ── By deal type ──
    const dealTypeMap = new Map<string, { count: number; volume: number; bhb: number; ids: Set<number> }>();
    for (const r of completedRows) {
      const dt = r.dealType ?? "Diğer";
      if (!dealTypeMap.has(dt)) dealTypeMap.set(dt, { count: 0, volume: 0, bhb: 0, ids: new Set() });
      const d = dealTypeMap.get(dt)!;
      if (!d.ids.has(r.closingId)) { d.volume += parseFloat(r.saleValue ?? "0"); d.ids.add(r.closingId); }
      d.count += islemOrani(r);
      if (r.bhbShare) d.bhb += parseFloat(r.bhbShare);
    }
    const byDealType = Array.from(dealTypeMap.entries())
      .map(([dealType, v]) => ({ dealType, count: Math.round(v.count), volume: v.volume, bhb: v.bhb }))
      .sort((a, b) => b.count - a.count);

    // ── By İl / İlçe / Mahalle ──
    const geoGroup = (field: string | null | undefined, map: Map<string, { count: number; volume: number; ids: Set<number> }>, r: typeof completedRows[0]) => {
      const key = field || "Belirtilmemiş";
      if (!map.has(key)) map.set(key, { count: 0, volume: 0, ids: new Set() });
      const v = map.get(key)!;
      if (!v.ids.has(r.closingId)) { v.volume += parseFloat(r.saleValue ?? "0"); v.ids.add(r.closingId); }
      v.count += islemOrani(r);
    };
    const ilMap = new Map<string, { count: number; volume: number; ids: Set<number> }>();
    const ilceMap = new Map<string, { count: number; volume: number; ids: Set<number> }>();
    const mahalleMap = new Map<string, { count: number; volume: number; ids: Set<number> }>();
    for (const r of completedRows) {
      geoGroup(r.il, ilMap, r);
      geoGroup(r.ilce, ilceMap, r);
      geoGroup(r.mahalle, mahalleMap, r);
    }
    const toGeoArr = (map: Map<string, { count: number; volume: number; ids: Set<number> }>, keyName: string) =>
      Array.from(map.entries()).map(([k, v]) => ({ [keyName]: k, count: Math.round(v.count), volume: v.volume }))
        .sort((a: any, b: any) => b.volume - a.volume).slice(0, 10);

    const byIl      = toGeoArr(ilMap,      "il");
    const byIlce    = toGeoArr(ilceMap,    "ilce");
    const byMahalle = toGeoArr(mahalleMap, "mahalle");

    // ── Average sale time (only closings with sane durationDays: 1 day to 10 years) ──
    const MAX_REASONABLE_DAYS = 3650;
    const durationById = new Map<number, { days: number; il: string | null; ilce: string | null; mahalle: string | null; category: string }>();
    for (const r of completedRows) {
      if (
        !durationById.has(r.closingId) &&
        r.durationDays &&
        r.durationDays > 0 &&
        r.durationDays <= MAX_REASONABLE_DAYS
      ) {
        durationById.set(r.closingId, {
          days: r.durationDays,
          il: r.il ?? null,
          ilce: r.ilce ?? null,
          mahalle: r.mahalle ?? null,
          category: r.dealCategory ?? "Satış",
        });
      }
    }
    const allDurations = Array.from(durationById.values());

    const calcAvg = (items: typeof allDurations) =>
      items.length > 0 ? Math.round(items.reduce((s, d) => s + d.days, 0) / items.length) : null;

    const salesDurations  = allDurations.filter(d => d.category === "Satış");
    const rentalDurations = allDurations.filter(d => d.category === "Kiralık");
    const avgSaleDays   = calcAvg(salesDurations);
    const avgRentalDays = calcAvg(rentalDurations);

    const buildGeoMap = (items: typeof allDurations, field: "il" | "ilce" | "mahalle", outKey: string) => {
      const map = new Map<string, { total: number; count: number }>();
      for (const d of items) {
        const key = d[field] || "Belirtilmemiş";
        if (!map.has(key)) map.set(key, { total: 0, count: 0 });
        map.get(key)!.total += d.days;
        map.get(key)!.count++;
      }
      return Array.from(map.entries())
        .map(([k, v]) => ({ [outKey]: k, avg: Math.round(v.total / v.count), count: v.count }))
        .filter((r: any) => r.count >= 3)
        .sort((a: any, b: any) => a.avg - b.avg);
    };

    const avgSaleDaysByIl       = buildGeoMap(salesDurations,  "il",      "il");
    const avgSaleDaysByIlce     = buildGeoMap(salesDurations,  "ilce",    "ilce");
    const avgSaleDaysByMahalle  = buildGeoMap(salesDurations,  "mahalle", "mahalle");
    const avgRentalDaysByIl     = buildGeoMap(rentalDurations, "il",      "il");
    const avgRentalDaysByIlce   = buildGeoMap(rentalDurations, "ilce",    "ilce");
    const avgRentalDaysByMahalle= buildGeoMap(rentalDurations, "mahalle", "mahalle");

    // ── First-time closers in this period ──
    // Employees whose earliest-ever completed closing falls inside [startDate, end].
    const firstDateRows = await db
      .select({
        employeeId: closingAgents.employeeId,
        firstDate: sql<Date>`MIN(${effectiveDate})`,
      })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .innerJoin(closings, eq(closingSides.closingId, closings.id))
      .where(and(
        sql`${effectiveStatus} = 'completed'`,
        sql`${effectiveDate} IS NOT NULL`,
      ))
      .groupBy(closingAgents.employeeId);

    const firstTimers: Array<{ employeeId: number; name: string; kwuid: string; firstDate: string; bhb: number; bm: number }> = [];
    for (const r of firstDateRows) {
      if (!r.employeeId || !r.firstDate) continue;
      const fd = new Date(r.firstDate);
      if (fd >= startDate && fd <= end) {
        const emp = empMap.get(r.employeeId);
        if (emp) firstTimers.push({
          employeeId: r.employeeId,
          name: emp.name, kwuid: emp.kwuid,
          firstDate: fd.toISOString().split("T")[0],
          bhb: 0, bm: 0,
        });
      }
    }
    firstTimers.sort((a, b) => a.firstDate.localeCompare(b.firstDate));

    // Fetch BHB for each first-timer's first closing
    if (firstTimers.length > 0) {
      const empIds = firstTimers.map(ft => ft.employeeId);
      const bhbRows = await db
        .select({
          employeeId: closingAgents.employeeId,
          effDate: effectiveDate,
          bhbShare: closingAgents.bhbShare,
          bm: closingAgents.marketCenterActual,
        })
        .from(closingAgents)
        .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
        .innerJoin(closings, eq(closingSides.closingId, closings.id))
        .where(and(
          sql`${effectiveStatus} = 'completed'`,
          sql`${effectiveDate} IS NOT NULL`,
          inArray(closingAgents.employeeId, empIds),
        ));
      for (const r of bhbRows) {
        if (!r.employeeId || !r.effDate) continue;
        const dateStr = new Date(r.effDate).toISOString().split("T")[0];
        const ft = firstTimers.find(f => f.employeeId === r.employeeId);
        if (ft && dateStr === ft.firstDate) {
          ft.bhb += parseFloat(String(r.bhbShare) || "0");
          ft.bm  += parseFloat(String(r.bm) || "0");
        }
      }
    }

    // ── New cappers in this period ──
    // Walk per-employee closings chronologically since their cap period start; find the
    // closing that pushed cumulative BM ≥ capAmount. If that date falls in the report
    // range, the agent is a new capper this period.
    const empCapRows = await db
      .select({
        id: employees.id,
        capMonth: employees.capMonth,
        capValue: employees.capValue,
      })
      .from(employees)
      .where(eq(employees.status, "active"));
    const capSettingRowsForNew = await db.select().from(capSettings);
    const capSettingByYearFN = new Map(capSettingRowsForNew.map(s => [s.year, parseFloat(s.amount)]));

    const TR_MONTHS_FN: Record<string, number> = {
      "Ocak": 1, "Şubat": 2, "Mart": 3, "Nisan": 4, "Mayıs": 5, "Haziran": 6,
      "Temmuz": 7, "Ağustos": 8, "Eylül": 9, "Ekim": 10, "Kasım": 11, "Aralık": 12,
    };
    const nowFN = new Date();
    const currentYearFN = nowFN.getFullYear();
    const currentMonthFN = nowFN.getMonth() + 1;

    const empCapInfo = new Map<number, { capAmount: number; periodStart: Date }>();
    let minPeriodStart: Date | null = null;
    for (const e of empCapRows) {
      if (!e.capMonth) continue;
      const trimmed = e.capMonth.trim();
      let capMonthNum = TR_MONTHS_FN[trimmed];
      if (!capMonthNum) {
        const parts = trimmed.split("-");
        capMonthNum = parseInt(parts[1] ?? parts[0], 10);
      }
      if (isNaN(capMonthNum) || capMonthNum < 1 || capMonthNum > 12) continue;
      const capYear = currentMonthFN >= capMonthNum ? currentYearFN : currentYearFN - 1;
      const periodStart = new Date(capYear, capMonthNum - 1, 1);
      const empCapValue = e.capValue ? parseFloat(e.capValue) : null;
      const capAmount = empCapValue && empCapValue > 0
        ? empCapValue
        : (capSettingByYearFN.get(capYear) ?? 0);
      if (capAmount <= 0) continue;
      empCapInfo.set(e.id, { capAmount, periodStart });
      if (!minPeriodStart || periodStart < minPeriodStart) minPeriodStart = periodStart;
    }

    const newCappers: Array<{ employeeId: number; name: string; kwuid: string; capDate: string; capAmount: number }> = [];
    if (minPeriodStart && empCapInfo.size > 0) {
      const capPeriodRows = await db
        .select({
          employeeId: closingAgents.employeeId,
          effDate: effectiveDate,
          bm: closingAgents.marketCenterActual,
        })
        .from(closingAgents)
        .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
        .innerJoin(closings, eq(closingSides.closingId, closings.id))
        .where(and(
          sql`${effectiveDate} IS NOT NULL`,
          sql`${effectiveDate} >= ${minPeriodStart}`,
          inArray(closingAgents.employeeId, Array.from(empCapInfo.keys())),
        ));

      const byEmp = new Map<number, Array<{ date: Date; bm: number }>>();
      for (const r of capPeriodRows) {
        if (!r.employeeId || !r.effDate) continue;
        if (!byEmp.has(r.employeeId)) byEmp.set(r.employeeId, []);
        byEmp.get(r.employeeId)!.push({ date: new Date(r.effDate), bm: parseFloat(r.bm ?? "0") });
      }

      for (const [empId, rows] of byEmp) {
        const info = empCapInfo.get(empId);
        if (!info) continue;
        const inPeriod = rows
          .filter(r => r.date >= info.periodStart)
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        let running = 0;
        let capDate: Date | null = null;
        for (const r of inPeriod) {
          running += r.bm;
          if (running >= info.capAmount) { capDate = r.date; break; }
        }
        if (capDate && capDate >= startDate && capDate <= end) {
          const emp = empMap.get(empId);
          if (emp) newCappers.push({
            employeeId: empId,
            name: emp.name, kwuid: emp.kwuid,
            capDate: capDate.toISOString().split("T")[0],
            capAmount: info.capAmount,
          });
        }
      }
      newCappers.sort((a, b) => a.capDate.localeCompare(b.capDate));
    }

    return {
      completedCount: Math.round(completedIslem),
      expectedCount: Math.round(expectedIslem),
      completedSatilikCount: Math.round(completedSatilikIslem),
      completedKiralikCount: Math.round(completedKiralikIslem),
      completedVolume, expectedVolume,
      completedBHB, expectedBHB, completedBM, expectedBM,
      bySideType,
      monthlyTrend, byAgent, byCategory, byDealType,
      byIl, byIlce, byMahalle,
      avgSaleDays, avgSaleDaysByIl, avgSaleDaysByIlce, avgSaleDaysByMahalle,
      avgRentalDays, avgRentalDaysByIl, avgRentalDaysByIlce, avgRentalDaysByMahalle,
      firstTimers, newCappers,
    };
  }

  async getFinancialTargets(year: number, office: string = ""): Promise<FinancialTarget[]> {
    return db.select().from(financialTargets)
      .where(and(eq(financialTargets.year, year), eq(financialTargets.office, office)))
      .orderBy(financialTargets.month);
  }

  async upsertFinancialTarget(year: number, month: number, office: string, data: {
    bhbTarget?: number | null; bhbHighTarget?: number | null;
    bmTarget?: number | null; bmHighTarget?: number | null;
    satilikAdetTarget?: number | null; satilikAdetHighTarget?: number | null;
    kiralikAdetTarget?: number | null; kiralikAdetHighTarget?: number | null;
  }): Promise<void> {
    const n = (v?: number | null) => v != null ? String(v) : null;
    const vals = {
      bhbTarget: n(data.bhbTarget), bhbHighTarget: n(data.bhbHighTarget),
      bmTarget: n(data.bmTarget), bmHighTarget: n(data.bmHighTarget),
      satilikAdetTarget: data.satilikAdetTarget ?? null, satilikAdetHighTarget: data.satilikAdetHighTarget ?? null,
      kiralikAdetTarget: data.kiralikAdetTarget ?? null, kiralikAdetHighTarget: data.kiralikAdetHighTarget ?? null,
    };
    await db.insert(financialTargets).values({ year, month, office, ...vals })
      .onConflictDoUpdate({ target: [financialTargets.year, financialTargets.month, financialTargets.office], set: vals });
  }

  async upsertInterviewTarget(data: { jobId: number; year: number; month: number; category: string; target: number }): Promise<void> {
    const [existing] = await db.select().from(interviewTargets).where(
      and(
        eq(interviewTargets.jobId, data.jobId),
        eq(interviewTargets.year, data.year),
        eq(interviewTargets.month, data.month),
        eq(interviewTargets.category, data.category),
      )
    );
    if (existing) {
      await db.update(interviewTargets).set({ target: data.target }).where(eq(interviewTargets.id, existing.id));
    } else {
      await db.insert(interviewTargets).values(data);
    }
  }

  async getCoachingStats(startDate: Date, endDate: Date, coachUserId?: number, includePassive = false) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const statusCondition = includePassive
      ? or(
          eq(employees.status, "active"),
          and(
            eq(employees.status, "passive"),
            sql`${employees.passiveAt} >= ${startDate}`,
          ),
        )
      : eq(employees.status, "active");

    const ukEmps = await db
      .select({ emp: employees, cand: candidates })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .where(and(
        statusCondition,
        or(
          eq(employees.uretkenlikKoclugu, true),
          eq(employees.dua, true),
        ),
        ...(coachUserId !== undefined ? [or(
          eq(employees.uretkenlikKocluguManagerId, coachUserId),
          eq(employees.duaManagerId, coachUserId),
        )] : []),
      ));

    if (ukEmps.length === 0) return { coaches: [] };

    // Exclude ÜK employees whose exit date is before the report period starts
    const reportStartStr = startDate.toISOString().split("T")[0];
    const activeUkEmps = ukEmps.filter(e => {
      const ukEnd = (e.emp as any).ukEndDate as string | null | undefined;
      if (!ukEnd || !(e.emp as any).uretkenlikKoclugu) return true;
      return ukEnd >= reportStartStr;
    });
    if (activeUkEmps.length === 0) return { coaches: [] };

    const studentIds = activeUkEmps.map(e => e.emp.id);

    // ── All queries run in parallel ──────────────────────────────────────────

    const TR_MONTHS: Record<string, number> = {
      "Ocak": 1, "Şubat": 2, "Mart": 3, "Nisan": 4, "Mayıs": 5, "Haziran": 6,
      "Temmuz": 7, "Ağustos": 8, "Eylül": 9, "Ekim": 10, "Kasım": 11, "Aralık": 12,
    };
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Parse cap info per employee (no DB needed — data is already in emp)
    const capInfoMap = new Map<number, {
      capYear: number; capMonthNum: number;
      periodStart: Date; prevPeriodStart: Date; empCapValue: number | null;
    }>();
    const capYearSet = new Set<number>();
    for (const { emp } of activeUkEmps) {
      if (!emp.capMonth) continue;
      const trimmed = emp.capMonth.trim();
      let capMonthNum = TR_MONTHS[trimmed];
      if (!capMonthNum) {
        const parts = trimmed.split("-");
        capMonthNum = parseInt(parts[1] ?? parts[0], 10);
      }
      if (isNaN(capMonthNum) || capMonthNum < 1 || capMonthNum > 12) continue;
      const capYear = currentMonth >= capMonthNum ? currentYear : currentYear - 1;
      capYearSet.add(capYear);
      capInfoMap.set(emp.id, {
        capYear,
        capMonthNum,
        periodStart: new Date(capYear, capMonthNum - 1, 1),
        prevPeriodStart: new Date(capYear - 1, capMonthNum - 1, 1),
        empCapValue: emp.capValue ? parseFloat(emp.capValue) : null,
      });
    }

    // Earliest prev period start across all employees
    let minPrevStart: Date | null = null;
    for (const info of capInfoMap.values()) {
      if (!minPrevStart || info.prevPeriodStart < minPrevStart) minPrevStart = info.prevPeriodStart;
    }

    const minPrevStartYMD = minPrevStart
      ? `${minPrevStart.getFullYear()}-${String(minPrevStart.getMonth() + 1).padStart(2, "0")}-01`
      : null;

    // Effective date/status: agent-level overrides closing-level when present.
    const effStatusCoach = sql<string>`COALESCE(${closingAgents.status}, ${closings.status})`;
    const effDateCoach   = sql<Date>`COALESCE(${closingAgents.closingDate}, ${closings.closingDate})`;

    const [rows, capRows, lastClosingRows, coachUsers, capSettingRows, prepayRows] = await Promise.all([
      // Closings in the selected date range
      db.select({
        closingId: closings.id,
        saleValue: closings.saleValue,
        commissionRate: closings.commissionRate,
        closingDate: effDateCoach,
        dealCategory: closings.dealCategory,
        dealType: closings.dealType,
        durationDays: closings.durationDays,
        sideType: closingSides.sideType,
        bhbShare: closingAgents.bhbShare,
        marketCenterActual: closingAgents.marketCenterActual,
        employeeNet: closingAgents.employeeNet,
        employeeId: closingAgents.employeeId,
      })
      .from(closings)
      .leftJoin(closingSides, eq(closingSides.closingId, closings.id))
      .leftJoin(closingAgents, eq(closingAgents.closingSideId, closingSides.id))
      .where(and(
        sql`${effStatusCoach} = 'completed'`,
        sql`${effDateCoach} IS NOT NULL`,
        sql`${effDateCoach} >= ${startDate}`,
        sql`${effDateCoach} <= ${end}`,
        inArray(closingAgents.employeeId, studentIds),
      )),

      // Cap period closings in batch (from earliest prev period start)
      // NOTE: cap counts ALL closings (including pending) — see getEmployeeCapStatus
      minPrevStart
        ? db.select({
            employeeId: closingAgents.employeeId,
            marketCenterActual: closingAgents.marketCenterActual,
            closingDate: effDateCoach,
          })
          .from(closingAgents)
          .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
          .innerJoin(closings, eq(closingSides.closingId, closings.id))
          .where(and(
            inArray(closingAgents.employeeId, studentIds),
            sql`${effDateCoach} IS NOT NULL`,
            sql`${effDateCoach} >= ${minPrevStart}`,
          ))
        : Promise.resolve([] as { employeeId: number | null; marketCenterActual: string | null; closingDate: Date | null }[]),

      // Last closing date per student via GROUP BY MAX (avoids fetching all rows)
      db.select({
        employeeId: closingAgents.employeeId,
        lastDate: sql<string>`MAX(${effDateCoach})`,
      })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingSides.id, closingAgents.closingSideId))
      .innerJoin(closings, eq(closings.id, closingSides.closingId))
      .where(and(
        inArray(closingAgents.employeeId, studentIds),
        sql`${effStatusCoach} = 'completed'`,
        sql`${effDateCoach} IS NOT NULL`,
      ))
      .groupBy(closingAgents.employeeId),

      // Coach user names (both ÜK and DUA coaches)
      (() => {
        const ids = [...new Set([
          ...activeUkEmps.map(e => e.emp.uretkenlikKocluguManagerId),
          ...activeUkEmps.map(e => (e.emp as any).duaManagerId),
        ].filter(Boolean))] as number[];
        return ids.length > 0
          ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))
          : Promise.resolve([] as { id: number; name: string }[]);
      })(),

      // Cap settings for relevant years
      capYearSet.size > 0
        ? db.select().from(capSettings).where(inArray(capSettings.year, [...capYearSet]))
        : Promise.resolve([] as typeof capSettings.$inferSelect[]),

      // BM Payı Ön Ödemesi entries (income) for relevant students, from earliest prev period
      minPrevStartYMD
        ? db.select({
            employeeId: officeExpenses.employeeId,
            amount: officeExpenses.amount,
            date: officeExpenses.date,
          })
          .from(officeExpenses)
          .where(and(
            eq(officeExpenses.type, "income"),
            eq(officeExpenses.category, BM_PREPAYMENT_CATEGORY),
            inArray(officeExpenses.employeeId, studentIds),
            gte(officeExpenses.date, minPrevStartYMD),
          ))
        : Promise.resolve([] as { employeeId: number | null; amount: string | null; date: string | null }[]),
    ]);

    // ── Build cap used maps ──────────────────────────────────────────────────
    const capUsedMap = new Map<number, number>();
    const prevCapUsedMap = new Map<number, number>();
    for (const r of capRows) {
      if (!r.employeeId || !r.closingDate || !r.marketCenterActual) continue;
      const info = capInfoMap.get(r.employeeId);
      if (!info) continue;
      const d = new Date(r.closingDate);
      const amount = parseFloat(r.marketCenterActual);
      if (d >= info.periodStart) {
        capUsedMap.set(r.employeeId, (capUsedMap.get(r.employeeId) ?? 0) + amount);
      } else if (d >= info.prevPeriodStart) {
        prevCapUsedMap.set(r.employeeId, (prevCapUsedMap.get(r.employeeId) ?? 0) + amount);
      }
    }
    // Merge BM ön ödemesi entries into cap used by payment date
    for (const r of prepayRows) {
      if (!r.employeeId || !r.date || !r.amount) continue;
      const info = capInfoMap.get(r.employeeId);
      if (!info) continue;
      const d = new Date(r.date + "T00:00:00");
      const amount = parseFloat(r.amount);
      if (d >= info.periodStart) {
        capUsedMap.set(r.employeeId, (capUsedMap.get(r.employeeId) ?? 0) + amount);
      } else if (d >= info.prevPeriodStart) {
        prevCapUsedMap.set(r.employeeId, (prevCapUsedMap.get(r.employeeId) ?? 0) + amount);
      }
    }
    const capSettingByYear = new Map(capSettingRows.map(r => [r.year, parseFloat(r.amount)]));
    const coachMap = new Map((coachUsers as { id: number; name: string }[]).map(u => [u.id, u.name]));

    // ── Last closing map ─────────────────────────────────────────────────────
    const lastClosingMap = new Map<number, string>();
    for (const r of lastClosingRows) {
      if (r.employeeId && r.lastDate) lastClosingMap.set(r.employeeId, String(r.lastDate));
    }

    // ── Build per-student stats ──────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const studentStats = activeUkEmps.map(e => {
      const empId = e.emp.id;
      const ukEndDateStr = (e.emp as any).ukEndDate as string | null | undefined;
      const passiveAtDate = e.emp.status === "passive" && e.emp.passiveAt
        ? new Date(e.emp.passiveAt)
        : null;

      const empRows = rows.filter(r => {
        if (r.employeeId !== empId) return false;
        if (r.closingDate) {
          const cd = new Date(r.closingDate);
          if (ukEndDateStr && e.emp.uretkenlikKoclugu && cd > new Date(ukEndDateStr)) return false;
          if (passiveAtDate && cd > passiveAtDate) return false;
        }
        return true;
      });
      const closingIds = new Set(empRows.map(r => r.closingId));

      // İşlem adedi oranı (taraf başı).
      // Kiralık: per-side BHB = saleValue / 2 (her taraftan kira bedelinin yarısı)
      // Satış/Yönlendirme: per-side BHB = saleValue × commissionRate / 100
      const islemOrani = (r: typeof empRows[number]): number => {
        const sale = parseFloat(r.saleValue ?? "0");
        const rate = parseFloat((r as any).commissionRate ?? "0");
        const perSide = r.dealCategory === "Kiralık" ? sale / 2 : sale * rate / 100;
        if (perSide <= 0) return 0;
        return parseFloat(r.bhbShare ?? "0") / perSide;
      };

      const seenVol = new Set<number>();
      let totalVolume = 0;
      for (const r of empRows) {
        if (!seenVol.has(r.closingId)) { totalVolume += parseFloat(r.saleValue ?? "0"); seenVol.add(r.closingId); }
      }
      let totalBHB = 0, totalBM = 0, totalNet = 0, totalIslem = 0;
      for (const r of empRows) {
        if (r.bhbShare) totalBHB += parseFloat(r.bhbShare);
        if (r.marketCenterActual) totalBM += parseFloat(r.marketCenterActual);
        if (r.employeeNet) totalNet += parseFloat(r.employeeNet);
        totalIslem += islemOrani(r);
      }

      const bySideType = empRows.reduce((acc, r) => {
        const k = r.sideType === "buyer" ? "buyer" : r.sideType === "referral" ? "referral" : "seller";
        acc[k] += islemOrani(r);
        return acc;
      }, { buyer: 0, seller: 0, referral: 0 });
      bySideType.buyer = Math.round(bySideType.buyer);
      bySideType.seller = Math.round(bySideType.seller);
      bySideType.referral = Math.round(bySideType.referral);

      const monthMap = new Map<string, { count: number; bhb: number; volume: number; ids: Set<number> }>();
      for (const r of empRows) {
        if (!r.closingDate) continue;
        const d = new Date(r.closingDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthMap.has(key)) monthMap.set(key, { count: 0, bhb: 0, volume: 0, ids: new Set() });
        const m = monthMap.get(key)!;
        if (!m.ids.has(r.closingId)) { m.volume += parseFloat(r.saleValue ?? "0"); m.ids.add(r.closingId); }
        m.count += islemOrani(r);
        if (r.bhbShare) m.bhb += parseFloat(r.bhbShare);
      }
      const monthlyTrend = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, count: Math.round(v.count), bhb: v.bhb, volume: v.volume }));

      const dealTypeMap = new Map<string, number>();
      const catMap = new Map<string, number>();
      for (const r of empRows) {
        const o = islemOrani(r);
        const dt = r.dealType ?? "Diğer";
        dealTypeMap.set(dt, (dealTypeMap.get(dt) ?? 0) + o);
        const cat = r.dealCategory ?? "Satış";
        catMap.set(cat, (catMap.get(cat) ?? 0) + o);
      }
      const byDealType = Array.from(dealTypeMap.entries()).map(([dealType, count]) => ({ dealType, count: Math.round(count) })).sort((a, b) => b.count - a.count);
      const byCategory = Array.from(catMap.entries()).map(([category, count]) => ({ category, count: Math.round(count) }));

      const durMap = new Map<number, number>();
      for (const r of empRows) {
        if (!durMap.has(r.closingId) && r.durationDays && r.durationDays > 0)
          durMap.set(r.closingId, r.durationDays);
      }
      const durations = Array.from(durMap.values());
      const avgSaleDays = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

      // Cap status from batched data
      const info = capInfoMap.get(empId);
      let capPct = 0, capUsed = 0, capAmount = 0;
      if (info) {
        const rawCapUsed = (capUsedMap.get(empId) ?? 0) + parseFloat((e.emp as any).capManualAdjustment ?? "0");
        const rawCapAmount = info.empCapValue && info.empCapValue > 0
          ? info.empCapValue
          : (capSettingByYear.get(info.capYear) ?? 0);
        capUsed = rawCapUsed;
        capAmount = rawCapAmount;
        capPct = rawCapAmount > 0 ? Math.min(100, Math.round((rawCapUsed / rawCapAmount) * 100)) : 0;
      }

      // Last closing date
      let lastClosingDate: string | null = null;
      let daysSinceLastClosing: number | null = null;
      const lastDateStr = lastClosingMap.get(empId);
      if (lastDateStr) {
        const last = new Date(lastDateStr);
        last.setHours(0, 0, 0, 0);
        lastClosingDate = lastDateStr.split("T")[0];
        daysSinceLastClosing = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
      }

      return {
        employeeId: empId,
        name: e.cand?.name ?? `#${empId}`,
        kwuid: e.emp.kwuid ?? "",
        isUK: e.emp.uretkenlikKoclugu,
        isDua: (e.emp as any).dua ?? false,
        ukRate: e.emp.uretkenlikKocluguOran ?? "",
        coachId: e.emp.uretkenlikKoclugu
          ? (e.emp.uretkenlikKocluguManagerId ?? null)
          : ((e.emp as any).duaManagerId ?? null),
        totalClosings: Math.round(totalIslem),
        totalVolume,
        totalBHB,
        totalBM,
        totalNet,
        avgDealValue: closingIds.size > 0 ? Math.round(totalVolume / closingIds.size) : 0,
        avgSaleDays,
        capPct,
        capUsed,
        capAmount,
        bySideType,
        byDealType,
        byCategory,
        monthlyTrend,
        lastClosingDate,
        daysSinceLastClosing,
      };
    });

    const coachGroups = new Map<number | null, typeof studentStats>();
    for (const s of studentStats) {
      const key = s.coachId;
      if (!coachGroups.has(key)) coachGroups.set(key, []);
      coachGroups.get(key)!.push(s);
    }

    const coaches = Array.from(coachGroups.entries()).map(([coachId, students]) => ({
      coachId,
      coachName: coachId ? (coachMap.get(coachId) ?? `#${coachId}`) : "Koçsuz",
      studentCount: students.length,
      totalBHB: students.reduce((s, st) => s + st.totalBHB, 0),
      totalVolume: students.reduce((s, st) => s + st.totalVolume, 0),
      avgCapPct: students.length > 0 ? Math.round(students.reduce((s, st) => s + st.capPct, 0) / students.length) : 0,
      students: students.sort((a, b) => b.totalBHB - a.totalBHB),
    })).sort((a, b) => b.totalBHB - a.totalBHB);

    return { coaches };
  }

  // ── Office Expenses ────────────────────────────────────────────────────────

  async createOfficeExpense(data: InsertOfficeExpense): Promise<OfficeExpense> {
    const [row] = await db.insert(officeExpenses).values(data).returning();
    return row;
  }

  async getOfficeExpenses(filters?: {
    type?: string;
    year?: number;
    month?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<(OfficeExpense & { employeeName?: string | null })[]> {
    const conditions = [];
    if (filters?.type) conditions.push(eq(officeExpenses.type, filters.type));
    if (filters?.year && filters?.month) {
      const y = filters.year;
      const m = String(filters.month).padStart(2, "0");
      const lastDay = new Date(y, filters.month, 0).getDate();
      conditions.push(gte(officeExpenses.date, `${y}-${m}-01`));
      conditions.push(lte(officeExpenses.date, `${y}-${m}-${lastDay}`));
    } else if (filters?.year) {
      conditions.push(gte(officeExpenses.date, `${filters.year}-01-01`));
      conditions.push(lte(officeExpenses.date, `${filters.year}-12-31`));
    }
    if (filters?.startDate) conditions.push(gte(officeExpenses.date, filters.startDate));
    if (filters?.endDate) conditions.push(lte(officeExpenses.date, filters.endDate));

    const rows = await db
      .select({ exp: officeExpenses, empName: candidates.name })
      .from(officeExpenses)
      .leftJoin(employees, eq(officeExpenses.employeeId, employees.id))
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(officeExpenses.date), desc(officeExpenses.createdAt));

    return rows.map(r => ({ ...r.exp, employeeName: r.empName }));
  }

  async updateOfficeExpense(id: number, data: Partial<InsertOfficeExpense>): Promise<OfficeExpense> {
    const [row] = await db.update(officeExpenses).set(data).where(eq(officeExpenses.id, id)).returning();
    return row;
  }

  async deleteOfficeExpense(id: number): Promise<void> {
    await db.delete(officeExpenses).where(eq(officeExpenses.id, id));
  }

  async getMonthlyPL(year: number): Promise<{
    month: number;
    incomeByCategory: Record<string, number>;
    expenseByCategory: Record<string, number>;
    totalIncome: number;
    totalExpenses: number;
    net: number;
  }[]> {
    const yearStart = new Date(year, 0, 1);
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999);

    // Manual income/expense entries
    const rows = await db
      .select()
      .from(officeExpenses)
      .where(and(
        gte(officeExpenses.date, `${year}-01-01`),
        lte(officeExpenses.date, `${year}-12-31`),
      ));

    // BM revenues: sum of marketCenterActual from closings per month
    const bmRows = await db
      .select({
        closingDate: closings.closingDate,
        marketCenterActual: closingAgents.marketCenterActual,
      })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingSides.id, closingAgents.closingSideId))
      .innerJoin(closings, eq(closings.id, closingSides.closingId))
      .where(and(
        isNotNull(closings.closingDate),
        gte(closings.closingDate, yearStart),
        lte(closings.closingDate, yearEnd),
      ));

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      incomeByCategory: {} as Record<string, number>,
      expenseByCategory: {} as Record<string, number>,
      totalIncome: 0,
      totalExpenses: 0,
      net: 0,
    }));

    // Aggregate manual entries
    for (const row of rows) {
      const m = parseInt(row.date.slice(5, 7)) - 1;
      if (m < 0 || m > 11) continue;
      const amount = parseFloat(row.amount as string);
      if (row.type === "income") {
        months[m].incomeByCategory[row.category] = (months[m].incomeByCategory[row.category] ?? 0) + amount;
        months[m].totalIncome += amount;
      } else {
        months[m].expenseByCategory[row.category] = (months[m].expenseByCategory[row.category] ?? 0) + amount;
        months[m].totalExpenses += amount;
      }
    }

    // Aggregate BM revenues per month
    for (const row of bmRows) {
      if (!row.closingDate) continue;
      const m = new Date(row.closingDate).getMonth(); // 0-based
      const amount = parseFloat(row.marketCenterActual as string ?? "0");
      if (amount <= 0) continue;
      months[m].incomeByCategory["BM Gelirleri"] = (months[m].incomeByCategory["BM Gelirleri"] ?? 0) + amount;
      months[m].totalIncome += amount;
    }

    for (const m of months) m.net = m.totalIncome - m.totalExpenses;

    return months;
  }

  // ── Listings (Portal İlanları) ─────────────────────────────────────────────

  /** Normalize a name for matching: deaccent Turkish chars, lowercase, strip dots, collapse spaces. */
  private normForMatch(s: string): string {
    return (s ?? "")
      .normalize("NFC")
      .replace(/[İIı]/g, "i").replace(/[Şş]/g, "s").replace(/[Ğğ]/g, "g")
      .replace(/[Üü]/g, "u").replace(/[Öö]/g, "o").replace(/[Çç]/g, "c")
      .toLowerCase()
      .replace(/\./g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private nameTokens(s: string): string[] {
    return this.normForMatch(s).split(" ").filter(Boolean);
  }

  /**
   * Build a fuzzy lookup index over employees so listing advisor names can be
   * matched even with middle-name / abbreviated-surname differences.
   */
  private async buildEmployeeIndex(): Promise<{
    exact: Map<string, number>;                                  // full deaccented name → id
    firstLast: Map<string, Set<number>>;                        // "first|last" → ids
    firstLastInitial: Map<string, Set<number>>;                 // "first|lastInitial" → ids
    bySurname: Map<string, { id: number; tokens: Set<string> }[]>; // last token → candidates
  }> {
    const rows = await db
      .select({ id: employees.id, name: candidates.name })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id));

    const exact = new Map<string, number>();
    const firstLast = new Map<string, Set<number>>();
    const firstLastInitial = new Map<string, Set<number>>();
    const bySurname = new Map<string, { id: number; tokens: Set<string> }[]>();
    const add = (m: Map<string, Set<number>>, k: string, id: number) => {
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(id);
    };

    for (const r of rows) {
      if (!r.name) continue;
      const toks = this.nameTokens(r.name);
      if (toks.length === 0) continue;
      const full = toks.join(" ");
      if (!exact.has(full)) exact.set(full, r.id);
      const first = toks[0], last = toks[toks.length - 1];
      if (toks.length >= 2) {
        add(firstLast, `${first}|${last}`, r.id);
        add(firstLastInitial, `${first}|${last[0]}`, r.id);
      }
      if (!bySurname.has(last)) bySurname.set(last, []);
      bySurname.get(last)!.push({ id: r.id, tokens: new Set(toks) });
    }
    return { exact, firstLast, firstLastInitial, bySurname };
  }

  /** Resolve a listing advisor name to a single employee id, or null if no confident unique match. */
  private resolveEmployeeId(index: Awaited<ReturnType<DatabaseStorage["buildEmployeeIndex"]>>, advisorName: string): number | null {
    const toks = this.nameTokens(advisorName);
    if (toks.length === 0) return null;
    const full = toks.join(" ");

    // 1. Exact (deaccented) full-name match
    const ex = index.exact.get(full);
    if (ex !== undefined) return ex;

    if (toks.length < 2) return null; // single token → too ambiguous
    const first = toks[0], last = toks[toks.length - 1];
    const uniq = (set?: Set<number>) => (set && set.size === 1 ? [...set][0] : null);

    // 2. First + full surname (handles extra/missing middle names where surname matches)
    const fl = uniq(index.firstLast.get(`${first}|${last}`));
    if (fl !== null) return fl;

    // 3. Abbreviated surname e.g. "Serpil K." → unique "Serpil K*"
    if (last.length === 1) {
      const fi = uniq(index.firstLastInitial.get(`${first}|${last}`));
      if (fi !== null) return fi;
    }

    // 4. Token subset sharing surname, e.g. "Kaan Atakol" ⊆ "Ahmet Kaan Atakol"
    const sameSurname = index.bySurname.get(last) ?? [];
    const csvSet = toks.filter((t) => t.length > 1);
    const subsetMatches = sameSurname.filter((e) => csvSet.every((t) => e.tokens.has(t)));
    if (subsetMatches.length === 1) return subsetMatches[0].id;

    return null;
  }

  async getListings(filters?: {
    status?: string;
    employeeId?: number;
    needsAgreement?: boolean;
    needsReason?: boolean;
    needsAny?: boolean;
    hasAgreement?: boolean;
    hasReason?: boolean;
    onlyMatched?: boolean;
    onlyUnmatched?: boolean;
    missingPhone?: boolean;
    missingEmail?: boolean;
    search?: string;
  }): Promise<ListingWithEmployee[]> {
    const conds = [];
    if (filters?.status) conds.push(eq(listings.status, filters.status));
    if (filters?.employeeId !== undefined) conds.push(eq(listings.employeeId, filters.employeeId));
    if (filters?.onlyMatched) conds.push(isNotNull(listings.employeeId));
    if (filters?.onlyUnmatched) conds.push(and(isNull(listings.employeeId), eq(listings.status, "active")));
    if (filters?.missingPhone) conds.push(and(isNotNull(listings.employeeId), isNull(candidates.phone)));
    if (filters?.missingEmail) conds.push(and(isNotNull(listings.employeeId), isNull(candidates.email)));
    if (filters?.needsAgreement) conds.push(and(eq(listings.status, "active"), isNull(listings.agreementUploadedAt), isNull(listings.noAgreementAt)));
    if (filters?.needsReason) conds.push(and(eq(listings.status, "passive"), isNull(listings.closeReasonSubmittedAt)));
    if (filters?.needsAny) conds.push(and(
      isNotNull(listings.employeeId),
      or(
        and(eq(listings.status, "active"), isNull(listings.agreementUploadedAt), isNull(listings.noAgreementAt)),
        and(eq(listings.status, "passive"), isNull(listings.closeReasonSubmittedAt)),
      ),
    ));
    if (filters?.hasAgreement) conds.push(and(eq(listings.status, "active"), isNotNull(listings.agreementUploadedAt)));
    if (filters?.hasReason) conds.push(and(eq(listings.status, "passive"), isNotNull(listings.closeReasonSubmittedAt)));
    if (filters?.search) conds.push(or(
      sql`${listings.listingNumber} ILIKE ${"%" + filters.search + "%"}`,
      sql`${listings.advisorName} ILIKE ${"%" + filters.search + "%"}`,
    ));

    const rows = await db
      .select({ l: listings, empName: candidates.name, empPhone: candidates.phone })
      .from(listings)
      .leftJoin(employees, eq(listings.employeeId, employees.id))
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(listings.updatedAt))
      .limit(2000);

    return rows.map((r) => ({
      ...r.l,
      employeeName: r.empName ?? undefined,
      employeePhone: r.empPhone ?? undefined,
      agreementFileData: undefined as any, // never ship base64 blobs in list payloads
    }));
  }

  async getListingsSummary(): Promise<{
    totalActive: number; totalPassive: number;
    matchedActive: number; needsAgreement: number; needsReason: number; soldPassive: number; noAgreement: number;
  }> {
    const [row] = await db.select({
      totalActive:    sql<number>`count(*) filter (where ${listings.status} = 'active')`,
      totalPassive:   sql<number>`count(*) filter (where ${listings.status} = 'passive')`,
      matchedActive:  sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.employeeId} is not null)`,
      needsAgreement: sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.employeeId} is not null and ${listings.agreementUploadedAt} is null and ${listings.noAgreementAt} is null)`,
      needsReason:    sql<number>`count(*) filter (where ${listings.status} = 'passive' and ${listings.employeeId} is not null and ${listings.closeReasonSubmittedAt} is null)`,
      soldPassive:    sql<number>`count(*) filter (where ${listings.closeReason} in ('Satıldı','Kiralandı'))`,
      noAgreement:    sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.noAgreementAt} is not null)`,
    }).from(listings);
    return {
      totalActive: Number(row?.totalActive ?? 0),
      totalPassive: Number(row?.totalPassive ?? 0),
      matchedActive: Number(row?.matchedActive ?? 0),
      needsAgreement: Number(row?.needsAgreement ?? 0),
      needsReason: Number(row?.needsReason ?? 0),
      soldPassive: Number(row?.soldPassive ?? 0),
      noAgreement: Number(row?.noAgreement ?? 0),
    };
  }

  async createListing(data: {
    listingNumber: string;
    price?: string | null;
    publishedDate?: string | null;
    durationDays?: number | null;
    advisorName?: string | null;
    employeeId?: number | null;
    office?: string | null;
    store?: string | null;
    status?: string;
  }): Promise<Listing> {
    const { randomUUID } = await import("crypto");
    const token = randomUUID().replace(/-/g, "").slice(0, 16);
    const [row] = await db.insert(listings).values({
      listingNumber: data.listingNumber,
      price: data.price ?? null,
      publishedDate: data.publishedDate ?? null,
      durationDays: data.durationDays ?? null,
      advisorName: data.advisorName ?? null,
      employeeId: data.employeeId ?? null,
      office: data.office ?? null,
      store: data.store ?? null,
      status: (data.status ?? "active") as any,
      publicToken: token,
    }).returning();
    return row;
  }

  async getListing(id: number): Promise<Listing | null> {
    const [row] = await db.select().from(listings).where(eq(listings.id, id));
    return row ?? null;
  }

  async getListingByToken(token: string): Promise<ListingWithEmployee | null> {
    const [row] = await db
      .select({ l: listings, empName: candidates.name })
      .from(listings)
      .leftJoin(employees, eq(listings.employeeId, employees.id))
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .where(eq(listings.publicToken, token));
    if (!row) return null;
    return { ...row.l, employeeName: row.empName ?? undefined, agreementFileData: undefined as any };
  }

  async getListingAgreementFile(id: number): Promise<{ data: string; mime: string; name: string } | null> {
    const [row] = await db
      .select({ data: listings.agreementFileData, mime: listings.agreementFileMime, name: listings.agreementFileName })
      .from(listings).where(eq(listings.id, id));
    if (!row?.data) return null;
    return { data: row.data, mime: row.mime ?? "application/octet-stream", name: row.name ?? "yetki-sozlesmesi" };
  }

  async updateListing(id: number, patch: Partial<Listing>): Promise<Listing> {
    const [row] = await db.update(listings)
      .set({ ...patch, updatedAt: new Date() } as any)
      .where(eq(listings.id, id)).returning();
    return row;
  }

  async setListingAgreement(token: string, file: { name: string; mime: string; data: string }): Promise<Listing | null> {
    const [row] = await db.update(listings).set({
      agreementFileName: file.name,
      agreementFileMime: file.mime,
      agreementFileData: file.data,
      agreementUploadedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(listings.publicToken, token)).returning();
    return row ?? null;
  }

  async setListingCloseReason(token: string, reason: string, note: string | null): Promise<Listing | null> {
    const [row] = await db.update(listings).set({
      closeReason: reason,
      closeReasonNote: note,
      closeReasonSubmittedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(listings.publicToken, token)).returning();
    return row ?? null;
  }

  async markListingNotified(id: number, kind: "new" | "passive", msgId?: string | null): Promise<void> {
    const now = new Date();
    await db.update(listings).set(
      kind === "new"
        ? { notifiedNewAt: now, agreementRequestedAt: now, updatedAt: now, ...(msgId ? { notifyMsgIdNew: msgId } : {}) }
        : { notifiedPassiveAt: now, closeReasonRequestedAt: now, updatedAt: now, ...(msgId ? { notifyMsgIdPassive: msgId } : {}) }
    ).where(eq(listings.id, id));
  }

  async clearListings(): Promise<void> {
    await db.delete(listings);
  }

  /**
   * Import a batch of listing rows from a portal report (active or passive sheet).
   * Pure DB diff — returns listings that newly need an agreement (active) or a
   * close reason (passive). The caller decides whether to send WhatsApp.
   */
  async importListings(
    type: "active" | "passive",
    rows: Array<{
      listingNumber: string;
      price?: string | null;
      publishedDate?: string | null;
      removedDate?: string | null;
      durationDays?: number | null;
      advisorName?: string | null;
      office?: string | null;
      store?: string | null;
    }>,
  ): Promise<{ created: number; updated: number; newActive: Listing[]; newlyPassive: Listing[] }> {
    const empIndex = await this.buildEmployeeIndex();
    const numbers = Array.from(new Set(rows.map((r) => String(r.listingNumber).trim()).filter(Boolean)));
    let created = 0, updated = 0;
    const newActive: Listing[] = [];
    const newlyPassive: Listing[] = [];
    if (numbers.length === 0) return { created, updated, newActive, newlyPassive };

    // Existing listings for these numbers
    const existingRows = await db.select().from(listings).where(inArray(listings.listingNumber, numbers));
    const existing = new Map(existingRows.map((r) => [r.listingNumber, r]));

    // De-dupe input by listingNumber (keep last occurrence)
    const byNumber = new Map<string, typeof rows[number]>();
    for (const r of rows) {
      const num = String(r.listingNumber).trim();
      if (num) byNumber.set(num, r);
    }

    for (const [num, r] of byNumber) {
      const advisor = (r.advisorName ?? "").trim();
      const empId = advisor ? this.resolveEmployeeId(empIndex, advisor) : null;
      const prev = existing.get(num);

      if (type === "active") {
        if (!prev) {
          const [row] = await db.insert(listings).values({
            listingNumber: num,
            price: r.price ?? null,
            publishedDate: r.publishedDate ?? null,
            advisorName: advisor || null,
            employeeId: empId,
            office: r.office ?? null,
            store: r.store ?? null,
            status: "active",
            publicToken: randomBytes(16).toString("hex"),
          }).returning();
          created++;
          if (empId) newActive.push(row); // only our own advisors get pinged
        } else {
          // Feature 8: track price change
          if (r.price !== null && r.price !== undefined && prev.price !== null && prev.price !== undefined && r.price !== prev.price) {
            await db.execute(sql`
              INSERT INTO listing_price_history (listing_id, old_price, new_price, changed_at)
              VALUES (${prev.id}, ${prev.price}, ${r.price}, now())
            `);
          }
          await db.update(listings).set({
            price: r.price ?? prev.price,
            publishedDate: r.publishedDate ?? prev.publishedDate,
            advisorName: advisor || prev.advisorName,
            employeeId: empId ?? prev.employeeId,
            office: r.office ?? prev.office,
            store: r.store ?? prev.store,
            status: "active",          // revived if it had gone passive
            updatedAt: new Date(),
          }).where(eq(listings.id, prev.id));
          updated++;
        }
      } else {
        // passive sheet
        if (!prev) {
          // Historical passive listing we never saw active → record silently
          await db.insert(listings).values({
            listingNumber: num,
            price: r.price ?? null,
            publishedDate: r.publishedDate ?? null,
            removedDate: r.removedDate ?? null,
            durationDays: r.durationDays ?? null,
            advisorName: advisor || null,
            employeeId: empId,
            office: r.office ?? null,
            store: r.store ?? null,
            status: "passive",
            publicToken: randomBytes(16).toString("hex"),
          });
          created++;
        } else {
          if (prev.status === "active") {
            // Listing is currently active — it was re-listed after a prior removal.
            // Active always wins: only sync metadata, never flip status to passive.
            await db.update(listings).set({
              price: r.price ?? prev.price,
              advisorName: advisor || prev.advisorName,
              employeeId: empId ?? prev.employeeId,
              office: r.office ?? prev.office,
              store: r.store ?? prev.store,
              updatedAt: new Date(),
            }).where(eq(listings.id, prev.id));
            updated++;
          } else {
            await db.update(listings).set({
              price: r.price ?? prev.price,
              removedDate: r.removedDate ?? prev.removedDate,
              durationDays: r.durationDays ?? prev.durationDays,
              advisorName: advisor || prev.advisorName,
              employeeId: empId ?? prev.employeeId,
              office: r.office ?? prev.office,
              store: r.store ?? prev.store,
              status: "passive",
              updatedAt: new Date(),
            }).where(eq(listings.id, prev.id));
            updated++;
            // Newly removed from publication → ask for a reason (if it's our advisor & not already asked)
            const targetEmp = empId ?? prev.employeeId;
            if (!prev.closeReasonSubmittedAt && targetEmp) {
              const [fresh] = await db.select().from(listings).where(eq(listings.id, prev.id));
              if (fresh) newlyPassive.push(fresh);
            }
          }
        }
      }
    }

    // For active imports: the CSV is the complete list of currently active listings.
    // Any listing that is "active" in the DB but absent from this import has gone passive.
    if (type === "active") {
      const importedNumbers = new Set(byNumber.keys());
      const stillActiveInDb = await db.select().from(listings).where(eq(listings.status, "active"));
      const toFlip = stillActiveInDb.filter((l) => !importedNumbers.has(l.listingNumber));
      for (const l of toFlip) {
        await db.update(listings).set({ status: "passive", updatedAt: new Date() }).where(eq(listings.id, l.id));
        updated++;
        if (l.employeeId && !l.closeReasonSubmittedAt) newlyPassive.push(l);
      }
    }

    return { created, updated, newActive, newlyPassive };
  }

  // ── Feature 1: Danışman bazlı rapor ─────────────────────────────────────────

  async getListingReportByAdvisor(): Promise<{
    employeeId: number | null;
    advisorName: string | null;
    employeeName: string | null;
    totalActive: number;
    totalPassive: number;
    agreementUploaded: number;
    agreementPending: number;
    closeReasonSubmitted: number;
    closeReasonPending: number;
    noAgreementCount: number;
    closingCount: number;
    lastClosingDate: Date | null;
  }[]> {
    const [listingRows, closingRows] = await Promise.all([
      db
        .select({
          employeeId: listings.employeeId,
          advisorName: listings.advisorName,
          empName: candidates.name,
          totalActive:          sql<number>`count(*) filter (where ${listings.status} = 'active')`,
          totalPassive:         sql<number>`count(*) filter (where ${listings.status} = 'passive')`,
          agreementUploaded:    sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.agreementUploadedAt} is not null)`,
          agreementPending:     sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.agreementUploadedAt} is null)`,
          noAgreementCount:     sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.noAgreementAt} is not null)`,
          closeReasonSubmitted: sql<number>`count(*) filter (where ${listings.status} = 'passive' and ${listings.closeReasonSubmittedAt} is not null)`,
          closeReasonPending:   sql<number>`count(*) filter (where ${listings.status} = 'passive' and ${listings.closeReasonSubmittedAt} is null)`,
        })
        .from(listings)
        .leftJoin(employees, eq(listings.employeeId, employees.id))
        .leftJoin(candidates, eq(employees.candidateId, candidates.id))
        .groupBy(listings.employeeId, listings.advisorName, candidates.name)
        .orderBy(sql`count(*) filter (where ${listings.status} = 'active') desc`),
      db
        .select({
          employeeId: closingAgents.employeeId,
          closingCount: sql<number>`count(*)`,
          lastClosingDate: sql<Date | null>`max(coalesce(${closingAgents.closingDate}, ${closings.closingDate}))`,
        })
        .from(closingAgents)
        .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
        .innerJoin(closings, eq(closingSides.closingId, closings.id))
        .where(sql`extract(year from coalesce(${closingAgents.closingDate}, ${closings.closingDate})) = extract(year from current_date)`)
        .groupBy(closingAgents.employeeId),
    ]);

    const closingMap = new Map(closingRows.map((r) => [r.employeeId, r]));

    return listingRows.map((r) => {
      const c = r.employeeId ? closingMap.get(r.employeeId) : undefined;
      return {
        employeeId: r.employeeId ?? null,
        advisorName: r.advisorName ?? null,
        employeeName: r.empName ?? null,
        totalActive: Number(r.totalActive ?? 0),
        totalPassive: Number(r.totalPassive ?? 0),
        agreementUploaded: Number(r.agreementUploaded ?? 0),
        agreementPending: Number(r.agreementPending ?? 0),
        closeReasonSubmitted: Number(r.closeReasonSubmitted ?? 0),
        closeReasonPending: Number(r.closeReasonPending ?? 0),
        noAgreementCount: Number(r.noAgreementCount ?? 0),
        closingCount: Number(c?.closingCount ?? 0),
        lastClosingDate: c?.lastClosingDate ?? null,
      };
    });
  }

  // ── Satılık / Kiralık type stats (price < 1M = kiralık, >= 1M = satılık) ────

  async getListingTypeStats(): Promise<{
    satilik: { active: number; passive: number; activeVolume: number; passiveVolume: number };
    kiralik: { active: number; passive: number; activeVolume: number; passiveVolume: number };
  }> {
    const rows = await db.execute(sql`
      SELECT
        CASE WHEN price::numeric >= 1000000 THEN 'satilik' ELSE 'kiralik' END AS type,
        status,
        COUNT(*)::int AS count,
        COALESCE(SUM(price::numeric), 0) AS total_volume
      FROM listings
      WHERE price IS NOT NULL AND price::numeric > 0
      GROUP BY type, status
    `);
    const result = {
      satilik: { active: 0, passive: 0, activeVolume: 0, passiveVolume: 0 },
      kiralik: { active: 0, passive: 0, activeVolume: 0, passiveVolume: 0 },
    };
    for (const r of rows.rows as any[]) {
      const key = r.type as "satilik" | "kiralik";
      if (r.status === "active") {
        result[key].active += Number(r.count);
        result[key].activeVolume += Number(r.total_volume);
      } else if (r.status === "passive") {
        result[key].passive += Number(r.count);
        result[key].passiveVolume += Number(r.total_volume);
      }
    }
    return result;
  }

  async getUnmatchedAdvisors(): Promise<{ advisorName: string; count: number }[]> {
    const rows = await db.execute(sql`
      SELECT advisor_name, COUNT(*)::int AS count
      FROM listings
      WHERE employee_id IS NULL AND advisor_name IS NOT NULL AND advisor_name <> ''
      GROUP BY advisor_name
      ORDER BY COUNT(*) DESC
    `);
    return (rows.rows as any[]).map((r) => ({
      advisorName: r.advisor_name as string,
      count: Number(r.count),
    }));
  }

  async getFuzzySuggestions(): Promise<{ advisorName: string; suggestions: { id: number; name: string; reason: string }[] }[]> {
    const unmatched = await this.getUnmatchedAdvisors();
    const empRows = await db
      .select({ id: employees.id, name: candidates.name })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .where(eq(employees.status, "active"));

    const norm = (s: string) => this.normForMatch(s);
    const tok = (s: string) => this.nameTokens(s);

    const editDist = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      return dp[m][n];
    };

    const result: { advisorName: string; suggestions: { id: number; name: string; reason: string }[] }[] = [];

    for (const { advisorName } of unmatched) {
      const csvToks = tok(advisorName);
      if (csvToks.length === 0) continue;
      const csvFirst = csvToks[0];
      const csvLast = csvToks[csvToks.length - 1];
      const suggestions: { id: number; name: string; reason: string }[] = [];
      const seen = new Set<number>();

      for (const emp of empRows) {
        if (!emp.name) continue;
        const empToks = tok(emp.name);
        if (empToks.length === 0) continue;
        const empFirst = empToks[0];
        const empLast = empToks[empToks.length - 1];

        // Same last name + first name edit distance ≤ 2
        if (empLast === csvLast && empFirst !== csvFirst) {
          const dist = editDist(csvFirst, empFirst);
          if (dist <= 2 && !seen.has(emp.id)) {
            suggestions.push({ id: emp.id, name: emp.name, reason: `Soyisim eşleşti, isim benzer (${csvFirst}→${empFirst})` });
            seen.add(emp.id);
            continue;
          }
        }

        // One first name is prefix of the other (e.g. "Damla" vs "Damlagül")
        if (empLast === csvLast && (empFirst.startsWith(csvFirst) || csvFirst.startsWith(empFirst)) && empFirst !== csvFirst) {
          if (!seen.has(emp.id)) {
            suggestions.push({ id: emp.id, name: emp.name, reason: `Soyisim eşleşti, isim önek (${csvFirst}↔${empFirst})` });
            seen.add(emp.id);
            continue;
          }
        }

        // All CSV tokens present in employee tokens (subset), not an exact match
        if (csvToks.length >= 2 && empToks.length >= 2) {
          const empSet = new Set(empToks);
          const csvSet = new Set(csvToks);
          const csvInEmp = csvToks.every((t) => empSet.has(t));
          const empInCsv = empToks.every((t) => csvSet.has(t));
          if ((csvInEmp || empInCsv) && norm(advisorName) !== norm(emp.name)) {
            if (!seen.has(emp.id)) {
              suggestions.push({ id: emp.id, name: emp.name, reason: "Token alt kümesi eşleşti" });
              seen.add(emp.id);
            }
          }
        }
      }

      if (suggestions.length > 0) result.push({ advisorName, suggestions });
    }
    return result;
  }

  async assignListingsByAdvisorName(advisorName: string, employeeId: number): Promise<number> {
    const result = await db.execute(sql`
      UPDATE listings
      SET employee_id = ${employeeId}, updated_at = now()
      WHERE employee_id IS NULL AND advisor_name = ${advisorName}
    `);
    return Number((result as any).rowCount ?? 0);
  }

  // ── Aylık ilan tarihi raporu (satılık/kiralık breakdown) ──────────────────

  async getListingDateReport(): Promise<{
    month: string;
    satilikActive: number; satilikPassive: number; satilikVolume: number;
    kiralikActive: number; kiralikPassive: number; kiralikVolume: number;
  }[]> {
    const rows = await db.execute(sql`
      SELECT
        to_char(
          CASE
            WHEN published_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(published_date, 'MM/DD/YYYY')
            WHEN published_date ~ '^[A-Za-z]'                THEN to_date(published_date, 'Mon DD, YYYY')
            ELSE NULL
          END,
          'YYYY-MM'
        ) AS month,
        CASE WHEN price::numeric >= 1000000 THEN 'satilik' ELSE 'kiralik' END AS type,
        status,
        COUNT(*)::int AS count,
        COALESCE(SUM(price::numeric), 0) AS total_volume
      FROM listings
      WHERE published_date IS NOT NULL
        AND published_date NOT LIKE '%null%'
        AND price IS NOT NULL
        AND price::numeric > 0
      GROUP BY month, type, status
      ORDER BY month DESC
      LIMIT 96
    `);
    const map = new Map<string, {
      satilikActive: number; satilikPassive: number; satilikVolume: number;
      kiralikActive: number; kiralikPassive: number; kiralikVolume: number;
    }>();
    for (const r of rows.rows as any[]) {
      if (!r.month) continue;
      if (!map.has(r.month)) map.set(r.month, { satilikActive: 0, satilikPassive: 0, satilikVolume: 0, kiralikActive: 0, kiralikPassive: 0, kiralikVolume: 0 });
      const entry = map.get(r.month)!;
      const vol = Number(r.total_volume);
      const cnt = Number(r.count);
      if (r.type === "satilik") {
        if (r.status === "active")  { entry.satilikActive  += cnt; entry.satilikVolume += vol; }
        if (r.status === "passive") { entry.satilikPassive += cnt; entry.satilikVolume += vol; }
      } else {
        if (r.status === "active")  { entry.kiralikActive  += cnt; entry.kiralikVolume += vol; }
        if (r.status === "passive") { entry.kiralikPassive += cnt; entry.kiralikVolume += vol; }
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 24)
      .map(([month, v]) => ({ month, ...v }));
  }

  // ── Feature 2: Ofis bazlı kırılım ───────────────────────────────────────────

  async getListingReportByOffice(): Promise<{
    office: string | null;
    totalActive: number;
    totalPassive: number;
    agreementUploaded: number;
    closeReasonSubmitted: number;
  }[]> {
    const rows = await db
      .select({
        office: listings.office,
        totalActive:          sql<number>`count(*) filter (where ${listings.status} = 'active')`,
        totalPassive:         sql<number>`count(*) filter (where ${listings.status} = 'passive')`,
        agreementUploaded:    sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.agreementUploadedAt} is not null)`,
        closeReasonSubmitted: sql<number>`count(*) filter (where ${listings.status} = 'passive' and ${listings.closeReasonSubmittedAt} is not null)`,
      })
      .from(listings)
      .groupBy(listings.office)
      .orderBy(sql`count(*) filter (where ${listings.status} = 'active') desc`);

    return rows.map((r) => ({
      office: r.office ?? null,
      totalActive: Number(r.totalActive ?? 0),
      totalPassive: Number(r.totalPassive ?? 0),
      agreementUploaded: Number(r.agreementUploaded ?? 0),
      closeReasonSubmitted: Number(r.closeReasonSubmitted ?? 0),
    }));
  }

  // ── Feature 3: Kalkış sebebi analizi ────────────────────────────────────────

  async getListingCloseReasonStats(): Promise<{ closeReason: string; count: number }[]> {
    const rows = await db
      .select({
        closeReason: listings.closeReason,
        count: sql<number>`count(*)`,
      })
      .from(listings)
      .where(and(
        eq(listings.status, "passive"),
        isNotNull(listings.closeReasonSubmittedAt),
        isNotNull(listings.closeReason),
      ))
      .groupBy(listings.closeReason)
      .orderBy(sql`count(*) desc`);

    return rows
      .filter((r) => r.closeReason !== null)
      .map((r) => ({ closeReason: r.closeReason!, count: Number(r.count ?? 0) }));
  }

  // ── Feature 4: Aylık trend ───────────────────────────────────────────────────

  async getListingMonthlyTrend(): Promise<{ month: string; newActive: number; newPassive: number }[]> {
    const activeRows = await db.execute(sql`
      SELECT
        to_char(
          CASE
            WHEN published_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(published_date, 'MM/DD/YYYY')
            WHEN published_date ~ '^[A-Za-z]'                THEN to_date(published_date, 'Mon DD, YYYY')
            ELSE NULL
          END,
          'YYYY-MM'
        ) AS month,
        count(*) AS cnt
      FROM listings
      WHERE published_date IS NOT NULL
        AND (published_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' OR published_date ~ '^[A-Za-z]')
        AND extract(year from CASE
          WHEN published_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(published_date, 'MM/DD/YYYY')
          WHEN published_date ~ '^[A-Za-z]'                THEN to_date(published_date, 'Mon DD, YYYY')
          ELSE NULL
        END) = extract(year from current_date)
      GROUP BY 1
      ORDER BY 1
    `);

    const passiveRows = await db.execute(sql`
      SELECT
        to_char(
          CASE
            WHEN removed_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(removed_date, 'MM/DD/YYYY')
            WHEN removed_date ~ '^[A-Za-z]'                THEN to_date(removed_date, 'Mon DD, YYYY')
            ELSE NULL
          END,
          'YYYY-MM'
        ) AS month,
        count(*) AS cnt
      FROM listings
      WHERE removed_date IS NOT NULL
        AND (removed_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' OR removed_date ~ '^[A-Za-z]')
        AND extract(year from CASE
          WHEN removed_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(removed_date, 'MM/DD/YYYY')
          WHEN removed_date ~ '^[A-Za-z]'                THEN to_date(removed_date, 'Mon DD, YYYY')
          ELSE NULL
        END) = extract(year from current_date)
      GROUP BY 1
      ORDER BY 1
    `);

    const activeMap = new Map<string, number>();
    for (const r of activeRows.rows as any[]) {
      activeMap.set(r.month, Number(r.cnt));
    }

    const passiveMap = new Map<string, number>();
    for (const r of passiveRows.rows as any[]) {
      passiveMap.set(r.month, Number(r.cnt));
    }

    const allMonths = new Set<string>([...activeMap.keys(), ...passiveMap.keys()]);
    const sorted = Array.from(allMonths).sort();

    return sorted.map((month) => ({
      month,
      newActive: activeMap.get(month) ?? 0,
      newPassive: passiveMap.get(month) ?? 0,
    }));
  }

  // ── İlan yaş grubu dağılımı (pie chart) ─────────────────────────────────────

  async getListingAgeGroups(): Promise<{
    label: string; order: number;
    count: number; volume: number;
    satilikCount: number; satilikVolume: number;
    kiralikCount: number; kiralikVolume: number;
  }[]> {
    const rows = await db.execute(sql`
      WITH parsed AS (
        SELECT
          CASE
            WHEN published_date ~ '^\d+/\d+/\d+$' THEN to_date(published_date, 'MM/DD/YYYY')
            WHEN published_date ~ '^[A-Za-z]'      THEN to_date(published_date, 'Mon DD, YYYY')
            ELSE NULL
          END AS pub_date,
          CASE WHEN price >= 1000000 THEN 'satilik' ELSE 'kiralik' END AS type,
          price AS price_num
        FROM listings
        WHERE status = 'active'
          AND published_date IS NOT NULL
          AND price IS NOT NULL
      ),
      with_group AS (
        SELECT
          CASE
            WHEN (current_date - pub_date) > 180 THEN '180+'
            WHEN (current_date - pub_date) > 150 THEN '150-180'
            WHEN (current_date - pub_date) > 120 THEN '120-150'
            WHEN (current_date - pub_date) > 90  THEN '90-120'
            WHEN (current_date - pub_date) > 60  THEN '60-90'
            WHEN (current_date - pub_date) > 30  THEN '30-60'
            ELSE '0-30'
          END AS age_group,
          type, price_num
        FROM parsed
        WHERE pub_date IS NOT NULL AND (current_date - pub_date) >= 0
      )
      SELECT age_group, type, count(*)::int AS cnt, coalesce(sum(price_num), 0) AS total_volume
      FROM with_group
      GROUP BY age_group, type
    `);

    const ORDER = ["0-30","30-60","60-90","90-120","120-150","150-180","180+"];
    const map = new Map<string, { count: number; volume: number; satilikCount: number; satilikVolume: number; kiralikCount: number; kiralikVolume: number }>();
    for (const label of ORDER) map.set(label, { count: 0, volume: 0, satilikCount: 0, satilikVolume: 0, kiralikCount: 0, kiralikVolume: 0 });

    for (const r of rows.rows as any[]) {
      const e = map.get(r.age_group);
      if (!e) continue;
      const cnt = Number(r.cnt); const vol = Number(r.total_volume);
      e.count += cnt; e.volume += vol;
      if (r.type === "satilik") { e.satilikCount += cnt; e.satilikVolume += vol; }
      else                      { e.kiralikCount += cnt; e.kiralikVolume += vol; }
    }

    return ORDER.map((label, order) => ({ label, order, ...map.get(label)! }));
  }

  // ── 90+ gün aktif ilanlar ───────────────────────────────────────────────────

  async getListingsOver90Days(): Promise<{
    id: number;
    listingNumber: string;
    advisorName: string | null;
    employeeName: string | null;
    office: string | null;
    price: string | null;
    publishedDate: string | null;
    daysActive: number;
  }[]> {
    const rows = await db.execute(sql`
      SELECT
        l.id,
        l.listing_number,
        l.advisor_name,
        c.name AS employee_name,
        l.office,
        l.price,
        l.published_date,
        (current_date - CASE
          WHEN l.published_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(l.published_date, 'MM/DD/YYYY')
          WHEN l.published_date ~ '^[A-Za-z]'                THEN to_date(l.published_date, 'Mon DD, YYYY')
          ELSE NULL
        END)::int AS days_active
      FROM listings l
      LEFT JOIN employees e ON l.employee_id = e.id
      LEFT JOIN candidates c ON e.candidate_id = c.id
      WHERE l.status = 'active'
        AND l.published_date IS NOT NULL
        AND (l.published_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' OR l.published_date ~ '^[A-Za-z]')
        AND (current_date - CASE
          WHEN l.published_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(l.published_date, 'MM/DD/YYYY')
          WHEN l.published_date ~ '^[A-Za-z]'                THEN to_date(l.published_date, 'Mon DD, YYYY')
          ELSE NULL
        END) > 90
      ORDER BY days_active DESC
    `);
    return (rows.rows as any[]).map(r => ({
      id: Number(r.id),
      listingNumber: r.listing_number,
      advisorName: r.advisor_name ?? null,
      employeeName: r.employee_name ?? null,
      office: r.office ?? null,
      price: r.price ?? null,
      publishedDate: r.published_date ?? null,
      daysActive: Number(r.days_active),
    }));
  }

  // ── Feature 5 & 6: Otomatik hatırlatma ──────────────────────────────────────

  async runListingReminders(agreementDays: number, closeReasonDays: number): Promise<{
    agreementListings: Listing[];
    closeReasonListings: Listing[];
  }> {
    const agreementThreshold = new Date(Date.now() - agreementDays * 24 * 60 * 60 * 1000);
    const closeReasonThreshold = new Date(Date.now() - closeReasonDays * 24 * 60 * 60 * 1000);

    const agreementRows = await db.select().from(listings).where(and(
      eq(listings.status, "active"),
      isNull(listings.agreementUploadedAt),
      isNotNull(listings.notifiedNewAt),
      isNotNull(listings.employeeId),
      or(
        isNull(sql`${listings}.agreement_reminder_sent_at`),
        sql`${listings}.agreement_reminder_sent_at < ${agreementThreshold}`,
      ),
    ));

    const closeReasonRows = await db.select().from(listings).where(and(
      eq(listings.status, "passive"),
      isNull(listings.closeReasonSubmittedAt),
      isNotNull(listings.notifiedPassiveAt),
      isNotNull(listings.employeeId),
      or(
        isNull(sql`${listings}.close_reason_reminder_sent_at`),
        sql`${listings}.close_reason_reminder_sent_at < ${closeReasonThreshold}`,
      ),
    ));

    return {
      agreementListings: agreementRows,
      closeReasonListings: closeReasonRows,
    };
  }

  async markListingAgreementReminderSent(id: number): Promise<void> {
    await db.execute(sql`
      UPDATE listings SET agreement_reminder_sent_at = now(), updated_at = now()
      WHERE id = ${id}
    `);
  }

  async markListingCloseReasonReminderSent(id: number): Promise<void> {
    await db.execute(sql`
      UPDATE listings SET close_reason_reminder_sent_at = now(), updated_at = now()
      WHERE id = ${id}
    `);
  }

  // ── Feature 7: İlan yaşı — no storage needed (computed client-side) ──────────

  // ── Feature 8: Fiyat değişim takibi ─────────────────────────────────────────

  async getListingPriceHistory(listingId: number): Promise<{
    id: number;
    listingId: number;
    oldPrice: string | null;
    newPrice: string | null;
    changedAt: Date;
  }[]> {
    const rows = await db.execute(sql`
      SELECT id, listing_id, old_price, new_price, changed_at
      FROM listing_price_history
      WHERE listing_id = ${listingId}
      ORDER BY changed_at DESC
    `);
    return (rows.rows as any[]).map((r) => ({
      id: r.id,
      listingId: r.listing_id,
      oldPrice: r.old_price !== null ? String(r.old_price) : null,
      newPrice: r.new_price !== null ? String(r.new_price) : null,
      changedAt: r.changed_at,
    }));
  }

  async getCapAchievementReport(): Promise<{
    employeeId: number;
    name: string;
    kwuid: string | null;
    status: string;
    capAmount: number;
    capUsed: number;
    periodStart: string;
    achievedAt: string | null;
    achievementDays: number | null;
    hasCapped: boolean;
  }[]> {
    const TR_MONTHS: Record<string, number> = {
      "Ocak": 1, "Şubat": 2, "Mart": 3, "Nisan": 4, "Mayıs": 5, "Haziran": 6,
      "Temmuz": 7, "Ağustos": 8, "Eylül": 9, "Ekim": 10, "Kasım": 11, "Aralık": 12,
    };

    const allEmps = await this.getEmployees();
    const empsWithCap = allEmps.filter((e) => e.capMonth && e.status === "active");
    if (empsWithCap.length === 0) return [];

    const now = new Date();
    const empIds = empsWithCap.map((e) => e.id);

    // Pre-load all cap settings in one query
    const allCapSettings = await db.select().from(capSettings);
    const capSettingsByYear: Record<number, number> = {};
    for (const r of allCapSettings) capSettingsByYear[r.year] = parseFloat(r.amount);

    // Batch query: all closing rows for all capped employees (filter by date in memory)
    const allClosingRows = await db
      .select({
        employeeId: closingAgents.employeeId,
        effDate: sql<string>`COALESCE(${closingAgents.closingDate}::text, ${closings.closingDate}::text)`,
        bm: closingAgents.marketCenterActual,
      })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .innerJoin(closings, eq(closingSides.closingId, closings.id))
      .where(
        and(
          inArray(closingAgents.employeeId, empIds),
          sql`COALESCE(${closingAgents.closingDate}, ${closings.closingDate}) IS NOT NULL`,
        )
      );

    // Batch query: all prepayments for all capped employees
    const allPrepayRows = await db
      .select({ employeeId: officeExpenses.employeeId, date: officeExpenses.date, amount: officeExpenses.amount })
      .from(officeExpenses)
      .where(
        and(
          eq(officeExpenses.type, "income"),
          eq(officeExpenses.category, BM_PREPAYMENT_CATEGORY),
          inArray(officeExpenses.employeeId, empIds),
        )
      );

    // Group in memory by employeeId
    const closingsByEmp: Record<number, { effDate: string; bm: string | null }[]> = {};
    for (const row of allClosingRows) {
      if (row.employeeId == null) continue;
      (closingsByEmp[row.employeeId] ??= []).push(row);
    }
    const prepaysByEmp: Record<number, { date: string; amount: string | null }[]> = {};
    for (const row of allPrepayRows) {
      if (row.employeeId == null) continue;
      (prepaysByEmp[row.employeeId] ??= []).push(row);
    }

    const results: any[] = [];

    for (const emp of empsWithCap) {
      const trimmed = (emp.capMonth ?? "").trim();
      let capMonthNum: number;
      if (TR_MONTHS[trimmed]) {
        capMonthNum = TR_MONTHS[trimmed];
      } else {
        const parts = trimmed.split("-");
        capMonthNum = parseInt(parts[1] ?? parts[0], 10);
      }
      if (isNaN(capMonthNum) || capMonthNum < 1 || capMonthNum > 12) continue;

      const currentMonth = now.getMonth() + 1;
      const currentYear  = now.getFullYear();
      const currentCapYear = currentMonth >= capMonthNum ? currentYear : currentYear - 1;

      // compute both current and previous period
      const periodsToCompute = [currentCapYear, currentCapYear - 1];

      const empAny = emp as any;
      const empClosings = closingsByEmp[emp.id] ?? [];
      const empPrepays  = prepaysByEmp[emp.id]  ?? [];
      const manualAdj   = parseFloat(empAny.capManualAdjustment ?? "0");

      for (const capYear of periodsToCompute) {
        const periodStart    = new Date(capYear, capMonthNum - 1, 1);
        const periodEnd      = new Date(capYear + 1, capMonthNum - 1, 1);
        const periodStartYMD = periodStart.toISOString().split("T")[0];
        const periodEndYMD   = periodEnd.toISOString().split("T")[0];

        const empCapValue = emp.capValue ? parseFloat(emp.capValue) : null;
        const capAmount: number | null = (empCapValue && empCapValue > 0) ? empCapValue : (capSettingsByYear[capYear] ?? null);
        if (!capAmount) continue;

        const closingRows = empClosings.filter((r) => r.effDate >= periodStartYMD && r.effDate < periodEndYMD);
        const prepayRows  = empPrepays.filter((r)  => r.date   >= periodStartYMD && r.date   < periodEndYMD);

        // skip previous period if no data at all (employee wasn't here yet)
        if (capYear < currentCapYear && closingRows.length === 0 && prepayRows.length === 0) continue;

        const allEntries: { date: Date; amount: number }[] = [
          ...prepayRows.map((p) => ({ date: new Date(p.date), amount: parseFloat(p.amount ?? "0") })),
          ...closingRows.map((r) => ({ date: new Date(r.effDate), amount: parseFloat(r.bm ?? "0") })),
        ].sort((a, b) => a.date.getTime() - b.date.getTime());

        // manual adj only applies to current period
        const adj = capYear === currentCapYear ? manualAdj : 0;
        let running = adj;
        let achievedAt: Date | null = null;

        for (const entry of allEntries) {
          running += entry.amount;
          if (running >= capAmount && !achievedAt) {
            achievedAt = entry.date;
            break;
          }
        }

        const capUsed = allEntries.reduce((s, e) => s + e.amount, 0) + adj;
        const achievementDays = achievedAt
          ? Math.round((achievedAt.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        results.push({
          employeeId: emp.id,
          name: empAny.candidate?.name ?? `#${emp.id}`,
          kwuid: empAny.kwuid ?? null,
          status: emp.status ?? "active",
          capAmount,
          capUsed,
          periodStart: periodStartYMD,
          achievedAt: achievedAt ? achievedAt.toISOString().split("T")[0] : null,
          achievementDays,
          hasCapped: capUsed >= capAmount,
        });
      }
    }

    return results.sort((a, b) => {
      if (a.hasCapped && !b.hasCapped) return -1;
      if (!a.hasCapped && b.hasCapped) return 1;
      if (a.achievementDays !== null && b.achievementDays !== null) return a.achievementDays - b.achievementDays;
      return b.capUsed / b.capAmount - a.capUsed / a.capAmount;
    });
  }

  // ── Advisor batch self-service ────────────────────────────────────────────────

  async ensureAdvisorToken(employeeId: number): Promise<string> {
    const [emp] = await db.select({ advisorToken: employees.advisorToken }).from(employees).where(eq(employees.id, employeeId));
    if (emp?.advisorToken) return emp.advisorToken;
    const token = randomBytes(20).toString("hex");
    await db.update(employees).set({ advisorToken: token } as any).where(eq(employees.id, employeeId));
    return token;
  }

  async getAdvisorByToken(token: string): Promise<EmployeeWithRelations | undefined> {
    const [row] = await db.select({ id: employees.id }).from(employees).where(eq(employees.advisorToken, token));
    if (!row) return undefined;
    return this.getEmployee(row.id);
  }

  async getAdvisorPendingListings(employeeId: number): Promise<{ active: Listing[]; passive: Listing[] }> {
    const active = await db.select().from(listings).where(
      and(eq(listings.employeeId, employeeId), eq(listings.status, "active"), isNull(listings.agreementUploadedAt))
    ).orderBy(desc(listings.updatedAt));
    const passive = await db.select().from(listings).where(
      and(eq(listings.employeeId, employeeId), eq(listings.status, "passive"), isNull(listings.closeReasonSubmittedAt))
    ).orderBy(desc(listings.updatedAt));
    return { active, passive };
  }

  async toggleListingNoAgreement(listingId: number, employeeId: number): Promise<Listing | null> {
    const [row] = await db.select().from(listings).where(
      and(eq(listings.id, listingId), eq(listings.employeeId, employeeId))
    );
    if (!row) return null;
    const newVal = row.noAgreementAt ? null : new Date();
    const [updated] = await db.update(listings)
      .set({ noAgreementAt: newVal } as any)
      .where(eq(listings.id, listingId))
      .returning();
    return updated ?? null;
  }

  async getAllAdvisorPendingCounts(): Promise<Record<number, { active: number; passive: number }>> {
    const rows = await db
      .select({ employeeId: listings.employeeId, status: listings.status })
      .from(listings)
      .where(
        and(
          isNotNull(listings.employeeId),
          or(
            and(eq(listings.status, "active"), isNull(listings.agreementUploadedAt), isNull(listings.noAgreementAt)),
            and(eq(listings.status, "passive"), isNull(listings.closeReasonSubmittedAt)),
          )
        )
      );
    const result: Record<number, { active: number; passive: number }> = {};
    for (const row of rows) {
      if (row.employeeId == null) continue;
      result[row.employeeId] ??= { active: 0, passive: 0 };
      if (row.status === "active") result[row.employeeId].active++;
      else result[row.employeeId].passive++;
    }
    return result;
  }

  async markAdvisorNotified(employeeId: number, msgId?: string | null): Promise<void> {
    await db.update(employees).set({
      advisorLastNotifiedAt: new Date(),
      ...(msgId !== undefined ? { advisorNotifyMsgId: msgId } : {}),
    } as any).where(eq(employees.id, employeeId));
  }

  async markAdvisorEmailNotified(employeeId: number): Promise<void> {
    await db.update(employees).set({
      advisorLastEmailNotifiedAt: new Date(),
    } as any).where(eq(employees.id, employeeId));
  }
}

export const storage = new DatabaseStorage();
