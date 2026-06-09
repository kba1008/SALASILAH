/**
 * SALASILAH KELUARGA ELIT — Google Apps Script Backend v2.5
 * Deploy: Extensions → Apps Script → Deploy → New deployment → Web app
 *   Execute as: Me   |   Access: Anyone
 * Pertama kali: Jalankan INITIALIZE_SYSTEM() secara manual sekali.
 */

const SHEET_USERS   = "PENGGUNA";
const SHEET_TREE    = "SALASILAH";
const SHEET_PENDING = "PENDING";
const DRIVE_FOLDER  = "SalasilahImages";

const MASTER_USER = "admin";
const MASTER_PASS = "101010";

// Skema v2.5: tambah approvedBy, approvedAt pada TREE
const TREE_HEADERS = ["id","parentId","no","name","nickname","gender","status","birth","death","birthplace","deathplace","spousesJson","spouseName","spousePhoto","photo","notes","createdBy","createdAt","pending","lastEditBy","lastEditAt","approvedBy","approvedAt"];
// Skema v2.5: tambah fatherName, motherName, banned pada PENGGUNA
const USER_HEADERS = ["no","username","fullname","email","phone","passwordHash","photo","role","token","createdAt","fatherName","motherName","banned"];

/* ============ INIT ============ */
function INITIALIZE_SYSTEM() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEET_USERS,   USER_HEADERS);
  ensureSheet_(ss, SHEET_TREE,    TREE_HEADERS);
  ensureSheet_(ss, SHEET_PENDING, ["id","action","targetId","payload","by","summary","createdAt"]);
  migrateHeaders_(SHEET_TREE, TREE_HEADERS);
  migrateHeaders_(SHEET_USERS, USER_HEADERS);
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
function doGet(){ ensureInit_(); return out_({ok:true,data:"Salasilah API live v2.5"});}
function out_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}

function ensureInit_() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(SHEET_USERS) || !ss.getSheetByName(SHEET_TREE) || !ss.getSheetByName(SHEET_PENDING)) {
    INITIALIZE_SYSTEM();
    return;
  }
  migrateHeaders_(SHEET_TREE, TREE_HEADERS);
  migrateHeaders_(SHEET_USERS, USER_HEADERS);
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
    return { nodes: rows.map(r => {
      let spouses = [];
      if (r.spousesJson) { try { spouses = JSON.parse(r.spousesJson)||[]; } catch(e){} }
      else if (r.spouseName) spouses = [{name:r.spouseName, photo:r.spousePhoto||"", status:"hidup", death:""}];
      return { ...r, spouses, pending: !!r.pending };
    })};
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
      validateSpouseRule_(p.parentId);
      if (isAdmin) { addSpouse_(p.parentId, p, photoUrl, auth); stampApprove_(p.parentId, auth); return { ok: true }; }
      addPending_({ action: "spouse", targetId: p.parentId, payload: { ...p, photoUrl }, by: auth.username, summary: "Pasangan: "+(p.name||"") });
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
    } else {
      if (item.action === "add") { deleteRowById_(SHEET_TREE, item.targetId); }
      else if (item.action === "edit" || item.action === "spouse" || item.action === "delete") {
        const others = rows.filter(r=>r.id!==item.id && r.targetId===item.targetId);
        if (others.length===0) markNodePending_(item.targetId, false);
      }
    }
    deleteRowById_(SHEET_PENDING, p.id);
    return { ok: true };
  },
  // === Master sahaja: lantik admin ===
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
  // === Admin: ban / unban pengguna ===
  setBan(p, auth) {
    requireAdmin_(auth);
    if (!p.username) throw new Error("Username diperlukan");
    if (p.username === MASTER_USER) throw new Error("Master tidak boleh disekat");
    const u = findUserBy_("username", p.username);
    if (!u) throw new Error("Pengguna tidak dijumpai");
    // Admin biasa tidak boleh ban admin lain — hanya master
    if (u.role === "admin" && auth.username !== MASTER_USER) throw new Error("Hanya Master Admin boleh menyekat admin lain");
    updateUserField_(u.row, "banned", !!p.banned);
    if (p.banned) updateUserField_(u.row, "token", ""); // paksa keluar
    return { ok:true };
  }
};

/* ============ SPOUSE LOGIC ============ */
function validateSpouseRule_(parentId){
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if(!n) throw new Error("Node tidak dijumpai");
  let spouses = [];
  if (n.spousesJson) { try { spouses = JSON.parse(n.spousesJson)||[]; } catch(e){} }
  else if (n.spouseName) spouses = [{name:n.spouseName, status:"hidup"}];
  if (spouses.length === 0) return;
  if (String(n.gender).toUpperCase()==="L") return;
  const allDead = spouses.every(s => s.status === "mati");
  if (!allDead) throw new Error("Wanita hanya boleh ada satu suami pada satu masa. Tetapkan status suami terdahulu sebagai 'Almarhum' dahulu.");
}
function addSpouse_(parentId, p, photoUrl, auth){
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if(!n) throw new Error("Node tidak dijumpai");
  let spouses = [];
  if (n.spousesJson) { try { spouses = JSON.parse(n.spousesJson)||[]; } catch(e){} }
  else if (n.spouseName) spouses = [{name:n.spouseName, photo:n.spousePhoto||"", status:"hidup", death:""}];
  spouses.push({
    name: p.name, photo: photoUrl || "",
    status: p.spouseStatus || "hidup",
    death: p.spouseDeath || "",
  });
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
    notes:p.notes, lastEditBy: auth.username, lastEditAt: new Date(),
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
function markNodePending_(id, val) {
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
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
