// Liste hizalama denetimi (test değil, ölçüm aracı).
// Her sayfadaki <table> ve grid tabanlı listelerde:
//   wrap   : hücredeki metin ikinci satıra sarıyor mu (nowrap verilince yükseklik düşüyorsa sarıyordur)
//   align  : başlık hizası gövde hücresiyle aynı mı (text-align)
//   height : satır yükseklikleri birbirinden sapıyor mu (medyanın %35 üstü)
// Kullanım: node audit-lists.mjs [route ...]   (uygulama localhost:5000'de açık olmalı)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5000";
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : [
  "/dashboard", "/jobs", "/candidates", "/interviews", "/reports", "/users", "/tasks", "/employees",
  "/lead-tracking", "/uk-entry-exit", "/uk-basari-rotasi", "/closings", "/listings", "/listings/reports",
  "/closing-analytics", "/agent-health", "/financial-reports", "/advisor-scorecard", "/cap-report", "/coaching",
  "/expenses", "/expense-reports", "/duplicate-merge", "/duplicate-closings", "/campaigns", "/pl-report", "/teams",
  "/referans-eslestirme", "/borclular-raporu", "/hedef-giris", "/fonzip", "/whatsapp-bulk",
];

function chromiumPath() {
  const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (!fs.existsSync(root)) return undefined;
  for (const d of fs.readdirSync(root).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const exe = path.join(root, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ viewport: { width: Number(process.env.AUDIT_WIDTH ?? 1440), height: 1000 }, locale: "tr-TR" });
const r = await page.request.post(BASE + "/api/auth/login", { data: { email: "admin@kw.com.tr", password: "admin123" } });
if (!r.ok()) throw new Error("giriş başarısız");

const AUDIT = () => {
  const out = [];
  const lists = [];
  for (const t of document.querySelectorAll("table")) {
    // Çok satırlı başlıkta hizalama için SON başlık satırı esas (grup başlıkları ortalı olabilir).
    const headRows = t.querySelectorAll("thead tr");
    const head = headRows[headRows.length - 1];
    const rows = Array.from(t.querySelectorAll("tbody > tr")).filter((tr) => tr.querySelectorAll("td").length > 1);
    if (!head || rows.length < 1) continue;
    lists.push({ kind: "table", label: (head.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70), headCells: Array.from(head.children), rows: rows.map((tr) => Array.from(tr.children)) });
  }
  // grid listeler: başlık satırı + aynı grid-cols sınıfını taşıyan satırlar
  const gridHeads = Array.from(document.querySelectorAll("div[class*='grid-cols-[']")).filter((el) => {
    const cls = el.className;
    const m = cls.match(/grid-cols-\[[^\]]+\]/);
    if (!m) return false;
    const sib = el.parentElement?.querySelectorAll(`div[class*="${CSS.escape(m[0])}"]`) ?? [];
    return sib.length >= 3 && Array.from(el.children).every((c) => c.children.length === 0 || c.querySelector("button, svg"));
  });
  for (const head of gridHeads) {
    const m = head.className.match(/grid-cols-\[[^\]]+\]/);
    const rows = Array.from(head.parentElement.querySelectorAll(`div[class*="${CSS.escape(m[0])}"]`)).filter((d) => d !== head);
    lists.push({ kind: "grid", label: (head.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70), headCells: Array.from(head.children), rows: rows.map((d) => Array.from(d.children)) });
  }
  for (const L of lists) {
    const issues = [];
    // wrap: hücreyi nowrap'a zorlayınca yüksekliği düşüyorsa metin sarıyordur
    const style = document.createElement("style");
    style.textContent = ".__nw, .__nw * { white-space: nowrap !important; }";
    const sample = L.rows.slice(0, 40);
    // Hücrenin kendisi değil İÇERİĞİ ölçülür (td yüksekliği = satır yüksekliği olduğundan
    // bir hücrenin sarması tüm satırı yükseltir ve diğer hücreleri yanlış işaretlerdi).
    const contentH = (c) => { const rg = document.createRange(); rg.selectNodeContents(c); const b = rg.getBoundingClientRect(); return b.height; };
    const before = sample.map((cells) => cells.map(contentH));
    document.head.appendChild(style);
    sample.forEach((cells) => cells.forEach((c) => c.classList.add("__nw")));
    const after = sample.map((cells) => cells.map(contentH));
    sample.forEach((cells) => cells.forEach((c) => c.classList.remove("__nw")));
    style.remove();
    const wrapCols = new Map();
    sample.forEach((cells, ri) => cells.forEach((c, ci) => {
      if (before[ri][ci] - after[ri][ci] > 4 && !c.querySelector("textarea")) {
        const txt = (c.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
        if (!wrapCols.has(ci)) wrapCols.set(ci, { n: 0, ex: txt, head: (L.headCells[ci]?.textContent || "").trim() });
        wrapCols.get(ci).n++;
      }
    }));
    for (const [ci, w] of wrapCols) issues.push(`wrap  col${ci} "${w.head}" ${w.n} satır sarıyor (örn. "${w.ex}")`);
    // align: başlık ile gövde text-align farkı (sayısal sütunlarda sağ/sol karışıklığı)
    // rowSpan'lı çok satırlı başlıkta son satırın hücre sayısı gövdeyle eşleşmez → hizalama karşılaştırması atlanır
    const bodyCols = L.rows[0]?.length ?? 0;
    if (L.headCells.length === bodyCols) L.headCells.forEach((h, ci) => {
      const ha = getComputedStyle(h).textAlign;
      const bodyAligns = L.rows.slice(0, 10).map((cells) => cells[ci] && getComputedStyle(cells[ci]).textAlign).filter(Boolean);
      const ba = bodyAligns.sort((a, b) => bodyAligns.filter((v) => v === a).length - bodyAligns.filter((v) => v === b).length).pop();
      const norm = (a) => (a === "start" ? "left" : a === "end" ? "right" : a);
      if (ba && norm(ha) !== norm(ba) && (h.textContent || "").trim()) issues.push(`align col${ci} "${(h.textContent || "").trim()}" başlık=${norm(ha)} gövde=${norm(ba)}`);
    });
    // height: satır yükseklik sapması
    const hs = L.rows.map((cells) => cells[0]?.parentElement?.getBoundingClientRect().height ?? 0).filter((h) => h > 0).sort((a, b) => a - b);
    if (hs.length >= 3) {
      const med = hs[Math.floor(hs.length / 2)];
      const tall = hs.filter((h) => h > med * 1.35).length;
      if (tall) issues.push(`height ${tall}/${hs.length} satır medyandan (%.0f px) %35+ yüksek (max ${Math.round(hs[hs.length - 1])}px)`.replace("%.0f", String(Math.round(med))));
    }
    out.push({ kind: L.kind, label: L.label, rows: L.rows.length, issues });
  }
  return out;
};

const report = {};
let total = 0;
for (const route of ROUTES) {
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector("table tbody tr, div[class*=\"grid-cols-[\"]", { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(800);
  } catch (e) { report[route] = [{ error: String(e.message).slice(0, 80) }]; continue; }
  const res = await page.evaluate(AUDIT);
  report[route] = res;
  total += res.reduce((s, l) => s + l.issues.length, 0);
}
await browser.close();

for (const [route, lists] of Object.entries(report)) {
  const bad = lists.filter((l) => l.error || l.issues?.length);
  if (!bad.length) { console.log(`OK   ${route}  (${lists.length} liste)`); continue; }
  console.log(`!!   ${route}`);
  for (const l of bad) {
    if (l.error) { console.log(`     hata: ${l.error}`); continue; }
    console.log(`     [${l.kind}] ${l.rows} satır — ${l.label}`);
    for (const i of l.issues) console.log(`        - ${i}`);
  }
}
console.log(`\nToplam sorun: ${total}`);
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "audit-report.json"), JSON.stringify(report, null, 2));
