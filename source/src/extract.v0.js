/*EXTRACT_START*/
/* Turns pdf.js page items into clean blocks: chapter titles, subheadings, paragraphs.
   Skips chart and table lines, ad images, repeated headers and footers. */
var FOLIO_LOW=/^[a-z][a-z'’-]*[.,;:!?)"”’']*$/;
var FOLIO_DATE=/\d+\s*\/\s*\d+\s*\/\s*\d+/;
var FOLIO_LIST=/^(\(?\d{1,2}[.)](?=\s*[A-Za-z])|\(\d{1,2}\)|[•·▪●]\s|-\s)/;
var FOLIO_CHAPTER=/^(chapter|part|book|section)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^.!?]{0,60}$/i;

var FOLIO_STOP={the:1,and:1,of:1,to:1,in:1,is:1,are:1,an:1,for:1,that:1,with:1,you:1,your:1,will:1,be:1,as:1,by:1,it:1,on:1,this:1,can:1,may:1,have:1,from:1,or:1,at:1,not:1,was:1,which:1,their:1,they:1,he:1,she:1,his:1,her:1,if:1,but:1,when:1,who:1,these:1,those:1,than:1,then:1,there:1,would:1,should:1,could:1,been:1,has:1,had:1,were:1,into:1,also:1,more:1,most:1,very:1,all:1,any:1,such:1,our:1,we:1,my:1};
function folioLowRatio(t){
  var w=t.split(' '),lo=0,i;
  for(i=0;i<w.length;i++) if(FOLIO_LOW.test(w[i])) lo++;
  return w.length?lo/w.length:0;
}
function folioIsProse(t){
  var w=t.split(' '),lo=0,st=0,i,x;
  if(w.length<5||FOLIO_DATE.test(t)||t.indexOf('||')>=0) return false;
  for(i=0;i<w.length;i++){
    if(FOLIO_LOW.test(w[i])) lo++;
    x=w[i].toLowerCase().replace(/[^a-z']/g,'');
    if(FOLIO_STOP[x]) st++;
  }
  return lo/w.length>=0.5||st>=2;
}
function folioTidy(t){
  return t.replace(/\s+/g,' ').trim().split(' ').map(function(tok){
    if(/^(https?:|www\.)/i.test(tok)) return tok;
    tok=tok.replace(/^(\d{1,2})\.(?=[A-Za-z])/,'$1. ');
    return tok.replace(/([a-z]{2,})([.!?])([A-Z][a-z])/g,'$1$2 $3');
  }).join(' ').replace(/\s+([,.;:!?])/g,'$1');
}
function folioPagesToBlocks(pages){
  var N=pages.length,p,i,k;
  /* 1. group items into lines (stream order keeps column reading order) */
  var all=pages.map(function(pg){
    var lines=[],L=null;
    pg.items.forEach(function(it){
      var raw=it.s;
      if(raw==null) return;
      var has=/\S/.test(raw),z=Math.round((it.z||10)*2)/2;
      if(!L||Math.abs(L.y-it.y)>Math.max(2,z*0.4)){
        if(!has) return;
        L={y:it.y,x:it.x,x1:it.x,t:'',min:99,max:0,h:pg.h,gaps:0};
        lines.push(L);
      }
      if(has&&L.t&&it.x-L.x1>z*2.4) L.gaps++;
      L.t+=raw;
      if(has){
        if(z<L.min) L.min=z;
        if(z>L.max) L.max=z;
        if(it.x<L.x) L.x=it.x;
      }
      L.x1=Math.max(L.x1,it.x+(it.w||0));
    });
    lines.forEach(function(l){
      l.t=l.t.replace(/\s+/g,' ').trim();
      l.band=l.y>l.h-32||l.y<40;
    });
    return lines.filter(function(l){return l.t});
  });
  /* 2. drop headers and footers: band lines that repeat on many pages, or bare page numbers */
  var key=function(t){
    var seen={},out=[];
    t.toLowerCase().replace(/\d+/g,'#').split(' ').forEach(function(w){if(!seen[w]){seen[w]=1;out.push(w)}});
    return out.sort().join(' ');
  };
  var cnt={};
  all.forEach(function(lines){
    var seen={};
    lines.forEach(function(l){
      if(!l.band) return;
      var kk=key(l.t);
      if(!seen[kk]){seen[kk]=1;cnt[kk]=(cnt[kk]||0)+1}
    });
  });
  var lim=Math.max(3,N*0.3);
  all=all.map(function(lines){
    return lines.filter(function(l){
      if(!l.band) return true;
      return !((cnt[key(l.t)]||0)>=lim||/^\d+$/.test(l.t));
    });
  });
  /* 3. body size and line spacing from lines that look like prose */
  var sizes={},gaps=[];
  all.forEach(function(lines){
    lines.forEach(function(l,idx){
      if(l.t.split(' ').length>=6&&folioIsProse(l.t)){
        sizes[l.max]=(sizes[l.max]||0)+1;
        var pv=lines[idx-1];
        if(pv&&pv.max===l.max&&pv.y>l.y&&pv.y-l.y<l.max*2) gaps.push(pv.y-l.y);
      }
    });
  });
  var body=12,best=0;
  for(k in sizes) if(sizes[k]>best){best=sizes[k];body=+k}
  gaps.sort(function(a,b){return a-b});
  var LS=gaps.length?gaps[gaps.length>>1]:body*1.35;
  /* 4. classify, then assemble blocks */
  var blocks=[],para=null,cand=null,prevY=null,prevPg=-1;
  var END=/[.!?:”"’')\]]$/;
  function pushPara(t,x){para={t:'p',text:t,x:x};blocks.push(para)}
  function append(t){
    if(/[A-Za-z]-$/.test(para.text)&&/^[a-z]/.test(t)) para.text=para.text.slice(0,-1)+t;
    else para.text+=' '+t;
  }
  function dropOrphanHead(){
    var last=blocks[blocks.length-1];
    if(last&&last.t==='h'&&!para) blocks.pop();
  }
  var isTitle=function(l){return /^\|\|.*\|\|$/.test(l.t)||(l.min>=body+5.5&&l.t.length<90)};
  for(p=0;p<N;p++){
    var lines=all[p];
    var topY=-1e9;
    lines.forEach(function(l){if(!isTitle(l)&&l.y>topY) topY=l.y});
    var hoist=lines.filter(function(l){return isTitle(l)&&l.y>=topY-2}).sort(function(a,b){return b.y-a.y});
    if(hoist.length) lines=hoist.concat(lines.filter(function(l){return hoist.indexOf(l)<0}));
    var figs=(pages[p].figs||[]).slice().sort(function(a,b){return b.yTop-a.yTop}),placed=[];
    figs.forEach(function(f){
      if(f.kind==='cover'){blocks.unshift({t:'cover',src:f.src,thumb:f.thumb,w:f.w,h:f.h,text:''});f.done=true}
      if(f.kind==='backcover') f.cap='Back cover';
    });
    figs=figs.filter(function(f){return !f.done||true});
    figs.forEach(function(f){
      if(f.kind==='cover'||f.kind==='backcover') return;
      var cap='',bi=-1,k2,best=1e9;
      lines.forEach(function(L,ix){
        var inFig=L.x>=f.x0-6&&L.x<=f.x1+6&&L.y>=f.yBot-4&&L.y<=f.yTop+4;
        if(inFig||L.band) return;
        var below=f.yBot-L.y,above=L.y-f.yTop;
        if(FOLIO_CAP.test(L.t)&&((below>=-2&&below<=40)||(above>=-2&&above<=28))){
          var dd=Math.min(Math.abs(below),Math.abs(above));
          if(dd<best){best=dd;bi=ix;cap=L.t}
        }
      });
      if(bi<0){
        lines.forEach(function(L,ix){
          var above=L.y-f.yTop;
          if(L.band||L.x<f.x0-170||L.x>f.x1) return;
          if(above>=-1&&above<=38&&L.t.split(' ').length<=7&&/^[A-Z(]/.test(L.t)&&!/[.,;]$/.test(L.t)&&L.t.indexOf('||')<0&&!isTitle(L)){
            if(above<best){best=above;bi=ix;cap=L.t}
          }
        });
      }
      if(bi>=0) lines[bi].t='';
      f.cap=cap;
    });
    lines=lines.filter(function(L){
      if(!L.t) return false;
      return !figs.some(function(f){return L.x>=f.x0-6&&L.x<=f.x1+6&&L.y>=f.yBot-4&&L.y<=f.yTop+4});
    });
    function putFigs(limitY){
      figs.forEach(function(f){
        if(f.kind==='cover'||placed.indexOf(f)>=0||!(limitY===null||limitY<f.yTop-2)) return;
        placed.push(f);
        blocks.push({t:'fig',src:f.src,text:f.cap,w:f.w,h:f.h});
        para=null;cand=null;prevY=null;
      });
    }
    for(i=0;i<lines.length;i++){
      putFigs(lines[i].y);
      var l=lines[i],t=l.t,gap=(prevPg===p&&prevY!=null)?prevY-l.y:null,kind;
      if(isTitle(l)) kind='title';
      else if(t.indexOf('||')>=0) kind='other';
      else if(l.min>=body+1.5) kind=(t.length<=72&&!/[.!]$/.test(t))?'head':'start';
      else if(l.max>=body+1.5) kind=(/[A-Za-z]\s?:(\s|$)/.test(t)||(t.split(' ').length>=5&&folioIsProse(t)))?'start':'other';
      else if(l.gaps>=2) kind='other';
      else if(folioIsProse(t)) kind='prose';
      else if(FOLIO_LIST.test(t)&&t.split(' ').length>=3&&/[a-z]{3}/.test(t)&&!FOLIO_DATE.test(t)&&t.indexOf('||')<0) kind='prose';
      else kind='other';
      if(typeof FOLIO_DEBUG==='function') FOLIO_DEBUG(p+1,kind,t,l.y,gap,l.x);
      prevY=l.y;prevPg=p;
      if(kind==='title'){
        var seenT={},parts=[];
        t.split('||').forEach(function(x){x=x.trim();if(x&&!seenT[x]){seenT[x]=1;parts.push(x)}});
        blocks.push({t:'ch',text:parts.join(' ')});
        para=null;cand=null;continue;
      }
      if(kind==='head'){
        para=null;cand=null;blocks.push({t:'h',text:t});continue;
      }
      if(kind==='start'||kind==='prose'){
        var newPara;
        if(!para) newPara=true;
        else if(kind==='start'||FOLIO_LIST.test(t)) newPara=true;
        else if(gap==null) newPara=END.test(para.text);
        else newPara=gap>LS*1.45;
        if(cand&&gap!=null&&gap<=LS*1.8){blocks.push({t:'h',text:cand});newPara=true}
        cand=null;
        if(newPara) pushPara(t,l.x); else append(t);
        continue;
      }
      /* 'other': a short tail of the current paragraph, a short subheading, or table debris */
      var tail=para&&gap!=null&&gap<=LS*1.35&&/[a-z]/.test(t)&&!FOLIO_DATE.test(t)&&
        Math.abs(l.x-(para.x||l.x))<60&&(folioLowRatio(t)>=0.4||/[.!?]$/.test(t));
      if(tail){append(t);continue}
      var words=t.split(' ').length;
      if(words<=5&&t.length<=44&&/^[A-Z(]/.test(t)&&!/\d\d/.test(t)&&!/[.,;]$/.test(t)){
        cand=t;para=null;continue;
      }
      cand=null;
      dropOrphanHead();
      para=null;
    }
    putFigs(null);
  }
  return blocks.map(function(b){
    if(b.t==='cover') return {t:'cover',src:b.src,thumb:b.thumb,text:'',w:b.w,h:b.h};
    if(b.t==='fig'&&b.text==='Back cover') return {t:'back',src:b.src,text:'',w:b.w,h:b.h};
    if(b.t==='fig') return {t:'fig',src:b.src,text:folioTidy(b.text||''),w:b.w,h:b.h};
    return {t:b.t,text:folioTidy(b.text)};
  }).filter(function(b){return b.t==='fig'||b.t==='cover'||b.t==='back'||b.text});
}
function folioChapters(blocks,fallback){
  var chs=[],cur=null,coverB=null,backB=null,hasCh=blocks.some(function(b){return b.t==='ch'});
  function open(title){cur={title:title,kicker:'',blocks:[]};chs.push(cur)}
  blocks.forEach(function(b){
    if(b.t==='ch'){
      if(cur&&cur.title===b.text) return;
      open(b.text);return;
    }
    if(b.t==='cover'){coverB=b;return}
    if(b.t==='back'){backB=b;return}
    if(b.t==='fig'){if(!cur) open(fallback);cur.blocks.push({type:'img',src:b.src,caption:b.text.replace(/[:\s]+$/,''),w:b.w,h:b.h});return}
    if(!hasCh&&b.text.length<80&&FOLIO_CHAPTER.test(b.text)){open(b.text.replace(/\s+/g,' '));return}
    if(!cur) open(fallback);
    if(b.t==='h'){
      var last=cur.blocks[cur.blocks.length-1];
      if(last&&last.type==='h') last.text+='\n'+b.text;
      else cur.blocks.push({type:'h',text:b.text});
    }else cur.blocks.push({type:'p',text:b.text});
  });
  var seen={},count={};
  chs.forEach(function(c){c.blocks.forEach(function(b){if(b.type==='p'&&b.text.length>60) count[b.text]=(count[b.text]||0)+1})});
  var notes=[];
  chs.forEach(function(c){
    c.blocks=c.blocks.filter(function(b){
      if(b.type!=='p'||!(count[b.text]>=3)) return true;
      if(!seen[b.text]){seen[b.text]=1;if(b.text.split(' ').length>=40) notes.push({type:'p',text:b.text})}
      return false;
    });
    var out=[];
    c.blocks.forEach(function(b){
      var last=out[out.length-1];
      if(b.type==='h'&&last&&last.type==='h') last.text+='\n'+b.text; else out.push(b);
    });
    c.blocks=out;
    while(c.blocks.length&&c.blocks[c.blocks.length-1].type==='h') c.blocks.pop();
  });
  if(notes.length) chs.push({title:'Disclaimer',kicker:'',blocks:notes});
  chs=chs.filter(function(c){
    var w=0,mx=0;
    c.blocks.forEach(function(b){if(b.type==='p'){var n=b.text.split(' ').length;w+=n;if(n>mx) mx=n}});
    return mx>=45||w>=120||c.blocks.some(function(b){return b.type==='img'});
  });
  var num=0;
  chs.forEach(function(c){
    if(c.title==='Disclaimer'){c.kicker='Note';return}
    c.kicker=hasCh?('Part '+(++num)):'Uploaded file';
  });
  if(backB) chs.push({title:'Back cover',kicker:'',cover:true,blocks:[{type:'img',src:backB.src,caption:'',w:backB.w,h:backB.h}]});
  if(coverB) chs.unshift({title:'Cover',kicker:'',cover:true,blocks:[{type:'cover',src:coverB.src,thumb:coverB.thumb,w:coverB.w,h:coverB.h}]});
  return chs;
}

/* ---- figures: find pictures and vector charts on a page, crop them, caption them ---- */
var FOLIO_CAP=/^(fig(ure)?s?\.?|plate|image|photo(graph)?|illustration|diagram|exhibit)\s*[\dA-Za-z]{0,4}\s*[.:–—-]/i;
function folioHash(cv){
  var W=25,Hh=24,c=document.createElement('canvas');c.width=W;c.height=Hh;
  var x=c.getContext('2d');x.drawImage(cv,0,0,W,Hh);
  var d=x.getImageData(0,0,W,Hh).data,i,j,h='';
  for(i=0;i<Hh;i++) for(j=0;j<W-1;j++){
    var a=(i*W+j)*4,b=(i*W+j+1)*4;
    h+=((d[a]+d[a+1]+d[a+2])>(d[b]+d[b+1]+d[b+2])+6)?'1':'0';
  }
  return h;
}
function folioHam(a,b){var n=0,i;for(i=0;i<a.length;i++) if(a[i]!==b[i]) n++;return n}
async function folioPageFigures(page,items,opts){
  var vp=page.getViewport({scale:1}),W=vp.width,H=vp.height,out=[];
  if(page.rotate&&page.rotate%360!==0) return out;
  var cv=document.createElement('canvas');cv.width=Math.ceil(W);cv.height=Math.ceil(H);
  var ctx=cv.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
  await page.render({canvasContext:ctx,canvas:cv,viewport:vp}).promise;
  /* white out every text box so only pictures and drawn lines are left */
  var boxes=[];
  ctx.fillStyle='#fff';
  items.forEach(function(it){
    if(!it.s||!/\S/.test(it.s)) return;
    var p=vp.convertToViewportPoint(it.x,it.y),z=it.z||10,w=(it.w||z*it.s.length*0.5);
    var x0=p[0]-1.5,y0=p[1]-z*0.95-1.5,bw=w+3,bh=z*1.25+3;
    ctx.fillRect(x0,y0,bw,bh);
    boxes.push([p[0],p[1],it.s,w*z*1.1]);
  });
  var img=ctx.getImageData(0,0,cv.width,cv.height),d=img.data,CELL=6;
  var gw=Math.ceil(cv.width/CELL),gh=Math.ceil(cv.height/CELL),act=new Uint8Array(gw*gh),x,y,k;
  for(y=0;y<cv.height;y++){
    for(x=0;x<cv.width;x++){
      k=(y*cv.width+x)*4;
      if(d[k]+d[k+1]+d[k+2]<705) act[((y/CELL)|0)*gw+((x/CELL)|0)]++;
    }
  }
  for(k=0;k<act.length;k++) act[k]=act[k]>=3?1:0;
  var seen=new Uint8Array(gw*gh),comps=[],R=2,q=[],c,qi,cx,cy,nx,ny,dx,dy;
  for(c=0;c<act.length;c++){
    if(!act[c]||seen[c]) continue;
    var b={x0:gw,y0:gh,x1:0,y1:0,n:0};q.length=0;q.push(c);seen[c]=1;qi=0;
    while(qi<q.length){
      var cur=q[qi++];cx=cur%gw;cy=(cur/gw)|0;
      if(cx<b.x0)b.x0=cx;if(cx>b.x1)b.x1=cx;if(cy<b.y0)b.y0=cy;if(cy>b.y1)b.y1=cy;b.n++;
      for(dy=-R;dy<=R;dy++) for(dx=-R;dx<=R;dx++){
        nx=cx+dx;ny=cy+dy;
        if(nx<0||ny<0||nx>=gw||ny>=gh) continue;
        var nk=ny*gw+nx;
        if(act[nk]&&!seen[nk]){seen[nk]=1;q.push(nk)}
      }
    }
    comps.push(b);
  }
  var words=0;items.forEach(function(it){if(it.s) words+=it.s.split(/\s+/).filter(Boolean).length});
  for(c=0;c<comps.length;c++){
    var g=comps[c],px0=g.x0*CELL,py0=g.y0*CELL,px1=(g.x1+1)*CELL,py1=(g.y1+1)*CELL,bw2=px1-px0,bh2=py1-py0;
    if(bw2<W*0.22||bh2<H*0.07) continue;
    var inside=0,tarea=0;
    boxes.forEach(function(t){if(t[0]>=px0-4&&t[0]<=px1+4&&t[1]>=py0-4&&t[1]<=py1+4){inside++;tarea+=t[3]}});
    var fill=g.n/(((g.x1-g.x0+1)*(g.y1-g.y0+1))||1),cov=tarea/(bw2*bh2);
    var ratio=bw2/bh2,area=(bw2*bh2)/(W*H);
    var kind='figure';
    if(inside>(opts&&opts.maxLabels||40)) continue;
    if(inside>0&&cov>0.09) continue;                           /* a table: text fills the grid */
    if(ratio>=2.7&&bw2>=W*0.6) kind='banner';                  /* a wide advert strip */
                      /* a full-page cover or advert */
    out.push({kind:kind,px0:px0,py0:py0,px1:px1,py1:py1,W:W,H:H,inside:inside,fill:fill,cov:cov,area:area,words:words});
  }
  /* a front or back cover: mostly artwork, hardly any text. Keep it, as one picture of the whole page artwork. */
  if(opts&&(opts.pageNo===1||opts.pageNo===opts.numPages)&&words<45){
    var u=null;
    comps.forEach(function(g){
      var a2=((g.x1-g.x0+1)*(g.y1-g.y0+1)*CELL*CELL)/(W*H);
      if(a2<0.004) return;
      if(!u) u={x0:g.x0,y0:g.y0,x1:g.x1,y1:g.y1};
      else{u.x0=Math.min(u.x0,g.x0);u.y0=Math.min(u.y0,g.y0);u.x1=Math.max(u.x1,g.x1);u.y1=Math.max(u.y1,g.y1)}
    });
    if(u){
      var ux0=u.x0*CELL,uy0=u.y0*CELL,ux1=(u.x1+1)*CELL,uy1=(u.y1+1)*CELL;
      if((ux1-ux0)*(uy1-uy0)/(W*H)>=0.05)
        out=[{kind:(opts.pageNo===1?'cover':'backcover'),px0:ux0,py0:uy0,px1:ux1,py1:uy1,W:W,H:H,inside:0,fill:1,cov:0,area:0,words:words}];
    }
  }
  if(!out.length) return out;
  /* crop at print-ish resolution from a clean render */
  var vp2=page.getViewport({scale:Math.min(3,Math.max(1.6,900/Math.max(W*0.5,1)))});
  var big=document.createElement('canvas');big.width=Math.ceil(vp2.width);big.height=Math.ceil(vp2.height);
  var bctx=big.getContext('2d');bctx.fillStyle='#fff';bctx.fillRect(0,0,big.width,big.height);
  await page.render({canvasContext:bctx,canvas:big,viewport:vp2}).promise;
  var sc=vp2.scale;
  out.forEach(function(f){
    var pad=4,sx=Math.max(0,(f.px0-pad)*sc),sy=Math.max(0,(f.py0-pad)*sc),
        sw=Math.min(big.width-sx,(f.px1-f.px0+pad*2)*sc),sh=Math.min(big.height-sy,(f.py1-f.py0+pad*2)*sc);
    var maxW=820,k2=Math.min(1,maxW/sw),o=document.createElement('canvas');
    o.width=Math.max(1,Math.round(sw*k2));o.height=Math.max(1,Math.round(sh*k2));
    var octx=o.getContext('2d');octx.fillStyle='#fff';octx.fillRect(0,0,o.width,o.height);
    octx.drawImage(big,sx,sy,sw,sh,0,0,o.width,o.height);
    f.src=o.toDataURL('image/jpeg',0.8);f.w=o.width;f.h=o.height;f.hash=folioHash(o);
    if(f.kind==='cover'||f.kind==='backcover'){
      var tw=240,th=Math.max(1,Math.round(o.height*tw/o.width)),tc2=document.createElement('canvas');
      tc2.width=tw;tc2.height=th;var tctx=tc2.getContext('2d');tctx.fillStyle='#fff';tctx.fillRect(0,0,tw,th);
      tctx.drawImage(o,0,0,tw,th);f.thumb=tc2.toDataURL('image/jpeg',0.72);
    }
    /* back to PDF space (y up) for placing it among the text lines */
    var tl=vp.convertToPdfPoint(f.px0,f.py0),br=vp.convertToPdfPoint(f.px1,f.py1);
    f.x0=Math.min(tl[0],br[0]);f.x1=Math.max(tl[0],br[0]);f.yTop=Math.max(tl[1],br[1]);f.yBot=Math.min(tl[1],br[1]);
  });
  return out;
}
function folioDropRepeats(pages){
  /* the same picture on three pages is an advert or a logo, not a figure */
  var all=[];
  pages.forEach(function(pg,pi){(pg.figs||[]).forEach(function(f){all.push({f:f,p:pi})})});
  all.forEach(function(a){
    var pgs={};
    all.forEach(function(b){if(folioHam(a.f.hash,b.f.hash)<=14) pgs[b.p]=1});
    a.f.reps=Object.keys(pgs).length;
  });
  pages.forEach(function(pg){
    pg.figs=(pg.figs||[]).filter(function(f){return f.kind==='cover'||f.kind==='backcover'||(f.kind==='figure'&&f.reps<2)});
  });
}
async function folioReadPdf(lib,data,onProgress,opts){
  var doc=await lib.getDocument({data:data}).promise,pages=[],n,page,v,tc;
  for(n=1;n<=doc.numPages;n++){
    page=await doc.getPage(n);
    v=page.view;
    tc=await page.getTextContent();
    var its=tc.items.filter(function(it){return typeof it.str==='string'}).map(function(it){
      return {s:it.str,x:it.transform[4],y:it.transform[5],w:it.width,z:Math.hypot(it.transform[2],it.transform[3])||it.height};
    });
    var figs=[];
    if(typeof document!=='undefined'&&!(opts&&opts.noFigures)){
      try{figs=await folioPageFigures(page,its,{pageNo:n,numPages:doc.numPages,maxLabels:opts&&opts.maxLabels})}catch(e){figs=[]}
    }
    pages.push({h:v[3]-v[1],items:its,figs:figs});
    if(onProgress) onProgress(n,doc.numPages);
    if(page.cleanup) page.cleanup();
  }
  folioDropRepeats(pages);
  return folioPagesToBlocks(pages);
}
/*EXTRACT_END*/
