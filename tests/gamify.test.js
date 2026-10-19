import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../dist/core.js';
import {lessons} from '../dist/lessons.js';
import {prep} from '../dist/prep.js';
import {recordPractice} from '../dist/practice-core.js';
import {XP,LEVELS,xpParts,xpTotal,levelInfo,bestStreak,weekDays,badges,nextBadge} from '../dist/gamify.js';

const wrong=q=>(q.answer+1)%q.options.length;

test('XP comes only from saved progress and counts each source once',()=>{
 const s=freshState();assert.equal(xpTotal(s),0);
 const l=lessons[0],code=Object.keys(prep)[0],[q0,q1]=l.questions;
 s.completed=[l.id];
 recordPractice(s,`lesson:${l.id}:0`,q0.answer,'2026-11-02');
 recordPractice(s,`lesson:${l.id}:0`,q0.answer,'2026-11-03');
 recordPractice(s,`lesson:${l.id}:1`,wrong(q1),'2026-11-02');
 recordPractice(s,`prep:${code}:0`,prep[code].questions[0].answer,'2026-11-02');
 s.reviews[`${l.id}:0`]={due:'2026-11-04',level:0};
 s.planDone={'2026-11-02':['cards','main'],'2026-11-03':['explain']};
 assert.deepEqual(xpParts(s),{lessons:XP.lesson,questions:2*XP.question,repeats:XP.repeat,cards:XP.card,blocks:3*XP.block});
 assert.equal(xpTotal(s),XP.lesson+2*XP.question+XP.repeat+XP.card+3*XP.block);
});

test('retrying a quiz or clearing a mock set does not take back question XP',()=>{
 const s=freshState(),l=lessons[0],code=Object.keys(prep)[0];
 s.answers[`${l.id}:0`]=l.questions[0].answer;recordPractice(s,`lesson:${l.id}:0`,l.questions[0].answer,'2026-11-02');
 s.prep[code]={answers:{0:prep[code].questions[0].answer},submitted:true,best:1,last:1};recordPractice(s,`prep:${code}:0`,prep[code].questions[0].answer,'2026-11-02');
 const before=xpTotal(s);
 delete s.answers[`${l.id}:0`];s.prep[code]={answers:{},submitted:false,best:1,last:1};
 assert.equal(xpTotal(s),before);
});

test('levels climb at the listed thresholds and stop at the top level',()=>{
 assert.equal(levelInfo(0).level,1);assert.equal(levelInfo(99).level,1);assert.equal(levelInfo(100).level,2);
 const mid=levelInfo(200);assert.equal(mid.toNext,100);assert.equal(mid.percent,50);
 const top=levelInfo(LEVELS.at(-1)[0]+5000);assert.equal(top.level,LEVELS.length);assert.equal(top.next,null);assert.equal(top.percent,100);
 assert.ok(LEVELS.every(([min],i)=>i===0||min>LEVELS[i-1][0]));
});

test('best streak and the week strip read the same active days as the daily streak',()=>{
 const s=freshState();
 s.planDone={'2026-11-02':['main'],'2026-11-03':['main'],'2026-11-04':['cards'],'2026-11-06':['wrap'],'2026-11-05':[]};
 s.sessions=[{lesson:lessons[0].id,date:'2026-11-07'}];
 assert.equal(bestStreak(s),3);
 const week=weekDays(s,'2026-11-06');
 assert.deepEqual(week.map(d=>d.date),['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
 assert.deepEqual(week.map(d=>d.active),[true,true,true,false,true,true,false]);
 assert.ok(week[4].today);assert.ok(week[5].future);assert.ok(!week[3].future);
});

test('badges unlock from real progress and the next badge is the closest unearned one',()=>{
 const s=freshState();
 assert.equal(badges(s).length,12);assert.ok(badges(s).every(b=>!b.earned&&b.have===0));
 s.completed=lessons.filter(l=>l.course===lessons[0].course).map(l=>l.id);
 const by=Object.fromEntries(badges(s).map(b=>[b.id,b]));
 assert.ok(by.first.earned);assert.ok(by.course.earned);assert.equal(by.all.earned,false);assert.equal(by.all.have,s.completed.length);
 const next=nextBadge(s);assert.ok(next&&!next.earned);
 for(const b of badges(s).filter(b=>!b.earned))assert.ok(b.have/b.need<=next.have/next.need);
});
