// Render/event integration against a minimal host. Not a layout or browser E2E test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {lessons} from '../dist/lessons.js';
import {prep} from '../dist/prep.js';
import {practiceQuestion} from '../dist/practice-core.js';
import {escapeHTML,today,STUDY_START} from '../dist/core.js';
import {activityMonth} from '../dist/calendar-core.js';

import {cloudFixture,personalFetcher} from './cloud-fixture.js';
const fixture=cloudFixture();
globalThis.supabase={createClient:()=>fixture.client};
let allowCloud;const cloudReady=new Promise(resolve=>allowCloud=resolve),fetchPersonal=personalFetcher(fixture);
globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/personal-study/open'))await cloudReady;return fetchPersonal(url,options);};
const memory=new Map(),elements=new Map(),listeners={};
const element=()=>({dataset:{},innerHTML:'',textContent:'',value:'',hidden:false,files:[],classList:{add(){},remove(){},contains(){return false}},focus(){},scrollIntoView(){},append(){},remove(){},click(){}});
function get(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);}
globalThis.document={querySelector:get,getElementById:id=>get('#'+id),addEventListener:(type,fn)=>listeners[type]=fn,body:element(),documentElement:{dataset:{}},createElement:tag=>{
 if(tag!=='dialog')return element();
 const f={group:{},course:{},session:{},source:{value:'classroom'}};
 const d={...element(),querySelector:k=>k==='form'?{elements:f}:{},showModal(){this.returnValue='save';this.onclose();}};
 return d;
},title:''};
globalThis.location={hash:'#home'};
globalThis.window={localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},scrollY:0,scrollTo(){},addEventListener:(type,fn)=>listeners[type]=fn};
globalThis.confirm=()=>true;
const {appReady}=await import('../dist/app.js');
const beforeCloudHome=get('#main').innerHTML;
location.hash='#lesson/POL1101-1';listeners.hashchange();
const beforeCloudLesson=get('#main').innerHTML;
allowCloud();
await appReady;
const html=()=>get('#main').innerHTML;
const navigate=hash=>{location.hash=hash;listeners.hashchange();};
const click=(action,data={})=>listeners.click({target:{closest:()=>({dataset:{action,...data}})}});
const saved=()=>JSON.parse(memory.get('ru-study-workspace.v1:user-a')).payload.progress;

test('home and full lessons open before any private-space connection, without login forms',()=>{
 assert.ok(beforeCloudHome.includes('แผนอ่านส่วนตัว'));assert.ok(beforeCloudLesson.includes(lessons[0].title));
 for(const html of [beforeCloudHome,beforeCloudLesson]){assert.ok(!html.includes('account-signin'));assert.ok(!html.includes('account-google'));}
});

test('every main route and every lesson page renders without runtime errors',()=>{
 for(const route of ['home','practice','documents','courses','classroom','review','plan','registration','calendar','exams','resources','notes','account','about','settings','awards','menu']){navigate('#'+route);assert.ok(html().length>500,route);assert.ok(!html().includes('[object Object]'),route);assert.ok(!html().includes('undefined'),route);}
 for(const l of lessons){navigate('#lesson/'+l.id);assert.ok(html().includes(l.title),l.id);assert.ok(html().includes(l.example.analysis),l.id);assert.equal((html().match(/class="question-block"/g)||[]).length,0,l.id);}
 navigate('#lesson/missing');assert.ok(html().includes('ไม่พบหน้าที่เลือก'));
});

test('calendar filters, selected-day details, references and resource links work together',()=>{
 navigate('#calendar');assert.ok(html().includes('มีเวลาเรียนชนกัน 1 คู่'));assert.ok(html().includes('mr30-2-2569-p142-143.pdf'));
 click('cal-jump',{month:'2026-11'});click('cal-day',{date:'2026-11-18'});const details=html().match(/<article class="calendar-event lecture-event">.*?<\/article>/gs)||[];
 for(const [code,room,names] of [['POL2104','KLB 501',['NIPON','KRIANGCHAI']],['POL2106','VPB 501',['CHATCHAPHANU']]]){
  const row=details.find(x=>x.includes(code));assert.ok(row?.includes(room)&&names.every(name=>row.includes(name)),code);
 }
 click('cal-filter',{type:'exam'});click('cal-view',{view:'list'});assert.equal((html().match(/calendar-event exam-event/g)||[]).length,7);
 listeners.change({target:{id:'calendar-course',value:'POL2104'}});assert.equal((html().match(/calendar-event exam-event/g)||[]).length,1);assert.ok(html().includes('คาบ A'));assert.ok(html().includes('10 มี.ค. 2570'));
 navigate('#resources');assert.ok(html().includes('https://ondemand.ru.ac.th/'));assert.ok(html().includes('https://bookstore.ru.ac.th/'));assert.equal((html().match(/class="panel desk-course"/g)||[]).length,7);
 navigate('#course/POL1101');assert.ok(html().includes('11:10–13:40'));assert.ok(html().includes('https://bookstore.ru.ac.th/'));
});
test('switching exams back to classes leaves March and returns to the relevant lecture month',()=>{
 navigate('#calendar');listeners.change({target:{id:'calendar-course',value:''}});
 click('cal-filter',{type:'exam'});click('cal-view',{view:'month'});click('cal-day',{date:'2027-03-10'});
 click('cal-filter',{type:'lecture'});
 const label=new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(activityMonth('lecture')+'-01T12:00:00+07:00'));
 assert.ok(html().includes(label));assert.ok(html().includes('แตะวันที่เพื่อดูห้องเรียน เวลา และผู้สอน'));
 assert.ok(html().includes('calendar-chip lecture'));assert.ok(!html().includes('calendar-chip exam'));
 click('cal-jump',{month:'2027-03',type:'exam'});assert.ok(html().includes('calendar-chip exam'));
 click('cal-jump',{month:'2026-11',type:'lecture'});assert.ok(html().includes('calendar-chip lecture'));
});
test('pre-class material and actual classroom content are separate, and notes have a visible mobile menu',async()=>{
 navigate('#courses');assert.ok(html().includes('<h1>ติวก่อนเรียน</h1>'));assert.ok(html().includes('ไม่ใช่คำบรรยายหรือเอกสารของอาจารย์'));
 assert.ok(get('#bottom-nav').innerHTML.includes('href="#notes"'));assert.ok(get('#bottom-nav').innerHTML.includes('สมุดจด'));
 navigate('#classroom');assert.ok(html().includes('ห้องเรียนและสมุดจด'));assert.ok(html().includes('เอกสารหลักวิชา'));assert.ok(!html().includes('class="lesson-row'));
 assert.equal((html().match(/data-source="classroom"/g)||[]).length,7);
 click('nb-new',{course:'POL2301',source:'classroom'});await new Promise(r=>setImmediate(r));navigate(location.hash);
 assert.ok(get('#bottom-nav').innerHTML.includes('href="#notes" aria-current="page"'));
 assert.ok(html().includes('paper-app'));assert.ok(html().includes('data-paper="pen"'));
 navigate('#classroom');assert.ok(html().includes('classroom-note-link'),'classroom must link existing note');
  navigate('#notes');listeners.change({target:{id:'notebook-source',value:'classroom'}});assert.ok(html().includes('note-origin classroom'));
 listeners.change({target:{id:'notebook-source',value:''}});
});
test('notes save immediately and render as text, never executable user HTML',()=>{
 navigate('#lesson/POL1101-1');listeners.input({target:{id:'lesson-note',dataset:{lesson:'POL1101-1'},value:'<script>unsafe()</script>\nรัฐกับรัฐบาลต่างกัน'}});
 assert.equal(saved().notes['POL1101-1'],'<script>unsafe()</script>\nรัฐกับรัฐบาลต่างกัน');
 navigate('#notes');assert.ok(html().includes('&lt;script&gt;unsafe()&lt;/script&gt;'));assert.ok(!html().includes('<script>unsafe()'));
 navigate('#lesson/POL1101-1');assert.ok(html().includes('รัฐกับรัฐบาลต่างกัน'));
});
test('rich notebook page supports course-linked writing, formatting controls, images and recall',async()=>{
 navigate('#lesson/POL1101-1');assert.ok(html().includes('data-action="nb-from-lesson"'));
 click('nb-from-lesson',{lesson:'POL1101-1'});await new Promise(r=>setImmediate(r));assert.match(location.hash,/^#note\//);navigate(location.hash);
 for(const text of ['ไฮไลต์','เลือกและย้าย','แทรกรูป','คำถามทบทวน','paper-image-file','paper-question','POL1101'])assert.ok(html().includes(text),text);
 navigate('#notes');assert.ok(html().includes('ส่งออกโน้ตพร้อมรูป'));assert.ok(html().includes('POL1101'));click('nb-review');assert.ok(html().includes('ยังไม่มีคำถามจากโน้ต'));click('nb-review-close');
 navigate('#account');assert.ok(html().includes('พื้นที่กลางเดียวกันทุกเบราว์เซอร์'));assert.ok(!html().includes('member-email'));assert.ok(!html().includes('account-google'));assert.ok(!html().includes('account-signin'));assert.ok(!html().includes('URL Configuration'));
});
test('completion updates progress and remains reversible without changing earned credits',()=>{
 navigate('#lesson/POL1101-1');click('complete',{id:'POL1101-1'});assert.ok(saved().completed.includes('POL1101-1'));navigate('#course/POL1101');assert.ok(html().includes(`ติวแล้ว 1 / ${lessons.filter(l=>l.course==='POL1101').length} บท`));
 navigate('#registration');assert.ok(html().includes('สอบผ่านที่บันทึก 0 นก.'));navigate('#lesson/POL1101-1');click('complete',{id:'POL1101-1'});assert.ok(!saved().completed.includes('POL1101-1'));
});

test('search finds actual lesson content and displays a useful empty state',()=>{
 navigate('#courses');listeners.input({target:{id:'lesson-search',value:'ม่านแห่งความไม่รู้'}});assert.ok(get('#library-results').innerHTML.includes('POL2106-5'));
 listeners.input({target:{id:'lesson-search',value:'NONEXISTENT-TOPIC-XYZ'}});assert.ok(get('#library-results').innerHTML.includes('ยังไม่พบหัวข้อนี้'));
});
test('lesson pages open with the one-minute summary, analogy, memory hook and terms',()=>{
 for(const l of lessons){navigate('#lesson/'+l.id);const h=html();assert.ok(h.includes('เข้าใจใน 1 นาที'),l.id);for(const t of [l.easy.one,...l.easy.points,l.easy.analogy,l.easy.remember])assert.ok(h.includes(escapeHTML(t)),l.id);for(const [front] of l.easy.terms)assert.ok(h.includes(escapeHTML(front)),l.id);}
});
test('home with no first lectures confirmed points to the plan without assigning reading',()=>{
 navigate('#home');assert.match(html(),/แผนอ่านส่วนตัว/);assert.match(html(),/รอเรียนคาบแรกก่อนอ่าน/);
 assert.ok(!html().includes('data-action="block"'));assert.ok(html().includes('data-action="heard-first"'));
});
test('search covers the plain-language layer and textbook terms',()=>{
 navigate('#courses');listeners.input({target:{id:'lesson-search',value:'POSDCORB'}});assert.ok(get('#library-results').innerHTML.includes('POL2301-2'));
 listeners.input({target:{id:'lesson-search',value:''}});
});

test('plan date controls save completion under the selected date and university PDFs open in the app',()=>{
 navigate('#home');listeners.change({target:{id:'study-plan-date',value:'2026-11-05'}});
 assert.ok(html().includes('value="2026-11-05"'));click('block',{id:'explain'});assert.ok(saved().planDone['2026-11-05'].includes('explain'));
 navigate('#documents/curriculum');assert.ok(html().includes('iframe'));assert.ok(html().includes('https://www.ru.ac.th/th/Center_study_plan/21/09_69.pdf'));
 navigate('#exams');assert.equal((html().match(/class="exam-item /g)||[]).length,7);assert.equal((html().match(/รอแนวข้อสอบ/g)||[]).length,6);assert.ok(html().includes('#practice/POL2106'));
});

test('game layer: level chip, awards page and celebrations',()=>{
 navigate('#home');assert.ok(get('#top-stats').innerHTML.includes('Lv.'));assert.ok(html().includes('href="#awards"'));assert.ok(html().includes('class="start-resume"'));
 navigate('#awards');assert.ok(html().includes('รางวัลของฉัน'));assert.equal((html().match(/class="badge-card /g)||[]).length,12);
 navigate('#lesson/POL1101-1');assert.ok(html().includes('อ่านจบรับ +50 XP'));assert.ok(!html().includes('undefined'));
 click('complete',{id:'POL1101-1'});assert.ok(html().includes('อ่านจบบทนี้แล้ว'));assert.ok(html().includes('data-fresh'));
 navigate('#lesson/POL1101-1');assert.ok(!html().includes('data-fresh'),'only the changed element animates, once');
 click('complete',{id:'POL1101-1'});assert.ok(!saved().completed.includes('POL1101-1'));
});
test('five places on the phone bar, each page lights its place, and the more menu avoids repeating the main places',()=>{
 const bar=()=>get('#bottom-nav').innerHTML,current=key=>bar().includes(`href="#${key}" aria-current="page"`);
 navigate('#home');assert.equal((bar().match(/<a /g)||[]).length,5);for(const key of ['home','courses','plan','notes','menu'])assert.ok(bar().includes(`href="#${key}"`),key);
 for(const [route,place] of [['home','home'],['lesson/POL1101-1','courses'],['classroom','notes'],['practice','courses'],['review','courses'],['prep/POL2106','courses'],['calendar','plan'],['registration','plan'],['notes','notes'],['settings','menu'],['debt','menu']]){navigate('#'+route);assert.ok(current(place),route);assert.equal((bar().match(/aria-current/g)||[]).length,1,route);}
 navigate('#menu');for(const key of ['documents','awards','account','debt'])assert.ok(html().includes(`href="#${key}"`),key);
 for(const key of ['courses','plan','notes','settings','practice'])assert.ok(!html().includes(`href="#${key}"`),key);
 for(const route of ['courses','classroom','practice','review']){navigate('#'+route);assert.ok(html().includes('class="hub-tabs"'),route);assert.ok(html().includes(`href="#${route}" aria-current="page"`),route);}
 for(const route of ['plan','calendar','registration']){navigate('#'+route);assert.equal((html().match(/class="hub-tabs"/g)||[]).length,1,route);assert.ok(html().includes(`href="#${route}" aria-current="page"`),route);}
});
test('pre-class course page gives direct access to that course’s shared files',()=>{
 navigate('#course/POL2301');
 assert.ok(html().includes('data-action="nb-course-materials" data-course="POL2301"'));
 assert.ok(html().includes('ไฟล์หลักวิชา POL2301'));
});
test('the sidebar has one entry per section and every grouped page links to its siblings',()=>{
 const groups=[['courses','practice','review'],['notes','classroom'],['plan','calendar','registration'],['documents','resources','about'],['account','settings']];
 for(const pages of groups)for(const page of pages){
  navigate('#'+page);
  const side=get('#navigation').innerHTML;
  assert.equal((side.match(/class="nav-link /g)||[]).length,8);
  assert.ok(side.includes(`href="#${pages[0]}" aria-current="page"`),page);
  const tabs=html().match(/<nav class="hub-tabs"[^>]*>(.*?)<\/nav>/s)?.[1]||'';
  for(const sibling of pages)assert.ok(tabs.includes(`href="#${sibling}"`),sibling);
  assert.equal((tabs.match(/aria-current/g)||[]).length,1);
 }
});
test('the date and hour tools fold under the day plan and stay open while in use',async()=>{
 navigate('#home');listeners.toggle({target:{classList:{contains:c=>c==='plan-tools'},open:false}});navigate('#home');assert.ok(html().includes('<details class="plan-tools">'));
 await listeners.change({target:{id:'study-plan-date',value:'2026-11-05'}});assert.ok(html().includes('<details class="plan-tools" open>'));
 click('block',{id:'cards'});assert.ok(html().includes('<details class="plan-tools" open>'));click('block',{id:'cards'});
 click('plan-today');
});
test('editing two selected dates and defaults preserves each date-specific hour choice',async()=>{
 navigate('#home');await listeners.change({target:{id:'study-plan-date',value:'2026-11-05'}});click('hours',{value:'3'});
 await listeners.change({target:{id:'study-plan-date',value:'2026-11-06'}});click('hours',{value:'1'});
 assert.equal(saved().hourOverrides['2026-11-05'],3);assert.equal(saved().hourOverrides['2026-11-06'],1);
 await listeners.change({target:{id:'study-plan-date',value:'2026-11-05'}});assert.ok(html().includes('คำบรรยายและตำรา'));
 navigate('#settings');await listeners.change({target:{id:'hours-weekday',value:'4',classList:{contains:()=>false}}});
 assert.equal(saved().hourOverrides['2026-11-05'],3);assert.equal(saved().hourOverrides['2026-11-06'],1);
 navigate('#home');await listeners.change({target:{id:'study-plan-date',value:'2026-11-06'}});assert.ok(!html().includes('data-id="deep"'));
});

// Debt numbers live in progress.debt so they sync; every study field must stay as it was.
const sameStudy=(a,b)=>{const {debt:_a,...x}=a,{debt:_b,...y}=b;assert.deepEqual(x,y);};
test('debt partial payments sync with the study space without changing study data, and mistakes can be removed',()=>{
 navigate('#home');assert.ok(html().includes('href="#debt"'));
 const before=saved();navigate('#debt');
 assert.ok(html().includes('บัญชีละ 1,000 บาท'));assert.ok(!html().includes('S เริ่มเมื่อรายการอื่นหมด'));assert.ok(html().includes('<h1>แผนจัดการหนี้</h1>'));assert.ok(html().includes('140,723.55'));
 assert.ok(!html().includes('data-action="debt-toggle"'));assert.ok(html().includes('id="debt-payment-form"'));
 assert.ok(get('#navigation').innerHTML.includes('href="#debt" aria-current="page"'));
 assert.equal(get('#cloud-status-bar').hidden,false);
 const submit=amount=>{get('#debt-creditor').value='AEON';get('#debt-payment-amount').value=amount;listeners.submit({target:{id:'debt-payment-form'},preventDefault(){}});};
 submit('5');submit('1000');assert.ok(html().includes('139,718.55'));assert.ok(html().includes('2,995'));
 const entries=JSON.parse(memory.get('debtPayments_20261025_v1'));assert.equal(entries.length,2);assert.equal(saved().debt.debtPayments_20261025_v1,memory.get('debtPayments_20261025_v1'));sameStudy(saved(),before);
 submit('50000');assert.equal(get('#debt-payment-error').hidden,false);assert.equal(get('#debt-payment-amount').value,'50000');
 assert.equal(JSON.parse(memory.get('debtPayments_20261025_v1')).length,2);
 navigate('#home');assert.equal(get('#cloud-status-bar').hidden,false);navigate('#debt');assert.ok(html().includes('139,718.55'));
 click('debt-remove',{id:entries[0].id});assert.ok(html().includes('139,723.55'));sameStudy(saved(),before);
});

test('debt interest payment and editable forecast rates sync without touching study data',()=>{
 navigate('#debt');const before=saved();
 assert.ok(html().includes('ดอกเบี้ยและเงินที่ต้องเตรียมเพิ่ม'));assert.ok(html().includes('S รวม 7,900 บาท ไม่มีดอกเพิ่ม'));
 get('#debt-creditor').value='LINE';get('#debt-payment-amount').value='100';get('#debt-payment-interest').value='20';
 listeners.submit({target:{id:'debt-payment-form'},preventDefault(){}});
 const entries=JSON.parse(memory.get('debtPayments_20261025_v1'));assert.equal(entries.at(-1).amountCents,8000);assert.equal(entries.at(-1).interestCents,2000);
 for(const [key,value] of Object.entries({aeonUpper:'22',aeonCard:'16',line:'18',gold:'0.99'}))get('#debt-rate-'+key).value=value;
 listeners.submit({target:{id:'debt-rate-form'},preventDefault(){}});
 assert.equal(JSON.parse(memory.get('debtInterestRates_20261025_v1')).line,18);assert.equal(JSON.parse(saved().debt.debtInterestRates_20261025_v1).line,18);assert.ok(html().includes('value="18"'));sameStudy(saved(),before);
 navigate('#debt');assert.ok(html().includes('ค่าประกัน AEON อีก 1 รอบ'));assert.ok(html().includes('id="debt-payment-fee"'));
 get('#debt-creditor').value='AEON';get('#debt-payment-amount').value='600';get('#debt-payment-interest').value='0';get('#debt-payment-fee').value='600';
 listeners.submit({target:{id:'debt-payment-form'},preventDefault(){}});
 assert.equal(JSON.parse(memory.get('debtPayments_20261025_v1')).at(-1).feeCents,60000);assert.ok(!html().includes('ค่าประกัน AEON อีก 1 รอบ'));assert.ok(html().includes('จ่ายค่าประกัน/ค่าธรรมเนียมแล้ว 600 บาท'));sameStudy(saved(),before);
 get('#debt-payment-fee').value='0';
 get('#debt-rate-line').value='-1';listeners.submit({target:{id:'debt-rate-form'},preventDefault(){}});assert.equal(get('#debt-rate-error').hidden,false);assert.equal(JSON.parse(memory.get('debtInterestRates_20261025_v1')).line,18);
});


test('reading and registration are separate routes with independent controls and shared saved progress',()=>{
 const before=saved();navigate('#plan');
 assert.ok(html().includes('<h1>แผนอ่าน</h1>'));assert.ok(html().includes('id="study-plan-date"'));
 assert.ok(!html().includes('class="grade-select"'));assert.ok(!html().includes('id="transfer-general"'));
 assert.ok(html().includes('href="#registration"'));assert.ok(get('#bottom-nav').innerHTML.includes('href="#plan" aria-current="page"'));
 navigate('#registration');assert.ok(html().includes('<h1>แผนลงทะเบียน</h1>'));
 assert.ok(!html().includes('id="study-plan-date"'));assert.ok(!html().includes('id="hours-weekday"'));
 assert.equal((html().match(/class="grade-select"/g)||[]).length,7);
 assert.ok(get('#navigation').innerHTML.includes('href="#plan" aria-current="page"'));
 click('registration-term',{term:'1'});assert.ok(html().includes('aria-label="ย้าย POL2300"'));
 const mark=checked=>listeners.change({target:{classList:{contains:c=>c==='enrollment-check'},dataset:{course:'POL2300'},checked}});
 mark(true);assert.equal(saved().enrollment.POL2300,true);assert.ok(html().includes('aria-label="ลงทะเบียนแล้ว POL2300" checked'));
 mark(false);assert.equal(saved().enrollment.POL2300,false);assert.ok(!html().includes('aria-label="ลงทะเบียนแล้ว POL2300" checked'));
 listeners.change({target:{classList:{contains:c=>c==='move-select'},dataset:{course:'POL2300'},value:'2'}});
 assert.equal(saved().termMoves.POL2300,2);assert.ok(!html().includes('aria-label="ย้าย POL2300"'));
 click('registration-term',{term:'2'});assert.ok(html().includes('aria-label="ย้าย POL2300"'));
 listeners.change({target:{classList:{contains:c=>c==='move-select'},dataset:{course:'POL2300'},value:'1'}});
 click('registration-term',{term:'0'});
 listeners.change({target:{classList:{contains:c=>c==='grade-select'},dataset:{course:'POL1101'},value:'A'}});
 navigate('#plan');assert.deepEqual(saved().planDone,before.planDone);assert.deepEqual(saved().hourOverrides,before.hourOverrides);
 navigate('#registration');assert.ok(html().includes('<option selected>A</option>'));
 listeners.change({target:{classList:{contains:c=>c==='grade-select'},dataset:{course:'POL1101'},value:''}});
 click('registration-term',{term:'99'});assert.equal((html().match(/class="grade-select"/g)||[]).length,7);
 listeners.input({target:{id:'registration-search',value:'pol 3382'}});
 const found=get('#registration-search-results').innerHTML;assert.ok(found.includes('data-action="registration-find" data-term="4" data-course="POL3382"'));assert.ok(found.includes('ฤดูร้อน/2570'));
 listeners.input({target:{id:'registration-search',value:'zzz'}});assert.ok(get('#registration-search-results').innerHTML.includes('ไม่พบ'));
 listeners.input({target:{id:'registration-search',value:'3382'}});click('registration-find',{term:'4',course:'POL3382'});
 assert.ok(html().includes('<tr id="reg-row-POL3382" class="reg-hit">'));assert.ok(html().includes('value="3382"'));
 listeners.input({target:{id:'registration-search',value:''}});click('registration-term',{term:'0'});
});


test('recorded lecture timetable saves watched state and custom timing in existing shared progress',()=>{
 navigate('#calendar');click('cal-view',{view:'week'});
 assert.ok(html().includes('ตารางเรียน–สอบของฉัน'));assert.ok(html().includes('POL1101'));
 assert.ok(html().includes('POL2104'));assert.ok(html().includes('POL2106'));
 assert.ok(html().includes('unified-replay'));assert.ok(html().includes('unified-lecture'));
 const key='POL1101@2026-11-16';
 click('cal-replay-done',{key});assert.equal(saved().replay[key].done,true);
 const change=(cls,value)=>listeners.change({target:{classList:{contains:x=>x===cls},dataset:{key},value,id:''}});
 change('replay-time-input','21:15');assert.equal(saved().replay[key].time,'21:15');
 change('replay-date','2026-11-19');assert.equal(saved().replay[key].date,'2026-11-19');
 click('cal-replay-reset',{key});assert.equal(saved().replay[key].date,undefined);
 assert.equal(saved().replay[key].time,undefined);
 assert.equal(saved().replay[key].done,true,'reset date/time must not erase watched flag');
 click('cal-replay-done',{key});assert.equal(saved().replay[key],undefined);
 click('cal-filter',{type:'replay'});click('cal-jump',{month:'2026-11'});
 assert.ok(html().includes('calendar-chip replay'));
 click('cal-view',{view:'list'});assert.ok(html().includes('replay-event'));
 click('cal-board',{board:'regular'});
});

test('Friday POL2106 light listening saves independently of weekend serious watching',()=>{
 navigate('#calendar');click('cal-view',{view:'week'});
 const key='POL2106@2026-11-18';
 assert.ok(html().includes('cal-skim-done'));
 click('cal-skim-done',{key});
 assert.equal(saved().skimDone[key],true);
 assert.equal(saved().replay[key]?.done,undefined);
 click('cal-replay-done',{key});
 assert.equal(saved().replay[key].done,true);
 assert.equal(saved().skimDone[key],true,'full viewing does not erase light review');
 click('cal-skim-done',{key});
 assert.equal(saved().skimDone[key],undefined,'turning off the light status leaves full watching untouched');
 assert.equal(saved().replay[key].done,true);
 click('cal-replay-done',{key});
 assert.equal(saved().replay[key],undefined);
});

test('default monthly calendar shows lectures and replay together; checking a replay changes the month marker',()=>{
 navigate('#calendar');click('cal-filter',{type:'all'});click('cal-view',{view:'month'});click('cal-jump',{month:'2026-11',type:'all'});
 const initial=html();assert.ok(initial.includes('calendar-chip lecture'));assert.ok(initial.includes('calendar-chip replay'));
 click('cal-day',{date:'2026-11-18'});assert.ok(html().includes('class="unified-done'));
 const key='POL1101@2026-11-16';
 click('cal-replay-done',{key});
 assert.equal(saved().replay[key].done,true);
 assert.ok(html().includes('replay-check-symbol'));
 click('cal-replay-done',{key});assert.equal(saved().replay[key],undefined);
});

test('one calendar changes between week, month and list without showing duplicate timetable',()=>{
 navigate('#calendar');
 click('cal-view',{view:'week'});
 let page=html();
 assert.ok(page.includes('unified-weekly'),'weekly grid must be visible');
 assert.ok(!page.includes('class="calendar-grid"'),'monthly grid must not appear under weekly grid');
 assert.ok(!page.includes('class="calendar-month-nav"'),'monthly navigation must not appear in weekly mode');
 assert.ok(page.includes('data-action="cal-view" data-view="month"'));
 assert.ok(page.includes('data-action="cal-replay-done"'));
 click('cal-view',{view:'month'});
 page=html();
 assert.ok(page.includes('class="calendar-grid"'));
 assert.ok(!page.includes('class="unified-weekly"'),'weekly grid must disappear in month mode');
 assert.ok(page.includes('calendar-chip replay'));
 click('cal-view',{view:'list'});
 page=html();
 assert.ok(page.includes('class="calendar-agenda"'));
 assert.ok(!page.includes('class="calendar-grid"'));
 assert.ok(!page.includes('class="unified-weekly"'));
 click('cal-filter',{type:'replay'});
 click('cal-view',{view:'week'});
 page=html();
 assert.ok(page.includes('unified-lecture'),'returning to week restores all activity types');
 assert.ok(page.includes('unified-replay'));
});

test('weekly timetable exposes the same time axis and a shortcut to replay at 20:00',()=>{
 navigate('#calendar');click('cal-view',{view:'week'});
 assert.ok(html().includes('class="unified-axis"'));
 assert.ok(html().includes('data-action="cal-scroll-time" data-target="night"'));
 assert.ok(html().includes('ช่วงค่ำ 20:00'));
});

test('home offers direct practice and a blank note without a setup dialog',()=>{
 navigate('#home');assert.match(html(),/class="start-actions"[\s\S]*?href="#practice"/);
 assert.match(html(),/data-action="nb-new" data-source="general"/);
 navigate('#practice');assert.ok(html().includes('exam-timeline'));assert.ok(!html().includes('mock-q'));
});
