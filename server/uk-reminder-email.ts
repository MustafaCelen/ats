// ── ÜK 45+45 Başarı Rotası: haftalık hatırlatma maili ───────────────────────
// İçinde bulunduğu haftada hiç aktivite işaretlememiş danışmana gider (admin elle ya da cron).
// Hoş geldin mailiyle aynı görsel dil; tablo tabanlı, satır içi stilli HTML.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmtDateTr(ymd: string): string {
  const d = new Date(ymd.slice(0, 10) + "T00:00:00Z");
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" }).format(d);
}

export function buildUkReminderEmail(opts: {
  name: string;
  coachName: string | null;
  week: number;            // içinde bulunulan program haftası (1–12)
  totalWeeks: number;      // 12
  sundayYmd: string;       // bu haftanın pazarı (son giriş günü)
  link: string;
}): { subject: string; html: string } {
  const firstName = (opts.name.trim().split(/\s+/)[0] || opts.name.trim()) || "Danışman";
  const subject = `45+45 Başarı Rotası — ${opts.week}. hafta kontrolü: bu hafta henüz girişiniz yok`;

  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#24064f;padding:28px 32px;">
      <div style="font:600 11px/1 Arial,sans-serif;letter-spacing:2px;color:#c4b5fd;">KW PLATİN &amp; KARMA · ÜRETKENLİK KOÇLUĞU PROGRAMI</div>
      <div style="font:800 28px/1.2 Arial,sans-serif;color:#ffffff;margin-top:10px;">45+45 Başarı Rotası</div>
      <div style="font:15px/1.4 Arial,sans-serif;color:#e9d5ff;margin-top:6px;">Haftalık kontrol · ${opts.week}. hafta</div>
    </td></tr>

    <tr><td style="padding:28px 32px 8px 32px;font:15px/1.6 Arial,sans-serif;color:#334155;">
      <p style="margin:0 0 14px 0;">Merhaba <b style="color:#0f172a;">${esc(firstName)}</b>,</p>
      <p style="margin:0 0 14px 0;">
        ${opts.totalWeeks} haftalık rotanın <b>${opts.week}. haftasındayız</b> ve bu hafta henüz hiç aktivite işaretlememişsiniz.
        Rotanın işe yaraması için her haftanın düzenli girilmesi gerekiyor; küçük adımlar bile skorunuza yazılır.
      </p>
    </td></tr>

    <tr><td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
        <tr>
          <td style="padding:14px 16px;font:13px/1.4 Arial,sans-serif;color:#9a3412;width:50%;">
            Son giriş günü<br><b style="font-size:15px;color:#7c2d12;">${esc(fmtDateTr(opts.sundayYmd))} 23:59</b>
          </td>
          <td style="padding:14px 16px;font:13px/1.4 Arial,sans-serif;color:#9a3412;">
            Koçunuz<br><b style="font-size:15px;color:#7c2d12;">${esc(opts.coachName ?? "—")}</b>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td align="center" style="padding:26px 32px 8px 32px;">
      <a href="${esc(opts.link)}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font:700 16px/1 Arial,sans-serif;padding:16px 34px;border-radius:12px;">Rotama Git →</a>
    </td></tr>

    <tr><td style="padding:22px 32px 6px 32px;font:14px/1.6 Arial,sans-serif;color:#334155;">
      <b style="color:#0f172a;">Ne yapmalı?</b><br>
      Bu hafta tamamladığınız aktiviteleri listeden ya da takvim görünümünden işaretleyin; hafta sonunda arama, randevu ve
      tek yetki sayılarınızı da girin. Pazar 23:59’dan sonra bu haftanın girişleri kapanır.
    </td></tr>

    <tr><td style="padding:6px 32px 26px 32px;font:12px/1.6 Arial,sans-serif;color:#64748b;">
      Buton çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>
      <a href="${esc(opts.link)}" style="color:#4f46e5;word-break:break-all;">${esc(opts.link)}</a>
    </td></tr>

    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;font:12px/1.5 Arial,sans-serif;color:#64748b;">
      Bu bağlantı yalnızca size özeldir, lütfen başkalarıyla paylaşmayın. Girişlerinizi yaptıysanız bu maili dikkate almayın.<br>
      <b style="color:#334155;">KW Platin &amp; Karma</b>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
  return { subject, html };
}
