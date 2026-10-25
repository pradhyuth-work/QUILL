/* ---------- shelf: groups, colours, order, rename, delete ---------- */
var PALN=8,PALNAMES=["Sage", "Sand", "Blush", "Sky", "Lavender", "Butter", "Peach", "Mist"];
var gone,ups,metaO,orderO,groups,flt,books;
var DEMO=/*@@DEMO@@*/[];
var demo=buildBook({id:'figures-demo',title:'Pictures in the Flow',author:'Demo book',tag:'Demo',alt:true,note:'3 figures',trusted:true},DEMO);
sample.color=-1;demo.color=3;
var builtins=[sample,demo];builtins.forEach(function(b){b.n=b.items.length});
function groupById(id){return groups.filter(function(g){return g.id===id})[0]}
function reloadLibrary(){
  gone=store.get('gone',[]);ups=store.get('ups',{});metaO=store.get('meta',{});orderO=store.get('order',[]);
  groups=store.get('groups',[]);flt=store.get('flt','all');
  books=builtins.filter(function(b){return gone.indexOf(b.id)<0});
  Object.keys(ups).forEach(function(id){
    var u=ups[id];
    if(!u||typeof u!=='object'||!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
    /* shelf stubs only: the text is read from storage when the book is opened */
    books.push({id:id,title:u.title||'Untitled',author:u.author||'Your upload',tag:u.tag||'PDF',alt:true,note:u.note,words:u.words||0,n:u.n||0,cover:u.cover||'',lang:u.lang,items:null,chapters:null,stub:true});
  });
  books.forEach(function(b){
    var m=metaO[b.id];
    if(m){if(m.title) b.title=m.title;if(typeof m.color==='number') b.color=m.color;if(m.plain) b.plain=true;if(typeof m.group==='string') b.group=m.group}
    if(typeof b.color!=='number') b.color=-1;
    if(typeof b.group!=='string'||!groupById(b.group)) b.group='';
  });
  if(flt!=='all'&&!groupById(flt)) flt='all';
  books.sort(function(a,b){
    var i=orderO.indexOf(a.id),j=orderO.indexOf(b.id);
    return (i<0?999:i)-(j<0?999:j);
  });
}
reloadLibrary();
/* each signed-in account gets its own shelf and settings on this device: called on sign in, sign up and sign out */
function switchAccount(scopeId){
  if(!$('#reader').hidden) $('#back').click();
  store.setScope(scopeId);
  reloadLibrary();
  S.fs=store.get('fs',19);S.theme=store.get('theme','auto');S.rate=store.get('rate',1);S.voice=store.get('voice','');
  applyTheme();applyFs();applyRate();
  renderShelf();
}
function persistLib(){
  store.set('order',books.map(function(b){return b.id}));
  var m={};books.forEach(function(b){m[b.id]={title:b.title,color:b.color,group:b.group,plain:!!b.plain}});
  store.set('meta',m);store.set('shelfT',Date.now());if(window.__syncPush) window.__syncPush();store.set('gone',gone);store.set('groups',groups);store.set('flt',flt);
}
function persistUps(){store.set('ups',ups);return true}
function nextColor(){
  var used=books.map(function(b){return b.color}),i;
  for(i=0;i<PALN;i++) if(used.indexOf(i)<0) return i;
  return books.length % PALN;
}
function addGroup(name){
  name=name.replace(/\s+/g,' ').trim();
  if(!name) return null;
  var ex=groups.filter(function(g){return g.name.toLowerCase()===name.toLowerCase()})[0];
  if(ex) return ex;
  var g={id:'g'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36),name:name};
  groups.push(g);return g;
}
var book=null,edit=false,delId=null,delT=0,rnBook=null,rnColor=-1,rnGroup='',gEdit=null,gArm=false;
var IC={
  left:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  pen:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  bin:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>'
};

