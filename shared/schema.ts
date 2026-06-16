import { pgTable, text, serial, timestamp, integer, boolean, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
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
  office: text("office"),                            // "Akatlar" | "Zekeriyaköy"
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const OFFICES = ["Akatlar", "Zekeriyaköy"] as const;
export type Office = (typeof OFFICES)[number];

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
  dua: boolean("dua").notNull().default(false),
  duaManagerId: integer("dua_manager_id"),
  ukStartDate: text("uk_start_date"),
  ukEndDate: text("uk_end_date"),
  capMonth: text("cap_month"),  // e.g. "2025-03"
  capValue: text("cap_value"),  // cap amount/target
  capManualAdjustment: numeric("cap_manual_adjustment", { precision: 15, scale: 2 }).default("0"),
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
  advisorToken: text("advisor_token").unique(),
  advisorLastNotifiedAt: timestamp("advisor_last_notified_at"),
  advisorNotifyMsgId: text("advisor_notify_msg_id"),
  advisorLastEmailNotifiedAt: timestamp("advisor_last_email_notified_at"),
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

// ── Cap Settings ─────────────────────────────────────────────────────────────
export const capSettings = pgTable("cap_settings", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CapSetting = typeof capSettings.$inferSelect;

// ── Financial Targets (monthly BHB / BM / Satılık / Kiralık adet) ─────────────
export const financialTargets = pgTable("financial_targets", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),       // 1–12
  office: text("office").notNull().default(""),  // "" = global, "Akatlar", "Zekeriyaköy"
  bhbTarget: numeric("bhb_target", { precision: 15, scale: 2 }),
  bhbHighTarget: numeric("bhb_high_target", { precision: 15, scale: 2 }),
  bmTarget: numeric("bm_target", { precision: 15, scale: 2 }),
  bmHighTarget: numeric("bm_high_target", { precision: 15, scale: 2 }),
  satilikAdetTarget: integer("satilik_adet_target"),
  satilikAdetHighTarget: integer("satilik_adet_high_target"),
  kiralikAdetTarget: integer("kiralik_adet_target"),
  kiralikAdetHighTarget: integer("kiralik_adet_high_target"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  yearMonthOfficeUniq: uniqueIndex("financial_targets_year_month_office_idx").on(t.year, t.month, t.office),
}));

export type FinancialTarget = typeof financialTargets.$inferSelect;

// ── Closings ──────────────────────────────────────────────────────────────────
export const DEAL_TYPES = ["Arsa", "Konut", "Ticari", "Yönlendirme", "Kiralama"] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_CATEGORIES = ["Satış", "Kiralık", "Yönlendirme"] as const;
export type DealCategory = (typeof DEAL_CATEGORIES)[number];

export const closings = pgTable("closings", {
  id: serial("id").primaryKey(),
  propertyAddress: text("property_address").notNull().default(""),
  il: text("il"),
  ilce: text("ilce"),
  mahalle: text("mahalle"),                                        // Semt/Mahalle
  propertyDetails: text("property_details"),                       // Mülkle İlgili Detay Bilgiler
  dealCategory: text("deal_category").notNull().default("Satış"), // Satış | Kiralık
  dealType: text("deal_type").notNull().default("Konut"),
  saleValue: numeric("sale_value", { precision: 15, scale: 2 }).notNull(),
  commissionRate: numeric("commission_rate", { precision: 10, scale: 2 }).notNull().default("2.00"),
  openingPrice: numeric("opening_price", { precision: 15, scale: 2 }),  // Açılış Rakamı (listing price)
  durationDays: integer("duration_days"),                               // Süre/Gün
  customerSource: text("customer_source"),                              // Müşteri nereden buldu?
  referralInfo: text("referral_info"),                                  // Yönlendirme Bilgisi
  contractStartDate: timestamp("contract_start_date"),                  // Sözleşme Başlangıç
  contractEndDate: timestamp("contract_end_date"),                      // Sözleşme Bitiş
  kasa: numeric("kasa", { precision: 15, scale: 2 }).default("0"),
  nakit: numeric("nakit", { precision: 15, scale: 2 }).default("0"),
  banka: numeric("banka", { precision: 15, scale: 2 }).default("0"),
  closingDate: timestamp("closing_date"),
  status: text("status").notNull().default("completed"), // "completed" | "expected"
  buyerName: text("buyer_name"),
  sellerName: text("seller_name"),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  closingDateIdx: index("closings_closing_date_idx").on(t.closingDate),
  statusIdx: index("closings_status_idx").on(t.status),
  createdAtIdx: index("closings_created_at_idx").on(t.createdAt),
}));

export type Closing = typeof closings.$inferSelect;

export const closingSides = pgTable("closing_sides", {
  id: serial("id").primaryKey(),
  closingId: integer("closing_id").notNull(),
  sideType: text("side_type").notNull(), // "buyer" | "seller" | "referral"
  bhbTotal: numeric("bhb_total", { precision: 15, scale: 2 }).notNull(),
  kasa: numeric("kasa", { precision: 15, scale: 2 }).default("0"),
  nakit: numeric("nakit", { precision: 15, scale: 2 }).default("0"),
  banka: numeric("banka", { precision: 15, scale: 2 }).default("0"),
}, (t) => ({
  closingIdIdx: index("closing_sides_closing_id_idx").on(t.closingId),
}));

export type ClosingSide = typeof closingSides.$inferSelect;

export const closingAgents = pgTable("closing_agents", {
  id: serial("id").primaryKey(),
  closingSideId: integer("closing_side_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  splitPercentage: numeric("split_percentage", { precision: 10, scale: 2 }).notNull(),
  bhbShare: numeric("bhb_share", { precision: 15, scale: 2 }).notNull(),
  mainBranchShare: numeric("main_branch_share", { precision: 15, scale: 2 }).notNull(),
  kwtrKdv: numeric("kwtr_kdv", { precision: 15, scale: 2 }).notNull().default("0"),
  marketCenterDue: numeric("market_center_due", { precision: 15, scale: 2 }).notNull(),
  marketCenterActual: numeric("market_center_actual", { precision: 15, scale: 2 }).notNull(),
  bmKdv: numeric("bm_kdv", { precision: 15, scale: 2 }).notNull().default("0"),
  ukShare: numeric("uk_share", { precision: 15, scale: 2 }).notNull().default("0"),
  employeeNet: numeric("employee_net", { precision: 15, scale: 2 }).notNull(),
  kasa: numeric("kasa", { precision: 15, scale: 2 }).default("0"),
  nakit: numeric("nakit", { precision: 15, scale: 2 }).default("0"),
  banka: numeric("banka", { precision: 15, scale: 2 }).default("0"),
  contractTypeSnapshot: text("contract_type_snapshot"),
  ukRateSnapshot: numeric("uk_rate_snapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  capAmountApplied: numeric("cap_amount_applied", { precision: 15, scale: 2 }),
  capUsedBefore: numeric("cap_used_before", { precision: 15, scale: 2 }).notNull().default("0"),
  // Per-agent transaction date + approval. NULL ⇒ fall back to parent closing.
  closingDate: timestamp("closing_date"),
  status: text("status"),  // "completed" | "expected" | NULL → fallback to parent
  // Payment collection flag: true = paid to office, false = still pending
  paymentCollected: boolean("payment_collected").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  sideIdIdx: index("closing_agents_side_id_idx").on(t.closingSideId),
  employeeIdIdx: index("closing_agents_employee_id_idx").on(t.employeeId),
  closingDateIdx: index("closing_agents_closing_date_idx").on(t.closingDate),
  statusIdx: index("closing_agents_status_idx").on(t.status),
}));

export type ClosingAgent = typeof closingAgents.$inferSelect;

export interface CapStatus {
  employeeId: number;
  /** null = no cap configured for this year (unlimited) */
  capAmount: number | null;
  capUsed: number;
  /** null = unlimited (no cap configured) */
  capRemaining: number | null;
  periodStart: Date;
  capYear: number;
  /** BM paid in the previous 12-month cap period (for current-month reset employees) */
  prevCapUsed: number;
}

export interface ClosingAgentWithEmployee extends ClosingAgent {
  employeeName?: string;
  candidateName?: string;
  kwuid?: string;
}

export interface ClosingSideWithAgents extends ClosingSide {
  agents: ClosingAgentWithEmployee[];
}

export interface ClosingWithDetails extends Closing {
  sides: ClosingSideWithAgents[];
  totalAgentNet: number;
}

// ── Interview Targets ─────────────────────────────────────────────────────────
export const interviewTargets = pgTable("interview_targets", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  category: text("category").notNull(), // K0 | K1 | K2
  target: integer("target").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type InterviewTarget = typeof interviewTargets.$inferSelect;

// ── Office Expenses (Income / Expense Module) ─────────────────────────────────

export const BM_PREPAYMENT_CATEGORY = "Danışman BM Payı Ön Ödemesi" as const;

export const INCOME_CATEGORIES = [
  "Aidat & Yer Tahsis",
  "Oda Kira",
  "Sahibinden",
  "ÜK Geliri",
  "Giriş Bedeli",
  "Faiz Gelirleri",
  "Printer Geliri",
  "Kitap, Yer Gösterme, DISC vb. Gelir",
  "Transfer Geliri",
  "Proje Ek Geliri",
  "Diğer Gelirler (Kep Ödemesi vb)",
  "Royalty Fee (%1,5)",
  BM_PREPAYMENT_CATEGORY,
] as const;

export const EXPENSE_CATEGORY_GROUPS: { group: string; items: string[] }[] = [
  { group: "KW & Teknoloji",        items: ["KW Türkiye (eğitim+idari+rdn)", "Fonzip", "Zoom", "Logo Muhasebe", "DISC"] },
  { group: "Personel",              items: ["Personel Ücretleri", "Personel Sağlık Sigorta", "SGK", "EE Bağkur", "EYT Kredisi/İş Bankası"] },
  { group: "Ulaşım",                items: ["Araç Benzin", "HGS/OGS", "Taksi"] },
  {
    group: "Ofis & Genel Giderler",
    items: [
      "Kira", "Aidat, Elektrik, Güvenlik vs", "Temizlik, Hijyen", "Kırtasiye Masrafı",
      "Mutfak", "Sigorta (İşyeri)", "Kitap", "Kargo & Noter Giderleri", "Printer",
      "Ofis Tamir Bakımı", "Demirbaş + Tadilat", "Sabit Telefon, Cep Telefonu", "İnternet",
    ],
  },
  { group: "KW Etkinlik & Eğitim",  items: ["FR_USA", "FR & Megacamp", "Eğitim & Etkinlik Bütçesi"] },
  {
    group: "Pazarlama & Reklam",
    items: ["Sosyal Medya Reklam", "Aidat Kampanyası", "Görsel & Afiş & İkram", "Toplanamayan Aidat", "Ödül & Etkinlik"],
  },
  { group: "Portaller",             items: ["Sahibinden", "Hürriyet Emlak"] },
  { group: "Danışmanlık",           items: ["Mali Müşavir", "Hukuk"] },
  {
    group: "Vergi & Yasal",
    items: [
      "Gelir Vergisi Stopajı (Muhtasar)", "Damga Vergisi", "Kurumlar + Geçici Vergi",
      "İlan, Reklam ve Harçlar", "İTO Ücreti", "Çevre ve Temizlik Vergisi", "MTV",
    ],
  },
];

export const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_GROUPS.flatMap((g) => g.items);

export const officeExpenses = pgTable("office_expenses", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),                // "income" | "expense"
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  date: text("date").notNull(),                // YYYY-MM-DD
  notes: text("notes"),
  employeeId: integer("employee_id"),          // Optional — required for BM_PREPAYMENT_CATEGORY
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOfficeExpenseSchema = createInsertSchema(officeExpenses).omit({ id: true, createdAt: true });
export type InsertOfficeExpense = z.infer<typeof insertOfficeExpenseSchema>;
export type OfficeExpense = typeof officeExpenses.$inferSelect;

// ── Listings (Portal İlanları — KW Platin & Karma) ────────────────────────────

export const LISTING_STATUSES = ["active", "passive"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

// Reasons a listing left publication (advisor self-reports via public link)
export const LISTING_CLOSE_REASONS = [
  "Satıldı",
  "Kiralandı",
  "Sözleşme Süresi Doldu",
  "Mal Sahibi İptal Etti",
  "Fiyat Anlaşmazlığı",
  "Başka Ofisten Satıldı",
  "Diğer",
] as const;
export type ListingCloseReason = (typeof LISTING_CLOSE_REASONS)[number];

export const listings = pgTable("listings", {
  id: serial("id").primaryKey(),
  listingNumber: text("listing_number").notNull().unique(),     // İlan Numarası
  price: numeric("price", { precision: 15, scale: 2 }),         // Fiyat
  publishedDate: text("published_date"),                        // Yayınlanma (raw)
  removedDate: text("removed_date"),                            // Yayından Kaldırılma (raw)
  durationDays: integer("duration_days"),                       // Süre (gün)
  advisorName: text("advisor_name"),                            // Danışman (ham isim)
  employeeId: integer("employee_id"),                           // eşleşen danışman
  office: text("office"),                                       // Ofis
  store: text("store"),                                         // Mağaza / portal
  status: text("status").notNull().default("active"),           // active | passive

  // Yetki sözleşmesi (advisor uploads via public link)
  agreementRequestedAt: timestamp("agreement_requested_at"),
  agreementUploadedAt: timestamp("agreement_uploaded_at"),
  agreementFileName: text("agreement_file_name"),
  agreementFileMime: text("agreement_file_mime"),
  agreementFileData: text("agreement_file_data"),               // base64
  noAgreementAt: timestamp("no_agreement_at"),                  // danışman "sözleşmem yok" dedi

  // Yayından kalkış sebebi (advisor submits via public link)
  closeReasonRequestedAt: timestamp("close_reason_requested_at"),
  closeReason: text("close_reason"),
  closeReasonNote: text("close_reason_note"),
  closeReasonSubmittedAt: timestamp("close_reason_submitted_at"),

  publicToken: text("public_token").notNull().unique(),         // danışman self-servis linki

  notifiedNewAt: timestamp("notified_new_at"),                  // yeni ilan WA gönderildi
  notifiedPassiveAt: timestamp("notified_passive_at"),          // kalkış WA gönderildi
  notifyMsgIdNew: text("notify_msg_id_new"),                    // Green API idMessage (yeni)
  notifyMsgIdPassive: text("notify_msg_id_passive"),            // Green API idMessage (kalkış)

  passiveAt: timestamp("passive_at"),                             // aktif→pasif geçiş tarihi
  firstSeenAt: timestamp("first_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  statusIdx: index("listings_status_idx").on(t.status),
  employeeIdx: index("listings_employee_idx").on(t.employeeId),
  tokenIdx: index("listings_token_idx").on(t.publicToken),
}));

export const listingAgreementFiles = pgTable("listing_agreement_files", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  data: text("data").notNull(), // base64
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (t) => ({
  listingIdIdx: index("laf_listing_id_idx").on(t.listingId),
}));
export type ListingAgreementFile = typeof listingAgreementFiles.$inferSelect;

export type Listing = typeof listings.$inferSelect;
export type ListingWithEmployee = Listing & { employeeName?: string; employeePhone?: string };

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
