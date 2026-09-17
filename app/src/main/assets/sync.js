(function(){
'use strict';
function boot(){
  try{
    const top=document.querySelector('.top small');
    if(top) top.textContent='V0.12.0 · cargando módulos de operación';
    setTimeout(()=>{
      if(document.getElementById('cometV12Loader')) return;
      const s=document.createElement('script');
      s.id='cometV12Loader';
      s.src='v12.js';
      document.head.appendChild(s);
    },120);
  }catch(e){}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
