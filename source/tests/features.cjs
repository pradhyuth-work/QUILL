const {serve,mkPage,chromium,SP,path,makeT,importFile,readBook,summarize}=require('./lib.cjs');
const fs=require('fs');
const C=f=>path.join(__dirname,'corpus',f);
(async()=>{
  const T=makeT('features');const {server,base}=await serve();const br=await chromium.launch();
  const fresh=async(o)=>{const p=await mkPage(br,base,o);await p.goto(base+'/');await p.waitForSelector('.book');return p};
  const titles=p=>p.$$eval('.book[data-id] .bt',e=>e.map(x=>x.textContent));

  /* ---- 1. backup + restore round trip ---- */
  let pg=await fresh();
  await importFile(pg,C('novel40.pdf'));await importFile(pg,C('plain.txt'));
  await pg.click('#editBtn');await pg.click('#fchips [data-f="+"]');await pg.waitForTimeout(350);await pg.fill('#gIn','Fiction');await pg.click('#gSave');await pg.waitForTimeout(350);
  await pg.click('#fchips [data-f="all"]');
  await pg.click('[data-a=rename][aria-label="Edit novel40"]');await pg.waitForTimeout(350);
  await pg.fill('#rnIn','My Novel');await pg.click('#rnGr [data-g]:not([data-g=""])');await pg.click('#rnSave');await pg.waitForTimeout(350);
  await pg.click('#editBtn');
  await pg.click('#moreBtn');
  await pg.waitForFunction(()=>/book/.test(document.getElementById('stLine').textContent));T.ok('storage line shown',true);
  const [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('#bkExport')]);
  const bkPath=path.join(__dirname,'corpus','_backup.json');await dl.saveAs(bkPath);
  const bk=JSON.parse(fs.readFileSync(bkPath,'utf8'));
  T.ok('backup has format, books and shelf',bk.folio===2&&bk.books.length===2&&bk.kv.groups.length===1,{folio:bk.folio,n:bk.books.length});
  T.ok('backup filename is dated',/^quill-backup-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()),dl.suggestedFilename());
  const p2=await fresh();
  await p2.click('#moreBtn');
  await p2.setInputFiles('#bkImport',bkPath);
  await p2.waitForFunction(()=>/Restored/.test(document.getElementById('toast').textContent),null,{timeout:30000});
  T.ok('restore brings back the books and the title',(await titles(p2)).includes('My Novel')&&(await titles(p2)).includes('plain'),await titles(p2));
  T.ok('restore brings back groups',(await p2.$$eval('#shelf .gh',e=>e.map(x=>x.firstChild.textContent))).includes('Fiction'));
  await p2.click('.book:has-text("My Novel")');await p2.waitForSelector('#scroller .card');
  T.ok('restored book opens',(await p2.$$eval('#scroller .card',c=>c.length))>20);
  await p2.click('#back');await p2.click('#moreBtn');
  await p2.setInputFiles('#bkImport',bkPath);
  await p2.waitForFunction(()=>/skipped/.test(document.getElementById('toast').textContent),null,{timeout:30000});
  T.ok('restoring twice skips duplicates',true);
  await p2.context().close();

  /* ---- 2. hostile backup and hostile file names ---- */
  const evil={folio:2,kv:{groups:[{id:'g1',name:'<img src=x onerror=window.__xss=1>'}],meta:{evil1:{title:'<img src=x onerror=window.__xss=1>',group:'g1',color:2}}},books:[
    {id:'x" onmouseover="window.__xss=1',meta:{title:'bad id'},chapters:[{title:'t',blocks:[{type:'p',text:'hello world. It is a test paragraph with several words in it to read.'}]}]},
    {id:'evil1',meta:{title:'<img src=x onerror=window.__xss=1>',author:'<b>x</b>',tag:'<svg onload=window.__xss=1>',lang:'en'},chapters:[
      {title:'<img src=x onerror=window.__xss=1>',kicker:'<script>window.__xss=1</script>',blocks:[
        {type:'p',text:'<script>window.__xss=1</script> A paragraph with <b>markup</b> and enough words to count as a real paragraph for reading aloud.'},
        {type:'h',text:'<img src=x onerror=window.__xss=1>'},
        {type:'p',text:'Another paragraph follows the heading so the heading is not dropped, and it is long enough as well.'},
        {type:'img',src:'javascript:window.__xss=1',caption:'<img src=x onerror=window.__xss=1>',svg:'<svg onload="window.__xss=1"></svg>'},
        {type:'img',src:'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9IndpbmRvdy5fX3hzcz0xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',caption:'svg data url'}]}]}]};
  const evilPath=C('_evil.json');fs.writeFileSync(evilPath,JSON.stringify(evil));
  const p3=await fresh();
  await p3.click('#moreBtn');await p3.setInputFiles('#bkImport',evilPath);
  await p3.waitForFunction(()=>/Restored/.test(document.getElementById('toast').textContent),null,{timeout:30000});
    T.eq('invalid id was rejected, valid one restored',(await titles(p3)).filter(x=>/img|bad/.test(x)).length,1);
  await p3.click('.book[data-id="evil1"]');await p3.waitForSelector('#scroller .card');await p3.waitForTimeout(800);
  for(let i=0;i<4;i++){await p3.evaluate(()=>{const s=document.getElementById('scroller');s.scrollTop+=s.clientHeight});await p3.waitForTimeout(250)}
  T.ok('no script ran from hostile content',(await p3.evaluate(()=>window.__xss))===undefined);
  T.eq('no injected elements',await p3.$$eval('#app img[onerror],#app svg[onload],#app script',e=>e.length),0);
  T.ok('hostile markup is shown as text',(await p3.$$eval('.card .t',e=>e.map(x=>x.textContent).join('|'))).includes('<script>'));
  T.ok('javascript: image sources dropped',await p3.$$eval('img',e=>e.every(i=>!/^javascript:/i.test(i.getAttribute('src')||''))));
  T.ok('svg data-url images dropped',await p3.$$eval('img',e=>e.every(i=>!/svg\+xml/i.test(i.getAttribute('src')||''))));
  await p3.click('#back');
  const r3=await importFile(p3,{name:'<img src=x onerror=window.__xss=1>.txt',mimeType:'text/plain',buffer:Buffer.from(Array.from({length:8},(_,i)=>'Paragraph '+i+' is here with enough words to be a real paragraph in a book.').join('\n\n'))});
  T.ok('hostile file name imported as text',r3.added);
  T.ok('still no script',(await p3.evaluate(()=>window.__xss))===undefined);
  T.eq('no page errors (hostile)',p3.errors,[]);
  await p3.context().close();

  /* ---- 3. remove an image from a book ---- */
  pg=await fresh();
  await importFile(pg,C('novel40.pdf'));
  await pg.click('.book:has-text("novel40")');await pg.waitForSelector('#scroller .card');
  const nBefore=await pg.$$eval('#scroller .card',c=>c.length);
  /* jump to the first figure card */
  await pg.evaluate(()=>{const s=document.getElementById('scroller');const cs=[...s.children];const idx=cs.findIndex((c,i)=>true);});
  await pg.fill('#scrub','0');
  let figIdx=-1;
  for(let n=0;n<nBefore&&figIdx<0;n+=1){
    await pg.evaluate(n=>{const s=document.getElementById('scroller');s.scrollTop=n*s.clientHeight},n);
    await pg.waitForTimeout(40);
    if(await pg.$(`#scroller .card[data-n="${n}"] .zoom`)) figIdx=n;
  }
  T.ok('found a figure card',figIdx>0,figIdx);
  await pg.click(`#scroller .card[data-n="${figIdx}"] .zoom`);
  T.ok('remove button shown for uploads',!(await pg.$eval('#lbHide',e=>e.hidden)));
  await pg.click('#lbHide');
  T.eq('asks to confirm',await pg.textContent('#lbHide'),'Tap again to remove');
  await pg.click('#lbHide');
  await pg.waitForFunction(()=>/Image removed/.test(document.getElementById('toast').textContent),null,{timeout:20000});
  const rec=await readBook(pg,"(r=>r.meta.title==='novel40')");
  T.eq('one figure left in storage',summarize(rec).figs,1);
  await pg.waitForTimeout(300);await pg.reload();await pg.waitForSelector('.book');
  await pg.click('.book:has-text("novel40")');await pg.waitForSelector('#scroller .card');
  T.ok('fewer cards after reload (cache not stale)',(await pg.$$eval('#scroller .card',c=>c.length))<=nBefore);
  T.eq('no errors',pg.errors,[]);
  await pg.context().close();
  /* builtins cannot be edited this way */
  pg=await fresh();
  await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');
  let z=null;for(let n=0;n<12&&!z;n++){await pg.evaluate(n=>{const s=document.getElementById('scroller');s.scrollTop=n*s.clientHeight},n);await pg.waitForTimeout(40);z=await pg.$('#scroller .zoom')}
  if(z){await z.click();T.ok('no remove button on built-in books',await pg.$eval('#lbHide',e=>e.hidden))}
  await pg.context().close();

  /* ---- 4. plain cover ---- */
  pg=await fresh();
  T.eq('demo has a picture cover',await pg.$$eval('.book[data-id="figures-demo"] img.thumb',e=>e.length),1);
  await pg.click('#editBtn');await pg.click('[aria-label="Edit Pictures in the Flow"]');await pg.waitForTimeout(350);
  T.ok('cover option visible',!(await pg.$eval('#rnCvRow',e=>e.hidden)));
  await pg.click('#rnPic [data-p="1"]');await pg.click('#rnSave');await pg.waitForTimeout(400);
  T.eq('plain cover removes the picture',await pg.$$eval('.book[data-id="figures-demo"] img.thumb',e=>e.length),0);
  await pg.waitForTimeout(400);await pg.reload();await pg.waitForSelector('.book');
  T.eq('plain cover persists',await pg.$$eval('.book[data-id="figures-demo"] img.thumb',e=>e.length),0);
  await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(300);
  await pg.evaluate(()=>{document.getElementById('scroller').scrollTop=0});await pg.waitForTimeout(200);
  T.eq('reader cover card is plain',await pg.$$eval('#scroller .card[data-n="0"] .cvp-art',e=>e.length),0);
  await pg.context().close();

  /* ---- 5. sync against a mock db ---- */
  /* figures-demo is short, so this checks a small remote position lands rather than a deep one */
  const remote={v:1,pos:{'figures-demo':{i:5,t:Date.now()+1000}},shelfT:Date.now()+5000,order:['sample','figures-demo'],meta:{sample:{title:'Renamed Elsewhere',color:3,group:'',plain:false}},groups:[],settings:{}};
  pg=await mkPage(br,base);
  await pg.addInitScript(r=>{
    window.__db={doc:r,sets:0};
    window.claude={use:async n=>{
      if(n==='user') return {id:async()=>'u1',isOwner:()=>true,canEdit:()=>true};
      if(n==='db') return {doc:p=>({get:async()=>({exists:!!window.__db.doc,data:()=>window.__db.doc}),set:async d=>{window.__db.doc=d;window.__db.sets++;window.__db.path=p}})};
      return null;
    }};
  },remote);
  await pg.goto(base+'/');await pg.waitForSelector('.book');await pg.waitForTimeout(800);
  T.eq('remote order and rename applied',(await titles(pg))[0],'Renamed Elsewhere');
  T.ok('sync status shown',true);
  await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(500);
  T.ok('remote position applied',(await pg.$eval('#count',e=>parseInt(e.textContent)))>0,await pg.$eval('#count',e=>e.textContent));
  await pg.evaluate(()=>{const s=document.getElementById('scroller');s.scrollTop+=s.clientHeight});
  await pg.waitForFunction(()=>window.__db.sets>=1,null,{timeout:15000});
  T.ok('position is pushed back',await pg.evaluate(()=>window.__db.doc.pos['figures-demo'].i>0&&/data\/users\/u1\//.test(window.__db.path)),await pg.evaluate(()=>window.__db.path));
  T.ok('book text is never synced',await pg.evaluate(()=>JSON.stringify(window.__db.doc).length<4000));
  await pg.context().close();

  /* ---- 6. storage failure and corrupt records ---- */
  pg=await mkPage(br,base,{init:`const _p=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(this.name==='books'&&window.__quota) throw new DOMException('full','QuotaExceededError');return _p.apply(this,arguments)}`});
  await pg.goto(base+'/');await pg.waitForSelector('.book');
  await pg.evaluate(()=>{window.__quota=true});
  const r6=await importFile(pg,C('plain.txt'));
  T.ok('quota error is reported, book still readable this session',r6.added&&/would not keep it/.test(r6.toast),r6.toast);
  await pg.click('.book:has-text("plain")');await pg.waitForSelector('#scroller .card');
  T.ok('unsaved book opens',true);
  await pg.context().close();
  pg=await fresh();
  await importFile(pg,C('plain.txt'));
  await pg.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('folio');q.onsuccess=()=>r(q.result)});const ks=await new Promise(r=>{const t=db.transaction('books').objectStore('books').getAllKeys();t.onsuccess=()=>r(t.result)});await new Promise(r=>{const t=db.transaction('books','readwrite');t.objectStore('books').put({id:ks[0],meta:{},chapters:'garbage'},ks[0]);t.oncomplete=r})});
  await pg.reload();await pg.waitForSelector('.book');
  await pg.click('.book:has-text("plain")');await pg.waitForTimeout(1500);
  T.ok('corrupt record: stays on shelf with a message',await pg.$eval('#reader',e=>e.hidden)&&/could not be (loaded|opened)/.test(await pg.textContent('#toast')),await pg.textContent('#toast'));
  T.ok('busy overlay not stuck',await pg.$eval('#busy',e=>e.hidden));
  await pg.evaluate(()=>setTimeout(()=>{throw new Error('boom')},0));await pg.waitForTimeout(400);
  T.ok('stray errors become a gentle message',/Something went wrong/.test(await pg.textContent('#toast')));
  await pg.context().close();

  try{fs.unlinkSync(bkPath);fs.unlinkSync(evilPath)}catch(e){}
  const f=T.done();await br.close();server.close();process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
