/**
 * PWA LOGIK PENGHANTARAN DATA (app.js)
 * Menguruskan UI, rendering peta salasilah, form offline/online, dan API calls.
 */

// MASUKKAN URL GOOGLE APPS SCRIPT WEB APP DI SINI (Selepas Deploy)
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwUmJQtXW_wa3596DmF_6QvkZNw1vI1z4Zi7mti5-UqC34jCb9dq3YAjlCU9JrocRNk/exec';

// --- STATE MANAGEMENT ---
let currentUser = JSON.parse(localStorage.getItem('salasilah_user')) || null;
let treeData = [];
let panzoomInstance = null;
let selectedNodeId = null;

// --- DOM ELEMENTS ---
const ui = {
  btnShowLogin: document.getElementById('btn-show-login'),
  userInfo: document.getElementById('user-info'),
  displayUsername: document.getElementById('display-username'),
  btnLogout: document.getElementById('btnLogout'),
  btnAdminPanel: document.getElementById('btn-admin-panel'),
  
  authModal: document.getElementById('auth-modal'),
  nodeModal: document.getElementById('node-modal'),
  adminModal: document.getElementById('admin-modal'),
  overlay: document.getElementById('modal-overlay'),
  loading: document.getElementById('loading-overlay'),
  
  contextMenu: document.getElementById('context-menu'),
  treeRoot: document.getElementById('tree-root'),
  treeContainer: document.getElementById('tree-container')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  initPanzoom();
  checkAuthStatus();
  fetchTreeData();
  setupEventListeners();
});

function initPanzoom() {
  panzoomInstance = Panzoom(ui.treeRoot, {
    maxScale: 5,
    minScale: 0.1,
    step: 0.2,
    contain: 'outside'
  });
  // Mouse wheel scroll to zoom
  ui.treeContainer.parentElement.addEventListener('wheel', panzoomInstance.zoomWithWheel);
}

function checkAuthStatus() {
  if (currentUser) {
    ui.btnShowLogin.classList.add('hidden');
    ui.userInfo.classList.remove('hidden');
    ui.displayUsername.textContent = currentUser.username;
    if (currentUser.role === 'MasterAdmin' || currentUser.role === 'SubAdmin') {
      ui.btnAdminPanel.classList.remove('hidden');
    }
  } else {
    ui.btnShowLogin.classList.remove('hidden');
    ui.userInfo.classList.add('hidden');
    ui.btnAdminPanel.classList.add('hidden');
  }
}

// --- API & DATA FETCHING ---
async function apiRequest(payload) {
  showLoading('Memproses...');
  try {
    const response = await fetch(GAS_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Avoid CORS preflight issues sometimes
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    hideLoading();
    return result;
  } catch (error) {
    hideLoading();
    alert('Ralat Rangkaian. Pastikan anda berada dalam talian.');
    console.error(error);
    return { status: 'error' };
  }
}

async function fetchTreeData() {
  const res = await apiRequest({ action: 'getTree' });
  if (res.status === 'success') {
    treeData = res.data;
    renderTree();
  }
}

// --- TREE RENDERING LOGIC (Complex due to Spouses & Children) ---
function renderTree() {
  ui.treeRoot.innerHTML = '';
  
  if (treeData.length === 0) {
    ui.treeRoot.innerHTML = '<p class="text-2xl text-slate-400">Data Salasilah Kosong. Admin perlu mulakan akar.</p>';
    return;
  }

  const rootNode = treeData.find(n => n.type === 'root');
  if (rootNode) {
    const treeHTML = buildFamilyDOM(rootNode.id);
    ui.treeRoot.appendChild(treeHTML);
  }
}

// Recursive function to build the tree DOM structure
function buildFamilyDOM(primaryId) {
  const primary = treeData.find(n => n.id === primaryId);
  if (!primary) return document.createElement('div');

  const familyGroup = document.createElement('div');
  familyGroup.className = 'family-group';

  // 1. Build Parents Section (Primary + Spouses)
  const parentsDiv = document.createElement('div');
  parentsDiv.className = 'parents';

  // Add Primary Node
  parentsDiv.appendChild(createNodeCard(primary));

  // Find Spouses linked to Primary
  const spouses = treeData.filter(n => n.type === 'spouse' && n.linkedTo === primaryId);
  
  if (spouses.length > 0) {
    // Create a connecting line for spouses
    const spouseLine = document.createElement('div');
    spouseLine.className = 'spouse-line';
    parentsDiv.appendChild(spouseLine);

    spouses.forEach(spouse => {
      parentsDiv.appendChild(createNodeCard(spouse, true));
    });
  }
  familyGroup.appendChild(parentsDiv);

  // 2. Build Children Section
  // Find children linked to this primary node (for simplicity in this scope, children link to primary parent)
  const children = treeData.filter(n => n.type === 'child' && n.linkedTo === primaryId);

  if (children.length > 0) {
    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'children';
    
    children.forEach(child => {
      const childWrapper = document.createElement('div');
      childWrapper.className = 'child-wrapper';
      // Recursively build the family group for the child
      childWrapper.appendChild(buildFamilyDOM(child.id));
      childrenDiv.appendChild(childWrapper);
    });
    
    familyGroup.appendChild(childrenDiv);
  }

  return familyGroup;
}

function createNodeCard(node, isSpouse = false) {
  const card = document.createElement('div');
  card.className = `node-card ${node.status === 'pending' ? 'pending' : ''} ${isSpouse ? 'spouse-node' : ''}`;
  card.dataset.id = node.id;

  const defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const imgUrl = node.photoUrl ? node.photoUrl : defaultAvatar;

  card.innerHTML = `
    <img src="${imgUrl}" class="node-img" alt="Avatar">
    <h3 class="font-bold text-sm uppercase leading-tight">${node.name}</h3>
    <p class="text-xs text-slate-500 mt-1">Disunting oleh: <br><span class="font-medium text-slate-700">${node.editor}</span></p>
  `;

  // Click event for Context Menu
  card.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from closing it immediately
    if (!currentUser) {
      alert('Sila Log Masuk untuk berinteraksi dengan data.');
      return;
    }
    selectedNodeId = node.id;
    showContextMenu(e.clientX, e.clientY);
  });

  return card;
}

// --- UI & INTERACTION LOGIC ---
function showContextMenu(x, y) {
  ui.contextMenu.style.left = `${x}px`;
  ui.contextMenu.style.top = `${y}px`;
  ui.contextMenu.classList.add('active');
}

document.addEventListener('click', () => {
  ui.contextMenu.classList.remove('active');
});

function openModal(modalEl) {
  ui.overlay.classList.remove('hidden');
  modalEl.classList.remove('hidden');
}

function closeAllModals() {
  ui.overlay.classList.add('hidden');
  ui.authModal.classList.add('hidden');
  ui.nodeModal.classList.add('hidden');
  ui.adminModal.classList.add('hidden');
}

function showLoading(text) {
  document.getElementById('loading-text').innerText = text;
  ui.loading.classList.remove('hidden');
}
function hideLoading() { ui.loading.classList.add('hidden'); }

// --- EVENT LISTENERS SETUP ---
function setupEventListeners() {
  // Header Buttons
  ui.btnShowLogin.addEventListener('click', () => openModal(ui.authModal));
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('salasilah_user');
    currentUser = null;
    checkAuthStatus();
    location.reload();
  });
  ui.btnAdminPanel.addEventListener('click', () => {
    openModal(ui.adminModal);
    fetchPendingData();
  });

  // Zoom Controls
  document.getElementById('btn-zoom-in').addEventListener('click', panzoomInstance.zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', panzoomInstance.zoomOut);

  // Close Modals
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
  ui.overlay.addEventListener('click', closeAllModals);

  // Context Menu Actions
  document.getElementById('ctx-add-spouse').addEventListener('click', () => prepareNodeForm('add-spouse'));
  document.getElementById('ctx-add-child').addEventListener('click', () => prepareNodeForm('add-child'));
  document.getElementById('ctx-edit-node').addEventListener('click', () => prepareNodeForm('edit'));

  // Auth Form Logic
  let isLogin = true;
  document.getElementById('btn-toggle-auth').addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    document.getElementById('auth-title').innerText = isLogin ? 'Log Masuk' : 'Daftar Akaun';
    document.getElementById('reg-fields').classList.toggle('hidden');
    document.getElementById('auth-submit').innerText = isLogin ? 'Log Masuk' : 'Daftar';
    document.getElementById('auth-toggle-text').innerText = isLogin ? 'Belum mendaftar?' : 'Sudah ada akaun?';
    e.target.innerText = isLogin ? 'Daftar Sini' : 'Log Masuk';
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      action: isLogin ? 'login' : 'register',
      username: document.getElementById('auth-username').value,
      password: document.getElementById('auth-password').value,
    };
    if (!isLogin) {
      payload.fullname = document.getElementById('reg-fullname').value;
      payload.email = document.getElementById('reg-email').value;
      payload.phone = document.getElementById('reg-phone').value;
      // Handle photo logic here if needed (read as base64)
    }
    
    const res = await apiRequest(payload);
    if (res.status === 'success') {
      if (isLogin) {
        localStorage.setItem('salasilah_user', JSON.stringify(res.user));
        currentUser = res.user;
        checkAuthStatus();
        closeAllModals();
      } else {
        alert('Pendaftaran Berjaya. Sila Log Masuk.');
        document.getElementById('btn-toggle-auth').click(); // Switch back to login
      }
    } else {
      alert(res.message);
    }
  });

  // Node Form Submit (Add/Edit)
  document.getElementById('node-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('node-photo');
    let base64Photo = null;
    
    if (fileInput.files.length > 0) {
      base64Photo = await fileToBase64(fileInput.files[0]);
    }

    const payload = {
      action: 'submitNode',
      nodeAction: document.getElementById('node-action').value,
      targetId: document.getElementById('node-target-id').value,
      newName: document.getElementById('node-name').value,
      newGender: document.getElementById('node-gender').value,
      photoBase64: base64Photo,
      username: currentUser.username
    };

    const res = await apiRequest(payload);
    if (res.status === 'success') {
      alert('Tindakan dihantar kepada Admin untuk kelulusan (Pending).');
      closeAllModals();
      // Refresh tree to potentially show user's pending nodes (if backend supports returning them, currently backend returns all approved)
    }
  });

  // Admin Tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
        t.classList.add('text-slate-500');
      });
      e.target.classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
      e.target.classList.remove('text-slate-500');
      
      document.getElementById('admin-pending').classList.add('hidden');
      document.getElementById('admin-settings').classList.add('hidden');
      document.getElementById(e.target.dataset.target).classList.remove('hidden');
    });
  });
}

function prepareNodeForm(action) {
  document.getElementById('node-action').value = action;
  document.getElementById('node-target-id').value = selectedNodeId;
  
  const titles = {
    'add-spouse': 'Tambah Pasangan',
    'add-child': 'Tambah Anak',
    'edit': 'Sunting Profil'
  };
  document.getElementById('node-modal-title').innerText = titles[action];
  document.getElementById('node-name').value = '';
  
  if (action === 'edit') {
    const node = treeData.find(n => n.id === selectedNodeId);
    if (node) {
      document.getElementById('node-name').value = node.name;
      document.getElementById('node-gender').value = node.gender;
    }
  }
  
  openModal(ui.nodeModal);
}

// --- ADMIN MODERATION LOGIC ---
async function fetchPendingData() {
  const container = document.getElementById('pending-list-container');
  container.innerHTML = '<p class="text-slate-500">Memuatkan...</p>';
  
  const res = await apiRequest({ action: 'getPending', role: currentUser.role });
  if (res.status === 'success') {
    if (res.data.length === 0) {
      container.innerHTML = '<p class="text-slate-500 col-span-2">Tiada permohonan tertangguh setakat ini.</p>';
      return;
    }
    
    container.innerHTML = '';
    res.data.forEach(req => {
      const div = document.createElement('div');
      div.className = 'border p-4 rounded-lg bg-slate-50 relative';
      
      let actionText = req.actionType === 'add-child' ? 'Tambah Anak' : (req.actionType === 'add-spouse' ? 'Tambah Pasangan' : 'Sunting');
      
      div.innerHTML = `
        <div class="flex justify-between items-start">
          <div>
            <span class="bg-yellow-200 text-yellow-800 text-xs font-bold px-2 py-1 rounded uppercase">${actionText}</span>
            <h4 class="font-bold mt-2 uppercase">${req.newName}</h4>
            <p class="text-sm text-slate-600">Oleh: ${req.submittedBy}</p>
          </div>
          ${req.newPhotoUrl ? `<img src="${req.newPhotoUrl}" class="w-12 h-12 rounded object-cover border">` : ''}
        </div>
        <div class="flex gap-2 mt-4">
          <button class="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded font-medium" onclick="resolvePending('${req.pendingId}', 'Approve')">Lulus</button>
          <button class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded font-medium" onclick="resolvePending('${req.pendingId}', 'Reject')">Tolak</button>
        </div>
      `;
      container.appendChild(div);
    });
  } else {
    container.innerHTML = `<p class="text-red-500 col-span-2">${res.message}</p>`;
  }
}

// Must be in global scope for inline onclick
window.resolvePending = async function(pendingId, resolution) {
  if(!confirm(`Adakah anda pasti untuk ${resolution} data ini?`)) return;
  
  const res = await apiRequest({ 
    action: 'resolvePending', 
    pendingId: pendingId, 
    resolution: resolution 
  });
  
  if (res.status === 'success') {
    fetchPendingData(); // Refresh list
    fetchTreeData();    // Refresh Map
  } else {
    alert(res.message);
  }
};

// --- UTILS ---
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}
