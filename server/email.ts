import nodemailer from "nodemailer";

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set, skipping.");
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"KW Platin & Karma" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.warn("[Email] Send failed:", err);
    return false;
  }
}
