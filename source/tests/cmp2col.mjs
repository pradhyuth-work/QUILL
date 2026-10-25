import fs from 'fs';import vm from 'vm';
const pdfjs=await import('/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('../src/extract.js','utf8')+';this.api={folioReadPdf,folioChapters};',ctx);
const truth=JSON.parse(fs.readFileSync('corpus/truth.json'));
for(const [f,k] of [['twocol.pdf','twocol'],['twocol_i.pdf','twocol_i']]){
  const res=await ctx.api.folioReadPdf(pdfjs,new Uint8Array(fs.readFileSync('corpus/'+f)),null,{noFigures:true});
  const out=res.blocks.map(b=>b.text).join('\n');
  const flat=out.replace(/\s+/g,' ');
  let pos=0,found=0,miss=[];
  for(const p of truth[k].paras){
    const key=p.split(' ').slice(0,6).join(' ');
    const i=flat.indexOf(key,pos);
    if(i>=0){found++;pos=i}else miss.push(key);
  }
  const foot=truth[k].foot.filter(f=>flat.includes(f.slice(0,18))).length;
  const digitsGlued=(flat.match(/[a-z]{3,}\d{1,2}\b/g)||[]);
  console.log(f,'paras in order',found+'/'+truth[k].paras.length,'footnotes leaked',foot+'/'+truth[k].foot.length,'glued marks',digitsGlued.length,'blocks',res.blocks.length);
  if(miss.length) console.log('  missing',miss.slice(0,4));
}
