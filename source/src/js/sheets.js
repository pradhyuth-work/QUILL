/* ---------- sheet ---------- */
var sheet=$('#sheet');
function openSheet(){
  sheet.hidden=false;
  void sheet.offsetWidth;
  sheet.classList.add('open');
  $('#sheetDone').focus();
}
function closeSheet(){
  sheet.classList.remove('open');
  setTimeout(function(){sheet.hidden=true},300);
}
$('#aa').addEventListener('click',openSheet);
$('#voiceChip').addEventListener('click',openSheet);
$('#sheetDone').addEventListener('click',closeSheet);
$('#scrim').addEventListener('click',closeSheet);
$('#fsr').addEventListener('input',function(e){$('#fsv').textContent=e.target.value});
$('#fsr').addEventListener('change',function(e){
  S.fs=+e.target.value;store.set('fs',S.fs);applyFs();
  if(!$('#reader').hidden) layout(cards[curCard]?cards[curCard].first:0);
});
$('#themeOpts').addEventListener('click',function(e){
  var b=e.target.closest('button[data-t]');if(!b) return;
  S.theme=b.dataset.t;store.set('theme',S.theme);applyTheme();
});
$('#themeBtn').addEventListener('click',function(){
  var order=['auto','light','dark'];
  S.theme=order[(order.indexOf(S.theme)+1)%3];store.set('theme',S.theme);applyTheme();
  toast('Theme: '+S.theme.charAt(0).toUpperCase()+S.theme.slice(1));
});
$('#speedOpts').addEventListener('click',function(e){
  var b=e.target.closest('button[data-r]');if(!b) return;
  S.rate=+b.dataset.r;store.set('rate',S.rate);applyRate();restartHere();
});
$('#voiceSel').addEventListener('change',function(e){
  var v=voices.filter(function(x){return x.voiceURI===e.target.value})[0]||null;
  voice=v;rememberVoice(v);voiceChip();restartHere();
});
$('#sleepOpts').addEventListener('click',function(e){
  var b=e.target.closest('button[data-m]');if(!b) return;
  setSleep(b.dataset.m);
});
$('#bgChk').addEventListener('change',function(e){
  bgOn=e.target.checked;store.set('bg',bgOn);
  if(playing){if(bgOn) holdBackground();else try{keepAudio&&keepAudio.pause()}catch(x){}}
});

