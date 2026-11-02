import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// Tek, havuzlu bağlantı: toplu gönderimde her mail için yeni SMTP oturumu açmak Gmail'in
// bağlantı/giriş sınırlarına takılıyordu (2026-11-02, ~200 mailden sonra kesildi).
let cached: { key: string; t: Transporter } | null = null;
function getTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  const key = `${user}:${pass}`;
  if (cached?.key !== key) {
    cached = { key, t: nodemailer.createTransport({ service: "gmail", auth: { user, pass }, pool: true, maxConnections: 2, maxMessages: 50 }) };
  }
  return cached.t;
}

export type SendResult = { ok: true } | { ok: false; error: string; quota: boolean };

// Gmail'in gün/dakika kotası aşıldığında döndürdüğü yanıtlar (550 5.4.5, 421 4.7.0, 454 4.7.0 …).
function isQuotaError(msg: string): boolean {
  return /quota|rate limit|too many|5\.4\.5|4\.7\.0|421|454/i.test(msg);
}

export async function sendEmailDetailed(to: string, subject: string, html: string): Promise<SendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set, skipping.");
    return { ok: false, error: "Mail ayarları (GMAIL_USER / GMAIL_APP_PASSWORD) tanımlı değil", quota: false };
  }
  try {
    await transporter.sendMail({
      from: `"KW Platin & Karma" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    const msg = String(err?.response || err?.message || err);
    console.warn("[Email] Send failed:", msg);
    return { ok: false, error: msg.slice(0, 200), quota: isQuotaError(msg) };
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  return (await sendEmailDetailed(to, subject, html)).ok;
}
