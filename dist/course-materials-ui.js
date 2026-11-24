import {readAttachment,downloadAttachment} from './note-files.js?v=20261124-documents20';
import {openNoteFile,openNoteFileTab} from './file-viewer.js?v=20261124-file-tab';
import {materialFor,safeCourseUrl,isCourseCode} from './course-materials.js?v=20261124-documents20';
import {escapeHTML as escape} from './core.js?v=20261027c';

export function courseMaterialCount(book,course){
 const items=materialFor(book,course);
 return items.files.length+items.links.length;
}

export function courseMaterialLabel(book,course){
 if(!course)return 'เลือกวิชาเพื่อใช้ไฟล์หลัก';
 const count=courseMaterialCount(book,course);
 return 'ไฟล์หลักวิชา '+course+' · '+(count?count+' รายการ':'เพิ่มไฟล์');
}

export function courseMaterialList(book,course){
 const {files,links}=materialFor(book,course);
 return '<div class="course-material-links">'+
  files.map(f=>'<button type="button" data-action="nb-course-open-file" data-course="'+course+'" data-file-id="'+f.id+'" title="เปิด '+escape(f.name)+'">📄 '+escape(f.name)+'</button>').join('')+
  links.map(l=>'<a href="'+escape(l.url)+'" target="_blank" rel="noopener noreferrer" title="'+escape(l.name)+'">🔗 '+escape(l.name)+'</a>').join('')+
  '</div>';
}

// One-tap upload from the classroom card uses the same per-course collection
// as the materials dialog. Never put these files on an individual note.
export async function uploadSharedCourseFile(space,course,file,onUpdate=()=>{},toast=()=>{}){
 if(!isCourseCode(course))throw Error('เลือกรายวิชาที่ถูกต้องก่อนแนบไฟล์หลัก');
 if(!space.info().canEdit)throw Error('ยังไม่สามารถบันทึกได้ โปรดตรวจการเชื่อมต่อพื้นที่ส่วนตัว');
 const attachment=await readAttachment(file,space);
 const book=structuredClone(space.notebook()),items=materialFor(book,course);
 if(items.files.length>=12)throw Error('แนบเอกสารหลักได้ไม่เกิน 12 ไฟล์ต่อวิชา');
 book.courseMaterials={...(book.courseMaterials||{}),[course]:{...items,files:[...items.files,attachment]}};
 book.version=Math.max(book.version,6);
 space.saveNotebook(book);
 onUpdate();
 await space.flush();
 toast('แนบไฟล์หลักวิชา '+course+' แล้ว');
 return attachment;
}

export async function openSharedCourseMaterials(space,course,onUpdate=()=>{},toast=()=>{}){
 if(!isCourseCode(course))throw Error('เลือกวิชาก่อนแนบเอกสารประจำวิชา');
 const modal=document.createElement('dialog');modal.className='paper-sheet-dialog course-materials-dialog';
 modal.innerHTML='<header><div><h2>📚 เอกสารหลัก · '+escape(course)+'</h2><p>ใช้ร่วมกันได้จากทุกโน้ตของวิชานี้ ไม่ต้องแนบซ้ำ</p></div><button type="button" data-course-close aria-label="ปิด">✕</button></header>'+
  '<div class="course-material-body"><div data-course-materials></div><label class="course-material-upload">＋ แนบ PDF / Word / PowerPoint<input type="file" data-course-upload accept=".pdf,.doc,.docx,.ppt,.pptx" hidden></label>'+
  '<p class="course-material-note">ไฟล์ละไม่เกิน 20 MB · เก็บเอกสารแยกจากข้อมูลสมุดจด</p>'+
  '<form data-course-link-form><label>ชื่อลิงก์<input name="title" maxlength="160" placeholder="เช่น สไลด์อาจารย์ ครั้งที่ 1" required></label><label>ลิงก์ไฟล์บนเว็บ<input name="url" type="url" placeholder="https://..." required></label><button type="submit">＋ เพิ่มลิงก์</button></form>'+
  '<p class="course-material-status" role="status"></p></div>';
 const status=modal.querySelector('.course-material-status');
 let working=false;
 function refresh(){
  const data=materialFor(space.notebook(),course);
  modal.querySelector('[data-course-materials]').innerHTML='<h3>เอกสารที่ใช้ร่วมกัน ('+(data.files.length+data.links.length)+')</h3>'+
   (!data.files.length&&!data.links.length?'<p class="muted">ยังไม่มีเอกสารประจำวิชา แนบไฟล์หรือเพิ่มลิงก์ด้านล่างได้เลย</p>':'')+
   data.files.map(f=>'<div class="course-material-row"><span>📄 '+escape(f.name)+'</span><div><button type="button" data-course-preview="'+f.id+'">เปิดดู</button><button type="button" data-course-tab="'+f.id+'">↗ เปิดแท็บใหม่</button><button type="button" data-course-download="'+f.id+'">ดาวน์โหลด</button><button type="button" data-course-remove-file="'+f.id+'" aria-label="ลบไฟล์ '+escape(f.name)+'">ลบ</button></div></div>').join('')+
   data.links.map(l=>'<div class="course-material-row"><span>🔗 '+escape(l.name)+'</span><div><a href="'+escape(l.url)+'" target="_blank" rel="noopener noreferrer">เปิดลิงก์</a><button type="button" data-course-remove-link="'+l.id+'" aria-label="ลบลิงก์ '+escape(l.name)+'">ลบ</button></div></div>').join('');
 }
 async function update(fn){
  if(working)throw Error('กำลังบันทึกรายการก่อนหน้า');
  if(!space.info().canEdit)throw Error('ไม่สามารถบันทึกได้ โปรดตรวจการเชื่อมต่อพื้นที่ส่วนตัว');
  working=true;
  try{
   const book=structuredClone(space.notebook()),before=materialFor(book,course);
   book.courseMaterials={...(book.courseMaterials||{}),[course]:fn(before)};
   book.version=Math.max(book.version,6);
   space.saveNotebook(book);
   refresh();onUpdate();
   status.textContent='กำลังบันทึกเอกสารลง Supabase…';
   await space.flush();
   status.textContent='บันทึกเอกสารประจำวิชาแล้ว';
   toast('บันทึกเอกสารวิชา '+course+' แล้ว');
  }finally{working=false;}
 }
 modal.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-course-close')){modal.close();return;}
  const data=materialFor(space.notebook(),course);
  try{
   if(b.dataset.coursePreview){const f=data.files.find(f=>f.id===b.dataset.coursePreview);if(f)await openNoteFile(f,space);}
   else if(b.dataset.courseTab){const f=data.files.find(f=>f.id===b.dataset.courseTab);if(f)await openNoteFileTab(f,space);}
   else if(b.dataset.courseDownload){const f=data.files.find(f=>f.id===b.dataset.courseDownload);if(f)await downloadAttachment(f,space);}
   else if(b.dataset.courseRemoveFile){const f=data.files.find(f=>f.id===b.dataset.courseRemoveFile);if(f&&confirm('ลบเอกสารหลัก '+f.name+' จากวิชานี้?'))await update(old=>({...old,files:old.files.filter(x=>x.id!==f.id)}));}
   else if(b.dataset.courseRemoveLink){const l=data.links.find(x=>x.id===b.dataset.courseRemoveLink);if(l&&confirm('ลบลิงก์ '+l.name+' จากวิชานี้?'))await update(old=>({...old,links:old.links.filter(x=>x.id!==l.id)}));}
  }catch(e){status.textContent=e.message;}
 });
 modal.querySelector('[data-course-upload]').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  event.target.disabled=true;
  try{status.textContent='กำลังอัปโหลดเอกสาร…';const f=await readAttachment(file,space);await update(old=>({...old,files:[...old.files,f]}));}
  catch(e){status.textContent=e.message;}
  finally{event.target.value='';event.target.disabled=false;}
 });
 modal.querySelector('[data-course-link-form]').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target,name=form.elements.title.value.trim(),url=safeCourseUrl(form.elements.url.value.trim());
  if(!name||!url){status.textContent='ใส่ชื่อลิงก์และ URL ของเว็บไซต์ที่ขึ้นต้นด้วย https:// หรือ http://';return;}
  try{await update(old=>({...old,links:[...old.links,{id:crypto.randomUUID(),name,url}]}));form.reset();}
  catch(e){status.textContent=e.message;}
 });
 modal.addEventListener('close',()=>modal.remove());
 document.body.append(modal);refresh();modal.showModal();
}
