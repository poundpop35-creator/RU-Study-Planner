import test from 'node:test';
import assert from 'node:assert/strict';
import {notebookHistory} from '../dist/paper-page-history.js';
test('edits and page creation/deletion undo in order with original IDs, links and positions',()=>{
 const h=notebookHistory(),a={id:'a'},b={id:'b',objects:[{id:'text',links:['url']}]},edited={...b,title:'ไทย'};
 let pages=[a,b];const apply=(back)=>h.apply(pages,back,next=>{pages=next;return true});
 h.record(null,b,1);h.record(b,edited,1);h.record(edited,null,1);pages=[a];apply(true);assert.deepEqual(pages,[a,edited]);apply(true);assert.deepEqual(pages,[a,b]);apply(true);assert.deepEqual(pages,[a]);apply(false);assert.deepEqual(pages,[a,b]);apply(false);apply(false);assert.deepEqual(pages,[a]);
});
test('conflicting remote page and failed persistence leave undo entry intact',()=>{
 const h=notebookHistory(),a={id:'a'},b={id:'b'};h.record(null,b,1);
 assert.throws(()=>h.apply([a,{...b,title:'other'}],true,()=>assert.fail()),/เปลี่ยน/);
 h.apply([a,b],true,()=>false);assert.ok(h.canUndo);h.apply([{...a,title:'remote'},b],true,p=>{assert.equal(p[0].title,'remote');return true});assert.ok(h.canRedo);
});
