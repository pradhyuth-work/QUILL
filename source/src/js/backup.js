/* ---------- backup, restore, storage, sync ---------- */
function fmtBytes(n){if(n<1048576) return Math.max(1,Math.round(n/1024))+' KB';if(n<1073741824) return (n/1048576).toFixed(n<10485760?1:0)+' MB';return (n/1073741824).toFixed(1)+' GB'}
var moreSheet=$('#moreSheet');
function openMore(){
  moreSheet.hidden=false;
  var st=$('#stLine'),w=$('#stWarn');w.hidden=true;
  var userN=books.filter(function(b){return builtins.indexOf(b)<0}).length;
  FolioDB.estimate().then(function(e){
    var mode=FolioDB.mode==='idb'?'':' This browser is not saving data, so books vanish when the page closes.';
    st.textContent=(e?fmtBytes(e.used)+' used of about '+fmtBytes(e.quota)+'. ':'')+userN+' book'+(userN===1?'':'s')+' of your own on this device.'+mode;
    if(e&&e.quota&&e.used/e.quota>0.8){w.hidden=false;w.textContent='Storage is nearly full. Remove books you have finished or export a backup.'}
  });
  $('#bkExport').focus();
}
function closeMore(){moreSheet.hidden=true}
$('#moreBtn').addEventListener('click',openMore);
$('#moreDone').addEventListener('click',closeMore);
$('#moreScrim').addEventListener('click',closeMore);

var acctSheet=$('#acctSheet');
/* with accounts configured, nothing opens until someone has signed in: lock from the first moment */
try{var _lc=window.FOLIO_CONFIG&&window.FOLIO_CONFIG.supabase;if(_lc&&_lc.url&&_lc.anonKey){window.__acctLocked=true;document.documentElement.classList.add('needs-acct')}}catch(e){}
function openAcct(){acctSheet.hidden=false}
function closeAcct(){if(window.__acctLocked) return;acctSheet.hidden=true}
$('#acctBtn').addEventListener('click',openAcct);
$('#acctDone').addEventListener('click',closeAcct);
$('#acctScrim').addEventListener('click',closeAcct);

async function saveFile(name,blob){
  try{
    var dl=window.claude&&await window.claude.use('downloads');
    if(dl){await dl.save({filename:name,data:blob});return 'saved'}
  }catch(e){if(e&&e.code==='declined') return 'declined'}
  var a=document.createElement('a'),u=URL.createObjectURL(blob);
  a.href=u;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(u);a.remove()},4000);
  return 'saved';
}
async function exportBackup(){
  busy('Preparing your backup',0.1);$('#busyEta').hidden=true;
  try{
    await FolioDB.flush();
    var kv={};store.keys().forEach(function(k){kv[k]=store.get(k)});
    var ids=Object.keys(ups),parts=['{"folio":2,"made":'+Date.now()+',"kv":'+JSON.stringify(kv)+',"books":['];
    for(var i=0;i<ids.length;i++){
      busy('Packing book '+(i+1)+' of '+ids.length,0.1+0.8*(i/ids.length));
      var rec=await FolioDB.getBook(ids[i]);
      if(rec) parts.push((i?',':'')+JSON.stringify(rec));
      await tick(0);
    }
    parts.push(']}');
    var blob=new Blob(parts,{type:'application/json'});
    unbusy();
    var d=new Date(),nm='quill-backup-'+d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)+'.json';
    var r=await saveFile(nm,blob);
    if(r==='saved') toast('Backup ready ('+fmtBytes(blob.size)+')');
  }catch(e){unbusy();toast('Could not create the backup.')}
}
$('#bkExport').addEventListener('click',exportBackup);
$('#bkImport').addEventListener('change',async function(e){
  var f=e.target.files&&e.target.files[0];e.target.value='';
  if(!f) return;
  closeMore();
  busy('Reading backup',0.1);$('#busyEta').hidden=true;
  try{
    var data=JSON.parse(await f.text());
    if(!data||typeof data!=='object'||!data.kv||!Array.isArray(data.books)) throw new Error('shape');
    var added=0,skipped=0;
    for(var i=0;i<data.books.length;i++){
      var r=data.books[i];
      if(!r||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(r.id)||!Array.isArray(r.chapters)||!r.meta||typeof r.meta.title!=='string'){skipped++;continue}
      if(books.some(function(x){return x.id===r.id})){skipped++;continue}
      busy('Restoring book '+(i+1)+' of '+data.books.length,0.1+0.8*(i/data.books.length));
      /* validate by building it; a corrupt record is skipped, not trusted */
      var probe;
      try{probe=buildBook({id:r.id,title:String(r.meta.title).slice(0,200),author:String(r.meta.author||'Your upload'),tag:r.meta.tag||'PDF',alt:true,lang:r.meta.lang},r.chapters)}catch(err){skipped++;continue}
      await FolioDB.putBook({id:r.id,meta:r.meta,chapters:r.chapters});
      if(window.__bookPush) window.__bookPush(r.id,r.meta,r.chapters);
      var kvu=(data.kv.ups&&data.kv.ups[r.id])||{};
      var m=(data.kv.meta&&data.kv.meta[r.id])||{};
      probe.title=m.title||probe.title;
      probe.color=typeof m.color==='number'?m.color:nextColor();
      probe.group='';
      ups[r.id]={id:r.id,title:probe.title,author:probe.author,tag:probe.tag,words:probe.words,n:probe.items.length,cover:probe.cover||'',lang:r.meta.lang||kvu.lang};
      probe.n=probe.items.length;probe.items=null;probe.chapters=null;probe.stub=true;
      if(data.kv['pos:'+r.id]!=null&&store.get('pos:'+r.id)==null) store.set('pos:'+r.id,data.kv['pos:'+r.id]);
      books.push(probe);added++;
    }
    /* shelf groups from the backup: add the ones we do not have and re-attach books to them */
    var bg=Array.isArray(data.kv.groups)?data.kv.groups:[];
    bg.forEach(function(g){if(g&&typeof g.id==='string'&&typeof g.name==='string'&&!groupById(g.id)&&!groups.some(function(x){return x.name.toLowerCase()===g.name.toLowerCase()})) groups.push({id:g.id,name:String(g.name).slice(0,40)})});
    if(data.kv.meta) books.forEach(function(b){var m=data.kv.meta[b.id];if(m&&m.group&&groupById(m.group)&&!b.group) b.group=m.group});
    persistUps();persistLib();FolioDB.persist();
    unbusy();renderShelf();
    toast('Restored '+added+' book'+(added===1?'':'s')+(skipped?' · '+skipped+' skipped (already here or damaged)':''));
  }catch(err){unbusy();toast('That does not look like a Quill backup file.')}
});
$('#bkImportL').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#bkImport').click()}});

/* storage failures should be visible, never silent */
FolioDB.onError(function(){toast('Storage is full or unavailable. New changes may not be saved. Export a backup.')});
