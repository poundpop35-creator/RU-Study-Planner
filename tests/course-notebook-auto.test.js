import test from 'node:test';
import assert from 'node:assert/strict';
import {openAllCourseNotes,combineCourseNotes,sessionSections,resolveCourseRoute} from '../dist/course-notebook.js';
import {newNote,validateNotebook} from '../dist/notebook-core.js';
const note=(id,session,course='POL2106',source='classroom')=>newNote({id,session,course,source,title:'ครั้งที่ '+session,text:'content '+id});
test('automatically includes every active note of one course, never another course or archive',()=>{
 const book=validateNotebook({version:1,notes:[note('one',1),note('two',2,'POL2106','prep'),note('other',1,'POL2200'),{...note('archived',3),archived:true}]});
 const before=structuredClone(book),r=openAllCourseNotes(book,'POL2106');
 assert.deepEqual(book,before);assert.equal(r.added,2);assert.equal(sessionSections(r.book.notes.at(-1).paper).length,2);
 assert.equal(resolveCourseRoute(r.book,'one').id,r.id);assert.equal(resolveCourseRoute(r.book,'two').id,r.id);
 assert.equal(resolveCourseRoute(r.book,'other').id,'other');assert.equal(resolveCourseRoute(r.book,'archived').id,'archived');
 assert.equal(openAllCourseNotes(r.book,'POL2106').changed,false);
});
test('existing legacy copy links identical section without duplicating content, adds omitted notes',()=>{
 const book=validateNotebook({version:1,notes:[note('one',1),note('two',2)]});
 const r=combineCourseNotes(book,'POL2106',['one']),main=r.book.notes.at(-1);
 main.paper.pages[0].objects.find(o=>o.id==='lesson-section-source-one').id='lesson-section-legacy-one';
 const next=openAllCourseNotes(r.book,'POL2106');
 assert.equal(next.added,1);assert.equal(next.preserved,0);
 assert.equal(sessionSections(next.book.notes.at(-1).paper).length,2);
 assert.equal(resolveCourseRoute(next.book,'one').id,r.id);
 assert.equal(openAllCourseNotes(next.book,'POL2106').changed,false);
});
test('diverged copies are preserved rather than silently overwritten',()=>{
 const r=combineCourseNotes(validateNotebook({version:1,notes:[note('one',1)]}),'POL2106',['one']);
 const main=r.book.notes.at(-1);
 main.paper.pages[0].objects.find(o=>o.id==='lesson-section-source-one').id='lesson-section-legacy';
 main.paper.pages[0].objects.find(o=>o.text==='content one').text='edited in main';
 const original=structuredClone(r.book.notes[0]),next=openAllCourseNotes(r.book,'POL2106');
 const objects=next.book.notes.at(-1).paper.pages[0].objects;
 assert.equal(next.preserved,1);assert.ok(objects.some(o=>o.text==='edited in main'));assert.ok(objects.some(o=>o.text==='content one'));
 assert.deepEqual(next.book.notes[0],original);
 assert.equal(resolveCourseRoute(next.book,'one').id,r.id);
 assert.equal(openAllCourseNotes(next.book,'POL2106').changed,false);
});
