/* ---------- scanned books: optional on-device text recognition (beta) ---------- */
var TESS_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
function loadTesseract(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise(function(res,rej){
    var s=document.createElement('script');s.src=TESS_URL;s.crossOrigin='anonymous';
    s.onload=function(){window.Tesseract?res(window.Tesseract):rej(new Error('tess'))};
    s.onerror=function(){rej(new Error('tess'))};
    document.head.appendChild(s);
  });
}
async function offerOcr(file,stats){
  if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){toast('No readable text found in that file.');return null}
  var sh=$('#ocrSheet');
  var v=await askSheet('#ocrSheet',function(r){return r==='go'?$('#ocrLang').value:null});
  return v?{lang:v}:null;
}
async function runOcr(buf,o,onProgress){
  var T=await loadTesseract(),lib=await loadPdfJs();
  var worker=await T.createWorker(o.lang,1,{logger:function(){}});
  var doc=await lib.getDocument(Object.assign({},pdfDocOpts(),{data:buf.slice(0)})).promise;
  var texts=[];
  try{
    for(var n=1;n<=doc.numPages;n++){
      if(cancelFlag&&cancelFlag.cancelled) throw folioCancelled();
      var page=await doc.getPage(n),vp0=page.getViewport({scale:1});
      var sc=Math.min(3,Math.max(1.4,1800/Math.max(vp0.width,vp0.height)));
      var vp=page.getViewport({scale:sc}),cv=document.createElement('canvas');
      cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);
      var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);
      await page.render({canvasContext:cx,canvas:cv,viewport:vp}).promise;
      var r=await worker.recognize(cv);
      texts.push((r&&r.data&&r.data.text)||'');
      cv.width=cv.height=1;
      if(page.cleanup) page.cleanup();
      onProgress(n,doc.numPages);
    }
  }finally{try{await worker.terminate()}catch(e){}try{doc.destroy()}catch(e){}}
  /* stitch pages: a page that ends mid-sentence continues on the next */
  var txt='';
  texts.forEach(function(t){
    t=t.replace(/\n{3,}/g,'\n\n').trim();
    if(!t) return;
    if(txt&&!END_SENT.test(txt.slice(-2))) txt+='\n'+t; else txt+=(txt?'\n\n':'')+t;
  });
  return folioTextBlocks(txt);
}
var END_SENT=/[.!?:…।。！？؟"”’')\]]\s?$/;
