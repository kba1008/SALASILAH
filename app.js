/* Salasilah Keluarga Elit — app.js v2.6 */

const GAS_URL = "https://script.google.com/macros/s/AKfycbzg2LoScY8KIVjJjZL24-mmu5-JosABVWDZKOjOlgn-LoER91NPpQ_5NiAc29r4TxAb/exec";

const State = {
  user: JSON.parse(localStorage.getItem("user") || "null"),
  nodes: [],
  notes: [],
  users: [],
  panzoom: null,
  searchResults: [],
  searchIndex: 0,
  noteAddMode: false,
  reparentMode: null, // {nodeId} bila admin sedang pilih parent baharu
};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),2800);}

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
      try{ await navigator.clipboard.writeText(fullText); }
      catch{ const r=document.createRange();r.selectNodeContents(card.querySelector(".err-msg"));const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand("copy");s.removeAllRanges(); }
      const b = card.querySelector('[data-act="copy"]'); const old=b.textContent; b.textContent="✓ Disalin"; setTimeout(()=>b.textContent=old,1500);
    };
    host.appendChild(card);
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
  let a=[];
  if(Array.isArray(n.spouses) && n.spouses.length) a=n.spouses;
  else if(n.spousesJson){
    try{ const x = JSON.parse(n.spousesJson); if(Array.isArray(x)) a=x; }catch(e){}
  }
  else if(n.spouseName) a=[{name:n.spouseName, photo:n.spousePhoto||"", status:n.spouseStatus||"hidup", order:1, death:""}];
  a.forEach((s,i)=>{ if(!s.order) s.order=i+1; });
  a.sort((x,y)=>(x.order||99)-(y.order||99));
  return a;
}
function canAddSpouse(n){
  // Tiada had — sesiapa boleh tambah berapa banyak pasangan (poligami / kahwin semula)
  return true;
}
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

/* ---------- Render Tree ---------- */
function buildTree(){
  const host = $("#tree-root");
  host.className=""; host.innerHTML="";

  // Cari root utama (parentId kosong & tidak hanging) dan root tergantung
  const roots = State.nodes.filter(n=>!n.parentId);
  const mainRoot = roots.find(r=>!r.hanging) || roots[0];
  // Orphan: parentId wujud tapi parent tidak dijumpai
  const ids = new Set(State.nodes.map(n=>n.id));
  const orphans = State.nodes.filter(n=> n.parentId && !ids.has(n.parentId));
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

  // Root tergantung & orphan — render dengan label + garis putus merah ke atas
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
}
function renderNode(n){
  const li = document.createElement("li");
  const branch = document.createElement("div");
  branch.className="branch";

  const couple = document.createElement("div");
  couple.className = "couple";
  couple.appendChild(card(n));
  const sps = getSpouses(n);
  sps.forEach((sp,idx)=>{
    const link = document.createElement("div");
    link.className = "couple-link";
    link.title = "Pasangan "+spouseOrdinal(sp.order||idx+1);
    couple.appendChild(link);

    const el = document.createElement("div");
    el.className = "node spouse"+(sp.status==="cerai"?" divorced":"")+(sp.status==="mati"?" deceased":"");
    const stLabel = sp.status==="mati"?"†":(sp.status==="cerai"?"⚊":"");
    el.innerHTML=`<img src="${fixPhoto(sp.photo)||placeholder(n.gender==='L'?'P':'L')}" onerror="this.src='${placeholder(n.gender==='L'?'P':'L')}'"/>
      <div class="name" dir="auto">${escape(sp.name)} ${stLabel}</div>
      <div class="meta">Pasangan ${spouseOrdinal(sp.order||idx+1)} • ${spouseStatusLabel(sp)}</div>`;
    el.addEventListener("click",e=>{e.stopPropagation();showSpouseProfile(n, sp);});
    couple.appendChild(el);
  });
  branch.appendChild(couple);

  li.appendChild(branch);
  const kids = State.nodes.filter(x=>x.parentId===n.id);
  if(kids.length){
    const cu = document.createElement("ul");
    cu.className="children-row";
    if(sps.length>1){
      const groups = {};
      kids.forEach(k=>{ const key = k.spouseIndex || "0"; (groups[key]=groups[key]||[]).push(k); });
      Object.keys(groups).sort().forEach(key=>{
        const grpLi = document.createElement("li");
        grpLi.className="kid-group";
        const lbl = document.createElement("div");
        lbl.className = "kid-group-label";
        if(key==="0") lbl.textContent = "Tidak ditandakan";
        else {
          const sp = sps.find(s=>String(s.order)===String(key)) || sps[Number(key)-1];
          lbl.textContent = sp ? `Anak dengan ${sp.name} (Pasangan ${spouseOrdinal(sp.order||key)})` : `Pasangan ${spouseOrdinal(key)}`;
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
function card(n){
  const linked = findLinkedUser(n);
  const isAdminUser = linked && linked.role === "admin";
  const d = document.createElement("div");
  d.className = "node"+(n.pending?" pending":"")+(!n.parentId && !n.hanging ?" root":"")+(n.hanging?" hanging":"")+(linked?" is-user":"")+(isAdminUser?" is-admin":"");
  d.dataset.nodeId = n.id;
  const badges = `${linked?`<span class="badge-user" title="Pengguna berdaftar: @${escape(linked.username)}">👤</span>`:""}${isAdminUser?`<span class="badge-admin" title="Admin">★</span>`:""}`;
  d.innerHTML = `${badges?`<div class="node-badges">${badges}</div>`:""}
    <img src="${fixPhoto(n.photo)||fixPhoto(linked?.photo)||placeholder(n.gender)}" alt="" onerror="this.src='${placeholder(n.gender)}'"/>
    <div class="name" dir="auto">${escape(n.name)}</div>
    <div class="meta">#${n.no||"-"} ${n.birth||""}${n.death?" – "+n.death:""}</div>
    ${n.pending?'<div class="meta" style="font-weight:700">Belum disahkan admin</div>':''}`;
  d.addEventListener("click",e=>{
    e.stopPropagation();
    if(State.reparentMode){
      const targetId = State.reparentMode.nodeId;
      if(targetId === n.id){ toast("Tidak boleh pilih diri sendiri"); return; }
      doReparent(targetId, n.id);
      return;
    }
    if(State.user?.role === "admin" && n.pending){
      viewProfile(n);
      return;
    }
    showCtx(e.clientX,e.clientY,n);
  });
  return d;
}
function placeholder(g){
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
  const linked = findLinkedUser(n);
  m.innerHTML = "";
  const items = [
    {l:"👁 Lihat Profil", fn:()=>viewProfile(n)},
    canEdit && {l:"✎ Edit Maklumat", fn:()=>openNodeEditor(n)},
    canEdit && {l:"➕ Tambah Anak", fn:()=>openNodeEditor(null,n.id,"child", n)},
    canEdit && canAddSpouse(n) && {l:"💍 Tambah Pasangan", fn:()=>openSpouseEditor(n)},
    isAdmin && {l:"🔀 Pindah ke parent lain…", fn:()=>startReparent(n)},
    isAdmin && n.parentId && {l:"⛓ Putuskan jadi root tergantung", fn:()=>doReparent(n.id, "", true)},
    linked && {l:`👤 Pengguna berdaftar: @${linked.username}${linked.role==='admin'?' ★':''}`, fn:()=>showInfo(`Nama: ${linked.fullname}\nUsername: @${linked.username}\nPeranan: ${linked.role==='admin'?'ADMIN ★':'Ahli'}`,{title:"Pengguna Berdaftar"})},
    canEdit && {l: isAdmin?"🗑 Padam":"🗑 Pohon Padam", fn:()=>delNode(n)},
  ].filter(Boolean);
  items.forEach(i=>{const b=document.createElement("button");b.textContent=i.l;b.onclick=()=>{m.classList.add("hidden");i.fn();};m.appendChild(b);});
  m.style.left = Math.min(x, innerWidth-260)+"px";
  m.style.top = Math.min(y, innerHeight-items.length*40)+"px";
  m.classList.remove("hidden");
}
document.addEventListener("click",()=>$("#ctx-menu").classList.add("hidden"));

/* ---------- Reparent (admin) ---------- */
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
  try{
    await api("reparent",{id:nodeId, newParentId:newParentId||"", hanging: !!makeHanging});
    showInfo("Salasilah dikemaskini");
    cancelReparent();
    await refresh();
  }catch(err){ showError(err,{title:"Gagal pindah",context:"reparent"}); cancelReparent(); }
}

/* ---------- Profile Viewer ---------- */
function fmtDateTime(v){
  if(!v) return "";
  try{ const d=new Date(v); if(isNaN(d.getTime())) return String(v); return d.toLocaleString("ms-MY"); }catch(e){ return String(v); }
}
function pendingActionLabel(action){
  const map = {
    add:"Ahli baharu",
    edit:"Kemaskini profil",
    delete:"Permintaan padam",
    spouse:"Pasangan baharu",
    "spouse-edit":"Kemaskini pasangan",
    "spouse-delete":"Padam pasangan",
    "note-add":"Nota baharu",
    "note-edit":"Kemaskini nota",
    "note-delete":"Padam nota",
  };
  return map[action] || action || "Perubahan";
}
function viewProfile(n){
  const sp = getSpouses(n);
  const photo = fixPhoto(n.photo) || placeholder(n.gender);
  const editedBy = n.lastEditBy || n.createdBy || "";
  const editedAt = fmtDateTime(n.lastEditAt || n.createdAt);
  const approvedBy = n.approvedBy || "";
  const approvedAt = fmtDateTime(n.approvedAt);
  const pendingItems = Array.isArray(n.pendingItems) ? n.pendingItems : [];
  const canApprove = State.user?.role === "admin" && pendingItems.length;
  $("#profile-body").innerHTML = `
    <div class="flex flex-col items-center mb-4">
      <img src="${photo}" onerror="this.src='${placeholder(n.gender)}'" class="w-28 h-28 rounded-full object-cover mb-2" style="border:3px solid var(--gold)"/>
      <h2 class="text-2xl font-bold text-center serif" dir="auto">${escape(n.name)}</h2>
      ${n.nickname?`<p class="text-sm serif italic" dir="auto" style="color:var(--gold-dark)">"${escape(n.nickname)}"</p>`:""}
      <p class="text-xs" style="color:var(--ink-soft)">#${n.no||"-"} • ${n.gender==='P'?'Perempuan':'Lelaki'} • ${n.status==='mati'?'Almarhum':'Hidup'}</p>
      ${n.pending?'<p class="text-[11px] mt-1 font-semibold" style="color:#475569">● Belum disahkan admin</p>':''}
    </div>
    <div class="space-y-2 text-sm" dir="auto">
      ${rowField("Tahun Lahir", n.birth)}
      ${rowField("Tempat Lahir", n.birthplace)}
      ${rowField("Tahun Wafat", n.death)}
      ${rowField("Tempat Wafat", n.deathplace)}
      ${sp.length?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Pasangan (${sp.length})</div>
        <ul class="space-y-1" dir="auto">${sp.map((s,i)=>`<li>• <b>${spouseOrdinal(s.order||i+1)}:</b> ${escape(s.name)} <span style="color:var(--ink-soft)">(${spouseStatusLabel(s)})</span></li>`).join("")}</ul></div>`:""}
      ${n.notes?`<div><div class="text-xs mb-1" style="color:var(--ink-soft)">Catatan</div><p class="whitespace-pre-wrap" dir="auto">${escape(n.notes)}</p></div>`:""}
    </div>
    <div class="mt-4 pt-3 border-t text-[11px] flex flex-col gap-1" style="border-color:var(--line-soft);color:var(--ink-soft)">
      <div class="font-semibold serif" style="color:var(--gold-dark);font-size:12px">📜 Log Pengesahan</div>
      <div>📝 Terakhir dikemaskini oleh: <b style="color:var(--ink)">${escape(editedBy||"—")}</b></div>
      ${editedAt?`<div>🕒 ${escape(editedAt)}</div>`:""}
      ${approvedBy?`<div>✅ Disahkan oleh admin: <b style="color:#1e7a3b">${escape(approvedBy)}</b>${approvedAt?` • ${escape(approvedAt)}`:""}</div>`:(n.pending?'<div style="color:#475569">● Menunggu pengesahan</div>':'')}
      ${n.createdBy && n.createdBy!==editedBy?`<div>👤 Dicipta oleh: ${escape(n.createdBy)}</div>`:""}
    </div>
    ${pendingItems.length?`
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
        <button class="btn btn-primary flex-1" id="profile-edit-btn">✎ Edit Maklumat</button>
        <button class="btn btn-ghost flex-1" id="profile-addchild-btn">➕ Tambah Anak</button>
        <button class="btn btn-ghost flex-1" id="profile-addspouse-btn">💍 Tambah Pasangan</button>
      </div>
      ${canApprove?`<div class="flex gap-2 mt-3">
        <button class="btn btn-primary flex-1" id="profile-approve-btn">✓ Sahkan Data Ini</button>
        <button class="btn btn-ghost flex-1" id="profile-reject-btn" style="color:#8b1e1e">✕ Tolak Perubahan</button>
      </div>`:''}
    `}
  `;
  openModal("modal-profile");
  if(State.user){
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
      ${isAdmin?`<button id="btn-del-spouse" class="btn btn-ghost flex-1" style="color:var(--rose)">🗑 Padam</button>`:""}
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
  try{
    await api("deleteSpouse",{ parentId: parent.id, order: sp.order||1 });
    toast("Pasangan dipadam");
    closeModal("modal-profile");
    await refresh();
  }catch(e){ showError(e,{title:"Gagal padam pasangan",context:"deleteSpouse"}); }
}

async function moderateTarget(targetId, targetType, decision="approve"){
  const isReject = decision === "reject";
  if(isReject && !confirm("Tolak semua perubahan belum disahkan untuk profil ini?")) return;
  try{
    await api("moderateTarget", { targetId, targetType, decision });
    showInfo(isReject ? "Perubahan ditolak" : "Data berjaya disahkan");
    closeModal("modal-profile");
    if(State.user?.role === "admin") loadAdmin();
    await refresh();
  }catch(err){
    showError(err,{title:isReject?"Gagal tolak perubahan":"Gagal sahkan data",context:"moderateTarget"});
  }
}

/* ---------- Node Editor ---------- */
function openNodeEditor(node, parentId=null, relation="child", parentNode=null){
  if(!State.user){toast("Sila log masuk");return;}
  const f = $("#form-node");
  f.reset();
  f.id.value = node?.id || "";
  f.parentId.value = parentId || node?.parentId || "";
  f.relation.value = node ? "edit" : relation;
  // Dropdown ibu (jika parent ada >1 pasangan)
  const wrap = $("#spouse-pick-wrap");
  wrap.innerHTML = "";
  const pid = f.parentId.value;
  const pNode = parentNode || State.nodes.find(x=>x.id===pid);
  if(pNode){
    const sps = getSpouses(pNode);
    if(sps.length>=1){
      const lbl = document.createElement("label");
      lbl.className = "text-xs block"; lbl.style.color = "var(--ink-soft)";
      lbl.textContent = "Anak daripada pasangan yang mana?";
      const sel = document.createElement("select");
      sel.className = "input"; sel.name = "spouseIndex";
      sel.innerHTML = `<option value="">— Tidak ditandakan —</option>` +
        sps.map((s,i)=>`<option value="${s.order||i+1}">${spouseOrdinal(s.order||i+1)}: ${escape(s.name)}</option>`).join("");
      if(node?.spouseIndex) sel.value = String(node.spouseIndex);
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
  if(!State.user){toast("Sila log masuk");return;}
  const fd = new FormData(e.target);
  const photo = await fileToBase64(fd.get("photo"));
  const payload = Object.fromEntries(fd.entries());
  delete payload.photo;
  if(photo) payload.photo = photo;
  if(payload.id) payload.relation = "edit";
  try{
    await api("saveNode", payload);
    toast(State.user.role==="admin"?"Disimpan":"Dihantar untuk semakan admin");
    closeModal("modal-node");
    await refresh();
  }catch(err){showError(err,{title:"Gagal simpan ahli",context:err.action||"saveNode"});}
});

/* ---------- Spouse Editor ---------- */
function openSpouseEditor(parent, existing=null){
  if(!State.user){toast("Sila log masuk");return;}
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
  if(!State.user){toast("Sila log masuk");return;}
  const fd = new FormData(e.target);
  const parent = State.nodes.find(x=>x.id===fd.get("parentId"));
  if(!parent){toast("Profil induk tidak dijumpai");return;}
  const photo = await fileToBase64(fd.get("photo"));
  const editOrder = fd.get("editOrder");
  try{
    if(editOrder){
      const payload = {
        parentId: parent.id,
        order: Number(editOrder),
        name: fd.get("name"),
        nickname: fd.get("nickname")||"",
        gender: fd.get("gender")||"",
        status: fd.get("status"),
        birth: fd.get("birth")||"",
        birthplace: fd.get("birthplace")||"",
        death: fd.get("death")||"",
        deathplace: fd.get("deathplace")||"",
        notes: fd.get("notes")||"",
        newOrder: Number(fd.get("spouseOrder"))||Number(editOrder),
      };
      if(photo) payload.photo = photo;
      await api("editSpouse", payload);
    } else {
      const payload = {
        parentId: parent.id,
        relation: "spouse",
        name: fd.get("name"),
        nickname: fd.get("nickname")||"",
        gender: fd.get("gender")||"",
        spouseStatus: fd.get("status"),
        birth: fd.get("birth")||"",
        birthplace: fd.get("birthplace")||"",
        spouseDeath: fd.get("death")||"",
        deathplace: fd.get("deathplace")||"",
        notes: fd.get("notes")||"",
        spouseOrder: fd.get("spouseOrder")||"",
      };
      if(photo) payload.photo = photo;
      await api("saveNode", payload);
    }
    toast(State.user.role==="admin"?"Disimpan":"Dihantar untuk semakan admin");
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

/* ---------- NOTA pada peta ---------- */
function renderNotes(){
  const canvas = $("#canvas");
  // padam nota lama
  $$(".map-note", canvas).forEach(el=>el.remove());
  (State.notes||[]).forEach(n=>{
    const el = document.createElement("div");
    el.className = "map-note"+(n.pending?" pending":"")+(n.pinned?" pinned":"");
    el.dataset.noteId = n.id;
    el.style.left = (n.x||0)+"px";
    el.style.top  = (n.y||0)+"px";
    el.style.color = n.color || "var(--ink)";
    el.style.fontFamily = n.font || "Cormorant Garamond";
    el.style.fontSize = (n.size||16)+"px";
    el.innerHTML = `<span class="note-text" dir="auto">${escape(n.text||"")}</span>
      ${n.pinned?'<span class="note-pin" title="Dipin">📌</span>':''}
      ${n.pending?'<span class="note-pending" title="Menunggu kelulusan">⏳</span>':''}`;
    el.addEventListener("click",e=>{ e.stopPropagation(); openNoteCtx(e.clientX, e.clientY, n); });
    enableNoteDrag(el, n);
    canvas.appendChild(el);
  });
}
function enableNoteDrag(el, n){
  const isAdmin = State.user?.role==="admin";
  const isOwner = State.user && n.createdBy===State.user.username;
  if(n.pinned && !isAdmin) return; // tidak boleh seret
  if(!isAdmin && !isOwner) return; // pelawat / orang lain — tidak boleh seret
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
      try{
        await api("saveNote",{id:n.id, text:n.text, x:nx, y:ny, font:n.font, size:n.size, color:n.color, pinned:n.pinned});
        if(State.user.role!=="admin") toast("Kedudukan baharu — perlu kelulusan admin");
        await refresh();
      }catch(e){ showError(e,{title:"Gagal alih nota",context:"saveNote"}); }
    }
  });
}
function openNoteCtx(x,y,n){
  const m = $("#ctx-menu");
  const isAdmin = State.user?.role==="admin";
  const isOwner = State.user && n.createdBy===State.user.username;
  const canEdit = isAdmin || (isOwner && !n.pinned);
  m.innerHTML = "";
  const items = [
    canEdit && {l:"✎ Edit Nota", fn:()=>openNoteEditor(n)},
    isAdmin && {l: n.pinned ? "📍 Buka Pin" : "📌 Pin Nota", fn:()=>togglePin(n)},
    canEdit && {l:"🗑 Padam Nota", fn:()=>deleteNote(n)},
    {l:"ℹ Info", fn:()=>showInfo(`Dicipta oleh: ${n.createdBy||"-"}\nDikemaskini: ${fmtDateTime(n.lastEditAt)}\n${n.approvedBy?"Disahkan: "+n.approvedBy:"⏳ Belum disahkan"}`,{title:"Maklumat Nota"})},
  ].filter(Boolean);
  if(!items.length) return;
  items.forEach(i=>{const b=document.createElement("button");b.textContent=i.l;b.onclick=()=>{m.classList.add("hidden");i.fn();};m.appendChild(b);});
  m.style.left = Math.min(x, innerWidth-220)+"px";
  m.style.top = Math.min(y, innerHeight-items.length*40)+"px";
  m.classList.remove("hidden");
}
function openNoteEditor(n){
  if(!State.user){toast("Sila log masuk untuk tambah/edit nota");return;}
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
  if(!State.user){toast("Sila log masuk");return;}
  const fd = new FormData(e.target);
  const payload = {
    id: fd.get("id")||"",
    text: fd.get("text"),
    x: Number(fd.get("x"))||0,
    y: Number(fd.get("y"))||0,
    font: fd.get("font")||"Cormorant Garamond",
    size: Number(fd.get("size"))||16,
    color: fd.get("color")||"#3b2a14",
    pinned: State.user.role==="admin" ? !!fd.get("pinned") : false,
  };
  if(!payload.id) delete payload.id;
  try{
    await api("saveNote", payload);
    toast(State.user.role==="admin"?"Nota disimpan":"Dihantar untuk semakan admin");
    closeModal("modal-note");
    await refresh();
  }catch(err){ showError(err,{title:"Gagal simpan nota",context:err.action||"saveNote"}); }
});
async function togglePin(n){
  try{
    await api("saveNote",{id:n.id, text:n.text, x:n.x, y:n.y, font:n.font, size:n.size, color:n.color, pinned:!n.pinned});
    showInfo(n.pinned?"Pin dibuka":"Nota dipin");
    await refresh();
  }catch(e){ showError(e,{title:"Gagal pin",context:"saveNote"}); }
}
async function deleteNote(n){
  const isAdmin = State.user?.role==="admin";
  if(!confirm(isAdmin?"Padam nota ini?":"Pohon padam nota ini? Perlu kelulusan admin.")) return;
  try{
    await api("deleteNote",{id:n.id});
    showInfo(isAdmin?"Nota dipadam":"Permintaan padam dihantar");
    await refresh();
  }catch(e){ showError(e,{title:"Gagal padam nota",context:"deleteNote"}); }
}
// Butang tambah nota — masuk mod letak
$("#btn-add-note").addEventListener("click",()=>{
  if(!State.user){toast("Log masuk dahulu untuk tambah nota");return;}
  State.noteAddMode = true;
  toast("Klik pada peta untuk meletakkan nota baharu");
  document.body.classList.add("note-add-cursor");
});
$("#canvas").addEventListener("click", e=>{
  if(!State.noteAddMode) return;
  // koordinat relatif kepada canvas
  const canvas = $("#canvas");
  const rect = canvas.getBoundingClientRect();
  const scale = State.panzoom ? State.panzoom.getScale() : 1;
  const x = (e.clientX - rect.left) / scale;
  const y = (e.clientY - rect.top) / scale;
  State.noteAddMode = false;
  document.body.classList.remove("note-add-cursor");
  openNoteEditor({x: Math.round(x), y: Math.round(y), text:"", font:"Cormorant Garamond", size:18, color:"#3b2a14"});
});

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
  $("#btn-add-note").classList.toggle("hidden", !u);
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
  const hanging = $("#root-hanging")?.checked || false;
  try{
    await api("initRoot",{name, hanging});
    showInfo(hanging ? "Root tergantung dicipta — boleh disambung kemudian" : "Root utama berjaya dicipta");
    closeModal("modal-admin");
    refresh();
  }catch(e){
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
  $("#theme-note").textContent = isMaster ? "👑 Master Admin — pilihan tema ini akan disimpan setempat pada peranti ini." : "🔒 Hanya Master Admin (akaun 'admin') yang boleh menukar tema aplikasi.";
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
    State.notes = d.notes||[];
    State.users = d.users||[];
    buildTree();
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
