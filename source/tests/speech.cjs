const {serve,mkPage,chromium,SP,path,makeT}=require('./lib.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const T=makeT('speech');const {server,base}=await serve();const br=await chromium.launch();
  async function open(o,book){
    const pg=await mkPage(br,base,o||{});
    await pg.addInitScript(()=>{
      window.__wl={req:0,rel:0};
      Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{window.__wl.req++;return {release:async()=>{window.__wl.rel++},addEventListener(){}}}}});
      window.__ms={meta:null,h:{}};
      window.MediaMetadata=function(m){this.m=m;window.__ms.meta=m};
      Object.defineProperty(navigator,'mediaSession',{configurable:true,value:{set metadata(v){},get metadata(){return null},playbackState:'none',setActionHandler(a,f){window.__ms.h[a]=f}}});
      window.__wdStart=700;window.__wdExtra=900;window.__speechMs=60;
    });
    await pg.goto(base+'/');await pg.waitForSelector('.book');
    await pg.click('.book[data-id="'+(book||'sample')+'"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(500);
    return pg;
  }
  const play=async pg=>{await pg.click('#mListen');await pg.click('#play')};
  /* 1. basic flow + media session + wake lock */
  let pg=await open();
  await play(pg);await pg.waitForTimeout(1500);
  const sp1=await pg.evaluate(()=>window.__spoken.slice());
  T.ok('speaks cover title first',/Reading on Glass/.test(sp1[0]),sp1.slice(0,2));
  T.ok('speaks sentences in order',sp1.length>=5&&sp1[1]==='For most of history, a page was a fixed object.',sp1.slice(0,4));
  T.eq('highlight present',(await pg.$$('.s.now')).length,1);
  T.ok('wake lock requested',(await pg.evaluate(()=>window.__wl.req))>=1);
  T.ok('media session metadata',(await pg.evaluate(()=>window.__ms.meta&&window.__ms.meta.title))==='Reading on Glass');
  T.ok('media session handlers',await pg.evaluate(()=>['play','pause','nexttrack','previoustrack'].every(k=>typeof window.__ms.h[k]==='function')));
  await pg.evaluate(()=>window.__ms.h.pause());await pg.waitForTimeout(200);
  T.eq('pause from lock screen',await pg.getAttribute('#play','aria-label'),'Play');
  T.ok('wake lock released',(await pg.evaluate(()=>window.__wl.rel))>=1);
  const n0=await pg.evaluate(()=>window.__spoken.length);await pg.waitForTimeout(500);
  T.eq('silent while paused',await pg.evaluate(()=>window.__spoken.length),n0);
  await pg.evaluate(()=>window.__ms.h.play());await pg.waitForTimeout(500);
  T.eq('play from lock screen',await pg.getAttribute('#play','aria-label'),'Pause');
  /* 2. next card cancels cleanly, no duplicates */
  await pg.evaluate(()=>{window.__fireOnCancel=true;window.__spoken.length=0});
  await pg.click('#next');await pg.waitForTimeout(1200);
  const sp2=await pg.evaluate(()=>window.__spoken.slice());
  const dups=sp2.filter((x,i)=>sp2.indexOf(x)!==i);
  T.eq('no duplicate sentences after skip',dups,[]);
  T.eq('no errors 1',pg.errors,[]);
  await pg.context().close();

  /* 3. stalls: every third utterance never ends */
  pg=await open();
  await pg.evaluate(()=>{window.__speechMode='stall'});
  await play(pg);await pg.waitForTimeout(9000);
  const sp3=await pg.evaluate(()=>window.__spoken.slice());
  const uniq=new Set(sp3).size;
  T.ok('keeps going through stalls (progress)',uniq>=8,{uniq,total:sp3.length});
  T.eq('still playing',await pg.getAttribute('#play','aria-label'),'Pause');
  await pg.context().close();

  /* 4. long sentences are chunked
     (figures-demo's authored text has no sentence anywhere near 180 chars, so this
     no longer exercises real chunking behaviour; it was meaningful with the long,
     messily-extracted vedic-report PDF, which has been removed) */
  pg=await open({},'figures-demo');
  await play(pg);await pg.waitForTimeout(2500);
  T.ok('every spoken piece <= 180 chars',(await pg.evaluate(()=>window.__spoken.every(t=>t.length<=180))));
  await pg.context().close();

  /* 5. voices that arrive late; language matching */
  pg=await mkPage(br,base,{speechOpts:{voices:[]}});
  await pg.goto(base+'/');await pg.waitForSelector('.book');
  await pg.click('.book[data-id="sample"]');await pg.waitForSelector('#scroller .card');
  T.eq('no voices at first',await pg.$eval('#voiceChip',e=>e.textContent),'Voice');
  await pg.evaluate(()=>{window.__voices=[{name:'Late Voice',lang:'en-US',voiceURI:'late',localService:true},{name:'Hindi Voice',lang:'hi-IN',voiceURI:'hi',localService:true}];window.__fireVoices()});
  await pg.waitForTimeout(300);
  T.eq('late voice picked up',await pg.$eval('#voiceChip',e=>e.textContent),'Late');
  T.ok('voice list grouped',(await pg.$$eval('#voiceSel optgroup',e=>e.length))>=1);
  await pg.context().close();

  /* 6. voices appear without any event (polling) */
  pg=await mkPage(br,base,{speechOpts:{voices:[]}});
  await pg.goto(base+'/');await pg.waitForSelector('.book');
  await pg.evaluate(()=>setTimeout(()=>{window.__voices=[{name:'Quiet Voice',lang:'en-GB',voiceURI:'q',localService:true}]},900));
  await pg.click('.book[data-id="sample"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(1800);
  T.eq('polled voice',await pg.$eval('#voiceChip',e=>e.textContent),'Quiet');
  await pg.context().close();

  /* 7. interrupted by the system => UI reflects paused */
  pg=await open();
  await play(pg);await pg.waitForFunction(()=>window.__spoken.length>=2);
  await pg.evaluate(()=>{const s=speechSynthesis;const u=s._cur;clearTimeout(s._t);s._cur=null;u&&u.onerror&&u.onerror({error:'interrupted'})});
  await pg.waitForTimeout(300);
  T.eq('shows paused after outside interruption',await pg.getAttribute('#play','aria-label'),'Play');
  await pg.context().close();

  /* 8. sleep timer: pause at chapter end */
  pg=await open();
  await pg.click('#mListen');await pg.click('#next');await pg.waitForTimeout(700);
  await pg.click('#aa');await pg.click('#sleepOpts [data-m="end"]');await pg.click('#sheetDone');await pg.waitForTimeout(400);
  await play(pg);
  await pg.waitForFunction(()=>document.getElementById('play').getAttribute('aria-label')==='Play',null,{timeout:60000});
  const ch=await pg.$eval('#chLabel',e=>e.textContent);
  const last=await pg.evaluate(()=>window.__spoken[window.__spoken.length-1]);
  T.ok('paused at end of first chapter',ch==='Why the page moved'&&/Each piece then becomes one screen of reading/.test(last),{ch,last});
  await pg.context().close();

  /* 9. returning to the tab resumes if speech was silenced */
  pg=await open();
  await play(pg);await pg.waitForTimeout(500);
  const before=await pg.evaluate(()=>window.__spoken.length);
  await pg.evaluate(()=>{clearTimeout(speechSynthesis._t);speechSynthesis.speaking=false;speechSynthesis._cur=null;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.dispatchEvent(new Event('visibilitychange'))});
  await pg.waitForTimeout(900);
  T.ok('resumes after return',(await pg.evaluate(()=>window.__spoken.length))>before+1);
  await pg.context().close();

  const f=T.done();await br.close();server.close();process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
