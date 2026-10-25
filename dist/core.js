import {validatePractice,validateLegacyPracticePending,importLegacyMistakes} from './practice-core.js?v=20261025j';
import {courses,terms,categoryTargets,readingWeek,studyPhases,studyHours} from './data.js?v=20261025j';
import {lessons} from './lessons.js?v=20261025j';
import {prep} from './prep.js?v=20261025j';
export const STORAGE_KEY='ru-study-planner.v1';
export function freshState(){return {version:1,completed:[],notes:{},answers:{},reviews:{},grades:{},termMoves:{},lastLesson:null,transfer:{general:0,free:0},sessions:[],dailyGoal:1,font:'normal',planVersion:2,practiceMigrationVersion:1,practiceReview:{},legacyPracticePending:[],hours:{weekday:2,weekend:2},hourOverrides:{},planDone:{},prep:{},debt:{}};}
const lessonIds=new Set(lessons.map(l=>l.id));
const courseIds=new Set(courses.map(c=>c.id));
const cardIds=new Set(lessons.flatMap(l=>l.cards.map((_,i)=>`${l.id}:${i}`)));
const questionIds=new Map(lessons.flatMap(l=>l.questions.map((q,i)=>[`${l.id}:${i}`,q])));
export const BLOCK_IDS=new Set(['cards','main','second','deep','extra','wrap','examday','explain']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const isDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v));
// Storage keys of the debt modules (debt-payments.js, debt-interest.js, debt-core.js).
export const DEBT_KEYS=['debtPayments_20261025_v1','debtInterestRates_20261025_v1','debtPlanPaid_20261025_budget15000_v2'];
export function validateState(input){
 if(!plain(input)||input.version!==1)throw new Error('ไฟล์สำรองไม่ใช่รูปแบบ RU Study Planner รุ่น 1');
 const s=freshState();
 if(Array.isArray(input.completed))s.completed=[...new Set(input.completed.filter(x=>lessonIds.has(x)))];
 if(plain(input.notes))for(const [k,v]of Object.entries(input.notes)){if(lessonIds.has(k)&&typeof v==='string'&&v.length<=50000)s.notes[k]=v;}
 if(plain(input.answers))for(const [k,v]of Object.entries(input.answers)){if(questionIds.has(k)&&Number.isInteger(v)&&v>=0&&v<questionIds.get(k).options.length)s.answers[k]=v;}
 if(plain(input.reviews))for(const [k,v]of Object.entries(input.reviews)){if(cardIds.has(k)&&plain(v)&&isDay(v.due)&&Number.isInteger(v.level)&&v.level>=0&&v.level<=3)s.reviews[k]={due:v.due,level:v.level};}
 if(plain(input.grades))for(const [k,v]of Object.entries(input.grades)){if(courseIds.has(k)&&['A','B+','B','C+','C','D+','D','F'].includes(v))s.grades[k]=v;}
 if(plain(input.termMoves))for(const [k,v]of Object.entries(input.termMoves)){if(courseIds.has(k)&&!courses.find(c=>c.id===k).enrolled&&Number.isInteger(v)&&v>=1&&v<terms.length)s.termMoves[k]=v;}
 if(lessonIds.has(input.lastLesson))s.lastLesson=input.lastLesson;
 if(plain(input.transfer))for(const [k,max]of [['general',30],['free',12]]){if(Number.isInteger(input.transfer[k])&&input.transfer[k]>=0&&input.transfer[k]<=max)s.transfer[k]=input.transfer[k];}
 if(Array.isArray(input.sessions))s.sessions=input.sessions.filter(v=>plain(v)&&lessonIds.has(v.lesson)&&isDay(v.date)).slice(-1000).map(v=>({lesson:v.lesson,date:v.date}));
 if([1,2,3].includes(input.dailyGoal))s.dailyGoal=input.dailyGoal;
 if(['normal','large'].includes(input.font))s.font=input.font;
 if(input.planVersion===2&&plain(input.hours))for(const k of ['weekday','weekend']){if(studyHours.includes(input.hours[k]))s.hours[k]=input.hours[k];}
 // Upgrade the last single-date override without replacing newer date-keyed values.
 const validHourDay=d=>isDay(d)&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 if(input.planVersion===2&&plain(input.todayHours)&&validHourDay(input.todayHours.date)&&studyHours.includes(input.todayHours.hours))s.hourOverrides[input.todayHours.date]=input.todayHours.hours;
 if(plain(input.hourOverrides))for(const [d,h]of Object.entries(input.hourOverrides)){if(validHourDay(d)&&studyHours.includes(h))s.hourOverrides[d]=h;}
 if(plain(input.planDone))for(const k of Object.keys(input.planDone).filter(isDay).sort().slice(-400)){const v=input.planDone[k];if(Array.isArray(v))s.planDone[k]=[...new Set(v.filter(x=>BLOCK_IDS.has(x)))];}
 if(plain(input.prep))for(const [k,v]of Object.entries(input.prep)){if(!Object.hasOwn(prep,k)||!plain(v))continue;const n=prep[k].questions.length,score=x=>Number.isInteger(x)&&x>=0&&x<=n?x:null,answers={};if(plain(v.answers))for(const [i,a]of Object.entries(v.answers)){if(/^\d+$/.test(i)&&Number(i)<n&&Number.isInteger(a)&&a>=0&&a<prep[k].questions[Number(i)].options.length)answers[i]=a;}s.prep[k]={answers,submitted:v.submitted===true,best:score(v.best),last:score(v.last)};}
 // Personal debt plan (numbers only), kept here so it syncs with the study space; the debt modules validate the contents on read.
 if(plain(input.debt))for(const k of DEBT_KEYS){if(typeof input.debt[k]==='string'&&input.debt[k].length<=500000)s.debt[k]=input.debt[k];}
 s.practiceReview=validatePractice(input.practiceReview);
 s.legacyPracticePending=validateLegacyPracticePending(input.legacyPracticePending,s.practiceReview);
 // Independent of the study-plan version: repair snapshots already saved by the first v2 release.
 if(input.practiceMigrationVersion!==1)importLegacyMistakes(s);
 return s;
}
export function loadState(storage){try{const raw=storage.getItem(STORAGE_KEY);return {state:raw?validateState(JSON.parse(raw)):freshState(),error:null};}catch(error){return {state:freshState(),error:'อ่านข้อมูลที่บันทึกในเครื่องไม่ได้ กรุณานำเข้าไฟล์สำรอง ข้อมูลเดิมจะไม่ถูกเขียนทับจนกว่าจะกู้คืน'};}}
export function storeState(storage,state){try{storage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}catch{return false;}}
export function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function thaiDate(iso,short=false){if(!iso)return 'รอประกาศ';return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:short?'short':'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(`${iso}T12:00:00+07:00`));}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function addDays(day,n){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function daysBetween(from,to){return Math.round((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000);}
// 0 = Monday … 6 = Sunday, matching readingWeek.
export function weekdayIndex(day){return (new Date(`${day}T12:00:00Z`).getUTCDay()+6)%7;}
export function courseProgress(state,code){const ls=lessons.filter(l=>l.course===code);const done=ls.filter(l=>state.completed.includes(l.id)).length;return {done,total:ls.length,percent:ls.length?Math.round(done/ls.length*100):0};}
export function progress(state){return {done:state.completed.length,total:lessons.length,percent:Math.round(state.completed.length/lessons.length*100)};}
export function nextLesson(state,code){const pool=code?lessons.filter(l=>l.course===code):lessons;return pool.find(l=>!state.completed.includes(l.id))||pool[0];}
export function unreadLesson(state,code){return lessons.find(l=>l.course===code&&!state.completed.includes(l.id))||null;}
export function exams(){return courses.filter(c=>c.enrolled&&c.exam).sort((a,b)=>a.exam.localeCompare(b.exam)||a.slot.localeCompare(b.slot));}
export function examClashes(items){const seen=new Map();const clashes=[];for(const c of items){if(!c.exam||!c.slot)continue;const key=`${c.exam}:${c.slot}`;if(seen.has(key))clashes.push([seen.get(key),c.id]);else seen.set(key,c.id);}return clashes;}
const values={'A':4,'B+':3.5,'B':3,'C+':2.5,'C':2,'D+':1.5,'D':1,'F':0};
export function planSummary(state){
 const planned=Object.fromEntries(Object.keys(categoryTargets).map(k=>[k,0]));const passed={...planned};
 let gradePoints=0,graded=0;
 for(const c of courses){planned[c.category]+=c.credits;const g=state.grades[c.id];if(g&&g!=='F')passed[c.category]+=c.credits;if(g){gradePoints+=values[g]*c.credits;graded+=c.credits;}}
 const earned=Object.values(passed).reduce((a,b)=>a+b,0);const transfer=state.transfer.general+state.transfer.free;
 const termRows=terms.map(t=>{const items=courses.filter(c=>(state.termMoves[c.id]??c.term)===t.id);const credits=items.reduce((n,c)=>n+c.credits,0);return {...t,courses:items,credits,over:credits>t.cap,heavy:items.filter(c=>c.load==='หนัก').length};});
 return {planned,passed,earned,transfer,remaining:126-earned-transfer,gpa:graded?gradePoints/graded:null,graded,termRows};
}
// Cards join the review queue once their lesson is read (or already reviewed), so the queue never floods on day one.
export function cardsForReview(state,code,day=today(),includeUnread=false){return lessons.filter(l=>(!code||l.course===code)&&(includeUnread||state.completed.includes(l.id)||l.cards.some((_,i)=>state.reviews[`${l.id}:${i}`]))).flatMap(l=>l.cards.map((card,i)=>({...card,id:`${l.id}:${i}`,lesson:l.id,course:l.course,title:l.title}))).filter(c=>!state.reviews[c.id]||state.reviews[c.id].due<=day);}
export function reviewCard(state,id,remembered,day=today()){if(!cardIds.has(id))return;const prev=state.reviews[id]?.level??0;const level=remembered?Math.min(prev+1,3):0;const interval=remembered?[1,1,3,7][level]:1;state.reviews[id]={level,due:addDays(day,interval)};}
export function checkAnswer(lessonId,index,value){const q=questionIds.get(`${lessonId}:${index}`);return !!q&&q.answer===value;}
export function quizItems(state,course='',mistakes=false){return lessons.filter(l=>!course||l.course===course).flatMap(l=>l.questions.map((q,i)=>({...q,id:`${l.id}:${i}`,lesson:l.id,course:l.course,title:l.title,index:i}))).filter(q=>!mistakes||(q.id in state.answers&&state.answers[q.id]!==q.answer));}
export function examICS(){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RU Study Planner//Exam Calendar//TH','CALSCALE:GREGORIAN'];for(const c of exams()){lines.push('BEGIN:VEVENT',`UID:${c.id}-269@ru-study-planner`,`DTSTAMP:20261010T000000Z`,`DTSTART;VALUE=DATE:${c.exam.replaceAll('-','')}`,`DTEND;VALUE=DATE:${addDays(c.exam,1).replaceAll('-','')}`,`SUMMARY:${c.id} สอบคาบ ${c.slot}`,`DESCRIPTION:${c.title} · คาบ ${c.slot} (ยังไม่ได้ระบุชั่วโมงสอบในแอป) ตรวจตารางสอบรายบุคคลอีกครั้ง`,'END:VEVENT');}return lines.concat('END:VCALENDAR').join('\r\n')+'\r\n';}

// ---- Daily study planner (1–4 hours a day around work) ----
export function phaseFor(day){return studyPhases.find(p=>(!p.start||day>=p.start)&&(!p.end||day<=p.end));}
export function hoursFor(state,day=today()){return state.hourOverrides?.[day]??(weekdayIndex(day)>=5?state.hours.weekend:state.hours.weekday);}
export function hoursUntil(state,from,to){let total=0;for(let d=from<STUDY_START?STUDY_START:from;d<to;d=addDays(d,1))total+=hoursFor(state,d);return total;}
function lowestProgress(state,skip){return exams().map(c=>c.id).filter(id=>!skip.includes(id)).sort((a,b)=>courseProgress(state,a).percent-courseProgress(state,b).percent)[0];}
function studyTask(state,code,short){
 const l=unreadLesson(state,code);
 if(l)return {title:`${code} · บทที่ ${l.n} ${l.title}`,detail:short?'อ่าน “เข้าใจใน 1 นาที” และคำสำคัญ ถ้ามีเวลาเหลือค่อยอ่านละเอียด':'เปิดเรื่อง → “เข้าใจใน 1 นาที” → อ่านละเอียด → ตอบคำถามท้ายบท แล้วกดอ่านจบ',href:`#lesson/${l.id}`};
 return {title:`${code} · เรียนลึกกับตำรา`,detail:short?'อ่านบันทึกของตัวเอง แล้วทำคำถามทบทวนของวิชานี้':'อ่านตำราหรือดูคำบรรยาย RU on Demand 1 หัวข้อ แล้วจดสรุปด้วยภาษาตัวเองลงบันทึก',href:`#course/${code}`};
}
export const STUDY_START='2026-11-01';
export const weeklyCourses=['POL2106','POL1101','POL2107','POL2200','POL2301','POL2104','POL2303'];
export function dailyPlan(state,day=today()){
 const hours=hoursFor(state,day),phase=phaseFor(day),list=exams(),nextExam=list.find(c=>c.exam>=day)||null,blocks=[];
 const add=(id,minutes,title,detail,course,href)=>blocks.push({id,minutes,title,detail,course:course||null,href:href||null});
 const result=()=>({day,hours,phase,nextExam,blocks,minutes:blocks.reduce((n,b)=>n+b.minutes,0),done:(state.planDone[day]||[]).filter(id=>blocks.some(b=>b.id===id)).length});
 if(day<STUDY_START||!nextExam)return result();
 let code=weeklyCourses[weekdayIndex(day)];
 if(phase.id==='review')code=list[daysBetween(phase.start,day)%list.length].id;
 if(phase.id==='exam')code=nextExam.id;
 const examToday=list.filter(c=>c.exam===day);
 if(examToday.length){
  add('examday',0,`วันนี้สอบ ${examToday.map(c=>c.id+' คาบ '+c.slot).join(' / ')}`,'ตรวจเวลาและห้องสอบจากตารางรายบุคคล เวลาสอบไม่นับรวมในแผนอ่าน เลือก 1 ชม. ได้หากต้องการพักเพิ่ม',examToday[0].id,'#exams');
 }
 const review=phase.id!=='learn', task=studyTask(state,code,false);
 const minutes=hours===1?[5,25,15,10,5]:[15,50,30,20,5];
 add('cards',minutes[0],'ทวนข้อที่ถึงรอบ','ตอบโดยไม่เปิดเฉลยก่อน รวมข้อผิดจากทุกวิชา ถ้าไม่มีคิวให้ทวนแฟลชการ์ด',null,'#practice/due');
 add('main',minutes[1],review?`${code} · ทบทวนหัวข้อที่ยังไม่แม่น`:task.title,review?'เปิดสรุปและบันทึกหัวข้อที่ตอบผิด แล้วลองอธิบายด้วยภาษาตัวเอง':task.detail,code,review?`#course/${code}`:task.href);
 add('second',minutes[2],`${code} · ทำข้อสอบควบคู่การอ่าน`,'ฝึกครั้งละไม่เกิน 15 ข้อ เริ่มจากบทที่อ่านและข้อที่ถึงรอบ บันทึกคำตอบทุกข้อ',code,`#practice/${code}`);
 add('explain',minutes[3],'อ่านเฉลยและแก้ความเข้าใจ','อ่านเหตุผลของคำตอบ เปิดบทที่เกี่ยวข้อง ข้อผิดกลับมาทำใหม่ได้ทันที; ตอบถูกแล้ววน 1, 3, 7, 14 วัน',code,`#practice/mistakes-${code}`);
 add('wrap',minutes[4],'จดสรุป 3 บรรทัด','จดว่าผิดเพราะอะไรและจำอย่างไร แล้วตรวจสถานะบันทึกใน Supabase',code,'#notes');
 if(hours>=3)add('deep',60,`${code} · คำบรรยายและตำรา`,'เปิดเนื้อหาจริงจากอาจารย์ แล้วจดแยกจากเนื้อหาติว',code,'#classroom');
 if(hours>=4)add('extra',60,`${code} · แบบฝึกเพิ่มเติม`,'ทำแบบจำลองสอบและวิเคราะห์ข้อผิด',code,`#prep/${code}`);
 return result();
}
export function activeDays(state){const days=new Set(state.sessions.map(s=>s.date));for(const [d,v]of Object.entries(state.planDone))if(v.length)days.add(d);return days;}
export function streak(state,day=today()){const days=activeDays(state);let d=days.has(day)?day:addDays(day,-1),n=0;while(days.has(d)){n++;d=addDays(d,-1);}return n;}
// ---- Exam-style practice sets ----
export function prepResult(state,code){const g=prep[code];if(!g)return null;const p=state.prep[code]||{answers:{},submitted:false,best:null,last:null};const total=g.questions.length,answered=Object.keys(p.answers).length,correct=g.questions.filter((q,i)=>p.answers[i]===q.answer).length;return {...p,total,answered,correct};}

