const SPREADSHEET_ID = '1hsxevRPuQyM0Y9fpgoqoWeyFQtIttWCA7IYliu5Hl08';
const EVIDENCE_FOLDER_NAME = 'COMET_EVIDENCIAS';

function doGet() {
  return json_({ok:true, service:'COMET QR V0.7', spreadsheetId:SPREADSHEET_ID});
}

function doPost(e) {
  try {
    const data = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (!data.execution || !data.execution.id) throw new Error('Payload sin execution.id');

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const exec = data.execution;
    const summary = ss.getSheetByName('RESUMEN_COMPACTO');
    if (!summary) throw new Error('No existe RESUMEN_COMPACTO');

    if (executionExists_(summary, exec.id)) {
      return json_({ok:true, duplicate:true, executionId:exec.id});
    }

    const evidenceUrls = saveEvidence_(data.photos || {}, exec.id);
    const finalDetail = data.finalDetail || latestByPoint_(data.detail || []);
    const realIncidents = data.realIncidents || data.incidents || [];

    appendSummary_(summary, exec, finalDetail, realIncidents, evidenceUrls);
    appendFinalDetail_(ss.getSheetByName('DETALLE_FINAL_PUNTOS'), finalDetail, exec, evidenceUrls);
    appendRealIncidents_(ss.getSheetByName('INCIDENCIAS_REALES'), realIncidents, exec, evidenceUrls);

    // Auditoría técnica: se conserva oculta/consultable, sin contaminar las vistas principales.
    appendAudit_(ss.getSheetByName('DETALLE_INSPECCION'), data.detail || [], exec, evidenceUrls);
    appendMeasurements_(ss.getSheetByName('MEDICIONES'), data.measurements || [], exec, evidenceUrls);

    SpreadsheetApp.flush();
    return json_({ok:true, executionId:exec.id, evidence:evidenceUrls});
  } catch (err) {
    return json_({ok:false, error:String(err && err.stack ? err.stack : err)});
  }
}

function executionExists_(sheet, id) {
  if (!sheet || sheet.getLastRow() < 2) return false;
  const range = sheet.getRange(2, 1, sheet.getLastRow()-1, 1);
  return !!range.createTextFinder(String(id)).matchEntireCell(true).findNext();
}

function appendSummary_(sheet, x, finalDetail, incidents, evidenceUrls) {
  const start = new Date(x.started);
  const end = new Date(x.finished || new Date());
  const liberated = String(x.status || '').toUpperCase() === 'LIBERADA';
  const realFailure = incidents.length > 0;
  const okCount = finalDetail.filter(r => r.result === 'OK' || r.result === 'N/A').length;
  const links = Object.keys(evidenceUrls).map(k => k + ': ' + evidenceUrls[k]).join(' | ');

  sheet.appendRow([
    x.id,
    start,
    start,
    end,
    x.machine || '',
    x.shift || '',
    x.operator || '',
    x.material || '',
    x.supervisor || '',
    Number(x.durationMin || ((end-start)/60000) || 0),
    liberated ? 'SI' : 'NO',
    liberated ? 'LIBERADA' : (x.status || 'NO LIBERADA'),
    realFailure ? 'SI' : 'NO',
    okCount,
    incidents.length,
    x.generalObservation || '',
    links,
    'SI'
  ]);
}

function appendFinalDetail_(sheet, rows, exec, evidenceUrls) {
  if (!sheet || !rows.length) return;
  const values = rows.map(r => [
    exec.id,
    r.time ? new Date(r.time) : new Date(exec.finished || new Date()),
    exec.machine || '',
    exec.shift || '',
    exec.operator || '',
    r.point || '',
    r.description || '',
    r.value === undefined ? '' : r.value,
    r.unit || '',
    r.result || '',
    evidenceUrls[r.point] || '',
    Number(r.durationSec || 0),
    r.observation || ''
  ]);
  sheet.getRange(sheet.getLastRow()+1,1,values.length,values[0].length).setValues(values);
}

function appendRealIncidents_(sheet, rows, exec, evidenceUrls) {
  if (!sheet || !rows.length) return;
  const values = rows.map(r => [
    r.id || ('I' + Date.now()),
    exec.id,
    new Date(r.detectedAt || exec.finished || new Date()),
    exec.machine || '',
    exec.shift || '',
    exec.operator || '',
    r.point || '',
    r.description || '',
    r.value === undefined ? '' : r.value,
    r.unit || '',
    r.correctedAt ? new Date(r.correctedAt) : '',
    r.mttrMin === '' || r.mttrMin === undefined ? '' : Number(r.mttrMin),
    r.correctedAt ? 'CERRADA' : 'ABIERTA',
    r.observation || '',
    evidenceUrls[r.point] || ''
  ]);
  sheet.getRange(sheet.getLastRow()+1,1,values.length,values[0].length).setValues(values);
}

function appendAudit_(sheet, rows, exec, evidenceUrls) {
  if (!sheet || !rows.length) return;
  const values = rows.map((r, idx) => [
    exec.id,
    r.time ? new Date(r.time) : new Date(exec.finished || new Date()),
    exec.machine || '',
    exec.shift || '',
    exec.operator || '',
    r.point || '',
    r.description || '',
    r.tag || '',
    r.type || '',
    r.value === undefined ? '' : r.value,
    r.unit || '',
    r.result || '',
    r.observation || '',
    evidenceUrls[r.point] || '',
    '', '', '',
    r.reinspection ? 'SI' : 'NO',
    idx + 1,
    'SI'
  ]);
  sheet.getRange(sheet.getLastRow()+1,1,values.length,values[0].length).setValues(values);
}

function appendMeasurements_(sheet, rows, exec, evidenceUrls) {
  if (!sheet || !rows.length) return;
  const values = rows.map(r => [
    exec.id,
    r.time ? new Date(r.time) : new Date(exec.finished || new Date()),
    exec.machine || '',
    exec.shift || '',
    exec.operator || '',
    r.point || '',
    r.variable || '',
    r.value === undefined ? '' : r.value,
    r.unit || '',
    r.min === undefined ? '' : r.min,
    r.max === undefined ? '' : r.max,
    r.target === undefined ? '' : r.target,
    r.result || '',
    'PUESTA A PUNTO',
    evidenceUrls[r.point] || '',
    r.observation || ''
  ]);
  sheet.getRange(sheet.getLastRow()+1,1,values.length,values[0].length).setValues(values);
}

function latestByPoint_(rows) {
  const map = {};
  rows.forEach(r => { if (r.point) map[r.point] = r; });
  return Object.keys(map).sort(pointSort_).map(k => map[k]);
}

function pointSort_(a,b) {
  const aa = String(a).split('.').map(Number), bb = String(b).split('.').map(Number);
  return (aa[0]-bb[0]) || ((aa[1]||0)-(bb[1]||0));
}

function saveEvidence_(photos, executionId) {
  const out = {};
  const keys = Object.keys(photos || {});
  if (!keys.length) return out;
  const folder = getEvidenceFolder_();
  keys.forEach(point => {
    const dataUrl = photos[point];
    if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('base64,') < 0) return;
    const parts = dataUrl.split('base64,');
    const mime = (parts[0].match(/data:([^;]+)/) || [,'image/jpeg'])[1];
    const bytes = Utilities.base64Decode(parts[1]);
    const name = executionId + '_' + String(point).replace('.', '-') + '.jpg';
    const file = folder.createFile(Utilities.newBlob(bytes, mime, name));
    out[point] = file.getUrl();
  });
  return out;
}

function getEvidenceFolder_() {
  const folders = DriveApp.getFoldersByName(EVIDENCE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(EVIDENCE_FOLDER_NAME);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
