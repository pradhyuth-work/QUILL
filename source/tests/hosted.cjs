const L=require('./lib.cjs');const {chromium}=L;const T=L.makeT('hosted');const fs=require('fs'),path=require('path');
const http=require('http');
(async()=>{
  // serve dist/ but make / return hosted.html
  const s=http.createServer((q,r)=>{let f=decodeURIComponent(q.url.split('?')[0]);let p=path.join(L.DIST,f==='/'?'hosted.html':f);
    // hosted publish does NOT ship binary data files: hide them locally to prove they are not needed
    if(/\/(cmaps|standard_fonts|iccs)\//.test(f)){r.writeHead(404);r.end();return}
    fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end()}else{r.writeHead(200,{'content-type':f.endsWith('.mjs')||f.endsWith('.js')?'text/javascript':f.endsWith('.wasm')?'application/wasm':'text/html'});r.end(d)}})});
  await new Promise(r=>s.listen(0,r));const base='http://localhost:'+s.address().port;
  const br=await chromium.launch();
  const hits=[];
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/*',route=>{const u=route.request().url();
    if(u.startsWith(base)) return route.continue();
    const m=u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@6\.2\.108\/(.+)$/);
    if(m){hits.push(m[1]);const p=path.join(L.DIST,'vendor/pdfjs',m[1]);return fs.existsSync(p)?route.fulfill({status:200,body:fs.readFileSync(p),headers:{'access-control-allow-origin':'*'}}):route.fulfill({status:404,body:''})}
    return route.abort()});
  await pg.goto(base+'/');await pg.waitForSelector('.book');
  for(const f of ['lang_zh.pdf','novel40.pdf']){
    const r=await L.importFile(pg,path.join(__dirname,'corpus',f),{timeout:300000});
    T.ok('hosted variant imports '+f,r.added,r);
  }
  T.ok('CDN data URLs used and resolvable (cmaps/fonts requested at the pinned version)',hits.some(h=>/^(cmaps|standard_fonts)\//.test(h)),hits.slice(0,6));
  T.ok('every CDN data request resolved to a real file',hits.every(h=>fs.existsSync(path.join(L.DIST,'vendor/pdfjs',h))),hits.filter(h=>!fs.existsSync(path.join(L.DIST,'vendor/pdfjs',h))));
  T.eq('no page errors',errs,[]);
  await br.close();s.close();T.done();
})();
