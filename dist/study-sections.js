import {courses} from './data.js?v=20261027c';
import {escapeHTML as e} from './core.js?v=20261027c';
import {courseMaterialCount,courseMaterialList} from './course-materials-ui.js?v=shared-course-20261120';

export function prepNotice(){
 return '<p class="content-origin"><strong>ติวก่อนเรียน</strong> คือเนื้อหาที่เรียบเรียงเพื่อปูพื้นฐาน ไม่ใช่คำบรรยายหรือเอกสารของอาจารย์ <a href="#classroom">ดูเนื้อหาจากห้องเรียน →</a></p>';
}
export function classroomPage(space){
 const book=space?.notebook?.()||{notes:[]},active=courses.filter(c=>c.enrolled);
 const count=active.reduce((sum,c)=>sum+book.notes.filter(n=>n.course===c.id&&!n.archived).length,0);
 return `
 <div class="page-heading"><div><h1>ห้องเรียนและสมุดจด</h1><p>โน้ตที่เคยจดอยู่ที่นี่ด้วย ไม่ต้องสร้างหรือคัดลอกใหม่ · เอกสารหลักของวิชาเปิดร่วมกันได้ทุกครั้ง</p></div></div>
 <div class="classroom-overview panel"><b>สมุดจดที่มีแล้ว ${count} รายการ</b><a class="button secondary" href="#notes">เปิดสมุดจดทั้งหมด</a></div>
 <div class="classroom-grid">${active.map(c=>{
  const notes=book.notes.filter(n=>n.course===c.id&&!n.archived).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const files=courseMaterialCount(book,c.id);
  return `<article class="panel classroom-course"><span class="cc-code">${c.id}</span><h2>${e(c.title)}</h2>
   <p class="classroom-state">${notes.length?notes.length+' โน้ตที่บันทึกไว้แล้ว':'ยังไม่มีโน้ตวิชานี้'} · ${files} เอกสารหลัก</p>
   ${notes.length?`<div class="classroom-notes">${notes.slice(0,5).map(n=>`<a href="#note/${n.id}" class="classroom-note-link">📖 ${e(n.title)} <span>เปิดต่อ</span></a>`).join('')}</div>`:''}
   ${courseMaterialList(book,c.id)}
   <div class="classroom-course-actions">
    ${notes.length?`<button class="button secondary" data-action="nb-filter-course" data-course="${c.id}">ดูโน้ตทั้งหมด</button>`:''}
    <button class="button secondary" data-action="nb-course-materials" data-course="${c.id}">📚 เอกสารหลักวิชา</button>
    <button class="button primary" data-action="nb-new" data-course="${c.id}" data-source="classroom">＋ จดครั้งใหม่</button>
   </div>
  </article>`;
 }).join('')}</div>`;
}
