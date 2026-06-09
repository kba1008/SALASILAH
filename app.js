/* Salasilah Keluarga Elit — app.js v2.1 */

const GAS_URL = "https://script.google.com/macros/s/AKfycbwlUMBhrbts5rH7wzV2Q1jjuUiuzZ1LB-CmcXqG5ypcPzthAWsdEtPbid2tLyX8mAg/exec";

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
function openModal(id){$("#"+id).classList.remove("hidden");$("#"+id).classList.add("flex");}
function closeModal(id){$("#"+id).classList.add("hidden");$("#"+id).classList.remove("flex");}
window.closeModal = closeModal;

/* ---------- API ---------- */
async function api(action, payload={}){
  const body = JSON.stringify({action, payload, auth: State.user ? {username:State.user.username,token:State.user.token}:null});
  const res = await fetch(GAS_URL, {method:"POST", body, headers:{"Content-Type":"text/plain;charset=utf-8"}});
  const json = await res.json();
  if(!json.ok) throw new Error(json.error||"API error");
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
    <div class="name">${escape(n.name)}</div>
    <div class="meta">#${n.no||"-"} ${n.birth||""}${n.death?" – "+n.death:""}</div>`;
  d.addEventListener("click",e=>{e.stopPropagation();showCtx(e.clientX,e.clientY,n);});
  return d;
}
function placeholder(g){
  const c = g==="P" ? "%23b85a72" : "%233b6fa0";
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='${c}'/%3E%3Ctext x='32' y='42' font-size='30' text-anchor='middle' fill='white' font-family='serif'%3E${g==='P'?'♀':'♂'}%3C/text%3E%3C/svg%3E`;
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
    isAdmin && {l:"🗑 Padam", fn:()=>delNode(n)},
  ].filter(Boolean);
  items.forEach(i=>{const b=document.createElement("button");b.textContent=i.l;b.onclick=()=>{m.classList.add("hidden");i.fn();};m.appendChild(b);});
  m.style.left = Math.min(x, innerWidth-220)+"px";
  m.style.top = Math.min(y, innerHeight-items.length*40)+"px";
  m.classList.remove("hidden");
}
document.addEventListener("click",()=>$("#ctx-menu").classList.add("hidden"));

/* ---------- Profile Viewer ---------- */
function viewProfile(n){
  const sp = getSpouses(n);
  const photo = fixPhoto(n.photo) || placeholder(n.gender);
  $("#profile-body").innerHTML = `
    <div class="flex flex-col items-center mb-4">
      <img src="${photo}" onerror="this.src='${placeholder(n.gender)}'" class="w-28 h-28 rounded-full object-cover mb-2" style="border:3px solid var(--gold)"/>
      <h2 class="text-2xl font-bold text-center serif">${escape(n.name)}</h2>
      ${n.nickname?`<p class="text-sm serif italic" style="color:var(--gold-dark)">"${escape(n.nickname)}"</p>`:""}
      <p class="text-xs" style="color:var(--ink-soft)">#${n.no||"-"} • ${n.gender==='P'?'Perempuan':'Lelaki'} • ${n.status==='mati'?'Almarhum':'Hidup'}</p>
    </div>
    <div class="space-y-2 text-sm">
      ${rowField("Tahun Lahir", n.birth)}
      ${rowField("Tempat Lahir", n.birthplace)}
      ${rowField("Tahun Wafat", n.death)}
      ${rowField("Tempat Wafat", n.deathplace)}
      ${sp.length?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Pasangan (${sp.length})</div>
        <ul class="space-y-1">${sp.map(s=>`<li>• ${escape(s.name)} ${s.status==='mati'?'<span style="color:var(--ink-soft)">(almarhum'+(s.death?' '+escape(s.death):'')+')</span>':''}</li>`).join("")}</ul></div>`:""}
      ${n.notes?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Catatan</div><p class="whitespace-pre-wrap">${escape(n.notes)}</p></div>`:""}
    </div>
    ${!State.user?'<p class="text-[11px] mt-4 text-center" style="color:var(--ink-soft)">Mod pelawat — lihat sahaja.</p>':''}
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
  }catch(err){toast("Ralat: "+err.message);}
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
  }catch(err){toast("Ralat: "+err.message);}
});

async function delNode(n){
  if(!confirm("Padam "+n.name+"?")) return;
  try{await api("deleteNode",{id:n.id});await refresh();}catch(e){toast(e.message);}
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
  }catch(err){toast(err.message);}
});
$("#form-register").addEventListener("submit",async e=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const photo = await fileToBase64(fd.get("photo"));
  const data = Object.fromEntries(fd.entries()); delete data.photo;
  if(photo) data.photo = photo;
  try{await api("register",data);toast("Berjaya daftar! Sila log masuk.");
    $$("#modal-auth .tab")[0].click();
  }catch(err){toast(err.message);}
});

function updateUserUI(){
  const u = State.user;
  $("#user-info").textContent = u?`${u.username} • ${u.role==="admin"?"ADMIN":"Ahli #"+u.no}`:"Mod Pelawat — lihat sahaja";
  $("#btn-auth").textContent = u?"Keluar":"Log Masuk";
  $("#btn-admin").classList.toggle("hidden", u?.role!=="admin");
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
    p.innerHTML = d.pending.length?"":'<p class="text-sm" style="color:var(--ink-soft)">Tiada item pending.</p>';
    d.pending.forEach(it=>{
      const div=document.createElement("div");
      div.className="glass rounded-lg p-3 mb-2 flex justify-between items-center gap-2";
      div.innerHTML=`<div class="text-sm"><b>${escape(it.action)}</b> oleh ${escape(it.by)}<br><span class="text-xs" style="color:var(--ink-soft)">${escape(it.summary)}</span></div>`;
      const ok=document.createElement("button");ok.className="btn btn-primary";ok.textContent="✓";
      const no=document.createElement("button");no.className="btn btn-ghost";no.textContent="✕";
      ok.onclick=async()=>{await api("moderate",{id:it.id,decision:"approve"});loadAdmin();refresh();};
      no.onclick=async()=>{await api("moderate",{id:it.id,decision:"reject"});loadAdmin();};
      const wrap=document.createElement("div");wrap.className="flex gap-1";wrap.append(ok,no);
      div.appendChild(wrap);p.appendChild(div);
    });
    const u=$("#admin-users");
    u.innerHTML='<table class="w-full text-xs"><thead><tr class="text-left" style="color:var(--ink-soft)"><th>#</th><th>Username</th><th>Nama</th><th>Peranan</th></tr></thead><tbody></tbody></table>';
    const tb=u.querySelector("tbody");
    d.users.forEach(x=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${x.no}</td><td>${escape(x.username)}</td><td>${escape(x.fullname)}</td><td>${x.role}</td>`;tb.appendChild(tr);});
  }catch(e){toast(e.message);}
}
$("#btn-init-root").addEventListener("click",async()=>{
  const name = $("#root-name").value.trim();
  if(!name) return;
  try{await api("initRoot",{name});toast("Root dicipta");closeModal("modal-admin");refresh();}catch(e){toast(e.message);}
});

/* ---------- Settings ---------- */
$("#btn-settings").addEventListener("click",()=>openModal("modal-settings"));

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
  $("#btn-reset").onclick=()=>State.panzoom.reset();
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
  }catch(e){ toast(e.message); }
}

/* ---------- Boot ---------- */
window.addEventListener("DOMContentLoaded",()=>{
  initPanzoom(); updateUserUI();
  refresh();
});
