// Safe per-word formatting in UTF-16 offsets, compatible with textarea selections.
const FLAGS=['bold','italic','underline','strike'];
export function textColor(value,fallback=null){
 if(typeof value!=='string')return fallback;
 const hex=value.trim();
 if(/^#[0-9a-fA-F]{6}$/.test(hex))return hex.toLowerCase();
 const match=/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*1(?:\.0+)?)?\s*\)$/.exec(hex);
 if(!match)return fallback;
 const channels=match.slice(1,4).map(Number);
 if(channels.some(n=>n>255))return fallback;
 return '#'+channels.map(n=>n.toString(16).padStart(2,'0')).join('');
}
export const TEXT_SIZE_MIN=10,TEXT_SIZE_MAX=96;
export function textSize(value,fallback=24){
 const n=Number(value);
 return Number.isInteger(n)&&n>=TEXT_SIZE_MIN&&n<=TEXT_SIZE_MAX?n:fallback;
}
const sameStyle=(a,b)=>FLAGS.every(k=>!!a[k]===!!b[k])&&(a.size||null)===(b.size||null)&&(a.color||null)===(b.color||null);
function formatOf(m){
 const out={};
 for(const key of FLAGS)if(m[key]===true)out[key]=true;
 if(m.size!==undefined)out.size=m.size;
 if(m.color!==undefined)out.color=m.color;
 return out;
}
export function normalizeMarks(marks,textLength){
 const sorted=(marks||[]).map(x=>({...x})).filter(x=>x.end>x.start)
  .sort((a,b)=>a.start-b.start||a.end-b.end);
 const merged=[];
 for(const m of sorted){
  const style=formatOf(m);
  if(!Object.keys(style).length)continue;
  if(!Number.isInteger(m.start)||!Number.isInteger(m.end)||m.start<0||m.end>textLength||m.start>m.end)throw Error('ช่วงจัดรูปแบบข้อความไม่ถูกต้อง');
  const last=merged.at(-1);
  if(last&&last.end===m.start&&sameStyle(last,style)){last.end=m.end;continue;}
  if(last&&last.end>m.start)throw Error('ช่วงจัดรูปแบบข้อความซ้อนกัน');
  merged.push({start:m.start,end:m.end,...style});
 }
 if(merged.length>1000)throw Error('จำนวนช่วงจัดรูปแบบข้อความเกินกำหนด');
 return merged;
}
export function validateMarks(marks,text){
 if(!Array.isArray(marks)||marks.length>1000)throw Error('รูปแบบข้อความไม่ถูกต้อง');
 for(const m of marks){
  if(!m||typeof m!=='object'||!Number.isInteger(m.start)||!Number.isInteger(m.end)||m.start<0||m.start>=m.end||m.end>text.length)throw Error('ช่วงจัดรูปแบบข้อความไม่ถูกต้อง');
  for(const flag of FLAGS)if(m[flag]!==undefined&&m[flag]!==true)throw Error('รูปแบบตัวอักษรไม่ถูกต้อง');
  if(m.size!==undefined&&textSize(m.size,null)===null)throw Error('ขนาดตัวอักษรไม่ถูกต้อง');
  if(m.color!==undefined&&textColor(m.color,null)===null)throw Error('สีตัวอักษรไม่ถูกต้อง');
 }
 return normalizeMarks(marks,text.length);
}
export function applyTextFormat(marks,text,start,end,key,value){
 if(![...FLAGS,'size','color'].includes(key)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>text.length||start>=end)return normalizeMarks(marks||[],text.length);
 const existing=normalizeMarks(marks||[],text.length);
 const boundaries=[...new Set([0,text.length,start,end,...existing.flatMap(m=>[m.start,m.end])])].sort((a,b)=>a-b);
 const result=[];
 for(let i=0;i<boundaries.length-1;i++){
  const a=boundaries[i],b=boundaries[i+1];if(a===b)continue;
  const old=existing.find(m=>m.start<=a&&m.end>=b);
  const style=old?formatOf(old):{};
  if(a>=start&&b<=end){
   if(key==='size'){if(value===null)delete style.size;else style.size=textSize(value,24);}
   else if(key==='color'){if(value===null)delete style.color;else{const c=textColor(value);if(!c)throw Error('สีตัวอักษรไม่ถูกต้อง');style.color=c;}}
   else if(value===true)style[key]=true;
   else delete style[key];
  }
  if(Object.keys(style).length)result.push({start:a,end:b,...style});
 }
 return normalizeMarks(result,text.length);
}
export function toggleTextFormat(marks,text,start,end,key){
 if(!FLAGS.includes(key)||start>=end)return normalizeMarks(marks||[],text.length);
 const existing=normalizeMarks(marks||[],text.length);
 let covered=start;
 for(const m of existing){
  if(m.end<=covered)continue;
  if(m.start>covered||!m[key])break;
  covered=Math.min(end,m.end);if(covered===end)break;
 }
 return applyTextFormat(existing,text,start,end,key,covered!==end);
}
// Shift formatting runs as characters are inserted/deleted in the simple text editor.
export function moveMarks(marks,before,after){
 if(!marks?.length||before===after)return marks||[];
 let start=0,oldEnd=before.length,newEnd=after.length;
 while(start<oldEnd&&start<newEnd&&before[start]===after[start])start++;
 while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
 const delta=newEnd-oldEnd,result=[];
 for(const m of marks){
  if(m.end<=start)result.push(m);
  else if(m.start>=oldEnd)result.push({...m,start:m.start+delta,end:m.end+delta});
  else {
   if(m.start<start)result.push({...m,end:start});
   if(m.end>oldEnd)result.push({...m,start:newEnd,end:m.end+delta});
  }
 }
 return normalizeMarks(result,after.length);
}
// The same escaping passed to this function is used for text and link destinations.
export function formattedTextHTML(o,escape,interactive=true,includeLinks=true){
 const text=String(o.text||''),marks=o.marks||[],links=includeLinks?o.links||[]:[];
 const boundaries=[...new Set([0,text.length,...marks.flatMap(m=>[m.start,m.end]),...links.flatMap(l=>[l.start,l.end])])].sort((a,b)=>a-b);
 let html='';
 for(let i=0;i<boundaries.length-1;i++){
  const a=boundaries[i],b=boundaries[i+1];
  if(a>=b)continue;
  const m=marks.find(m=>m.start<=a&&m.end>=b),l=links.find(l=>l.start<=a&&l.end>=b);
  const span=m?'<span style="'+[
   m.bold?'font-weight:700':'',m.italic?'font-style:italic':'',
   m.underline||m.strike?'text-decoration:'+[(m.underline?'underline':''),(m.strike?'line-through':'')].filter(Boolean).join(' '):'',
   m.size?'font-size:'+m.size+'px':'',textColor(m.color)?'color:'+textColor(m.color):''].filter(Boolean).join(';')+'">':'';
  let content=span+escape(text.slice(a,b))+(span?'</span>':'');
  if(l){
   if(!interactive)content='<span class="paper-word-mark">'+content+'</span>';
   else if(l.url)content='<a class="paper-word-mark" data-word-link href="'+escape(l.url)+'" target="_blank" rel="noopener noreferrer">'+content+'</a>';
   else content='<button type="button" class="paper-word-mark" data-word-file="'+escape(l.fileId)+'">'+content+'</button>';
  }
  html+=content;
 }
 return html;
}
