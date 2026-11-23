import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {answerKey,parsedAnswer,readAnswer,scoreSet} from '../dist/ram-exams/score.js';

const mock=[
 {id:'q-1',o:['ก','ข','ค'],a:1,q:'หนึ่ง'},
 {id:'q-2',o:['ก','ข'],a:0,q:'สอง'},
 {id:'q-3',o:['ก','ข'],a:0,q:'สาม'}
];
test('Ram Test Hub uses the existing per-question localStorage keys and rejects corrupt saved options',()=>{
 assert.equal(answerKey('POL1101','q-1'),'ru:ram-test-hub:POL1101:q-1');
 assert.equal(parsedAnswer('0',3),0);
 assert.equal(parsedAnswer('2',3),2);
 for(const invalid of [null,undefined,'','-1','3','abc','0.0','NaN'])
  assert.equal(parsedAnswer(invalid,3),null,String(invalid));
 const storage={getItem:key=>key===answerKey('POL1101','q-1')?'1':null};
 assert.equal(readAnswer(storage,'POL1101',mock[0]),1);
 assert.equal(readAnswer(storage,'POL1101',mock[1]),null);
});
test('Ram Test Hub summary counts right, wrong and unanswered across a whole set',()=>{
 const responses=new Map([['q-1',1],['q-2',1]]);
 const answer=q=>responses.has(q.id)?responses.get(q.id):null;
 assert.deepEqual(scoreSet(mock,answer),{
  total:3,answered:2,pending:1,correct:1,wrong:1,ungraded:0,gradable:3,percent:33,complete:false
 });
 responses.set('q-3',0);
 assert.deepEqual(scoreSet(mock,answer),{
  total:3,answered:3,pending:0,correct:2,wrong:1,ungraded:0,gradable:3,percent:67,complete:true
 });
});
test('source exercise banks remain valid without changing any questions or answers',async()=>{
 for(const course of ['POL1101','POL2104','POL2106','POL2107','POL2200','POL2301','POL2303']){
  const path=new URL('../dist/ram-exams/'+course+'.gz',import.meta.url);
  const bank=JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
  assert.ok(bank.name&&bank.items.length>0,course);
  const sets=new Map();
  for(const q of bank.items){
   assert.ok(q.id!==undefined&&q.id!==null,course);
   assert.ok(typeof q.q==='string'&&q.q.trim(),course);
   assert.ok(Array.isArray(q.o)&&q.o.length>=2&&q.o.every(x=>typeof x==='string'),course);
   assert.ok(Number.isInteger(q.a)&&q.a>=0&&q.a<q.o.length,course);
   const key=String(q.set);
   if(!sets.has(key))sets.set(key,[]);
   sets.get(key).push(q);
  }
  for(const list of sets.values()){
   const score=scoreSet(list,q=>q.a);
   assert.equal(score.correct,list.length,course);
   assert.equal(score.percent,100,course);
   assert.equal(score.complete,true,course);
  }
 }
});
test('standalone practice uses the RU design system, shows progress and final-score screen',async()=>{
 const html=await readFile(new URL('../dist/ram-exams/practice.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../dist/ram-exams/practice.js',import.meta.url),'utf8');
 assert.match(html,/\.\.\/styles\.css/);
 assert.match(html,/practice\.css/);
 for(const id of ['progress','stat-answered','stat-correct','stat-wrong','stat-pending','results','final-percent','final-score','final-wrong','final-pending','review-list','reset-set'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/showResults\(\)/);
 assert.match(js,/localStorage\.setItem\(key/);
 assert.match(js,/localStorage\.removeItem\(key/);
 assert.match(html,/กลับไปเลือกวิชา/);
 assert.match(html,/คำตอบบันทึกในเบราว์เซอร์เครื่องนี้/);
});
