import {schedules,courses,calendar} from './data.js?v=20261027c';
import {regularLecture,firstLecture,weekdays} from './calendar-core.js?v=20261111a';
import {escapeHTML as e,thaiDate,today} from './core.js?v=20261027c';
// Public catalogue entries observed in RU-Study Planner, term 2/2569, 15 Nov 2026.
const reference={
 POL1101:[1,'11:10','13:40','KTB 401','2027-03-12','B'],
 POL2303:[2,'11:30','13:20','KLB 201','2027-03-15','B'],
 POL2301:[3,'11:30','13:20','KLB 301','2027-03-21','B'],
 POL2104:[3,'13:30','15:20','KLB 501','2027-03-10','A'],
 POL2106:[3,'13:30','15:20','VPB 501','2027-03-19','A'],
 POL2107:[4,'17:30','19:20','VKB 301','2027-03-22','B'],
 POL2200:[5,'13:30','15:20','VPB 401','2027-03-13','B']
};
const colors=['#dbeafe','#d1fae5','#fef3c7','#fce7f3','#ede9fe','#cffafe','#ffedd5'];
const minutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
export function weeklyPlanner(mode){
 const list=schedules.filter(s=>courses.some(c=>c.enrolled&&c.id===s.course));
 const exams=courses.filter(c=>c.enrolled).sort((a,b)=>a.exam.localeCompare(b.exam));
 const regular=mode==='regular';
 const rows=list.map(s=>regular?regularLecture(s):s);
 const tabs=[['first','สัปดาห์แรก'],['regular','สัปดาห์ถัดไป'],['exam','ตารางสอบ']];
 const hourLabels=[11,13,15,17,19].map(h=>`<small style="position:absolute;left:${(h-11)/9*100}%">${h}:00</small>`).join('');
 const board=`<div style="overflow-x:auto"><div style="min-width:560px"><div style="margin-left:48px;position:relative;height:28px">${hourLabels}</div>${[1,2,3,4,5].map(day=>{
 const items=rows.filter(s=>s.weekday===day).sort((a,b)=>a.startTime.localeCompare(b.startTime));let ends=[];
 const boxes=items.map(s=>{const start=minutes(s.startTime),end=minutes(s.endTime);let lane=ends.findIndex(n=>n<=start);if(lane<0)lane=ends.length;ends[lane]=end;
 const clash=items.some(x=>x!==s&&x.startTime<s.endTime&&s.startTime<x.endTime);
 return `<a href="#course/${e(s.course)}" style="position:absolute;box-sizing:border-box;top:${lane*76+3}px;left:${(start-660)/540*100}%;width:${(end-start)/540*100}%;border-radius:9px;background:${colors[Object.keys(reference).indexOf(s.course)]||'#eef2ff'};color:#17233d;padding:4px;font:14px/1.35 sans-serif;text-decoration:none"><b>${e(s.course)}</b><br>${e(s.startTime)}–${e(s.endTime)}<br>${e(s.room)}${clash?' · ชน':''}</a>`;}).join('');
 return `<div style="display:grid;grid-template-columns:48px 1fr;border-top:1px solid #cad2e0;padding:3px 0"><b>${['','จ.','อ.','พ.','พฤ.','ศ.'][day]}</b><div style="position:relative;min-height:${Math.max(1,ends.length)*76}px;background:repeating-linear-gradient(to right,#dae1ed 0 1px,transparent 1px 11.111%)">${boxes}</div></div>`;}).join('')}</div></div>`;
 const diff=list.map(base=>{const c=exams.find(c=>c.id===base.course),r=reference[c.id];if(!r)return '';const s=regularLecture(base);
 const same=[s.weekday,s.startTime,s.endTime,s.room].every((v,i)=>v===r[i]);return `<li><b>${e(c.id)}</b> · ${same?'คาบเรียนตรงกัน':`RU-Study: ${weekdays[r[0]]} ${r[1]}–${r[2]} ${e(r[3])} · หลังคาบแรก: ${weekdays[s.weekday]} ${s.startTime}–${s.endTime} ${e(s.room)}`} · ${c.exam===r[4]&&c.slot===r[5]?'วันและคาบสอบตรงกัน':'วันหรือคาบสอบต่างกัน'}</li>`;}).join('');
 return `<section class="panel"><h2>ตารางของฉัน · 2/2569</h2><p>เรียนออนไลน์ทุกคาบ · ใช้รหัสห้องเพื่อเลือกช่องถ่ายทอดสด</p><div class="button-row">${tabs.map(([key,label])=>`<button class="button ${mode===key?'primary':'secondary'}" aria-pressed="${mode===key}" data-action="cal-board" data-board="${key}">${label}</button>`).join('')}</div><p>${mode==='exam'?'วันสอบเรียงตามวันที่ · คาบตาม ม.ร.30':regular?'ตั้งแต่ 23 พ.ย. · POL2200 ย้ายไปวันพฤหัสบดี ห้อง VPB 501':'16–20 พ.ย. · POL2200 เรียนครั้งแรกวันศุกร์ ห้อง VPB 401'}</p>${mode==='exam'?`<ul class="simple-list">${exams.map(c=>`<li><b>${thaiDate(c.exam,true)}</b> · ${e(c.id)} · คาบ ${e(c.slot)}</li>`).join('')}</ul>`:board}${mode==='exam'?'':'<p><b>แนะนำเมื่อคาบพุธชนกัน:</b> ดู POL2104 สดออนไลน์ทางช่อง KLB 501 แล้วดู POL2106 ย้อนหลังเพื่อหยุดเทียบแนวคิดนักปรัชญาทีละคน ตรวจว่ามีคลิปของภาคนี้ก่อนใช้แผนนี้</p>'}<details><summary>เทียบกับ RU-Study ทั้ง 7 วิชา</summary><p>ข้อมูลจากตารางสาธารณะ ตรวจวันที่ 15 พ.ย. 2569 · ไม่ได้ซิงก์สด</p><ul class="simple-list">${diff}</ul><a href="https://ru-study.app/planner" target="_blank" rel="noopener noreferrer">เปิดเว็บ RU-Study Planner ↗</a></details></section>`;
}
