import {calendar,courses,schedules} from './data.js?v=20261027c';
import {addDays,today} from './core.js?v=balanced-friday-replays-20261120';
import {lectureInstructors} from './lecture-instructors.js?v=20261106a';
export const weekdays=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
export function monthBounds(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Invalid month');
 const [year,n]=month.split('-').map(Number);
 return {start:month+'-01',end:new Date(Date.UTC(year,n,0,12)).toISOString().slice(0,10)};
}
export function shiftMonth(month,delta){const [year,n]=month.split('-').map(Number);return new Date(Date.UTC(year,n-1+delta,1,12)).toISOString().slice(0,7);}
export function defaultMonth(day=today()){return (day<calendar.lectureStart?calendar.lectureStart:day>calendar.examEnd?calendar.examEnd:day).slice(0,7);}
// Switching a filter must pick a month containing that kind of activity,
// independently of the month previously selected for a different filter.
export function activityMonth(type='all',day=today(),course=''){
 const events=calendarEvents({type,course}).filter(x=>x.type!=='notice');
 const current=day.slice(0,7);
 if(events.some(x=>x.date.startsWith(current)))return current;
 return (events.find(x=>x.date>=day)||events.at(-1))?.date.slice(0,7)||defaultMonth(day);
}
export function lectureClashes(){
 const result=[];
 for(let i=0;i<schedules.length;i++)for(let j=i+1;j<schedules.length;j++){
  const a=schedules[i],b=schedules[j];
  if(a.course!==b.course&&a.weekday===b.weekday&&a.startTime<b.endTime&&b.startTime<a.endTime)result.push([a,b]);
 }
 return result;
}
export function firstLecture(schedule){
 for(let d=calendar.lectureStart;d<=calendar.lectureEnd;d=addDays(d,1))if(new Date(d+'T12:00:00Z').getUTCDay()===schedule.weekday&&!calendar.exceptions.some(x=>x.kind==='cancelled'&&d>=x.start&&d<=x.end))return d;
 return null;
}
// Faculty notice dated 3 Nov 2569: keep the first meeting in MR30.
export function regularLecture(s){return s.id==='POL2200-269-lecture'?{...s,weekday:4,room:'VPB 501'}:s;}
export function calendarEvents({start=calendar.lectureStart,end=calendar.examEnd,type='all',course=''}={}){
 // User's own deep-watch queue: weekends only, starting with POL2106.
 // A replay is eligible no earlier than two calendar days after the live lecture.
 if(type==='replay')return defaultWeekendReplays().filter(x=>x.date>=start&&x.date<=end&&(!course||x.course===course));
 if(type==='skim')return personalSkimEvents({},{start,end,course});
 const rows=[],clashes=lectureClashes();
 const selected=courses.filter(c=>c.enrolled&&(!course||c.id===course));
 if(type!=='exam')for(let d=start<calendar.lectureStart?calendar.lectureStart:start;d<=end&&d<=calendar.lectureEnd;d=addDays(d,1)){
  const exception=calendar.exceptions.find(x=>d>=x.start&&d<=x.end),weekday=new Date(d+'T12:00:00Z').getUTCDay();
  if(exception?.kind==='cancelled'){
   rows.push({id:'notice-'+d,type:'notice',date:d,title:exception.title,source:exception.source,course:'',time:'งดบรรยาย'});continue;
  }
  for(const base of schedules.filter(s=>selected.some(c=>c.id===s.course))){
   const amended=regularLecture(base),changed=amended!==base,first=changed?firstLecture(base):null;
   const s=changed&&d>first?amended:base;
   if(s.weekday!==weekday)continue;
   const moved=changed&&d>first;
   rows.push({...s,instructors:lectureInstructors(s),id:s.id+'-'+(moved?addDays(d,1):d),moved,facultyNote:changed?(moved?'ตามประกาศคณะรัฐศาสตร์ 3 พ.ย. 2569':'บรรยายครั้งแรกตาม ม.ร.30 ก่อนเปลี่ยนเป็นวันพฤหัสบดี ห้อง VPB 501'):'',type:'lecture',date:d,title:selected.find(c=>c.id===s.course).title,time:s.startTime+'–'+s.endTime,check:exception?.kind==='check'?exception.title:null,clash:clashes.some(pair=>pair.some(x=>x.id===s.id))});
  }
 }
 if(type!=='lecture')for(const c of selected.filter(c=>c.exam&&c.exam>=start&&c.exam<=end))rows.push({id:'exam-'+c.id,type:'exam',date:c.exam,course:c.id,title:c.title,slot:c.slot,time:'คาบ '+c.slot,source:'mr30'});
 return rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.startTime||'').localeCompare(b.startTime||'')||a.course.localeCompare(b.course));
}
// Weekend deep sessions occupy roughly five hours on each day, with breaks.
// Saturday: four 75-minute clips; Sunday: three 100-minute clips.
// Actual video length is not known; these are adjustable study-time budgets.
const initialPriority=['POL2106','POL2104','POL1101','POL2303','POL2301','POL2107','POL2200'];
export const WEEKEND_PRIORITY=['POL2106','POL2107','POL1101','POL2104','POL2200','POL2301','POL2303'];
const DEEP_SATURDAY=['09:00','10:30','13:00','14:30'];
const DEEP_SUNDAY=['10:00','13:00','16:00','18:00','20:00'];
const utcWeekday=d=>new Date(d+'T12:00:00Z').getUTCDay();
const mondayOf=d=>addDays(d,-((utcWeekday(d)+6)%7));
const rankCourse=code=>{const i=WEEKEND_PRIORITY.indexOf(code);return i<0?99:i;};
const replayKey=x=>x.course+'@'+x.date;
const clockPlus=(time,minutes)=>{
 const d=new Date(Date.UTC(2026,0,1,Number(time.slice(0,2)),Number(time.slice(3))+minutes));
 return d.toISOString().slice(11,16);
};
export function defaultWeekendReplays(){
 const lectures=calendarEvents({type:'lecture',start:calendar.lectureStart,end:calendar.lectureEnd}).filter(x=>x.type==='lecture');
 const weeks=new Map();
 for(const lecture of lectures){
  const monday=mondayOf(lecture.date);
  if(!weeks.has(monday))weeks.set(monday,[]);
  weeks.get(monday).push(lecture);
 }
 const events=[];
 for(const [monday,entries] of weeks){
  const sat=addDays(monday,5),sun=addDays(monday,6);
  const order=sat<'2026-11-27'?initialPriority:WEEKEND_PRIORITY;
  const sorted=entries.slice().sort((a,b)=>order.indexOf(a.course)-order.indexOf(b.course)||a.date.localeCompare(b.date));
  const allowedSat=sorted.filter(x=>addDays(x.date,2)<=sat);
  const satCount=Math.min(DEEP_SATURDAY.length,Math.ceil(sorted.length/2),allowedSat.length);
  const satSet=new Set(allowedSat.slice(0,satCount).map(replayKey));
  const saturday=sorted.filter(x=>satSet.has(replayKey(x)));
  const sunday=sorted.filter(x=>!satSet.has(replayKey(x)));
  for(const [day,group,slots,durationMinutes] of [[sat,saturday,DEEP_SATURDAY,75],[sun,sunday,DEEP_SUNDAY,100]]){
   group.forEach((lecture,i)=>{
    const startTime=slots[i]||clockPlus('09:00',i*120);
    events.push({...lecture,id:'replay-'+lecture.course+'-'+lecture.date,key:replayKey(lecture),
     type:'replay',mode:'deep',date:day,sourceDate:lecture.date,sourceTime:lecture.time,
     availableOn:addDays(lecture.date,2),startTime,endTime:clockPlus(startTime,durationMinutes),
     durationMinutes,time:startTime,clash:false});
   });
  }
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.course.localeCompare(b.course));
}
// Mon–Thu: review lightly at 20:00 after the live lectures.
// 20 Nov: Friday still has the first live POL2200 lecture, so reviews start 20:00.
// Every Friday from 27 Nov: no live lectures, so review after work.
// The newest eligible Wednesday recording POL2106 has Friday's first slot.
// Keep light listening distinct from watching a weekend lecture seriously.
export function personalSkimEvents(skimDone={}, {start=calendar.lectureStart,end=addDays(calendar.examEnd,7),course=''}={}){
 const lectures=calendarEvents({type:'lecture',start:calendar.lectureStart,end:calendar.lectureEnd})
  .filter(x=>x.type==='lecture');
 const selected=new Set(),out=[];
 for(let day=calendar.lectureStart;day<=addDays(calendar.lectureEnd,7);day=addDays(day,1)){
  const weekday=utcWeekday(day);
  if(weekday===0||weekday===6)continue;
  const slots=weekday===5?['20:00','20:45','21:30']:['20:00'];
  for(let index=0;index<slots.length;index++){
   const time=slots[index];
   const durationMinutes=40;
   const eligible=lectures.filter(x=>!selected.has(replayKey(x))&&addDays(x.date,2)<=day)
    .sort((a,b)=>b.date.localeCompare(a.date)||rankCourse(a.course)-rankCourse(b.course));
   const lesson=eligible[0];if(!lesson)break;
   const key=replayKey(lesson);selected.add(key);
   out.push({...lesson,id:'skim-'+lesson.course+'-'+lesson.date,key,
    type:'skim',mode:'light',sourceDate:lesson.date,sourceTime:lesson.time,
    availableOn:addDays(lesson.date,2),date:day,startTime:time,
    endTime:clockPlus(time,durationMinutes),time,durationMinutes,clash:false,done:skimDone?.[key]===true});
  }
 }
 return out.filter(x=>x.date>=start&&x.date<=end&&(!course||x.course===course))
  .sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
}

// Apply saved per-lecture decisions while keeping the campus timetable immutable.
export function personalReplayEvents(replay={}, {start=calendar.lectureStart,end=addDays(calendar.examEnd,60),course=''}={}){
 const base=defaultWeekendReplays().filter(x=>!course||x.course===course);
 const events=base.map(event=>{
  const saved=replay?.[event.key]||{};
  const date=saved.date&&saved.date>=event.availableOn?saved.date:event.date;
  const startTime=saved.time||event.startTime;
  return {...event,date,startTime,endTime:clockPlus(startTime,event.durationMinutes),
   time:startTime,done:saved.done===true,custom:!!(saved.date||saved.time)};
 }).filter(event=>event.date>=start&&event.date<=end)
 .sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.sourceTime.localeCompare(b.sourceTime)||a.course.localeCompare(b.course));
 const overlaps=new Map();
 for(const event of events){const k=event.date+'T'+event.startTime;overlaps.set(k,(overlaps.get(k)||0)+1);}
 return events.map(event=>({...event,overlap:overlaps.get(event.date+'T'+event.startTime)>1}));
}
const icsEscape=v=>String(v).replaceAll('\\','\\\\').replace(/\r?\n/g,'\\n').replaceAll(',','\\,').replaceAll(';','\\;');
export function foldICS(line){let result='',row='',bytes=0;const encoder=new TextEncoder();for(const ch of line){const n=encoder.encode(ch).length;if(bytes+n>75){result+=row+'\r\n';row=' ';bytes=1;}row+=ch;bytes+=n;}return result+row;}
const utc=(day,time)=>new Date(`${day}T${time}:00+07:00`).toISOString().replace(/[-:]/g,'').replace('.000','');
export function scheduleICS({type='all',course='',replay={},skimDone={},includeReplay=false}={}){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RU Study Planner//Class and Exam Calendar//TH','CALSCALE:GREGORIAN','X-WR-CALNAME:'+icsEscape('RU Study Planner · 2/2569')];
 for(const event of (type==='replay'?personalReplayEvents(replay,{course}):
  type==='skim'?personalSkimEvents(skimDone,{course}):
  includeReplay&&type==='all'?
  [...calendarEvents({type,course}).filter(x=>x.type!=='notice'),...personalReplayEvents(replay,{course}),...personalSkimEvents(skimDone,{course})]
   .sort((a,b)=>a.date.localeCompare(b.date)||(a.startTime||'').localeCompare(b.startTime||''))
  :calendarEvents({type,course}).filter(x=>x.type!=='notice'))){
  if(event.type==='replay'||event.type==='skim'){
   const begin=new Date(event.date+'T'+event.startTime+':00+07:00');
   const finish=new Date(begin.getTime()+event.durationMinutes*60000);
   const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace('.000','');
   const deep=event.type==='replay';
   lines.push('BEGIN:VEVENT',`UID:${event.id}@ru-study-planner`,'DTSTAMP:20261120T000000Z',
    'DTSTART:'+stamp(begin),'DTEND:'+stamp(finish),'STATUS:TENTATIVE',
    'SUMMARY:'+icsEscape((deep?'ดูคลิปจริงจัง ':'ทวนเบา ๆ ')+event.course),
    'DESCRIPTION:'+icsEscape(event.title+'\\nคาบจริง '+event.sourceDate+' '+event.sourceTime+
     '\\nแผนส่วนตัวประมาณ '+event.durationMinutes+' นาที · คลิปอาจเผยแพร่ประมาณ 2 วันหลังคาบจริง (ไม่ยืนยันว่ามีคลิปแล้ว)'+
     '\\nทวนเบา ๆ กับดูจริงจังมีสถานะแยกกัน'+
     '\\nเปิด RU Course on Demand: https://ondemand.ru.ac.th'),
    'END:VEVENT');
   continue;
  }
  const exam=event.type==='exam';
  lines.push('BEGIN:VEVENT',`UID:${exam?event.course+'-269':event.id}@ru-study-planner`,exam?'DTSTAMP:20261014T000000Z':event.facultyNote?'DTSTAMP:20261111T000000Z':'DTSTAMP:20261106T000000Z');
  if(exam)lines.push('DTSTART;VALUE=DATE:'+event.date.replaceAll('-',''),'DTEND;VALUE=DATE:'+addDays(event.date,1).replaceAll('-',''));
  else lines.push(event.facultyNote?'SEQUENCE:2':'SEQUENCE:1','DTSTART:'+utc(event.date,event.startTime),'DTEND:'+utc(event.date,event.endTime),'STATUS:TENTATIVE','LOCATION:'+icsEscape(event.room));
  lines.push('SUMMARY:'+icsEscape(`${exam?'สอบ':event.moved?'บรรยายตามประกาศคณะ':'เรียนตาม ม.ร.30'} ${event.course}${exam?' · คาบ '+event.slot:''}`),'DESCRIPTION:'+icsEscape(event.title+'\n'+(exam?'คาบ '+event.slot+' ยังไม่ระบุชั่วโมงและห้องสอบ ตรวจตารางสอบรายบุคคล':'เวลาไทย '+event.time+' ห้องเรียน '+event.room+'\nผู้สอนประจำวิชา: '+event.instructors+(event.facultyNote?'\n'+event.facultyNote:'')+'\n'+calendar.note+(event.check?'\n'+event.check:'')+(event.clash?'\nเวลาเรียนตรงกับวิชาอื่นที่ลงไว้':''))),'END:VEVENT');
 }
 return lines.concat('END:VCALENDAR').map(foldICS).join('\r\n')+'\r\n';
}
