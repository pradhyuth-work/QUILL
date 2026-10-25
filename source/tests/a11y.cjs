const {serve,mkPage,chromium,SP,path,makeT,importFile}=require('./lib.cjs');
const audit=()=>{
  const out={contrast:[],small:[],noname:[]};
  const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return[0,0,0,0];const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return[p[0],p[1],p[2],p.length>3?p[3]:1]};
  const over=(f,b)=>[f[0]*f[3]+b[0]*(1-f[3]),f[1]*f[3]+b[1]*(1-f[3]),f[2]*f[3]+b[2]*(1-f[3]),1];
  const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};
  const bgOf=el=>{
    const stack=[];let e=el;
    while(e&&e.nodeType===1){const cs=getComputedStyle(e);const c=parse(cs.backgroundColor);if(c[3]>0)stack.push(c);if(c[3]>=1)break;if(cs.backgroundImage!=='none'&&e!==el)return null;e=e.parentElement}
    let bg=[255,255,255,1];if(stack.length&&stack[stack.length-1][3]<1)stack.push(parse(getComputedStyle(document.body).backgroundColor));
    for(let i=stack.length-1;i>=0;i--)bg=over(stack[i],bg);return bg;
  };
  const vis=el=>{const r=el.getBoundingClientRect();if(r.width<1||r.height<1)return false;for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)return false}return r.bottom>0&&r.right>0&&r.top<innerHeight+2000};
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const seen=new Set();let n;
  while(n=walker.nextNode()){
    const t=n.nodeValue.trim();if(!t)continue;const el=n.parentElement;if(!el||seen.has(el)||!vis(el)||el.closest('.measure,.vh'))continue;seen.add(el);
    const cs=getComputedStyle(el);const fg=parse(cs.color);const bg=bgOf(el);if(!bg)continue;
    let op=1;for(let e=el;e;e=e.parentElement)op*=+getComputedStyle(e).opacity;fg[3]*=op;
    const f=over(fg,bg);const L1=lum(f),L2=lum(bg);const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    const size=parseFloat(cs.fontSize),bold=+cs.fontWeight>=700;const large=size>=24||(size>=18.66&&bold);
    if(ratio<(large?3:4.5))out.contrast.push({t:t.slice(0,30),ratio:+ratio.toFixed(2),size,sel:(el.id?'#'+el.id:el.className||el.tagName)});
  }
  document.querySelectorAll('button,[role=button],a[href],input:not([type=hidden]):not([type=file]),select,textarea,[tabindex="0"]').forEach(el=>{
    if(!vis(el)||el.closest('.measure'))return;
    const r=el.getBoundingClientRect();const mn=Math.min(r.width,r.height);
    if(mn<44)out.small.push({el:(el.id?'#'+el.id:el.className||el.tagName)+(el.getAttribute('aria-label')?'['+el.getAttribute('aria-label').slice(0,18)+']':''),w:Math.round(r.width),h:Math.round(r.height)});
    const name=(el.getAttribute('aria-label')||el.textContent||el.getAttribute('title')||'').trim()||(el.labels&&el.labels[0]&&el.labels[0].textContent.trim())||el.getAttribute('aria-labelledby');
    if(!name&&el.type!=='range')out.noname.push(el.outerHTML.slice(0,80));
    if(!name&&el.type==='range'&&!el.getAttribute('aria-label')&&!(el.labels&&el.labels.length))out.noname.push(el.outerHTML.slice(0,80));
  });
  return out;
};
(async()=>{
  const T=makeT('a11y');const {server,base}=await serve();const br=await chromium.launch();
  const report={};
  for(const scheme of ['light','dark']){
    const pg=await mkPage(br,base,{scheme});await pg.goto(base+'/');await pg.waitForSelector('.book');
    const S={};
    const take=async k=>{S[k]=await pg.evaluate(audit)};
    await take('library');
    await pg.evaluate(()=>{const d=document.createElement('div');d.id='pal';d.className='shelf';d.innerHTML=[0,1,2,3,4,5,6,7].map(i=>'<div class="book"><div class="cover c'+i+'"><span class="tag">PDF</span><div><div class="ct">Title '+i+'</div><div class="ca">Author name</div></div></div><div><div class="bt">Book</div><div class="bm num">12 min read</div></div></div>').join('')+[0,1,2,3,4,5,6,7].map(i=>'<div class="cvp c'+i+'" style="position:relative;height:200px"><div class="cvp-t">Title</div><div class="cvp-a">Author</div><div class="cvp-m num">3 min read</div><div class="cvp-h">Swipe up to begin</div></div>').join('');document.getElementById('shelf').prepend(d)});
    await take('palette');await pg.evaluate(()=>document.getElementById('pal').remove());
    await pg.click('#editBtn');await take('library-edit');
    await pg.click('[aria-label="Edit Pictures in the Flow"]');await pg.waitForTimeout(400);await take('edit-sheet');await pg.keyboard.press('Escape');await pg.waitForTimeout(400);
    await pg.click('#editBtn');
    await pg.click('#moreBtn');await pg.waitForTimeout(300);await take('more-sheet');await pg.click('#moreDone');await pg.waitForTimeout(300);
    await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(500);
    await pg.evaluate(()=>{document.getElementById('scroller').scrollTop=document.getElementById('scroller').clientHeight*5});await pg.waitForTimeout(300);
    await take('reader');
    await pg.click('#mListen');await pg.waitForTimeout(600);await pg.click('#play');await pg.waitForTimeout(700);await take('listen-playing');
    await pg.click('#aa');await pg.waitForTimeout(500);await take('reading-settings');await pg.click('#sheetDone');await pg.waitForTimeout(400);
    report[scheme]=S;
    T.eq('no page errors '+scheme,pg.errors,[]);
    await pg.context().close();
  }
  const agg={contrast:{},small:{},noname:{}};
  for(const sch in report)for(const scr in report[sch]){
    const r=report[sch][scr];
    r.contrast.forEach(c=>{const k=sch+'/'+scr+' '+c.sel+' "'+c.t+'" '+c.ratio+' @'+c.size+'px';agg.contrast[k]=1});
    r.small.forEach(c=>{const k=c.el+' '+c.w+'x'+c.h;(agg.small[k]=agg.small[k]||[]).push(sch+'/'+scr)});
    r.noname.forEach(c=>{agg.noname[c]=1});
  }
  console.log('CONTRAST FAILURES',Object.keys(agg.contrast).length);Object.keys(agg.contrast).forEach(k=>console.log('  ',k));
  console.log('TARGETS UNDER 44px',Object.keys(agg.small).length);Object.keys(agg.small).forEach(k=>console.log('  ',k,agg.small[k].length>2?'(many)':agg.small[k].join(',')));
  console.log('UNNAMED CONTROLS',Object.keys(agg.noname).length);Object.keys(agg.noname).forEach(k=>console.log('  ',k));
  T.ok('no contrast failures',Object.keys(agg.contrast).length===0);
  T.ok('no unnamed controls',Object.keys(agg.noname).length===0);
  const f=T.done();await br.close();server.close();process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
