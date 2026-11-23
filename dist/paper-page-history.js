// One entry holds only the affected page, including its ID and insertion position.
// Changes on other pages are preserved. A changed target is never overwritten.
export function notebookHistory(limit=40){
 const undo=[],redo=[];let bytes=0;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function record(before,after,index){
  if(same(before,after))return;
  const item={before:structuredClone(before),after:structuredClone(after),index};
  item.bytes=JSON.stringify(item).length;bytes+=item.bytes;undo.push(item);redo.length=0;
  while(undo.length>limit||(undo.length>1&&bytes>4000000))bytes-=undo.shift().bytes;
 }
 function apply(pages,back,save){
  const from=back?undo:redo,to=back?redo:undo,item=from.at(-1);if(!item)return;
  const expected=back?item.after:item.before,newPage=back?item.before:item.after,id=(expected||newPage).id;
  const at=pages.findIndex(p=>p.id===id),actual=pages[at]||null;
  if(!same(actual,expected)){throw Error('หน้านี้เปลี่ยนไปแล้ว จึงไม่ย้อนทับข้อมูลใหม่');}
  const next=pages.slice();
  if(!newPage){if(next.length===1)throw Error('ต้องเหลืออย่างน้อยหนึ่งหน้า');next.splice(at,1);}
  else if(at<0)next.splice(Math.min(next.length,item.index),0,structuredClone(newPage));
  else next[at]=structuredClone(newPage);
  const focus=newPage?.id||next[Math.min(at,next.length-1)].id;
  if(!save(next,focus))return;
  from.pop();to.push(item);bytes+=(back?-1:1)*item.bytes;
 }
 return {record,apply,get canUndo(){return undo.length>0},get canRedo(){return redo.length>0}};
}
