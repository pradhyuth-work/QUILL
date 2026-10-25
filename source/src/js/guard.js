/* ---------- safety nets and keyboard / screen-reader support ---------- */
var errT=0;
function onFatal(msg){
  if(/ResizeObserver loop/i.test(String(msg))) return;
  try{console.error(msg)}catch(x){}
  var now=Date.now();
  if(now-errT>8000){errT=now;toast('Something went wrong. Your library is safe. If it keeps happening, reload the page.')}
}
window.addEventListener('error',function(e){onFatal(e&&e.message||e)});
window.addEventListener('unhandledrejection',function(e){onFatal(e&&e.reason&&e.reason.message||e&&e.reason)});

/* modal dialogs: move focus in, keep Tab inside, give focus back on close */
var MODALS=['#sheet','#rnSheet','#gSheet','#moreSheet','#pwSheet','#ocrSheet','#lb'];
var openerOf={};
function visibleModal(){
  for(var i=0;i<MODALS.length;i++){var el=$(MODALS[i]);if(el&&!el.hidden) return el}
  return null;
}
MODALS.forEach(function(sel){
  var el=$(sel);if(!el||!window.MutationObserver) return;
  var wasHidden=el.hidden;
  new MutationObserver(function(){
    if(el.hidden===wasHidden) return;
    wasHidden=el.hidden;
    if(!el.hidden){openerOf[sel]=document.activeElement;
      var tgt=el.querySelector('input:not([type=hidden]),select,button.btn-done,button');
      if(tgt&&!el.contains(document.activeElement)) setTimeout(function(){try{tgt.focus()}catch(e){}},30);
    }else{
      var o=openerOf[sel];delete openerOf[sel];
      if(o&&document.contains(o)&&!o.disabled) setTimeout(function(){try{o.focus()}catch(e){}},30);
    }
  }).observe(el,{attributes:true,attributeFilter:['hidden']});
});
document.addEventListener('keydown',function(e){
  var m=visibleModal();
  if(!m) return;
  if(e.key==='Escape'){
    if(m.id==='moreSheet') closeMore();
    else if(m.id==='pwSheet'||m.id==='ocrSheet'){var no=m.querySelector('[data-r=no]');if(no) no.click()}
    return;
  }
  if(e.key!=='Tab') return;
  var f=Array.prototype.slice.call(m.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"]),label[role=button]')).filter(function(x){return !x.disabled&&!x.hidden&&x.offsetParent!==null&&x.type!=='hidden'});
  if(!f.length) return;
  var first=f[0],last=f[f.length-1];
  if(!m.contains(document.activeElement)){e.preventDefault();first.focus();return}
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
});
