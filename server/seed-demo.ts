/**
 * Demo seed script — populates the database with realistic dummy data
 * for testing features and reports.
 *
 * Run with: npx tsx server/seed-demo.ts
 */

import { db } from "./db";
import {
  users, jobs, candidates, applications, stageHistory,
  interviews, offers, candidateNotes, jobAssignments, tasks,
} from "@shared/schema";
import { eq, count } from "drizzle-orm";
import bcrypt from "bcrypt";

// ─── helpers ────────────────────────────────────────────────────────────────
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function clear() {
  // order matters due to FK constraints
  await db.delete(tasks);
  await db.delete(candidateNotes);
  await db.delete(stageHistory);
  await db.delete(offers);
  await db.delete(interviews);
  await db.delete(applications);
  await db.delete(jobAssignments);
  await db.delete(jobs);
  await db.delete(candidates);
  // keep or recreate users
  await db.delete(users);
}

// ─── users ───────────────────────────────────────────────────────────────────
const USERS = [
  { name: "Admin",              email: "admin@kw.com.tr",    role: "admin",           password: "admin123" },
  { name: "Ahmet Yılmaz",       email: "ahmet@kw.com.tr",    role: "hiring_manager",  password: "pass1234" },
  { name: "Ayşe Kaya",          email: "ayse@kw.com.tr",     role: "hiring_manager",  password: "pass1234" },
  { name: "Mehmet Demir",       email: "mehmet@kw.com.tr",   role: "hiring_manager",  password: "pass1234" },
  { name: "Fatma Çelik",        email: "fatma@kw.com.tr",    role: "assistant",       password: "pass1234" },
  { name: "Ali Şahin",          email: "ali@kw.com.tr",      role: "assistant",       password: "pass1234" },
];

// ─── jobs ────────────────────────────────────────────────────────────────────
const JOBS_DATA = [
  {
    title: "Gayrimenkul Danışmanı",
    department: "Satış",
    company: "KW İstanbul Merkez",
    location: "İstanbul",
    description: "KW İstanbul Merkez ofisi için deneyimli gayrimenkul danışmanı arıyoruz.",
    requirements: "En az 2 yıl sektör deneyimi, lisans belgesi, güçlü iletişim becerileri.",
    salaryRange: "15.000 - 30.000 TL + komisyon",
    status: "open",
  },
  {
    title: "Lüks Konut Danışmanı",
    department: "Lüks Segment",
    company: "KW İstanbul Merkez",
    location: "İstanbul",
    description: "Lüks ve ultra lüks konut segmentinde satış danışmanı.",
    requirements: "5+ yıl deneyim, İngilizce bilen, lüks segmette referanslar.",
    salaryRange: "25.000 - 60.000 TL + komisyon",
    status: "open",
  },
  {
    title: "Ticari Gayrimenkul Danışmanı",
    department: "Ticari",
    company: "KW Ankara",
    location: "Ankara",
    description: "Ticari gayrimenkul alanında danışman aranıyor.",
    requirements: "Ticari gayrimenkul deneyimi, müzakere becerisi.",
    salaryRange: "18.000 - 35.000 TL + komisyon",
    status: "open",
  },
  {
    title: "Arsa & Proje Danışmanı",
    department: "Proje",
    company: "KW İzmir",
    location: "İzmir",
    description: "Arsa ve proje pazarlaması için deneyimli danışman.",
    requirements: "Arsa ve inşaat sektörü bilgisi, proje yönetimi deneyimi.",
    salaryRange: "16.000 - 28.000 TL + komisyon",
    status: "open",
  },
  {
    title: "Kiralama Uzmanı",
    department: "Kiralama",
    company: "KW Bursa",
    location: "Bursa",
    description: "Konut ve ticari kiralama alanında uzman.",
    requirements: "1+ yıl kiralama deneyimi, organize çalışma yeteneği.",
    salaryRange: "12.000 - 20.000 TL + komisyon",
    status: "open",
  },
  {
    title: "Takım Lideri",
    department: "Yönetim",
    company: "KW İstanbul Merkez",
    location: "İstanbul",
    description: "Büyüyen satış ekibimize liderlik yapacak deneyimli isim.",
    requirements: "5+ yıl sektör deneyimi, liderlik deneyimi, koçluk becerileri.",
    salaryRange: "30.000 - 55.000 TL + komisyon",
    status: "open",
  },
  {
    title: "Dijital Pazarlama Uzmanı",
    department: "Pazarlama",
    company: "KW İstanbul Merkez",
    location: "İstanbul",
    description: "Gayrimenkul dijital pazarlama stratejilerini yönetecek uzman.",
    requirements: "Dijital pazarlama sertifikaları, sosyal medya yönetimi deneyimi.",
    salaryRange: "14.000 - 22.000 TL",
    status: "closed",
  },
  {
    title: "Gayrimenkul Danışmanı (Bodrum)",
    department: "Satış",
    company: "KW Bodrum",
    location: "Bodrum",
    description: "Bodrum bölgesinde tatil & yatırım amaçlı gayrimenkul danışmanı.",
    requirements: "Yabancı dil bilen, turizm bölgesi deneyimi tercih sebebi.",
    salaryRange: "14.000 - 25.000 TL + komisyon",
    status: "open",
  },
];

// ─── candidates ───────────────────────────────────────────────────────────────
const CANDIDATES_DATA = [
  // K0 – fresh / no license
  { name: "Can Arslan",        email: "can.arslan@gmail.com",      phone: "0532 111 1001", category: "K0", city: "İstanbul",  district: "Kadıköy",     experience: 0, specialization: ["Residential"],           languages: ["Türkçe"],                  licenseStatus: "unlicensed", resumeText: "Yeni mezun, gayrimenkul sektörüne geçmek istiyor." },
  { name: "Selin Yıldız",      email: "selin.yildiz@hotmail.com",  phone: "0533 111 1002", category: "K0", city: "Ankara",    district: "Çankaya",     experience: 1, specialization: ["Residential"],           languages: ["Türkçe", "İngilizce"],     licenseStatus: "pending",    resumeText: "1 yıl sigorta sektöründen geliyor, satışa ilgili." },
  { name: "Emre Boz",          email: "emre.boz@yandex.com",       phone: "0535 111 1003", category: "K0", city: "İzmir",     district: "Bornova",     experience: 0, specialization: ["Land"],                  languages: ["Türkçe"],                  licenseStatus: "unlicensed", resumeText: "İnşaat mühendisliği mezunu, arsa konusunda ilgili." },
  { name: "Pınar Güneş",       email: "pinar.gunes@gmail.com",     phone: "0530 111 1004", category: "K0", city: "Bursa",     district: "Nilüfer",     experience: 0, specialization: ["Residential"],           languages: ["Türkçe", "Arapça"],        licenseStatus: "unlicensed", resumeText: "Daha önce hiç çalışmamış, kariyer değişikliği yapıyor." },
  { name: "Oğuz Tekin",        email: "oguz.tekin@gmail.com",      phone: "0537 111 1005", category: "K0", city: "İstanbul",  district: "Beşiktaş",    experience: 2, specialization: ["Commercial"],            languages: ["Türkçe", "İngilizce"],     licenseStatus: "pending",    resumeText: "Bankacılık geçmişi var, ticari gayrimenkule geçmek istiyor." },
  { name: "Zeynep Aktaş",      email: "zeynep.aktas@gmail.com",    phone: "0536 111 1006", category: "K0", city: "Antalya",   district: "Muratpaşa",   experience: 1, specialization: ["Residential", "Luxury"], languages: ["Türkçe", "Rusça"],         licenseStatus: "unlicensed", resumeText: "Turizm sektöründen geliyor, yabancı müşteri deneyimi var." },
  { name: "Barış Yıldırım",    email: "baris.y@gmail.com",         phone: "0531 111 1007", category: "K0", city: "İstanbul",  district: "Ümraniye",    experience: 0, specialization: ["Residential"],           languages: ["Türkçe"],                  licenseStatus: "unlicensed", resumeText: "Yeni, motivasyon yüksek." },

  // K1 – experienced agent from another brand
  { name: "Hasan Öztürk",      email: "hasan.ozturk@gmail.com",    phone: "0532 222 2001", category: "K1", city: "İstanbul",  district: "Şişli",       experience: 5, specialization: ["Residential", "Commercial"], languages: ["Türkçe", "İngilizce"], licenseStatus: "licensed", licenseNumber: "GAY-0012345", currentBrand: "RE/MAX",          resumeText: "RE/MAX'te 5 yıl, yıllık 8-10 işlem kapatan başarılı danışman." },
  { name: "Leyla Aydın",       email: "leyla.aydin@gmail.com",     phone: "0533 222 2002", category: "K1", city: "İstanbul",  district: "Beylikdüzü",  experience: 7, specialization: ["Residential"],           languages: ["Türkçe", "Arapça"],        licenseStatus: "licensed", licenseNumber: "GAY-0023456", currentBrand: "Century 21",      resumeText: "Anadolu yakasında güçlü portföy, yıllık 12 işlem." },
  { name: "Serkan Çetin",      email: "serkan.cetin@gmail.com",    phone: "0535 222 2003", category: "K1", city: "Ankara",    district: "Keçiören",    experience: 4, specialization: ["Residential", "Land"],   languages: ["Türkçe"],                  licenseStatus: "licensed", licenseNumber: "GAY-0034567", currentBrand: "ERA",             resumeText: "Ankara'da güçlü arsa portföyü." },
  { name: "Deniz Karataş",     email: "deniz.karatas@gmail.com",   phone: "0530 222 2004", category: "K1", city: "İzmir",     district: "Karşıyaka",   experience: 6, specialization: ["Residential"],           languages: ["Türkçe", "İngilizce"],     licenseStatus: "licensed", licenseNumber: "GAY-0045678", currentBrand: "Coldwell Banker", resumeText: "İzmir'in en aktif danışmanlarından, expatlar ile çalışıyor." },
  { name: "Merve Polat",       email: "merve.polat@gmail.com",     phone: "0537 222 2005", category: "K1", city: "İstanbul",  district: "Bahçelievler", experience: 3, specialization: ["Residential"],           languages: ["Türkçe"],                  licenseStatus: "licensed", licenseNumber: "GAY-0056789", currentBrand: "Hepsiemlak",      resumeText: "Online platform deneyimi var, dijital ağı güçlü." },
  { name: "Kadir Yılmaz",      email: "kadir.yilmaz@gmail.com",   phone: "0536 222 2006", category: "K1", city: "Bursa",     district: "Osmangazi",   experience: 8, specialization: ["Commercial"],            languages: ["Türkçe", "İngilizce"],     licenseStatus: "licensed", licenseNumber: "GAY-0067890", currentBrand: "Keller Williams", resumeText: "KW franchise başka şehirden, relocate etmek istiyor." },
  { name: "Gizem Akar",        email: "gizem.akar@gmail.com",     phone: "0531 222 2007", category: "K1", city: "Antalya",   district: "Konyaaltı",   experience: 5, specialization: ["Residential", "Luxury"], languages: ["Türkçe", "Almanca"],        licenseStatus: "licensed", licenseNumber: "GAY-0078901", currentBrand: "Realty World",    resumeText: "Alman müşteri portföyü, Antalya lüks segment." },
  { name: "Tuncay Ekici",      email: "tuncay.ekici@gmail.com",   phone: "0532 222 2008", category: "K1", city: "İstanbul",  district: "Sarıyer",     experience: 10, specialization: ["Luxury"],               languages: ["Türkçe", "İngilizce", "Arapça"], licenseStatus: "licensed", licenseNumber: "GAY-0089012", currentBrand: "Bağımsız",       resumeText: "Bağımsız çalışıyor, KW yapısına geçmek istiyor." },

  // K2 – top performer
  { name: "Ece Demirbaş",      email: "ece.demribas@gmail.com",   phone: "0533 333 3001", category: "K2", city: "İstanbul",  district: "Sarıyer",     experience: 12, specialization: ["Luxury"],              languages: ["Türkçe", "İngilizce", "Fransızca"], licenseStatus: "licensed", licenseNumber: "GAY-1000001", currentBrand: "Century 21", referredBy: "Genel Müdür", resumeText: "Yılın danışmanı ödüllü, 20M+ TL hacim." },
  { name: "Murat Bozkurt",     email: "murat.bozkurt@gmail.com",  phone: "0535 333 3002", category: "K2", city: "İstanbul",  district: "Levent",      experience: 15, specialization: ["Commercial", "Land"],  languages: ["Türkçe", "İngilizce"],     licenseStatus: "licensed", licenseNumber: "GAY-1000002", currentBrand: "Yerel Ofis",  referredBy: "Takım Lideri", resumeText: "Kendi ofisi var, KW'ye franchise olarak katılacak." },
  { name: "Sibel Öz",          email: "sibel.oz@gmail.com",       phone: "0530 333 3003", category: "K2", city: "Ankara",    district: "Çankaya",     experience: 11, specialization: ["Residential"],         languages: ["Türkçe", "İngilizce"],     licenseStatus: "licensed", licenseNumber: "GAY-1000003", currentBrand: "RE/MAX",      referredBy: "Ahmet Yılmaz", resumeText: "RE/MAX'in en iyi 10 danışmanından biri." },
  { name: "Burak Koç",         email: "burak.koc@gmail.com",      phone: "0537 333 3004", category: "K2", city: "İzmir",     district: "Alsancak",    experience: 9,  specialization: ["Residential", "Luxury"], languages: ["Türkçe", "İngilizce", "Rusça"], licenseStatus: "licensed", licenseNumber: "GAY-1000004", currentBrand: "Coldwell Banker", referredBy: "Ahmet Yılmaz", resumeText: "İzmir lüks segmentte dominant oyuncu." },
];

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Clearing existing data…");
  await clear();

  // ── 1. Users ────────────────────────────────────────────────────────────────
  console.log("👤  Seeding users…");
  const insertedUsers: (typeof users.$inferSelect)[] = [];
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    const [row] = await db.insert(users).values({
      name: u.name, email: u.email, passwordHash: hash, role: u.role,
    }).returning();
    insertedUsers.push(row);
  }
  const adminUser   = insertedUsers[0];
  const manager1    = insertedUsers[1]; // Ahmet
  const manager2    = insertedUsers[2]; // Ayşe
  const manager3    = insertedUsers[3]; // Mehmet
  const assistant1  = insertedUsers[4]; // Fatma
  const assistant2  = insertedUsers[5]; // Ali

  // ── 2. Jobs ─────────────────────────────────────────────────────────────────
  console.log("💼  Seeding jobs…");
  const insertedJobs: (typeof jobs.$inferSelect)[] = [];
  for (let i = 0; i < JOBS_DATA.length; i++) {
    const jd = JOBS_DATA[i];
    // Spread creation dates across the last 90 days
    const createdAt = daysAgo(90 - i * 10);
    const [row] = await db.insert(jobs).values({ ...jd, createdAt }).returning();
    insertedJobs.push(row);
  }

  // Assign jobs to managers
  const jobManagerMap: Record<number, number[]> = {
    0: [manager1.id, assistant1.id], // Gayrimenkul Danışmanı İstanbul
    1: [manager1.id],                // Lüks Konut
    2: [manager2.id, assistant2.id], // Ticari - Ankara
    3: [manager3.id],                // Arsa - İzmir
    4: [manager2.id],                // Kiralama - Bursa
    5: [manager1.id, manager2.id],   // Takım Lideri
    6: [manager3.id],                // Dijital Pazarlama (closed)
    7: [manager3.id],                // Bodrum
  };
  for (const [jobIdx, userIds] of Object.entries(jobManagerMap)) {
    const job = insertedJobs[+jobIdx];
    for (const uid of userIds) {
      await db.insert(jobAssignments).values({ jobId: job.id, userId: uid });
    }
  }

  // ── 3. Candidates ───────────────────────────────────────────────────────────
  console.log("🙋  Seeding candidates…");
  const insertedCandidates: (typeof candidates.$inferSelect)[] = [];
  for (let i = 0; i < CANDIDATES_DATA.length; i++) {
    const cd = CANDIDATES_DATA[i] as any;
    const createdAt = daysAgo(80 - i * 3);
    const [row] = await db.insert(candidates).values({ ...cd, createdAt }).returning();
    insertedCandidates.push(row);
  }

  // ── 4. Applications + Stage Histories ───────────────────────────────────────
  console.log("📋  Seeding applications & stage history…");

  // Define a helper that creates an application and pushes it through stages
  async function applyCandidate(
    cand: typeof candidates.$inferSelect,
    job: typeof jobs.$inferSelect,
    stages: string[],        // ordered stages the application goes through
    score: number,
    appliedDaysAgo: number,
  ) {
    const appliedAt = daysAgo(appliedDaysAgo);
    const finalStatus = stages[stages.length - 1];
    const [app] = await db.insert(applications).values({
      jobId: job.id, candidateId: cand.id,
      status: finalStatus, score,
      appliedAt,
    }).returning();

    // Stage history
    let prev: string | null = null;
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const enteredAt = new Date(appliedAt.getTime() + i * 5 * 86_400_000); // 5 days per stage
      await db.insert(stageHistory).values({
        applicationId: app.id, candidateId: cand.id, jobId: job.id,
        fromStatus: prev, toStatus: stage, enteredAt,
      });
      prev = stage;
    }

    return app;
  }

  const [
    cCan, selin, emre, pinar, oguz, zeynep, baris, // K0
    hasan, leyla, serkan, deniz, merve, kadir, gizem, tuncay, // K1
    ece, murat, sibel, burak, // K2
  ] = insertedCandidates;

  const [jobGM, jobLux, jobTic, jobArsa, jobKira, jobLead, jobDij, jobBod] = insertedJobs;

  // ─── Applications spread across stages ────────────────────────────────────

  // Hired applications (completed pipeline)
  const appHasan = await applyCandidate(hasan,  jobGM,   ["applied","screening","interview","offer","hired"], 9, 75);
  const appLeyla = await applyCandidate(leyla,  jobGM,   ["applied","screening","interview","offer","hired"], 8, 68);
  const appEce   = await applyCandidate(ece,    jobLux,  ["applied","screening","interview","offer","hired"], 10, 60);
  const appMurat = await applyCandidate(murat,  jobLead, ["applied","screening","interview","offer","hired"], 10, 55);
  const appSibel = await applyCandidate(sibel,  jobTic,  ["applied","screening","interview","offer","hired"], 9, 50);
  const appBurak = await applyCandidate(burak,  jobBod,  ["applied","screening","interview","offer","hired"], 9, 45);
  const appDeniz = await applyCandidate(deniz,  jobArsa, ["applied","screening","interview","offer","hired"], 8, 40);

  // Offer stage
  const appGizem  = await applyCandidate(gizem,  jobBod,  ["applied","screening","interview","offer"], 8, 30);
  const appTuncay = await applyCandidate(tuncay, jobLux,  ["applied","screening","interview","offer"], 9, 28);

  // Interview stage
  const appSerkan = await applyCandidate(serkan, jobTic,  ["applied","screening","interview"], 7, 20);
  const appMerve  = await applyCandidate(merve,  jobGM,   ["applied","screening","interview"], 6, 18);
  const appKadir  = await applyCandidate(kadir,  jobLead, ["applied","screening","interview"], 8, 15);
  const appOguz   = await applyCandidate(oguz,   jobTic,  ["applied","screening","interview"], 5, 12);

  // Screening stage
  const appCan    = await applyCandidate(cCan,   jobGM,   ["applied","screening"], 5, 14);
  const appSelin  = await applyCandidate(selin,  jobKira, ["applied","screening"], 4, 10);
  const appEmre   = await applyCandidate(emre,   jobArsa, ["applied","screening"], 6, 8);
  const appPinar  = await applyCandidate(pinar,  jobKira, ["applied","screening"], 3, 7);

  // Applied stage (fresh)
  const appZeynep = await applyCandidate(zeynep, jobBod,  ["applied"], 0, 5);
  const appBaris  = await applyCandidate(baris,  jobGM,   ["applied"], 0, 3);

  // Rejected
  await applyCandidate(cCan,   jobArsa, ["applied","screening","rejected"], 2, 50);
  await applyCandidate(pinar,  jobGM,   ["applied","rejected"],             1, 45);
  await applyCandidate(baris,  jobLux,  ["applied","screening","rejected"], 3, 38);
  await applyCandidate(oguz,   jobGM,   ["applied","rejected"],             2, 32);

  // Post-hire stages for hired candidates
  await applyCandidate(hasan,  jobLux,  ["applied","screening","interview","offer","hired","myk_training","account_setup","documents"], 9, 90);

  // ── 5. Interviews ────────────────────────────────────────────────────────────
  console.log("📅  Seeding interviews…");

  const interviewData = [
    // Completed
    { app: appHasan, cand: hasan,  job: jobGM,  start: daysAgo(60),  end: daysAgo(60),  status: "completed", title: "İlk Mülakat", interviewer: "Ahmet Yılmaz",  notes: "Güçlü müzakere becerileri. İkinci tura davet edildi." },
    { app: appLeyla, cand: leyla,  job: jobGM,  start: daysAgo(55),  end: daysAgo(55),  status: "completed", title: "Yetkinlik Mülakatı", interviewer: "Ahmet Yılmaz", notes: "Portföy çeşitliliği etkileyici." },
    { app: appEce,   cand: ece,    job: jobLux, start: daysAgo(50),  end: daysAgo(50),  status: "completed", title: "Lüks Segment Değerlendirmesi", interviewer: "Ahmet Yılmaz", notes: "Mükemmel Fransızca + İngilizce." },
    { app: appMurat, cand: murat,  job: jobLead,start: daysAgo(45),  end: daysAgo(45),  status: "completed", title: "Liderlik Mülakatı", interviewer: "Ayşe Kaya",    notes: "Ekip kurma tecrübesi çok değerli." },
    { app: appSibel, cand: sibel,  job: jobTic, start: daysAgo(40),  end: daysAgo(40),  status: "completed", title: "Teknik Mülakat", interviewer: "Ayşe Kaya",    notes: "Ticari bilgisi üst düzey." },
    { app: appBurak, cand: burak,  job: jobBod, start: daysAgo(35),  end: daysAgo(35),  status: "completed", title: "Değerlendirme", interviewer: "Mehmet Demir",  notes: "Bodrum pazarını çok iyi biliyor." },
    { app: appDeniz, cand: deniz,  job: jobArsa,start: daysAgo(30),  end: daysAgo(30),  status: "completed", title: "Sektör Bilgisi Testi", interviewer: "Mehmet Demir", notes: "Arsa konusundaki bilgisi mükemmel." },
    // Offer stage - completed interviews
    { app: appGizem,  cand: gizem,  job: jobBod, start: daysAgo(22),  end: daysAgo(22),  status: "completed", title: "Final Mülakat", interviewer: "Mehmet Demir", notes: "Almanca müşteri kitlesi çok değerli." },
    { app: appTuncay, cand: tuncay, job: jobLux, start: daysAgo(20),  end: daysAgo(20),  status: "completed", title: "Lüks Portföy Sunumu", interviewer: "Ahmet Yılmaz", notes: "Etkileyici müşteri ağı." },
    // Upcoming (interview stage)
    { app: appSerkan, cand: serkan, job: jobTic, start: daysFromNow(2), end: daysFromNow(2),  status: "scheduled", title: "Ticari Gayrimenkul Mülakatı", interviewer: "Ayşe Kaya",    notes: null },
    { app: appMerve,  cand: merve,  job: jobGM,  start: daysFromNow(3), end: daysFromNow(3),  status: "scheduled", title: "Danışman Değerlendirmesi", interviewer: "Ahmet Yılmaz", notes: null },
    { app: appKadir,  cand: kadir,  job: jobLead,start: daysFromNow(5), end: daysFromNow(5),  status: "scheduled", title: "Liderlik Değerlendirmesi", interviewer: "Ayşe Kaya",    notes: null },
    { app: appOguz,   cand: oguz,   job: jobTic, start: daysFromNow(7), end: daysFromNow(7),  status: "scheduled", title: "Ticari Mülakat", interviewer: "Ayşe Kaya",    notes: null },
  ];

  for (const iv of interviewData) {
    const start = new Date(iv.start);
    start.setHours(10, 0, 0, 0);
    const end = new Date(iv.end);
    end.setHours(11, 0, 0, 0);
    await db.insert(interviews).values({
      applicationId: iv.app.id, jobId: iv.job.id, candidateId: iv.cand.id,
      title: iv.title, startTime: start, endTime: end,
      location: "KW Ofisi / Google Meet",
      status: iv.status as any,
      notes: iv.notes ?? undefined,
      interviewerName: iv.interviewer,
    });
  }

  // ── 6. Offers ────────────────────────────────────────────────────────────────
  console.log("💰  Seeding offers…");

  const offerData = [
    { app: appHasan, cand: hasan,  job: jobGM,   amount: 25000, currency: "TRY", status: "accepted", notes: "Başlangıç paketi + komisyon yüzdesi anlaşıldı." },
    { app: appLeyla, cand: leyla,  job: jobGM,   amount: 22000, currency: "TRY", status: "accepted", notes: "Uzak lokasyon için ulaşım desteği eklendi." },
    { app: appEce,   cand: ece,    job: jobLux,  amount: 50000, currency: "TRY", status: "accepted", notes: "Lüks segment prim yapısı özel olarak hazırlandı." },
    { app: appMurat, cand: murat,  job: jobLead, amount: 45000, currency: "TRY", status: "accepted", notes: "Takım kurma bonusu dahil." },
    { app: appSibel, cand: sibel,  job: jobTic,  amount: 30000, currency: "TRY", status: "accepted", notes: "Standart paket." },
    { app: appBurak, cand: burak,  job: jobBod,  amount: 22000, currency: "TRY", status: "accepted", notes: "Bodrum sezonu baz alındı." },
    { app: appDeniz, cand: deniz,  job: jobArsa, amount: 20000, currency: "TRY", status: "accepted", notes: "Proje bazlı prim eklendi." },
    { app: appGizem,  cand: gizem,  job: jobBod,  amount: 20000, currency: "TRY", status: "pending_approval", notes: "Almanca hizmet kalemi eklendi." },
    { app: appTuncay, cand: tuncay, job: jobLux,  amount: 48000, currency: "TRY", status: "sent",             notes: "Bağımsız portföy devir bedeli ayrıca görüşülecek." },
    // Rejected offer
    { app: appKadir, cand: kadir,  job: jobLead, amount: 35000, currency: "TRY", status: "rejected", notes: "Aday mevcut işinden ayrılmak istemedi." },
  ];

  for (const o of offerData) {
    await db.insert(offers).values({
      applicationId: o.app.id, jobId: o.job.id, candidateId: o.cand.id,
      amount: o.amount, currency: o.currency, status: o.status as any, notes: o.notes,
    });
  }

  // ── 7. Candidate Notes ────────────────────────────────────────────────────────
  console.log("📝  Seeding candidate notes…");

  const noteData = [
    { cand: hasan,  author: "Ahmet Yılmaz",  content: "Çok güçlü bir aday. RE/MAX'teki geçmişi etkileyici." },
    { cand: hasan,  author: "Admin",          content: "Referans kontrolleri tamamlandı, olumlu." },
    { cand: leyla,  author: "Ahmet Yılmaz",  content: "Anadolu yakasında güçlü ağı var, değerli." },
    { cand: ece,    author: "Ahmet Yılmaz",  content: "Yılın danışmanı ödüllü. Mutlaka işe alınmalı." },
    { cand: ece,    author: "Ayşe Kaya",     content: "Fransızca konuşan müşteri tabanı çok kıymetli." },
    { cand: murat,  author: "Ayşe Kaya",     content: "Kendi ofisini bırakıp geliyor, motivasyonu yüksek." },
    { cand: serkan, author: "Ayşe Kaya",     content: "Ankara arsa segmentinde çok deneyimli." },
    { cand: tuncay, author: "Ahmet Yılmaz",  content: "Üst düzey müşteri portföyü var, kazanmamız lazım." },
    { cand: cCan,   author: "Admin",          content: "Genç ve hevesli, biraz daha gelişime ihtiyacı var." },
    { cand: oguz,   author: "Ayşe Kaya",     content: "Bankacılık geçmişi ticari için artı, ama sektör bilgisi az." },
    { cand: gizem,  author: "Mehmet Demir",  content: "Almanca pazarı için çok değerli bir profil." },
    { cand: burak,  author: "Mehmet Demir",  content: "İzmir lüks segmentinde dominant. Bodrum için de çok uygun." },
  ];

  for (const n of noteData) {
    await db.insert(candidateNotes).values({
      candidateId: n.cand.id, content: n.content, authorName: n.author,
    });
  }

  // ── 8. Tasks ─────────────────────────────────────────────────────────────────
  console.log("✅  Seeding tasks…");

  const taskData = [
    { title: "Hasan Öztürk'ün belgelerini al",      description: "Kimlik, diploma, vergi levhası, sigorta belgesi.", dueDate: daysFromNow(3),  status: "pending",     assignedTo: assistant1, createdBy: manager1, job: jobGM },
    { title: "Ece Demirbaş işe alım süreci kapat",   description: "MYK eğitim kaydını tamamla.",                    dueDate: daysFromNow(5),  status: "in_progress", assignedTo: assistant1, createdBy: manager1, job: jobLux },
    { title: "Tuncay Ekici teklif takip",            description: "Teklif cevabı bekleniyor, arama yap.",           dueDate: daysFromNow(2),  status: "pending",     assignedTo: manager1,   createdBy: adminUser, job: jobLux },
    { title: "Bodrum ofisi ilanı yenile",            description: "Sahibinden ve Hepsiemlak ilanları güncellenmeli.", dueDate: daysFromNow(7), status: "pending",     assignedTo: assistant2, createdBy: manager3, job: jobBod },
    { title: "Serkan Çetin mülakat hazırlığı",       description: "Ticari sorulardan oluşan soru seti hazırla.",    dueDate: daysFromNow(1),  status: "in_progress", assignedTo: manager2,   createdBy: manager2, job: jobTic },
    { title: "Leyla Aydın hesap kurulumu",           description: "CRM erişimi, e-posta ve MLS kaydı.",             dueDate: daysFromNow(4),  status: "pending",     assignedTo: assistant2, createdBy: manager1, job: jobGM },
    { title: "Aylık rapor hazırla",                  description: "Mart ayı işe alım raporu.",                      dueDate: daysFromNow(6),  status: "pending",     assignedTo: manager1,   createdBy: adminUser, job: undefined },
    { title: "KW İzmir tanıtım toplantısı ayarla",   description: "Potansiyel K2 adaylarla brifing.",               dueDate: daysFromNow(10), status: "pending",     assignedTo: manager3,   createdBy: adminUser, job: jobArsa },
    { title: "Dijital Pazarlama pozisyonu arşivle",  description: "İlan kapatıldı, arşive al.",                    dueDate: daysFromNow(1),  status: "done",        assignedTo: assistant1, createdBy: manager3, job: jobDij },
    { title: "Kadir Yılmaz referans kontrolü",       description: "Mevcut işverenle referans görüşmesi yap.",       dueDate: daysAgo(2),      status: "done",        assignedTo: manager2,   createdBy: manager2, job: jobLead },
  ];

  for (const t of taskData) {
    await db.insert(tasks).values({
      title: t.title, description: t.description,
      dueDate: t.dueDate, status: t.status as any,
      assignedToUserId: t.assignedTo.id, createdByUserId: t.createdBy.id,
      jobId: t.job?.id ?? null,
    });
  }

  console.log("\n✅  Demo seed complete!\n");
  console.log("  👤 Users:");
  for (const u of USERS) {
    console.log(`     ${u.email}  /  ${u.password}  [${u.role}]`);
  }
  console.log(`\n  💼 ${JOBS_DATA.length} jobs`);
  console.log(`  🙋 ${CANDIDATES_DATA.length} candidates`);
  console.log(`  📋 Applications, interviews, offers, notes & tasks seeded\n`);

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
