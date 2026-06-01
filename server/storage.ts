import { db } from "./db";
import {
  jobs, candidates, applications, stageHistory, interviews, offers, candidateNotes,
  users, jobAssignments, applicationDocuments, tasks, employees,
  capSettings, closings, closingSides, closingAgents, interviewTargets,
  officeExpenses,
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
  type CapSetting, type Closing, type ClosingSide, type ClosingAgent,
  type CapStatus, type ClosingWithDetails, type InterviewTarget,
  type OfficeExpense, type InsertOfficeExpense,
} from "@shared/schema";
import { eq, desc, asc, count, sql, gte, lte, lt, and, or, isNull, isNotNull, inArray, notInArray } from "drizzle-orm";
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
  }>): Promise<void>;
  updateClosingSide(id: number, data: Partial<{ kasa: string; nakit: string; banka: string }>): Promise<void>;
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

    // Sum marketCenterActual from completed closingAgents for this employee in current period
    const agentRows = await db
      .select({ marketCenterActual: closingAgents.marketCenterActual })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .innerJoin(closings, eq(closingSides.closingId, closings.id))
      .where(
        and(
          eq(closingAgents.employeeId, employeeId),
          eq(closings.status, "completed"),
          isNotNull(closings.closingDate),
          gte(closings.closingDate, periodStart)
        )
      );

    const capUsedFromClosings = agentRows.reduce((sum, r) => sum + parseFloat(r.marketCenterActual ?? "0"), 0);
    const manualAdj = parseFloat((emp as any).capManualAdjustment ?? "0");
    const capUsed = capUsedFromClosings + manualAdj;
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
          eq(closings.status, "completed"),
          isNotNull(closings.closingDate),
          gte(closings.closingDate, prevPeriodStart),
          lt(closings.closingDate, periodStart)
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
    const rows = await db
      .select({
        closingId: closings.id,
        propertyAddress: closings.propertyAddress,
        dealCategory: closings.dealCategory,
        dealType: closings.dealType,
        saleValue: closings.saleValue,
        employeeNet: closingAgents.employeeNet,
        closingDate: closings.closingDate,
        sideType: closingSides.sideType,
        status: closings.status,
      })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .innerJoin(closings, eq(closingSides.closingId, closings.id))
      .where(eq(closingAgents.employeeId, employeeId))
      .orderBy(desc(closings.closingDate));
    return rows;
  }

  async getChurnReport(): Promise<ChurnRow[]> {
    const now = new Date();
    const cut3m = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const cut6m = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Fetch all active employees + all their completed closings in one query
    const rows = await db
      .select({
        empId: employees.id,
        name: candidates.name,
        kwuid: employees.kwuid,
        category: candidates.category,
        startDate: employees.startDate,
        closingDate: closings.closingDate,
      })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .leftJoin(closingAgents, eq(closingAgents.employeeId, employees.id))
      .leftJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
      .leftJoin(closings, and(
        eq(closingSides.closingId, closings.id),
        eq(closings.status, "completed"),
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
  }>): Promise<void> {
    if (Object.keys(data).length === 0) return;
    await db.update(closingAgents).set(data as any).where(eq(closingAgents.id, id));
  }

  async updateClosingSide(id: number, data: Partial<{ kasa: string; nakit: string; banka: string }>): Promise<void> {
    if (Object.keys(data).length === 0) return;
    await db.update(closingSides).set(data as any).where(eq(closingSides.id, id));
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
              ukRateSnapshot = emp.uretkenlikKocluguOran === "10%" ? 10 : 5;
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
              ukRateSnapshot = emp.uretkenlikKocluguOran === "10%" ? 10 : 5;
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
              ukRateSnapshot = emp.uretkenlikKocluguOran === "10%" ? 10 : 5;
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
              ukRateSnapshot = emp.uretkenlikKocluguOran === "10%" ? 10 : 5;
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

    const completedRows = await db
      .select({
        closingId: closings.id,
        saleValue: closings.saleValue,
        dealCategory: closings.dealCategory,
        dealType: closings.dealType,
        il: closings.il,
        ilce: closings.ilce,
        closingDate: closings.closingDate,
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
        eq(closings.status, "completed"),
        isNotNull(closings.closingDate),
        gte(closings.closingDate, startDate),
        lte(closings.closingDate, end),
        ...(completedAgentCond ? [completedAgentCond] : []),
        ...(dealCategory ? [eq(closings.dealCategory, dealCategory)] : []),
        ...(dealType ? [eq(closings.dealType, dealType)] : []),
      ));

    const expectedRows = await db
      .select({ closingId: closings.id, saleValue: closings.saleValue, bhbShare: closingAgents.bhbShare, marketCenterActual: closingAgents.marketCenterActual, employeeId: closingAgents.employeeId })
      .from(closings)
      .leftJoin(closingSides, eq(closingSides.closingId, closings.id))
      .leftJoin(closingAgents, eq(closingAgents.closingSideId, closingSides.id))
      .where(and(
        eq(closings.status, "expected"),
        ...(expectedAgentCond ? [expectedAgentCond] : []),
      ));

    const empRows = await db
      .select({ id: employees.id, kwuid: employees.kwuid, name: candidates.name })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id));
    const empMap = new Map(empRows.map(e => [e.id, { name: e.name ?? `#${e.id}`, kwuid: e.kwuid ?? "" }]));

    // ── Completed summary ──
    const cIds = new Set<number>();
    let completedVolume = 0, completedBHB = 0, completedBM = 0;
    for (const r of completedRows) {
      if (!cIds.has(r.closingId)) { completedVolume += parseFloat(r.saleValue ?? "0"); cIds.add(r.closingId); }
      if (r.bhbShare) completedBHB += parseFloat(r.bhbShare);
      if (r.marketCenterActual) completedBM += parseFloat(r.marketCenterActual);
    }

    // ── Side type counts ──
    const sideTypeSets: Record<string, Set<number>> = { buyer: new Set(), seller: new Set(), referral: new Set() };
    for (const r of completedRows) {
      if (r.sideId && r.sideType) {
        if (!sideTypeSets[r.sideType]) sideTypeSets[r.sideType] = new Set();
        sideTypeSets[r.sideType].add(r.sideId);
      }
    }
    const bySideType = {
      buyer: sideTypeSets.buyer.size,
      seller: sideTypeSets.seller.size,
      referral: sideTypeSets.referral.size,
    };

    // ── Expected summary ──
    const eIds = new Set<number>();
    let expectedVolume = 0, expectedBHB = 0, expectedBM = 0;
    for (const r of expectedRows) {
      if (!eIds.has(r.closingId)) { expectedVolume += parseFloat(r.saleValue ?? "0"); eIds.add(r.closingId); }
      if (r.bhbShare) expectedBHB += parseFloat(r.bhbShare);
      if (r.marketCenterActual) expectedBM += parseFloat(r.marketCenterActual);
    }

    // ── Monthly trend ──
    const monthMap = new Map<string, { volume: number; bhb: number; bm: number; count: number; ids: Set<number> }>();
    for (const r of completedRows) {
      if (!r.closingDate) continue;
      const d = new Date(r.closingDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(key)) monthMap.set(key, { volume: 0, bhb: 0, bm: 0, count: 0, ids: new Set() });
      const m = monthMap.get(key)!;
      if (!m.ids.has(r.closingId)) { m.volume += parseFloat(r.saleValue ?? "0"); m.count++; m.ids.add(r.closingId); }
      if (r.bhbShare) m.bhb += parseFloat(r.bhbShare);
      if (r.marketCenterActual) m.bm += parseFloat(r.marketCenterActual);
    }
    const monthlyTrend = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, volume: v.volume, bhb: v.bhb, bm: v.bm, count: v.count }));

    // ── By agent ──
    const agentMap = new Map<number, { bhb: number; bm: number; net: number; ids: Set<number> }>();
    for (const r of completedRows) {
      if (!r.employeeId) continue;
      if (!agentMap.has(r.employeeId)) agentMap.set(r.employeeId, { bhb: 0, bm: 0, net: 0, ids: new Set() });
      const a = agentMap.get(r.employeeId)!;
      a.ids.add(r.closingId);
      if (r.bhbShare) a.bhb += parseFloat(r.bhbShare);
      if (r.marketCenterActual) a.bm += parseFloat(r.marketCenterActual);
      if (r.employeeNet) a.net += parseFloat(r.employeeNet);
    }
    const byAgent = Array.from(agentMap.entries())
      .map(([id, v]) => ({ name: empMap.get(id)?.name ?? `#${id}`, kwuid: empMap.get(id)?.kwuid ?? "", bhb: v.bhb, bm: v.bm, net: v.net, count: v.ids.size }))
      .sort((a, b) => b.bhb - a.bhb);

    // ── By category ──
    const catMap = new Map<string, { count: number; volume: number; bhb: number; ids: Set<number> }>();
    for (const r of completedRows) {
      const cat = r.dealCategory ?? "Satış";
      if (!catMap.has(cat)) catMap.set(cat, { count: 0, volume: 0, bhb: 0, ids: new Set() });
      const c = catMap.get(cat)!;
      if (!c.ids.has(r.closingId)) { c.count++; c.volume += parseFloat(r.saleValue ?? "0"); c.ids.add(r.closingId); }
      if (r.bhbShare) c.bhb += parseFloat(r.bhbShare);
    }
    const byCategory = Array.from(catMap.entries()).map(([category, v]) => ({ category, count: v.count, volume: v.volume, bhb: v.bhb }));

    // ── By deal type ──
    const dealTypeMap = new Map<string, { count: number; volume: number; bhb: number; ids: Set<number> }>();
    for (const r of completedRows) {
      const dt = r.dealType ?? "Diğer";
      if (!dealTypeMap.has(dt)) dealTypeMap.set(dt, { count: 0, volume: 0, bhb: 0, ids: new Set() });
      const d = dealTypeMap.get(dt)!;
      if (!d.ids.has(r.closingId)) { d.count++; d.volume += parseFloat(r.saleValue ?? "0"); d.ids.add(r.closingId); }
      if (r.bhbShare) d.bhb += parseFloat(r.bhbShare);
    }
    const byDealType = Array.from(dealTypeMap.entries())
      .map(([dealType, v]) => ({ dealType, count: v.count, volume: v.volume, bhb: v.bhb }))
      .sort((a, b) => b.count - a.count);

    // ── By İl ──
    const geoGroup = (field: string | null | undefined, map: Map<string, { count: number; volume: number; ids: Set<number> }>, r: typeof completedRows[0]) => {
      const key = field || "Belirtilmemiş";
      if (!map.has(key)) map.set(key, { count: 0, volume: 0, ids: new Set() });
      const v = map.get(key)!;
      if (!v.ids.has(r.closingId)) { v.count++; v.volume += parseFloat(r.saleValue ?? "0"); v.ids.add(r.closingId); }
    };
    const ilMap = new Map<string, { count: number; volume: number; ids: Set<number> }>();
    const ilceMap = new Map<string, { count: number; volume: number; ids: Set<number> }>();
    for (const r of completedRows) {
      geoGroup(r.il, ilMap, r);
      geoGroup(r.ilce, ilceMap, r);
    }
    const toGeoArr = (map: Map<string, { count: number; volume: number; ids: Set<number> }>, keyName: string) =>
      Array.from(map.entries()).map(([k, v]) => ({ [keyName]: k, count: v.count, volume: v.volume }))
        .sort((a: any, b: any) => b.volume - a.volume).slice(0, 10);

    const byIl   = toGeoArr(ilMap,   "il");
    const byIlce = toGeoArr(ilceMap, "ilce");

    // ── Average sale time (only closings with durationDays > 0) ──
    const durationById = new Map<number, { days: number; ilce: string | null; category: string }>();
    for (const r of completedRows) {
      if (!durationById.has(r.closingId) && r.durationDays && r.durationDays > 0) {
        durationById.set(r.closingId, { days: r.durationDays, ilce: r.ilce ?? null, category: r.dealCategory ?? "Satış" });
      }
    }
    const allDurations = Array.from(durationById.values());

    const calcAvg = (items: typeof allDurations) =>
      items.length > 0 ? Math.round(items.reduce((s, d) => s + d.days, 0) / items.length) : null;

    const salesDurations  = allDurations.filter(d => d.category === "Satış");
    const rentalDurations = allDurations.filter(d => d.category === "Kiralık");
    const avgSaleDays   = calcAvg(salesDurations);
    const avgRentalDays = calcAvg(rentalDurations);

    const buildIlceMap = (items: typeof allDurations) => {
      const map = new Map<string, { total: number; count: number }>();
      for (const d of items) {
        const key = d.ilce || "Belirtilmemiş";
        if (!map.has(key)) map.set(key, { total: 0, count: 0 });
        map.get(key)!.total += d.days;
        map.get(key)!.count++;
      }
      return Array.from(map.entries())
        .map(([ilce, v]) => ({ ilce, avg: Math.round(v.total / v.count), count: v.count }))
        .filter(r => r.count >= 3)
        .sort((a, b) => a.avg - b.avg);
    };

    const avgSaleDaysByIlce   = buildIlceMap(salesDurations);
    const avgRentalDaysByIlce = buildIlceMap(rentalDurations);

    return {
      completedCount: cIds.size, expectedCount: eIds.size,
      completedVolume, expectedVolume,
      completedBHB, expectedBHB, completedBM, expectedBM,
      bySideType,
      monthlyTrend, byAgent, byCategory, byDealType, byIl, byIlce,
      avgSaleDays, avgSaleDaysByIlce, avgRentalDays, avgRentalDaysByIlce,
    };
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

  async getCoachingStats(startDate: Date, endDate: Date, coachUserId?: number) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const ukEmps = await db
      .select({ emp: employees, cand: candidates })
      .from(employees)
      .leftJoin(candidates, eq(employees.candidateId, candidates.id))
      .where(and(
        eq(employees.status, "active"),
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

    const [rows, capRows, lastClosingRows, coachUsers, capSettingRows] = await Promise.all([
      // Closings in the selected date range
      db.select({
        closingId: closings.id,
        saleValue: closings.saleValue,
        closingDate: closings.closingDate,
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
        eq(closings.status, "completed"),
        isNotNull(closings.closingDate),
        gte(closings.closingDate, startDate),
        lte(closings.closingDate, end),
        inArray(closingAgents.employeeId, studentIds),
      )),

      // Cap period closings in batch (from earliest prev period start)
      minPrevStart
        ? db.select({
            employeeId: closingAgents.employeeId,
            marketCenterActual: closingAgents.marketCenterActual,
            closingDate: closings.closingDate,
          })
          .from(closingAgents)
          .innerJoin(closingSides, eq(closingAgents.closingSideId, closingSides.id))
          .innerJoin(closings, eq(closingSides.closingId, closings.id))
          .where(and(
            inArray(closingAgents.employeeId, studentIds),
            eq(closings.status, "completed"),
            isNotNull(closings.closingDate),
            gte(closings.closingDate, minPrevStart),
          ))
        : Promise.resolve([] as { employeeId: number | null; marketCenterActual: string | null; closingDate: Date | null }[]),

      // Last closing date per student via GROUP BY MAX (avoids fetching all rows)
      db.select({
        employeeId: closingAgents.employeeId,
        lastDate: sql<string>`MAX(${closings.closingDate})`,
      })
      .from(closingAgents)
      .innerJoin(closingSides, eq(closingSides.id, closingAgents.closingSideId))
      .innerJoin(closings, eq(closings.id, closingSides.closingId))
      .where(and(
        inArray(closingAgents.employeeId, studentIds),
        eq(closings.status, "completed"),
        isNotNull(closings.closingDate),
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
      const empRows = rows.filter(r => {
        if (r.employeeId !== empId) return false;
        if (ukEndDateStr && e.emp.uretkenlikKoclugu && r.closingDate) {
          return new Date(r.closingDate) <= new Date(ukEndDateStr);
        }
        return true;
      });
      const closingIds = new Set(empRows.map(r => r.closingId));

      const seenVol = new Set<number>();
      let totalVolume = 0;
      for (const r of empRows) {
        if (!seenVol.has(r.closingId)) { totalVolume += parseFloat(r.saleValue ?? "0"); seenVol.add(r.closingId); }
      }
      let totalBHB = 0, totalBM = 0, totalNet = 0;
      for (const r of empRows) {
        if (r.bhbShare) totalBHB += parseFloat(r.bhbShare);
        if (r.marketCenterActual) totalBM += parseFloat(r.marketCenterActual);
        if (r.employeeNet) totalNet += parseFloat(r.employeeNet);
      }

      const bySideType = {
        buyer:    new Set(empRows.filter(r => r.sideType === "buyer").map(r => r.closingId)).size,
        seller:   new Set(empRows.filter(r => r.sideType === "seller").map(r => r.closingId)).size,
        referral: new Set(empRows.filter(r => r.sideType === "referral").map(r => r.closingId)).size,
      };

      const monthMap = new Map<string, { count: number; bhb: number; volume: number; ids: Set<number> }>();
      for (const r of empRows) {
        if (!r.closingDate) continue;
        const d = new Date(r.closingDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthMap.has(key)) monthMap.set(key, { count: 0, bhb: 0, volume: 0, ids: new Set() });
        const m = monthMap.get(key)!;
        if (!m.ids.has(r.closingId)) { m.count++; m.volume += parseFloat(r.saleValue ?? "0"); m.ids.add(r.closingId); }
        if (r.bhbShare) m.bhb += parseFloat(r.bhbShare);
      }
      const monthlyTrend = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, count: v.count, bhb: v.bhb, volume: v.volume }));

      const dealTypeMap = new Map<string, Set<number>>();
      const catMap = new Map<string, Set<number>>();
      for (const r of empRows) {
        const dt = r.dealType ?? "Diğer";
        if (!dealTypeMap.has(dt)) dealTypeMap.set(dt, new Set());
        dealTypeMap.get(dt)!.add(r.closingId);
        const cat = r.dealCategory ?? "Satış";
        if (!catMap.has(cat)) catMap.set(cat, new Set());
        catMap.get(cat)!.add(r.closingId);
      }
      const byDealType = Array.from(dealTypeMap.entries()).map(([dealType, s]) => ({ dealType, count: s.size })).sort((a, b) => b.count - a.count);
      const byCategory = Array.from(catMap.entries()).map(([category, s]) => ({ category, count: s.size }));

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
        totalClosings: closingIds.size,
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
  }): Promise<OfficeExpense[]> {
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

    return db
      .select()
      .from(officeExpenses)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(officeExpenses.date), desc(officeExpenses.createdAt));
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
}

export const storage = new DatabaseStorage();
