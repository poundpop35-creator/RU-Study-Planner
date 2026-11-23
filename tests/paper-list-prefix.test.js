import test from 'node:test';
import assert from 'node:assert/strict';
import {applyListPrefix,LIST_PREFIXES} from '../dist/paper-list-prefix.js';

test('bullet and triangle are text characters that can be toggled for one line',()=>{
 assert.equal(LIST_PREFIXES.bullet,'• ');
 assert.equal(LIST_PREFIXES.triangle,'▸ ');
 const first=applyListPrefix('รัฐศาสตร์',0,0,'bullet');
 assert.equal(first.text,'• รัฐศาสตร์');
 assert.equal(first.start,2);
 const triangle=applyListPrefix(first.text,first.start,first.end,'triangle');
 assert.equal(triangle.text,'▸ รัฐศาสตร์');
 const off=applyListPrefix(triangle.text,triangle.start,triangle.end,'triangle');
 assert.equal(off.text,'รัฐศาสตร์');
});
test('a selection spanning multiple lines receives each marker exactly once',()=>{
 const src='บรรทัดหนึ่ง\nบรรทัดสอง\nบรรทัดสาม';
 const marked=applyListPrefix(src,0,src.length,'bullet');
 assert.equal(marked.text,'• บรรทัดหนึ่ง\n• บรรทัดสอง\n• บรรทัดสาม');
 assert.equal(marked.operations.length,3);
 const changed=applyListPrefix(marked.text,0,marked.text.length,'triangle');
 assert.equal(changed.text,'▸ บรรทัดหนึ่ง\n▸ บรรทัดสอง\n▸ บรรทัดสาม');
 const removed=applyListPrefix(changed.text,0,changed.text.length,'triangle');
 assert.equal(removed.text,src);
});
test('selection ending at the beginning of next line does not mark that line',()=>{
 const src='เรื่องแรก\nเรื่องที่สอง';
 const end=src.indexOf('เรื่องที่สอง');
 assert.equal(applyListPrefix(src,0,end,'bullet').text,'• เรื่องแรก\nเรื่องที่สอง');
});
test('invalid prefix or selection is rejected without modifying stored notes',()=>{
 assert.throws(()=>applyListPrefix('abc',0,0,'unsafe'));
 assert.throws(()=>applyListPrefix('abc',1,10,'bullet'));
});
