const {serve,mkPage,chromium,SP,path,importFile,readBook,summarize}=require('./lib.cjs');
const fs=require('fs');
const C=f=>path.join(__dirname,'corpus',f);
const only=process.argv[2];
(async()=>{
  const {server,base}=await serve();const br=await chromium.launch();
  const truth=JSON.parse(fs.readFileSync(C('truth.json')));
  const files=['novel40.pdf','twocol.pdf','twocol_i.pdf','lang_fr.pdf','lang_ru.pdf','lang_hi.pdf','lang_de.pdf','lang_zh.pdf','plain.txt'].filter(f=>!only||f.includes(only));
  for(const f of files){
    const page=await mkPage(br,base);await page.goto(base+'/');await page.waitForSelector('.book');
    const r=await importFile(page,C(f));
    const rec=await readBook(page,"(r=>r.meta.title.toLowerCase().indexOf('"+f.replace(/\.\w+$/,'').replace(/_/g,' ').toLowerCase()+"')>=0)");
    const s=summarize(rec);
    console.log('==',f,r.ms+'ms',JSON.stringify(r.toast),'errors',page.errors.length?page.errors:'');
    if(s){console.log(JSON.stringify(s));
      const txt=rec.chapters.map(c=>c.blocks.filter(b=>b.type==='p').map(b=>b.text).join('\n')).join('\n');
      rec.chapters.slice(0,3).forEach(c=>{const p=c.blocks.find(b=>b.type==='p');if(p) console.log('  ['+c.title+'] '+p.text.slice(0,140))});
      globalThis['txt_'+f]=txt;
    }
    await page.context().close();
  }
  await br.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
