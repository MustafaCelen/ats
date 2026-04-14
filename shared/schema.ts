import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// ── Users & Roles ────────────────────────────────────────────────────────────
export const USER_ROLES = ["admin", "hiring_manager", "assistant"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("hiring_manager"), // admin | hiring_manager
  googleId: text("google_id").unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Job assignments — which hiring managers own which jobs
export const jobAssignments = pgTable("job_assignments", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type PublicUser = Omit<User, "passwordHash" | "googleAccessToken" | "googleRefreshToken"> & {
  hasGoogleCalendar: boolean;
};
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;

// Matches reference APPLICATION_STAGES pattern (adapted to lowercase)
export const APPLICATION_STAGES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "myk_training",  // Post-hire: MYK training follow-up
  "account_setup", // Post-hire: mail/system account setup
  "documents",     // Post-hire: 6 required documents
  "rejected",
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

// Display labels for stages (used in UI)
export const STAGE_LABELS: Record<string, string> = {
  applied:      "Başvuru",
  screening:    "Randevu Oluşturma",
  interview:    "Randevu",
  offer:        "Sözleşme Önerildi",
  hired:        "Sözleşme İmzalandı",
  myk_training: "MYK Eğitimi",
  account_setup:"Hesap Kurulumu",
  documents:    "Belgeler",
  rejected:     "Reddedildi",
};

// Required documents for the "documents" stage
export const REQUIRED_DOCUMENTS = [
  { key: "doc1", label: "Belge 1" },
  { key: "doc2", label: "Belge 2" },
  { key: "doc3", label: "Belge 3" },
  { key: "doc4", label: "Belge 4" },
  { key: "doc5", label: "Belge 5" },
  { key: "doc6", label: "Belge 6" },
] as const;
export type RequiredDocumentKey = (typeof REQUIRED_DOCUMENTS)[number]["key"];

export const JOB_STATUSES = ["draft", "open", "closed", "archived"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const INTERVIEW_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const OFFER_STATUSES = ["draft", "pending_approval", "approved", "sent", "accepted", "rejected"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  department: text("department").notNull().default("General"),
  company: text("company").notNull(),
  location: text("location").notNull(),
  description: text("description").notNull(),
  requirements: text("requirements").notNull(),
  salaryRange: text("salary_range"),
  status: text("status").notNull().default("open"), // draft | open | closed | archived
  createdAt: timestamp("created_at").defaultNow(),
});

export const CANDIDATE_CATEGORIES = ["K0", "K1", "K2"] as const;
export type CandidateCategory = (typeof CANDIDATE_CATEGORIES)[number];

export const LICENSE_STATUSES = ["unlicensed", "pending", "licensed"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const TURKEY_CITIES = [
  "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya",
  "Gaziantep", "Mersin", "Diyarbakır", "Kayseri", "Eskişehir", "Samsun",
  "Denizli", "Trabzon", "Bodrum", "Alanya", "Didim", "Çeşme", "Diğer",
] as const;

export const REAL_ESTATE_BRANDS = [
  "RE/MAX", "Century 21", "ERA", "Coldwell Banker", "Keller Williams",
  "Realty World", "Bağımsız",
  "Yerel Ofis", "Diğer",
] as const;

export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  category: text("category").notNull().default("K0"), // K0 | K1 | K2
  currentBrand: text("current_brand"),           // K1: current agency brand
  licenseStatus: text("license_status").default("unlicensed"), // unlicensed | pending | licensed
  licenseNumber: text("license_number"),
  city: text("city"),                            // city in Turkey
  district: text("district"),                    // district/neighbourhood
  specialization: text("specialization").array().default([]), // Residential | Commercial | Land | Luxury
  languages: text("languages").array().default([]),           // Turkish | English | Arabic | Russian ...
  socialMedia: text("social_media"),             // LinkedIn URL or Instagram
  referredBy: text("referred_by"),               // who referred this candidate
  experience: integer("experience").default(0),  // years in real estate
  resumeText: text("resume_text"),               // notes / background
  tags: text("tags").array().default([]),
  expectedStartMonth: text("expected_start_month"),  // e.g. "2025-03"
  address: text("address"),                          // open address (street, building, etc.)
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  candidateId: integer("candidate_id").notNull(),
  status: text("status").notNull().default("applied"),
  notes: text("notes"),
  score: integer("score").default(0),
  appliedAt: timestamp("applied_at").defaultNow(),
});

// StageHistory — tracks every stage transition (equivalent to reference's StageHistory model)
export const stageHistory = pgTable("stage_history", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull(),
  candidateId: integer("candidate_id").notNull(),
  jobId: integer("job_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  enteredAt: timestamp("entered_at").defaultNow(),
});

// Interview — scheduled interviews linked to an application
export const interviews = pgTable("interviews", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull(),
  jobId: integer("job_id").notNull(),
  candidateId: integer("candidate_id").notNull(),
  title: text("title").notNull().default("Interview"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  location: text("location"),
  status: text("status").notNull().default("scheduled"), // scheduled | completed | cancelled
  notes: text("notes"),
  interviewerName: text("interviewer_name"),
  calendarEventId: text("calendar_event_id"),
  rescheduleCount: integer("reschedule_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Offer — job offers linked to an application
export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull(),
  jobId: integer("job_id").notNull(),
  candidateId: integer("candidate_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("draft"), // draft | pending_approval | approved | sent | accepted | rejected
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CandidateNote — notes about a candidate
export const candidateNotes = pgTable("candidate_notes", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  content: text("content").notNull(),
  authorName: text("author_name").notNull().default("Recruiter"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ApplicationDocuments — tracks which of the 6 required docs have been received
export const applicationDocuments = pgTable("application_documents", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull().unique(),
  receivedDocs: text("received_docs").array().notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Employees (Active Realtors) ───────────────────────────────────────────────
export const EMPLOYEE_STATUSES = ["active", "inactive"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const CONTRACT_TYPES = ["50/50", "70/30"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const URETKENLIK_ORANLAR = ["5%", "10%"] as const;
export type UretkenlikOran = (typeof URETKENLIK_ORANLAR)[number];

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull().unique(),
  jobId: integer("job_id"),
  applicationId: integer("application_id"),
  startDate: timestamp("start_date").defaultNow(),
  status: text("status").notNull().default("active"),
  title: text("title"),
  notes: text("notes"),
  kwuid: text("kwuid"),
  kwMail: text("kw_mail"),
  contractType: text("contract_type"),           // 50/50 | 70/30
  uretkenlikKoclugu: boolean("uretkenlik_koclugu").notNull().default(false),
  uretkenlikKocluguManagerId: integer("uretkenlik_koclugu_manager_id"),
  uretkenlikKocluguOran: text("uretkenlik_koclugu_oran"), // 5% | 10%
  capMonth: text("cap_month"),  // e.g. "2025-03"
  capValue: text("cap_value"),  // cap amount/target
  // Billing / invoice info
  billingName: text("billing_name"),          // Şirket / Şahıs İsmi
  billingAddress: text("billing_address"),    // Fatura Adresi
  billingDistrict: text("billing_district"),  // İlçe
  billingCity: text("billing_city"),          // İl
  billingCountry: text("billing_country"),    // Ülke
  taxOffice: text("tax_office"),              // Vergi Dairesi
  taxId: text("tax_id"),                      // Vergi / TCK No
  birthDate: text("birth_date"),              // Doğum Tarihi
  passiveAt: timestamp("passive_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const employeesRelations = relations(employees, ({ one }) => ({
  candidate: one(candidates, { fields: [employees.candidateId], references: [candidates.id] }),
  job: one(jobs, { fields: [employees.jobId], references: [jobs.id] }),
  application: one(applications, { fields: [employees.applicationId], references: [applications.id] }),
}));

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;
export type EmployeeWithRelations = Employee & { candidate?: Candidate; job?: Job };

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const TASK_STATUSES = ["pending", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  status: text("status").notNull().default("pending"), // pending | in_progress | done
  assignedToUserId: integer("assigned_to_user_id").notNull(),
  createdByUserId: integer("created_by_user_id").notNull(),
  jobId: integer("job_id"),
  candidateId: integer("candidate_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export const tasksRelations = relations(tasks, ({ one }) => ({
  assignedTo: one(users, { fields: [tasks.assignedToUserId], references: [users.id] }),
  createdBy: one(users, { fields: [tasks.createdByUserId], references: [users.id] }),
}));

// Relations
export const applicationsRelations = relations(applications, ({ one }) => ({
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
  candidate: one(candidates, { fields: [applications.candidateId], references: [candidates.id] }),
}));

export const jobsRelations = relations(jobs, ({ many }) => ({
  applications: many(applications),
}));

export const candidatesRelations = relations(candidates, ({ many }) => ({
  applications: many(applications),
  notes: many(candidateNotes),
}));

export const stageHistoryRelations = relations(stageHistory, ({ one }) => ({
  application: one(applications, { fields: [stageHistory.applicationId], references: [applications.id] }),
  candidate: one(candidates, { fields: [stageHistory.candidateId], references: [candidates.id] }),
  job: one(jobs, { fields: [stageHistory.jobId], references: [jobs.id] }),
}));

export const interviewsRelations = relations(interviews, ({ one }) => ({
  application: one(applications, { fields: [interviews.applicationId], references: [applications.id] }),
  job: one(jobs, { fields: [interviews.jobId], references: [jobs.id] }),
  candidate: one(candidates, { fields: [interviews.candidateId], references: [candidates.id] }),
}));

export const offersRelations = relations(offers, ({ one }) => ({
  application: one(applications, { fields: [offers.applicationId], references: [applications.id] }),
  job: one(jobs, { fields: [offers.jobId], references: [jobs.id] }),
  candidate: one(candidates, { fields: [offers.candidateId], references: [candidates.id] }),
}));

export const candidateNotesRelations = relations(candidateNotes, ({ one }) => ({
  candidate: one(candidates, { fields: [candidateNotes.candidateId], references: [candidates.id] }),
}));

export const applicationDocumentsRelations = relations(applicationDocuments, ({ one }) => ({
  application: one(applications, { fields: [applicationDocuments.applicationId], references: [applications.id] }),
}));

// Insert schemas
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true });
export const insertCandidateSchema = createInsertSchema(candidates).omit({ id: true, createdAt: true, createdByUserId: true });
export const insertApplicationSchema = createInsertSchema(applications).omit({ id: true, appliedAt: true });
export const insertInterviewSchema = createInsertSchema(interviews).omit({ id: true, createdAt: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true });
export const insertCandidateNoteSchema = createInsertSchema(candidateNotes).omit({ id: true, createdAt: true });
export const insertApplicationDocumentsSchema = createInsertSchema(applicationDocuments).omit({ id: true, updatedAt: true });

// Types
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Application = typeof applications.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type StageHistory = typeof stageHistory.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = z.infer<typeof insertInterviewSchema>;
export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type CandidateNote = typeof candidateNotes.$inferSelect;
export type InsertCandidateNote = z.infer<typeof insertCandidateNoteSchema>;
export type ApplicationDocuments = typeof applicationDocuments.$inferSelect;
