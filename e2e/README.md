# Uçtan uca (E2E) testler — Playwright

Arayüzdeki butonları gerçek uygulama üzerinde tıklayarak test eder.

| Dosya | Kapsam |
|---|---|
| `tests/uk-liste.spec.ts` | 45+45 listesi: sekmeler, arama, koç filtresi, Danışman Ekle (admin / HM kuralları), hoş geldin maili önizleme |
| `tests/uk-detay.spec.ts` | Rota sayfası: başlangıç (yalnız pazartesi) ve "Şu an" haftası, kutucuklar, haftalık gerçekleşen + onay, skor/hedef tablosu, görüntüleme modu, programdan çıkarma, danışman gözüyle gör / link kopyala |
| `tests/uk-portal.spec.ts` | Danışman portalı (Rotam): yalnız içinde bulunulan hafta, puansız görünüm, kutucuk & gerçekleşen girişi, liste/takvim, onaylı hafta kilidi, başlamamış/tamamlanmış kartlar, yetki |
| `tests/uk-otomatik-katilim.spec.ts` | Danışmana ÜK koçu atanınca gelecek pazartesiden otomatik katılım |
| `tests/referans.spec.ts` | Referans → danışman eşleştirme: yazarken öneri, kaydederken onay, karar hafızası, Referans Eşleştirme ekranı |
| `tests/borc-uyarilari.spec.ts` | Fonzip borcu: Borç sekmesi & mutabakat, pasife alırken onay, işlem kapanışında uyarı |

## Çalıştırma

Önce uygulama yerelde ayakta olmalı (`docker compose up -d`, http://localhost:5000).

```bash
cd e2e
npm install            # ilk sefer
npm test               # tümü (başsız)
npm run test:headed    # tarayıcıyı görerek
npx playwright test tests/referans.spec.ts   # tek dosya
npm run report         # HTML rapor
```

Kökten: `npm run test:e2e`.

## Notlar

- **Yalnızca yerel / test veritabanında çalıştırın, canlıda değil.** Testler veritabanına doğrudan
  test verisi yazar (adı `E2E ` ile başlayan danışman/adaylar, sahte Fonzip borcu) ve sonunda siler.
  Yarıda kalan koşunun artıkları bir sonraki koşunun başında temizlenir. Veriyi incelemek için
  `E2E_KEEP_DATA=1 npm test`.
- Veritabanına varsayılan olarak `docker compose exec postgres psql` ile bağlanılır. Başka bir
  veritabanı için `E2E_DATABASE_URL=postgresql://...` verin.
- Danışman portalındaki Google girişi, oturum tablosuna kayıt + imzalı çerezle taklit edilir
  (`E2E_SESSION_SECRET`, varsayılan docker-compose'daki SESSION_SECRET).
- Diğer ortam değişkenleri: `E2E_BASE_URL` (varsayılan http://localhost:5000), `PW_CHROMIUM_PATH`
  (verilmezse `%LOCALAPPDATA%\ms-playwright` altındaki Chromium kullanılır; yoksa `npx playwright install chromium`).
- Gerçek mail gönderimi test edilmez (yerelde Gmail yok); mail önizlemesi ve buton/yetki kuralları test edilir.
- Bazı kontroller güne bağlıdır: "gelecek günler kapalı" testi haftanın son günlerinde daha az gün kontrol eder.

## Liste hizalama denetimi (`audit-lists.mjs`)

Tüm sayfalardaki tablo ve grid listeleri tarayıp şunları raporlar: hücre metni sarıyor mu,
başlık hizası gövdeyle aynı mı (sayı sağ / metin sol), satır yükseklikleri sapıyor mu.

```bash
cd e2e
docker compose -f ../docker-compose.yml exec -T postgres psql -U hireflow -d hireflow -f - < audit-seed.sql   # boş listeler için örnek veri (isteğe bağlı)
node audit-lists.mjs                 # tüm sayfalar
node audit-lists.mjs /employees      # tek sayfa
docker compose -f ../docker-compose.yml exec -T postgres psql -U hireflow -d hireflow -f - < audit-cleanup.sql
```

Liste kuralları (tüm sayfalarda ortak): başlıklar `SortTh`/`SortHead` ile tıklanarak sıralanır
(`@/lib/sort`: 1. tık artan, 2. tık azalan, 3. tık varsayılan; Türkçe harf sırası, boşlar sonda);
hücreler tek satır (`whitespace-nowrap`), uzun metin `truncate` + `title`; sayı/para sağa, `tabular-nums`.
