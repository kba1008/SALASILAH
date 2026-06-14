SALASILAH KELUARGA v4.1 — LANGKAH WAJIB UNTUK BETULKAN setSettings

Jika keluar ralat:
"Tindakan tidak dikenali: setSettings"

Puncanya: app.js sudah baharu, tetapi Google Apps Script Web App masih menjalankan Code.gs versi lama.

Ikut langkah ini tepat-tepat:

1. Buka Google Apps Script projek anda.
2. Buka fail Code.gs.
3. Tekan Ctrl+A dan padam SEMUA kandungan lama.
4. Salin SEMUA kandungan fail Code.gs dari pakej v4.1 ini dan tampal ke Apps Script.
5. Tekan Save.
6. Jalankan fungsi setupSheets sekali jika diminta kebenaran.
7. Pergi ke Deploy > Manage deployments.
8. Tekan ikon pensel / Edit pada Web App sedia ada.
9. Pada bahagian Version, pilih New version.
10. Tekan Deploy.
11. Buka URL Web App /exec dalam browser. Pastikan JSON memaparkan "version":"4.1" dan senarai actions ada "setSettings".
12. Refresh PWA / clear cache jika perlu.

PENTING:
- Jangan hanya tekan Save tanpa deploy New version; Web App masih guna versi lama.
- Jika anda buat New deployment dengan URL baharu, pastikan API_URL dalam app.js ditukar kepada URL baharu itu.