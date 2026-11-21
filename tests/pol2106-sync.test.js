import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedAnswers} from '../dist/pol2106-sync.js';
test('two isolated devices share answers, avoid stale updates and import missing legacy entries',async()=>{
 const db={};const api=async(_,b)=>{if(!b)return structuredClone(Object.values(db));const i=b.p_item,r=db[i]?.revision??0;if(r!==b.p_revision)return false;db[i]={item:i,choice:b.p_choice,revision:r+1};return true};
 const device=(old={})=>{const cache=new Map([['pol2106-attempts-v1',JSON.stringify(old)]]);let data={};const client=sharedAnswers({storage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},onUpdate:v=>{data=v},status:()=>{},api});return {...client,read:()=>data}};
 const tick=()=>new Promise(r=>setTimeout(r,0));const a=device(),b=device();await a.sync();await b.sync();a.answer(0,3);await tick();await b.sync();assert.equal(b.read()[0],3);a.answer(0,4);await tick();b.answer(0,2);await tick();await b.sync();assert.equal(b.read()[0],4);const c=device({0:1,1:2});await c.sync();await a.sync();assert.deepEqual(a.read(),{0:4,1:2});
});
