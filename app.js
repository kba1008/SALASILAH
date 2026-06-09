/* Salasilah Keluarga Elit — app.js v2.1 */

const GAS_URL = "https://script.google.com/macros/s/AKfycbyDlDCUnw84cC6RW43f7PNf6Xmdf4m2S9uTpUHK3hChrJFZrDJAJ4bPLh7BRqYDz0zr/exec";

const State = {
  user: JSON.parse(localStorage.getItem("user") || "null"),
  nodes: [],
  panzoom: null,
  searchResults: [],
  searchIndex: 0,
};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),2800);}


/* ---------- Error Notifier (canggih) ---------- */
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
      try{ await navigator.clipboard.writeText(fullText); }
      catch{ const r=document.createRange();r.selectNodeContents(card.querySelector(".err-msg"));const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand("copy");s.removeAllRanges(); }
      const b = card.querySelector('[data-act="copy"]'); const old=b.textContent; b.textContent="✓ Disalin"; setTimeout(()=>b.textContent=old,1500);
    };
    host.appendChild(card);
    // Auto-tutup hanya untuk info/warn
    if(level!=="error"){ setTimeout(()=>card.remove(), 6000); }
    return card;
  },
  clearAll(){ const h=this.ensure(); if(h) h.innerHTML=""; }
};
function escapeHtmlSafe(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function showError(message, opts={}){
  let msg = message;
  if(message instanceof Error) msg = (message.message||"") + (message.stack?"\n\n"+message.stack:"");
  return ErrUI.show({title:opts.title||"Ralat", message:String(msg||""), level:opts.level||"error", context:opts.context||""});
}
function showWarn(m,o={}){return ErrUI.show({title:o.title||"Amaran",message:String(m||""),level:"warn",context:o.context||""});}
function showInfo(m,o={}){return ErrUI.show({title:o.title||"Maklumat",message:String(m||""),level:"info",context:o.context||""});}
window.addEventListener("error", e=>{
  showError(e.error||e.message||"Unknown error",{title:"Ralat JavaScript",context:(e.filename||"")+":"+(e.lineno||"")+":"+(e.colno||"")});
});
window.addEventListener("unhandledrejection", e=>{
  showError(e.reason||"Promise ditolak tanpa pengendalian",{title:"Promise Tidak Dikendalikan"});
});
window.showError = showError; window.showWarn = showWarn; window.showInfo = showInfo;

function openModal(id){$("#"+id).classList.remove("hidden");$("#"+id).classList.add("flex");}
function closeModal(id){$("#"+id).classList.add("hidden");$("#"+id).classList.remove("flex");}
window.closeModal = closeModal;

/* ---------- API ---------- */
async function api(action, payload={}){
  const body = JSON.stringify({action, payload, auth: State.user ? {username:State.user.username,token:State.user.token}:null});
  let res, raw="";
  try{
    res = await fetch(GAS_URL, {method:"POST", body, headers:{"Content-Type":"text/plain;charset=utf-8"}});
    raw = await res.text();
  }catch(netErr){
    const e = new Error("Gangguan rangkaian: "+(netErr.message||netErr));
    e.action = action; throw e;
  }
  let json;
  try{ json = JSON.parse(raw); }
  catch{ const e=new Error("Respons bukan JSON dari pelayan:\n"+raw.slice(0,400)); e.action=action; throw e; }
  if(!json.ok){
    const e=new Error(json.error||"API error"); e.action=action;
    // Auto-logout jika akaun disekat atau sesi tamat
    if(/disekat|Sesi tamat/i.test(json.error||"")){
      localStorage.removeItem("user"); State.user=null;
      try{ updateUserUI(); }catch(_){}
    }
    throw e;
  }
  return json.data;
}

async function fileToBase64(f){
  if(!f || !f.name) return null;
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res({name:f.name,type:f.type,data:r.result.split(",")[1]});r.onerror=rej;r.readAsDataURL(f);});
}

/* ---------- Foto Drive ---------- */
function fixPhoto(url){
  if(!url) return "";
  const m = String(url).match(/[?&]id=([\w-]+)/) || String(url).match(/\/d\/([\w-]+)/);
  if(m) return `https://lh3.googleusercontent.com/d/${m[1]}=w400`;
  return url;
}

/* ---------- Spouses helper ---------- */
function getSpouses(n){
  if(Array.isArray(n.spouses) && n.spouses.length) return n.spouses;
  if(n.spousesJson){
    try{ const a = JSON.parse(n.spousesJson); if(Array.isArray(a)) return a; }catch(e){}
  }
  if(n.spouseName) return [{name:n.spouseName, photo:n.spousePhoto||"", status:n.spouseStatus||"hidup", death:""}];
  return [];
}
function canAddSpouse(n){
  const sp = getSpouses(n);
  if(sp.length===0) return true;
  if(n.gender==="L") return true;
  return sp.every(s=>s.status==="mati");
}

/* ---------- Render Tree ---------- */
function buildTree(){
  const root = State.nodes.find(n=>!n.parentId);
  const host = $("#tree-root");
  if(!root){host.innerHTML='<p class="text-center mt-32 serif text-lg" style="color:var(--ink-soft)">Belum ada data. Admin perlu Init Root.</p>';return;}
  host.className=""; host.innerHTML="";
  const ul = document.createElement("ul");
  ul.className="tree";
  ul.appendChild(renderNode(root));
  host.appendChild(ul);
}
function renderNode(n){
  const li = document.createElement("li");
  const branch = document.createElement("div");
  branch.className="branch";

  // Couple: person + spouses
  const couple = document.createElement("div");
  couple.className = "couple";
  couple.appendChild(card(n));
  getSpouses(n).forEach(sp=>{
    const link = document.createElement("div");
    link.className = "couple-link";
    link.title = "Pasangan";
    couple.appendChild(link);

    const el = document.createElement("div");
    el.className = "node spouse";
    el.innerHTML=`<img src="${fixPhoto(sp.photo)||placeholder(n.gender==='L'?'P':'L')}" onerror="this.src='${placeholder(n.gender==='L'?'P':'L')}'"/>
      <div class="name">${escape(sp.name)}</div>
      <div class="meta">Pasangan${sp.status==='mati'?' †':''}</div>`;
    el.addEventListener("click",e=>{e.stopPropagation();showSpouseProfile(n, sp);});
    couple.appendChild(el);
  });
  branch.appendChild(couple);

  li.appendChild(branch);
  const kids = State.nodes.filter(x=>x.parentId===n.id);
  if(kids.length){
    const cu = document.createElement("ul");
    cu.className="children-row";
    kids.forEach(k=>cu.appendChild(renderNode(k)));
    li.appendChild(cu);
  }
  return li;
}
function card(n){
  const d = document.createElement("div");
  d.className = "node"+(n.pending?" pending":"")+(!n.parentId?" root":"");
  d.dataset.nodeId = n.id;
  d.innerHTML = `<img src="${fixPhoto(n.photo)||placeholder(n.gender)}" alt="" onerror="this.src='${placeholder(n.gender)}'"/>
    <div class="name" dir="auto">${escape(n.name)}</div>
    <div class="meta">#${n.no||"-"} ${n.birth||""}${n.death?" – "+n.death:""}</div>`;
  d.addEventListener("click",e=>{e.stopPropagation();showCtx(e.clientX,e.clientY,n);});
  return d;
}
function placeholder(g){
  // PENTING: SEMUA petikan ' dalam data URL mesti %27, jika tidak ia akan memecahkan attribute onerror="this.src='...'"
  // dan menyebabkan SyntaxError "Unexpected identifier 'http'" di browser.
  const c = g==="P" ? "%23b85a72" : "%233b6fa0";
  const sym = g==="P" ? "%E2%99%80" : "%E2%99%82";
  return "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2064%2064%27%3E%3Crect%20width=%2764%27%20height=%2764%27%20fill=%27"+c+"%27/%3E%3Ctext%20x=%2732%27%20y=%2742%27%20font-size=%2730%27%20text-anchor=%27middle%27%20fill=%27white%27%20font-family=%27serif%27%3E"+sym+"%3C/text%3E%3C/svg%3E";
}
function escape(s){return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

/* ---------- Context Menu ---------- */
function showCtx(x,y,n){
  const m = $("#ctx-menu");
  const canEdit = !!State.user;
  const isAdmin = State.user?.role==="admin";
  m.innerHTML = "";
  const items = [
    {l:"👁 Lihat Profil", fn:()=>viewProfile(n)},
    canEdit && {l:"✎ Edit Maklumat", fn:()=>openNodeEditor(n)},
    canEdit && {l:"➕ Tambah Anak", fn:()=>openNodeEditor(null,n.id,"child")},
    canEdit && canAddSpouse(n) && {l:"💍 Tambah Pasangan", fn:()=>openSpouseEditor(n)},
    canEdit && {l: isAdmin?"🗑 Padam":"🗑 Pohon Padam", fn:()=>delNode(n)},
  ].filter(Boolean);
  items.forEach(i=>{const b=document.createElement("button");b.textContent=i.l;b.onclick=()=>{m.classList.add("hidden");i.fn();};m.appendChild(b);});
  m.style.left = Math.min(x, innerWidth-220)+"px";
  m.style.top = Math.min(y, innerHeight-items.length*40)+"px";
  m.classList.remove("hidden");
}
document.addEventListener("click",()=>$("#ctx-menu").classList.add("hidden"));

/* ---------- Profile Viewer ---------- */
function fmtDateTime(v){
  if(!v) return "";
  try{ const d=new Date(v); if(isNaN(d.getTime())) return String(v); return d.toLocaleString("ms-MY"); }catch(e){ return String(v); }
}
function viewProfile(n){
  const sp = getSpouses(n);
  const photo = fixPhoto(n.photo) || placeholder(n.gender);
  const editedBy = n.lastEditBy || n.createdBy || "";
  const editedAt = fmtDateTime(n.lastEditAt || n.createdAt);
  const approvedBy = n.approvedBy || "";
  const approvedAt = fmtDateTime(n.approvedAt);
  $("#profile-body").innerHTML = `
    <div class="flex flex-col items-center mb-4">
      <img src="${photo}" onerror="this.src='${placeholder(n.gender)}'" class="w-28 h-28 rounded-full object-cover mb-2" style="border:3px solid var(--gold)"/>
      <h2 class="text-2xl font-bold text-center serif" dir="auto">${escape(n.name)}</h2>
      ${n.nickname?`<p class="text-sm serif italic" dir="auto" style="color:var(--gold-dark)">"${escape(n.nickname)}"</p>`:""}
      <p class="text-xs" style="color:var(--ink-soft)">#${n.no||"-"} • ${n.gender==='P'?'Perempuan':'Lelaki'} • ${n.status==='mati'?'Almarhum':'Hidup'}</p>
      ${n.pending?'<p class="text-[11px] mt-1 font-semibold" style="color:#c0392b">⏳ Menunggu kelulusan admin</p>':''}
    </div>
    <div class="space-y-2 text-sm" dir="auto">
      ${rowField("Tahun Lahir", n.birth)}
      ${rowField("Tempat Lahir", n.birthplace)}
      ${rowField("Tahun Wafat", n.death)}
      ${rowField("Tempat Wafat", n.deathplace)}
      ${sp.length?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Pasangan (${sp.length})</div>
        <ul class="space-y-1" dir="auto">${sp.map(s=>`<li>• ${escape(s.name)} ${s.status==='mati'?'<span style="color:var(--ink-soft)">(almarhum'+(s.death?' '+escape(s.death):'')+')</span>':''}</li>`).join("")}</ul></div>`:""}
      ${n.notes?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Catatan</div><p class="whitespace-pre-wrap" dir="auto">${escape(n.notes)}</p></div>`:""}
    </div>
    <div class="mt-4 pt-3 border-t text-[11px] flex flex-col gap-1" style="border-color:var(--line-soft);color:var(--ink-soft)">
      <div class="font-semibold serif" style="color:var(--gold-dark);font-size:12px">📜 Log Pengesahan</div>
      <div>📝 Terakhir dikemaskini oleh: <b style="color:var(--ink)">${escape(editedBy||"—")}</b></div>
      ${editedAt?`<div>🕒 ${escape(editedAt)}</div>`:""}
      ${approvedBy?`<div>✅ Disahkan oleh admin: <b style="color:#1e7a3b">${escape(approvedBy)}</b>${approvedAt?` • ${escape(approvedAt)}`:""}</div>`:(n.pending?'<div style="color:#c0392b">⏳ Belum disahkan</div>':'')}
      ${n.createdBy && n.createdBy!==editedBy?`<div>👤 Dicipta oleh: ${escape(n.createdBy)}</div>`:""}
    </div>
    ${!State.user?'<p class="text-[11px] mt-3 text-center" style="color:var(--ink-soft)">Mod pelawat — lihat sahaja.</p>':''}
  `;
  openModal("modal-profile");
}
function rowField(label,val){
  if(!val && val!==0) return "";
  return `<div class="flex justify-between gap-3"><span style="color:var(--ink-soft)">${label}</span><span class="text-right">${escape(val)}</span></div>`;
}
function showSpouseProfile(parent, sp){
  $("#profile-body").innerHTML = `
    <div class="flex flex-col items-center mb-4">
      <img src="${fixPhoto(sp.photo)||placeholder(parent.gender==='L'?'P':'L')}" class="w-28 h-28 rounded-full object-cover mb-2" style="border:3px solid var(--rose)"/>
      <h2 class="text-2xl font-bold text-center serif">${escape(sp.name)}</h2>
      <p class="text-xs" style="color:var(--ink-soft)">Pasangan kepada ${escape(parent.name)}</p>
      <p class="text-xs" style="color:var(--ink-soft)">${sp.status==='mati'?'Almarhum'+(sp.death?' ('+escape(sp.death)+')':''):'Hidup'}</p>
    </div>
  `;
  openModal("modal-profile");
}

/* ---------- Node Editor ---------- */
function openNodeEditor(node, parentId=null, relation="child"){
  if(!State.user){toast("Sila log masuk");return;}
  const f = $("#form-node");
  f.reset();
  // FIX: pastikan id sentiasa ditetapkan untuk mod edit
  f.id.value = node?.id || "";
  f.parentId.value = parentId || node?.parentId || "";
  f.relation.value = node ? "edit" : relation;
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
  if(!State.user){toast("Sila log masuk");return;}
  const fd = new FormData(e.target);
  const photo = await fileToBase64(fd.get("photo"));
  const payload = Object.fromEntries(fd.entries());
  delete payload.photo;
  if(photo) payload.photo = photo;
  // FIX: jika ada id, ini adalah edit — pastikan backend tahu
  if(payload.id) payload.relation = "edit";
  try{
    await api("saveNode", payload);
    toast(State.user.role==="admin"?"Disimpan":"Dihantar untuk semakan admin");
    closeModal("modal-node");
    await refresh();
  }catch(err){showError(err,{title:"Gagal simpan ahli",context:err.action||"saveNode"});}
});

/* ---------- Spouse Editor ---------- */
function openSpouseEditor(parent){
  if(!State.user){toast("Sila log masuk");return;}
  if(!canAddSpouse(parent)){
    if(parent.gender==="P") toast("Wanita hanya boleh ada satu suami pada satu masa. Tetapkan suami sedia ada sebagai 'Almarhum' dahulu.");
    else toast("Tidak boleh tambah pasangan.");
    return;
  }
  const f = $("#form-spouse"); f.reset();
  f.parentId.value = parent.id;
  $("#spouse-title").textContent = `Tambah Pasangan untuk ${parent.name}`;
  openModal("modal-spouse");
}
$("#form-spouse").addEventListener("submit", async e=>{
  e.preventDefault();
  if(!State.user){toast("Sila log masuk");return;}
  const fd = new FormData(e.target);
  const parent = State.nodes.find(x=>x.id===fd.get("parentId"));
  if(!parent || !canAddSpouse(parent)){toast("Peraturan pasangan tidak dibenarkan");return;}
  const photo = await fileToBase64(fd.get("photo"));
  const payload = {
    parentId: fd.get("parentId"),
    relation: "spouse",
    name: fd.get("name"),
    spouseStatus: fd.get("status"),
    spouseDeath: fd.get("death")||"",
  };
  if(photo) payload.photo = photo;
  try{
    await api("saveNode", payload);
    toast(State.user.role==="admin"?"Pasangan ditambah":"Dihantar untuk semakan admin");
    closeModal("modal-spouse");
    await refresh();
  }catch(err){showError(err,{title:"Gagal simpan pasangan",context:err.action||"saveNode"});}
});

async function delNode(n){
  const isAdmin = State.user?.role==="admin";
  const q = isAdmin ? "Padam "+n.name+"? Tindakan ini tidak boleh dibatalkan." : "Pohon admin padam "+n.name+"? Permintaan akan dihantar untuk kelulusan.";
  if(!confirm(q)) return;
  try{
    await api("deleteNode",{id:n.id});
    showInfo(isAdmin?"Dipadam":"Permintaan padam dihantar untuk semakan admin");
    await refresh();
  }catch(e){showError(e,{title:"Gagal padam",context:"deleteNode"});}
}

/* ---------- Auth ---------- */
$("#btn-auth").addEventListener("click",()=>{
  if(State.user){
    if(confirm("Log keluar?")){localStorage.removeItem("user");State.user=null;updateUserUI();}
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
  try{
    const u = await api("login",fd);
    State.user = u; localStorage.setItem("user",JSON.stringify(u));
    updateUserUI(); closeModal("modal-auth"); toast("Selamat datang, "+u.username);
    refresh();
  }catch(err){showError(err,{title:"Gagal log masuk",context:"login"});}
});
$("#form-register").addEventListener("submit",async e=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const photo = await fileToBase64(fd.get("photo"));
  const data = Object.fromEntries(fd.entries()); delete data.photo;
  if(photo) data.photo = photo;
  try{await api("register",data);toast("Berjaya daftar! Sila log masuk.");
    $$("#modal-auth .tab")[0].click();
  }catch(err){showError(err,{title:"Gagal daftar",context:"register"});}
});

function updateUserUI(){
  const u = State.user;
  $("#user-info").textContent = u?`${u.username} • ${u.role==="admin"?"ADMIN":"Ahli #"+u.no}`:"Mod Pelawat — lihat sahaja";
  $("#btn-auth").textContent = u?"Keluar":"Log Masuk";
  $("#btn-admin").classList.toggle("hidden", u?.role!=="admin");
  if(u?.role==="admin") refreshPendingBadge();
}
async function refreshPendingBadge(){
  try{
    const d = await api("adminData",{});
    const btn = $("#btn-admin");
    const n = (d.pending||[]).length;
    btn.innerHTML = n>0 ? `Admin <span style="background:#c0392b;color:#fff;border-radius:999px;padding:1px 6px;font-size:10px;margin-left:2px">${n}</span>` : "Admin";
  }catch(e){}
}

/* ---------- Admin ---------- */
$("#btn-admin").addEventListener("click",async()=>{openModal("modal-admin");await loadAdmin();});
$$("#modal-admin [data-atab]").forEach(b=>b.addEventListener("click",()=>{
  $$("#modal-admin [data-atab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  ["pending","users","init"].forEach(t=>$("#admin-"+t).classList.toggle("hidden",t!==b.dataset.atab));
}));
async function loadAdmin(){
  try{
    const d = await api("adminData",{});
    const p = $("#admin-pending");
    p.innerHTML = d.pending.length?'<p class="text-[11px] mb-2" style="color:var(--ink-soft)">Sahkan dengan penghantar melalui telefon/WhatsApp sebelum LULUS. Data ditandai MERAH dalam salasilah sehingga diluluskan.</p>':'<p class="text-sm" style="color:var(--ink-soft)">✓ Tiada item menunggu kelulusan.</p>';
    d.pending.forEach(it=>{
      const div=document.createElement("div");
      div.className="glass rounded-lg p-3 mb-2 space-y-2";
      const phoneClean = String(it.byPhone||"").replace(/[^0-9+]/g,"");
      const waNum = phoneClean.replace(/^\+/,"").replace(/^0/,"60"); // anggap MY
      const actLabel = {add:"➕ TAMBAH",edit:"✎ EDIT",delete:"🗑 PADAM",spouse:"💍 PASANGAN"}[it.action]||it.action;
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
        if(!confirm("Tolak permintaan ini? Perubahan akan dibatalkan.")) return;
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
      const card = document.createElement("div");
      card.className = "glass rounded-lg p-3 text-xs space-y-1";
      card.innerHTML = `
        <div class="flex justify-between items-start gap-2">
          <div class="min-w-0 flex-1">
            <div class="font-semibold" style="color:var(--ink)" dir="auto">#${x.no} ${escape(x.fullname||x.username)} ${isMasterRow?'<span style="color:var(--gold-dark)">👑</span>':''}</div>
            <div style="color:var(--ink-soft)" dir="auto">@${escape(x.username)} • ${x.role==='admin'?'<b style="color:var(--gold-dark)">ADMIN</b>':'Ahli'} ${x.banned?'• <b style="color:#c0392b">DISEKAT</b>':''}</div>
            ${x.phone?`<div>📞 ${escape(x.phone)}</div>`:'<div style="color:#c0392b">⚠ Tiada no. telefon</div>'}
            ${x.email?`<div style="color:var(--ink-soft)">✉ ${escape(x.email)}</div>`:''}
            <div class="mt-1" dir="auto">👨 Bapa: <b>${escape(x.fatherName||'—')}</b></div>
            <div dir="auto">👩 Ibu: <b>${escape(x.motherName||'—')}</b></div>
          </div>
        </div>
        <div class="flex flex-wrap gap-1 pt-1">
          ${phoneClean?`<a href="tel:${phoneClean}" class="btn btn-ghost text-[11px]">📞</a>`:''}
          ${waNum?`<a href="https://wa.me/${waNum}" target="_blank" class="btn btn-ghost text-[11px]">💬 WA</a>`:''}
          ${(!isMasterRow && isMaster)?`<button data-act="role" class="btn btn-ghost text-[11px]">${x.role==='admin'?'⬇ Turun Ahli':'⬆ Lantik Admin'}</button>`:''}
          ${(!isMasterRow && (isMaster || x.role!=='admin'))?`<button data-act="ban" class="btn btn-ghost text-[11px]" style="color:${x.banned?'#1e7a3b':'#c0392b'}">${x.banned?'🔓 Buka Sekatan':'🚫 Sekat'}</button>`:''}
        </div>`;
      const rb = card.querySelector('[data-act="role"]');
      if (rb) rb.onclick = async()=>{
        const newRole = x.role==='admin'?'ahli':'admin';
        if(!confirm(`Tukar peranan @${x.username} kepada ${newRole.toUpperCase()}?`)) return;
        try{ await api("setRole",{username:x.username, role:newRole}); showInfo("Peranan dikemaskini"); loadAdmin(); }
        catch(e){ showError(e,{title:"Gagal tukar peranan",context:"setRole"}); }
      };
      const bb = card.querySelector('[data-act="ban"]');
      if (bb) bb.onclick = async()=>{
        const next = !x.banned;
        if(!confirm(`${next?'SEKAT':'BUKA SEKATAN'} @${x.username}?`)) return;
        try{ await api("setBan",{username:x.username, banned:next}); showInfo(next?"Disekat":"Sekatan dibuka"); loadAdmin(); }
        catch(e){ showError(e,{title:"Gagal kemaskini sekatan",context:"setBan"}); }
      };
      list.appendChild(card);
    });
    u.appendChild(list);
  }catch(e){showError(e,{title:"Gagal muat panel admin",context:"adminData"});}
}

$("#btn-init-root").addEventListener("click",async()=>{
  const name = $("#root-name").value.trim();
  if(!name) return;
  try{await api("initRoot",{name});showInfo("Root berjaya dicipta");closeModal("modal-admin");refresh();}catch(e){ if(String(e.message).includes("Root sudah wujud")){ showWarn("Root sudah wujud dalam sistem. Tiada tindakan diperlukan."); closeModal("modal-admin"); refresh(); } else { showError(e,{title:"Gagal cipta root",context:"initRoot"}); } }
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
  const isAdmin = State.user?.role==="admin";
  THEMES.forEach(t=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn "+(t.id===current?"btn-primary":"btn-ghost")+" w-full text-left";
    b.textContent = t.name + (t.id===current?"  ✓":"");
    b.disabled = !isAdmin;
    b.onclick = ()=>{ applyTheme(t.id); initSettingsUI(); showInfo("Tema ditukar: "+t.name); };
    wrap.appendChild(b);
  });
  $("#theme-note").textContent = isAdmin ? "Pilih satu tema untuk semua pengguna pada peranti ini." : "Hanya admin boleh menukar tema.";
}
$("#btn-settings").addEventListener("click",()=>{ initSettingsUI(); openModal("modal-settings"); });

/* ---------- Panzoom ---------- */
function initPanzoom(){
  const el = $("#canvas");
  State.panzoom = Panzoom(el,{
    maxScale: 4, minScale: 0.05, step: 0.15,
    canvas: true, contain: false, cursor: "grab",
  });
  $("#stage").addEventListener("wheel", e => State.panzoom.zoomWithWheel(e, {step:0.15}));
  $("#btn-zoom-in").onclick=()=>State.panzoom.zoomIn();
  $("#btn-zoom-out").onclick=()=>State.panzoom.zoomOut();
  $("#btn-reset").onclick=()=>centerOnTree();
}

/* Pusatkan paparan pada salasilah sebenar (bukan ruang kosong) */
function centerOnTree(){
  if(!State.panzoom) return;
  // cari node root dahulu, jika tiada ambil sebarang .node pertama
  const target = document.querySelector(".node.root") || document.querySelector(".node");
  if(!target){ State.panzoom.reset(); return; }
  State.panzoom.reset({ animate:false });
  requestAnimationFrame(()=>{
    const stage = $("#stage");
    const sRect = stage.getBoundingClientRect();
    const nRect = target.getBoundingClientRect();
    const scale = State.panzoom.getScale() || 1;
    const pan = State.panzoom.getPan();
    // Letak root di atas-tengah skrin (offset ~120px dari atas)
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
$("#search-close").addEventListener("click",()=>{$("#search-bar").classList.add("hidden");clearHighlights();});
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
  try{
    const d = await api("getTree",{});
    State.nodes = d.nodes||[];
    buildTree();
    // Auto pusat ke salasilah selepas render
    setTimeout(centerOnTree, 60);
    if(State.user?.role==="admin") refreshPendingBadge();
  }catch(e){ showError(e,{title:"Gagal memuat salasilah",context:"getTree"}); const host=$("#tree-root"); if(host) host.innerHTML='<p class="text-center mt-32 serif text-lg" style="color:var(--ink-soft)">Gagal memuat data. Sila lihat notifikasi ralat di atas.</p>'; }
}

/* ---------- Boot ---------- */
window.addEventListener("DOMContentLoaded",()=>{
  applyTheme(localStorage.getItem("theme") || "parchment");
  initPanzoom(); updateUserUI();
  refresh();
});
