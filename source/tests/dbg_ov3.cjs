const {serve,mkPage,chromium}=require('./lib.cjs');
(async()=>{const {server,base}=await serve();const br=await chromium.launch();
const pg=await mkPage(br,base,{viewport:{width:320,height:568}});await pg.goto(base+'/');await pg.waitForSelector('.book');
await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(800);
console.log(JSON.stringify(await pg.evaluate(async()=>{
const r=e=>{const b=e.getBoundingClientRect();return [Math.round(b.top),Math.round(b.height),Math.round(b.width)]};
const sc=document.getElementById('scroller');const mid=Math.floor(sc.children.length/2);sc.scrollTop=mid*sc.clientHeight;await new Promise(r=>setTimeout(r,300));const k=sc.children[mid];const m=document.querySelector('.card.measure');const c=k;
return {stage:r(document.getElementById('stage')),scroller:r(document.getElementById('scroller')),mcard:r(m),mbody:[r(document.getElementById('measureBody')),document.getElementById('measureBody').clientHeight],card:r(c),cbody:[r(c.firstChild),c.firstChild.clientHeight],k:[k.getBoundingClientRect().height,k.className,k.firstChild.clientHeight,getComputedStyle(k).paddingBottom,getComputedStyle(k.firstChild).paddingBottom,k.firstChild.scrollHeight],mcs:getComputedStyle(m).padding,ccs:getComputedStyle(c).padding,mb:getComputedStyle(m).height,cb:getComputedStyle(c).height}})));
await br.close();server.close()})();
