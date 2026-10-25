(function(){
'use strict';
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var store={
  get:function(k,d){try{var v=localStorage.getItem('folio:'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set:function(k,v){try{localStorage.setItem('folio:'+k,JSON.stringify(v))}catch(e){}}
};
var tick=function(ms){return new Promise(function(r){setTimeout(r,ms||0)})};
var raf=function(){return new Promise(function(r){requestAnimationFrame(function(){r()})})};

var ICON={
  play:'<svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause:'<svg width="26" height="26" viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  zoom:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M10.5 8v5M8 10.5h5"/></svg>',
  plus:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

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

/* ---------- book model ---------- */
var ABBR=/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|Fig|No)\.|\b[A-Z]\.|\be\.g\.|\bi\.e\.)["”’')\]]*$/;
function splitSentences(t){
  var out=[],cur='',i,ch,j,s;
  for(i=0;i<t.length;i++){
    ch=t[i];cur+=ch;
    if('.!?…'.indexOf(ch)>-1){
      j=i+1;
      while(j<t.length&&/["”’')\]]/.test(t[j])){cur+=t[j];j++}
      i=j-1;
      if(j>=t.length||/\s/.test(t[j])){
        s=cur.trim();
        if(!ABBR.test(s)&&!/^\(?\d{1,2}[.)]$/.test(s)){out.push(s);cur=''}
      }
    }
  }
  if(cur.trim()) out.push(cur.trim());
  return out;
}
function buildBook(meta,chapters){
  if(!chapters.length||!chapters[0].cover||!chapters[0].blocks.length||chapters[0].blocks[0].type!=='cover') chapters=[{title:'Cover',kicker:'',cover:true,blocks:[{type:'cover'}]}].concat(chapters);
  var items=[],p=0,words=0;
  chapters.forEach(function(ch,ci){
    var first=true;
    ch.blocks.forEach(function(b){
      if(b.type==='cover'){
        items.push({i:items.length,k:'cover',src:b.src,thumb:b.thumb,c:ci,ch0:first});first=false;
        meta.cover=b.thumb||b.src||'';
      }else if(b.type==='img'){
        items.push({i:items.length,k:'img',svg:b.svg,src:b.src,cap:b.caption,w:b.w,h:b.h,c:ci,ch0:first});first=false;
      }else if(b.type==='h'){
        var say=b.text.replace(/\s*\n+\s*/g,'. ');
        if(!/[.!?:]$/.test(say)) say+='.';
        items.push({i:items.length,k:'h',t:b.text,say:say,p:-1,c:ci,ch0:first});first=false;
      }else{
        p++;
        splitSentences(b.text).forEach(function(s){
          items.push({i:items.length,k:'s',t:s,p:p,c:ci,ch0:first});first=false;
          words+=s.split(/\s+/).length;
        });
      }
    });
  });
  meta.chapters=chapters;meta.items=items;meta.words=words;
  return meta;
}

var FIG='<svg viewBox="0 0 320 190" role="img" aria-label="One wide page of text on the left, three narrow cards on the right"><rect class="fa" x="14" y="14" width="124" height="162" rx="10"/><g class="fl"><rect x="28" y="32" width="96" height="5" rx="2.5"/><rect x="28" y="45" width="88" height="5" rx="2.5"/><rect x="28" y="58" width="96" height="5" rx="2.5"/><rect x="28" y="71" width="70" height="5" rx="2.5"/><rect x="28" y="92" width="96" height="5" rx="2.5"/><rect x="28" y="105" width="92" height="5" rx="2.5"/><rect x="28" y="118" width="84" height="5" rx="2.5"/><rect x="28" y="131" width="96" height="5" rx="2.5"/><rect x="28" y="144" width="52" height="5" rx="2.5"/></g><path class="fs" d="M152 95h28m-8-8 8 8-8 8"/><rect class="fb" x="214" y="10" width="84" height="150" rx="12"/><rect class="fb2" x="206" y="20" width="84" height="150" rx="12"/><rect class="fc" x="198" y="30" width="84" height="150" rx="12"/><g class="fcl"><rect x="212" y="52" width="56" height="5" rx="2.5"/><rect x="212" y="65" width="50" height="5" rx="2.5"/><rect x="212" y="78" width="56" height="5" rx="2.5"/><rect x="212" y="91" width="40" height="5" rx="2.5"/><rect x="212" y="112" width="56" height="5" rx="2.5"/><rect x="212" y="125" width="46" height="5" rx="2.5"/></g></svg>';

var sample=buildBook({id:'sample',title:'Reading on Glass',author:'Sample text',tag:'Sample',alt:false},[
  {title:'Why the page moved',blocks:[
    {type:'p',text:'For most of history, a page was a fixed object. Its size was chosen by a printer, and the reader adapted to it. Margins, line length and type size were all decided before the book reached anyone’s hands.'},
    {type:'p',text:'Screens reversed that arrangement. The reader now holds a window of unknown size, and the text has to adapt instead. A phone, a tablet and a desktop monitor each ask for a different shape of paragraph.'},
    {type:'p',text:'Early e-readers answered by copying the printed page and shrinking it. That worked on large screens and failed on small ones. Pinching and panning replaced the simple act of turning a leaf.'},
    {type:'p',text:'A better answer is to treat the book as a stream of sentences. The stream can be cut into pieces that fit whatever window is available. Each piece then becomes one screen of reading.'}
  ]},
  {title:'The size of a thought',blocks:[
    {type:'p',text:'A comfortable screen of text holds roughly as much as a person can take in with one look. On a phone that is a short paragraph, and on a tablet it is two or three. The unit that matters is the glance, not the page number.'},
    {type:'p',text:'Cards make that unit visible. Each one ends where the screen ends, so the eye always knows how much is left before the next swipe. A steady rhythm of small finishes keeps the reader moving.'},
    {type:'img',svg:FIG,caption:'Figure 1. One chapter, cut into cards that fit the screen.'},
    {type:'p',text:'Good breaks fall between sentences. A card should never end halfway through a word, and it should avoid stopping on a lone short sentence when the next one belongs with it. Careful cutting is most of the craft.'},
    {type:'p',text:'Images deserve a card of their own. Placed between paragraphs, they give the reader a pause and a change of pace. A caption keeps the picture tied to the surrounding text.'}
  ]},
  {title:'Listening is reading',blocks:[
    {type:'p',text:'Reading aloud has always been a normal way to meet a book. Children are read to, and many adults follow a story best by ear. A good reading app should treat the two modes as one activity.'},
    {type:'p',text:'That means the place in the book is shared. If you stop listening at the end of a chapter, the cards open at the same sentence. If you stop reading, the voice picks up from the card on screen.'},
    {type:'p',text:'The voice itself can come from the device. Phones and computers ship with speech built in, and it costs nothing to use. Newer voices sound better, and most improve with each system update.'},
    {type:'p',text:'Highlighting the sentence being spoken helps the eye follow along. It also makes errors easy to spot, such as a name the voice pronounces oddly. Those moments are worth noting so they can be fixed later.'}
  ]}
]);
var VEDIC=/*@@VEDIC@@*/[];
var vedic=buildBook({id:'vedic-report',title:'Vedic Report',author:'AstroSage',tag:'PDF',alt:true,note:'56 pages'},VEDIC);
/* ---------- shelf: groups, colours, order, rename, delete ---------- */
var PALN=8,PALNAMES=["Sage", "Sand", "Blush", "Sky", "Lavender", "Butter", "Peach", "Mist"];
var gone=store.get('gone',[]),ups=store.get('ups',{}),metaO=store.get('meta',{}),orderO=store.get('order',[]);
var groups=store.get('groups',[]),flt=store.get('flt','all');
var DEMO=/*@@DEMO@@*/[];
var demo=buildBook({id:'figures-demo',title:'Pictures in the Flow',author:'Demo book',tag:'Demo',alt:true,note:'3 figures'},DEMO);
vedic.color=0;sample.color=-1;demo.color=3;
var builtins=[vedic,sample,demo];
var books=builtins.filter(function(b){return gone.indexOf(b.id)<0});
Object.keys(ups).forEach(function(id){
  try{var u=ups[id];var b=buildBook(u.meta,u.chapters);books.push(b)}catch(e){}
});
function groupById(id){return groups.filter(function(g){return g.id===id})[0]}
books.forEach(function(b){
  var m=metaO[b.id];
  if(m){if(m.title) b.title=m.title;if(typeof m.color==='number') b.color=m.color;if(typeof m.group==='string') b.group=m.group}
  if(typeof b.color!=='number') b.color=-1;
  if(typeof b.group!=='string'||!groupById(b.group)) b.group='';
});
if(flt!=='all'&&!groupById(flt)) flt='all';
books.sort(function(a,b){
  var i=orderO.indexOf(a.id),j=orderO.indexOf(b.id);
  return (i<0?999:i)-(j<0?999:j);
});
function persistLib(){
  store.set('order',books.map(function(b){return b.id}));
  var m={};books.forEach(function(b){m[b.id]={title:b.title,color:b.color,group:b.group}});
  store.set('meta',m);store.set('gone',gone);store.set('groups',groups);store.set('flt',flt);
}
function persistUps(){
  try{localStorage.setItem('folio:ups',JSON.stringify(ups));return true}catch(e){return false}
}
function nextColor(){
  var used=books.map(function(b){return b.color}),i;
  for(i=0;i<PALN;i++) if(used.indexOf(i)<0) return i;
  return books.length % PALN;
}
function addGroup(name){
  name=name.replace(/\s+/g,' ').trim();
  if(!name) return null;
  var ex=groups.filter(function(g){return g.name.toLowerCase()===name.toLowerCase()})[0];
  if(ex) return ex;
  var g={id:'g'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36),name:name};
  groups.push(g);return g;
}
var book=null,edit=false,delId=null,delT=0,rnBook=null,rnColor=-1,rnGroup='',gEdit=null,gArm=false;
var IC={
  left:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  pen:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  bin:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>'
};

/* ---------- shelf ---------- */
function minutes(b){return Math.max(1,Math.round(b.words/230))}
function coverCls(b){return b.color>=0?' c'+b.color:(b.alt?' alt':'')}
function sections(){
  if(flt!=='all') return [{g:groupById(flt),list:books.filter(function(b){return b.group===flt}),single:true}];
  if(!groups.length) return [{g:null,list:books.slice(),single:true}];
  var out=groups.map(function(g){return {g:g,list:books.filter(function(b){return b.group===g.id})}});
  out.push({g:null,other:true,list:books.filter(function(b){return !b.group})});
  return out;
}
function tile(b,ix,n){
  var frac=b.items.length?Math.min(1,(store.get('pos:'+b.id,0)||0)/b.items.length):0;
  var pg=(!edit&&frac>0.01)?'<div class="pg" aria-hidden="true"><i style="--w:'+Math.round(frac*100)+'%"></i></div>':'';
  var cover=b.cover
    ?'<div class="cover thumbed'+coverCls(b)+'"><span class="tag">'+esc(b.tag)+'</span><img class="thumb" src="'+b.cover+'" alt="" decoding="async"></div>'
    :'<div class="cover'+coverCls(b)+'"><span class="tag">'+esc(b.tag)+'</span><div><div class="ct">'+esc(b.title)+'</div><div class="ca">'+esc(b.author)+'</div></div></div>';
  var meta='<div><div class="bt">'+esc(b.title)+'</div><div class="bm num">'+minutes(b)+' min read'+(b.note?' · '+esc(b.note):'')+(!edit&&frac>0.01?' · '+Math.round(frac*100)+'%':'')+'</div></div>';
  if(!edit) return '<button class="book" type="button" data-id="'+esc(b.id)+'">'+cover+meta+pg+'</button>';
  var arm=delId===b.id;
  return '<div class="book editing" data-id="'+esc(b.id)+'">'+cover+meta+
    '<div class="tools">'+
    '<button type="button" data-a="left" aria-label="Move '+esc(b.title)+' earlier"'+(ix===0?' disabled':'')+'>'+IC.left+'</button>'+
    '<button type="button" data-a="right" aria-label="Move '+esc(b.title)+' later"'+(ix===n-1?' disabled':'')+'>'+IC.right+'</button>'+
    '<button type="button" data-a="rename" aria-label="Edit '+esc(b.title)+'">'+IC.pen+'</button>'+
    '<span class="sp"></span>'+
    '<button type="button" data-a="del" class="'+(arm?'arm':'')+'" aria-label="'+(arm?'Confirm delete ':'Delete ')+esc(b.title)+'">'+(arm?'Delete?':IC.bin)+'</button>'+
    '</div></div>';
}
var ADD='<div class="book add"><div class="cover">'+ICON.plus+'<div class="ct">Add a book</div><div class="ca">PDF or text file</div></div><input class="ov" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" aria-label="Add a book from a PDF or text file"></div>';
function renderChips(){
  var box=$('#fchips');
  box.hidden=!(groups.length||edit);
  var h='<button type="button" class="chip" data-f="all" aria-pressed="'+(flt==='all')+'">All</button>'+
    groups.map(function(g){return '<button type="button" class="chip" data-f="'+g.id+'" aria-pressed="'+(flt===g.id)+'">'+esc(g.name)+'</button>'}).join('');
  if(edit) h+='<button type="button" class="chip ghost" data-f="+">+ Group</button>';
  box.innerHTML=h;
  $('#gManage').hidden=!(edit&&flt!=='all');
}
function renderShelf(focusSel){
  var secs=sections(),h='';
  secs.forEach(function(sec){
    var n=sec.list.length;
    if(!sec.single){
      if(sec.other&&!n) return;
      if(!n&&!edit) return;
      h+='<div class="gh"><div>'+esc(sec.g?sec.g.name:'Other')+'</div><span class="num">'+n+(n===1?' book':' books')+'</span></div>';
    }
    if(!n&&!sec.single){h+='<p class="empty">Empty. Move books here with the pencil.</p>';return}
    h+='<div class="shelf">'+sec.list.map(function(b,ix){return tile(b,ix,n)}).join('')+((sec.single&&!edit)?ADD:'')+'</div>';
  });
  if(!edit&&!secs[0].single) h+='<div class="shelf">'+ADD+'</div>';
  if(flt!=='all'&&!secs[0].list.length&&edit) h='<p class="empty">Nothing in this group yet. Tap the pencil on any book to move it here.</p>';
  $('#shelf').innerHTML=h;
  renderChips();
  $('#editBtn').textContent=edit?'Done':'Edit';
  $('#editBtn').setAttribute('aria-pressed',String(edit));
  $('#libSub').textContent=edit?'Reorder, group, rename, recolour or remove books.':'Add a book, then swipe through it or have it read aloud.';
  $('#restoreWrap').hidden=!(edit&&gone.length);
  if(focusSel){var f=document.querySelector(focusSel);if(f&&!f.disabled) f.focus()}
}
$('#shelf').addEventListener('change',function(e){
  var inp=e.target;
  if(!inp||inp.type!=='file') return;
  var f=inp.files&&inp.files[0];
  inp.value='';
  if(f) importFile(f);
});
function bookById(id){return books.filter(function(x){return x.id===id})[0]}
$('#shelf').addEventListener('click',function(e){
  var el=e.target.closest('.book[data-id]');
  if(!el) return;
  var bk=bookById(el.dataset.id);
  if(!bk) return;
  if(!edit){openBook(bk);return}
  var a=e.target.closest('[data-a]');
  if(!a) return;
  var act=a.dataset.a,sel='.book[data-id="'+bk.id+'"] [data-a="'+act+'"]';
  if(act!=='del'){delId=null;clearTimeout(delT)}
  if(act==='left'||act==='right'){
    var sec=books.filter(function(b){return b.group===bk.group}),k=sec.indexOf(bk),nb=sec[act==='left'?k-1:k+1];
    if(!nb) return;
    var i1=books.indexOf(bk),i2=books.indexOf(nb);
    books[i1]=nb;books[i2]=bk;
    persistLib();
    renderShelf(sel);
    if(!document.querySelector(sel+':not(:disabled)')){
      var other=act==='left'?'right':'left',o=document.querySelector('.book[data-id="'+bk.id+'"] [data-a="'+other+'"]');
      if(o) o.focus();
    }
  }else if(act==='rename'){
    openRename(bk);
  }else if(act==='del'){
    if(delId!==bk.id){
      delId=bk.id;clearTimeout(delT);
      delT=setTimeout(function(){delId=null;renderShelf()},3500);
      renderShelf(sel);return;
    }
    clearTimeout(delT);delId=null;
    books.splice(books.indexOf(bk),1);
    if(builtins.indexOf(bk)>=0){if(gone.indexOf(bk.id)<0) gone.push(bk.id)}
    else{delete ups[bk.id];persistUps()}
    try{localStorage.removeItem('folio:pos:'+bk.id)}catch(err){}
    persistLib();
    renderShelf();
    toast('Removed “'+bk.title+'”');
  }
});
$('#editBtn').addEventListener('click',function(){
  edit=!edit;delId=null;clearTimeout(delT);
  renderShelf();
});
$('#restore').addEventListener('click',function(){
  builtins.forEach(function(b){if(books.indexOf(b)<0){b.group='';books.push(b)}});
  gone=[];persistLib();renderShelf();toast('Restored the sample books');
});

/* group chips */
$('#fchips').addEventListener('click',function(e){
  var c=e.target.closest('[data-f]');
  if(!c) return;
  if(c.dataset.f==='+'){openGroup(null);return}
  flt=c.dataset.f;delId=null;clearTimeout(delT);
  persistLib();renderShelf('#fchips [data-f="'+flt+'"]');
});
$('#gManage').addEventListener('click',function(){var g=groupById(flt);if(g) openGroup(g)});
var gs=$('#gSheet');
function openGroup(g){
  gEdit=g;gArm=false;
  $('#gT').textContent=g?'Edit group':'New group';
  $('#gIn').value=g?g.name:'';
  $('#gDel').hidden=!g;$('#gDel').textContent='Delete group';
  gs.hidden=false;void gs.offsetWidth;gs.classList.add('open');
  setTimeout(function(){$('#gIn').focus();$('#gIn').select()},60);
}
function closeGroup(){gs.classList.remove('open');setTimeout(function(){gs.hidden=true},300);gEdit=null}
function saveGroup(){
  var name=$('#gIn').value.replace(/\s+/g,' ').trim();
  if(!name){closeGroup();return}
  if(gEdit){gEdit.name=name}
  else{var g=addGroup(name);flt=g.id}
  persistLib();closeGroup();renderShelf();
}
$('#gSave').addEventListener('click',saveGroup);
$('#gScrim').addEventListener('click',closeGroup);
$('#gIn').addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();saveGroup()}
  if(e.key==='Escape'){e.preventDefault();closeGroup()}
});
$('#gDel').addEventListener('click',function(){
  if(!gEdit) return;
  if(!gArm){gArm=true;$('#gDel').textContent='Tap again to delete. Books stay on your shelf.';return}
  var id=gEdit.id,nm=gEdit.name;
  books.forEach(function(b){if(b.group===id) b.group=''});
  groups=groups.filter(function(g){return g.id!==id});
  flt='all';persistLib();closeGroup();renderShelf();toast('Deleted group “'+nm+'”');
});

/* edit book sheet: title, colour, group */
var rn=$('#rnSheet');
function drawSwatches(){
  $('#rnSw').innerHTML=PALNAMES.map(function(n,i){
    return '<button type="button" class="sw c'+i+'" data-c="'+i+'" aria-label="'+n+'" aria-pressed="'+(rnColor===i)+'"></button>';
  }).join('');
}
function drawGroupOpts(){
  $('#rnGr').innerHTML='<button type="button" data-g="" aria-pressed="'+(rnGroup==='')+'">None</button>'+
    groups.map(function(g){return '<button type="button" data-g="'+g.id+'" aria-pressed="'+(rnGroup===g.id)+'">'+esc(g.name)+'</button>'}).join('');
}
function openRename(bk){
  rnBook=bk;rnColor=bk.color;rnGroup=bk.group;
  $('#rnIn').value=bk.title;$('#rnNew').value='';
  drawSwatches();drawGroupOpts();
  rn.hidden=false;void rn.offsetWidth;rn.classList.add('open');
  setTimeout(function(){$('#rnIn').focus();$('#rnIn').select()},60);
}
function closeRename(){
  rn.classList.remove('open');
  setTimeout(function(){rn.hidden=true},300);
  rnBook=null;
}
function saveRename(){
  if(!rnBook) return;
  var t=$('#rnIn').value.replace(/\s+/g,' ').trim();
  if(t) rnBook.title=t;
  if(rnColor>=0) rnBook.color=rnColor;
  var ng=addGroup($('#rnNew').value);
  rnBook.group=ng?ng.id:rnGroup;
  persistLib();
  var sel='.book[data-id="'+rnBook.id+'"] [data-a="rename"]';
  closeRename();
  renderShelf(sel);
}
$('#rnSw').addEventListener('click',function(e){
  var b=e.target.closest('[data-c]');
  if(!b) return;
  rnColor=+b.dataset.c;drawSwatches();
  var f=$('#rnSw').querySelector('[data-c="'+rnColor+'"]');if(f) f.focus();
});
$('#rnGr').addEventListener('click',function(e){
  var b=e.target.closest('[data-g]');
  if(!b) return;
  rnGroup=b.dataset.g;$('#rnNew').value='';drawGroupOpts();
  var f=$('#rnGr').querySelector('[data-g="'+rnGroup+'"]');if(f) f.focus();
});
$('#rnSave').addEventListener('click',saveRename);
$('#rnScrim').addEventListener('click',closeRename);
['#rnIn','#rnNew'].forEach(function(q){$(q).addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();saveRename()}
  if(e.key==='Escape'){e.preventDefault();closeRename()}
})});

/* ---------- pagination ---------- */
var cards=[],itemCard=new Int32Array(0),cardEls=[],curCard=0,layoutKey='',laying=false;
var scroller=$('#scroller'),stage=$('#stage');

function cardInner(arr){
  var f=arr[0];if(!f) return '';
  var h='',ch,curP=null,open=false,i,it;
  if(f.ch0&&!book.chapters[f.c].cover){
    ch=book.chapters[f.c];
    h+='<div class="kicker">'+esc(ch.kicker||('Chapter '+(f.c+1)))+'</div><h2>'+esc(ch.title)+'</h2>';
  }
  if(f.k==='cover'){
    var bc=book.color>=0?' c'+book.color:'';
    var art=f.src?'<div class="cvp-art"><img src="'+f.src+'" alt="Cover of '+esc(book.title)+'" decoding="async"></div>':'<div class="cvp-mark" aria-hidden="true"></div>';
    return '<div class="cvp'+bc+'">'+art+'<div class="cvp-t">'+esc(book.title)+'</div>'+(book.author&&book.author!=='Your upload'?'<div class="cvp-a">'+esc(book.author)+'</div>':'')+'<div class="cvp-m num">'+minutes(book)+' min read'+(book.note?' \u00b7 '+esc(book.note):'')+'</div><div class="cvp-h">Swipe up to begin</div></div>';
  }
  if(f.k==='img'){
    var media=f.src?'<button type="button" class="zoom" data-i="'+f.i+'" aria-label="View image larger"><img src="'+f.src+'" alt="'+esc(f.cap||'Figure from the book')+'" decoding="async"><span class="zi" aria-hidden="true">'+ICON.zoom+'</span></button>':f.svg;
    return h+'<figure class="fig'+(f.src?' pic':'')+'">'+media+(f.cap?'<figcaption>'+esc(f.cap)+'</figcaption>':'')+'</figure>';
  }
  for(i=0;i<arr.length;i++){
    it=arr[i];
    if(it.k==='h'){
      if(open){h+='</p>';open=false;curP=null}
      h+='<h3 class="subhead"><span class="s" data-i="'+it.i+'">'+esc(it.t).replace(/\n/g,'<br>')+'</span></h3>';
      continue;
    }
    if(!open||it.p!==curP){
      if(open) h+='</p>';
      h+='<p>';open=true;curP=it.p;
    }
    h+='<span class="s" data-i="'+it.i+'">'+esc(it.t)+'</span> ';
  }
  if(open) h+='</p>';
  return h;
}
async function paginate(){
  var its=book.items,body=$('#measureBody'),t=$('#measureT'),tries=0;
  while(body.clientHeight<60&&tries<20){await tick(50);tries++}
  var cur=[],n=0,it;
  cards=[];
  function fits(a){t.innerHTML=cardInner(a);return t.offsetHeight<=body.clientHeight+1}
  function flush(){if(cur.length){cards.push({items:cur,first:cur[0].i,c:cur[0].c});cur=[]}}
  for(var x=0;x<its.length;x++){
    it=its[x];
    if(++n%200===0){busy('Setting the page',n/its.length);await tick(0)}
    if(it.k==='img'||it.k==='cover'){flush();cur=[it];flush();continue}
    if(it.ch0) flush();
    if(!cur.length){cur=[it];continue}
    cur.push(it);
    if(!fits(cur)){
      cur.pop();
      var moved=[];
      while(cur.length>1&&cur[cur.length-1].k==='h') moved.unshift(cur.pop());
      flush();
      cur=moved.concat([it]);
    }
  }
  flush();
  if(!cards.length) cards.push({items:[],first:0,c:0});
}
function renderCards(){
  scroller.innerHTML=cards.map(function(c,n){
    return '<article class="card" data-n="'+n+'" aria-label="Card '+(n+1)+' of '+cards.length+'"><div class="card-body"><div class="t">'+cardInner(c.items)+'</div></div></article>';
  }).join('');
  cardEls=Array.prototype.slice.call(scroller.children);
  itemCard=new Int32Array(book.items.length);
  cards.forEach(function(c,n){c.items.forEach(function(it){itemCard[it.i]=n})});
  $('#scrub').max=Math.max(1,cards.length-1);
}
async function fontsReady(){
  try{
    await Promise.race([
      Promise.all([document.fonts.load('400 19px Literata'),document.fonts.load('600 28px "Instrument Sans"'),document.fonts.ready]),
      tick(1800)
    ]);
  }catch(e){}
}
async function layout(pos){
  if(laying) return;
  laying=true;
  busy('Setting the page',0);
  await raf();await fontsReady();await tick(30);
  await paginate();
  renderCards();
  layoutKey=keyNow();
  var p=Math.max(0,Math.min(book.items.length-1,pos||0));
  var n=itemCard.length?itemCard[p]:0;
  scroller.scrollTop=n*scroller.clientHeight;
  setCard(n);
  unbusy();
  laying=false;
  if(playing&&curS>=0) mark(curS,true);
}
function scrollToCard(n,smooth){
  var top=n*scroller.clientHeight;
  if(smooth&&!matchMedia('(prefers-reduced-motion:reduce)').matches) scroller.scrollTo({top:top,behavior:'smooth'});
  else scroller.scrollTop=top;
}
var scrub=$('#scrub');
function setCard(n){
  curCard=n;
  var c=cards[n];if(!c) return;
  $('#count').textContent=(n+1)+' / '+cards.length;
  var ch=book.chapters[c.c];
  $('#chLabel').textContent=ch?ch.title:'';
  scrub.value=n;
  scrub.style.setProperty('--p',(cards.length>1?n/(cards.length-1)*100:0)+'%');
  store.set('pos:'+book.id,c.first);
}

/* ---------- speech ---------- */
var synth=window.speechSynthesis||null;
var voices=[],voice=null,playing=false,token=0,curS=-1,mode='read',autoUntil=0,lastEl=null,utterRef=null;
function loadVoices(){
  if(!synth) return;
  var all=synth.getVoices()||[];
  var en=all.filter(function(v){return /^en/i.test(v.lang)});
  if(!en.length) en=all;
  var score=function(v){return (/natural|neural|premium|enhanced|siri|google/i.test(v.name)?2:0)+(/en[-_](IN|US|GB)/i.test(v.lang)?1:0)};
  en=en.slice().sort(function(a,b){return score(b)-score(a)||a.name.localeCompare(b.name)});
  voices=en;
  var sel=$('#voiceSel');
  sel.innerHTML=en.length?en.map(function(v){return '<option value="'+esc(v.voiceURI)+'">'+esc(v.name)+' · '+esc(v.lang)+'</option>'}).join(''):'<option value="">Device default</option>';
  voice=en.filter(function(v){return v.voiceURI===S.voice})[0]||en[0]||null;
  if(voice) sel.value=voice.voiceURI;
  voiceChip();
}
function voiceChip(){
  var n=voice?voice.name.replace(/^(Microsoft|Google)\s+/,'').split(/[\s(]/)[0]:'Voice';
  $('#voiceChip').textContent=n||'Voice';
}
if(synth){loadVoices();if(synth.addEventListener) synth.addEventListener('voiceschanged',loadVoices)}

function ui(){
  $('#play').innerHTML=playing?ICON.pause:ICON.play;
  $('#play').setAttribute('aria-label',playing?'Pause':'Play');
}
function autoScroll(){autoUntil=performance.now()+1000}
function mark(i,instant){
  var n=itemCard[i],el=cardEls[n];
  if(n!==curCard||instant){autoScroll();scrollToCard(n,!instant);if(instant) setCard(n)}
  if(lastEl&&lastEl!==el) lastEl.querySelectorAll('.s').forEach(function(sp){var x=+sp.dataset.i;sp.classList.remove('now');sp.classList.toggle('heard',x<i)});
  if(el) el.querySelectorAll('.s').forEach(function(sp){var x=+sp.dataset.i;sp.classList.toggle('now',x===i);sp.classList.toggle('heard',x<i)});
  lastEl=el;
}
function run(i,my){
  if(my!==token||!playing) return;
  var its=book.items;
  if(i>=its.length){stopAll();toast('End of book');return}
  var it=its[i];
  curS=i;mark(i);
  if(it.k==='cover'){
    var uc=new SpeechSynthesisUtterance(book.title+(book.author&&book.author!=='Your upload'?', by '+book.author:'')+'.');
    uc.rate=S.rate;
    if(voice){uc.voice=voice;uc.lang=voice.lang}
    uc.onend=function(){setTimeout(function(){run(i+1,my)},500)};
    uc.onerror=function(e){if(e&&(e.error==='interrupted'||e.error==='canceled')) return;run(i+1,my)};
    utterRef=uc;synth.speak(uc);
    return;
  }
  if(it.k==='img'){
    var uf=new SpeechSynthesisUtterance(it.cap?(/^(fig|plate|image|photo|illustration|diagram)/i.test(it.cap)?'':'Figure. ')+it.cap:'Figure.');
    uf.rate=S.rate;
    if(voice){uf.voice=voice;uf.lang=voice.lang}
    uf.onend=function(){setTimeout(function(){run(i+1,my)},700)};
    uf.onerror=function(e){if(e&&(e.error==='interrupted'||e.error==='canceled')) return;run(i+1,my)};
    utterRef=uf;synth.speak(uf);
    return;
  }
  var u=new SpeechSynthesisUtterance(it.say||it.t);
  u.rate=S.rate;
  if(voice){u.voice=voice;u.lang=voice.lang}
  u.onend=function(){run(i+1,my)};
  u.onerror=function(e){if(e&&(e.error==='interrupted'||e.error==='canceled')) return;run(i+1,my)};
  utterRef=u;
  synth.speak(u);
}
function speakFrom(i){
  if(!synth) return;
  synth.cancel();token++;
  var my=token;playing=true;
  app.classList.add('speaking');
  ui();
  setTimeout(function(){run(i,my)},60);
}
function pause(){
  playing=false;token++;
  if(synth) synth.cancel();
  ui();
}
function stopAll(){
  playing=false;token++;curS=-1;
  if(synth) synth.cancel();
  app.classList.remove('speaking');
  document.querySelectorAll('.s.now,.s.heard').forEach(function(s){s.classList.remove('now','heard')});
  lastEl=null;
  ui();
}
function togglePlay(){
  if(!synth){toast('This browser has no built-in voice.');return}
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

/* ---------- scrolling ---------- */
var rafId=0,settleT=0,scrubT=0;
scroller.addEventListener('scroll',function(){
  if(rafId) return;
  rafId=requestAnimationFrame(function(){
    rafId=0;
    var h=scroller.clientHeight||1;
    var n=Math.max(0,Math.min(cards.length-1,Math.round(scroller.scrollTop/h)));
    if(n!==curCard) setCard(n);
    clearTimeout(settleT);settleT=setTimeout(onSettle,240);
  });
},{passive:true});
function onSettle(){
  if(performance.now()<autoUntil) return;
  if(playing&&curS>=0&&itemCard[curS]!==curCard) speakFrom(cards[curCard].first);
}
scrub.addEventListener('input',function(){
  var n=+scrub.value;
  scrollToCard(n,false);
  if(playing){clearTimeout(scrubT);scrubT=setTimeout(function(){speakFrom(cards[n].first)},260)}
});

/* ---------- open / close ---------- */
async function openBook(b){
  book=b;
  $('#library').hidden=true;$('#reader').hidden=false;
  stopAll();setMode('read');
  await layout(store.get('pos:'+b.id,0));
}
$('#back').addEventListener('click',function(){
  stopAll();
  $('#reader').hidden=true;$('#library').hidden=false;
  renderShelf();
});
$('#mRead').addEventListener('click',function(){setMode('read')});
$('#mListen').addEventListener('click',function(){setMode('listen')});
$('#play').addEventListener('click',togglePlay);
$('#prev').addEventListener('click',function(){go(-1)});
$('#next').addEventListener('click',function(){go(1)});
$('#speed').addEventListener('click',function(){
  var i=RATES.indexOf(S.rate);S.rate=RATES[(i+1)%RATES.length];store.set('rate',S.rate);applyRate();restartHere();
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&!$('#lb').hidden){closeLb();return}
  if(e.key==='Escape'&&!$('#gSheet').hidden){closeGroup();return}
  if(e.key==='Escape'&&!$('#rnSheet').hidden){closeRename();return}
  if(e.key==='Escape'&&!$('#sheet').hidden){closeSheet();return}
  if(e.key===' '&&!$('#reader').hidden&&!/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)&&mode==='listen'){e.preventDefault();togglePlay()}
});

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
  voice=v;S.voice=v?v.voiceURI:'';store.set('voice',S.voice);voiceChip();restartHere();
});

/* ---------- resize ---------- */
function keyNow(){var b=$('#measureBody');return Math.round(b.clientWidth)+'x'+Math.round(b.clientHeight)+'x'+S.fs}
var rzT=0;
if(window.ResizeObserver){
  new ResizeObserver(function(){
    if($('#reader').hidden||laying) return;
    clearTimeout(rzT);
    rzT=setTimeout(function(){
      if(keyNow()!==layoutKey&&stage.clientWidth>0) layout(cards[curCard]?cards[curCard].first:0);
    },300);
  }).observe(stage);
}

/* ---------- importing ---------- */
/* Turns pdf.js page items into clean blocks: chapter titles, subheadings, paragraphs.
   Skips chart and table lines, ad images, repeated headers and footers. */
/*@@EXTRACT@@*/

function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=function(){
      if(!window.pdfjsLib){rej(new Error('pdf'));return}
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    s.onerror=function(){rej(new Error('pdf'))};
    document.head.appendChild(s);
  });
}
async function importFile(file){
  var title=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim()||'Untitled';
  var isPdf=/\.pdf$/i.test(file.name)||file.type==='application/pdf';
  var blocks;
  try{
    var t0=Date.now();
    busy('Opening file',0.02);$('#busyEta').hidden=false;$('#busyEta').textContent='Estimating time left\u2026';
    if(isPdf){
      var lib=await loadPdfJs();
      var buf=new Uint8Array(await file.arrayBuffer());
      blocks=await folioReadPdf(lib,buf,function(n,N){busy('Reading page '+n+' of '+N,n/N*0.9);etaLine(t0,n,N)});
    }else{
      blocks=(await file.text()).split(/\n\s*\n/).map(function(p){return p.replace(/\s+/g,' ').trim()}).filter(Boolean).map(function(p){return {t:'p',text:p}});
    }
  }catch(e){
    unbusy();toast('Could not read that file. Try a text-based PDF or a .txt file.');return;
  }
  var total=blocks.reduce(function(a,x){return a+x.text.length},0);
  if(total<200){unbusy();toast('No selectable text found. Scanned books need OCR, which this demo does not include.');return}
  busy('Cleaning the text',0.95);$('#busyEta').textContent='Almost done';await tick(20);
  var chapters=folioChapters(blocks,title);
  if(!chapters.length){unbusy();toast('No readable paragraphs found in that file.');return}
  var meta0={id:'u'+Date.now(),title:title,author:'Your upload',tag:isPdf?'PDF':'Text',alt:true};
  var b=buildBook(meta0,chapters);
  b.color=nextColor();
  b.group=(flt!=='all'&&groupById(flt))?flt:'';
  books.push(b);
  ups[b.id]={meta:{id:b.id,title:b.title,author:b.author,tag:b.tag,alt:true},chapters:chapters};
  var saved=persistUps();
  persistLib();
  unbusy();
  renderShelf();
  toast(saved?'Added \u201c'+title+'\u201d':'Added \u201c'+title+'\u201d \u00b7 too large to keep after you close this page');
}

/* image viewer: tap a picture to look closer, tap again to zoom in */
var lb=$('#lb');
function openLb(it){
  $('#lbImg').src=it.src;$('#lbImg').alt=it.cap||'Figure from the book';
  $('#lbCap').textContent=it.cap||'';$('#lbS').classList.remove('big');
  lb.hidden=false;$('#lbX').focus();
}
function closeLb(){lb.hidden=true;$('#lbImg').removeAttribute('src')}
document.addEventListener('click',function(e){
  var z=e.target.closest('.zoom');
  if(z&&book){var it=book.items[+z.dataset.i];if(it&&it.src) openLb(it);return}
  if(e.target.id==='lbImg'){$('#lbS').classList.toggle('big');return}
  if(e.target.id==='lbS'||e.target.id==='lbX') closeLb();
});
renderShelf();
ui();
if(!synth) toast('Listening needs a browser with built-in speech.');
})();