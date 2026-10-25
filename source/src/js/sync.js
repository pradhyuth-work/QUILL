/* ---------- optional sync of reading positions and shelf organisation across devices ----------
   Uses the host's private per-user store when present. Book text never leaves the device. */
(function(){
  var cl=window.claude,cfg=window.FOLIO_CONFIG&&window.FOLIO_CONFIG.supabase;
  var hasClaude=cl&&typeof cl.use==='function',hasSb=!!(cfg&&cfg.url&&cfg.anonKey);
  if(!hasClaude&&!hasSb) return;
  var ref=null,pushing=false,again=false,pushT=0,status='';
  function line(t){var e=$('#syncLine');if(e) e.textContent=t}
  function snapshot(){
    var pos={};
    books.forEach(function(b){var p=store.get('pos:'+b.id);if(p!=null) pos[b.id]={i:p,t:store.get('post:'+b.id,0)}});
    var meta={};books.forEach(function(b){meta[b.id]={title:b.title,color:b.color,group:b.group,plain:!!b.plain}});
    return {v:1,pos:pos,shelfT:store.get('shelfT',0),order:books.map(function(b){return b.id}),meta:meta,groups:groups,settings:{fs:S.fs,theme:S.theme,rate:S.rate},at:Date.now()};
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
      email:function(){return sess&&sess.email||''},
      signIn:async function(em,pw){var j=norm(await auth('token?grant_type=password',{email:em,password:pw}));if(!j) throw new Error('Sign in failed');j.email=em;save(j);return true},
      signUp:async function(em,pw){var raw=await auth('signup',{email:em,password:pw});var j=norm(raw);if(!j){return 'confirm'}j.email=em;save(j);return true},
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
      }
    };
  }
  async function pull(){
    var d=await ref.get();
    if(d&&merge(d)){renderShelf();line('Synced just now.')}else line('Synced. Reading positions and shelf order follow you between devices.');
    schedule();
  }
  function setup(){
    var box=$('#sbBox');if(!box) return;
    var api=sb();box.hidden=false;
    var em=$('#sbEmail'),pw=$('#sbPass'),msg=$('#sbMsg'),inB=$('#sbIn'),upB=$('#sbUp'),outB=$('#sbOut'),form=$('#sbForm'),who=$('#sbWho');
    function paint(){
      var on=api.signedIn();form.hidden=on;outB.hidden=!on;who.hidden=!on;who.textContent=on?('Signed in'+(api.email()?' as '+api.email():'')+'.'):'';
    }
    async function go(kind){
      var e=em.value.trim(),p=pw.value;
      if(!/^\S+@\S+\.\S+$/.test(e)){msg.textContent='Enter a valid email.';return}
      if(p.length<6){msg.textContent='Use a password of at least 6 characters.';return}
      msg.textContent=kind==='up'?'Creating account…':'Signing in…';
      try{
        var r=kind==='up'?await api.signUp(e,p):await api.signIn(e,p);
        if(r==='confirm'){msg.textContent='Check your email to confirm, then sign in.';return}
        pw.value='';msg.textContent='';paint();ref=api;
        line('Syncing…');await pull();
      }catch(x){msg.textContent=String(x.message||x).slice(0,140)}
    }
    inB.addEventListener('click',function(){go('in')});upB.addEventListener('click',function(){go('up')});
    outB.addEventListener('click',function(){api.signOut();ref=null;clearTimeout(pushT);paint();line('Signed out. Your library stays on this device.')});
    paint();
    if(api.signedIn()){ref=api;line('Syncing…');pull().catch(function(){line('Sync is paused: offline or signed out.')})}
    else line('Sign in to keep reading positions and shelf order in step across your devices. Book text stays on each device.');
  }
  if(hasSb&&!hasClaude){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup);else setup(); return }
  if(hasSb){ /* both present: prefer Supabase only when explicitly configured */ setup(); return }
  (async function(){
    try{
      var db=await cl.use('db'),user=await cl.use('user');
      if(!db||!user||!user.id){line('Sync is not available in this view. Your library stays on this device.');return}
      var uid=await user.id();
      if(!uid){line('Sign in to Claude to sync positions between devices.');return}
      ref=db.doc('data/users/'+uid+'/folio');
      var snap=await ref.get();
      if(snap&&snap.exists&&merge(snap.data())){renderShelf();line('Synced just now.')}
      else line('Synced. Reading positions and shelf order follow you between devices.');
      schedule();
    }catch(e){line('Sync is not available right now.')}
  })();
})();
