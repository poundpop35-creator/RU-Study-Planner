import {planRestore,confirmRestore} from './notebook-backup.js?v=20261124-groups';
import {paperPage} from './paper-view.js?v=20261124-single-toolbar';
import {mountPaper,refreshPaper} from './paper-editor.js?v=20261124-single-toolbar';
import {openLegacy} from './paper-legacy.js?v=20261118-edit2';
export {refreshPaper};
import {confirmNoteDelete} from './note-delete-dialog.js?v=20261118-edit2';
import {courses} from './data.js?v=20261027c';
import {lessons} from './lessons.js?v=20261027c';
import {escapeHTML as e,isEnrolled} from './core.js?v=20261027c';
import {newNote,findNotes,legacyNotes,referencedImages,NOTE_SOURCES,noteSource} from './notebook-core.js?v=20261124-groups';
import {materialFor,isCourseCode} from './course-materials.js?v=20261124-documents20';
import {openSharedCourseMaterials,courseMaterialCount,courseMaterialList} from './course-materials-ui.js?v=20261124-documents20';
import {openNoteFile} from './file-viewer.js?v=20261124-documents20';
import {storedDocuments,documentData,attachmentBlob} from './note-files.js?v=20261124-documents20';
let quickInkId=null;
let query='',course='',source='',archived=false,reviewing=false,reviewIndex=0,revealed=false,unmount=()=>{};
const stamps=x=>new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(x));
const sourceChoices=value=>Object.entries(NOTE_SOURCES).map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join('');
function heading(title,detail){return `<div class="page-heading"><div><div class="eyebrow">MY LEARNING NOTEBOOK</div><h1>${title}</h1><p>${detail}</p></div></div>`;}
function status(space){const i=space.info();return `<div class="notebook-status"><span class="status-dot"></span><span data-sync-status>${e(i.status)}</span><a href="#account">พื้นที่กลางเดียวกันทุกเครื่อง →</a></div>`;}
export function notebookPage(space,progress){
 const book=space.notebook(),items=findNotes(book,{query,course,source,archived});
 if(reviewing){const deck=findNotes(book,{course,source}).filter(n=>n.question.trim()&&n.answer.trim());const n=deck[reviewIndex%deck.length];return `${heading('ทบทวนจากโน้ตของฉัน','นึกคำตอบก่อนเปิดดู ใช้สิ่งที่คุณจดมาเตรียมสอบ')}<button class="button secondary" data-action="nb-review-close">← กลับสมุดจด</button>${n?`<section class="panel note-recall"><span class="badge">${e(n.course||'ทั่วไป')} · ${reviewIndex%deck.length+1}/${deck.length}</span><h2>${e(n.question)}</h2>${revealed?`<div class="recall-answer">${e(n.answer)}</div><button class="button primary" data-action="nb-review-next">ข้อถัดไป →</button>`:'<button class="button primary" data-action="nb-reveal">เปิดคำตอบ</button>'}<a href="#note/${n.id}" class="text-link">เปิดโน้ตต้นทาง →</a></section>`:'<div class="panel empty"><h2>ยังไม่มีคำถามจากโน้ต</h2><p>เปิดหน้าโน้ต แล้วเติม “คำถามทวนความจำ” กับ “คำตอบของฉัน” ก่อน</p></div>'}`;}
 const old=source&&source!=='prep'?[]:lessons.filter(l=>progress.notes[l.id]?.trim()&&(!course||l.course===course));
 return `${heading('สมุดจดของฉัน','พิมพ์หรือเขียนด้วยปากกา ไฮไลต์ เก็บรูป และแยกโน้ตตามที่มา')}<div class="notebook-actions"><button class="button primary" data-action="nb-new">＋ สร้างหน้าโน้ต</button><button class="button secondary" data-action="nb-review">ทบทวนจากโน้ต</button><button class="button secondary" data-action="nb-export">ส่งออกโน้ตพร้อมรูป</button><label class="button secondary">นำเข้าสมุดจด<input hidden type="file" id="notebook-import" accept=".json,application/json"></label></div>${course?'<button type="button" class="button secondary" data-action="nb-course-materials" data-course="'+e(course)+'">📚 เอกสารหลัก '+e(course)+' ('+courseMaterialCount(book,course)+')</button>':''}${status(space)}<div class="notebook-filters"><label class="field">ค้นหาโน้ต<input id="notebook-search" type="search" placeholder="หัวข้อ เนื้อหา หรือแท็ก…" value="${e(query)}"></label><label class="field">รายวิชา<select id="notebook-course"><option value="">ทุกวิชา</option>${courses.filter(c=>isEnrolled(progress,c)||book.notes.some(n=>n.course===c.id)).map(c=>`<option ${course===c.id?'selected':''}>${c.id}</option>`).join('')}</select></label><label class="field">ประเภทโน้ต<select id="notebook-source"><option value="">ทุกประเภท</option>${sourceChoices(source)}</select></label><button class="button ${archived?'primary':'secondary'}" data-action="nb-archive-filter">${archived?'ดูโน้ตที่เก็บเข้าคลังอยู่':'เปิดคลังโน้ต'}</button></div><div id="notebook-results">${noteCards(items)}</div>${old.length?`<details class="panel legacy-notes"><summary>บันทึกข้อความเดิมจากการติว (${old.length})</summary><p>ต้นฉบับยังอยู่ครบ สามารถคัดลอกเป็นหน้าโน้ตที่จัดสีและแทรกรูปได้</p><button class="button secondary" data-action="nb-import-legacy">คัดลอกบันทึกเดิมเข้าสมุดจด</button>${old.map(l=>`<article><h3>${l.course} · ${e(l.title)}</h3><p class="note-preview">${e(progress.notes[l.id])}</p><a href="#lesson/${l.id}">เปิดบทติว →</a></article>`).join('')}</details>`:''}`;
}
const bangkokDay=(value=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const studyDateLabel=value=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium'}).format(new Date(value));
export function setReplayDate(note,day,today=bangkokDay()){
 if(day===''){delete note.replayStudiedAt;return;}
 const parsed=new Date(day+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==day||day>today)throw Error('เลือกวันที่ติวจริง ไม่เกินวันนี้');
 note.replayStudiedAt=day;
}
async function chooseReplayDate(note){
 const d=document.createElement('dialog');d.className='paper-sheet-dialog';d.setAttribute('aria-label','วันที่ติวย้อนหลัง');
 d.innerHTML=`<form method="dialog"><h2>ติวย้อนหลังวันไหน?</h2><p>${e(note.title)}</p><label>วันที่ติวจริง<input name="day" type="date" required value="${bangkokDay(note.replayStudiedAt||new Date())}" max="${bangkokDay()}"></label><div class="paper-dialog-actions"><button value="save">บันทึกวันที่</button><button value="cancel" formnovalidate>ยกเลิก</button></div>${note.replayStudiedAt?'<button value="clear" formnovalidate>เอาเครื่องหมายติวแล้วออก</button>':''}</form>`;
 document.body.append(d);const closed=new Promise(resolve=>d.onclose=resolve);d.showModal();await closed;
 const day=d.returnValue==='save'?d.querySelector('input').value:d.returnValue==='clear'?'':null;d.remove();return day;
}
export function noteCards(items){return items.length?`<div class="notebook-grid">${items.map(n=>`<article class="note-card"><div class="note-card-top">${n.course?`<span class="badge">${e(n.course)}</span>`:''}${n.pinned?'<span>★ ปักหมุด</span>':''}</div><span class="note-origin ${noteSource(n)}">${NOTE_SOURCES[noteSource(n)]}</span><h2><a class="note-card-link" title="${e(n.title)}" href="#note/${n.id}">${e(n.title)}</a></h2><small>แก้ไข ${stamps(n.updatedAt)} · ${n.paper?n.paper.pages.length+' หน้า · ':''}${referencedImages({notes:[n]}).length} รูป</small><button type="button" class="note-card-edit ${n.replayStudiedAt?'replay-done':'replay-pending'}" style="min-height:44px" aria-haspopup="dialog" data-action="nb-replay-studied" data-id="${n.id}">${n.replayStudiedAt?'☑ ติวย้อนหลังแล้ว · '+studyDateLabel(n.replayStudiedAt):'☐ ยังไม่ติวย้อนหลัง'}</button><button class="note-card-edit" data-action="nb-classify" data-id="${n.id}" aria-label="เปลี่ยนประเภท ${e(n.title)}">แก้วิชา / ครั้งที่</button></article>`).join('')}</div>`:'<section class="panel empty"><h2>พื้นที่สำหรับความเข้าใจของคุณ</h2><p>สร้างโน้ตจากคำบรรยาย ตำรา หรือเรื่องที่ยังสงสัยได้เลย</p><button class="button primary" data-action="nb-new">สร้างโน้ตหน้าแรก</button></section>';}
export function destroyEditor(){unmount();unmount=()=>{};}
function download(name,data,type='application/json'){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function exportBook(space){const notebook=structuredClone(space.notebook()),images={};for(const id of referencedImages(notebook)){const b=await space.image(id);images[id]=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b);});}const documents={};for(const file of storedDocuments(notebook))documents[file.id]=await documentData(await attachmentBlob(file,space));download('ru-study-notebook-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({format:'ru-study-notebook',version:2,notebook,images,documents}));}
export function noteCourseChoices(progress,enrolled){
 return courses.filter(c=>isEnrolled(progress,c)===enrolled);
}
export function sessionDetails(id,session){
 const c=courses.find(c=>c.id===id);
 if(!c||!Number.isSafeInteger(session)||session<1||session>999)return null;
 return {course:c.id,session,title:c.id+' '+c.title+' · ครั้งที่ '+session};
}
async function noteDetails(chosenCourse,chosenSource,note,progress,book){
 const d=document.createElement('dialog');d.className='paper-sheet-dialog';
 const initial=courses.find(c=>c.id===chosenCourse),enrolled=!initial||isEnrolled(progress,initial);
 d.innerHTML=`<form method="dialog"><h2>${note?'แก้ไขรายละเอียดโน้ต':'สร้างโน้ต'}</h2><label>แสดงวิชา<select name="group"><option value="yes">ลงทะเบียนแล้ว</option><option value="no">ยังไม่ลงทะเบียน</option></select></label><label>วิชา<select required name="course"></select></label><label>ครั้งที่เรียน<input name="session" type="number" required min="1" max="999" step="1" inputmode="numeric"></label><output aria-live="polite"></output><label>ประเภทโน้ต<select name="source">${sourceChoices(chosenSource)}</select></label><div class="paper-dialog-actions"><button value="save">${note?'บันทึก':'สร้างโน้ต'}</button><button value="cancel" formnovalidate>ยกเลิก</button></div></form>`;
 const form=d.querySelector('form'),f=form.elements,preview=d.querySelector('output');
 f.group.value=enrolled?'yes':'no';
 function showTitle(){preview.textContent=sessionDetails(f.course.value,Number(f.session.value))?.title||'';}
 function suggest(){f.session.value=note?.session||Math.min(999,1+Math.max(0,...book.notes.filter(n=>n.course===f.course.value).map(n=>n.session||1)));showTitle();}
 function list(preselect){const choices=noteCourseChoices(progress,f.group.value==='yes');
 f.course.innerHTML='<option value="">เลือกวิชา</option>'+choices.map(c=>`<option value="${e(c.id)}">${e(c.id)} · ${e(c.title)}</option>`).join('');
 f.course.value=choices.some(c=>c.id===preselect)?preselect:'';suggest();}
 list(chosenCourse);f.group.onchange=()=>list('');f.course.onchange=suggest;f.session.oninput=showTitle;
 document.body.append(d);const closed=new Promise(resolve=>d.onclose=resolve);d.showModal();await closed;
 const details=sessionDetails(f.course.value,Number(f.session.value));d.remove();
 return d.returnValue==='save'&&details?{...details,source:f.source.value}:null;
}
export async function notebookAction(action,data,space,progress,render,toast){
 if(!space.info().canEdit){toast('กำลังเชื่อมต่อสมุดจดกับ Supabase กรุณาลองอีกครั้ง');return;}
 const book=['nb-pin','nb-archive','nb-import-legacy'].includes(action)?structuredClone(space.notebook()):space.notebook(),n=book.notes.find(x=>x.id===data.id);
 try{
  if(action==='nb-filter-course'){
   if(!isCourseCode(data.course))throw Error('รหัสวิชาไม่ถูกต้อง');
   course=data.course;source='';archived=false;reviewing=false;
   if(location.hash==='#notes')render(true);else location.hash='#notes';
   return;
  }
  if(action==='nb-course-open-file'){
   const file=materialFor(book,data.course).files.find(f=>f.id===data.fileId);
   if(!file)throw Error('ไม่พบเอกสารที่เลือก');
   await openNoteFile(file,space);return;
  }
  if(action==='nb-course-materials'){
   await openSharedCourseMaterials(space,data.course,()=>render(true),toast);return;
  }
  if(action==='nb-save'){
   const buttons=[...document.querySelectorAll('[data-action="nb-save"]')];
   buttons.forEach(b=>{b.disabled=true;b.textContent='กำลังบันทึก…';});
   try{
    await space.flush();
    const info=space.info();
    const saved=info.phase==='saved'&&!info.dirty&&!info.busy&&!info.conflict&&!info.locked;
    const text=saved?'บันทึกงานใน Supabase แล้ว':info.status;
    const status=document.getElementById('rich-note-status');
    if(status){status.textContent=text;status.classList.toggle('error',!saved);}
    toast(text);
   }finally{buttons.forEach(b=>{b.disabled=false;b.textContent='บันทึกงาน';});}
   return;
  }
  if(action==='nb-replay-studied'&&n){
   const day=await chooseReplayDate(n);if(day===null)return;
   const next=structuredClone(space.notebook()),note=next.notes.find(item=>item.id===n.id);
   if(!note||note.replayStudiedAt!==n.replayStudiedAt)throw Error('โน้ตเปลี่ยนแล้ว กรุณาเลือกวันที่อีกครั้ง');
   setReplayDate(note,day);
   space.saveNotebook(next);render(true);await space.flush();return;
  }
  if(action==='nb-classify'&&n){
   const details=await noteDetails(n.course,noteSource(n),n,progress,book);
   if(!details)return;
   const latest=structuredClone(space.notebook()),target=latest.notes.find(item=>item.id===n.id);
   if(!target)throw Error('ไม่พบโน้ตนี้แล้ว');
   Object.assign(target,details,{updatedAt:new Date().toISOString()});
   space.saveNotebook(latest);render(true);await space.flush();toast('บันทึกประเภทและวิชาแล้ว');return;
  }
  if(action==='nb-new'||action==='nb-from-lesson'){const l=lessons.find(x=>x.id===data.lesson);const chosenCourse=courses.some(c=>c.id===data.course)?data.course:course;const details=await noteDetails(l?.course||chosenCourse,l?'prep':data.source||source||'classroom',null,progress,book);
   if(!details)return;
   const note=newNote({course:l?.course||chosenCourse,lesson:l?.course===details.course?l.id:'',source:l?'prep':data.source||source||'general',title:l?.title||'โน้ตใหม่',...details});const latest=structuredClone(space.notebook());latest.notes.push(note);space.saveNotebook(latest);if(action==='nb-new'&&data.source==='general')quickInkId=note.id;location.hash='#note/'+note.id;}
  if(action==='nb-delete'&&n){
   if(!await confirmNoteDelete(n.title))return;
   toast('กำลังลบโน้ต…');
   await space.deleteNote(n.id);
   if(location.hash==='#notes')render(true);else location.hash='#notes';
   toast('ลบโน้ตจากพื้นที่กลางแล้ว');return;
  }
  if(action==='nb-pin'&&n){n.pinned=!n.pinned;space.saveNotebook(book);render(true);}
  if(action==='nb-archive'&&n){n.archived=!n.archived;space.saveNotebook(book);location.hash='#notes';}
  if(action==='nb-archive-filter'){archived=!archived;render(true);}
  if(action==='nb-review'){reviewing=true;reviewIndex=0;revealed=false;if(location.hash==='#notes')render();else location.hash='#notes';}
  if(action==='nb-review-close'){reviewing=false;render();}
  if(action==='nb-review-next'){reviewIndex++;revealed=false;render(true);}
  if(action==='nb-reveal'){revealed=true;render(true);}
  if(action==='nb-print'){
    const a4=document.querySelector('.paper-app [data-paper="print-pages"]');
    if(a4)a4.click();else window.print();
   }
  if(action==='nb-export'){toast('กำลังรวมโน้ต รูปภาพ และเอกสาร…');await exportBook(space);toast('ส่งออกโน้ต รูป และเอกสารครบแล้ว');}
  if(action==='nb-import-legacy'){const existing=new Set(book.notes.map(x=>x.id));book.notes.push(...legacyNotes(progress,lessons).filter(x=>!existing.has(x.id)).map(x=>({...x,...sessionDetails(x.course,1)})));space.saveNotebook(book);render();toast('คัดลอกแล้ว บันทึกเดิมยังอยู่ครบ');}
 }catch(err){toast(err.message||'ดำเนินการไม่สำเร็จ');}
}
export function notebookSearch(space,value){query=value;document.getElementById('notebook-results').innerHTML=noteCards(findNotes(space.notebook(),{query,course,source,archived}));}
export function notebookFilter(value,key='course'){if(key==='source'){if(value===''||Object.hasOwn(NOTE_SOURCES,value))source=value;}else course=value;}
export async function importNotebook(file,space){if(file.size>100*1024*1024)throw Error('ไฟล์สำรองเกิน 100 MB');const data=JSON.parse(await file.text());const baseline=JSON.stringify(space.notebook()),plan=planRestore(data,space.notebook());
 if(!await confirmRestore(plan)||(!plan.added&&!plan.addedMaterials))return;
 await space.restoreNotebook(plan,baseline,data.images||{},data.documents||{});}

export function notePage(space,id){
 const n=space.notebook().notes.find(x=>x.id===id);
 if(!n)return '<section class="panel"><h1>ไม่พบหน้าโน้ต</h1><a href="#notes">กลับสมุดจด</a></section>';
 const info=space.info();
 if(!info.canEdit)return '<section class="panel paper-load-message" role="status"><h1>ยังเปิดสมุดจดไม่ได้</h1><p>'+e(info.status||'กำลังเชื่อมต่อ Supabase…')+'</p><p>ยังไม่พบการเชื่อมต่อที่พร้อมใช้งาน ไม่ควรเขียนทับหน้าว่าง</p><div class="button-row"><a class="button secondary" href="#account">ตรวจข้อมูลและการซิงก์</a><a class="button secondary" href="#notes">กลับรายการโน้ต</a></div></section>';
 return paperPage(space,n);
}
export function mountEditor(space,id){
 destroyEditor();const startInk=quickInkId===id;quickInkId=null;
 try{unmount=mountPaper(space,id,{startInk,onLegacy:()=>openLegacy(space,id)});}
 catch(err){
  const root=document.querySelector('.paper-app');
  if(root){
   const panel=document.createElement('div');panel.className='paper-open-error';
   panel.setAttribute('role','alert');
   const heading=document.createElement('strong');heading.textContent='หน้าสมุดจดแสดงผลไม่สำเร็จ แต่ยังไม่ได้ลบข้อมูล';
   const detail=document.createElement('p');detail.textContent='ข้อผิดพลาด: '+(err?.message||String(err));
   const link=document.createElement('a');link.href='#account';link.textContent='ตรวจสถานะการซิงก์';
   panel.append(heading,detail,link);
   (root.querySelector('.paper-workspace')||root).prepend(panel);
  }
  unmount=()=>{};
  console.error('Notebook editor mount failed; data unchanged',err);
 }
}
