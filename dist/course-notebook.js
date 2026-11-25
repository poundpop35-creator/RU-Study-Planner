import {PAGE_W,PAGE_H,MAX_CANVAS_HEIGHT,paperFor,validatePaper} from './paper-core.js?v=20261124-tips';
import {newNote,noteSession,validateNotebook} from './notebook-core.js?v=20261125-course-sort';
import {validateFiles} from './note-files.js?v=20261124-documents20';
const clone=v=>JSON.parse(JSON.stringify(v));
const prefix='lesson-section-';
const sourcePrefix=prefix+'source-';
const sourceHeading=id=>{const key=sourcePrefix+id;if(key.length>90)throw Error('รหัสโน้ตเดิมยาวเกินขีดจำกัด กรุณาเก็บเป็นโน้ตแยก');return key;};
export const isCourseNotebook=n=>/^coursebook-POL\d{4}-/.test(n?.id||'');
export function sessionSections(paper){
 if(paper?.version!==2)return [];
 return paper.pages[0].objects.filter(o=>o.type==='text'&&o.id.startsWith(prefix)).slice().sort((a,b)=>a.y-b.y||a.id.localeCompare(b.id));
}
function margin(o){return o.type==='stroke'?o.width:o.type==='shape'?Math.max(o.width||0,o.angle?Math.hypot(o.w,o.h)/2:0):o.border?o.border.width+4:0;}
export function contentBottom(objects){return objects.reduce((y,o)=>Math.max(y,o.y+o.h+margin(o)),0);}
function heading(label,y,id=crypto.randomUUID()){
 const text=String(label).trim().slice(0,160);
 if(!text)throw Error('กรุณาระบุหัวข้อครั้งเรียน');
 return {id:prefix+id,type:'text',x:48,y,w:804,h:96,text,size:26,color:'#3155a5',bold:true,border:{color:'#a4bce8',width:2,style:'solid'}};
}
function finalize(paper){
 const p=paper.pages[0],end=contentBottom(p.objects)+48;
 if(end>MAX_CANVAS_HEIGHT)throw Error('สมุดยาวถึงขีดจำกัด กรุณาแยกบางครั้งเรียน');
 p.height=Math.max(PAGE_H,p.height||0,Math.ceil(end/PAGE_H)*PAGE_H);
 return validatePaper(paper);
}
export function appendSession(paper,label,sourceId){
 if(paper?.version!==2)throw Error('กรุณาใช้กระดาษต่อเนื่อง');
 const next=clone(paper),p=next.pages[0],section=heading(label,Math.max(48,contentBottom(p.objects)+48),sourceId?'source-'+sourceId:undefined);
 if(sourceId)sourceHeading(sourceId);
 p.objects.push(section);
 return {paper:finalize(next),sectionId:section.id};
}
export function combineCourseNotes(book,course,selectedIds){
 if(!/^POL\d{4}$/.test(course)||!Array.isArray(selectedIds)||new Set(selectedIds).size!==selectedIds.length)throw Error('รายการโน้ตไม่ถูกต้อง');
 if(book.notes.some(n=>isCourseNotebook(n)&&n.course===course&&!n.archived))throw Error('มีสมุดรวมวิชานี้แล้ว ให้เปิดสมุดเดิม');
 const byId=new Map(book.notes.map(n=>[n.id,n]));
 const notes=selectedIds.map(id=>{
  const n=byId.get(id);
  if(!n||n.course!==course||n.archived||isCourseNotebook(n))throw Error('โน้ตต้นฉบับเปลี่ยนแล้ว');
  return n;
 }).sort((a,b)=>(noteSession(a)||1000)-(noteSession(b)||1000)||a.id.localeCompare(b.id));
 const id='coursebook-'+course+'-'+crypto.randomUUID();
 const note=newNote({id,course,source:'classroom',title:course+' · สมุดจดต่อเนื่อง'});
 let paper={version:2,pages:[{id:crypto.randomUUID(),template:'ruled',height:PAGE_H,objects:[]}]};
 const files=new Map();
 for(const n of notes){
  const session=noteSession(n),label=(session?'ครั้งที่ '+session:'ไม่ระบุครั้ง')+' · '+n.title;
  paper=appendSession(paper,label,n.id).paper;
  mergeSourceFiles(files,n);
  paper.pages[0].objects.push(...sourceObjects(n,contentBottom(paper.pages[0].objects)+32));
  paper=finalize(paper);
 }
 if(!notes.length)paper=appendSession(paper,'ครั้งที่ 1').paper;
 note.paper=paper;
 if(files.size)note.files=validateFiles([...files.values()]);
 const next=clone(book);next.notes.push(note);
 return {book:validateNotebook(next),id};
}

export function courseBookFor(book,course){
 return book.notes.find(n=>isCourseNotebook(n)&&n.course===course&&!n.archived);
}
export function linkedSourceIds(note){
 return sessionSections(note?.paper).filter(o=>o.id.startsWith(sourcePrefix)).map(o=>o.id.slice(sourcePrefix.length));
}
// Old URLs and new section URLs both resolve to the very same saved paper.
export function resolveCourseRoute(book,route){
 const [id,sectionId,...rest]=String(route||'').split('~');
 const source=book.notes.find(n=>n.id===id);
 if(!source||rest.length)return null;
 if(sectionId){
  return isCourseNotebook(source)&&sessionSections(source.paper).some(o=>o.id===sectionId)?{id,sectionId}:null;
 }
 const linked=book.notes.filter(n=>isCourseNotebook(n)&&linkedSourceIds(n).includes(id));
 if(linked.length>1)throw Error('พบการเชื่อมโน้ตซ้ำ กรุณาตรวจสอบสมุดรวมก่อนเปิด');
 if(linked.length===1)return {id:linked[0].id,sectionId:sourceHeading(id),sourceId:id};
 return {id};
}
export function isLinkedSource(book,note){
 return !!note&&!isCourseNotebook(note)&&book.notes.some(n=>isCourseNotebook(n)&&linkedSourceIds(n).includes(note.id));
}
export const protectsNote=(book,note)=>!!note&&(isLinkedSource(book,note)||isCourseNotebook(note)&&linkedSourceIds(note).length>0);
export function sectionNumber(o){return Number(String(o.text||'').match(/^ครั้งที่\s*(\d{1,3})(?!\d)/)?.[1]||0);}
export function sectionForSession(note,session){
 const matches=sessionSections(note.paper).filter(o=>sectionNumber(o)===session);
 if(matches.length>1)throw Error('มีหัวข้อครั้งเรียนซ้ำ กรุณาเลือกจากสารบัญในสมุดรวม');
 return matches[0]||null;
}
// Explicit old-copy migration: only the heading's identity changes. Source data
// is retained as a recovery snapshot, even when the two copies have diverged.
export function linkOldCourseNotes(book,course,pairs){
 const next=clone(book),target=courseBookFor(next,course);
 if(!target||!Array.isArray(pairs)||!pairs.length)throw Error('ไม่พบสมุดรวมหรือรายการเชื่อม');
 const headings=sessionSections(target.paper),used=new Set(),sources=new Set();
 for(const {sourceId,sectionId} of pairs){
  const source=next.notes.find(n=>n.id===sourceId),section=headings.find(o=>o.id===sectionId);
  if(!source||source.course!==course||source.archived||isCourseNotebook(source)||isLinkedSource(next,source)||!section||section.id.startsWith(sourcePrefix)||used.has(sectionId)||sources.has(sourceId))throw Error('รายการเชื่อมไม่ถูกต้องหรือถูกเชื่อมแล้ว');
  used.add(sectionId);sources.add(sourceId);
 }
 for(const {sourceId,sectionId} of pairs)target.paper.pages[0].objects.find(o=>o.id===sectionId).id=sourceHeading(sourceId);
 target.updatedAt=new Date().toISOString();
 return validateNotebook(next);
}
export function assertLinkedHeadings(before,after){
 const ids=linkedSourceIds({paper:before});
 if(ids.length&&ids.some(id=>!linkedSourceIds({paper:after}).includes(id)))throw Error('หัวข้อที่เชื่อมโน้ตเดิมต้องคงอยู่ เพื่อไม่ให้ลิงก์ครั้งเรียนเสีย');
}

function mergeSourceFiles(files,n){
 for(const f of n.files||[]){
  const prev=files.get(f.id);
  if(prev&&JSON.stringify(prev)!==JSON.stringify(f))throw Error('ไฟล์แนบใช้รหัสเดียวกันแต่ข้อมูลต่างกัน');
  files.set(f.id,clone(f));
 }
}
function sourceObjects(n,start){
 const objects=[],groups=new Map();let cursor=start;
 for(const old of paperFor(n).pages){
  if(!old.objects.length)continue;
  const top=Math.min(0,...old.objects.map(o=>o.y-margin(o))),bottom=contentBottom(old.objects);
  const left=Math.min(0,...old.objects.map(o=>o.x));
  for(const o of old.objects){
   const out={...clone(o),id:crypto.randomUUID(),x:o.x-left,y:o.y+cursor-top};
   if(o.groupId){if(!groups.has(o.groupId))groups.set(o.groupId,crypto.randomUUID());out.groupId=groups.get(o.groupId);}
   objects.push(out);
  }
  cursor+=Math.max(0,bottom-top)+32;
 }
 return objects;
}
const sourceLabel=n=>((noteSession(n)?'ครั้งที่ '+noteSession(n):'ไม่ระบุครั้ง')+' · '+n.title).slice(0,160);
export function courseSourceNotes(book,course){
 return book.notes.filter(n=>n.course===course&&!n.archived&&!isCourseNotebook(n)).sort((a,b)=>(noteSession(a)||1000)-(noteSession(b)||1000)||a.id.localeCompare(b.id));
}
function stableObjects(objects){
 const groups=new Map();
 return JSON.stringify(objects.map(o=>{
  const v=clone(o);delete v.id;
  if(v.groupId){if(!groups.has(v.groupId))groups.set(v.groupId,groups.size+1);v.groupId=groups.get(v.groupId);}
  return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)));
 }));
}
function sameSourceSection(paper,section,n){
 const headings=sessionSections(paper),i=headings.findIndex(h=>h.id===section.id);
 const end=headings[i+1]?.y??Infinity;
 const actual=paper.pages[0].objects.filter(o=>o.id!==section.id&&o.y>=section.y&&o.y<end&&!o.id.startsWith(prefix));
 const expected=sourceObjects(n,contentBottom([section])+32);
 return stableObjects(actual)===stableObjects(expected);
}
// One click includes every active note. Identical legacy copies are linked,
// divergent copies are never discarded: keep the original section visibly
// labelled and append a linked copy of the independent note.
export function openAllCourseNotes(book,course){
 if(!/^POL\d{4}$/.test(course))throw Error('รหัสวิชาไม่ถูกต้อง');
 const sources=courseSourceNotes(book,course),existing=courseBookFor(book,course);
 if(!existing){const result=combineCourseNotes(book,course,sources.map(n=>n.id));return {...result,changed:true,added:sources.length,preserved:0};}
 const missing=sources.filter(n=>!isLinkedSource(book,n));
 if(!missing.length)return {book,id:existing.id,changed:false,added:0,preserved:0};
 const next=clone(book),target=courseBookFor(next,course),files=new Map((target.files||[]).map(f=>[f.id,clone(f)]));
 let preserved=0,added=0;
 for(const n of missing){
  mergeSourceFiles(files,n);
  const label=sourceLabel(n),headings=sessionSections(target.paper);
  const candidates=headings.filter(s=>!s.id.startsWith(sourcePrefix)&&s.text===label);
  const identical=candidates.filter(s=>sameSourceSection(target.paper,s,n));
  if(identical.length===1){
   target.paper.pages[0].objects.find(o=>o.id===identical[0].id).id=sourceHeading(n.id);
   continue;
  }
  // A changed old copy is kept in the main sheet, not overwritten.
  if(candidates.length===1){
   const old=target.paper.pages[0].objects.find(o=>o.id===candidates[0].id);
   const labelPrefix='ฉบับสมุดรวมก่อนเชื่อม · ';
   if(old.text.length+labelPrefix.length<=20000){old.text=labelPrefix+old.text;for(const key of ['marks','links'])if(old[key])old[key]=old[key].map(m=>({...m,start:m.start+labelPrefix.length,end:m.end+labelPrefix.length}));}
   preserved++;
  }
  target.paper=appendSession(target.paper,label,n.id).paper;
  target.paper.pages[0].objects.push(...sourceObjects(n,contentBottom(target.paper.pages[0].objects)+32));
  target.paper=finalize(target.paper);added++;
 }
 if(files.size)target.files=validateFiles([...files.values()]);
 target.updatedAt=new Date().toISOString();
 return {book:validateNotebook(next),id:target.id,changed:true,added,preserved};
}
export function looseCourseSections(book,course){
 const combined=courseBookFor(book,course);
 if(!combined)return [];
 return sessionSections(combined.paper).filter(s=>!s.id.startsWith(sourcePrefix)&&!s.text.startsWith('ฉบับสมุดรวมก่อนเชื่อม ·'));
}
