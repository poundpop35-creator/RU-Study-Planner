import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaper,paperFor,emptyPage,strokeObject,pageHistory,mergePaper,copy,strokeHit,penWidth,PEN_WIDTH_PRESETS} from '../dist/paper-core.js';
import {newNote,validateNotebook,referencedImages,findNotes} from '../dist/notebook-core.js';
import {createStudySpace,assertCapacity} from '../dist/study-space.js';
import {freshState} from '../dist/core.js';
import {cloudFixture,memoryStorage,imageCache,settingsFetcher} from './cloud-fixture.js';
const stroke=()=>strokeObject([[10,20,.2],[20,30,.8],[40,50,.4]],{tool:'pen',color:'#172033',width:5});
const book=()=>{const note=newNote({id:'paper-test',text:'ข้อความเดิม'});note.paper=paperFor(note);return {version:1,notes:[note]};};
test('legacy conversion is deterministic across devices and preserves original Delta and images',()=>{
 const note=newNote({id:'a'.repeat(90),text:'บทเรียน\n'+('ไทย '.repeat(120))});note.delta.ops.push({insert:{studyImage:'12345678-1234-1234-1234-123456789012.png'}});
 const before=JSON.stringify(note.delta),paper=paperFor(note);assert.deepEqual(paper,paperFor(note));assert.equal(JSON.stringify(note.delta),before);
 note.paper=paper;const validated=validateNotebook({version:1,notes:[note]});assert.equal(JSON.stringify(validated.notes[0].delta).includes('บทเรียน'),true);assert.equal(referencedImages(validated).length,1);
});
test('paper schema roundtrips strokes text and image references; rejects bad coordinates and IDs',()=>{
 const b=book(),p=b.notes[0].paper.pages[0];p.objects.push(stroke(),{id:'img',type:'image',x:0,y:0,w:100,h:100,imageId:'12345678-1234-1234-1234-123456789012.jpg'});
 assert.deepEqual(validateNotebook(b),{...b,version:2});assert.equal(referencedImages(b).length,1);assert.equal(findNotes(b,{query:'ข้อความเดิม'}).length,1);
 const invalid=copy(b);invalid.notes[0].paper.pages[0].objects[0].x=Infinity;assert.throws(()=>validateNotebook(invalid));
 const dup=copy(b);dup.notes[0].paper.pages.push(copy(p));assert.throws(()=>validateNotebook(dup));
});
test('strokes remain vector data, taps remain visible and eraser hit testing follows the path',()=>{
 const dot=strokeObject([[10,10,.5],[10,10,.5]],{tool:'pen',color:'#172033',width:5});assert.equal(dot.points.length,1);
 assert.equal(strokeHit(stroke(),{x:25,y:35}),true);assert.equal(strokeHit(stroke(),{x:500,y:500}),false);
});
test('history is per page and refuses to overwrite a remotely modified page',()=>{
 const before=emptyPage(),after=copy(before);after.objects.push(stroke());const h=pageHistory();h.record(before,after);assert.deepEqual(h.step(after),before);assert.deepEqual(h.step(before,false),after);
 const remote=copy(after);remote.objects.push(stroke());assert.throws(()=>h.step(remote),/ข้อมูลใหม่/);assert.equal(h.canUndo,false);
});
test('merges independent local/remote objects and protects conflicting edits and deletes',()=>{
 const base=book().notes[0].paper,local=copy(base),remote=copy(base);local.pages[0].objects.push(stroke());remote.pages[0].objects.push(stroke());assert.equal(mergePaper(base,local,remote).pages[0].objects.length,base.pages[0].objects.length+2);
 local.pages[0].objects[0].text='local';remote.pages[0].objects[0].text='remote';assert.throws(()=>mergePaper(base,local,remote),/พร้อมกัน/);
 const removed=copy(base);removed.pages=[];assert.throws(()=>mergePaper(base,removed,remote),/แก้จากอีกเครื่อง/);
});
test('two isolated device caches see page edits and deletion after confirmed cloud writes',async()=>{
 const cloud=cloudFixture(),make=()=>createStudySpace({storage:memoryStorage(),progress:freshState(),clientFactory:()=>cloud.client,imageStore:imageCache(),settingsFetcher}),a=make(),b=make();
 try{await a.init();await b.init();a.saveNotebook(book());await a.flush();await b.sync();assert.deepEqual(b.notebook(),a.notebook());
 const next=copy(b.notebook());next.notes[0].paper.pages.push(emptyPage());b.saveNotebook(next);await b.flush();await a.sync();assert.equal(a.notebook().notes[0].paper.pages.length,2);
 await b.deleteNote('paper-test');await a.sync();assert.equal(a.notebook().notes.length,0);
 }finally{a.dispose();b.dispose();}
});
test('offline flush never claims success and queued vector data survives reconnect',async()=>{
 const cloud=cloudFixture(),space=createStudySpace({storage:memoryStorage(),progress:freshState(),clientFactory:()=>cloud.client,imageStore:imageCache(),settingsFetcher});
 try{await space.init();space.saveNotebook(book());cloud.fail(Error('offline'));await assert.rejects(()=>space.flush(),/offline/);assert.equal(space.info().dirty,true);cloud.fail(null);await space.flush();assert.equal(space.info().dirty,false);assert.ok(cloud.rows.get(cloud.owner.id).payload.notebook.notes[0].paper);}finally{space.dispose();}
});
test('capacity guard leaves headroom below 4 MB API request limit',()=>{assert.doesNotThrow(()=>assertCapacity({text:'x'.repeat(3700000)}));assert.throws(()=>assertCapacity({text:'ก'.repeat(1300000)}),/เต็ม/);});

test('paper upgrades notebook to version 2 so legacy clients cannot strip vector data',()=>{const v=validateNotebook(book());assert.equal(v.version,2);assert.equal(validateNotebook({...v,notes:[]}).version,2);assert.equal(validateNotebook({version:1,notes:[newNote()]}).version,1);});

test('pen width presets and custom slider bounds match the existing stroke schema',()=>{
 assert.deepEqual(PEN_WIDTH_PRESETS,[1,2,3,5,8,12]);
 for(const size of [1,2,3,5,8,12]){
  assert.equal(penWidth(String(size)),size);
  const value=book();
  value.notes[0].paper.pages[0].objects.push(strokeObject([[20,30,.5],[50,80,.5]],{tool:'pen',color:'#172033',width:size}));
  assert.equal(validatePaper(value.notes[0].paper).pages[0].objects[0].width,size);
 }
 for(const bad of [0,-1,13,40,NaN,Infinity,'bad','5.5']){
  assert.equal(penWidth(bad),5);
 }
 assert.equal(penWidth('bad',8),8);
});
