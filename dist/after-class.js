import {calendar,schedules,courses} from './data.js?v=20261027c';
import {calendarEvents,firstLecture,weekdays} from './calendar-core.js?v=20261111a';
import {today,addDays,weekdayIndex,thaiDate,escapeHTML as e,unreadLesson} from './core.js?v=20261112a';
export const readingStart=calendar.lectureStart;
const all=courses.filter(c=>c.enrolled),first=Object.fromEntries(schedules.map(s=>[s.course,firstLecture(s)]));
const dateNow=()=>new Date();
export function mayConfirm(code,on=today(),instant=dateNow()){
 const s=schedules.find(x=>x.course===code);return !!s&&on>=first[code]&&instant>=new Date(first[code]+'T'+s.endTime+':00+07:00');
}
const lectureRows=d=>calendarEvents({start:d,end:d,type:'lecture'}).filter(x=>x.type==='lecture');
const priority=['POL1101','POL2303','POL2301','POL2107','POL2200','POL2104','POL2106'];
export function afterPlan(state,day){
 const lectures=lectureRows(day),allowed=all.filter(c=>first[c.id]<=day&&state.firstHeard?.[c.id]<=day&&(!c.exam||day<=c.exam)).map(c=>c.id);
 const avail=c=>allowed.includes(c),pick=state.readCourse?.[day],idx=weekdayIndex(day);
 const ordered=[pick,...(day>='2027-02-01'?all.filter(c=>avail(c.id)).sort((a,b)=>a.exam.localeCompare(b.exam)).map(c=>c.id):[]),...lectures.map(x=>x.course).filter(c=>c===priority[idx]),...lectures.map(x=>x.course),...priority.slice(idx),...priority.slice(0,idx)];
 const code=ordered.find(avail),hours=state.readExtra?.[day]?2:1,blocks=[];
 if(code&&day>=readingStart){
  const l=unreadLesson(state,code),lesson=l?'#lesson/'+l.id:'#course/'+code;
  const add=(id,minutes,title,detail,href)=>blocks.push({id:'after-'+code+'-'+id,minutes,title,detail,href,course:code});
  add('notes',10,'เปิดโน้ตจากคาบล่าสุด','เขียนชื่อเรื่องที่อาจารย์สอนและคำสำคัญ 2 คำ ถ้าไม่มีสไลด์ ให้ใช้สิ่งที่จดในห้อง','#notes');
  add('read',30,l?'อ่านเทียบคาบ: '+l.title:'อ่านทวนหัวข้อจากคาบล่าสุด',l?'เริ่มที่ “เข้าใจใน 1 นาที” ของบทที่ '+l.n+' แล้วเลือกเฉพาะส่วนที่ตรงกับโน้ต ถ้าอาจารย์สอนคนละเรื่อง ให้ใช้สไลด์หรือโน้ตคาบนั้นแทน':'อ่านสไลด์ตามหัวข้อที่จด ไม่ต้องเริ่มบทใหม่',lesson);
  add('recall',20,'ปิดโน้ตแล้วเล่าให้ตัวเองฟัง','สรุป 3 บรรทัด ยกตัวอย่าง 1 เรื่อง และจด 1 จุดที่อยากถาม แค่นี้ครบชั่วโมงแรกแล้ว','#notes');
  if(hours===2){add('extend',30,'เวลาเสริม: อ่านตัวอย่าง','เลือกตัวอย่างหนึ่งกรณีในบทที่ตรงกับคาบ แล้วลองอธิบายโดยไม่ดูเฉลย',lesson);add('practice',30,'เวลาเสริม: ลองโจทย์ที่เรียนแล้ว','ลองคำถามท้ายบท 3 ข้อ ดูเหตุผลเฉพาะข้อที่ยังไม่แน่ใจ แล้วหยุดได้',lesson);}
 }
 return {code,allowed,lectures,day,hours,blocks,minutes:blocks.reduce((s,b)=>s+b.minutes,0),done:blocks.filter(b=>state.planDone?.[day]?.includes(b.id)).length};
}
export function firstChecklist(state,on=today()){
 return '<details class="panel"'+(all.some(c=>state.firstHeard?.[c.id])?'':' open')+'><summary><b>คาบแรกของแต่ละวิชา · '+all.filter(c=>state.firstHeard?.[c.id]).length+'/7 วิชา</b></summary><p>แตะเฉพาะวิชาที่เข้าเรียนหรือดูคาบแรกย้อนหลังจบแล้ว โดยเฉพาะสองวิชาวันพุธที่เวลาชนกัน</p>'+schedules.slice().sort((a,b)=>a.weekday-b.weekday||a.startTime.localeCompare(b.startTime)).map(s=>{const heard=state.firstHeard?.[s.course];return '<p><b>'+s.course+'</b> · '+thaiDate(first[s.course],true)+' '+s.startTime+'–'+s.endTime+' · '+e(s.room)+' <button class="button secondary small" data-action="heard-first" data-course="'+s.course+'" aria-pressed="'+!!heard+'" '+(!heard&&!mayConfirm(s.course,on)?'disabled':'')+'>'+(heard?'เรียนแล้ว ✓ (ยกเลิก)':mayConfirm(s.course,on)?'เรียนคาบแรกแล้ว':'รอคาบแรก')+'</button></p>';}).join('')+'</details>';
}
export function weekView(day){
 const mon=addDays(day,-weekdayIndex(day));return '<section class="panel"><h2>ตารางบรรยายสัปดาห์ที่เลือก</h2><p>อ่านหลังเรียน วันไม่มีคาบใช้ทวนวิชาที่เรียนแล้ว หรือพักได้</p>'+Array.from({length:7},(_,i)=>{const d=addDays(mon,i),ls=lectureRows(d);return '<p><b>'+weekdays[(i+1)%7]+' '+thaiDate(d,true)+'</b><br>'+ (ls.length?ls.map(x=>x.course+' '+x.time+' · '+e(x.room)+(x.clash?' (เวลาชน)':'')).join('<br>'):'ไม่มีคาบตามตาราง')+'<br><small>หลังเรียน: '+(i>=5?'ทวน '+priority[i]+' ถ้าเรียนสดหรือดูย้อนหลังแล้ว ไม่อย่างนั้นเลือกวิชาที่เรียนแล้วหรือพัก':ls.length?'ทวน '+(ls.find(x=>x.course===priority[i])||ls[0]).course+' ถ้าเข้าเรียนแล้ว':'ทวนหนึ่งวิชาที่เรียนไปแล้วหรือพัก')+'</small></p>';}).join('')+'</section>';
}
