import test from 'node:test';
import assert from 'node:assert/strict';
import {combineCourseNotes,resolveCourseRoute,sessionSections,linkOldCourseNotes,assertLinkedHeadings,protectsNote,appendSession,sectionForSession} from '../dist/course-notebook.js';
import {newNote} from '../dist/notebook-core.js';
const notes=[newNote({id:'one',course:'POL2106',session:1,title:'ครั้งที่ 1',text:'old one'}),newNote({id:'two',course:'POL2106',session:2,title:'ครั้งที่ 2',text:'old two'})];
test('old links and direct section links use same canonical paper, source remains unchanged',()=>{
 const r=combineCourseNotes({version:1,notes},'POL2106',['one','two']),book=r.book;
 const main=book.notes.at(-1),route=resolveCourseRoute(book,'one');
 assert.equal(route.id,main.id);assert.equal(resolveCourseRoute(book,main.id+'~'+route.sectionId).id,main.id);
 assert.equal(sessionSections(main.paper)[0].id,route.sectionId);
 main.paper.pages[0].objects.find(o=>o.text==='old one').text='edited';
 assert.equal(book.notes[0].delta.ops[0].insert,'old one\n');
 assert.equal(resolveCourseRoute(book,'one').id,main.id);
 assert.ok(protectsNote(book,main)&&protectsNote(book,book.notes[0]));
 const removed=structuredClone(main.paper);removed.pages[0].objects=removed.pages[0].objects.filter(o=>o.id!==route.sectionId);
 assert.throws(()=>assertLinkedHeadings(main.paper,removed));
});
test('older copies are linked only by explicit selection; no content overwrite',()=>{
 const r=combineCourseNotes({version:1,notes},'POL2106',['one','two']),main=r.book.notes.at(-1);
 const old=main.paper.pages[0].objects.find(o=>o.id==='lesson-section-source-one');old.id='lesson-section-old-one';
 const before=structuredClone(r.book),next=linkOldCourseNotes(r.book,'POL2106',[{sourceId:'one',sectionId:old.id}]);
 assert.deepEqual(r.book,before);
 assert.equal(resolveCourseRoute(next,'one').id,main.id);
 assert.deepEqual(next.notes.slice(0,2),before.notes.slice(0,2));
 assert.throws(()=>linkOldCourseNotes(next,'POL2106',[{sourceId:'one',sectionId:old.id}]));
});
test('new session has direct route and no duplicate original note',()=>{
 const r=combineCourseNotes({version:1,notes},'POL2106',['one','two']),main=r.book.notes.at(-1);
 main.paper=appendSession(main.paper,'ครั้งที่ 3').paper;
 const section=sectionForSession(main,3);
 assert.ok(section);assert.equal(resolveCourseRoute(r.book,main.id+'~'+section.id).id,main.id);
 assert.equal(r.book.notes.length,3);
});
