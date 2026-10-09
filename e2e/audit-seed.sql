-- Liste denetimi (audit-lists.mjs) için geçici örnek veri. Yerel/test veritabanında kullanılır;
-- audit-cleanup.sql ile silinir. Tüm kayıtlar "E2E Seed" / "E2E-" işaretlidir.
INSERT INTO candidates (name, category, office, city)
VALUES ('E2E Seed Uzunisimli Danışman Adayı', 'K1', 'Akatlar', 'İstanbul'),
       ('E2E Seed İkinci Danışman', 'K0', 'Zekeriyaköy', 'İstanbul'),
       ('E2E Seed Üçüncü Danışman', 'K2', 'Akatlar', 'Ankara');
INSERT INTO employees (candidate_id, status, kwuid, start_date, uretkenlik_koclugu, uk_start_date, uk_end_date)
SELECT c.id, 'active', '9' || lpad(c.id::text, 8, '0'), NOW() - INTERVAL '40 days', true,
       CASE WHEN c.name LIKE '%Üçüncü%' THEN NULL ELSE CURRENT_DATE - 3 END,
       CASE WHEN c.name LIKE '%Üçüncü%' THEN CURRENT_DATE - 1 ELSE NULL END
  FROM candidates c WHERE c.name LIKE 'E2E Seed %';
INSERT INTO tasks (title, description, due_date, status, assigned_to_user_id, created_by_user_id)
VALUES ('E2E Görev: Aday ile görüşme planla', 'Uzun açıklama metni — tek satırda kesilmeli, satır sarmamalı; devamı tooltip ile görünür.', CURRENT_DATE + 2, 'pending', 2, 1),
       ('E2E Görev: Sözleşme hazırla', NULL, CURRENT_DATE - 1, 'in_progress', 3, 1),
       ('E2E Görev: Onboarding kontrol', 'Kısa not', NULL, 'done', 2, 1);
INSERT INTO listings (listing_number, price, deal_category, published_date, advisor_name, employee_id, office, status, public_token, ilce, mahalle, emlak_tipi, oda_sayisi, m2_net, firebase_synced_at)
SELECT 'E2E-' || (1000 + row_number() OVER ()), v.price, v.cat, v.pub, c.name, e.id, c.office, v.st, md5(random()::text), 'Beşiktaş', 'Levent', 'Daire', '3+1', 120, NOW()
  FROM (VALUES (12500000::numeric, 'Satılık', '2026-07-01', 'active'), (85000::numeric, 'Kiralık', '2026-09-15', 'active'), (9800000::numeric, 'Satılık', '2026-03-10', 'passive')) AS v(price, cat, pub, st)
  CROSS JOIN LATERAL (SELECT e.id, e.candidate_id FROM employees e JOIN candidates c2 ON c2.id = e.candidate_id WHERE c2.name LIKE 'E2E Seed %' ORDER BY e.id LIMIT 1) e
  JOIN candidates c ON c.id = e.candidate_id;
INSERT INTO whatsapp_bulk_sends (employee_name, phone, template_sid, template_name, status, created_by_user_id, error)
VALUES ('E2E Seed Uzunisimli Danışman Adayı', '05551112233', 'HX000', 'E2E Şablon Sözleşme Hatırlatma', 'sent', 1, NULL),
       ('E2E Seed İkinci Danışman', '05551112244', 'HX000', 'E2E Şablon Kapanış Sebebi', 'failed', 1, 'E2E hata');
