/**
 * SALASILAH KELUARGA ELIT — Google Apps Script Backend
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

/* ============ INIT ============ */
function INITIALIZE_SYSTEM() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEET_USERS,   ["no","username","fullname","email","phone","passwordHash","photo","role","token","createdAt"]);
  ensureSheet_(ss, SHEET_TREE,    ["id","parentId","no","name","gender","status","birth","death","spouseName","spousePhoto","photo","notes","createdBy","createdAt","pending"]);
  ensureSheet_(ss, SHEET_PENDING, ["id","action","targetId","payload","by","summary","createdAt"]);
  ensureFolder_();
  // master admin row
  const users = ss.getSheetByName(SHEET_USERS);
  if (users.getLastRow() < 2) {
    users.appendRow([0, MASTER_USER, "Master Admin", "", "", hash_(MASTER_PASS), "", "admin", "", new Date()]);
  }
  return "OK";
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
}
function ensureFolder_() {
  const it = DriveApp.getFoldersByName(DRIVE_FOLDER);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(DRIVE_FOLDER);
}

/* ============ ENTRY ============ */
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const handler = ACTIONS[req.action];
    if (!handler) throw new Error("Unknown action: " + req.action);
    const auth = authenticate_(req.auth);
    const data = handler(req.payload || {}, auth);
    return out_({ ok: true, data });
  } catch (err) {
    return out_({ ok: false, error: err.message });
  }
}
function doGet(){return out_({ok:true,data:"Salasilah API live"});}
function out_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}

/* ============ AUTH ============ */
function authenticate_(auth) {
  if (!auth) return null;
  const u = findUserBy_("username", auth.username);
  if (u && u.token && u.token === auth.token) return u;
  return null;
}
function requireAuth_(a){if(!a)throw new Error("Sila log masuk");return a;}
function requireAdmin_(a){requireAuth_(a);if(a.role!=="admin")throw new Error("Hak admin diperlukan");return a;}

function hash_(s){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s+"|salasilah"));}
function genToken_(){return Utilities.getUuid().replace(/-/g,"");}

/* ============ ACTIONS ============ */
const ACTIONS = {
  register(p) {
    if (!p.username || !p.password) throw new Error("Maklumat tidak lengkap");
    if (findUserBy_("username", p.username)) throw new Error("Nama samaran sudah wujud");
    const sh = sheet_(SHEET_USERS);
    const no = sh.getLastRow(); // master=0 → next = lastRow
    const photoUrl = p.photo ? saveImage_(p.photo, "user_"+p.username) : "";
    sh.appendRow([no, p.username, p.fullname||"", p.email||"", p.phone||"", hash_(p.password), photoUrl, "ahli", "", new Date()]);
    return { no };
  },
  login(p) {
    if (p.username === MASTER_USER && p.password === MASTER_PASS) {
      const u = findUserBy_("username", MASTER_USER);
      const token = genToken_();
      updateUserField_(u.row, "token", token);
      return { username: MASTER_USER, role: "admin", no: 0, token };
    }
    const u = findUserBy_("username", p.username);
    if (!u || u.passwordHash !== hash_(p.password)) throw new Error("Nama samaran atau password salah");
    const token = genToken_();
    updateUserField_(u.row, "token", token);
    return { username: u.username, role: u.role, no: u.no, token, photo: u.photo };
  },
  getTree() {
    const rows = readSheet_(SHEET_TREE);
    return { nodes: rows.map(r => ({ ...r, pending: !!r.pending })) };
  },
  initRoot(p, auth) {
    requireAdmin_(auth);
    const sh = sheet_(SHEET_TREE);
    if (sh.getLastRow() > 1) throw new Error("Root sudah wujud");
    const id = Utilities.getUuid();
    sh.appendRow([id, "", 1, p.name, "L", "hidup", "", "", "", "", "", "", auth.username, new Date(), false]);
    return { id };
  },
  saveNode(p, auth) {
    requireAuth_(auth);
    const isAdmin = auth.role === "admin";
    const photoUrl = p.photo ? saveImage_(p.photo, "node_"+Date.now()) : null;
    if (p.id) {
      // UPDATE
      if (isAdmin) {
        applyNodeUpdate_(p, photoUrl, auth);
        return { ok: true };
      }
      addPending_({ action: "edit", targetId: p.id, payload: { ...p, photoUrl }, by: auth.username, summary: "Edit "+p.name });
      markNodePending_(p.id, true);
      return { pending: true };
    }
    // INSERT
    if (p.relation === "spouse" && p.parentId) {
      if (isAdmin) {
        updateNodeSpouse_(p.parentId, p.name, photoUrl);
        return { ok: true };
      }
      addPending_({ action: "spouse", targetId: p.parentId, payload: { ...p, photoUrl }, by: auth.username, summary: "Pasangan utk "+p.parentId });
      return { pending: true };
    }
    // child or root-less new
    if (isAdmin) {
      insertNode_(p, photoUrl, auth);
      return { ok: true };
    }
    addPending_({ action: "add", targetId: p.parentId||"", payload: { ...p, photoUrl }, by: auth.username, summary: "Tambah "+p.name });
    return { pending: true };
  },
  deleteNode(p, auth) {
    requireAdmin_(auth);
    deleteRowById_(SHEET_TREE, p.id);
    return { ok: true };
  },
  adminData(_, auth) {
    requireAdmin_(auth);
    return {
      pending: readSheet_(SHEET_PENDING),
      users: readSheet_(SHEET_USERS).map(u => ({ no: u.no, username: u.username, fullname: u.fullname, role: u.role })),
    };
  },
  moderate(p, auth) {
    requireAdmin_(auth);
    const sh = sheet_(SHEET_PENDING);
    const rows = readSheet_(SHEET_PENDING);
    const item = rows.find(r => r.id === p.id);
    if (!item) throw new Error("Item tidak dijumpai");
    if (p.decision === "approve") {
      const data = JSON.parse(item.payload);
      if (item.action === "edit") { applyNodeUpdate_(data, data.photoUrl, auth); markNodePending_(item.targetId,false); }
      else if (item.action === "spouse") { updateNodeSpouse_(item.targetId, data.name, data.photoUrl); }
      else if (item.action === "add") { insertNode_(data, data.photoUrl, auth); }
    }
    deleteRowById_(SHEET_PENDING, p.id);
    return { ok: true };
  }
};

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
  sh.getRange(row,col).setValue(value);
}
function insertNode_(p, photoUrl, auth) {
  const sh = sheet_(SHEET_TREE);
  const id = Utilities.getUuid();
  const no = sh.getLastRow();
  sh.appendRow([id, p.parentId||"", no, p.name, p.gender||"L", p.status||"hidup", p.birth||"", p.death||"", p.spouse||"", "", photoUrl||"", p.notes||"", auth.username, new Date(), false]);
}
function applyNodeUpdate_(p, photoUrl, auth) {
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===p.id);
  if (!n) throw new Error("Node tidak dijumpai");
  const map = { name:p.name, gender:p.gender, status:p.status, birth:p.birth, death:p.death, spouseName:p.spouse, notes:p.notes };
  if (photoUrl) map.photo = photoUrl;
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  Object.keys(map).forEach(k=>{const c=h.indexOf(k)+1;if(c>0&&map[k]!==undefined&&map[k]!=="")sh.getRange(n._row,c).setValue(map[k]);});
}
function updateNodeSpouse_(parentId, name, photoUrl) {
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if (!n) throw new Error("Node tidak dijumpai");
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  sh.getRange(n._row, h.indexOf("spouseName")+1).setValue(name);
  if (photoUrl) sh.getRange(n._row, h.indexOf("spousePhoto")+1).setValue(photoUrl);
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
    return "https://drive.google.com/uc?export=view&id=" + f.getId();
  } catch (e) { return ""; }
}
