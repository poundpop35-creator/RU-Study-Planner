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
 const recovered=validateState({version:1,debt:Object.fromEntries(map)}).debt;assert.match(updatedPage({getItem:k=>recovered[k]},'',true),/One-off · เหลือ 300 บาท/);
});
