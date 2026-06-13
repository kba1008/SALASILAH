/* ================================================================
   Salasilah Keluarga Elit — app.js
   ================================================================ */

// ====== KONFIGURASI ======
// 🔗 Tampal URL Web App Google Apps Script anda di sini:
const API_URL = "https://script.google.com/macros/s/AKfycbycYAjCXDtZKQ1Pm5rOujMeKDHLIDYf9YqUydRiaj8iEzpSi0in_wMEHIYQjrO1cn9T/exec";

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => 'id_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);

const notify = (function(){
  function dock(){
    let d = document.getElementById('notifyDock');
    if(!d){
      d = document.createElement('div');
      d.id = 'notifyDock';
      document.body.appendChild(d);
    }
    return d;
  }
  function push(kind, msg, opts){
    opts = opts || {};
    const sticky = kind === 'error' || opts.sticky;
    const ms = opts.ms != null ? opts.ms : (kind==='warn' ? 5000 : 3000);
    const el = document.createElement('div');
    el.className = 'notify notify-' + kind + (sticky ? ' notify-sticky' : '');
    const icon = {info:'ℹ️', success:'✅', warn:'⚠️', error:'⛔'}[kind] || 'ℹ️';
    el.innerHTML =
      '<span class="notify-ic">'+icon+'</span>'+
      '<span class="notify-msg"></span>'+
      '<button class="notify-x" aria-label="Tutup">✕</button>';
    el.querySelector('.notify-msg').textContent = String(msg||'');
    const close = ()=>{
      el.classList.add('notify-out');
      setTimeout(()=> el.remove(), 220);
    };
    el.querySelector('.notify-x').onclick = close;
    dock().appendChild(el);
    if(!sticky){ setTimeout(close, ms); }
    return close;
  }
  return {
    info:    (m,o)=> push('info', m, o),
    success: (m,o)=> push('success', m, o),
    warn:    (m,o)=> push('warn', m, o),
    error:   (m,o)=> push('error', m, o)
  };
})();

function toast(msg, ms){
  const s = String(msg||'');
  if(/^(gagal|ralat|error)/i.test(s) || /tidak dibenarkan|sesi tamat/i.test(s)) return notify.error(s);
  return notify.info(s, { ms: ms || 3000 });
}

window.addEventListener('error', (e) => { if(e && e.message) notify.error('Ralat: '+e.message); });
window.addEventListener('unhandledrejection', (e) => { notify.error('Ralat: '+(e?.reason?.message || e?.reason || 'Tidak diketahui')); });

const STORE = {
  get user(){ try{return JSON.parse(localStorage.getItem('skg_user')||'null')}catch{return null} },
  set user(v){ v? localStorage.setItem('skg_user', JSON.stringify(v)) : localStorage.removeItem('skg_user') },
  get cache(){ try{return JSON.parse(localStorage.getItem('skg_cache')||'{}')}catch{return {}} },
  set cache(v){ localStorage.setItem('skg_cache', JSON.stringify(v)) },
  get queue(){ try{return JSON.parse(localStorage.getItem('skg_queue')||'[]')}catch{return []} },
  set queue(v){ localStorage.setItem('skg_queue', JSON.stringify(v)) },
  get theme(){ return localStorage.getItem('skg_theme') || 'royal' },
  set theme(v){ localStorage.setItem('skg_theme', v); document.body.dataset.theme = v }
};
document.body.dataset.theme = STORE.theme;

const LOCAL_MODE = !API_URL || API_URL.includes('PASTE_DEPLOY_ID_DI_SINI');
if (LOCAL_MODE) console.warn('[SKG] Mod Tempatan aktif — Sila isikan API_URL di dalam app.js jika anda telah selesai mendeploy Code.gs.');

async function api(action, payload={}){
  const u = STORE.user;
  const body = { action, username: u?.username, token: u?.token, ...payload };

  if (LOCAL_MODE) {
    throw new Error("Sistem masih dalam mod tempatan. Sila masukkan API_URL di dalam app.js terlebih dahulu.");
  }

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw { network: true, message: "Tiada sambungan internet atau URL pelayan tidak sah." };
  }

  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch(e) {
    console.error("Non-JSON response received:", text.slice(0, 150));
    throw { network: true, message: "Sistem gagal diproses. Pastikan Web App anda di-deploy sebagai 'Execute as: Me' dan 'Who has access: Anyone'." };
  }

  if (!j.ok && j.error) throw new Error(j.error);
  return j;
}

async function flushQueue(){
  let q = STORE.queue; if(!q.length) return;
  const left = [];
  for(const item of q){
    try {
      await api(item.action, item.payload);
    } catch(err) {
      if (err.network) left.push(item);
    }
  }
  STORE.queue = left;
  if(q.length && !left.length) notify.success("Penyegerakan luar talian selesai.");
}
window.addEventListener('online', flushQueue);
navigator.serviceWorker?.addEventListener?.('message', e => { if(e.data?.type==='SYNC_NOW') flushQueue(); });

// Wrap API calls that can be queued offline
async function dispatchApi(action, payload) {
  try {
    return await api(action, payload);
  } catch (err) {
    if (err.network && ['addMember','editMember','deleteMember','addSpouse','addChild','addNote','editNote','approve','reject'].includes(action)) {
      const q = STORE.queue; q.push({ action, payload, ts: Date.now() }); STORE.queue = q;
      notify.warn("Tiada internet — Perubahan telah disimpan dan akan disegerakkan kelak.", { ms: 6000 });
      return { ok: true, pending: true };
    }
    throw new Error(err.message || err);
  }
}

const TIPS = [
  "Klik kad ahli untuk pilihan lengkap.",
  "Cari nama atau tahun di bar carian.",
  "Pentadbir boleh luluskan perubahan pendaftaran dari Panel Pentadbir.",
  "Kemas kini luar talian (offline) automatik disegerak apabila talian internet pulih."
];
let tipIdx = 0;
const tipTimer = setInterval(()=> { tipIdx=(tipIdx+1)%TIPS.length; const el=$('#tip'); if(el) el.textContent="Petua: "+TIPS[tipIdx]; }, 3000);

let DATA = { members:[], spouses:[], children:[], notes:[], pending:[], pendingLog:[], users:[] };
const NODE_W = 220, NODE_H = 170, GAP_X = 60, GAP_Y = 120;
const upperName = (s) => String(s||'').replace(/\s+/g,' ').trim().toUpperCase();

function openModal(html){ $('#modal').innerHTML = html; $('#scrim').classList.add('show'); }
function closeModal(){ $('#scrim').classList.remove('show'); }
$('#scrim').addEventListener('click', e => { if(e.target.id==='scrim') closeModal(); });
window.closeModalGlobal = closeModal;

function loginForm(){
  openModal(`
    <div class="flex items-center justify-between mb-3">
      <div class="font-head text-2xl">Selamat Datang</div>
      <div class="chip gold-edge">v1.5</div>
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
    <button class="btn gold-edge w-full justify-center mt-2" id="doLoginBtn">Log Masuk</button>
    <p class="text-xs ink-soft mt-3">Sila log masuk menggunakan akaun yang telah didaftarkan dan diluluskan oleh pentadbir.</p>
  `;
  const renderReg = ()=> body.innerHTML = `
    <p class="text-xs ink-soft mb-2">Maklumat diperlukan untuk daftar dan akan disemak pentadbir.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div class="field sm:col-span-2"><label>Gambar profil (Max 2MB) <span style="color:var(--danger)">*</span></label>
        <input id="rphoto" type="file" accept="image/jpeg,image/png,image/webp"/></div>
      <div class="field sm:col-span-2"><label>Nama penuh <span style="color:var(--danger)">*</span></label><input id="rname"/></div>
      <div class="field"><label>Nama bapa <span style="color:var(--danger)">*</span></label><input id="rfather"/></div>
      <div class="field"><label>Nama ibu <span style="color:var(--danger)">*</span></label><input id="rmother"/></div>
      <div class="field sm:col-span-2"><label>Alamat menetap <span style="color:var(--danger)">*</span></label><textarea id="raddr" rows="2"></textarea></div>
      <div class="field"><label>WhatsApp <span style="color:var(--danger)">*</span></label><input id="rwa" placeholder="0123456789"/></div>
      <div class="field"><label>Pekerjaan <span style="color:var(--danger)">*</span></label><input id="rocc"/></div>
      <div class="field"><label>Emel (pilihan)</label><input id="remail" type="email"/></div>
      <div class="field"><label>Nama pengguna (Log masuk) <span style="color:var(--danger)">*</span></label><input id="ru"/></div>
      <div class="field"><label>Kata laluan <span style="color:var(--danger)">*</span></label><input id="rp" type="password"/></div>
      <div class="field"><label>Sahkan kata laluan <span style="color:var(--danger)">*</span></label><input id="rp2" type="password"/></div>
    </div>
    <button class="btn gold-edge w-full justify-center mt-3" id="doRegBtn">Daftar Akaun</button>
  `;
  renderLogin();
  $$('.tab', $('#modal')).forEach(b=> b.onclick = ()=>{
    $$('.tab', $('#modal')).forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    b.dataset.tab==='login' ? renderLogin() : renderReg();
    bindAuth();
  });
  function bindAuth(){
    const btnL = $('#doLoginBtn'); if(btnL) btnL.onclick = doLogin;
    const btnR = $('#doRegBtn'); if(btnR) btnR.onclick = doRegister;
    const lu = $('#lu'); if(lu) lu.onkeydown = e => { if(e.key==='Enter') doLogin(); };
    const lp = $('#lp'); if(lp) lp.onkeydown = e => { if(e.key==='Enter') doLogin(); };
  }
  bindAuth();
}

async function doLogin(){
  const u = $('#lu').value.trim(), p = $('#lp').value;
  if(!u || !p) return toast("Sila isi nama pengguna & kata laluan.");
  try {
    const r = await dispatchApi('login', { username:u, password:p });
    STORE.user = { username:r.username, role:r.role, token:r.token, fullName:r.fullName, memberId:r.memberId, photo:r.photo };
    notify.success("Selamat datang, "+(r.fullName||u)+"!");
    closeModal(); await boot();
  } catch(e) { toast("Gagal log masuk: " + e.message); }
}

async function doRegister(){
  const o = {
    fullName:upperName($('#rname').value), fatherName:upperName($('#rfather').value), motherName:upperName($('#rmother').value),
    address:$('#raddr').value.trim(), whatsapp:$('#rwa').value.trim(), occupation:$('#rocc').value.trim(),
    email:$('#remail').value.trim(), username:$('#ru').value.trim().toLowerCase(), 
    password:$('#rp').value, password2:$('#rp2').value
  };
  if(!o.fullName||!o.fatherName||!o.motherName||!o.address||!o.whatsapp||!o.occupation||!o.username||!o.password) return toast("Semua ruangan bertanda (*) wajib diisi.");
  if(o.password!==o.password2) return toast("Kata laluan tidak sepadan.");
  const file = $('#rphoto').files[0];
  if(file) {
    if(file.size > 2*1024*1024) return toast("Saiz gambar maksimum ialah 2MB.");
    if(!/image\/(jpeg|png|webp)/.test(file.type)) return toast("Sila gunakan format gambar (JPG/PNG/WEBP).");
    o.photoB64 = await fileToB64(file);
    o.photoMime = file.type;
  }
  try {
    await dispatchApi('register', o);
    notify.success("Pendaftaran dihantar! Sila tunggu semakan pentadbir sebelum anda boleh log masuk.", { ms: 6000 });
    closeModal();
  } catch(e) { toast("Gagal daftar: " + e.message); }
}

$('#btnAccount').onclick = ()=>{
  const u = STORE.user;
  if(!u){ loginForm(); return; }
  openModal(`
    <div class="font-head text-2xl mb-3">Akaun Saya</div>
    <div class="bevel-soft rounded-lg p-3 mb-3">
      <div><b>${escapeHtml(u.fullName||u.username)}</b></div>
      <div class="text-xs ink-soft">${escapeHtml(u.username)} • ${escapeHtml(u.role)}</div>
    </div>
    <div class="grid grid-cols-1 gap-2">
      <button class="btn gold-edge justify-start" id="acProfile">🪪 Kad Keahlian Saya</button>
      <button class="btn btn-ghost justify-start" style="color:var(--danger)" id="acLogout">🚪 Log Keluar</button>
    </div>
    <div class="text-right mt-3"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>
  `);
  $('#acProfile').onclick = ()=>{ closeModal(); openProfile(); };
  $('#acLogout').onclick = ()=>{ STORE.user=null; notify.success("Sesi tamat."); location.reload(); };
};

$('#btnSettings').onclick = ()=>{
  const themes = [
    {id:'parchment', nm:'Parchment (krim + emas)'}, {id:'royal', nm:'Royal (biru gelap + emas)'},
    {id:'emerald', nm:'Emerald (hijau zaitun)'}, {id:'rose', nm:'Rose (merah jambu)'}, {id:'midnight', nm:'Midnight (hitam + emas)'}
  ];
  openModal(`
    <div class="font-head text-2xl mb-3">Tetapan</div>
    <div class="field"><label>Tema warna</label>
      <select id="themeSel">${themes.map(t=>`<option value="${t.id}" ${STORE.theme===t.id?'selected':''}>${t.nm}</option>`).join('')}</select>
    </div>
    <div class="flex gap-2 justify-end mt-2">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveTheme">Simpan</button>
    </div>
  `);
  $('#saveTheme').onclick = ()=>{ STORE.theme = $('#themeSel').value; notify.success("Tema dikemaskini."); closeModal(); };
};

function applyRoleUI(){
  const u = STORE.user;
  const isAdmin = !!u && (u.role==='admin' || u.role==='master');
  $('#btnAdmin').style.display = isAdmin ? '' : 'none';
  $('#btnAddNote').style.display = isAdmin ? '' : 'none';
}

async function boot(){
  applyRoleUI();
  try {
    const r = await api('bootstrap');
    DATA = { ...DATA, ...r.data }; STORE.cache = DATA;
  } catch(e) {
    if (e.network) DATA = { ...DATA, ...(STORE.cache||{}) }; // fallback mode luartalian
    else notify.error(e.message);
  }
  renderAll(); updatePendingBadge();
  setTimeout(()=>{ $('#splash').style.display='none'; clearInterval(tipTimer); }, 400);
  flushQueue();
}

function buildLayout(){
  const byId = Object.fromEntries(DATA.members.map(m=>[m.id, m]));
  const childMap = {};
  DATA.children.forEach(c=>{
    const sp = DATA.spouses.find(s=>s.id===c.spouseId);
    if(!sp) return;
    [sp.husbandId, sp.wifeId].forEach(pid=>{
      if(pid) (childMap[pid] ||= []).push(c.childId);
    });
  });
  const placed = {};
  const roots = DATA.members.filter(m => !DATA.children.find(c=>c.childId===m.id));
  let cursorX = 200;
  const baseY = 220;

  function place(memberId, depth, startX){
    if(placed[memberId]) return placed[memberId].x + NODE_W;
    const m = byId[memberId]; if(!m) return startX;
    const spouseRecs = DATA.spouses.filter(s=>s.husbandId===memberId || s.wifeId===memberId);
    const partners = spouseRecs.map(s => s.husbandId===memberId ? s.wifeId : s.husbandId).filter(Boolean).map(id=>byId[id]).filter(Boolean);
    const kids = Array.from(new Set((childMap[memberId]||[])));
    let x = startX;
    let childrenStart = x, childrenEnd = x;
    if(kids.length){
      let cx = x;
      kids.forEach(kid=>{ cx = place(kid, depth+1, cx) + GAP_X; });
      childrenStart = placed[kids[0]].x;
      childrenEnd   = placed[kids[kids.length-1]].x + NODE_W;
    }
    const selfWidth = NODE_W + partners.length*(NODE_W+GAP_X);
    const totalWidth = Math.max(selfWidth, childrenEnd - childrenStart);
    const baseX = kids.length ? (childrenStart + childrenEnd)/2 - selfWidth/2 : x;
    placed[memberId] = { x: baseX, y: baseY + depth*(NODE_H+GAP_Y) };
    partners.forEach((p,i)=>{ placed[p.id] = { x: baseX + (i+1)*(NODE_W+GAP_X), y: placed[memberId].y }; });
    return Math.max(x + totalWidth + GAP_X, childrenEnd + GAP_X);
  }
  roots.forEach(r=>{ cursorX = place(r.id, 0, cursorX) + GAP_X*2; });
  DATA.members.forEach(m=>{ if(!placed[m.id]){ placed[m.id] = { x: cursorX, y: baseY }; cursorX += NODE_W + GAP_X; } });
  return placed;
}

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
  // Tandakan ahli yang ada draf belum lulus (pending)
  const pendingIds = new Set((DATA.pending||[]).filter(p=>p.action==='editMember' || p.action==='addMember').map(p => p.payload && p.payload.id).filter(Boolean));
  const isAdmin = ['admin','master'].includes(STORE.user?.role);
  const frag = document.createDocumentFragment();
  DATA.members.forEach(m=>{
    const pos = layout[m.id] || {x:200,y:200};
    const el = document.createElement('div');
    const tag = m._tag || 'none';
    const tagCls = tag==='admin' ? 'tag-admin' : (tag==='member' ? 'tag-member' : '');
    const draftCls = (isAdmin && pendingIds.has(m.id)) ? 'tag-draft' : '';
    el.className = `node ${m.gender==='F'?'female':'male'} ${m.alive===false?'deceased':''} ${tagCls} ${draftCls}`;
    el.style.left = pos.x+'px'; el.style.top = pos.y+'px';
    el.dataset.id = m.id;
    const yrs = `${m.birth||'?'} – ${m.alive===false?(m.death||'?'):''}`.trim();
    const ic = m.gender==='F' ? '♀' : '♂';
    const badge = tag==='admin'
      ? '<span class="chip" style="background:linear-gradient(180deg,#ff8a8a,#b71c1c);color:#fff">🛡️ Admin</span>'
      : (tag==='member' ? `<span class="chip" style="background:linear-gradient(180deg,var(--gold-2),var(--gold));color:#241704">⭐ Ahli${m._memberId?' '+escapeHtml(m._memberId):''}</span>` : '');
    const draftBadge = draftCls ? '<span class="chip" style="background:#b71c1c;color:#fff">📝 Draf</span>' : '';
    el.innerHTML = `
      <div class="avatar">${m.photo?`<img src="${m.photo}">`:(m.name||'?').slice(0,1).toUpperCase()}</div>
      <div class="nm">${escapeHtml(m.name||'Tanpa Nama')}</div>
      <div class="yrs">${escapeHtml(yrs)}</div>
      <div class="row">
        <span class="chip" style="background:color-mix(in oklab, var(--gold) 25%, transparent); color:var(--ink)">${ic}</span>
        ${m.alive===false?'<span class="chip" style="background:#3334; color:var(--ink)">Allahyarham</span>':'<span class="chip" style="background:color-mix(in oklab, var(--ok) 30%, transparent); color:var(--ink)">Hidup</span>'}
        ${badge}${draftBadge}
      </div>
    `;
    el.addEventListener('click', e=>{ e.stopPropagation(); openMemberMenu(m); });
    frag.appendChild(el);
  });
  wrap.appendChild(frag);
}

function renderLinks(layout){
  const svg = $('#links');
  const byId = Object.fromEntries(DATA.members.map(m=>[m.id, m]));
  let paths = '';
  let labels = '';
  DATA.spouses.forEach(s=>{
    const a = layout[s.husbandId], b = layout[s.wifeId];
    if(!a || !b) return;
    paths += `<path class="spouse" d="M ${a.x + NODE_W/2} ${a.y + NODE_H/2} L ${b.x + NODE_W/2} ${b.y + NODE_H/2}"/>`;
  });
  DATA.children.forEach(c=>{
    const sp = DATA.spouses.find(s=>s.id===c.spouseId); if(!sp) return;
    const a = layout[sp.husbandId], b = layout[sp.wifeId], k = layout[c.childId];
    if(!k) return;
    const px = a && b ? (a.x+b.x)/2 + NODE_W/2 : (a||b).x + NODE_W/2;
    const py = (a||b).y + NODE_H;
    const my = (py+k.y)/2, kx = k.x + NODE_W/2;
    paths += `<path d="M ${px} ${py} L ${px} ${my} L ${kx} ${my} L ${kx} ${k.y}"/>`;
    // Label kecil maklumat ibu/bapa pada cabang (untuk poligami / >1 perkahwinan)
    const dad = byId[sp.husbandId], mom = byId[sp.wifeId];
    const dn = (dad?.name||'?').split(' ')[0];
    const mn = (mom?.name||'?').split(' ')[0];
    const lblY = my - 6;
    labels += `<g class="branch-lbl"><rect x="${kx-58}" y="${lblY-11}" width="116" height="14" rx="6"/><text x="${kx}" y="${lblY}" text-anchor="middle">${escapeHtml(dn)} × ${escapeHtml(mn)}</text></g>`;
  });
  svg.innerHTML = paths + labels;
}

// Sembunyi node luar viewport untuk skala besar (1000+ kad)
function cullViewport(){
  if(!panzoomInstance) return;
  const stage = $('#stage').getBoundingClientRect();
  const pad = 600;
  const wrap = $('#nodes');
  const t = panzoomInstance.getScale();
  const pan = panzoomInstance.getPan();
  $$('#nodes .node').forEach(el=>{
    const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
    const sx = x*t + pan.x, sy = y*t + pan.y;
    const visible = sx + NODE_W*t > -pad && sx < stage.width + pad && sy + NODE_H*t > -pad && sy < stage.height + pad;
    el.style.visibility = visible ? 'visible' : 'hidden';
  });
}

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

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

function setupPanzoom(){
  const world = $('#world');
  if(panzoomInstance) panzoomInstance.destroy();
  panzoomInstance = Panzoom(world, { maxScale: 3, minScale: 0.15, contain: false, canvas: true, cursor:'grab', step:.3 });
  $('#stage').addEventListener('wheel', panzoomInstance.zoomWithWheel, { passive:false });
  let cullT; const sched = ()=>{ clearTimeout(cullT); cullT=setTimeout(cullViewport, 80); };
  world.addEventListener('panzoomchange', sched);
  window.addEventListener('resize', sched);
  setTimeout(cullViewport, 100);
}
$('#zIn').onclick = ()=> panzoomInstance?.zoomIn();
$('#zOut').onclick = ()=> panzoomInstance?.zoomOut();
$('#zReset').onclick = ()=> panzoomInstance?.reset();
$('#btnZoomFit').onclick = ()=> panzoomInstance?.reset();

function openMemberMenu(m){
  const role = STORE.user?.role;
  const isAdmin = ['admin','master'].includes(role);
  const basic = `
    <div class="flex items-center gap-3 mb-3">
      <div class="avatar" style="width:72px;height:72px;border-radius:50%;background:linear-gradient(180deg,var(--gold-2),var(--gold));display:grid;place-items:center;color:#241704;font-weight:800;font-size:24px;overflow:hidden">
        ${m.photo?`<img style="width:100%;height:100%;object-fit:cover" src="${m.photo}">`:(m.name||'?').slice(0,1).toUpperCase()}
      </div>
      <div>
        <div class="font-head text-xl">${escapeHtml(m.name||'Tanpa Nama')}</div>
        <div class="text-xs ink-soft">${m.gender==='F'?'Perempuan':'Lelaki'} • ${m.alive===false?'Allahyarham':'Hidup'} • ${escapeHtml(m.birth||'?')}${m.alive===false?' – '+escapeHtml(m.death||'?'):''}</div>
      </div>
    </div>`;
  const adminInfo = isAdmin ? `
    <div class="bevel-soft rounded-lg p-3 mb-3 text-sm">
      ${m.place?`<div><b>Tempat/Asal:</b> ${escapeHtml(m.place)}</div>`:''}
      ${m.address?`<div><b>Alamat:</b> ${escapeHtml(m.address)}</div>`:''}
      ${m.fatherName?`<div><b>Bapa:</b> ${escapeHtml(m.fatherName)}</div>`:''}
      ${m.motherName?`<div><b>Ibu:</b> ${escapeHtml(m.motherName)}</div>`:''}
      ${m.notes?`<div class="mt-1 text-xs ink-soft"><b>Catatan:</b> ${escapeHtml(m.notes)}</div>`:''}
    </div>` : `
    <div class="bevel-soft rounded-lg p-3 mb-3 text-sm">
      ${m.fatherName?`<div><b>Bapa:</b> ${escapeHtml(m.fatherName)}</div>`:''}
      ${m.motherName?`<div><b>Ibu:</b> ${escapeHtml(m.motherName)}</div>`:''}
    </div>`;
  
  openModal(basic + adminInfo + `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      ${role?'<button class="btn gold-edge justify-center" data-act="edit">✏️ '+(isAdmin?'Edit':'Cadang Edit')+'</button>':''}
      ${role?'<button class="btn gold-edge justify-center" data-act="spouse">💍 '+(isAdmin?'Tambah':'Cadang')+' Pasangan</button>':''}
      ${role?'<button class="btn gold-edge justify-center" data-act="child">👶 '+(isAdmin?'Tambah':'Cadang')+' Anak</button>':''}
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

function fileToB64(file){ return new Promise((res,rej)=>{ const r = new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); }); }

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
      <div class="field"><label>Meninggal</label><input id="f_d" value="${escapeHtml(m.death||'')}"/></div>
      <div class="field"><label>Asal</label><input id="f_p" value="${escapeHtml(m.place||'')}"/></div>
      <div class="field"><label>Nama bapa</label><input id="f_fa" value="${escapeHtml(m.fatherName||'')}"/></div>
      <div class="field"><label>Nama ibu</label><input id="f_mo" value="${escapeHtml(m.motherName||'')}"/></div>
      <div class="field sm:col-span-2"><label>Alamat menetap</label><textarea id="f_ad" rows="2">${escapeHtml(m.address||'')}</textarea></div>
      <div class="field sm:col-span-2"><label>Catatan</label><textarea id="f_n" rows="2">${escapeHtml(m.notes||'')}</textarea></div>
      <div class="field sm:col-span-2"><label>Gambar (Max 2MB)</label><input id="f_ph" type="file" accept="image/jpeg,image/png,image/webp"/></div>
    </div>
    <div class="flex gap-2 justify-end mt-2">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveMember">Simpan</button>
    </div>
  `);
  $('#saveMember').onclick = async ()=>{
    const payload = { id:m.id, name:upperName($('#f_name').value), gender:$('#f_g').value, birth:$('#f_b').value.trim(), alive:$('#f_a').value==='true', death:$('#f_d').value.trim(), place:$('#f_p').value.trim(), address:$('#f_ad').value.trim(), fatherName:upperName($('#f_fa').value), motherName:upperName($('#f_mo').value), notes:$('#f_n').value.trim() };
    if(!payload.name) return toast("Nama wajib diisi.");
    const file = $('#f_ph').files[0];
    if(file){
      if(file.size>2*1024*1024) return toast("Saiz maksimum 2MB.");
      payload.photoB64 = await fileToB64(file);
      payload.photoMime = file.type;
    }
    try{ const r = await dispatchApi(isNew?'addMember':'editMember', payload); notify[r.pending?'warn':'success'](r.pending?'📝 Disimpan sebagai DRAF. Menunggu kelulusan pentadbir.':'Berjaya.'); closeModal(); await refresh(); }catch(e){ toast("Gagal: "+e.message); }
  };
}

function spouseForm(m){
  const others = DATA.members.filter(x=>x.id!==m.id && x.gender!==m.gender);
  openModal(`
    <div class="font-head text-2xl mb-3">Tambah Pasangan</div>
    <div class="field"><label>Pilih ahli sedia ada</label>
      <select id="sp_pick"><option value="">— atau cipta profil baharu —</option>${others.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}</select>
    </div>
    <div class="bevel-soft rounded-lg p-3 mb-2 grid grid-cols-2 gap-2">
      <div class="field sm:col-span-2"><label>Nama Pasangan Baru</label><input id="sp_name"/></div>
      <div class="field"><label>Jantina</label><select id="sp_g"><option value="${m.gender==='M'?'F':'M'}">${m.gender==='M'?'Perempuan':'Lelaki'}</option></select></div>
    </div>
    <div class="flex gap-2 justify-end mt-2">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveSpouse">Simpan</button>
    </div>
  `);
  $('#saveSpouse').onclick = async ()=>{
    const pick = $('#sp_pick').value;
    const payload = { anchorId: m.id, partnerId: pick || null, newPartner: pick? null : { id:uid(), name:upperName($('#sp_name').value), gender:$('#sp_g').value, alive:true }, spouseId: uid() };
    if(!pick && !payload.newPartner.name) return toast("Isi maklumat pasangan.");
    try{ await dispatchApi('addSpouse', payload); notify.success("Selesai."); closeModal(); await refresh(); }catch(e){ toast(e.message); }
  };
}

function childForm(m){
  const couples = DATA.spouses.filter(s=>s.husbandId===m.id || s.wifeId===m.id);
  if(!couples.length) return toast("Sila daftarkan pasangan terlebih dahulu.");
  openModal(`
    <div class="font-head text-2xl mb-3">Tambah Anak</div>
    <div class="field"><label>Dari pasangan</label>
      <select id="ch_couple">${couples.map(c=>{const a=DATA.members.find(x=>x.id===c.husbandId),b=DATA.members.find(x=>x.id===c.wifeId);return `<option value="${c.id}">${escapeHtml(a?.name||'?')} & ${escapeHtml(b?.name||'?')}</option>`;}).join('')}</select>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="field sm:col-span-2"><label>Nama Anak Baru</label><input id="ch_name"/></div>
      <div class="field"><label>Jantina</label><select id="ch_g"><option value="M">Lelaki</option><option value="F">Perempuan</option></select></div>
    </div>
    <div class="flex gap-2 justify-end mt-2"><button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button><button class="btn gold-edge" id="saveChild">Simpan</button></div>
  `);
  $('#saveChild').onclick = async ()=>{
    const payload = { spouseId: $('#ch_couple').value, childId: uid(), newChild: { id: null, name:upperName($('#ch_name').value), gender:$('#ch_g').value, alive:true } };
    payload.newChild.id = payload.childId;
    if(!payload.newChild.name) return toast("Nama anak wajib.");
    try{ await dispatchApi('addChild', payload); notify.success("Berjaya."); closeModal(); await refresh(); }catch(e){ toast(e.message); }
  };
}

async function deleteMember(m){ if(confirm(`Padam ${m.name}? Hubungan berkaitan akan dipadam.`)) { try{ await dispatchApi('deleteMember', { id:m.id }); notify.success("Berjaya dipadam."); closeModal(); await refresh(); }catch(e){ toast(e.message); } } }
function moveBranch(m) { toast("Ciri pemindahan memerlukan ID Pasangan khusus yang boleh diedit oleh pentadbir."); }

$('#btnAddNote').onclick = ()=> noteForm({x:400,y:400});
function noteForm(n){
  const isNew = !n.id;
  openModal(`
    <div class="font-head text-2xl mb-3">Nota</div>
    <div class="field"><label>Teks</label><textarea id="n_t" rows="3">${escapeHtml(n.text||'')}</textarea></div>
    <div class="flex gap-2 justify-end mt-2">
      ${!isNew?'<button class="btn btn-ghost" style="color:var(--danger)" id="delNote">Padam</button>':''}
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveNote">Simpan</button>
    </div>
  `);
  $('#saveNote').onclick = async ()=>{ try{ await dispatchApi(isNew?'addNote':'editNote', {id:n.id||uid(), text:$('#n_t').value, x:n.x||400, y:n.y||400}); notify.success("Tersimpan."); closeModal(); await refresh(); }catch(e){ toast(e.message); } };
  const dn = $('#delNote'); if(dn) dn.onclick = async ()=>{ if(confirm("Padam nota?")){ try{ await dispatchApi('deleteNote', { id:n.id }); closeModal(); await refresh(); }catch(e){ toast(e.message); } } };
}
function openNoteMenu(n){ noteForm(n); }

let searchHits = []; let searchIdx = -1;
$('#search').addEventListener('input', e=>{
  const q = e.target.value.toLowerCase().trim();
  $$('#nodes .node').forEach(el=>el.classList.remove('match'));
  if(!q){ searchHits=[]; searchIdx=-1; return; }
  searchHits = DATA.members.filter(m => [m.name,m.place,m.notes,m.birth].some(v=>String(v||'').toLowerCase().includes(q)));
  searchHits.forEach(m=>{ const el = document.querySelector(`#nodes .node[data-id="${m.id}"]`); if(el) el.classList.add('match'); });
  if(searchHits.length){ searchIdx=0; centerOn(searchHits[0].id); }
});
$('#searchNext').onclick = ()=>{ if(searchHits.length){ searchIdx=(searchIdx+1)%searchHits.length; centerOn(searchHits[searchIdx].id); } };
$('#searchPrev').onclick = ()=>{ if(searchHits.length){ searchIdx=(searchIdx-1+searchHits.length)%searchHits.length; centerOn(searchHits[searchIdx].id); } };
function centerOn(id){
  const el = document.querySelector(`#nodes .node[data-id="${id}"]`);
  if(el && panzoomInstance){
    const x = parseFloat(el.style.left), y = parseFloat(el.style.top), st = $('#stage').getBoundingClientRect();
    panzoomInstance.zoom(1, { animate:true });
    setTimeout(()=> panzoomInstance.pan(-x + st.width/2 - NODE_W/2, -y + st.height/2 - NODE_H/2, { animate:true }), 50);
  }
}

async function openProfile(){
  const u = STORE.user; if(!u) return;
  let p = u; try{ const r = await api('myProfile'); if(r?.profile) p = {...u, ...r.profile}; }catch(e){}
  openModal(`
    <div class="font-head text-2xl mb-3">Kad Keahlian</div>
    <div class="member-card mb-3">
      <div class="mc-bg"></div>
      <div class="mc-head">
        <div class="mc-crest">⚜</div>
        <div><div class="mc-title">KAD KEAHLIAN</div><div class="mc-sub">Salasilah Keluarga Elit</div></div>
      </div>
      <div class="mc-body">
        <div class="mc-photo">${p.photo?`<img src="${p.photo}"/>`:(p.fullName||p.username||'?').slice(0,1).toUpperCase()}</div>
        <div class="mc-info">
          <div class="mc-name">${escapeHtml(p.fullName||p.username||'')}</div>
          <div class="mc-row"><span>No Ahli</span><b>${escapeHtml(p.memberId||'Menunggu Kelulusan')}</b></div>
        </div>
      </div>
    </div>
    <div class="text-right"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>
  `);
}

$('#btnAdmin').onclick = ()=> adminPanel('pending');
function adminPanel(tab='pending'){
  const isAdmin = ['admin','master'].includes(STORE.user?.role);
  openModal(`
    <div class="font-head text-2xl mb-3">Panel Pentadbir</div>
    <div class="flex gap-2 mb-3 flex-wrap">
      <button class="tab ${tab==='pending'?'active':''}" data-t="pending">Perubahan ${DATA.pending?.length?`<span class="chip" style="background:#b71c1c;color:#fff;margin-left:4px">${DATA.pending.length}</span>`:''}</button>
      <button class="tab ${tab==='users'?'active':''}" data-t="users">Pengguna Baru</button>
      <button class="tab ${tab==='log'?'active':''}" data-t="log">Log Lulus</button>
      <button class="tab ${tab==='seed'?'active':''}" data-t="seed">Cipta Akar</button>
    </div>
    <div id="adminBody" class="max-h-[60vh] overflow-y-auto pr-2 niceScroll"></div>
    <div class="text-right mt-3"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>
  `);
  $$('.tab', $('#modal')).forEach(b=> b.onclick = ()=>{ adminPanel(b.dataset.t); });
  const body = $('#adminBody');
  if(tab==='pending'){
    body.innerHTML = DATA.pending?.length ? DATA.pending.map(p=> renderPendingCard(p, isAdmin)).join('') : '<p class="text-sm ink-soft">Tiada perubahan menunggu.</p>';
    $$('button[data-a]', body).forEach(b=> b.onclick = async ()=>{
      if(b.dataset.a==='reject' && !confirm('Tolak perubahan ini?')) return;
      try{ await dispatchApi(b.dataset.a, { id:b.dataset.id }); notify.success("Selesai."); await refresh(); adminPanel('pending'); }catch(e){ toast(e.message); }
    });
  } else if(tab==='users'){
    const pu = DATA.pendingUsers || [];
    body.innerHTML = pu.length ? pu.map(u=>`
      <div class="bevel-soft rounded-lg p-2 mb-2 text-sm">
        <div><b>${escapeHtml(u.fullName)}</b> (@${escapeHtml(u.username)})</div>
        <div class="flex gap-2 mt-2">
          <button class="btn gold-edge" data-ap="${escapeHtml(u.username)}">Lulus & Beri No Ahli</button>
          <button class="btn btn-ghost" style="color:var(--danger)" data-rj="${escapeHtml(u.username)}">Padam</button>
        </div>
      </div>
    `).join('') : '<p class="text-sm ink-soft">Tiada akaun menunggu kelulusan.</p>';
    $$('button[data-ap]', body).forEach(b=> b.onclick = async ()=>{ try{ await dispatchApi('approveUser', { target:b.dataset.ap }); notify.success("Diluluskan."); await refresh(); adminPanel('users'); }catch(e){ toast(e.message); } });
    $$('button[data-rj]', body).forEach(b=> b.onclick = async ()=>{ if(confirm('Tolak?')){ try{ await dispatchApi('rejectUser', { target:b.dataset.rj }); notify.success("Ditolak."); await refresh(); adminPanel('users'); }catch(e){ toast(e.message); } } });
  } else if(tab==='seed'){
    body.innerHTML = `<button class="btn gold-edge" id="seedBtn">+ Tambah Moyang Pertama</button>`;
    $('#seedBtn').onclick = ()=>{ closeModal(); memberForm(null); };
  } else if(tab==='log'){
    const log = DATA.pendingLog || [];
    body.innerHTML = log.length ? log.slice().reverse().map(l=>`
      <div class="bevel-soft rounded-lg p-2 mb-2 text-xs">
        <div><b>${escapeHtml(l.action)}</b> — <span style="color:${l.status==='approved'?'var(--ok)':'var(--danger)'}">${escapeHtml(l.status)}</span></div>
        <div class="ink-soft">Oleh: <b>${escapeHtml(l.userFullName||l.user)}</b> (@${escapeHtml(l.user)})</div>
        <div class="ink-soft">Diluluskan/ditolak oleh: <b>${escapeHtml(l.approvedBy||'-')}</b> pada ${escapeHtml(l.approvedAt||'-')}</div>
      </div>
    `).join('') : '<p class="text-sm ink-soft">Belum ada log.</p>';
  }
}

const PENDING_FIELDS = ['name','gender','alive','birth','death','place','address','fatherName','motherName','notes'];
const PENDING_LABEL = { name:'Nama', gender:'Jantina', alive:'Status', birth:'Lahir', death:'Meninggal', place:'Asal', address:'Alamat', fatherName:'Bapa', motherName:'Ibu', notes:'Catatan' };
function fmtVal(k,v){ if(v===undefined||v===null||v==='') return '—'; if(k==='alive') return v===true||String(v)==='true'?'Hidup':'Allahyarham'; if(k==='gender') return v==='F'?'Perempuan':'Lelaki'; return String(v); }
function renderPendingCard(p, isAdmin){
  const before = p.before || {};
  const after = p.payload || {};
  const rows = PENDING_FIELDS.map(k=>{
    const bv = before[k], av = after[k];
    if(bv===undefined && av===undefined) return '';
    const changed = String(bv||'') !== String(av||'');
    return `<tr class="${changed?'diff-changed':''}"><td class="ink-soft">${PENDING_LABEL[k]}</td><td>${escapeHtml(fmtVal(k,bv))}</td><td><b>${escapeHtml(fmtVal(k,av))}</b></td></tr>`;
  }).join('');
  return `
    <div class="bevel-soft rounded-lg p-3 mb-2 pending-card">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm"><b>${escapeHtml(p.action)}</b> — <span class="ink-soft">oleh ${escapeHtml(p.userFullName||p.user)} (@${escapeHtml(p.user)})</span></div>
        <div class="text-xs ink-soft">${escapeHtml(p.ts||'')}</div>
      </div>
      ${rows? `<div class="diff-wrap"><table class="diff"><thead><tr><th></th><th>Asal</th><th>Cadangan</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<pre class="text-xs ink-soft" style="white-space:pre-wrap">${escapeHtml(JSON.stringify(after,null,2))}</pre>`}
      ${isAdmin? `<div class="flex gap-2 mt-3">
        <button class="btn gold-edge" data-a="approve" data-id="${p.id}">✅ Luluskan</button>
        <button class="btn btn-ghost" style="color:var(--danger)" data-a="reject" data-id="${p.id}">❌ Tolak</button>
      </div>`:'<div class="text-xs ink-soft mt-2">Menunggu kelulusan pentadbir…</div>'}
    </div>`;
}

// Akaun saya: papar draf saya jika ada
function myDraftsButton(){
  const u = STORE.user; if(!u) return '';
  const mine = (DATA.pending||[]).filter(p=>p.user===u.username);
  if(!mine.length) return '';
  return `<button class="btn btn-ghost justify-start" id="acDrafts">📝 Draf Saya (${mine.length})</button>`;
}

// Auto refresh ringan setiap 60s supaya semua pengguna nampak update terkini
let _autoRefT = null;
function startAutoRefresh(){
  if(_autoRefT) clearInterval(_autoRefT);
  _autoRefT = setInterval(()=>{ if(document.visibilityState==='visible') refresh(); }, 60000);
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') refresh(); });
}

function updatePendingBadge(){
  const n = (DATA.pending?.length || 0) + (DATA.pendingUsers?.length || 0);
  const b = $('#pendingBadge'); if(b){ b.style.display = n>0?'':'none'; b.textContent = n; }
}

async function refresh(){ try{ const r = await api('bootstrap'); DATA = { ...DATA, ...r.data }; STORE.cache = DATA; }catch(e){} renderAll(); updatePendingBadge(); }

if('serviceWorker' in navigator){ window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{})); }

boot();
