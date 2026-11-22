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
