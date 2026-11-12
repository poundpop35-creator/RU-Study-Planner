import test from 'node:test';import assert from 'node:assert/strict';
import {afterPlan,mayConfirm,weekView} from '../dist/after-class.js';
import {freshState,validateState} from '../dist/core.js';
test('the first meeting must end and each course needs its own actual attendance date',()=>{
 const s=freshState();assert.equal(afterPlan(s,'2026-11-20').minutes,0);
 assert.equal(mayConfirm('POL1101','2026-11-16',new Date('2026-11-16T13:39:00+07:00')),false);
 assert.ok(mayConfirm('POL1101','2026-11-16',new Date('2026-11-16T13:40:00+07:00')));
 s.firstHeard.POL2104='2026-11-18';s.firstHeard.POL2106='2026-11-21';
 assert.equal(afterPlan(s,'2026-11-17').minutes,0);
 let p=afterPlan(s,'2026-11-18');assert.deepEqual(p.allowed,['POL2104']);assert.equal(p.minutes,60);
 assert.equal(p.lectures.filter(x=>x.clash).length,2);assert.equal(p.blocks[1].href,'#lesson/POL2104-1');
 s.readCourse['2026-11-21']='POL2106';s.readExtra['2026-11-21']=true;p=afterPlan(validateState(s),'2026-11-21');
 assert.equal(p.minutes,120);assert.equal(p.code,'POL2106');assert.equal(afterPlan(s,'2026-11-22').minutes,60);
 s.planDone[p.day]=[p.blocks[0].id];assert.equal(afterPlan(validateState(s),p.day).done,1);
});
test('weekly preview follows the actual first Friday and the amended Thursday',()=>{
 const s=freshState();assert.ok(afterPlan(s,'2026-11-20').lectures.some(x=>x.course==='POL2200'&&x.room==='VPB 401'));
 assert.ok(afterPlan(s,'2026-11-26').lectures.some(x=>x.course==='POL2200'&&x.room==='VPB 501'));
 assert.ok(!afterPlan(s,'2026-11-27').lectures.some(x=>x.course==='POL2200'));assert.match(weekView('2026-11-16'),/POL1101/);
});
