import {validatePaper} from './paper-core.js?v=20261124-groups';
import {validateFiles,storedDocuments} from './note-files.js?v=20261124-documents20';
import {validateCourseMaterials} from './course-materials.js?v=20261124-documents20';
// Store a small, validated Delta rather than trusting saved HTML.
export const PALETTE=['#172033','#1d4ed8','#047857','#b91c1c','#7e22ce','#c2410c'];
export const HIGHLIGHTS=['#fef08a','#bbf7d0','#bfdbfe','#fbcfe8','#fed7aa'];
export const NOTE_SOURCES={general:'บันทึกทั่วไป',prep:'ติวก่อนเรียน',classroom:'จดจากห้องเรียน'};
export const noteSource=n=>Object.hasOwn(NOTE_SOURCES,n.source)?n.source:n.lesson?'prep':'general';
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
export const imageId=x=>typeof x==='string'&&/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(x);
const idOK=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(x);
export function cleanDelta(d){
 if(!plain(d)||!Array.isArray(d.ops)||d.ops.length>20000)throw Error('รูปแบบโน้ตไม่ถูกต้อง');
 const ops=[];let chars=0;
 for(const op of d.ops){
  if(!plain(op))continue;
  let insert;
  if(typeof op.insert==='string'){insert=op.insert;chars+=insert.length;}
  else if(imageId(op.insert?.studyImage))insert={studyImage:op.insert.studyImage};
  else continue;
  if(chars>200000)throw Error('โน้ตยาวเกิน 200,000 ตัวอักษร กรุณาแยกเป็นหลายหน้า');
  const a=op.attributes||{},attributes={};
  for(const k of ['bold','italic','underline','strike','blockquote'])if(a[k]===true)attributes[k]=true;
  if([1,2,3].includes(a.header))attributes.header=a.header;
  if(['ordered','bullet','checked','unchecked'].includes(a.list))attributes.list=a.list;
  if(['center','right','justify'].includes(a.align))attributes.align=a.align;
  if(PALETTE.includes(a.color))attributes.color=a.color;
  if(HIGHLIGHTS.includes(a.background))attributes.background=a.background;
  if(typeof a.link==='string')try{const u=new URL(a.link);if(['https:','http:'].includes(u.protocol))attributes.link=u.href;}catch{}
  ops.push(Object.keys(attributes).length?{insert,attributes}:{insert});
 }
 if(!ops.length||typeof ops.at(-1).insert!=='string'||!ops.at(-1).insert.endsWith('\n'))ops.push({insert:'\n'});
 return {ops};
}
export function deltaText(d){return d.ops.map(o=>typeof o.insert==='string'?o.insert:'[รูปภาพ]').join('');}
export const noteText=n=>n.paper?n.paper.pages.flatMap(p=>p.objects.flatMap(o=>o.type==='text'?[o.text]:o.type==='table'?o.cells.flat():[])).join('\n'):deltaText(n.delta);
export function referencedImages(notebook){return [...new Set(notebook.notes.flatMap(n=>[...n.delta.ops.map(o=>o.insert?.studyImage),...(n.paper?.pages||[]).flatMap(p=>p.objects.map(o=>o.imageId))]).filter(imageId))];}
export function freshNotebook(){return {version:1,notes:[]};}
export function validateNotebook(v){
 if(!plain(v)||![1,2,3,4,5,6,7,8].includes(v.version)||!Array.isArray(v.notes)||v.notes.length>500)throw Error('สมุดจดต้องเป็นรุ่น 1–8 และมีไม่เกิน 500 โน้ต');
 // Version 2 makes old clients reject paper data before they can silently drop it on save.
 const ids=new Set();const hasMaterials=v.version===6||v.courseMaterials!==undefined;return {version:v.version===8||v.notes.some(n=>n?.paper?.pages?.some(p=>p.objects?.some(o=>o.groupId)))?8:v.version===7||storedDocuments(v).length?7:hasMaterials?6:v.version===5||v.notes.some(n=>n?.paper?.pages?.some(p=>p.objects?.some(o=>o.links?.length)))?5:v.version===4||v.notes.some(n=>n?.paper?.pages?.some(p=>p.objects?.some(o=>o.type==='image'&&o.link)))?4:v.version===3||v.notes.some(n=>n?.files?.length)?3:v.version===2||v.notes.some(n=>n?.paper)?2:1,...(hasMaterials?{courseMaterials:validateCourseMaterials(v.courseMaterials||{})}:{}),notes:v.notes.map(n=>{
  if(!plain(n)||!idOK(n.id)||ids.has(n.id))throw Error('รหัสหน้าโน้ตไม่ถูกต้อง');ids.add(n.id);
  return {...(Number.isSafeInteger(n.session)&&n.session>0&&n.session<=999?{session:n.session}:{}),...(typeof n.replayStudiedAt==='string'&&Number.isFinite(Date.parse(n.replayStudiedAt))?{replayStudiedAt:/^\d{4}-\d{2}-\d{2}$/.test(n.replayStudiedAt)?n.replayStudiedAt:new Date(n.replayStudiedAt).toISOString()}:{}),...(n.files?{files:validateFiles(n.files)}:{}),...(n.paper?{paper:validatePaper(n.paper)}:{}),id:n.id,title:String(n.title||'โน้ตใหม่').slice(0,160),course:/^POL\d{4}$/.test(n.course)?n.course:'',lesson:/^POL\d{4}-\d+$/.test(n.lesson)?n.lesson:'',source:noteSource(n),tags:String(n.tags||'').slice(0,250),delta:cleanDelta(n.delta),pinned:n.pinned===true,archived:n.archived===true,updatedAt:typeof n.updatedAt==='string'&&Number.isFinite(Date.parse(n.updatedAt))?n.updatedAt:new Date(0).toISOString(),question:String(n.question||'').slice(0,4000),answer:String(n.answer||'').slice(0,10000)};
 })};
}
export function newNote({id=crypto.randomUUID(),course='',lesson='',source=lesson?'prep':'general',session,title='โน้ตใหม่',text=''}={}){return {id,title,course,lesson,...(session?{session}:{}),source:noteSource({source,lesson}),tags:'',delta:cleanDelta({ops:[{insert:text+'\n'}]}),pinned:false,archived:false,updatedAt:new Date().toISOString(),question:'',answer:''};}
export function findNotes(book,{query='',course='',source='',archived=false}={}){const q=query.trim().toLocaleLowerCase();return book.notes.filter(n=>n.archived===archived&&(!course||n.course===course)&&(!source||noteSource(n)===source)&&(!q||[n.title,n.tags,noteText(n),n.question,n.answer].join(' ').toLocaleLowerCase().includes(q))).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt));}
export function legacyNotes(progress,lessons){return Object.entries(progress.notes||{}).filter(([,text])=>text.trim()).map(([id,text])=>newNote({id:'legacy-'+id,lesson:id,course:id.split('-')[0],title:lessons.find(l=>l.id===id)?.title||id,text}));}
export function validateEnvelope(v,validateProgress){if(!plain(v)||v.version!==1)throw Error('ข้อมูลพื้นที่เรียนไม่ถูกต้อง');const result={version:1,progress:validateProgress(v.progress),notebook:validateNotebook(v.notebook)};if(v.migrations!==undefined){if(!Array.isArray(v.migrations)||v.migrations.length>2000||v.migrations.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x)))throw Error('ข้อมูลการย้ายพื้นที่ไม่ถูกต้อง');result.migrations=[...new Set(v.migrations)];}return result;}
