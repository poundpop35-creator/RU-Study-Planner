import {schedules,courses,calendar} from './data.js?v=20261027c';
import {regularLecture,firstLecture,weekdays,personalReplayEvents,calendarEvents} from './calendar-core.js?v=replay-20261119';
import {escapeHTML as e,thaiDate,today,addDays} from './core.js?v=replay-20261119';
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
function replayBoard(state={},focus=today(),canEdit=true){
 const weekDay=new Date(focus+'T12:00:00Z').getUTCDay(),start=addDays(focus,-((weekDay+6)%7)),end=addDays(start,6);
 const rows=personalReplayEvents(state.replay||{},{start,end});
 const nDone=rows.filter(x=>x.done).length;
 const disabled=canEdit?'':' disabled';
 const days=Array.from({length:7},(_,i)=>addDays(start,i));
 const content=days.map(date=>{
  const entries=rows.filter(x=>x.date===date);
  const dayTitle=weekdays[new Date(date+'T12:00:00Z').getUTCDay()];
  const cards=entries.length?entries.map(x=>`<article class="replay-item ${x.done?'is-done':''}">
   <div class="replay-item-head"><div><b><a href="#course/${e(x.course)}">${e(x.course)}</a> · ${e(x.title)}</b><small>คาบจริง ${thaiDate(x.sourceDate,true)} · ${e(x.sourceTime)}</small></div><span class="replay-time-pill">${e(x.startTime)} น.</span></div>
   ${x.overlap?'<p class="replay-overlap">มีหลายคลิปเวลาเดียวกัน · เป็นคิวดูย้อนหลัง ไม่ใช่การดูพร้อมกัน กรุณาเลื่อนวันหรือเวลาตามความยาวคลิปจริง</p>':''}
   <div class="replay-edit"><label>วันที่ดู <input type="date" class="replay-date" data-key="${e(x.key)}" value="${e(x.date)}" min="2026-11-16" max="2027-05-21"${disabled}></label>
    <label>เวลาเริ่ม <input type="time" class="replay-time-input" data-key="${e(x.key)}" value="${e(x.startTime)}"${disabled}></label></div>
   <div class="replay-actions"><button type="button" class="button ${x.done?'primary':'secondary'} small" data-action="cal-replay-done" data-key="${e(x.key)}"${disabled} aria-pressed="${x.done}">${x.done?'✓ ดูแล้ว · ยกเลิก':'ทำเครื่องหมายว่าดูแล้ว'}</button>
    <button type="button" class="button secondary small" data-action="cal-replay-reset" data-key="${e(x.key)}"${disabled}>คืนวัน/เวลาเดิม</button></div>
  </article>`).join(''):'<p class="replay-free">ไม่มีคลิปตามแผนในวันนี้</p>';
  return `<section class="replay-day ${date===today()?'is-today':''}"><h3>${dayTitle} <small>${thaiDate(date,true)}</small></h3>${cards}</section>`;
 }).join('');
 return `<div class="replay-wrapper"><div class="replay-week-nav"><button class="button secondary small" data-action="cal-replay-week" data-delta="-7">← สัปดาห์ก่อน</button><strong>${thaiDate(start,true)} – ${thaiDate(end,true)}</strong><button class="button secondary small" data-action="cal-replay-week" data-delta="7">สัปดาห์ถัดไป →</button><button class="button secondary small" data-action="cal-replay-week" data-delta="0">สัปดาห์นี้</button></div>
  <p class="replay-count">สัปดาห์นี้มี ${rows.length} คลิป · ทำเครื่องหมายดูแล้ว ${nDone}/${rows.length}</p>
  <div class="replay-week-grid">${content}</div>
  <p class="replay-note"><b>กำหนดส่วนตัว:</b> ดูย้อนหลังประมาณ 2 วันหลังบรรยาย เริ่ม 20:00 น. เวลาคลิปเข้าระบบอาจเปลี่ยนได้ ระบบนี้ไม่ได้ตรวจว่าคลิปถูกอัปโหลดแล้ว และไม่ทราบความยาวคลิป โปรดตรวจและปรับเวลาเองเมื่อวันหนึ่งมีหลายวิชา</p>
  <p><a class="button secondary" href="https://ondemand.ru.ac.th/" target="_blank" rel="noopener noreferrer">▶ เปิด RU Course on Demand ↗</a></p></div>`;
}

/* One timetable: university lectures and the user's scheduled replay sessions. */
export const timetableColors={
 POL1101:'#dbeafe',POL2303:'#d1fae5',POL2301:'#fef3c7',
 POL2104:'#fce7f3',POL2106:'#ede9fe',POL2107:'#cffafe',POL2200:'#ffedd5'
};
const schoolColor=id=>timetableColors[id]||'#e5eaf4';
const mondayOf=d=>addDays(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));
function unifiedWeekly(mode,state={},focus=today(),canEdit=true){
 const start=mode==='first'?'2026-11-16':(mondayOf(focus)<'2026-11-23'?'2026-11-23':mondayOf(focus));
 const end=addDays(start,6);
 const live=calendarEvents({start,end,type:'lecture'}).filter(x=>x.type==='lecture');
 const recorded=personalReplayEvents(state.replay||{},{start,end});
 const complete=recorded.filter(x=>x.done).length;
 const days=Array.from({length:7},(_,i)=>addDays(start,i));
 const grid=days.map(day=>{
  const weekday=new Date(day+'T12:00:00Z').getUTCDay();
  const lectures=live.filter(x=>x.date===day).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const replays=recorded.filter(x=>x.date===day);
  let lanes=[];
  const lectureCards=lectures.map(x=>{
   const begin=minutes(x.startTime),finish=minutes(x.endTime);
   let lane=lanes.findIndex(t=>t<=begin);
   if(lane===-1)lane=lanes.length;
   lanes[lane]=finish;
   return `<a class="unified-lecture" style="--course-bg:${schoolColor(x.course)};left:${(begin-660)/720*100}%;width:${(finish-begin)/720*100}%;top:${lane*74+3}px" href="#course/${e(x.course)}"><b>${e(x.course)}</b><small>${e(x.startTime)}–${e(x.endTime)}</small><small>${e(x.room)}${x.clash?' · ชน':''}</small></a>`;
  }).join('');
  const replayCards=replays.map((x,i)=>`<div class="unified-replay ${x.done?'is-done':''}" style="--course-bg:${schoolColor(x.course)};top:${i*73+3}px;left:75%;width:24.6%" >
   <b>▶ ${e(x.course)}</b><small>${e(x.startTime)} · ย้อนหลัง</small>
   <button class="unified-done" type="button" data-action="cal-replay-done" data-key="${e(x.key)}" aria-pressed="${x.done}"${canEdit?'':' disabled'}>${x.done?'✓ ดูแล้ว':'○ ยังไม่ดู'}</button>
  </div>`).join('');
  const height=Math.max(78,lanes.length*74,replays.length*73);
  return `<div class="unified-weekday ${day===today()?'is-today':''}">
   <div class="unified-weekday-name"><b>${['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'][weekday]}</b><small>${Number(day.slice(8))}/${Number(day.slice(5,7))}</small></div>
   <div class="unified-weekday-track" style="height:${height}px">${lectureCards}${replayCards}${!lectures.length&&!replays.length?'<span class="unified-no-class">—</span>':''}</div></div>`;
 }).join('');
 const edits=recorded.map(x=>`<div class="unified-replay-edit">
  <span style="--course-bg:${schoolColor(x.course)}"><b>${e(x.course)}</b><small>คาบจริง ${thaiDate(x.sourceDate,true)}</small></span>
  <label>วันที่ดู <input type="date" class="replay-date" data-key="${e(x.key)}" value="${e(x.date)}" min="2026-11-16" max="2027-05-21"${canEdit?'':' disabled'}></label>
  <label>เวลาเริ่ม <input type="time" class="replay-time-input" data-key="${e(x.key)}" value="${e(x.startTime)}"${canEdit?'':' disabled'}></label>
  <button type="button" class="button secondary small" data-action="cal-replay-reset" data-key="${e(x.key)}"${canEdit?'':' disabled'}>คืนค่า</button>
 </div>`).join('');
 return `<div class="unified-weekly">
  <div class="replay-week-nav">
   ${mode==='first'?'':`<button class="button secondary small" data-action="cal-replay-week" data-delta="-7">← ก่อนหน้า</button>`}
   <strong>${thaiDate(start,true)} – ${thaiDate(end,true)}</strong>
   ${mode==='first'?'':`<button class="button secondary small" data-action="cal-replay-week" data-delta="7">ถัดไป →</button><button class="button secondary small" data-action="cal-replay-week" data-delta="0">สัปดาห์นี้</button>`}
  </div>
  <p class="unified-legend"><span>● คาบบรรยายจริง</span><span>▶ คลิปย้อนหลังประมาณ 2 วัน</span><b>ดูแล้ว ${complete}/${recorded.length} คลิป</b></p>
  <div class="unified-scroll"><div class="unified-grid">
   <div class="unified-axis"><b>วัน</b><div>${[11,13,15,17,19,21,23].map(h=>`<span style="left:${(h-11)/12*100}%">${h}:00</span>`).join('')}</div></div>
   ${grid}
  </div></div>
  <details class="unified-edit-panel"><summary>ปรับวันและเวลาที่จะดูคลิปย้อนหลัง</summary><p>การจัดเวลา 20.00 น. เป็นค่าเริ่มต้น ไม่ใช่เวลาที่คลิปอัปโหลดจริง วันศุกร์มีหลายวิชา สามารถเลื่อนวันหรือเวลาเองได้</p>${edits||'<p>ไม่มีคลิปในสัปดาห์นี้</p>'}</details>
  <p class="replay-note">ตารางย้อนหลังเป็นแผนส่วนตัว สร้างจากคาบจริง +2 วันโดยประมาณ ไม่ยืนยันว่ามหาวิทยาลัยอัปโหลดคลิปแล้ว · <a href="https://ondemand.ru.ac.th/" target="_blank" rel="noopener noreferrer">▶ เปิด RU Course on Demand</a></p>
 </div>`;
}
export function weeklyPlanner(mode,replayState={},replayFocus=today(),canEdit=true){
 const list=schedules.filter(s=>courses.some(c=>c.enrolled&&c.id===s.course));
 const exams=courses.filter(c=>c.enrolled).sort((a,b)=>a.exam.localeCompare(b.exam));
 const regular=mode==='regular';
 const rows=list.map(s=>regular?regularLecture(s):s);
 const tabs=[['first','สัปดาห์แรก'],['regular','สัปดาห์ถัดไป'],['exam','ตารางสอบ']];
 if(mode!=='exam')return `<section class="panel"><h2>ตารางเรียนของฉัน · 2/2569</h2><p>บรรยายจริงและดูย้อนหลังในตารางเดียว สีเดียวกันตามรายวิชา · ติ๊กดูแล้วได้ในบล็อกย้อนหลัง</p><div class="button-row">${tabs.map(([key,label])=>`<button class="button ${mode===key?'primary':'secondary'}" aria-pressed="${mode===key}" data-action="cal-board" data-board="${key}">${label}</button>`).join('')}</div>${unifiedWeekly(mode==='replay'?'regular':mode,replayState,replayFocus,canEdit)}</section>`;
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
