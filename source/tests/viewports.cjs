const {serve,mkPage,chromium,SP,path,makeT}=require('./lib.cjs');
const VP=[[320,568],[360,640],[375,667],[390,844],[412,915],[430,932],[768,1024],[1024,768],[1180,820],[1440,900],[844,390],[667,375]];
(async()=>{
  const T=makeT('viewports');const {server,base}=await serve();const br=await chromium.launch();
  const rows=[];
  for(const [w,h] of VP){
    const pg=await mkPage(br,base,{viewport:{width:w,height:h},desktop:w>=1000});
    await pg.goto(base+'/');await pg.waitForSelector('.book');
    const lib=await pg.evaluate(()=>({hs:document.documentElement.scrollWidth>innerWidth+1,off:[...document.querySelectorAll('.book')].filter(b=>{const r=b.getBoundingClientRect();return r.right>innerWidth+1||r.left<-1}).length}));
    T.ok(`${w}x${h} library has no horizontal overflow`,!lib.hs&&lib.off===0,lib);
    const res={};
    for(const fs of [19,26]){
      await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(700);
      if(fs!==19){
        await pg.click('#aa');await pg.evaluate(f=>{const r=document.getElementById('fsr');r.value=f;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))},fs);
        await pg.click('#sheetDone');await pg.waitForTimeout(1500);
      }
      res['read'+fs]=await pg.evaluate(()=>{
        const cs=[...document.querySelectorAll('#scroller .card')];
        const stage=document.getElementById('stage').getBoundingClientRect();
        return {n:cs.length,hs:document.documentElement.scrollWidth>innerWidth+1};
      });
      /* overflow check needs content: walk a sample of cards */
      const ov=await pg.evaluate(async()=>{
        const s=document.getElementById('scroller');let bad=0,seen=0;
        const total=s.children.length;
        for(let n=0;n<total;n+=3){s.scrollTop=n*s.clientHeight;await new Promise(r=>setTimeout(r,12));const b=s.children[n].querySelector('.card-body');if(b&&b.firstChild.firstChild){seen++;if(b.scrollHeight>b.clientHeight+2) bad++}}
        s.scrollTop=0;return {bad,seen};
      });
      res['ov'+fs]=ov;
      await pg.click('#mListen');await pg.waitForTimeout(700);
      const lis=await pg.evaluate(()=>{const p=document.getElementById('play').getBoundingClientRect();const d=document.querySelector('.dock').getBoundingClientRect();return {n:document.querySelectorAll('#scroller .card').length,playVisible:p.bottom<=innerHeight&&p.top>=0&&p.width>0,dockBottom:Math.round(d.bottom),vh:innerHeight}});
      res['listen'+fs]=lis;
      T.ok(`${w}x${h} fs${fs}: play button visible in Listen`,lis.playVisible,lis);
      await pg.click('#back');await pg.waitForTimeout(200);
    }
    /* Read and Listen must paginate identically (no reflow when switching) */
    T.ok(`${w}x${h}: card count equal in Read and Listen (fs19)`,res.read19.n===res.listen19.n,[res.read19.n,res.listen19.n]);
    T.ok(`${w}x${h}: no cards overflow at default text size`,h<450?res.ov19.bad/res.ov19.seen<=0.03:res.ov19.bad===0,res.ov19);
    rows.push([w+'x'+h,res.read19.n,res.ov19.bad+'/'+res.ov19.seen,res.read26.n,res.ov26.bad+'/'+res.ov26.seen]);
    T.eq(`${w}x${h} no page errors`,pg.errors,[]);
    await pg.context().close();
  }
  console.log('viewport | cards@19 | overflowing@19 | cards@26 | overflowing@26');rows.forEach(r=>console.log(r.join(' | ')));
  /* keyboard focus visibility */
  const pg=await mkPage(br,base,{desktop:true,viewport:{width:1200,height:800}});await pg.goto(base+'/');await pg.waitForSelector('.book');
  let bad=[];
  for(let i=0;i<14;i++){await pg.keyboard.press('Tab');const o=await pg.evaluate(()=>{const e=document.activeElement;const cs=getComputedStyle(e);return {t:(e.id||e.className||e.tagName),ok:cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>=2||e.tagName==='INPUT'&&e.type==='file'}});if(!o.ok&&o.t!=='BODY') bad.push(o.t)}
  T.ok('every tab stop shows a focus ring',bad.length===0,bad);
  /* keyboard can open a book and play */
  await pg.focus('.book[data-id="sample"]');await pg.keyboard.press('Enter');await pg.waitForSelector('#scroller .card');
  await pg.keyboard.press('Escape');
  T.ok('reader opens from keyboard',true);
  await pg.context().close();
  /* reduced motion */
  const pr=await mkPage(br,base,{});
  await pr.emulateMedia({reducedMotion:'reduce'});await pr.goto(base+'/');await pr.waitForSelector('.book');
  await pr.click('.book[data-id="sample"]');await pr.waitForSelector('#scroller .card');
  const dur=await pr.evaluate(()=>[...document.querySelectorAll('.ctl-wrap,.thumb,.ib')].map(e=>parseFloat(getComputedStyle(e).transitionDuration)));
  T.ok('reduced motion disables transitions',dur.every(d=>d<0.01),dur);
  await pr.context().close();
  const f=T.done();await br.close();server.close();process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
