const SPREADSHEET_ID = '1hsxevRPuQyM0Y9fpgoqoWeyFQtIttWCA7IYliu5Hl08';
const EVIDENCE_FOLDER_NAME = 'COMET_EVIDENCIAS';

function doGet() {
  return json_({ok:true, service:'COMET QR V0.6', spreadsheetId:SPREADSHEET_ID});
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    if (!data.execution || !data.execution.id) throw new Error('Payload sin execution.id');

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const exec = data.execution;
    const main = ss.getSheetByName('PUESTAS_A_PUNTO');

    if (executionExists_(main, exec.id)) {
      return json_({ok:true, duplicate:true, executionId:exec.id});
    }

    const evidenceUrls = saveEvidence_(data.photos || {}, exec.id);
    appendExecution_(main, exec);
    appendDetail_(ss.getSheetByName('DETALLE_INSPECCION'), data.detail || [], exec, evidenceUrls);
    appendIncidents_(ss.getSheetByName('INCIDENCIAS'), data.incidents || [], exec, evidenceUrls);
    appendMeasurements_(ss.getSheetByName('MEDICIONES'), data.measurements || [], exec, evidenceUrls);

    SpreadsheetApp.flush();
    return json_({ok:true, executionId:exec.id, evidence:evidenceUrls});
  } catch (err) {
    return json_({ok:false, error:String(err && err.stack ? err.stack : err)});
  }
}

function executionExists_(sheet, id) {
  if (sheet.getLastRow() < 2) return false;
  const range = sheet.getRange(2, 1, sheet.getLastRow()-1, 1);
  return !!range.createTextFinder(String(id)).matchEntireCell(true).findNext();
}

function appendExecution_(sheet, x) {
  const start = new Date(x.started);
  const end = new Date(x.finished);
  sheet.appendRow([
    x.id,
    start,
    x.machine,
    x.shift,
    x.operator,
    x.employee,
    x.material,
    x.supervisor,
    start,
    end,
    Number(x.durationMin || 0),
    Number(x.totalNg || 0),
    x.status || '',
    followupStatus_(x.followups, '12:00'),
    followupStatus_(x.followups, '15:30'),
    'SI'
  ]);
}

function appendDetail_(sheet, rows, exec, evidenceUrls) {
  if (!rows.length) return;
  const values = rows.map(r => [
    exec.id,
    r.time ? new Date(r.time) : new Date(exec.finished),
    exec.machine,
    exec.shift,
    exec.operator,
    r.point,
    r.description || '',
    r.tag || '',
    r.type || '',
    r.value === undefined ? '' : r.value,
    r.unit || '',
    r.result || '',
    r.observation || '',
    evidenceUrls[r.point] || '',
    '',
    '',
    '',
    'NO',
    1,
    'SI'
  ]);
  sheet.getRange(sheet.getLastRow()+1, 1, values.length, values[0].length).setValues(values);
}

function appendIncidents_(sheet, rows, exec, evidenceUrls) {
  if (!rows.length) return;
  const values = rows.map(r => [
    r.id || ('I' + new Date(r.detectedAt || Date.now()).getTime()),
    exec.id,
    new Date(r.detectedAt || exec.finished),
    exec.machine,
    exec.shift,
    exec.operator,
    r.point,
    r.description || '',
    r.value === undefined ? '' : r.value,
    r.unit || '',
    r.detectedAt ? new Date(r.detectedAt) : '',
    r.correctedAt ? new Date(r.correctedAt) : '',
    r.mttrMin === '' || r.mttrMin === undefined ? '' : Number(r.mttrMin),
    r.observation || '',
    evidenceUrls[r.point] || '',
    r.finalResult || '',
    r.correctedAt ? 'CERRADA' : 'ABIERTA',
    exec.operator
  ]);
  sheet.getRange(sheet.getLastRow()+1, 1, values.length, values[0].length).setValues(values);
}

function appendMeasurements_(sheet, rows, exec, evidenceUrls) {
  if (!rows.length) return;
  const values = rows.map(r => [
    exec.id,
    r.time ? new Date(r.time) : new Date(exec.finished),
    exec.machine,
    exec.shift,
    exec.operator,
    r.point,
    r.variable || '',
    r.value === undefined ? '' : r.value,
    r.unit || '',
    r.min === undefined ? '' : r.min,
    r.max === undefined ? '' : r.max,
    r.target === undefined ? '' : r.target,
    r.result || '',
    'PUESTA A PUNTO',
    evidenceUrls[r.point] || '',
    ''
  ]);
  sheet.getRange(sheet.getLastRow()+1, 1, values.length, values[0].length).setValues(values);
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

function followupStatus_(rows, time) {
  const r = (rows || []).find(x => x.time === time);
  return r ? (r.status || '') : '';
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
