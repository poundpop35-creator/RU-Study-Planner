import {universityDocuments} from './documents.js?v=20261027c';
import {escapeHTML as e} from './core.js?v=20261027c';
export function documentsPage(id=''){
 const doc=universityDocuments.find(d=>d.id===id);
 return `<div class="page-heading"><div><div class="eyebrow">UNIVERSITY DOCUMENTS</div><h1>เอกสารมหาวิทยาลัย</h1><p>ไฟล์ที่เคยส่งและลิงก์ต้นฉบับ · ตรวจประกาศแก้ไขเพิ่มเติมก่อนลงทะเบียนและสอบ</p></div><a class="button secondary" href="#exams">รายวิชาและวันสอบ</a></div>
 <div class="document-grid">${universityDocuments.map(d=>`<article class="panel"><span class="badge">PDF · ${d.pages} หน้า</span><h2>${e(d.title)}</h2><p>${e(d.note)}</p><div class="button-row"><a class="button primary" href="#documents/${d.id}">เปิด PDF ในแอป</a><a class="button secondary" href="${e(d.file)}" target="_blank" rel="noopener noreferrer">เปิดไฟล์เต็ม ↗</a>${d.original?`<a class="text-link" href="${e(d.original)}" target="_blank" rel="noopener noreferrer">ลิงก์ต้นฉบับมหาวิทยาลัย ↗</a>`:'<span class="quiet-note">ยังไม่พบ URL ต้นฉบับที่ยืนยันได้ ใช้ไฟล์ที่เคยส่ง</span>'}</div></article>`).join('')}</div>
 ${doc?`<section class="panel pdf-panel"><h2>${e(doc.title)}</h2><p>ถ้าเครื่องไม่แสดง PDF ในกรอบ ให้กด <a href="${e(doc.file)}" target="_blank" rel="noopener noreferrer">เปิดไฟล์เต็ม ↗</a></p><iframe class="document-pdf" src="${e(doc.file)}" title="${e(doc.title)}" referrerpolicy="no-referrer"></iframe></section>`:''}
 <p class="quiet-note">เอกสารข้างต้นเป็นเอกสารของมหาวิทยาลัย ส่วนแผนรายวันและบทติวเป็นเนื้อหาที่จัดทำในแอป แผนเรียนเก่าที่รายวิชาต่างจากรายการลงทะเบียนปัจจุบันไม่ใช้แทนข้อมูลเทอมนี้</p>`;
}
