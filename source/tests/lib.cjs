const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const SP=path.resolve(__dirname,'../..');            // scratchpad
const DIST=process.env.DIST||path.resolve(__dirname,'../dist');
const PDFJS='/opt/npm-tools/node_modules/pdfjs-dist';
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.pdf':'application/pdf','.png':'image/png','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.ttf':'font/ttf'};
function serve(){
  return new Promise(r=>{
    const s=http.createServer((req,res)=>{
      let f=decodeURIComponent(req.url.split('?')[0]);
      let p;
      if(f.startsWith('/pdfjs/')) p=path.join(PDFJS,'legacy/build',f.slice(7));
      else if(f.startsWith('/pdfjs-assets/')) p=path.join(PDFJS,f.slice(14));
      else if(f.startsWith('/corpus/')) p=path.join(SP,'prod/corpus',f.slice(8));
      else p=path.join(DIST,f==='/'?'artifact.html':f);
      fs.readFile(p,(e,d)=>{if(e){res.writeHead(404);res.end()}else{res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});res.end(d)}});
    });
    s.listen(0,()=>r({server:s,base:'http://localhost:'+s.address().port}));
  });
}
/* well-behaved speech mock; opts.hostile adds failure modes */
function speechMock(opts){
  opts=opts||{};
  const spoken=[];window.__spoken=spoken;
  const voices=opts.voices||[{name:'Mock Voice',lang:'en-IN',voiceURI:'mock',localService:true,default:true}];
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.lang='';this.rate=1;this.voice=null};
  const listeners={};
  const synth={
    speaking:false,pending:false,paused:false,
    getVoices:()=>window.__voices||voices,
    addEventListener(n,f){(listeners[n]=listeners[n]||[]).push(f)},removeEventListener(){},
    cancel(){clearTimeout(this._t);this.speaking=false;if(this._cur&&window.__fireOnCancel){const u=this._cur;this._cur=null;u.onerror&&u.onerror({error:'interrupted'})}this._cur=null},
    speak(u){
      spoken.push(u.text);this._cur=u;this.speaking=true;
      const mode=window.__speechMode||'ok';
      if(mode==='stall'&&spoken.length%3===0) return;           // never fires onend
      if(mode==='cutoff'&&u.text.length>200){this._t=setTimeout(()=>{this.speaking=false;},300);return}   // chrome 15s style: silently stops
      u.onstart&&setTimeout(()=>u.onstart({}),5);
      this._t=setTimeout(()=>{this.speaking=false;this._cur=null;u.onend&&u.onend({})},window.__speechMs||250);
    },
    pause(){this.paused=true},resume(){this.paused=false}
  };
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
  window.__fireVoices=()=>(listeners.voiceschanged||[]).forEach(f=>f());
}
async function mkPage(browser,base,o){
  o=o||{};
  const ctx=await browser.newContext({viewport:o.viewport||{width:390,height:844},deviceScaleFactor:o.dpr||2,hasTouch:true,isMobile:!o.desktop,colorScheme:o.scheme||'light',acceptDownloads:true,serviceWorkers:'block'});
  const page=await ctx.newPage();
  page.errors=[];
  page.on('pageerror',e=>page.errors.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text())) page.errors.push('console: '+m.text())});
  if(o.speech!==false) await page.addInitScript(speechMock,o.speechOpts);
  if(o.init) await page.addInitScript(o.init);
  await page.route('**/*',route=>{
    const u=route.request().url();
    if(u.startsWith(base)) return route.continue();
    if(/fonts\.(googleapis|gstatic)/.test(u)) return route.abort();
    return route.abort();
  });
  return page;
}
module.exports={serve,mkPage,chromium,speechMock,SP,path,fs,DIST};

/* upload a file through the real UI and report what happened */
async function importFile(page,file,o){
  o=o||{};
  const t0=Date.now();
  const before=await page.$$eval('.book:not(.add)',e=>e.length);
  await page.evaluate(()=>{const t=document.getElementById('toast');t.textContent='';t.classList.remove('on')});
  await page.setInputFiles('.ov',file);
  await page.waitForFunction(({before})=>{
    const busy=document.getElementById('busy');
    const sheetOpen=['pwSheet','ocrSheet'].some(i=>!document.getElementById(i).hidden);
    const n=document.querySelectorAll('.book:not(.add)').length;
    const t=document.getElementById('toast').textContent;
    return !sheetOpen&&busy.hidden&&(n>before||t);
  },{before},{timeout:o.timeout||600000,polling:200});
  const toast=await page.textContent('#toast');
  const n=await page.$$eval('.book:not(.add)',e=>e.length);
  return {ms:Date.now()-t0,added:n>before,toast};
}
async function readBook(page,pred){
  return page.evaluate(async(predSrc)=>{
    const db=await new Promise(r=>{const q=indexedDB.open('folio');q.onsuccess=()=>r(q.result)});
    const all=await new Promise(r=>{const t=db.transaction('books').objectStore('books').getAll();t.onsuccess=()=>r(t.result)});
    const f=eval(predSrc);
    const rec=all.filter(f).pop();
    return rec||null;
  },pred||'(()=>true)');
}
function summarize(rec){
  if(!rec) return null;
  let paras=0,words=0,figs=0,heads=0;const titles=[];
  rec.chapters.forEach(c=>{if(!c.cover) titles.push(c.title);c.blocks.forEach(b=>{if(b.type==='p'){paras++;words+=b.text.split(/\s+/).length}else if(b.type==='img') figs++;else if(b.type==='h') heads++})});
  return {title:rec.meta.title,lang:rec.meta.lang,chapters:titles.length,titles,paras,words,figs,heads};
}
module.exports.importFile=importFile;module.exports.readBook=readBook;module.exports.summarize=summarize;

function makeT(name){
  const res=[];
  const t={ok(label,cond,detail){res.push({label,pass:!!cond,detail});if(!cond) console.log('  FAIL',label,detail===undefined?'':JSON.stringify(detail))},
    eq(label,a,b){const p=JSON.stringify(a)===JSON.stringify(b);res.push({label,pass:p});if(!p) console.log('  FAIL',label,'got',JSON.stringify(a),'want',JSON.stringify(b))},
    done(){const f=res.filter(r=>!r.pass).length;console.log((f?'✗':'✓')+' '+name+': '+(res.length-f)+'/'+res.length+' passed');return f}};
  return t;
}
module.exports.makeT=makeT;
