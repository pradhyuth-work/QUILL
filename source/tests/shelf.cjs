const {serve,mkPage,chromium,SP,path,makeT}=require('./lib.cjs');
(async()=>{
  const T=makeT('shelf');const {server,base}=await serve();const br=await chromium.launch();
  const pg=await mkPage(br,base);
  const secs=()=>pg.$$eval('#shelf .gh,#shelf .book[data-id] .bt',e=>e.map(x=>x.className==='gh'?'## '+x.firstChild.textContent:x.textContent));
  await pg.goto(base+'/');await pg.waitForSelector('.book');
  T.eq('initial books',await pg.$$eval('.book[data-id] .bt',e=>e.map(x=>x.textContent)),['Reading on Glass','Pictures in the Flow']);
  await pg.click('#editBtn');
  await pg.click('#fchips [data-f="+"]');await pg.waitForTimeout(350);await pg.fill('#gIn','Notes');await pg.click('#gSave');await pg.waitForTimeout(350);
  await pg.click('#fchips [data-f="all"]');
  await pg.click('.book[data-id="figures-demo"] [data-a="rename"]');await pg.waitForTimeout(350);
  await pg.click('#rnGr [data-g]:not([data-g=""])');await pg.click('#rnSave');await pg.waitForTimeout(350);
  await pg.click('.book[data-id="sample"] [data-a="rename"]');await pg.waitForTimeout(350);
  await pg.fill('#rnNew','Essays');await pg.click('#rnSave');await pg.waitForTimeout(350);
  await pg.click('#editBtn');
  T.eq('sections',await secs(),['## Notes','Pictures in the Flow','## Essays','Reading on Glass']);
  await pg.click('#fchips [data-f]:nth-child(3)');
  T.eq('filter',await secs(),['Reading on Glass']);
  await pg.setInputFiles('.ov',path.join(SP,'pdfwork/report.pdf'));
  await pg.waitForFunction(()=>document.querySelectorAll('.book[data-id]').length>=2,null,{timeout:60000});
  T.eq('upload lands in filtered group',(await secs()).length,2);
  await pg.waitForTimeout(500);await pg.reload();await pg.waitForSelector('.book');
  T.eq('persist groups after reload',await pg.$$eval('#fchips .chip',e=>e.map(x=>x.textContent+':'+x.getAttribute('aria-pressed'))),['All:false','Notes:false','Essays:true']);
  T.eq('uploaded book still in Essays',await secs(),['Reading on Glass','report']);
  /* reorder */
  await pg.click('#editBtn');
  await pg.click('[aria-label="Move report earlier"]');
  T.eq('reorder',await secs(),['report','Reading on Glass']);
  await pg.waitForTimeout(400);await pg.reload();await pg.waitForSelector('.book');
  T.eq('reorder persists',await secs(),['report','Reading on Glass']);
  /* delete group */
  await pg.click('#editBtn');await pg.click('#gManage button');await pg.waitForTimeout(350);
  await pg.click('#gDel');await pg.click('#gDel');await pg.waitForTimeout(350);
  T.ok('group removed',!(await pg.$$eval('#fchips .chip',e=>e.map(x=>x.textContent))).includes('Essays'));
  /* delete a builtin and restore */
  await pg.click('[aria-label="Delete Pictures in the Flow"]');await pg.click('[aria-label="Confirm delete Pictures in the Flow"]');
  T.ok('builtin removed',!(await secs()).includes('Pictures in the Flow'));
  await pg.click('#restore');
  T.ok('builtin restored',(await secs()).includes('Pictures in the Flow'));
  T.eq('no errors',pg.errors,[]);
  const f=T.done();await br.close();server.close();process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
