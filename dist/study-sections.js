import {courses} from './data.js?v=20261027b';
import {escapeHTML as e} from './core.js?v=20261027b';

// One row of tabs links pages that belong together; the open page's tab is marked.
export function hubTabs(tabs,active,label){
 return `<nav class="hub-tabs" aria-label="${label}">${tabs.map(([key,name])=>`<a href="#${key}" ${active===key?'aria-current="page"':''}>${name}</a>`).join('')}</nav>`;
}
// The learning area: pre-class material and classroom content stay separate tabs, next to practice and review.
export function studySections(active='courses'){
 return hubTabs([['courses','ติวก่อนเรียน'],['classroom','ห้องเรียน'],['practice','ฝึกสอบ'],['review','ทบทวน']],active,'ส่วนของการเรียน');
}
export function prepNotice(){
 return '<p class="content-origin"><strong>ติวก่อนเรียน</strong> คือเนื้อหาที่เรียบเรียงเพื่อปูพื้นฐาน ไม่ใช่คำบรรยายหรือเอกสารของอาจารย์ <a href="#classroom">ดูเนื้อหาจากห้องเรียน →</a></p>';
}
export function classroomPage(){
 return `${studySections('classroom')}<div class="page-heading"><div><h1>เนื้อหาจากห้องเรียน</h1><p>พื้นที่สำหรับเอกสาร คำบรรยาย และหัวข้อที่อาจารย์สอนจริง</p></div></div><section class="panel classroom-empty"><span class="origin-label">รอเนื้อหาจากคุณ</span><h2>ยังไม่ได้รับเนื้อหาจากอาจารย์</h2><p>เมื่อคุณส่งเอกสารหรือเนื้อหาที่เรียนจริงมา จะจัดแยกตามวิชาไว้ที่นี่ เนื้อหาติวก่อนเรียนยังอยู่ในเมนูของตัวเอง และความคืบหน้าการติวไม่นับว่าเรียนเนื้อหาจากอาจารย์แล้ว</p><a class="button secondary" href="#courses">ไปติวก่อนเรียน</a></section><div class="classroom-grid">${courses.filter(c=>c.enrolled).map(c=>`<article class="panel classroom-course"><span class="cc-code">${c.id}</span><h2>${e(c.title)}</h2><p class="classroom-state">ยังไม่มีเนื้อหาจากอาจารย์</p><button class="button secondary" data-action="nb-new" data-course="${c.id}" data-source="classroom">จดจากห้องเรียนวิชานี้</button></article>`).join('')}</div>`;
}
