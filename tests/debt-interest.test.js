import test from 'node:test';
import assert from 'node:assert/strict';
import {interestPlan,defaultRates,readRates,saveRates,RATE_STORE} from '../dist/debt-interest.js';
import {plan} from '../dist/debt-core.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
test('30-day interest is calculated separately for both AEON accounts, LINE and monthly gold',()=>{
 const rows=interestPlan();assert.deepEqual(rows[0].interest,{aeonUpper:310.59,aeonCard:135.78,line:534.25,gold:575});
 assert.equal(rows[0].interestTotal,1555.62);assert.equal(rows[0].cashTotal,16115.62);
 for(const r of rows){assert.equal(Math.round(r.cashTotal*100),Math.round(r.baseTotal*100)+Math.round(r.interestTotal*100));assert.ok(!('G' in r.interest));assert.ok(!('S' in r.interest));}
 assert.equal(rows[4].interest.aeonUpper,0);assert.equal(rows[5].interest.aeonCard,0);assert.equal(rows[7].interest.line,0);
 assert.equal(rows.at(-2).interest.gold,87.5);assert.equal(rows.at(-1).interestTotal,0,'the last month pays only TT, which has no interest');
});
test('AEON subaccounts receive minimums every active month with remainders only at closure',()=>{
 const left={aeonUpper:1511544,aeonCard:1032511};
 for(const row of plan){for(const key of Object.keys(left)){const payment=Math.round(row.aeonAllocation[key]*100);assert.ok(payment>=Math.min(left[key],100000));assert.ok(payment<=left[key]);left[key]-=payment;if(left[key])assert.equal(payment%100000,0);}}
 assert.deepEqual(left,{aeonUpper:0,aeonCard:0});
});
test('rates change interest without changing fixed G, S, balance targets or payment history',()=>{
 const s=memory();s.setItem('debtPayments_20261025_v1','keep');const rates={aeonUpper:22,aeonCard:16,line:18,gold:0.99};
 assert.equal(saveRates(s,rates),'');assert.deepEqual(readRates(s).rates,rates);const first=interestPlan(rates)[0];
 assert.equal(first.interest.line,384.66);assert.equal(first.interest.gold,455.4);assert.equal(first.baseTotal,14560);assert.equal(s.getItem('debtPayments_20261025_v1'),'keep');
 assert.equal(interestPlan({...rates,line:33})[0].interest.line,705.21);
 assert.equal(interestPlan({aeonUpper:0,aeonCard:0,line:0,gold:0})[0].interestTotal,0);
});
test('invalid rates and failed saves preserve existing settings and signal unreadable storage',()=>{
 const s=memory();saveRates(s,defaultRates);const before=s.getItem(RATE_STORE);
 for(const value of ['',-1,Infinity,101]){assert.ok(saveRates(s,{...defaultRates,line:value}));assert.equal(s.getItem(RATE_STORE),before);}
 s.setItem(RATE_STORE,'{');assert.ok(readRates(s).error);assert.equal(s.getItem(RATE_STORE),'{');
 const fail={getItem:()=>null,setItem:()=>{throw Error('quota');}};assert.ok(saveRates(fail,defaultRates));
});
