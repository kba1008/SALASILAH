/* =====================================================================
   Salasilah Keluarga Elit — Google Apps Script Backend (Code.gs)
   ---------------------------------------------------------------------
   ARAHAN:
   1) Buka https://sheets.new — buat Google Sheet kosong.
   2) Salin ID Sheet dari URL (di antara /d/  dan /edit).
   3) Tetapkan SHEET_ID di bawah.
   4) Tetapkan DRIVE_FOLDER_ID (opsional) atau biar kosong — folder
      "SalasilahKeluarga_Photos" akan dicipta automatik di Drive anda.
   5) Extensions → Apps Script → tampal fail ini, Save.
   6) Deploy → New deployment → Type: Web app
      - Execute as: Me
      - Who has access: Anyone
   7) Salin URL → tampal ke API_URL dalam app.js.
   8) Buka aplikasi, log masuk dengan: admin / 101010
   ===================================================================== */

const SHEET_ID = ''; // ← isi di sini
const DRIVE_FOLDER_ID = ''; // ← biar kosong jika mahu auto-cipta

const SHEETS = {
  PENGGUNA: ['username','fullName','email','phone','passwordHash','salt','role','token','memberId','createdAt'],
  SALASILAH: ['id','name','gender','alive','birth','death','place','photo','notes','editedBy','editedAt','approvedBy','approvedAt'],
  PASANGAN: ['id','husbandId','wifeId','status','marriageDate','divorceDate','deathDate','editedBy','editedAt'],
  ANAK: ['spouseId','childId','editedBy','editedAt'],
  NOTA: ['id','text','x','y','font','size','color','pinned','editedBy','editedAt'],
  PENDING: ['id','action','payload','user','ts','status','approvedBy','approvedAt']
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
function doGet(){ return json({ ok:true, msg:'Salasilah Keluarga API aktif.' }); }

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
  }
  // Pastikan tajuk wujud
  if(sh.getLastRow()===0) sh.appendRow(SHEETS[name]);
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

function ensureSeed(){
  const users = readAll('PENGGUNA');
  if(!users.length){
    const salt = randomToken().slice(0,16);
    const hash = sha256Hex('101010'+salt);
    appendRow('PENGGUNA', {
      username:'admin', fullName:'Pentadbir Utama', email:'', phone:'',
      passwordHash:hash, salt:salt, role:'master', token:'', memberId:'', createdAt: now()
    });
  }
}

function requireAuth(body, roles){
  ensureSeed();
  const u = readAll('PENGGUNA').find(x => x.username===body.username && x.token && x.token===body.token);
  if(!u) throw new Error('Tidak dibenarkan — sila log masuk semula.');
  if(roles && roles.length && roles.indexOf(u.role)<0) throw new Error('Akses peranan ditolak.');
  return u;
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
    const username = String(body.username||'').trim();
    const password = String(body.password||'');
    if(username.length<3) throw new Error('Nama pengguna minima 3 aksara.');
    if(password.length<6) throw new Error('Kata laluan minima 6 aksara.');
    const users = readAll('PENGGUNA');
    if(users.find(u=>u.username===username)) throw new Error('Nama pengguna telah digunakan.');
    const salt = randomToken().slice(0,16);
    const hash = sha256Hex(password+salt);
    appendRow('PENGGUNA', {
      username, fullName:body.fullName||'', email:body.email||'', phone:body.phone||'',
      passwordHash:hash, salt, role:'user', token:'', memberId:'', createdAt: now()
    });
    return { ok:true };
  },

  login(body){
    ensureSeed();
    const u = readAll('PENGGUNA').find(x => x.username === body.username);
    if(!u) throw new Error('Nama pengguna atau kata laluan salah.');
    const hash = sha256Hex(String(body.password||'')+u.salt);
    if(hash !== u.passwordHash) throw new Error('Nama pengguna atau kata laluan salah.');
    const token = randomToken();
    updateRow('PENGGUNA','username',u.username,{ token });
    return { ok:true, username:u.username, role:u.role, token, fullName:u.fullName };
  },

  // ----- BOOTSTRAP -----
  bootstrap(body){
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    const members = readAll('SALASILAH').map(m => ({
      ...m, alive: String(m.alive)==='true' || m.alive===true
    }));
    const spouses = readAll('PASANGAN');
    const children = readAll('ANAK');
    const notes = readAll('NOTA').map(n => ({...n, pinned:String(n.pinned)==='true'||n.pinned===true, x:Number(n.x)||0, y:Number(n.y)||0, size:Number(n.size)||14}));
    const pending = isAdmin ? readAll('PENDING').filter(p=>p.status==='pending').map(p=>({ ...p, payload: safeParse(p.payload) })) : [];
    const users = isAdmin ? readAll('PENGGUNA').map(x=>({ username:x.username, fullName:x.fullName, role:x.role })) : [];
    // Sembunyikan emel/telefon kecuali admin atau pemilik
    return { ok:true, data: { members, spouses, children, notes, pending, users } };
  },

  // ----- MEMBERS -----
  addMember(body){
    const u = requireAuth(body);
    const isAdmin = u.role==='admin' || u.role==='master';
    let photoUrl = '';
    if(body.photoB64) photoUrl = savePhoto(body.photoB64, body.photoMime || 'image/jpeg', body.id);
    const rec = {
      id: body.id, name: body.name, gender: body.gender||'M',
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
    if(isAdmin){ patch.approvedBy = u.username; patch.approvedAt = now(); updateRow('SALASILAH','id',body.id,patch); return { ok:true }; }
    queuePending('editMember', patch, u.username); return { ok:true, pending:true };
  },

  deleteMember(body){
    const u = requireAuth(body, ['admin','master']);
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
      id: body.id, text: body.text||'', x: body.x||0, y: body.y||0,
      font: body.font||'', size: body.size||14, color: body.color||'',
      pinned: !!body.pinned, editedBy: u.username, editedAt: now()
    };
    appendRow('NOTA', rec); return { ok:true };
  },
  editNote(body){
    const u = requireAuth(body);
    updateRow('NOTA','id', body.id, {
      text: body.text||'', x: body.x||0, y: body.y||0,
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

  // ----- ADMIN -----
  approve(body){
    const u = requireAuth(body, ['admin','master']);
    const p = readAll('PENDING').find(x=>x.id===body.id); if(!p) throw new Error('Pending tidak dijumpai.');
    const payload = safeParse(p.payload);
    const fakeBody = Object.assign({}, payload, { username: u.username, token: u.token });
    // jalan tindakan sebagai admin
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
    updateRow('PENGGUNA','username', body.username, { role: body.role });
    return { ok:true };
  }
};

function safeParse(s){ try{ return JSON.parse(s); }catch{ return s; } }
