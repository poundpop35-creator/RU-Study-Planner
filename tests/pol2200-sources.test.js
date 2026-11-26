import test from 'node:test';
import assert from 'node:assert/strict';
import {pol2200Sources,pol2200SourcePanel} from '../dist/ram-exams/pol2200-sources.js';
test('all 15 supplied POL2200 external sources are unique and kept separate from imported questions',()=>{
 assert.equal(pol2200Sources.length,15);assert.equal(new Set(pol2200Sources.map(s=>s.url)).size,15);
 const expected=['1-1','1-2',...Array.from({length:12},(_,i)=>String(i+2))].map(n=>'https://pol2200-'+n+'-year69.netlify.app/').concat('https://pol2200-mix-1-69.netlify.app/');
 assert.deepEqual(pol2200Sources.map(s=>s.url),expected);
 const panel=pol2200SourcePanel('POL2200');assert.match(panel,/ยังไม่สามารถตรวจเนื้อหา/);assert.equal((panel.match(/target="_blank"/g)||[]).length,15);assert.equal(pol2200SourcePanel('POL2106'),'');
});
