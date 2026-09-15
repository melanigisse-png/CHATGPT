(function(){
'use strict';
const QKEY='comet_sync_queue_v06';
const EKEY='comet_sync_endpoint_v06';
let lastNg={};

function now(){return new Date().toISOString()}
function getQueue(){try{return JSON.parse(localStorage.getItem(QKEY)||'[]')}catch(e){return []}}
function setQueue(q){localStorage.setItem(QKEY,JSON.stringify(q))}
function endpoint(){return (localStorage.getItem(EKEY)||'').trim()}
function setStatus(txt,good){const e=document.getElementById('syncState');if(e){e.textContent=txt;e.style.color=good?'#087443':'#912018'}}

function installUi(){
 const setup=document.getElementById('setup'); if(!setup||document.getElementById('syncConfig'))return;
 const box=document.createElement('div'); box.id='syncConfig'; box.className='card';
 box.style.margin='12px 0 0';
 box.innerHTML='<h3 style="margin-top:0">Sincronización Google Sheets</h3><label>URL del servicio de sincronización</label><input id="syncUrl" placeholder="https://script.google.com/macros/s/.../exec"><button id="saveSync" class="btn secondary" style="margin-top:8px">GUARDAR CONEXIÓN</button><button id="retrySync" class="btn secondary" style="margin-top:8px">SINCRONIZAR PENDIENTES</button><div id="syncState" class="small muted" style="margin-top:8px"></div>';
 setup.appendChild(box);
 document.getElementById('syncUrl').value=endpoint();
 document.getElementById('saveSync').onclick=function(){localStorage.setItem(EKEY,document.getElementById('syncUrl').value.trim());setStatus('Conexión guardada. Haz una prueba de puesta a punto.',true);flushQueue()};
 document.getElementById('retrySync').onclick=flushQueue;
 const q=getQueue(); setStatus(q.length?('Pendientes de enviar: '+q.length):'Sin registros pendientes.',q.length===0);
}

function compressPhoto(file,cb){
 if(!file){cb(null);return}
 const r=new FileReader();
 r.onload=function(){
  const img=new Image(); img.onload=function(){
   let w=img.width,h=img.height,max=1000; if(w>max||h>max){const s=Math.min(max/w,max/h);w=Math.round(w*s);h=Math.round(h*s)}
   const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
   cb(c.toDataURL('image/jpeg',0.65));
  };img.onerror=function(){cb(null)};img.src=r.result;
 };r.onerror=function(){cb(null)};r.readAsDataURL(file);
}

document.addEventListener('change',function(e){
 const id=e.target&&e.target.id||''; if(id!=='ph-2.3'&&id!=='ph-2.6')return;
 const p=id.substring(3),file=e.target.files&&e.target.files[0]; if(!file||typeof state==='undefined'||!state)return;
 compressPhoto(file,function(data){state.photoEvidence=state.photoEvidence||{};state.photoEvidence[p]=data;if(typeof saveActive==='function')saveActive()});
});

document.addEventListener('input',function(e){
 const id=e.target&&e.target.id||''; if(!id.startsWith('obs-')||typeof state==='undefined'||!state)return;
 const p=id.substring(4); const inc=(state.incidents||[]).slice().reverse().find(x=>x.point===p&&!x.correctedAt); if(inc)inc.observation=e.target.value;
});

function hookEvaluate(){
 if(typeof window.evaluate!=='function'||window.evaluate.__syncHook)return;
 const orig=window.evaluate;
 const wrapped=function(p,d){
  orig(p,d);
  try{
   if(!state)return; state.incidents=state.incidents||[]; const a=state.answers&&state.answers[p]; if(!a)return;
   if(a.result==='NG'){
    const key=p+'|'+String(a.value); if(lastNg[p]!==key){lastNg[p]=key;state.incidents.push({id:'I'+Date.now()+Math.random().toString(16).slice(2,7),point:p,description:(defs[p]&&defs[p].t)||'',value:a.value,unit:(defs[p]&&defs[p].unit)||'',detectedAt:now(),observation:''});}
   } else if(a.result==='OK'){
    const open=state.incidents.slice().reverse().find(x=>x.point===p&&!x.correctedAt); if(open){open.correctedAt=now();open.finalResult='OK';open.correctedValue=a.value;} lastNg[p]=null;
   }
   if(typeof saveActive==='function')saveActive();
  }catch(ex){}
 };
 wrapped.__syncHook=true;window.evaluate=wrapped;
}

function buildPayload(s){
 const finished=s.finished||now(); const startMs=new Date(s.started).getTime(); const endMs=new Date(finished).getTime();
 const qr=(s.events||[]).filter(x=>x.type==='QR');
 const stationTimes=[]; for(let i=0;i<qr.length;i++){const end=i+1<qr.length?new Date(qr[i+1].time).getTime():endMs;stationTimes.push({step:qr[i].step+1,tag:steps[qr[i].step]?steps[qr[i].step].tag:'',started:qr[i].time,ended:new Date(end).toISOString(),durationSec:Math.max(0,Math.round((end-new Date(qr[i].time).getTime())/1000))})}
 const detail=[];Object.keys(s.answers||{}).forEach(function(p){const a=s.answers[p]||{},d=defs[p]||{};detail.push({point:p,description:d.t||'',tag:(steps.find(x=>x.pts.indexOf(p)>=0)||{}).tag||'',type:d.kind||'',value:a.value,unit:d.unit||'',result:a.result,observation:a.observation||'',time:a.time||'',photoPoint:!!d.photo})});
 const inc=(s.incidents||[]).map(function(x){let mttr='';if(x.correctedAt&&x.detectedAt)mttr=Math.round((new Date(x.correctedAt)-new Date(x.detectedAt))/60000*100)/100;return Object.assign({},x,{mttrMin:mttr})});
 const measurements=detail.filter(x=>['1.3','2.3','2.6'].indexOf(x.point)>=0).map(function(x){const d=defs[x.point]||{};return {point:x.point,variable:x.description,value:x.value,unit:x.unit,min:d.min??'',max:d.max??'',target:d.exact??'',result:x.result,time:x.time}});
 return {version:'0.6.0',execution:{id:s.id,started:s.started,finished:finished,machine:Number(s.machine),shift:s.shift,operator:s.operator,employee:s.employee,material:s.material,supervisor:s.supervisor,status:s.status,durationMin:Math.round((endMs-startMs)/600)/100,totalNg:inc.length,signature:s.signature||'',followups:s.followups||[]},detail:detail,incidents:inc,measurements:measurements,stationTimes:stationTimes,photos:s.photoEvidence||{}};
}

function enqueue(s){const q=getQueue();if(q.some(x=>x.execution&&x.execution.id===s.id))return; q.push(buildPayload(s));setQueue(q);setStatus('Registro guardado. Pendientes: '+q.length,false);flushQueue()}
function flushQueue(){const ep=endpoint(),q=getQueue();if(!q.length){setStatus('Todo sincronizado.',true);return}if(!ep){setStatus('Falta configurar la URL del servicio. Los datos quedan guardados en el teléfono.',false);return}if(!window.AndroidSync||typeof window.AndroidSync.send!=='function'){setStatus('La sincronización requiere la app Android V0.6.',false);return}const item=q[0],rid=item.execution.id+'-'+Date.now();window.__syncRequest={id:rid,item:item};window.AndroidSync.send(rid,ep,JSON.stringify(item));setStatus('Enviando '+item.execution.id+'...',false)}
window.onNativeSyncResult=function(requestId,ok,msg){const r=window.__syncRequest;if(!r||r.id!==requestId)return;if(ok){let q=getQueue();q=q.filter(x=>x.execution.id!==r.item.execution.id);setQueue(q);window.__syncRequest=null;setStatus(q.length?('Sincronizado. Pendientes: '+q.length):'Todo sincronizado.',q.length===0);if(q.length)setTimeout(flushQueue,500)}else{setStatus('Sin conexión o error. El registro queda pendiente. '+(msg||''),false);window.__syncRequest=null}};

function hookArchive(){if(typeof window.archive!=='function'||window.archive.__syncHook)return;const orig=window.archive;const wrapped=function(){try{if(state)enqueue(state)}catch(e){}return orig()};wrapped.__syncHook=true;window.archive=wrapped}

function boot(){installUi();hookEvaluate();hookArchive();flushQueue();setInterval(function(){hookEvaluate();hookArchive()},1500);setInterval(flushQueue,60000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
