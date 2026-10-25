renderShelf();
ui();
if(!synth) toast('Listening needs a browser with built-in speech.');
/* the account page is the front door: show it first whenever no account is in use yet,
   so the shelf only appears once someone has signed in or chosen to skip accounts */
try{
  var bootCfg=window.FOLIO_CONFIG&&window.FOLIO_CONFIG.supabase;
  var bootHasSb=!!(bootCfg&&bootCfg.url&&bootCfg.anonKey);
  var bootHasClaude=window.claude&&typeof window.claude.use==='function';
  if(bootHasSb||bootHasClaude){
    var bootSignedIn=false;
    if(bootHasSb){try{var bootSess=JSON.parse(localStorage.getItem('folio:sb')||'null');bootSignedIn=!!(bootSess&&bootSess.uid)}catch(e){}}
    if(!bootSignedIn) openAcct();
  }
}catch(e){}
})();
