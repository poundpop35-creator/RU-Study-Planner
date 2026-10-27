import test from 'node:test';
import assert from 'node:assert/strict';
import {months,creditors,plan,buildPlan,STORE,readPaid,summary,setMonth} from '../dist/debt-core.js';
const memory=(initial)=>{const map=new Map(initial?[[STORE,initial]]:[]);return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};};
test('AEON, LINE and gold get a monthly minimum; S and TT are paid only after everything else',()=>{
 assert.deepEqual(plan.map(r=>creditors.map(c=>r.payments[c.key])),[
 [8560,4000,1000,1000,0,0],[5993,7000,1000,1000,0,0],[4510,8115.44,1000,1000,0,0],
 [4510,6325.11,3000,1000,0,0],[4510,0,9000,1000,0,0],[0,0,11000,4000,0,0],
 [0,0,0,15000,0,0],[0,0,0,15000,0,0],[0,0,0,7000,7900,0],[0,0,0,0,0,7300]
 ]);
 assert.equal(creditors.reduce((n,c)=>n+c.balance,0),140723.55);assert.equal(plan.length,Math.ceil(140723.55/15000),'achieves the principal-only lower bound');assert.equal(months[0],'ต.ค. 2569');assert.equal(months.at(-1),'ก.ค. 2570');
 assert.equal(plan.at(-1).total,7300);assert.equal(plan.at(-1).unused,7700);
 for(const c of creditors)assert.equal(plan.reduce((sum,r)=>sum+r.payments[c.key],0),c.balance);
 for(const row of plan){assert.ok(row.total<=15000);assert.ok(Object.values(row.remaining).every(v=>v>=0));for(const c of creditors.filter(c=>['AEON','LINE','ทอง'].includes(c.key))){const opening=row.remaining[c.key]+row.payments[c.key];assert.ok(row.payments[c.key]>=Math.min(c.key==='AEON'?1000:1000,opening));if(!opening)assert.equal(row.payments[c.key],0);}}
 // S and TT wait until G, AEON, LINE and gold are all cleared.
 for(const row of plan)if(row.payments.S||row.payments.TT){const i=plan.indexOf(row);assert.ok(['G','AEON','LINE'].every(k=>row.remaining[k]===0));if(row.payments.TT)assert.equal(plan[i].remaining['ทอง'],0);}
 assert.equal(plan.find(r=>r.remaining.AEON===0).month,'ม.ค. 2570');
 assert.equal(plan.find(r=>r.remaining.LINE===0).month,'มี.ค. 2570');
 assert.equal(plan.find(r=>r.remaining['ทอง']===0).month,'มิ.ย. 2570');
 assert.equal(plan.find(r=>r.payments.S>0).month,'มิ.ย. 2570');assert.equal(plan.find(r=>r.payments.TT>0).month,'ก.ค. 2570');
 for(const row of plan)for(const key of ['LINE','ทอง'])if(row.remaining[key]>0)assert.equal(row.payments[key]%1000,0,'only final installments can contain a remainder');
 assert.equal(Math.round(plan.reduce((sum,r)=>sum+r.unused,0)*100)/100,9276.45);
 assert.throws(()=>buildPlan(12559));
 const smaller=buildPlan(12560);for(const row of smaller){assert.ok(row.total<=12560);for(const c of creditors.filter(c=>['AEON','LINE','ทอง'].includes(c.key)))assert.ok(row.payments[c.key]>=Math.min(1000,row.remaining[c.key]+row.payments[c.key]));}
 assert.ok(Object.values(smaller.at(-1).remaining).every(v=>v===0));
});
test('revised payments persist and legacy incorrect-plan flags never count as new payments',()=>{
 const storage=memory();storage.setItem('debtPlanPaid_v1','{"ต.ค.":true}');
 assert.equal(summary(readPaid(storage).paid).paid,0);
 assert.equal(setMonth(storage,months[0]),'');assert.equal(summary(readPaid(storage).paid).left,118423);
 assert.equal(storage.getItem('debtPlanPaid_v1'),'{"ต.ค.":true}');
 assert.equal(setMonth(storage,months[0]),'');assert.equal(summary(readPaid(storage).paid).left,132983);
});
test('all paid and unpaid states reconcile with corrected balances',()=>{
 const storage=memory();for(const m of months)setMonth(storage,m);
 const s=summary(readPaid(storage).paid);assert.equal(s.left,0);assert.equal(s.count,months.length);assert.equal(s.percent,100);assert.equal(s.next,undefined);
 for(const m of months)setMonth(storage,m);assert.equal(summary(readPaid(storage).paid).left,132983);
});
test('damaged storage and failed saves never overwrite previous payment records',()=>{
 for(const value of ['{','null','[]','{"ต.ค. 2569":"false"}']){const storage=memory(value);assert.ok(readPaid(storage).error);assert.ok(setMonth(storage,months[0]));assert.equal(storage.getItem(STORE),value);}
 const storage=memory('{"ต.ค. 2569":true}');storage.setItem=()=>{throw Error('quota');};assert.ok(setMonth(storage,months[1]));assert.deepEqual(readPaid(storage).paid,{'ต.ค. 2569':true});
 assert.ok(setMonth(memory(),'unknown'));
});
