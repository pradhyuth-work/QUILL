/* ---------- optional sync of reading positions and shelf organisation across devices ----------
   Uses the host's private per-user store when present. For the Supabase provider, a signed-in
   reader's book text syncs too (to that reader's own Supabase project), so their shelf follows
   them to another device; without an account, books stay device-only as before. */
(function(){
  var cl=window.claude,cfg=window.FOLIO_CONFIG&&window.FOLIO_CONFIG.supabase;
  var hasClaude=cl&&typeof cl.use==='function',hasSb=!!(cfg&&cfg.url&&cfg.anonKey);
  if(!hasClaude&&!hasSb) return;
  var ref=null,pushing=false,again=false,pushT=0,status='';
  function line(t){var e=$('#syncLine');if(e) e.textContent=t}
  /* best-effort: a book's own content syncs separately from the position/shelf snapshot below,
     so one large or offline book never blocks the rest of the shelf from staying in sync */
  window.__bookPush=async function(id,meta,chapters){
    if(!ref||typeof ref.putBook!=='function') return;
    try{await ref.putBook(id,meta,chapters)}catch(e){}
  };
  window.__bookPull=async function(id){
    if(!ref||typeof ref.getBook!=='function') return null;
    try{return await ref.getBook(id)}catch(e){return null}
  };
  window.__bookDel=async function(id){
    if(!ref||typeof ref.delBook!=='function') return;
    try{await ref.delBook(id)}catch(e){}
  };
  function snapshot(){
    var pos={};
    books.forEach(function(b){var p=store.get('pos:'+b.id);if(p!=null) pos[b.id]={i:p,t:store.get('post:'+b.id,0)}});
    var meta={};books.forEach(function(b){meta[b.id]={title:b.title,color:b.color,group:b.group,plain:!!b.plain}});
    /* a lightweight index of this reader's uploads (no cover, no text) so another device can show
       stub entries for books it has not downloaded yet; the text itself syncs via __bookPush */
    var upsOut={};Object.keys(ups).forEach(function(id){var u=ups[id];upsOut[id]={title:u.title,author:u.author,tag:u.tag,words:u.words,n:u.n,lang:u.lang}});
    return {v:1,pos:pos,shelfT:store.get('shelfT',0),order:books.map(function(b){return b.id}),meta:meta,groups:groups,ups:upsOut,settings:{fs:S.fs,theme:S.theme,rate:S.rate},at:Date.now()};
  }
  async function push(){
    if(!ref) return;
    if(pushing){again=true;return}
    pushing=true;
    try{await ref.set(snapshot());line('Synced just now.')}catch(e){line('Sync is paused: '+((e&&e.code)||'offline')+'.')}
    pushing=false;
    if(again){again=false;schedule()}
  }
  function schedule(){clearTimeout(pushT);pushT=setTimeout(push,4000)}
  window.__syncPush=schedule;
  function merge(r){
    if(!r||r.v!==1) return false;
    var changed=false;
    /* a book this account has on another device but not this one: add it as a stub, downloaded
       on demand when opened (see reader_c.js), so positions below can apply to it too */
    if(r.ups&&typeof r.ups==='object'){
      var added=false;
      Object.keys(r.ups).forEach(function(id){
        if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||ups[id]||builtins.some(function(b){return b.id===id})) return;
        var u=r.ups[id];if(!u||typeof u!=='object') return;
        var entry={id:id,title:String(u.title||'Untitled').slice(0,200),author:String(u.author||'Your upload').slice(0,120),tag:String(u.tag||'PDF').slice(0,20),words:+u.words||0,n:+u.n||0,cover:'',lang:u.lang,remote:true};
        ups[id]=entry;
        books.push({id:id,title:entry.title,author:entry.author,tag:entry.tag,alt:true,words:entry.words,n:entry.n,cover:'',lang:entry.lang,items:null,chapters:null,stub:true,remote:true});
        added=true;changed=true;
      });
      if(added) persistUps();
    }
    if(r.pos&&typeof r.pos==='object') Object.keys(r.pos).forEach(function(id){
      var p=r.pos[id];
      if(!p||typeof p.i!=='number'||!books.some(function(b){return b.id===id})) return;
      if((p.t||0)>store.get('post:'+id,0)){store.set('pos:'+id,p.i);store.set('post:'+id,p.t);changed=true}
    });
    if((r.shelfT||0)>store.get('shelfT',0)){
      if(Array.isArray(r.groups)) r.groups.forEach(function(g){
        if(g&&typeof g.id==='string'&&typeof g.name==='string'&&!groupById(g.id)&&!groups.some(function(x){return x.name.toLowerCase()===g.name.toLowerCase()})) groups.push({id:g.id,name:String(g.name).slice(0,40)});
      });
      if(r.meta) books.forEach(function(b){
        var m=r.meta[b.id];if(!m) return;
        if(typeof m.title==='string'&&m.title) b.title=m.title.slice(0,200);
        if(typeof m.color==='number'&&m.color>=-1&&m.color<PALN) b.color=m.color;
        if(typeof m.group==='string'&&(m.group===''||groupById(m.group))) b.group=m.group;
        b.plain=!!m.plain;
      });
      if(Array.isArray(r.order)){
        books.sort(function(a,b){var i=r.order.indexOf(a.id),j=r.order.indexOf(b.id);return (i<0?999:i)-(j<0?999:j)});
      }
      store.set('shelfT',r.shelfT);changed=true;
      var m2={};books.forEach(function(b){m2[b.id]={title:b.title,color:b.color,group:b.group,plain:!!b.plain}});
      store.set('meta',m2);store.set('order',books.map(function(b){return b.id}));store.set('groups',groups);
    }
    return changed;
  }

  /* ---- provider 1: Supabase (standalone app). Plain fetch against GoTrue + PostgREST, no SDK. ---- */
  function sb(){
    var base=cfg.url.replace(/\/+$/,''),KEY='folio:sb',sess=null;
    try{sess=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
    function save(x){sess=x;try{if(x) localStorage.setItem(KEY,JSON.stringify(x));else localStorage.removeItem(KEY)}catch(e){}}
    function hdr(tok){return {'apikey':cfg.anonKey,'Authorization':'Bearer '+(tok||cfg.anonKey),'Content-Type':'application/json'}}
    function norm(j){return j&&j.access_token?{at:j.access_token,rt:j.refresh_token,exp:Date.now()+(j.expires_in||3600)*1000-30000,uid:j.user&&j.user.id}:null}
    /* account IDs and PINs are the reader-facing identity; Supabase itself still speaks
       email+password, so both are folded into values that satisfy it */
    function toEmail(id){return id.toLowerCase().replace(/[^a-z0-9_.-]/g,'')+'@quill.local'}
    function toPass(pin){return 'quill-pin-'+pin}
    async function auth(path,body){
      var r=await fetch(base+'/auth/v1/'+path,{method:'POST',headers:hdr(),body:JSON.stringify(body)});
      var j=await r.json().catch(function(){return {}});
      if(!r.ok) throw new Error(j.msg||j.error_description||j.message||('HTTP '+r.status));
      return j;
    }
    async function token(){
      if(!sess) return null;
      if(Date.now()<sess.exp) return sess.at;
      try{var j=norm(await auth('token?grant_type=refresh_token',{refresh_token:sess.rt}));if(j){j.uid=j.uid||sess.uid;save(j);return j.at}}catch(e){if(/HTTP 4|invalid|expired|not found/i.test(String(e.message))) save(null)}
      return null;
    }
    return {
      signedIn:function(){return !!sess},
      accountId:function(){return sess&&(sess.aid||sess.email)||''},
      uid:function(){return sess&&sess.uid||''},
      signIn:async function(id,pin){var j=norm(await auth('token?grant_type=password',{email:toEmail(id),password:toPass(pin)}));if(!j) throw new Error('Sign in failed');j.aid=id;save(j);return true},
      signUp:async function(id,pin){var raw=await auth('signup',{email:toEmail(id),password:toPass(pin)});var j=norm(raw);if(!j){return 'confirm'}j.aid=id;save(j);return true},
      signOut:function(){save(null)},
      get:async function(){
        var t=await token();if(!t) throw new Error('signed out');
        var r=await fetch(base+'/rest/v1/folio_state?select=data&user_id=eq.'+encodeURIComponent(sess.uid),{headers:hdr(t)});
        if(!r.ok) throw new Error('HTTP '+r.status);
        var a=await r.json();return a&&a[0]?a[0].data:null;
      },
      set:async function(d){
        var t=await token();if(!t) throw new Error('signed out');
        var h=hdr(t);h['Prefer']='resolution=merge-duplicates,return=minimal';
        var r=await fetch(base+'/rest/v1/folio_state?on_conflict=user_id',{method:'POST',headers:h,body:JSON.stringify({user_id:sess.uid,data:d,updated_at:new Date().toISOString()})});
        if(!r.ok) throw new Error('HTTP '+r.status);
      },
      putBook:async function(id,meta,chapters){
        var t=await token();if(!t) throw new Error('signed out');
        var h=hdr(t);h['Prefer']='resolution=merge-duplicates,return=minimal';
        var r=await fetch(base+'/rest/v1/folio_books?on_conflict=user_id,book_id',{method:'POST',headers:h,body:JSON.stringify({user_id:sess.uid,book_id:id,meta:meta,chapters:chapters,updated_at:new Date().toISOString()})});
        if(!r.ok) throw new Error('HTTP '+r.status);
      },
      getBook:async function(id){
        var t=await token();if(!t) throw new Error('signed out');
        var r=await fetch(base+'/rest/v1/folio_books?select=meta,chapters&user_id=eq.'+encodeURIComponent(sess.uid)+'&book_id=eq.'+encodeURIComponent(id),{headers:hdr(t)});
        if(!r.ok) throw new Error('HTTP '+r.status);
        var a=await r.json();return a&&a[0]?{meta:a[0].meta,chapters:a[0].chapters}:null;
      },
      delBook:async function(id){
        var t=await token();if(!t) throw new Error('signed out');
        var r=await fetch(base+'/rest/v1/folio_books?user_id=eq.'+encodeURIComponent(sess.uid)+'&book_id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:hdr(t)});
        if(!r.ok) throw new Error('HTTP '+r.status);
      }
    };
  }
  async function pull(){
    var d=await ref.get();
    if(d&&merge(d)){renderShelf();line('Synced just now.')}else line('Synced. Your shelf and reading positions follow you between devices.');
    schedule();
  }
  function setup(){
    var box=$('#sbBox');if(!box) return;
    var api=sb();box.hidden=false;
    var em=$('#sbEmail'),pw=$('#sbPass'),msg=$('#sbMsg'),inB=$('#sbIn'),upB=$('#sbUp'),outB=$('#sbOut'),form=$('#sbForm'),who=$('#sbWho');
    function paint(){
      var on=api.signedIn();form.hidden=on;outB.hidden=!on;who.hidden=!on;who.textContent=on?('Signed in'+(api.accountId()?' as '+api.accountId():'')+'.'):'';
      /* no skipping sign-in while this provider is in use: closeAcct() checks this */
      window.__acctLocked=!on;
      var btn=$('#acctBtn'),done=$('#acctDone');
      if(done) done.hidden=!on;
      if(btn){
        btn.classList.toggle('on',on);
        btn.setAttribute('aria-label',on?('Account, signed in'+(api.accountId()?' as '+api.accountId():'')):'Sign in');
        btn.title=on?'Account':'Sign in';
      }
    }
    pw.addEventListener('input',function(){pw.value=pw.value.replace(/\D/g,'').slice(0,4)});
    async function go(kind){
      var e=em.value.trim(),p=pw.value;
      if(!/^[A-Za-z0-9_.-]{3,24}$/.test(e)){msg.textContent='Use an account ID of 3–24 letters, numbers, . _ or -.';return}
      if(!/^\d{4}$/.test(p)){msg.textContent='Use a 4-digit PIN.';return}
      msg.textContent=kind==='up'?'Creating account…':'Signing in…';
      try{
        var r=kind==='up'?await api.signUp(e,p):await api.signIn(e,p);
        if(r==='confirm'){msg.textContent='Could not finish creating the account (email confirmation is on for this project).';return}
        pw.value='';msg.textContent='';paint();ref=api;
        switchAccount('u:'+api.uid());
        closeAcct();
        line('Syncing…');await pull();
      }catch(x){msg.textContent=String(x.message||x).slice(0,140)}
    }
    inB.addEventListener('click',function(){go('in')});upB.addEventListener('click',function(){go('up')});
    outB.addEventListener('click',function(){api.signOut();ref=null;clearTimeout(pushT);paint();switchAccount('');line('Signed out. Your library stays on this device.')});
    paint();
    if(api.signedIn()){ref=api;line('Syncing…');pull().catch(function(){line('Sync is paused: offline or signed out.')})}
    else line('Sign in to keep your shelf, reading positions and books in step across your devices.');
  }
  if(hasSb&&!hasClaude){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup);else setup(); return }
  if(hasSb){ /* both present: prefer Supabase only when explicitly configured */ setup(); return }
  (async function(){
    try{
      var db=await cl.use('db'),user=await cl.use('user');
      if(!db||!user||!user.id){line('Sync is not available in this view. Your library stays on this device.');return}
      var uid=await user.id();
      if(!uid){line('Sign in to Claude to sync positions between devices.');return}
      switchAccount('u:'+uid);
      ref=db.doc('data/users/'+uid+'/folio');
      var snap=await ref.get();
      if(snap&&snap.exists&&merge(snap.data())){renderShelf();line('Synced just now.')}
      else line('Synced. Reading positions and shelf order follow you between devices.');
      schedule();
    }catch(e){line('Sync is not available right now.')}
  })();
})();
