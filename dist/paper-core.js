import {validateLinks} from './word-links.js';
import {shapes} from './paper-shapes.js';
export const PAGE_W=900,PAGE_H=1273;
// Width is in paper coordinates. Highlighter uses 3x width; keep under the 40px schema cap.
export const PEN_WIDTH_PRESETS=[1,2,3,5,8,12];
export function penWidth(value,fallback=5){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=12?n:fallback;}
export const PAPERS=['plain','ruled','grid','dots'];
const idOK=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(x);
const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const color=x=>typeof x==='string'&&/^#[a-fA-F0-9]{6}$/.test(x);
export const copy=x=>JSON.parse(JSON.stringify(x));
export const uid=()=>crypto.randomUUID();
export const emptyPage=()=>({id:uid(),template:'ruled',objects:[]});
export function imageLink(value){
 const text=String(value??'').trim();
 if(!text)return '';
 let url;
 try{url=new URL(text);}catch{}
 if(!url||!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.href.length>2048)throw Error('กรอกลิงก์เว็บไซต์ที่ขึ้นต้นด้วย https:// หรือ http://');
 return url.href;
}
export function validatePaper(value){
 if(!value||value.version!==1||!Array.isArray(value.pages)||!value.pages.length||value.pages.length>100)throw Error('สมุดรองรับ 1–100 หน้า');
 const ids=new Set();let points=0;
 return {version:1,pages:value.pages.map(page=>{
  if(!idOK(page.id)||ids.has(page.id)||!PAPERS.includes(page.template)||!Array.isArray(page.objects)||page.objects.length>5000)throw Error('ข้อมูลหน้ากระดาษไม่ถูกต้อง');ids.add(page.id);
  return {id:page.id,template:page.template,objects:page.objects.map(o=>{
   if(!idOK(o.id)||ids.has(o.id)||!['stroke','text','image','shape'].includes(o.type)||!num(o.x,-PAGE_W,PAGE_W*2)||!num(o.y,-PAGE_H,PAGE_H*2)||!num(o.w,1,PAGE_W*3)||!num(o.h,1,PAGE_H*3))throw Error('วัตถุบนกระดาษไม่ถูกต้อง');ids.add(o.id);
   const out={id:o.id,type:o.type,x:o.x,y:o.y,w:o.w,h:o.h};
   if(o.type==='stroke'){
    if(!['pen','highlight'].includes(o.tool)||!color(o.color)||!num(o.width,1,40)||!Array.isArray(o.points)||!o.points.length)throw Error('เส้นปากกาไม่ถูกต้อง');points+=o.points.length;if(points>120000)throw Error('ลายมือในโน้ตนี้เต็มแล้ว กรุณาสร้างโน้ตใหม่');
    out.tool=o.tool;out.color=o.color;out.width=o.width;out.points=o.points.map(p=>{if(!Array.isArray(p)||p.length!==3||!num(p[0],0,1)||!num(p[1],0,1)||!num(p[2],0,1))throw Error('จุดปากกาไม่ถูกต้อง');return [...p];});
   }else if(o.type==='shape'){
    if(!Object.hasOwn(shapes,o.kind)||!color(o.color)||!num(o.width,1,40))throw Error('รูปทรงไม่ถูกต้อง');
    Object.assign(out,{kind:o.kind,color:o.color,width:o.width,reverseX:o.reverseX===true,reverseY:o.reverseY===true});
   }else if(o.type==='text'){
    if(typeof o.text!=='string'||o.text.length>20000||!color(o.color)||!num(o.size,10,96))throw Error('ข้อความบนกระดาษไม่ถูกต้อง');Object.assign(out,{text:o.text,color:o.color,size:o.size,bold:o.bold===true});if(o.links?.length)out.links=validateLinks(o.links,o.text);
   }else {if(typeof o.imageId!=='string'||!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(o.imageId))throw Error('รูปภาพไม่ถูกต้อง');out.imageId=o.imageId;if(o.stretch===true)out.stretch=true;if(o.link)out.link=imageLink(o.link);}
   return out;
  })};
 })};
}
export function paperFor(note){
 if(note.paper)return validatePaper(note.paper);
 let seq=0;const stable=()=>('legacy-'+note.id.slice(0,60)+'-'+seq++).slice(0,90),makePage=()=>({id:stable(),template:'ruled',objects:[]});
 const pages=[makePage()];let page=pages[0],y=64,text='';
 const flush=()=>{if(!text)return;for(const line of text.split('\n')){
  // Conservative wrapping keeps all legacy text on pages; the original Delta is retained unchanged.
  for(let i=0;i<Math.max(1,line.length);i+=50){if(y+38>PAGE_H-64){page=makePage();pages.push(page);y=64;}page.objects.push({id:stable(),type:'text',x:64,y,w:PAGE_W-128,h:38,text:line.slice(i,i+50),size:23,color:'#172033',bold:false});y+=38;}
 }text='';};
 for(const op of note.delta?.ops||[]){if(typeof op.insert==='string')text+=op.insert;else if(op.insert?.studyImage){flush();if(y+400>PAGE_H-64){page=makePage();pages.push(page);y=64;}page.objects.push({id:stable(),type:'image',x:64,y,w:PAGE_W-128,h:400,imageId:op.insert.studyImage});y+=432;}}
 if(text.trim())flush();return validatePaper({version:1,pages});
}
export function strokeObject(samples,style){
 samples=samples.filter((p,i)=>!i||p[0]!==samples[i-1][0]||p[1]!==samples[i-1][1]);
 const xs=samples.map(p=>p[0]),ys=samples.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y);
 return {id:uid(),type:'stroke',x,y,w,h,...style,points:samples.map(p=>[Math.round((p[0]-x)/w*10000)/10000,Math.round((p[1]-y)/h*10000)/10000,Math.round(p[2]*100)/100])};
}
export function bounds(objects){if(!objects.length)return null;const x=Math.min(...objects.map(o=>o.x)),y=Math.min(...objects.map(o=>o.y));return {x,y,w:Math.max(...objects.map(o=>o.x+o.w))-x,h:Math.max(...objects.map(o=>o.y+o.h))-y};}
export function contains(p,b,pad=0){return p.x>=b.x-pad&&p.x<=b.x+b.w+pad&&p.y>=b.y-pad&&p.y<=b.y+b.h+pad;}
export function inPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function strokeHit(o,p,radius=12){
 const points=o.points.map(v=>({x:o.x+v[0]*o.w,y:o.y+v[1]*o.h}));
 for(let i=0;i<points.length;i++){const a=points[i],b=points[Math.max(0,i-1)],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=radius+o.width/2)return true;}return false;
}
// Keep recent page operations only. Refuse history replay across a remote edit to that page.
export function pageHistory(limit=40){let undo=[],redo=[];return {
 record(before,after){if(JSON.stringify(before)===JSON.stringify(after))return;undo.push({before:copy(before),after:copy(after)});while(undo.length>limit||(undo.length>1&&JSON.stringify(undo).length>4000000))undo.shift();redo=[];},
 step(current,back=true){const from=back?undo:redo,to=back?redo:undo,entry=from.at(-1);if(!entry)return null;const expected=back?entry.after:entry.before;if(JSON.stringify(current)!==JSON.stringify(expected)){undo=[];redo=[];throw Error('หน้านี้มีข้อมูลใหม่ จึงหยุดย้อนกลับเพื่อรักษางานจากอีกเครื่อง');}from.pop();to.push(entry);return copy(back?entry.before:entry.after);},
 get canUndo(){return !!undo.length;},get canRedo(){return !!redo.length;}
};}
export function mergePaper(base,local,remote){
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),bm=new Map(base.pages.map(p=>[p.id,p])),lm=new Map(local.pages.map(p=>[p.id,p])),rm=new Map(remote.pages.map(p=>[p.id,copy(p)]));
 for(const [id,b] of bm){
  const l=lm.get(id),r=rm.get(id);if(same(b,l))continue;
  if(!l){if(r&&!same(b,r))throw Error('หน้าที่ลบมีการแก้จากอีกเครื่อง กรุณาเก็บฉบับนี้ก่อนแล้วลองใหม่');rm.delete(id);continue;}
  if(!r)throw Error('หน้านี้ถูกลบจากอีกเครื่อง กรุณาสำรองงานที่กำลังทำ');
  if(l.template!==b.template){if(r.template!==b.template&&r.template!==l.template)throw Error('รูปแบบกระดาษมีข้อมูลชนกัน');r.template=l.template;}
  const bo=new Map(b.objects.map(o=>[o.id,o])),lo=new Map(l.objects.map(o=>[o.id,o])),ro=new Map(r.objects.map(o=>[o.id,o]));
  for(const [oid,before] of bo){const after=lo.get(oid),current=ro.get(oid);if(same(before,after))continue;if(!same(before,current)&&!same(after,current))throw Error('วัตถุนี้ถูกแก้พร้อมกันจากอีกเครื่อง กรุณาสำรองงานที่ค้างก่อน');if(after)ro.set(oid,copy(after));else ro.delete(oid);}
  for(const [oid,o] of lo)if(!bo.has(oid))ro.set(oid,copy(o));r.objects=[...ro.values()];
 }
 for(const [id,p] of lm)if(!bm.has(id))rm.set(id,copy(p));
 return validatePaper({version:1,pages:[...rm.values()]});
}
