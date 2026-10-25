/* ---------- scrolling ---------- */
var rafId=0,settleT=0,scrubT=0;
scroller.addEventListener('scroll',function(){
  if(rafId) return;
  rafId=requestAnimationFrame(function(){
    rafId=0;
    var h=scroller.clientHeight||1;
    var n=Math.max(0,Math.min(cards.length-1,Math.round(scroller.scrollTop/h)));
    if(n!==curCard) setCard(n);
    clearTimeout(settleT);settleT=setTimeout(onSettle,240);
  });
},{passive:true});
function onSettle(){
  if(performance.now()<autoUntil) return;
  if(playing&&curS>=0&&itemCard[curS]!==curCard) speakFrom(cards[curCard].first);
}
scrub.addEventListener('input',function(){
  var n=+scrub.value;
  scrollToCard(n,false);
  if(playing){clearTimeout(scrubT);scrubT=setTimeout(function(){speakFrom(cards[n].first)},260)}
});

