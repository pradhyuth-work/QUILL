const {serve,mkPage,chromium}=require('./lib.cjs');
(async()=>{const {server,base}=await serve();const br=await chromium.launch();
const page=await mkPage(br,base,{speech:false});
await page.goto(base+'/');await page.waitForTimeout(2500);
console.log('books',await page.$$eval('.book',e=>e.length),page.errors);
await br.close();server.close();})();
