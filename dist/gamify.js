// Game layer: XP, levels and badges are derived from saved progress only, so every device shows the same numbers
// and no new fields enter the Supabase workspace.
import {courses} from './data.js?v=20261027b';
import {lessons} from './lessons.js?v=20261027b';
import {prep} from './prep.js?v=20261027b';
import {activeDays,addDays,today,weekdayIndex,courseProgress} from './core.js?v=20261027b';

export const XP=Object.freeze({lesson:50,question:10,repeat:2,card:5,block:10});
export const XP_SOURCES=[['lessons','📖','อ่านจบบทเรียน',`บทละ ${XP.lesson} XP`],['questions','🎯','ตอบโจทย์ถูกครั้งแรก',`ข้อละ ${XP.question} XP · คำถามท้ายบท แนวข้อสอบ และฝึกสอบ`],['repeats','🔁','ตอบถูกซ้ำตอนวนทบทวน',`ครั้งละ ${XP.repeat} XP`],['cards','🃏','ทบทวนแฟลชการ์ดใบใหม่',`ใบละ ${XP.card} XP`],['blocks','✅','ทำภารกิจในแผนรายวัน',`ช่วงละ ${XP.block} XP`]];
// Gaps widen as levels rise; a steady term of daily blocks, lessons and reviews reaches the top before exams end.
export const LEVELS=[[0,'มือใหม่หัดเรียน','🌱'],[100,'นักอ่านฝึกหัด','📖'],[300,'นักศึกษาขยัน','✏️'],[600,'นักคิดรุ่นใหม่','💡'],[1000,'นักวิเคราะห์','🔍'],[1600,'นักรัฐศาสตร์','🏛️'],[2500,'ผู้รอบรู้','🎓'],[3800,'ปราชญ์การเมือง','🦉'],[5500,'ปรมาจารย์','🌟'],[8000,'ตำนานแห่งราม','👑']];
// Every answer (lesson quiz, mock exam, practice desk) lands in practiceReview, whose counters only grow,
// so question XP never drops when a quiz is retried or a mock set is cleared.
const solved=state=>Object.values(state.practiceReview||{}).filter(r=>r.correct>0);

export function xpParts(state){
 const blocks=Object.values(state.planDone).reduce((n,v)=>n+v.length,0),right=solved(state);
 return {lessons:state.completed.length*XP.lesson,questions:right.length*XP.question,repeats:right.reduce((n,r)=>n+r.correct-1,0)*XP.repeat,cards:Object.keys(state.reviews).length*XP.card,blocks:blocks*XP.block};
}
export function xpTotal(state){return Object.values(xpParts(state)).reduce((a,b)=>a+b,0);}
export function levelInfo(xp){
 let i=0;while(i+1<LEVELS.length&&xp>=LEVELS[i+1][0])i++;
 const [floor,title,icon]=LEVELS[i],next=i+1<LEVELS.length?LEVELS[i+1][0]:null;
 return {level:i+1,title,icon,xp,floor,next,toNext:next===null?0:next-xp,percent:next===null?100:Math.floor((xp-floor)/(next-floor)*100)};
}
export function bestStreak(state){let best=0,run=0,prev=null;for(const d of [...activeDays(state)].sort()){run=prev&&addDays(prev,1)===d?run+1:1;best=Math.max(best,run);prev=d;}return best;}
export function weekDays(state,day=today()){
 const days=activeDays(state),monday=addDays(day,-weekdayIndex(day));
 return ['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'].map((label,i)=>{const date=addDays(monday,i);return {label,date,active:days.has(date),today:date===day,future:date>day};});
}
export function badges(state){
 const enrolled=courses.filter(c=>c.enrolled),read=state.completed.length,best=bestStreak(state);
 const courseBest=Math.max(0,...enrolled.map(c=>courseProgress(state,c.id).percent));
 const reviews=Object.values(state.reviews),sets=Object.keys(prep).filter(code=>Number.isInteger(state.prep[code]?.best));
 const topPercent=Math.max(0,...sets.map(code=>Math.round(state.prep[code].best/prep[code].questions.length*100)));
 return [
  ['first','🌱','ก้าวแรก','อ่านจบบทแรก',read,1,'บท'],
  ['reader','📚','หนอนหนังสือ','อ่านจบ 10 บท',read,10,'บท'],
  ['course','🏅','พิชิต 1 วิชา','ติวครบทุกบทในวิชาเดียว',courseBest,100,'%'],
  ['all','🏆','ครบทุกบท',`อ่านจบครบ ${lessons.length} บท`,read,lessons.length,'บท'],
  ['streak3','🔥','ไฟเริ่มติด','เรียนต่อเนื่อง 3 วัน',best,3,'วัน'],
  ['streak7','⚡','สัปดาห์ทอง','เรียนต่อเนื่อง 7 วัน',best,7,'วัน'],
  ['streak30','💎','วินัยเหล็ก','เรียนต่อเนื่อง 30 วัน',best,30,'วัน'],
  ['sharp','🎯','ตอบแม่น','ตอบโจทย์ถูก 20 ข้อ',solved(state).length,20,'ข้อ'],
  ['cards','🃏','นักทบทวน','ทบทวนแฟลชการ์ด 50 ใบ',reviews.length,50,'ใบ'],
  ['memory','🧠','ความจำดีเยี่ยม','การ์ดระดับ “จำแม่น” 20 ใบ',reviews.filter(r=>r.level>=3).length,20,'ใบ'],
  ['mock','📝','ลองสนามจริง','ทำแนวข้อสอบครบ 1 ชุด',sets.length,1,'ชุด'],
  ['ace','🌟','ฝีมือระดับ A','ได้ 80% ขึ้นไปในแนวข้อสอบ',topPercent,80,'%']
 ].map(([id,icon,title,detail,have,need,unit])=>({id,icon,title,detail,have:Math.min(have,need),need,unit,earned:have>=need}));
}
// The unearned badge closest to done, as a gentle “next goal”.
export function nextBadge(state){return badges(state).filter(b=>!b.earned).sort((a,b)=>(b.have/b.need)-(a.have/a.need))[0]||null;}
