import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,validateState,hoursFor,hoursUntil,loadState,storeState,today} from '../dist/core.js';
import {questionBank,practiceQueue,practiceStats,recordPractice} from '../dist/practice-core.js';
import {practicePage,practiceAction,resetPracticeSession} from '../dist/practice-view.js';
import {createStudySpace} from '../dist/study-space.js';
import {memoryStorage,cloudFixture,imageCache} from './cloud-fixture.js';

const items=questionBank.filter(q=>q.source==='prep'&&q.course==='POL1101');
const [first,second]=items;
const legacy=(planVersion)=>({
 version:1,...(planVersion?{planVersion}:{}),
 notes:{'POL1101-1':'original note'},completed:['POL1101-1'],
 prep:{POL1101:{answers:{[first.index]:(first.answer+1)%first.options.length,[second.index]:second.answer},submitted:false,best:null,last:null}}
});

test('date-keyed hour overrides survive backup and drive remaining-hour estimates',()=>{
 const s=freshState();s.hourOverrides={'2026-11-05':3,'2026-11-06':1};
 const storage=memoryStorage();assert.equal(storeState(storage,s),true);
 const loaded=loadState(storage).state;
 assert.equal(hoursFor(loaded,'2026-11-05'),3);assert.equal(hoursFor(loaded,'2026-11-06'),1);assert.equal(hoursFor(loaded,'2026-11-07'),2);
 assert.equal(hoursUntil(loaded,'2026-11-05','2026-11-08'),6);
 loaded.hours.weekday=4;assert.equal(hoursFor(loaded,'2026-11-05'),3);assert.equal(hoursFor(loaded,'2026-11-09'),4);
 assert.deepEqual(validateState(loaded),loaded);
});

test('old single-date hours migrate once; valid map values win and invalid values are dropped',()=>{
 const s=validateState({version:1,planVersion:2,todayHours:{date:'2026-11-05',hours:3},hourOverrides:{'2026-11-06':1,'2026-02-31':4,'bad':2,'2026-11-07':9,'2026-11-08':'2'}});
 assert.deepEqual(s.hourOverrides,{'2026-11-05':3,'2026-11-06':1});
 assert.equal(s.todayHours,undefined);assert.deepEqual(validateState(s),s);
 assert.equal(validateState({...s,todayHours:{date:'2026-11-05',hours:4}}).hourOverrides['2026-11-05'],3);
 assert.deepEqual(validateState({version:1,planVersion:2,todayHours:{date:'2026-02-31',hours:4}}).hourOverrides,{});
});

for(const version of [undefined,2])test('unfinished legacy answers recover without fabricated results, plan version '+version,()=>{
 const raw=legacy(version),before=structuredClone(raw),s=validateState(raw);
 assert.deepEqual(raw,before);assert.deepEqual(s.prep,raw.prep);assert.deepEqual(s.notes,raw.notes);assert.deepEqual(s.completed,raw.completed);
 assert.deepEqual(s.practiceReview,{});assert.deepEqual(s.legacyPracticePending,[first.key,second.key]);
 assert.deepEqual(practiceQueue(s,{mode:'due',day:'2026-11-05'}).map(q=>q.key),[first.key,second.key]);
 assert.deepEqual(practiceQueue(s,{mode:'daily',day:'2026-11-05',limit:2}).map(q=>q.key),[first.key,second.key]);
 const stats=practiceStats(s,'2026-11-05');assert.equal(stats.pending,2);
 for(const key of ['seen','attempts','correct','wrong','today','due'])assert.equal(stats[key],0,key);
 assert.deepEqual(practiceQueue(s,{mode:'mistakes',day:'2026-11-05'}),[]);
 assert.equal(practiceQueue(s,{course:'POL2200',mode:'due',day:'2026-11-05'}).length,0);
 assert.equal(s.practiceMigrationVersion,1);assert.deepEqual(validateState(s),s);
});

test('old last and best scores cannot prove an unfinished set was submitted',()=>{
 const raw=legacy(2);raw.prep.POL1101.last=7;raw.prep.POL1101.best=8;
 const s=validateState(raw);assert.deepEqual(s.practiceReview,{});assert.equal(s.legacyPracticePending.length,2);
 assert.equal(s.prep.POL1101.last,7);assert.equal(s.prep.POL1101.best,8);
});

test('existing review history is preserved, invalid candidates dropped and repair is idempotent',()=>{
 const raw=legacy(2);const existing=freshState();recordPractice(existing,first.key,first.answer,'2026-11-03');
 raw.practiceReview=structuredClone(existing.practiceReview);
 raw.legacyPracticePending=[first.key,second.key,second.key,'missing','lesson:POL1101-1:0',null];
 const s=validateState(raw);assert.deepEqual(s.practiceReview,existing.practiceReview);assert.deepEqual(s.legacyPracticePending,[second.key]);
 assert.deepEqual(validateState(s),s);
 assert.equal(recordPractice(s,second.key,99,'2026-11-05'),null);assert.deepEqual(s.legacyPracticePending,[second.key]);
 recordPractice(s,second.key,second.answer,'2026-11-05');
 assert.deepEqual(s.legacyPracticePending,[]);assert.equal(s.practiceReview[second.key].attempts,1);assert.equal(s.practiceReview[second.key].lastDay,'2026-11-05');
 assert.deepEqual(validateState(s),s);
 assert.deepEqual(s.prep,raw.prep);
});

test('post-migration unfinished exams are not imported on each save or reload',()=>{
 const s=freshState();s.prep=legacy(2).prep;
 const back=validateState(s);assert.deepEqual(back.practiceReview,{});assert.deepEqual(back.legacyPracticePending,[]);
});

test('recovered queue explains its status and counts only a newly answered attempt',()=>{
 const s=validateState(legacy(2));resetPracticeSession();
 const html=practicePage(s,'due');assert.ok(html.includes('มีคำตอบเก่าที่บันทึกค้างไว้ 2 ข้อ'));
 assert.ok(html.includes('ยังไม่นับเป็นครั้งฝึกหรือคะแนนจนกว่าจะตอบใหม่'));
 assert.equal(practiceAction('practice-answer',{value:String(first.answer)},s),true);
 assert.equal(s.practiceReview[first.key].attempts,1);assert.equal(s.practiceReview[first.key].lastDay,today());
 assert.deepEqual(s.legacyPracticePending,[second.key]);assert.equal(practiceStats(s,today()).pending,1);
 assert.equal(practiceAction('practice-answer',{value:String(first.answer)},s),false);
 assert.equal(s.practiceReview[first.key].attempts,1);resetPracticeSession();
});

test('hours and repaired legacy candidates survive synthetic cloud save and separate-device reload',async()=>{
 const cloud=cloudFixture();const make=()=>createStudySpace({storage:memoryStorage(),progress:freshState(),clientFactory:()=>cloud.client,imageStore:imageCache()});
 const a=make(),b=make();
 try{
  await a.init();const s=validateState(legacy(2));s.hourOverrides={'2026-11-05':3,'2026-11-06':1};
  a.saveProgress(s);await a.sync();await b.init();const back=b.snapshot().progress;
  assert.deepEqual(back.hourOverrides,s.hourOverrides);assert.deepEqual(back.legacyPracticePending,s.legacyPracticePending);
  assert.deepEqual(back.prep,s.prep);assert.deepEqual(back.practiceReview,{});
  assert.deepEqual(validateState(back),back);
 }finally{a.dispose();b.dispose();}
});
