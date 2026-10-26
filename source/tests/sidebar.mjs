// Margin sidebars must not reach the reader, and the main text must all survive, in order.
// Needs: python gen_sidebar.py (writes corpus/sidebar_book.pdf, sidebar_mirror.pdf, smallprint.pdf, ingredients.pdf and their *_truth.json).
// Usage: node sidebar.mjs [path/to/extract.js]   (defaults to ../src/extract.js, so an older copy can be compared)
import fs from 'fs';import vm from 'vm';import path from 'path';
const pdfjs=await import('/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const src=path.resolve(process.argv[2]||'../src/extract.js');
const ctx={console,setTimeout};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(src,'utf8')+';this.api={folioReadPdf,folioChapters,find:typeof folioSidebarFind==="function"?folioSidebarFind:null,dominant:folioDominantSize};',ctx);
let ok=true;
const line=(pass,name,msg)=>{ok=ok&&pass;console.log((pass?'PASS ':'FAIL ')+name.padEnd(15),msg)};

// 1. whole pipeline: sidebar_book and sidebar_mirror lose their sidebars; smallprint (small full-width text, no main column beside it) is kept whole
const books=[['sidebar_book','sidebar on the left, 5pt gutter, sparse pages'],['sidebar_mirror','sidebar on the outer margin, alternating sides'],['smallprint','control: small full-width text is NOT a sidebar']];
for(const [name,what] of books){
  const truth=JSON.parse(fs.readFileSync('corpus/'+name+'_truth.json'));
  const res=await ctx.api.folioReadPdf(pdfjs,new Uint8Array(fs.readFileSync('corpus/'+name+'.pdf')),null,{noFigures:true});
  const flat=res.blocks.map(b=>b.text).join('\n').replace(/\s+/g,' ');
  let pos=0,found=0,miss=[];
  for(const p of truth.paras){
    const key=p.split(' ').slice(0,6).join(' ');
    const i=flat.indexOf(key,pos);
    if(i>=0){found++;pos=i}else miss.push(key);
  }
  const sb=new Set(truth.sidebar_words);
  const leaked=(flat.toLowerCase().match(/[a-z]+/g)||[]).filter(w=>sb.has(w));
  line(found===truth.paras.length&&leaked.length===0,name,'main paragraphs in order '+(found+'/'+truth.paras.length).padEnd(6)+' sidebar words leaked '+String(leaked.length).padEnd(4)+' blocks '+res.blocks.length+'  ('+what+')');
  if(miss.length) console.log('     missing main paragraphs, e.g.',miss.slice(0,3));
  if(leaked.length) console.log('     leaked, e.g.',[...new Set(leaked)].slice(0,8).join(', '));
}

// 2. the detector itself: a narrow list of short fragments beside the text (recipe ingredients) must not be called a sidebar
async function pageItems(file){
  const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync('corpus/'+file)),standardFontDataUrl:'/opt/npm-tools/node_modules/pdfjs-dist/standard_fonts/'}).promise;
  const pages=[];
  for(let n=1;n<=doc.numPages;n++){
    const pg=await doc.getPage(n),v=pg.view,tc=await pg.getTextContent();
    pages.push({W:v[2]-v[0],items:tc.items.filter(i=>typeof i.str==='string').map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],w:i.width,z:Math.hypot(i.transform[2],i.transform[3])||i.height}))});
  }
  return pages;
}
if(ctx.api.find){
  const pages=await pageItems('ingredients.pdf'),all=[];pages.forEach(p=>p.items.forEach(i=>all.push(i)));
  const dz=ctx.api.dominant(all);
  const hits=pages.map((p,i)=>ctx.api.find(p.items,p.W,dz,null)?i+1:0).filter(Boolean);
  line(hits.length===0,'ingredients','detector flagged '+hits.length+' of '+pages.length+' pages as having a sidebar'+(hits.length?' (pages '+hits.join(',')+')':'')+'  (control: a list of short fragments is content)');
  // and the detector does fire on real sidebar pages (page-level, no help from the rest of the book)
  const sp=await pageItems('sidebar_book.pdf'),sall=[];sp.forEach(p=>p.items.forEach(i=>sall.push(i)));
  const sdz=ctx.api.dominant(sall);
  const sfound=[3,4,5,6,7,8,9,10].filter(n=>ctx.api.find(sp[n-1].items,sp[n-1].W,sdz,null));
  line(sfound.length===8,'sidebar_book','detector found the sidebar by itself on '+sfound.length+' of 8 full sidebar pages');
}
process.exit(ok?0:1);
