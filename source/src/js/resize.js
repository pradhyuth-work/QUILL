/* ---------- resize ---------- */
function keyNow(){var b=$('#measureBody');return Math.round(b.clientWidth)+'x'+Math.round(b.clientHeight)+'x'+S.fs}
var rzT=0;
if(window.ResizeObserver){
  new ResizeObserver(function(){
    if($('#reader').hidden||laying) return;
    clearTimeout(rzT);
    rzT=setTimeout(function(){
      if(keyNow()!==layoutKey&&stage.clientWidth>0) layout(cards[curCard]?cards[curCard].first:0);
    },300);
  }).observe(stage);
}

