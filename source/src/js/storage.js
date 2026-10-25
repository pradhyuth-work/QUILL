/* ---------- durable storage: IndexedDB with a synchronous cache ---------- */
var FolioDB=(function(){
  var cache={},dirty={},db=null,mode='memory',flushT=0,onErr=function(){},err1=false;
  var KV='kv',BK='books';
  function openDb(){
    return new Promise(function(res){
      var done=false,fin=function(v){if(!done){done=true;res(v)}};
      try{
        if(!window.indexedDB) return fin(null);
        var rq=indexedDB.open('folio',1);
        rq.onupgradeneeded=function(){var d=rq.result;if(!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);if(!d.objectStoreNames.contains(BK)) d.createObjectStore(BK)};
        rq.onsuccess=function(){fin(rq.result)};
        rq.onerror=function(){fin(null)};
        rq.onblocked=function(){fin(null)};
        setTimeout(function(){fin(null)},4000);
      }catch(e){fin(null)}
    });
  }
  function tx(name,write){return db.transaction(name,write?'readwrite':'readonly').objectStore(name)}
  function p(rq){return new Promise(function(res,rej){rq.onsuccess=function(){res(rq.result)};rq.onerror=function(){rej(rq.error)}})}
  function fail(e){mode='memory';if(!err1){err1=true;try{onErr(e)}catch(x){}}}
  function loadAll(){
    return new Promise(function(res){
      var out={};
      try{
        var rq=tx(KV).openCursor();
        rq.onsuccess=function(){var c=rq.result;if(c){out[c.key]=c.value;c.continue()}else res(out)};
        rq.onerror=function(){res(out)};
      }catch(e){res(out)}
    });
  }
  function flush(){
    clearTimeout(flushT);flushT=0;
    var keys=Object.keys(dirty);
    if(!keys.length||!db||mode!=='idb') return Promise.resolve();
    var batch=dirty;dirty={};
    return new Promise(function(res){
      try{
        var t=db.transaction(KV,'readwrite'),s=t.objectStore(KV);
        keys.forEach(function(k){if(batch[k]===1) s.put(cache[k],k);else s.delete(k)});
        t.oncomplete=function(){res()};
        t.onerror=t.onabort=function(){keys.forEach(function(k){dirty[k]=batch[k]});fail(t.error);res()};
      }catch(e){keys.forEach(function(k){dirty[k]=batch[k]});fail(e);res()}
    });
  }
  function sched(){if(!flushT) flushT=setTimeout(flush,120)}
  /* each signed-in account gets its own shelf on this device: logical keys are transparently
     namespaced by the active scope, while a signed-out (local) scope keeps the original,
     unprefixed keys so existing libraries are not disturbed */
  var scope='',SEP='::acct::';
  function pkey(k){return scope?scope+SEP+k:k}
  var store={
    get:function(k,d){k=pkey(k);return Object.prototype.hasOwnProperty.call(cache,k)?cache[k]:d},
    set:function(k,v){k=pkey(k);cache[k]=v;dirty[k]=1;sched()},
    del:function(k){k=pkey(k);delete cache[k];dirty[k]=2;sched()},
    keys:function(){
      var pre=scope?scope+SEP:'';
      return Object.keys(cache).filter(function(k){return pre?k.indexOf(pre)===0:k.indexOf(SEP)<0}).map(function(k){return pre?k.slice(pre.length):k});
    },
    setScope:function(s){scope=s||''}
  };
  var api={
    store:store,
    get mode(){return mode},
    onError:function(f){onErr=f},
    flush:flush,
    init:async function(){
      db=await openDb();
      if(db){
        mode='idb';
        db.onversionchange=function(){try{db.close()}catch(e){}mode='memory'};
        cache=await loadAll();
      }
      /* one-time migration from the older localStorage layout */
      try{
        if(!cache.migrated){
          var ls=window.localStorage,moved=0;
          if(ls){
            for(var i=0;i<ls.length;i++){
              var k=ls.key(i);
              if(k&&k.indexOf('folio:')===0){
                var name=k.slice(6),v;
                try{v=JSON.parse(ls.getItem(k))}catch(e){continue}
                if(name==='ups'&&v&&typeof v==='object'){
                  var idx={};
                  for(var id in v){
                    var u=v[id];if(!u||!u.meta||!u.chapters) continue;
                    await api.putBook({id:id,meta:u.meta,chapters:u.chapters});
                    idx[id]={id:id,title:u.meta.title,author:u.meta.author,tag:u.meta.tag,alt:true};
                  }
                  cache.ups=idx;dirty.ups=1;
                }else{cache[name]=v;dirty[name]=1}
                moved++;
              }
            }
          }
          cache.migrated=1;dirty.migrated=1;
          await flush();
          if(moved&&mode==='idb'){try{ls.removeItem('folio:ups')}catch(e){}}
        }
      }catch(e){}
      /* self-heal: a book saved without its shelf entry (closed mid-save) is put back on the shelf */
      try{
        if(mode==='idb'){
          var ids=await api.allBookIds(),idx=cache.ups||{},fixed=false;
          for(var q=0;q<ids.length;q++){
            if(idx[ids[q]]||!/^[A-Za-z0-9_-]{1,64}$/.test(ids[q])) continue;
            var rec=await api.getBook(ids[q]);
            if(rec&&rec.meta&&typeof rec.meta.title==='string'){
              idx[ids[q]]={id:ids[q],title:rec.meta.title,author:rec.meta.author||'Your upload',tag:rec.meta.tag||'PDF',words:rec.meta.words||0,n:rec.meta.n||0,cover:rec.meta.cover||'',lang:rec.meta.lang};
              fixed=true;
            }
          }
          if(fixed){cache.ups=idx;dirty.ups=1;await flush()}
        }
      }catch(e){}
      /* if a Supabase session is already on this device, scope the shelf to that account
         before the rest of the app reads it, so a different account never sees it */
      try{
        var sbSess=JSON.parse(localStorage.getItem('folio:sb')||'null');
        if(sbSess&&sbSess.uid) store.setScope('u:'+sbSess.uid);
      }catch(e){}
      return api;
    },
    putBook:function(rec){
      if(!db||mode!=='idb') return Promise.reject(new Error('nostore'));
      return new Promise(function(res,rej){
        try{
          var t=db.transaction(BK,'readwrite');t.objectStore(BK).put(rec,rec.id);
          t.oncomplete=function(){res()};
          t.onerror=t.onabort=function(){rej(t.error||new Error('write'))};
        }catch(e){rej(e)}
      });
    },
    getBook:function(id){
      if(!db) return Promise.resolve(null);
      try{return p(tx(BK).get(id)).then(function(v){return v||null},function(){return null})}catch(e){return Promise.resolve(null)}
    },
    delBook:function(id){
      if(!db) return Promise.resolve();
      return new Promise(function(res){
        try{var t=db.transaction(BK,'readwrite');t.objectStore(BK).delete(id);t.oncomplete=t.onerror=t.onabort=function(){res()}}catch(e){res()}
      });
    },
    allBookIds:function(){
      if(!db) return Promise.resolve([]);
      try{return p(tx(BK).getAllKeys())}catch(e){return Promise.resolve([])}
    },
    estimate:async function(){
      try{if(navigator.storage&&navigator.storage.estimate){var e=await navigator.storage.estimate();return {used:e.usage||0,quota:e.quota||0}}}catch(e){}
      return null;
    },
    persist:async function(){
      try{
        if(navigator.storage&&navigator.storage.persisted&&await navigator.storage.persisted()) return true;
        if(navigator.storage&&navigator.storage.persist) return !!(await navigator.storage.persist());
      }catch(e){}
      return false;
    }
  };
  window.addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden') flush()});
  return api;
})();
