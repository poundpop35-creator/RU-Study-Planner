import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaper,expandSelection,selectionGroupState,changeObjectGroups,cloneGroupedObjects,scaleGroupObject,toPagedPaper} from '../dist/paper-core.js';
import {validateNotebook,newNote} from '../dist/notebook-core.js';
const text=(id,x=20)=>({id,type:'text',x,y:20,w:100,h:40,text:id,size:16,color:'#172033',bold:false});
const original=[text('a'),text('b',150),text('c',300)];
test('group selection, ungroup, copy and persistence',()=>{
 const grouped=changeObjectGroups(original,new Set(['a','b']),'group-1');
 assert.deepEqual([...expandSelection(grouped,['b'])],['a','b']);
 assert.equal(selectionGroupState(grouped,new Set(['a','b'])).single,true);
 const paper=validatePaper({version:1,pages:[{id:'page',template:'ruled',objects:grouped}]});
 const book=validateNotebook({version:1,notes:[{...newNote({id:'note'}),paper}]});
 assert.equal(book.version,8);assert.equal(book.notes[0].paper.pages[0].objects[1].groupId,'group-1');
 const copied=cloneGroupedObjects(grouped.slice(0,2),20,20);
 assert.equal(copied[0].groupId,copied[1].groupId);assert.notEqual(copied[0].groupId,'group-1');assert.notEqual(copied[0].id,'a');
 const ungrouped=changeObjectGroups(grouped,new Set(['a']),null);
 assert.deepEqual(ungrouped,original);
 const resized=scaleGroupObject(grouped[1],{x:20,y:20},2);
 assert.equal(resized.x,280);assert.equal(resized.size,32);assert.equal(resized.groupId,'group-1');
});
test('group crossing A4 pages cannot silently split',()=>{
 const objects=changeObjectGroups([text('a'),{...text('b'),y:1400}],new Set(['a','b']),'group-1');
 assert.throws(()=>toPagedPaper({version:2,pages:[{id:'page',template:'ruled',height:2546,objects}]}),/กลุ่มวัตถุ/);
});
