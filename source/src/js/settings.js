/* ---------- settings ---------- */
var S={fs:store.get('fs',19),theme:store.get('theme','auto'),rate:store.get('rate',1),voice:store.get('voice','')};
var RATES=[0.8,1,1.25,1.5,2];
var app=$('#app');
function applyTheme(){
  var r=document.documentElement;
  if(S.theme==='auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme',S.theme);
  var dk=S.theme==='dark'||(S.theme==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.remove()});
  var tc=document.createElement('meta');tc.name='theme-color';tc.content=dk?'#0B0E0F':'#F1F2F0';document.head.appendChild(tc);
  document.querySelectorAll('#themeOpts button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.t===S.theme))});
}
function applyFs(){app.style.setProperty('--fs',S.fs+'px');$('#fsr').value=S.fs;$('#fsv').textContent=S.fs}
function rateLabel(r){return (r===1?'1':String(r))+'×'}
function applyRate(){
  $('#speed').textContent=rateLabel(S.rate);
  document.querySelectorAll('#speedOpts button').forEach(function(b){b.setAttribute('aria-pressed',String(+b.dataset.r===S.rate))});
}
$('#speedOpts').innerHTML=RATES.map(function(r){return '<button type="button" data-r="'+r+'" aria-pressed="false">'+rateLabel(r)+'</button>'}).join('');
applyTheme();applyFs();applyRate();
if(window.matchMedia)try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme)}catch(e){}

var toastT;
function toast(msg){
  var t=$('#toast');t.textContent=msg;t.classList.add('on');
  clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on')},2800);
}
function busy(msg,p){
  $('#busy').hidden=false;$('#busyMsg').textContent=msg;$('#busyBar').style.setProperty('--w',Math.round((p||0)*100)+'%');
}
function unbusy(){$('#busy').hidden=true;$('#busyEta').hidden=true}
function fmtT(sec){sec=Math.max(1,Math.round(sec));if(sec<60) return sec+'s';var m=Math.floor(sec/60),r=sec%60;return m+'m '+(r<10?'0':'')+r+'s'}
function etaLine(t0,done,total){
  var el=(Date.now()-t0)/1000,e=$('#busyEta');
  e.hidden=false;
  if(done<2){e.textContent='Estimating time left\u2026';return}
  e.textContent='About '+fmtT(el/done*(total-done)+total*0.01)+' left \u00b7 '+fmtT(el)+' elapsed';
}

