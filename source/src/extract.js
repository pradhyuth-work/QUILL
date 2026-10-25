/*EXTRACT_START*/
/* Turns pdf.js page items into clean blocks: chapter titles, subheadings, paragraphs.
   Skips chart and table lines, ad images, repeated headers and footers. */
var FOLIO_LOW=/^[\p{Ll}\p{Lo}\p{M}][\p{Ll}\p{Lo}\p{M}\p{Pd}'’\u00AD]*[.,;:!?)"”’'»«\u0964\u3002\u3001]*$/u;
var FOLIO_NOSPACE=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/gu;
var FOLIO_SENT_END=/[.!?\u2026\u0964\u0965\u3002\uFF01\uFF1F\u061F\u06D4]/;
var FOLIO_DATE=/\d+\s*\/\s*\d+\s*\/\s*\d+/;
var FOLIO_LIST=/^(\(?\d{1,2}[.)](?=\s*[A-Za-z])|\(\d{1,2}\)|[•·▪●]\s|-\s)/;
var FOLIO_CHAPTER=/^(chapter|part|book|section|cap[ií]tulo|chapitre|partie|kapitel|teil|capitolo|parte|hoofdstuk|\u0433\u043b\u0430\u0432\u0430|\u0447\u0430\u0441\u0442\u044c|\u0905\u0927\u094d\u092f\u093e\u092f)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^.!?]{0,60}$/i;
var FOLIO_CHAPTER_CJK=/^\u7b2c\s*[\d\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u96f6\u3007]+\s*[\u7ae0\u8282\u7bc0\u56de\u90e8\u7bc7\u5377]/;

var FOLIO_STOP={the:1,and:1,of:1,to:1,in:1,is:1,are:1,an:1,for:1,that:1,with:1,you:1,your:1,will:1,be:1,as:1,by:1,it:1,on:1,this:1,can:1,may:1,have:1,from:1,or:1,at:1,not:1,was:1,which:1,their:1,they:1,he:1,she:1,his:1,her:1,if:1,but:1,when:1,who:1,these:1,those:1,than:1,then:1,there:1,would:1,should:1,could:1,been:1,has:1,had:1,were:1,into:1,also:1,more:1,most:1,very:1,all:1,any:1,such:1,our:1,we:1,my:1};
/* word count that also works for scripts written without spaces (Chinese, Japanese, Thai) */
function folioWC(t){
  var ns=t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/gu);
  if(!ns) return t.split(/\s+/).filter(Boolean).length;
  return t.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/gu,' ').split(/\s+/).filter(Boolean).length+Math.round(ns.length/1.8);
}
function folioLowRatio(t){
  var w=t.split(' '),lo=0,i;
  for(i=0;i<w.length;i++) if(FOLIO_LOW.test(w[i])) lo++;
  return w.length?lo/w.length:0;
}
function folioIsProse(t){
  var w=t.split(' '),lo=0,st=0,i,x;
  if(FOLIO_DATE.test(t)||t.indexOf('||')>=0) return false;
  var ns=t.match(FOLIO_NOSPACE);
  if(ns&&ns.length>=6&&ns.length/t.replace(/\s/g,'').length>0.45) return true;
  if(w.length<5) return false;
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

/* two-column pages: put the left column before the right one, whatever order the file stored them in */
function folioColumns(items,W){
  var its=items.filter(function(it){return it.s&&/\S/.test(it.s)});
  if(its.length<40||!W) return items;
  var BIN=4,nb=Math.ceil(W/BIN)+1,cov=new Int32Array(nb),k,max=0;
  var narrow=0;
  its.forEach(function(it){
    if((it.w||0)>W*0.55) return;            /* full-width titles and abstracts do not count as columns */
    narrow++;
    var a=Math.max(0,Math.floor(it.x/BIN)),b=Math.min(nb-1,Math.floor((it.x+(it.w||0))/BIN));
    for(k=a;k<=b;k++) cov[k]++;
  });
  if(narrow<30) return items;
  for(k=0;k<nb;k++) if(cov[k]>max) max=cov[k];
  var lo=Math.floor(nb*0.3),hi=Math.ceil(nb*0.7),best=null,run=null;
  for(k=lo;k<=hi;k++){
    if(cov[k]<=max*0.04){
      if(!run) run={a:k,b:k}; else run.b=k;
      if(!best||run.b-run.a>best.b-best.a) best={a:run.a,b:run.b};
    }else run=null;
  }
  if(!best||(best.b-best.a+1)*BIN<8) return items;
  var xg=(best.a+best.b+1)/2*BIN,nl=0,nr=0,nx=0;
  var tag=items.map(function(it,ix){
    var x1=it.x+(it.w||0),txt=it.s&&/\S/.test(it.s),side;
    if(txt&&it.x<xg-1&&x1>xg+1){side=0;nx++}
    else if(it.x+(it.w||0)/2<xg){side=1;if(txt) nl++}
    else{side=2;if(txt) nr++}
    return {it:it,ix:ix,side:side};
  });
  if(nl<its.length*0.2||nr<its.length*0.2||nx>its.length*0.15) return items;
  var xs=tag.filter(function(t){return t.side===0}).map(function(t){return t.it.y}).sort(function(a,b){return b-a});
  tag.forEach(function(t){
    var b=0;while(b<xs.length&&xs[b]>t.it.y+1) b++;
    t.band=t.side===0?b:b;
  });
  tag.sort(function(a,b){return a.band-b.band||a.side-b.side||a.ix-b.ix});
  return tag.map(function(t){return t.it});
}
/* tiny raised numbers (footnote marks) should not be spoken as part of the sentence */
function folioDominantSize(items){
  var h={},best=0,bz=10;
  items.forEach(function(it){
    if(!it.s) return;
    var z=Math.round((it.z||10)*2)/2,n=it.s.replace(/\s/g,'').length;
    if(!n) return;
    h[z]=(h[z]||0)+n;
  });
  for(var z in h) if(h[z]>best){best=h[z];bz=+z}
  return bz;
}
function folioStripMarks(items,dz){
  var out=[];
  items.forEach(function(it,ix){
    var z=it.z||dz;
    if(it.s&&z<dz*0.78&&/^[\s\d*†‡§¶,¹²³⁰-⁹()\[\]]+$/.test(it.s)&&/\S/.test(it.s)&&out.length&&/\S/.test(out[out.length-1].s||'')) return;
    if(it.s&&/[¹²³⁰-⁹]/.test(it.s)){
      it=Object.assign({},it,{s:it.s.replace(/(\p{L}[.,;:!?)”’"']?)[¹²³⁰-⁹]+/gu,'$1')});
    }
    out.push(it);
  });
  return out;
}
function folioPagesToBlocks(pages){
  var N=pages.length,p,i,k;
  /* 1. group items into lines (stream order keeps column reading order) */
  var all=pages.map(function(pg){
    var lines=[],L=null,dz=folioDominantSize(pg.items);
    pg.dz=dz;
    var src=folioStripMarks(folioColumns(pg.items,pg.W),dz);
    src.forEach(function(it){
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
      l.dz=dz;
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
  /* 3b. footnotes: smaller type than the body, low on the page, starting with a number or symbol */
  all=all.map(function(lines){
    var foot=false;
    return lines.filter(function(l){
      if(l.max<body-1.2&&l.y<l.h*0.4&&(/^([\d]{1,3}[.)]?|[*\u2020\u2021\u00a7])\s+\S/.test(l.t)||foot)){foot=true;return false}
      if(l.max>=body-0.3) foot=false;
      return true;
    });
  });
  /* 3c. left margin and right edge of each page, to find indented paragraphs */
  var margins=all.map(function(lines){
    var h={},best=0,lm=null,rights=[];
    lines.forEach(function(l){
      if(l.t.split(' ').length<5||!folioIsProse(l.t)) return;
      var kx=Math.round(l.x/2)*2;h[kx]=(h[kx]||0)+1;rights.push(l.x1);
    });
    for(var kx in h) if(h[kx]>best){best=h[kx];lm=+kx}
    rights.sort(function(a,b){return a-b});
    return {lm:lm,rm:rights.length?rights[Math.floor(rights.length*0.9)]:null};
  });
  /* 4. classify, then assemble blocks */
  var blocks=[],para=null,cand=null,prevY=null,prevPg=-1;
  var END=/[.!?:\u2026\u0964\u0965\u3002\uFF01\uFF1F\u061F\u06D4”"’')\]»」』]$/;
  var curX1=0,curX0=0;
  function pushPara(t,x){para={t:'p',text:t,x:x,lastX1:curX1,lastX0:curX0};blocks.push(para)}
  function append(t){
    if(/[\p{L}]-$/u.test(para.text)&&/^\p{Ll}/u.test(t)) para.text=para.text.slice(0,-1)+t;
    else if(/[\u00AD]$/.test(para.text)) para.text=para.text.slice(0,-1)+t;
    else if(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]$/u.test(para.text)&&/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(t)) para.text+=t;
    else para.text+=' '+t;
    para.lastX1=curX1;para.lastX0=curX0;
  }
  function dropOrphanHead(){
    var last=blocks[blocks.length-1];
    if(last&&last.t==='h'&&!para) blocks.pop();
  }
  var isTitle=function(l){return /^\|\|.*\|\|$/.test(l.t)||(l.min>=body+5.5&&l.t.length<90)};
  for(p=0;p<N;p++){
    var lines=all[p],mg=margins[p];
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
      prevY=l.y;prevPg=p;curX1=l.x1;curX0=l.x;
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
        else{
          newPara=gap>LS*1.45;
          if(!newPara&&END.test(para.text)&&mg.lm!=null){
            var ind=l.x-mg.lm;
            if(ind>body*0.7&&ind<body*5&&Math.abs((para.lastX0==null?para.x:para.lastX0)-mg.lm)<body*0.7) newPara=true;      /* first-line indent */
            else if(para.lastX1&&mg.rm&&para.lastX1<mg.rm-body*4&&/^[\p{Lu}\p{Lo}"“‘'(¿¡\d—-]/u.test(t)) newPara=true;   /* short last line */
          }
        }
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
    if(!hasCh&&b.text.length<80&&(FOLIO_CHAPTER.test(b.text)||FOLIO_CHAPTER_CJK.test(b.text))){open(b.text.replace(/\s+/g,' '));return}
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
      if(!seen[b.text]){seen[b.text]=1;if(folioWC(b.text)>=40) notes.push({type:'p',text:b.text})}
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
    c.blocks.forEach(function(b){if(b.type==='p'){var n=folioWC(b.text);w+=n;if(n>mx) mx=n}});
    return mx>=45||w>=120||c.blocks.some(function(b){return b.type==='img'});
  });
  var num=0;
  chs.forEach(function(c){
    if(c.title==='Disclaimer'){c.kicker='Note';return}
    c.kicker=hasCh?('Part '+(++num)):'Uploaded file';
  });
  /* a long book with no detectable chapters: cut it into parts so the reader and listener can jump around */
  if(chs.length===1){
    var tw=0;chs[0].blocks.forEach(function(b){if(b.type==='p') tw+=folioWC(b.text)});
    if(tw>9000){
      var base=chs[0].title,parts=[],cp=null,cw=0,target=Math.max(3500,Math.round(tw/Math.ceil(tw/5000)));
      chs[0].blocks.forEach(function(b){
        if(!cp||(cw>=target&&b.type==='p')){cp={title:'Part '+(parts.length+1),kicker:base,blocks:[]};parts.push(cp);cw=0}
        cp.blocks.push(b);if(b.type==='p') cw+=folioWC(b.text);
      });
      chs=parts;
    }
  }
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
/* does this page carry pictures or drawings worth scanning for figures? Text-only pages skip the slow render. */
async function folioPageHasArt(lib,page){
  try{
    var ops=lib.OPS;if(!ops) return true;
    var ol=await page.getOperatorList(),fa=ol.fnArray,img=0,path=0,i,f;
    var IMG={},PATH={};
    ['paintImageXObject','paintInlineImageXObject','paintImageMaskXObject','paintJpegXObject','paintXObject','shadingFill'].forEach(function(n){if(ops[n]!=null) IMG[ops[n]]=1});
    ['constructPath','stroke','fill','eoFill','fillStroke','closeFillStroke'].forEach(function(n){if(ops[n]!=null) PATH[ops[n]]=1});
    for(i=0;i<fa.length;i++){f=fa[i];if(IMG[f]) img++;else if(PATH[f]) path++}
    return img>0||path>=14;
  }catch(e){return true}
}
function folioCancelled(){var e=new Error('cancelled');e.cancelled=true;return e}
async function folioReadPdf(lib,data,onProgress,opts){
  opts=opts||{};
  var docOpts=Object.assign({},opts.docOpts||{},{data:data}),task=lib.getDocument(docOpts);
  if(opts.askPassword){
    task.onPassword=function(update,reason){
      var wrong=reason===(lib.PasswordResponses&&lib.PasswordResponses.INCORRECT_PASSWORD);
      Promise.resolve(opts.askPassword(wrong)).then(function(pw){
        if(pw==null||pw===''){var e=new Error('cancelled');e.cancelled=true;e.pwCancelled=true;pwFail=e;task.destroy().catch(function(){})}
        else update(pw);
      });
    };
  }
  var pwFail=null,doc;
  try{doc=await task.promise}catch(e){if(pwFail) throw pwFail;throw e}
  var pages=[],n,page,v,tc,stats={pages:doc.numPages,textPages:0,emptyPages:0,badPages:0,figPages:0};
  var sampleText='';
  for(n=1;n<=doc.numPages;n++){
    if(opts.cancel&&opts.cancel.cancelled){try{doc.destroy()}catch(e){}throw folioCancelled()}
    try{
      page=await doc.getPage(n);
      v=page.view;
      tc=await page.getTextContent();
      var its=tc.items.filter(function(it){return typeof it.str==='string'}).map(function(it){
        return {s:it.str,x:it.transform[4],y:it.transform[5],w:it.width,z:Math.hypot(it.transform[2],it.transform[3])||it.height};
      });
      var chars=0;its.forEach(function(it){chars+=it.s.replace(/\s/g,'').length});
      if(chars>=25){stats.textPages++;if(sampleText.length<4000) sampleText+=its.map(function(i){return i.s}).join(' ').slice(0,600)+'\n'}else stats.emptyPages++;
      var figs=[];
      if(typeof document!=='undefined'&&!opts.noFigures){
        var scan=(n===1||n===doc.numPages)?true:await folioPageHasArt(lib,page);
        if(scan){
          try{figs=await folioPageFigures(page,its,{pageNo:n,numPages:doc.numPages,maxLabels:opts.maxLabels});if(figs.length) stats.figPages++}catch(e){figs=[]}
        }
      }
      pages.push({h:v[3]-v[1],W:v[2]-v[0],items:its,figs:figs});
      if(page.cleanup) page.cleanup();
    }catch(e){
      if(e&&e.cancelled) throw e;
      stats.badPages++;pages.push({h:792,W:612,items:[],figs:[]});
    }
    if(onProgress) onProgress(n,doc.numPages);
    if(n%4===0) await new Promise(function(r){setTimeout(r,0)});
  }
  try{doc.destroy()}catch(e){}
  if(stats.badPages>stats.pages*0.5&&stats.pages>2) throw new Error('Most pages could not be read');
  folioDropRepeats(pages);
  stats.lang=folioDetectLang([{text:sampleText}]);
  return {blocks:folioPagesToBlocks(pages),stats:stats};
}
/* plain text: paragraphs are blank-line separated; if the file is hard-wrapped, join lines inside each paragraph */
function folioTextBlocks(txt){
  txt=txt.replace(/^﻿/,'').replace(/\r\n?/g,'\n');
  var paras=txt.split(/\n\s*\n/);
  if(paras.length<4&&txt.length>2000){ /* no blank lines: treat an indented or capitalised line after a full stop as a new paragraph */
    paras=txt.split(/\n(?=[ \t]{2,}\S)/);
  }
  var out=[];
  paras.forEach(function(p){
    var lines=p.split('\n').map(function(x){return x.trim()}).filter(Boolean);
    if(!lines.length) return;
    var t=lines.join(' ').replace(/\s+/g,' ').trim();
    if(/^#{1,3}\s+/.test(t)){out.push({t:'ch',text:t.replace(/^#+\s+/,'')});return}
    if(lines.length===1&&t.length<70&&!/[.!?,;:]$/.test(t)&&(FOLIO_CHAPTER.test(t)||FOLIO_CHAPTER_CJK.test(t)||t===t.toUpperCase()&&/[A-Z]/.test(t))){out.push({t:'ch',text:t});return}
    out.push({t:'p',text:t});
  });
  return out;
}
/* which language is this book in? script first, then common words for Latin-script languages */
var FOLIO_LANGW={
  en:'the and of to in is that it was for with as his he on be at by this had not are but from or have an they which you were her all she there would their we him been has when who will more no if out so said what up its about into than them can only other new some could time these two may then do first any my now such like our over man me even most made after also did many before must through back years where much your way well down should because each just those people how too little state good very make world still own see men work long get here between both life being under never day same another know while last might us great old year off come since against go came right used take three'
 .split(' '),
  es:'el la de que y en un ser se no haber por con su para como estar tener le lo todo pero mas hacer o poder decir este ir otro ese si me ya ver porque dar cuando muy sin vez mucho saber que sobre mi alguno mismo yo tambien hasta ano dos querer entre asi primero desde grande eso ni nos llegar pasar tiempo ella si dia uno bien poco deber entonces poner cosa tanto hombre parecer nuestro tan donde ahora parte despues vida quedar siempre creer hablar llevar dejar nada cada seguir menos nuevo encontrar'.split(' '),
  fr:'le de un etre et a en avoir que pour dans ce il qui ne sur se pas plus pouvoir par je avec tout faire son mettre autre on mais nous comme ou si leur y dire elle devoir avant deux meme prendre aussi celui donner bien ou fois vous encore nouveau aller cela entre premier vouloir deja grand mon me moins quelque lui temps tres savoir falloir voir sans autre'.split(' '),
  de:'der die und in den von zu das mit sich des auf fur ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem uber einen so zum war haben nur oder aber vor zur bis mehr durch man sein wurde sei prozent hatte kann gegen vom konnen schon wenn habe seine mark ihre dann unter wir soll ich eines es jahr zwei jahren diese dieser'.split(' '),
  pt:'de a o que e do da em um para e com nao uma os no se na por mais as dos como mas foi ao ele das tem a seu sua ou ser quando muito ha nos ja esta eu tambem so pelo pela ate isso ela entre era depois sem mesmo aos ter seus quem nas me esse eles estao voce tinha foram essa num nem suas meu as minha tem numa pelos elas havia seja qual sera nos tenho lhe deles essas esses pelas este fosse dele'.split(' '),
  it:'di e il la che a in un per non una sono con si da come ma le i lo al ha anche piu del dei della nel suo questo essere era loro della fatto tutti gli alla se lui due essere stato molto ancora anni dopo ogni senza tra sul cosi'.split(' ')
};
function folioDetectLang(blocks){
  var t='',i;
  for(i=0;i<blocks.length&&t.length<6000;i++){var x=blocks[i].text;if(x) t+=' '+x}
  if(!t.trim()) return 'en';
  var cnt=function(re){var m=t.match(re);return m?m.length:0};
  var sc=[
    ['hi',/[ऀ-ॿ]/g],['bn',/[ঀ-৿]/g],['pa',/[਀-੿]/g],['gu',/[઀-૿]/g],['ta',/[஀-௿]/g],['te',/[ఀ-౿]/g],['kn',/[ಀ-೿]/g],['ml',/[ഀ-ൿ]/g],
    ['th',/[฀-๿]/g],['ko',/[가-힯]/g],['ja',/[぀-ヿ]/g],['zh',/[一-鿿]/g],['el',/[Ͱ-Ͽ]/g],['he',/[֐-׿]/g],['ar',/[؀-ۿ]/g],['ru',/[Ѐ-ӿ]/g]
  ],best=null,bn=0,total=t.replace(/\s/g,'').length||1;
  sc.forEach(function(p){var n=cnt(p[1]);if(n>bn){bn=n;best=p[0]}});
  if(best&&bn/total>0.2){
    if(best==='ar'){if(/[پچژگ]/.test(t)&&!/[ٹڈڑںے]/.test(t)) return 'fa';if(/[ٹڈڑںے]/.test(t)) return 'ur'}
    if(best==='ru'&&/[їєґ]/.test(t)) return 'uk';
    if(best==='zh'&&cnt(/[぀-ヿ]/g)>total*0.03) return 'ja';
    return best;
  }
  var words=t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').match(/[a-z]+/g)||[],tally={},k;
  var sets={};for(k in FOLIO_LANGW){sets[k]={};FOLIO_LANGW[k].forEach(function(w){sets[k][w]=1});tally[k]=0}
  words.forEach(function(w){for(k in sets) if(sets[k][w]) tally[k]++});
  var top='en',tv=-1;for(k in tally) if(tally[k]>tv){tv=tally[k];top=k}
  return top;
}
/*EXTRACT_END*/
