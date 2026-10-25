const {serve,mkPage,chromium}=require('./lib.cjs');
(async()=>{const {server,base}=await serve();const br=await chromium.launch();
const pg=await mkPage(br,base,{viewport:{width:320,height:568}});await pg.goto(base+'/');await pg.waitForSelector('.book');
await pg.click('.book[data-id="vedic-report"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(800);
const snap=()=>pg.evaluate(()=>{const o={};const a=document.getElementById('stage');for(let e=a.parentElement;e&&e!==document.body;e=e.parentElement){}
 [...document.querySelectorAll('#reader > *, #reader .top, #reader .dock, #reader .meta, #reader .prog')].forEach(e=>{o[(e.id||e.className||e.tagName).toString().slice(0,24)]=Math.round(e.getBoundingClientRect().height)});return o});
console.log(JSON.stringify(await snap()));
await pg.evaluate(()=>{const s=document.getElementById('scroller');s.scrollTop=132*s.clientHeight});await pg.waitForTimeout(400);
console.log(JSON.stringify(await snap()));
await br.close();server.close()})();
