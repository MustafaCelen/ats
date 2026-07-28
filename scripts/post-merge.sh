#!/bin/bash
set -e
npm install
# drizzle-kit push bazen "yeniden adlandır mı oluştur mu" gibi interaktif bir soru
# sorabiliyor; bu ortamda cevap veremeyeceğimiz için "No" besleyip devam ediyoruz
# ve sonucu ne olursa olsun ensure-tables.sh'i çalıştırıyoruz — o script tüm
# eksik tablo/kolonu idempotent şekilde garanti altına alıyor (Dockerfile'daki
# yerel akışla birebir aynı, bkz. Dockerfile CMD).
echo 'No' | npx drizzle-kit push --force || true
sh script/ensure-tables.sh
