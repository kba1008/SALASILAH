/**
 * Salasilah - Google Apps Script Backend
 * Sheets: SALASILAH, PENGGUNA
 * SALASILAH headers (row 1): id, nama, jantina, ayahId, ibuId, catatan, posX, posY, createdAt, updatedAt
 * PENGGUNA  headers (row 1): id, email, nama, peranan, salasilahId, createdAt, updatedAt
 */

const SS_NAME = 'SALASILAH';
const US_NAME = 'PENGGUNA';

function doGet(e)  { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch (_) {}
    }
    if (e && e.parameter) {
      Object.keys(e.parameter).forEach(function(k){ if (payload[k] === undefined) payload[k] = e.parameter[k]; });
    }
    var action = payload.action || (e && e.parameter && e.parameter.action) || '';

    switch (action) {
      case 'ping':            return ok_({ pong: true, time: new Date().toISOString() });
      case 'setup':           return ok_(setupSheets());
      case 'listSalasilah':   return ok_(listSalasilah());
      case 'addNode':         return ok_(addNode(payload));
      case 'updateNode':      return ok_(updateNode(payload));
      case 'deleteNode':      return ok_(deleteNode(payload));
      case 'setPositions':    return ok_(setPositions(payload));
      case 'updateMyProfile': return ok_(updateMyProfile(payload));
      case 'listPengguna':    return ok_(listPengguna());
      default: return err_('Tindakan tidak dikenali: ' + action);
    }
  } catch (err) {
    return err_(String(err && err.message || err));
  }
}

function ok_(data)  { return ContentService.createTextOutput(JSON.stringify({ ok:true,  data:data  })).setMimeType(ContentService.MimeType.JSON); }
function err_(msg)  { return ContentService.createTextOutput(JSON.stringify({ ok:false, error:msg })).setMimeType(ContentService.MimeType.JSON); }

function sh_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function setupSheets() {
  var ss = sh_(SS_NAME);
  var ssHeaders = ['id','nama','jantina','ayahId','ibuId','catatan','posX','posY','createdAt','updatedAt'];
  ensureHeaders_(ss, ssHeaders);

  var us = sh_(US_NAME);
  var usHeaders = ['id','email','nama','peranan','salasilahId','createdAt','updatedAt'];
  ensureHeaders_(us, usHeaders);

  return { salasilah: ssHeaders, pengguna: usHeaders };
}

function ensureHeaders_(sheet, headers) {
  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0 ? sheet.getRange(1,1,1,lastCol).getValues()[0] : [];
  var changed = false;
  headers.forEach(function(h, i){
    if (existing[i] !== h) { changed = true; }
  });
  if (changed || lastCol < headers.length) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  }
}

function readAll_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { headers: sheet.getRange(1,1,1,lastCol).getValues()[0], rows: [] };
  var values = sheet.getRange(1,1,lastRow,lastCol).getValues();
  var headers = values.shift();
  var rows = values.map(function(r){
    var o = {};
    headers.forEach(function(h, i){ o[h] = r[i]; });
    return o;
  });
  return { headers: headers, rows: rows };
}

function listSalasilah() {
  setupSheets();
  return readAll_(sh_(SS_NAME)).rows;
}

function listPengguna() {
  setupSheets();
  return readAll_(sh_(US_NAME)).rows;
}

function newId_() {
  return Utilities.getUuid();
}

function addNode(p) {
  setupSheets();
  var sh = sh_(SS_NAME);
  var now = new Date().toISOString();
  var id = p.id || newId_();
  var row = [
    id,
    p.nama || '',
    p.jantina || '',
    p.ayahId || '',
    p.ibuId || '',
    p.catatan || '',
    p.posX != null ? Number(p.posX) : '',
    p.posY != null ? Number(p.posY) : '',
    now,
    now
  ];
  sh.appendRow(row);
  return { id: id };
}

function findRowById_(sheet, id) {
  var data = readAll_(sheet);
  for (var i = 0; i < data.rows.length; i++) {
    if (String(data.rows[i].id) === String(id)) {
      return { rowIndex: i + 2, headers: data.headers, row: data.rows[i] };
    }
  }
  return null;
}

function updateNode(p) {
  setupSheets();
  if (!p.id) throw new Error('id diperlukan');
  var sh = sh_(SS_NAME);
  var found = findRowById_(sh, p.id);
  if (!found) throw new Error('Node tidak dijumpai: ' + p.id);
  var headers = found.headers;
  var current = found.row;
  ['nama','jantina','ayahId','ibuId','catatan','posX','posY'].forEach(function(k){
    if (p[k] !== undefined) current[k] = (k === 'posX' || k === 'posY') ? Number(p[k]) : p[k];
  });
  current.updatedAt = new Date().toISOString();
  var out = headers.map(function(h){ return current[h] == null ? '' : current[h]; });
  sh.getRange(found.rowIndex, 1, 1, headers.length).setValues([out]);
  return { id: p.id };
}

function deleteNode(p) {
  setupSheets();
  if (!p.id) throw new Error('id diperlukan');
  var sh = sh_(SS_NAME);
  var found = findRowById_(sh, p.id);
  if (!found) throw new Error('Node tidak dijumpai: ' + p.id);
  sh.deleteRow(found.rowIndex);
  return { id: p.id };
}

/**
 * setPositions
 * payload: { positions: [{id, posX, posY}, ...] }  ATAU  { items: [...] }
 */
function setPositions(p) {
  setupSheets();
  var list = p.positions || p.items || [];
  if (!Array.isArray(list)) throw new Error('positions mesti array');
  var sh = sh_(SS_NAME);
  var data = readAll_(sh);
  var headers = data.headers;
  var idxX = headers.indexOf('posX');
  var idxY = headers.indexOf('posY');
  var idxU = headers.indexOf('updatedAt');
  if (idxX < 0 || idxY < 0) {
    // tambah kolum jika belum ada
    ensureHeaders_(sh, ['id','nama','jantina','ayahId','ibuId','catatan','posX','posY','createdAt','updatedAt']);
    data = readAll_(sh);
    headers = data.headers;
    idxX = headers.indexOf('posX');
    idxY = headers.indexOf('posY');
    idxU = headers.indexOf('updatedAt');
  }
  var map = {};
  data.rows.forEach(function(r, i){ map[String(r.id)] = i + 2; });
  var now = new Date().toISOString();
  var updated = 0;
  list.forEach(function(it){
    var rowIndex = map[String(it.id)];
    if (!rowIndex) return;
    if (it.posX != null) sh.getRange(rowIndex, idxX + 1).setValue(Number(it.posX));
    if (it.posY != null) sh.getRange(rowIndex, idxY + 1).setValue(Number(it.posY));
    if (idxU >= 0) sh.getRange(rowIndex, idxU + 1).setValue(now);
    updated++;
  });
  return { updated: updated };
}

/**
 * updateMyProfile
 * payload: { email, nama?, ... }  -> update row PENGGUNA berdasarkan email
 */
function updateMyProfile(p) {
  setupSheets();
  if (!p.email) throw new Error('email diperlukan');
  var sh = sh_(US_NAME);
  var data = readAll_(sh);
  var headers = data.headers;
  var rowIndex = -1, current = null;
  for (var i = 0; i < data.rows.length; i++) {
    if (String(data.rows[i].email).toLowerCase() === String(p.email).toLowerCase()) {
      rowIndex = i + 2;
      current = data.rows[i];
      break;
    }
  }
  if (rowIndex < 0) throw new Error('Pengguna tidak dijumpai: ' + p.email);
  ['nama','peranan','salasilahId'].forEach(function(k){
    if (p[k] !== undefined) current[k] = p[k];
  });
  current.updatedAt = new Date().toISOString();
  var out = headers.map(function(h){ return current[h] == null ? '' : current[h]; });
  sh.getRange(rowIndex, 1, 1, headers.length).setValues([out]);
  return { email: p.email };
}
