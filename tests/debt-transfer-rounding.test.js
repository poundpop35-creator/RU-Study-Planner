import test from 'node:test';
import assert from 'node:assert/strict';
import {roundTransferCents} from '../dist/debt-cards.js';
import {decode,forecast} from '../dist/debt-update.js';
const baht=v=>Math.round(v*100);
test('round transfer suggestions, preserve underlying bill',()=>{for(const [actual,rounded] of [[775.90,776],[929.99,930],[1482.87,1483],[4509.41,4510],[100,100],[0,0]])assert.equal(roundTransferCents(baht(actual)),baht(rounded));});
test('normal 15k and emergency 18k cap allow interest and rounding',()=>{
 const items=[['fixed','',baht(14500),0,[baht(14500)],0,'',0,'','',25,{baseBudget:baht(15000),payWindow:[25,25]}],['variable','',baht(10000),baht(1000),[],baht(10000),'',2500,'y','',25]];
 const token='p2.'+Buffer.from(JSON.stringify(['2026-11-23',baht(18000),100000,items,'test'])).toString('base64url');
 const p=decode(token),rows=forecast(p,[],{}).rows;
 assert.equal(p.baseBudget,baht(15000));assert.equal(rows[0].a[0],baht(14500));assert.equal(rows[0].a[1],baht(1000));assert.ok(rows.every(r=>r.fromBudget+r.interest+200<=baht(18000)));
});

test('manual interest: zero forecast for rates provided in plan or settings, and no insurance field',()=>{
 const items=[
  ['G','G',baht(1000),0,[baht(1000)],0,'',0,'','',25,{baseBudget:baht(15000),payWindow:[25,25]}],
  ['AEON','AEON',baht(25000),baht(1000),[],baht(25000),'',2500,'y','aeonUpper',25],
  ['LINE','LINE BK',baht(26000),baht(1000),[],baht(26000),'',2500,'y','line',25]
 ];
 const token='p2.'+Buffer.from(JSON.stringify(['2026-11-23',baht(18000),100000,items,'old interest assumptions must be ignored'])).toString('base64url');
 const p=decode(token),zero=forecast(p,[],{}),high=forecast(p,[],{aeonUpper:99,line:99});
 assert.ok(zero.rows.length>0);
 assert.ok(zero.rows.every(r=>r.interest===0));
 assert.deepEqual(zero.rows,high.rows);
 const storage=new Map([['debtPrivateSchedule_v1',JSON.stringify({token,entries:[]})],['debtPayments_20261025_v1','[]']]);
 return import('../dist/debt-update.js').then(({updatedPage,updateAction})=>{
  const store={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  const before=updatedPage(store,'',true);
  assert.doesNotMatch(before,/debt-payment-fee|ค่าประกัน AEON ประมาณ|ดอกประมาณ|ดอกเบี้ยที่ต้องเตรียมเพิ่ม/);
  assert.match(before,/ดอกเบี้ยจริง/);
  assert.equal(updateAction('add',store,{creditor:'1',amount:'1200',interest:'200'}),'');
  const saved=JSON.parse(storage.get('debtPrivateSchedule_v1'));
  assert.equal(saved.entries[0].p,baht(1000));assert.equal(saved.entries[0].i,baht(200));assert.equal(saved.entries[0].f,0);
 });
});

test('25th-only plan: exact minimums, no 20.82 AEON padding, leftover rolls into next month',()=>{
 const items=[
 ['G end','G',148287,0,[148287],0,'',0,'','',25,{baseBudget:1500000,payWindow:[25,25]}],
 ['G Wallet','G',1352823,0,[450941,450941,450941],0,'',0,'','',25],
 ['S1','S1',206669,0,[77590,52960,33793,32323,10003],0,'',0,'','',25],
 ['S2','S2',469190,0,[0,92999,92999,92999,92999,97194],0,'',0,'','',25],
 ['S3','S3',300000,0,[300000],0,'',0,'','',25],
 ['TT','TT',720000,0,[120000,120000,120000,120000,120000,120000],0,'',0,'','',25],
 ['True','True',120000,0,[0,120000],0,'',0,'','',25],
 ['AEON 15k','AEON',1500000,100000,[],1500000,'',0,'','',25],
 ['AEON 10k','AEON',1000000,100000,[],1000000,'',0,'','',25],
 ['LINE','LINE',2600000,100000,[],2600000,'',0,'','',25],
 ['Gold','Gold',4600000,100000,[],4600000,'',0,'','',25]
 ];
 const token='p2.'+Buffer.from(JSON.stringify(['2026-11-25',1800000,100000,items,'']) ).toString('base64url');
 const p=decode(token),{rows}=forecast(p,[],{});
 assert.equal(rows[0].a[7],100000);assert.equal(rows[0].a[8],100000);
 assert.equal(rows[0].total,1496818);assert.equal(rows[0].transferTotal,1496900);
 assert.equal(rows[0].carryOut,3100);assert.equal(rows[1].carryIn,3100);
 assert.ok(rows[1].transferTotal>=1490000);
 assert.ok(rows.every(r=>r.transferTotal<=1800000&&r.interest===0));
 assert.ok(rows[1].extra.some(n=>n>0));
 assert.ok(rows.every(r=>r.extra[0]===0&&r.extra[1]===0));
 assert.ok(rows.length<15);
 assert.equal(rows.reduce((a,r)=>a+r.total,0),items.reduce((a,x)=>a+x[2],0));
});
