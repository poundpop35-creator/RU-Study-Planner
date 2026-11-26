import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollQuestion,cancelQuestionScroll} from '../dist/quiz-scroll.js';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../dist/'+p,import.meta.url),'utf8');
function fixture(){
 const pending=[],calls=[],card={isConnected:true,style:{},scrollIntoView:v=>calls.push(v)},stem={setAttribute(){},focus:v=>calls.push(v)},header={getBoundingClientRect:()=>({bottom:72,height:72})},env={requestAnimationFrame:f=>pending.push(f)};
 return {card,stem,header,env,calls,flush(){while(pending.length)pending.shift()();}};
}
test('shared scroll uses header clearance after layout and moves to question start',()=>{
 const f=fixture();scrollQuestion(f.card,f.stem,f.header,f.env);assert.equal(f.calls.length,1);f.flush();assert.equal(f.card.style.scrollMarginTop,'84px');assert.deepEqual(f.calls[1],{block:'start',inline:'nearest',behavior:'instant'});
});
test('stale navigation and detached questions cannot move the screen',()=>{
 const f=fixture();scrollQuestion(f.card,f.stem,f.header,f.env);cancelQuestionScroll();f.flush();assert.equal(f.calls.length,1);
 scrollQuestion(f.card,f.stem,f.header,f.env);f.card.isConnected=false;f.flush();assert.equal(f.calls.length,2);
});
test('all live question routes use shared scroll and retain feedback position',()=>{
 const ram=read('ram-exams/practice.js'),reader=read('exam-reader.js'),app=read('app.js'),notebook=read('notebook-view.js');
 assert.match(ram,/scrollQuestion\(card,stem,document\.querySelector/);
 assert.match(reader,/scrollQuestion\(card,stem,topbar\)/);
 assert.match(app,/sessionReviewed\+\+;save\(\);flipped=false;render\(true\);scrollReviewCard\(\)/);
 assert.match(notebook,/nb-review-next'\)\{reviewIndex\+\+;revealed=false;render\(true\);const card/);
 assert.match(ram,/setAnswer\(q,i\);\s*reveal\(q,i,buttons\);\s*updateOverview\(\);/);
 assert.match(app,/action==='flip'\)\{flipped=!flipped;render\(true\);\}/);
});
