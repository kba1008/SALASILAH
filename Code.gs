/* =====================================================================
   Salasilah Keluarga Elit — Google Apps Script Backend (Code.gs)
   ---------------------------------------------------------------------
   LANGKAH PEMASANGAN:
   1) Buka https://sheets.new — buat Google Sheet kosong.
   2) Salin ID Sheet dari URL (di antara /d/ dan /edit) dan tampal pada SHEET_ID.
   3) KOSONGKAN DRIVE_FOLDER_ID supaya sistem auto-cipta folder 'SalasilahKeluarga_Photos'.
   4) Extensions → Apps Script → tampal fail ini → Save.
   5) Pilih fungsi `setupSheets` → Run. (Beri kebenaran / Authorize apabila diminta).
   6) Deploy → New deployment → Type: Web app
        • Execute as: Me
        • Who has access: Anyone
   7) Salin URL Web App → tampal ke API_URL dalam app.js.
   8) Buka app → log masuk dengan akaun master admin yang ditetapkan di bawah.
   ===================================================================== */

const SHEET_ID = '1wqIc6971U96VXqOJ55pD-wzxQicC4RT4TBNoUrUVtig'; // ← ISI ID GOOGLE SHEET DI SINI
const DRIVE_FOLDER_ID = '1tb1YIWlxbHkN-HzdAXtFlMWp136JXxN4'; // ← BIARKAN KOSONG untuk auto-cipta folder di Drive anda sendiri

const TELEGRAM_BOT_TOKEN = ''; // [PILIHAN] Masukkan token bot telegram jika mahu
const TELEGRAM_CHAT_ID = '';   // [PILIHAN] Masukkan chat ID kumpulan/admin

// Akaun MASTER ADMIN Ditanam di sini! Ia akan Bypass (langkau) Google Sheet.
const MASTER_USERNAME = 'milokopi';
const MASTER_PASSWORD = '101010';

const SHEETS = {
  PENGGUNA:  ['username','fullName','fatherName','motherName','address','whatsapp','occupation','photo','email','phone','password','passwordHash','salt','role','approved','token','memberId','createdAt'],
  SALASILAH: ['id','name','gender','alive','birth','death','place','address','photo','notes','fatherName','motherName','posX','posY','editedBy','editedAt','approvedBy','approvedAt'],
  PASANGAN:  ['id','husbandId','wifeId','status','marriageDate','divorceDate','deathDate','editedBy','editedAt'],
  ANAK:      ['spouseId','childId','editedBy','editedAt'],
  NOTA:      ['id','text','x','y','font','size','color','pinned','editedBy','editedAt'],
  PENDING:   ['id','action','payload','before','user','userFullName','reason','ts','status','approvedBy','approvedAt']
};
const MEMBER_ID_PREFIX = 'KEL';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const handler = HANDLERS[action];
    if (!handler) return json({ ok: false, error: 'Tindakan tidak dikenali: ' + action });
    return json(handler(body) || { ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}
function doGet() {
  return json({ ok: true, msg: 'Salasilah Keluarga API aktif. Sila POST JSON ke URL ini.', version: '2.1' });
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function ss() { 
  if(!SHEET_ID || SHEET_ID.includes('PASTE_')) throw new Error('Sila tetapkan SHEET_ID dalam Code.gs'); 
  return SpreadsheetApp.openById(SHEET_ID); 
}
function sheet(name) {
  const s = ss();
  let sh = s.getSheetByName(name);
  if (!sh) {
    sh = s.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
    return sh;
  }
  const expected = SHEETS[name];
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,expected.length).setValues([expected]);
    sh.setFrozenRows(1);
    return sh;
  }
  // Sentiasa selaras header dengan definisi SHEETS — tiada rujukan no baris/kolum tetap.
  const lastCol = Math.max(expected.length, sh.getLastColumn());
  const current = sh.getRange(1,1,1,lastCol).getValues()[0];
  let needWrite = current.length < expected.length;
  for(let i=0; i<expected.length && !needWrite; i++) {
    if(current[i] !== expected[i]) needWrite = true;
  }
  if(needWrite) {
    // Pelihara data sedia ada: petakan mengikut nama header lama → baharu.
    const lastRow = sh.getLastRow();
    if (lastRow > 1) {
      const data = sh.getRange(2,1,lastRow-1,lastCol).getValues();
      const oldHdr = current;
      const remapped = data.map(row => expected.map(h => {
        const j = oldHdr.indexOf(h);
        return j >= 0 ? row[j] : '';
      }));
      sh.clear();
      sh.getRange(1,1,1,expected.length).setValues([expected]);
      sh.getRange(2,1,remapped.length,expected.length).setValues(remapped);
    } else {
      sh.getRange(1,1,1,expected.length).setValues([expected]);
    }
    sh.setFrozenRows(1);
  }
  return sh;
}
function readAll(name) {
  const sh = sheet(name);
  const v = sh.getDataRange().getValues();
  if (v.length <= 1) return [];
  const hdr = v[0];
  return v.slice(1).map(row => Object.fromEntries(hdr.map((h,i)=>[h, row[i]])));
}
function appendRow(name, obj) {
  const sh = sheet(name);
  const hdr = SHEETS[name];
  sh.appendRow(hdr.map(h => obj[h] !== undefined ? obj[h] : ''));
}
function updateRow(name, keyField, keyVal, obj) {
  const sh = sheet(name);
  const v = sh.getDataRange().getValues();
  const hdr = v[0];
  const idx = hdr.indexOf(keyField);
  for(let i=1; i<v.length; i++) {
    if (String(v[i][idx]) === String(keyVal)) {
      const row = hdr.map(h => obj[h] !== undefined ? obj[h] : v[i][hdr.indexOf(h)]);
      sh.getRange(i+1, 1, 1, hdr.length).setValues([row]);
      return true;
    }
  }
  return false;
}
function deleteRow(name, keyField, keyVal) {
  const sh = sheet(name);
  const v = sh.getDataRange().getValues();
  const hdr = v[0]; const idx = hdr.indexOf(keyField);
  for(let i=v.length-1; i>=1; i--) {
    if (String(v[i][idx]) === String(keyVal)) sh.deleteRow(i+1);
  }
}
function deleteWhere(name, predicate) {
  const sh = sheet(name);
  const v = sh.getDataRange().getValues();
  const hdr = v[0];
  for(let i=v.length-1; i>=1; i--) {
    const obj = Object.fromEntries(hdr.map((h,j)=>[h,v[i][j]]));
    if (predicate(obj)) sh.deleteRow(i+1);
  }
}

function sha256Hex(text) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw.map(b => { const h=(b<0?b+256:b).toString(16); return h.length<2?'0'+h:h; }).join('');
}
function randomToken() { return Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''); }
function now() { return new Date().toISOString(); }

// Menjana Token Master Kekal untuk menyokong Multi-Login berbilang peranti
function getMasterToken() {
  return sha256Hex(MASTER_USERNAME + MASTER_PASSWORD + "SKG_ELIT_SUPER_SECRET");
}

// Menggantikan ensureSeed bagi memastikan struktur sheet tidak ralat.
function ensureSheets() {
  Object.keys(SHEETS).forEach(n => sheet(n));
}

function nextMemberId() {
  const users = readAll('PENGGUNA');
  const yr = new Date().getFullYear();
  let n = 0;
  users.forEach(u => {
    const m = String(u.memberId||'').match(new RegExp('^'+MEMBER_ID_PREFIX+'-'+yr+'-(\\d+)$'));
    if(m) n = Math.max(n, parseInt(m[1],10));
  });
  return MEMBER_ID_PREFIX+'-'+yr+'-'+String(n+1).padStart(4,'0');
}
function normName(s) { return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim(); }
function upperName(s) { return String(s||'').replace(/\s+/g,' ').trim().toUpperCase(); }

function requireAuth(body, roles) {
  ensureSheets();
  // Bypass check untuk Master Admin hardcoded
  if (String(body.username).toLowerCase() === MASTER_USERNAME.toLowerCase()) {
    if (body.token === getMasterToken()) {
      if (roles && roles.length && roles.indexOf('master') < 0) throw new Error('Akses peranan ditolak.');
      // PENTING: sertakan token master supaya proses pengesahan (approve) yang
      // memanggil semula handler lain (mis. addMember) tidak ranap dengan ralat
      // "Sesi Master tamat".
      return { username: MASTER_USERNAME, role: 'master', fullName: 'PENTADBIR UTAMA', memberId: 'KEL-MASTER', token: getMasterToken() };
    } else {
      throw new Error('Sesi Master tamat. Sila log masuk semula.');
    }
  }
  
  // Sokong berbilang token (multi-peranti) — token disimpan dipisah dengan '|'.
  // Ini mengelak pengguna ter-log keluar bila log masuk di peranti lain.
  const u = readAll('PENGGUNA').find(x => String(x.username) === String(body.username) && x.token && String(x.token).split('|').indexOf(String(body.token)) >= 0);
  if (!u) throw new Error('Tidak dibenarkan — sila log masuk semula.');
  if (roles && roles.length && roles.indexOf(u.role) < 0) throw new Error('Akses peranan ditolak.');
  return u;
}

function notifyTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

function setupSheets() {
  if (!SHEET_ID || SHEET_ID.includes('PASTE_')) throw new Error('SHEET_ID belum ditetapkan dalam Code.gs');
  ensureSheets();
  DriveApp.getRootFolder(); // Meminta kebenaran awal Google Drive
  Logger.log('✅ Semua sheet sedia.');
  return { ok: true, message: 'Google Sheets & Kebenaran sedia.', sheets: Object.keys(SHEETS) };
}

/**
 * resetSheets() — PADAM SEMUA DATA dalam setiap sheet dan tulis semula
 * header mengikut definisi `SHEETS` di atas. Akaun PENGGUNA admin/master
 * akan dikekalkan supaya anda tidak terkunci dari sistem.
 *
 * CARA GUNA: Apps Script → pilih fungsi `resetSheets` → Run.
 * AMARAN: Tindakan ini tidak boleh dibatalkan. Buat salinan sheet dahulu
 * jika perlu.
 */
function resetSheets() {
  if (!SHEET_ID || SHEET_ID.includes('PASTE_')) throw new Error('SHEET_ID belum ditetapkan dalam Code.gs');
  const s = ss();
  const keepUsers = readAll('PENGGUNA').filter(u => u.role === 'admin' || u.role === 'master');
  Object.keys(SHEETS).forEach(name => {
    let sh = s.getSheetByName(name);
    if (!sh) sh = s.insertSheet(name);
    sh.clear();
    const hdr = SHEETS[name];
    sh.getRange(1,1,1,hdr.length).setValues([hdr]);
    sh.setFrozenRows(1);
  });
  // Pulangkan akaun admin/master ke PENGGUNA
  keepUsers.forEach(u => appendRow('PENGGUNA', u));
  Logger.log('✅ Semua sheet telah dipadam & dibina semula. ' + keepUsers.length + ' akaun admin dikekalkan.');
  return { ok: true, message: 'Sheet dibina semula. Header diselaras dengan definisi SHEETS.', kept: keepUsers.length };
}

function getPhotoFolder() {
  if (DRIVE_FOLDER_ID) return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const it = DriveApp.getFoldersByName('SalasilahKeluarga_Photos');
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder('SalasilahKeluarga_Photos');
}

function savePhoto(b64, mime, name) {
  if (!b64) return '';
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, (name||'photo')+'.'+(mime.split('/')[1]||'jpg'));
    const f = getPhotoFolder().createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w400';
  } catch(e) {
    Logger.log('RALAT MENYIMPAN GAMBAR: ' + e.message);
    return ''; // Fail-safe supaya pendaftaran tidak ranap walaupun Drive error.
  }
}

function queuePending(action, payload, username, before, reason) {
  const existing = readAll('PENDING').find(p =>
    isPendingRecord(p) && String(p.user) === String(username) &&
    String(p.action) === String(action) && pendingKey(action, safeParse(p.payload)) === pendingKey(action, payload)
  );
  if (existing) {
    updateRow('PENDING', 'id', existing.id, {
      payload: JSON.stringify(payload),
      before: existing.before || (before ? JSON.stringify(before) : ''),
      reason: String(reason || existing.reason || '').slice(0,1000),
      ts: now()
    });
    return existing.id;
  }
  const id = Utilities.getUuid();
  const user = readAll('PENGGUNA').find(x => String(x.username)===String(username));
  appendRow('PENDING', {
    id, action, payload: JSON.stringify(payload),
    before: before ? JSON.stringify(before) : '',
    user: username, userFullName: (user && user.fullName) || username,
    reason: String(reason || '').slice(0,1000),
    ts: now(), status:'pending', approvedBy:'', approvedAt:''
  });
  notifyTelegram(`📝 <b>PERUBAHAN MENUNGGU KELULUSAN</b>\n<b>Tindakan:</b> ${action}\n<b>Oleh:</b> @${username}\nSila log masuk ke panel pentadbir untuk kelulusan.`);
  return id;
}

function pendingKey(action, payload) {
  payload = payload || {};
  if (action === 'addMember' || action === 'editMember') return String(payload.id || '');
  if (action === 'addSpouse') return String(payload.id || payload.spouseId || '');
  if (action === 'addChild') return String(payload.spouseId || '') + ':' + String(payload.childId || '');
  return '';
}

// Rekod lama yang diwujudkan sebelum kolum `status` ditambah mempunyai nilai
// kosong. Anggap ia masih pending supaya tidak tersembunyi daripada pentadbir.
function isPendingRecord(p) {
  const status = String((p && p.status) || '').trim().toLowerCase();
  return status === '' || status === 'pending';
}

function pendingForUser(username) {
  return readAll('PENDING').filter(p => isPendingRecord(p) && String(p.user) === String(username));
}

function pendingOwnerForMember(memberId) {
  const liveSpouses = readAll('PASANGAN');
  const pendingRows = readAll('PENDING').filter(isPendingRecord);
  const row = pendingRows.find(p => {
    const payload = safeParse(p.payload) || {};
    if ((p.action==='addMember' || p.action==='editMember') && String(payload.id)===String(memberId)) return true;
    if (p.action==='addSpouse' && (String(payload.husbandId)===String(memberId) || String(payload.wifeId)===String(memberId))) return true;
    if (p.action==='addChild') {
      const spouse = liveSpouses.find(s=>String(s.id)===String(payload.spouseId)) ||
        pendingRows.filter(x=>x.action==='addSpouse').map(x=>safeParse(x.payload)).find(s=>s && String(s.id)===String(payload.spouseId));
      return !!spouse && (String(spouse.husbandId)===String(memberId) || String(spouse.wifeId)===String(memberId));
    }
    return false;
  });
  return row ? String(row.user) : '';
}

function assertDraftAvailable(memberId, username) {
  const owner = pendingOwnerForMember(memberId);
  if (owner && owner !== String(username)) throw new Error('Maklumat ini sedang diedit oleh @' + owner + '. Tunggu pengesahan pentadbir sebelum mengedit.');
}

function visibleMemberForUser(id, username) {
  const live = readAll('SALASILAH').find(m => String(m.id) === String(id));
  if (live) return live;
  const draft = pendingForUser(username).find(p => p.action === 'addMember' && String(safeParse(p.payload).id) === String(id));
  return draft ? safeParse(draft.payload) : null;
}

function visibleSpouseForUser(id, username) {
  const live = readAll('PASANGAN').find(s => String(s.id) === String(id));
  if (live) return live;
  const draft = pendingForUser(username).find(p => p.action === 'addSpouse' && String(safeParse(p.payload).id) === String(id));
  return draft ? safeParse(draft.payload) : null;
}

function approveDraftMemberIfNeeded(memberId, owner, approver) {
  if (readAll('SALASILAH').some(m => String(m.id) === String(memberId))) return;
  const draft = readAll('PENDING').find(p => isPendingRecord(p) && p.action==='addMember' && String(p.user)===String(owner) && String(safeParse(p.payload).id)===String(memberId));
  if (!draft) throw new Error('Profil berkaitan belum tersedia untuk disahkan.');
  const member = safeParse(draft.payload);
  appendRow('SALASILAH', Object.assign({}, member, { approvedBy:approver, approvedAt:now() }));
  updateRow('PENDING', 'id', draft.id, { status:'approved', approvedBy:approver, approvedAt:now() });
}

function approveDraftSpouseIfNeeded(spouseId, owner, approver) {
  if (readAll('PASANGAN').some(s => String(s.id) === String(spouseId))) return;
  const draft = readAll('PENDING').find(p => isPendingRecord(p) && p.action==='addSpouse' && String(p.user)===String(owner) && String(safeParse(p.payload).id)===String(spouseId));
  if (!draft) throw new Error('Hubungan pasangan belum tersedia untuk disahkan.');
  const spouse = safeParse(draft.payload);
  approveDraftMemberIfNeeded(spouse.husbandId, owner, approver);
  approveDraftMemberIfNeeded(spouse.wifeId, owner, approver);
  appendRow('PASANGAN', spouse);
  updateRow('PENDING', 'id', draft.id, { status:'approved', approvedBy:approver, approvedAt:now() });
}

const HANDLERS = {
  register(body) {
    ensureSheets();
    const username = String(body.username||'').trim().toLowerCase();
    const password = String(body.password||'');
    const fullName = upperName(body.fullName);
    if (!username || !password) throw new Error('Nama pengguna dan kata laluan wajib diisi.');
    if (!fullName) throw new Error('Nama penuh wajib diisi.');
    
    if (username === MASTER_USERNAME.toLowerCase()) throw new Error('Nama pengguna telah digunakan.');
    const users = readAll('PENGGUNA');
    if (users.find(u => String(u.username).toLowerCase() === username)) throw new Error('Nama pengguna telah digunakan.');
    
    const salt = randomToken().slice(0,16);
    const hash = sha256Hex(password+salt);
    let photoUrl = '';
    if (body.photoB64) photoUrl = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', 'profile_'+username);
    
    appendRow('PENGGUNA', {
      username, fullName, fatherName: upperName(body.fatherName), motherName: upperName(body.motherName),
      address: body.address||'', whatsapp: body.whatsapp||'', occupation: body.occupation||'',
      photo: photoUrl, email: body.email||'', phone: body.whatsapp||'',
      password, passwordHash: hash, salt, role: 'user', approved: false,
      token: '', memberId: '', createdAt: now()
    });
    notifyTelegram(`👤 <b>PENDAFTARAN BAHARU</b>\n<b>Nama:</b> ${fullName}\n<b>Username:</b> @${username}\nMenunggu kelulusan keahlian.`);
    return { ok: true };
  },

  login(body) {
    ensureSheets();
    const uname = String(body.username||'').trim().toLowerCase();
    const pwd = String(body.password||'');
    
    // LALUAN MASTER ADMIN (Bypass Google Sheet)
    if (uname === MASTER_USERNAME.toLowerCase() && pwd === MASTER_PASSWORD) {
      return { ok: true, username: MASTER_USERNAME, role: 'master', token: getMasterToken(), fullName: 'PENTADBIR UTAMA', memberId: 'KEL-MASTER', photo: '' };
    }
    
    // LALUAN PENGGUNA BIASA (Semak di Google Sheet)
    const u = readAll('PENGGUNA').find(x => String(x.username).toLowerCase() === uname);
    if (!u) throw new Error('Nama pengguna atau kata laluan salah.');
    const hash = sha256Hex(pwd + u.salt);
    if (hash !== u.passwordHash) throw new Error('Nama pengguna atau kata laluan salah.');
    
    const isAdminUser = u.role==='admin' || u.role==='master';
    if (!isAdminUser && !(u.approved===true || String(u.approved)==='true')) {
      throw new Error('Akaun anda masih menunggu kelulusan pentadbir.');
    }
    
    const token = randomToken();
    // Simpan token baharu tanpa membatalkan token peranti lain (had 5 terkini).
    const prev = String(u.token||'').split('|').filter(Boolean);
    prev.push(token);
    updateRow('PENGGUNA', 'username', u.username, { token: prev.slice(-5).join('|') });
    return { ok: true, username: u.username, role: u.role, token, fullName: u.fullName, memberId: u.memberId, photo: u.photo };
  },

  myProfile(body) {
    const u = requireAuth(body);
    return { ok: true, profile: u };
  },

  bootstrap(body) {
    ensureSheets();
    let u = null;
    if (body.username && body.token) {
      try { u = requireAuth(body); } catch(e) {}
    }
    
    const isAdmin = !!u && (u.role==='admin' || u.role==='master');
    const isMaster = !!u && u.role==='master';
    const allUsers = readAll('PENGGUNA');
    const publicUsers = allUsers.filter(x => x.approved===true || String(x.approved)==='true').map(x => ({ fullName: x.fullName, fatherName: x.fatherName, motherName: x.motherName, role: x.role, memberId: x.memberId }));

    const rawMembers = readAll('SALASILAH').map(m => ({ ...m, alive: String(m.alive)==='true' || m.alive===true }));
    function tagFor(m) {
      const mn = normName(m.name), mf = normName(m.fatherName), mo = normName(m.motherName);
      for (const pu of publicUsers) {
        if (normName(pu.fullName) === mn && (!mf || !pu.fatherName || normName(pu.fatherName)===mf) && (!mo || !pu.motherName || normName(pu.motherName)===mo)) {
          return { tag: (pu.role==='admin'||pu.role==='master') ? 'admin' : 'member', memberId: pu.memberId };
        }
      }
      return { tag: 'none', memberId: '' };
    }

    const members = rawMembers.map(m => {
      const t = tagFor(m);
      const px = (m.posX===''||m.posX===null||m.posX===undefined) ? null : Number(m.posX);
      const py = (m.posY===''||m.posY===null||m.posY===undefined) ? null : Number(m.posY);
      if (isAdmin) return { ...m, posX:px, posY:py, _tag: t.tag, _memberId: t.memberId };
      return { id:m.id, name:m.name, gender:m.gender, alive:m.alive, photo:m.photo, birth:m.birth, death:m.death, fatherName:m.fatherName, motherName:m.motherName, place:m.place, posX:px, posY:py, _tag:t.tag, _memberId:t.memberId };
    });

    const spouses = readAll('PASANGAN');
    const children = readAll('ANAK');
    const notes = readAll('NOTA').map(n => ({ ...n, pinned: String(n.pinned)==='true'||n.pinned===true, x:Number(n.x)||0, y:Number(n.y)||0, size:Number(n.size)||14 }));
    
    // Peta pengguna untuk lampirkan maklumat hubungan pengedit (admin sahaja boleh lihat).
    const userByName = {};
    allUsers.forEach(x => { userByName[String(x.username).toLowerCase()] = x; });
    function enrichPending(p) {
      const out = { ...p, payload: safeParse(p.payload), before: p.before ? safeParse(p.before) : null };
      if (!isAdmin) delete out.reason;
      if (isAdmin) {
        const eu = userByName[String(p.user).toLowerCase()];
        out.userWhatsapp = eu ? (eu.whatsapp || eu.phone || '') : '';
        out.userPhone = eu ? (eu.phone || eu.whatsapp || '') : '';
        out.userPhoto = eu ? (eu.photo || '') : '';
      }
      return out;
    }
    const allPending = readAll('PENDING');
    // Semua paparan menggunakan graf yang sama, termasuk pelawat. Butiran sensitif
    // (catatan permohonan dan hubungan pengedit) tetap dibuang oleh enrichPending.
    const pending = allPending.filter(isPendingRecord).map(enrichPending);
    const returnedDrafts = u && !isAdmin ? allPending
      .filter(p=>String(p.status).toLowerCase()==='rejected' && String(p.user)===String(u.username))
      .map(p=>({ ...p, payload:safeParse(p.payload), before:p.before?safeParse(p.before):null, reason:undefined })) : [];
    const pendingLog = isAdmin ? allPending.filter(p=>!isPendingRecord(p)).slice(-50).map(p=>({ id:p.id, action:p.action, user:p.user, userFullName:p.userFullName, ts:p.ts, status:p.status, approvedBy:p.approvedBy, approvedAt:p.approvedAt })) : [];
    const pendingUsers = isAdmin ? allUsers.filter(x => !(x.approved===true||String(x.approved)==='true') && x.role!=='master') : [];
    // Senarai semua ahli yang telah diluluskan — untuk Master/Admin melantik admin.
    // Master nampak penuh; admin biasa nampak versi ringkas tanpa kata laluan.
    const users = isAdmin
      ? allUsers
          .filter(x => x.role !== 'master' && (x.approved===true || String(x.approved)==='true'))
          .map(x => isMaster
            ? { ...x }
            : { username:x.username, fullName:x.fullName, role:x.role, approved:x.approved, memberId:x.memberId, whatsapp:x.whatsapp, phone:x.phone, photo:x.photo })
      : [];

    return { ok: true, data: { members, spouses, children, notes, pending, returnedDrafts, pendingLog, pendingUsers, users, publicUsers, viewer: u ? { username:u.username, role:u.role, fullName:u.fullName, memberId:u.memberId, photo:u.photo } : null }};
  },

  approveUser(body) {
    requireAuth(body, ['admin','master']);
    const target = readAll('PENGGUNA').find(x => x.username === body.target);
    if (!target) throw new Error('Pengguna tidak dijumpai.');
    const patch = { approved: true };
    if (!target.memberId) patch.memberId = nextMemberId();
    updateRow('PENGGUNA', 'username', body.target, patch);
    return { ok: true, memberId: patch.memberId || target.memberId };
  },
  rejectUser(body) {
    requireAuth(body, ['admin','master']);
    deleteWhere('PENGGUNA', u => String(u.username) === String(body.target) && !(u.approved===true || String(u.approved)==='true'));
    return { ok: true };
  },

  addMember(body) {
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    let photoUrl = '';
    if (body.photoB64) photoUrl = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', body.id);
    const rec = { id: body.id, name: upperName(body.name).slice(0,200), gender: body.gender||'M', alive: body.alive!==false, birth: body.birth||'', death: body.death||'', place: body.place||'', address: body.address||'', photo: photoUrl, notes: body.notes||'', fatherName: upperName(body.fatherName).slice(0,200), motherName: upperName(body.motherName).slice(0,200), editedBy: u.username, editedAt: now(), approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():'' };
    if (!isAdmin) { queuePending('addMember', rec, u.username, null, body.reason); return { ok: true, pending: true }; }
    appendRow('SALASILAH', rec); return { ok: true };
  },
  editMember(body) {
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    if (!isAdmin) assertDraftAvailable(body.id, u.username);
    const liveBefore = readAll('SALASILAH').find(m=>String(m.id)===String(body.id)) || null;
    const draftBefore = !isAdmin ? pendingForUser(u.username).find(p => p.action==='addMember' && String(safeParse(p.payload).id)===String(body.id)) : null;
    const before = liveBefore || (draftBefore ? safeParse(draftBefore.payload) : null);
    if (!before) throw new Error('Ahli tidak dijumpai atau draf bukan milik anda.');
    const patch = { ...body };
    delete patch.action; delete patch.username; delete patch.token;
    if (patch.name !== undefined) patch.name = upperName(patch.name).slice(0,200);
    if (patch.fatherName !== undefined) patch.fatherName = upperName(patch.fatherName).slice(0,200);
    if (patch.motherName !== undefined) patch.motherName = upperName(patch.motherName).slice(0,200);
    if (body.photoB64) patch.photo = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', body.id);
    delete patch.photoB64; delete patch.photoMime;
    patch.editedBy = u.username; patch.editedAt = now();
    if (isAdmin) {
      patch.approvedBy = u.username; patch.approvedAt = now();
      updateRow('SALASILAH', 'id', body.id, patch);
      return { ok: true };
    }
    if (draftBefore) {
      updateRow('PENDING', 'id', draftBefore.id, { payload:JSON.stringify(Object.assign({}, before, patch)), ts:now() });
      return { ok:true, pending:true };
    }
    queuePending('editMember', Object.assign({}, before, patch), u.username, liveBefore, body.reason);
    return { ok: true, pending: true };
  },
  deleteMember(body) { requireAuth(body, ['admin','master']); deleteRow('SALASILAH', 'id', body.id); deleteWhere('PASANGAN', s => s.husbandId===body.id || s.wifeId===body.id); deleteWhere('ANAK', c => c.childId===body.id); return { ok: true }; },

  addSpouse(body) {
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    if (!isAdmin) assertDraftAvailable(body.anchorId, u.username);
    let partnerId = body.partnerId;
    if (!partnerId && body.newPartner) {
      partnerId = body.newPartner.id;
      const rec = { id: partnerId, name: upperName(body.newPartner.name), gender: body.newPartner.gender, alive: body.newPartner.alive!==false, birth:'', death:'', place:'', photo:'', notes:'', editedBy:u.username, editedAt:now(), approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():'' };
      if (isAdmin) appendRow('SALASILAH', rec); else queuePending('addMember', rec, u.username);
    }
    const anchor = visibleMemberForUser(body.anchorId, u.username);
    if (!anchor) throw new Error('Ahli utama tidak dijumpai.');
    const rec = { id: body.spouseId, husbandId: anchor.gender==='M' ? body.anchorId : partnerId, wifeId: anchor.gender==='M' ? partnerId : body.anchorId, status: body.status||'kahwin', marriageDate: body.marriageDate||'', divorceDate: body.divorceDate||'', deathDate: body.deathDate||'', editedBy: u.username, editedAt: now() };
    if (!isAdmin) { queuePending('addSpouse', rec, u.username, null, body.reason); return { ok: true, pending: true }; }
    appendRow('PASANGAN', rec); return { ok: true };
  },
  addChild(body) {
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    const spouseForLock = visibleSpouseForUser(body.spouseId, u.username);
    if (!isAdmin && spouseForLock) {
      assertDraftAvailable(spouseForLock.husbandId, u.username);
      assertDraftAvailable(spouseForLock.wifeId, u.username);
    }
    if (!visibleSpouseForUser(body.spouseId, u.username)) throw new Error('Pasangan tidak dijumpai atau draf bukan milik anda.');
    if (body.newChild) {
      const rec = { id: body.childId, name: upperName(body.newChild.name), gender: body.newChild.gender||'M', alive: body.newChild.alive!==false, birth: body.newChild.birth||'', death:'', place:'', photo:'', notes:'', editedBy:u.username, editedAt:now(), approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():'' };
      if (isAdmin) appendRow('SALASILAH', rec); else queuePending('addMember', rec, u.username);
    }
    const link = { spouseId: body.spouseId, childId: body.childId, editedBy:u.username, editedAt:now() };
    if (!isAdmin) { queuePending('addChild', link, u.username, null, body.reason); return { ok: true, pending: true }; }
    appendRow('ANAK', link); return { ok: true };
  },
  moveBranch(body) { requireAuth(body, ['admin','master']); deleteWhere('ANAK', c => c.childId===body.childId); appendRow('ANAK', { spouseId: body.newSpouseId, childId: body.childId, editedBy:'admin', editedAt:now() }); return { ok: true }; },

  addNote(body) { const u = requireAuth(body, ['admin','master']); appendRow('NOTA', { id: body.id, text: String(body.text||'').slice(0,2000), x: body.x||0, y: body.y||0, font: body.font||'', size: body.size||14, color: body.color||'', pinned: !!body.pinned, editedBy: u.username, editedAt: now() }); return { ok: true }; },
  editNote(body) { const u = requireAuth(body, ['admin','master']); updateRow('NOTA', 'id', body.id, { text: String(body.text||'').slice(0,2000), x: body.x||0, y: body.y||0, font: body.font||'', size: body.size||14, color: body.color||'', pinned: !!body.pinned, editedBy: u.username, editedAt: now() }); return { ok: true }; },
  deleteNote(body) { requireAuth(body, ['admin','master']); deleteRow('NOTA', 'id', body.id); return { ok: true }; },

  approve(body) {
    const u = requireAuth(body, ['admin','master']);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
    const p = readAll('PENDING').find(x=>String(x.id)===String(body.id) && isPendingRecord(x));
    if (!p) throw new Error('Draf tidak dijumpai atau telah diproses.');
    const payload = safeParse(p.payload);
    // Terapkan terus sebagai keputusan pentadbir. Jangan panggil semula handler
    // pengguna kerana ia boleh menjalankan auth/draf kali kedua dan menyebabkan
    // ralat peranan disalah anggap sebagai sesi tamat di klien lama.
    if (p.action === 'addMember') {
      if (readAll('SALASILAH').some(m => String(m.id)===String(payload.id))) updateRow('SALASILAH', 'id', payload.id, payload);
      else appendRow('SALASILAH', Object.assign({}, payload, { approvedBy:u.username, approvedAt:now() }));
    } else if (p.action === 'editMember') {
      if (!readAll('SALASILAH').some(m => String(m.id)===String(payload.id))) throw new Error('Sahkan draf ahli baharu ini terlebih dahulu.');
      updateRow('SALASILAH', 'id', payload.id, Object.assign({}, payload, { approvedBy:u.username, approvedAt:now() }));
    } else if (p.action === 'addSpouse') {
      approveDraftMemberIfNeeded(payload.husbandId, p.user, u.username);
      approveDraftMemberIfNeeded(payload.wifeId, p.user, u.username);
      if (!readAll('PASANGAN').some(s=>String(s.id)===String(payload.id))) appendRow('PASANGAN', payload);
    } else if (p.action === 'addChild') {
      approveDraftSpouseIfNeeded(payload.spouseId, p.user, u.username);
      approveDraftMemberIfNeeded(payload.childId, p.user, u.username);
      const exists = readAll('ANAK').some(c=>String(c.spouseId)===String(payload.spouseId) && String(c.childId)===String(payload.childId));
      if (!exists) appendRow('ANAK', payload);
    } else {
      throw new Error('Jenis draf tidak disokong untuk pengesahan: ' + p.action);
    }
    updateRow('PENDING', 'id', body.id, { status:'approved', approvedBy:u.username, approvedAt:now() });
    return { ok: true };
    } finally {
      lock.releaseLock();
    }
  },
  reject(body) {
    const u = requireAuth(body, ['admin','master']);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const p = readAll('PENDING').find(x=>String(x.id)===String(body.id) && isPendingRecord(x));
      if (!p) throw new Error('Draf tidak dijumpai atau telah diproses.');
      const rejectedAt = now();
      updateRow('PENDING', 'id', p.id, { status:'rejected', approvedBy:u.username, approvedAt:rejectedAt });

      // Batalkan juga draf bergantung yang tidak lagi mempunyai induk sah.
      // Contoh: pasangan baharu menghasilkan addMember + addSpouse; jika hubungan
      // ditolak, profil pasangan yatim tidak patut terus muncul pada pengguna.
      const payload = safeParse(p.payload) || {};
      const rows = readAll('PENDING');
      const rejectIds = {};
      if (p.action === 'addSpouse') {
        [payload.husbandId, payload.wifeId].forEach(memberId => {
          if (!memberId || readAll('SALASILAH').some(m=>String(m.id)===String(memberId))) return;
          rows.filter(x=>isPendingRecord(x) && String(x.user)===String(p.user) && x.action==='addMember' && String(safeParse(x.payload).id)===String(memberId))
            .forEach(x=>{ rejectIds[String(x.id)] = true; });
        });
        rows.filter(x=>isPendingRecord(x) && String(x.user)===String(p.user) && x.action==='addChild' && String(safeParse(x.payload).spouseId)===String(payload.id))
          .forEach(x=>{ rejectIds[String(x.id)] = true; });
      } else if (p.action === 'addChild') {
        const childId = payload.childId;
        if (childId && !readAll('SALASILAH').some(m=>String(m.id)===String(childId))) {
          rows.filter(x=>isPendingRecord(x) && String(x.user)===String(p.user) && x.action==='addMember' && String(safeParse(x.payload).id)===String(childId))
            .forEach(x=>{ rejectIds[String(x.id)] = true; });
        }
      } else if (p.action === 'addMember') {
        const memberId = payload.id;
        const spouseIds = {};
        rows.filter(x=>isPendingRecord(x) && String(x.user)===String(p.user) && x.action==='addSpouse')
          .forEach(x=>{
            const relation = safeParse(x.payload) || {};
            if (String(relation.husbandId)===String(memberId) || String(relation.wifeId)===String(memberId)) {
              rejectIds[String(x.id)] = true;
              spouseIds[String(relation.id)] = true;
            }
          });
        rows.filter(x=>isPendingRecord(x) && String(x.user)===String(p.user) && x.action==='addChild')
          .forEach(x=>{
            const relation = safeParse(x.payload) || {};
            if (String(relation.childId)===String(memberId) || spouseIds[String(relation.spouseId)]) rejectIds[String(x.id)] = true;
          });
      }
      Object.keys(rejectIds).forEach(id => updateRow('PENDING', 'id', id, { status:'rejected', approvedBy:u.username, approvedAt:rejectedAt }));
      return { ok: true, rejectedDependents:Object.keys(rejectIds).length };
    } finally {
      lock.releaseLock();
    }
  },
  editPending(body) {
    const u = requireAuth(body, ['admin','master']);
    const p = readAll('PENDING').find(x=>String(x.id)===String(body.id) && isPendingRecord(x));
    if (!p) throw new Error('Draf tidak dijumpai atau telah diproses.');
    const clean = body.payload && typeof body.payload==='object' ? body.payload : {};
    delete clean.action; delete clean.username; delete clean.token;
    if (clean.name !== undefined) clean.name = upperName(clean.name).slice(0,200);
    clean.editedBy = u.username; clean.editedAt = now();
    updateRow('PENDING', 'id', p.id, { payload:JSON.stringify(clean), ts:now() });
    return { ok:true };
  },
  resubmitRejected(body) {
    const u = requireAuth(body);
    const p = readAll('PENDING').find(x=>String(x.id)===String(body.id) && String(x.user)===String(u.username) && String(x.status).toLowerCase()==='rejected');
    if (!p) throw new Error('Draf dipulangkan tidak dijumpai.');
    const conflict = readAll('PENDING').some(x=>isPendingRecord(x) && String(x.id)!==String(p.id) && pendingKey(x.action,safeParse(x.payload))===pendingKey(p.action,safeParse(p.payload)));
    if (conflict) throw new Error('Maklumat ini sedang diedit oleh pengguna lain.');
    updateRow('PENDING', 'id', p.id, { status:'pending', approvedBy:'', approvedAt:'', reason:String(body.reason||p.reason||'').slice(0,1000), ts:now() });
    return { ok:true };
  },
  deleteRejected(body) {
    const u = requireAuth(body);
    const p = readAll('PENDING').find(x=>String(x.id)===String(body.id) && String(x.user)===String(u.username) && String(x.status).toLowerCase()==='rejected');
    if (!p) throw new Error('Draf dipulangkan tidak dijumpai.');
    deleteRow('PENDING', 'id', p.id);
    return { ok:true };
  },
  setRole(body) {
    const u = requireAuth(body, ['admin','master']);
    if (body.role==='master' && u.role!=='master') throw new Error('Hanya master boleh berikan peranan master.');
    const target = readAll('PENGGUNA').find(x => x.username===body.username);
    if (target.role==='master' && u.username !== target.username) throw new Error('Tidak boleh ubah pentadbir utama lain.');
    updateRow('PENGGUNA', 'username', body.username, { role: body.role });
    return { ok: true };
  },

  setPositions(body) {
    const u = requireAuth(body, ['admin','master']);
    const list = Array.isArray(body.positions) ? body.positions : [];
    list.forEach(it => {
      if (!it || !it.id) return;
      const x = Number(it.x); const y = Number(it.y);
      if (!isFinite(x) || !isFinite(y)) return;
      updateRow('SALASILAH', 'id', it.id, { posX: x, posY: y, editedBy: u.username, editedAt: now() });
    });
    return { ok: true, count: list.length };
  },
  updateMyProfile(body) {
    const u = requireAuth(body);
    const patch = {};
    ['fullName','fatherName','motherName','address','whatsapp','occupation','email','phone'].forEach(k => {
      if (body[k] !== undefined) patch[k] = (k==='fullName'||k==='fatherName'||k==='motherName') ? upperName(body[k]) : String(body[k]||'');
    });
    if (body.newPassword) {
      const np = String(body.newPassword);
      if (np.length < 4) throw new Error('Kata laluan terlalu pendek.');
      const salt = randomToken().slice(0,16);
      patch.salt = salt;
      patch.passwordHash = sha256Hex(np + salt);
      patch.password = np;
    }
    if (body.photoB64) patch.photo = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', 'profile_'+u.username);
    updateRow('PENGGUNA', 'username', u.username, patch);
    const updated = readAll('PENGGUNA').find(x => String(x.username)===String(u.username));
    return { ok: true, profile: updated };
  },
  ping() { return { ok: true, ts: now() }; }
};

function safeParse(s) { try{ return JSON.parse(s); }catch(_){ return s; } }

// =========================================================================
// SCRIPT UJIAN: PENDAFTARAN & LOG MASUK
// Sila pilih 'testRegisterAndLogin' dari kotak fungsi di atas dan tekan Run.
// =========================================================================
function testRegisterAndLogin() {
  Logger.log("--- MEMULAKAN UJIAN PENDAFTARAN & LOG MASUK ---");
  try {
    ensureSheets();
    const testUser = "penguji" + Math.floor(Math.random()*1000);
    const testPass = "rahsia123";
    
    Logger.log("1. MENGUJI PENDAFTARAN PENGGUNA BARU: " + testUser);
    const regRes = HANDLERS.register({
      username: testUser,
      password: testPass,
      fullName: "AHMAD PENGUJI",
      whatsapp: "0123456789",
      occupation: "IT Tester"
    });
    Logger.log("-> Hasil Pendaftaran: " + JSON.stringify(regRes));
    
    Logger.log("2. MENGUJI LOG MASUK PENGGUNA: " + testUser);
    try {
      const loginRes = HANDLERS.login({
        username: testUser,
        password: testPass
      });
      Logger.log("-> Hasil Log Masuk (Sepatutnya gagal kerana belum lulus): " + JSON.stringify(loginRes));
    } catch(errLogin) {
      Logger.log("-> Ralat Log Masuk Dijangka (Belum Lulus): " + errLogin.message);
    }
    
    Logger.log("3. MENGUJI LOG MASUK MASTER ADMIN");
    const masterLogin = HANDLERS.login({
      username: MASTER_USERNAME,
      password: MASTER_PASSWORD
    });
    Logger.log("-> Hasil Master Admin: " + JSON.stringify(masterLogin));
    
    Logger.log("\n✅ KESELURUHAN UJIAN SELESAI TANPA CRASH.");
  } catch(e) {
    Logger.log("❌ RALAT UJIAN KRITIKAL: " + e.message);
  }
}


/* =====================================================================
   AUTORISASI PENUH — Jalankan SEKALI untuk kelulusan semua sekatan
   Google Drive (akaun Kementerian / Delima).
   Cara guna:
     1) Editor → pilih fungsi `authorizeAll` → Run
     2) Klik "Review Permissions" → pilih akaun Delima
     3) Jika papar "Google hasn't verified", klik "Advanced" → "Go to ... (unsafe)"
     4) Tekan "Allow" untuk semua skop yang diminta.
   ===================================================================== */
function authorizeAll() {
  var report = [];

  try {
    var s = ss();
    s.getName();
    report.push('✅ Spreadsheet: ' + s.getName());
    ensureSheets();
    report.push('✅ Semua tab sheet sedia: ' + Object.keys(SHEETS).join(', '));
  } catch(e) { report.push('⛔ Spreadsheet: ' + e.message); }

  try {
    DriveApp.getRootFolder().getName();
    report.push('✅ Drive root access OK');
    var f = getPhotoFolder();
    report.push('✅ Folder foto: ' + f.getName() + ' (' + f.getId() + ')');
    // Uji tulis & padam fail kecil
    var test = f.createFile(Utilities.newBlob('OK', 'text/plain', 'skg_auth_test.txt'));
    test.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    test.setTrashed(true);
    report.push('✅ Uji tulis fail Drive OK (Delima approve berjaya)');
  } catch(e) { report.push('⛔ Drive: ' + e.message); }

  try {
    UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions:true });
    report.push('✅ UrlFetch (Telegram dsb.) OK');
  } catch(e) { report.push('⛔ UrlFetch: ' + e.message); }

  try {
    ScriptApp.getOAuthToken();
    report.push('✅ OAuth token tersedia');
  } catch(e) { report.push('⛔ OAuth: ' + e.message); }

  var msg = report.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getActive().toast('Autorisasi siap. Lihat log (View → Logs).'); } catch(_e) {}
  return msg;
}

