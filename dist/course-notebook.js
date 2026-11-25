import {PAGE_W,PAGE_H,MAX_CANVAS_HEIGHT,paperFor,validatePaper} from './paper-core.js?v=20261124-tips';
import {newNote,noteSession,validateNotebook} from './notebook-core.js?v=20261125-course-sort';
import {validateFiles} from './note-files.js?v=20261124-documents20';
const clone=v=>JSON.parse(JSON.stringify(v));
const prefix='lesson-section-';
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
export function appendSession(paper,label){
 if(paper?.version!==2)throw Error('กรุณาใช้กระดาษต่อเนื่อง');
 const next=clone(paper),p=next.pages[0],section=heading(label,Math.max(48,contentBottom(p.objects)+48));
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
  paper=appendSession(paper,label).paper;
  const p=paper.pages[0],groups=new Map();
  for(const f of n.files||[]){
   const prev=files.get(f.id);
   if(prev&&JSON.stringify(prev)!==JSON.stringify(f))throw Error('ไฟล์แนบใช้รหัสเดียวกันแต่ข้อมูลต่างกัน');
   files.set(f.id,clone(f));
  }
  const original=paperFor(n);
  let cursor=contentBottom(p.objects)+32;
  for(const old of original.pages){
   if(!old.objects.length)continue;
   const top=Math.min(0,...old.objects.map(o=>o.y-margin(o)));
   const bottom=contentBottom(old.objects);
   const left=Math.min(0,...old.objects.map(o=>o.x));
   for(const o of old.objects){
    const out={...clone(o),id:crypto.randomUUID(),x:o.x-left,y:o.y+cursor-top};
    if(o.groupId){if(!groups.has(o.groupId))groups.set(o.groupId,crypto.randomUUID());out.groupId=groups.get(o.groupId);}
    p.objects.push(out);
   }
   cursor+=Math.max(0,bottom-top)+32;
  }
  paper=finalize(paper);
 }
 if(!notes.length)paper=appendSession(paper,'ครั้งที่ 1').paper;
 note.paper=paper;
 if(files.size)note.files=validateFiles([...files.values()]);
 const next=clone(book);next.notes.push(note);
 return {book:validateNotebook(next),id};
}
