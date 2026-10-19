import {lessons} from './lessons.js?v=20261018a';
import {prep} from './prep.js?v=20261018a';

// Stable source + original index: existing answers keep their original meaning.
export const questionBank = [
  ...lessons.flatMap(l => l.questions.map((q, index) => ({...q, key:`lesson:${l.id}:${index}`, course:l.course, lesson:l.id, source:'lesson', index}))),
  ...Object.entries(prep).flatMap(([course, g]) => g.questions.map((q, index) => ({...q, key:`prep:${course}:${index}`, course, source:'prep', index})))
];
const byKey = new Map(questionBank.map(q => [q.key, q]));
export const practiceQuestion = key => byKey.get(key);
const dateOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d+'T12:00:00Z').toISOString().slice(0,10) === d;
const plus = (day, n) => {const d=new Date(day+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);};
const whole = n => Number.isSafeInteger(n) && n >= 0;
export function validatePractice(value) {
  const result={};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, r] of Object.entries(value)) {
    const q=byKey.get(key);
    if (!q || !r || !dateOK(r.due) || !dateOK(r.lastDay) || !['attempts','correct','wrong','streak'].every(k=>whole(r[k])) || r.streak>4 || r.attempts!==r.correct+r.wrong || !Number.isInteger(r.lastAnswer) || r.lastAnswer<0 || r.lastAnswer>=q.options.length) continue;
    result[key]={attempts:r.attempts,correct:r.correct,wrong:r.wrong,streak:r.streak,lastAnswer:r.lastAnswer,lastDay:r.lastDay,due:r.due};
  }
  return result;
}
export function recordPractice(state, key, answer, day) {
  const q=byKey.get(key);
  if (!q || !dateOK(day) || !Number.isInteger(answer) || answer<0 || answer>=q.options.length) return null;
  state.practiceReview ||= {};
  const old=state.practiceReview[key], right=answer===q.answer;
  const advance=!old || old.lastDay!==day || old.lastAnswer!==q.answer;
  const streak=right ? Math.min(4,(old?.streak||0)+(advance?1:0)) : 0;
  const r={attempts:(old?.attempts||0)+1,correct:(old?.correct||0)+(right?1:0),wrong:(old?.wrong||0)+(right?0:1),streak,lastAnswer:answer,lastDay:day,due:right?plus(day,[0,1,3,7,14][streak]):day};
  state.practiceReview[key]=r;
  return r;
}
export function importLegacyMistakes(state) {
  const seed=(key,answer)=>{if(!state.practiceReview[key])recordPractice(state,key,answer,'2026-10-18');};
  for (const [key,a] of Object.entries(state.answers)) seed('lesson:'+key,a);
  for (const [code,p] of Object.entries(state.prep)) if(p.submitted || p.last!==null) for(const [i,a] of Object.entries(p.answers))seed(`prep:${code}:${i}`,a);
}
export function practiceQueue(state, {course='', mode='daily', day, limit=15}={}) {
  const pool=questionBank.filter(q=>!course || q.course===course), records=state.practiceReview||{};
  const due=pool.filter(q=>records[q.key]?.due<=day).sort((a,b)=>records[a.key].due.localeCompare(records[b.key].due) || records[b.key].wrong-records[a.key].wrong || a.key.localeCompare(b.key));
  if(mode==='due') return due.slice(0,limit);
  if(mode==='mistakes') return due.filter(q=>records[q.key].wrong>0).slice(0,limit);
  const unseen=pool.filter(q=>!records[q.key]);
  // Prefer the lesson just opened/read, then unanswered prep items. Never discard overdue items.
  unseen.sort((a,b)=>Number(b.lesson===state.lastLesson)-Number(a.lesson===state.lastLesson) || Number(state.completed.includes(b.lesson))-Number(state.completed.includes(a.lesson)));
  return [...due,...unseen].slice(0,limit);
}
export function practiceStats(state, day, course='') {
  const pool=questionBank.filter(q=>!course||q.course===course), rows=pool.map(q=>state.practiceReview?.[q.key]).filter(Boolean);
  return {total:pool.length,seen:rows.length,due:rows.filter(r=>r.due<=day).length,wrong:rows.filter(r=>r.wrong>0&&r.streak<4).length,attempts:rows.reduce((n,r)=>n+r.attempts,0),correct:rows.reduce((n,r)=>n+r.correct,0),today:rows.filter(r=>r.lastDay===day).length};
}
