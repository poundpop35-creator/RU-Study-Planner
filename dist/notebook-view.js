import {paperPage} from './paper-view.js?v=geometry-20261119';
import {mountPaper,refreshPaper} from './paper-editor.js?v=geometry-20261119';
import {openLegacy} from './paper-legacy.js?v=20261118-edit2';
export {refreshPaper};
import {confirmNoteDelete} from './note-delete-dialog.js?v=20261118-edit2';
import {courses} from './data.js?v=20261027c';
import {lessons} from './lessons.js?v=20261027c';
import {escapeHTML as e} from './core.js?v=20261027c';
import {newNote,findNotes,legacyNotes,referencedImages,NOTE_SOURCES,noteSource} from './notebook-core.js?v=geometry-20261119';
let query='',course='',source='',archived=false,reviewing=false,reviewIndex=0,revealed=false,unmount=()=>{};
const stamps=x=>new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(x));
const sourceChoices=value=>Object.entries(NOTE_SOURCES).map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join('');
function heading(title,detail){return `<div class="page-heading"><div><div class="eyebrow">MY LEARNING NOTEBOOK</div><h1>${title}</h1><p>${detail}</p></div></div>`;}
function status(space){const i=space.info();return `<div class="notebook-status"><span class="status-dot"></span><span data-sync-status>${e(i.status)}</span><a href="#account">พื้นที่กลางเดียวกันทุกเครื่อง →</a></div>`;}
export function notebookPage(space,progress){
 const book=space.notebook(),items=findNotes(book,{query,course,source,archived});
 if(reviewing){const deck=findNotes(book,{course,source}).filter(n=>n.question.trim()&&n.answer.trim());const n=deck[reviewIndex%deck.length];return `${heading('ทบทวนจากโน้ตของฉัน','นึกคำตอบก่อนเปิดดู ใช้สิ่งที่คุณจดมาเตรียมสอบ')}<button class="button secondary" data-action="nb-review-close">← กลับสมุดจด</button>${n?`<section class="panel note-recall"><span class="badge">${e(n.course||'ทั่วไป')} · ${reviewIndex%deck.length+1}/${deck.length}</span><h2>${e(n.question)}</h2>${revealed?`<div class="recall-answer">${e(n.answer)}</div><button class="button primary" data-action="nb-review-next">ข้อถัดไป →</button>`:'<button class="button primary" data-action="nb-reveal">เปิดคำตอบ</button>'}<a href="#note/${n.id}" class="text-link">เปิดโน้ตต้นทาง →</a></section>`:'<div class="panel empty"><h2>ยังไม่มีคำถามจากโน้ต</h2><p>เปิดหน้าโน้ต แล้วเติม “คำถามทวนความจำ” กับ “คำตอบของฉัน” ก่อน</p></div>'}`;}
 const old=source&&source!=='prep'?[]:lessons.filter(l=>progress.notes[l.id]?.trim()&&(!course||l.course===course));
 return `${heading('สมุดจดของฉัน','พิมพ์หรือเขียนด้วยปากกา ไฮไลต์ เก็บรูป และแยกโน้ตตามที่มา')}<div class="notebook-actions"><button class="button primary" data-action="nb-new">＋ สร้างหน้าโน้ต</button><button class="button secondary" data-action="nb-review">ทบทวนจากโน้ต</button><button class="button secondary" data-action="nb-export">ส่งออกโน้ตพร้อมรูป</button><label class="button secondary">นำเข้าสมุดจด<input hidden type="file" id="notebook-import" accept=".json,application/json"></label></div>${status(space)}<div class="notebook-filters"><label class="field">ค้นหาโน้ต<input id="notebook-search" type="search" placeholder="หัวข้อ เนื้อหา หรือแท็ก…" value="${e(query)}"></label><label class="field">รายวิชา<select id="notebook-course"><option value="">ทุกวิชา</option>${courses.map(c=>`<option ${course===c.id?'selected':''}>${c.id}</option>`).join('')}</select></label><label class="field">ประเภทโน้ต<select id="notebook-source"><option value="">ทุกประเภท</option>${sourceChoices(source)}</select></label><button class="button ${archived?'primary':'secondary'}" data-action="nb-archive-filter">${archived?'ดูโน้ตที่เก็บเข้าคลังอยู่':'เปิดคลังโน้ต'}</button></div><div id="notebook-results">${noteCards(items)}</div>${old.length?`<details class="panel legacy-notes"><summary>บันทึกข้อความเดิมจากการติว (${old.length})</summary><p>ต้นฉบับยังอยู่ครบ สามารถคัดลอกเป็นหน้าโน้ตที่จัดสีและแทรกรูปได้</p><button class="button secondary" data-action="nb-import-legacy">คัดลอกบันทึกเดิมเข้าสมุดจด</button>${old.map(l=>`<article><h3>${l.course} · ${e(l.title)}</h3><p class="note-preview">${e(progress.notes[l.id])}</p><a href="#lesson/${l.id}">เปิดบทติว →</a></article>`).join('')}</details>`:''}`;
}
export function noteCards(items){return items.length?`<div class="notebook-grid">${items.map(n=>`<article class="note-card"><div class="note-card-top">${n.course?`<span class="badge">${e(n.course)}</span>`:''}${n.pinned?'<span>★ ปักหมุด</span>':''}</div><span class="note-origin ${noteSource(n)}">${NOTE_SOURCES[noteSource(n)]}</span><h2><a class="note-card-link" title="${e(n.title)}" href="#note/${n.id}">${e(n.title)}</a></h2><small>แก้ไข ${stamps(n.updatedAt)} · ${n.paper?n.paper.pages.length+' หน้า · ':''}${referencedImages({notes:[n]}).length} รูป</small><button class="note-card-edit" data-action="nb-classify" data-id="${n.id}" aria-label="เปลี่ยนประเภท ${e(n.title)}">เปลี่ยนประเภท</button></article>`).join('')}</div>`:'<section class="panel empty"><h2>พื้นที่สำหรับความเข้าใจของคุณ</h2><p>สร้างโน้ตจากคำบรรยาย ตำรา หรือเรื่องที่ยังสงสัยได้เลย</p><button class="button primary" data-action="nb-new">สร้างโน้ตหน้าแรก</button></section>';}
export function destroyEditor(){unmount();unmount=()=>{};}
function download(name,data,type='application/json'){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function exportBook(space){const snapshot=space.snapshot(),images={};for(const id of referencedImages(snapshot.notebook)){const b=await space.image(id);images[id]=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b);});}download('ru-study-notebook-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({format:'ru-study-notebook',version:1,snapshot,images}));}
async function noteDetails(chosenCourse,chosenSource,note){
   const d=document.createElement('dialog');d.className='paper-sheet-dialog';
   d.innerHTML=`<form method="dialog"><h2>${note?'เปลี่ยนประเภทโน้ต':'สร้างหน้าโน้ต'}</h2>${note?`<p>${e(note.title)}</p>`:'<label>ชื่อโน้ต<input name="title" maxlength="160" placeholder="โน้ตใหม่" autofocus></label>'}<label>วิชา<input name="course" list="new-note-courses" pattern="[Pp][Oo][Ll][0-9]{4}" placeholder="เช่น POL2104" value="${e(chosenCourse)}"><datalist id="new-note-courses">${courses.map(c=>`<option value="${e(c.id)}"></option>`).join('')}</datalist></label><label>ประเภทโน้ต<select name="source">${sourceChoices(chosenSource)}</select></label><div class="paper-dialog-actions"><button value="save">${note?'บันทึก':'สร้างโน้ต'}</button><button value="cancel" formnovalidate>ยกเลิก</button></div></form>`;
   document.body.append(d);d.showModal();await new Promise(resolve=>d.onclose=resolve);
   const form=new FormData(d.querySelector('form'));d.remove();if(d.returnValue!=='save')return null;
   return {course:form.get('course').trim().toUpperCase(),source:form.get('source'),...(!note?{title:form.get('title').trim()||'โน้ตใหม่'}:{})};
}
export async function notebookAction(action,data,space,progress,render,toast){
 if(!space.info().canEdit){toast('กำลังเชื่อมต่อสมุดจดกับ Supabase กรุณาลองอีกครั้ง');return;}
 const book=space.notebook(),n=book.notes.find(x=>x.id===data.id);
 try{
  if(action==='nb-save'){
   const buttons=[...document.querySelectorAll('[data-action="nb-save"]')];
   buttons.forEach(b=>{b.disabled=true;b.textContent='กำลังบันทึก…';});
   try{
    await space.sync();
    const info=space.info();
    const saved=info.phase==='saved'&&!info.dirty&&!info.busy&&!info.conflict&&!info.locked;
    const text=saved?'บันทึกงานใน Supabase แล้ว':info.status;
    const status=document.getElementById('rich-note-status');
    if(status){status.textContent=text;status.classList.toggle('error',!saved);}
    toast(text);
   }finally{buttons.forEach(b=>{b.disabled=false;b.textContent='บันทึกงาน';});}
   return;
  }
  if(action==='nb-classify'&&n){
   const details=await noteDetails(n.course,noteSource(n),n);
   if(!details)return;
   const latest=structuredClone(space.notebook()),target=latest.notes.find(item=>item.id===n.id);
   if(!target)throw Error('ไม่พบโน้ตนี้แล้ว');
   Object.assign(target,details,{updatedAt:new Date().toISOString()});
   space.saveNotebook(latest);render(true);await space.flush();toast('บันทึกประเภทและวิชาแล้ว');return;
  }
  if(action==='nb-new'||action==='nb-from-lesson'){const l=lessons.find(x=>x.id===data.lesson);const chosenCourse=courses.some(c=>c.id===data.course)?data.course:course;let details={};
  if(action==='nb-new'&&!data.course&&!data.source){
   details=await noteDetails(chosenCourse,source||'classroom');if(!details)return;
  }
  const note=newNote({course:l?.course||chosenCourse,lesson:l?.id||'',source:l?'prep':data.source||source||'general',title:l?.title||'โน้ตใหม่',...details});const latest=structuredClone(space.notebook());latest.notes.push(note);space.saveNotebook(latest);location.hash='#note/'+note.id;}
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
  if(action==='nb-print')window.print();
  if(action==='nb-export'){toast('กำลังรวมโน้ตและรูปภาพ…');await exportBook(space);toast('ส่งออกโน้ตและรูปครบแล้ว');}
  if(action==='nb-import-legacy'){const existing=new Set(book.notes.map(x=>x.id));book.notes.push(...legacyNotes(progress,lessons).filter(x=>!existing.has(x.id)));space.saveNotebook(book);render();toast('คัดลอกแล้ว บันทึกเดิมยังอยู่ครบ');}
 }catch(err){toast(err.message||'ดำเนินการไม่สำเร็จ');}
}
export function notebookSearch(space,value){query=value;document.getElementById('notebook-results').innerHTML=noteCards(findNotes(space.notebook(),{query,course,source,archived}));}
export function notebookFilter(value,key='course'){if(key==='source'){if(value===''||Object.hasOwn(NOTE_SOURCES,value))source=value;}else course=value;}
export async function importNotebook(file,space){if(file.size>100*1024*1024)throw Error('ไฟล์สำรองเกิน 100 MB');const data=JSON.parse(await file.text());if(data.format==='ru-paper-recovery'&&data.version===1){const snapshot=space.snapshot();const note={...data.note,id:crypto.randomUUID(),title:(data.note.title||'โน้ต')+' (กู้คืน)',updatedAt:new Date().toISOString()};snapshot.notebook.notes.push(note);await space.importSnapshot(snapshot);return;}if(data.format!=='ru-study-notebook'||data.version!==1)throw Error('ไฟล์ไม่ใช่สมุดจด RU Study Planner');for(const v of Object.values(data.images||{}))if(typeof v!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(v)||v.length>7100000)throw Error('รูปในไฟล์สำรองไม่ถูกต้อง');if(!confirm('นำเข้าสมุดจดและความคืบหน้าเพื่อแทนที่ฉบับปัจจุบัน? ระบบจะเก็บสำเนาก่อนนำเข้าไว้ในเครื่อง'))return;await space.importSnapshot(data.snapshot,data.images||{});}

export function notePage(space,id){const n=space.notebook().notes.find(x=>x.id===id);return n?paperPage(space,n):'<section class="panel"><h1>ไม่พบหน้าโน้ต</h1><a href="#notes">กลับสมุดจด</a></section>';}
export function mountEditor(space,id){destroyEditor();unmount=mountPaper(space,id,{onLegacy:()=>openLegacy(space,id)});}
