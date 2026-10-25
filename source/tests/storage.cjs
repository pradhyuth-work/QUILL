const {serve,mkPage,chromium,SP,path}=require('./lib.cjs');
const assert=require('assert');
(async()=>{
  const {server,base}=await serve();const br=await chromium.launch();
  const R={};let page;
  /* 1. fresh load, upload, reload persistence */
  page=await mkPage(br,base);
  await page.goto(base+'/');await page.waitForSelector('.book');
  await page.setInputFiles('.ov',path.join(SP,'pdfwork/report.pdf'));
  await page.waitForFunction(()=>[...document.querySelectorAll('.bt')].some(e=>/report/i.test(e.textContent)),null,{timeout:120000});
  const ctx=page.context();
  const t1=await page.$$eval('.bt',e=>e.map(x=>x.textContent));
  await page.waitForTimeout(600);
  await page.reload();await page.waitForSelector('.book');
  const t2=await page.$$eval('.bt',e=>e.map(x=>x.textContent));
  R.upload_survives_reload=JSON.stringify(t1)===JSON.stringify(t2);
  /* open it lazily */
  await page.click('.book:has-text("report")');await page.waitForSelector('#scroller .card',{timeout:20000});
  R.opens_after_reload=(await page.$$eval('#scroller .card',c=>c.length))>10;
  /* same file again => dedupe */
  await page.click('#back');await page.waitForSelector('.book');
  await page.setInputFiles('.ov',path.join(SP,'pdfwork/report.pdf'));
  await page.waitForTimeout(8000);
  R.no_duplicate=(await page.$$eval('.bt',e=>e.filter(x=>/report/i.test(x.textContent)).length));
  R.errors1=page.errors;
  /* 2. migration from legacy localStorage */
  const legacy={title:'Legacy Book',chapters:[{title:'One',blocks:[{type:'p',text:'This is a legacy paragraph that was saved by the old version. It has two sentences.'},{type:'p',text:'Another paragraph keeps the book long enough to read.'}]}]};
  const p2=await mkPage(br,base,{init:`try{if(!localStorage.getItem('folio:seeded')){localStorage.setItem('folio:seeded','1');localStorage.setItem('folio:ups',JSON.stringify({u123:{meta:{id:'u123',title:'Legacy Book',author:'Your upload',tag:'PDF',alt:true},chapters:${JSON.stringify(legacy.chapters)}}}));localStorage.setItem('folio:fs','22');localStorage.setItem('folio:pos:u123','1')}}catch(e){}`});
  await p2.goto(base+'/');await p2.waitForSelector('.book');
  R.migrated_shelf=await p2.$$eval('.bt',e=>e.map(x=>x.textContent)).then(a=>a.includes('Legacy Book'));
  await p2.click('.book:has-text("Legacy Book")');await p2.waitForSelector('#scroller .card');
  R.migrated_text=await p2.$$eval('#scroller .card .t',e=>e.map(x=>x.textContent).join(' ')).then(s=>/legacy paragraph/.test(s));
  R.migrated_fs=await p2.evaluate(()=>getComputedStyle(document.querySelector('.card .t')||document.body).fontSize);
  R.errors2=p2.errors;
  /* 3. IndexedDB unavailable => app still works, warns on add */
  const p3=await mkPage(br,base,{init:`Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true})`});
  await p3.goto(base+'/');await p3.waitForSelector('.book');
  R.noidb_shelf=(await p3.$$('.book')).length;
  await p3.setInputFiles('.ov',path.join(SP,'demo_figures.pdf'));
  await p3.waitForFunction(()=>[...document.querySelectorAll('.bt')].some(e=>/demo figures/i.test(e.textContent)),null,{timeout:60000});
  R.noidb_toast=await p3.textContent('#toast');
  R.errors3=p3.errors;
  /* 4. delete removes from storage */
  const p4=page;await p4.reload();await p4.waitForSelector('.book');
  await p4.click('#editBtn');
  const dl=p4.locator('[aria-label="Delete report"]');
  await dl.click();await p4.locator('[aria-label="Confirm delete report"]').click();
  await p4.waitForTimeout(500);
  R.ids_after_delete=await p4.evaluate(async()=>{return await new Promise(r=>{const q=indexedDB.open('folio');q.onsuccess=()=>{const t=q.result.transaction('books').objectStore('books').getAllKeys();t.onsuccess=()=>r(t.result)}})});
  console.log(JSON.stringify(R,null,1));
  await br.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
