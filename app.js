/* ================================================================
   Salasilah Keluarga Elit — app.js
   ================================================================ */

// ====== KONFIGURASI ======
// 🔗 Tampal URL Web App Google Apps Script anda di sini:
const API_URL = "https://script.google.com/macros/s/AKfycbyhqYPlvRg27o3tnLXdDVOwFLrVuH42bcs__eEkCHOaUyY5rx-3g9pOCh8yEscZ83nF/exec";

// 📞 Talian / WhatsApp pentadbir untuk pengesahan maklumat salasilah.
const ADMIN_PHONE = "01110661077";
const ADMIN_WA = "60" + ADMIN_PHONE.replace(/[^0-9]/g, "").replace(/^0/, "");
function adminContactMsg(prefix){
  return (prefix || "📝 Disimpan sebagai DRAF.") +
    " Untuk pengesahan segera, sila hubungi pentadbir di WhatsApp / talian " + ADMIN_PHONE + ".";
}

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
  // Kelayakan log masuk disimpan supaya sesi boleh disegarkan secara senyap
  // (silent re-login) tanpa pengguna ter-log keluar bila token lapuk.
  get cred(){ try{return JSON.parse(localStorage.getItem('skg_cred')||'null')}catch{return null} },
  set cred(v){ v? localStorage.setItem('skg_cred', JSON.stringify(v)) : localStorage.removeItem('skg_cred') },
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

  if (!j.ok && j.error) {
    const err = new Error(j.error);
    // Penolakan peranan bukan sesi tamat. Menandainya sebagai authExpired akan
    // memadam sesi admin yang masih sah apabila sesuatu tindakan ditolak.
    if (/sesi.*tamat|log masuk semula|tidak dibenarkan/i.test(j.error)) err.authExpired = true;
    throw err;
  }
  return j;
}

async function flushQueue(){
  let q = STORE.queue; if(!q.length) return;
  if (STORE.user && STORE.cred) await silentRelogin();
  const left = [];
  for(const item of q){
    try {
      await api(item.action, item.payload);
    } catch(err) {
      left.push(item);
      if (!err.network) notify.warn("Perubahan luar talian belum dapat dihantar: " + (err.message || "ralat pelayan"), { ms:6000 });
    }
  }
  STORE.queue = left;
  if(q.length > left.length) notify.success("Penyegerakan luar talian selesai.");
}
window.addEventListener('online', flushQueue);
navigator.serviceWorker?.addEventListener?.('message', e => { if(e.data?.type==='SYNC_NOW') flushQueue(); });

// Segarkan sesi secara senyap menggunakan kelayakan yang disimpan.
// Mengembalikan true jika token baharu berjaya diperoleh.
let _reloginInFlight = null;
async function silentRelogin(){
  const c = STORE.cred;
  if(!c || !c.username || !c.password) return false;
  if(_reloginInFlight) return _reloginInFlight;
  _reloginInFlight = (async ()=>{
    try{
      const r = await api('login', { username:c.username, password:c.password });
      STORE.user = { username:r.username, role:r.role, token:r.token, fullName:r.fullName, memberId:r.memberId, photo:r.photo };
      return true;
    }catch(_){ return false; }
    finally{ _reloginInFlight = null; }
  })();
  return _reloginInFlight;
}

// Wrap API calls that can be queued offline
async function dispatchApi(action, payload) {
  try {
    return await api(action, payload);
  } catch (err) {
    // Kelulusan/penolakan tidak boleh dibaris-gilir secara luar talian kerana
    // keputusan admin mesti dibuat terhadap rekod pending semasa di pelayan.
    if (err.network && ['addMember','editMember','addSpouse','addChild','addNote','editNote'].includes(action)) {
      const q = STORE.queue; q.push({ action, payload, ts: Date.now() }); STORE.queue = q;
      notify.warn("Tiada internet — Perubahan telah disimpan dan akan disegerakkan kelak.", { ms: 6000 });
      return { ok: true, pending: true };
    }
    // Token lapuk: cuba segarkan sesi secara senyap & ulang tindakan SEKALI.
    // Hanya jika gagal sepenuhnya barulah minta log masuk semula — supaya
    // pengguna (terutama master/admin) tidak ter-log keluar tanpa sebab.
    if (err.authExpired && action !== 'login') {
      const ok = await silentRelogin();
      if (ok) {
        try { return await api(action, payload); }
        catch (e2) { err.message = e2.message || err.message; }
      }
      if (action !== 'bootstrap') {
        // Kekalkan identiti/tempatan. Jangan paksa logout hanya kerana satu
        // permintaan gagal; pengguna boleh cuba semula atau log masuk semula.
        notify.error("Sesi tidak dapat disahkan. Sila cuba semula atau log masuk semula.", { ms: 6000 });
      }
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
      <div class="chip gold-edge">v2.1</div>
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
    STORE.cred = { username:u, password:p }; // untuk segar semula sesi automatik

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
  $('#acLogout').onclick = ()=>{ STORE.user=null; STORE.cred=null; notify.success("Sesi tamat."); location.reload(); };
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
    let r = await api('bootstrap');
    // Token lapuk: server pulangkan viewer:null walaupun kita masih log masuk.
    // Segarkan sesi secara senyap supaya pengguna tidak hilang status admin/master.
    if (STORE.user && r?.data && !r.data.viewer) {
      if (await silentRelogin()) r = await api('bootstrap');
    }
    DATA = { ...DATA, ...r.data }; STORE.cache = DATA;
  } catch(e) {
    if (e.network) DATA = { ...DATA, ...(STORE.cache||{}) }; // fallback mode luartalian
    else notify.error(e.message);
  }
  renderAll(); updatePendingBadge();
  setTimeout(()=>{ $('#splash').style.display='none'; clearInterval(tipTimer); }, 400);
  flushQueue();
}


// Draf ahli BAHARU (addMember belum lulus) yang belum wujud dalam DATA.members.
// Server hanya hantar pending milik pengguna sendiri (untuk pengguna biasa) atau
// semua pending (untuk admin), jadi keterlihatan sudah terkawal di pelayan.
function getDraftAdds(){
  return (DATA.pending||[])
    .filter(p => p.action==='addMember' && p.payload && p.payload.id && !DATA.members.find(m=>String(m.id)===String(p.payload.id)))
    .map(p => ({ ...p.payload, alive: p.payload.alive!==false, _draft:true, _pending:p }));
}
// Peta id ahli sedia ada yang ada cadangan edit (editMember) belum lulus.
function getEditPendingMap(){
  const map = {};
  (DATA.pending||[]).forEach(p => { if(p.action==='editMember' && p.payload && p.payload.id) map[String(p.payload.id)] = p; });
  return map;
}
function getRenderMembers(){
  const editMap = getEditPendingMap();
  return DATA.members.concat(getDraftAdds()).map(m => {
    const pending = editMap[String(m.id)];
    return pending ? { ...m, ...pending.payload, _draft:true, _pending:pending } : m;
  });
}

// Draf PASANGAN (addSpouse belum lulus) supaya pasangan baharu turut dipaparkan
// dan anak draf boleh diletakkan di bawah pasangan tersebut.
function getDraftSpouses(){
  return (DATA.pending||[])
    .filter(p => p.action==='addSpouse' && p.payload && p.payload.id &&
      !(DATA.spouses||[]).find(s=>String(s.id)===String(p.payload.id)))
    .map(p => ({ ...p.payload, _draft:true }));
}
// Draf hubungan ANAK (addChild belum lulus) supaya anak draf duduk di bawah
// pasangan ibu/bapa, bukan terapung sebagai akar berasingan.
function getDraftChildLinks(){
  return (DATA.pending||[])
    .filter(p => p.action==='addChild' && p.payload && p.payload.childId && p.payload.spouseId &&
      !(DATA.children||[]).find(c=>String(c.childId)===String(p.payload.childId) && String(c.spouseId)===String(p.payload.spouseId)))
    .map(p => ({ ...p.payload, _draft:true }));
}
function getRenderSpouses(){ return (DATA.spouses||[]).concat(getDraftSpouses()); }
function getRenderChildren(){ return (DATA.children||[]).concat(getDraftChildLinks()); }

function buildLayout(){
  const MEMBERS = getRenderMembers();
  const SPOUSES = getRenderSpouses();
  const CHILDREN = getRenderChildren();
  const byId = Object.fromEntries(MEMBERS.map(m=>[m.id, m]));
  const childMap = {};
  CHILDREN.forEach(c=>{
    const sp = SPOUSES.find(s=>s.id===c.spouseId);
    if(!sp) return;
    [sp.husbandId, sp.wifeId].forEach(pid=>{
      if(pid) (childMap[pid] ||= []).push(c.childId);
    });
  });
  const placed = {};
  const roots = MEMBERS.filter(m => !CHILDREN.find(c=>c.childId===m.id));
  let cursorX = 200;
  const baseY = 220;

  function place(memberId, depth, startX){
    if(placed[memberId]) return placed[memberId].x + NODE_W;
    const m = byId[memberId]; if(!m) return startX;
    const spouseRecs = SPOUSES.filter(s=>s.husbandId===memberId || s.wifeId===memberId);
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
  getRenderMembers().forEach(m=>{ if(!placed[m.id]){ placed[m.id] = { x: cursorX, y: baseY }; cursorX += NODE_W + GAP_X; } });
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
  const editMap = getEditPendingMap();           // id ahli sedia ada -> cadangan edit
  const isAdmin = ['admin','master'].includes(STORE.user?.role);
  const frag = document.createDocumentFragment();
  getRenderMembers().forEach(m=>{
    const pos = layout[m.id] || {x:200,y:200};
    const el = document.createElement('div');
    const tag = m._tag || 'none';
    const tagCls = tag==='admin' ? 'tag-admin' : (tag==='member' ? 'tag-member' : '');
    // Draf = ahli baharu belum lulus (m._draft) ATAU ahli sedia ada yang ada cadangan edit.
    const editPending = editMap[String(m.id)] || null;
    const pendingRec = m._pending || editPending;
    const isDraft = !!pendingRec;
    const draftCls = isDraft ? 'tag-draft' : '';
    el.className = `node ${m.gender==='F'?'female':'male'} ${m.alive===false?'deceased':''} ${tagCls} ${draftCls}`;
    el.style.left = pos.x+'px'; el.style.top = pos.y+'px';
    el.dataset.id = m.id;
    const yrs = `${m.birth||'?'} – ${m.alive===false?(m.death||'?'):''}`.trim();
    const ic = m.gender==='F' ? '♀' : '♂';
    const badge = tag==='admin'
      ? '<span class="chip" style="background:linear-gradient(180deg,#ff8a8a,#b71c1c);color:#fff">🛡️ Admin</span>'
      : (tag==='member' ? `<span class="chip" style="background:linear-gradient(180deg,var(--gold-2),var(--gold));color:#241704">⭐ Ahli${m._memberId?' '+escapeHtml(m._memberId):''}</span>` : '');
    const draftBadge = isDraft
      ? `<span class="chip draft-chip">📝 Belum Disahkan</span>`
      : '';
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
    el.addEventListener('click', e=>{
      e.stopPropagation();
      if(isDraft && isAdmin) openDraftReview(m, pendingRec);
      else openMemberMenu(m);
    });
    frag.appendChild(el);
  });
  wrap.appendChild(frag);
}

// Paparan semakan kad DRAF (belum disahkan). Admin boleh sah/batal; pengedit
// hanya nampak status menunggu. Memaparkan nama pengedit & no telefon.
function openDraftReview(m, p){
  const isAdmin = ['admin','master'].includes(STORE.user?.role);
  const data = (p && p.payload) ? p.payload : m;
  const isNew = p && p.action==='addMember';
  const before = (p && p.before) || {};
  const fields = [
    ['name','Nama'], ['gender','Jantina'], ['alive','Status'], ['birth','Lahir'],
    ['death','Meninggal'], ['place','Asal'], ['address','Alamat'],
    ['fatherName','Bapa'], ['motherName','Ibu'], ['notes','Catatan']
  ];
  const fmt = (k,v)=> (v===undefined||v===null||v==='') ? '—'
    : k==='alive' ? ((v===true||String(v)==='true')?'Hidup':'Allahyarham')
    : k==='gender' ? (v==='F'?'Perempuan':'Lelaki') : String(v);
  const rows = fields.map(([k,lbl])=>{
    const av = data[k], bv = before[k];
    if(av===undefined && bv===undefined) return '';
    const changed = !isNew && String(bv||'')!==String(av||'');
    return `<div class="mc-row ${changed?'diff-changed':''}"><span>${lbl}</span><b>${escapeHtml(fmt(k,av))}</b></div>`;
  }).join('');

  const editorName = escapeHtml((p&&(p.userFullName||p.user))||'Tidak diketahui');
  const editorUser = escapeHtml((p&&p.user)||'');
  const phone = (p && (p.userWhatsapp||p.userPhone)) || '';
  const phoneClean = String(phone).replace(/[^0-9]/g,'');
  const waLink = phoneClean ? (phoneClean.startsWith('0') ? '6'+phoneClean : phoneClean) : '';
  const contactBlock = isAdmin ? `
    <div class="bevel-soft rounded-lg p-3 mb-2">
      <div class="text-xs ink-soft mb-1">Maklumat Pengedit (untuk siasatan sebelum sah)</div>
      <div class="mc-row"><span>Pengedit</span><b>${editorName} ${editorUser?'(@'+editorUser+')':''}</b></div>
      <div class="mc-row"><span>No. Telefon</span><b>${phone?escapeHtml(phone):'Tiada'}</b></div>
      ${waLink?`<a class="btn gold-edge w-full justify-center mt-2" target="_blank" rel="noopener" href="https://wa.me/${waLink}">💬 Hubungi via WhatsApp</a>`:''}
    </div>` : '';

  openModal(`
    <div class="flex items-center justify-between mb-2">
      <div class="font-head text-2xl">${isNew?'Profil Baharu (Draf)':'Cadangan Edit (Draf)'}</div>
      <span class="chip draft-chip">📝 Belum Disahkan</span>
    </div>
    <div class="profile-head mb-2">
      <div class="profile-avatar">${data.photo?`<img src="${data.photo}" alt="">`:(data.name||'?').slice(0,1).toUpperCase()}</div>
      <div class="profile-meta">
        <div class="pn">${escapeHtml(data.name||'Tanpa Nama')}</div>
        <div class="ps">${data.gender==='F'?'Perempuan':'Lelaki'} • ${data.alive===false?'Allahyarham':'Hidup'}</div>
      </div>
    </div>
    <div class="bevel-soft rounded-lg p-3 mb-2">${rows||'<div class="ink-soft text-sm">Tiada maklumat.</div>'}</div>
    ${contactBlock}
    ${isAdmin ? `
      <p class="text-xs ink-soft mb-2">Sila siasat maklumat & hubungi pengedit terlebih dahulu sebelum membuat pengesahan.</p>
      <div class="flex gap-2">
        <button class="btn gold-edge flex-1 justify-center" id="drApprove" data-id="${escapeHtml(p?p.id:'')}">✅ Sahkan</button>
        <button class="btn btn-ghost" style="color:var(--danger)" id="drReject" data-id="${escapeHtml(p?p.id:'')}">❌ Batalkan</button>
        <button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button>
      </div>` : `
      <div class="bevel-soft rounded-lg p-2 text-sm ink-soft">Maklumat ini sedang menunggu pengesahan pentadbir. Hanya anda &amp; pentadbir boleh melihatnya buat masa ini.</div>
      <div class="text-right mt-3"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>`}
  `);

  const ap = $('#drApprove');
  if(ap) ap.onclick = async ()=>{
    try{ await dispatchApi('approve', { id: ap.dataset.id }); notify.success('Profil disahkan.'); closeModal(); await refresh(); }
    catch(e){ toast('Gagal sah: '+e.message); }
  };
  const rj = $('#drReject');
  if(rj) rj.onclick = async ()=>{
    if(!confirm('Batalkan draf ini? Maklumat akan dibuang.')) return;
    try{ await dispatchApi('reject', { id: rj.dataset.id }); notify.success('Draf dibatalkan.'); closeModal(); await refresh(); }
    catch(e){ toast('Gagal batal: '+e.message); }
  };
}



function renderLinks(layout){
  const svg = $('#links');
  const byId = Object.fromEntries(getRenderMembers().map(m=>[m.id, m]));
  const SPOUSES = getRenderSpouses();
  const CHILDREN = getRenderChildren();
  let paths = '';
  let labels = '';
  SPOUSES.forEach(s=>{
    const a = layout[s.husbandId], b = layout[s.wifeId];
    if(!a || !b) return;
    paths += `<path class="spouse${s._draft?' draft-link':''}" d="M ${a.x + NODE_W/2} ${a.y + NODE_H/2} L ${b.x + NODE_W/2} ${b.y + NODE_H/2}"/>`;
  });
  CHILDREN.forEach(c=>{
    const sp = SPOUSES.find(s=>s.id===c.spouseId); if(!sp) return;
    const a = layout[sp.husbandId], b = layout[sp.wifeId], k = layout[c.childId];
    if(!k) return;
    const px = a && b ? (a.x+b.x)/2 + NODE_W/2 : (a||b).x + NODE_W/2;
    const py = (a||b).y + NODE_H;
    const my = (py+k.y)/2, kx = k.x + NODE_W/2;
    paths += `<path class="${c._draft?'draft-link':''}" d="M ${px} ${py} L ${px} ${my} L ${kx} ${my} L ${kx} ${k.y}"/>`;
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

// Susunan paparan mengikut header Google Sheet SALASILAH.
// Tambah/ubah di sini sahaja apabila kolum baharu ditambah — paparan tidak akan lari.
const MEMBER_FIELDS = [
  { key:'place',      label:'Tempat/Asal', adminOnly:true },
  { key:'address',    label:'Alamat',      adminOnly:true },
  { key:'fatherName', label:'Bapa',        adminOnly:false },
  { key:'motherName', label:'Ibu',         adminOnly:false },
  { key:'notes',      label:'Catatan',     adminOnly:true },
];

function openMemberMenu(m){
  const role = STORE.user?.role;
  const isAdmin = ['admin','master'].includes(role);
  const basic = `
    <div class="profile-head">
      <div class="profile-avatar">
        ${m.photo?`<img src="${m.photo}" alt="">`:(m.name||'?').slice(0,1).toUpperCase()}
      </div>
      <div class="profile-meta">
        <div class="pn">${escapeHtml(m.name||'Tanpa Nama')}</div>
        <div class="ps">${m.gender==='F'?'Perempuan':'Lelaki'} • ${m.alive===false?'Allahyarham':'Hidup'} • ${escapeHtml(m.birth||'?')}${m.alive===false?' – '+escapeHtml(m.death||'?'):''}</div>
      </div>
    </div>`;
  const rows = MEMBER_FIELDS
    .filter(f => (!f.adminOnly || isAdmin) && m[f.key])
    .map(f => `<div><b>${f.label}:</b> ${escapeHtml(m[f.key])}</div>`);
  const adminInfo = rows.length ? `<div class="profile-info bevel-soft">${rows.join('')}</div>` : '';

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

function loadImage(src){ return new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }

// Setup cropper bulat. Pulangkan fungsi getCropped() -> dataURL JPEG 400x400
function setupCropper(boxEl, img, initial){
  const BOX = 200, OUT = 400;
  // Saiz dasar supaya gambar isi penuh kotak (cover)
  const baseScale = Math.max(BOX / img.naturalWidth, BOX / img.naturalHeight);
  const state = { scale: baseScale * (initial?.zoom || 1), x: 0, y: 0 };
  const imgEl = document.createElement('img');
  imgEl.src = img.src;
  boxEl.appendChild(imgEl);
  function clamp(){
    const w = img.naturalWidth * state.scale;
    const h = img.naturalHeight * state.scale;
    state.x = Math.min(0, Math.max(BOX - w, state.x));
    state.y = Math.min(0, Math.max(BOX - h, state.y));
  }
  function apply(){
    clamp();
    imgEl.style.width = (img.naturalWidth * state.scale)+'px';
    imgEl.style.height = (img.naturalHeight * state.scale)+'px';
    imgEl.style.transform = `translate(${state.x}px, ${state.y}px)`;
  }
  // center pada mula
  state.x = (BOX - img.naturalWidth * state.scale)/2;
  state.y = (BOX - img.naturalHeight * state.scale)/2;
  apply();
  // drag
  let drag = null;
  boxEl.addEventListener('pointerdown', e=>{ drag = { sx:e.clientX, sy:e.clientY, x:state.x, y:state.y }; boxEl.setPointerCapture(e.pointerId); });
  boxEl.addEventListener('pointermove', e=>{ if(!drag) return; state.x = drag.x + (e.clientX - drag.sx); state.y = drag.y + (e.clientY - drag.sy); apply(); });
  boxEl.addEventListener('pointerup', ()=> drag = null);
  boxEl.addEventListener('pointercancel', ()=> drag = null);
  return {
    setZoom(z){
      const cx = BOX/2, cy = BOX/2;
      const px = (cx - state.x) / state.scale, py = (cy - state.y) / state.scale;
      state.scale = baseScale * z;
      state.x = cx - px * state.scale;
      state.y = cy - py * state.scale;
      apply();
    },
    getCropped(){
      const cv = document.createElement('canvas');
      cv.width = OUT; cv.height = OUT;
      const ctx = cv.getContext('2d');
      const ratio = OUT / BOX;
      // sumber: (-state.x/scale, -state.y/scale) saiz BOX/scale
      const sx = -state.x / state.scale, sy = -state.y / state.scale;
      const sSize = BOX / state.scale;
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
      return cv.toDataURL('image/jpeg', 0.88);
    }
  };
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
      <div class="field"><label>Meninggal</label><input id="f_d" value="${escapeHtml(m.death||'')}"/></div>
      <div class="field"><label>Asal</label><input id="f_p" value="${escapeHtml(m.place||'')}"/></div>
      <div class="field"><label>Nama bapa</label><input id="f_fa" value="${escapeHtml(m.fatherName||'')}"/></div>
      <div class="field"><label>Nama ibu</label><input id="f_mo" value="${escapeHtml(m.motherName||'')}"/></div>
      <div class="field sm:col-span-2"><label>Alamat menetap</label><textarea id="f_ad" rows="2">${escapeHtml(m.address||'')}</textarea></div>
      <div class="field sm:col-span-2"><label>Catatan</label><textarea id="f_n" rows="2">${escapeHtml(m.notes||'')}</textarea></div>
      <div class="field sm:col-span-2">
        <label>Gambar profil (sebarang saiz — auto kecilkan)</label>
        <input id="f_ph" type="file" accept="image/*"/>
        <div id="cropArea" class="crop-wrap mt-2" style="display:none">
          <div id="cropBox" class="crop-box"></div>
          <div class="crop-hint">
            Tarik gambar dalam bulatan untuk pilih sudut yang nak dipaparkan.
            <div class="crop-controls">
              <span style="font-size:.75rem">Zoom</span>
              <input id="f_zoom" type="range" min="1" max="3" step="0.05" value="1"/>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="flex gap-2 justify-end mt-2">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveMember">Simpan</button>
    </div>
  `);
  let cropper = null;
  $('#f_ph').addEventListener('change', async (e)=>{
    const file = e.target.files[0]; if(!file) return;
    if(!/^image\//.test(file.type)) return toast("Sila pilih fail gambar.");
    const url = URL.createObjectURL(file);
    try{
      const img = await loadImage(url);
      const box = $('#cropBox'); box.innerHTML = '';
      $('#cropArea').style.display = 'flex';
      cropper = setupCropper(box, img);
      $('#f_zoom').value = 1;
      $('#f_zoom').oninput = (ev)=> cropper.setZoom(parseFloat(ev.target.value));
    }catch(err){ toast("Gagal baca gambar."); }
  });
  $('#saveMember').onclick = async ()=>{
    const payload = { id:m.id, name:upperName($('#f_name').value), gender:$('#f_g').value, birth:$('#f_b').value.trim(), alive:$('#f_a').value==='true', death:$('#f_d').value.trim(), place:$('#f_p').value.trim(), address:$('#f_ad').value.trim(), fatherName:upperName($('#f_fa').value), motherName:upperName($('#f_mo').value), notes:$('#f_n').value.trim() };
    if(!payload.name) return toast("Nama wajib diisi.");
    if(cropper){
      const dataUrl = cropper.getCropped();
      payload.photoB64 = dataUrl.split(',')[1];
      payload.photoMime = 'image/jpeg';
    }
    try{ const r = await dispatchApi(isNew?'addMember':'editMember', payload); if(r.pending){ notify.warn(adminContactMsg('📝 Disimpan sebagai DRAF. Menunggu pengesahan pentadbir.'), { ms: 8000 }); } else { notify.success('Berjaya.'); } closeModal(); await refresh(); }catch(e){ toast("Gagal: "+e.message); }
  };
}

function spouseForm(m){
  const others = getRenderMembers().filter(x=>x.id!==m.id && x.gender!==m.gender && !x._draft);
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
    try{ const r = await dispatchApi('addSpouse', payload); if(r.pending){ notify.warn(adminContactMsg('📝 Pasangan disimpan sebagai DRAF. Menunggu pengesahan pentadbir.'), { ms: 8000 }); } else { notify.success("Selesai."); } closeModal(); await refresh(); }catch(e){ toast(e.message); }
  };
}

function childForm(m){
  const RMEMBERS = getRenderMembers();
  const findM = (id)=> RMEMBERS.find(x=>x.id===id);
  // Termasuk pasangan draf supaya anak boleh terus ditambah di bawah pasangan tersebut.
  const couples = getRenderSpouses().filter(s=>s.husbandId===m.id || s.wifeId===m.id);
  if(!couples.length) return toast("Sila daftarkan pasangan terlebih dahulu.");
  openModal(`
    <div class="font-head text-2xl mb-3">Tambah Anak</div>
    <div class="field"><label>Dari pasangan</label>
      <select id="ch_couple">${couples.map(c=>{const a=findM(c.husbandId),b=findM(c.wifeId);return `<option value="${c.id}">${escapeHtml(a?.name||'?')} & ${escapeHtml(b?.name||'?')}${c._draft?' (draf)':''}</option>`;}).join('')}</select>
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
    try{ const r = await dispatchApi('addChild', payload); if(r.pending){ notify.warn(adminContactMsg('📝 Anak disimpan sebagai DRAF di bawah pasangan. Menunggu pengesahan pentadbir.'), { ms: 8000 }); } else { notify.success("Berjaya."); } closeModal(); await refresh(); }catch(e){ toast(e.message); }
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
      <button class="tab ${tab==='members'?'active':''}" data-t="members">Senarai Ahli</button>
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
      <div class="bevel-soft rounded-lg p-2 mb-2 text-sm flex items-center gap-3">
        ${u.photo? `<img src="${escapeHtml(u.photo)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--line)">` : `<div style="width:44px;height:44px;border-radius:50%;background:var(--bg-soft);display:flex;align-items:center;justify-content:center">👤</div>`}
        <div class="flex-1 min-w-0">
          <button class="text-left w-full" data-pv="${escapeHtml(u.username)}" style="background:none;border:0;padding:0;color:inherit;cursor:pointer">
            <div class="truncate"><b style="text-decoration:underline">${escapeHtml(u.fullName||u.username)}</b></div>
            <div class="text-xs ink-soft truncate">@${escapeHtml(u.username)} — tekan untuk semak maklumat</div>
          </button>
          <div class="flex gap-2 mt-2">
            <button class="btn gold-edge" data-ap="${escapeHtml(u.username)}">Lulus & Beri No Ahli</button>
            <button class="btn btn-ghost" style="color:var(--danger)" data-rj="${escapeHtml(u.username)}">Padam</button>
          </div>
        </div>
      </div>
    `).join('') : '<p class="text-sm ink-soft">Tiada akaun menunggu kelulusan.</p>';
    $$('button[data-pv]', body).forEach(b=> b.onclick = ()=> viewPendingUser(b.dataset.pv));
    $$('button[data-ap]', body).forEach(b=> b.onclick = async ()=>{ try{ await dispatchApi('approveUser', { target:b.dataset.ap }); notify.success("Diluluskan."); await refresh(); adminPanel('users'); }catch(e){ toast(e.message); } });
    $$('button[data-rj]', body).forEach(b=> b.onclick = async ()=>{ if(confirm('Tolak?')){ try{ await dispatchApi('rejectUser', { target:b.dataset.rj }); notify.success("Ditolak."); await refresh(); adminPanel('users'); }catch(e){ toast(e.message); } } });
  } else if(tab==='members'){
    const isMaster = STORE.user?.role==='master';
    const list = (DATA.users || []).slice().sort((a,b)=> String(a.fullName||a.username).localeCompare(String(b.fullName||b.username)));
    if(!list.length){
      body.innerHTML = '<p class="text-sm ink-soft">Tiada ahli diluluskan lagi. Ahli akan muncul di sini selepas anda meluluskan pendaftaran mereka di tab “Pengguna Baru”.</p>';
    } else {
      body.innerHTML = `<p class="text-xs ink-soft mb-2">Lantik ahli sebagai <b>Admin</b> untuk membantu menguruskan salasilah, atau tarik balik peranan admin.</p>` +
      list.map(u=>{
        const isAdminRole = u.role==='admin';
        const phone = u.whatsapp || u.phone || '';
        return `
        <div class="bevel-soft rounded-lg p-2 mb-2 text-sm flex items-center gap-3">
          ${u.photo? `<img src="${escapeHtml(u.photo)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--line)">` : `<div style="width:44px;height:44px;border-radius:50%;background:var(--bg-soft);display:flex;align-items:center;justify-content:center">👤</div>`}
          <div class="flex-1 min-w-0">
            <div class="truncate"><b>${escapeHtml(u.fullName||u.username)}</b>
              ${isAdminRole?'<span class="chip" style="background:linear-gradient(180deg,#ff8a8a,#b71c1c);color:#fff;margin-left:4px">🛡️ Admin</span>':'<span class="chip" style="background:color-mix(in oklab, var(--gold) 25%, transparent);color:var(--ink);margin-left:4px">Ahli</span>'}
            </div>
            <div class="text-xs ink-soft truncate">@${escapeHtml(u.username)}${u.memberId?' • '+escapeHtml(u.memberId):''}${phone?' • '+escapeHtml(phone):''}</div>
            <div class="flex gap-2 mt-2">
              ${isAdminRole
                ? `<button class="btn btn-ghost" style="color:var(--danger)" data-role-user="${escapeHtml(u.username)}" data-role="user">Tarik Admin</button>`
                : `<button class="btn gold-edge" data-role-user="${escapeHtml(u.username)}" data-role="admin">Lantik sebagai Admin</button>`}
            </div>
          </div>
        </div>`;
      }).join('');
      $$('button[data-role-user]', body).forEach(b=> b.onclick = async ()=>{
        const target = b.dataset.roleUser, role = b.dataset.role;
        const verb = role==='admin' ? 'Lantik' : 'Tarik balik peranan admin daripada';
        if(!confirm(`${verb} @${target}?`)) return;
        try{ await dispatchApi('setRole', { username: target, role }); notify.success('Peranan dikemaskini.'); await refresh(); adminPanel('members'); }
        catch(e){ toast('Gagal: '+e.message); }
      });
    }
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

// Popup semakan maklumat pendaftar baharu (admin sahaja)
const PENDING_USER_FIELDS = [
  { key:'fullName',   label:'Nama Penuh' },
  { key:'username',   label:'Nama Pengguna' },
  { key:'fatherName', label:'Nama Bapa' },
  { key:'motherName', label:'Nama Ibu' },
  { key:'address',    label:'Alamat' },
  { key:'whatsapp',   label:'WhatsApp' },
  { key:'phone',      label:'Telefon' },
  { key:'email',      label:'E-mel' },
  { key:'occupation', label:'Pekerjaan' },
  { key:'createdAt',  label:'Tarikh Daftar' },
];
function viewPendingUser(username){
  const u = (DATA.pendingUsers||[]).find(x=> String(x.username)===String(username));
  if(!u){ toast('Maklumat tidak dijumpai.'); return; }
  const rows = PENDING_USER_FIELDS
    .filter(f => u[f.key])
    .map(f => `<div class="mc-row"><span>${f.label}</span><b>${escapeHtml(u[f.key])}</b></div>`)
    .join('');
  openModal(`
    <div class="modal-head"><b>Semak Permohonan Baharu</b><button class="btn btn-ghost" onclick="closeModal()">✕</button></div>
    <div class="p-3">
      <div class="flex flex-col items-center gap-2 mb-3">
        ${u.photo
          ? `<img src="${escapeHtml(u.photo)}" alt="${escapeHtml(u.fullName||'')}" style="width:140px;height:140px;border-radius:50%;object-fit:cover;border:2px solid var(--gold)">`
          : `<div style="width:140px;height:140px;border-radius:50%;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;font-size:48px;border:2px solid var(--line)">👤</div>`}
        <div class="text-center">
          <div><b>${escapeHtml(u.fullName||u.username)}</b></div>
          <div class="text-xs ink-soft">@${escapeHtml(u.username)}</div>
        </div>
      </div>
      <div class="bevel-soft rounded-lg p-3">${rows || '<div class="ink-soft text-sm">Tiada maklumat tambahan.</div>'}</div>
      <div class="flex gap-2 mt-3">
        <button class="btn gold-edge flex-1" id="pvApprove">✅ Luluskan & Beri No Ahli</button>
        <button class="btn btn-ghost" style="color:var(--danger)" id="pvReject">❌ Tolak</button>
        <button class="btn btn-ghost" onclick="closeModal()">Tutup</button>
      </div>
    </div>
  `);
  $('#pvApprove').onclick = async ()=>{
    try{ await dispatchApi('approveUser', { target:u.username }); notify.success('Diluluskan.'); closeModal(); await refresh(); adminPanel('users'); }
    catch(e){ toast(e.message); }
  };
  $('#pvReject').onclick = async ()=>{
    if(!confirm('Tolak permohonan ini?')) return;
    try{ await dispatchApi('rejectUser', { target:u.username }); notify.success('Ditolak.'); closeModal(); await refresh(); adminPanel('users'); }
    catch(e){ toast(e.message); }
  };
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

async function refresh(){ try{ let r = await api('bootstrap'); if (STORE.user && r?.data && !r.data.viewer) { if (await silentRelogin()) r = await api('bootstrap'); } DATA = { ...DATA, ...r.data }; STORE.cache = DATA; }catch(e){} renderAll(); updatePendingBadge(); }

if('serviceWorker' in navigator){ window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{})); }

boot();
