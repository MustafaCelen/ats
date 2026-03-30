import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

const STATUS_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview Scheduled",
  offer: "Offer Extended",
  hired: "Hired",
  rejected: "Not Selected",
};

export async function sendStatusChangeEmail(opts: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  company: string;
  fromStatus: string | null;
  toStatus: string;
}): Promise<{ success: boolean; error?: string }> {
  const transport = createTransport();
  if (!transport) {
    return { success: false, error: "SMTP not configured" };
  }

  const fromLabel = opts.fromStatus ? STATUS_LABELS[opts.fromStatus] || opts.fromStatus : "New Application";
  const toLabel = STATUS_LABELS[opts.toStatus] || opts.toStatus;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: linear-gradient(135deg, #3b5bdb 0%, #7048e8 100%); padding: 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">HireFlow ATS</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">Application Status Update</p>
      </div>
      <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin: 0 0 20px; color: #374151;">Hi ${opts.candidateName},</p>
        <p style="font-size: 15px; color: #6b7280; margin: 0 0 24px;">Your application for <strong style="color: #1a1a2e;">${opts.jobTitle}</strong> at <strong style="color: #1a1a2e;">${opts.company}</strong> has been updated.</p>
        
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="background: #e5e7eb; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; color: #6b7280;">${fromLabel}</div>
            <div style="color: #9ca3af; font-size: 18px;">→</div>
            <div style="background: #dbeafe; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 700; color: #1d4ed8;">${toLabel}</div>
          </div>
        </div>

        <p style="color: #9ca3af; font-size: 13px; margin: 24px 0 0;">We'll keep you updated as your application progresses. Thank you for your interest!</p>
      </div>
      <p style="color: #d1d5db; font-size: 12px; text-align: center; margin: 16px 0 0;">Sent by HireFlow ATS</p>
    </div>
  `;

  try {
    await transport.sendMail({
      from: `"HireFlow ATS" <${from}>`,
      to: opts.candidateEmail,
      subject: `Application Update: ${toLabel} — ${opts.jobTitle} at ${opts.company}`,
      html,
    });
    return { success: true };
  } catch (err: any) {
    console.error("[email] Failed to send:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; error?: string }> {
  const transport = createTransport();
  if (!transport) {
    return { success: false, error: "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables." };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    await transport.sendMail({
      from: `"HireFlow ATS" <${from}>`,
      to: toEmail,
      subject: "HireFlow — SMTP Test Email",
      html: `<div style="font-family: sans-serif; padding: 24px;"><h2>Test Email</h2><p>Your SMTP configuration is working correctly!</p></div>`,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
