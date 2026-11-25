import test from 'node:test';
import assert from 'node:assert/strict';
import {newNote} from '../dist/notebook-core.js';
import {paperFor,strokeObject} from '../dist/paper-core.js';
import {mergeCollaborativeNote} from '../dist/collab.js';

const make=()=>{
 const note=newNote({id:'5caf65a4-31b3-4e57-9258-5ce3db002e1b',course:'POL2106',title:'สมุดร่วมกัน'});
 note.paper=paperFor(note);return note;
};
test('simultaneous edits to different objects converge without losing strokes',()=>{
 const base=make(),a=structuredClone(base),b=structuredClone(base);
 a.paper.pages[0].objects.push(strokeObject([[10,20,.5],[20,30,.6]],{tool:'pen',color:'#172033',width:3}));
 b.paper.pages[0].objects.push(strokeObject([[40,50,.5],[60,75,.6]],{tool:'pen',color:'#172033',width:3}));
 const result=mergeCollaborativeNote(base,a,b);
 assert.equal(result.paper.pages[0].objects.length,2);
 assert.equal(base.paper.pages[0].objects.length,0,'original must not mutate');
});
test('independent title and ink changes merge safely',()=>{
 const base=make(),a=structuredClone(base),b=structuredClone(base);
 a.title='หัวข้อแก้โดย ก';
 b.paper.pages[0].objects.push(strokeObject([[10,20,.5],[20,30,.5]],{tool:'pen',color:'#172033',width:2}));
 const result=mergeCollaborativeNote(base,a,b);
 assert.equal(result.title,'หัวข้อแก้โดย ก');assert.equal(result.paper.pages[0].objects.length,1);
});
test('simultaneous changes to the same title never silently overwrite',()=>{
 const base=make(),a=structuredClone(base),b=structuredClone(base);
 a.title='แก้โดย ก';b.title='แก้โดย ข';
 assert.throws(()=>mergeCollaborativeNote(base,a,b),/แก้ไขส่วนเดียวกันพร้อมกัน/);
});
