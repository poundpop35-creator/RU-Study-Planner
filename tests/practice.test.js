import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,validateState,dailyPlan,addDays} from '../dist/core.js';
import {questionBank,recordPractice,practiceQueue} from '../dist/practice-core.js';
import {createStudySpace} from '../dist/study-space.js';
import {memoryStorage,cloudFixture,imageCache} from './cloud-fixture.js';
import {universityDocuments} from '../dist/documents.js';
import {readFile} from 'node:fs/promises';

test('November plan starts on the requested date, covers seven subjects and includes reading + questions every day',()=>{
 const s=freshState();assert.deepEqual(dailyPlan(s,'2026-10-31').blocks,[]);
 const seen=new Set();
 for(let d='2026-11-01';d<'2026-11-08';d=addDays(d,1)){
  const p=dailyPlan(s,d);assert.equal(p.minutes,120);seen.add(p.blocks.find(b=>b.id==='main').course);
  assert.ok(p.blocks.some(b=>b.href?.startsWith('#lesson/')));
  assert.ok(p.blocks.some(b=>/^#practice\/POL/.test(b.href)));
 }
 assert.equal(seen.size,7);
});
test('wrong items reappear, successful recall schedules 1/3/7/14 days, and same-day repeats do not advance the interval',()=>{
 const s=freshState(),q=questionBank[0],wrong=(q.answer+1)%q.options.length;
 recordPractice(s,q.key,wrong,'2026-11-01');assert.ok(practiceQueue(s,{mode:'mistakes',day:'2026-11-01'}).some(x=>x.key===q.key));
 recordPractice(s,q.key,q.answer,'2026-11-01');assert.equal(s.practiceReview[q.key].due,'2026-11-02');
 recordPractice(s,q.key,q.answer,'2026-11-01');assert.equal(s.practiceReview[q.key].streak,1);
 assert.equal(practiceQueue(s,{mode:'due',day:'2026-11-01'}).length,0);
 recordPractice(s,q.key,q.answer,'2026-11-02');assert.equal(s.practiceReview[q.key].due,'2026-11-05');
 recordPractice(s,q.key,q.answer,'2026-11-05');assert.equal(s.practiceReview[q.key].due,'2026-11-12');
 recordPractice(s,q.key,q.answer,'2026-11-12');assert.equal(s.practiceReview[q.key].due,'2026-11-26');
 recordPractice(s,q.key,wrong,'2026-11-26');assert.equal(s.practiceReview[q.key].streak,0);
 assert.equal(s.practiceReview[q.key].wrong,2);
});
test('legacy migration preserves notes, scores and IDs while adopting two-hour defaults; next save is idempotent',()=>{
 const old={version:1,notes:{'POL1101-1':'โน้ตเดิม'},completed:['POL1101-1'],answers:{'POL1101-1:0':0},hours:{weekday:2,weekend:4},prep:{POL1101:{answers:{0:1},submitted:true,best:7,last:0}}};
 const s=validateState(old);assert.equal(s.notes['POL1101-1'],'โน้ตเดิม');assert.equal(s.prep.POL1101.best,7);assert.deepEqual(s.hours,{weekday:2,weekend:2});assert.ok(s.practiceReview['lesson:POL1101-1:0']);assert.ok(s.practiceReview['prep:POL1101:0']);assert.deepEqual(validateState(s),s);
 const bad=structuredClone(s);bad.practiceReview['lesson:POL1101-1:0'].due='2026-02-31';assert.ok(!validateState(bad).practiceReview['lesson:POL1101-1:0']);
});
test('practice answers, due dates and daily completion survive cloud round trip to a separate device',async()=>{
 const cloud=cloudFixture();const make=()=>createStudySpace({storage:memoryStorage(),progress:freshState(),clientFactory:()=>cloud.client,imageStore:imageCache()});
 const a=make();await a.init();const s=freshState();recordPractice(s,questionBank[0].key,questionBank[0].answer,'2026-11-01');s.planDone['2026-11-01']=['main','second'];a.saveProgress(s);await a.sync();
 const b=make();await b.init();assert.deepEqual(b.snapshot().progress.practiceReview,s.practiceReview);assert.deepEqual(b.snapshot().progress.planDone,s.planDone);a.dispose();b.dispose();
});
test('university documents use real local PDFs or a verified official university URL',async()=>{
 for(const doc of universityDocuments){if(doc.file.startsWith('https://')){assert.equal(new URL(doc.file).hostname,'www.ru.ac.th');assert.equal(doc.file,doc.original);continue;}const bytes=await readFile(new URL('../dist/'+doc.file,import.meta.url));assert.equal(bytes.subarray(0,5).toString(),'%PDF-',doc.id);}
});
