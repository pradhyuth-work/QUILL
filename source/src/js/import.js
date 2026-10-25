/* ---------- importing ---------- */
/* Turns pdf.js page items into clean blocks: chapter titles, subheadings, paragraphs.
   Skips chart and table lines, ad images, repeated headers and footers. */
/*@@EXTRACT@@*/

async function hashId(buf){
  try{
    var h=await crypto.subtle.digest('SHA-256',buf),a=new Uint8Array(h),s='b';
    for(var i=0;i<8;i++) s+=(a[i]<16?'0':'')+a[i].toString(16);
    return s;
  }catch(e){return 'u'+Date.now().toString(36)}
}
var PDF_BASE=new URL('vendor/pdfjs/',document.baseURI).href;
/* binary data files (CMaps, fonts, ICC) are hosted locally in the standalone app; the Claude host cannot serve those types, so it uses the CDN copy of the identical version */
var DATA_BASE=__DATA_BASE__;
var pdfLib=null;
function pdfDocOpts(){
  return {cMapUrl:DATA_BASE+'cmaps/',cMapPacked:true,standardFontDataUrl:DATA_BASE+'standard_fonts/',wasmUrl:PDF_BASE+'wasm/',iccUrl:DATA_BASE+'iccs/',useSystemFonts:true,isEvalSupported:false};
}
/* pdf.js is shipped with the app (same origin). The CDN is only a fallback. */
async function loadPdfJs(){
  if(pdfLib) return pdfLib;
  var tries=[
    {m:PDF_BASE+'pdf.min.mjs',w:PDF_BASE+'pdf.worker.min.mjs'},
    {m:'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.149/legacy/build/pdf.min.mjs',w:'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.149/legacy/build/pdf.worker.min.mjs',cdn:true}
  ],lastErr=null;
  for(var i=0;i<tries.length;i++){
    try{
      var mod=await import(tries[i].m);
      var wsrc=tries[i].w;
      if(tries[i].cdn){ /* cross-origin workers are blocked, so wrap the worker in a same-origin blob */
        var txt=await (await fetch(wsrc)).text();
        wsrc=URL.createObjectURL(new Blob([txt],{type:'text/javascript'}));
      }
      mod.GlobalWorkerOptions.workerSrc=wsrc;
      pdfLib=mod;return mod;
    }catch(e){lastErr=e}
  }
  throw lastErr||new Error('pdf');
}

var importing=false,cancelFlag=null;
function askSheet(id,opening){
  return new Promise(function(res){
    var sh=$(id);sh.hidden=false;
    var done=function(v){sh.hidden=true;sh.removeEventListener('click',h);res(v)};
    var h=function(e){
      var b=e.target.closest('[data-r]');
      if(b){done(opening?opening(b.dataset.r):b.dataset.r);return}
      if(e.target.classList.contains('scrim')) done(null);
    };
    sh.addEventListener('click',h);
    var first=sh.querySelector('input,button.btn-done');if(first) first.focus();
  });
}
async function askPassword(wrong){
  var sh=$('#pwSheet');$('#pwErr').hidden=!wrong;$('#pwIn').value='';
  var v=await askSheet('#pwSheet',function(r){return r==='ok'?$('#pwIn').value:null});
  return v;
}
function readableError(e){
  var n=e&&e.name||'',m=String(e&&e.message||e||'');
  if(/Invalid PDF|InvalidPDF|Missing PDF|header/i.test(n+m)) return 'That file does not look like a valid PDF. It may be damaged or only partly downloaded.';
  if(/password/i.test(n+m)) return 'This PDF is password protected.';
  if(/memory|allocation/i.test(m)) return 'This book is too large for this device to process. Try a device with more memory.';
  return 'Could not read that file. Try a text-based PDF or a .txt file.';
}
async function importFile(file){
  if(importing) return;
  var title=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim()||'Untitled';
  var isPdf=/\.pdf$/i.test(file.name)||file.type==='application/pdf';
  var isTxt=/\.(txt|md|text)$/i.test(file.name)||/^text\//.test(file.type);
  if(!isPdf&&!isTxt){toast('Quill opens PDF and text files. EPUB and Kindle files are not supported yet.');return}
  if(file.size>200*1048576){toast('That file is over 200 MB, which is too large to process on a phone.');return}
  importing=true;cancelFlag={cancelled:false};
  var blocks,bookId='u'+Date.now().toString(36),stats=null,t0=Date.now();
  try{
    busy('Opening file',0.02);$('#busyEta').hidden=false;$('#busyEta').textContent='Estimating time left…';
    var ab=await file.arrayBuffer();
    if(isPdf){
      var buf=new Uint8Array(ab);
      bookId=await hashId(buf);
      if(books.some(function(x){return x.id===bookId})){unbusy();importing=false;toast('“'+title+'” is already on your shelf.');return}
      if(!/%PDF-/.test(String.fromCharCode.apply(null,buf.subarray(0,1024)))){throw {name:'InvalidPDFException',message:'Invalid PDF'}}
      var lib=await loadPdfJs();
      var res=await folioReadPdf(lib,buf,function(n,N,note){busy((note||'Reading page ')+(note?'':n+' of '+N),n/N*0.9);etaLine(t0,n,N)},{
        cancel:cancelFlag,docOpts:pdfDocOpts(),
        askPassword:async function(wrong){unbusyKeep();var p=await askPassword(wrong);busy('Opening file',0.03);return p}
      });
      blocks=res.blocks;stats=res.stats;
    }else{
      var txt=new TextDecoder('utf-8').decode(new Uint8Array(ab));
      bookId=await hashId(new Uint8Array(ab));
      if(books.some(function(x){return x.id===bookId})){unbusy();importing=false;toast('“'+title+'” is already on your shelf.');return}
      blocks=folioTextBlocks(txt);
      stats={pages:1,textPages:1,emptyPages:0};
    }
  }catch(e){
    unbusy();importing=false;
    if(e&&e.cancelled){toast('Import cancelled');return}
    if(e&&e.pwCancelled){toast('Import cancelled');return}
    toast(readableError(e));return;
  }
  var total=blocks.reduce(function(a,x){return a+(x.text?x.text.length:0)},0);
  if(total<200||(stats&&stats.pages>3&&stats.emptyPages/stats.pages>0.7)){
    unbusy();
    var ocrAns=await offerOcr(file,stats);
    if(!ocrAns){importing=false;return}
    try{
      busy('Preparing text recognition',0.02);
      var ob=await runOcr(new Uint8Array(await file.arrayBuffer()),ocrAns,function(n,N,note){busy(note||('Recognising page '+n+' of '+N),n/N*0.95);etaLine(t0,n,N)});
      blocks=ob;
    }catch(e){unbusy();importing=false;try{console.warn('ocr failed',e&&e.message)}catch(x){}toast(e&&e.cancelled?'Import cancelled':'Text recognition could not run here. Check your connection and try again.');return}
    total=blocks.reduce(function(a,x){return a+(x.text?x.text.length:0)},0);
    if(total<200){unbusy();importing=false;toast('No readable text was found, even with recognition.');return}
  }
  busy('Cleaning the text',0.95);$('#busyEta').textContent='Almost done';await tick(20);
  var chapters;
  try{chapters=folioChapters(blocks,title)}catch(e){unbusy();importing=false;toast('Could not organise that file into chapters.');return}
  if(!chapters.length){unbusy();importing=false;toast('No readable paragraphs found in that file.');return}
  var lang=(stats&&stats.lang)||folioDetectLang(blocks);
  var meta0={id:bookId,title:title,author:'Your upload',tag:isPdf?'PDF':'Text',alt:true,lang:lang};
  var b=buildBook(meta0,chapters);
  b.color=nextColor();
  b.group=(flt!=='all'&&groupById(flt))?flt:'';
  var saved=true;
  try{await FolioDB.putBook({id:b.id,meta:{id:b.id,title:b.title,author:b.author,tag:b.tag,alt:true,lang:lang,words:b.words,n:b.items.length,cover:b.cover||''},chapters:chapters})}catch(e){saved=false}
  if(saved){
    ups[b.id]={id:b.id,title:b.title,author:b.author,tag:b.tag,words:b.words,n:b.items.length,cover:b.cover||'',lang:lang};
    b.n=b.items.length;persistUps();
    if(builtins.indexOf(b)<0){b.items=null;b.chapters=null;b.stub=true}
    FolioDB.persist();
  }else{b.n=b.items.length}
  books.push(b);
  persistLib();
  await FolioDB.flush();
  unbusy();importing=false;
  renderShelf();
  var warn=stats&&stats.badPages?' · '+stats.badPages+' page'+(stats.badPages>1?'s':'')+' could not be read':'';
  toast((saved?'Added “'+title+'”':'Added “'+title+'” · this browser would not keep it, so it will be gone when you close the page. Export a backup from the shelf.')+warn);
}
function unbusyKeep(){$('#busy').hidden=true}
$('#busyCancel').addEventListener('click',function(){if(cancelFlag) cancelFlag.cancelled=true});

/* image viewer: tap a picture to look closer, tap again to zoom in */
var lb=$('#lb');
var lbItem=null,lbArm=false;
function openLb(it){
  lbItem=it;lbArm=false;
  $('#lbHide').hidden=!(book&&builtins.indexOf(book)<0&&it.bi!=null);$('#lbHide').textContent='Remove from book';
  $('#lbImg').src=it.src;$('#lbImg').alt=it.cap||'Figure from the book';
  $('#lbCap').textContent=it.cap||'';$('#lbS').classList.remove('big');
  lb.hidden=false;$('#lbX').focus();
}
function closeLb(){lb.hidden=true;$('#lbImg').removeAttribute('src');lbItem=null}
async function removeImage(it){
  var chs=book.chapters,ch=chs[it.c],blk=ch&&ch.blocks[it.bi];
  if(!blk||blk.type!=='img') return;
  var snap=ch.blocks.slice(),pos=cards[curCard]?cards[curCard].first:0;
  ch.blocks.splice(it.bi,1);
  try{
    await FolioDB.putBook({id:book.id,meta:{id:book.id,title:book.title,author:book.author,tag:book.tag,alt:true,lang:book.lang,words:book.words,n:book.items.length,cover:book.cover||''},chapters:chs});
  }catch(e){ch.blocks=snap;toast('Could not save that change.');return}
  buildBook(book,chs);
  book.n=book.items.length;
  if(ups[book.id]){ups[book.id].n=book.n;ups[book.id].words=book.words;persistUps()}
  closeLb();
  store.del('pg:'+book.id);
  await layout(Math.min(pos,book.items.length-1));
  toast('Image removed from this book');
}
$('#lbHide').addEventListener('click',function(){
  if(!lbItem) return;
  if(!lbArm){lbArm=true;$('#lbHide').textContent='Tap again to remove';return}
  removeImage(lbItem);
});
document.addEventListener('click',function(e){
  var z=e.target.closest('.zoom');
  if(z&&book){var it=book.items[+z.dataset.i];if(it&&it.src) openLb(it);return}
  if(e.target.id==='lbImg'){$('#lbS').classList.toggle('big');return}
  if(e.target.id==='lbS'||e.target.id==='lbX') closeLb();
});
