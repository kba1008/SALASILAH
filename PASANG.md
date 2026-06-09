# SALASILAH TURBO — Fail Lengkap (Drop-in Replace)

Tiada copy-paste. Hanya **TIMPA** 2 fail:

## Langkah 1 — Code.gs (Apps Script)
1. Buka Google Sheet → **Extensions → Apps Script**.
2. Pilih fail `Code.gs` di sidebar kiri.
3. Pilih **SEMUA** kandungannya (Ctrl+A) dan **PADAM**.
4. Buka `code.gs` dari folder ini, pilih semua, salin, tampal masuk.
5. **Simpan** (Ctrl+S).
6. **Run sekali**: pilih fungsi `INITIALIZE_SYSTEM` dari dropdown atas, klik ▶ Run. (Beri kebenaran kalau diminta.)
7. **Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy**.

## Langkah 2 — app.js (GitHub Pages)
1. Buka https://github.com/kba1008/SALASILAH
2. Klik fail `app.js` → klik ikon ✎ (Edit).
3. Pilih semua (Ctrl+A), padam, tampal kandungan `app.js` dari folder ini.
4. Scroll bawah → **Commit changes**.

## Langkah 3 — Refresh
Tunggu 1 minit (GitHub Pages deploy), kemudian buka aplikasi anda.

## Apa yang TURBO buat?
| Optimasi | Kesan |
|---|---|
| Cache `migrateHeaders` via ScriptProperties | −10 ke −20s setiap request |
| Cache hasil `getTree` 30 saat (CacheService) | getTree berulang <500ms |
| Auto-invalidate cache selepas save/delete | Data sentiasa fresh |
| Pre-warm Apps Script masa page load | Cold-start berlaku SEBELUM user klik login |
| Login: load profile + tree SECARA SELARI | −50% masa selepas login |
| Action `ping` untuk health check | Boleh dipakai cron uptime |

**Jangkaan:** login pertama 3–6s (dari 60s), login berulang 1–2s.

Tiada perubahan pada UI, struktur data, atau sheet — 100% compatible dengan data sedia ada.
