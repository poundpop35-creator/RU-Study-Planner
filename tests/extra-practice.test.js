import test from 'node:test';
import assert from 'node:assert/strict';
import {courses} from '../dist/data.js';
import {freshState,validateState} from '../dist/core.js';
import {originalExamPractice} from '../dist/extra-practice.js';
import {questionBank,practiceQueue,practiceQuestion,practiceStats,recordPractice} from '../dist/practice-core.js';
import {practicePage,resetPracticeSession} from '../dist/practice-view.js';

const enrolled=courses.filter(c=>c.enrolled).map(c=>c.id);
test('extra practice covers all 7 registered POL courses, exactly 10 original questions each',()=>{
 assert.equal(enrolled.length,7);
 assert.equal(originalExamPractice.length,70);
 assert.deepEqual([...new Set(originalExamPractice.map(q=>q.course))].sort(),enrolled.slice().sort());
 for(const code of enrolled){
  const pool=originalExamPractice.filter(q=>q.course===code);
  assert.equal(pool.length,10,code);
  assert.deepEqual(pool.map(q=>q.key),Array.from({length:10},(_,i)=>'supplement:'+code+':'+i));
  assert.ok(new Set(pool.map(q=>q.answer)).size>=4,'vary correct-answer positions within '+code);
 }
});
test('each question is self-contained with a valid explanation; there are no repeated prompts or keys',()=>{
 const keys=new Set(),prompts=new Set();
 for(const q of questionBank){
  assert.ok(!keys.has(q.key),'duplicate key '+q.key);keys.add(q.key);
  assert.ok(!prompts.has(q.prompt),'duplicate question prompt '+q.prompt);prompts.add(q.prompt);
  if(q.source!=='supplement')continue;
  assert.equal(q.options.length,4,q.key);
  assert.ok(q.prompt.length>=32,q.key);
  assert.ok(q.explanation.length>=30,q.key);
  assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4,q.key);
  assert.ok(q.options.every(v=>typeof v==='string'&&v.length>5&&v.length<240),q.key);
  assert.equal(new Set(q.options).size,4,q.key);
  assert.equal(practiceQuestion(q.key),q);
 }
});
test('supplement-only route queues only enrolled course questions without losing existing questions',()=>{
 const state=freshState(),day='2026-11-20';
 for(const course of enrolled){
  const extra=practiceQueue(state,{course,source:'supplement',day,limit:15});
  assert.equal(extra.length,10,course);
  assert.ok(extra.every(q=>q.source==='supplement'&&q.course===course));
  assert.ok(practiceQueue(state,{course,day,limit:100}).length>10,course);
  assert.equal(practiceStats(state,day,course).total,questionBank.filter(q=>q.course===course).length);
  resetPracticeSession();
  const page=practicePage(state,'extra-'+course);
  assert.ok(page.includes('โจทย์สถานการณ์เพิ่มเติม · '+course));
  assert.ok(page.includes('ข้อ 1/10'));
  assert.ok(page.includes('โจทย์สถานการณ์แต่งใหม่'));
 }
});
test('answers to new questions sync through existing validated progress without changing legacy keys',()=>{
 const state=freshState(),q=originalExamPractice[0];
 const old=questionBank.find(x=>x.source==='prep'&&x.course===q.course);
 recordPractice(state,old.key,old.answer,'2026-11-20');
 recordPractice(state,q.key,q.answer,'2026-11-20');
 assert.ok(state.practiceReview[q.key].correct===1);
 const restored=validateState(state);
 assert.deepEqual(restored.practiceReview[q.key],state.practiceReview[q.key]);
 assert.deepEqual(restored.practiceReview[old.key],state.practiceReview[old.key]);
 assert.equal(practiceQueue(restored,{mode:'due',day:'2026-11-20',limit:100}).length,0);
});
test('external portal stays clearly marked as unverified and no new question is attributed to that site',()=>{
 resetPracticeSession();
 const page=practicePage(freshState(),'extra-POL1101');
 assert.ok(page.includes('https://ram-test-hub.com/?openExternalBrowser=1'));
 assert.ok(page.includes('ยังตรวจสอบรายวิชาและข้อสอบบนเว็บนี้ไม่ได้'));
 assert.ok(page.includes('ไม่ได้คัดลอกจาก Ram Test Hub'));
 assert.ok(page.includes('mjsheetramfree.com/pol1101/'));
 assert.ok(originalExamPractice.every(q=>q.source==='supplement'));
});
