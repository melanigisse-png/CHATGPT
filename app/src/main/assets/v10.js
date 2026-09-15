(function(){
'use strict';

const CFG_KEY='cometqr_admin_config_v09';
const PIN_KEY='cometqr_admin_pin_v09';

function byId(id){return document.getElementById(id)}
function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}
function getCfg(){
  let c={};
  try{c=JSON.parse(localStorage.getItem(CFG_KEY)||'{}')}catch(e){}
  return Object.assign({
    operators:[
      {name:'Édgar Chavarria Rios',employee:'PT0194'},
      {name:'Daniel Ocampo Pérez',employee:'PT 2033'},
      {name:'Roberto Carlos Villalobos Cabello',employee:'PT1942'}
    ],
    materials:['ABS','ACRILICO','TPU'],
    supervisor:'ALMA VILLA',
    machines:['01','02'],
    followupTimes:['12:00','15:30'],
    p13min:60,p13max:80,p23min:-30,p23max:-20,
    p14exact:(c.p14exact!==undefined?c.p14exact:(c.p26exact!==undefined?c.p26exact:5))
  },c);
}
function setCfg(c){localStorage.setItem(CFG_KEY,JSON.stringify(c))}
function getPin(){return localStorage.getItem(PIN_KEY)||'1234'}
function setPin(v){localStorage.setItem(PIN_KEY,v)}

function patchProcess(){
  if(typeof steps==='undefined'||typeof defs==='undefined'||window.__cometV10Patched)return;
  const old14=Object.assign({},defs['1.4']);
  const old15=Object.assign({},defs['1.5']);
  const old16=Object.assign({},defs['1.6']);
  const old17=Object.assign({},defs['1.7']);
  const old18=Object.assign({},defs['1.8']);
  const old26=Object.assign({},defs['2.6']);

  defs['1.4']=Object.assign({},old26,{t:'Verificar presión de aire del lente visor de temperatura',d:'5 PSI exactos = correcto. Foto obligatoria.'});
  defs['1.5']=old14;
  defs['1.6']=old15;
  defs['1.7']=old16;
  defs['1.8']=old17;
  defs['1.9']=old18;

  steps.splice(0,steps.length,
    {tag:'01',title:'QR-01 · Neumática posterior / tanque',pts:['1.1','1.2','1.3','1.8']},
    {tag:'02',title:'QR-02 · Presión auxiliar, lubricación, bastidores y guías',pts:['1.4','1.5','1.6','1.7']},
    {tag:'04',title:'QR-04 · Aceite equipo de vacío (antes de encender)',pts:['1.9']},
    {tag:'03',title:'QR-03 · Tablero eléctrico',pts:['2.1','2.2']},
    {tag:'04',title:'QR-04 · Vacío y presiones auxiliares',pts:['2.3','2.5']},
    {tag:'05',title:'QR-05 · Platinas, resistencias y programa',pts:['2.8','2.9','3.1']}
  );
  window.__cometV10Patched=true;
  applyV10Config();
}

function applyV10Config(){
  if(typeof defs==='undefined')return;
  const c=getCfg();
  try{
    defs['1.3'].min=Number(c.p13min);defs['1.3'].max=Number(c.p13max);defs['1.3'].d=`Rango aceptable: ${c.p13min} a ${c.p13max} PSI.`;
    defs['2.3'].min=Number(c.p23min);defs['2.3'].max=Number(c.p23max);defs['2.3'].d=`Rango correcto: ${c.p23min} a ${c.p23max} inHg. Foto obligatoria.`;
    const exact=Number(c.p14exact!==undefined?c.p14exact:(c.p26exact!==undefined?c.p26exact:5));
    defs['1.4'].exact=exact;defs['1.4'].d=`${exact} PSI exactos = correcto. Foto obligatoria.`;
  }catch(e){}
}

function hideAll(){['setup','run','finish','history','pendingChecks','followupForm'].forEach(id=>{const e=byId(id);if(e)e.classList.add('hidden')})}
function showSetup(){const e=byId('setup');if(e)e.classList.remove('hidden')}
function ensureSection(id){let e=byId(id);if(e)return e;e=document.createElement('section');e.id=id;e.className='card hidden';document.querySelector('.wrap').appendChild(e);return e}

function openAdmin(){
  hideAll();
  const c=getCfg(),s=ensureSection('adminPanelV10');s.classList.remove('hidden');
  const exact=c.p14exact!==undefined?c.p14exact:(c.p26exact!==undefined?c.p26exact:5);
  s.innerHTML=`<h2>Administrador</h2>
  <div class="info">Configuración local de este dispositivo. PIN inicial: 1234.</div>
  <label>Supervisora / supervisor por defecto</label><input id="v10Supervisor" value="${esc(c.supervisor)}">
  <label>Operadores (una línea por operador: NOMBRE|No. EMPLEADO)</label><textarea id="v10Operators">${esc((c.operators||[]).map(x=>x.name+'|'+x.employee).join('\n'))}</textarea>
  <label>Materiales (separados por coma)</label><input id="v10Materials" value="${esc((c.materials||[]).join(', '))}">
  <label>Máquinas activas</label><div class="row"><label><input type="checkbox" id="v10M1" ${(c.machines||[]).includes('01')?'checked':''}> COMET 1</label><label><input type="checkbox" id="v10M2" ${(c.machines||[]).includes('02')?'checked':''}> COMET 2</label></div>
  <h3>Horarios de comprobación</h3><div class="row"><div><label>Horario 1</label><input id="v10T1" type="time" value="${esc((c.followupTimes||[])[0]||'12:00')}"></div><div><label>Horario 2</label><input id="v10T2" type="time" value="${esc((c.followupTimes||[])[1]||'15:30')}"></div></div>
  <h3>Parámetros</h3><div class="row"><div><label>1.3 mínimo PSI</label><input id="v1013min" type="number" value="${c.p13min}"></div><div><label>1.3 máximo PSI</label><input id="v1013max" type="number" value="${c.p13max}"></div></div>
  <div class="row"><div><label>2.3 mínimo inHg</label><input id="v1023min" type="number" step="0.1" value="${c.p23min}"></div><div><label>2.3 máximo inHg</label><input id="v1023max" type="number" step="0.1" value="${c.p23max}"></div></div>
  <label>1.4 presión exacta del lente visor (PSI)</label><input id="v1014" type="number" step="0.1" value="${exact}">
  <h3>Seguridad</h3><label>Nuevo PIN (deja vacío para conservar el actual)</label><input id="v10Pin" type="password" inputmode="numeric" placeholder="Nuevo PIN">
  <button class="btn good" id="v10Save">GUARDAR CAMBIOS</button><button class="btn secondary" id="v10Back" style="margin-top:8px">Volver</button>`;
  byId('v10Back').onclick=()=>{s.classList.add('hidden');showSetup()};
  byId('v10Save').onclick=saveAdmin;
}

function saveAdmin(){
  const operators=byId('v10Operators').value.split(/\n+/).map(x=>x.trim()).filter(Boolean).map(x=>{const p=x.split('|');return{name:(p[0]||'').trim(),employee:(p[1]||'').trim()}}).filter(x=>x.name);
  const materials=byId('v10Materials').value.split(',').map(x=>x.trim()).filter(Boolean);
  const machines=[];if(byId('v10M1').checked)machines.push('01');if(byId('v10M2').checked)machines.push('02');if(!machines.length){alert('Debe quedar al menos una máquina activa.');return}
  const exact=Number(byId('v1014').value);
  const c={operators,materials,supervisor:byId('v10Supervisor').value.trim()||'ALMA VILLA',machines,followupTimes:[byId('v10T1').value||'12:00',byId('v10T2').value||'15:30'],p13min:Number(byId('v1013min').value),p13max:Number(byId('v1013max').value),p23min:Number(byId('v1023min').value),p23max:Number(byId('v1023max').value),p14exact:exact,p26exact:exact};
  if(c.p13min>c.p13max||c.p23min>c.p23max){alert('Revisa los rangos mínimo/máximo.');return}
  setCfg(c);const np=byId('v10Pin').value.trim();if(np)setPin(np);
  applyV10Config();
  if(window.AndroidReminder&&typeof window.AndroidReminder.configure==='function')window.AndroidReminder.configure(c.followupTimes[0],c.followupTimes[1]);
  const machine=byId('machine');if(machine){const cur=machine.value;machine.innerHTML=c.machines.map(m=>`<option value="${m}">COMET ${Number(m)}</option>`).join('');if(c.machines.includes(cur))machine.value=cur}
  const op=byId('operator');if(op){op.innerHTML='<option value="">Seleccionar...</option>'+c.operators.map(x=>`<option>${esc(x.name)}</option>`).join('')}
  const mat=byId('material');if(mat){mat.innerHTML='<option value="">Seleccionar...</option>'+c.materials.map(x=>`<option>${esc(x)}</option>`).join('')}
  const sup=byId('supervisor');if(sup)sup.value=c.supervisor;
  alert('Configuración guardada.');const s=byId('adminPanelV10');if(s)s.classList.add('hidden');showSetup();
}

function patchAdminButton(){
  const b=byId('adminBtn');if(!b)return;
  b.onclick=()=>{const entered=prompt('PIN de administrador:');if(entered===null)return;if(entered!==getPin()){alert('PIN incorrecto.');return}openAdmin()};
}

function addBranding(){
  const small=document.querySelector('.top small');if(small)small.textContent='V0.10.0 · COMET 1 y COMET 2 · comprobaciones · administrador';
  const setup=byId('setup');
  if(setup&&!byId('brandV10')){const d=document.createElement('div');d.id='brandV10';d.style='text-align:center;margin-top:16px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#667085';d.textContent='POWERED BY IVAN AVILES';setup.appendChild(d)}
}

function boot(){
  patchProcess();
  addBranding();
  patchAdminButton();
  setTimeout(()=>{patchAdminButton();applyV10Config()},500);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
