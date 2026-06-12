/* ================================================================
   Salasilah Keluarga Elit — app.js
   Front-end logic: auth, kanvas pokok, pasangan, anak, nota,
   admin, carian, PWA, segerak offline.
   ================================================================ */

// ====== KONFIGURASI ======
// 🔗 Tampal URL Web App Google Apps Script anda di sini:
const API_URL = "https://script.google.com/macros/s/PASTE_DEPLOY_ID_DI_SINI/exec";

// ====== UTILITI ======
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => 'id_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toast(msg, ms=3000){
  const t = $('#toast'); t.textContent = msg; t.style.display='block';
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.style.display='none', ms);
}

async function sha256(text){
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

const STORE = {
  get user(){ try{return JSON.parse(localStorage.getItem('skg_user')||'null')}catch{return null} },
  set user(v){ v? localStorage.setItem('skg_user', JSON.stringify(v)) : localStorage.removeItem('skg_user') },
  get cache(){ try{return JSON.parse(localStorage.getItem('skg_cache')||'{}')}catch{return {}} },
  set cache(v){ localStorage.setItem('skg_cache', JSON.stringify(v)) },
  get queue(){ try{return JSON.parse(localStorage.getItem('skg_queue')||'[]')}catch{return []} },
  set queue(v){ localStorage.setItem('skg_queue', JSON.stringify(v)) },
  get theme(){ return localStorage.getItem('skg_theme') || 'parchment' },
  set theme(v){ localStorage.setItem('skg_theme', v); document.body.dataset.theme = v }
};

document.body.dataset.theme = STORE.theme;

// ====== API ======
const LOCAL_MODE = !API_URL || API_URL.includes('PASTE_DEPLOY_ID_DI_SINI');

// ---- Local backend (fallback bila API_URL belum disiapkan) ----
const LOCAL = {
  get db(){
    try{ return JSON.parse(localStorage.getItem('skg_localdb')||'null') || this._seed(); }
    catch{ return this._seed(); }
  },
  set db(v){ localStorage.setItem('skg_localdb', JSON.stringify(v)); },
  _seed(){
    const db = {
      users: [{ username:'admin', fullName:'Pentadbir Utama', email:'', phone:'',
                password:'101010', role:'master', approved:true, token:'', createdAt: new Date().toISOString() }],
      members:[], spouses:[], children:[], notes:[], pending:[]
    };
    localStorage.setItem('skg_localdb', JSON.stringify(db));
    return db;
  }
};
function _tok(){ return Math.random().toString(36).slice(2)+Date.now().toString(36)+Math.random().toString(36).slice(2); }
function _auth(body, opts={}){
  const db = LOCAL.db;
  if(!body.username || !body.token){
    if(opts.optional) return { db, u:null, isAdmin:false, isMaster:false, isGuest:true };
    throw new Error('Tidak dibenarkan — sila log masuk.');
  }
  const u = db.users.find(x => x.username===body.username && x.token && x.token===body.token);
  if(!u){
    if(opts.optional) return { db, u:null, isAdmin:false, isMaster:false, isGuest:true };
    throw new Error('Sesi tamat — sila log masuk semula.');
  }
  return { db, u, isAdmin: u.role==='admin'||u.role==='master', isMaster: u.role==='master', isGuest:false };
}

const LOCAL_HANDLERS = {
  register(b){
    const db = LOCAL.db;
    const username = String(b.username||'').trim();
    const password = String(b.password||'');
    if(username.length<3) throw new Error('Nama pengguna minima 3 aksara.');
    if(password.length<6) throw new Error('Kata laluan minima 6 aksara.');
    if(db.users.find(u=>u.username===username)) throw new Error('Nama pengguna telah digunakan.');
    db.users.push({ username, fullName:b.fullName||'', email:b.email||'', phone:b.phone||'',
                    password, role:'user', approved:false, token:'', createdAt:new Date().toISOString() });
    LOCAL.db = db; return { ok:true };
  },
  login(b){
    const db = LOCAL.db;
    const u = db.users.find(x => x.username===b.username);
    if(!u || u.password !== String(b.password||'')) throw new Error('Nama pengguna atau kata laluan salah.');
    if(!u.approved && u.role!=='master') throw new Error('Akaun anda masih menunggu kelulusan pentadbir.');
    u.token = _tok(); LOCAL.db = db;
    return { ok:true, username:u.username, role:u.role, token:u.token, fullName:u.fullName };
  },
  bootstrap(b){
    const { db, isAdmin, isMaster, isGuest } = _auth(b, {optional:true});
    return { ok:true, data:{
      members: db.members, spouses: db.spouses, children: db.children, notes: db.notes,
      pending: isAdmin ? db.pending.filter(p=>p.status==='pending') : [],
      pendingUsers: isAdmin ? db.users.filter(x=>!x.approved && x.role!=='master').map(x=>({username:x.username,fullName:x.fullName,email:x.email,phone:x.phone,createdAt:x.createdAt})) : [],
      users: isMaster ? db.users.filter(x=>x.role!=='master').map(x=>({username:x.username,fullName:x.fullName,role:x.role,approved:x.approved})) : []
    }};
  },
  approveUser(b){ const {db,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.');
    const u = db.users.find(x=>x.username===b.target); if(!u) throw new Error('Pengguna tidak dijumpai.');
    u.approved = true; LOCAL.db=db; return {ok:true};
  },
  rejectUser(b){ const {db,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.');
    db.users = db.users.filter(x=>!(x.username===b.target && !x.approved));
    LOCAL.db=db; return {ok:true};
  },
  setRole(b){ const {db,isMaster}=_auth(b); if(!isMaster) throw new Error('Hanya pentadbir utama boleh tukar peranan.');
    const u = db.users.find(x=>x.username===b.username); if(!u) throw new Error('Pengguna tidak dijumpai.');
    if(u.role==='master') throw new Error('Tidak boleh ubah pentadbir utama.');
    if(!['user','admin'].includes(b.role)) throw new Error('Peranan tidak sah.');
    u.role = b.role; LOCAL.db=db; return {ok:true};
  },
  addMember(b){ const {db,u,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir boleh tambah ahli.');
    const rec = { id:b.id, name:b.name, gender:b.gender||'M', alive:b.alive!==false,
      birth:b.birth||'', death:b.death||'', place:b.place||'',
      photo: b.photoB64 ? 'data:'+(b.photoMime||'image/jpeg')+';base64,'+b.photoB64 : '',
      notes:b.notes||'', editedBy:u.username, editedAt:new Date().toISOString() };
    db.members.push(rec); LOCAL.db=db; return {ok:true};
  },
  editMember(b){ const {db,u,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir boleh edit.');
    const i=db.members.findIndex(m=>m.id===b.id);
    if(i<0) throw new Error('Ahli tidak dijumpai.');
    db.members[i] = { ...db.members[i], ...b, editedBy:u.username, editedAt:new Date().toISOString() };
    delete db.members[i].token; delete db.members[i].action;
    LOCAL.db=db; return {ok:true};
  },
  deleteMember(b){ const {db,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir boleh padam.');
    db.members = db.members.filter(m=>m.id!==b.id);
    db.spouses = db.spouses.filter(s=>s.husbandId!==b.id && s.wifeId!==b.id);
    db.children = db.children.filter(c=>c.childId!==b.id);
    LOCAL.db=db; return {ok:true};
  },
  addSpouse(b){ const {db,u,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.'); db.spouses.push({id:b.id||_tok(),husbandId:b.husbandId,wifeId:b.wifeId,status:b.status||'kahwin',marriageDate:b.marriageDate||'',divorceDate:b.divorceDate||'',deathDate:b.deathDate||'',editedBy:u.username,editedAt:new Date().toISOString()}); LOCAL.db=db; return {ok:true}; },
  addChild(b){ const {db,u,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.'); db.children.push({spouseId:b.spouseId,childId:b.childId,editedBy:u.username,editedAt:new Date().toISOString()}); LOCAL.db=db; return {ok:true}; },
  addNote(b){ const {db,u,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.'); db.notes.push({id:b.id||_tok(),text:b.text||'',x:b.x||0,y:b.y||0,font:b.font||'serif',size:b.size||14,color:b.color||'#000',pinned:!!b.pinned,editedBy:u.username,editedAt:new Date().toISOString()}); LOCAL.db=db; return {ok:true}; },
  editNote(b){ const {db,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.'); const i=db.notes.findIndex(n=>n.id===b.id); if(i>=0){ db.notes[i]={...db.notes[i],...b}; LOCAL.db=db; } return {ok:true}; },
  deleteNote(b){ const {db,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.'); db.notes = db.notes.filter(n=>n.id!==b.id); LOCAL.db=db; return {ok:true}; },
  approve(b){ const {db,u,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.'); const p=db.pending.find(x=>x.id===b.id); if(p){ p.status='approved'; p.approvedBy=u.username; if(p.action==='addMember') db.members.push(p.payload); LOCAL.db=db; } return {ok:true}; },
  reject(b){ const {db,u,isAdmin}=_auth(b); if(!isAdmin) throw new Error('Hanya pentadbir.'); const p=db.pending.find(x=>x.id===b.id); if(p){ p.status='rejected'; p.approvedBy=u.username; LOCAL.db=db; } return {ok:true}; }
};

async function api(action, payload={}){
  const u = STORE.user;
  const body = { action, ...payload, username: u?.username, token: u?.token };

  // Mod tempatan — jalan tanpa Google Apps Script
  if(LOCAL_MODE){
    const h = LOCAL_HANDLERS[action];
    if(!h) return { ok:true };
    try{ return h(body); }
    catch(err){ throw err; }
  }

  try{
    const res = await fetch(API_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(body)
    });
    const j = await res.json();
    if(!j.ok && j.error) throw new Error(j.error);
    return j;
  }catch(err){
    if(['addMember','editMember','deleteMember','addSpouse','addChild','addNote','editNote','approve','reject'].includes(action)){
      const q = STORE.queue; q.push({action, payload, ts:Date.now()}); STORE.queue = q;
      toast("Tiada internet — perubahan disimpan & akan disegerakkan.");
    }
    throw err;
  }
}

async function flushQueue(){
  let q = STORE.queue; if(!q.length) return;
  const left=[];
  for(const item of q){
    try{ await api(item.action, item.payload); }
    catch{ left.push(item); }
  }
  STORE.queue = left;
  if(q.length && !left.length) toast("Segerak siap.");
}
window.addEventListener('online', flushQueue);
navigator.serviceWorker?.addEventListener?.('message', e=>{ if(e.data?.type==='SYNC_NOW') flushQueue(); });

// ====== SPLASH PETUA ======
const TIPS = [
  "Klik kad ahli untuk pilihan lengkap.",
  "Tekan + atau pinch untuk zoom kanvas.",
  "Cari nama atau tahun di bar carian.",
  "Pentadbir boleh lulus perubahan dengan satu klik.",
  "Tarikh boleh ditulis 'lebih kurang 1950'.",
  "Setiap pasangan ada ID khas — anak tak akan tersilap cabang."
];
let tipIdx=0;
const tipTimer = setInterval(()=>{ tipIdx=(tipIdx+1)%TIPS.length; const el=$('#tip'); if(el) el.textContent="Petua: "+TIPS[tipIdx]; }, 2200);

// ====== DATA NEGERI ======
let DATA = { members:[], spouses:[], children:[], notes:[], pending:[], users:[] };
const NODE_W = 220, NODE_H = 170, GAP_X = 60, GAP_Y = 120;

// ====== AUTH UI ======
function openModal(html){
  $('#modal').innerHTML = html;
  $('#scrim').classList.add('show');
}
function closeModal(){ $('#scrim').classList.remove('show'); }
$('#scrim').addEventListener('click', e=>{ if(e.target.id==='scrim') closeModal(); });

function loginForm(){
  openModal(`
    <div class="flex items-center justify-between mb-3">
      <div class="font-head text-2xl">Selamat Datang</div>
      <div class="chip gold-edge">v1.0</div>
    </div>
    <div class="flex gap-2 mb-4">
      <button class="tab active" data-tab="login">Log Masuk</button>
      <button class="tab" data-tab="reg">Daftar Baru</button>
    </div>
    <div id="tabBody"></div>
  `);
  const body = $('#tabBody');
  const renderLogin = ()=> body.innerHTML = `
    <div class="field"><label>Nama pengguna</label><input id="lu" autocomplete="username"/></div>
    <div class="field"><label>Kata laluan</label><input id="lp" type="password" autocomplete="current-password" placeholder="••••••"/></div>
    <button class="btn gold-edge w-full justify-center" id="doLogin">Log Masuk</button>
    <p class="text-xs ink-soft mt-3">Belum ada akaun? Klik tab <b>Daftar Baru</b>. Akaun anda perlu diluluskan pentadbir sebelum boleh digunakan.</p>
  `;
  const renderReg = ()=> body.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div class="field"><label>Nama penuh</label><input id="rname"/></div>
      <div class="field"><label>Nama pengguna</label><input id="ru"/></div>
      <div class="field"><label>Emel</label><input id="remail" type="email"/></div>
      <div class="field"><label>Telefon</label><input id="rphone"/></div>
      <div class="field"><label>Kata laluan</label><input id="rp" type="password"/></div>
      <div class="field"><label>Sahkan kata laluan</label><input id="rp2" type="password"/></div>
      <div class="field"><label>Nama bapa (untuk padanan)</label><input id="rfather"/></div>
      <div class="field"><label>Nama ibu (untuk padanan)</label><input id="rmother"/></div>
    </div>
    <button class="btn gold-edge w-full justify-center mt-2" id="doReg">Daftar Akaun</button>
  `;
  renderLogin();
  $$('.tab', $('#modal')).forEach(b=> b.onclick = ()=>{
    $$('.tab', $('#modal')).forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    b.dataset.tab==='login' ? renderLogin() : renderReg();
    bindAuth();
  });
  function bindAuth(){
    const dl = $('#doLogin'); if(dl) dl.onclick = doLogin;
    const dr = $('#doReg'); if(dr) dr.onclick = doRegister;
  }
  bindAuth();
}

async function doLogin(){
  const u = $('#lu').value.trim(), p = $('#lp').value;
  if(!u || !p) return toast("Sila isi nama pengguna & kata laluan.");
  try{
    const r = await api('login', { username:u, password:p });
    STORE.user = { username:r.username, role:r.role, token:r.token, fullName:r.fullName };
    toast("Selamat datang, "+(r.fullName||u)+"!");
    closeModal(); await boot();
  }catch(e){ toast("Gagal log masuk: "+e.message); }
}
async function doRegister(){
  const o = {
    fullName:$('#rname').value.trim(), username:$('#ru').value.trim(),
    email:$('#remail').value.trim(), phone:$('#rphone').value.trim(),
    password:$('#rp').value, password2:$('#rp2').value,
    fatherName:$('#rfather').value.trim(), motherName:$('#rmother').value.trim()
  };
  if(!o.username || !o.password) return toast("Nama pengguna & kata laluan wajib.");
  if(o.password!==o.password2) return toast("Kata laluan tidak sepadan.");
  if(o.password.length<6) return toast("Kata laluan minima 6 aksara.");
  try{
    const r = await api('register', o);
    toast("Akaun didaftar. Sila tunggu kelulusan pentadbir sebelum log masuk.");
    closeModal();
  }catch(e){ toast("Gagal daftar: "+e.message); }
}

// ====== AKAUN (ikon 👤) ======
$('#btnAccount').onclick = ()=>{
  const u = STORE.user;
  if(!u){ loginForm(); return; }
  const isAdmin = ['admin','master'].includes(u.role);
  openModal(`
    <div class="font-head text-2xl mb-3">Akaun Saya</div>
    <div class="bevel-soft rounded-lg p-3 mb-3">
      <div><b>${escapeHtml(u.fullName||u.username)}</b></div>
      <div class="text-xs ink-soft">${escapeHtml(u.username)} • ${escapeHtml(u.role)}</div>
    </div>
    <div class="grid grid-cols-1 gap-2">
      ${isAdmin?'<button class="btn btn-ghost justify-start" id="acProfile">👤 Padankan profil dengan kad</button>':''}
      <button class="btn btn-ghost justify-start" style="color:var(--danger)" id="acLogout">🚪 Log Keluar</button>
    </div>
    <div class="text-right mt-3"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>
  `);
  const lp = $('#acProfile'); if(lp) lp.onclick = ()=>{ closeModal(); openProfile(); };
  $('#acLogout').onclick = ()=>{ STORE.user=null; toast("Log keluar berjaya."); location.reload(); };
};

// ====== TETAPAN ======
$('#btnSettings').onclick = ()=>{
  const themes = [
    {id:'parchment', nm:'Parchment (krim + emas)'},
    {id:'royal', nm:'Royal (biru gelap + emas)'},
    {id:'emerald', nm:'Emerald (hijau zaitun)'},
    {id:'rose', nm:'Rose (merah jambu)'},
    {id:'midnight', nm:'Midnight (hitam + emas)'},
  ];
  openModal(`
    <div class="font-head text-2xl mb-3">Tetapan</div>
    <div class="field"><label>Tema warna</label>
      <select id="themeSel">
        ${themes.map(t=>`<option value="${t.id}" ${STORE.theme===t.id?'selected':''}>${t.nm}</option>`).join('')}
      </select>
    </div>
    <button class="btn gold-edge" id="saveTheme">Simpan</button>
    <button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button>
  `);
  $('#saveTheme').onclick = ()=>{ STORE.theme = $('#themeSel').value; toast("Tema dikemaskini."); closeModal(); };
};
window.closeModalGlobal = closeModal;

// ====== BOOT ======
function applyRoleUI(){
  const u = STORE.user;
  const isAdmin = !!u && (u.role==='admin' || u.role==='master');
  $('#btnAdmin').style.display = isAdmin ? '' : 'none';
  $('#btnAddNote').style.display = isAdmin ? '' : 'none';
}

async function boot(){
  if(LOCAL_MODE){ console.warn('[SKG] Mod Tempatan aktif — data disimpan di pelayar sahaja.'); }
  applyRoleUI();
  try{
    const r = await api('bootstrap');
    DATA = { ...DATA, ...r.data };
    STORE.cache = DATA;
  }catch(e){
    DATA = { ...DATA, ...(STORE.cache||{}) };
  }
  renderAll();
  updatePendingBadge();
  setTimeout(()=>{ $('#splash').style.display='none'; clearInterval(tipTimer); }, 400);
  flushQueue();
}

// ====== AUTO LAYOUT ======
/* Algoritma ringkas:
   - Cari akar (tiada bapa/ibu). Setiap akar ke kolum sendiri.
   - Layout rekursif: untuk setiap orang, susun anak di bawah.
   - Pasangan diletak sebelah.
*/
function buildLayout(){
  const byId = Object.fromEntries(DATA.members.map(m=>[m.id, m]));
  const childMap = {}; // parentId -> [memberId]
  DATA.children.forEach(c=>{
    // c.spouseId -> couple, get suami & isteri sebagai parents
    const sp = DATA.spouses.find(s=>s.id===c.spouseId);
    if(!sp) return;
    [sp.husbandId, sp.wifeId].forEach(pid=>{
      if(!pid) return;
      (childMap[pid] ||= []).push(c.childId);
    });
  });

  const placed = {};
  const roots = DATA.members.filter(m => !DATA.children.find(c=>c.childId===m.id));
  let cursorX = 200;
  const baseY = 220;

  function place(memberId, depth, startX){
    if(placed[memberId]) return placed[memberId].x + NODE_W;
    const m = byId[memberId]; if(!m) return startX;
    // pasangan-pasangan
    const spouseRecs = DATA.spouses.filter(s=>s.husbandId===memberId || s.wifeId===memberId);
    const partners = spouseRecs.map(s => s.husbandId===memberId ? s.wifeId : s.husbandId).filter(Boolean).map(id=>byId[id]).filter(Boolean);
    const kids = Array.from(new Set((childMap[memberId]||[])));
    let x = startX;
    // letak anak dahulu untuk dapat width
    let childrenStart = x;
    let childrenEnd = x;
    if(kids.length){
      let cx = x;
      kids.forEach(kid=>{
        const used = place(kid, depth+1, cx);
        cx = used + GAP_X;
      });
      childrenStart = placed[kids[0]].x;
      childrenEnd   = placed[kids[kids.length-1]].x + NODE_W;
    }
    // Lebar diri + pasangan
    const selfWidth = NODE_W + partners.length*(NODE_W+GAP_X);
    const totalWidth = Math.max(selfWidth, childrenEnd - childrenStart);
    const baseX = kids.length ? (childrenStart + childrenEnd)/2 - selfWidth/2 : x;
    placed[memberId] = { x: baseX, y: baseY + depth*(NODE_H+GAP_Y) };
    partners.forEach((p,i)=>{
      placed[p.id] = { x: baseX + (i+1)*(NODE_W+GAP_X), y: placed[memberId].y };
    });
    return Math.max(x + totalWidth + GAP_X, childrenEnd + GAP_X);
  }

  roots.forEach(r=>{ cursorX = place(r.id, 0, cursorX); cursorX += GAP_X*2; });

  // sesiapa yang terlepas
  DATA.members.forEach(m=>{
    if(!placed[m.id]){ placed[m.id] = { x: cursorX, y: baseY }; cursorX += NODE_W + GAP_X; }
  });

  return placed;
}

// ====== RENDER ======
let panzoomInstance = null;
function renderAll(){
  const layout = buildLayout();
  renderNodes(layout);
  renderLinks(layout);
  renderNotes();
  setupPanzoom();
}

function renderNodes(layout){
  const wrap = $('#nodes'); wrap.innerHTML='';
  DATA.members.forEach(m=>{
    const pos = layout[m.id] || {x:200,y:200};
    const el = document.createElement('div');
    el.className = `node ${m.gender==='F'?'female':'male'} ${m.alive===false?'deceased':''}`;
    el.style.left = pos.x+'px'; el.style.top = pos.y+'px';
    el.dataset.id = m.id;
    const yrs = `${m.birth||'?'} – ${m.alive===false?(m.death||'?'):''}`.trim();
    const ic = m.gender==='F' ? '♀' : '♂';
    el.innerHTML = `
      <div class="avatar">${m.photo?`<img src="${m.photo}" alt="">`:(m.name||'?').slice(0,1).toUpperCase()}</div>
      <div class="nm">${escapeHtml(m.name||'Tanpa Nama')}</div>
      <div class="yrs">${escapeHtml(yrs)}</div>
      <div class="row">
        <span class="chip" style="background:color-mix(in oklab, var(--gold) 25%, transparent); color:var(--ink)">${ic}</span>
        ${m.alive===false?'<span class="chip" style="background:#3334; color:var(--ink)">Allahyarham</span>':'<span class="chip" style="background:color-mix(in oklab, var(--ok) 30%, transparent); color:var(--ink)">Hidup</span>'}
      </div>
    `;
    el.addEventListener('click', e=>{ e.stopPropagation(); openMemberMenu(m); });
    wrap.appendChild(el);
  });
}

function renderLinks(layout){
  const svg = $('#links');
  const w = 6000, h = 4000;
  let paths = '';
  // pasangan: garis horizontal antara dua
  DATA.spouses.forEach(s=>{
    const a = layout[s.husbandId], b = layout[s.wifeId];
    if(!a || !b) return;
    const ax = a.x + NODE_W/2, ay = a.y + NODE_H/2;
    const bx = b.x + NODE_W/2, by = b.y + NODE_H/2;
    paths += `<path class="spouse" d="M ${ax} ${ay} L ${bx} ${by}"/>`;
  });
  // anak: dari titik tengah pasangan ke kad anak
  DATA.children.forEach(c=>{
    const sp = DATA.spouses.find(s=>s.id===c.spouseId); if(!sp) return;
    const a = layout[sp.husbandId], b = layout[sp.wifeId];
    const k = layout[c.childId]; if(!k) continue_(c); if(!k) return;
    const px = a && b ? (a.x+b.x)/2 + NODE_W/2 : (a||b).x + NODE_W/2;
    const py = (a||b).y + NODE_H;
    const kx = k.x + NODE_W/2, ky = k.y;
    const my = (py+ky)/2;
    paths += `<path d="M ${px} ${py} L ${px} ${my} L ${kx} ${my} L ${kx} ${ky}"/>`;
  });
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = paths;
}
function continue_(){} // helper

function renderNotes(){
  const wrap = $('#notes'); wrap.innerHTML='';
  DATA.notes.forEach(n=>{
    const el = document.createElement('div');
    el.className = 'note '+(n.pinned?'pinned':'');
    el.style.left = (n.x||300)+'px'; el.style.top = (n.y||300)+'px';
    el.style.fontFamily = n.font || 'inherit';
    el.style.fontSize = (n.size||14)+'px';
    el.style.color = n.color || '#3b2a05';
    el.textContent = n.text || '';
    el.addEventListener('click', e=>{ e.stopPropagation(); openNoteMenu(n); });
    wrap.appendChild(el);
  });
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// ====== PANZOOM ======
function setupPanzoom(){
  const world = $('#world');
  if(panzoomInstance){ panzoomInstance.destroy(); }
  panzoomInstance = Panzoom(world, {
    maxScale: 3, minScale: 0.15, contain: false, canvas: true, cursor:'grab', step:.3
  });
  const stage = $('#stage');
  stage.addEventListener('wheel', panzoomInstance.zoomWithWheel, { passive:false });
}
$('#zIn').onclick = ()=> panzoomInstance?.zoomIn();
$('#zOut').onclick = ()=> panzoomInstance?.zoomOut();
$('#zReset').onclick = ()=> panzoomInstance?.reset();
$('#btnZoomFit').onclick = ()=> panzoomInstance?.reset();

// ====== MEMBER MENU ======
function openMemberMenu(m){
  const isAdmin = ['admin','master'].includes(STORE.user?.role);
  openModal(`
    <div class="flex items-center gap-3 mb-3">
      <div class="avatar" style="width:64px;height:64px;border-radius:50%;background:linear-gradient(180deg,var(--gold-2),var(--gold));display:grid;place-items:center;color:#241704;font-weight:800;font-size:24px">
        ${m.photo?`<img style="width:100%;height:100%;border-radius:50%;object-fit:cover" src="${m.photo}">`:(m.name||'?').slice(0,1).toUpperCase()}
      </div>
      <div>
        <div class="font-head text-xl">${escapeHtml(m.name)}</div>
        <div class="text-xs ink-soft">${m.gender==='F'?'Perempuan':'Lelaki'} • ${m.alive===false?'Allahyarham':'Hidup'} • ${escapeHtml(m.birth||'?')} – ${m.alive===false?escapeHtml(m.death||'?'):''}</div>
        ${m.notes?`<div class="text-xs ink-soft mt-1">${escapeHtml(m.notes)}</div>`:''}
      </div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      ${isAdmin?'<button class="btn gold-edge justify-center" data-act="edit">✏️ Edit</button>':''}
      ${isAdmin?'<button class="btn gold-edge justify-center" data-act="spouse">💍 Tambah Pasangan</button>':''}
      ${isAdmin?'<button class="btn gold-edge justify-center" data-act="child">👶 Tambah Anak</button>':''}
      ${isAdmin?'<button class="btn btn-ghost justify-center" data-act="note">📝 Tambah Nota</button>':''}
      ${isAdmin?'<button class="btn btn-ghost justify-center" data-act="move">🔀 Pindah Cabang</button>':''}
      ${isAdmin?'<button class="btn btn-ghost justify-center" style="color:var(--danger)" data-act="del">🗑️ Padam</button>':''}
    </div>
    <div class="mt-3 text-right"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>
  `);
  $$('button[data-act]', $('#modal')).forEach(b=> b.onclick = ()=>{
    const act = b.dataset.act;
    if(act==='edit') memberForm(m);
    else if(act==='spouse') spouseForm(m);
    else if(act==='child') childForm(m);
    else if(act==='note') noteForm({x:300,y:300});
    else if(act==='del') deleteMember(m);
    else if(act==='move') moveBranch(m);
  });
}

function memberForm(m){
  const isNew = !m;
  m = m || { id:uid(), gender:'M', alive:true };
  openModal(`
    <div class="font-head text-2xl mb-3">${isNew?'Tambah Ahli':'Edit Ahli'}</div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div class="field"><label>Nama penuh</label><input id="f_name" value="${escapeHtml(m.name||'')}"/></div>
      <div class="field"><label>Jantina</label>
        <select id="f_g"><option value="M" ${m.gender==='M'?'selected':''}>Lelaki</option><option value="F" ${m.gender==='F'?'selected':''}>Perempuan</option></select>
      </div>
      <div class="field"><label>Tarikh lahir</label><input id="f_b" placeholder="DD-MM-YYYY atau ~1950" value="${escapeHtml(m.birth||'')}"/></div>
      <div class="field"><label>Status</label>
        <select id="f_a"><option value="true" ${m.alive!==false?'selected':''}>Hidup</option><option value="false" ${m.alive===false?'selected':''}>Allahyarham</option></select>
      </div>
      <div class="field"><label>Tarikh meninggal</label><input id="f_d" placeholder="kosongkan jika hidup" value="${escapeHtml(m.death||'')}"/></div>
      <div class="field"><label>Tempat / asal</label><input id="f_p" value="${escapeHtml(m.place||'')}"/></div>
      <div class="field sm:col-span-2"><label>Catatan</label><textarea id="f_n" rows="2">${escapeHtml(m.notes||'')}</textarea></div>
      <div class="field sm:col-span-2"><label>Gambar (jpg/png/webp, ≤5MB)</label><input id="f_ph" type="file" accept="image/jpeg,image/png,image/webp"/></div>
    </div>
    <div class="flex gap-2 justify-end mt-2">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveMember">Simpan</button>
    </div>
  `);
  $('#saveMember').onclick = async ()=>{
    const payload = {
      id:m.id, name:$('#f_name').value.trim(), gender:$('#f_g').value,
      birth:$('#f_b').value.trim(), alive:$('#f_a').value==='true',
      death:$('#f_d').value.trim(), place:$('#f_p').value.trim(),
      notes:$('#f_n').value.trim()
    };
    if(!payload.name) return toast("Nama wajib diisi.");
    const file = $('#f_ph').files[0];
    if(file){
      if(file.size>5*1024*1024) return toast("Gambar terlalu besar (max 5MB).");
      if(!/image\/(jpeg|png|webp)/.test(file.type)) return toast("Format gambar tidak sah.");
      payload.photoB64 = await fileToB64(file);
      payload.photoMime = file.type;
    }
    try{
      const r = await api(isNew?'addMember':'editMember', payload);
      toast(r.pending? 'Dihantar untuk kelulusan.' : 'Disimpan.');
      closeModal(); await refresh();
    }catch(e){ toast("Gagal: "+e.message); }
  };
}

function fileToB64(file){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=> res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function spouseForm(m){
  const others = DATA.members.filter(x=>x.id!==m.id && x.gender!==m.gender);
  openModal(`
    <div class="font-head text-2xl mb-3">Tambah Pasangan untuk ${escapeHtml(m.name)}</div>
    <div class="field"><label>Pilih ahli sedia ada</label>
      <select id="sp_pick"><option value="">— atau buat baru di bawah —</option>${others.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}</select>
    </div>
    <div class="bevel-soft rounded-lg p-3 mb-2">
      <div class="text-xs ink-soft mb-1">Atau cipta ahli baru:</div>
      <div class="grid grid-cols-2 gap-2">
        <div class="field"><label>Nama</label><input id="sp_name"/></div>
        <div class="field"><label>Jantina</label><select id="sp_g"><option value="${m.gender==='M'?'F':'M'}">${m.gender==='M'?'Perempuan':'Lelaki'}</option></select></div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="field"><label>Tarikh kahwin</label><input id="sp_mar"/></div>
      <div class="field"><label>Status</label>
        <select id="sp_st"><option value="kahwin">Masih kahwin</option><option value="cerai">Bercerai</option><option value="mati">Pasangan meninggal</option></select>
      </div>
      <div class="field"><label>Tarikh cerai</label><input id="sp_div"/></div>
      <div class="field"><label>Tarikh kematian</label><input id="sp_dth"/></div>
    </div>
    <div class="flex gap-2 justify-end mt-2">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveSpouse">Simpan</button>
    </div>
  `);
  $('#saveSpouse').onclick = async ()=>{
    const pick = $('#sp_pick').value;
    const payload = {
      anchorId: m.id,
      partnerId: pick || null,
      newPartner: pick? null : { id:uid(), name:$('#sp_name').value.trim(), gender:$('#sp_g').value, alive:true },
      marriageDate:$('#sp_mar').value.trim(),
      status:$('#sp_st').value,
      divorceDate:$('#sp_div').value.trim(),
      deathDate:$('#sp_dth').value.trim(),
      spouseId: uid()
    };
    if(!pick && !payload.newPartner.name) return toast("Pilih ahli atau isi nama pasangan.");
    try{ const r = await api('addSpouse', payload); toast(r.pending?'Menunggu kelulusan.':'Pasangan ditambah.'); closeModal(); await refresh(); }
    catch(e){ toast("Gagal: "+e.message); }
  };
}

function childForm(m){
  // pasangan yang melibatkan m
  const couples = DATA.spouses.filter(s=>s.husbandId===m.id || s.wifeId===m.id);
  if(!couples.length){ toast("Tambah pasangan dahulu — anak perlu dikaitkan dengan satu pasangan."); return; }
  const others = DATA.members;
  openModal(`
    <div class="font-head text-2xl mb-3">Tambah Anak</div>
    <div class="field"><label>Daripada pasangan</label>
      <select id="ch_couple">
        ${couples.map(c=>{
          const a=DATA.members.find(x=>x.id===c.husbandId), b=DATA.members.find(x=>x.id===c.wifeId);
          return `<option value="${c.id}">${escapeHtml(a?.name||'?')} & ${escapeHtml(b?.name||'?')}</option>`;
        }).join('')}
      </select>
    </div>
    <div class="field"><label>Pilih ahli sedia ada (jika ada)</label>
      <select id="ch_pick"><option value="">— atau buat baru —</option>${others.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}</select>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="field"><label>Nama anak baru</label><input id="ch_name"/></div>
      <div class="field"><label>Jantina</label><select id="ch_g"><option value="M">Lelaki</option><option value="F">Perempuan</option></select></div>
      <div class="field"><label>Tarikh lahir</label><input id="ch_b"/></div>
      <div class="field"><label>Status</label><select id="ch_a"><option value="true">Hidup</option><option value="false">Allahyarham</option></select></div>
    </div>
    <div class="flex gap-2 justify-end mt-2">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveChild">Simpan</button>
    </div>
  `);
  $('#saveChild').onclick = async ()=>{
    const pick = $('#ch_pick').value;
    const payload = {
      spouseId: $('#ch_couple').value,
      childId: pick || uid(),
      newChild: pick? null : { id: null, name:$('#ch_name').value.trim(), gender:$('#ch_g').value, birth:$('#ch_b').value.trim(), alive:$('#ch_a').value==='true' }
    };
    if(payload.newChild){ payload.newChild.id = payload.childId; if(!payload.newChild.name) return toast("Nama anak wajib."); }
    try{ const r = await api('addChild', payload); toast(r.pending?'Menunggu kelulusan.':'Anak ditambah.'); closeModal(); await refresh(); }
    catch(e){ toast("Gagal: "+e.message); }
  };
}

async function deleteMember(m){
  if(!confirm(`Padam ${m.name}? Tindakan ini juga akan padam hubungan berkaitan.`)) return;
  try{ await api('deleteMember', { id:m.id }); toast("Padam berjaya."); closeModal(); await refresh(); }
  catch(e){ toast("Gagal: "+e.message); }
}

function moveBranch(m){
  openModal(`
    <div class="font-head text-2xl mb-3">Pindah Cabang</div>
    <p class="text-sm ink-soft mb-2">Pilih pasangan ibu bapa baru untuk <b>${escapeHtml(m.name)}</b>.</p>
    <div class="field"><label>Pasangan ibu bapa baru</label>
      <select id="mb_couple">
        ${DATA.spouses.map(c=>{
          const a=DATA.members.find(x=>x.id===c.husbandId), b=DATA.members.find(x=>x.id===c.wifeId);
          return `<option value="${c.id}">${escapeHtml(a?.name||'?')} & ${escapeHtml(b?.name||'?')}</option>`;
        }).join('')}
      </select>
    </div>
    <div class="flex gap-2 justify-end"><button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button><button class="btn gold-edge" id="doMove">Pindah</button></div>
  `);
  $('#doMove').onclick = async ()=>{
    try{ await api('moveBranch', { childId:m.id, newSpouseId:$('#mb_couple').value }); toast("Dipindahkan."); closeModal(); await refresh(); }
    catch(e){ toast("Gagal: "+e.message); }
  };
}

// ====== NOTES ======
$('#btnAddNote').onclick = ()=> noteForm({x:400,y:400});
function noteForm(n){
  const isNew = !n.id;
  openModal(`
    <div class="font-head text-2xl mb-3">${isNew?'Tambah Nota':'Edit Nota'}</div>
    <div class="field"><label>Teks</label><textarea id="n_t" rows="3">${escapeHtml(n.text||'')}</textarea></div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div class="field"><label>Fon</label>
        <select id="n_f">
          <option>Inter</option><option>Cinzel</option><option>Playfair Display</option><option>Georgia</option><option>Courier New</option>
        </select>
      </div>
      <div class="field"><label>Saiz</label><input id="n_s" type="number" value="${n.size||14}"/></div>
      <div class="field"><label>Warna</label><input id="n_c" type="color" value="${n.color||'#3b2a05'}"/></div>
      <div class="field"><label>Tampal (admin)</label><input id="n_p" type="checkbox" ${n.pinned?'checked':''}/></div>
    </div>
    <div class="flex gap-2 justify-end">
      ${!isNew?'<button class="btn btn-ghost" style="color:var(--danger)" id="delNote">Padam</button>':''}
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveNote">Simpan</button>
    </div>
  `);
  if(n.font) $('#n_f').value = n.font;
  $('#saveNote').onclick = async ()=>{
    const p = {
      id: n.id || uid(),
      text:$('#n_t').value, font:$('#n_f').value, size:Number($('#n_s').value)||14,
      color:$('#n_c').value, pinned:$('#n_p').checked,
      x:n.x||400, y:n.y||400
    };
    try{ await api(isNew?'addNote':'editNote', p); toast("Nota disimpan."); closeModal(); await refresh(); }
    catch(e){ toast("Gagal: "+e.message); }
  };
  const dn = $('#delNote'); if(dn) dn.onclick = async ()=>{
    if(!confirm("Padam nota?")) return;
    try{ await api('deleteNote', { id:n.id }); closeModal(); await refresh(); }catch(e){ toast(e.message); }
  };
}
function openNoteMenu(n){ noteForm(n); }

// ====== SEARCH ======
let searchHits = []; let searchIdx = -1;
$('#search').addEventListener('input', e=>{
  const q = e.target.value.toLowerCase().trim();
  $$('#nodes .node').forEach(el=>el.classList.remove('match'));
  if(!q){ searchHits=[]; searchIdx=-1; return; }
  searchHits = DATA.members.filter(m =>
    [m.name,m.place,m.notes,String(m.birth||''),String(m.death||'')].some(v=>String(v||'').toLowerCase().includes(q))
  );
  searchHits.forEach(m=>{
    const el = document.querySelector(`#nodes .node[data-id="${m.id}"]`);
    if(el) el.classList.add('match');
  });
  if(searchHits.length){ searchIdx=0; centerOn(searchHits[0].id); }
});
$('#searchNext').onclick = ()=>{ if(!searchHits.length) return; searchIdx=(searchIdx+1)%searchHits.length; centerOn(searchHits[searchIdx].id); };
$('#searchPrev').onclick = ()=>{ if(!searchHits.length) return; searchIdx=(searchIdx-1+searchHits.length)%searchHits.length; centerOn(searchHits[searchIdx].id); };

function centerOn(id){
  const el = document.querySelector(`#nodes .node[data-id="${id}"]`);
  if(!el || !panzoomInstance) return;
  const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
  const stage = $('#stage').getBoundingClientRect();
  const scale = 1;
  panzoomInstance.zoom(scale, { animate:true });
  setTimeout(()=> panzoomInstance.pan(-x + stage.width/2 - NODE_W/2, -y + stage.height/2 - NODE_H/2, { animate:true }), 50);
}

// ====== PROFILE ======
function openProfile(){
  const u = STORE.user; if(!u) return;
  const matches = DATA.members.filter(m => m.name?.toLowerCase().includes((u.fullName||u.username).toLowerCase()));
  openModal(`
    <div class="font-head text-2xl mb-3">Profil Saya</div>
    <div class="bevel-soft rounded-lg p-3 mb-3">
      <div><b>${escapeHtml(u.fullName||u.username)}</b></div>
      <div class="text-xs ink-soft">${escapeHtml(u.username)} • ${u.role}</div>
    </div>
    <div class="font-head text-lg mb-2">Padankan diri dengan kad dalam pokok</div>
    ${matches.length? matches.map(m=>`<button class="btn btn-ghost w-full justify-between" data-id="${m.id}"><span>${escapeHtml(m.name)}</span><span class="chip gold-edge">Padankan</span></button>`).join('')
      : '<p class="text-sm ink-soft">Tiada cadangan padanan dijumpai.</p>'}
    <div class="text-right mt-3"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>
  `);
  $$('button[data-id]', $('#modal')).forEach(b=> b.onclick = async ()=>{
    try{ await api('linkProfile', { memberId:b.dataset.id }); toast("Dipadankan."); closeModal(); await refresh(); }
    catch(e){ toast(e.message); }
  });
}

// ====== ADMIN PANEL ======
$('#btnAdmin').onclick = ()=> adminPanel('pending');
function adminPanel(tab='pending'){
  const isMaster = STORE.user?.role==='master';
  openModal(`
    <div class="font-head text-2xl mb-3">Panel Pentadbir</div>
    <div class="flex gap-2 mb-3 flex-wrap">
      <button class="tab ${tab==='pending'?'active':''}" data-t="pending">Perubahan Menunggu</button>
      <button class="tab ${tab==='users'?'active':''}" data-t="users">Akaun Menunggu</button>
      ${isMaster?`<button class="tab ${tab==='roles'?'active':''}" data-t="roles">Lantik Admin</button>`:''}
      <button class="tab ${tab==='seed'?'active':''}" data-t="seed">Mulakan Pokok</button>
    </div>
    <div id="adminBody"></div>
    <div class="text-right mt-3"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>
  `);
  $$('.tab', $('#modal')).forEach(b=> b.onclick = ()=>{ adminPanel(b.dataset.t); });
  const body = $('#adminBody');
  if(tab==='pending'){
    body.innerHTML = DATA.pending?.length ? DATA.pending.map(p=>`
      <div class="bevel-soft rounded-lg p-2 mb-2">
        <div class="text-xs ink-soft">${escapeHtml(p.action)} oleh ${escapeHtml(p.user||'?')} • ${escapeHtml(p.ts||'')}</div>
        <pre class="text-xs whitespace-pre-wrap">${escapeHtml(JSON.stringify(p.payload,null,2))}</pre>
        <div class="flex gap-2 mt-2">
          <button class="btn gold-edge" data-a="approve" data-id="${p.id}">Luluskan</button>
          <button class="btn btn-ghost" style="color:var(--danger)" data-a="reject" data-id="${p.id}">Tolak</button>
        </div>
      </div>
    `).join('') : '<p class="text-sm ink-soft">Tiada perubahan menunggu.</p>';
    $$('button[data-a]', body).forEach(b=> b.onclick = async ()=>{
      try{ await api(b.dataset.a, { id:b.dataset.id }); toast("Selesai."); adminPanel('pending'); await refresh(); }
      catch(e){ toast(e.message); }
    });
  } else if(tab==='users'){
    const pu = DATA.pendingUsers || [];
    body.innerHTML = pu.length ? pu.map(u=>`
      <div class="flex items-center justify-between bevel-soft rounded-lg p-2 mb-2">
        <div>
          <div><b>${escapeHtml(u.username)}</b> <span class="text-xs ink-soft">${escapeHtml(u.fullName||'')}</span></div>
          <div class="text-xs ink-soft">${escapeHtml(u.email||'')} ${u.phone?'• '+escapeHtml(u.phone):''}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn gold-edge" data-ap="${escapeHtml(u.username)}">Luluskan</button>
          <button class="btn btn-ghost" style="color:var(--danger)" data-rj="${escapeHtml(u.username)}">Tolak</button>
        </div>
      </div>
    `).join('') : '<p class="text-sm ink-soft">Tiada akaun menunggu kelulusan.</p>';
    $$('button[data-ap]', body).forEach(b=> b.onclick = async ()=>{
      try{ await api('approveUser', { target:b.dataset.ap }); toast("Akaun diluluskan."); adminPanel('users'); await refresh(); }catch(e){ toast(e.message); }
    });
    $$('button[data-rj]', body).forEach(b=> b.onclick = async ()=>{
      if(!confirm('Tolak permohonan ini?')) return;
      try{ await api('rejectUser', { target:b.dataset.rj }); toast("Ditolak."); adminPanel('users'); }catch(e){ toast(e.message); }
    });
  } else if(tab==='roles'){
    if(!isMaster){ body.innerHTML='<p class="text-sm ink-soft">Hanya pentadbir utama boleh melantik admin.</p>'; return; }
    const us = (DATA.users||[]).filter(u=>u.approved);
    body.innerHTML = us.length ? us.map(u=>`
      <div class="flex items-center justify-between bevel-soft rounded-lg p-2 mb-2">
        <div><b>${escapeHtml(u.username)}</b> <span class="text-xs ink-soft">${escapeHtml(u.fullName||'')}</span> <span class="chip" style="background:color-mix(in oklab,var(--gold) 25%,transparent)">${escapeHtml(u.role)}</span></div>
        <div class="flex gap-2 items-center">
          <select data-u="${escapeHtml(u.username)}">
            <option value="user" ${u.role==='user'?'selected':''}>user</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
          </select>
          <button class="btn gold-edge" data-su="${escapeHtml(u.username)}">Simpan</button>
        </div>
      </div>
    `).join('') : '<p class="text-sm ink-soft">Tiada pengguna diluluskan lagi.</p>';
    $$('button[data-su]', body).forEach(b=> b.onclick = async ()=>{
      const sel = body.querySelector(`select[data-u="${b.dataset.su}"]`);
      try{ await api('setRole', { username:b.dataset.su, role:sel.value }); toast("Peranan dikemaskini."); await refresh(); adminPanel('roles'); }
      catch(e){ toast(e.message); }
    });
  } else if(tab==='seed'){
    body.innerHTML = `
      <p class="text-sm ink-soft mb-2">Mulakan pokok dengan ahli pertama (moyang).</p>
      <button class="btn gold-edge" id="seedBtn">+ Tambah Ahli Pertama</button>
    `;
    $('#seedBtn').onclick = ()=> { closeModal(); memberForm(null); };
  }
}

function updatePendingBadge(){
  const n = (DATA.pending?.length || 0) + (DATA.pendingUsers?.length || 0);
  const b = $('#pendingBadge'); if(!b) return;
  if(n>0){ b.style.display=''; b.textContent = n; } else b.style.display='none';
}

// ====== REFRESH ======
async function refresh(){
  try{
    const r = await api('bootstrap');
    DATA = { ...DATA, ...r.data }; STORE.cache = DATA;
  }catch{}
  renderAll(); updatePendingBadge();
}

// ====== PWA ======
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

// ====== START ======
boot();
