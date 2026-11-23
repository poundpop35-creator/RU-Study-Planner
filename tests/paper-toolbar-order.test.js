import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('notebook toolbar puts Select and Pan first and second with no duplicate',async()=>{
 const source=await readFile(new URL('../dist/paper-view.js',import.meta.url),'utf8');
 const block=source.match(/const icons=\{([\s\S]*?)\n\};/);
 assert.ok(block,'drawing toolbar icon configuration is present');
 const order=[...block[1].matchAll(/^\s*([a-z]+):'/gm)].map(match=>match[1]);
 assert.deepEqual(order.slice(0,2),['select','hand']);
 assert.equal(order.filter(key=>key==='select').length,1);
 assert.equal(order.filter(key=>key==='hand').length,1);
 assert.equal(order[2],'pen','other drawing tools retain their existing sequence');
 assert.match(source,/Object\.entries\(icons\)\.map/,'toolbar buttons follow icons order');
 assert.match(source,/hand:'เลื่อน'/,'Pan button remains labeled เลื่อน');
 assert.match(source,/select:'เลือก'/,'Select button remains labeled เลือก');
});
