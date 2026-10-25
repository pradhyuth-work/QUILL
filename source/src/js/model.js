/* ---------- book model ---------- */
var ABBR=/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|Fig|No|Nr|Sr|Sra|Srta|Mme|Mlle|Mme|MM|Hr|Fr|Dra|Bd|Ed|Vol|Cap|pp|ca|bzw|usw|etc|ggf|evtl|inkl|ok)\.|\b\p{Lu}\.|\be\.g\.|\bi\.e\.|\bz\.\s?B\.|\bd\.\s?h\.|\bu\.\s?a\.|\bp\.\s?ex\.|\bc\.\s?-?à\s?-?d\.)["”’'»)\]]*$/u;
var SENT_END='.!?…।॥。！？．؟۔⁇⁈⁉';
var CLOSERS=/["”’'»」』）)\]]/;
function splitSentences(t){
  var out=[],cur='',i,ch,j,s;
  for(i=0;i<t.length;i++){
    ch=t[i];cur+=ch;
    if(SENT_END.indexOf(ch)>-1){
      j=i+1;
      while(j<t.length&&(CLOSERS.test(t[j])||SENT_END.indexOf(t[j])>-1)){cur+=t[j];j++}
      i=j-1;
      var cjk=/[。！？]/.test(ch);
      if(j>=t.length||/\s/.test(t[j])||cjk){
        s=cur.trim();
        /* a decimal such as 3.5 or a lone initial does not end a sentence; neither does an abbreviation */
        if(ch==='.'&&!ABBR.test(s)&&!/(^|\s)\(?\d{1,3}[.)]$/.test(s)&&!/^\p{Ll}/u.test(t.slice(j).trim().charAt(0)||'A')){out.push(s);cur=''}
        else if(ch!=='.'&&!/^[\p{Ll}]/u.test((t.slice(j).trim().charAt(0))||'A')||cjk||ch==='।'||ch==='॥'){out.push(s);cur=''}
      }
    }
  }
  if(cur.trim()) out.push(cur.trim());
  return out;
}
function safeSrc(u){return (typeof u==='string'&&/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(u))?u:''}
function buildBook(meta,chapters){
  if(!chapters.length||!chapters[0].cover||!chapters[0].blocks.length||chapters[0].blocks[0].type!=='cover') chapters=[{title:'Cover',kicker:'',cover:true,blocks:[{type:'cover'}]}].concat(chapters);
  var items=[],p=0,words=0;
  chapters.forEach(function(ch,ci){
    var first=true;
    ch.blocks.forEach(function(b,bi){
      if(b.type==='cover'){
        var cs=meta.trusted?(b.src||''):safeSrc(b.src),ct=meta.trusted?(b.thumb||''):safeSrc(b.thumb);
        items.push({i:items.length,k:'cover',src:cs,thumb:ct,c:ci,bi:bi,ch0:first});first=false;
        meta.cover=ct||cs||'';
      }else if(b.type==='img'){
        var is=meta.trusted?(b.src||''):safeSrc(b.src);
        items.push({i:items.length,k:'img',svg:meta.trusted?b.svg:undefined,src:is,cap:String(b.caption||'').slice(0,400),w:b.w,h:b.h,c:ci,bi:bi,ch0:first});first=false;
      }else if(b.type==='h'){
        var say=b.text.replace(/\s*\n+\s*/g,'. ');
        if(!/[.!?:]$/.test(say)) say+='.';
        items.push({i:items.length,k:'h',t:b.text,say:say,p:-1,c:ci,ch0:first});first=false;
      }else{
        p++;
        splitSentences(b.text).forEach(function(s){
          items.push({i:items.length,k:'s',t:s,p:p,c:ci,ch0:first});first=false;
          words+=folioWC(s);
        });
      }
    });
  });
  meta.chapters=chapters;meta.items=items;meta.words=words;
  return meta;
}

var FIG='<svg viewBox="0 0 320 190" role="img" aria-label="One wide page of text on the left, three narrow cards on the right"><rect class="fa" x="14" y="14" width="124" height="162" rx="10"/><g class="fl"><rect x="28" y="32" width="96" height="5" rx="2.5"/><rect x="28" y="45" width="88" height="5" rx="2.5"/><rect x="28" y="58" width="96" height="5" rx="2.5"/><rect x="28" y="71" width="70" height="5" rx="2.5"/><rect x="28" y="92" width="96" height="5" rx="2.5"/><rect x="28" y="105" width="92" height="5" rx="2.5"/><rect x="28" y="118" width="84" height="5" rx="2.5"/><rect x="28" y="131" width="96" height="5" rx="2.5"/><rect x="28" y="144" width="52" height="5" rx="2.5"/></g><path class="fs" d="M152 95h28m-8-8 8 8-8 8"/><rect class="fb" x="214" y="10" width="84" height="150" rx="12"/><rect class="fb2" x="206" y="20" width="84" height="150" rx="12"/><rect class="fc" x="198" y="30" width="84" height="150" rx="12"/><g class="fcl"><rect x="212" y="52" width="56" height="5" rx="2.5"/><rect x="212" y="65" width="50" height="5" rx="2.5"/><rect x="212" y="78" width="56" height="5" rx="2.5"/><rect x="212" y="91" width="40" height="5" rx="2.5"/><rect x="212" y="112" width="56" height="5" rx="2.5"/><rect x="212" y="125" width="46" height="5" rx="2.5"/></g></svg>';

var sample=buildBook({id:'sample',title:'Reading on Glass',author:'Sample text',tag:'Sample',alt:false,trusted:true},[
  {title:'Why the page moved',blocks:[
    {type:'p',text:'For most of history, a page was a fixed object. Its size was chosen by a printer, and the reader adapted to it. Margins, line length and type size were all decided before the book reached anyone’s hands.'},
    {type:'p',text:'Screens reversed that arrangement. The reader now holds a window of unknown size, and the text has to adapt instead. A phone, a tablet and a desktop monitor each ask for a different shape of paragraph.'},
    {type:'p',text:'Early e-readers answered by copying the printed page and shrinking it. That worked on large screens and failed on small ones. Pinching and panning replaced the simple act of turning a leaf.'},
    {type:'p',text:'A better answer is to treat the book as a stream of sentences. The stream can be cut into pieces that fit whatever window is available. Each piece then becomes one screen of reading.'}
  ]},
  {title:'The size of a thought',blocks:[
    {type:'p',text:'A comfortable screen of text holds roughly as much as a person can take in with one look. On a phone that is a short paragraph, and on a tablet it is two or three. The unit that matters is the glance, not the page number.'},
    {type:'p',text:'Cards make that unit visible. Each one ends where the screen ends, so the eye always knows how much is left before the next swipe. A steady rhythm of small finishes keeps the reader moving.'},
    {type:'img',svg:FIG,caption:'Figure 1. One chapter, cut into cards that fit the screen.'},
    {type:'p',text:'Good breaks fall between sentences. A card should never end halfway through a word, and it should avoid stopping on a lone short sentence when the next one belongs with it. Careful cutting is most of the craft.'},
    {type:'p',text:'Images deserve a card of their own. Placed between paragraphs, they give the reader a pause and a change of pace. A caption keeps the picture tied to the surrounding text.'}
  ]},
  {title:'Listening is reading',blocks:[
    {type:'p',text:'Reading aloud has always been a normal way to meet a book. Children are read to, and many adults follow a story best by ear. A good reading app should treat the two modes as one activity.'},
    {type:'p',text:'That means the place in the book is shared. If you stop listening at the end of a chapter, the cards open at the same sentence. If you stop reading, the voice picks up from the card on screen.'},
    {type:'p',text:'The voice itself can come from the device. Phones and computers ship with speech built in, and it costs nothing to use. Newer voices sound better, and most improve with each system update.'},
    {type:'p',text:'Highlighting the sentence being spoken helps the eye follow along. It also makes errors easy to spot, such as a name the voice pronounces oddly. Those moments are worth noting so they can be fixed later.'}
  ]}
]);
var VEDIC=/*@@VEDIC@@*/[];
var vedic=buildBook({id:'vedic-report',title:'Vedic Report',author:'AstroSage',tag:'PDF',alt:true,note:'56 pages',trusted:true},VEDIC);
