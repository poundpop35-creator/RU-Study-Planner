import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarEvents,personalReplayEvents,scheduleICS} from '../dist/calendar-core.js';
import {freshState,validateState} from '../dist/core.js';
import {weeklyPlanner} from '../dist/weekly-planner.js';

test('replay sessions are derived from the actual lecture date plus two days',()=>{
 const first=calendarEvents({type:'replay',start:'2026-11-16',end:'2026-11-22'});
 const get=id=>first.find(x=>x.course===id);
 assert.equal(first.length,7);
 assert.deepEqual([get('POL1101').sourceDate,get('POL1101').date,get('POL1101').time],['2026-11-16','2026-11-18','20:00']);
 assert.equal(get('POL2303').date,'2026-11-19');
 assert.deepEqual(first.filter(x=>x.date==='2026-11-20').map(x=>x.course),['POL2301','POL2104','POL2106']);
 assert.equal(get('POL2107').date,'2026-11-21');
 assert.equal(get('POL2200').date,'2026-11-22');
 assert.equal(new Set(first.map(x=>x.key)).size,7);
});

test('POL2200 follows its real first-Friday then Thursday timetable and cancellation removes replay',()=>{
 const pol=calendarEvents({type:'replay',course:'POL2200'});
 assert.deepEqual(pol.slice(0,3).map(x=>[x.sourceDate,x.date]),[
  ['2026-11-20','2026-11-22'],['2026-11-26','2026-11-28'],['2026-12-03','2026-12-05']
 ]);
 const cancelled=personalReplayEvents({}, {start:'2027-01-22',end:'2027-01-22'});
 assert.equal(cancelled.length,0);
});

test('saved changes are validated and affect only the personal replay, not lectures',()=>{
 const s=freshState();
 s.replay['POL1101@2026-11-16']={date:'2026-11-19',time:'21:15',done:true};
 s.replay['POL2106@2026-11-18']={time:'25:99',done:true};
 s.replay['NOT-A-COURSE@2026-11-16']={done:true};
 const checked=validateState(s);
 assert.deepEqual(checked.replay['POL1101@2026-11-16'],s.replay['POL1101@2026-11-16']);
 assert.deepEqual(checked.replay['POL2106@2026-11-18'],{done:true});
 assert.equal(checked.replay['NOT-A-COURSE@2026-11-16'],undefined);
 const item=personalReplayEvents(checked.replay,{start:'2026-11-19',end:'2026-11-19'}).find(x=>x.course==='POL1101');
 assert.equal(item.startTime,'21:15');
 assert.equal(item.done,true);
 assert.equal(calendarEvents({type:'lecture',course:'POL1101'})[0].date,'2026-11-16');
 assert.equal(personalReplayEvents({}, {start:'2026-11-18',end:'2026-11-18'})[0].date,'2026-11-18');
});
test('simultaneous default replay slots are flagged without claiming their video lengths',()=>{
 const friday=personalReplayEvents({}, {start:'2026-11-20',end:'2026-11-20'});
 assert.equal(friday.length,3);
 assert.ok(friday.every(x=>x.overlap));
 const changed=personalReplayEvents({'POL2104@2026-11-18':{date:'2026-11-21',time:'21:00'}},
  {start:'2026-11-20',end:'2026-11-20'});
 assert.equal(changed.length,2);
 assert.ok(changed.every(x=>x.overlap));
 const saturday=personalReplayEvents({'POL2104@2026-11-18':{date:'2026-11-21',time:'21:00'}},
  {start:'2026-11-21',end:'2026-11-21'});
 assert.equal(saturday.find(x=>x.course==='POL2104').startTime,'21:00');
});
test('calendar export of personal replays uses Asia/Bangkok and leaves official feeds unchanged',()=>{
 const exportText=scheduleICS({type:'replay',course:'POL1101',replay:{'POL1101@2026-11-16':{time:'21:15'}}}).replace(/\r\n /g,'');
 assert.ok(exportText.includes('DTSTART:20261118T141500Z'));
 assert.ok(exportText.includes('DTEND:20261118T151500Z'));
 assert.ok(exportText.includes('STATUS:TENTATIVE'));
 assert.ok(exportText.includes('ondemand.ru.ac.th'));
 assert.ok(exportText.includes('UID:replay-POL1101-2026-11-16@ru-study-planner'));
 assert.ok(!scheduleICS().includes('เริ่มดูคลิปย้อนหลัง'));
});
test('mobile-friendly weekly replay view lists every clip and editable controls',()=>{
 const html=weeklyPlanner('replay',freshState(),'2026-11-19',true);
 assert.ok(html.includes('ตารางเรียนของฉัน'));
 assert.ok(html.includes('POL1101'));
 assert.ok(html.includes('POL2303'));
 assert.ok(html.includes('POL2104'));
 assert.ok(html.includes('POL2106'));
 assert.ok(html.includes('data-action="cal-replay-done"'));
 assert.ok(html.includes('class="replay-date"'));
 assert.ok(html.includes('class="replay-time-input"'));
 assert.ok(html.includes('unified-replay'));
 assert.ok(html.includes('ondemand.ru.ac.th'));
 const disabled=weeklyPlanner('replay',freshState(),'2026-11-19',false);
 assert.ok(disabled.includes(' disabled'));
});

test('one weekly timetable combines original lecture and two-day replay in pastel blocks',()=>{
 const html=weeklyPlanner('first',freshState(),'2026-11-19',true);
 assert.match(html,/class="unified-weekday/);
 assert.match(html,/class="unified-lecture"/);
 assert.match(html,/class="unified-replay/);
 assert.ok(html.includes('POL1101'));
 assert.ok(html.includes('POL2301'));
 assert.ok(html.includes('data-action="cal-replay-done"'));
 assert.ok(html.includes('▶ POL1101'));
 assert.ok(html.includes('▶ POL2303'));
 assert.ok(html.includes('▶ POL2301'));
 assert.ok(html.includes('▶ POL2104'));
 assert.ok(html.includes('▶ POL2106'));
 assert.ok(html.includes('✓ ดูแล้ว')===false);
 assert.equal((html.match(/class="unified-weekday /g)||[]).length,7);
 const state=freshState();state.replay['POL1101@2026-11-16']={done:true};
 const done=weeklyPlanner('first',state,'2026-11-19',true);
 assert.ok(done.includes('✓ ดูแล้ว'));
 assert.ok(done.includes('ดูแล้ว 1/7 คลิป'));
});

test('recorded sessions stay in the same weekly layout after shifting dates and retain their check status',()=>{
 const state=freshState();state.replay['POL2104@2026-11-18']={date:'2026-11-21',time:'22:00',done:true};
 const html=weeklyPlanner('first',state,'2026-11-19',true);
 assert.ok(html.includes('22:00 · ย้อนหลัง'));
 assert.ok(html.includes('value="2026-11-21"'));
 assert.ok(html.includes('ดูแล้ว 1/7'));
 assert.ok(html.includes('POL2104'));
});

test('manual full calendar export includes recorded sessions while public subscribed feed stays official-only',()=>{
 const personal=scheduleICS({type:'all',includeReplay:true,replay:{'POL1101@2026-11-16':{time:'21:15'}}});
 assert.ok(personal.includes('เริ่มดูคลิปย้อนหลัง'));
 assert.ok(personal.includes('DTSTART:20261118T141500Z'));
 assert.ok(personal.includes('DTSTART:20261116T041000Z'));
 assert.ok(personal.includes('DTSTART;VALUE=DATE:20270310'));
 assert.ok(!scheduleICS({type:'all'}).includes('เริ่มดูคลิปย้อนหลัง'));
});

test('unified inline weekly view includes live and saved replay sessions without its own second panel',()=>{
 const s=freshState();s.replay['POL1101@2026-11-16']={done:true};
 const html=weeklyPlanner('inline',s,'2026-11-19',true);
 assert.ok(html.includes('unified-weekly'));
 assert.ok(html.includes('unified-lecture'));
 assert.ok(html.includes('unified-replay'));
 assert.ok(html.includes('✓ ดูแล้ว'));
 assert.ok(!html.includes('class="panel"'),'weekly widget must be embedded inside one calendar panel');
});
