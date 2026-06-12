SALASILAH KELUARGA ELIT — PWA
==============================

KANDUNGAN:
- index.html      → Halaman utama PWA
- app.js          → Logik depan (auth, kanvas, pasangan, anak, nota, admin)
- Code.gs         → Backend Google Apps Script
- manifest.json   → Manifest PWA
- sw.js           → Service worker (offline)

LANGKAH PEMASANGAN:
1. Buat Google Sheet baru di https://sheets.new
2. Salin ID Sheet (di antara /d/ dan /edit dalam URL)
3. Buka Extensions → Apps Script, tampal kandungan Code.gs
4. Tetapkan SHEET_ID di baris atas Code.gs
5. Klik Deploy → New Deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
6. Salin URL Web App, tampal ke API_URL dalam app.js (baris atas)
7. Hos 5 fail ini di mana-mana (GitHub Pages, Netlify, Vercel, atau pelayan sendiri)
8. Buka di pelayar, klik "Pasang" untuk pasang sebagai aplikasi

AKAUN PENTADBIR UTAMA:
- Pengguna: admin
- Kata laluan: 101010
(Sila tukar kata laluan selepas log masuk pertama!)

CIRI:
✓ Pokok salasilah 3D dengan zoom & drag (Panzoom)
✓ 5 tema warna mewah (Parchment, Royal, Emerald, Rose, Midnight)
✓ Pasangan banyak, ID pasangan unik, anak tak tersilap cabang
✓ Nota bebas atas kanvas
✓ Sistem kelulusan: pengguna biasa → pending → admin lulus
✓ Carian nama/tempat/tahun/catatan dengan navigasi ↑↓
✓ PWA: boleh dipasang, berfungsi luar talian
✓ Keselamatan: SHA-256 + salt, token sesi, semakan peranan
✓ Bahasa Melayu sepenuhnya
