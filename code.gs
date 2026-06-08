/**
 * GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * Sila deploy skrip ini sebagai 'Web App'.
 * Access: 'Anyone' (Since auth is handled internally via POST).
 */

// 1. TETAPAN AWAL (MACRO/INIT)
// Gunakan fungsi ini di dalam Apps Script Editor secara manual kali pertama
function INITIALIZE_SYSTEM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Setup Tab Pengguna
  let userSheet = ss.getSheetByName('PENGGUNA');
  if (!userSheet) {
    userSheet = ss.insertSheet('PENGGUNA');
    userSheet.appendRow(['UserID', 'FullName', 'Username', 'Password', 'Role', 'MemberNo', 'Phone', 'Email', 'PhotoURL']);
    // Masukkan Master Admin
    userSheet.appendRow(['u_admin1', 'Master Admin', 'admin', '101010', 'MasterAdmin', 'Ahli #1', '-', '-', '']);
  }

  // Setup Tab Salasilah
  let dataSheet = ss.getSheetByName('SALASILAH');
  if (!dataSheet) {
    dataSheet = ss.insertSheet('SALASILAH');
    dataSheet.appendRow(['NodeID', 'Name', 'Gender', 'Type', 'LinkedTo', 'PhotoURL', 'Status', 'Creator', 'Editor', 'Timestamp']);
    // Masukkan Akar Utama jika kosong
    const rootId = 'n_root_' + new Date().getTime();
    dataSheet.appendRow([rootId, 'RAJA DEWA BASNU', 'L', 'root', '', '', 'approved', 'admin', 'admin', new Date()]);
  }

  // Setup Tab Pending (Log Perubahan Tertangguh)
  let pendingSheet = ss.getSheetByName('PENDING');
  if (!pendingSheet) {
    pendingSheet = ss.insertSheet('PENDING');
    // ActionType: ADD_CHILD, ADD_SPOUSE, EDIT
    pendingSheet.appendRow(['PendingID', 'ActionType', 'TargetNodeID', 'NewName', 'NewGender', 'NewPhotoURL', 'SubmittedBy', 'Timestamp']);
  }

  // Cipta Folder Drive untuk Gambar jika belum ada
  const folders = DriveApp.getFoldersByName("Salasilah_Images");
  if (!folders.hasNext()) {
    DriveApp.createFolder("Salasilah_Images");
  }
}


// 2. HTTP ENDPOINTS (API)
// Handle Preflight CORS
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Handle POST Requests
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return respondJSON({status: 'error', message: 'No payload'});
    }
    
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch (action) {
      case 'login': return processLogin(data);
      case 'register': return processRegister(data);
      case 'getTree': return getTreeData(data);
      case 'submitNode': return submitNode(data);
      case 'getPending': return getPendingData(data);
      case 'resolvePending': return resolvePending(data);
      default: return respondJSON({status: 'error', message: 'Unknown action'});
    }
  } catch (err) {
    return respondJSON({status: 'error', message: err.toString()});
  }
}

// 3. LOGIK FUNGSI UTAMA

function respondJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function processLogin(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PENGGUNA');
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === data.username && rows[i][3] === data.password) {
      return respondJSON({
        status: 'success', 
        user: {
          userId: rows[i][0],
          fullName: rows[i][1],
          username: rows[i][2],
          role: rows[i][4],
          memberNo: rows[i][5]
        }
      });
    }
  }
  return respondJSON({status: 'error', message: 'Username atau Password salah.'});
}

function processRegister(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PENGGUNA');
  
  // Check username exists
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === data.username) return respondJSON({status: 'error', message: 'Username telah wujud.'});
  }

  const userId = 'u_' + new Date().getTime();
  const memberNo = 'Ahli #' + rows.length;
  let photoUrl = '';
  
  if (data.photoBase64) {
    photoUrl = uploadImageToDrive(data.photoBase64, data.username + '_profile');
  }

  sheet.appendRow([userId, data.fullname, data.username, data.password, 'User', memberNo, data.phone, data.email, photoUrl]);
  return respondJSON({status: 'success', message: 'Pendaftaran berjaya. Sila log masuk.'});
}

function getTreeData(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SALASILAH');
  const rows = sheet.getDataRange().getValues();
  const treeData = [];
  
  // Format: ['NodeID', 'Name', 'Gender', 'Type', 'LinkedTo', 'PhotoURL', 'Status', 'Creator', 'Editor', 'Timestamp']
  for (let i = 1; i < rows.length; i++) {
    treeData.push({
      id: rows[i][0],
      name: rows[i][1],
      gender: rows[i][2],
      type: rows[i][3],     // 'root', 'child', 'spouse'
      linkedTo: rows[i][4], // ParentID or SpouseID
      photoUrl: rows[i][5],
      status: rows[i][6],
      creator: rows[i][7],
      editor: rows[i][8]
    });
  }
  return respondJSON({status: 'success', data: treeData});
}

function submitNode(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendingSheet = ss.getSheetByName('PENDING');
  
  let photoUrl = '';
  if (data.photoBase64) {
    photoUrl = uploadImageToDrive(data.photoBase64, data.newName + '_' + new Date().getTime());
  }

  const pendingId = 'p_' + new Date().getTime();
  
  // Save to PENDING table for Admin moderation
  pendingSheet.appendRow([
    pendingId, 
    data.nodeAction,   // 'add-child', 'add-spouse', 'edit'
    data.targetId, 
    data.newName, 
    data.newGender, 
    photoUrl, 
    data.username, 
    new Date()
  ]);

  return respondJSON({status: 'success', message: 'Data berjaya dihantar dan menunggu kelulusan Admin (Pending).'});
}

function getPendingData(data) {
  // Secure check: Should verify token/role here in production. Assuming simple check for this scope.
  if (data.role !== 'MasterAdmin' && data.role !== 'SubAdmin') return respondJSON({status: 'error', message: 'Akses Ditolak.'});
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PENDING');
  const rows = sheet.getDataRange().getValues();
  const pendingData = [];
  
  for (let i = 1; i < rows.length; i++) {
    pendingData.push({
      pendingId: rows[i][0],
      actionType: rows[i][1],
      targetId: rows[i][2],
      newName: rows[i][3],
      newGender: rows[i][4],
      newPhotoUrl: rows[i][5],
      submittedBy: rows[i][6],
      timestamp: rows[i][7]
    });
  }
  return respondJSON({status: 'success', data: pendingData});
}

function resolvePending(data) {
  // data.resolution = 'Approve' | 'Reject'
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendingSheet = ss.getSheetByName('PENDING');
  const dataSheet = ss.getSheetByName('SALASILAH');
  
  const pRows = pendingSheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let pendingRecord = null;

  for (let i = 1; i < pRows.length; i++) {
    if (pRows[i][0] === data.pendingId) {
      targetRowIndex = i + 1;
      pendingRecord = pRows[i];
      break;
    }
  }

  if (!pendingRecord) return respondJSON({status: 'error', message: 'Rekod tidak dijumpai.'});

  if (data.resolution === 'Approve') {
    const actionType = pendingRecord[1];
    const targetNodeId = pendingRecord[2];
    const newName = pendingRecord[3];
    const newGender = pendingRecord[4];
    const newPhotoUrl = pendingRecord[5];
    const submittedBy = pendingRecord[6];

    if (actionType === 'edit') {
      // Find node in SALASILAH and update
      const dRows = dataSheet.getDataRange().getValues();
      for (let j = 1; j < dRows.length; j++) {
        if (dRows[j][0] === targetNodeId) {
          dataSheet.getRange(j+1, 2).setValue(newName); // Name
          dataSheet.getRange(j+1, 3).setValue(newGender); // Gender
          if (newPhotoUrl) dataSheet.getRange(j+1, 6).setValue(newPhotoUrl);
          dataSheet.getRange(j+1, 9).setValue(submittedBy); // Editor
          break;
        }
      }
    } else {
      // Add Child or Add Spouse
      const newNodeId = 'n_' + new Date().getTime();
      const type = (actionType === 'add-child') ? 'child' : 'spouse';
      
      dataSheet.appendRow([
        newNodeId, 
        newName, 
        newGender, 
        type, 
        targetNodeId, // LinkedTo
        newPhotoUrl, 
        'approved', 
        submittedBy, 
        submittedBy, 
        new Date()
      ]);
    }
  }

  // Remove from pending sheet regardless of Approve or Reject
  pendingSheet.deleteRow(targetRowIndex);

  return respondJSON({status: 'success', message: 'Tindakan berjaya dilaksanakan.'});
}

// 4. BANTUAN GOOGLE DRIVE (STORAN GAMBAR)
function uploadImageToDrive(base64Data, filename) {
  try {
    const folders = DriveApp.getFoldersByName("Salasilah_Images");
    let folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder("Salasilah_Images");
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    const splitBase = base64Data.split(',');
    const type = splitBase[0].split(';')[0].replace('data:', '');
    const byteCharacters = Utilities.base64Decode(splitBase[1]);
    const blob = Utilities.newBlob(byteCharacters, type, filename + '.jpg');
    
    const file = folder.createFile(blob);
    return file.getUrl(); // Save URL to Sheet
  } catch (e) {
    Logger.log("Drive Upload Error: " + e);
    return "";
  }
}
