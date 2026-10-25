const {serve,mkPage,chromium,SP,path,makeT,importFile,readBook,summarize}=require('./lib.cjs');
const fs=require('fs');
const C=f=>path.join(__dirname,'corpus',f);
const HUGE=C('_huge.pdf');fs.closeSync(fs.openSync(HUGE,'w'));fs.truncateSync(HUGE,201*1048576+10);
(async()=>{
  const T=makeT('imports');const {server,base}=await serve();const br=await chromium.launch();
  const fresh=async(o)=>{const p=await mkPage(br,base,o);await p.goto(base+'/');await p.waitForSelector('.book');return p};
  let pg=await fresh();
  const shelf=()=>pg.$$eval('.book[data-id] .bt',e=>e.map(x=>x.textContent));
  /* corrupt / not a pdf / wrong type */
  let r=await importFile(pg,C('corrupt.pdf'));
  T.ok('corrupt pdf gives a clear message',/damaged|valid PDF|Could not read/.test(r.toast)&&!r.added,r.toast);
  r=await importFile(pg,C('notapdf.pdf'));
  T.ok('text renamed .pdf gives a clear message',/valid PDF/.test(r.toast)&&!r.added,r.toast);
  r=await importFile(pg,{name:'book.epub',mimeType:'application/epub+zip',buffer:Buffer.from('PK')});
  T.ok('epub explained',/PDF and text/.test(r.toast)&&!r.added,r.toast);
  T.ok('busy overlay closed after failures',await pg.$eval('#busy',e=>e.hidden));
  /* oversize */
  r=await importFile(pg,HUGE,{timeout:60000});
  T.ok('oversize refused',/200 MB/.test(r.toast)&&!r.added,r.toast);
  /* txt */
  r=await importFile(pg,C('plain.txt'));
  T.ok('txt imported',r.added,r.toast);
  /* hard-wrapped text */
  const wrapped=Array.from({length:12},(_,i)=>'This is paragraph '+i+' of a hard wrapped file that\nbreaks its lines at about forty characters\nwithout any blank line inside each paragraph. It keeps going for a few more words.\n').join('\n');
  r=await importFile(pg,{name:'wrapped.txt',mimeType:'text/plain',buffer:Buffer.from(wrapped)});
  const rec=await readBook(pg,"(r=>r.meta.title==='wrapped')");
  const s=summarize(rec);
  T.ok('hard-wrapped text joined into 12 paragraphs',s&&s.paras===12,s);
  /* duplicates */
  r=await importFile(pg,C('plain.txt'));
  T.ok('duplicate detected',/already on your shelf/.test(r.toast)&&!r.added,r.toast);
  /* password */
  const lockedFlow=async(pwds)=>{
    await pg.evaluate(()=>{const t=document.getElementById('toast');t.textContent=''});
    await pg.setInputFiles('.ov',C('locked.pdf'));
    const res=[];
    for(const p of pwds){
      await pg.waitForSelector('#pwSheet:not([hidden])',{timeout:20000});
      res.push(await pg.$eval('#pwErr',e=>!e.hidden));
      if(p===null) await pg.click('#pwSheet [data-r=no]');
      else{await pg.fill('#pwIn',p);await pg.click('#pwSheet [data-r=ok]')}
    }
    return res;
  };
  const errShown=await lockedFlow(['wrong',null]);
  await pg.waitForFunction(()=>/cancel/i.test(document.getElementById('toast').textContent),null,{timeout:20000});
  T.eq('password prompt: first no error, second shows error',errShown,[false,true]);
  T.ok('cancelled locked import adds nothing',!(await shelf()).includes('locked'));
  await lockedFlow(['folio']);
  await pg.waitForFunction(()=>[...document.querySelectorAll('.bt')].some(e=>e.textContent==='locked'),null,{timeout:60000});
  T.ok('correct password opens the book',(await shelf()).includes('locked'));
  /* scanned: decline, then accept with mocked recogniser */
  await pg.evaluate(()=>{const t=document.getElementById('toast');t.textContent=''});
  await pg.setInputFiles('.ov',C('scanned.pdf'));
  await pg.waitForSelector('#ocrSheet:not([hidden])',{timeout:30000});
  T.ok('scanned book offers recognition',true);
  await pg.click('#ocrSheet [data-r=no]');
  await pg.waitForFunction(()=>document.getElementById('busy').hidden);
  T.ok('declining adds nothing',!(await shelf()).includes('scanned'));
  const ocr=JSON.parse(fs.readFileSync(C('scanned_ocr.json'),'utf8'));
  await pg.evaluate(o=>{let n=0;window.Tesseract={createWorker:async(lang)=>{window.__ocrLang=lang;return {recognize:async()=>({data:{text:o[n++%o.length]}}),terminate:async()=>{window.__ocrTerminated=true}}}}},ocr);
  await pg.setInputFiles('.ov',C('scanned.pdf'));
  await pg.waitForSelector('#ocrSheet:not([hidden])',{timeout:30000});
  await pg.selectOption('#ocrLang','eng');
  await pg.click('#ocrSheet [data-r=go]');
  await pg.waitForFunction(()=>[...document.querySelectorAll('.bt')].some(e=>e.textContent==='scanned'),null,{timeout:60000});
  const srec=await readBook(pg,"(r=>r.meta.title==='scanned')");
  const ss=summarize(srec);
  const truth=JSON.parse(fs.readFileSync(C('scanned_truth.json'),'utf8')).flat();
  const txt=srec.chapters.map(c=>c.blocks.map(b=>b.text||'').join(' ')).join(' ').replace(/\s+/g,' ');
  let hit=0;truth.forEach(p=>{if(txt.includes(p.split(' ').slice(0,6).join(' '))) hit++});
  T.ok('OCR text becomes a book (mock recogniser, real tesseract output)',ss&&ss.words>300&&hit>=truth.length-2,{ss,hit,of:truth.length});
  T.ok('recogniser was shut down',await pg.evaluate(()=>window.__ocrTerminated===true&&window.__ocrLang==='eng'));
  /* cancel mid-import then import again */
  await pg.evaluate(()=>{const t=document.getElementById('toast');t.textContent=''});
  await pg.setInputFiles('.ov',C('novel400.pdf'));
  await pg.waitForSelector('#busy:not([hidden])');await pg.waitForFunction(()=>/Reading page/.test(document.getElementById('busyMsg').textContent),null,{timeout:20000});
  await pg.click('#busyCancel');
  await pg.waitForFunction(()=>/cancel/i.test(document.getElementById('toast').textContent),null,{timeout:30000});
  T.ok('cancel adds nothing',!(await shelf()).includes('novel400'));
  r=await importFile(pg,C('novel40.pdf'));
  T.ok('import works again after a cancel',r.added,r.toast);
  T.eq('no page errors',pg.errors,[]);
  try{fs.unlinkSync(HUGE)}catch(e){}
  const f=T.done();await br.close();server.close();process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
