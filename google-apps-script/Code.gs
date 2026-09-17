const SPREADSHEET_ID = '1hsxevRPuQyM0Y9fpgoqoWeyFQtIttWCA7IYliu5Hl08';
const EVIDENCE_FOLDER_NAME = 'COMET_EVIDENCIAS';

function doGet() {
  return json_({ok:true, service:'COMET QR V0.12', spreadsheetId:SPREADSHEET_ID});
}

function doPost(e) {
  try {
    const data = JSON.parse((e.postData && e.postData.contents) || '{}');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const type = String(data.type || '').toUpperCase();

    if (type === 'FOLLOWUP') {
      appendFollowup_(ss.getSheetByName('COMPROBACIONES'), data.followup || {});
      SpreadsheetApp.flush();
      return json_({ok:true, type:'FOLLOWUP'});
    }

    if (type === 'UPDATE_EXECUTION') {
      const result = updateExecution_(ss, data.update || {});
      SpreadsheetApp.flush();
      return json_({ok:true, type:'UPDATE_EXECUTION', result:result});
    }

    if (!data.execution || !data.execution.id) throw new Error('Payload sin execution.id');

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

    let whatsapp = {requested:false, sent:false};
    if (data.supervisorAlert && String(data.supervisorAlert.channel || '').toUpperCase() === 'WHATSAPP') {
      whatsapp = sendSupervisorWhatsApp_(data.supervisorAlert);
    }

    SpreadsheetApp.flush();
    return json_({ok:true, executionId:exec.id, evidence:evidenceUrls, whatsapp:whatsapp});
  } catch (err) {
    return json_({ok:false, error:String(err && err.stack ? err.stack : err)});
  }
}

function appendFollowup_(sheet, f) {
  if (!sheet) throw new Error('No existe COMPROBACIONES');
  if (!f.executionId) throw new Error('Comprobación sin ID_EJECUCION');
  const actual = f.actualAt ? new Date(f.actualAt) : new Date();
  appendByHeaders_(sheet, {
    FECHA_HORA: actual,
    MAQUINA: f.machine || '',
    HORA_PROGRAMADA: f.scheduledTime || '',
    HORA_REAL: actual,
    RETRASO_MIN: Number(f.delayMin || 0),
    OPERADOR: f.operator || '',
    RESULTADO: f.result || '',
    OBSERVACION: f.observation || '',
    ID_EJECUCION: f.executionId,
    SINCRONIZADO: 'SI'
  });
}

function updateExecution_(ss, u) {
  if (!u.executionId) throw new Error('Actualización sin executionId');
  const summary = ss.getSheetByName('RESUMEN_COMPACTO');
  if (!summary) throw new Error('No existe RESUMEN_COMPACTO');

  ensureHeaders_(summary, [
    'HORA_LIBERACION','SUPERVISOR_AUTORIZA','ESTADO_SEGUIMIENTO',
    'OBSERVACION_CORRECCION','EVIDENCIA_CORRECCION_URL'
  ]);

  const summaryRow = findRowById_(summary, u.executionId);
  if (!summaryRow) throw new Error('No se encontró la ejecución ' + u.executionId);

  const evidenceUrls = saveEvidence_(u.photos || {}, u.executionId + '_SEGUIMIENTO');
  const correctionEvidence = evidenceUrls['CORRECCION_' + String(u.point || '')] || '';
  const status = String(u.status || 'EN SEGUIMIENTO');
  const releasedAt = u.releasedAt ? new Date(u.releasedAt) : null;
  const trackingAt = u.trackingStartedAt ? new Date(u.trackingStartedAt) : null;
  const liberated = !!u.liberated;

  const sumMap = headerMap_(summary);
  const previousObs = sumMap.OBSERVACION_GENERAL ? String(summary.getRange(summaryRow, sumMap.OBSERVACION_GENERAL).getDisplayValue() || '') : '';
  const correctionObs = String(u.correctionObservation || '');
  let generalObs = previousObs;
  if (status === 'EN SEGUIMIENTO' && trackingAt) {
    const txt = 'Seguimiento iniciado: ' + Utilities.formatDate(trackingAt, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    if (generalObs.indexOf(txt) < 0) generalObs = (generalObs ? generalObs + ' | ' : '') + txt;
  }
  if (liberated && correctionObs) {
    const txt = 'Corrección: ' + correctionObs;
    if (generalObs.indexOf(txt) < 0) generalObs = (generalObs ? generalObs + ' | ' : '') + txt;
  }

  const updateObj = {
    LIBERADA: liberated ? 'SI' : 'NO',
    ESTATUS_FINAL: status,
    ESTADO_SEGUIMIENTO: liberated ? 'LIBERADA' : status,
    OBSERVACION_GENERAL: generalObs,
    OBSERVACION_CORRECCION: correctionObs,
    SUPERVISOR_AUTORIZA: u.supervisorAuthorized || '',
    EVIDENCIA_CORRECCION_URL: correctionEvidence
  };

  if (releasedAt) {
    updateObj.HORA_FIN = releasedAt;
    updateObj.HORA_LIBERACION = releasedAt;
    if (sumMap.HORA_INICIO) {
      const start = summary.getRange(summaryRow, sumMap.HORA_INICIO).getValue();
      if (start instanceof Date && !isNaN(start.getTime())) {
        updateObj.DURACION_MIN = Math.round(((releasedAt - start) / 60000) * 100) / 100;
      }
    }
  }
  setRowByHeaders_(summary, summaryRow, updateObj);

  const incidents = ss.getSheetByName('INCIDENCIAS_REALES');
  if (incidents) {
    ensureHeaders_(incidents, ['SUPERVISOR_AUTORIZA','ESTADO_SEGUIMIENTO','EVIDENCIA_CORRECCION_URL']);
    const rows = findRowsByExecution_(incidents, u.executionId, u.point || '');
    rows.forEach(row => {
      const map = headerMap_(incidents);
      const prev = map.OBSERVACION ? String(incidents.getRange(row, map.OBSERVACION).getDisplayValue() || '') : '';
      let obs = prev;
      if (correctionObs && obs.indexOf(correctionObs) < 0) obs = (obs ? obs + ' | ' : '') + 'Corrección: ' + correctionObs;
      const obj = {
        ESTADO: liberated ? 'CERRADA' : 'ABIERTA',
        ESTADO_SEGUIMIENTO: liberated ? 'LIBERADA' : status,
        SUPERVISOR_AUTORIZA: u.supervisorAuthorized || '',
        OBSERVACION: obs,
        EVIDENCIA_CORRECCION_URL: correctionEvidence
      };
      if (releasedAt) {
        obj.HORA_CORRECCION = releasedAt;
        if (u.mttrMin !== '' && u.mttrMin !== undefined && u.mttrMin !== null) obj.MTTR_MIN = Number(u.mttrMin);
      }
      setRowByHeaders_(incidents, row, obj);
    });
  }

  return {
    executionId:u.executionId,
    status:status,
    liberated:liberated,
    evidence:evidenceUrls
  };
}

function executionExists_(sheet, id) {
  return !!findRowById_(sheet, id);
}

function findRowById_(sheet, id) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const headers = headerMap_(sheet);
  const col = headers.ID_EJECUCION;
  if (!col) return 0;
  const found = sheet.getRange(2, col, sheet.getLastRow()-1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}

function findRowsByExecution_(sheet, id, point) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const map = headerMap_(sheet), idCol = map.ID_EJECUCION, pointCol = map.PUNTO;
  if (!idCol) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow()-1, sheet.getLastColumn()).getDisplayValues();
  const rows = [];
  values.forEach((r,i) => {
    if (String(r[idCol-1]) !== String(id)) return;
    if (point && pointCol && String(r[pointCol-1]) !== String(point)) return;
    rows.push(i+2);
  });
  return rows;
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
  rows.forEach(r => {
    const failureEvidence = evidenceUrls['FALLA_' + String(r.point || '')] || '';
    const evidence = String(r.result || '').toUpperCase() === 'NG' ? (failureEvidence || evidenceUrls[r.point] || '') : (evidenceUrls[r.point] || '');
    let observation = r.observation || '';
    if (String(r.result || '').toUpperCase() === 'NG' && observation.indexOf('Máquina:') < 0) {
      observation = 'Máquina: ' + (exec.machine || '') + (observation ? ' · ' + observation : '');
    }
    appendByHeaders_(sheet, {
      FECHA_HORA:r.time ? new Date(r.time) : new Date(exec.finished || new Date()),
      MAQUINA:exec.machine || '',
      TURNO:exec.shift || '',
      OPERADOR:exec.operator || '',
      PUNTO:r.point || '',
      DESCRIPCION:r.description || '',
      VALOR:r.value === undefined ? '' : r.value,
      UNIDAD:r.unit || '',
      RESULTADO:r.result || '',
      EVIDENCIA_URL:evidence,
      DURACION_SEG:Number(r.durationSec || 0),
      OBSERVACION:observation,
      ID_EJECUCION:exec.id
    });
  });
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
    EVIDENCIA_URL:evidenceUrls['FALLA_' + String(r.point || '')] || evidenceUrls[r.point] || '',
    ID_EJECUCION:exec.id
  }));
}

function sendSupervisorWhatsApp_(alertData) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('WHATSAPP_TOKEN') || '';
  const phoneNumberId = props.getProperty('WHATSAPP_PHONE_NUMBER_ID') || '';
  const graphVersion = props.getProperty('WHATSAPP_GRAPH_VERSION') || 'v23.0';
  const templateName = props.getProperty('WHATSAPP_TEMPLATE_NAME') || '';
  const languageCode = props.getProperty('WHATSAPP_TEMPLATE_LANGUAGE') || 'es_MX';

  if (!token || !phoneNumberId) {
    return {requested:true, sent:false, error:'WHATSAPP_NOT_CONFIGURED'};
  }

  let to = String(alertData.phone || '').replace(/\D/g, '');
  if (to.length === 10) to = '52' + to;
  if (!to) return {requested:true, sent:false, error:'WHATSAPP_PHONE_EMPTY'};

  const message = String(alertData.message || 'Alerta de puesta a punto COMET');
  let body;
  if (templateName) {
    body = {
      messaging_product:'whatsapp',
      to:to,
      type:'template',
      template:{
        name:templateName,
        language:{code:languageCode},
        components:[{type:'body', parameters:[{type:'text', text:message}]}]
      }
    };
  } else {
    body = {
      messaging_product:'whatsapp',
      recipient_type:'individual',
      to:to,
      type:'text',
      text:{preview_url:false, body:message}
    };
  }

  const url = 'https://graph.facebook.com/' + graphVersion + '/' + encodeURIComponent(phoneNumberId) + '/messages';
  const res = UrlFetchApp.fetch(url, {
    method:'post',
    contentType:'application/json',
    headers:{Authorization:'Bearer ' + token},
    payload:JSON.stringify(body),
    muteHttpExceptions:true
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  return {requested:true, sent:code >= 200 && code < 300, httpCode:code, response:text.slice(0,500)};
}

function ensureHeaders_(sheet, headers) {
  if (!sheet) return;
  let map = headerMap_(sheet);
  let col = Math.max(1, sheet.getLastColumn());
  headers.forEach(h => {
    const key = String(h).trim().toUpperCase();
    if (!map[key]) {
      col++;
      sheet.getRange(1, col).setValue(h);
      map[key] = col;
    }
  });
}

function setRowByHeaders_(sheet, rowNumber, obj) {
  const map = headerMap_(sheet);
  Object.keys(obj).forEach(k => {
    const col = map[String(k).trim().toUpperCase()];
    if (col) sheet.getRange(rowNumber, col).setValue(obj[k]);
  });
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
    const safePoint = String(point).replace(/[^A-Za-z0-9_.-]/g, '-').replace(/\./g, '-');
    const name = executionId + '_' + safePoint + '.jpg';
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
