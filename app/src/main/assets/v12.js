(function(){
'use strict';

const CFG_KEY='cometqr_admin_config_v09';
const PIN_KEY='cometqr_admin_pin_v09';
const OPEN_FAILURES_KEY='cometqr_open_failures_v12';
const FAILURE_NOTICE_MS=8000;
const DEFAULT_WHATSAPP='7774924650';

function q(id){return document.getElementById(id)}
function esc12(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}
function cfg12(){try{return JSON.parse(localStorage.getItem(CFG_KEY)||'{}')}catch(e){return {}}}
function pin12(){return localStorage.getItem(PIN_KEY)||'1234'}
function loadOpen(){try{return JSON.parse(localStorage.getItem(OPEN_FAILURES_KEY)||'[]')}catch(e){return []}}
function saveOpen(v){localStorage.setItem(OPEN_FAILURES_KEY,JSON.stringify(v||[]))}
function upsertOpen(rec){const a=loadOpen();const i=a.findIndex(x=>x.executionId===rec.executionId);if(i>=0)a[i]=rec;else a.unshift(rec);saveOpen(a)}
function removeOpen(id){saveOpen(loadOpen().filter(x=>x.executionId!==id))}
function localHistory(){try{return loadHistory()}catch(e){return JSON.parse(localStorage.getItem('cometqr_history')||'[]')}}
function writeHistory(h){try{setHistory(h)}catch(e){localStorage.setItem('cometqr_history',JSON.stringify(h))}}

function installExtendedSplash(){
  if(q('v12StartupOverlay'))return;
  const o=document.createElement('div');
  o.id='v12StartupOverlay';
  o.style='position:fixed;inset:0;z-index:99999;background:#f8f3ea;display:flex;align-items:center;justify-content:center;padding:28px;text-align:center';
  o.innerHTML='<div><img src="app_icon.webp" style="width:230px;height:230px;object-fit:cover;border-radius:28px;margin-bottom:26px" onerror="this.style.display=\'none\'"><div style="font-size:28px;font-weight:800;color:#20242a">Puesta a Punto COMET</div><div style="font-size:15px;font-weight:800;letter-spacing:.12em;color:#b85710;margin-top:14px">POWERED BY IVAN AVILES</div><div style="font-size:13px;color:#667085;margin-top:18px">Inicializando sistema...</div></div>';
  document.body.appendChild(o);
  setTimeout(()=>{o.style.transition='opacity .3s';o.style.opacity='0';setTimeout(()=>o.remove(),320)},3500);
}

function patchBrand(){
  const small=document.querySelector('.top small');
  if(small)small.textContent='V0.12.0 · seguimiento de fallas · autorización de supervisor · operación real';
}

function failurePhotoKey(point){return 'FALLA_'+String(point)}
function correctionPhotoKey(point){return 'CORRECCION_'+String(point)}
function incidentFor(point){return (state?.realIncidents||[]).find(i=>i.point===point&&!i.correctedAt)}

function startFailureEvidence(point){
  if(!state||!state.answers||!state.answers[point])return;
  const a=state.answers[point],d=defs[point]||{};
  a.result='NG';a.confirmedFailure=true;
  const now=new Date().toISOString();
  state.realIncidents=state.realIncidents||[];
  let inc=incidentFor(point);
  if(!inc){
    inc={id:'I'+Date.now(),point,description:d.t||'',value:a.value,unit:d.unit||'',detectedAt:now,correctedAt:'',mttrMin:'',observation:'',finalResult:'NG'};
    state.realIncidents.push(inc);
  }
  state.failedPoint=point;
  state.status='FALLA PENDIENTE DE EVIDENCIA';
  state.failureConfirmedAt=now;
  saveActive();
  renderFailureEvidence(point);
}

function renderFailureEvidence(point){
  const run=q('run'),setup=q('setup'),finish=q('finish');
  if(run)run.classList.add('hidden');if(setup)setup.classList.add('hidden');
  if(!finish)return;
  const d=defs[point]||{},key=failurePhotoKey(point);
  const ready=!!(state?.photos&&state.photos[key]);
  finish.classList.remove('hidden');
  finish.innerHTML=`<h2 style="color:#b42318">⚠ FALLA REAL CONFIRMADA</h2>
    <div class="err"><b>COMET ${Number(state.machine)} · Punto ${esc12(point)}</b><br>${esc12(d.t||'')}<br><br>La máquina queda bloqueada y NO puede liberarse hasta corregir la condición.</div>
    <label>Evidencia fotográfica obligatoria de la falla</label>
    <input id="v12FailurePhoto" type="file" accept="image/*" capture="environment">
    <div id="v12FailurePhotoState" class="small ${ready?'':'muted'}" style="margin-top:6px">${ready?'✓ Evidencia de falla guardada':'Toma una fotografía antes de cerrar la puesta a punto.'}</div>
    <label>Observación de la falla</label>
    <textarea id="v12FailureObs" placeholder="Describe brevemente la condición encontrada">${esc12(incidentFor(point)?.observation||'')}</textarea>
    <button class="btn bad" id="v12CloseFailure" style="margin-top:10px" ${ready?'':'disabled'}>REGISTRAR FALLA Y CERRAR PUESTA A PUNTO</button>`;
  const input=q('v12FailurePhoto');
  input.onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    q('v12FailurePhotoState').textContent='Procesando fotografía...';
    try{
      state.photos=state.photos||{};
      state.photos[key]=await compressImage(f);
      q('v12FailurePhotoState').textContent='✓ Evidencia de falla guardada';
      q('v12CloseFailure').disabled=false;
      saveActive();
    }catch(_){q('v12FailurePhotoState').textContent='No se pudo procesar la fotografía.'}
  };
  q('v12CloseFailure').onclick=()=>finalizeFailure(point);
}

function buildFailurePayload(point){
  const c=cfg12(),machine='COMET '+Number(state.machine),inc=incidentFor(point)||{};
  const finalDetail=Object.entries(state.answers||{}).map(([p,a])=>({
    time:a.time||state.finished,
    point:p,
    description:defs[p]?.t||'',
    value:a.value,
    unit:a.unit||defs[p]?.unit||'',
    result:a.result==='N/A'?'N/A':(a.result==='NG'?'NG':(a.result==='OK'?'OK':'PENDIENTE')),
    observation:a.result==='NG'?`Máquina: ${machine} · ${inc.observation||'Falla real confirmada durante la puesta a punto.'}`:'',
    durationSec:0
  }));
  const measurements=(state.attempts||[]).filter(a=>['1.3','1.4','2.3'].includes(a.point)).map(a=>{
    const d=defs[a.point]||{};return{time:a.time,point:a.point,variable:d.t||'',value:a.value,unit:d.unit||'',min:d.min,max:d.max,target:d.exact,result:a.result==='OK'?'OK':'CAPTURA_FUERA_RANGO'};
  });
  const number=String(c.supervisorWhatsapp||DEFAULT_WHATSAPP).replace(/\D/g,'');
  const msg=`ALERTA COMET\nFalla real confirmada en ${machine}.\nOperador: ${state.operator}.\nTurno: ${state.shift}.\nPunto: ${point} - ${defs[point]?.t||''}.\nValor/condición: ${inc.value??state.answers?.[point]?.value??''}${inc.unit?' '+inc.unit:''}.\nLa máquina NO queda liberada para operación.`;
  return{
    execution:{id:state.id,started:state.started,finished:state.finished,machine,shift:state.shift,operator:state.operator,employee:state.employee,material:state.material,supervisor:state.supervisor,durationMin:state.durationMin,status:state.status,followups:[],signature:'',generalObservation:state.generalObservation||''},
    finalDetail,
    detail:state.attempts||[],
    realIncidents:state.realIncidents||[],
    measurements,
    photos:state.photos||{},
    supervisorAlert:{channel:'WHATSAPP',phone:number,message:msg,automatic:true,point,machine,operator:state.operator}
  };
}

function finalizeFailure(point){
  const key=failurePhotoKey(point);
  if(!state?.photos?.[key]){alert('La fotografía de la falla es obligatoria.');return}
  const inc=incidentFor(point),obs=(q('v12FailureObs')?.value||'').trim();
  if(inc)inc.observation=obs||'Falla real confirmada durante la puesta a punto.';
  const now=new Date().toISOString();
  state.status='NO LIBERADA POR FALLA';
  state.finished=now;
  state.durationMin=Math.round(((new Date(now)-new Date(state.started))/60000)*100)/100;
  state.generalObservation=`Máquina: COMET ${Number(state.machine)} · Puesta a punto interrumpida por falla real en ${point}: ${defs[point]?.t||''}`;
  state.followups=[];
  const openRec={
    executionId:state.id,machine:'COMET '+Number(state.machine),machineCode:state.machine,shift:state.shift,operator:state.operator,employee:state.employee,material:state.material,supervisor:state.supervisor,
    point,description:defs[point]?.t||'',value:state.answers?.[point]?.value,unit:state.answers?.[point]?.unit||defs[point]?.unit||'',detectedAt:inc?.detectedAt||state.failureConfirmedAt||now,
    failedAt:now,started:state.started,status:'NO LIBERADA POR FALLA',incidentId:inc?.id||'',trackingStartedAt:'',releasedAt:'',supervisorAuthorized:'',correctionObservation:''
  };
  upsertOpen(openRec);
  saveActive();
  const payload=buildFailurePayload(point);
  archive(true);
  queuePayload(payload);
  sendPending();
  showFailureNotice(point,openRec.machine);
}

function showFailureNotice(point,machine){
  const finish=q('finish'),run=q('run'),setup=q('setup');
  if(run)run.classList.add('hidden');if(setup)setup.classList.add('hidden');
  if(finish){
    finish.classList.remove('hidden');
    finish.innerHTML=`<h2 style="color:#b42318">⚠ MÁQUINA NO LIBERADA</h2><div class="err"><b>${esc12(machine)} · Falla real en el punto ${esc12(point)}</b><br><br>La puesta a punto fue detenida. La condición debe corregirse y posteriormente requiere autorización del supervisor para liberar la máquina.<br><br>Este aviso se cerrará automáticamente.</div><div class="syncbox">Registrando la puesta a punto y la incidencia...</div>`;
  }
  setTimeout(()=>{
    if(typeof home==='function')home();
    setTimeout(renderFollowups,80);
  },FAILURE_NOTICE_MS);
}

function restorePendingEvidence(){
  if(typeof state==='undefined'||state)return false;
  let saved=null;try{saved=JSON.parse(localStorage.getItem('cometqr_active')||'null')}catch(e){}
  if(!saved||saved.status!=='FALLA PENDIENTE DE EVIDENCIA')return false;
  state=saved;
  renderFailureEvidence(saved.failedPoint);
  return true;
}

function updateHistoryStatus(rec,status,extra){
  const h=localHistory();const row=h.find(x=>x.id===rec.executionId);
  if(row){
    row.status=status;
    row.supervisorAuthorized=extra?.supervisorAuthorized||row.supervisorAuthorized||'';
    row.releasedAt=extra?.releasedAt||row.releasedAt||'';
    row.correctionObservation=extra?.correctionObservation||row.correctionObservation||'';
    const inc=(row.realIncidents||[]).find(i=>i.id===rec.incidentId||i.point===rec.point);
    if(inc&&extra?.releasedAt){inc.correctedAt=extra.releasedAt;inc.mttrMin=extra.mttrMin;inc.finalResult='OK';inc.observation=extra.correctionObservation||inc.observation}
    writeHistory(h);
  }
}

function queueExecutionUpdate(rec,status,extra){
  const payload={
    type:'UPDATE_EXECUTION',
    execution:{id:'U'+rec.executionId+'-'+Date.now()},
    update:{
      executionId:rec.executionId,
      status,
      liberated:!!extra?.liberated,
      trackingStartedAt:extra?.trackingStartedAt||'',
      correctedAt:extra?.releasedAt||'',
      releasedAt:extra?.releasedAt||'',
      supervisorAuthorized:extra?.supervisorAuthorized||'',
      correctionObservation:extra?.correctionObservation||'',
      mttrMin:extra?.mttrMin??'',
      point:rec.point,
      incidentId:rec.incidentId||'',
      machine:rec.machine,
      photos:extra?.photos||{}
    }
  };
  queuePayload(payload);sendPending();
}

function markTracking(rec){
  if(rec.trackingStartedAt)return rec;
  rec.trackingStartedAt=new Date().toISOString();
  rec.status='EN SEGUIMIENTO';
  upsertOpen(rec);
  updateHistoryStatus(rec,'EN SEGUIMIENTO',{trackingStartedAt:rec.trackingStartedAt});
  queueExecutionUpdate(rec,'EN SEGUIMIENTO',{liberated:false,trackingStartedAt:rec.trackingStartedAt});
  return rec;
}

function renderFollowups(){
  const setup=q('setup');if(!setup)return;
  let box=q('v12FollowupBlock');
  const rows=loadOpen();
  if(!rows.length){if(box)box.remove();return}
  if(!box){box=document.createElement('div');box.id='v12FollowupBlock';box.style='margin-top:14px';const sync=q('syncHome');if(sync&&sync.parentNode)sync.parentNode.insertBefore(box,sync);else setup.appendChild(box)}
  box.innerHTML=`<div class="warnbox"><b>⚠ FALLAS PENDIENTES DE LIBERACIÓN</b><br>Estas máquinas requieren seguimiento y autorización del supervisor antes de liberarse.</div>`+
    rows.map(r=>`<div class="item"><h3>${esc12(r.machine)} · Punto ${esc12(r.point)}</h3><div class="desc">${esc12(r.description)}<br>Operador: ${esc12(r.operator)} · Estado: <b>${esc12(r.status||'NO LIBERADA')}</b></div><button class="btn warn" onclick="window.v12OpenFollowup('${esc12(r.executionId)}')">DAR SEGUIMIENTO A FALLA / LIBERACIÓN</button></div>`).join('');
}

window.v12OpenFollowup=function(executionId){
  let rec=loadOpen().find(x=>x.executionId===executionId);if(!rec)return;
  rec=markTracking(rec);
  const setup=q('setup');if(setup)setup.classList.add('hidden');
  let panel=q('v12FollowupPanel');
  if(!panel){panel=document.createElement('section');panel.id='v12FollowupPanel';panel.className='card';document.querySelector('.wrap').appendChild(panel)}
  panel.classList.remove('hidden');
  panel.innerHTML=`<h2>Seguimiento de falla / liberación</h2>
    <div class="warnbox"><b>${esc12(rec.machine)} · Punto ${esc12(rec.point)}</b><br>${esc12(rec.description)}<br>Valor/condición NG: ${esc12(rec.value??'')} ${esc12(rec.unit||'')}<br>Detectada: ${new Date(rec.detectedAt).toLocaleString()}</div>
    <label>Descripción de la corrección realizada</label><textarea id="v12CorrectionObs" placeholder="Describe qué se corrigió"></textarea>
    <label>Evidencia fotográfica de la corrección</label><input id="v12CorrectionPhoto" type="file" accept="image/*" capture="environment"><div id="v12CorrectionPhotoState" class="small muted"></div>
    <label>Supervisor que autoriza</label><input id="v12SupervisorName" value="${esc12(rec.supervisor||cfg12().supervisor||'ALMA VILLA')}">
    <label>PIN de supervisor / administrador</label><input id="v12SupervisorPin" type="password" inputmode="numeric" placeholder="PIN">
    <button class="btn good" id="v12AuthorizeRelease" style="margin-top:10px">AUTORIZAR Y LIBERAR MÁQUINA</button>
    <button class="btn secondary" id="v12FollowupBack" style="margin-top:8px">VOLVER</button>`;
  let correctionPhoto='';
  q('v12CorrectionPhoto').onchange=async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;q('v12CorrectionPhotoState').textContent='Procesando fotografía...';try{correctionPhoto=await compressImage(f);q('v12CorrectionPhotoState').textContent='✓ Evidencia de corrección lista'}catch(_){q('v12CorrectionPhotoState').textContent='No se pudo procesar la fotografía'}};
  q('v12FollowupBack').onclick=()=>{panel.classList.add('hidden');if(setup)setup.classList.remove('hidden');renderFollowups()};
  q('v12AuthorizeRelease').onclick=()=>{
    const obs=(q('v12CorrectionObs').value||'').trim(),sup=(q('v12SupervisorName').value||'').trim(),pin=(q('v12SupervisorPin').value||'').trim();
    if(!obs){alert('Describe la corrección realizada.');return}
    if(!sup){alert('Indica el supervisor que autoriza.');return}
    if(pin!==pin12()){alert('PIN de supervisor incorrecto.');return}
    const releasedAt=new Date().toISOString();
    const mttrMin=Math.round(((new Date(releasedAt)-new Date(rec.detectedAt))/60000)*100)/100;
    rec.status='LIBERADA CON AUTORIZACIÓN DEL SUPERVISOR';rec.releasedAt=releasedAt;rec.supervisorAuthorized=sup;rec.correctionObservation=obs;
    const photos={};if(correctionPhoto)photos[correctionPhotoKey(rec.point)]=correctionPhoto;
    updateHistoryStatus(rec,rec.status,{releasedAt,supervisorAuthorized:sup,correctionObservation:obs,mttrMin});
    queueExecutionUpdate(rec,rec.status,{liberated:true,releasedAt,supervisorAuthorized:sup,correctionObservation:obs,mttrMin,photos});
    removeOpen(rec.executionId);
    panel.innerHTML=`<h2 style="color:#138a52">✓ MÁQUINA LIBERADA</h2><div class="info"><b>${esc12(rec.machine)}</b><br>La corrección fue autorizada por ${esc12(sup)}.<br>La información se está actualizando en Google Sheets.</div><button class="btn" id="v12ReleaseHome">VOLVER AL INICIO</button>`;
    q('v12ReleaseHome').onclick=()=>{panel.classList.add('hidden');if(setup)setup.classList.remove('hidden');renderFollowups()};
  };
};

function wrapHome(){
  if(typeof home!=='function'||window.__v12HomeWrapped)return;
  const oldHome=home;
  window.home=function(){oldHome();setTimeout(renderFollowups,60)};
  window.__v12HomeWrapped=true;
}

function boot(){
  installExtendedSplash();
  patchBrand();
  window.confirmRealFailure=startFailureEvidence;
  wrapHome();
  setTimeout(()=>{
    patchBrand();
    window.confirmRealFailure=startFailureEvidence;
    if(!restorePendingEvidence())renderFollowups();
  },420);
}

window.v12OnResume=function(){setTimeout(()=>{if(!restorePendingEvidence())renderFollowups()},80)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
