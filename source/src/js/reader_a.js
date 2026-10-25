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
    var art=(f.src&&!book.plain)?'<div class="cvp-art"><img src="'+esc(f.src)+'" alt="Cover of '+esc(book.title)+'" decoding="async"></div>':'<div class="cvp-mark" aria-hidden="true"></div>';
    return '<div class="cvp'+bc+'">'+art+'<div class="cvp-t">'+esc(book.title)+'</div>'+(book.author&&book.author!=='Your upload'?'<div class="cvp-a">'+esc(book.author)+'</div>':'')+'<div class="cvp-m num">'+minutes(book)+' min read'+(book.note?' \u00b7 '+esc(book.note):'')+'</div><div class="cvp-h">Swipe up to begin</div></div>';
  }
  if(f.k==='img'){
    var media=f.src?'<button type="button" class="zoom" data-i="'+f.i+'" aria-label="View image larger"><img src="'+esc(f.src)+'" alt="'+esc(f.cap||'Figure from the book')+'" decoding="async"><span class="zi" aria-hidden="true">'+ICON.zoom+'</span></button>':f.svg;
    return h+'<figure class="fig'+(f.src?' pic':'')+(h?' hd':'')+'">'+media+(f.cap?'<figcaption>'+esc(f.cap)+'</figcaption>':'')+'</figure>';
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
      h+='<p data-p="'+it.p+'">';open=true;curP=it.p;
    }
    h+='<span class="s" data-i="'+it.i+'">'+esc(it.t)+'</span> ';
  }
  if(open) h+='</p>';
  return h;
}
function pageKey(){
  var f=false;try{f=document.fonts.check('19px Literata')}catch(e){}
  return keyNow()+'|'+(f?1:0)+'|'+book.items.length+'|v3';
}
async function paginate(){
  var its=book.items,body=$('#measureBody'),t=$('#measureT'),tries=0;
  while(body.clientHeight<60&&tries<20){await tick(50);tries++}
  var limit=body.clientHeight+1,cur=[],n=0;document.documentElement.style.setProperty('--bh',body.clientHeight+'px');
  cards=[];
  var pk=pageKey(),pc=store.get('pg:'+book.id);
  if(pc&&pc.key===pk&&pc.firsts&&pc.firsts.length){
    var fs=pc.firsts,ok=true;
    for(var q=0;q<fs.length;q++){
      var a0=fs[q],b0=q+1<fs.length?fs[q+1]:its.length;
      if(a0<0||a0>=its.length||b0<=a0||(q>0&&a0!==fs[q-1]+cards[q-1].items.length)){ok=false;break}
      cards.push({items:its.slice(a0,b0),first:a0,c:its[a0].c});
    }
    if(ok&&cards[0].first===0&&cards[cards.length-1].items.length+cards[cards.length-1].first===its.length){window.__pgCache=true;return}
    cards=[];
  }
  window.__pgCache=false;
  /* Measure by appending one sentence at a time to a hidden card, instead of re-rendering the whole card each time */
  function addItem(it){
    var last=t.lastElementChild,node,added;
    if(it.k==='h'){
      node=document.createElement('h3');node.className='subhead';
      node.innerHTML='<span class="s" data-i="'+it.i+'">'+esc(it.t).replace(/\n/g,'<br>')+'</span>';
      t.appendChild(node);
      return function(){t.removeChild(node)};
    }
    var sp=document.createElement('span');sp.className='s';sp.dataset.i=it.i;sp.textContent=it.t;
    var sep=document.createTextNode(' ');
    if(last&&last.tagName==='P'&&last.dataset.p===String(it.p)){
      last.appendChild(sp);last.appendChild(sep);
      return function(){last.removeChild(sep);last.removeChild(sp)};
    }
    var p=document.createElement('p');p.dataset.p=it.p;p.appendChild(sp);p.appendChild(sep);
    t.appendChild(p);
    return function(){t.removeChild(p)};
  }
  var lastSize=6;
  var lastSize=6,x=0,tYield=performance.now(),undos=[];
  function flush(){if(cur.length){cards.push({items:cur,first:cur[0].i,c:cur[0].c});lastSize=cur.length;cur=[]}}
  function start(it){t.innerHTML=cardInner([it]);cur=[it];undos=[]}
  function canTake(){var q=its[x];return x<its.length&&q.k!=='img'&&q.k!=='cover'&&!q.ch0}
  function take(){undos.push(addItem(its[x]));cur.push(its[x]);x++}
  function giveBack(){undos.pop()();cur.pop();x--}
  /* Guess how many sentences fit from the previous card, add them all, then measure once and correct */
  while(x<its.length){
    var it=its[x];
    if(performance.now()-tYield>45){busy('Setting the page',x/its.length);await tick(0);tYield=performance.now()}
    if(it.k==='img'||it.k==='cover'){cur=[it];flush();x++;continue}
    start(it);x++;
    while(cur.length<lastSize&&canTake()) take();
    for(;;){
      if(t.offsetHeight>limit){
        while(cur.length>1&&t.offsetHeight>limit) giveBack();
        break;
      }
      if(!canTake()) break;
      take();
    }
    /* Verify against the exact markup the reader will render; incremental measuring can differ by a few px */
    t.innerHTML=cardInner(cur);
    while(cur.length>1&&t.offsetHeight>limit){cur.pop();x--;t.innerHTML=cardInner(cur)}
    while(cur.length>1&&cur[cur.length-1].k==='h'){cur.pop();x--}   /* never end a card on a heading */
    flush();
  }
  flush();
  t.innerHTML='';
  if(!cards.length) cards.push({items:[],first:0,c:0});
  store.set('pg:'+book.id,{key:pk,firsts:cards.map(function(c){return c.first})});
}
/* Only a window of cards around the reader holds real content. The rest are empty shells of the same size. */
var filled={},WIN_FILL=3,WIN_KEEP=9;
function fillCard(n){
  if(filled[n]||!cardEls[n]||!cards[n]) return;
  cardEls[n].firstChild.firstChild.innerHTML=cardInner(cards[n].items);
  filled[n]=1;
}
function windowAround(n){
  var k;
  for(k=Math.max(0,n-WIN_FILL);k<=Math.min(cards.length-1,n+WIN_FILL+1);k++) fillCard(k);
  for(k in filled){
    k=+k;
    if(k<n-WIN_KEEP||k>n+WIN_KEEP){cardEls[k].firstChild.firstChild.innerHTML='';delete filled[k]}
  }
}
function renderCards(){
  filled={};
  var h=[],n,total=cards.length;
  var L=(book&&book.lang)||'en',dirA=(/^(ar|he|fa|ur)$/.test(L)?' dir="rtl"':'')+' lang="'+L+'"';
  for(n=0;n<total;n++) h.push('<article class="card" data-n="'+n+'"'+dirA+' aria-label="Card '+(n+1)+' of '+total+'"><div class="card-body"><div class="t"></div></div></article>');
  scroller.innerHTML=h.join('');
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
  if(laying) return false;
  laying=true;
  try{
    await layoutInner(pos);
    return true;
  }catch(e){
    try{console.error(e)}catch(x){}
    toast('This book could not be laid out. Try a different text size.');
    return false;
  }finally{
    laying=false;unbusy();
  }
}
async function layoutInner(pos){
  busy('Setting the page',0);
  await raf();await fontsReady();await tick(30);
  var pf=window.__perf||{},tp=performance.now();
  await paginate();pf.paginate=performance.now()-tp;tp=performance.now();
  renderCards();pf.render=performance.now()-tp;
  layoutKey=keyNow();
  var p=Math.max(0,Math.min(book.items.length-1,pos||0));
  var n=itemCard.length?itemCard[p]:0;
  windowAround(n);
  scroller.scrollTop=n*scroller.clientHeight;
  setCard(n);
  pf.total=performance.now()-(pf.t0||tp);
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
  windowAround(n);
  $('#count').textContent=(n+1)+' / '+cards.length;
  var ch=book.chapters[c.c];
  $('#chLabel').textContent=ch?ch.title:'';
  scrub.value=n;
  scrub.style.setProperty('--p',(cards.length>1?n/(cards.length-1)*100:0)+'%');
  store.set('pos:'+book.id,c.first);store.set('post:'+book.id,Date.now());if(window.__syncPush) window.__syncPush();
}

