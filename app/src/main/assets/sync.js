(function(){
'use strict';
function boot(){
  try{
    const top=document.querySelector('.top small');
    if(top) top.textContent='V0.8.0 Android · Google Sheets conectado · recordatorios 12:00 y 15:30';
  }catch(e){}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
