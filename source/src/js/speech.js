/* ---------- listening: a defensive wrapper around the device's speech engine ---------- */
var synth=window.speechSynthesis||null;
var voices=[],voice=null,playing=false,token=0,curS=-1,mode='read',autoUntil=0,lastEl=null;
var keepRefs=[],failRun=0,sleepAt=0,sleepEnd=false,sleepChap=-1,sleepTimer=0,bgOn=store.get('bg',null);
var IS_IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
if(bgOn==null) bgOn=!IS_IOS;
$('#bgChk').checked=!!bgOn;
function bookLang(){return (book&&book.lang)||'en'}
function langName(code){try{return new Intl.DisplayNames([navigator.language||'en'],{type:'language'}).of(code)}catch(e){return code}}
function vLang(v){return String(v.lang||'').toLowerCase().replace('_','-').split('-')[0]}
function voiceScore(v,lang){
  var s=0;
  if(/natural|neural|premium|enhanced|siri|google|online/i.test(v.name)) s+=2;
  if(lang==='en'&&/en[-_](IN|US|GB)/i.test(v.lang)) s+=1;
  if(v.localService) s+=0.5;
  return s;
}
function loadVoices(){
  if(!synth) return;
  var all=[];
  try{all=Array.prototype.slice.call(synth.getVoices()||[])}catch(e){}
  var lang=bookLang();
  var match=all.filter(function(v){return vLang(v)===lang}),rest=all.filter(function(v){return vLang(v)!==lang});
  var by=function(a,b){return voiceScore(b,lang)-voiceScore(a,lang)||a.name.localeCompare(b.name)};
  match.sort(by);rest.sort(function(a,b){return a.lang.localeCompare(b.lang)||a.name.localeCompare(b.name)});
  voices=match.concat(rest);
  var sel=$('#voiceSel'),opt=function(v){return '<option value="'+esc(v.voiceURI)+'">'+esc(v.name)+' · '+esc(v.lang)+'</option>'};
  if(!all.length) sel.innerHTML='<option value="">Device default</option>';
  else sel.innerHTML=(match.length?'<optgroup label="'+esc(langName(lang))+'">'+match.map(opt).join('')+'</optgroup>':'')+
    (rest.length?'<optgroup label="'+(match.length?'Other languages':'All voices')+'">'+rest.map(opt).join('')+'</optgroup>':'');
  var saved=(store.get('voices',{})||{})[lang]||(lang==='en'?S.voice:'');
  voice=match.filter(function(v){return v.voiceURI===saved})[0]||match[0]||null;
  if(!voice&&all.length&&lang==='en') voice=rest[0]||null;
  if(voice) sel.value=voice.voiceURI;
  voiceChip();
}
function voiceChip(){
  var n=voice?voice.name.replace(/^(Microsoft|Google)\s+/,'').split(/[\s(]/)[0]:'Voice';
  if(!voice&&synth&&voices.length&&bookLang()!=='en') n='No voice';
  $('#voiceChip').textContent=n||'Voice';
}
function rememberVoice(v){
  var m=store.get('voices',{})||{};m[bookLang()]=v?v.voiceURI:'';store.set('voices',m);
  if(bookLang()==='en'){S.voice=v?v.voiceURI:'';store.set('voice',S.voice)}
}
if(synth){
  loadVoices();
  if(synth.addEventListener) synth.addEventListener('voiceschanged',loadVoices);
  /* some browsers fill the list late and never fire an event */
  var vTries=0,vPoll=setInterval(function(){
    if((synth.getVoices()||[]).length||++vTries>12){clearInterval(vPoll);loadVoices()}
  },400);
}
async function waitForVoices(ms){
  var t0=Date.now();
  while(!(synth.getVoices()||[]).length&&Date.now()-t0<ms) await tick(120);
  loadVoices();
}

function ui(){
  $('#play').innerHTML=playing?ICON.pause:ICON.play;
  $('#play').setAttribute('aria-label',playing?'Pause':'Play');
  $('#play').setAttribute('aria-pressed',String(playing));
}
function autoScroll(){autoUntil=performance.now()+1000}
function mark(i,instant){
  var n=itemCard[i];
  fillCard(n);
  var el=cardEls[n];
  if(n!==curCard||instant){autoScroll();scrollToCard(n,!instant);if(instant) setCard(n)}
  if(lastEl&&lastEl!==el) lastEl.querySelectorAll('.s').forEach(function(sp){var x=+sp.dataset.i;sp.classList.remove('now');sp.classList.toggle('heard',x<i)});
  if(el) el.querySelectorAll('.s').forEach(function(sp){var x=+sp.dataset.i;sp.classList.toggle('now',x===i);sp.classList.toggle('heard',x<i)});
  lastEl=el;
}

/* text -> what is actually said */
function cleanSpeech(t,lang){
  t=t.replace(/[­​﻿]/g,'')
     .replace(/https?:\/\/\S+|www\.\S+/gi,lang==='en'?'a web link':'')
     .replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g,'')
     .replace(/\s*[—–]\s*/g,', ');
  if(lang==='en'){
    t=t.replace(/\be\.g\./gi,'for example').replace(/\bi\.e\./gi,'that is').replace(/\bvs\./gi,'versus')
       .replace(/\bFigs?\./g,'Figure').replace(/\bDr\./g,'Doctor').replace(/\bMr\./g,'Mister').replace(/\bMrs\./g,'Missus').replace(/\bProf\./g,'Professor').replace(/&/g,' and ');
  }
  return t.replace(/\s+/g,' ').trim();
}
function chunkText(t,max){
  if(t.length<=max) return [t];
  var out=[],rest=t,m,last,seg,re;
  while(rest.length>max){
    seg=rest.slice(0,max+1);last=-1;
    re=/[,;:)]\s|[、，،；：。]/g;
    while((m=re.exec(seg))) last=m.index+1;
    if(last<max*0.35) last=seg.lastIndexOf(' ');
    if(last<max*0.35) last=max;
    out.push(rest.slice(0,last).trim());rest=rest.slice(last).trim();
  }
  if(rest) out.push(rest);
  return out.filter(Boolean);
}
var CHUNK=170;

/* one utterance, with a watchdog: reports 'end', 'stall' or 'error:<code>' exactly once */
function speakOne(text,useVoice,done){
  var fin=false,started=false,u,wd1,wd2;
  function finish(st){if(fin) return;fin=true;clearTimeout(wd1);clearTimeout(wd2);done(st)}
  try{
    u=new SpeechSynthesisUtterance(text);
    u.rate=S.rate;
    u.lang=useVoice?useVoice.lang:(book&&book.lang?book.lang:'');
    if(useVoice) u.voice=useVoice;
  }catch(e){done('error:construct');return}
  keepRefs.push(u);if(keepRefs.length>6) keepRefs.shift();     /* some engines drop callbacks if the utterance is garbage collected */
  u.onstart=function(){started=true};
  u.onend=function(){finish('end')};
  u.onerror=function(e){
    var er=e&&e.error||'unknown';
    if(er==='interrupted'||er==='canceled') finish('cancel');else finish('error:'+er);
  };
  var est=text.length/(12*Math.max(0.5,S.rate))*1000;
  wd1=setTimeout(function(){if(!started&&!fin) finish('stall')},window.__wdStart||6000);          /* never began */
  wd2=setTimeout(function(){if(!fin) finish('stall')},est*1.7+(window.__wdExtra||5000));           /* began but never ended */
  try{synth.speak(u)}catch(e){finish('error:speak')}
  return function abandon(){fin=true;clearTimeout(wd1);clearTimeout(wd2)};
}
function itemSpeech(it){
  var L=bookLang();
  if(it.k==='cover') return book.title+(book.author&&book.author!=='Your upload'?', by '+book.author:'')+'.';
  if(it.k==='img') return it.cap?(/^(fig|plate|image|photo|illustration|diagram)/i.test(it.cap)?'':'Figure. ')+cleanSpeech(it.cap,L):'Figure.';
  return cleanSpeech(it.say||it.t,L);
}
function sleepCheck(nextI){
  if(sleepAt&&Date.now()>=sleepAt){sleepAt=0;pause();toast('Sleep timer ended');sleepUi();return true}
  if(sleepEnd&&nextI<book.items.length&&book.items[nextI].c!==sleepChap){sleepEnd=false;pause();toast('Paused at the end of the chapter');sleepUi();return true}
  return false;
}
function run(i,my){
  if(my!==token||!playing) return;
  var its=book.items;
  if(i>=its.length){stopAll();toast('End of book');return}
  if(i>0&&sleepCheck(i)) {curS=i;return}
  var it=its[i];
  curS=i;mark(i);
  if(i%4===0) store.set('pos:'+book.id,it.i);
  var text=itemSpeech(it);
  if(!text){run(i+1,my);return}
  var chunks=chunkText(text,CHUNK),gap=it.k==='cover'?500:it.k==='img'?700:it.k==='h'?350:0;
  var useVoice=voice,triedDefault=false;
  (function next(k,attempt){
    if(my!==token||!playing) return;
    if(k>=chunks.length){
      if(gap) setTimeout(function(){run(i+1,my)},gap);else run(i+1,my);
      return;
    }
    speakOne(chunks[k],useVoice,function(st){
      if(my!==token||!playing) return;
      if(st==='end'){failRun=0;next(k+1,0);return}
      if(st==='cancel'){          /* something outside the app stopped speech: another tab, a call, the system */
        playing=false;token++;ui();releaseBackground();return;
      }
      /* stall or error: try again, then with the default voice, then skip this piece */
      failRun++;
      if(/not-allowed/.test(st)){playing=false;token++;ui();toast('Tap play to allow audio.');return}
      if(failRun>=5){stopAll();toast('The voice stopped responding. Try another voice in Reading settings, or reload the page.');return}
      try{synth.cancel()}catch(e){}
      if(attempt===0){setTimeout(function(){next(k,1)},150);return}
      if(!triedDefault&&useVoice){triedDefault=true;useVoice=null;setTimeout(function(){next(k,1)},150);return}
      next(k+1,0);
    });
  })(0,0);
}
async function speakFrom(i){
  if(!synth) return;
  token++;var my=token;
  try{synth.cancel()}catch(e){}
  playing=true;failRun=0;
  if(sleepEnd&&book.items[i]) sleepChap=book.items[i].c;
  app.classList.add('speaking');
  ui();
  if(!(synth.getVoices()||[]).length) await waitForVoices(1500);
  if(my!==token) return;
  if(!voice&&bookLang()!=='en'&&voices.length&&!speakFrom.warned){speakFrom.warned=1;toast('No '+langName(bookLang())+' voice on this device. Add one in your system settings. Using the default voice.')}
  holdBackground();
  setTimeout(function(){run(i,my)},IS_IOS?160:70);
}
function pause(){
  playing=false;token++;
  if(synth){try{synth.cancel()}catch(e){}}
  ui();releaseBackground();
}
function stopAll(){
  playing=false;token++;curS=-1;sleepAt=0;sleepEnd=false;sleepUi();
  if(synth){try{synth.cancel()}catch(e){}}
  app.classList.remove('speaking');
  document.querySelectorAll('.s.now,.s.heard').forEach(function(s){s.classList.remove('now','heard')});
  lastEl=null;
  ui();releaseBackground();
}
function togglePlay(){
  if(!synth){toast('This browser has no built-in voice. Try Chrome, Edge or Safari.');return}
  if(playing){pause();return}
  if(mode!=='listen') setMode('listen');
  var start=(curS>=0&&itemCard[curS]===curCard)?curS:cards[curCard].first;
  speakFrom(start);
}
function restartHere(){if(playing&&curS>=0) speakFrom(curS)}
function go(d){
  var n=Math.min(cards.length-1,Math.max(0,curCard+d));
  if(n===curCard) return;
  autoScroll();scrollToCard(n,true);
  if(playing) speakFrom(cards[n].first);
}
function setMode(m){
  mode=m;
  $('#seg').dataset.v=m;
  $('#mRead').setAttribute('aria-pressed',String(m==='read'));
  $('#mListen').setAttribute('aria-pressed',String(m==='listen'));
  app.classList.toggle('listen',m==='listen');
  if(m==='read') stopAll();
}

/* ---------- keeping speech alive when the screen is off or the tab is hidden ---------- */
var wake=null,keepAudio=null,keepUrl='';
function silentWav(){
  if(keepUrl) return keepUrl;
  var n=8000,b=new Uint8Array(44+n),dv=new DataView(b.buffer),w=function(o,s){for(var i=0;i<s.length;i++) b[o+i]=s.charCodeAt(i)};
  w(0,'RIFF');dv.setUint32(4,36+n,true);w(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);
  dv.setUint32(24,8000,true);dv.setUint32(28,8000,true);dv.setUint16(32,1,true);dv.setUint16(34,8,true);w(36,'data');dv.setUint32(40,n,true);
  for(var i=0;i<n;i++) b[44+i]=128;
  keepUrl=URL.createObjectURL(new Blob([b],{type:'audio/wav'}));
  return keepUrl;
}
function holdBackground(){
  try{
    if(navigator.wakeLock&&!wake&&document.visibilityState==='visible'){
      navigator.wakeLock.request('screen').then(function(l){wake=l;l.addEventListener('release',function(){wake=null})},function(){});
    }
  }catch(e){}
  if(bgOn){
    try{
      if(!keepAudio){keepAudio=new Audio();keepAudio.loop=true;keepAudio.volume=0.02;keepAudio.setAttribute('playsinline','');keepAudio.src=silentWav()}
      var pr=keepAudio.play();if(pr&&pr.catch) pr.catch(function(){});
    }catch(e){}
  }
  setSession();
}
function releaseBackground(){
  try{if(wake){wake.release().catch(function(){});wake=null}}catch(e){}
  try{if(keepAudio) keepAudio.pause()}catch(e){}
  try{if('mediaSession' in navigator) navigator.mediaSession.playbackState=playing?'playing':'paused'}catch(e){}
}
function setSession(){
  try{
    if(!('mediaSession' in navigator)||!book) return;
    var art=book.cover?[{src:book.cover,sizes:'240x320',type:'image/jpeg'}]:[];
    navigator.mediaSession.metadata=new MediaMetadata({title:book.title,artist:book.author&&book.author!=='Your upload'?book.author:'Quill',album:(book.chapters&&book.chapters[book.items[Math.max(0,curS)].c]||{}).title||'',artwork:art});
    navigator.mediaSession.playbackState='playing';
    var ms=navigator.mediaSession,set=function(a,f){try{ms.setActionHandler(a,f)}catch(e){}};
    set('play',function(){if(!playing) togglePlay()});
    set('pause',function(){if(playing) pause()});
    set('nexttrack',function(){go(1)});
    set('previoustrack',function(){go(-1)});
    set('stop',function(){pause()});
  }catch(e){}
}
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible'||!playing||!synth) return;
  holdBackground();
  /* if the system silenced speech while hidden, pick up where we were */
  setTimeout(function(){if(playing&&curS>=0&&!synth.speaking&&!synth.pending) speakFrom(curS)},400);
});

/* ---------- sleep timer ---------- */
var sleepM='0';
function sleepUi(){
  var el=$('#sleepOpts');if(!el) return;
  var key=sleepEnd?'end':(sleepAt?sleepM:'0');
  el.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.m===key))});
}
function setSleep(m){
  clearTimeout(sleepTimer);sleepAt=0;sleepEnd=false;sleepM=String(m);
  if(m==='end'){sleepEnd=true;sleepChap=curS>=0?book.items[curS].c:(cards[curCard]&&cards[curCard].items[0]?cards[curCard].items[0].c:-1)}
  else if(+m>0){
    sleepAt=Date.now()+(+m)*60000;
    sleepTimer=setTimeout(function(){if(playing&&sleepAt&&Date.now()>=sleepAt-500){sleepAt=0;pause();toast('Sleep timer ended');sleepUi()}},(+m)*60000+400);
  }
  sleepUi();
  if(m!=='0') toast(m==='end'?'Will pause at the end of this chapter':'Sleeping in '+m+' minutes');
}
