#!/bin/bash
set -e
npm install
# drizzle-kit push BİLEREK çalıştırılmıyor: interaktif "sil/oluştur" prompt'u
# piped girdiyle güvenilir davranmıyor (bir "No" girdisi "Yes, bu kolonu sil"
# olarak yorumlanıp gerçek veriyi silebildiğini gördük). Şema senkronu tamamen
# ensure-tables.sh'e dayanıyor: sadece ekleme yapar (CREATE/ADD), hiç DROP yok.
# Gerçek bir kolon/tablo kaldırma her zaman elle, bilinçli bir migration olarak
# yapılmalı — otomatik akışın bir parçası olmamalı.
sh script/ensure-tables.sh
