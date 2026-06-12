HASILKAN PWA LENGKAP — Salasilah Keluarga 

APA YANG KITA NAK BINA?
-PAPARAN CANGIH,SPERTI 3D TIMBUL
- Aplikasi web dalam bahasa Melayu yang boleh dipasang macam app telefon.
- Nama: "Salasilah Keluarga Elit".
- Fungsi: tengok, urus, dan kongsi pokok salasilah keluarga secara visual.
- Boleh zoom, drag, tambah ahli, pasangan, anak, dan teks atas kanvas utama.
-wujudkan satu id khas untuk menentukan hubungan suami isteri(jika individu terbabit pernah berkahwin lebihd ari seorang pun sistem tak pening), id khas yang menghubungkan anak dan ibu bapa mereka.

TEKNOLOGI
- Depan: satu halaman HTML, Tailwind CSS CDN, JavaScript, dan pustaka Panzoom.
- Belakang: Google Apps Script yang tulis ke Google Sheets dan simpan gambar ke Google Drive.
- 5 Fail: index.html, app.js, Code.gs, manifest.json, sw.js.

TEMA WARNA (5 PILIHAN,)
-aplikasi ini nampak cangih,3D dan shadow
- Parchment (krim + emas), Royal (biru gelap + emas), Emerald (hijau zaitun), Rose (merah jambu), Midnight (hitam + emas).
-pilihan font dan warna berbeza supaya boleh di baca dengan jelas tidak tengelam dengan warna tema.

SKEMA DATA (GOOGLE SHEETS)
- PENGGUNA — akaun pengguna (nama, emel, telefon, kata laluan sulit, peranan, token).
- SALASILAH — data pokok keluarga (ID, bapa/ibu, nama, jantina, hidup/mati, tarikh, pasangan, gambar, catatan.
- PASANGAN — rekod perkahwinan (suami, isteri, status, tarikh kahwin/cerai/kematian).
- ANAK — hubungkan anak dengan pasangan ibu bapa yang betul.
- NOTA — nota bebas atas kanvas (teks, kedudukan, fon, saiz, warna).
- PENDING — senarai perubahan menunggu kelulusan pentadbir.

BACKEND (GOOGLE APPS SCRIPT)
- Semua melalui satu URL POST. Hantar nama pengguna + token untuk sahkan identiti.
- Kerja: log masuk/daftar, tambah/ubah ahli, urus pasangan/anak/nota, kelulusan pentadbir, muat naik gambar ke Drive.
- Pentadbir pertama: username "admin", kata laluan "101010".

PERATURAN AKSES
- Pengguna biasa: perubahan masuk Pending dulu, pentadbir perlu lulus.
- Pentadbir: buat apa-apa terus tanpa tunggu.
- Setiap tindakan ada rekod "siapa edit, bila edit, siapa lulus, bila lulus".

RUPIAN APLIKASI
- Skrin pemuatan dengan petua bertukar dalam Melayu.
- Bar atas: logo, maklumat pengguna, butang cari, zoom, tambah nota, profil, pentadbir, tetapan, log keluar.
- Kanvas pokok: zoom macam Google Maps, susun automatik (generasi ke bawah, pasangan sebelah-sebelah, anak turun dari tengah pasangan), kedudukan dikunci.
- Kad ahli: gambar bulat, nama klasik, ikon jantina, warna hidup/mati, tahun lahir–mati. Klik buka modal: Edit, Tambah Anak, Tambah Pasangan, Tambah Nota, Pindah Cabang (admin), Padam.
- Pasangan: pilih dari senarai atau buat baru, set tarikh kahwin/cerai/kematian, susun turutan.
- Anak: wajib pilih pasangan ibu bapa supaya tak tersalah cabang.
- Nota: letak di mana-mana, tukar fon/saiz/warna, pentadbir boleh tampal supaya kekal.
- Cari: taip nama/tempat/tahun/catatan, hasil dinyala, anak panah ↑↓ untuk lompat, kanvas auto center ke orang yang dicari.
- Profil: ahli boleh "padankan" diri dengan kad dalam pokok. Semasa daftar, isi nama bapa & ibu untuk sistem cadangkan padanan.
- Panel pentadbir: tab Luluskan/Tolak, tab Urus Pengguna, tab Mulakan Pokok.
- Boleh guna tanpa internet: service worker simpan halaman asas, data segerak bila internet kembali.

PENGALAMAN PENGGUNA
- Semua dalam bahasa Melayu. Toast muncul bawah tengah selama 3 saat.
- Telefon: pinch zoom, tarik dua jari, tekan lama untuk menu.
- Warna kontras tinggi, senang baca.
- Tarikh bebas: DD-MM-YYYY atau "lebih kurang 1950".
- Telefon & emel hanya kelihatan pada profil sendiri dan pentadbir.

KESELAMATAN
- Kata laluan: SHA-256 + garam (salt).
- Token sesi unik simpan di localStorage.
- Semak token & peranan setiap tindakan.
- Hanya master admin boleh tukar peranan admin lain.
- Input diperiksa panjang & format. Gambar max 5MB, hanya jpg/png/webp.

HASIL AKHIR
- Fail siap: index.html, app.js, Code.gs, manifest.json, sw.js.
- Arahan:
  1. Buat Google Sheet baru
  2. Salin ID-nya
  3. Deploy Code.gs sebagai Web App
  4. Tampal URL Web App ke dalam app.js


