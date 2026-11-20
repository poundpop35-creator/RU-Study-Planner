import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../dist/demo.html',import.meta.url),'utf8');

test('interactive HTML preview ships as a standalone mobile-friendly page',()=>{
 assert.match(html,/<!doctype html>/i);
 assert.match(html,/<html lang="th">/);
 assert.match(html,/width=device-width/);
 assert.match(html,/class="bottom-nav"/);
 assert.match(html,/id="view-notes"/);
 assert.match(html,/id="view-schedule"/);
 assert.match(html,/id="view-classroom"/);
 assert.match(html,/id="view-exams"/);
 assert.match(html,/id="view-study"/);
 assert.match(html,/id="tableModal"/);
 assert.match(html,/id="inkCanvas"/);
});
test('preview contains working editor and independent review states without production API calls',()=>{
 for(const expected of ['function openTable','function saveTable','function resizeSelectedTable',
  'function renderPaper','function renderSchedule','function renderQuiz','function checkpoint',
  'function actionUndo','function actionRedo','function saveLocal','function renderClassroom']){
  assert.ok(html.includes(expected),expected);
 }
 assert.ok(html.includes('state.deep')&&html.includes('state.light'));
 assert.ok(html.includes('ไม่มีการส่งข้อมูลไป Supabase'));
 assert.ok(!html.includes('supabase.co'));
 assert.ok(!html.includes('/functions/v1/personal-study'));
});
test('embedded script parses without errors and does not depend on third-party assets',()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new vm.Script(scripts[0],{filename:'dist/demo.html'}));
 assert.ok(!/https:\/\/cdn\./.test(html));
});
