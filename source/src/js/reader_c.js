/* ---------- open / close ---------- */
async function openBook(b){
  var P=window.__perf={t0:performance.now()};
  if(!b.items){
    var rec=await FolioDB.getBook(b.id);P.read=performance.now()-P.t0;
    if(!rec){
      /* the shelf entry outlived the book: tidy up */
      books.splice(books.indexOf(b),1);delete ups[b.id];persistUps();persistLib();renderShelf();
      toast('That book is no longer stored on this device, so it was taken off the shelf. Restore it from a backup or add it again.');return;
    }
    if(!rec.chapters){toast('This book could not be loaded from storage. Remove it and add it again.');return}
    try{buildBook(b,rec.chapters);b.stub=false;P.build=performance.now()-P.t0}catch(e){toast('This book could not be opened.');return}
  }
  book=b;loadVoices();
  $('#library').hidden=true;$('#reader').hidden=false;
  stopAll();setMode('read');
  var ok=await layout(store.get('pos:'+b.id,0));
  if(!ok) $('#back').click();
}
$('#back').addEventListener('click',function(){
  stopAll();
  if(book&&book.stub!==undefined&&builtins.indexOf(book)<0){book.items=null;book.chapters=null;book.stub=true}
  book=null;
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

