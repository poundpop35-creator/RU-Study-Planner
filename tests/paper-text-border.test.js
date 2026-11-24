import test from 'node:test';import assert from 'node:assert/strict';
import {validatePaper,cloneGroupedObjects,scaleGroupObject} from '../dist/paper-core.js';
import {objectSVG} from '../dist/paper-render.js';
import {validateNotebook,newNote} from '../dist/notebook-core.js';
const box={id:'t',type:'text',x:20,y:20,w:100,h:30,text:'hello',size:16,color:'#172033',bold:false,border:{color:'#dc4343',width:2,style:'dashed'}};
const paper=o=>({version:1,pages:[{id:'p',template:'ruled',objects:[o]}]});
test('text border persists, renders and scales without separate object',()=>{
 const valid=validatePaper(paper(box));assert.deepEqual(valid.pages[0].objects[0].border,box.border);
 const note={...newNote({id:'n'}),paper:valid};const book=validateNotebook({version:1,notes:[note]});
 assert.equal(book.version,9);assert.deepEqual(book.notes[0].paper.pages[0].objects[0].border,box.border);
 assert.match(objectSVG(box),/stroke="#dc4343"/);assert.match(objectSVG(box),/stroke-dasharray="8 6"/);
 assert.deepEqual(cloneGroupedObjects([box])[0].border,box.border);
 assert.equal(scaleGroupObject(box,{x:20,y:20},2).border.width,4);
 assert.throws(()=>validatePaper(paper({...box,border:{...box.border,width:99}})));
 const old={...box};delete old.border;assert.equal(validatePaper(paper(old)).pages[0].objects[0].border,undefined);
});
