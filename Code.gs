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
   8) Buka app → log masuk dengan: admin / 101010
   ===================================================================== */

const SHEET_ID = 'PASTE_SPREADSHEET_ID_DI_SINI'; // ← ISI ID GOOGLE SHEET DI SINI
const DRIVE_FOLDER_ID = ''; // ← BIARKAN KOSONG untuk auto-cipta folder di Drive anda sendiri

const TELEGRAM_BOT_TOKEN = ''; // [PILIHAN] Masukkan token bot telegram jika mahu (cth: 123456:ABC...)
const TELEGRAM_CHAT_ID = '';   // [PILIHAN] Masukkan chat ID kumpulan/admin (cth: -1001234567)

const MASTER_USERNAME = 'admin';
const MASTER_PASSWORD = '101010';

const SHEETS = {
  PENGGUNA:  ['username','fullName','fatherName','motherName','address','whatsapp','occupation','photo','email','phone','password','passwordHash','salt','role','approved','token','memberId','createdAt'],
  SALASILAH: ['id','name','gender','alive','birth','death','place','photo','notes','fatherName','motherName','editedBy','editedAt','approvedBy','approvedAt'],
  PASANGAN:  ['id','husbandId','wifeId','status','marriageDate','divorceDate','deathDate','editedBy','editedAt'],
  ANAK:      ['spouseId','childId','editedBy','editedAt'],
  NOTA:      ['id','text','x','y','font','size','color','pinned','editedBy','editedAt'],
  PENDING:   ['id','action','payload','user','ts','status','approvedBy','approvedAt']
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
  return json({ ok: true, msg: 'Salasilah Keluarga API aktif. Sila POST JSON ke URL ini.', version: '1.2' });
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function ss() { if(!SHEET_ID || SHEET_ID.includes('PASTE_')) throw new Error('Sila tetapkan SHEET_ID dalam Code.gs'); return SpreadsheetApp.openById(SHEET_ID); }
function sheet(name) {
  const s = ss();
  let sh = s.getSheetByName(name);
  if (!sh) {
    sh = s.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  }
  const expected = SHEETS[name];
  const current = sh.getRange(1,1,1,Math.max(expected.length, sh.getLastColumn())).getValues()[0];
  let needWrite = false;
  for(let i=0; i<expected.length; i++) {
    if(current[i] !== expected[i]) { needWrite = true; break; }
  }
  if(needWrite) {
    sh.getRange(1,1,1,expected.length).setValues([expected]);
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

// DIKEMASKINI: Elak race condition dan elak kemaskini salt tanpa sebab!
function ensureSeed() {
  Object.keys(SHEETS).forEach(n => sheet(n));
  const users = readAll('PENGGUNA');
  const admin = users.find(u => String(u.username).toLowerCase() === MASTER_USERNAME);

  if (!admin) {
    const salt = randomToken().slice(0,16);
    const hash = sha256Hex(MASTER_PASSWORD + salt);
    appendRow('PENGGUNA', {
      username: MASTER_USERNAME, fullName: 'Pentadbir Utama',
      fatherName: '', motherName: '', address: '', whatsapp: '', occupation: 'Pentadbir Sistem',
      photo: '', email: '', phone: '',
      password: MASTER_PASSWORD,
      passwordHash: hash, salt: salt,
      role: 'master', approved: true, token: '', memberId: MEMBER_ID_PREFIX+'-MASTER-0001',
      createdAt: now()
    });
    return { created: true };
  }

  let needsUpdate = false;
  const patch = {};
  if (admin.role !== 'master') { patch.role = 'master'; needsUpdate = true; }
  if (String(admin.approved) !== 'true' && admin.approved !== true) { patch.approved = true; needsUpdate = true; }
  // Hanya tukar hash JIKA password di sheet tidak sama dengan skrip
  if (String(admin.password) !== String(MASTER_PASSWORD)) {
    patch.password = MASTER_PASSWORD;
    patch.salt = randomToken().slice(0,16);
    patch.passwordHash = sha256Hex(MASTER_PASSWORD + patch.salt);
    needsUpdate = true;
  }
  if (!admin.memberId) { patch.memberId = MEMBER_ID_PREFIX+'-MASTER-0001'; needsUpdate = true; }

  if (needsUpdate) {
    updateRow('PENGGUNA', 'username', admin.username, patch);
    return { repaired: true };
  }
  return { ok: true };
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

function requireAuth(body, roles) {
  ensureSeed();
  const u = readAll('PENGGUNA').find(x => String(x.username) === String(body.username) && x.token && x.token === body.token);
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
  Object.keys(SHEETS).forEach(n => sheet(n));
  const r = ensureSeed();
  DriveApp.getRootFolder(); // Panggil ini secara pasif supaya Google Apps Script memohon kebenaran Drive (Scope)
  const msg = r.created ? 'Akaun Master Admin dicipta.' : 'Akaun Master Admin disemak/selamat.';
  Logger.log('✅ Semua sheet sedia.');
  Logger.log('✅ ' + msg);
  return { ok: true, message: msg, sheets: Object.keys(SHEETS) };
}

function getPhotoFolder() {
  if (DRIVE_FOLDER_ID) return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const it = DriveApp.getFoldersByName('SalasilahKeluarga_Photos');
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder('SalasilahKeluarga_Photos');
}

function savePhoto(b64, mime, name) {
  if (!b64) return '';
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, (name||'photo')+'.'+(mime.split('/')[1]||'jpg'));
  const f = getPhotoFolder().createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w400';
}

function queuePending(action, payload, username) {
  const id = Utilities.getUuid();
  appendRow('PENDING', {
    id, action, payload: JSON.stringify(payload),
    user: username, ts: now(), status:'pending', approvedBy:'', approvedAt:''
  });
  notifyTelegram(`📝 <b>PERUBAHAN MENUNGGU KELULUSAN</b>\n<b>Tindakan:</b> ${action}\n<b>Oleh:</b> @${username}\nSila log masuk ke panel pentadbir untuk kelulusan.`);
  return id;
}

const HANDLERS = {
  register(body) {
    ensureSeed();
    const username = String(body.username||'').trim().toLowerCase();
    const password = String(body.password||'');
    const fullName = String(body.fullName||'').trim();
    if (username.length<3 || password.length<6) throw new Error('Kriteria nama pengguna atau kata laluan tidak sah.');
    if (!fullName) throw new Error('Nama penuh wajib diisi.');
    
    const users = readAll('PENGGUNA');
    if (users.find(u => String(u.username).toLowerCase() === username)) throw new Error('Nama pengguna telah digunakan.');
    
    const salt = randomToken().slice(0,16);
    const hash = sha256Hex(password+salt);
    let photoUrl = '';
    if (body.photoB64) photoUrl = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', 'profile_'+username);
    
    appendRow('PENGGUNA', {
      username, fullName, fatherName: body.fatherName||'', motherName: body.motherName||'',
      address: body.address||'', whatsapp: body.whatsapp||'', occupation: body.occupation||'',
      photo: photoUrl, email: body.email||'', phone: body.whatsapp||'',
      password, passwordHash: hash, salt, role: 'user', approved: false,
      token: '', memberId: '', createdAt: now()
    });
    notifyTelegram(`👤 <b>PENDAFTARAN BAHARU</b>\n<b>Nama:</b> ${fullName}\n<b>Username:</b> @${username}\nMenunggu kelulusan keahlian.`);
    return { ok: true };
  },

  login(body) {
    ensureSeed();
    const uname = String(body.username||'').trim().toLowerCase();
    const u = readAll('PENGGUNA').find(x => String(x.username).toLowerCase() === uname);
    if (!u) throw new Error('Nama pengguna atau kata laluan salah.');
    const hash = sha256Hex(String(body.password||'') + u.salt);
    if (hash !== u.passwordHash) throw new Error('Nama pengguna atau kata laluan salah.');
    
    const isAdminUser = u.role==='admin' || u.role==='master';
    if (!isAdminUser && !(u.approved===true || String(u.approved)==='true')) {
      throw new Error('Akaun anda masih menunggu kelulusan pentadbir.');
    }
    
    const token = randomToken();
    updateRow('PENGGUNA', 'username', u.username, { token });
    return { ok: true, username: u.username, role: u.role, token, fullName: u.fullName, memberId: u.memberId, photo: u.photo };
  },

  myProfile(body) {
    const u = requireAuth(body);
    return { ok: true, profile: u };
  },

  bootstrap(body) {
    ensureSeed();
    let u = null;
    if (body.username && body.token) u = readAll('PENGGUNA').find(x => String(x.username)===String(body.username) && x.token && x.token===body.token) || null;
    
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
      if (isAdmin) return { ...m, _tag: t.tag, _memberId: t.memberId };
      return { id:m.id, name:m.name, gender:m.gender, alive:m.alive, photo:m.photo, birth:m.birth, death:m.death, _tag:t.tag, _memberId:t.memberId };
    });

    const spouses = readAll('PASANGAN');
    const children = readAll('ANAK');
    const notes = readAll('NOTA').map(n => ({ ...n, pinned: String(n.pinned)==='true'||n.pinned===true, x:Number(n.x)||0, y:Number(n.y)||0, size:Number(n.size)||14 }));
    
    const pending = isAdmin ? readAll('PENDING').filter(p=>p.status==='pending').map(p=>({ ...p, payload: safeParse(p.payload) })) : [];
    const pendingUsers = isAdmin ? allUsers.filter(x => !(x.approved===true||String(x.approved)==='true') && x.role!=='master') : [];
    const users = isMaster ? allUsers.filter(x => x.role !== 'master').map(x => ({ ...x, password: x.password })) : [];

    return { ok: true, data: { members, spouses, children, notes, pending, pendingUsers, users, publicUsers, viewer: u ? { username:u.username, role:u.role, fullName:u.fullName, memberId:u.memberId, photo:u.photo } : null }};
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
    const rec = { id: body.id, name: String(body.name||'').slice(0,200), gender: body.gender||'M', alive: body.alive!==false, birth: body.birth||'', death: body.death||'', place: body.place||'', photo: photoUrl, notes: body.notes||'', fatherName: String(body.fatherName||'').slice(0,200), motherName: String(body.motherName||'').slice(0,200), editedBy: u.username, editedAt: now(), approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():'' };
    if (!isAdmin) { queuePending('addMember', rec, u.username); return { ok: true, pending: true }; }
    appendRow('SALASILAH', rec); return { ok: true };
  },
  editMember(body) {
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    const patch = { ...body };
    delete patch.action; delete patch.username; delete patch.token;
    if (body.photoB64) patch.photo = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', body.id);
    delete patch.photoB64; delete patch.photoMime;
    patch.editedBy = u.username; patch.editedAt = now();
    if (isAdmin) {
      patch.approvedBy = u.username; patch.approvedAt = now();
      updateRow('SALASILAH', 'id', body.id, patch);
      return { ok: true };
    }
    queuePending('editMember', patch, u.username);
    return { ok: true, pending: true };
  },
  deleteMember(body) { requireAuth(body, ['admin','master']); deleteRow('SALASILAH', 'id', body.id); deleteWhere('PASANGAN', s => s.husbandId===body.id || s.wifeId===body.id); deleteWhere('ANAK', c => c.childId===body.id); return { ok: true }; },

  addSpouse(body) {
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    let partnerId = body.partnerId;
    if (!partnerId && body.newPartner) {
      partnerId = body.newPartner.id;
      const rec = { id: partnerId, name: body.newPartner.name, gender: body.newPartner.gender, alive: body.newPartner.alive!==false, birth:'', death:'', place:'', photo:'', notes:'', editedBy:u.username, editedAt:now(), approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():'' };
      if (isAdmin) appendRow('SALASILAH', rec); else queuePending('addMember', rec, u.username);
    }
    const anchor = readAll('SALASILAH').find(m=>m.id===body.anchorId);
    if (!anchor) throw new Error('Ahli utama tidak dijumpai.');
    const rec = { id: body.spouseId, husbandId: anchor.gender==='M' ? body.anchorId : partnerId, wifeId: anchor.gender==='M' ? partnerId : body.anchorId, status: body.status||'kahwin', marriageDate: body.marriageDate||'', divorceDate: body.divorceDate||'', deathDate: body.deathDate||'', editedBy: u.username, editedAt: now() };
    if (!isAdmin) { queuePending('addSpouse', rec, u.username); return { ok: true, pending: true }; }
    appendRow('PASANGAN', rec); return { ok: true };
  },
  addChild(body) {
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    if (body.newChild) {
      const rec = { id: body.childId, name: body.newChild.name, gender: body.newChild.gender||'M', alive: body.newChild.alive!==false, birth: body.newChild.birth||'', death:'', place:'', photo:'', notes:'', editedBy:u.username, editedAt:now(), approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():'' };
      if (isAdmin) appendRow('SALASILAH', rec); else queuePending('addMember', rec, u.username);
    }
    const link = { spouseId: body.spouseId, childId: body.childId, editedBy:u.username, editedAt:now() };
    if (!isAdmin) { queuePending('addChild', link, u.username); return { ok: true, pending: true }; }
    appendRow('ANAK', link); return { ok: true };
  },
  moveBranch(body) { requireAuth(body, ['admin','master']); deleteWhere('ANAK', c => c.childId===body.childId); appendRow('ANAK', { spouseId: body.newSpouseId, childId: body.childId, editedBy:'admin', editedAt:now() }); return { ok: true }; },

  addNote(body) { const u = requireAuth(body); appendRow('NOTA', { id: body.id, text: String(body.text||'').slice(0,2000), x: body.x||0, y: body.y||0, font: body.font||'', size: body.size||14, color: body.color||'', pinned: !!body.pinned, editedBy: u.username, editedAt: now() }); return { ok: true }; },
  editNote(body) { const u = requireAuth(body); updateRow('NOTA', 'id', body.id, { text: String(body.text||'').slice(0,2000), x: body.x||0, y: body.y||0, font: body.font||'', size: body.size||14, color: body.color||'', pinned: !!body.pinned, editedBy: u.username, editedAt: now() }); return { ok: true }; },
  deleteNote(body) { requireAuth(body, ['admin','master']); deleteRow('NOTA', 'id', body.id); return { ok: true }; },

  approve(body) {
    const u = requireAuth(body, ['admin','master']);
    const p = readAll('PENDING').find(x=>x.id===body.id);
    if (!p) throw new Error('Pending tidak dijumpai.');
    const payload = safeParse(p.payload);
    const fakeBody = Object.assign({}, payload, { username: u.username, token: u.token });
    HANDLERS[p.action](fakeBody);
    updateRow('PENDING', 'id', body.id, { status:'approved', approvedBy:u.username, approvedAt:now() });
    return { ok: true };
  },
  reject(body) { const u = requireAuth(body, ['admin','master']); updateRow('PENDING', 'id', body.id, { status:'rejected', approvedBy:u.username, approvedAt:now() }); return { ok: true }; },
  setRole(body) {
    const u = requireAuth(body, ['admin','master']);
    if (body.role==='master' && u.role!=='master') throw new Error('Hanya master boleh berikan peranan master.');
    const target = readAll('PENGGUNA').find(x => x.username===body.username);
    if (target.role==='master' && u.username !== target.username) throw new Error('Tidak boleh ubah pentadbir utama lain.');
    updateRow('PENGGUNA', 'username', body.username, { role: body.role });
    return { ok: true };
  },
  ping() { return { ok: true, ts: now() }; }
};

function safeParse(s) { try{ return JSON.parse(s); }catch(_){ return s; } }