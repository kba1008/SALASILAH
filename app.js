// ===== SALASILAH app.js — VERSI v2.20 — dijana 12 Jun 2026 =====
/* Salasilah Keluarga Elit — app.js v2.20 couple-BIND + layout-FREEZE + orphan-safe */

const EXPECTED_API_VERSION = "v2.18-layout-lock";
const GAS_URL = "https://script.google.com/macros/s/AKfycbzwo3C2N_LMMaBz6vQnOufD7QxCD0ncxBCV_uHDg1UYKpL8TRpipIpqhwF3CLCuAlq8/exec";
try { fetch(GAS_URL, {method:"GET", mode:"no-cors"}).catch(()=>{}); } catch(_) {}
const LOADING_TIPS = [
  "Menyusun cabang keluarga dan hubungan setiap generasi…",
  "Menjejak pasangan, anak dan sambungan salasilah…",
  "Menyemak data ahli yang telah disahkan admin…",
  "Menyediakan paparan salasilah yang kemas untuk anda…"
];

const State = {
  user: JSON.parse(localStorage.getItem("user") || "null"),
  myProfile: null,
  nodes: [],
  notes: [],
  users: [],
  panzoom: null,
  searchResults: [],
  searchIndex: 0,
  noteAddMode: false,
  reparentMode: null,
  loadingTimer: null,
  loadingTipIndex: 0,
  lastLayoutSnapshot: null,
};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

/* UUID GENERATOR FOR OPTIMISTIC DRAFTS */
function makeUUID(){
  if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 3000);
}
function setLoading(show, text="Memuatkan salasilah…"){
  const screen = $("#loading-screen");
  const label = $("#loading-text");
  const phase = $("#loading-phase");
  const dots = $("#loading-dots");
  if(label) label.textContent = text;
  if(phase) phase.textContent = LOADING_TIPS[State.loadingTipIndex % LOADING_TIPS.length];
  if(!screen) return;
  screen.classList.toggle("hidden-screen", !show);
  if(show){
    if(dots) dots.textContent = "";
    if(State.loadingTimer) clearInterval(State.loadingTimer);
    State.loadingTimer = setInterval(()=>{
      State.loadingTipIndex = (State.loadingTipIndex + 1) % LOADING_TIPS.length;
      if(phase) phase.textContent = LOADING_TIPS[State.loadingTipIndex];
      if(dots) dots.textContent = ".".repeat((dots.textContent.length % 3) + 1);
    }, 1200);
  } else if(State.loadingTimer){
    clearInterval(State.loadingTimer);
    State.loadingTimer = null;
  }
}

function getStoredUser(){ try { return JSON.parse(localStorage.getItem("user") || "null"); } catch(_) { return null; } }
function persistUser(user){ State.user = user || null; if(user) localStorage.setItem("user", JSON.stringify(user)); else localStorage.removeItem("user"); }
function clearSession(silent=false){ State.user = null; State.myProfile = null; localStorage.removeItem("user"); try { updateUserUI(); } catch(_){} if(!silent) toast("Sesi tamat. Sila log masuk semula."); }
function syncUserFromStorage(){ const stored = getStoredUser(); if(!stored) return null; if(!State.user || State.user.username !== stored.username || State.user.token !== stored.token){ State.user = stored; } return State.user; }
function getAuthPayload(){ const current = (State.user?.token ? State.user : syncUserFromStorage()) || null; if(!current?.username || !current?.token) return null; return { username: current.username, token: current.token }; }
function hasActiveSession(){ return !!getAuthPayload(); }
function ensureSession(actionLabel="meneruskan tindakan ini"){
  if(hasActiveSession()) return true;
  clearSession(true);
  showWarn(`Sesi log masuk anda sudah tiada. Sila log masuk semula sebelum ${actionLabel}.`,{title:"Sesi Diperlukan"});
  openModal("modal-auth");
  return false;
}

/* ---------- Error Notifier ---------- */
const ErrUI = {
  stack: null,
  ensure(){ if(!this.stack) this.stack = document.getElementById("err-stack"); return this.stack; },
  show({title="Ralat", message="", level="error", context=""}={}){
    const host = this.ensure(); if(!host) { alert(title+"\n"+message); return; }
    const card = document.createElement("div");
    card.className = "err-card "+(level==="warn"?"warn":level==="info"?"info":"");
    const ts = new Date().toLocaleString("ms-MY");
    const fullText = `[${ts}] ${title}${context?" ("+context+")":""}\n${message}`;
    card.innerHTML = `
      <div class="err-head">
        <div class="err-title">${level==="error"?"⚠ ":(level==="warn"?"⚡ ":"ℹ ")}${escapeHtmlSafe(title)}</div>
        <div class="err-actions">
          <button class="err-btn" data-act="copy">📋 Salin</button>
          <button class="err-btn" data-act="close" title="Tutup">✕</button>
        </div>
      </div>
      <div class="err-msg"></div>
      ${context?`<div class="text-[10px] mt-1 opacity-70">${escapeHtmlSafe(context)} • ${ts}</div>`:`<div class="text-[10px] mt-1 opacity-70">${ts}</div>`}
    `;
    card.querySelector(".err-msg").textContent = message || "(tiada butiran)";
    card.querySelector('[data-act="close"]').onclick = ()=>card.remove();
    card.querySelector('[data-act="copy"]').onclick = async ()=>{
      try { await navigator.clipboard.writeText(fullText); }
      catch { 
        const r=document.createRange(); r.selectNodeContents(card.querySelector(".err-msg")); 
        const s=getSelection(); s.removeAllRanges(); s.addRange(r); 
        document.execCommand("copy"); s.removeAllRanges(); 
      }
      const b = card.querySelector('[data-act="copy"]'); const old=b.textContent; b.textContent="✓ Disalin"; setTimeout(()=>b.textContent=old,1500);
    };
    host.appendChild(card);
    if(level!=="error"){ setTimeout(()=>card.remove(), 6000); }
    return card;
  },
  clearAll(){ const h=this.ensure(); if(h) h.innerHTML=""; }
};
function escapeHtmlSafe(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
function showError(message, opts={}){ let msg = message; if(message instanceof Error) msg = (message.message||"") + (message.stack?"\n\n"+message.stack:""); return ErrUI.show({title:opts.title||"Ralat", message:String(msg||""), level:opts.level||"error", context:opts.context||""}); }
function showWarn(m,o={}){return ErrUI.show({title:o.title||"Amaran",message:String(m||""),level:"warn",context:o.context||""});}
function showInfo(m,o={}){return ErrUI.show({title:o.title||"Maklumat",message:String(m||""),level:"info",context:o.context||""});}
window.addEventListener("error", e=>{ showError(e.error||e.message||"Unknown error",{title:"Ralat JavaScript",context:(e.filename||"")+":"+(e.lineno||"")+":"+(e.colno||"")}); });
window.addEventListener("unhandledrejection", e=>{ showError(e.reason||"Promise ditolak tanpa pengendalian",{title:"Promise Tidak Dikendalikan"}); });
window.showError = showError; window.showWarn = showWarn; window.showInfo = showInfo;

function openModal(id){$("#"+id).classList.remove("hidden");$("#"+id).classList.add("flex");}
function closeModal(id){$("#"+id).classList.add("hidden");$("#"+id).classList.remove("flex");}
window.closeModal = closeModal;

/* ---------- API ---------- */
/* PEMETAAN ID: jika pelayan lama menjana ID berbeza utk ahli baru,
   semua operasi seterusnya dalam baris gilir akan dipetakan ke ID sebenar. */
const IdMap = {};
function mapId(v){ return (v && IdMap[v]) ? IdMap[v] : v; }
function remapPayloadIds(p){
  if(!p || typeof p !== "object") return p;
  ["id","parentId","spouseOf","spouseIndex","newParentId"].forEach(k=>{
    if(p[k]) p[k] = mapId(p[k]);
  });
  return p;
}
function registerIdMap(oldId, newId){
  if(!oldId || !newId || String(oldId)===String(newId)) return;
  IdMap[oldId] = newId;
  (State.nodes||[]).forEach(n=>{
    if(String(n.id)===String(oldId)) n.id = newId;
    if(String(n.parentId||"")===String(oldId)) n.parentId = newId;
    if(String(n.spouseOf||"")===String(oldId)) n.spouseOf = newId;
    if(String(n.spouseIndex||"")===String(oldId)) n.spouseIndex = newId;
  });
  if(State.lastLayoutSnapshot){
    if(State.lastLayoutSnapshot.positions?.[oldId] && !State.lastLayoutSnapshot.positions[newId]){
      State.lastLayoutSnapshot.positions[newId] = State.lastLayoutSnapshot.positions[oldId];
    }
    if(State.lastLayoutSnapshot.absolute?.[oldId] && !State.lastLayoutSnapshot.absolute[newId]){
      State.lastLayoutSnapshot.absolute[newId] = State.lastLayoutSnapshot.absolute[oldId];
    }
  }
}

async function api(action, payload={}){
  const auth = getAuthPayload();
  remapPayloadIds(payload);
  const sentId = payload && payload.id;
  const body = JSON.stringify({action, payload, auth});
  let res, raw="";
  try {
    res = await fetch(GAS_URL, {method:"POST", body, headers:{"Content-Type":"text/plain;charset=utf-8"}, cache:"no-store"});
    raw = await res.text();
  } catch(netErr) {
    const e = new Error("Gangguan rangkaian: "+(netErr.message||netErr));
    e.action = action; throw e;
  }
  let json;
  try { json = JSON.parse(raw); }
  catch { const e=new Error("Respons bukan JSON dari pelayan:\n"+raw.slice(0,400)); e.action=action; throw e; }
  if(!json.ok){
    const e=new Error(json.error||"API error"); e.action=action;
    if(/disekat|Sesi tamat/i.test(json.error||"")){
      clearSession(true);
      if(/Sesi tamat/i.test(json.error||"")) showWarn("Sesi anda telah tamat. Sila log masuk semula untuk meneruskan.",{title:"Sesi Tamat",context:action});
    }
    throw e;
  }
  if(action === "saveNode" && payload && payload.isNew && json.data && json.data.id && sentId && String(json.data.id) !== String(sentId)){
    registerIdMap(sentId, json.data.id);
  }
  return json.data;
}

/* AMARAN VERSI PELAYAN: jika Code.gs di Apps Script belum di-deploy semula */
function checkApiVersion(serverVersion){
  let bar = document.getElementById("api-version-warn");
  if(serverVersion === EXPECTED_API_VERSION){ if(bar) bar.remove(); return; }
  if(!bar){
    bar = document.createElement("div");
    bar.id = "api-version-warn";
    bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fef2f2;padding:10px 14px;font-size:13px;font-weight:600;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.4)";
    document.body.appendChild(bar);
  }
  bar.innerHTML = "⚠ Pelayan versi <b>" + (serverVersion || "LAMA / tidak diketahui") +
    "</b> (dijangka <b>" + EXPECTED_API_VERSION + "</b>). " +
    "Sila buka Apps Script &gt; <b>Deploy &gt; New deployment</b> untuk deploy semula versi terbaru Code.gs, " +
    "kemudian kemaskini pembolehubah <code>GAS_URL</code> dalam app.js dengan URL /exec baru jika berubah.";
}

/* ---------- Optimistic save helper ---------- */
let __refreshQueued = false;
function scheduleRefresh(){
  if(__refreshQueued) return;
  __refreshQueued = true;
  setTimeout(async ()=>{
    __refreshQueued = false;
    try{ await refresh(); }catch(_){}
  }, 250);
}
function runInBackground(promise, opts={}){
  const {title="Gagal simpan", context="api", onError} = opts;
  Promise.resolve(promise)
    .then(()=>{ scheduleRefresh(); })
    .catch(err=>{
      if(onError) try{ onError(err); }catch(_){}
      showError(err,{title, context: err?.action||context});
    });
}

/* ---------- Refresh dengan pemulihan kedudukan & viewport ---------- */
async function refreshAndRestoreLayout(layoutSnapshot, panSnapshot, scaleSnapshot){
  const posSnapshot = layoutSnapshot?.positions || layoutSnapshot || {};
  const absSnapshot = layoutSnapshot?.absolute || _captureAbsolutePositions(posSnapshot);
  State.lastLayoutSnapshot = { positions: {...posSnapshot}, absolute: {...absSnapshot} };

  setLoading(true, "Sila tunggu sementara maklumat keluarga dipaparkan.");
  try {
    const d = await api("getTree",{});
    State.nodes = d.nodes||[];
    State.notes = d.notes||[];
    State.users = d.users||[];
    checkApiVersion(d.apiVersion || "");
    if(State.user) await loadMyProfile(true);

    // Jaminan: jika pelayan tiada data posisi, gunakan snapshot sebagai sandaran
    if(posSnapshot && Object.keys(posSnapshot).length){
      State.nodes.forEach(n=>{
        const snap = posSnapshot[String(n.id)];
        if(snap && (n.posX == null || isNaN(Number(n.posX)))){
          n.posX = snap.posX;
          n.posY = snap.posY;
        }
      });
    }

    normalizeMissingParentsForStableLayout(State.nodes);
    buildTree();

    // Betulkan hanyutan susun atur: kira semula translate supaya posisi visual kekal
    if(absSnapshot && Object.keys(absSnapshot).length){
      _compensateLayoutDrift(absSnapshot);
    }

    // Pulihkan viewport tepat seperti sebelum simpan
    if(State.panzoom && panSnapshot && scaleSnapshot != null){
      State.panzoom.zoom(scaleSnapshot, {animate:false});
      setTimeout(()=>{ State.panzoom.pan(panSnapshot.x, panSnapshot.y, {animate:false}); }, 30);
    } else {
      setTimeout(centerOnTree, 60);
    }
    if(State.user?.role==="admin") refreshPendingBadge();
  } catch(e) {
    showError(e,{title:"Gagal memuat salasilah",context:"getTree"});
    const host=$("#tree-root");
    if(host) host.innerHTML='<p class="text-center mt-32 serif text-lg" style="color:var(--ink-soft)">Gagal memuat data. Sila lihat notifikasi ralat di atas.</p>';
  } finally {
    setLoading(false);
  }
}

function captureLayoutSnapshot(){
  const positions = {};
  (State.nodes||[]).forEach(n=>{
    if(n.spouseOf || !n.id) return;
    const hasPos = n.posX != null && n.posY != null && !isNaN(Number(n.posX)) && !isNaN(Number(n.posY));
    positions[String(n.id)] = {
      posX: hasPos ? Number(n.posX) : 0,
      posY: hasPos ? Number(n.posY) : 0,
      persist: true, /* v2.20 layout-freeze: kunci SEMUA node yang sedang dipaparkan supaya susun atur draf TIDAK berubah selepas simpan */
    };
  });
  State.lastLayoutSnapshot = { positions, absolute: _captureAbsolutePositions(positions) };
  return State.lastLayoutSnapshot;
}

// Tangkap posisi visual mutlak (koordinat kanvas) bagi semua node berposisi
// Dilakukan SEBELUM rebuild supaya tidak ada gangguan visual
function _captureAbsolutePositions(posSnapshot){
  if(!posSnapshot || !Object.keys(posSnapshot).length) return {};
  const canvas = $("#canvas");
  if(!canvas) return {};
  const canvasRect = canvas.getBoundingClientRect();
  const scale = (State.panzoom && State.panzoom.getScale) ? State.panzoom.getScale() : 1;
  const ids = Object.keys(posSnapshot);
  const elMap = {};
  const result = {};

  // Kumpul semua elemen terlebih dahulu
  ids.forEach(id => {
    const el = document.querySelector(`.node[data-node-id="${CSS.escape(id)}"]`);
    if(el) elMap[id] = posTargetEl(el); /* v2.20 */
  });

  // Tulis: buang semua transform sekaligus (tiada flicker kerana satu microtask)
  ids.forEach(id => { if(elMap[id]) elMap[id].style.transform = "none"; });

  // Baca: ukur posisi semula jadi tanpa transform (satu reflow)
  ids.forEach(id => {
    const el = elMap[id];
    if(!el) return;
    const rect = el.getBoundingClientRect();
    const natX = (rect.left - canvasRect.left) / scale;
    const natY = (rect.top  - canvasRect.top)  / scale;
    // Posisi visual mutlak = posisi semula jadi + nilai translate
    result[id] = {
      absX: natX + posSnapshot[id].posX,
      absY: natY + posSnapshot[id].posY,
      persist: posSnapshot[id].persist !== false,
    };
  });

  // Tulis: pulihkan semua transform
  ids.forEach(id => {
    if(elMap[id])
      elMap[id].style.transform = `translate(${posSnapshot[id].posX}px,${posSnapshot[id].posY}px)`;
  });

  return result;
}

// Selepas rebuild, kira semula translate supaya node kekal di posisi visual asal
function _compensateLayoutDrift(absSnapshot){
  const canvas = $("#canvas");
  if(!canvas || !Object.keys(absSnapshot).length) return;
  const canvasRect = canvas.getBoundingClientRect();
  const scale = (State.panzoom && State.panzoom.getScale) ? State.panzoom.getScale() : 1;
  const ids = Object.keys(absSnapshot);
  const elMap = {};
  const toSave = [];

  // Kumpul elemen (mungkin ada ID baru dari server)
  ids.forEach(id => {
    const el = document.querySelector(`.node[data-node-id="${CSS.escape(id)}"]`);
    if(el) elMap[id] = posTargetEl(el); /* v2.20 */
  });

  // Tulis: buang semua transform untuk ukur posisi semula jadi pasca-rebuild
  ids.forEach(id => { if(elMap[id]) elMap[id].style.transform = "none"; });

  // Baca: ukur posisi semula jadi pasca-rebuild (satu reflow)
  const newNatural = {};
  ids.forEach(id => {
    const el = elMap[id];
    if(!el) return;
    const rect = el.getBoundingClientRect();
    newNatural[id] = {
      x: (rect.left - canvasRect.left) / scale,
      y: (rect.top  - canvasRect.top)  / scale,
    };
  });

  // Tulis: guna translate yang dibetulkan
  ids.forEach(id => {
    const el = elMap[id];
    const nat = newNatural[id];
    const target = absSnapshot[id];
    if(!el || !nat || !target) return;
    const n = State.nodes.find(x => String(x.id) === String(id));
    if(!n) { el.style.transform = ""; return; }
    const newPosX = Math.round(target.absX - nat.x);
    const newPosY = Math.round(target.absY - nat.y);
    if(target.persist !== false){
      n.posX = newPosX;
      n.posY = newPosY;
      delete n._layoutLockX;
      delete n._layoutLockY;
    } else {
      n._layoutLockX = newPosX;
      n._layoutLockY = newPosY;
    }
    el.style.transform = `translate(${newPosX}px,${newPosY}px)`;
    if(target.persist !== false) toSave.push({id, posX: newPosX, posY: newPosY});
  });

  // Simpan posisi yang dibetulkan ke pelayan (senyap, latar belakang)
  if(toSave.length){
    toSave.forEach(item => {
      api("savePosition", {id: item.id, posX: item.posX, posY: item.posY}).catch(()=>{});
    });
  }
}

/* ---------- Pending changes (batch save) ---------- */
const Pending = {
  items: [],
  add(op){
    if(op.key){ this.items = this.items.filter(x=>x.key!==op.key); }
    this.items.push(op);
    this.renderBar();
  },
  clear(){ this.items = []; this.renderBar(); },
  count(){ return this.items.length; },
  renderBar(){
    let bar = document.getElementById("pending-bar");
    if(!this.items.length){ if(bar) bar.remove(); return; }
    if(!bar){
      bar = document.createElement("div");
      bar.id = "pending-bar";
      bar.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#064e3b;color:#ecfdf5;padding:10px 14px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.4);display:flex;gap:8px;align-items:center;z-index:9999;font-family:inherit;max-width:calc(100vw - 24px);flex-wrap:wrap;justify-content:center; border: 2px solid #10b981;";
      bar.innerHTML = `
        <span id="pending-count" style="font-weight:600;font-size:14px"></span>
        <button id="pending-save" style="background:#10b981;color:#fff;border:0;border-radius:999px;padding:8px 16px;cursor:pointer;font-weight:700;font-size:14px;box-shadow:0 4px 10px rgba(16,185,129,.4)">💾 Hantar Perubahan</button>
        <button id="pending-discard" style="background:transparent;color:#a7f3d0;border:1px solid rgba(167,243,208,.5);border-radius:999px;padding:8px 14px;cursor:pointer;font-size:13px">↺ Batal Draf</button>`;
      document.body.appendChild(bar);
      bar.querySelector("#pending-save").onclick = ()=>Pending.commit();
      bar.querySelector("#pending-discard").onclick = ()=>Pending.discard();
    }
    bar.querySelector("#pending-count").textContent = `${this.items.length} draf belum dihantar`;
  },
  async commit(){
    if(!this.items.length) return;
    const saveBtn = document.getElementById("pending-save");
    if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = "Menyimpan…"; }

    const layoutSnapshot = captureLayoutSnapshot();
    const panSnapshot = (State.panzoom && State.panzoom.getPan) ? State.panzoom.getPan() : null;
    const scaleSnapshot = (State.panzoom && State.panzoom.getScale) ? State.panzoom.getScale() : null;

    const queue = this.items.slice();
    this.items = [];
    const failed = [];
    for(const op of queue){
      try { await op.run(); }
      catch(err){
        failed.push(op);
        showError(err, {title:"Gagal: "+op.label, context:"batch"});
      }
    }
    this.items = failed;
    this.renderBar();
    toast(failed.length ? `${failed.length} draf gagal dihantar` : "Semua perubahan berjaya dihantar");
    try { await refreshAndRestoreLayout(layoutSnapshot, panSnapshot, scaleSnapshot); } catch(_){}
  },
  async discard(){
    if(!confirm("Buang semua draf yang belum dihantar? Paparan akan kembali kepada asal.")) return;
    this.clear();
    try { await refresh(); } catch(_){}
  }
};

/* PERINGATAN BILA KELUAR (UNLOAD WARNING) */
window.addEventListener("beforeunload", e=>{
  if(Pending.count()){
    e.preventDefault();
    e.returnValue = "Anda mempunyai draf perubahan yang belum dihantar (disimpan)! Adakah anda pasti ingin keluar?";
    return e.returnValue;
  }
});
function queueChange(op){ Pending.add(op); }

async function fileToBase64(f){
  if(!f || !f.name) return null;
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = () => res({name:f.name, type:f.type, data:r.result.split(",")[1]});
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

/* ---------- Foto Drive ---------- */
function fixPhoto(url){
  if(!url) return "";
  if(url.startsWith("data:image")) return url;
  const m = String(url).match(/[?&]id=([\w-]+)/) || String(url).match(/\/d\/([\w-]+)/);
  if(m) return `https://lh3.googleusercontent.com/d/${m[1]}=w400`;
  return url;
}

/* ---------- Spouses helper ---------- */
function getSpouses(n){
  let a=[];
  if(Array.isArray(n.spouses) && n.spouses.length) a=n.spouses;
  else if(n.spousesJson){
    try{ const x = JSON.parse(n.spousesJson); if(Array.isArray(x)) a=x; }catch(e){}
  }
  else if(n.spouseName) a=[{name:n.spouseName, photo:n.spousePhoto||"", status:n.spouseStatus||"hidup", order:1, death:""}];
  
  const rowSpouses = (State.nodes || []).filter(x=>String(x.spouseOf||"")===String(n.id||""));
  if(rowSpouses.length){
    const seen = new Set();
    a = rowSpouses.map((s,i)=>{
      if(s.id) seen.add(String(s.id));
      return {
        id: s.id, name: s.name||"", nickname: s.nickname||"", gender: s.gender||oppositeGender(n.gender),
        birth: s.birth||"", birthplace: s.birthplace||"", photo: s.photo||s.spousePhoto||"",
        status: s.status||"hidup", death: s.death||"", deathplace: s.deathplace||"", notes: s.notes||"",
        order: Number(s.spouseOrder)>0 ? Number(s.spouseOrder) : (Number(s.order)>0 ? Number(s.order) : i+1),
        isDraft: s.isDraft
      };
    }).concat(a.filter(s=>!seen.has(String(s.id||""))));
  }
  a = a.map((s,i)=>({ ...s, id:s.id||`legacy-${n.id||"node"}-${i+1}`, order:s.order||i+1, gender:s.gender||oppositeGender(n.gender) }));
  a.sort((x,y)=>(x.order||99)-(y.order||99));
  return a;
}
function oppositeGender(gender){
  if(gender === "L") return "P";
  if(gender === "P") return "L";
  return "";
}
function getChildParents(n){
  if(!n?.parentId) return { father:"", mother:"", fatherShort:"", motherShort:"" };
  const parent = State.nodes.find(x=>String(x.id)===String(n.parentId));
  if(!parent) return { father:"", mother:"", fatherShort:"", motherShort:"" };
  const spouses = getSpouses(parent);
  const linkedSpouse = n.spouseIndex
    ? (spouses.find(s=>String(s.id)===String(n.spouseIndex)) || spouses.find(s=>String(s.order)===String(n.spouseIndex)) || spouses[Number(n.spouseIndex)-1] || null)
    : (spouses.length===1 ? spouses[0] : null);
  const father = parent.gender==="L" ? parent.name : (linkedSpouse?.name || "");
  const mother = parent.gender==="P" ? parent.name : (linkedSpouse?.name || "");
  return {
    father,
    mother,
    fatherShort: father || "Tidak dinyatakan",
    motherShort: mother || "Tidak dinyatakan",
  };
}
function canAddSpouse(n){ return true; }
function spouseStatusLabel(s){
  if(s.status==="mati") return "Almarhum"+(s.death?" "+s.death:"");
  if(s.status==="cerai") return "Bercerai";
  return "Hidup";
}
function spouseGenderLabel(s){
  if(s.gender==="P") return "Perempuan";
  if(s.gender==="L") return "Lelaki";
  return "Tidak dinyatakan";
}
function spouseOrdinal(n){
  const map={1:"Pertama",2:"Kedua",3:"Ketiga",4:"Keempat",5:"Kelima",6:"Keenam"};
  return map[n]||("Ke-"+n);
}

/* ---------- User-link helper ---------- */
function normalizeName(s){ return String(s||"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim(); }
function findLinkedUser(n){
  if(!State.users || !State.users.length) return null;
  const nm = normalizeName(n.name);
  if(!nm) return null;
  return State.users.find(u=> normalizeName(u.fullname)===nm ) || null;
}
function canManageContent(){
  return !!State.user && (State.user.role === "admin" || !!State.user.approved);
}
function memberStatusText(u = State.user){
  if(!u) return "Mod Pelawat — lihat sahaja";
  if(u.role === "admin") return `${u.username} • ADMIN`;
  if(u.approved) return `${u.username} • Ahli #${u.no || "-"}`;
  return `${u.username} • Menunggu pengesahan admin`;
}
async function loadMyProfile(silent=true){
  if(!hasActiveSession()){ State.myProfile = null; return null; }
  try {
    const me = await api("myProfile",{});
    State.myProfile = me;
    const prev = syncUserFromStorage() || State.user || {};
    State.user = { ...prev, ...me, token: prev.token, isMaster: prev.isMaster };
    persistUser(State.user);
    updateUserUI();
    return me;
  } catch(err) {
    if(!silent) showError(err,{title:"Gagal memuat profil anda",context:"myProfile"});
    return null;
  }
}


/* ---------- Free-drag positions (admin & owner draf) ---------- */
/* v2.20 couple-bind: posisi/seretan digerakkan pada SELURUH kotak pasangan (.couple)
   supaya kad pasangan kekal melintang di sisi suami/isteri, bukan tertinggal di bawah */
function posTargetEl(el){
  if(!el) return el;
  return el.closest(".couple") || el;
}
function canDragNode(n){
  if(!State.user) return false;
  if(State.user.role === "admin") return true;
  if(n && n.isDraft) return true;
  return false;
}
function applyNodePositions(){
  const apply = (el, n) => {
    if(!el) return;
    const tEl = posTargetEl(el); /* v2.20: gerakkan kotak pasangan penuh */
    const hasPos = (n.posX!=null && n.posY!=null && !isNaN(n.posX) && !isNaN(n.posY));
    const hasLayoutLock = !hasPos && n._layoutLockX!=null && n._layoutLockY!=null && !isNaN(Number(n._layoutLockX)) && !isNaN(Number(n._layoutLockY));
    if(hasPos || hasLayoutLock){
      const x = hasPos ? n.posX : n._layoutLockX;
      const y = hasPos ? n.posY : n._layoutLockY;
      tEl.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("has-manual-pos", hasPos);
    } else {
      tEl.style.transform = "";
      el.classList.remove("has-manual-pos");
    }
    if(canDragNode(n)){
      el.classList.add("draggable-node");
      enableNodeDrag(el, n);
    }
  };
  State.nodes.forEach(n=>{
    const sel = `.node[data-node-id="${CSS.escape(String(n.id))}"]`;
    document.querySelectorAll(sel).forEach(el=>apply(el, n));
  });
}
function enableNodeDrag(el, n){
  if(el.__dragBound) return;
  el.__dragBound = true;
  let drag = null;
  el.addEventListener("pointerdown", ev=>{
    if(ev.button !== 0) return;
    if(State.reparentMode) return;
    if(!canDragNode(n)) return;
    // ignore drag from interactive children (buttons/links/img click)
    if(ev.target.closest("button,a,input,select,textarea")) return;
    const scale = (State.panzoom && State.panzoom.getScale) ? State.panzoom.getScale() : 1;
    drag = {
      sx: ev.clientX, sy: ev.clientY,
      ox: Number(n.posX)||0, oy: Number(n.posY)||0,
      scale: scale||1, moved:false, pid: ev.pointerId
    };
    el.setPointerCapture(ev.pointerId);
    el.classList.add("dragging");
    if(State.panzoom && State.panzoom.setOptions) State.panzoom.setOptions({disablePan:true});
    ev.stopPropagation();
  });
  el.addEventListener("pointermove", ev=>{
    if(!drag) return;
    const dx = (ev.clientX - drag.sx)/drag.scale;
    const dy = (ev.clientY - drag.sy)/drag.scale;
    if(Math.abs(dx)>3 || Math.abs(dy)>3) drag.moved = true;
    const nx = drag.ox + dx, ny = drag.oy + dy;
    posTargetEl(el).style.transform = `translate(${nx}px, ${ny}px)`; /* v2.20 */
    n.posX = nx; n.posY = ny;
  });
  const finish = ev => {
    if(!drag) return;
    const moved = drag.moved;
    try{ el.releasePointerCapture(drag.pid); }catch(_){}
    drag = null;
    el.classList.remove("dragging");
    if(State.panzoom && State.panzoom.setOptions) State.panzoom.setOptions({disablePan:false});
    if(moved){
      n.isDraft = true;
      el.classList.add("is-draft");
      // suppress imminent click
      el.__suppressClick = true;
      setTimeout(()=>{ el.__suppressClick = false; }, 50);
      const px = Math.round(n.posX), py = Math.round(n.posY);
      queueChange({
        key: "pos:"+n.id,
        label: "Pindah kedudukan "+(n.name||""),
        run: ()=> api("savePosition",{id:n.id, posX:px, posY:py})
      });
      toast("Kedudukan dikemaskini sebagai draf");
    }
  };
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
  el.addEventListener("click", ev=>{
    if(el.__suppressClick){ ev.stopImmediatePropagation(); ev.preventDefault(); }
  }, true);
}

/* ---------- Render Tree ---------- */
function normalizeMissingParentsForStableLayout(nodes){
  const ids = new Set((nodes||[]).filter(n=>!n.spouseOf).map(n=>String(n.id)));
  const roots = (nodes||[]).filter(n=>!n.spouseOf && !n.parentId);
  const mainRoot = roots.find(r=>!r.hanging) || roots[0];
  roots.forEach(n=>{
    if(mainRoot && String(n.id) !== String(mainRoot.id) && !n.hanging){
      n.hanging = true;
      n.extraRootResolved = true;
    }
  });
  (nodes||[]).forEach(n=>{
    if(n.spouseOf || !n.parentId) return;
    if(ids.has(String(n.parentId))) return;
    n.parentId = "";
    n.hanging = true;
    n.missingParentResolved = true;
  });
}

function buildTree(){
  const host = $("#tree-root");
  host.className=""; host.innerHTML="";
  normalizeMissingParentsForStableLayout(State.nodes);

  const roots = State.nodes.filter(n=>!n.parentId && !n.spouseOf);
  const mainRoot = roots.find(r=>!r.hanging) || roots[0];
  const ids = new Set(State.nodes.filter(n=>!n.spouseOf).map(n=>n.id));
  const orphans = State.nodes.filter(n=> !n.spouseOf && n.parentId && !ids.has(n.parentId));
  const hangingRoots = roots.filter(r=> r !== mainRoot);

  if(!mainRoot && !orphans.length && !hangingRoots.length){
    host.innerHTML='<p class="text-center mt-32 serif text-lg" style="color:var(--ink-soft)">Belum ada data. Admin perlu Init Root.</p>';
    renderNotes(); return;
  }

  const wrap = document.createElement("div");
  wrap.className = "trees-wrap";

  if(mainRoot){
    const main = document.createElement("div");
    main.className = "tree-block";
    const ul = document.createElement("ul"); ul.className="tree";
    ul.appendChild(renderNode(mainRoot));
    main.appendChild(ul);
    wrap.appendChild(main);
  }

  [...hangingRoots, ...orphans].forEach(n=>{
    const block = document.createElement("div");
    block.className = "tree-block hanging-block";
    const label = document.createElement("div");
    label.className = "hanging-label";
    label.innerHTML = n.hanging
      ? '🔗 <b>Root Tergantung</b> <span class="op-60">— masih dalam pencarian sambungan</span>'
      : '⚠ <b>Cabang Terputus</b> <span class="op-60">— parent tidak dijumpai</span>';
    block.appendChild(label);
    const dashed = document.createElement("div"); dashed.className="dashed-link"; block.appendChild(dashed);
    const ul = document.createElement("ul"); ul.className="tree";
    ul.appendChild(renderNode(n));
    block.appendChild(ul);
    wrap.appendChild(block);
  });

  host.appendChild(wrap);
  renderNotes();
  applyNodePositions();
}
function renderNode(n){
  const li = document.createElement("li");
  const branch = document.createElement("div");
  branch.className="branch";
  const parents = getChildParents(n);

  const couple = document.createElement("div");
  couple.className = "couple"+(n.pending?" pending-family":"");
  const sps = getSpouses(n);
  const spouseOnLeft = n.gender === "P";
  const buildSpouseBox = (sp, idx) => {
    const link = document.createElement("div");
    link.className = "couple-link";
    link.title = "Pasangan "+spouseOrdinal(sp.order||idx+1);

    const el = document.createElement("div");
    el.dataset.nodeId = sp.id || "";
    el.className = "node spouse"+(sp.status==="cerai"?" divorced":"")+(sp.status==="mati"?" deceased":"")+(sp.isDraft?" is-draft":"");
    const stLabel = sp.status==="mati"?"†":(sp.status==="cerai"?"⚊":"");
    const spGender = sp.gender || oppositeGender(n.gender);
    el.innerHTML=`${sp.isDraft?'<div class="draft-chip">Draf</div>':''}
      <img src="${fixPhoto(sp.photo)||placeholder(spGender||'P')}" onerror="this.src='${placeholder(spGender||'P')}'"/>
      <div class="name" dir="auto">${escape(sp.name)} ${stLabel}</div>
      <div class="meta">Pasangan ${spouseOrdinal(sp.order||idx+1)} • ${spouseStatusLabel(sp)}</div>`;
    el.addEventListener("click",e=>{e.stopPropagation();showSpouseProfile(n, sp);});
    return { link, el };
  };

  if(spouseOnLeft){
    [...sps].slice().reverse().forEach((sp)=>{
      const idx = sps.indexOf(sp);
      const { link, el } = buildSpouseBox(sp, idx);
      couple.appendChild(el);
      couple.appendChild(link);
    });
    couple.appendChild(card(n, parents));
  } else {
    couple.appendChild(card(n, parents));
    sps.forEach((sp, idx)=>{
      const { link, el } = buildSpouseBox(sp, idx);
      couple.appendChild(link);
      couple.appendChild(el);
    });
  }
  branch.appendChild(couple);
  li.appendChild(branch);

  const kids = State.nodes.filter(x=>x.parentId===n.id && !x.spouseOf);
  if(kids.length){
    const cu = document.createElement("ul");
    cu.className="children-row";
    if(sps.length>=1){
      const groups = {};
      kids.forEach(k=>{
        let key = k.spouseIndex;
        if(!key && sps.length === 1) key = sps[0].id;
        if(!key) key = "0";
        (groups[key]=groups[key]||[]).push(k);
      });
      Object.keys(groups).sort().forEach(key=>{
        const grpLi = document.createElement("li");
        grpLi.className="kid-group";
        const lbl = document.createElement("div");
        lbl.className = "kid-group-label";
        if(key==="0") lbl.textContent = "Tidak ditandakan (Hubungan samar)";
        else {
          const sp = sps.find(s=>String(s.id)===String(key)) || sps.find(s=>String(s.order)===String(key)) || sps[Number(key)-1];
          if(sp){
            const father = n.gender==="L" ? n.name : sp.name;
            const mother = n.gender==="P" ? n.name : sp.name;
            lbl.textContent = `Bapa: ${father} • Ibu: ${mother}`;
          } else {
            lbl.textContent = `Pasangan ${spouseOrdinal(key)}`;
          }
        }
        grpLi.appendChild(lbl);
        const sub = document.createElement("ul");
        sub.className = "children-row";
        groups[key].forEach(k=>sub.appendChild(renderNode(k)));
        grpLi.appendChild(sub);
        cu.appendChild(grpLi);
      });
    } else {
      kids.forEach(k=>cu.appendChild(renderNode(k)));
    }
    li.appendChild(cu);
  }
  return li;
}
function card(n, parents = getChildParents(n)){
  const linked = findLinkedUser(n);
  const isApprovedUser = !!(linked && linked.approved);
  const isAdminUser = linked && linked.role === "admin" && linked.approved;
  const d = document.createElement("div");
  d.className = "node"+(n.pending?" pending":"")+(n.parentId===false||n.parentId==="" && !n.hanging?" root":"")+(n.hanging?" hanging":"")+(isApprovedUser?" is-user":"")+(isAdminUser?" is-admin":"")+(n.isDraft?" is-draft":"");
  if(!n.parentId && !n.hanging) d.classList.add("root");
  d.dataset.nodeId = n.id;
  const badges = `${isApprovedUser?`<span class="badge-user" title="Ahli berdaftar: @${escape(linked.username)}">👤</span>`:""}${isAdminUser?`<span class="badge-admin" title="Admin">★</span>`:""}`;
  const parentMeta = n.parentId
    ? `<div class="meta parentage" dir="auto">Bapa: ${escape(parents.fatherShort)}</div><div class="meta parentage" dir="auto">Ibu: ${escape(parents.motherShort)}</div>`
    : "";
  const draftChip = n.isDraft ? `<div class="draft-chip">Draf Baru</div>` : "";
  const pendingChip = (!n.isDraft && n.pending) ? `<div class="pending-chip" title="Perlu disahkan oleh admin">Perlu semakan</div>` : "";
  d.innerHTML = `${badges?`<div class="node-badges">${badges}</div>`:""}
    ${draftChip}
    ${pendingChip}
    <img src="${fixPhoto(n.photo)||fixPhoto(linked?.photo)||placeholder(n.gender)}" alt="" onerror="this.src='${placeholder(n.gender)}'"/>
    <div class="name" dir="auto">${escape(n.name)}</div>
    <div class="meta">#${n.no||"-"} ${n.birth||""}${n.death?" – "+n.death:""}</div>
    ${parentMeta}
    ${(!n.isDraft && n.pending)?'<div class="meta" style="font-weight:800;color:#92400e">Menunggu kelulusan</div>':''}`;
  d.addEventListener("click",e=>{
    e.stopPropagation();
    if(State.reparentMode){
      const targetId = State.reparentMode.nodeId;
      if(targetId === n.id){ toast("Tidak boleh pilih diri sendiri"); return; }
      doReparent(targetId, n.id);
      return;
    }
    if(State.user?.role === "admin" && n.pending && !n.isDraft){
      viewProfile(n);
      return;
    }
    showCtx(e.clientX, e.clientY, n);
  });
  return d;
}
function placeholder(g){
  const c = g==="P" ? "%23b85a72" : "%233b6fa0";
  const sym = g==="P" ? "%E2%99%80" : "%E2%99%82";
  return "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2064%2064%27%3E%3Crect%20width=%2764%27%20height=%2764%27%20fill=%27"+c+"%27/%3E%3Ctext%20x=%2732%27%20y=%2742%27%20font-size=%2730%27%20text-anchor=%27middle%27%20fill=%27white%27%20font-family=%27serif%27%3E"+sym+"%3C/text%3E%3C/svg%3E";
}
function escape(s){return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}

/* ---------- Context Menu ---------- */
function showCtx(x,y,n){
  const m = $("#ctx-menu");
  const canEdit = canManageContent();
  const isAdmin = State.user?.role==="admin";
  const linked = findLinkedUser(n);
  m.innerHTML = "";
  const items = [
    {l:"👁 Lihat Profil", fn:()=>viewProfile(n)},
    canEdit && {l:"✎ Edit Maklumat", fn:()=>openNodeEditor(n)},
    canEdit && {l:"➕ Tambah Anak", fn:()=>openNodeEditor(null,n.id,"child", n)},
    canEdit && canAddSpouse(n) && {l:"💍 Tambah Pasangan", fn:()=>openSpouseEditor(n)},
    isAdmin && {l:"🔀 Pindah ke parent lain…", fn:()=>startReparent(n)},
    isAdmin && n.parentId && {l:"⛓ Putuskan jadi root tergantung", fn:()=>doReparent(n.id, "", true)},
    linked && {l:`👤 ${linked.approved?'Ahli berdaftar':'Pengguna menunggu sah'}: @${linked.username}${linked.role==='admin'?' ★':''}`, fn:()=>showInfo(`Nama: ${linked.fullname}\nUsername: @${linked.username}\nPeranan: ${linked.role==='admin'?'ADMIN ★':'Ahli'}\nStatus: ${linked.approved?'Sudah disahkan':'Menunggu pengesahan admin'}${linked.no?`\nNo. Ahli: ${linked.no}`:''}`,{title:"Pengguna Berdaftar"})},
    canEdit && {l: isAdmin?"🗑 Padam":"🗑 Pohon Padam", fn:()=>delNode(n)},
  ].filter(Boolean);
  items.forEach(i=>{const b=document.createElement("button");b.textContent=i.l;b.onclick=()=>{m.classList.add("hidden");i.fn();};m.appendChild(b);});
  m.style.left = Math.min(x, innerWidth-260)+"px";
  m.style.top = Math.min(y, innerHeight-items.length*40)+"px";
  m.classList.remove("hidden");
}
document.addEventListener("click",()=>$("#ctx-menu").classList.add("hidden"));

/* ---------- Reparent (admin optimistik) ---------- */
function startReparent(n){
  State.reparentMode = { nodeId: n.id, name: n.name };
  document.body.classList.add("reparent-mode");
  showInfo(`Klik mana-mana kotak untuk jadikan PARENT BAHARU bagi "${n.name}". Tekan Esc untuk batal.`,{title:"Mod Pindah Cabang"});
}
function cancelReparent(){
  State.reparentMode = null;
  document.body.classList.remove("reparent-mode");
}
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && State.reparentMode){ cancelReparent(); toast("Mod pindah dibatalkan"); }});
async function doReparent(nodeId, newParentId, makeHanging){
  const me = State.nodes.find(x=>x.id===nodeId);
  const parent = newParentId ? State.nodes.find(x=>x.id===newParentId) : null;
  const msg = newParentId
    ? `Pindah "${me?.name}" jadi anak kepada "${parent?.name}"?`
    : `Putuskan "${me?.name}" jadi root tergantung (tiada parent)?`;
  if(!confirm(msg)){ cancelReparent(); return; }
  
  if(me) {
     me.parentId = newParentId || "";
     me.hanging = !!makeHanging;
     buildTree();
  }
  
  try {
    await api("reparent",{id:nodeId, newParentId:newParentId||"", hanging: !!makeHanging});
    showInfo("Salasilah dikemaskini");
    cancelReparent();
    await refresh();
  } catch(err) { 
    showError(err,{title:"Gagal pindah",context:"reparent"}); 
    cancelReparent();
    await refresh();
  }
}

/* ---------- Profile Viewer ---------- */
function fmtDateTime(v){
  if(!v) return "";
  try{ const d=new Date(v); if(isNaN(d.getTime())) return String(v); return d.toLocaleString("ms-MY"); }catch(e){ return String(v); }
}
function pendingActionLabel(action){
  const map = { add:"Ahli baharu", edit:"Kemaskini profil", delete:"Permintaan padam", spouse:"Pasangan baharu", "spouse-edit":"Kemaskini pasangan", "spouse-delete":"Padam pasangan", "note-add":"Nota baharu", "note-edit":"Kemaskini nota", "note-delete":"Padam nota" };
  return map[action] || action || "Perubahan";
}
function viewProfile(n){
  const sp = getSpouses(n);
  const parents = getChildParents(n);
  const photo = fixPhoto(n.photo) || placeholder(n.gender);
  const editedBy = n.lastEditBy || n.createdBy || "";
  const editedAt = fmtDateTime(n.lastEditAt || n.createdAt);
  const approvedBy = n.approvedBy || "";
  const approvedAt = fmtDateTime(n.approvedAt);
  const pendingItems = Array.isArray(n.pendingItems) ? n.pendingItems : [];
  const canApprove = State.user?.role === "admin" && pendingItems.length && !n.isDraft;
  
  $("#profile-body").innerHTML = `
    <div class="flex flex-col items-center mb-4">
      <img src="${photo}" onerror="this.src='${placeholder(n.gender)}'" class="w-28 h-28 rounded-full object-cover mb-2" style="border:3px solid var(--gold)"/>
      <h2 class="text-2xl font-bold text-center serif" dir="auto">${escape(n.name)}</h2>
      ${n.nickname?`<p class="text-sm serif italic" dir="auto" style="color:var(--gold-dark)">"${escape(n.nickname)}"</p>`:""}
      <p class="text-xs" style="color:var(--ink-soft)">#${n.no||"-"} • ${n.gender==='P'?'Perempuan':'Lelaki'} • ${n.status==='mati'?'Almarhum':'Hidup'}</p>
      ${n.isDraft?'<p class="text-[11px] mt-1 font-semibold p-1 px-3 rounded-full" style="background:#059669;color:#fff">Draf Belum Disimpan</p>':(n.pending?'<p class="text-[11px] mt-1 font-semibold" style="color:#475569">● Belum disahkan admin</p>':'')}
    </div>
    <div class="space-y-2 text-sm" dir="auto">
      ${rowField("Tahun Lahir", n.birth)}
      ${rowField("Tempat Lahir", n.birthplace)}
      ${rowField("Tahun Wafat", n.death)}
      ${rowField("Tempat Wafat", n.deathplace)}
      ${n.parentId ? rowField("Nama Bapa", parents.fatherShort) : ""}
      ${n.parentId ? rowField("Nama Ibu", parents.motherShort) : ""}
      ${sp.length?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Pasangan (${sp.length})</div>
        <ul class="space-y-1" dir="auto">${sp.map((s,i)=>`<li>• <b>${spouseOrdinal(s.order||i+1)}:</b> ${escape(s.name)} <span style="color:var(--ink-soft)">(${spouseStatusLabel(s)})</span></li>`).join("")}</ul></div>`:""}
      ${n.notes?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Catatan</div><p class="whitespace-pre-wrap" dir="auto">${escape(n.notes)}</p></div>`:""}
    </div>
    ${!n.isDraft ? `
    <div class="mt-4 pt-3 border-t text-[11px] flex flex-col gap-1" style="border-color:var(--line-soft);color:var(--ink-soft)">
      <div class="font-semibold serif" style="color:var(--gold-dark);font-size:12px">📜 Log Pengesahan</div>
      <div>📝 Terakhir dikemaskini oleh: <b style="color:var(--ink)">${escape(editedBy||"—")}</b></div>
      ${editedAt?`<div>🕒 ${escape(editedAt)}</div>`:""}
      ${approvedBy?`<div>✅ Disahkan oleh admin: <b style="color:#1e7a3b">${escape(approvedBy)}</b>${approvedAt?` • ${escape(approvedAt)}`:""}</div>`:(n.pending?'<div style="color:#475569">● Menunggu pengesahan</div>':'')}
      ${n.createdBy && n.createdBy!==editedBy?`<div>👤 Dicipta oleh: ${escape(n.createdBy)}</div>`:""}
    </div>` : ""}
    ${pendingItems.length && !n.isDraft ? `
      <div class="mt-4 pt-3 border-t text-[11px] flex flex-col gap-2" style="border-color:var(--line-soft);color:var(--ink-soft)">
        <div class="font-semibold serif" style="color:#475569;font-size:12px">🩶 Perubahan belum disahkan</div>
        ${pendingItems.map(it=>`<div class="rounded-lg px-3 py-2" style="background:rgba(148,163,184,.14);border:1px solid rgba(100,116,139,.28)">
          <div style="color:var(--ink)"><b>${escape(pendingActionLabel(it.action))}</b> • ${escape(it.summary||"Perubahan baharu")}</div>
          <div class="mt-1">Dihantar oleh <b style="color:var(--ink)">${escape(it.by||"-")}</b>${it.createdAt?` • ${escape(fmtDateTime(it.createdAt))}`:""}</div>
        </div>`).join("")}
        ${n.pendingDelete?'<div style="color:#8b1e1e;font-weight:700">⚠ Profil ini mempunyai permintaan padam yang masih menunggu keputusan admin.</div>':''}
      </div>`:""}
    ${!State.user?'<p class="text-[11px] mt-3 text-center" style="color:var(--ink-soft)">Mod pelawat — lihat sahaja.</p>':`
      <div class="flex gap-2 mt-4">
        ${canManageContent()?'<button class="btn btn-primary flex-1" id="profile-edit-btn">✎ Edit Maklumat</button><button class="btn btn-ghost flex-1" id="profile-addchild-btn">➕ Tambah Anak</button><button class="btn btn-ghost flex-1" id="profile-addspouse-btn">💍 Tambah Pasangan</button>':'<div class="text-[11px] w-full text-center px-3 py-2 rounded-lg" style="background:rgba(148,163,184,.12);color:var(--ink-soft)">Akaun anda perlu disahkan admin dahulu sebelum boleh menambah atau mengubah data.</div>'}
      </div>
      ${canApprove?`<div class="flex gap-2 mt-3">
        <button class="btn btn-primary flex-1" id="profile-approve-btn">✓ Sahkan Data Ini</button>
        <button class="btn btn-ghost flex-1" id="profile-reject-btn" style="color:#8b1e1e">✕ Tolak Perubahan</button>
      </div>`:''}
    `}
  `;
  openModal("modal-profile");
  if(State.user && canManageContent()){
    const eb = document.getElementById("profile-edit-btn");
    if(eb) eb.onclick = ()=>{ closeModal("modal-profile"); openNodeEditor(n); };
    const ab = document.getElementById("profile-addchild-btn");
    if(ab) ab.onclick = ()=>{ closeModal("modal-profile"); openNodeEditor(null, n.id, "child", n); };
    const sb = document.getElementById("profile-addspouse-btn");
    if(sb) sb.onclick = ()=>{ closeModal("modal-profile"); openSpouseEditor(n); };
    const ap = document.getElementById("profile-approve-btn");
    if(ap) ap.onclick = ()=>moderateTarget(n.id, "node", "approve");
    const rp = document.getElementById("profile-reject-btn");
    if(rp) rp.onclick = ()=>moderateTarget(n.id, "node", "reject");
  }
}
function rowField(label,val){
  if(!val && val!==0) return "";
  return `<div class="flex justify-between gap-3"><span style="color:var(--ink-soft)">${label}</span><span class="text-right">${escape(val)}</span></div>`;
}
function showSpouseProfile(parent, sp){
  const canEdit = !!State.user;
  const isAdmin = State.user?.role === "admin";
  $("#profile-body").innerHTML = `
    <div class="flex flex-col items-center mb-4">
      <img src="${fixPhoto(sp.photo)||placeholder(parent.gender==='L'?'P':'L')}" class="w-28 h-28 rounded-full object-cover mb-2" style="border:3px solid var(--rose)"/>
      <h2 class="text-2xl font-bold text-center serif" dir="auto">${escape(sp.name)}</h2>
      ${sp.nickname?`<p class="text-sm serif italic" dir="auto" style="color:var(--gold-dark)">"${escape(sp.nickname)}"</p>`:""}
      <p class="text-xs" style="color:var(--ink-soft)">Pasangan ${spouseOrdinal(sp.order||1)} kepada ${escape(parent.name)}</p>
      <p class="text-xs" style="color:var(--ink-soft)">${spouseGenderLabel(sp)} • ${spouseStatusLabel(sp)}</p>
      ${sp.isDraft?'<p class="text-[11px] mt-1 font-semibold p-1 px-3 rounded-full" style="background:#059669;color:#fff">Draf Belum Disimpan</p>':''}
    </div>
    <div class="space-y-2 text-sm" dir="auto">
      ${rowField("Tahun Lahir", sp.birth)}
      ${rowField("Tempat Lahir", sp.birthplace)}
      ${rowField("Tahun Wafat", sp.death)}
      ${rowField("Tempat Wafat", sp.deathplace)}
      ${sp.notes?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Catatan</div><p class="whitespace-pre-wrap" dir="auto">${escape(sp.notes)}</p></div>`:""}
    </div>
    ${canEdit?`<div class="flex gap-2 pt-2">
      <button id="btn-edit-spouse" class="btn btn-ghost flex-1">✎ Edit Pasangan</button>
      <button id="btn-del-spouse" class="btn btn-ghost flex-1" style="color:var(--rose)">🗑 Padam</button>
    </div>`:""}
  `;
  openModal("modal-profile");
  if(canEdit){
    const e = document.getElementById("btn-edit-spouse");
    if(e) e.onclick = ()=>{ closeModal("modal-profile"); openSpouseEditor(parent, sp); };
    const d = document.getElementById("btn-del-spouse");
    if(d) d.onclick = ()=>deleteSpouseEntry(parent, sp);
  }
}
async function deleteSpouseEntry(parent, sp){
  if(!confirm(`Padam pasangan "${sp.name}" daripada ${parent.name}?`)) return;
  
  // Optimistic Delete
  State.nodes = State.nodes.filter(x => !(x.spouseOf === parent.id && Number(x.spouseOrder) === Number(sp.order)));
  const pNode = State.nodes.find(x => x.id === parent.id);
  if (pNode && pNode.spouses) pNode.spouses = pNode.spouses.filter(s => Number(s.order) !== Number(sp.order));
  buildTree();
  
  toast("Padam draf didaftarkan. Sila Simpan Semua.");
  closeModal("modal-profile");
  
  queueChange({
    label: "Padam pasangan "+sp.name,
    run: ()=>api("deleteSpouse",{ parentId: parent.id, order: sp.order||1 })
  });
}

async function moderateTarget(targetId, targetType, decision="approve"){
  const isReject = decision === "reject";
  const source = targetType === "note"
    ? (State.notes || []).find(x=>String(x.id)===String(targetId))
    : (State.nodes || []).find(x=>String(x.id)===String(targetId));
  const pendingItems = Array.isArray(source?.pendingItems) ? source.pendingItems : [];
  if(!pendingItems.length){
    showInfo("Tiada perubahan pending lagi untuk item ini. Paparan akan disegarkan.",{title:"Sudah Terkini"});
    closeModal("modal-profile");
    await refresh();
    return;
  }
  if(isReject && !confirm("Tolak semua perubahan belum disahkan untuk profil ini?")) return;
  try {
    const res = await api("moderateTarget", { targetId, targetType, decision });
    if(res?.empty || !res?.count){
      showInfo("Tiada perubahan pending lagi untuk item ini. Paparan telah disegarkan.",{title:"Sudah Terkini"});
    } else {
      showInfo(isReject ? "Perubahan ditolak" : "Data berjaya disahkan");
    }
    closeModal("modal-profile");
    if(State.user?.role === "admin") loadAdmin();
    await refresh();
  } catch(err) {
    showError(err,{title:isReject?"Gagal tolak perubahan":"Gagal sahkan data",context:"moderateTarget"});
  }
}

/* ---------- Node Editor (Optimistik Draf) ---------- */
function openNodeEditor(node, parentId=null, relation="child", parentNode=null){
  if(!canManageContent()){toast("Akaun anda perlu disahkan admin dahulu");return;}
  const f = $("#form-node");
  f.reset();
  f.id.value = node?.id || "";
  f.parentId.value = parentId || node?.parentId || "";
  f.relation.value = node ? "edit" : relation;
  const wrap = $("#spouse-pick-wrap");
  wrap.innerHTML = "";
  const pid = f.parentId.value;
  const pNode = parentNode || State.nodes.find(x=>x.id===pid);
  if(pNode){
    const sps = getSpouses(pNode);
    if(sps.length>=1){
      const lbl = document.createElement("label");
      lbl.className = "text-xs block font-bold mt-2"; lbl.style.color = "var(--rose)";
      lbl.textContent = "Ibu/Bapa dari pasangan yang mana? (Wajib pilih)";
      const sel = document.createElement("select");
      sel.className = "input mt-1"; sel.name = "spouseIndex"; sel.required = true;
      sel.innerHTML = `<option value="">— Sila Pilih Pasangan Sah —</option>` +
        sps.map((s,i)=>`<option value="${escape(s.id||String(s.order||i+1))}">${spouseOrdinal(s.order||i+1)}: ${escape(s.name)}</option>`).join("");
      if(node?.spouseIndex){
        const linkedSpouse = sps.find(s=>String(s.id)===String(node.spouseIndex)) || sps.find(s=>String(s.order)===String(node.spouseIndex));
        sel.value = String(linkedSpouse?.id || node.spouseIndex);
      } else if (sps.length === 1) {
        sel.value = sps[0].id;
      }
      wrap.appendChild(lbl); wrap.appendChild(sel);
    }
  }
  if(node){
    f.name.value=node.name||"";
    f.nickname.value=node.nickname||"";
    f.gender.value=node.gender||"L";
    f.status.value=node.status||"hidup";
    f.birth.value=node.birth||"";
    f.death.value=node.death||"";
    f.birthplace.value=node.birthplace||"";
    f.deathplace.value=node.deathplace||"";
    f.notes.value=node.notes||"";
  }
  $("#node-title").textContent = node?"Edit Ahli":"Tambah Anak";
  openModal("modal-node");
}

$("#form-node").addEventListener("submit", async e=>{
  e.preventDefault();
  if(!ensureSession("menyimpan ahli")) return;
  const fd = new FormData(e.target);
  const photo = await fileToBase64(fd.get("photo"));
  const payload = Object.fromEntries(fd.entries());
  delete payload.photo;
  if(photo) payload.photo = photo;
  if(payload.id) payload.relation = "edit";

  const isEdit = !!payload.id;
  if(!isEdit) {
    payload.id = makeUUID();
    payload.isNew = true;
    State.nodes.push({
      ...payload,
      isDraft: true,
      photo: photo ? "data:image/jpeg;base64,"+photo.data : ""
    });
  } else {
    const n = State.nodes.find(x => x.id === payload.id);
    if(n) {
      Object.assign(n, payload, { isDraft: true });
      if(photo) n.photo = "data:image/jpeg;base64,"+photo.data;
    }
  }
  
  buildTree();
  toast("Paparan draf dikemaskini. Sila tekan 'Hantar Perubahan'.");
  closeModal("modal-node");
  const _nodePayloadId = payload.id;
  queueChange({label:"Simpan ahli "+(payload.name||""), run:()=>{
    const _liveNode = State.nodes.find(x=>String(x.id)===String(mapId(_nodePayloadId)));
    const _send = {...payload};
    if(_liveNode){
      _send.parentId = _liveNode.parentId || "";
      _send.hanging = !!_liveNode.hanging;
    }
    if(_liveNode && _liveNode.posX != null && !isNaN(Number(_liveNode.posX))){
      _send.posX = Number(_liveNode.posX);
      _send.posY = Number(_liveNode.posY);
    }
    return api("saveNode", _send);
  }});
});

/* ---------- Spouse Editor (Optimistik Draf) ---------- */
function openSpouseEditor(parent, existing=null){
  if(!canManageContent()){toast("Akaun anda perlu disahkan admin dahulu");return;}
  const f = $("#form-spouse"); f.reset();
  f.parentId.value = parent.id;
  const sps = getSpouses(parent);
  if(existing){
    f.editOrder.value = existing.order||1;
    f.spouseOrder.value = existing.order||1;
    f.name.value = existing.name||"";
    f.nickname.value = existing.nickname||"";
    f.gender.value = existing.gender||"";
    f.status.value = existing.status||"hidup";
    f.birth.value = existing.birth||"";
    f.birthplace.value = existing.birthplace||"";
    f.death.value = existing.death||"";
    f.deathplace.value = existing.deathplace||"";
    f.notes.value = existing.notes||"";
    $("#spouse-title").textContent = `Edit Pasangan ${spouseOrdinal(existing.order||1)} kepada ${parent.name}`;
  } else {
    f.editOrder.value = "";
    f.spouseOrder.value = sps.length+1;
    f.gender.value = parent.gender==="L" ? "P" : parent.gender==="P" ? "L" : "";
    $("#spouse-title").textContent = `Tambah Pasangan ${spouseOrdinal(sps.length+1)} untuk ${parent.name}`;
  }
  openModal("modal-spouse");
}
$("#form-spouse").addEventListener("submit", async e=>{
  e.preventDefault();
  if(!ensureSession("menyimpan pasangan")) return;
  const fd = new FormData(e.target);
  const parent = State.nodes.find(x=>x.id===fd.get("parentId"));
  if(!parent){toast("Profil induk tidak dijumpai");return;}
  const photo = await fileToBase64(fd.get("photo"));
  const editOrder = fd.get("editOrder");
  
  let runCall;
  if(editOrder){
    const payload = {
      parentId: parent.id, order: Number(editOrder),
      name: fd.get("name"), nickname: fd.get("nickname")||"",
      gender: fd.get("gender")||"", status: fd.get("status"),
      birth: fd.get("birth")||"", birthplace: fd.get("birthplace")||"",
      death: fd.get("death")||"", deathplace: fd.get("deathplace")||"",
      notes: fd.get("notes")||"",
      newOrder: Number(fd.get("spouseOrder"))||Number(editOrder),
    };
    if(photo) payload.photo = photo;
    
    // Optimistic Update Spouse
    const rowSpouse = State.nodes.find(x => x.spouseOf === parent.id && Number(x.spouseOrder) === Number(editOrder));
    if (rowSpouse) {
       Object.assign(rowSpouse, { ...payload, isDraft: true });
       if(photo) rowSpouse.photo = "data:image/jpeg;base64,"+photo.data;
    } else if (parent.spouses) {
       const sp = parent.spouses.find(s => Number(s.order) === Number(editOrder));
       if (sp) {
          Object.assign(sp, { ...payload, isDraft: true });
          if(photo) sp.photo = "data:image/jpeg;base64,"+photo.data;
       }
    }
    
    runCall = ()=>api("editSpouse", payload);
  } else {
    const payload = {
      id: makeUUID(),
      isNew: true,
      parentId: parent.id, relation: "spouse",
      name: fd.get("name"), nickname: fd.get("nickname")||"",
      gender: fd.get("gender")||"", spouseStatus: fd.get("status"),
      birth: fd.get("birth")||"", birthplace: fd.get("birthplace")||"",
      spouseDeath: fd.get("death")||"", deathplace: fd.get("deathplace")||"",
      notes: fd.get("notes")||"", spouseOrder: fd.get("spouseOrder")||"",
      spouseOf: parent.id,
    };
    if(photo) payload.photo = photo;
    
    // Optimistic Add Spouse
    State.nodes.push({
       id: payload.id,
       spouseOf: parent.id,
       spouseOrder: payload.spouseOrder,
       name: payload.name,
       gender: payload.gender,
       status: payload.spouseStatus,
       isDraft: true,
       photo: photo ? "data:image/jpeg;base64,"+photo.data : ""
    });
    
    runCall = ()=>api("saveNode", payload);
  }
  
  buildTree();
  toast("Draf dipaparkan. Sila tekan 'Hantar Perubahan'.");
  closeModal("modal-spouse");
  queueChange({label:"Simpan pasangan", run: runCall});
});

async function delNode(n){
  const isAdmin = State.user?.role==="admin";
  const q = isAdmin ? "Padam "+n.name+"? Tindakan ini tidak boleh dibatalkan." : "Pohon admin padam "+n.name+"? Permintaan akan dihantar untuk kelulusan.";
  if(!confirm(q)) return;
  
  // Optimistic Delete
  State.nodes = State.nodes.filter(x => x.id !== n.id && x.parentId !== n.id && x.spouseOf !== n.id);
  buildTree();
  
  toast("Draf padam diletakkan di bawah.");
  queueChange({key:"del:"+n.id, label:"Padam "+n.name, run:()=>api("deleteNode",{id:n.id})});
}

/* ---------- NOTA pada peta ---------- */
function renderNotes(){
  const canvas = $("#canvas");
  $$(".map-note", canvas).forEach(el=>el.remove());
  (State.notes||[]).forEach(n=>{
    const el = document.createElement("div");
    el.className = "map-note"+(n.pending?" pending":"")+(n.pinned?" pinned":"")+(n.isDraft?" is-draft":"");
    el.dataset.noteId = n.id;
    el.style.left = (n.x||0)+"px";
    el.style.top  = (n.y||0)+"px";
    el.style.color = n.color || "var(--ink)";
    el.style.fontFamily = n.font || "Cormorant Garamond";
    el.style.fontSize = (n.size||16)+"px";
    el.innerHTML = `<span class="note-text" dir="auto">${escape(n.text||"")}</span>
      ${n.pinned?'<span class="note-pin" title="Dipin">📌</span>':''}
      ${n.isDraft?'<span class="note-pending" style="color:#059669;font-weight:bold" title="Draf Belum Simpan">DRAF</span>':(n.pending?'<span class="note-pending" title="Menunggu kelulusan">⏳</span>':'')}`;
    el.addEventListener("click",e=>{ e.stopPropagation(); openNoteCtx(e.clientX, e.clientY, n); });
    enableNoteDrag(el, n);
    canvas.appendChild(el);
  });
}
function enableNoteDrag(el, n){
  const isAdmin = State.user?.role==="admin";
  const isOwner = State.user && n.createdBy===State.user.username;
  if(n.pinned && !isAdmin) return;
  if(!isAdmin && !isOwner && !n.isDraft) return;
  el.style.cursor="move";
  let drag=null;
  el.addEventListener("pointerdown",ev=>{
    if(ev.target.closest(".note-pin")||ev.target.closest(".note-pending")) return;
    ev.stopPropagation();
    const scale = State.panzoom ? State.panzoom.getScale() : 1;
    drag={sx:ev.clientX, sy:ev.clientY, ox:parseFloat(el.style.left)||0, oy:parseFloat(el.style.top)||0, scale, moved:false};
    el.setPointerCapture(ev.pointerId);
  });
  el.addEventListener("pointermove",ev=>{
    if(!drag) return;
    const dx=(ev.clientX-drag.sx)/drag.scale, dy=(ev.clientY-drag.sy)/drag.scale;
    if(Math.abs(dx)>2||Math.abs(dy)>2) drag.moved=true;
    el.style.left=(drag.ox+dx)+"px"; el.style.top=(drag.oy+dy)+"px";
  });
  el.addEventListener("pointerup",async ev=>{
    if(!drag) return;
    const moved = drag.moved;
    const nx=parseFloat(el.style.left)||0, ny=parseFloat(el.style.top)||0;
    drag=null;
    if(moved){
      n.x = nx; n.y = ny; n.isDraft = true;
      renderNotes();
      queueChange({
        key:"note:"+n.id,
        label:"Alih nota",
        run:()=>api("saveNote",{id:n.id, text:n.text, x:n.x, y:n.y, font:n.font, size:n.size, color:n.color, pinned:n.pinned})
      });
    }
  });
}
function openNoteCtx(x,y,n){
  const m = $("#ctx-menu");
  const isAdmin = State.user?.role==="admin";
  const isOwner = State.user && n.createdBy===State.user.username;
  const canEdit = isAdmin || ((isOwner||n.isDraft) && !n.pinned);
  m.innerHTML = "";
  const items = [
    canEdit && {l:"✎ Edit Nota", fn:()=>openNoteEditor(n)},
    isAdmin && {l: n.pinned ? "📍 Buka Pin" : "📌 Pin Nota", fn:()=>togglePin(n)},
    canEdit && {l:"🗑 Padam Nota", fn:()=>deleteNote(n)},
    !n.isDraft && {l:"ℹ Info", fn:()=>showInfo(`Dicipta oleh: ${n.createdBy||"-"}\nDikemaskini: ${fmtDateTime(n.lastEditAt)}\n${n.approvedBy?"Disahkan: "+n.approvedBy:"⏳ Belum disahkan"}`,{title:"Maklumat Nota"})},
  ].filter(Boolean);
  if(!items.length) return;
  items.forEach(i=>{const b=document.createElement("button");b.textContent=i.l;b.onclick=()=>{m.classList.add("hidden");i.fn();};m.appendChild(b);});
  m.style.left = Math.min(x, innerWidth-220)+"px";
  m.style.top = Math.min(y, innerHeight-items.length*40)+"px";
  m.classList.remove("hidden");
}
function openNoteEditor(n){
  if(!canManageContent()){toast("Akaun anda perlu disahkan admin dahulu");return;}
  const f = $("#form-note"); f.reset();
  f.id.value = n?.id || "";
  f.x.value = n?.x ?? 100;
  f.y.value = n?.y ?? 100;
  f.text.value = n?.text || "";
  f.font.value = n?.font || "Cormorant Garamond";
  f.size.value = n?.size || 18;
  f.color.value = n?.color || "#3b2a14";
  f.pinned.checked = !!n?.pinned;
  $("#note-pin-admin").style.display = State.user.role==="admin" ? "" : "none";
  $("#note-title").textContent = n ? "Edit Nota" : "Tambah Nota pada Peta";
  openModal("modal-note");
}
$("#form-note").addEventListener("submit", async e=>{
  e.preventDefault();
  if(!ensureSession("menyimpan nota")) return;
  const fd = new FormData(e.target);
  const payload = {
    id: fd.get("id")||"",
    text: fd.get("text"),
    x: Number(fd.get("x"))||0, y: Number(fd.get("y"))||0,
    font: fd.get("font")||"Cormorant Garamond", size: Number(fd.get("size"))||16,
    color: fd.get("color")||"#3b2a14", pinned: State.user.role==="admin" ? !!fd.get("pinned") : false,
  };
  if(!payload.id) {
     payload.id = makeUUID();
     payload.isNew = true;
     State.notes.push({...payload, isDraft: true});
  } else {
     const n = State.notes.find(x => x.id === payload.id);
     if(n) Object.assign(n, {...payload, isDraft: true});
  }
  renderNotes();
  
  toast("Draf nota ditambahkan.");
  closeModal("modal-note");
  queueChange({key: payload.id ? "note:"+payload.id : undefined, label:"Simpan nota", run:()=>api("saveNote", payload)});
});
async function togglePin(n){
  const newPinned = !n.pinned;
  n.pinned = newPinned;
  n.isDraft = true;
  renderNotes();
  queueChange({
    key:"note:"+n.id,
    label: newPinned?"Pin nota":"Buka pin",
    run:()=>api("saveNote",{id:n.id, text:n.text, x:n.x, y:n.y, font:n.font, size:n.size, color:n.color, pinned:newPinned})
  });
}
async function deleteNote(n){
  const isAdmin = State.user?.role==="admin";
  if(!confirm(isAdmin?"Padam nota ini?":"Pohon padam nota ini? Perlu kelulusan admin.")) return;
  
  State.notes = State.notes.filter(x => x.id !== n.id);
  renderNotes();
  
  toast("Padam nota dimasukkan ke draf.");
  queueChange({key:"note-del:"+n.id, label:"Padam nota", run:()=>api("deleteNote",{id:n.id})});
}
$("#btn-add-note").addEventListener("click",()=>{
  if(!canManageContent()){toast("Akaun anda perlu disahkan admin dahulu untuk tambah nota");return;}
  State.noteAddMode = true;
  toast("Klik pada peta untuk meletakkan nota baharu");
  document.body.classList.add("note-add-cursor");
});
$("#canvas").addEventListener("click", e=>{
  if(!State.noteAddMode) return;
  const canvas = $("#canvas");
  const rect = canvas.getBoundingClientRect();
  const scale = State.panzoom ? State.panzoom.getScale() : 1;
  const x = (e.clientX - rect.left) / scale;
  const y = (e.clientY - rect.top) / scale;
  State.noteAddMode = false;
  document.body.classList.remove("note-add-cursor");
  openNoteEditor({x: Math.round(x), y: Math.round(y), text:"", font:"Cormorant Garamond", size:18, color:"#3b2a14"});
});

/* ---------- Profil Saya & Modals ---------- */
function showMyProfile(){
  if(!State.user){ openModal("modal-auth"); return; }
  const me = State.myProfile || State.user;
  const photo = fixPhoto(me.photo) || placeholder("L");
  const statusHtml = me.role==="admin"
    ? '<div class="text-[11px] mt-1 font-semibold" style="color:var(--gold-dark)">ADMIN aktif</div>'
    : me.approved
      ? `<div class="text-[11px] mt-1 font-semibold" style="color:#1e7a3b">Ahli sah • No. keahlian ${escape(me.no||"-")}</div>`
      : '<div class="text-[11px] mt-1 font-semibold" style="color:#92400e">Menunggu pengesahan admin</div>';
  $("#my-profile-body").innerHTML = `
    <div class="flex flex-col items-center mb-4">
      <img src="${photo}" onerror="this.src='${placeholder("L")}'" class="w-28 h-28 rounded-full object-cover mb-2" style="border:3px solid var(--gold)"/>
      <h2 class="text-2xl font-bold text-center serif" dir="auto">${escape(me.fullname || me.username || "-")}</h2>
      <p class="text-xs" style="color:var(--ink-soft)">@${escape(me.username || "-")}</p>
      ${statusHtml}
    </div>
    <div class="space-y-2 text-sm" dir="auto">
      ${rowField("Nama penuh", me.fullname)}
      ${rowField("Email", me.email)}
      ${rowField("Telefon", me.phone)}
      ${rowField("Nama bapa", me.fatherName)}
      ${rowField("Nama ibu", me.motherName)}
      ${me.approved ? rowField("No. keahlian sah", me.no) : ""}
      ${me.approvedAt ? rowField("Tarikh sah", fmtDateTime(me.approvedAt)) : ""}
      ${me.approvedBy ? rowField("Disahkan oleh", me.approvedBy) : ""}
    </div>
    <div class="mt-4 rounded-xl p-3 text-[12px]" style="background:rgba(148,163,184,.12);color:var(--ink-soft)">
      ${me.approved
        ? "Kad keahlian boleh dicetak melalui butang di bawah."
        : "Akaun anda akan disemak oleh mana-mana admin. Admin akan hubungi anda melalui nombor telefon yang didaftarkan untuk pengesahan. Gambar profil yang sah wajib ada sebelum akaun boleh disahkan."}
    </div>
    ${me.approved && me.role!=="admin" ? '<div class="flex gap-2 mt-4"><button class="btn btn-primary flex-1" id="btn-print-member-card">🪪 Cetak Kad Ahli</button></div>' : ""}
  `;
  openModal("modal-my-profile");
  const printBtn = document.getElementById("btn-print-member-card");
  if(printBtn) printBtn.onclick = ()=>printMemberCard(me);
}
function printMemberCard(me){
  if(!me?.approved || !me?.no){ toast("Kad ahli hanya tersedia selepas akaun disahkan"); return; }
  const photo = fixPhoto(me.photo) || placeholder("L");
  const win = window.open("", "_blank", "width=900,height=640");
  if(!win){ toast("Benarkan popup untuk mencetak kad ahli"); return; }
  win.document.write(`<!DOCTYPE html>\n<html lang="ms"><head><meta charset="UTF-8"><title>Kad Ahli</title><style>body{font-family:Inter,Arial,sans-serif;background:#f3ead5;margin:0;padding:24px;color:#2e2418}.sheet{display:flex;align-items:center;justify-content:center;min-height:100vh}.card{width:860px;max-width:100%;background:linear-gradient(145deg,#fffaf0,#edd8a8);border:3px solid #8d6921;border-radius:26px;box-shadow:0 24px 50px -24px rgba(0,0,0,.4);overflow:hidden}.top{padding:22px 28px;background:linear-gradient(135deg,#7a5a14,#b88b2a);color:#fff7dd}.brand{font-size:30px;font-weight:800;letter-spacing:.08em}.sub{font-size:14px;opacity:.92}.body{display:flex;gap:24px;padding:28px}.photo{width:180px;height:220px;border-radius:20px;object-fit:cover;border:4px solid #8d6921;background:#fff}.meta{flex:1}.name{font-size:34px;font-weight:800;line-height:1.1;margin:4px 0 14px}.row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid rgba(122,90,20,.18)}.label{font-size:13px;color:#6d5a37;text-transform:uppercase;letter-spacing:.06em}.value{font-size:18px;font-weight:700;text-align:right}.foot{padding:0 28px 28px;color:#6d5a37;font-size:13px}@media print{body{background:#fff;padding:0}.sheet{min-height:auto}.card{box-shadow:none;width:100%;border-radius:0}}</style></head><body><div class="sheet"><div class="card"><div class="top"><div class="brand">SALASILAH ELIT</div><div class="sub">Kad Keahlian Sah</div></div><div class="body"><img class="photo" src="${photo}" onerror="this.src='${placeholder("L")}'"><div class="meta"><div class="name">${escape(me.fullname || me.username || "-")}</div><div class="row"><div class="label">No. Keahlian</div><div class="value">#${escape(me.no || "-")}</div></div><div class="row"><div class="label">Username</div><div class="value">@${escape(me.username || "-")}</div></div><div class="row"><div class="label">Telefon</div><div class="value">${escape(me.phone || "-")}</div></div><div class="row"><div class="label">Disahkan oleh</div><div class="value">${escape(me.approvedBy || "-")}</div></div><div class="row"><div class="label">Tarikh sah</div><div class="value">${escape(fmtDateTime(me.approvedAt) || "-")}</div></div></div></div><div class="foot">Kad ini dijana daripada profil pengguna yang telah disahkan oleh admin.</div></div></div></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(()=>win.print(), 300);
}

$("#btn-my-profile").addEventListener("click",async()=>{
  if(!ensureSession("membuka profil anda")) return;
  await loadMyProfile(false);
  showMyProfile();
});
$("#btn-auth").addEventListener("click",()=>{
  if(State.user){
    if(confirm("Log keluar?")){clearSession(true);}
  } else openModal("modal-auth");
});
$$("#modal-auth .tab").forEach(b=>b.addEventListener("click",()=>{
  $$("#modal-auth .tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  $("#form-login").classList.toggle("hidden",b.dataset.tab!=="login");
  $("#form-register").classList.toggle("hidden",b.dataset.tab!=="register");
}));
$("#form-login").addEventListener("submit",async e=>{
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  try {
    const u = await api("login",fd);
    persistUser(u);
    updateUserUI(); closeModal("modal-auth");
    toast(u.approved ? "Selamat datang, "+u.username : "Log masuk berjaya. Akaun anda masih menunggu pengesahan admin.");
    Promise.allSettled([loadMyProfile(true), refresh()]).then(()=>updateUserUI());
  } catch(err) {showError(err,{title:"Gagal log masuk",context:"login"});}
});
$("#form-register").addEventListener("submit",async e=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const photo = await fileToBase64(fd.get("photo"));
  const data = Object.fromEntries(fd.entries()); delete data.photo;
  if(!photo){ toast("Gambar profil yang sah adalah wajib untuk pendaftaran"); return; }
  if(photo) data.photo = photo;
  try {
    await api("register",data);
    toast("Pendaftaran diterima. Admin akan hubungi anda untuk pengesahan.");
    $$("#modal-auth .tab")[0].click();
  } catch(err) {showError(err,{title:"Gagal daftar",context:"register"});}
});

function updateUserUI(){
  syncUserFromStorage();
  if(State.user?.username && !State.user?.token){
    clearSession(true);
  }
  const u = State.user;
  $("#user-info").textContent = memberStatusText(u);
  $("#btn-auth").textContent = u?"Keluar":"Log Masuk";
  $("#btn-admin").classList.toggle("hidden", u?.role!=="admin");
  $("#btn-add-note").classList.toggle("hidden", !canManageContent());
  $("#btn-my-profile").classList.toggle("hidden", !u);
  if(u?.role==="admin") refreshPendingBadge();
}
async function refreshPendingBadge(){
  try {
    const d = await api("adminData",{});
    const btn = $("#btn-admin");
    const n = (d.pending||[]).length;
    btn.innerHTML = n>0 ? `Admin <span style="background:#c0392b;color:#fff;border-radius:999px;padding:1px 6px;font-size:10px;margin-left:2px">${n}</span>` : "Admin";
  } catch(e) {}
}

/* ---------- Admin ---------- */
$("#btn-admin").addEventListener("click",async()=>{openModal("modal-admin");await loadAdmin();});
$$("#modal-admin [data-atab]").forEach(b=>b.addEventListener("click",()=>{
  $$("#modal-admin [data-atab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  ["pending","users","init"].forEach(t=>$("#admin-"+t).classList.toggle("hidden",t!==b.dataset.atab));
}));
async function loadAdmin(){
  try {
    const d = await api("adminData",{});
    const p = $("#admin-pending");
    p.innerHTML = d.pending.length?'<p class="text-[11px] mb-2" style="color:var(--ink-soft)">Sahkan dengan penghantar melalui telefon/WhatsApp sebelum LULUS.</p>':'<p class="text-sm" style="color:var(--ink-soft)">✓ Tiada item menunggu kelulusan.</p>';
    d.pending.forEach(it=>{
      const div=document.createElement("div");
      div.className="glass rounded-lg p-3 mb-2 space-y-2";
      const phoneClean = String(it.byPhone||"").replace(/[^0-9+]/g,"");
      const waNum = phoneClean.replace(/^\+/,"").replace(/^0/,"60");
      const actLabel = {add:"➕ TAMBAH",edit:"✎ EDIT",delete:"🗑 PADAM",spouse:"💍 PASANGAN","note-add":"📝 NOTA BARU","note-edit":"✎ EDIT NOTA","note-delete":"🗑 PADAM NOTA"}[it.action]||it.action;
      div.innerHTML = `
        <div class="flex justify-between items-start gap-2">
          <div class="text-sm flex-1 min-w-0">
            <div><span class="px-2 py-0.5 rounded text-[10px] font-bold" style="background:var(--gold-dark);color:#fff8e3">${actLabel}</span>
              <span class="ml-1">${escape(it.summary)}</span></div>
            <div class="text-xs mt-1" style="color:var(--ink-soft)">Penghantar: <b style="color:var(--ink)">${escape(it.by)}</b> ${it.byFullname?'('+escape(it.byFullname)+')':''}</div>
            ${it.byPhone?`<div class="text-xs">📞 ${escape(it.byPhone)}</div>`:'<div class="text-xs" style="color:#c0392b">⚠ Tiada no. telefon</div>'}
            <div class="text-[10px]" style="color:var(--ink-soft)">${escape(fmtDateTime(it.createdAt))}</div>
          </div>
        </div>
        <div class="flex gap-1 flex-wrap">
          ${phoneClean?`<a href="tel:${phoneClean}" class="btn btn-ghost text-xs">📞 Telefon</a>`:''}
          ${waNum?`<a href="https://wa.me/${waNum}" target="_blank" class="btn btn-ghost text-xs">💬 WhatsApp</a>`:''}
          <button data-act="ok" class="btn btn-primary text-xs flex-1">✓ Lulus</button>
          <button data-act="no" class="btn btn-ghost text-xs flex-1" style="color:#c0392b">✕ Tolak</button>
        </div>`;
      div.querySelector('[data-act="ok"]').onclick=async()=>{
        try{ await api("moderate",{id:it.id,decision:"approve"}); showInfo("Diluluskan"); loadAdmin(); refresh(); }
        catch(e){ showError(e,{title:"Gagal lulus",context:"moderate"}); }
      };
      div.querySelector('[data-act="no"]').onclick=async()=>{
        if(!confirm("Tolak permintaan ini?")) return;
        try{ await api("moderate",{id:it.id,decision:"reject"}); showInfo("Ditolak"); loadAdmin(); refresh(); }
        catch(e){ showError(e,{title:"Gagal tolak",context:"moderate"}); }
      };
      p.appendChild(div);
    });
    const isMaster = !!d.isMaster;
    const u=$("#admin-users");
    u.innerHTML = `<p class="text-[11px] mb-2" style="color:var(--ink-soft)">${isMaster?'Anda Master Admin — boleh lantik admin & sekat sesiapa sahaja.':'Anda admin — boleh sekat pengguna ahli sahaja.'}</p>`;
    const list = document.createElement("div");
    list.className = "space-y-2";
    d.users.forEach(x=>{
      const isMasterRow = x.username === "admin";
      const phoneClean = String(x.phone||"").replace(/[^0-9+]/g,"");
      const waNum = phoneClean.replace(/^\+/,"").replace(/^0/,"60");
      const canApproveUser = !isMasterRow && x.role !== "admin" && !x.approved;
      const card = document.createElement("div");
      card.className = "glass rounded-lg p-3 text-xs space-y-1";
      card.innerHTML = `
        <div class="flex justify-between items-start gap-2">
          <img src="${fixPhoto(x.photo)||placeholder('L')}" onerror="this.src='${placeholder('L')}'" style="width:58px;height:58px;border-radius:14px;object-fit:cover;border:2px solid var(--line-soft);flex-shrink:0"/>
          <div class="min-w-0 flex-1">
            <div class="font-semibold" style="color:var(--ink)" dir="auto">${x.approved?`#${escape(x.no||"-")} `:'<span style="color:#92400e">[Menunggu] </span>'}${escape(x.fullname||x.username)} ${isMasterRow?'<span style="color:var(--gold-dark)">👑</span>':''}</div>
            <div style="color:var(--ink-soft)" dir="auto">@${escape(x.username)} • ${x.role==='admin'?'<b style="color:var(--gold-dark)">ADMIN</b>':'Ahli'} ${x.approved?'• <b style="color:#1e7a3b">SAH</b>':'• <b style="color:#92400e">BELUM SAH</b>'} ${x.banned?'• <b style="color:#c0392b">DISEKAT</b>':''}</div>
            ${x.phone?`<div>📞 ${escape(x.phone)}</div>`:'<div style="color:#c0392b">⚠ Tiada no. telefon</div>'}
            ${x.email?`<div style="color:var(--ink-soft)">✉ ${escape(x.email)}</div>`:''}
            <div class="mt-1" dir="auto">👨 Bapa: <b>${escape(x.fatherName||'—')}</b></div>
            <div dir="auto">👩 Ibu: <b>${escape(x.motherName||'—')}</b></div>
            <div dir="auto">${x.photo?`🖼 Gambar profil diterima`:'<span style="color:#c0392b">⚠ Tiada gambar profil</span>'}</div>
            ${x.approvedAt?`<div style="color:var(--ink-soft)">✅ Disahkan pada ${escape(fmtDateTime(x.approvedAt))}${x.approvedBy?` oleh ${escape(x.approvedBy)}`:''}</div>`:'<div style="color:#92400e">⏳ Tunggu admin hubungi untuk pengesahan</div>'}
          </div>
        </div>
        <div class="flex flex-wrap gap-1 pt-1">
          ${phoneClean?`<a href="tel:${phoneClean}" class="btn btn-ghost text-[11px]">📞</a>`:''}
          ${waNum?`<a href="https://wa.me/${waNum}" target="_blank" class="btn btn-ghost text-[11px]">💬 WA</a>`:''}
          ${canApproveUser?`<button data-act="approve" class="btn btn-primary text-[11px]">✓ Sahkan Akaun</button>`:''}
          ${(!isMasterRow && isMaster)?`<button data-act="role" class="btn btn-ghost text-[11px]">${x.role==='admin'?'⬇ Turun Ahli':'⬆ Lantik Admin'}</button>`:''}
          ${(!isMasterRow && (isMaster || x.role!=='admin'))?`<button data-act="ban" class="btn btn-ghost text-[11px]" style="color:${x.banned?'#1e7a3b':'#c0392b'}">${x.banned?'🔓 Buka Sekatan':'🚫 Sekat'}</button>`:''}
        </div>`;
      const ab = card.querySelector('[data-act="approve"]');
      if (ab) ab.onclick = async()=>{
        if(!x.photo){ showWarn("Pengguna ini belum ada gambar profil yang sah."); return; }
        if(!confirm(`Sahkan akaun @${x.username}? Nombor keahlian sah akan dijana.`)) return;
        try { await api("setUserApproval",{username:x.username, approved:true}); showInfo("Akaun pengguna disahkan"); loadAdmin(); refresh(); }
        catch(e) { showError(e,{title:"Gagal sahkan pengguna",context:"setUserApproval"}); }
      };
      const rb = card.querySelector('[data-act="role"]');
      if (rb) rb.onclick = async()=>{
        const newRole = x.role==='admin'?'ahli':'admin';
        if(!confirm(`Tukar peranan @${x.username} kepada ${newRole.toUpperCase()}?`)) return;
        try { await api("setRole",{username:x.username, role:newRole}); showInfo("Peranan dikemaskini"); loadAdmin(); }
        catch(e) { showError(e,{title:"Gagal tukar peranan",context:"setRole"}); }
      };
      const bb = card.querySelector('[data-act="ban"]');
      if (bb) bb.onclick = async()=>{
        const next = !x.banned;
        if(!confirm(`${next?'SEKAT':'BUKA SEKATAN'} @${x.username}?`)) return;
        try { await api("setBan",{username:x.username, banned:next}); showInfo(next?"Disekat":"Sekatan dibuka"); loadAdmin(); }
        catch(e) { showError(e,{title:"Gagal kemaskini sekatan",context:"setBan"}); }
      };
      list.appendChild(card);
    });
    u.appendChild(list);
  } catch(e) {showError(e,{title:"Gagal muat panel admin",context:"adminData"});}
}

$("#btn-init-root").addEventListener("click",async()=>{
  const name = $("#root-name").value.trim();
  if(!name) return;
  const hanging = $("#root-hanging")?.checked || false;
  try {
    await api("initRoot",{name, hanging});
    showInfo(hanging ? "Root tergantung dicipta — boleh disambung kemudian" : "Root utama berjaya dicipta");
    closeModal("modal-admin");
    refresh();
  } catch(e) {
    if(String(e.message).includes("Root utama sudah wujud")){
      showWarn("Root utama sudah wujud. Tandakan 'Root Tergantung' untuk cipta cabang sampingan.");
    } else { showError(e,{title:"Gagal cipta root",context:"initRoot"}); }
  }
});

/* ---------- Settings & Tema ---------- */
const THEMES = [
  {id:"parchment", name:"📜 Parchment Klasik"},
  {id:"royal",     name:"👑 Royal Navy"},
  {id:"emerald",   name:"🌿 Emerald Hutan"},
  {id:"rose",      name:"🌹 Rose Garden"},
  {id:"midnight",  name:"🌙 Midnight Gold"},
];
function applyTheme(id){
  const t = THEMES.find(x=>x.id===id) ? id : "parchment";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
}
function initSettingsUI(){
  const wrap = $("#theme-list"); if(!wrap) return;
  const current = localStorage.getItem("theme") || "parchment";
  wrap.innerHTML = "";
  const isMaster = State.user?.isMaster === true || State.user?.username === "admin";
  THEMES.forEach(t=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn "+(t.id===current?"btn-primary":"btn-ghost")+" w-full text-left";
    b.textContent = t.name + (t.id===current?"  ✓":"");
    b.disabled = !isMaster;
    b.onclick = ()=>{ applyTheme(t.id); initSettingsUI(); showInfo("Tema ditukar: "+t.name); };
    wrap.appendChild(b);
  });
}
$("#btn-settings").addEventListener("click",()=>{ initSettingsUI(); openModal("modal-settings"); });

/* ---------- Panzoom ---------- */
function initPanzoom(){
  const el = $("#canvas");
  State.panzoom = Panzoom(el,{
    maxScale: 4, minScale: 0.05, step: 0.15,
    canvas: true, contain: false, cursor: "grab",
    excludeClass: "map-note",
  });
  $("#stage").addEventListener("wheel", e => State.panzoom.zoomWithWheel(e, {step:0.15}));
  $("#btn-zoom-in").onclick=()=>State.panzoom.zoomIn();
  $("#btn-zoom-out").onclick=()=>State.panzoom.zoomOut();
  $("#btn-reset").onclick=()=>centerOnTree();
}

function centerOnTree(){
  if(!State.panzoom) return;
  const target = document.querySelector(".node.root") || document.querySelector(".node");
  if(!target){ State.panzoom.reset(); return; }
  State.panzoom.reset({ animate:false });
  requestAnimationFrame(()=>{
    const stage = $("#stage");
    const sRect = stage.getBoundingClientRect();
    const nRect = target.getBoundingClientRect();
    const scale = State.panzoom.getScale() || 1;
    const pan = State.panzoom.getPan();
    const dx = (sRect.left + sRect.width/2) - (nRect.left + nRect.width/2);
    const dy = (sRect.top + 140) - (nRect.top);
    State.panzoom.pan(pan.x + dx/scale, pan.y + dy/scale, {animate:true});
  });
}

/* ---------- Carian ---------- */
$("#btn-search").addEventListener("click",()=>{
  const bar = $("#search-bar");
  bar.classList.toggle("hidden");
  if(!bar.classList.contains("hidden")) $("#search-input").focus();
});
$("#search-close").addEventListener("click",()=>{ $("#search-bar").classList.add("hidden");clearHighlights();});
$("#search-input").addEventListener("input",e=>runSearch(e.target.value));
$("#search-next").addEventListener("click",()=>stepSearch(1));
$("#search-prev").addEventListener("click",()=>stepSearch(-1));
$("#search-input").addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();stepSearch(e.shiftKey?-1:1);}
  if(e.key==="Escape"){$("#search-bar").classList.add("hidden");clearHighlights();}
});

function runSearch(q){
  clearHighlights();
  q = q.trim().toLowerCase();
  if(!q){State.searchResults=[];$("#search-count").textContent="0/0";return;}
  State.searchResults = State.nodes.filter(n=>{
    const sp = getSpouses(n).map(s=>s.name).join(" ");
    const hay = [n.name,n.nickname,n.no,n.birth,n.death,n.birthplace,n.deathplace,n.notes,sp].join(" ").toLowerCase();
    return hay.includes(q);
  });
  State.searchIndex = 0;
  if(State.searchResults.length){
    $("#search-count").textContent = `1/${State.searchResults.length}`;
    focusNode(State.searchResults[0]);
  } else {
    $("#search-count").textContent = `0/0`;
    toast("Tiada padanan");
  }
}
function stepSearch(dir){
  if(!State.searchResults.length) return;
  State.searchIndex = (State.searchIndex + dir + State.searchResults.length) % State.searchResults.length;
  $("#search-count").textContent = `${State.searchIndex+1}/${State.searchResults.length}`;
  focusNode(State.searchResults[State.searchIndex]);
}
function clearHighlights(){
  $$(".node.highlight").forEach(el=>el.classList.remove("highlight"));
}
function focusNode(n){
  clearHighlights();
  const el = document.querySelector(`.node[data-node-id="${n.id}"]`);
  if(!el || !State.panzoom) return;
  el.classList.add("highlight");
  const stage = $("#stage");
  const sRect = stage.getBoundingClientRect();
  const nRect = el.getBoundingClientRect();
  const scale = State.panzoom.getScale();
  const targetScale = Math.max(0.9, Math.min(scale, 1.4));
  const pan = State.panzoom.getPan();
  const dx = (sRect.left + sRect.width/2) - (nRect.left + nRect.width/2);
  const dy = (sRect.top + sRect.height/2) - (nRect.top + nRect.height/2);
  State.panzoom.zoom(targetScale, {animate:true});
  setTimeout(()=>{
    State.panzoom.pan(pan.x + dx/scale, pan.y + dy/scale, {animate:true});
  }, 50);
}

/* ---------- Refresh ---------- */
async function refresh(){
  setLoading(true, "Sila tunggu sementara maklumat keluarga dipaparkan.");
  try {
    const d = await api("getTree",{});
    State.nodes = d.nodes||[];
    State.notes = d.notes||[];
    State.users = d.users||[];
    checkApiVersion(d.apiVersion || "");
    if(State.user) await loadMyProfile(true);
    buildTree();
    setTimeout(centerOnTree, 60);
    if(State.user?.role==="admin") refreshPendingBadge();
  } catch(e) { 
    showError(e,{title:"Gagal memuat salasilah",context:"getTree"}); 
    const host=$("#tree-root"); 
    if(host) host.innerHTML='<p class="text-center mt-32 serif text-lg" style="color:var(--ink-soft)">Gagal memuat data. Sila lihat notifikasi ralat di atas.</p>'; 
  } finally { 
    setLoading(false); 
  }
}

/* ---------- Boot ---------- */
window.addEventListener("DOMContentLoaded",()=>{
  syncUserFromStorage();
  applyTheme(localStorage.getItem("theme") || "parchment");
  initPanzoom(); updateUserUI();
  refresh();
});
