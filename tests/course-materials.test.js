import test from 'node:test';
import assert from 'node:assert/strict';
import {newNote,validateNotebook} from '../dist/notebook-core.js';
import {materialFor,validateCourseMaterials,safeCourseUrl} from '../dist/course-materials.js';

const pdf={id:'4c0ebf5d-8b76-498e-9f02-dfa3b32df098',name:'สไลด์ครั้งที่ 1.pdf',data:Buffer.from('%PDF-1.4 sample').toString('base64')};
const link={id:'1c0ebf5d-8b76-498e-9f02-dfa3b32df098',name:'วิดีโออาจารย์',url:'https://example.org/lecture'};
test('course-wide primary file survives version-6 notebook roundtrip and is shared by every lesson note',()=>{
 const one=newNote({id:'one',course:'POL2200',title:'ครั้งที่ 1'});
 const two=newNote({id:'two',course:'POL2200',title:'ครั้งที่ 2'});
 const book=validateNotebook({version:6,notes:[one,two],courseMaterials:{POL2200:{files:[pdf],links:[link]}}});
 assert.equal(book.version,6);
 assert.equal(book.notes.length,2);
 assert.equal(materialFor(book,one.course).files[0].name,'สไลด์ครั้งที่ 1.pdf');
 assert.deepEqual(materialFor(book,two.course),materialFor(book,one.course));
 assert.equal(materialFor(book,'POL2104').files.length,0);
 assert.deepEqual(validateNotebook(JSON.parse(JSON.stringify(book))).courseMaterials,book.courseMaterials);
});
test('legacy notebook keeps all notes when course-wide materials are added',()=>{
 const original=validateNotebook({version:1,notes:[newNote({id:'first',course:'POL2200'})]});
 const changed=validateNotebook({...original,version:6,courseMaterials:{POL2200:{files:[pdf],links:[]}}});
 assert.equal(changed.notes[0].id,'first');
 assert.equal(changed.courseMaterials.POL2200.files[0].id,pdf.id);
});
test('invalid material type, URLs, IDs and too many files are rejected',()=>{
 assert.equal(safeCourseUrl('javascript:alert(1)'),null);
 assert.equal(safeCourseUrl('https://example.org/'), 'https://example.org/');
 for(const value of [
  {POL2200:{files:[{...pdf,data:'invalid'}]}},
  {POL2200:{files:[],links:[{...link,url:'file:///etc/passwd'}]}},
  {'<script>':{files:[]}},
  {POL2200:{files:[],links:[{...link,id:'broken'}]}},
  {POL2200:{files:[pdf,pdf]}}
 ])assert.throws(()=>validateCourseMaterials(value));
});
