// ── ÜK 45+45 Başarı Rotası: hoş geldin maili ─────────────────────────────────
// Programa eklenen danışmana portal erişim linkini gönderir (manuel tetiklenir).
// E-posta istemcileri için tablo tabanlı, satır içi stilli HTML.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmtDateTr(ymd: string | null): string {
  if (!ymd) return "—";
  const d = new Date(ymd.slice(0, 10) + "T00:00:00Z");
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" }).format(d);
}

export function buildUkWelcomeEmail(opts: {
  name: string;
  coachName: string | null;
  week1Monday: string | null;
  link: string;
  loginEmails: string[];
}): { subject: string; html: string } {
  const firstName = opts.name.trim().split(/\s+/)[0] ?? opts.name;
  const subject = "45+45 Başarı Rotası'na hoş geldiniz — erişim linkiniz";
  const login = opts.loginEmails.length
    ? opts.loginEmails.map((m) => `<b>${esc(m)}</b>`).join(" veya ")
    : "kayıtlı KW e-posta";

  const step = (n: number, title: string, body: string) => `
    <tr>
      <td valign="top" style="padding:0 12px 14px 0;width:28px;">
        <div style="width:26px;height:26px;border-radius:13px;background:#24064f;color:#fcd34d;font:700 13px/26px Arial,sans-serif;text-align:center;">${n}</div>
      </td>
      <td valign="top" style="padding:0 0 14px 0;font:14px/1.5 Arial,sans-serif;color:#334155;">
        <b style="color:#0f172a;">${title}</b><br>${body}
      </td>
    </tr>`;

  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#24064f;padding:28px 32px;">
      <div style="font:600 11px/1 Arial,sans-serif;letter-spacing:2px;color:#c4b5fd;">KW PLATİN &amp; KARMA · ÜRETKENLİK KOÇLUĞU PROGRAMI</div>
      <div style="font:800 28px/1.2 Arial,sans-serif;color:#ffffff;margin-top:10px;">45+45 Başarı Rotası</div>
      <div style="font:15px/1.4 Arial,sans-serif;color:#e9d5ff;margin-top:6px;">Programa dahil oldunuz, hoş geldiniz!</div>
    </td></tr>

    <tr><td style="padding:28px 32px 8px 32px;font:15px/1.6 Arial,sans-serif;color:#334155;">
      <p style="margin:0 0 14px 0;">Merhaba <b style="color:#0f172a;">${esc(firstName)}</b>,</p>
      <p style="margin:0 0 14px 0;">
        Üretkenlik Koçluğu kapsamında <b>45+45 Başarı Rotası</b>'na dahil edildiniz. Önümüzdeki
        <b>6 hafta</b> boyunca günlük aktivitelerinizi ve haftalık hedeflerinizi koçunuzla birlikte
        bu rota üzerinden takip edeceksiniz.
      </p>
    </td></tr>

    <tr><td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;">
        <tr>
          <td style="padding:14px 16px;font:13px/1.4 Arial,sans-serif;color:#6b21a8;width:50%;">
            Program başlangıcı<br><b style="font-size:15px;color:#24064f;">${esc(fmtDateTr(opts.week1Monday))}</b>
          </td>
          <td style="padding:14px 16px;font:13px/1.4 Arial,sans-serif;color:#6b21a8;">
            Koçunuz<br><b style="font-size:15px;color:#24064f;">${esc(opts.coachName ?? "Ofis tarafından atanacak")}</b>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td align="center" style="padding:26px 32px 8px 32px;">
      <a href="${esc(opts.link)}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font:700 16px/1 Arial,sans-serif;padding:16px 34px;border-radius:12px;">Rotama Git →</a>
    </td></tr>

    <tr><td style="padding:22px 32px 6px 32px;">
      <div style="font:700 15px/1.3 Arial,sans-serif;color:#0f172a;margin-bottom:14px;">Nasıl kullanılır?</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${step(1, "Linke tıklayın", "Yukarıdaki butonla size özel rota sayfanızı açın. Telefonunuzdan da kullanabilirsiniz.")}
        ${step(2, "Google ile giriş yapın", `Güvenliğiniz için ${login} hesabınızla giriş yapmanız istenir.`)}
        ${step(3, "Günlük aktivitelerinizi işaretleyin", "Her gün tamamladığınız aktiviteleri listeden ya da takvim görünümünden işaretleyin. Yalnızca içinde bulunduğunuz hafta düzenlenebilir.")}
        ${step(4, "Haftanızı koçunuzla teyit edin", "Hafta sonunda arama, randevu ve tek yetki sayılarınızı girin; koçunuz haftanızı değerlendirip onaylar.")}
      </table>
    </td></tr>

    <tr><td style="padding:6px 32px 26px 32px;font:12px/1.6 Arial,sans-serif;color:#64748b;">
      Buton çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>
      <a href="${esc(opts.link)}" style="color:#4f46e5;word-break:break-all;">${esc(opts.link)}</a>
    </td></tr>

    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;font:12px/1.5 Arial,sans-serif;color:#64748b;">
      Bu bağlantı yalnızca size özeldir, lütfen başkalarıyla paylaşmayın. Sorularınız için koçunuzla iletişime geçebilirsiniz.<br>
      <b style="color:#334155;">KW Platin &amp; Karma</b>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
  return { subject, html };
}
