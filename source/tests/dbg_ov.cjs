const {serve,mkPage,chromium}=require('./lib.cjs');
(async()=>{const {server,base}=await serve();const br=await chromium.launch();
for(const [w,h] of [[320,568],[667,375]]){
const pg=await mkPage(br,base,{viewport:{width:w,height:h}});await pg.goto(base+'/');await pg.waitForSelector('.book');
await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(800);
console.log(w,h,JSON.stringify(await pg.evaluate(async()=>{
const s=document.getElementById('scroller');const out=[];
for(let n=0;n<s.children.length;n+=3){s.scrollTop=n*s.clientHeight;await new Promise(r=>setTimeout(r,12));const b=s.children[n].querySelector('.card-body');if(b&&b.firstChild&&b.firstChild.firstChild&&b.scrollHeight>b.clientHeight+2){const kids=[...b.firstChild.children].map(k=>k.tagName+'.'+k.className+':'+Math.round(k.getBoundingClientRect().height));out.push({n,sh:b.scrollHeight,ch:b.clientHeight,kids:kids.slice(0,6),ns:b.querySelectorAll(".s").length,mt:document.getElementById("measureT").offsetHeight,mb:document.getElementById("measureBody").clientHeight,txt:b.textContent.slice(0,50)})}}
return out.slice(0,6)})));
await pg.context().close()}
await br.close();server.close()})();
