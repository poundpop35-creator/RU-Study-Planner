import test from 'node:test';
import assert from 'node:assert/strict';
import {creditors,STORE as LEGACY} from '../dist/debt-core.js';
import {PAYMENT_STORE,readPayments,paymentSummary,addPayment,removePayment} from '../dist/debt-payments.js';
function memory(){const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};}
const summary=s=>paymentSummary(readPayments(s).entries);
test('5 and 1000 accumulate towards one installment, with exact principal reduction',()=>{
 const s=memory();assert.equal(addPayment(s,'AEON','5'),'');assert.equal(addPayment(s,'AEON','1000'),'');
 const result=summary(s);assert.equal(result.paid,1005);assert.equal(result.left,132418.55);assert.equal(result.byCreditor.AEON,1005);assert.equal(result.byCreditor.G,0);
 assert.equal(result.allocation['ต.ค. 2569'].AEON,1005);assert.equal(result.monthRemaining['ต.ค. 2569'],13555);assert.equal(result.count,0);
 assert.equal(readPayments(s).entries.length,2);
});
test('small decimal payments are exact, and crossing a target allocates only excess to next month',()=>{
 const s=memory();for(let i=0;i<10;i++)assert.equal(addPayment(s,'AEON','0.1'),'');assert.equal(summary(s).paid,1);
 assert.equal(addPayment(s,'AEON','6499'),'');const result=summary(s);
 assert.equal(result.allocation['ต.ค. 2569'].AEON,3000);assert.equal(result.allocation['พ.ย. 2569'].AEON,3500);
 assert.equal(result.count,0);assert.equal(addPayment(s,'G','8560'),'');assert.equal(summary(s).count,0);
 for(const key of ['LINE','ทอง','S'])assert.equal(addPayment(s,key,'1000'),'');assert.equal(summary(s).count,1);
});
test('deleting an incorrect entry recomputes progress and survives a storage reread',()=>{
 const s=memory();addPayment(s,'AEON','1000');addPayment(s,'AEON','5');const id=readPayments(s).entries[0].id;
 assert.equal(removePayment(s,id),'');assert.equal(summary(s).paid,5);assert.equal(summary(s).left,133418.55);
 assert.ok(removePayment(s,id));assert.equal(readPayments(s).entries.length,1);
});
test('invalid, zero, negative, fractional-cent and overbalance payments leave stored history unchanged',()=>{
 const s=memory();addPayment(s,'AEON','5');const before=s.getItem(PAYMENT_STORE);
 for(const amount of ['',0,-1,'no','1.001',Infinity,'1e3','25440.55']){assert.ok(addPayment(s,'AEON',amount),String(amount));assert.equal(s.getItem(PAYMENT_STORE),before);}
 assert.ok(addPayment(s,'missing','100'));assert.equal(s.getItem(PAYMENT_STORE),before);
});
test('bad storage and quota errors preserve both history and legacy flags',()=>{
 const s=memory();s.setItem(PAYMENT_STORE,'{');assert.ok(readPayments(s).error);assert.ok(addPayment(s,'AEON','5'));assert.ok(removePayment(s,'x'));assert.equal(s.getItem(PAYMENT_STORE),'{');
 const clean=memory();addPayment(clean,'AEON','5');const before=clean.getItem(PAYMENT_STORE);clean.setItem=()=>{throw Error('quota');};assert.ok(addPayment(clean,'AEON','100'));assert.equal(clean.getItem(PAYMENT_STORE),before);
});
test('revised legacy month flags migrate once, and removed entries never reappear',()=>{
 const s=memory();s.setItem(LEGACY,JSON.stringify({'ต.ค. 2569':true}));s.setItem('debtPlanPaid_v1',JSON.stringify({'ก.ย.':true}));
 assert.equal(summary(s).paid,14560);assert.equal(readPayments(s).entries.length,2);
 assert.equal(summary(s).byCreditor.AEON,6000);assert.equal(summary(s).byCreditor.S,0);assert.equal(summary(s).allocation['ต.ค. 2569'].AEON,3000);assert.equal(summary(s).allocation['พ.ย. 2569'].AEON,3000);assert.equal(summary(s).count,0);
 const id=readPayments(s).entries.find(e=>e.creditor==='AEON').id;assert.equal(removePayment(s,id),'');assert.equal(summary(s).paid,8560);
 assert.equal(s.getItem(LEGACY),JSON.stringify({'ต.ค. 2569':true}));assert.equal(readPayments(s).entries.length,1);
});
test('all creditors can be completed through amounts and final partial payment',()=>{
 const s=memory();for(const c of creditors){assert.equal(addPayment(s,c.key,String(c.balance-5)),'');assert.equal(addPayment(s,c.key,'5'),'');}
 const result=summary(s);assert.equal(result.left,0);assert.equal(result.count,9);assert.equal(result.percent,100);assert.equal(result.next,undefined);
});

test('existing payment ledger remains unchanged when monthly targets are revised',()=>{
 const s=memory(),entries=[{id:'before-plan-change',creditor:'AEON',amountCents:600000,at:'2026-10-25T04:00:00.000Z'},{id:'small-payment',creditor:'S',amountCents:500,at:null}];
 const raw=JSON.stringify(entries);s.setItem(PAYMENT_STORE,raw);
 const result=summary(s);assert.equal(result.paid,6005);assert.equal(result.byCreditor.AEON,6000);assert.equal(result.byCreditor.S,5);assert.equal(result.monthRemaining['ต.ค. 2569'],11555);assert.equal(result.count,0);
 assert.equal(s.getItem(PAYMENT_STORE),raw);assert.deepEqual(readPayments(s).entries,entries);
});

test('actual interest is separate from balance payments, including interest-only and undo',()=>{
 const s=memory();assert.equal(addPayment(s,'LINE','100','20'),'');
 assert.equal(summary(s).paid,80);assert.equal(summary(s).interestPaid,20);assert.equal(summary(s).cashPaid,100);assert.equal(summary(s).byCreditor.LINE,80);
 assert.equal(addPayment(s,'ทอง','5','5'),'');assert.equal(summary(s).paid,80);assert.equal(summary(s).interestPaid,25);
 assert.equal(readPayments(s).entries[1].amountCents,0);
 assert.equal(removePayment(s,readPayments(s).entries[0].id),'');assert.equal(summary(s).paid,0);assert.equal(summary(s).cashPaid,5);
});
test('invalid interest cannot rewrite history or double-charge G and S',()=>{
 const s=memory();addPayment(s,'AEON','5');const before=s.getItem(PAYMENT_STORE);
 for(const interest of ['-1','101','0.001','NaN']){assert.ok(addPayment(s,'AEON','100',interest));assert.equal(s.getItem(PAYMENT_STORE),before);}
 for(const key of ['G','S']){assert.ok(addPayment(s,key,'100','1'));assert.equal(s.getItem(PAYMENT_STORE),before);}
});
test('all previous month flags do not create payments for the newly supplied AEON balance',()=>{
 const s=memory();s.setItem(LEGACY,JSON.stringify(Object.fromEntries(['ต.ค. 2569','พ.ย. 2569','ธ.ค. 2569','ม.ค. 2570','ก.พ. 2570','มี.ค. 2570','เม.ย. 2570','พ.ค. 2570','มิ.ย. 2570'].map(m=>[m,true]))));
 assert.equal(summary(s).paid,132983);assert.equal(summary(s).left,440.55);assert.equal(summary(s).interestPaid,0);
});
