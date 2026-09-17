(function(){
'use strict';

const CFG_KEY='cometqr_admin_config_v09';
const DEFAULT_WHATSAPP='7774924650';

function byId(id){return document.getElementById(id)}
function esc11(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}
function readCfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY)||'{}')}catch(e){return {}}}
function writeCfg(c){localStorage.setItem(CFG_KEY,JSON.stringify(c))}

function patchChecklist(){
  if(typeof defs==='undefined')return;
  defs['1.1'].t='Abrir llaves de paso de aire';
  defs['1.2'].t='Abrir llaves de paso a la termoformadora';
  if(defs['1.5']){
    defs['1.5'].kind='level';
    defs['1.5'].d='El nivel debe mantenerse entre mínimo y máximo.';
    defs['1.5'].opts=[
      ['Por arriba del máximo','OUT'],
      ['Máximo','OK'],
      ['Medio','OK'],
      ['Mínimo','OK'],
      ['Por debajo del mínimo','OUT']
    ];
  }
  const sim=byId('simBtn');if(sim)sim.remove();
  const small=document.querySelector('.top small');if(small)small.textContent='V0.11.0 · operación real · registro de no liberadas · administrador';
}

function patchAdminWhatsapp(){
  const btn=byId('adminBtn');
  if(!btn||btn.__v11)return;
  const old=btn.onclick;
  btn.onclick=function(){
    if(typeof old==='function')old.call(this);
    setTimeout(augmentAdminPanel,80);
  };
  btn.__v11=true;
}

function augmentAdminPanel(){
  const panel=byId('adminPanelV10');
  if(!panel||panel.classList.contains('hidden'))return;
  const c=readCfg();
  if(!byId('v11Whatsapp')){
    const box=document.createElement('div');
    box.id='v11WhatsappBox';
    box.innerHTML='<h3>Notificaciones</h3><label>WhatsApp supervisora / supervisor en turno</label><input id="v11Whatsapp" inputmode="tel" placeholder="10 dígitos"><div class="small muted" style="margin-top:5px">Número inicial configurado para avisos por falla real.</div>';
    const security=[...panel.querySelectorAll('h3')].find(x=>x.textContent.trim()==='Seguridad');
    if(security)panel.insertBefore(box,security);else panel.appendChild(box);
  }
  byId('v11Whatsapp').value=String(c.supervisorWhatsapp||DEFAULT_WHATSAPP);
  const save=byId('v10Save');
  if(save&&!save.__v11){
    const oldSave=save.onclick;
    save.onclick=function(){
      const number=(byId('v11Whatsapp')?.value||DEFAULT_WHATSAPP).replace(/\D/g,'');
      if(number.length<10){alert('Revisa el número de WhatsApp del supervisor.');return}
      if(typeof oldSave==='function')oldSave.call(this);
      const updated=readCfg();updated.supervisorWhatsapp=number;writeCfg(updated);
    };
    save.__v11=true;
  }
}

function restoreCurrentControls(){
  if(!state||!steps[state.step])return;
  for(const p of steps[state.step].pts){
    const d=defs[p],a=state.answers&&state.answers[p];if(!d||!a)continue;
    const el=byId('v-'+p);
    if(el){
      if(d.kind==='level'){
        const idx=(d.opts||[]).findIndex(o=>String(o[0])===String(a.value));
        if(idx>=0)el.value=String(idx);
      }else el.value=String(a.value??'');
    }
    if(d.photo&&state.photos&&state.photos[p]&&byId('phn-'+p))byId('phn-'+p).textContent='✓ Foto guardada';
    const res=byId('res-'+p);
    if(!res)continue;
    if(a.result==='OK')res.innerHTML='<span class="pill ok">OK</span>';
    else if(a.result==='PENDIENTE_CONFIRMAR'&&typeof showOutOfRange==='function')showOutOfRange(p,d,a.value);
    else if(a.result==='NG')res.innerHTML='<span class="pill ng">NG · FALLA REAL</span>';
  }
}

function restoreActiveRun(){
  if(typeof state==='undefined'||state)return;
  let saved=null;try{saved=JSON.parse(localStorage.getItem('cometqr_active')||'null')}catch(e){}
  if(!saved)return;
  if(!['EN CURSO','LISTO PARA FIRMA'].includes(String(saved.status||'')))return;
  state=saved;
  const setup=byId('setup'),run=byId('run'),finish=byId('finish'),history=byId('history');
  if(setup)setup.classList.add('hidden');if(history)history.classList.add('hidden');if(finish)finish.classList.add('hidden');
  if(state.status==='LISTO PARA FIRMA'&&typeof finishRun==='function'){finishRun();return}
  if(!steps[state.step]){home();return}
  if(run)run.classList.remove('hidden');
  renderStep();
  if(state.stationStarts&&state.stationStarts[state.step]){
    if(byId('scanMsg'))byId('scanMsg').innerHTML='<div class="info">✓ Estación restaurada. Continúa donde te quedaste.</div>';
    renderItems();
    restoreCurrentControls();
  }
}

function buildFailurePayload(point){
  const c=readCfg();
  const finalDetail=Object.entries(state.answers||{}).map(([p,a])=>({
    time:a.time||state.finished,
    point:p,
    description:defs[p]?.t||'',
    value:a.value,
    unit:a.unit||defs[p]?.unit||'',
    result:a.result==='N/A'?'N/A':(a.result==='NG'?'NG':(a.result==='OK'?'OK':'PENDIENTE')),
    observation:(state.realIncidents||[]).find(i=>i.point===p)?.observation||'',
    durationSec:0
  }));
  const measurements=(state.attempts||[]).filter(a=>['1.3','1.4','2.3'].includes(a.point)).map(a=>{
    const d=defs[a.point]||{};return{time:a.time,point:a.point,variable:d.t||'',value:a.value,unit:d.unit||'',min:d.min,max:d.max,target:d.exact,result:a.result==='OK'?'OK':'CAPTURA_FUERA_RANGO'};
  });
  const number=String(c.supervisorWhatsapp||DEFAULT_WHATSAPP).replace(/\D/g,'');
  const inc=(state.realIncidents||[]).find(i=>i.point===point&&!i.correctedAt)||{};
  const msg=`ALERTA COMET\nFalla real confirmada en COMET ${Number(state.machine)}.\nOperador: ${state.operator}.\nTurno: ${state.shift}.\nPunto: ${point} - ${defs[point]?.t||''}.\nValor/condición: ${inc.value??state.answers?.[point]?.value??''}${inc.unit?' '+inc.unit:''}.\nLa máquina NO queda liberada para operación.`;
  return{
    execution:{id:state.id,started:state.started,finished:state.finished,machine:'COMET '+Number(state.machine),shift:state.shift,operator:state.operator,employee:state.employee,material:state.material,supervisor:state.supervisor,durationMin:state.durationMin,status:state.status,followups:[],signature:'',generalObservation:state.generalObservation||''},
    finalDetail,
    detail:state.attempts||[],
    realIncidents:state.realIncidents||[],
    measurements,
    photos:state.photos||{},
    supervisorAlert:{channel:'WHATSAPP',phone:number,message:msg,automatic:true,point:point,machine:'COMET '+Number(state.machine),operator:state.operator}
  };
}

function showFailureNotice(point){
  const run=byId('run'),finish=byId('finish'),setup=byId('setup');
  if(run)run.classList.add('hidden');if(setup)setup.classList.add('hidden');
  if(finish){
    finish.classList.remove('hidden');
    finish.innerHTML=`<h2 style="color:#b42318">⚠ MÁQUINA NO LIBERADA</h2><div class="err"><b>Falla real confirmada en el punto ${esc11(point)}.</b><br><br>Por el motivo de falla en la puesta a punto de la máquina, la app volverá al inicio automáticamente.<br><br>La condición debe corregirse antes de comenzar a operar.</div><div class="syncbox">Registrando la puesta a punto interrumpida...</div>`;
  }
  setTimeout(()=>{if(typeof home==='function')home()},3000);
}

function installFailureStop(){
  window.confirmRealFailure=function(p){
    if(!state||!state.answers||!state.answers[p])return;
    const a=state.answers[p],d=defs[p]||{};
    a.result='NG';a.confirmedFailure=true;
    const now=new Date().toISOString();
    let inc=(state.realIncidents||[]).find(i=>i.point===p&&!i.correctedAt);
    if(!inc){
      inc={id:'I'+Date.now(),point:p,description:d.t||'',value:a.value,unit:d.unit||'',detectedAt:now,correctedAt:'',mttrMin:'',observation:'Falla real confirmada durante la puesta a punto.',finalResult:'NG'};
      state.realIncidents=state.realIncidents||[];state.realIncidents.push(inc);
    }
    state.status='NO LIBERADA POR FALLA';
    state.failedPoint=p;
    state.finished=now;
    state.durationMin=Math.round(((new Date(state.finished)-new Date(state.started))/60000)*100)/100;
    state.generalObservation=`Puesta a punto interrumpida por falla real en ${p}: ${d.t||''}`;
    state.followups=[];
    saveActive();
    const payload=buildFailurePayload(p);
    archive(true);
    queuePayload(payload);
    sendPending();
    showFailureNotice(p);
  };
}

function persistWhenBackgrounded(){
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){try{document.activeElement&&document.activeElement.blur()}catch(e){};try{saveActive()}catch(e){}}
  });
  window.addEventListener('pagehide',()=>{try{saveActive()}catch(e){}});
}

function boot(){
  patchChecklist();
  installFailureStop();
  patchAdminWhatsapp();
  persistWhenBackgrounded();
  setTimeout(()=>{patchChecklist();patchAdminWhatsapp();restoreActiveRun()},250);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
