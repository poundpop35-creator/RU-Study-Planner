import test from 'node:test';
import assert from 'node:assert/strict';
import {months,STORE,readPaid,summary,setMonth} from '../dist/debt-core.js';
const memory=(initial)=>{const map=new Map(initial?[[STORE,initial]]:[]);return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};};
test('original plan totals and legacy payment flags survive unchanged',()=>{
 const storage=memory(JSON.stringify({'ส.ค.':true,'ก.ย.':true}));
 assert.deepEqual(summary(readPaid(storage).paid),{total:74850,paid:20607,left:54243,count:2,percent:28,next:'ต.ค.'});
 assert.equal(setMonth(storage,'ต.ค.'),'');assert.equal(summary(readPaid(storage).paid).paid,30607);
 assert.equal(setMonth(storage,'ต.ค.'),'');assert.equal(summary(readPaid(storage).paid).paid,20607);
});
test('all paid and unpaid states reconcile with the original schedule',()=>{
 const storage=memory();for(const m of months)setMonth(storage,m);
 const s=summary(readPaid(storage).paid);assert.equal(s.left,0);assert.equal(s.count,8);assert.equal(s.percent,100);assert.equal(s.next,undefined);
 for(const m of months)setMonth(storage,m);assert.equal(summary(readPaid(storage).paid).left,74850);
});
test('damaged storage and failed saves never overwrite previous payment records',()=>{
 for(const value of ['{','null','[]','{"ส.ค.":"false"}']){const storage=memory(value);assert.ok(readPaid(storage).error);assert.ok(setMonth(storage,'ส.ค.'));assert.equal(storage.getItem(STORE),value);}
 const storage=memory('{"ส.ค.":true}');storage.setItem=()=>{throw Error('quota');};assert.ok(setMonth(storage,'ก.ย.'));assert.deepEqual(readPaid(storage).paid,{'ส.ค.':true});
 assert.ok(setMonth(memory(),'unknown'));
});
