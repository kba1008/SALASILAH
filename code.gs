/**
 * SALASILAH KELUARGA ELIT — Apps Script Backend v2.6
 * Deploy: Extensions → Apps Script → Deploy → New deployment → Web app
 *   Execute as: Me   |   Access: Anyone
 * Pertama kali: Jalankan INITIALIZE_SYSTEM() secara manual sekali.
 */

const SHEET_USERS   = "PENGGUNA";
const SHEET_TREE    = "SALASILAH";
const SHEET_PENDING = "PENDING";
const SHEET_NOTES   = "NOTA";
const DRIVE_FOLDER  = "SalasilahImages";

const MASTER_USER = "admin";
const MASTER_PASS = "101010";

// v2.6: spouseIndex (anak dari pasangan keberapa)
const TREE_HEADERS = ["id","parentId","no","name","nickname","gender","status","birth","death","birthplace","deathplace","spousesJson","spouseName","spousePhoto","spouseIndex","photo","notes","createdBy","createdAt","pending","lastEditBy","lastEditAt","approvedBy","approvedAt"];
const USER_HEADERS = ["no","username","fullname","email","phone","passwordHash","photo","role","token","createdAt","fatherName","motherName","banned"];
// v2.6: NOTA pada map
const NOTE_HEADERS = ["id","text","x","y","font","size","color","pinned","pending","createdBy","createdAt","lastEditBy","lastEditAt","approvedBy","approvedAt"];

/* ============ INIT ============ */
function INITIALIZE_SYSTEM() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEET_USERS,   USER_HEADERS);
  ensureSheet_(ss, SHEET_TREE,    TREE_HEADERS);
  ensureSheet_(ss, SHEET_PENDING, ["id","action","targetId","payload","by","summary","createdAt"]);
  ensureSheet_(ss, SHEET_NOTES,   NOTE_HEADERS);
  migrateHeaders_(SHEET_TREE, TREE_HEADERS);
  migrateHeaders_(SHEET_USERS, USER_HEADERS);
  migrateHeaders_(SHEET_NOTES, NOTE_HEADERS);
  ensureFolder_();
  const users = ss.getSheetByName(SHEET_USERS);
  if (users.getLastRow() < 2) {
    appendUserRow_({ no:0, username:MASTER_USER, fullname:"Master Admin", passwordHash:hash_(MASTER_PASS), role:"admin", createdAt:new Date() });
  }
  return "OK";
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
}
function migrateHeaders_(name, headers){
  const sh = sheet_(name);
  const h = sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0];
  headers.forEach(col=>{
    if(h.indexOf(col)===-1){
      sh.insertColumnAfter(sh.getLastColumn());
      sh.getRange(1, sh.getLastColumn()).setValue(col);
    }
  });
}
function ensureFolder_() {
  const it = DriveApp.getFoldersByName(DRIVE_FOLDER);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(DRIVE_FOLDER);
}

/* ============ ENTRY ============ */
function doPost(e) {
  try {
    ensureInit_();
    const req = JSON.parse(e.postData.contents);
    const handler = ACTIONS[req.action];
    if (!handler) throw new Error("Unknown action: " + req.action);
    const auth = authenticate_(req.auth);
    const data = handler(req.payload || {}, auth);
    return out_({ ok: true, data });
  } catch (err) {
    return out_({ ok: false, error: err.message + (err.stack ? "\n"+err.stack : "") });
  }
}
function doGet(){ ensureInit_(); return out_({ok:true,data:"Salasilah API live v2.6"});}
function out_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}

function ensureInit_() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(SHEET_USERS) || !ss.getSheetByName(SHEET_TREE) || !ss.getSheetByName(SHEET_PENDING) || !ss.getSheetByName(SHEET_NOTES)) {
    INITIALIZE_SYSTEM();
    return;
  }
  migrateHeaders_(SHEET_TREE, TREE_HEADERS);
  migrateHeaders_(SHEET_USERS, USER_HEADERS);
  migrateHeaders_(SHEET_NOTES, NOTE_HEADERS);
  const u = findUserBy_("username", MASTER_USER);
  if (!u) {
    appendUserRow_({ no:0, username:MASTER_USER, fullname:"Master Admin", passwordHash:hash_(MASTER_PASS), role:"admin", createdAt:new Date() });
  }
}

/* ============ AUTH ============ */
function authenticate_(auth) {
  if (!auth || !auth.username || !auth.token) return null;
  const u = findUserBy_("username", auth.username);
  if (u && u.token && String(u.token) === String(auth.token)) {
    if (u.banned === true || u.banned === "TRUE" || u.banned === "true" || u.banned === 1) {
      throw new Error("Akaun anda telah disekat oleh admin.");
    }
    return u;
  }
  return null;
}
function requireAuth_(a){if(!a)throw new Error("Sesi tamat. Sila log masuk semula.");return a;}
function requireAdmin_(a){requireAuth_(a);if(a.role!=="admin")throw new Error("Hak admin diperlukan");return a;}
function requireMaster_(a){requireAuth_(a);if(a.username!==MASTER_USER)throw new Error("Hanya Master Admin (akaun '"+MASTER_USER+"') dibenarkan.");return a;}

function hash_(s){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s+"|salasilah"));}
function genToken_(){return Utilities.getUuid().replace(/-/g,"");}

/* ============ ACTIONS ============ */
const ACTIONS = {
  register(p) {
    if (!p.username || !p.password) throw new Error("Maklumat tidak lengkap");
    if (!p.phone) throw new Error("No. telefon (WhatsApp) wajib diisi");
    if (!p.fatherName) throw new Error("Nama penuh BAPA wajib diisi untuk rujukan admin");
    if (!p.motherName) throw new Error("Nama penuh IBU wajib diisi untuk rujukan admin");
    if (String(p.username).toLowerCase() === MASTER_USER) throw new Error("Nama samaran ini dilindungi");
    if (findUserBy_("username", p.username)) throw new Error("Nama samaran sudah wujud");
    const sh = sheet_(SHEET_USERS);
    const no = Math.max(0, sh.getLastRow() - 1) + 1;
    const photoUrl = p.photo ? saveImage_(p.photo, "user_"+p.username) : "";
    appendUserRow_({
      no, username:p.username, fullname:p.fullname||"", email:p.email||"", phone:p.phone||"",
      passwordHash:hash_(p.password), photo:photoUrl, role:"ahli", token:"", createdAt:new Date(),
      fatherName:p.fatherName||"", motherName:p.motherName||"", banned:false
    });
    return { no };
  },
  login(p) {
    if (!p || !p.username || !p.password) throw new Error("Sila isi nama samaran dan password");
    if (String(p.username).toLowerCase() === MASTER_USER && String(p.password) === MASTER_PASS) {
      let u = findUserBy_("username", MASTER_USER);
      if (!u) {
        appendUserRow_({ no:0, username:MASTER_USER, fullname:"Master Admin", passwordHash:hash_(MASTER_PASS), role:"admin", createdAt:new Date() });
        u = findUserBy_("username", MASTER_USER);
      }
      const token = genToken_();
      updateUserField_(u.row, "token", token);
      return { username: MASTER_USER, role: "admin", no: 0, token, isMaster:true };
    }
    const u = findUserBy_("username", p.username);
    if (!u || u.passwordHash !== hash_(p.password)) throw new Error("Nama samaran atau password salah");
    if (u.banned === true || u.banned === "TRUE" || u.banned === "true" || u.banned === 1) throw new Error("Akaun anda telah disekat oleh admin. Hubungi Master Admin.");
    const token = genToken_();
    updateUserField_(u.row, "token", token);
    return { username: u.username, role: u.role || "ahli", no: u.no, token, photo: u.photo, isMaster:false };
  },
  getTree() {
    const rows = readSheet_(SHEET_TREE);
    const notes = readSheet_(SHEET_NOTES).map(n=>({
      ...n,
      x: Number(n.x)||0, y: Number(n.y)||0,
      size: Number(n.size)||16,
      pinned: n.pinned===true||n.pinned==="TRUE"||n.pinned==="true"||n.pinned===1,
      pending: n.pending===true||n.pending==="TRUE"||n.pending==="true"||n.pending===1,
    }));
    return { nodes: rows.map(r => {
      let spouses = [];
      if (r.spousesJson) { try { spouses = JSON.parse(r.spousesJson)||[]; } catch(e){} }
      else if (r.spouseName) spouses = [{name:r.spouseName, photo:r.spousePhoto||"", status:"hidup", order:1, death:""}];
      return { ...r, spouses, pending: !!r.pending };
    }), notes };
  },
  initRoot(p, auth) {
    requireAdmin_(auth);
    const sh = sheet_(SHEET_TREE);
    if (sh.getLastRow() > 1) throw new Error("Root sudah wujud");
    const id = Utilities.getUuid();
    appendNodeRow_(sh, {id, parentId:"", no:1, name:p.name, gender:"L", status:"hidup", createdBy:auth.username, lastEditBy:auth.username, lastEditAt:new Date(), approvedBy:auth.username, approvedAt:new Date()});
    return { id };
  },
  saveNode(p, auth) {
    requireAuth_(auth);
    const isAdmin = auth.role === "admin";
    const photoUrl = p.photo ? saveImage_(p.photo, "node_"+Date.now()) : null;

    if (p.relation === "spouse" && p.parentId) {
      validateSpouseRule_(p.parentId, p);
      if (isAdmin) { addSpouse_(p.parentId, p, photoUrl, auth); stampApprove_(p.parentId, auth); return { ok: true }; }
      addPending_({ action: "spouse", targetId: p.parentId, payload: { ...p, photoUrl }, by: auth.username, summary: "Pasangan ke-"+(p.spouseOrder||"?")+": "+(p.name||"") });
      markNodePending_(p.parentId, true);
      return { pending: true };
    }

    if (p.id) {
      if (isAdmin) { applyNodeUpdate_(p, photoUrl, auth); stampApprove_(p.id, auth); return { ok: true }; }
      addPending_({ action: "edit", targetId: p.id, payload: { ...p, photoUrl }, by: auth.username, summary: "Edit "+(p.name||"") });
      markNodePending_(p.id, true);
      return { pending: true };
    }

    const newId = insertNode_(p, photoUrl, auth, !isAdmin);
    if (!isAdmin) {
      addPending_({ action: "add", targetId: newId, payload: { id:newId, parentId:p.parentId||"" }, by: auth.username, summary: "Tambah ahli: "+(p.name||"") });
      return { pending: true, id: newId };
    }
    stampApprove_(newId, auth);
    return { ok: true, id: newId };
  },
  deleteNode(p, auth) {
    requireAuth_(auth);
    const isAdmin = auth.role === "admin";
    if (isAdmin) {
      deleteRowById_(SHEET_TREE, p.id);
      const pend = readSheet_(SHEET_PENDING).filter(x=>x.targetId===p.id);
      pend.forEach(x=>deleteRowById_(SHEET_PENDING, x.id));
      return { ok: true };
    }
    const rows = readSheet_(SHEET_TREE);
    const n = rows.find(r=>String(r.id)===String(p.id));
    if (!n) throw new Error("Node tidak dijumpai");
    addPending_({ action:"delete", targetId:p.id, payload:{ id:p.id, name:n.name }, by:auth.username, summary:"Padam: "+(n.name||"") });
    markNodePending_(p.id, true);
    return { pending: true };
  },

  /* ===== NOTA pada map ===== */
  saveNote(p, auth) {
    requireAuth_(auth);
    const isAdmin = auth.role === "admin";
    const data = {
      text: String(p.text||"").slice(0,500),
      x: Number(p.x)||0, y: Number(p.y)||0,
      font: p.font||"Cormorant Garamond",
      size: Math.max(8, Math.min(72, Number(p.size)||16)),
      color: p.color||"#3b2a14",
      pinned: !!p.pinned,
    };
    if (p.id) {
      // edit nota sedia ada
      const existing = readSheet_(SHEET_NOTES).find(n=>String(n.id)===String(p.id));
      if (!existing) throw new Error("Nota tidak dijumpai");
      const isOwner = existing.createdBy === auth.username;
      const wasPinned = existing.pinned===true||existing.pinned==="TRUE"||existing.pinned==="true";
      if (wasPinned && !isAdmin) throw new Error("Nota ini telah dipin oleh admin — tidak boleh diubah.");
      if (isAdmin) {
        applyNoteUpdate_(p.id, data, auth);
        markNotePending_(p.id, false);
        stampNoteApprove_(p.id, auth);
        return { ok:true };
      }
      if (!isOwner) throw new Error("Hanya pemilik atau admin yang boleh edit nota ini.");
      addPending_({ action:"note-edit", targetId:p.id, payload:{ ...data, id:p.id }, by:auth.username, summary:"Edit nota: "+data.text.slice(0,40) });
      markNotePending_(p.id, true);
      return { pending:true };
    }
    // nota baharu
    const id = Utilities.getUuid();
    appendNoteRow_({ id, ...data, pending: !isAdmin, createdBy: auth.username, createdAt: new Date(), lastEditBy: auth.username, lastEditAt: new Date(), approvedBy: isAdmin?auth.username:"", approvedAt: isAdmin?new Date():"" });
    if (!isAdmin) {
      addPending_({ action:"note-add", targetId:id, payload:{ id }, by:auth.username, summary:"Nota baharu: "+data.text.slice(0,40) });
      return { pending:true, id };
    }
    return { ok:true, id };
  },
  deleteNote(p, auth) {
    requireAuth_(auth);
    const isAdmin = auth.role === "admin";
    const existing = readSheet_(SHEET_NOTES).find(n=>String(n.id)===String(p.id));
    if (!existing) throw new Error("Nota tidak dijumpai");
    const wasPinned = existing.pinned===true||existing.pinned==="TRUE"||existing.pinned==="true";
    if (wasPinned && !isAdmin) throw new Error("Nota ini dipin oleh admin — tidak boleh dipadam.");
    if (isAdmin) {
      deleteRowById_(SHEET_NOTES, p.id);
      const pend = readSheet_(SHEET_PENDING).filter(x=>x.targetId===p.id);
      pend.forEach(x=>deleteRowById_(SHEET_PENDING, x.id));
      return { ok:true };
    }
    if (existing.createdBy !== auth.username) throw new Error("Hanya pemilik atau admin yang boleh padam nota ini.");
    addPending_({ action:"note-delete", targetId:p.id, payload:{ id:p.id }, by:auth.username, summary:"Padam nota: "+String(existing.text||"").slice(0,40) });
    markNotePending_(p.id, true);
    return { pending:true };
  },

  adminData(_, auth) {
    requireAdmin_(auth);
    const usersAll = readSheet_(SHEET_USERS);
    const userMap = {};
    usersAll.forEach(u=>{ userMap[u.username] = { fullname:u.fullname, phone:u.phone, email:u.email }; });
    const pending = readSheet_(SHEET_PENDING).map(p=>{
      const info = userMap[p.by] || {};
      return { ...p, byFullname: info.fullname||"", byPhone: info.phone||"", byEmail: info.email||"" };
    });
    return {
      isMaster: auth.username === MASTER_USER,
      pending,
      users: usersAll.map(u => ({
        no: u.no, username: u.username, fullname: u.fullname, phone: u.phone, email: u.email, role: u.role,
        fatherName: u.fatherName||"", motherName: u.motherName||"",
        banned: u.banned===true||u.banned==="TRUE"||u.banned==="true"||u.banned===1
      })),
    };
  },
  moderate(p, auth) {
    requireAdmin_(auth);
    const rows = readSheet_(SHEET_PENDING);
    const item = rows.find(r => r.id === p.id);
    if (!item) throw new Error("Item tidak dijumpai");
    if (p.decision === "approve") {
      const data = JSON.parse(item.payload);
      if (item.action === "edit") { applyNodeUpdate_(data, data.photoUrl, auth); markNodePending_(item.targetId,false); stampApprove_(item.targetId, auth); }
      else if (item.action === "spouse") { addSpouse_(item.targetId, data, data.photoUrl, auth); markNodePending_(item.targetId,false); stampApprove_(item.targetId, auth); }
      else if (item.action === "add") { markNodePending_(item.targetId, false); stampEdit_(item.targetId, auth); stampApprove_(item.targetId, auth); }
      else if (item.action === "delete") { deleteRowById_(SHEET_TREE, item.targetId); }
      else if (item.action === "note-add") { markNotePending_(item.targetId, false); stampNoteApprove_(item.targetId, auth); }
      else if (item.action === "note-edit") { applyNoteUpdate_(item.targetId, data, auth); markNotePending_(item.targetId, false); stampNoteApprove_(item.targetId, auth); }
      else if (item.action === "note-delete") { deleteRowById_(SHEET_NOTES, item.targetId); }
    } else {
      if (item.action === "add") { deleteRowById_(SHEET_TREE, item.targetId); }
      else if (item.action === "note-add") { deleteRowById_(SHEET_NOTES, item.targetId); }
      else {
        const others = rows.filter(r=>r.id!==item.id && r.targetId===item.targetId);
        if (others.length===0) {
          if (item.action.indexOf("note")===0) markNotePending_(item.targetId, false);
          else markNodePending_(item.targetId, false);
        }
      }
    }
    deleteRowById_(SHEET_PENDING, p.id);
    return { ok: true };
  },
  setRole(p, auth) {
    requireMaster_(auth);
    if (!p.username) throw new Error("Username diperlukan");
    if (p.username === MASTER_USER) throw new Error("Master tidak boleh diubah");
    const role = p.role === "admin" ? "admin" : "ahli";
    const u = findUserBy_("username", p.username);
    if (!u) throw new Error("Pengguna tidak dijumpai");
    updateUserField_(u.row, "role", role);
    return { ok:true, username:p.username, role };
  },
  setBan(p, auth) {
    requireAdmin_(auth);
    if (!p.username) throw new Error("Username diperlukan");
    if (p.username === MASTER_USER) throw new Error("Master tidak boleh disekat");
    const u = findUserBy_("username", p.username);
    if (!u) throw new Error("Pengguna tidak dijumpai");
    if (u.role === "admin" && auth.username !== MASTER_USER) throw new Error("Hanya Master Admin boleh menyekat admin lain");
    updateUserField_(u.row, "banned", !!p.banned);
    if (p.banned) updateUserField_(u.row, "token", "");
    return { ok:true };
  }
};

/* ============ SPOUSE LOGIC ============ */
function validateSpouseRule_(parentId, p){
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if(!n) throw new Error("Node tidak dijumpai");
  let spouses = [];
  if (n.spousesJson) { try { spouses = JSON.parse(n.spousesJson)||[]; } catch(e){} }
  else if (n.spouseName) spouses = [{name:n.spouseName, status:"hidup"}];
  if (spouses.length === 0) return;
  // Wanita: hanya boleh ada satu suami HIDUP semasa. Boleh tambah jika sebelumnya mati/cerai.
  if (String(n.gender).toUpperCase()==="P") {
    const adaHidup = spouses.some(s => s.status !== "mati" && s.status !== "cerai");
    if (adaHidup) throw new Error("Wanita hanya boleh ada satu suami pada satu masa. Tetapkan suami terdahulu sebagai 'Almarhum' atau 'Bercerai' dahulu.");
  }
  // Lelaki: bebas (poligami)
}
function addSpouse_(parentId, p, photoUrl, auth){
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if(!n) throw new Error("Node tidak dijumpai");
  let spouses = [];
  if (n.spousesJson) { try { spouses = JSON.parse(n.spousesJson)||[]; } catch(e){} }
  else if (n.spouseName) spouses = [{name:n.spouseName, photo:n.spousePhoto||"", status:"hidup", order:1, death:""}];
  const order = Number(p.spouseOrder)>0 ? Number(p.spouseOrder) : (spouses.length+1);
  spouses.push({
    name: p.name, photo: photoUrl || "",
    status: p.spouseStatus || "hidup",
    death: p.spouseDeath || "",
    order: order,
  });
  spouses.sort((a,b)=>(a.order||99)-(b.order||99));
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  sh.getRange(n._row, h.indexOf("spousesJson")+1).setValue(JSON.stringify(spouses));
  sh.getRange(n._row, h.indexOf("spouseName")+1).setValue(spouses.map(s=>s.name).join(" / "));
  stampEdit_(parentId, auth);
}

/* ============ HELPERS ============ */
function sheet_(n){return SpreadsheetApp.getActive().getSheetByName(n);}
function readSheet_(name) {
  const sh = sheet_(name);
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0];
  return v.slice(1).map((r,i) => { const o={_row:i+2}; h.forEach((k,j)=>o[k]=r[j]); return o; });
}
function findUserBy_(field, val) {
  const rows = readSheet_(SHEET_USERS);
  const u = rows.find(r => String(r[field]) === String(val));
  if (!u) return null;
  return { ...u, row: u._row };
}
function updateUserField_(row, field, value) {
  const sh = sheet_(SHEET_USERS);
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const col = h.indexOf(field)+1;
  if (col > 0) sh.getRange(row,col).setValue(value);
}
function appendUserRow_(data){
  const sh = sheet_(SHEET_USERS);
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = h.map(col => data[col] !== undefined ? data[col] : "");
  sh.appendRow(row);
}
function appendNodeRow_(sh, data){
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = h.map(col => {
    if (col === "createdAt") return data.createdAt || new Date();
    if (col === "pending")   return !!data.pending;
    return data[col] !== undefined ? data[col] : "";
  });
  sh.appendRow(row);
}
function appendNoteRow_(data){
  const sh = sheet_(SHEET_NOTES);
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = h.map(col => data[col] !== undefined ? data[col] : "");
  sh.appendRow(row);
}
function insertNode_(p, photoUrl, auth, pending) {
  const sh = sheet_(SHEET_TREE);
  const id = Utilities.getUuid();
  const no = sh.getLastRow();
  appendNodeRow_(sh, {
    id, parentId: p.parentId||"", no,
    name: p.name, nickname: p.nickname||"",
    gender: p.gender||"L", status: p.status||"hidup",
    birth: p.birth||"", death: p.death||"",
    birthplace: p.birthplace||"", deathplace: p.deathplace||"",
    spouseIndex: p.spouseIndex||"",
    photo: photoUrl||"", notes: p.notes||"",
    createdBy: auth.username,
    pending: !!pending,
    lastEditBy: auth.username,
    lastEditAt: new Date(),
  });
  return id;
}
function applyNodeUpdate_(p, photoUrl, auth) {
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r => String(r.id) === String(p.id));
  if (!n) throw new Error("Node tidak dijumpai (id=" + p.id + ")");
  const map = {
    name:p.name, nickname:p.nickname, gender:p.gender, status:p.status,
    birth:p.birth, death:p.death, birthplace:p.birthplace, deathplace:p.deathplace,
    notes:p.notes, spouseIndex:p.spouseIndex,
    lastEditBy: auth.username, lastEditAt: new Date(),
  };
  if (photoUrl) map.photo = photoUrl;
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  Object.keys(map).forEach(k=>{
    const c = h.indexOf(k)+1;
    if (c <= 0) return;
    if (map[k] === undefined) return;
    sh.getRange(n._row, c).setValue(map[k]);
  });
}
function applyNoteUpdate_(id, data, auth){
  const sh = sheet_(SHEET_NOTES);
  const rows = readSheet_(SHEET_NOTES);
  const n = rows.find(r=>String(r.id)===String(id));
  if (!n) return;
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const map = { text:data.text, x:data.x, y:data.y, font:data.font, size:data.size, color:data.color, pinned:!!data.pinned, lastEditBy:auth.username, lastEditAt:new Date() };
  Object.keys(map).forEach(k=>{
    const c = h.indexOf(k)+1;
    if (c>0 && map[k]!==undefined) sh.getRange(n._row,c).setValue(map[k]);
  });
}
function stampEdit_(id, auth){
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>String(r.id)===String(id)); if(!n) return;
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const cB = h.indexOf("lastEditBy")+1; if(cB>0) sh.getRange(n._row,cB).setValue(auth.username);
  const cA = h.indexOf("lastEditAt")+1; if(cA>0) sh.getRange(n._row,cA).setValue(new Date());
}
function stampApprove_(id, auth){
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>String(r.id)===String(id)); if(!n) return;
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const cB = h.indexOf("approvedBy")+1; if(cB>0) sh.getRange(n._row,cB).setValue(auth.username);
  const cA = h.indexOf("approvedAt")+1; if(cA>0) sh.getRange(n._row,cA).setValue(new Date());
}
function stampNoteApprove_(id, auth){
  const sh = sheet_(SHEET_NOTES);
  const rows = readSheet_(SHEET_NOTES);
  const n = rows.find(r=>String(r.id)===String(id)); if(!n) return;
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const cB = h.indexOf("approvedBy")+1; if(cB>0) sh.getRange(n._row,cB).setValue(auth.username);
  const cA = h.indexOf("approvedAt")+1; if(cA>0) sh.getRange(n._row,cA).setValue(new Date());
}
function markNodePending_(id, val) {
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===id); if(!n) return;
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  sh.getRange(n._row, h.indexOf("pending")+1).setValue(val);
}
function markNotePending_(id, val) {
  const sh = sheet_(SHEET_NOTES);
  const rows = readSheet_(SHEET_NOTES);
  const n = rows.find(r=>r.id===id); if(!n) return;
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  sh.getRange(n._row, h.indexOf("pending")+1).setValue(val);
}
function addPending_(o) {
  const sh = sheet_(SHEET_PENDING);
  const id = Utilities.getUuid();
  sh.appendRow([id, o.action, o.targetId, JSON.stringify(o.payload), o.by, o.summary, new Date()]);
}
function deleteRowById_(sheetName, id) {
  const sh = sheet_(sheetName);
  const rows = readSheet_(sheetName);
  const r = rows.find(x=>x.id===id);
  if (r) sh.deleteRow(r._row);
}
function saveImage_(file, baseName) {
  try {
    const folder = ensureFolder_();
    const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.type, baseName+"_"+file.name);
    const f = folder.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://lh3.googleusercontent.com/d/" + f.getId() + "=w400";
  } catch (e) { return ""; }
}
