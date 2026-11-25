import test from 'node:test';
import assert from 'node:assert/strict';
import {combineCourseNotes,sessionSections,appendSession,isCourseNotebook} from '../dist/course-notebook.js';
import {newNote,validateNotebook} from '../dist/notebook-core.js';
const note=(id,session)=>({...newNote({id,session,course:'POL2301',source:'classroom',title:'ครั้งที่ '+session}),paper:{version:2,pages:[{id:'page',template:'ruled',height:1273,objects:[{id:'same-id',type:'text',x:50,y:60,w:600,h:80,text:'เนื้อหา '+session,size:16,color:'#172033',bold:false},{id:'ink',type:'stroke',x:20,y:150,w:100,h:40,tool:'pen',width:3,color:'#172033',points:[[0,0,.5],[1,1,.5]]},{id:'image',type:'image',x:30,y:220,w:600,h:400,imageId:'00000000-0000-4000-8000-000000000001.png'}]}]}});
test('course copy preserves original notes, orders headings, retains objects, remaps IDs',()=>{
 const book=validateNotebook({version:2,notes:[note('two',2),note('one',1)]}),before=structuredClone(book);
 const r=combineCourseNotes(book,'POL2301',['two','one']);
 assert.deepEqual(book,before);assert.deepEqual(r.book.notes.slice(0,2),before.notes);
 const combined=r.book.notes.find(n=>n.id===r.id);assert.ok(isCourseNotebook(combined));
 const sections=sessionSections(combined.paper);
 assert.equal(sections.length,2);assert.match(sections[0].text,/ครั้งที่ 1/);assert.match(sections[1].text,/ครั้งที่ 2/);
 const objects=combined.paper.pages[0].objects;
 assert.equal(objects.filter(o=>o.type==='stroke').length,2);assert.equal(objects.filter(o=>o.type==='image').length,2);
 assert.equal(new Set(objects.map(o=>o.id)).size,objects.length);
 assert.ok(objects.filter(o=>o.type==='image')[0].y+400<sections[1].y);
 assert.throws(()=>combineCourseNotes(r.book,'POL2301',['one']),/สมุดรวม/);
});
test('append session keeps previous objects and uses valid continuous schema',()=>{
 const book={version:1,notes:[]},r=combineCourseNotes(book,'POL2301',[]),p=r.book.notes[0].paper;
 const next=appendSession(p,'ครั้งที่ 2').paper;
 assert.deepEqual(next.pages[0].objects.slice(0,-1),p.pages[0].objects);
 assert.equal(sessionSections(next).length,2);
});
test('reject cross-course and missing source without touching book',()=>{
 const book={version:1,notes:[note('one',1)]},before=structuredClone(book);
 assert.throws(()=>combineCourseNotes(book,'POL2200',['one']));
 assert.throws(()=>combineCourseNotes(book,'POL2301',['missing']));
 assert.deepEqual(book,before);
});
