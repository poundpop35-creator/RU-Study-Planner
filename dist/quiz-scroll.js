// Shared question navigation; never invoked when merely recording an answer.
let generation=0;
export function cancelQuestionScroll(){generation++;}
export function scrollQuestion(card,stem,header,env=globalThis){
 const token=++generation;
 if(!card||!stem)return;
 stem.setAttribute?.('tabindex','-1');
 stem.focus?.({preventScroll:true});
 const move=()=>{
  if(token!==generation||card.isConnected===false||card.closest?.('[hidden]'))return;
  const rect=header?.getBoundingClientRect?.();
  const clearance=Math.max(0,rect?.height||0,rect?.bottom||0)+12;
  card.style.scrollMarginTop=clearance+'px';
  card.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
 };
 if(typeof env.requestAnimationFrame==='function')env.requestAnimationFrame(()=>env.requestAnimationFrame(move));
 else move();
}
