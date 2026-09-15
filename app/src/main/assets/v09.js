(function(){
'use strict';

const CFG_KEY='cometqr_admin_config_v09';
const PIN_KEY='cometqr_admin_pin_v09';
const FOLLOWUP_QUEUE_KEY='cometqr_followup_pending_v09';
const DEFAULT_CFG={
  operators:[
    {name:'Édgar Chavarria Rios',employee:'PT0194'},
    {name:'Daniel Ocampo Pérez',employee:'PT 2033'},
    {name:'Roberto Carlos Villalobos Cabello',employee:'PT1942'}
  ],
  materials:['ABS','ACRILICO','TPU'],
  supervisor:'ALMA VILLA',
  machines:['01','02'],
  followupTimes:['12:00','15:30'],
  p13min:60,
  p13max:80,
  p23min:-30,
  p23max:-20,
  p26exact:5
};

function cfg(){
  try{return Object.assign({},DEFAULT_CFG,JSON.parse(localStorage.getItem(CFG_KEY)||'{}'))}catch(e){return Object.assign({},DEFAULT_CFG)}
}
function saveCfg(c){localStorage.setItem(CFG_KEY,JSON.stringify(c))}
function pin(){return localStorage.getItem(PIN_KEY)||'1234'}
function setPin(v){localStorage.setItem(PIN_KEY,v)}
function fq(){try{return JSON.parse(localStorage.getItem(FOLLOWUP_QUEUE_KEY)||'[]')}catch(e){return []}}
function sfq(q){localStorage.setItem(FOLLOWUP_QUEUE_KEY,JSON.stringify(q))}
function q(sel){return document.querySelector(sel)}
function byId(id){return document.getElementById(id)}
function esc09(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}

function applyConfig(){
  const c=cfg();
  const machine=byId('machine');
  if(machine){const cur=machine.value;machine.innerHTML=c.machines.map(m=>`<option value="${m}">COMET ${Number(m)}</option>`).join('');if(c.machines.includes(cur))machine.value=cur}
  const op=byId('operator');
  if(op){const cur=op.value;op.innerHTML='<option value="">Seleccionar...</option>'+c.operators.map(x=>`<option>${esc09(x.name)}</option>`).join('');if(c.operators.some(x=>x.name===cur))op.value=cur;op.onchange=e=>{const r=c.operators.find(x=>x.name===e.target.value);const emp=byId('emp');if(emp)emp.value=r?r.employee:''}}
  const mat=byId('material');
  if(mat){const cur=mat.value;mat.innerHTML='<option value="">Seleccionar...</option>'+c.materials.map(x=>`<option>${esc09(x)}</option>`).join('');if(c.materials.includes(cur))mat.value=cur}
  const sup=byId('supervisor');if(sup&&!sup.value.trim())sup.value=c.supervisor;else if(sup)sup.value=c.supervisor;

  try{
    defs['1.3'].min=Number(c.p13min);defs['1.3'].max=Number(c.p13max);defs['1.3'].d=`Rango aceptable: ${c.p13min} a ${c.p13max} PSI.`;
    defs['2.3'].min=Number(c.p23min);defs['2.3'].max=Number(c.p23max);defs['2.3'].d=`Rango correcto: ${c.p23min} a ${c.p23max} inHg. Foto obligatoria.`;
    defs['2.6'].exact=Number(c.p26exact);defs['2.6'].d=`${c.p26exact} PSI exactos = correcto. Foto obligatoria.`;
  }catch(e){}

  if(window.AndroidReminder&&typeof window.AndroidReminder.configure==='function'){
    const t=c.followupTimes||DEFAULT_CFG.followupTimes;
    window.AndroidReminder.configure(String(t[0]||'12:00'),String(t[1]||'15:30'));
  }
}

function installHomeButtons(){
  const setup=byId('setup');if(!setup||byId('v09HomeButtons'))return;
  const wrap=document.createElement('div');wrap.id='v09HomeButtons';wrap.className='card';wrap.style.boxShadow='none';wrap.style.padding='0';wrap.style.margin='14px 0 0';
  wrap.innerHTML='<button class="btn warn" id="pendingChecksBtn">COMPROBACIONES PENDIENTES</button><button class="btn secondary" id="adminBtn" style="margin-top:8px">ADMINISTRADOR</button>';
  setup.appendChild(wrap);
  byId('pendingChecksBtn').onclick=()=>openPendingChecks();
  byId('adminBtn').onclick=openAdminLogin;
}

function hideMain(){['setup','run','finish','history'].forEach(id=>{const e=byId(id);if(e)e.classList.add('hidden')})}
function showSetup(){const e=byId('setup');if(e)e.classList.remove('hidden')}
function ensureSection(id){let e=byId(id);if(e)return e;e=document.createElement('section');e.id=id;e.className='card hidden';document.querySelector('.wrap').appendChild(e);return e}

function pendingRows(){
  const h=typeof loadHistory==='function'?loadHistory():[];const out=[];
  h.forEach((run,ri)=>{
    (run.followups||[]).forEach((f,fi)=>{if(String(f.status||'PENDIENTE').toUpperCase()!=='COMPLETADA')out.push({run,ri,f,fi})})
  });
  return out;
}

window.openPendingChecks=function(fromNotification){
  hideMain();const s=ensureSection('pendingChecks');s.classList.remove('hidden');
  const rows=pendingRows();
  s.innerHTML='<h2>Comprobaciones pendientes</h2><p class="muted small">Las comprobaciones permanecen aquí aunque no se abra o se descarte la notificación.</p><div id="pendingList"></div><button class="btn secondary" id="pendingBack">Volver</button>';
  const list=byId('pendingList');
  if(!rows.length){list.innerHTML='<div class="info">No hay comprobaciones pendientes.</div>'}
  else list.innerHTML=rows.map((x,i)=>{const due=scheduledDate(x.run,x.f.time);const late=Math.max(0,Math.floor((Date.now()-due.getTime())/60000));return `<div class="item"><h3>COMET ${Number(x.run.machine)} · ${esc09(x.f.time)}</h3><div class="small muted">Operador: ${esc09(x.run.operator)}<br>Programada: ${due.toLocaleString()}${late>0?`<br><b>Retraso actual: ${late} min</b>`:''}</div><button class="btn ${late>0?'bad':'good'}" style="margin-top:8px" onclick="window.startFollowup(${x.ri},${x.fi})">REALIZAR COMPROBACIÓN</button></div>`}).join('');
  byId('pendingBack').onclick=()=>{s.classList.add('hidden');showSetup()};
};

function scheduledDate(run,time){
  const base=new Date(run.finished||run.started||Date.now());const [hh,mm]=String(time||'12:00').split(':').map(Number);base.setHours(hh||0,mm||0,0,0);return base;
}

window.startFollowup=function(ri,fi){
  const h=loadHistory(),run=h[ri],f=run&&run.followups&&run.followups[fi];if(!run||!f)return;
  const s=ensureSection('followupForm');hideMain();const p=byId('pendingChecks');if(p)p.classList.add('hidden');s.classList.remove('hidden');
  s.innerHTML=`<h2>Comprobación ${esc09(f.time)}</h2><div class="info"><b>COMET ${Number(run.machine)}</b><br>${esc09(run.operator)}<br>Puesta a punto: ${new Date(run.started).toLocaleString()}</div><label>Resultado de la comprobación</label><select id="fuResult"><option value="">Seleccionar...</option><option value="OK">OK · Máquina continúa en condición</option><option value="NG">NG · Se detectó una condición fuera de parámetro</option></select><label>Observación</label><textarea id="fuObs" placeholder="Describe lo observado. Obligatorio si el resultado es NG."></textarea><button class="btn good" id="fuSave">GUARDAR COMPROBACIÓN</button><button class="btn secondary" id="fuCancel" style="margin-top:8px">Cancelar</button>`;
  byId('fuCancel').onclick=()=>{s.classList.add('hidden');openPendingChecks()};
  byId('fuSave').onclick=()=>saveFollowup(ri,fi);
};

function saveFollowup(ri,fi){
  const result=byId('fuResult').value,obs=byId('fuObs').value.trim();if(!result){alert('Selecciona el resultado.');return}if(result==='NG'&&!obs){alert('Describe la condición detectada.');return}
  const h=loadHistory(),run=h[ri],f=run.followups[fi],actual=new Date(),due=scheduledDate(run,f.time),delay=Math.max(0,Math.round((actual-due)/60000));
  f.status='COMPLETADA';f.result=result;f.observation=obs;f.actualAt=actual.toISOString();f.delayMin=delay;setHistory(h);
  const payload={type:'FOLLOWUP',followup:{executionId:run.id,machine:'COMET '+Number(run.machine),scheduledTime:f.time,actualAt:f.actualAt,delayMin:delay,operator:run.operator,result:result,observation:obs}};
  const queue=fq();queue.push(payload);sfq(queue);sendFollowups();
  const s=byId('followupForm');if(s)s.classList.add('hidden');openPendingChecks();
}

function sendFollowups(){
  const queue=fq();if(!queue.length)return;if(!(window.AndroidSync&&typeof window.AndroidSync.send==='function'))return;
  if(window.__v09FuSending)return;const item=queue[0],rid='FUP-'+Date.now();window.__v09FuSending={rid,item};window.AndroidSync.send(rid,ENDPOINT,JSON.stringify(item));
}

function hookSyncResult(){
  const old=window.onNativeSyncResult;
  window.onNativeSyncResult=function(rid,ok,msg){
    if(String(rid).startsWith('FUP-')){
      if(ok){const queue=fq();queue.shift();sfq(queue)}
      window.__v09FuSending=null;if(ok)setTimeout(sendFollowups,300);else setTimeout(sendFollowups,60000);return;
    }
    if(typeof old==='function')return old(rid,ok,msg);
  };
}

function openAdminLogin(){
  const entered=prompt('PIN de administrador:');if(entered===null)return;if(entered!==pin()){alert('PIN incorrecto.');return}openAdmin();
}

function openAdmin(){
  hideMain();const s=ensureSection('adminPanel'),c=cfg();s.classList.remove('hidden');
  s.innerHTML=`<h2>Administrador</h2><div class="info">Los cambios se aplican en este dispositivo. PIN inicial: 1234.</div><label>Supervisora / supervisor por defecto</label><input id="adSupervisor" value="${esc09(c.supervisor)}"><label>Operadores (una línea por operador: NOMBRE|No. EMPLEADO)</label><textarea id="adOperators">${esc09(c.operators.map(x=>x.name+'|'+x.employee).join('\n'))}</textarea><label>Materiales (separados por coma)</label><input id="adMaterials" value="${esc09(c.materials.join(', '))}"><label>Máquinas activas</label><div class="row"><label><input type="checkbox" id="adM1" ${c.machines.includes('01')?'checked':''}> COMET 1</label><label><input type="checkbox" id="adM2" ${c.machines.includes('02')?'checked':''}> COMET 2</label></div><h3>Horarios de comprobación</h3><div class="row"><div><label>Horario 1</label><input id="adT1" type="time" value="${esc09((c.followupTimes||[])[0]||'12:00')}"></div><div><label>Horario 2</label><input id="adT2" type="time" value="${esc09((c.followupTimes||[])[1]||'15:30')}"></div></div><h3>Parámetros</h3><div class="row"><div><label>1.3 mínimo PSI</label><input id="ad13min" type="number" value="${c.p13min}"></div><div><label>1.3 máximo PSI</label><input id="ad13max" type="number" value="${c.p13max}"></div></div><div class="row"><div><label>2.3 mínimo inHg</label><input id="ad23min" type="number" step="0.1" value="${c.p23min}"></div><div><label>2.3 máximo inHg</label><input id="ad23max" type="number" step="0.1" value="${c.p23max}"></div></div><label>2.6 valor exacto PSI</label><input id="ad26" type="number" step="0.1" value="${c.p26exact}"><h3>Seguridad</h3><label>Nuevo PIN (deja vacío para conservar el actual)</label><input id="adPin" type="password" inputmode="numeric" placeholder="Nuevo PIN"><button class="btn good" id="adSave">GUARDAR CAMBIOS</button><button class="btn secondary" id="adBack" style="margin-top:8px">Volver</button>`;
  byId('adBack').onclick=()=>{s.classList.add('hidden');showSetup()};
  byId('adSave').onclick=saveAdmin;
}

function saveAdmin(){
  const operators=byId('adOperators').value.split(/\n+/).map(x=>x.trim()).filter(Boolean).map(x=>{const p=x.split('|');return{name:(p[0]||'').trim(),employee:(p[1]||'').trim()}}).filter(x=>x.name);
  const materials=byId('adMaterials').value.split(',').map(x=>x.trim()).filter(Boolean);
  const machines=[];if(byId('adM1').checked)machines.push('01');if(byId('adM2').checked)machines.push('02');if(!machines.length){alert('Debe quedar al menos una máquina activa.');return}
  const c={operators:operators.length?operators:DEFAULT_CFG.operators,materials:materials.length?materials:DEFAULT_CFG.materials,supervisor:byId('adSupervisor').value.trim()||'ALMA VILLA',machines,followupTimes:[byId('adT1').value||'12:00',byId('adT2').value||'15:30'],p13min:Number(byId('ad13min').value),p13max:Number(byId('ad13max').value),p23min:Number(byId('ad23min').value),p23max:Number(byId('ad23max').value),p26exact:Number(byId('ad26').value)};
  if(c.p13min>c.p13max||c.p23min>c.p23max){alert('Revisa los rangos mínimo/máximo.');return}
  saveCfg(c);const np=byId('adPin').value.trim();if(np)setPin(np);applyConfig();alert('Configuración guardada.');const s=byId('adminPanel');if(s)s.classList.add('hidden');showSetup();
}

function hookArchive(){
  if(typeof archive!=='function'||archive.__v09)return;const old=archive;const wrapped=function(syncPending){
    try{if(state&&syncPending){const c=cfg();state.followups=(c.followupTimes||DEFAULT_CFG.followupTimes).map(t=>({time:t,status:'PENDIENTE'}));if(window.AndroidReminder&&typeof window.AndroidReminder.configure==='function')window.AndroidReminder.configure(state.followups[0].time,state.followups[1].time)}}catch(e){}
    return old(syncPending);
  };wrapped.__v09=true;archive=wrapped;
}

function boot(){
  const small=q('.top small');if(small)small.textContent='V0.9.0 · comprobaciones pendientes · administrador';
  applyConfig();installHomeButtons();hookArchive();hookSyncResult();sendFollowups();
  setInterval(()=>{hookArchive();sendFollowups()},3000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
