import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarEvents,defaultWeekendReplays,personalReplayEvents,personalSkimEvents,scheduleICS} from '../dist/calendar-core.js';
import {freshState,validateState} from '../dist/core.js';
import {weeklyPlanner,timelinePosition} from '../dist/weekly-planner.js';

const deepWeek=()=>calendarEvents({type:'replay',start:'2026-11-16',end:'2026-11-22'});
const skimOn=date=>personalSkimEvents({}, {start:date,end:date});

test('Friday 20 Nov is still a live POL2200 lecture; every Friday from 27 Nov is free of live classes',()=>{
 const first=calendarEvents({type:'lecture',start:'2026-11-20',end:'2026-11-20'});
 assert.ok(first.some(x=>x.course==='POL2200'&&x.startTime==='13:30'));
 for(const date of ['2026-11-27','2026-12-04','2026-12-11']){
  assert.deepEqual(calendarEvents({type:'lecture',start:date,end:date}).filter(x=>x.type==='lecture'),[]);
 }
 const thursday=calendarEvents({type:'lecture',start:'2026-11-26',end:'2026-11-26'});
 assert.ok(thursday.some(x=>x.course==='POL2200'&&x.room==='VPB 501'));
});

test('first weekend balances four 75-minute Saturday clips and three 100-minute Sunday clips',()=>{
 const rows=deepWeek();
 assert.equal(rows.length,7);
 const sat=rows.filter(x=>x.date==='2026-11-21');
 const sun=rows.filter(x=>x.date==='2026-11-22');
 assert.deepEqual(sat.map(x=>x.course),['POL2106','POL2104','POL1101','POL2303']);
 assert.deepEqual(sat.map(x=>x.startTime),['09:00','10:30','13:00','14:30']);
 assert.deepEqual(sun.map(x=>x.course),['POL2301','POL2107','POL2200']);
 assert.deepEqual(sun.map(x=>x.startTime),['10:00','13:00','16:00']);
 assert.equal(sat.reduce((sum,x)=>sum+x.durationMinutes,0),300);
 assert.equal(sun.reduce((sum,x)=>sum+x.durationMinutes,0),300);
 assert.equal(rows[0].course,'POL2106','first serious session must be political philosophy');
 assert.deepEqual([sun.at(-1).sourceDate,sun.at(-1).availableOn],['2026-11-20','2026-11-22']);
});

test('deep sessions never precede the two-day estimated availability window',()=>{
 const all=defaultWeekendReplays();
 assert.ok(all.length>50);
 const seen=new Set();
 for(const item of all){
  const weekday=new Date(item.date+'T12:00:00Z').getUTCDay();
  assert.ok([0,6].includes(weekday),'deep watching only on Saturday or Sunday');
  assert.ok(item.date>=item.availableOn,'watching must not start before estimated upload');
  assert.ok(item.durationMinutes>=60&&item.durationMinutes<=120);
  assert.ok(!seen.has(item.key),'one deep session per recorded lecture');
  seen.add(item.key);
 }
 const changed=personalReplayEvents({'POL2106@2026-11-18':{time:'15:15',done:true}});
 assert.equal(changed.find(x=>x.key==='POL2106@2026-11-18').done,true);
 assert.equal(changed.find(x=>x.key==='POL2106@2026-11-18').endTime,'16:30');
});

test('weekday light listening starts 20:00 and never marks weekend serious watching as done',()=>{
 const wed=skimOn('2026-11-18');
 const thu=skimOn('2026-11-19');
 assert.equal(wed.length,1);
 assert.equal(thu.length,1);
 assert.ok([...wed,...thu].every(x=>x.startTime==='20:00'&&x.durationMinutes===40&&x.type==='skim'));
 assert.deepEqual(skimOn('2026-11-21'),[]);
 assert.deepEqual(skimOn('2026-11-22'),[]);
 const firstFriday=skimOn('2026-11-20');
 assert.deepEqual(firstFriday.map(x=>x.startTime),['20:00','20:45','21:30']);
 assert.equal(firstFriday[0].course,'POL2106');
 assert.equal(personalReplayEvents({}, {start:'2026-11-21',end:'2026-11-21'}).find(x=>x.course==='POL2106').done,false);
});

test('Friday 27 Nov and later start POL2106 in a daytime slot while Friday live remains empty',()=>{
 const friday=skimOn('2026-11-27');
 assert.deepEqual(friday.map(x=>x.startTime),['10:00','13:00','15:00']);
 assert.deepEqual(friday.map(x=>x.durationMinutes),[60,45,45]);
 assert.equal(friday[0].course,'POL2106');
 assert.equal(friday[0].sourceDate,'2026-11-25');
 assert.ok(friday.every(x=>x.availableOn<=x.date));
 const next=skimOn('2026-12-04');
 assert.equal(next[0].course,'POL2106');
 assert.equal(next[0].startTime,'10:00');
 assert.equal(next[0].sourceDate,'2026-12-02');
});

test('reviewed and serious-watch flags validate independently and survive reload',()=>{
 const s=freshState(),key='POL2106@2026-11-18';
 s.skimDone[key]=true;
 s.replay[key]={done:false,date:'2026-11-22',time:'16:00'};
 const checked=validateState(JSON.parse(JSON.stringify(s)));
 assert.equal(checked.skimDone[key],true);
 assert.equal(checked.replay[key].done,undefined);
 assert.equal(personalSkimEvents(checked.skimDone,{start:'2026-11-20',end:'2026-11-20'})[0].done,true);
 assert.equal(personalReplayEvents(checked.replay,{start:'2026-11-22',end:'2026-11-22'}).find(x=>x.course==='POL2106').done,false);
 assert.deepEqual(validateState({...checked,skimDone:{'NOT-A-COURSE@2026-11-18':true}}).skimDone,{});
 assert.equal(calendarEvents({type:'lecture',course:'POL2106'})[0].date,'2026-11-18');
});

test('saved deep-watch date and time remain adjustable, but cannot move before estimated availability',()=>{
 const key='POL2106@2026-11-18';
 const altered=personalReplayEvents({[key]:{date:'2026-11-19',time:'16:40',done:true}},
  {start:'2026-11-20',end:'2026-11-23'});
 const row=altered.find(x=>x.key===key);
 assert.ok(row);
 assert.equal(row.date,'2026-11-21','too-early manual dates are repaired');
 assert.equal(row.startTime,'16:40');
 assert.equal(row.endTime,'17:55');
 assert.equal(row.done,true);
 const moved=personalReplayEvents({[key]:{date:'2026-11-22',time:'18:00'}},
  {start:'2026-11-22',end:'2026-11-22'});
 assert.equal(moved[0].date,'2026-11-22');
 assert.equal(moved[0].startTime,'18:00');
});

test('ICS exports use actual planned session durations, separate recurring types and no fake university events',()=>{
 const deep=scheduleICS({type:'replay',course:'POL2106'}).replace(/\r\n /g,'');
 assert.ok(deep.includes('DTSTART:20261121T020000Z'));
 assert.ok(deep.includes('DTEND:20261121T031500Z'),'75 minutes, not an arbitrary one-hour reminder');
 assert.ok(deep.includes('ดูคลิปจริงจัง POL2106'));
 const skim=scheduleICS({type:'skim',course:'POL2106'}).replace(/\r\n /g,'');
 assert.ok(skim.includes('DTSTART:20261120T130000Z'));
 assert.ok(skim.includes('DTEND:20261120T134000Z'));
 assert.ok(skim.includes('ทวนเบา ๆ POL2106'));
 const all=scheduleICS({type:'all',includeReplay:true});
 assert.ok(all.includes('ดูคลิปจริงจัง'));
 assert.ok(all.includes('ทวนเบา ๆ'));
 assert.ok(all.includes('DTSTART:20261116T041000Z'),'original university live slot still present');
 assert.ok(!scheduleICS({type:'all'}).includes('ดูคลิปจริงจัง'));
});

test('unified weekly calendar preserves hour columns, live lessons and two different study status buttons',()=>{
 const first=weeklyPlanner('inline',freshState(),'2026-11-19',true);
 assert.ok(first.includes('unified-weekly'));
 assert.ok(first.includes('unified-lecture'));
 assert.ok(first.includes('unified-deep'));
 assert.ok(first.includes('unified-skim'));
 assert.ok(first.includes('data-action="cal-replay-done"'));
 assert.ok(first.includes('data-action="cal-skim-done"'));
 assert.ok(first.includes('▶ POL2106'));
 assert.ok(first.includes('↻ POL2106'));
 assert.equal((first.match(/class="unified-weekday /g)||[]).length,7);
 for(const hour of ['09:00','11:00','13:00','15:00','17:00','19:00','21:00','23:00','01:00 +1'])assert.ok(first.includes('>'+hour+'</span>'),hour);
 assert.equal(timelinePosition('20:00'),68.75);
 assert.ok(!first.includes('class="panel"'),'one integrated weekly timetable');
 const friday=weeklyPlanner('inline',freshState(),'2026-11-27',true);
 assert.ok(friday.includes('10:00–11:00 · ทวนเบา ๆ'),'Friday POL2106 should be in daylight');
 assert.ok(friday.includes('ศุกร์ 27 พ.ย.'));
 assert.ok(friday.includes('data-action="cal-scroll-time" data-target="day"'));
});

test('one saved light flag leaves deep watching independently undone',()=>{
 const state=freshState(),key='POL2106@2026-11-18';
 state.skimDone[key]=true;
 let html=weeklyPlanner('first',state,'2026-11-19',true);
 assert.ok(html.includes('✓ ทวนแล้ว'));
 assert.ok(html.includes('○ ยังไม่ดู'));
 assert.ok(html.includes('ทวนแล้ว 1/5'));
 assert.ok(html.includes('ดูจริงจัง 0/7'));
 state.replay[key]={done:true};
 html=weeklyPlanner('first',state,'2026-11-19',true);
 assert.ok(html.includes('✓ ดูจบแล้ว'));
 assert.ok(html.includes('ดูจริงจัง 1/7'));
});
