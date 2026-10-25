const {serve,mkPage,chromium,SP,path,importFile,readBook,summarize}=require('./lib.cjs');
const fs=require('fs');
const C=f=>path.join(__dirname,'corpus',f);
const throttle=+(process.argv[2]||1), file=process.argv[3]||'novel400.pdf';
(async()=>{
  const {server,base}=await serve();const br=await chromium.launch();
  const truth=JSON.parse(fs.readFileSync(C('truth.json')))[file.replace('.pdf','')];
  const page=await mkPage(br,base);await page.goto(base+'/');await page.waitForSelector('.book');
  if(throttle>1){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle})}
  const lastEta=[];
  const poll=setInterval(async()=>{try{const m=await page.textContent('#busyMsg');const e=await page.textContent('#busyEta');lastEta.push([Date.now(),m,e])}catch(e){}},15000);
  const r=await importFile(page,C(file),{timeout:3000000});
  clearInterval(poll);
  const rec=await readBook(page,"(r=>r.meta.title.indexOf('novel')>=0)");
  const s=summarize(rec);
  const txt=rec.chapters.map(c=>c.blocks.map(b=>b.text||'').join('\n')).join('\n');
  console.log('throttle',throttle,'file',file,'ms',r.ms,r.toast);
  console.log(JSON.stringify(s));
  console.log('truth',JSON.stringify({chapters:truth.chapters.length,paras:truth.paras,words:truth.words,figs:truth.figs}));
  console.log('header leaks',(txt.match(/LONG ROAD HOME/g)||[]).length,'bare page numbers',(txt.match(/^\d{1,3}$/gm)||[]).length,'figure captions as paras',(txt.match(/Plate number/g)||[]).length);
  const sizeMB=await page.evaluate(async()=>{const e=await navigator.storage.estimate();return e.usage/1048576});
  console.log('storage MB',sizeMB.toFixed(1),'etaSamples',lastEta.slice(0,6).map(x=>x[2]));
  // open it
  const t1=Date.now();
  await page.click('.book:has-text("novel")');await page.waitForSelector('#scroller .card',{timeout:600000});
  console.log('perf',JSON.stringify(await page.evaluate(()=>window.__perf)));console.log('open+layout ms',Date.now()-t1,'cards',await page.$$eval('#scroller .card',c=>c.length),'errors',page.errors);
  await br.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
