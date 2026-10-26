// End to end: import the sidebar test books through the real app and check what the reader would show.
// Needs: python build.py (dist/artifact.html) and python gen_sidebar.py (corpus/sidebar_*.pdf + truth).
const {serve,mkPage,chromium,path,importFile,readBook,makeT}=require('./lib.cjs');
const fs=require('fs');
const C=f=>path.join(__dirname,'corpus',f);
(async()=>{
  const {server,base}=await serve();const br=await chromium.launch();
  const t=makeT('sidebar in the app');
  for(const name of ['sidebar_book','sidebar_mirror','smallprint']){
    const truth=JSON.parse(fs.readFileSync(C(name+'_truth.json')));
    const page=await mkPage(br,base);await page.goto(base+'/');await page.waitForSelector('.book');
    const r=await importFile(page,C(name+'.pdf'));
    t.ok(name+': imported',r.added,r.toast);
    const rec=await readBook(page,'(()=>true)');
    const paras=[];(rec?rec.chapters:[]).forEach(c=>c.blocks.forEach(b=>{if(b.type==='p'||b.type==='h') paras.push(b.text)}));
    const flat=paras.join('\n').replace(/\s+/g,' ');
    let pos=0,found=0;
    for(const p of truth.paras){const i=flat.indexOf(p.split(' ').slice(0,6).join(' '),pos);if(i>=0){found++;pos=i}}
    const sb=new Set(truth.sidebar_words);
    const leaked=(flat.toLowerCase().match(/[a-z]+/g)||[]).filter(w=>sb.has(w));
    t.eq(name+': main paragraphs in order',found,truth.paras.length);
    t.eq(name+': sidebar words in the reader',leaked.length,0);
    t.ok(name+': no page errors',page.errors.length===0,page.errors);
    await page.context().close();
  }
  await br.close();server.close();
  process.exit(t.done()?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
