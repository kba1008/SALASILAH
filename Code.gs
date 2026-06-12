// ===== SALASILAH Code.gs — VERSI v2.22 — dijana 12 Jun 2026 =====
/**
 * SALASILAH KELUARGA ELIT — Apps Script Backend v2.13 spouse-repair
 * Deploy: Extensions → Apps Script → Deploy → New deployment → Web app
 * Execute as: Me   |   Access: Anyone
 */

const SHEET_USERS   = "PENGGUNA";
const SHEET_TREE    = "SALASILAH";
const SHEET_PENDING = "PENDING";
const SHEET_NOTES   = "NOTA";
const GOOGLE_SHEET_ID = "1wqIc6971U96VXqOJ55pD-wzxQicC4RT4TBNoUrUVtig";
const DRIVE_FOLDER_ID = "1tb1YIWlxbHkN-HzdAXtFlMWp136JXxN4";
const DRIVE_FOLDER  = "SalasilahImages";

const MASTER_USER = "admin";
const MASTER_PASS = "101010";

const TREE_HEADERS = ["id","parentId","no","name","nickname","gender","status","birth","death","birthplace","deathplace","spousesJson","spouseName","spousePhoto","spouseIndex","spouseOf","spouseOrder","id_pasangan","photo","notes","hanging","createdBy","createdAt","pending","lastEditBy","lastEditAt","approvedBy","approvedAt","posX","posY"];
const USER_HEADERS = ["no","username","fullname","email","phone","passwordHash","photo","role","token","createdAt","fatherName","motherName","banned","approved","approvedBy","approvedAt"];
const NOTE_HEADERS = ["id","text","x","y","font","size","color","pinned","pending","createdBy","createdAt","lastEditBy","lastEditAt","approvedBy","approvedAt"];

/* ============ INIT ============ */
function INITIALIZE_SYSTEM() {
  const ss = ss_();
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
    appendUserRow_({ no:0, username:MASTER_USER, fullname:"Master Admin", passwordHash:hash_(MASTER_PASS), role:"admin", createdAt:new Date(), approved:true, approvedBy:"SYSTEM", approvedAt:new Date() });
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
  try {
    return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  } catch (e) {
    const it = DriveApp.getFoldersByName(DRIVE_FOLDER);
    if (it.hasNext()) return it.next();
    return DriveApp.createFolder(DRIVE_FOLDER);
  }
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
    if (req.action && req.action !== "getTree" && req.action !== "myProfile" && req.action !== "ping" && req.action !== "login") {
      invalidateTreeCache_();
    }
    return out_({ ok: true, data });
  } catch (err) {
    return out_({ ok: false, error: err.message + (err.stack ? "\n"+err.stack : "") });
  }
}
function doGet(){ ensureInit_(); return out_({ok:true,data:"Salasilah API live v2.22 id-pasangan"});}
function out_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}

const _INIT_VERSION = "v2.22-id-pasangan";
function ensureInit_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("INIT_OK") === _INIT_VERSION) return;
  const ss = ss_();
  if (!ss.getSheetByName(SHEET_USERS) || !ss.getSheetByName(SHEET_TREE) || !ss.getSheetByName(SHEET_PENDING) || !ss.getSheetByName(SHEET_NOTES)) {
    INITIALIZE_SYSTEM();
  } else {
    migrateHeaders_(SHEET_TREE, TREE_HEADERS);
    migrateHeaders_(SHEET_USERS, USER_HEADERS);
    migrateHeaders_(SHEET_NOTES, NOTE_HEADERS);
  }
  const u = findUserBy_("username", MASTER_USER);
  if (!u) {
    appendUserRow_({ no:0, username:MASTER_USER, fullname:"Master Admin", passwordHash:hash_(MASTER_PASS), role:"admin", createdAt:new Date(), approved:true, approvedBy:"SYSTEM", approvedAt:new Date() });
  }
  props.setProperty("INIT_OK", _INIT_VERSION);
}

const _TREE_CACHE_KEY = "tree:v3";
const _TREE_CACHE_TTL = 30;
function _treeCacheGet_(authed){
  try {
    const c = CacheService.getScriptCache();
    const v = c.get(_TREE_CACHE_KEY + ":" + (authed?"a":"g"));
    return v ? JSON.parse(v) : null;
  } catch(_) { return null; }
}
function _treeCachePut_(authed, data){
  try {
    const s = JSON.stringify(data);
    if (s.length < 95000) CacheService.getScriptCache().put(_TREE_CACHE_KEY + ":" + (authed?"a":"g"), s, _TREE_CACHE_TTL);
  } catch(_) {}
}
function invalidateTreeCache_(){
  try {
    const c = CacheService.getScriptCache();
    c.remove(_TREE_CACHE_KEY + ":a");
    c.remove(_TREE_CACHE_KEY + ":g");
  } catch(_) {}
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
function requireVerifiedUser_(a){
  requireAuth_(a);
  if (a.role === "admin") return a;
  if (!isUserApproved_(a)) throw new Error("Akaun anda masih menunggu pengesahan admin. Sila tunggu admin hubungi anda terlebih dahulu.");
  return a;
}

function hash_(s){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s+"|salasilah"));}
function genToken_(){return Utilities.getUuid().replace(/-/g,"");}
function getOrCreateUserToken_(username){
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(e) {}
  try {
    const fresh = findUserBy_("username", username);
    if (!fresh) throw new Error("Pengguna tidak dijumpai semasa menjana sesi");
    const existing = fresh.token ? String(fresh.token) : "";
    if (existing) return existing;
    const token = genToken_();
    updateUserField_(fresh.row, "token", token);
    SpreadsheetApp.flush();
    return token;
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

/* ============ ACTIONS ============ */
const ACTIONS = {
  register(p) {
    if (!p.username || !p.password) throw new Error("Maklumat tidak lengkap");
    if (!p.phone) throw new Error("No. telefon (WhatsApp) wajib diisi");
    if (!p.fatherName) throw new Error("Nama penuh BAPA wajib diisi untuk rujukan admin");
    if (!p.motherName) throw new Error("Nama penuh IBU wajib diisi untuk rujukan admin");
    if (!p.photo || !p.photo.data) throw new Error("Gambar profil yang sah adalah wajib untuk pendaftaran");
    if (String(p.username).toLowerCase() === MASTER_USER) throw new Error("Nama samaran ini dilindungi");
    if (findUserBy_("username", p.username)) throw new Error("Nama samaran sudah wujud");
    const photoUrl = p.photo ? saveImage_(p.photo, "user_"+p.username) : "";
    appendUserRow_({
      no:"", username:p.username, fullname:p.fullname||"", email:p.email||"", phone:p.phone||"",
      passwordHash:hash_(p.password), photo:photoUrl, role:"ahli", token:"", createdAt:new Date(),
      fatherName:p.fatherName||"", motherName:p.motherName||"", banned:false,
      approved:false, approvedBy:"", approvedAt:""
    });
    return { pending:true };
  },
  login(p) {
    if (!p || !p.username || !p.password) throw new Error("Sila isi nama samaran dan password");
    if (String(p.username).toLowerCase() === MASTER_USER && String(p.password) === MASTER_PASS) {
      let u = findUserBy_("username", MASTER_USER);
      if (!u) {
        appendUserRow_({ no:0, username:MASTER_USER, fullname:"Master Admin", passwordHash:hash_(MASTER_PASS), role:"admin", createdAt:new Date(), approved:true, approvedBy:"SYSTEM", approvedAt:new Date() });
        u = findUserBy_("username", MASTER_USER);
      }
      const token = getOrCreateUserToken_(MASTER_USER);
      return { username: MASTER_USER, fullname:"Master Admin", role: "admin", no: 0, token, isMaster:true, approved:true };
    }
    const u = findUserBy_("username", p.username);
    if (!u || u.passwordHash !== hash_(p.password)) throw new Error("Nama samaran atau password salah");
    if (u.banned === true || u.banned === "TRUE" || u.banned === "true" || u.banned === 1) throw new Error("Akaun anda telah disekat oleh admin. Hubungi Master Admin.");
    const token = getOrCreateUserToken_(u.username);
    return {
      username: u.username, fullname: u.fullname || "", role: u.role || "ahli",
      no: isUserApproved_(u) ? u.no : "", token, photo: u.photo, phone: u.phone || "",
      email: u.email || "", fatherName: u.fatherName || "", motherName: u.motherName || "",
      approved: isUserApproved_(u), approvedBy: u.approvedBy || "", approvedAt: u.approvedAt || "", isMaster:false
    };
  },
  myProfile(_, auth) {
    const me = requireAuth_(auth);
    const u = findUserBy_("username", me.username);
    if (!u) throw new Error("Profil pengguna tidak dijumpai");
    return normalizeUserClient_(u);
  },
  ping() { return { ok:true, t: Date.now(), version: _INIT_VERSION }; },
  getTree(_, auth) {
    const _cached = _treeCacheGet_(!!auth);
    if (_cached) return _cached;
    const nodeRows = repairSpouseLinks_(readSheet_(SHEET_TREE));
    const noteRows = readSheet_(SHEET_NOTES);
    const pendingRows = readSheet_(SHEET_PENDING).map(p=>({ ...p, payloadObj: parseJsonSafe_(p.payload, {}) }));
    const canSeePending = !!auth;
    const pendingNodeAdds = new Set(pendingRows.filter(p=>p.action === "add").map(p=>String(p.targetId||"")));
    const pendingNoteAdds = new Set(pendingRows.filter(p=>p.action === "note-add").map(p=>String(p.targetId||"")));
    const nodePendingMap = {};
    const notePendingMap = {};
    pendingRows.forEach(it=>{
      const key = String(it.targetId || "");
      if (!key) return;
      const bucket = String(it.action||"").indexOf("note") === 0 ? notePendingMap : nodePendingMap;
      (bucket[key] = bucket[key] || []).push(it);
    });

    const allNodes = nodeRows.map(normalizeNodeClient_);
    const spouseGroups = {};
    allNodes.forEach(n=>{
      if (!n.spouseOf) return;
      const ownerId = String(n.spouseOf || "");
      if (!ownerId) return;
      (spouseGroups[ownerId] = spouseGroups[ownerId] || []).push(n);
    });
    let nodes = allNodes
      .filter(n=>!n.spouseOf)
      .map(n=>({ ...n, spouses: mergeSpouseLists_(n.spouses || [], spouseGroups[String(n.id)] || [], n) }));
    let notes = noteRows.map(normalizeNoteClient_);

    if (canSeePending) {
      nodes = nodes.map(n=>applyPendingPreviewToNode_(n, nodePendingMap[String(n.id)] || []));
      notes = notes.map(n=>applyPendingPreviewToNote_(n, notePendingMap[String(n.id)] || []));
    } else {
      nodes = nodes
        .filter(n=>!pendingNodeAdds.has(String(n.id)))
        .map(n=>({ ...n, pending:false, pendingDelete:false, pendingItems:[] }));
      notes = notes
        .filter(n=>!pendingNoteAdds.has(String(n.id)))
        .map(n=>({ ...n, pending:false, pendingDelete:false, pendingItems:[] }));
    }
    nodes = normalizeMissingParentNodes_(nodes);

    const users = readSheet_(SHEET_USERS).map(u=>({
      username: u.username, fullname: u.fullname||"", role: u.role||"ahli",
      fatherName: u.fatherName||"", motherName: u.motherName||"", photo: u.photo||"",
      no: isUserApproved_(u) ? (u.no||"") : "", approved: isUserApproved_(u),
    }));

    const _out = { nodes, notes, users, apiVersion: _INIT_VERSION };
    _treeCachePut_(!!auth, _out);
    return _out;
  },
  initRoot(p, auth) {
    requireAdmin_(auth);
    const sh = sheet_(SHEET_TREE);
    const existingRoots = readSheet_(SHEET_TREE).filter(r=>!r.parentId);
    const isHanging = !!p.hanging;
    if (existingRoots.length > 0 && !isHanging) throw new Error("Root utama sudah wujud. Gunakan 'Cipta Root Tergantung' untuk root tambahan.");
    const id = Utilities.getUuid();
    appendNodeRow_(sh, {id, parentId:"", no:existingRoots.length+1, name:p.name, gender:p.gender||"L", status:"hidup", hanging:isHanging, createdBy:auth.username, lastEditBy:auth.username, lastEditAt:new Date(), approvedBy:auth.username, approvedAt:new Date()});
    return { id };
  },
  reparent(p, auth) {
    requireAdmin_(auth);
    if (!p.id) throw new Error("Node id diperlukan");
    if (p.id === p.newParentId) throw new Error("Tidak boleh jadikan diri sendiri sebagai parent");
    if (p.newParentId) {
      const rows = readSheet_(SHEET_TREE);
      let cur = rows.find(r=>r.id===p.newParentId);
      const visited = {};
      while (cur && cur.parentId) {
        if (visited[cur.id]) break;
        visited[cur.id] = 1;
        if (cur.parentId === p.id) throw new Error("Tidak boleh — akan membentuk kitaran salasilah");
        cur = rows.find(r=>r.id===cur.parentId);
      }
    }
    const sh = sheet_(SHEET_TREE);
    const rows = readSheet_(SHEET_TREE);
    const n = rows.find(r=>r.id===p.id);
    if (!n) throw new Error("Node tidak dijumpai");
    const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    sh.getRange(n._row, h.indexOf("parentId")+1).setValue(p.newParentId||"");
    const cH = h.indexOf("hanging")+1;
    if (cH>0) sh.getRange(n._row, cH).setValue(p.newParentId ? false : !!p.hanging);
    stampEdit_(p.id, auth);
    stampApprove_(p.id, auth);
    return { ok:true };
  },
  saveNode(p, auth) {
    requireVerifiedUser_(auth);
    const isAdmin = auth.role === "admin";
    const photoUrl = p.photo ? saveImage_(p.photo, "node_"+Date.now()) : null;

    if (p.relation === "spouse" && !p.parentId) throw new Error("Pasangan mesti dikaitkan dengan profil induk. Sila cuba semula dari butang 'Tambah Pasangan'.");
    if (p.relation === "spouse" && p.parentId) {
      const spousePayload = normalizeSpousePayload_(p, photoUrl);
      if (isAdmin) { addSpouse_(p.parentId, spousePayload, spousePayload.photoUrl, auth); stampApprove_(p.parentId, auth); return { ok: true }; }
      addPending_({ action: "spouse", targetId: p.parentId, payload: spousePayload, by: auth.username, summary: "Pasangan ke-"+(spousePayload.spouseOrder||"?")+": "+(spousePayload.name||"") });
      markNodePending_(p.parentId, true);
      return { pending: true };
    }

    if (p.id && !p.isNew) {
      if (isAdmin) { applyNodeUpdate_(p, photoUrl, auth); stampApprove_(p.id, auth); return { ok: true }; }
      addPending_({ action: "edit", targetId: p.id, payload: { ...p, photoUrl }, by: auth.username, summary: "Edit "+(p.name||"") });
      markNodePending_(p.id, true);
      return { pending: true };
    }

    const newId = p.id || Utilities.getUuid();
    insertNode_({...p, id: newId}, photoUrl, auth, !isAdmin);
    if (!isAdmin) {
      addPending_({ action: "add", targetId: newId, payload: { id:newId, parentId:p.parentId||"" }, by: auth.username, summary: "Tambah ahli: "+(p.name||"") });
      return { pending: true, id: newId };
    }
    stampApprove_(newId, auth);
    return { ok: true, id: newId };
  },
  deleteNode(p, auth) {
    requireVerifiedUser_(auth);
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
  saveNote(p, auth) {
    requireVerifiedUser_(auth);
    const isAdmin = auth.role === "admin";
    const data = {
      text: String(p.text||"").slice(0,500), x: Number(p.x)||0, y: Number(p.y)||0,
      font: p.font||"Cormorant Garamond", size: Math.max(8, Math.min(72, Number(p.size)||16)),
      color: p.color||"#3b2a14", pinned: !!p.pinned,
    };
    if (p.id && !p.isNew) {
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
    const id = p.id || Utilities.getUuid();
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
  editSpouse(p, auth) {
    requireVerifiedUser_(auth);
    const isAdmin = auth.role === "admin";
    if (!p.parentId || !p.order) throw new Error("Maklumat tidak lengkap");
    const photoUrl = p.photo ? saveImage_(p.photo, "spouse_"+Date.now()) : null;
    if (isAdmin) {
      applySpouseEdit_(p.parentId, Number(p.order), {
        name: p.name, nickname: p.nickname||"", gender: p.gender||"",
        status: p.status, birth: p.birth||"", death: p.death||"",
        birthplace: p.birthplace||"", deathplace: p.deathplace||"", notes: p.notes||"",
        newOrder: Number(p.newOrder)||Number(p.order),
        photo: photoUrl,
      }, auth);
      stampApprove_(p.parentId, auth);
      return { ok:true };
    }
    addPending_({ action:"spouse-edit", targetId:p.parentId, payload:{ ...p, photoUrl }, by:auth.username, summary:"Edit pasangan ke-"+p.order+": "+(p.name||"") });
    markNodePending_(p.parentId, true);
    return { pending:true };
  },
  deleteSpouse(p, auth) {
    requireVerifiedUser_(auth);
    const isAdmin = auth.role === "admin";
    if (!p.parentId || !p.order) throw new Error("Maklumat tidak lengkap");
    if (isAdmin) {
      applySpouseDelete_(p.parentId, Number(p.order), auth);
      return { ok:true };
    }
    addPending_({ action:"spouse-delete", targetId:p.parentId, payload:{ parentId:p.parentId, order:p.order }, by:auth.username, summary:"Padam pasangan ke-"+p.order });
    markNodePending_(p.parentId, true);
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
        fatherName: u.fatherName||"", motherName: u.motherName||"", photo: u.photo||"",
        approved: isUserApproved_(u), approvedBy: u.approvedBy||"", approvedAt: u.approvedAt||"",
        banned: u.banned===true||u.banned==="TRUE"||u.banned==="true"||u.banned===1
      })),
    };
  },
  setUserApproval(p, auth) {
    requireAdmin_(auth);
    if (!p.username) throw new Error("Username diperlukan");
    if (p.username === MASTER_USER) throw new Error("Master Admin sentiasa sah");
    const u = findUserBy_("username", p.username);
    if (!u) throw new Error("Pengguna tidak dijumpai");
    const approved = !!p.approved;
    if (approved && !u.photo) throw new Error("Pengguna wajib memuat naik gambar profil yang sah sebelum boleh disahkan");
    updateUserField_(u.row, "approved", approved);
    updateUserField_(u.row, "approvedBy", approved ? auth.username : "");
    updateUserField_(u.row, "approvedAt", approved ? new Date() : "");
    if (approved && !u.no) updateUserField_(u.row, "no", nextMemberNo_());
    if (!approved) updateUserField_(u.row, "no", "");
    invalidateTreeCache_();
    return { ok:true };
  },
  moderate(p, auth) {
    requireAdmin_(auth);
    resolvePendingById_(p.id, p.decision, auth);
    return { ok: true };
  },
  moderateTarget(p, auth) {
    requireAdmin_(auth);
    if (!p.targetId) throw new Error("Target diperlukan");
    const isNote = String(p.targetType||"").toLowerCase() === "note";
    const rows = readSheet_(SHEET_PENDING)
      .filter(r => String(r.targetId) === String(p.targetId))
      .filter(r => isNote ? String(r.action||"").indexOf("note") === 0 : String(r.action||"").indexOf("note") !== 0)
      .sort((a,b)=>(a._row||0)-(b._row||0));
    if (!rows.length) return { ok:true, count:0, empty:true };
    rows.forEach(r=>resolvePendingById_(r.id, p.decision || "approve", auth));
    return { ok:true, count: rows.length };
  },
  savePosition(p, auth) {
    requireVerifiedUser_(auth);
    if (!p || !p.id) throw new Error("Node id diperlukan");
    const sh = sheet_(SHEET_TREE);
    const rows = readSheet_(SHEET_TREE);
    const n = rows.find(r=>r.id===p.id);
    if (!n) throw new Error("Node tidak dijumpai");
    const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    const cx = h.indexOf("posX")+1, cy = h.indexOf("posY")+1;
    if (cx>0) sh.getRange(n._row, cx).setValue(p.posX===""||p.posX==null?"":Number(p.posX));
    if (cy>0) sh.getRange(n._row, cy).setValue(p.posY===""||p.posY==null?"":Number(p.posY));
    stampEdit_(p.id, auth);
    if (auth.role === "admin") stampApprove_(p.id, auth);
    return { ok:true };
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

function toBool_(v){
  return v === true || v === "TRUE" || v === "true" || v === 1;
}
function parseJsonSafe_(text, fallback){
  try { return text ? JSON.parse(text) : fallback; }
  catch (e) { return fallback; }
}
function isUserApproved_(u){
  if (!u) return false;
  if (u.username === MASTER_USER) return true;
  if (u.role === "admin") return true;
  if (toBool_(u.approved)) return true;
  if (u.no !== "" && u.no !== null && u.no !== undefined && !isNaN(Number(u.no)) && Number(u.no) > 0) return true;
  return false;
}
function normalizeUserClient_(u){
  return {
    username: u.username,
    fullname: u.fullname || "",
    email: u.email || "",
    phone: u.phone || "",
    photo: u.photo || "",
    role: u.role || "ahli",
    no: isUserApproved_(u) ? (u.no || "") : "",
    fatherName: u.fatherName || "",
    motherName: u.motherName || "",
    approved: isUserApproved_(u),
    approvedBy: u.approvedBy || "",
    approvedAt: u.approvedAt || "",
    banned: toBool_(u.banned),
  };
}
function normalizeNodeClient_(r){
  let spouses = [];
  if (r.spousesJson) spouses = parseJsonSafe_(r.spousesJson, []) || [];
  else if (r.spouseName) spouses = [{name:r.spouseName, photo:r.spousePhoto||"", status:"hidup", order:1, death:""}];
  spouses = (Array.isArray(spouses) ? spouses : []).map((s,i)=>({
    ...s,
    id: s.id || ("legacy-" + String(r.id || "node") + "-" + (i+1)),
    order: s.order || i+1,
    gender: s.gender || oppositeGender_(r.gender),
  }));
  return {
    ...r,
    spouses,
    pending: toBool_(r.pending),
    hanging: toBool_(r.hanging),
    posX: (r.posX===""||r.posX==null) ? null : Number(r.posX),
    posY: (r.posY===""||r.posY==null) ? null : Number(r.posY),
    pendingDelete: false,
    pendingItems: [],
  };
}
function normalizeMissingParentNodes_(nodes){
  const ids = {};
  (nodes || []).forEach(function(n){ if (!n.spouseOf && n.id) ids[String(n.id)] = true; });
  const roots = (nodes || []).filter(function(n){ return !n.spouseOf && !n.parentId; });
  const mainRoot = roots.filter(function(r){ return !toBool_(r.hanging); })[0] || roots[0] || null;
  return (nodes || []).map(function(n){
    if (n.spouseOf) return n;
    if (n.parentId && !ids[String(n.parentId)]) {
      return { ...n, parentId:"", hanging:true, missingParentResolved:true };
    }
    if (!n.parentId && mainRoot && String(n.id) !== String(mainRoot.id) && !toBool_(n.hanging)) {
      return { ...n, hanging:true, extraRootResolved:true };
    }
    return n;
  });
}
function normalizeNoteClient_(n){
  return {
    ...n,
    x: Number(n.x)||0,
    y: Number(n.y)||0,
    size: Number(n.size)||16,
    pinned: toBool_(n.pinned),
    pending: toBool_(n.pending),
    pendingDelete: false,
    pendingItems: [],
  };
}
function safePendingItem_(item){
  return {
    id: item.id,
    action: item.action,
    by: item.by,
    summary: item.summary,
    createdAt: item.createdAt,
  };
}
function applyPendingPreviewToNode_(node, items){
  if (!items.length) return { ...node, pending: toBool_(node.pending), pendingDelete:false, pendingItems:[] };
  const out = { ...node, spouses: (node.spouses||[]).map(s=>({ ...s })) };
  const sorted = items.slice().sort((a,b)=>new Date(a.createdAt||0).getTime()-new Date(b.createdAt||0).getTime());
  sorted.forEach(item=>{
    const p = item.payloadObj || {};
    if (item.action === "edit") {
      ["name","nickname","gender","status","birth","death","birthplace","deathplace","notes","spouseIndex"].forEach(k=>{
        if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k];
      });
      if (p.photoUrl) out.photo = p.photoUrl;
    } else if (item.action === "spouse") {
      let order = Number(p.spouseOrder) > 0 ? Number(p.spouseOrder) : (out.spouses.length + 1);
      const taken = {};
      out.spouses.forEach(s=>{ if (s.order) taken[Number(s.order)] = true; });
      while (taken[order]) order++;
      out.spouses.push({
        id: p.id || Utilities.getUuid(),
        name: p.name || "",
        nickname: p.nickname || "",
        gender: p.gender || oppositeGender_(node.gender),
        birth: p.birth || "",
        birthplace: p.birthplace || "",
        photo: p.photoUrl || "",
        status: p.spouseStatus || "hidup",
        death: p.spouseDeath || "",
        deathplace: p.deathplace || "",
        notes: p.notes || "",
        order: order,
      });
      out.spouses.sort((a,b)=>(a.order||99)-(b.order||99));
    } else if (item.action === "spouse-edit") {
      const idx = out.spouses.findIndex(s=>Number(s.order||0) === Number(p.order||0));
      if (idx >= 0) {
        ["name","nickname","gender","status","birth","death","birthplace","deathplace","notes"].forEach(k=>{
          if (Object.prototype.hasOwnProperty.call(p, k)) out.spouses[idx][k] = p[k];
        });
        if (p.photoUrl) out.spouses[idx].photo = p.photoUrl;
        if (Number(p.newOrder) > 0 && Number(p.newOrder) !== Number(p.order)) {
          const taken = {};
          out.spouses.forEach((s,i)=>{ if (i !== idx && s.order) taken[Number(s.order)] = true; });
          let nextOrder = Number(p.newOrder);
          while (taken[nextOrder]) nextOrder++;
          out.spouses[idx].order = nextOrder;
        }
        out.spouses.sort((a,b)=>(a.order||99)-(b.order||99));
      }
    } else if (item.action === "spouse-delete") {
      out.spouses = out.spouses.filter(s=>Number(s.order||0) !== Number(p.order||0));
    } else if (item.action === "delete") {
      out.pendingDelete = true;
    }
  });
  out.pending = true;
  out.pendingItems = sorted.map(safePendingItem_);
  return out;
}
function applyPendingPreviewToNote_(note, items){
  if (!items.length) return { ...note, pending: toBool_(note.pending), pendingDelete:false, pendingItems:[] };
  const out = { ...note };
  const sorted = items.slice().sort((a,b)=>new Date(a.createdAt||0).getTime()-new Date(b.createdAt||0).getTime());
  sorted.forEach(item=>{
    const p = item.payloadObj || {};
    if (item.action === "note-edit") {
      ["text","x","y","font","size","color"].forEach(k=>{
        if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k];
      });
      if (Object.prototype.hasOwnProperty.call(p, "pinned")) out.pinned = !!p.pinned;
    } else if (item.action === "note-delete") {
      out.pendingDelete = true;
    }
  });
  out.pending = true;
  out.pendingItems = sorted.map(safePendingItem_);
  return out;
}
function mergeSpouseLists_(legacySpouses, spouseRows, owner){
  const list = [];
  const seen = {};
  (Array.isArray(spouseRows) ? spouseRows : []).forEach((r,i)=>{
    const id = String(r.id || "");
    if (id) seen[id] = true;
    list.push({
      id: r.id || Utilities.getUuid(),
      id_pasangan: r.id_pasangan || "",
      name: r.name || "",
      nickname: r.nickname || "",
      gender: r.gender || oppositeGender_(owner.gender),
      birth: r.birth || "",
      birthplace: r.birthplace || "",
      photo: r.photo || r.spousePhoto || "",
      status: r.status || "hidup",
      death: r.death || "",
      deathplace: r.deathplace || "",
      notes: r.notes || "",
      order: Number(r.spouseOrder) > 0 ? Number(r.spouseOrder) : (Number(r.order) > 0 ? Number(r.order) : i + 1),
    });
  });
  (Array.isArray(legacySpouses) ? legacySpouses : []).forEach((s,i)=>{
    const id = String(s.id || "legacy-" + String(owner.id || "node") + "-" + (i+1));
    if (seen[id]) return;
    list.push({
      ...s,
      id,
      order: Number(s.order) > 0 ? Number(s.order) : i + 1,
      gender: s.gender || oppositeGender_(owner.gender),
    });
  });
  list.sort((a,b)=>(a.order||99)-(b.order||99));
  return list;
}
function resolvePendingById_(pendingId, decision, auth) {
  const rows = readSheet_(SHEET_PENDING);
  const item = rows.find(r => r.id === pendingId);
  if (!item) throw new Error("Item tidak dijumpai");
  const data = parseJsonSafe_(item.payload, {});
  if (decision === "approve") {
    if (item.action === "edit") { applyNodeUpdate_(data, data.photoUrl, auth); markNodePending_(item.targetId,false); stampApprove_(item.targetId, auth); }
    else if (item.action === "spouse") { addSpouse_(item.targetId, data, data.photoUrl, auth); markNodePending_(item.targetId,false); stampApprove_(item.targetId, auth); }
    else if (item.action === "spouse-edit") { applySpouseEdit_(item.targetId, Number(data.order), { name:data.name, nickname:data.nickname||"", gender:data.gender||"", status:data.status, birth:data.birth||"", death:data.death||"", birthplace:data.birthplace||"", deathplace:data.deathplace||"", notes:data.notes||"", newOrder:Number(data.newOrder)||Number(data.order), photo:data.photoUrl }, auth); markNodePending_(item.targetId,false); stampApprove_(item.targetId, auth); }
    else if (item.action === "spouse-delete") { applySpouseDelete_(item.targetId, Number(data.order), auth); markNodePending_(item.targetId,false); stampApprove_(item.targetId, auth); }
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
        if (String(item.action||"").indexOf("note")===0) markNotePending_(item.targetId, false);
        else markNodePending_(item.targetId, false);
      }
    }
  }
  deleteRowById_(SHEET_PENDING, item.id);
}

/* ============ v2.22: ID KHAS PASANGAN (id_pasangan) ============
   Setiap pasangan diberi ID khas berformat: PSG::<id suami/isteri induk>::<turutan>::<uuid pendek>
   ID ini disimpan dalam kolum "id_pasangan" di Google Sheet dan menjadi SUMBER KEBENARAN
   paling kuat — walaupun spouseOf/parentId rosak, pemilik pasangan masih boleh dipulihkan. */
function makeIdPasangan_(ownerId, order){
  return "PSG::" + String(ownerId) + "::" + String(order || 1) + "::" + Utilities.getUuid().slice(0, 8);
}
function parseIdPasanganOwner_(v){
  const s = String(v || "");
  if (s.indexOf("PSG::") !== 0) return "";
  const parts = s.split("::");
  return parts.length >= 2 ? String(parts[1] || "") : "";
}
function parseIdPasanganOrder_(v){
  const s = String(v || "");
  if (s.indexOf("PSG::") !== 0) return 0;
  const parts = s.split("::");
  return parts.length >= 3 ? (Number(parts[2]) || 0) : 0;
}

/* ============ AUTO-REPAIR: pasangan yang hilang spouseOf ============ */
function repairSpouseLinks_(rows){
  try {
    const byId = {};
    rows.forEach(function(r){ byId[String(r.id)] = r; });
    const hasChildren = {};
    rows.forEach(function(r){ if (r.parentId) hasChildren[String(r.parentId)] = true; });
    const fixes = [];
    // v2.22 PASS #1 (paling kuat): id_pasangan menentukan pemilik pasangan secara mutlak
    rows.forEach(function(r){
      const owner = parseIdPasanganOwner_(r.id_pasangan);
      if (!owner || !byId[owner]) return;
      if (String(r.spouseOf || "") === owner && !r.parentId) return; // sudah betul
      for (var i = 0; i < fixes.length; i++) { if (String(fixes[i].row.id) === String(r.id)) return; }
      fixes.push({ row: r, ownerId: owner, fixedOrder: parseIdPasanganOrder_(r.id_pasangan) });
    });
    rows.forEach(function(child){
      const spIdx = String(child.spouseIndex || "");
      if (!spIdx || !child.parentId) return;
      const cand = byId[spIdx];
      if (!cand) return;                                   // rujukan legacy/JSON — abaikan
      if (String(cand.spouseOf || "")) return;             // sudah betul
      if (String(cand.id) === String(child.parentId)) return;
      if (cand.parentId) return;                           // ada parent sendiri — bukan pasangan
      if (hasChildren[String(cand.id)]) return;            // ada anak sendiri — jangan sentuh
      for (var i = 0; i < fixes.length; i++) { if (String(fixes[i].row.id) === String(cand.id)) return; }
      fixes.push({ row: cand, ownerId: String(child.parentId) });
    });
    // Baiki juga baris pasangan yang tersimpan dengan parentId DAN spouseOf serentak
    rows.forEach(function(r){
      if (!r.spouseOf || !r.parentId) return;
      for (var i = 0; i < fixes.length; i++) { if (String(fixes[i].row.id) === String(r.id)) return; }
      fixes.push({ row: r, ownerId: String(r.spouseOf) });
    });
    // v2.22 BACKFILL: baris pasangan lama tanpa id_pasangan → jana & tulis ke Sheet
    const backfills = rows.filter(function(r){ return r.spouseOf && !String(r.id_pasangan || ""); })
      .filter(function(r){
        for (var i = 0; i < fixes.length; i++) { if (String(fixes[i].row.id) === String(r.id)) return false; }
        return true;
      });
    if (!fixes.length && !backfills.length) return rows;
    const sh = sheet_(SHEET_TREE);
    fixes.forEach(function(f){
      const order = f.fixedOrder > 0 ? f.fixedOrder : nextFreeSpouseOrder_(rows, f.ownerId, 1, f.row.id);
      const idPsg = String(f.row.id_pasangan || "").indexOf("PSG::") === 0 ? String(f.row.id_pasangan) : makeIdPasangan_(f.ownerId, order);
      setCellByHeader_(sh, f.row._row, "spouseOf", f.ownerId);
      setCellByHeader_(sh, f.row._row, "spouseOrder", order);
      setCellByHeader_(sh, f.row._row, "id_pasangan", idPsg);
      setCellByHeader_(sh, f.row._row, "parentId", "");
      setCellByHeader_(sh, f.row._row, "hanging", false);
      f.row.spouseOf = f.ownerId;
      f.row.spouseOrder = order;
      f.row.id_pasangan = idPsg;
      f.row.parentId = "";
      f.row.hanging = false;
    });
    backfills.forEach(function(r){
      const order = Number(r.spouseOrder) > 0 ? Number(r.spouseOrder) : nextFreeSpouseOrder_(rows, String(r.spouseOf), 1, r.id);
      const idPsg = makeIdPasangan_(String(r.spouseOf), order);
      setCellByHeader_(sh, r._row, "id_pasangan", idPsg);
      r.id_pasangan = idPsg;
    });
    invalidateTreeCache_();
  } catch (e) { /* jangan halang paparan jika repair gagal */ }
  return rows;
}

/* ============ SPOUSE LOGIC ============ */
function validateSpouseRule_(parentId, p){
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if(!n) throw new Error("Node tidak dijumpai");
  let spouses = [];
  if (n.spousesJson) { try { spouses = JSON.parse(n.spousesJson)||[]; } catch(e){} }
  else if (n.spouseName) spouses = [{name:n.spouseName, status:"hidup"}];
  if (spouses.length === 0) return;
  if (String(n.gender).toUpperCase()==="P") {
    const adaHidup = spouses.some(s => s.status !== "mati" && s.status !== "cerai");
    if (adaHidup) throw new Error("Wanita hanya boleh ada satu suami pada satu masa. Tetapkan suami terdahulu sebagai 'Almarhum' atau 'Bercerai' dahulu.");
  }
}
function oppositeGender_(gender){
  const g = String(gender || "").toUpperCase();
  if (g === "L") return "P";
  if (g === "P") return "L";
  return "";
}
function normalizeSpousePayload_(p, photoUrl){
  return {
    id: p.id || "",
    parentId: p.parentId || "",
    relation: "spouse",
    name: String(p.name || "").trim(),
    nickname: p.nickname || "",
    gender: p.gender || "",
    birth: p.birth || "",
    birthplace: p.birthplace || "",
    deathplace: p.deathplace || "",
    notes: p.notes || "",
    spouseOrder: Number(p.spouseOrder) > 0 ? Number(p.spouseOrder) : "",
    spouseStatus: p.spouseStatus || p.status || "hidup",
    spouseDeath: p.spouseDeath || p.death || "",
    photoUrl: photoUrl || p.photoUrl || "",
    id_pasangan: p.id_pasangan || "",
  };
}
function addSpouse_(parentId, p, photoUrl, auth){
  p = normalizeSpousePayload_(p || {}, photoUrl);
  if (!p.name) throw new Error("Nama pasangan wajib diisi");
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if(!n) throw new Error("Node tidak dijumpai");
  let spouses = _loadSpouses_(n, rows);
  let order = Number(p.spouseOrder)>0 ? Number(p.spouseOrder) : (spouses.length+1);
  const taken = {}; spouses.forEach(s=>{ if(s.order) taken[Number(s.order)] = true; });
  while (taken[order]) order++;
  const id = p.id || Utilities.getUuid();
  // v2.22: jana ID khas pasangan — kekal terikat pada pemiliknya walau apa pun berlaku
  const idPasangan = String(p.id_pasangan || "").indexOf("PSG::") === 0 ? String(p.id_pasangan) : makeIdPasangan_(parentId, order);
  appendNodeRow_(sh, {
    id,
    parentId: "",
    no: sh.getLastRow(),
    name: p.name,
    nickname: p.nickname || "",
    gender: p.gender || oppositeGender_(n.gender),
    status: p.spouseStatus || "hidup",
    birth: p.birth || "",
    death: p.spouseDeath || "",
    birthplace: p.birthplace || "",
    deathplace: p.deathplace || "",
    spouseOf: parentId,
    spouseOrder: order,
    id_pasangan: idPasangan,
    photo: p.photoUrl || photoUrl || "",
    notes: p.notes || "",
    createdBy: auth.username,
    pending: false,
    lastEditBy: auth.username,
    lastEditAt: new Date(),
    approvedBy: auth.username,
    approvedAt: new Date(),
  });
  setCellByHeader_(sh, n._row, "spouseName", "");
  setCellByHeader_(sh, n._row, "spousePhoto", "");
  stampEdit_(parentId, auth);
}
function _loadSpouses_(n, rows){
  let spouses = [];
  if (n.spousesJson) { try { spouses = JSON.parse(n.spousesJson)||[]; } catch(e){} }
  else if (n.spouseName) spouses = [{name:n.spouseName, photo:n.spousePhoto||"", status:"hidup", order:1, death:""}];
  if (!Array.isArray(spouses)) spouses = spouses ? [spouses] : [];
  const legacy = spouses.map((s,i)=>({
    ...s,
    id: s.id || ("legacy-" + String(n.id || "node") + "-" + (i+1)),
    order: s.order || i+1,
    gender: s.gender || oppositeGender_(n.gender),
  }));
  const spouseRows = (rows || readSheet_(SHEET_TREE)).filter(r=>String(r.spouseOf||"")===String(n.id||""));
  return mergeSpouseLists_(legacy, spouseRows.map(normalizeNodeClient_), normalizeNodeClient_(n));
}
function _saveSpouses_(sh, n, spouses, auth){
  spouses = (Array.isArray(spouses) ? spouses : []).map((s,i)=>({
    ...s,
    id: s.id || ("legacy-" + String(n.id || "node") + "-" + (i+1)),
    order: s.order || i+1,
    gender: s.gender || oppositeGender_(n.gender),
  }));
  spouses.sort((a,b)=>(a.order||99)-(b.order||99));
  setCellByHeader_(sh, n._row, "spousesJson", JSON.stringify(spouses));
  setCellByHeader_(sh, n._row, "spouseName", "");
  stampEdit_(n.id, auth);
}
function applySpouseEdit_(parentId, order, data, auth){
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if(!n) throw new Error("Node tidak dijumpai");
  const row = rows.find(r=>String(r.spouseOf||"")===String(parentId) && Number(r.spouseOrder||0)===Number(order));
  if(row){
    const newOrder = nextFreeSpouseOrder_(rows, parentId, Number(data.newOrder)||Number(order), row.id);
    const map = {
      name:data.name || row.name, nickname:data.nickname !== undefined ? data.nickname : (row.nickname || ""),
      gender:data.gender || row.gender || oppositeGender_(n.gender), status:data.status || row.status || "hidup",
      birth:data.birth !== undefined ? data.birth : (row.birth || ""), death:data.death || "",
      birthplace:data.birthplace !== undefined ? data.birthplace : (row.birthplace || ""),
      deathplace:data.deathplace !== undefined ? data.deathplace : (row.deathplace || ""),
      notes:data.notes !== undefined ? data.notes : (row.notes || ""), spouseOrder:newOrder,
      lastEditBy:auth.username, lastEditAt:new Date(), approvedBy:auth.username, approvedAt:new Date(),
    };
    if(data.photo) map.photo = data.photo;
    Object.keys(map).forEach(k=>setCellByHeader_(sh, row._row, k, map[k]));
    stampEdit_(parentId, auth);
    return;
  }
  const spouses = _loadSpouses_(n, rows);
  const legacy = spouses.find(s=>Number(s.order||0)===Number(order));
  if(!legacy) throw new Error("Pasangan tidak dijumpai");
  addSpouse_(parentId, { ...legacy, ...data, spouseOrder:Number(data.newOrder)||Number(order), spouseStatus:data.status||legacy.status, spouseDeath:data.death||legacy.death, photoUrl:data.photo||legacy.photo }, data.photo||legacy.photo, auth);
}
function applySpouseDelete_(parentId, order, auth){
  const sh = sheet_(SHEET_TREE);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>r.id===parentId);
  if(!n) throw new Error("Node tidak dijumpai");
  const row = rows.find(r=>String(r.spouseOf||"")===String(parentId) && Number(r.spouseOrder||0)===Number(order));
  if(row){
    deleteRowById_(SHEET_TREE, row.id);
    stampEdit_(parentId, auth);
    return;
  }
  let spouses = _loadSpouses_(n, rows).filter(s=>Number(s.order||0)!==Number(order));
  _saveSpouses_(sh, n, spouses, auth);
}
function nextFreeSpouseOrder_(rows, parentId, wanted, ignoreId){
  let order = Number(wanted) > 0 ? Number(wanted) : 1;
  const taken = {};
  (rows || []).forEach(r=>{
    if (String(r.spouseOf||"") !== String(parentId)) return;
    if (ignoreId && String(r.id||"") === String(ignoreId)) return;
    if (Number(r.spouseOrder) > 0) taken[Number(r.spouseOrder)] = true;
  });
  while (taken[order]) order++;
  return order;
}

/* ============ HELPERS ============ */
function ss_(){ return SpreadsheetApp.openById(GOOGLE_SHEET_ID); }
function sheet_(n){return ss_().getSheetByName(n);}
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
  const col = ensureFieldExists_(sh, field);
  sh.getRange(row,col).setValue(value);
}
function nextMemberNo_() {
  const rows = readSheet_(SHEET_USERS);
  let maxNo = 0;
  rows.forEach(r=>{
    const n = Number(r.no);
    if (!isNaN(n) && n > maxNo) maxNo = n;
  });
  return maxNo + 1;
}
function expectedHeadersForSheet_(sheetName){
  if (sheetName === SHEET_TREE) return TREE_HEADERS;
  if (sheetName === SHEET_USERS) return USER_HEADERS;
  if (sheetName === SHEET_NOTES) return NOTE_HEADERS;
  if (sheetName === SHEET_PENDING) return ["id","action","targetId","payload","by","summary","createdAt"];
  return [];
}
function ensureFieldExists_(sh, field){
  const expected = expectedHeadersForSheet_(sh.getName());
  if (expected.length) migrateHeaders_(sh.getName(), expected);
  let headers = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0];
  let col = headers.indexOf(field) + 1;
  if (col > 0) return col;
  sh.insertColumnAfter(Math.max(1, sh.getLastColumn()));
  col = sh.getLastColumn();
  sh.getRange(1, col).setValue(field);
  headers = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0];
  col = headers.indexOf(field) + 1;
  if (col < 1) throw new Error("Gagal mewujudkan kolum '" + field + "' pada sheet '" + sh.getName() + "'.");
  return col;
}
function setCellByHeader_(sh, row, field, value) {
  const col = ensureFieldExists_(sh, field);
  sh.getRange(row, col).setValue(value);
}
function appendUserRow_(data){
  const sh = sheet_(SHEET_USERS);
  migrateHeaders_(SHEET_USERS, USER_HEADERS);
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = h.map(col => data[col] !== undefined ? data[col] : "");
  sh.appendRow(row);
}
function appendNodeRow_(sh, data){
  migrateHeaders_(SHEET_TREE, TREE_HEADERS);
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
  migrateHeaders_(SHEET_NOTES, NOTE_HEADERS);
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = h.map(col => data[col] !== undefined ? data[col] : "");
  sh.appendRow(row);
}
function insertNode_(p, photoUrl, auth, pending) {
  const sh = sheet_(SHEET_TREE);
  const id = p.id || Utilities.getUuid();
  const no = sh.getLastRow();
  // BELT & BRACES: jika payload sebenarnya pasangan, jangan sekali-kali simpan sebagai anak
  const isSpouseRow = !!p.spouseOf || p.relation === "spouse";
  appendNodeRow_(sh, {
    id, parentId: isSpouseRow ? "" : (p.parentId||""), no,
    name: p.name, nickname: p.nickname||"",
    gender: p.gender||"L", status: p.status||"hidup",
    birth: p.birth||"", death: p.death||"",
    birthplace: p.birthplace||"", deathplace: p.deathplace||"",
    spouseOf: isSpouseRow ? String(p.spouseOf || p.parentId || "") : "",
    spouseOrder: isSpouseRow ? (Number(p.spouseOrder)||1) : "",
    id_pasangan: isSpouseRow ? (String(p.id_pasangan || "").indexOf("PSG::") === 0 ? String(p.id_pasangan) : makeIdPasangan_(String(p.spouseOf || p.parentId || ""), Number(p.spouseOrder)||1)) : "",
    spouseIndex: p.spouseIndex||"",
    photo: photoUrl||"", notes: p.notes||"",
    hanging: !isSpouseRow && !p.parentId ? !!p.hanging : false,
    posX: (p.posX != null && p.posX !== "") ? Number(p.posX) : "",
    posY: (p.posY != null && p.posY !== "") ? Number(p.posY) : "",
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
  migrateHeaders_(SHEET_TREE, TREE_HEADERS);
  const rows = readSheet_(SHEET_TREE);
  const n = rows.find(r=>String(r.id)===String(id)); if(!n) return;
  setCellByHeader_(sh, n._row, "pending", !!val);
}
function markNotePending_(id, val) {
  const sh = sheet_(SHEET_NOTES);
  migrateHeaders_(SHEET_NOTES, NOTE_HEADERS);
  const rows = readSheet_(SHEET_NOTES);
  const n = rows.find(r=>String(r.id)===String(id)); if(!n) return;
  setCellByHeader_(sh, n._row, "pending", !!val);
}
function addPending_(o) {
  const sh = sheet_(SHEET_PENDING);
  migrateHeaders_(SHEET_PENDING, expectedHeadersForSheet_(SHEET_PENDING));
  const id = Utilities.getUuid();
  const data = {id, action:o.action, targetId:o.targetId, payload:JSON.stringify(o.payload||{}), by:o.by, summary:o.summary, createdAt:new Date()};
  const h = sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0];
  sh.appendRow(h.map(col => data[col] !== undefined ? data[col] : ""));
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
