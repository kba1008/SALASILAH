/* ================================================================
   Salasilah Keluarga Elit — app.js
   ================================================================ */

// ====== KONFIGURASI ======
// 🔗 Tampal URL Web App Google Apps Script anda di sini:
const API_URL = "https://script.google.com/macros/s/AKfycbySnlDlLMvubSyGg9zrQ6KbGpH76gM38-HRk4z_GqX1rH6HK_fGQPVGNkRRUwBg7unn/exec";

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

let DATA = { members:[], spouses:[], children:[], notes:[], pending:[], returnedDrafts:[], pendingLog:[], users:[] };
const NODE_W = 220, NODE_H = 170, GAP_X = 60, GAP_Y = 120;
const upperName = (s) => String(s||'').replace(/\s+/g,' ').trim().toUpperCase();

function openModal(html){ $('#modal').innerHTML = html; $('#scrim').classList.add('show'); }
function closeModal(){ $('#scrim').classList.remove('show'); }
$('#scrim').addEventListener('click', e => { if(e.target.id==='scrim') closeModal(); });
window.closeModalGlobal = closeModal;

function openImageLightbox(src){
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lbImg');
  if(lb && img){ img.src = src; lb.classList.add('show'); }
}
function closeImageLightbox(){
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lbImg');
  if(lb){ lb.classList.remove('show'); }
  if(img){ setTimeout(()=> img.src = '', 200); }
}
document.addEventListener('keydown', e => { if(e.key==='Escape') closeImageLightbox(); });

function loginForm(){
  openModal(`
    <div class="flex items-center justify-between mb-3">
      <div class="font-head text-2xl">Selamat Datang</div>
      <div class="chip gold-edge">v3.2</div>
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
      <button class="btn gold-edge justify-start" id="acEditProfile">⚙️ Seting Profil</button>
      ${myDraftsButton()}
      <button class="btn btn-ghost justify-start" style="color:var(--danger)" id="acLogout">🚪 Log Keluar</button>
    </div>
    <div class="text-right mt-3"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>
  `);
  $('#acProfile').onclick = ()=>{ closeModal(); openProfile(); };
  $('#acEditProfile').onclick = ()=>{ closeModal(); openProfileEditor(); };
  const draftsBtn = $('#acDrafts'); if(draftsBtn) draftsBtn.onclick = openReturnedDrafts;
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
  // Butang auto global dimatikan — auto-susun kini ada pada kad Kepala Salasilah sahaja.
  $('#btnAutoTree').style.display = 'none';
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
    DATA = { ...DATA, ...r.data };
    // Pertahanan untuk backend/cache versi lama: hanya rekod yang benar-benar
    // aktif boleh menghasilkan kad draf atau masuk ke panel pengesahan.
    DATA.pending = (DATA.pending||[]).filter(p => {
      const status = String(p?.status||'').trim().toLowerCase();
      return status==='' || status==='pending';
    });
    STORE.cache = DATA;
  } catch(e) {
    if (e.network) {
      DATA = { ...DATA, ...(STORE.cache||{}) }; // fallback mode luartalian
      DATA.pending = (DATA.pending||[]).filter(p => {
        const status = String(p?.status||'').trim().toLowerCase();
        return status==='' || status==='pending';
      });
    }
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

// ===================================================================
// AUTO LAYOUT — Susunan salasilah kemas (tidy-tree)
// Mengira kedudukan setiap kad secara automatik berdasarkan generasi
// (kedalaman) dan menengahkan ibu/bapa di atas anak-anak. Pasangan
// diletak bersebelahan, anak digantung di bawah pasangan.
// ===================================================================
const COL_STEP = NODE_W + GAP_X;   // jarak melintang antara lajur
const ROW_STEP = NODE_H + GAP_Y;   // jarak menegak antara generasi
const ORIGIN_X = 200;
const ORIGIN_Y = 160;

// Susun ikut tahun lahir kemudian nama supaya kekal kemas & konsisten.
function _sortKey(m){
  const yr = parseInt(String(m && m.birth || '').replace(/[^0-9]/g,''),10);
  return [isFinite(yr) ? yr : 9999, String(m && m.name || '').toLowerCase()];
}

// Mengira kedudukan automatik (dalam piksel) untuk SEMUA ahli yang dipapar.
// Tidak mengambil kira posX/posY tersimpan — ini susunan "bersih".
function autoLayout(){
  const MEMBERS  = getRenderMembers();
  const SPOUSES  = getRenderSpouses();
  const CHILDREN = getRenderChildren();
  const byId = Object.fromEntries(MEMBERS.map(m=>[m.id, m]));

  const col = {};      // id -> lajur (float)
  const depthOf = {};  // id -> generasi
  const done = new Set();
  let cursor = 0;      // lajur seterusnya yang kosong

  const spousesOf = (id)=> SPOUSES
    .filter(s=> s.husbandId===id || s.wifeId===id)
    .map(s=> s.husbandId===id ? s.wifeId : s.husbandId)
    .filter(Boolean);

  const kidsOfUnit = (unit)=>{
    const out = [];
    SPOUSES.filter(s=> unit.includes(s.husbandId) || unit.includes(s.wifeId)).forEach(s=>{
      CHILDREN.filter(c=> c.spouseId===s.id).forEach(c=>{
        if(byId[c.childId] && !out.includes(c.childId)) out.push(c.childId);
      });
    });
    out.sort((a,b)=>{ const ka=_sortKey(byId[a]), kb=_sortKey(byId[b]); return ka[0]-kb[0] || (ka[1]<kb[1]?-1:1); });
    return out;
  };

  // Letak satu "unit" (ahli + pasangan) dan keturunannya secara post-order.
  // Mengembalikan senarai semua id yang diletak dalam subtree ini.
  function placeUnit(id, depth){
    if(done.has(id)) return [];
    done.add(id);
    const partners = spousesOf(id).filter(p=> p && !done.has(p));
    partners.forEach(p=> done.add(p));
    const unit = [id, ...partners];
    const unitCols = unit.length;

    const kids = kidsOfUnit(unit).filter(k=> !done.has(k));
    let placed = unit.slice();

    if(kids.length === 0){
      const left = cursor;
      unit.forEach((m,i)=>{ col[m] = left + i; depthOf[m] = depth; });
      cursor += unitCols;
    } else {
      const childLeft = cursor;
      kids.forEach(k=>{ placed = placed.concat(placeUnit(k, depth+1)); });
      const childRight = cursor;
      const childSpan = childRight - childLeft;
      if(unitCols <= childSpan){
        const unitLeft = childLeft + (childSpan - unitCols)/2;
        unit.forEach((m,i)=>{ col[m] = unitLeft + i; depthOf[m] = depth; });
      } else {
        // Ibu/bapa lebih lebar dari anak — anjak anak ke kanan supaya seimbang.
        const extra = unitCols - childSpan;
        placed.forEach(m=>{ if(!unit.includes(m)) col[m] += extra/2; });
        cursor += extra;
        unit.forEach((m,i)=>{ col[m] = childLeft + i; depthOf[m] = depth; });
      }
    }
    return placed;
  }

  // Akar = ahli tanpa ibu/bapa direkod.
  const childIds = new Set(CHILDREN.map(c=> c.childId));
  const roots = MEMBERS.filter(m=> !childIds.has(m.id)).sort((a,b)=>{
    const ka=_sortKey(a), kb=_sortKey(b); return ka[0]-kb[0] || (ka[1]<kb[1]?-1:1);
  });

  roots.forEach(r=>{
    if(done.has(r.id)) return;
    placeUnit(r.id, 0);
    cursor += 1; // ruang antara keluarga akar berasingan
  });

  // Ahli yatim (tiada kaitan langsung) — baris bawah.
  let maxDepth = 0;
  Object.values(depthOf).forEach(d=>{ if(d>maxDepth) maxDepth = d; });
  MEMBERS.forEach(m=>{
    if(done.has(m.id)) return;
    done.add(m.id);
    col[m.id] = cursor++; depthOf[m.id] = maxDepth + 2;
  });

  // Tukar lajur/generasi -> piksel.
  const placed = {};
  MEMBERS.forEach(m=>{
    const c = col[m.id]; const d = depthOf[m.id];
    if(c==null || d==null) return;
    placed[m.id] = { x: ORIGIN_X + c*COL_STEP, y: ORIGIN_Y + d*ROW_STEP };
  });
  return placed;
}

function buildLayout(){
  const placed = autoLayout();
  // Override dengan kedudukan tersimpan (admin telah seret kotak secara manual)
  getRenderMembers().forEach(m=>{
    if(m.posX!=null && m.posY!=null && isFinite(m.posX) && isFinite(m.posY)){
      placed[m.id] = { x: Number(m.posX), y: Number(m.posY) };
    }
  });
  return placed;
}

// ===================================================================
// AUTO LAYOUT — terhad kepada CABANG di bawah Kepala Salasilah sahaja
// ===================================================================
// Kumpul semua id (pasangan + keturunan) di bawah satu Kepala Salasilah.
function getSubtreeIds(headId){
  const SP = getRenderSpouses();
  const CH = getRenderChildren();
  const ids = new Set([headId]);
  const queue = [headId];
  while(queue.length){
    const id = queue.shift();
    SP.filter(s=> s.husbandId===id || s.wifeId===id).forEach(s=>{
      const pid = s.husbandId===id ? s.wifeId : s.husbandId;
      if(pid) ids.add(pid);
      CH.filter(c=> c.spouseId===s.id).forEach(c=>{
        if(c.childId && !ids.has(c.childId)){ ids.add(c.childId); queue.push(c.childId); }
      });
    });
  }
  return ids;
}

// Cari Kepala Salasilah yang merangkumi ahli tertentu (jika ada).
function findHeadForMember(id){
  const heads = Array.from(getHeadRoots());
  for(const h of heads){ if(getSubtreeIds(h).has(id)) return h; }
  return null;
}

// 3 variasi tetap — berulang setiap kali butang ditekan.
const AUTO_VARIANTS = [
  { gapX: GAP_X,        gapY: GAP_Y,        reverse: false, label: 'standard' },
  { gapX: GAP_X * 1.6,  gapY: GAP_Y,        reverse: false, label: 'lebar'    },
  { gapX: GAP_X,        gapY: GAP_Y * 1.25, reverse: true,  label: 'terbalik' },
];

// Kira tata letak HANYA untuk subtree Kepala Salasilah, mengikut variasi.
function autoLayoutSubtree(headId, variantIdx){
  const cfg = AUTO_VARIANTS[((variantIdx%3)+3)%3];
  const colStep = NODE_W + cfg.gapX;
  const rowStep = NODE_H + cfg.gapY;

  const MEMBERS  = getRenderMembers();
  const SPOUSES  = getRenderSpouses();
  const CHILDREN = getRenderChildren();
  const byId = Object.fromEntries(MEMBERS.map(m=>[m.id, m]));
  const subtree = getSubtreeIds(headId);

  const col = {}, depthOf = {}, done = new Set();
  let cursor = 0;

  const spousesOf = id => SPOUSES
    .filter(s=> s.husbandId===id || s.wifeId===id)
    .map(s=> s.husbandId===id ? s.wifeId : s.husbandId)
    .filter(Boolean);

  const kidsOfUnit = unit => {
    const out = [];
    SPOUSES.filter(s=> unit.includes(s.husbandId) || unit.includes(s.wifeId)).forEach(s=>{
      CHILDREN.filter(c=> c.spouseId===s.id).forEach(c=>{
        if(byId[c.childId] && subtree.has(c.childId) && !out.includes(c.childId)) out.push(c.childId);
      });
    });
    out.sort((a,b)=>{ const ka=_sortKey(byId[a]), kb=_sortKey(byId[b]); return ka[0]-kb[0] || (ka[1]<kb[1]?-1:1); });
    if(cfg.reverse) out.reverse();
    return out;
  };

  function placeUnit(id, depth){
    if(done.has(id) || !subtree.has(id)) return [];
    done.add(id);
    const partners = spousesOf(id).filter(p=> p && subtree.has(p) && !done.has(p));
    partners.forEach(p=> done.add(p));
    const unit = [id, ...partners];
    const unitCols = unit.length;
    const kids = kidsOfUnit(unit).filter(k=> !done.has(k));
    let placed = unit.slice();
    if(kids.length === 0){
      const left = cursor;
      unit.forEach((m,i)=>{ col[m] = left + i; depthOf[m] = depth; });
      cursor += unitCols;
    } else {
      const childLeft = cursor;
      kids.forEach(k=>{ placed = placed.concat(placeUnit(k, depth+1)); });
      const childRight = cursor;
      const span = childRight - childLeft;
      if(unitCols <= span){
        const unitLeft = childLeft + (span - unitCols)/2;
        unit.forEach((m,i)=>{ col[m] = unitLeft + i; depthOf[m] = depth; });
      } else {
        const extra = unitCols - span;
        placed.forEach(m=>{ if(!unit.includes(m)) col[m] += extra/2; });
        cursor += extra;
        unit.forEach((m,i)=>{ col[m] = childLeft + i; depthOf[m] = depth; });
      }
    }
    return placed;
  }
  placeUnit(headId, 0);

  // Penambat: kekal kedudukan semasa Kepala Salasilah (jika ada), supaya
  // cabang tidak melompat ke penjuru kanvas setiap kali disusun.
  const head = byId[headId];
  const anchorX = (head && head.posX!=null && isFinite(head.posX)) ? Number(head.posX) : ORIGIN_X;
  const anchorY = (head && head.posY!=null && isFinite(head.posY)) ? Number(head.posY) : ORIGIN_Y;
  const headCol = col[headId] || 0;

  const placed = {};
  Object.keys(col).forEach(id=>{
    const dx = (col[id] - headCol) * colStep;
    const dy = depthOf[id] * rowStep;
    placed[id] = { x: Math.round(anchorX + dx), y: Math.round(anchorY + dy) };
  });
  return placed;
}

// Simpan kitaran variasi per-Kepala — berulang 3 variasi yang sama.
const _autoVariant = {};

// Susun cabang di bawah satu Kepala Salasilah. Setiap tekan = variasi seterusnya.
async function autoArrangeHead(headId){
  if(!headId) return;
  if(!isHeadRoot(headId)){ notify.warn('Auto-susun terhad kepada Kepala Salasilah sahaja.'); return; }
  const v = (_autoVariant[headId] || 0) % 3;
  _autoVariant[headId] = (v + 1) % 3;
  const layout = autoLayoutSubtree(headId, v);
  const knownIds = new Set((DATA.members||[]).map(m=> String(m.id)));
  const positions = Object.keys(layout)
    .filter(id=> knownIds.has(String(id)))
    .map(id=> ({ id, x: layout[id].x, y: layout[id].y }));
  if(!positions.length){ notify.info('Tiada cabang untuk disusun.'); return; }
  DATA.members = (DATA.members||[]).map(m=>{
    const f = positions.find(x=> String(x.id)===String(m.id));
    return f ? { ...m, posX:f.x, posY:f.y } : m;
  });
  renderAll();
  notify.success(`Cabang disusun (variasi ${v+1}/3 • ${AUTO_VARIANTS[v].label}).`);
  try{ await dispatchApi('setPositions', { positions }); }
  catch(err){ notify.warn('Susunan dipaparkan tetapi gagal disimpan: ' + (err && err.message || err)); }
}

// Auto-letak kemas untuk kad BAHARU sahaja (pasangan/anak yang baru ditambah).
// 1) Jika kad baharu jatuh di bawah sebuah Kepala Salasilah, susun semula
//    cabang tersebut menggunakan variasi 0 (tanpa kitar) — hasil paling kemas.
// 2) Selainnya, letak bersebelahan pasangan / di bawah ibu-bapa supaya
//    tidak ditinggalkan di penjuru kanvas.
async function autoPlaceNew(hints){
  const hasPos = (m)=> m.posX!=null && m.posY!=null && isFinite(m.posX) && isFinite(m.posY);
  const hintIds = Array.isArray(hints) ? hints.filter(Boolean).map(String) : [];
  const newOnes = (DATA.members||[]).filter(m=> !hasPos(m) || hintIds.includes(String(m.id)));
  if(!newOnes.length && !hintIds.length) return;

  const positions = [];
  const placedIds = new Set();

  // (1) Susun semula setiap cabang Kepala yang mempunyai kad baharu / hint.
  const headsToFix = new Set();
  newOnes.forEach(m=>{ const h = findHeadForMember(m.id); if(h) headsToFix.add(h); });
  hintIds.forEach(id=>{ const h = findHeadForMember(id); if(h) headsToFix.add(h); });
  headsToFix.forEach(h=>{
    const layout = autoLayoutSubtree(h, 0);
    Object.keys(layout).forEach(id=>{
      if(placedIds.has(String(id))) return;
      positions.push({ id, x: layout[id].x, y: layout[id].y });
      placedIds.add(String(id));
    });
  });

  // (2) Kad baharu di luar mana-mana Kepala Salasilah — letak dekat saudara.
  const lay  = buildLayout();
  const auto = autoLayout();
  const SP = getRenderSpouses();
  const CH = getRenderChildren();
  const taken = new Set(Object.values(lay).map(p=>`${Math.round(p.x)},${Math.round(p.y)}`));
  positions.forEach(p=> taken.add(`${p.x},${p.y}`));

  newOnes.filter(m=> !placedIds.has(String(m.id))).forEach(m=>{
    let pos = null;
    const partnerIds = SP.filter(s=>s.husbandId===m.id||s.wifeId===m.id)
      .map(s=> s.husbandId===m.id ? s.wifeId : s.husbandId).filter(Boolean);
    for(const pid of partnerIds){
      if(lay[pid]){ pos = { x: lay[pid].x + COL_STEP, y: lay[pid].y }; break; }
    }
    if(!pos){
      const parentSpouseIds = CH.filter(c=>c.childId===m.id).map(c=>c.spouseId);
      for(const sid of parentSpouseIds){
        const sp = SP.find(s=>s.id===sid); if(!sp) continue;
        const pa = lay[sp.husbandId] || lay[sp.wifeId];
        if(pa){
          const sibs = CH.filter(c=>c.spouseId===sid).map(c=>c.childId)
            .filter(id=> id!==m.id && lay[id]);
          pos = { x: pa.x + sibs.length*COL_STEP, y: pa.y + ROW_STEP };
          break;
        }
      }
    }
    if(!pos) pos = auto[m.id];
    if(!pos) return;
    let x = Math.round(pos.x), y = Math.round(pos.y), guard = 0;
    while(taken.has(`${x},${y}`) && guard++ < 80){ x += COL_STEP; }
    taken.add(`${x},${y}`);
    positions.push({ id:m.id, x, y });
    placedIds.add(String(m.id));
  });

  if(!positions.length) return;
  DATA.members = (DATA.members||[]).map(m=>{
    const f = positions.find(x=> String(x.id)===String(m.id));
    return f ? { ...m, posX:f.x, posY:f.y } : m;
  });
  renderAll();
  try{ await dispatchApi('setPositions', { positions }); }catch(_){}
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
  const headRoots = getHeadRoots();
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
    const isHead = headRoots.has(m.id);
    el.className = `node ${m.gender==='F'?'female':'male'} ${m.alive===false?'deceased':''} ${tagCls} ${draftCls} ${isHead?'root-head':''}`;
    if(isHead) el.title = isAdmin ? 'Kepala Salasilah — seret untuk gerakkan keseluruhan family tree' : 'Kepala Salasilah';
    el.style.left = pos.x+'px'; el.style.top = pos.y+'px';
    el.dataset.id = m.id;
    const yrs = `${m.birth||'?'} – ${m.alive===false?(m.death||'?'):''}`.trim();
    const ic = m.gender==='F' ? '♀' : '♂';
    const badge = tag==='admin'
      ? '<span class="chip" style="background:linear-gradient(180deg,#ff8a8a,#b71c1c);color:#fff">🛡️ Admin</span>'
      : (tag==='member' ? `<span class="chip" style="background:linear-gradient(180deg,var(--gold-2),var(--gold));color:#241704">⭐ Ahli${m._memberId?' '+escapeHtml(m._memberId):''}</span>` : '');
    const draftBadge = isDraft
      ? `<span class="chip draft-chip">📝 ${pendingRec?.user===STORE.user?.username?'Draf Anda':'Sedang diedit: @'+escapeHtml(pendingRec?.user||'pengguna')}</span>`
      : '';
    el.innerHTML = `
      <div class="avatar">${m.photo?`<img src="${m.photo}" class="lb-img" onclick="event.stopPropagation();openImageLightbox('${m.photo}')" alt="${escapeHtml(m.name||'')}">`:(m.name||'?').slice(0,1).toUpperCase()}</div>
      <div class="nm">${escapeHtml(m.name||'Tanpa Nama')}</div>
      <div class="yrs">${escapeHtml(yrs)}</div>
      <div class="row">
        <span class="chip" style="background:color-mix(in oklab, var(--gold) 25%, transparent); color:var(--ink)">${ic}</span>
        ${m.alive===false?'<span class="chip" style="background:#3334; color:var(--ink)">Allahyarham</span>':'<span class="chip" style="background:color-mix(in oklab, var(--ok) 30%, transparent); color:var(--ink)">Hidup</span>'}
        ${isHead?'<span class="chip root-head-chip">👑 Kepala</span>':''}${badge}${draftBadge}
      </div>
    `;
    el.addEventListener('click', e=>{
      e.stopPropagation();
      if(isDraft && (isAdmin || pendingRec?.user!==STORE.user?.username)) openDraftReview(m, pendingRec);
      else openMemberMenu(m);
    });
    if (isAdmin) enableNodeDrag(el, m.id, layout);
    frag.appendChild(el);
  });
  wrap.appendChild(frag);
}

// ===== Drag-and-drop kotak kad (admin/master) =====
// - Drag kotak akar (tiada ibu/bapa) -> kesemua keturunan & pasangan bergerak sekali
// - Drag kotak biasa -> hanya kotak itu bergerak, garis dilukis semula auto
function getSubtreeIds(rootId){
  const SPOUSES = getRenderSpouses();
  const CHILDREN = getRenderChildren();
  const set = new Set([rootId]);
  const queue = [rootId];
  while(queue.length){
    const id = queue.shift();
    // Pasangan kepada id
    SPOUSES.forEach(s=>{
      const partner = s.husbandId===id ? s.wifeId : (s.wifeId===id ? s.husbandId : null);
      if(partner && !set.has(partner)){ set.add(partner); queue.push(partner); }
    });
    // Anak melalui mana-mana pasangan yang melibatkan id
    SPOUSES.filter(s=>s.husbandId===id || s.wifeId===id).forEach(s=>{
      CHILDREN.filter(c=>c.spouseId===s.id).forEach(c=>{
        if(!set.has(c.childId)){ set.add(c.childId); queue.push(c.childId); }
      });
    });
  }
  return set;
}
function isRootMember(id){
  const CHILDREN = getRenderChildren();
  return !CHILDREN.find(c=>c.childId===id);
}
// Adakah ahli ini ditetapkan sebagai Kepala Salasilah oleh admin?
function isHeadFlag(m){
  const v = m && m.isHead;
  return v===true || v===1 || v==='1' || String(v).toLowerCase()==='true';
}
// "Kepala Root" = ahli yang DITANDA oleh admin sahaja.
// Jika admin nyahkan tanda kepala, tiada kad akan memakai crown/gerak seluruh
// tree sehingga admin lantik semula. Ini mengelak sistem auto-pindahkan tag
// kepada pasangan atau root lain tanpa arahan admin.
function getHeadRoots(){
  const MEMBERS = getRenderMembers();
  const heads = new Set();
  MEMBERS.forEach(m=>{ if(isHeadFlag(m)) heads.add(m.id); });
  return heads;
}
function isHeadRoot(id){ return getHeadRoots().has(id); }
let _dragState = null;
function enableNodeDrag(el, id, layout){
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e)=>{
    if(e.button && e.button!==0) return;
    // jangan ganggu klik pada gambar / butang dalam kad
    if(e.target.closest('.lb-img,button,a,input,select,textarea')) return;
    e.stopPropagation();
    const isRoot = isHeadRoot(id);
    const ids = isRoot ? getSubtreeIds(id) : new Set([id]);
    const scale = panzoomInstance ? panzoomInstance.getScale() : 1;
    const lay = buildLayout(); // snapshot terkini
    const positions = {};
    ids.forEach(mid => { const p = lay[mid]; if(p) positions[mid] = { x:p.x, y:p.y }; });
    _dragState = { ids, positions, scale, sx:e.clientX, sy:e.clientY, layout:lay, moved:false, isRoot };
    el.setPointerCapture(e.pointerId);
    // halang panzoom semasa seret
    if(panzoomInstance) panzoomInstance.setOptions({ disablePan:true });
    document.body.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', (e)=>{
    if(!_dragState) return;
    const dx = (e.clientX - _dragState.sx) / _dragState.scale;
    const dy = (e.clientY - _dragState.sy) / _dragState.scale;
    if(Math.abs(dx)+Math.abs(dy) > 2) _dragState.moved = true;
    _dragState.ids.forEach(mid => {
      const start = _dragState.positions[mid]; if(!start) return;
      const nx = start.x + dx, ny = start.y + dy;
      _dragState.layout[mid] = { x:nx, y:ny };
      const node = document.querySelector(`#nodes .node[data-id="${mid}"]`);
      if(node){ node.style.left = nx+'px'; node.style.top = ny+'px'; }
    });
    renderLinks(_dragState.layout);
  });
  const finish = async (e)=>{
    if(!_dragState) return;
    const st = _dragState; _dragState = null;
    if(panzoomInstance) panzoomInstance.setOptions({ disablePan:false });
    document.body.style.cursor = '';
    if(!st.moved) return;
    const positions = [];
    st.ids.forEach(mid => {
      const p = st.layout[mid]; if(!p) return;
      positions.push({ id:mid, x:Math.round(p.x), y:Math.round(p.y) });
    });
    try{
      await dispatchApi('setPositions', { positions });
      // segarkan DATA supaya posX/posY tersimpan kekal selepas refresh seterusnya
      DATA.members = DATA.members.map(m=>{
        const f = positions.find(x=>String(x.id)===String(m.id));
        return f ? { ...m, posX:f.x, posY:f.y } : m;
      });
      notify.success(st.isRoot ? 'Keseluruhan family tree dipindahkan.' : 'Kotak dipindahkan.');
    }catch(err){ toast('Gagal simpan kedudukan: '+err.message); await refresh(); }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
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
      <div class="bevel-soft rounded-lg p-2 text-sm ink-soft">Maklumat ini sedang menunggu pengesahan pentadbir. Pengedit: <b>@${editorUser}</b>. Pengguna lain hanya boleh melihat sehingga pengesahan selesai.</div>
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
  const isAdmin = ['admin','master'].includes(STORE.user?.role);
  let paths = '';
  let labels = '';
  let handles = '';
  const junctions = {}; // spouseId -> {x,y}
  SPOUSES.forEach(s=>{
    const a = layout[s.husbandId], b = layout[s.wifeId];
    if(!a || !b) return;
    paths += `<path class="spouse${s._draft?' draft-link':''}" d="M ${a.x + NODE_W/2} ${a.y + NODE_H/2} L ${b.x + NODE_W/2} ${b.y + NODE_H/2}"/>`;
    // Titik pertemuan cabang (junction) — di tengah garisan pasangan + offset manual.
    const cx = (a.x + b.x)/2 + NODE_W/2;
    const cy = (a.y + b.y)/2 + NODE_H/2;
    const dx = Number(s.junctionDx) || 0;
    const dy = Number(s.junctionDy) || 0;
    junctions[s.id] = { x: cx + dx, y: cy + dy };
  });
  CHILDREN.forEach(c=>{
    const sp = SPOUSES.find(s=>s.id===c.spouseId); if(!sp) return;
    const j = junctions[sp.id];
    const a = layout[sp.husbandId], b = layout[sp.wifeId], k = layout[c.childId];
    if(!k) return;
    let jx, jy;
    if(j){ jx = j.x; jy = j.y; }
    else { jx = a && b ? (a.x+b.x)/2 + NODE_W/2 : (a||b).x + NODE_W/2; jy = (a||b).y + NODE_H; }
    const kx = k.x + NODE_W/2;
    // Busbar pada paras junction; jika junction di atas anak guna jy, jika tidak turun dulu.
    const busY = jy < k.y - 4 ? jy : k.y - 20;
    paths += `<path class="${c._draft?'draft-link':''}" d="M ${jx} ${jy} L ${jx} ${busY} L ${kx} ${busY} L ${kx} ${k.y}"/>`;
    // Label kecil maklumat ibu/bapa pada cabang (untuk poligami / >1 perkahwinan)
    const dad = byId[sp.husbandId], mom = byId[sp.wifeId];
    const dn = (dad?.name||'?').split(' ')[0];
    const mn = (mom?.name||'?').split(' ')[0];
    const lblY = busY - 6;
    labels += `<g class="branch-lbl"><rect x="${kx-58}" y="${lblY-11}" width="116" height="14" rx="6"/><text x="${kx}" y="${lblY}" text-anchor="middle">${escapeHtml(dn)} × ${escapeHtml(mn)}</text></g>`;
  });
  // Pemegang junction — hanya admin & jika pasangan punya anak.
  if(isAdmin){
    const hasKids = new Set(CHILDREN.map(c=>c.spouseId));
    Object.keys(junctions).forEach(sid=>{
      if(!hasKids.has(sid)) return;
      const j = junctions[sid];
      handles += `<circle class="junction-handle" data-spouseid="${sid}" cx="${j.x}" cy="${j.y}" r="7"/>`;
    });
  }
  svg.innerHTML = paths + labels + handles;
  if(isAdmin) wireJunctionHandles(svg);
}

let _junctionDrag = null;
function wireJunctionHandles(svg){
  svg.querySelectorAll('.junction-handle').forEach(h=>{
    h.style.cursor = 'grab';
    h.addEventListener('pointerdown', (e)=>{
      e.stopPropagation(); e.preventDefault();
      const sid = h.dataset.spouseid;
      const sp = getRenderSpouses().find(s=>String(s.id)===String(sid)); if(!sp) return;
      const scale = panzoomInstance ? panzoomInstance.getScale() : 1;
      _junctionDrag = { sid, sx:e.clientX, sy:e.clientY, scale,
        baseDx: Number(sp.junctionDx)||0, baseDy: Number(sp.junctionDy)||0, moved:false };
      h.setPointerCapture(e.pointerId);
      if(panzoomInstance) panzoomInstance.setOptions({ disablePan:true });
      h.style.cursor = 'grabbing';
    });
    h.addEventListener('pointermove', (e)=>{
      if(!_junctionDrag || _junctionDrag.sid !== h.dataset.spouseid) return;
      const dx = (e.clientX - _junctionDrag.sx) / _junctionDrag.scale;
      const dy = (e.clientY - _junctionDrag.sy) / _junctionDrag.scale;
      if(Math.abs(dx)+Math.abs(dy) > 2) _junctionDrag.moved = true;
      const sid = _junctionDrag.sid;
      const sp = (DATA.spouses||[]).find(s=>String(s.id)===String(sid));
      if(sp){ sp.junctionDx = _junctionDrag.baseDx + dx; sp.junctionDy = _junctionDrag.baseDy + dy; }
      renderLinks(buildLayout());
    });
    const end = async (e)=>{
      if(!_junctionDrag || _junctionDrag.sid !== h.dataset.spouseid) return;
      const st = _junctionDrag; _junctionDrag = null;
      if(panzoomInstance) panzoomInstance.setOptions({ disablePan:false });
      h.style.cursor = 'grab';
      if(!st.moved) return;
      const sp = (DATA.spouses||[]).find(s=>String(s.id)===String(st.sid));
      if(!sp) return;
      try{ await dispatchApi('setJunction', { spouseId: st.sid, dx: Math.round(sp.junctionDx||0), dy: Math.round(sp.junctionDy||0) }); }
      catch(err){ notify.warn('Junction tidak disimpan: ' + (err.message||err)); }
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  });
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
const _btnAutoTree = document.getElementById('btnAutoTree');
if(_btnAutoTree) _btnAutoTree.style.display = 'none';

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
  const lock = (DATA.pending||[]).find(p => ['addMember','editMember'].includes(p.action) && String(p.payload?.id)===String(m.id));
  const lockedByOther = !!lock && !isAdmin && lock.user!==STORE.user?.username;
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
      ${role&&!lockedByOther?'<button class="btn gold-edge justify-center" data-act="edit">✏️ '+(isAdmin?'Edit':'Cadang Edit')+'</button>':''}
      ${role&&!lockedByOther?'<button class="btn gold-edge justify-center" data-act="spouse">💍 '+(isAdmin?'Tambah':'Cadang')+' Pasangan</button>':''}
      ${role&&!lockedByOther?'<button class="btn gold-edge justify-center" data-act="child">👶 '+(isAdmin?'Tambah':'Cadang')+' Anak</button>':''}
      ${isAdmin?'<button class="btn btn-ghost justify-center" data-act="note">📝 Tambah Nota</button>':''}
      ${isAdmin?'<button class="btn btn-ghost justify-center" data-act="move">🔀 Pindah Cabang</button>':''}
      ${isAdmin&&isRootMember(m.id)&&!isHeadFlag(m)?'<button class="btn btn-ghost justify-center" data-act="sethead">👑 Jadikan Kepala</button>':''}
      ${isAdmin&&isHeadFlag(m)?'<button class="btn btn-ghost justify-center" data-act="unsethead">🚫 Nyahkan Kepala</button>':''}
      ${isAdmin&&isHeadFlag(m)?'<button class="btn gold-edge justify-center" data-act="autohead" title="Susun automatik semua pasangan & keturunan di bawah kepala ini (3 variasi berkitar)">🌳 Auto Susun Cabang</button>':''}
      ${isAdmin?'<button class="btn btn-ghost justify-center" style="color:var(--danger)" data-act="del">🗑️ Padam</button>':''}
    </div>
    ${lockedByOther?`<div class="bevel-soft rounded-lg p-2 mt-2 text-sm ink-soft">🔒 Sedang diedit oleh <b>@${escapeHtml(lock.user)}</b>. Edit dibuka semula selepas pentadbir membuat keputusan.</div>`:''}
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
    else if(act==='sethead') setHeadRoot(m);
    else if(act==='unsethead') unsetHeadRoot(m);
    else if(act==='autohead'){ closeModal(); autoArrangeHead(m.id); }
  });
}

// Admin menetapkan ahli ini sebagai Kepala Salasilah (puncak family tree).
async function setHeadRoot(m){
  if(!isRootMember(m.id)){ toast('Hanya ahli tanpa ibu/bapa boleh jadi Kepala Salasilah.'); return; }
  try{
    await dispatchApi('setHead', { id:m.id });
    notify.success('👑 ' + (m.name||'Ahli') + ' kini Kepala Salasilah.');
    closeModal();
    await refresh();
  }catch(e){ toast(e.message); }
}

// Admin menyahkan status Kepala Salasilah daripada ahli ini.
async function unsetHeadRoot(m){
  try{
    await dispatchApi('unsetHead', { id:m.id });
    notify.success('🚫 ' + (m.name||'Ahli') + ' bukan lagi Kepala Salasilah.');
    closeModal();
    await refresh();
  }catch(e){ toast(e.message); }
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
      ${!['admin','master'].includes(STORE.user?.role)?'<div class="field sm:col-span-2"><label>Catatan kepada admin (hanya admin boleh lihat)</label><textarea id="f_reason" rows="2" placeholder="Terangkan sumber atau sebab maklumat ini diyakini tepat"></textarea></div>':''}
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
    const payload = { id:m.id, name:upperName($('#f_name').value), gender:$('#f_g').value, birth:$('#f_b').value.trim(), alive:$('#f_a').value==='true', death:$('#f_d').value.trim(), place:$('#f_p').value.trim(), address:$('#f_ad').value.trim(), fatherName:upperName($('#f_fa').value), motherName:upperName($('#f_mo').value), notes:$('#f_n').value.trim(), reason:$('#f_reason')?.value.trim()||'' };
    if(!payload.name) return toast("Nama wajib diisi.");
    if(cropper){
      const dataUrl = cropper.getCropped();
      payload.photoB64 = dataUrl.split(',')[1];
      payload.photoMime = 'image/jpeg';
    }
    try{ const r = await dispatchApi(isNew?'addMember':'editMember', payload); if(r.pending){ notify.warn(adminContactMsg('📝 Disimpan sebagai DRAF. Menunggu pengesahan pentadbir.'), { ms: 8000 }); } else { notify.success('Berjaya.'); } closeModal(); await refresh(); if(!r.pending && isNew) await autoPlaceNew([payload.id]); }catch(e){ toast("Gagal: "+e.message); }
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
    ${!['admin','master'].includes(STORE.user?.role)?'<div class="field"><label>Catatan kepada admin (hanya admin boleh lihat)</label><textarea id="sp_reason" rows="2"></textarea></div>':''}
    <div class="flex gap-2 justify-end mt-2">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="saveSpouse">Simpan</button>
    </div>
  `);
  $('#saveSpouse').onclick = async ()=>{
    const pick = $('#sp_pick').value;
    const payload = { anchorId: m.id, partnerId: pick || null, newPartner: pick? null : { id:uid(), name:upperName($('#sp_name').value), gender:$('#sp_g').value, alive:true }, spouseId: uid(), reason:$('#sp_reason')?.value.trim()||'' };
    if(!pick && !payload.newPartner.name) return toast("Isi maklumat pasangan.");
    try{ const r = await dispatchApi('addSpouse', payload); if(r.pending){ notify.warn(adminContactMsg('📝 Pasangan disimpan sebagai DRAF. Menunggu pengesahan pentadbir.'), { ms: 8000 }); } else { notify.success("Selesai."); } closeModal(); await refresh(); if(!r.pending) await autoPlaceNew([m.id, pick || payload.newPartner?.id]); }catch(e){ toast(e.message); }
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
    ${!['admin','master'].includes(STORE.user?.role)?'<div class="field"><label>Catatan kepada admin (hanya admin boleh lihat)</label><textarea id="ch_reason" rows="2"></textarea></div>':''}
    <div class="flex gap-2 justify-end mt-2"><button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button><button class="btn gold-edge" id="saveChild">Simpan</button></div>
  `);
  $('#saveChild').onclick = async ()=>{
    const payload = { spouseId: $('#ch_couple').value, childId: uid(), newChild: { id: null, name:upperName($('#ch_name').value), gender:$('#ch_g').value, alive:true }, reason:$('#ch_reason')?.value.trim()||'' };
    payload.newChild.id = payload.childId;
    if(!payload.newChild.name) return toast("Nama anak wajib.");
    try{ const r = await dispatchApi('addChild', payload); if(r.pending){ notify.warn(adminContactMsg('📝 Anak disimpan sebagai DRAF di bawah pasangan. Menunggu pengesahan pentadbir.'), { ms: 8000 }); } else { notify.success("Berjaya."); } closeModal(); await refresh(); if(!r.pending) await autoPlaceNew(); }catch(e){ toast(e.message); }
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
    $$('button[data-edit-pending]', body).forEach(b=> b.onclick = ()=>editPendingForm(b.dataset.editPending));
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
      ${p.reason?`<div class="bevel-soft rounded-lg p-2 mt-2 text-sm"><span class="ink-soft">Catatan pengedit (admin sahaja):</span><br><b>${escapeHtml(p.reason)}</b></div>`:''}
      ${isAdmin? `<div class="flex gap-2 mt-3">
        <button class="btn btn-ghost" data-edit-pending="${p.id}">✏️ Edit dahulu</button>
        <button class="btn gold-edge" data-a="approve" data-id="${p.id}">✅ Luluskan</button>
        <button class="btn btn-ghost" style="color:var(--danger)" data-a="reject" data-id="${p.id}">❌ Tolak</button>
      </div>`:'<div class="text-xs ink-soft mt-2">Menunggu kelulusan pentadbir…</div>'}
    </div>`;
}

function editPendingForm(id){
  const p=(DATA.pending||[]).find(x=>String(x.id)===String(id)); if(!p) return;
  const a=p.payload||{};
  openModal(`<div class="font-head text-2xl mb-3">Edit Cadangan Sebelum Lulus</div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${PENDING_FIELDS.map(k=>`<div class="field ${['address','notes'].includes(k)?'sm:col-span-2':''}"><label>${PENDING_LABEL[k]}</label>${['address','notes'].includes(k)?`<textarea data-pe="${k}" rows="2">${escapeHtml(fmtVal(k,a[k])==='—'?'':a[k])}</textarea>`:`<input data-pe="${k}" value="${escapeHtml(fmtVal(k,a[k])==='—'?'':a[k])}">`}</div>`).join('')}</div>
    <div class="flex gap-2 justify-end"><button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button><button class="btn gold-edge" id="savePendingEdit">Simpan Perubahan</button></div>`);
  $('#savePendingEdit').onclick=async()=>{ const payload={...a}; $$('[data-pe]',$('#modal')).forEach(el=>payload[el.dataset.pe]=el.value); payload.alive=String(payload.alive).toLowerCase()!=='false'&&payload.alive!=='Allahyarham'; try{await dispatchApi('editPending',{id:p.id,payload});notify.success('Cadangan admin disimpan.');await refresh();adminPanel('pending');}catch(e){toast(e.message);} };
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
  const mine = (DATA.returnedDrafts||[]);
  if(!mine.length) return '';
  return `<button class="btn btn-ghost justify-start" id="acDrafts">↩️ Draf Dipulangkan (${mine.length})</button>`;
}

function openReturnedDrafts(){
  const rows=DATA.returnedDrafts||[];
  openModal(`<div class="font-head text-2xl mb-3">Draf Dipulangkan</div>${rows.map(p=>`<div class="bevel-soft rounded-lg p-3 mb-2"><b>${escapeHtml(p.payload?.name||p.action)}</b><div class="text-xs ink-soft">Pentadbir membatalkan cadangan ini. Anda boleh mohon semula atau padam kotak.</div><div class="flex gap-2 mt-2"><button class="btn gold-edge" data-resubmit="${p.id}">Mohon semula</button><button class="btn btn-ghost" style="color:var(--danger)" data-delete-returned="${p.id}">Padam kotak</button></div></div>`).join('')||'<p>Tiada draf dipulangkan.</p>'}<div class="text-right"><button class="btn btn-ghost" onclick="closeModalGlobal()">Tutup</button></div>`);
  $$('[data-resubmit]',$('#modal')).forEach(b=>b.onclick=async()=>{try{await dispatchApi('resubmitRejected',{id:b.dataset.resubmit});notify.success('Permohonan dihantar semula.');closeModal();await refresh();}catch(e){toast(e.message);}});
  $$('[data-delete-returned]',$('#modal')).forEach(b=>b.onclick=async()=>{if(!confirm('Padam kotak draf ini?'))return;try{await dispatchApi('deleteRejected',{id:b.dataset.deleteReturned});notify.success('Kotak draf dipadam.');closeModal();await refresh();}catch(e){toast(e.message);}});
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


// ===== Editor profil pengguna sendiri =====
async function openProfileEditor(){
  const u = STORE.user; if(!u){ loginForm(); return; }
  let p = u;
  try{ const r = await api('myProfile'); if(r?.profile) p = { ...u, ...r.profile }; }catch(_){}
  openModal(`
    <div class="font-head text-2xl mb-3">Seting Profil Saya</div>
    <p class="text-xs ink-soft mb-2">Kemas kini maklumat anda sendiri. Perubahan terus disimpan tanpa perlu kelulusan pentadbir.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div class="field sm:col-span-2"><label>Nama penuh</label><input id="pf_name" value="${escapeHtml(p.fullName||'')}"/></div>
      <div class="field"><label>Nama bapa</label><input id="pf_father" value="${escapeHtml(p.fatherName||'')}"/></div>
      <div class="field"><label>Nama ibu</label><input id="pf_mother" value="${escapeHtml(p.motherName||'')}"/></div>
      <div class="field sm:col-span-2"><label>Alamat</label><textarea id="pf_addr" rows="2">${escapeHtml(p.address||'')}</textarea></div>
      <div class="field"><label>WhatsApp</label><input id="pf_wa" value="${escapeHtml(p.whatsapp||'')}"/></div>
      <div class="field"><label>Pekerjaan</label><input id="pf_occ" value="${escapeHtml(p.occupation||'')}"/></div>
      <div class="field sm:col-span-2"><label>Emel</label><input id="pf_email" type="email" value="${escapeHtml(p.email||'')}"/></div>
      <div class="field sm:col-span-2"><label>Kata laluan baharu (kosongkan jika tidak mahu ubah)</label><input id="pf_pw" type="password" autocomplete="new-password"/></div>
      <div class="field sm:col-span-2"><label>Gambar profil baharu (pilihan)</label><input id="pf_photo" type="file" accept="image/*"/></div>
    </div>
    <div class="flex gap-2 justify-end mt-3">
      <button class="btn btn-ghost" onclick="closeModalGlobal()">Batal</button>
      <button class="btn gold-edge" id="pfSave">Simpan</button>
    </div>
  `);
  $('#pfSave').onclick = async ()=>{
    const payload = {
      fullName:  $('#pf_name').value.trim(),
      fatherName:$('#pf_father').value.trim(),
      motherName:$('#pf_mother').value.trim(),
      address:   $('#pf_addr').value.trim(),
      whatsapp:  $('#pf_wa').value.trim(),
      occupation:$('#pf_occ').value.trim(),
      email:     $('#pf_email').value.trim()
    };
    const pw = $('#pf_pw').value;
    if(pw) payload.newPassword = pw;
    const file = $('#pf_photo').files[0];
    if(file){
      if(file.size > 2*1024*1024) return toast('Saiz gambar maksimum 2MB.');
      payload.photoB64 = await fileToB64(file);
      payload.photoMime = file.type;
    }
    try{
      const r = await dispatchApi('updateMyProfile', payload);
      if(r?.profile){
        const u2 = STORE.user || {};
        u2.fullName = r.profile.fullName || u2.fullName;
        u2.photo    = r.profile.photo    || u2.photo;
        STORE.user = u2;
        if(pw){ const c = STORE.cred || {}; c.password = pw; STORE.cred = c; }
      }
      notify.success('Profil dikemaskini.');
      closeModal();
    }catch(e){ toast('Gagal kemaskini: '+e.message); }
  };
}

// Petunjuk visual untuk admin/master: kursor 'move' di atas kotak
(function injectAdminDragStyle(){
  const css = document.createElement('style');
  css.textContent = `
    body[data-role="admin"] .node, body[data-role="master"] .node { cursor: move; }
  `;
  document.head.appendChild(css);
  const orig = applyRoleUI;
  window.applyRoleUI = function(){
    orig();
    const r = STORE.user?.role || '';
    document.body.dataset.role = (r==='admin'||r==='master') ? r : '';
  };
})();

