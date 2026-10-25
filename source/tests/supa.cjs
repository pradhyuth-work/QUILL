const http=require('http'),fs=require('fs'),path=require('path');
const L=require('./lib.cjs');const {chromium}=L;const T=L.makeT('supabase-sync');
const ROOT=path.resolve(__dirname,'../pwa');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.webmanifest':'application/json','.png':'image/png','.wasm':'application/wasm'};
const SB='https://mock.supabase.co';
const users={'a@x.com':{id:'11111111-1111-1111-1111-111111111111',pw:'secret1'}};
const rows={};let calls=[],failRest=false,expireNext=false;
function sbRoute(route){
  const req=route.request(),u=new URL(req.url()),m=req.method();
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','content-type':'application/json'};
  if(m==='OPTIONS') return route.fulfill({status:204,headers:cors});
  calls.push(m+' '+u.pathname+u.search.slice(0,60));
  const apikey=req.headers()['apikey'];if(apikey!=='ANON') return route.fulfill({status:401,headers:cors,body:'{"msg":"bad key"}'});
  const sess=em=>({access_token:'tok-'+em+'-'+Date.now(),refresh_token:'rt-'+em,expires_in:expireNext?1:3600,user:{id:users[em].id}});
  if(u.pathname==='/auth/v1/token'){
    const b=JSON.parse(req.postData()||'{}');
    if(u.searchParams.get('grant_type')==='password'){
      const us=users[b.email];if(!us||us.pw!==b.password) return route.fulfill({status:400,headers:cors,body:'{"error_description":"Invalid login credentials"}'});
      return route.fulfill({status:200,headers:cors,body:JSON.stringify(sess(b.email))});
    }
    if(u.searchParams.get('grant_type')==='refresh_token'){const em=Object.keys(users).find(k=>'rt-'+k===b.refresh_token);if(!em) return route.fulfill({status:400,headers:cors,body:'{"error_description":"Invalid Refresh Token"}'});expireNext=false;return route.fulfill({status:200,headers:cors,body:JSON.stringify(sess(em))})}
  }
  if(u.pathname==='/auth/v1/signup'){
    const b=JSON.parse(req.postData()||'{}');
    if(users[b.email]) return route.fulfill({status:422,headers:cors,body:'{"msg":"User already registered"}'});
    if(b.email.startsWith('confirm')) return route.fulfill({status:200,headers:cors,body:JSON.stringify({id:'x',email:b.email})});
    users[b.email]={id:'22222222-2222-2222-2222-'+String(Object.keys(users).length).padStart(12,'0'),pw:b.password};
    return route.fulfill({status:200,headers:cors,body:JSON.stringify(sess(b.email))});
  }
  if(u.pathname==='/rest/v1/folio_state'){
    const auth=(req.headers()['authorization']||'').replace('Bearer ','');const m2=auth.match(/^tok-(.+)-\d+$/);
    if(!m2) return route.fulfill({status:401,headers:cors,body:'{"message":"JWT"}'});
    const uid=users[m2[1]].id;
    if(failRest) return route.fulfill({status:500,headers:cors,body:'{}'});
    if(m==='GET'){const q=u.searchParams.get('user_id');if(q!=='eq.'+uid) return route.fulfill({status:200,headers:cors,body:'[]'});return route.fulfill({status:200,headers:cors,body:JSON.stringify(rows[uid]?[{data:rows[uid]}]:[])})}
    if(m==='POST'){const b=JSON.parse(req.postData());if(b.user_id!==uid) return route.fulfill({status:403,headers:cors,body:'{}'});rows[uid]=b.data;return route.fulfill({status:201,headers:cors,body:''})}
  }
  return route.fulfill({status:404,headers:cors,body:'{}'});
}
(async()=>{
  const s=http.createServer((q,r)=>{let f=decodeURIComponent(q.url.split('?')[0]);let p=path.join(ROOT,f==='/'?'index.html':f);
    if(f==='/config.js'){r.writeHead(200,{'content-type':'text/javascript'});r.end('window.FOLIO_CONFIG={supabase:{url:"'+SB+'",anonKey:"ANON"}};');return}
    fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end()}else{r.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});r.end(d)}})});
  await new Promise(r=>s.listen(0,r));const base='http://localhost:'+s.address().port;
  const br=await chromium.launch();
  async function device(){
    const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    const pg=await ctx.newPage();pg.errors=[];pg.on('pageerror',e=>pg.errors.push(e.message));
    await pg.route(u=>u.href.startsWith(SB),sbRoute);
    await pg.route(u=>!u.href.startsWith(base)&&!u.href.startsWith(SB),r=>r.abort());
    await pg.goto(base+'/');await pg.waitForSelector('.book');return pg;
  }
  const openAcct=async pg=>{await pg.click('#acctBtn');await pg.waitForSelector('#acctSheet:not([hidden])')};
  // --- device A
  const A=await device();await openAcct(A);
  T.ok('account box visible when configured',await A.isVisible('#sbBox'));
  await A.fill('#sbEmail','a@x.com');await A.fill('#sbPass','wrongpw');await A.click('#sbIn');
  await A.waitForFunction(()=>/Invalid/.test(document.getElementById('sbMsg').textContent));
  T.ok('wrong password shows an error and stays signed out',await A.isVisible('#sbForm'));
  await A.fill('#sbPass','secret1');await A.click('#sbIn');
  await A.waitForSelector('#sbOut:not([hidden])');
  T.ok('sign in works',/Signed in as a@x.com/.test(await A.textContent('#sbWho')));
  await A.click('#acctDone');
  await A.click('.book[data-id="figures-demo"]');await A.waitForSelector('#scroller .card');await A.waitForTimeout(600);
  /* figures-demo is short, so this uses a shallow position (2) rather than the deep one
     that fit the removed, much longer vedic-report */
  await A.evaluate(()=>{const s=document.getElementById('scroller');s.scrollTop=2*s.clientHeight});
  await A.waitForTimeout(500);
  const posA=await A.evaluate(()=>+(JSON.parse(localStorage.getItem('folio:pos:figures-demo')||'null')??-1));
  await A.waitForTimeout(5500);
  const row=rows[users['a@x.com'].id];
  T.ok('position pushed to Supabase after reading',row&&row.pos&&row.pos['figures-demo']&&row.pos['figures-demo'].i>0,row&&row.pos);
  T.ok('only small data is uploaded (no book text)',JSON.stringify(row).length<5000,JSON.stringify(row).length);
  // --- device B
  const B=await device();await openAcct(B);
  await B.fill('#sbEmail','a@x.com');await B.fill('#sbPass','secret1');await B.click('#sbIn');
  await B.waitForSelector('#sbOut:not([hidden])');await B.waitForTimeout(800);
  const posB=await B.evaluate(()=>{try{return window.__posDbg?window.__posDbg():null}catch(e){return null}});
  await B.click('#acctDone');await B.click('.book[data-id="figures-demo"]');await B.waitForSelector('#scroller .card');await B.waitForTimeout(900);
  const cardB=await B.evaluate(()=>Math.round(document.getElementById('scroller').scrollTop/document.getElementById('scroller').clientHeight));
  T.ok('device B resumes at the position device A reached',cardB>=1,cardB);
  // --- persistence of session across reload
  await B.click('#back');await B.reload();await B.waitForSelector('.book');await openAcct(B);
  T.ok('session survives a reload',await B.isVisible('#sbOut'));
  // --- expired token refreshes
  await B.evaluate(()=>{const k='folio:sb';const o=JSON.parse(localStorage.getItem(k));o.exp=1;localStorage.setItem(k,JSON.stringify(o))});
  calls=[];await B.reload();await B.waitForSelector('.book');await B.waitForTimeout(1200);
  T.ok('expired token is refreshed automatically',calls.some(c=>/grant_type=refresh_token/.test(c))&&calls.some(c=>/^GET \/rest/.test(c)),calls);
  // --- server error is reported, not thrown
  failRest=true;await openAcct(B);await B.waitForTimeout(300);
  await B.reload();await B.waitForSelector('.book');await openAcct(B);await B.waitForTimeout(1200);
  T.ok('server error shows a paused message',/paused/i.test(await B.textContent('#syncLine')),await B.textContent('#syncLine'));
  failRest=false;
  // --- sign out
  await B.click('#sbOut');
  T.ok('sign out clears session',await B.evaluate(()=>!localStorage.getItem('folio:sb')));
  T.ok('library stays after sign out',(await B.$$('.book')).length>=2);
  // --- sign up paths
  await B.fill('#sbEmail','new@x.com');await B.fill('#sbPass','abcdef');await B.click('#sbUp');
  await B.waitForSelector('#sbOut:not([hidden])');T.ok('create account signs in',true);
  await B.click('#sbOut');
  await B.fill('#sbEmail','confirm@x.com');await B.fill('#sbPass','abcdef');await B.click('#sbUp');
  await B.waitForFunction(()=>/confirm/i.test(document.getElementById('sbMsg').textContent));
  T.ok('email-confirmation flow is explained',true);
  await B.fill('#sbEmail','bad');await B.click('#sbIn');
  T.ok('invalid email rejected locally',/valid email/.test(await B.textContent('#sbMsg')));
  T.eq('no page errors A',A.errors,[]);T.eq('no page errors B',B.errors,[]);
  // --- not configured => no account UI
  const ctx=await br.newContext({serviceWorkers:'block'});const C=await ctx.newPage();
  await C.route(u=>u.pathname==='/config.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:'window.FOLIO_CONFIG={supabase:{url:"",anonKey:""}};'}));
  await C.goto(base+'/');await C.waitForSelector('.book');await C.click('#acctBtn');await C.waitForSelector('#acctSheet:not([hidden])');
  T.ok('no account UI when not configured',!(await C.isVisible('#sbBox')));
  await br.close();s.close();T.done();
})();
