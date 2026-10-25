const {serve,mkPage,chromium}=require('./lib.cjs');
(async()=>{const {server,base}=await serve();const br=await chromium.launch();
for(const [w,h] of [[320,568],[390,844]]){
const pg=await mkPage(br,base,{viewport:{width:w,height:h}});await pg.goto(base+'/');await pg.waitForSelector('.book');
await pg.click('.book[data-id="figures-demo"]');await pg.waitForSelector('#scroller .card');await pg.waitForTimeout(800);
console.log(w,h,await pg.evaluate(()=>({inner:[innerWidth,innerHeight],stage:[document.getElementById('stage').clientWidth,document.getElementById('stage').clientHeight],mb:[document.getElementById('measureBody').clientWidth,document.getElementById('measureBody').clientHeight],cards:document.querySelectorAll('#scroller .card').length,perf:window.__pgCache,fs:getComputedStyle(document.getElementById('app')).getPropertyValue('--fs')})));
await pg.context().close()}
await br.close();server.close()})();
