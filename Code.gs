/* =====================================================================
   Salasilah Keluarga Elit — Google Apps Script Backend (Code.gs)
   ---------------------------------------------------------------------
   LANGKAH PEMASANGAN:
   1) Buka https://sheets.new — buat Google Sheet kosong.
   2) Salin ID Sheet dari URL (di antara /d/  dan /edit) dan tampal pada
      SHEET_ID di bawah.
   3) (Opsional) Tetapkan DRIVE_FOLDER_ID, atau biarkan kosong — folder
      "SalasilahKeluarga_Photos" dicipta automatik di Drive anda.
   4) Extensions → Apps Script → tampal fail ini → Save.
   5) Pada Apps Script editor, pilih fungsi `setupSheets` → Run.
      Ini akan:
        • Cipta semua sheet (PENGGUNA, SALASILAH, PASANGAN, ANAK,
          NOTA, PENDING) dengan header yang betul.
        • Tanam akaun Master Admin: username=admin, password=101010
   6) (Opsional) Pilih fungsi `testSystem` → Run. Lihat Logs untuk
      pengesahan semua sistem berfungsi.
   7) Deploy → New deployment → Type: Web app
        • Execute as: Me
        • Who has access: Anyone
   8) Salin URL → tampal ke API_URL dalam app.js.
   9) Buka aplikasi → log masuk dengan: admin / 101010
   ===================================================================== */

const SHEET_ID = '1wqIc6971U96VXqOJ55pD-wzxQicC4RT4TBNoUrUVtig';        // ← isi di sini
const DRIVE_FOLDER_ID = '1tb1YIWlxbHkN-HzdAXtFlMWp136JXxN4'; // ← biar kosong jika mahu auto-cipta

const MASTER_USERNAME = 'admin';
const MASTER_PASSWORD = '101010';

const SHEETS = {
  PENGGUNA:  ['username','fullName','email','phone','passwordHash','salt','role','approved','token','memberId','createdAt'],
  SALASILAH: ['id','name','gender','alive','birth','death','place','photo','notes','editedBy','editedAt','approvedBy','approvedAt'],
  PASANGAN:  ['id','husbandId','wifeId','status','marriageDate','divorceDate','deathDate','editedBy','editedAt'],
  ANAK:      ['spouseId','childId','editedBy','editedAt'],
  NOTA:      ['id','text','x','y','font','size','color','pinned','editedBy','editedAt'],
  PENDING:   ['id','action','payload','user','ts','status','approvedBy','approvedAt']
};

// =====================================================================
// ENTRY
// =====================================================================
function doPost(e){
  try{
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const handler = HANDLERS[action];
    if(!handler) return json({ ok:false, error:'Tindakan tidak dikenali: '+action });
    return json(handler(body) || { ok:true });
  }catch(err){
    return json({ ok:false, error: String(err && err.message || err) });
  }
}
function doGet(){
  return json({ ok:true, msg:'Salasilah Keluarga API aktif.', version:'1.1' });
}
function json(o){
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// SHEET HELPERS
// =====================================================================
function ss(){
  if(!SHEET_ID) throw new Error('Sila tetapkan SHEET_ID dalam Code.gs');
  return SpreadsheetApp.openById(SHEET_ID);
}
function sheet(name){
  const s = ss();
  let sh = s.getSheetByName(name);
  if(!sh){
    sh = s.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  }
  if(sh.getLastRow() === 0){
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  }
  // Pastikan header padan (kalau pengguna pernah edit manual)
  const expected = SHEETS[name];
  const current = sh.getRange(1,1,1,Math.max(expected.length, sh.getLastColumn())).getValues()[0];
  let needWrite = false;
  for(let i=0;i<expected.length;i++){
    if(current[i] !== expected[i]){ needWrite = true; break; }
  }
  if(needWrite){
    sh.getRange(1,1,1,expected.length).setValues([expected]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function readAll(name){
  const sh = sheet(name);
  const v = sh.getDataRange().getValues();
  if(v.length<=1) return [];
  const hdr = v[0];
  return v.slice(1).map(row => Object.fromEntries(hdr.map((h,i)=>[h, row[i]])));
}
function appendRow(name, obj){
  const sh = sheet(name);
  const hdr = SHEETS[name];
  sh.appendRow(hdr.map(h => obj[h] !== undefined ? obj[h] : ''));
}
function updateRow(name, keyField, keyVal, obj){
  const sh = sheet(name);
  const v = sh.getDataRange().getValues();
  const hdr = v[0];
  const idx = hdr.indexOf(keyField);
  for(let i=1;i<v.length;i++){
    if(String(v[i][idx])===String(keyVal)){
      const row = hdr.map(h => obj[h] !== undefined ? obj[h] : v[i][hdr.indexOf(h)]);
      sh.getRange(i+1,1,1,hdr.length).setValues([row]);
      return true;
    }
  }
  return false;
}
function deleteRow(name, keyField, keyVal){
  const sh = sheet(name);
  const v = sh.getDataRange().getValues();
  const hdr = v[0]; const idx = hdr.indexOf(keyField);
  for(let i=v.length-1;i>=1;i--){
    if(String(v[i][idx])===String(keyVal)) sh.deleteRow(i+1);
  }
}
function deleteWhere(name, predicate){
  const sh = sheet(name);
  const v = sh.getDataRange().getValues();
  const hdr = v[0];
  for(let i=v.length-1;i>=1;i--){
    const obj = Object.fromEntries(hdr.map((h,j)=>[h,v[i][j]]));
    if(predicate(obj)) sh.deleteRow(i+1);
  }
}

// =====================================================================
// SECURITY
// =====================================================================
function sha256Hex(text){
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw.map(b=>{ const h=(b<0?b+256:b).toString(16); return h.length<2?'0'+h:h; }).join('');
}
function randomToken(){ return Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''); }
function now(){ return new Date().toISOString(); }

// Pastikan akaun Master Admin sentiasa wujud DAN selaras dengan password yang ditetapkan.
function ensureSeed(){
  // Pastikan semua sheet wujud
  Object.keys(SHEETS).forEach(n => sheet(n));

  const users = readAll('PENGGUNA');
  const admin = users.find(u => String(u.username).toLowerCase() === MASTER_USERNAME);
  const salt = randomToken().slice(0,16);
  const hash = sha256Hex(MASTER_PASSWORD + salt);

  if(!admin){
    appendRow('PENGGUNA', {
      username: MASTER_USERNAME, fullName:'Pentadbir Utama',
      email:'', phone:'',
      passwordHash: hash, salt: salt,
      role:'master', approved: true, token:'', memberId:'',
      createdAt: now()
    });
    return { created:true };
  }
  // Kemaskini supaya master sentiasa boleh log masuk dengan password yang ditetapkan
  // dan peranannya kekal 'master', approved=true.
  const patch = {};
  if(admin.role !== 'master') patch.role = 'master';
  if(String(admin.approved) !== 'true' && admin.approved !== true) patch.approved = true;
  // Reset password kepada MASTER_PASSWORD agar mengikut ketetapan
  patch.passwordHash = hash;
  patch.salt = salt;
  updateRow('PENGGUNA','username', admin.username, patch);
  return { repaired:true };
}

function requireAuth(body, roles){
  ensureSeed();
  const u = readAll('PENGGUNA').find(x =>
    String(x.username) === String(body.username) && x.token && x.token === body.token);
  if(!u) throw new Error('Tidak dibenarkan — sila log masuk semula.');
  if(roles && roles.length && roles.indexOf(u.role) < 0) throw new Error('Akses peranan ditolak.');
  return u;
}

// =====================================================================
// PUBLIC SETUP & TEST (jalan secara manual dari editor Apps Script)
// =====================================================================
function setupSheets(){
  if(!SHEET_ID) throw new Error('SHEET_ID belum ditetapkan dalam Code.gs');
  Object.keys(SHEETS).forEach(n => sheet(n));
  const r = ensureSeed();
  const msg = r.created
    ? 'Akaun Master Admin dicipta (admin / ' + MASTER_PASSWORD + ').'
    : 'Akaun Master Admin disegerak semula (admin / ' + MASTER_PASSWORD + ').';
  Logger.log('✅ Semua sheet sedia.');
  Object.keys(SHEETS).forEach(n => Logger.log(' • ' + n + ' [' + SHEETS[n].join(', ') + ']'));
  Logger.log('✅ ' + msg);
  return { ok:true, message: msg, sheets: Object.keys(SHEETS) };
}

/**
 * Ujian penuh sistem. Jalan secara manual dari Apps Script editor:
 *   pilih fungsi `testSystem` → Run → lihat View → Logs.
 * Akan log status setiap pemeriksaan; jika gagal, tunjuk sebab.
 */
function testSystem(){
  const results = [];
  function step(name, fn){
    try{ const out = fn(); results.push({ name, ok:true, out }); Logger.log('✅ ' + name); }
    catch(e){ results.push({ name, ok:false, error: e.message }); Logger.log('❌ ' + name + ' — ' + e.message); }
  }

  step('SHEET_ID ditetapkan', ()=>{ if(!SHEET_ID) throw new Error('Kosong'); return SHEET_ID; });
  step('Boleh akses Spreadsheet', ()=> ss().getName());
  step('Cipta/sahkan semua sheet & header', ()=>{
    Object.keys(SHEETS).forEach(n => sheet(n));
    return Object.keys(SHEETS);
  });
  step('Seed Master Admin (admin/101010)', ()=> ensureSeed());
  step('Login Master Admin', ()=>{
    const r = HANDLERS.login({ username: MASTER_USERNAME, password: MASTER_PASSWORD });
    if(!r.ok || r.role !== 'master') throw new Error('Login tidak kembali sebagai master');
    return { role:r.role, hasToken: !!r.token };
  });
  step('Bootstrap sebagai admin', ()=>{
    const login = HANDLERS.login({ username: MASTER_USERNAME, password: MASTER_PASSWORD });
    const b = HANDLERS.bootstrap({ username: login.username, token: login.token });
    if(!b.ok) throw new Error('Bootstrap gagal');
    return { members: b.data.members.length, users: b.data.users.length };
  });
  step('Akses folder gambar (Drive)', ()=>{
    const f = getPhotoFolder();
    return f.getName();
  });

  const failed = results.filter(r => !r.ok);
  Logger.log('---');
  Logger.log(failed.length === 0
    ? '🎉 SEMUA UJIAN LULUS (' + results.length + '/' + results.length + ')'
    : '⚠️ ' + failed.length + ' daripada ' + results.length + ' ujian gagal.');
  return { ok: failed.length===0, results };
}

// =====================================================================
// PHOTO STORAGE
// =====================================================================
function getPhotoFolder(){
  if(DRIVE_FOLDER_ID) return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const it = DriveApp.getFoldersByName('SalasilahKeluarga_Photos');
  if(it.hasNext()) return it.next();
  return DriveApp.createFolder('SalasilahKeluarga_Photos');
}
function savePhoto(b64, mime, name){
  if(!b64) return '';
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, (name||'photo')+'.'+(mime.split('/')[1]||'jpg'));
  const f = getPhotoFolder().createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = f.getId();
  return 'https://drive.google.com/thumbnail?id='+id+'&sz=w400';
}

// =====================================================================
// PENDING WORKFLOW
// =====================================================================
function queuePending(action, payload, username){
  const id = Utilities.getUuid();
  appendRow('PENDING', {
    id, action, payload: JSON.stringify(payload),
    user: username, ts: now(), status:'pending', approvedBy:'', approvedAt:''
  });
  return id;
}

// =====================================================================
// ACTION HANDLERS
// =====================================================================
const HANDLERS = {

  // ----- AUTH -----
  register(body){
    ensureSeed();
    const username = String(body.username||'').trim().toLowerCase();
    const password = String(body.password||'');
    if(username.length<3) throw new Error('Nama pengguna minima 3 aksara.');
    if(username.length>40) throw new Error('Nama pengguna terlalu panjang.');
    if(password.length<6) throw new Error('Kata laluan minima 6 aksara.');
    const users = readAll('PENGGUNA');
    if(users.find(u=>String(u.username).toLowerCase()===username)) throw new Error('Nama pengguna telah digunakan.');
    const salt = randomToken().slice(0,16);
    const hash = sha256Hex(password+salt);
    appendRow('PENGGUNA', {
      username,
      fullName: String(body.fullName||'').slice(0,120),
      email: String(body.email||'').slice(0,120),
      phone: String(body.phone||'').slice(0,40),
      passwordHash:hash, salt, role:'user', approved:false,
      token:'', memberId:'', createdAt: now()
    });
    return { ok:true };
  },

  login(body){
    ensureSeed();
    const uname = String(body.username||'').trim().toLowerCase();
    const u = readAll('PENGGUNA').find(x => String(x.username).toLowerCase() === uname);
    if(!u) throw new Error('Nama pengguna atau kata laluan salah.');
    const hash = sha256Hex(String(body.password||'') + u.salt);
    if(hash !== u.passwordHash) throw new Error('Nama pengguna atau kata laluan salah.');
    const isAdminUser = u.role==='admin' || u.role==='master';
    if(!isAdminUser && !(u.approved===true || String(u.approved)==='true')){
      throw new Error('Akaun anda masih menunggu kelulusan pentadbir.');
    }
    const token = randomToken();
    updateRow('PENGGUNA','username', u.username, { token });
    return { ok:true, username:u.username, role:u.role, token, fullName:u.fullName };
  },

  // ----- BOOTSTRAP -----
  bootstrap(body){
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    const isMaster = u.role==='master';
    const members = readAll('SALASILAH').map(m => ({
      ...m, alive: String(m.alive)==='true' || m.alive===true
    }));
    const spouses = readAll('PASANGAN');
    const children = readAll('ANAK');
    const notes = readAll('NOTA').map(n => ({
      ...n,
      pinned: String(n.pinned)==='true'||n.pinned===true,
      x:Number(n.x)||0, y:Number(n.y)||0, size:Number(n.size)||14
    }));
    const pending = isAdmin
      ? readAll('PENDING').filter(p=>p.status==='pending').map(p=>({ ...p, payload: safeParse(p.payload) }))
      : [];
    const allUsers = readAll('PENGGUNA');
    const pendingUsers = isAdmin
      ? allUsers.filter(x => !(x.approved===true||String(x.approved)==='true') && x.role!=='master')
                .map(x => ({ username:x.username, fullName:x.fullName, email:x.email, phone:x.phone, createdAt:x.createdAt }))
      : [];
    const users = isMaster
      ? allUsers.filter(x => x.role !== 'master')
                .map(x => ({ username:x.username, fullName:x.fullName, role:x.role,
                             approved: x.approved===true || String(x.approved)==='true' }))
      : [];
    return { ok:true, data: { members, spouses, children, notes, pending, pendingUsers, users } };
  },

  // ----- USER APPROVAL -----
  approveUser(body){
    requireAuth(body, ['admin','master']);
    updateRow('PENGGUNA','username', body.target, { approved: true });
    return { ok:true };
  },
  rejectUser(body){
    requireAuth(body, ['admin','master']);
    deleteWhere('PENGGUNA', u =>
      String(u.username) === String(body.target) &&
      !(u.approved===true || String(u.approved)==='true'));
    return { ok:true };
  },

  // ----- MEMBERS -----
  addMember(body){
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    let photoUrl = '';
    if(body.photoB64) photoUrl = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', body.id);
    const rec = {
      id: body.id, name: String(body.name||'').slice(0,200), gender: body.gender||'M',
      alive: body.alive!==false, birth: body.birth||'', death: body.death||'',
      place: body.place||'', photo: photoUrl, notes: body.notes||'',
      editedBy: u.username, editedAt: now(),
      approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():''
    };
    if(!isAdmin){ queuePending('addMember', rec, u.username); return { ok:true, pending:true }; }
    appendRow('SALASILAH', rec); return { ok:true };
  },

  editMember(body){
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    const patch = { ...body };
    delete patch.action; delete patch.username; delete patch.token;
    if(body.photoB64) patch.photo = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', body.id);
    delete patch.photoB64; delete patch.photoMime;
    patch.editedBy = u.username; patch.editedAt = now();
    if(isAdmin){
      patch.approvedBy = u.username; patch.approvedAt = now();
      updateRow('SALASILAH','id',body.id,patch);
      return { ok:true };
    }
    queuePending('editMember', patch, u.username);
    return { ok:true, pending:true };
  },

  deleteMember(body){
    requireAuth(body, ['admin','master']);
    deleteRow('SALASILAH','id', body.id);
    deleteWhere('PASANGAN', s => s.husbandId===body.id || s.wifeId===body.id);
    deleteWhere('ANAK', c => c.childId===body.id);
    return { ok:true };
  },

  // ----- SPOUSE -----
  addSpouse(body){
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    let partnerId = body.partnerId;
    if(!partnerId && body.newPartner){
      partnerId = body.newPartner.id;
      const rec = {
        id: partnerId, name: body.newPartner.name, gender: body.newPartner.gender,
        alive: body.newPartner.alive!==false, birth:'', death:'', place:'', photo:'', notes:'',
        editedBy:u.username, editedAt:now(),
        approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():''
      };
      if(isAdmin) appendRow('SALASILAH', rec); else queuePending('addMember', rec, u.username);
    }
    const anchor = readAll('SALASILAH').find(m=>m.id===body.anchorId);
    if(!anchor) throw new Error('Ahli utama tidak dijumpai.');
    const husbandId = anchor.gender==='M' ? body.anchorId : partnerId;
    const wifeId = anchor.gender==='M' ? partnerId : body.anchorId;
    const rec = {
      id: body.spouseId, husbandId, wifeId,
      status: body.status||'kahwin', marriageDate: body.marriageDate||'',
      divorceDate: body.divorceDate||'', deathDate: body.deathDate||'',
      editedBy: u.username, editedAt: now()
    };
    if(!isAdmin){ queuePending('addSpouse', rec, u.username); return { ok:true, pending:true }; }
    appendRow('PASANGAN', rec); return { ok:true };
  },

  // ----- CHILD -----
  addChild(body){
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    if(body.newChild){
      const rec = {
        id: body.childId, name: body.newChild.name, gender: body.newChild.gender||'M',
        alive: body.newChild.alive!==false, birth: body.newChild.birth||'', death:'',
        place:'', photo:'', notes:'',
        editedBy:u.username, editedAt:now(),
        approvedBy: isAdmin?u.username:'', approvedAt: isAdmin?now():''
      };
      if(isAdmin) appendRow('SALASILAH', rec); else queuePending('addMember', rec, u.username);
    }
    const link = { spouseId: body.spouseId, childId: body.childId, editedBy:u.username, editedAt:now() };
    if(!isAdmin){ queuePending('addChild', link, u.username); return { ok:true, pending:true }; }
    appendRow('ANAK', link); return { ok:true };
  },

  moveBranch(body){
    requireAuth(body, ['admin','master']);
    deleteWhere('ANAK', c => c.childId===body.childId);
    appendRow('ANAK', { spouseId: body.newSpouseId, childId: body.childId, editedBy:'admin', editedAt:now() });
    return { ok:true };
  },

  // ----- NOTES -----
  addNote(body){
    const u = requireAuth(body);
    const rec = {
      id: body.id, text: String(body.text||'').slice(0,2000),
      x: body.x||0, y: body.y||0,
      font: body.font||'', size: body.size||14, color: body.color||'',
      pinned: !!body.pinned, editedBy: u.username, editedAt: now()
    };
    appendRow('NOTA', rec); return { ok:true };
  },
  editNote(body){
    const u = requireAuth(body);
    updateRow('NOTA','id', body.id, {
      text: String(body.text||'').slice(0,2000), x: body.x||0, y: body.y||0,
      font: body.font||'', size: body.size||14, color: body.color||'',
      pinned: !!body.pinned, editedBy: u.username, editedAt: now()
    });
    return { ok:true };
  },
  deleteNote(body){ requireAuth(body); deleteRow('NOTA','id', body.id); return { ok:true }; },

  // ----- PROFILE -----
  linkProfile(body){
    const u = requireAuth(body);
    updateRow('PENGGUNA','username', u.username, { memberId: body.memberId });
    return { ok:true };
  },

  // ----- ADMIN: pending edits -----
  approve(body){
    const u = requireAuth(body, ['admin','master']);
    const p = readAll('PENDING').find(x=>x.id===body.id);
    if(!p) throw new Error('Pending tidak dijumpai.');
    const payload = safeParse(p.payload);
    const fakeBody = Object.assign({}, payload, { username: u.username, token: u.token });
    const inner = HANDLERS[p.action];
    if(!inner) throw new Error('Tindakan asal tidak diketahui.');
    inner(fakeBody);
    updateRow('PENDING','id', body.id, { status:'approved', approvedBy:u.username, approvedAt:now() });
    return { ok:true };
  },
  reject(body){
    const u = requireAuth(body, ['admin','master']);
    updateRow('PENDING','id', body.id, { status:'rejected', approvedBy:u.username, approvedAt:now() });
    return { ok:true };
  },
  setRole(body){
    const u = requireAuth(body, ['admin','master']);
    if(body.role==='master' && u.role!=='master') throw new Error('Hanya master boleh berikan peranan master.');
    if(!['user','admin','master'].includes(body.role)) throw new Error('Peranan tidak sah.');
    const target = readAll('PENGGUNA').find(x => x.username===body.username);
    if(!target) throw new Error('Pengguna tidak dijumpai.');
    if(target.role==='master' && u.username !== target.username) throw new Error('Tidak boleh ubah pentadbir utama lain.');
    updateRow('PENGGUNA','username', body.username, { role: body.role });
    return { ok:true };
  },

  // ----- HEALTH -----
  ping(){ return { ok:true, ts: now() }; }
};

function safeParse(s){ try{ return JSON.parse(s); }catch(_){ return s; } }
