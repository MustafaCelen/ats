#!/bin/bash
set -e
npm install
# drizzle-kit push BİLEREK çalıştırılmıyor: interaktif "sil/oluştur" prompt'u
# piped girdiyle güvenilir davranmıyor (bir "No" girdisi "Yes, bu kolonu sil"
# olarak yorumlanıp gerçek veriyi silebildiğini gördük).
# Şema senkronu sunucu açılışında server/ensure-schema.ts ile yapılır: yalnızca
# ekleme (CREATE/ADD IF NOT EXISTS), hiç DROP yok. Bu yüzden pull sonrası sunucu
# YENİDEN BAŞLATILMALI (npm run dev kod değişince kendini yeniden başlatmaz).
# Gerçek bir kolon/tablo kaldırma her zaman elle, bilinçli bir migration olarak yapılır.
