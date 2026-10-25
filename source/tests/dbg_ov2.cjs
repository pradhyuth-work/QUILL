const {serve,mkPage,chromium}=require('./lib.cjs');
(async()=>{const {server,base}=await serve();const br=await chromium.launch();
const pg=await mkPage(br,base,{viewport:{width:320,height:568}});await pg.goto(base+'/');await pg.waitForSelector('.book');
await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(800);
console.log(JSON.stringify(await pg.evaluate(async()=>{
const s=document.getElementById('scroller');const mid=Math.floor(s.children.length/2);s.scrollTop=mid*s.clientHeight;await new Promise(r=>setTimeout(r,200));
window.__x=1;const real=s.children[mid].querySelector('.t'),m=document.getElementById('measureT');
const w=[real.getBoundingClientRect().width,m.getBoundingClientRect().width];
const inner=real.innerHTML;m.innerHTML=inner;
return {lim:window.__lim,w,rh:real.offsetHeight,mh:m.offsetHeight,rfont:getComputedStyle(real).fontSize+getComputedStyle(real).fontFamily.slice(0,20),mfont:getComputedStyle(m).fontSize,rlh:getComputedStyle(real).lineHeight,mlh:getComputedStyle(m).lineHeight,html:inner.slice(0,300)}})));
await br.close();server.close()})();
