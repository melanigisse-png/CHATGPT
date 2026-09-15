const SPREADSHEET_ID = '1hsxevRPuQyM0Y9fpgoqoWeyFQtIttWCA7IYliu5Hl08';
const EVIDENCE_FOLDER_NAME = 'COMET_EVIDENCIAS';

function doGet() {
  return json_({ok:true, service:'COMET QR V0.8', spreadsheetId:SPREADSHEET_ID});
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

    appendSummary_(summary, exec, realIncidents, evidenceUrls);
    appendFinalDetail_(ss.getSheetByName('DETALLE_FINAL_PUNTOS'), finalDetail, exec, evidenceUrls);
    appendRealIncidents_(ss.getSheetByName('INCIDENCIAS_REALES'), realIncidents, exec, evidenceUrls);

    SpreadsheetApp.flush();
    return json_({ok:true, executionId:exec.id, evidence:evidenceUrls});
  } catch (err) {
    return json_({ok:false, error:String(err && err.stack ? err.stack : err)});
  }
}

function executionExists_(sheet, id) {
  if (!sheet || sheet.getLastRow() < 2) return false;
  const headers = headerMap_(sheet);
  const col = headers.ID_EJECUCION;
  if (!col) return false;
  return !!sheet.getRange(2, col, sheet.getLastRow()-1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
}

function appendSummary_(sheet, x, incidents, evidenceUrls) {
  const start = new Date(x.started);
  const end = new Date(x.finished || new Date());
  const liberated = String(x.status || '').toUpperCase() === 'LIBERADA';
  const links = Object.keys(evidenceUrls).map(k => k + ': ' + evidenceUrls[k]).join(' | ');

  appendByHeaders_(sheet, {
    FECHA:start,
    HORA_INICIO:start,
    HORA_FIN:end,
    MAQUINA:x.machine || '',
    TURNO:x.shift || '',
    OPERADOR:x.operator || '',
    MATERIAL:x.material || '',
    SUPERVISOR:x.supervisor || '',
    DURACION_MIN:Number(x.durationMin || ((end-start)/60000) || 0),
    LIBERADA:liberated ? 'SI' : 'NO',
    ESTATUS_FINAL:liberated ? 'LIBERADA' : (x.status || 'NO LIBERADA'),
    FALLA_REAL:incidents.length ? 'SI' : 'NO',
    TOTAL_NG_REALES:incidents.length,
    OBSERVACION_GENERAL:x.generalObservation || '',
    EVIDENCIAS_URL:links,
    ID_EJECUCION:x.id
  });
}

function appendFinalDetail_(sheet, rows, exec, evidenceUrls) {
  if (!sheet || !rows.length) return;
  rows.forEach(r => appendByHeaders_(sheet, {
    FECHA_HORA:r.time ? new Date(r.time) : new Date(exec.finished || new Date()),
    MAQUINA:exec.machine || '',
    TURNO:exec.shift || '',
    OPERADOR:exec.operator || '',
    PUNTO:r.point || '',
    DESCRIPCION:r.description || '',
    VALOR:r.value === undefined ? '' : r.value,
    UNIDAD:r.unit || '',
    RESULTADO:r.result || '',
    EVIDENCIA_URL:evidenceUrls[r.point] || '',
    DURACION_SEG:Number(r.durationSec || 0),
    OBSERVACION:r.observation || '',
    ID_EJECUCION:exec.id
  }));
}

function appendRealIncidents_(sheet, rows, exec, evidenceUrls) {
  if (!sheet || !rows.length) return;
  rows.forEach(r => appendByHeaders_(sheet, {
    FECHA_HORA:new Date(r.detectedAt || exec.finished || new Date()),
    MAQUINA:exec.machine || '',
    TURNO:exec.shift || '',
    OPERADOR:exec.operator || '',
    PUNTO:r.point || '',
    DESCRIPCION_FALLA:r.description || '',
    VALOR_NG:r.value === undefined ? '' : r.value,
    UNIDAD:r.unit || '',
    HORA_CORRECCION:r.correctedAt ? new Date(r.correctedAt) : '',
    MTTR_MIN:r.mttrMin === '' || r.mttrMin === undefined ? '' : Number(r.mttrMin),
    ESTADO:r.correctedAt ? 'CERRADA' : 'ABIERTA',
    OBSERVACION:r.observation || '',
    EVIDENCIA_URL:evidenceUrls[r.point] || '',
    ID_EJECUCION:exec.id
  }));
}

function appendByHeaders_(sheet, obj) {
  const map = headerMap_(sheet);
  const width = sheet.getLastColumn();
  const row = new Array(width).fill('');
  Object.keys(obj).forEach(k => {
    const col = map[k];
    if (col) row[col-1] = obj[k];
  });
  sheet.appendRow(row);
}

function headerMap_(sheet) {
  const width = sheet.getLastColumn();
  if (!width) return {};
  const headers = sheet.getRange(1,1,1,width).getDisplayValues()[0];
  const map = {};
  headers.forEach((h,i) => { if (h) map[String(h).trim().toUpperCase()] = i+1; });
  return map;
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
