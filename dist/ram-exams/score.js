export const accepts=(q,v)=>v===q.a||!!q.accepted?.includes(v);
// Scoring helpers for the seven Ram Test Hub practice banks.
// Preserve the original per-question localStorage keys across the redesign.
export const answerKey=(course,id)=>'ru:ram-test-hub:'+course+':'+id;
export function parsedAnswer(value,optionCount){
 if(typeof value!=='string'||!/^(?:0|[1-9]\d*)$/.test(value))return null;
 const index=Number(value);
 return Number.isSafeInteger(index)&&index>=0&&index<optionCount?index:null;
}
export function readAnswer(storage,course,question){
 try{return parsedAnswer(storage.getItem(answerKey(course,question.id)),question.o.length);}
 catch{return null;}
}
export function scoreSet(items,getAnswer){
 let correct=0,wrong=0,answered=0,ungraded=0;
 for(const q of items){
  const value=getAnswer(q);
  if(!Number.isInteger(value)||value<0||value>=q.o.length)continue;
  answered++;
  if(!Number.isInteger(q.a)||q.a<0||q.a>=q.o.length){ungraded++;continue;}
  if(accepts(q,value))correct++;else wrong++;
 }
 const total=items.length,pending=total-answered,gradable=total-items.filter(q=>!Number.isInteger(q.a)||q.a<0||q.a>=q.o.length).length;
 return {total,answered,pending,correct,wrong,ungraded,gradable,
  percent:gradable?Math.round(correct/gradable*100):0,complete:total>0&&pending===0};
}
