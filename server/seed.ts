import { db } from "./db";
import { jobs, candidates, users, jobAssignments, applications, interviews, offers } from "@shared/schema";
import { storage } from "./storage";
import { ne, eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const JOBS = [
  { title: "Senior Real Estate Agent", company: "Keller Williams Turkey", department: "Sales", location: "Istanbul", description: "Experienced agent for luxury properties", requirements: "3+ years experience, valid license, strong sales track record" },
  { title: "Junior Agent", company: "Keller Williams Turkey", department: "Sales", location: "Ankara", description: "Entry-level agent for residential properties", requirements: "Real estate license or willingness to obtain, customer service skills" },
  { title: "Commercial Agent", company: "Keller Williams Turkey", department: "Commercial", location: "Izmir", description: "Commercial real estate specialist", requirements: "Commercial real estate experience, business acumen, negotiation skills" },
  { title: "Property Manager", company: "Keller Williams Turkey", department: "Operations", location: "Istanbul", description: "Property management for rental portfolio", requirements: "Property management certification, tenant relations experience" },
  { title: "Mortgage Specialist", company: "Keller Williams Turkey", department: "Financial", location: "Ankara", description: "Loan and financing expertise", requirements: "Mortgage license, financial analysis skills, lending experience" },
  { title: "Luxury Agent", company: "Keller Williams Turkey", department: "Premium", location: "Istanbul", description: "High-end luxury property sales", requirements: "5+ years experience, luxury market knowledge, high net worth client relations" },
];

const HIRING_MANAGERS = [
  { name: "Zeynep Yilmaz", email: "zeynep@kw.com.tr" },
  { name: "Mehmet Ozkan", email: "mehmet@kw.com.tr" },
  { name: "Ayşe Demir", email: "ayse@kw.com.tr" },
  { name: "Kerem Başer", email: "kerem@kw.com.tr" },
  { name: "Nazli Kaya", email: "nazli@kw.com.tr" },
  { name: "Emre Şahin", email: "emre@kw.com.tr" },
];

const CANDIDATE_NAMES = [
  "Ahmet", "Betül", "Cem", "Dilek", "Emir", "Fatma", "Gökhan", "Hülya", "İbrahim", "İpek",
  "Jale", "Kemal", "Leyla", "Mert", "Nuriye", "Orhan", "Pınar", "Rıza", "Seda", "Tarık",
  "Ufuk", "Vildan", "Yusuf", "Zeynep", "Ali", "Nur", "Deniz", "Elif", "Figen", "Gültekin",
];

const CANDIDATE_SURNAMES = [
  "Yilmaz", "Özkan", "Demir", "Başer", "Kaya", "Şahin", "Tekin", "Arslan", "Aslan", "Bayhan",
  "Çetin", "Duman", "Erdoğan", "Fidan", "Gündüz", "Hançer", "Iştır", "Jankovic", "Kaplan", "Korkmaz",
];

const SPECIALIZATIONS = ["Konut", "Ticari", "Arsa", "Lüks", "Yatırım", "Kiralık"];
const LANGUAGES = ["Türkçe", "İngilizce", "Almanca", "Arapça"];
const CITIES = ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Gaziantep", "Konya", "Kayseri", "Samsun"];
const DISTRICTS = ["Kadıköy", "Beşiktaş", "Fatih", "Çankaya", "Alsancak", "Karabağlar", "Nilüfer", "Yıldırım"];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomElements<T>(arr: T[], count: number): T[] {
  const result: T[] = [];
  for (let i = 0; i < count && i < arr.length; i++) {
    const elem = randomElement(arr);
    if (!result.includes(elem)) result.push(elem);
  }
  return result;
}

function generateCandidateName(): string {
  return `${randomElement(CANDIDATE_NAMES)} ${randomElement(CANDIDATE_SURNAMES)}`;
}

async function seed() {
  console.log("[seed] Starting...");

  try {
    // Clear existing data (except admin)
    await db.delete(offers);
    await db.delete(interviews);
    await db.delete(applications);
    await db.delete(jobAssignments);
    await db.delete(candidates);
    await db.delete(jobs);
    await db.delete(users).where(ne(users.email, "admin@kw.com.tr"));
    console.log("[seed] Cleared existing data");

    // Create jobs
    const createdJobs = [];
    for (const job of JOBS) {
      const [created] = await db
        .insert(jobs)
        .values({ ...job, status: "open", budget: 100000 + Math.random() * 50000 })
        .returning();
      createdJobs.push(created);
    }
    console.log(`[seed] Created ${createdJobs.length} jobs`);

    // Create hiring managers and assign jobs
    const createdManagers = [];
    for (let i = 0; i < HIRING_MANAGERS.length; i++) {
      const hm = HIRING_MANAGERS[i];
      const hash = await bcrypt.hash("hm1234", 10);
      const [user] = await db
        .insert(users)
        .values({ name: hm.name, email: hm.email, passwordHash: hash, role: "hiring_manager" })
        .returning();
      createdManagers.push(user);

      // Assign this manager to the corresponding job
      await db.insert(jobAssignments).values({ jobId: createdJobs[i].id, userId: user.id });
    }
    console.log(`[seed] Created ${createdManagers.length} hiring managers and assigned jobs`);

    // Create 100 candidates per job
    let totalCandidates = 0;
    for (const job of createdJobs) {
      const jobCandidates = [];
      for (let i = 0; i < 100; i++) {
        const category = ["K0", "K1", "K2"][Math.floor(Math.random() * 3)] as any;
        const [cand] = await db
          .insert(candidates)
          .values({
            name: generateCandidateName(),
            email: `candidate${totalCandidates + i}@example.com`,
            phone: `+90${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            category,
            currentBrand: category === "K0" ? null : randomElement(["RE/MAX", "Realty Group", "Century 21", "Local Agent"]),
            licenseStatus: category === "K0" ? "unlicensed" : randomElement(["pending", "licensed"]),
            licenseNumber: category === "K0" ? null : `LIC${Math.floor(Math.random() * 1000000)}`,
            city: randomElement(CITIES),
            district: randomElement(DISTRICTS),
            specialization: randomElements(SPECIALIZATIONS, Math.floor(Math.random() * 3) + 1),
            languages: randomElements(LANGUAGES, Math.floor(Math.random() * 2) + 1),
            referredBy: Math.random() > 0.7 ? randomElement(createdManagers).name : null,
            experience: Math.floor(Math.random() * 15),
          })
          .returning();
        jobCandidates.push(cand);
      }
      totalCandidates += 100;

      // Create applications for all candidates to this job
      for (const cand of jobCandidates) {
        const appliedAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
        const [app] = await db
          .insert(applications)
          .values({
            jobId: job.id,
            candidateId: cand.id,
            status: "applied",
            score: 0,
            appliedAt,
          })
          .returning();

        const randDays = (min: number, max: number) =>
          Math.floor(Math.random() * (max - min + 1) + min);

        // Move some through the pipeline with realistic timestamp offsets
        const rand = Math.random();
        if (rand < 0.3) {
          // 30% → screening (2–7 days after applying)
          const screeningAt = new Date(appliedAt.getTime() + randDays(2, 7) * 86400000);
          await db.update(applications).set({ status: "screening" }).where(eq(applications.id, app.id));
          await storage.addStageHistory({
            applicationId: app.id, candidateId: cand.id, jobId: job.id,
            fromStatus: "applied", toStatus: "screening", enteredAt: screeningAt,
          });

          if (Math.random() < 0.5) {
            // 15% → interview (3–7 days after screening)
            const interviewAt = new Date(screeningAt.getTime() + randDays(3, 7) * 86400000);
            await db.update(applications).set({ status: "interview" }).where(eq(applications.id, app.id));
            await storage.addStageHistory({
              applicationId: app.id, candidateId: cand.id, jobId: job.id,
              fromStatus: "screening", toStatus: "interview", enteredAt: interviewAt,
            });

            // Schedule interview
            const startTime = new Date(interviewAt.getTime() + randDays(1, 5) * 86400000);
            await db.insert(interviews).values({
              applicationId: app.id,
              candidateId: cand.id,
              jobId: job.id,
              startTime,
              endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
              status: "scheduled",
              interviewerName: createdManagers.find((m) => m.id)?.name || "Interviewer",
              notes: "Initial screening interview",
            });

            if (Math.random() < 0.4) {
              // 6% → offer (3–10 days after interview)
              const offerAt = new Date(interviewAt.getTime() + randDays(3, 10) * 86400000);
              await db.update(applications).set({ status: "offer" }).where(eq(applications.id, app.id));
              await storage.addStageHistory({
                applicationId: app.id, candidateId: cand.id, jobId: job.id,
                fromStatus: "interview", toStatus: "offer", enteredAt: offerAt,
              });

              const amount = 150000 + Math.random() * 100000;
              const [off] = await db
                .insert(offers)
                .values({
                  applicationId: app.id,
                  candidateId: cand.id,
                  jobId: job.id,
                  amount: Math.floor(amount),
                  currency: "TRY",
                  status: Math.random() < 0.7 ? "pending_approval" : (Math.random() < 0.6 ? "accepted" : "rejected"),
                })
                .returning();

              if (off.status === "accepted") {
                const hiredAt = new Date(offerAt.getTime() + randDays(1, 5) * 86400000);
                await db.update(applications).set({ status: "hired" }).where(eq(applications.id, app.id));
                await storage.addStageHistory({
                  applicationId: app.id, candidateId: cand.id, jobId: job.id,
                  fromStatus: "offer", toStatus: "hired", enteredAt: hiredAt,
                });
              }
            }
          }
        } else if (rand < 0.5) {
          // 20% → rejected (1–5 days after applying)
          const rejectedAt = new Date(appliedAt.getTime() + randDays(1, 5) * 86400000);
          await db.update(applications).set({ status: "rejected" }).where(eq(applications.id, app.id));
          await storage.addStageHistory({
            applicationId: app.id, candidateId: cand.id, jobId: job.id,
            fromStatus: "applied", toStatus: "rejected", enteredAt: rejectedAt,
          });
        }
      }
    }

    console.log(`[seed] Created ${totalCandidates} candidates and applications with interviews and offers`);
    console.log("[seed] ✅ Seed complete!");
  } catch (err) {
    console.error("[seed] Error:", err);
    process.exit(1);
  }
}

seed();
