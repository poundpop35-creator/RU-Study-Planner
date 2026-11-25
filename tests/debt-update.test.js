import test from 'node:test';
import assert from 'node:assert/strict';
import {decode,forecast,updatedPage,updateAction,snapshotKey} from '../dist/debt-update.js';
import {validateState} from '../dist/core.js';
const sample=['2030-05-01',60000,10000,[['Fixed','',35000,0,[10000,25000],0,'',0,'','',0],['One-off','',32000,0,[0,32000],0,'',0,'','',0],['Variable','',120000,6000,[],0,'example',700,'y','',0]],'Example only'];
const token='p2.'+Buffer.from(JSON.stringify(sample)).toString('base64url');
test('fixed bills use their own periods and a reserve never counts as a payment',()=>{
 const spec=decode(token);const {ac,rows}=forecast(spec,[{creditor:'example',amountCents:2500}],{});
 assert.equal(ac[2].bal,117500);assert.equal(rows[0].setAside,3000);assert.equal(rows[1].carryIn,3000);
 assert.deepEqual(rows.filter(r=>r.a[1]).map(r=>r.a[1]),[32000]);assert.ok(rows.every(r=>r.fromBudget<=spec.budget));
 assert.equal(rows.reduce((a,r)=>a+r.fromBudget,0),ac.reduce((a,x)=>a+x.bal,0));
});
test('preview, activation, partial payment, reload, and repeated activation are independent of the legacy plan',()=>{
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(updatedPage(store,'',true),null);assert.match(updatedPage(store,token,true),/ใช้แผนนี้/);
 assert.equal(map.size,0);assert.equal(updateAction('activate',store,{token}),'');assert.equal(updateAction('add',store,{creditor:'1',amount:'20'}),'');
 assert.equal(updateAction('activate',store,{token}),'');assert.equal(JSON.parse(map.get(snapshotKey)).entries.length,1);assert.ok(updateAction('add',store,{creditor:'1',amount:'999999'}));
 const recovered=validateState({version:1,debt:Object.fromEntries(map)}).debt;assert.match(updatedPage({getItem:k=>recovered[k]},'',true),/One-off · เหลืองวดนี้ 300 บาท/);
});
test('a late-month pay window holds early bills first, flags any gap, and uses the reserve only once',()=>{
 const cfg=['2030-01-02',20000,1000,[['A','',37000,0,[17000,20000],0,'',0,'','',8,{payWindow:[25,30]}],['B','',12000,0,[2000,2000,8000],0,'',0,'','',26]],''];
 const k='p2.'+Buffer.from(JSON.stringify(cfg)).toString('base64url'),p=decode(k),{rows}=forecast(p,[],{});
 assert.equal(rows[0].setAside,1000);assert.equal(rows[0].shortfall,19000);assert.equal(rows[0].early[0].day,8);
 assert.equal(rows[1].carryIn,1000);assert.equal(rows.reduce((v,r)=>v+r.fromBudget,0),49000);
 const view=updatedPage({getItem:()=>null},k,true);assert.match(view,/25–28 ก.พ./);assert.match(view,/ยังขาด 190 บาท/);
});

test('payment controls respect edit access and closed accounts; pay dates follow the plan',()=>{
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(updateAction('activate',store,{token}),'');
 assert.equal(updateAction('add',store,{creditor:'1',amount:'320'}),'');
 const page=updatedPage(store,'',true);
 assert.doesNotMatch(page,/โอนวันที่ 25|<option value="1">One-off/);
 assert.match(page,/id="debt-payment-form"/);
 const readOnly=updatedPage(store,'',false);
 assert.doesNotMatch(readOnly,/id="debt-payment-form"|data-action="debt-remove"/);
 assert.match(readOnly,/ประวัติการจ่าย/);
});


test('mobile monthly debt tables expose a horizontal scroll region without changing payment values',()=>{
 const html=updatedPage({getItem:()=>null},token,true);
 assert.match(html,/class="debt-month-scroll" role="region" tabindex="0"/);
 assert.match(html,/class="debt-scroll-hint">← เลื่อนตารางซ้าย–ขวา/);
 assert.match(html,/<\/tbody><\/table><\/div><p class="debt-hint">/);
 assert.match(html,/<th scope="col">เป้า<\/th><th scope="col">จ่ายแล้ว<\/th><th scope="col">ขาด<\/th>/);
});

test('use normal monthly surplus immediately; preserve G and credit prepaid bills',()=>{
 const cfg=['2030-01-25',1800000,10000,[['G','G',300000,0,[150000,150000],0,'',0,'','',25,{baseBudget:1500000,payWindow:[25,25]}],['Fixed','S2',800000,0,[200000,200000,200000,200000],0,'',0,'','',25],['Flexible','',4600000,100000,[],0,'',2500,'y','',25]],''];
 const p=decode('p2.'+Buffer.from(JSON.stringify(cfg)).toString('base64url')),{rows}=forecast(p,[]);
 assert.equal(rows[0].a[0],150000);assert.equal(rows[1].a[0],150000);assert.equal(rows[0].extra[0],0);
 assert.equal(rows[0].transferTotal,1500000);assert.ok(rows[0].extra[2]>0);
 assert.ok(rows.length<10);assert.ok(rows.every(r=>r.transferTotal<=p.budget));
 assert.equal(rows.reduce((n,r)=>n+r.total,0),5700000);
 const only={...p,accounts:p.accounts.slice(0,2)};const short=forecast(only,[]).rows;
 assert.equal(short.length,2);assert.equal(short[0].a[1],800000);assert.equal(short[1].a[1],0);
 assert.equal(only.accounts[1].bills[1],200000);
});
test('full installment action records exact balance, not rounded transfer, and prevents repeat or skipping',()=>{
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(updateAction('activate',store,{token}),'');
 assert.notEqual(updateAction('full',store,{creditor:'0',month:'1',cents:'25000'}),'');
 assert.equal(updateAction('full',store,{creditor:'0',month:'0',cents:'10000'}),'');
 assert.notEqual(updateAction('full',store,{creditor:'0',month:'0',cents:'10000'}),'');
 assert.equal(JSON.parse(map.get(snapshotKey)).entries[0].p,10000);
 assert.match(updatedPage(store,'',true),/id="debt-payment-month"/);
 assert.match(updatedPage(store,'',true),/จ่ายเต็มงวด/);
});
