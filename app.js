/* Salasilah Keluarga Elit — app.js */
const DEFAULT_GAS_URL = ""; // isi URL deploy Apps Script di sini atau via ⚙
const State = {
  gasUrl: localStorage.getItem("gasUrl") || DEFAULT_GAS_URL,
  user: JSON.parse(localStorage.getItem("user") || "null"),
  nodes: [],
  pending: [],
  panzoom: null,
};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),2400);}
function openModal(id){$("#"+id).classList.remove("hidden");$("#"+id).classList.add("flex");}
function closeModal(id){$("#"+id).classList.add("hidden");$("#"+id).classList.remove("flex");}
window.closeModal = closeModal;

/* ---------- API ---------- */
async function api(action, payload={}){
  if(!State.gasUrl){toast("Tetapkan URL GAS dahulu");openModal("modal-settings");throw new Error("no-url");}
  const body = JSON.stringify({action, payload, auth: State.user ? {username:State.user.username,token:State.user.token}:null});
  const res = await fetch(State.gasUrl, {method:"POST", body, headers:{"Content-Type":"text/plain;charset=utf-8"}});
  const json = await res.json();
  if(!json.ok) throw new Error(json.error||"API error");
  return json.data;
}

async function fileToBase64(f){
  if(!f) return null;
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res({name:f.name,type:f.type,data:r.result.split(",")[1]});r.onerror=rej;r.readAsDataURL(f);});
}

/* ---------- Render Tree ---------- */
function buildTree(){
  const root = State.nodes.find(n=>!n.parentId);
  const host = $("#tree-root");
  if(!root){host.innerHTML='<p class="text-slate-400 text-center mt-32">Belum ada data. Admin perlu Init Root.</p>';return;}
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
  branch.appendChild(card(n));
  if(n.spouseName){
    const sp = document.createElement("div");
    sp.className="node";
    sp.innerHTML=`<img src="${n.spousePhoto||placeholder(n.gender==='L'?'P':'L')}"/><div class="name">${escape(n.spouseName)}</div><div class="meta">Pasangan</div>`;
    branch.appendChild(sp);
  }
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
  d.innerHTML = `<img src="${n.photo||placeholder(n.gender)}" alt=""/>
    <div class="name">${escape(n.name)}</div>
    <div class="meta">#${n.no||"-"} ${n.birth||""}${n.death?" – "+n.death:""}</div>`;
  d.addEventListener("click",e=>{e.stopPropagation();showCtx(e.clientX,e.clientY,n);});
  return d;
}
function placeholder(g){
  const c = g==="P" ? "%23ec4899" : "%2338bdf8";
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='${c}'/%3E%3Ctext x='32' y='40' font-size='28' text-anchor='middle' fill='white'%3E${g==='P'?'♀':'♂'}%3C/text%3E%3C/svg%3E`;
}
function escape(s){return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

/* ---------- Context Menu ---------- */
function showCtx(x,y,n){
  const m = $("#ctx-menu");
  const canEdit = State.user;
  m.innerHTML = "";
  const items = [
    {l:"👁 Lihat Profil", fn:()=>viewProfile(n)},
    canEdit && {l:"✎ Edit", fn:()=>openNodeEditor(n)},
    canEdit && {l:"➕ Tambah Anak", fn:()=>openNodeEditor(null,n.id,"child")},
    canEdit && !n.spouseName && {l:"💍 Tambah Pasangan", fn:()=>openNodeEditor(null,n.id,"spouse")},
    State.user?.role==="admin" && {l:"🗑 Padam", fn:()=>delNode(n)},
  ].filter(Boolean);
  items.forEach(i=>{const b=document.createElement("button");b.textContent=i.l;b.onclick=()=>{m.classList.add("hidden");i.fn();};m.appendChild(b);});
  m.style.left = Math.min(x, innerWidth-200)+"px";
  m.style.top = Math.min(y, innerHeight-items.length*40)+"px";
  m.classList.remove("hidden");
}
document.addEventListener("click",()=>$("#ctx-menu").classList.add("hidden"));

function viewProfile(n){alert(`${n.name}\n#${n.no||"-"}\n${n.notes||""}`);}

/* ---------- Node Editor ---------- */
function openNodeEditor(node, parentId=null, relation="child"){
  const f = $("#form-node");
  f.reset();
  f.id.value = node?.id||"";
  f.parentId.value = parentId||node?.parentId||"";
  f.relation.value = relation;
  if(node){
    f.name.value=node.name; f.gender.value=node.gender||"L"; f.status.value=node.status||"hidup";
    f.birth.value=node.birth||""; f.death.value=node.death||"";
    f.spouse.value=node.spouseName||""; f.notes.value=node.notes||"";
  }
  $("#node-title").textContent = node?"Edit Ahli":(relation==="spouse"?"Tambah Pasangan":"Tambah Anak");
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
  try{
    await api("saveNode", payload);
    toast(State.user.role==="admin"?"Disimpan":"Dihantar untuk semakan admin");
    closeModal("modal-node");
    await refresh();
  }catch(err){toast(err.message);}
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
  $("#user-info").textContent = u?`${u.username} • ${u.role==="admin"?"ADMIN":"Ahli #"+u.no}`:"Tidak log masuk";
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
    p.innerHTML = d.pending.length?"":'<p class="text-slate-400 text-sm">Tiada item pending.</p>';
    d.pending.forEach(it=>{
      const div=document.createElement("div");
      div.className="glass rounded-lg p-3 mb-2 flex justify-between items-center gap-2";
      div.innerHTML=`<div class="text-sm"><b>${escape(it.action)}</b> oleh ${escape(it.by)}<br><span class="text-xs text-slate-400">${escape(it.summary)}</span></div>`;
      const ok=document.createElement("button");ok.className="btn btn-primary";ok.textContent="✓";
      const no=document.createElement("button");no.className="btn btn-ghost";no.textContent="✕";
      ok.onclick=async()=>{await api("moderate",{id:it.id,decision:"approve"});loadAdmin();refresh();};
      no.onclick=async()=>{await api("moderate",{id:it.id,decision:"reject"});loadAdmin();};
      const wrap=document.createElement("div");wrap.className="flex gap-1";wrap.append(ok,no);
      div.appendChild(wrap);p.appendChild(div);
    });
    const u=$("#admin-users");
    u.innerHTML='<table class="w-full text-xs"><thead><tr class="text-left text-slate-400"><th>#</th><th>Username</th><th>Nama</th><th>Peranan</th></tr></thead><tbody></tbody></table>';
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
$("#btn-settings").addEventListener("click",()=>{$("#gas-url").value=State.gasUrl;openModal("modal-settings");});
$("#btn-save-settings").addEventListener("click",()=>{
  State.gasUrl = $("#gas-url").value.trim();
  localStorage.setItem("gasUrl",State.gasUrl);
  closeModal("modal-settings"); refresh();
});

/* ---------- Panzoom ---------- */
function initPanzoom(){
  const el = $("#canvas");
  State.panzoom = Panzoom(el,{maxScale:3,minScale:.3,canvas:true,contain:false});
  $("#stage").addEventListener("wheel",State.panzoom.zoomWithWheel);
  $("#btn-zoom-in").onclick=()=>State.panzoom.zoomIn();
  $("#btn-zoom-out").onclick=()=>State.panzoom.zoomOut();
  $("#btn-reset").onclick=()=>State.panzoom.reset();
}

/* ---------- Refresh ---------- */
async function refresh(){
  try{
    const d = await api("getTree",{});
    State.nodes = d.nodes||[];
    buildTree();
  }catch(e){
    if(e.message!=="no-url") toast(e.message);
  }
}

/* ---------- Boot ---------- */
window.addEventListener("DOMContentLoaded",()=>{
  initPanzoom(); updateUserUI();
  if(State.gasUrl) refresh();
  else { $("#tree-root").innerHTML='<div class="text-center mt-32"><p class="text-slate-300">Tetapkan URL Google Apps Script untuk mula.</p><button onclick="document.getElementById(\'btn-settings\').click()" class="btn btn-primary mt-3">Buka Tetapan</button></div>'; }
});
