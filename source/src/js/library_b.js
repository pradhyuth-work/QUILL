/* ---------- shelf ---------- */
function minutes(b){return Math.max(1,Math.round(b.words/230))}
function coverCls(b){return b.color>=0?' c'+b.color:(b.alt?' alt':'')}
function sections(){
  if(flt!=='all') return [{g:groupById(flt),list:books.filter(function(b){return b.group===flt}),single:true}];
  if(!groups.length) return [{g:null,list:books.slice(),single:true}];
  var out=groups.map(function(g){return {g:g,list:books.filter(function(b){return b.group===g.id})}});
  out.push({g:null,other:true,list:books.filter(function(b){return !b.group})});
  return out;
}
function tile(b,ix,n){
  var frac=b.n?Math.min(1,(store.get('pos:'+b.id,0)||0)/b.n):0;
  var pg=(!edit&&frac>0.01)?'<div class="pg" aria-hidden="true"><i style="--w:'+Math.round(frac*100)+'%"></i></div>':'';
  var cover=(b.cover&&!b.plain&&safeSrc(b.cover))
    ?'<div class="cover thumbed'+coverCls(b)+'"><span class="tag">'+esc(b.tag)+'</span><img class="thumb" src="'+esc(b.cover)+'" alt="" decoding="async"></div>'
    :'<div class="cover'+coverCls(b)+'"><span class="tag">'+esc(b.tag)+'</span><div><div class="ct">'+esc(b.title)+'</div><div class="ca">'+esc(b.author)+'</div></div></div>';
  var meta='<div><div class="bt">'+esc(b.title)+'</div><div class="bm num">'+minutes(b)+' min read'+(b.note?' · '+esc(b.note):'')+(!edit&&frac>0.01?' · '+Math.round(frac*100)+'%':'')+'</div></div>';
  if(!edit) return '<button class="book" type="button" data-id="'+esc(b.id)+'">'+cover+meta+pg+'</button>';
  var arm=delId===b.id;
  return '<div class="book editing" data-id="'+esc(b.id)+'">'+cover+meta+
    '<div class="tools">'+
    '<button type="button" data-a="left" aria-label="Move '+esc(b.title)+' earlier"'+(ix===0?' disabled':'')+'>'+IC.left+'</button>'+
    '<button type="button" data-a="right" aria-label="Move '+esc(b.title)+' later"'+(ix===n-1?' disabled':'')+'>'+IC.right+'</button>'+
    '<button type="button" data-a="rename" aria-label="Edit '+esc(b.title)+'">'+IC.pen+'</button>'+
    '<span class="sp"></span>'+
    '<button type="button" data-a="del" class="'+(arm?'arm':'')+'" aria-label="'+(arm?'Confirm delete ':'Delete ')+esc(b.title)+'">'+(arm?'Delete?':IC.bin)+'</button>'+
    '</div></div>';
}
var ADD='<div class="book add"><div class="cover">'+ICON.plus+'<div class="ct">Add a book</div><div class="ca">PDF or text file</div></div><input class="ov" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" multiple aria-label="Add one or more books from PDF or text files"></div>';
function renderChips(){
  var box=$('#fchips');
  box.hidden=!(groups.length||edit);
  var h='<button type="button" class="chip" data-f="all" aria-pressed="'+(flt==='all')+'">All</button>'+
    groups.map(function(g){return '<button type="button" class="chip" data-f="'+g.id+'" aria-pressed="'+(flt===g.id)+'">'+esc(g.name)+'</button>'}).join('');
  if(edit) h+='<button type="button" class="chip ghost" data-f="+">+ Group</button>';
  box.innerHTML=h;
  $('#gManage').hidden=!(edit&&flt!=='all');
}
function renderShelf(focusSel){
  var secs=sections(),h='';
  secs.forEach(function(sec){
    var n=sec.list.length;
    if(!sec.single){
      if(sec.other&&!n) return;
      if(!n&&!edit) return;
      h+='<div class="gh"><div>'+esc(sec.g?sec.g.name:'Other')+'</div><span class="num">'+n+(n===1?' book':' books')+'</span></div>';
    }
    if(!n&&!sec.single){h+='<p class="empty">Empty. Move books here with the pencil.</p>';return}
    h+='<div class="shelf">'+sec.list.map(function(b,ix){return tile(b,ix,n)}).join('')+((sec.single&&!edit)?ADD:'')+'</div>';
  });
  if(!edit&&!secs[0].single) h+='<div class="shelf">'+ADD+'</div>';
  if(flt!=='all'&&!secs[0].list.length&&edit) h='<p class="empty">Nothing in this group yet. Tap the pencil on any book to move it here.</p>';
  $('#shelf').innerHTML=h;
  renderChips();
  $('#editBtn').textContent=edit?'Done':'Edit';
  $('#editBtn').setAttribute('aria-pressed',String(edit));
  $('#libSub').textContent=edit?'Reorder, group, rename, recolour or remove books.':'Add a book, then swipe through it or have it read aloud.';
  $('#restoreWrap').hidden=!(edit&&gone.length);
  if(focusSel){var f=document.querySelector(focusSel);if(f&&!f.disabled) f.focus()}
}
$('#shelf').addEventListener('change',function(e){
  var inp=e.target;
  if(!inp||inp.type!=='file') return;
  var files=inp.files?Array.prototype.slice.call(inp.files):[];
  inp.value='';
  if(files.length) importFiles(files);
});
function bookById(id){return books.filter(function(x){return x.id===id})[0]}
$('#shelf').addEventListener('click',function(e){
  var el=e.target.closest('.book[data-id]');
  if(!el) return;
  var bk=bookById(el.dataset.id);
  if(!bk) return;
  if(!edit){openBook(bk);return}
  var a=e.target.closest('[data-a]');
  if(!a) return;
  var act=a.dataset.a,sel='.book[data-id="'+bk.id+'"] [data-a="'+act+'"]';
  if(act!=='del'){delId=null;clearTimeout(delT)}
  if(act==='left'||act==='right'){
    var sec=books.filter(function(b){return b.group===bk.group}),k=sec.indexOf(bk),nb=sec[act==='left'?k-1:k+1];
    if(!nb) return;
    var i1=books.indexOf(bk),i2=books.indexOf(nb);
    books[i1]=nb;books[i2]=bk;
    persistLib();
    renderShelf(sel);
    if(!document.querySelector(sel+':not(:disabled)')){
      var other=act==='left'?'right':'left',o=document.querySelector('.book[data-id="'+bk.id+'"] [data-a="'+other+'"]');
      if(o) o.focus();
    }
  }else if(act==='rename'){
    openRename(bk);
  }else if(act==='del'){
    if(delId!==bk.id){
      delId=bk.id;clearTimeout(delT);
      delT=setTimeout(function(){delId=null;renderShelf()},3500);
      renderShelf(sel);return;
    }
    clearTimeout(delT);delId=null;
    books.splice(books.indexOf(bk),1);
    if(builtins.indexOf(bk)>=0){if(gone.indexOf(bk.id)<0) gone.push(bk.id)}
    else{delete ups[bk.id];persistUps();FolioDB.delBook(bk.id);if(window.__bookDel) window.__bookDel(bk.id)}
    store.del('pos:'+bk.id);
    persistLib();
    renderShelf();
    toast('Removed “'+bk.title+'”');
  }
});
$('#editBtn').addEventListener('click',function(){
  edit=!edit;delId=null;clearTimeout(delT);
  renderShelf();
});
$('#restore').addEventListener('click',function(){
  builtins.forEach(function(b){if(books.indexOf(b)<0){b.group='';books.push(b)}});
  gone=[];persistLib();renderShelf();toast('Restored the sample books');
});

/* group chips */
$('#fchips').addEventListener('click',function(e){
  var c=e.target.closest('[data-f]');
  if(!c) return;
  if(c.dataset.f==='+'){openGroup(null);return}
  flt=c.dataset.f;delId=null;clearTimeout(delT);
  persistLib();renderShelf('#fchips [data-f="'+flt+'"]');
});
$('#gManage').addEventListener('click',function(){var g=groupById(flt);if(g) openGroup(g)});
var gs=$('#gSheet');
function openGroup(g){
  gEdit=g;gArm=false;
  $('#gT').textContent=g?'Edit group':'New group';
  $('#gIn').value=g?g.name:'';
  $('#gDel').hidden=!g;$('#gDel').textContent='Delete group';
  gs.hidden=false;void gs.offsetWidth;gs.classList.add('open');
  setTimeout(function(){$('#gIn').focus();$('#gIn').select()},60);
}
function closeGroup(){gs.classList.remove('open');setTimeout(function(){gs.hidden=true},300);gEdit=null}
function saveGroup(){
  var name=$('#gIn').value.replace(/\s+/g,' ').trim();
  if(!name){closeGroup();return}
  if(gEdit){gEdit.name=name}
  else{var g=addGroup(name);flt=g.id}
  persistLib();closeGroup();renderShelf();
}
$('#gSave').addEventListener('click',saveGroup);
$('#gScrim').addEventListener('click',closeGroup);
$('#gIn').addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();saveGroup()}
  if(e.key==='Escape'){e.preventDefault();closeGroup()}
});
$('#gDel').addEventListener('click',function(){
  if(!gEdit) return;
  if(!gArm){gArm=true;$('#gDel').textContent='Tap again to delete. Books stay on your shelf.';return}
  var id=gEdit.id,nm=gEdit.name;
  books.forEach(function(b){if(b.group===id) b.group=''});
  groups=groups.filter(function(g){return g.id!==id});
  flt='all';persistLib();closeGroup();renderShelf();toast('Deleted group “'+nm+'”');
});

/* edit book sheet: title, colour, group */
var rn=$('#rnSheet'),rnPlain=false;
function drawPic(){
  $('#rnPic').querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String((b.dataset.p==='1')===rnPlain))});
}
$('#rnPic').addEventListener('click',function(e){var b=e.target.closest('[data-p]');if(!b) return;rnPlain=b.dataset.p==='1';drawPic()});
function drawSwatches(){
  $('#rnSw').innerHTML=PALNAMES.map(function(n,i){
    return '<button type="button" class="sw c'+i+'" data-c="'+i+'" aria-label="'+n+'" aria-pressed="'+(rnColor===i)+'"></button>';
  }).join('');
}
function drawGroupOpts(){
  $('#rnGr').innerHTML='<button type="button" data-g="" aria-pressed="'+(rnGroup==='')+'">None</button>'+
    groups.map(function(g){return '<button type="button" data-g="'+g.id+'" aria-pressed="'+(rnGroup===g.id)+'">'+esc(g.name)+'</button>'}).join('');
}
function openRename(bk){
  rnBook=bk;rnColor=bk.color;rnGroup=bk.group;rnPlain=!!bk.plain;
  $('#rnCvRow').hidden=!bk.cover&&!bk.plain;drawPic();
  $('#rnIn').value=bk.title;$('#rnNew').value='';
  drawSwatches();drawGroupOpts();
  rn.hidden=false;void rn.offsetWidth;rn.classList.add('open');
  setTimeout(function(){$('#rnIn').focus();$('#rnIn').select()},60);
}
function closeRename(){
  rn.classList.remove('open');
  setTimeout(function(){rn.hidden=true},300);
  rnBook=null;
}
function saveRename(){
  if(!rnBook) return;
  var t=$('#rnIn').value.replace(/\s+/g,' ').trim();
  if(t) rnBook.title=t;
  if(rnColor>=0) rnBook.color=rnColor;
  rnBook.plain=rnPlain;
  var ng=addGroup($('#rnNew').value);
  rnBook.group=ng?ng.id:rnGroup;
  persistLib();
  var sel='.book[data-id="'+rnBook.id+'"] [data-a="rename"]';
  closeRename();
  renderShelf(sel);
}
$('#rnSw').addEventListener('click',function(e){
  var b=e.target.closest('[data-c]');
  if(!b) return;
  rnColor=+b.dataset.c;drawSwatches();
  var f=$('#rnSw').querySelector('[data-c="'+rnColor+'"]');if(f) f.focus();
});
$('#rnGr').addEventListener('click',function(e){
  var b=e.target.closest('[data-g]');
  if(!b) return;
  rnGroup=b.dataset.g;$('#rnNew').value='';drawGroupOpts();
  var f=$('#rnGr').querySelector('[data-g="'+rnGroup+'"]');if(f) f.focus();
});
$('#rnSave').addEventListener('click',saveRename);
$('#rnScrim').addEventListener('click',closeRename);
['#rnIn','#rnNew'].forEach(function(q){$(q).addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();saveRename()}
  if(e.key==='Escape'){e.preventDefault();closeRename()}
})});

