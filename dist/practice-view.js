import {courses} from './data.js?v=20261027c';
import {escapeHTML as e,today,thaiDate} from './core.js?v=20261027c';
import {prep} from './prep.js?v=20261027c';
import {practiceQueue,practiceStats,recordPractice,questionBank} from './practice-core.js?v=20261120a';
let session=null;
export function resetPracticeSession(){session=null;}
function selection(route){
 if(route==='due')return {course:'',mode:'due'};
 if(route.startsWith('mistakes-'))return {course:route.slice(9),mode:'mistakes'};
 if(route.startsWith('extra-')&&courses.some(c=>c.enrolled&&c.id===route.slice(6)))return {course:route.slice(6),mode:'daily',source:'supplement'};
 return {course:courses.some(c=>c.enrolled&&c.id===route)?route:'',mode:'daily'};
}
export function practicePage(state,route=''){
 const selected=selection(route),day=today(),stats=practiceStats(state,day,selected.course);
 if(!session||session.route!==route)session={route,queue:practiceQueue(state,{...selected,day,limit:15}),index:0,answer:null,correct:0};
 const q=session.queue[session.index], answered=session.answer!==null;
 const title=selected.source==='supplement'?'โจทย์สถานการณ์เพิ่มเติม · '+selected.course:selected.mode==='due'?'ข้อที่ถึงรอบทบทวน':selected.mode==='mistakes'?'วนทบทวนข้อที่เคยผิด':'ฝึกทำข้อสอบ';
 const added=courses.filter(c=>c.enrolled).map(c=>({id:c.id,count:questionBank.filter(q=>q.source==='supplement'&&q.course===c.id).length}));
 const originLinks=selected.course?(prep[selected.course]?.links||[]).filter(l=>/ข้อสอบ|ทดสอบ|แนวข้อ/i.test(l[0])):[];
 const sourceNote='<a href="https://ram-test-hub.com/?openExternalBrowser=1" target="_blank" rel="noopener noreferrer">เปิด Ram Test Hub ↗</a> (ยังตรวจสอบรายวิชาและข้อสอบบนเว็บนี้ไม่ได้)';

 const record=q?state.practiceReview[q.key]:null;
 return `<div class="page-heading"><div><h1>${title}</h1></div><a class="button secondary" href="#exams">แนวข้อสอบรายวิชา →</a></div>
 ${!q?`<section class="panel empty"><h2>${session.queue.length?'จบรอบฝึกแล้ว':'ยังไม่มีข้อถึงรอบในตัวกรองนี้'}</h2><p>${session.queue.length?`ตอบถูก ${session.correct}/${session.queue.length} ข้อในรอบนี้`:'เลือกวิชาเพื่อฝึกข้อใหม่ หรือกลับไปอ่านบทเรียนก่อน'}</p><button class="button primary" data-action="practice-restart">เริ่มรอบถัดไป / ทวนข้อผิด</button> <a class="button secondary" href="#courses">อ่านบทเรียน</a></section>`:
 `<section class="panel practice-question"><div class="review-counter">ข้อ ${session.index+1}/${session.queue.length}<span>${q.course} · ${q.source==='supplement'?'โจทย์สถานการณ์แต่งใหม่':q.source==='prep'?'แบบฝึกปรนัย':'คำถามท้ายบท'}</span></div><h2>${e(q.prompt)}</h2><div class="choices">${q.options.map((o,i)=>`<button class="choice ${answered&&i===q.answer?'correct':''} ${answered&&i===session.answer&&i!==q.answer?'incorrect':''}" data-action="practice-answer" data-value="${i}" ${answered?'disabled':''}><span>${i+1}</span>${e(o)}</button>`).join('')}</div>
 ${answered?`<div class="answer-explanation ${session.answer===q.answer?'correct':'incorrect'}"><strong>${session.answer===q.answer?'ถูกต้อง':`ยังไม่ใช่ · คำตอบคือข้อ ${q.answer+1}`}</strong><details><summary>เหตุผลของคำตอบ</summary><p>${e(q.explanation)}</p></details><p>${record?.due===day?'ข้อนี้จะกลับมาในรอบถัดไป':`นัดทวนอีกครั้ง ${thaiDate(record?.due)}`}</p></div><div class="button-row">${q.lesson?`<a class="button secondary" href="#lesson/${e(q.lesson)}">อ่านบทที่เกี่ยวข้อง</a>`:''}<button class="button primary" data-action="practice-next">${session.index+1===session.queue.length?'ดูผลรอบนี้':'ข้อต่อไป →'}</button></div>`:''}</section>`}
 <details class="fold-panel"><summary>เลือกวิชาและชุดฝึก</summary> <div class="practice-links"><a class="button ${!selected.course&&selected.mode==='daily'?'primary':'secondary'}" href="#practice">ทุกวิชา</a><a class="button ${selected.mode==='due'?'primary':'secondary'}" href="#practice/due">ถึงรอบทวน</a>${courses.filter(c=>c.enrolled).map(c=>`<a class="button ${c.id===selected.course&&!selected.source?'primary':'secondary'}" href="#practice/${c.id}">${c.id}</a>`).join('')}</div>
 <details class="fold-panel"><summary>โจทย์เพิ่มเติมแต่งใหม่ 70 ข้อ · เลือกวิชา</summary><div class="practice-links">${added.map(c=>`<a class="button ${selected.source==='supplement'&&selected.course===c.id?'primary':'secondary'} small" href="#practice/extra-${c.id}">${c.id} · ${c.count} ข้อ</a>`).join('')}</div><p class="quiet-note">โจทย์ชุดนี้เขียนใหม่จากหัวข้อในแผนเรียน ไม่ได้คัดลอกจาก Ram Test Hub หรือข้อสอบจริง</p></details>
 <details class="fold-panel"><summary>แหล่งแนวข้อสอบภายนอกและข้อสอบเก่า</summary><p>${sourceNote}</p><p class="quiet-note">ข้อสอบที่นำมาใส่ในระบบนี้เป็นโจทย์แต่งใหม่ ไม่ได้อ้างว่าเป็นข้อสอบจากเว็บข้างต้น</p>${selected.course?`<ul class="simple-list">${originLinks.map(l=>`<li><a href="${e(l[1])}" target="_blank" rel="noopener noreferrer">${e(l[0])} ↗</a></li>`).join('')}</ul>`:'<p><a href="https://www.pg-ram.com/answer/" target="_blank" rel="noopener noreferrer">รายการแนวข้อสอบรามคำแหง แยกตามรหัสวิชา ↗</a></p>'}</details>
</details>
 <details class="fold-panel"><summary>สถิติและวิธีทบทวน</summary><div class="practice-stats"><div><b>${stats.seen}/${stats.total}</b><span>ข้อที่เคยฝึก</span></div><div><b>${stats.due}</b><span>ข้อถึงรอบวันนี้</span></div><div><b>${stats.wrong}</b><span>ข้อผิดที่ยังต้องทวน</span></div><div><b>${stats.attempts?Math.round(stats.correct/stats.attempts*100):0}%</b><span>ถูกจากทุกครั้งที่ตอบ</span></div></div>
 ${stats.pending?`<p class="quiet-note">มีคำตอบเก่าที่บันทึกค้างไว้ ${stats.pending} ข้อในคิวทบทวน ยังไม่นับเป็นครั้งฝึกหรือคะแนนจนกว่าจะตอบใหม่</p>`:''}
 <p class="quiet-note">ข้อผิดกลับมาฝึกได้ทันที ตอบถูกนัดซ้ำอีก 1 → 3 → 7 → 14 วัน การตอบซ้ำวันเดียวกันไม่เร่งรอบให้ข้ามขั้น · คิวหนึ่งรอบไม่เกิน 15 ข้อ</p>
 <p data-sync-status class="quiet-note"></p><a href="#account" class="text-link">เปิดความคืบหน้าเดียวกันบนอีกเครื่อง →</a></details>`;
}
export function practiceAction(action,data,state){
 if(action==='practice-restart'){resetPracticeSession();return false;}
 if(!session)return false;
 if(action==='practice-next'&&session.answer!==null){session.index++;session.answer=null;return false;}
 if(action==='practice-answer'&&session.answer===null){
  const q=session.queue[session.index],answer=Number(data.value);
  if(!q||!recordPractice(state,q.key,answer,today()))return false;
  session.answer=answer;session.correct+=Number(answer===q.answer);
  if(q.source==='lesson')state.answers[`${q.lesson}:${q.index}`]=answer;
  return true;
 }
 return false;
}
