import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanDelta,deltaText,validateNotebook,newNote,findNotes,legacyNotes,referencedImages,validateEnvelope} from '../dist/notebook-core.js';
import {lessons} from '../dist/lessons.js';
import {freshState,validateState} from '../dist/core.js';
import {createStudySpace,workspaceKey} from '../dist/study-space.js';
import {memoryStorage,cloudFixture,imageCache,settingsFetcher} from './cloud-fixture.js';
const makeSpace=(cloud,options={})=>createStudySpace({storage:memoryStorage(),progress:freshState(),clientFactory:async()=>cloud.client,settingsFetcher,imageStore:imageCache(),...options});
test('old notes remain intact while their source can be distinguished and filtered',()=>{
 const old=newNote({id:'old',lesson:'POL1101-1',text:'ติวเดิม'});delete old.source;
 const personal=newNote({id:'personal',text:'บันทึกเดิม'});delete personal.source;
 const classroom=newNote({id:'classroom',source:'classroom',course:'POL1101',text:'สิ่งที่ฉันจดจากห้อง'});
 const book=validateNotebook({version:1,notes:[old,personal,classroom]});
 assert.deepEqual(book.notes.map(n=>n.source),['prep','general','classroom']);
 assert.equal(deltaText(book.notes[0].delta),'ติวเดิม\n');
 assert.deepEqual(findNotes(book,{source:'classroom'}).map(n=>n.id),['classroom']);
 assert.deepEqual(findNotes(book,{source:'prep',query:'ติว'}).map(n=>n.id),['old']);
});

test('note round trip preserves Thai, color, highlight, image IDs, recall and course links',()=>{
 const n=newNote({course:'POL1101',lesson:'POL1101-1',title:'รัฐกับรัฐบาล'}),id='123e4567-e89b-12d3-a456-426614174000.png';
 n.delta={ops:[{insert:'อำนาจอธิปไตย',attributes:{bold:true,color:'#1d4ed8',background:'#fef08a'}},{insert:'\n'},{insert:{studyImage:id}},{insert:'\n'}]};n.question='รัฐคืออะไร';n.answer='องค์ประกอบของรัฐ';
 const copy=validateNotebook(JSON.parse(JSON.stringify({version:1,notes:[n]})));
 assert.deepEqual(copy.notes[0],n);assert.deepEqual(referencedImages(copy),[id]);assert.ok(deltaText(n.delta).includes('อำนาจอธิปไตย'));
});
test('unsafe HTML, URLs, embeds and formatting cannot become executable note content',()=>{
 const d=cleanDelta({ops:[{insert:'<script>alert(1)</script>',attributes:{link:'javascript:alert(1)',color:'url(evil)',onclick:'evil',background:'#fef08a'}},{insert:{image:'https://tracker.test/x'}},{insert:{video:'javascript:x'}},{insert:{studyImage:'../../other-user/file.png'}}]});
 assert.equal(d.ops.length,2);assert.deepEqual(d.ops[0].attributes,{background:'#fef08a'});assert.equal(d.ops[0].insert,'<script>alert(1)</script>');
 assert.throws(()=>cleanDelta({ops:[{insert:'x'.repeat(200001)}]}));
});
test('search, pinning, archive and legacy copy do not discard original lesson notes',()=>{
 const a=newNote({id:'a',title:'หนึ่ง',course:'POL1101',text:'รัฐบาล'}),b=newNote({id:'b',title:'สอง'}),c=newNote({id:'c',title:'เก่า'});b.pinned=true;c.archived=true;
 const book={version:1,notes:[a,b,c]};assert.deepEqual(findNotes(book).map(n=>n.id),['a','b']);assert.deepEqual(findNotes(book,{query:'รัฐบาล'}).map(n=>n.id),['a']);assert.deepEqual(findNotes(book,{archived:true}).map(n=>n.id),['c']);
 const p=freshState();p.notes['POL1101-1']='ต้นฉบับ';assert.equal(legacyNotes(p,[])[0].id,'legacy-POL1101-1');assert.equal(p.notes['POL1101-1'],'ต้นฉบับ');
});
test('online notebook waits for a connected space and cannot silently create device-only data',()=>{
 const storage=memoryStorage(),space=createStudySpace({storage,progress:freshState()});
 assert.throws(()=>space.saveNotebook({version:1,notes:[newNote()]}),/พื้นที่บันทึก/);
 assert.throws(()=>space.saveProgress(freshState()),/พื้นที่บันทึก/);
 assert.equal(space.info().canEdit,false);assert.equal(storage.map.size,0);
});

test('another device with empty storage restores the complete workspace and pictures from Supabase',async()=>{
 const cloud=cloudFixture(),first=makeSpace(cloud),second=makeSpace(cloud);
 await first.init();
 const image=await first.uploadImage(new Blob(['test image'],{type:'image/png'}));
 const n=newNote({id:'rich',source:'classroom',course:'POL1101',text:'เปิดจากอีกเครื่อง'});n.delta.ops.unshift({insert:'ประเด็นสำคัญ',attributes:{color:'#1d4ed8',background:'#fef08a'}},{insert:{studyImage:image}});n.question='คำถาม';n.answer='คำตอบ';
 first.saveNotebook({version:1,notes:[n]});
 const progress=freshState();progress.completed=['POL1101-1'];progress.grades.POL1101='A';progress.hours.weekday=3;progress.termMoves.POL2104=2;progress.notes['POL1101-1']='โน้ตเดิม';first.saveProgress(progress);
 assert.equal(first.info().dirty,true);assert.notEqual(first.info().phase,'saved');
 await first.sync();assert.equal(first.info().dirty,false);assert.equal(first.info().status,'บันทึกใน Supabase แล้ว');assert.deepEqual(cloud.calls.slice(0,2),['image','workspace']);
 await second.init();assert.deepEqual(second.snapshot(),first.snapshot());assert.equal(await (await second.image(image)).text(),'test image');assert.ok(cloud.calls.includes('download'));
 first.dispose();second.dispose();
});

test('cloud remains writable even when device storage is unavailable',async()=>{
 const cloud=cloudFixture(),space=makeSpace(cloud,{storage:{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('quota')}}});
 await space.init();space.saveNotebook({version:1,notes:[newNote({id:'cloud-only',text:'บันทึกออนไลน์'})]});await space.sync();
 assert.equal(cloud.rows.get(cloud.owner.id).payload.notebook.notes[0].id,'cloud-only');assert.equal(space.info().dirty,false);space.dispose();
});

test('failed online saves stay pending, retry on recovery, and cannot be signed out prematurely',async()=>{
 const cloud=cloudFixture(),space=makeSpace(cloud);await space.init();cloud.fail(Error('offline'));
 space.saveNotebook({version:1,notes:[newNote({id:'pending'})]});await space.sync();assert.equal(space.info().dirty,true);assert.equal(space.info().phase,'error');assert.match(space.info().status,/ยังไม่บันทึกออนไลน์/);assert.equal(cloud.rows.size,0);
 await assert.rejects(()=>space.signOut(),/ยังมีข้อมูล/);cloud.fail(null);await space.sync();assert.equal(space.info().dirty,false);assert.equal(cloud.rows.get(cloud.owner.id).payload.notebook.notes[0].id,'pending');space.dispose();
});

test('failed image upload is reported and never inserts a device-only image',async()=>{
 const cloud=cloudFixture(),space=makeSpace(cloud);await space.init();cloud.fail(Error('offline'));
 await assert.rejects(()=>space.uploadImage(new Blob(['x'],{type:'image/png'})),/offline/);assert.equal(cloud.images.size,0);assert.equal(space.snapshot().notebook.notes.length,0);space.dispose();
});

test('cloud sync detects concurrent edits, keeps both revisions, and isolates account caches',async()=>{
 const cloud=cloudFixture(),storage=memoryStorage(),space=makeSpace(cloud,{storage});await space.init();
 space.saveNotebook({version:1,notes:[newNote({id:'mine',text:'ฉบับเครื่องนี้'})]});await space.sync();
 const remote=cloud.rows.get(cloud.owner.id);remote.revision=2;remote.payload.notebook.notes[0].title='แก้จากอีกเครื่อง';
 const changed=space.notebook();changed.notes[0].title='งานที่ยังไม่ซิงก์';space.saveNotebook(changed);await space.sync();assert.equal(space.info().conflict,true);assert.equal(cloud.calls.length,1);assert.equal(space.notebook().notes[0].title,'งานที่ยังไม่ซิงก์');
 await space.resolve(true);assert.equal(cloud.rows.get(cloud.owner.id).payload.notebook.notes[0].title,'งานที่ยังไม่ซิงก์');assert.equal(cloud.rows.get(cloud.owner.id).revision,3);assert.ok([...storage.map.keys()].some(k=>k.includes(':recovery:')));assert.ok(storage.map.has(workspaceKey('user-a')));assert.equal(storage.map.has(workspaceKey('user-b')),false);space.dispose();
});

test('initial cloud failure keeps editing locked rather than starting an empty offline workspace',async()=>{
 const cloud=cloudFixture();cloud.fail(Error('offline'));const space=makeSpace(cloud);await space.init();
 assert.equal(space.info().canEdit,false);assert.throws(()=>space.saveNotebook({version:1,notes:[]}),/ยังโหลด/);assert.equal(cloud.rows.size,0);
 cloud.fail(null);await space.sync();assert.equal(space.info().canEdit,true);space.dispose();
});

test('restore preserves the current workspace when a recovery copy cannot be saved',async t=>{
 const cloud=cloudFixture(),storage=memoryStorage(),space=makeSpace(cloud,{storage});
 t.after(()=>space.dispose());await space.init();
 space.saveNotebook({version:1,notes:[newNote({id:'original'})]});await space.flush();
 const incoming=space.snapshot();incoming.notebook.notes=[];
 const write=storage.setItem;storage.setItem=(key,value)=>{
  if(key.includes(':before-import:'))throw Error('storage full');
  write(key,value);
 };
 await assert.rejects(space.importSnapshot(incoming),/เก็บสำเนา/);
 assert.equal(space.notebook().notes[0].id,'original');
 assert.equal(cloud.rows.get(cloud.owner.id).payload.notebook.notes[0].id,'original');
});

test('restore reports a rejected cloud write and retains the pending edit for retry',async t=>{
 const cloud=cloudFixture(),space=makeSpace(cloud);
 t.after(()=>space.dispose());await space.init();
 const incoming=space.snapshot();incoming.notebook.notes.push(newNote({id:'restored'}));
 const rpc=cloud.client.rpc;cloud.client.rpc=async()=>({error:Error('offline')});
 await assert.rejects(space.importSnapshot(incoming),/offline/);
 assert.equal(space.info().dirty,true);
 cloud.client.rpc=rpc;await space.flush();
 assert.equal(cloud.rows.get(cloud.owner.id).payload.notebook.notes[0].id,'restored');
});

test('oversized progress and backups leave the editable workspace intact',async t=>{
 const cloud=cloudFixture(),space=makeSpace(cloud);
 t.after(()=>space.dispose());await space.init();
 const initial=space.snapshot(),incoming=space.snapshot();
 for(const lesson of lessons)incoming.progress.notes[lesson.id]='ก'.repeat(50000);
 assert.throws(()=>space.saveProgress(incoming.progress),/พื้นที่ข้อมูล/);
 await assert.rejects(space.importSnapshot(incoming),/พื้นที่ข้อมูล/);
 assert.deepEqual(space.snapshot(),initial);assert.equal(space.info().dirty,false);
});

test('replay dates can be backdated, corrected and cleared without changing edit time',async()=>{
 const {noteCards,setReplayDate}=await import('../dist/notebook-view.js');
 const n=newNote({id:'exam-note'}),edited=n.updatedAt;
 n.replayStudiedAt='2026-11-20T18:15:00Z';
 assert.match(noteCards([n]),/ติวย้อนหลังแล้ว · 21 พ.ย. 2569</);
 setReplayDate(n,'2026-11-18','2026-11-21');
 const saved=validateNotebook({version:1,notes:[n]}).notes[0];
 assert.equal(saved.replayStudiedAt,'2026-11-18');assert.equal(saved.updatedAt,edited);
 assert.match(noteCards([saved]),/ติวย้อนหลังแล้ว · 18 พ.ย. 2569</);
 assert.throws(()=>setReplayDate(n,'2026-11-22','2026-11-21'));
 assert.throws(()=>setReplayDate(n,'2026-02-30','2026-11-21'));
 setReplayDate(n,'');assert.equal(n.replayStudiedAt,undefined);
});

test('course picker follows registration overrides and builds session titles from the catalog',async()=>{
 const {sessionDetails,noteCourseChoices}=await import('../dist/notebook-view.js');
 const state=freshState();state.enrollment={POL1101:false,POL3314:true};
 assert.ok(noteCourseChoices(state,true).some(c=>c.id==='POL3314'));
 assert.ok(noteCourseChoices(state,false).some(c=>c.id==='POL1101'));
 assert.equal(sessionDetails('POL1101',2).title,'POL1101 การเมืองการปกครองไทย · ครั้งที่ 2');
 assert.equal(sessionDetails('POL1101',0),null);
 assert.equal(validateNotebook({version:1,notes:[newNote(sessionDetails('POL1101',2))]}).notes[0].session,2);
});


test('notebook library sorts by numeric course code, highest session, then newest edit, without mutating stored notes',async()=>{
 const {noteCards}=await import('../dist/notebook-view.js');
 const notes=[
  newNote({id:'newer-edit',course:'POL2301',session:1,title:'POL2301 · ครั้งที่ 1'}),
  newNote({id:'early-1',course:'POL1101',session:1,title:'POL1101 · ครั้งที่ 1'}),
  newNote({id:'early-3',course:'POL1101',session:3,title:'POL1101 · ครั้งที่ 3'}),
  newNote({id:'early-2',course:'POL1101',session:2,title:'POL1101 · ครั้งที่ 2'}),
  newNote({id:'late-2',course:'POL2107',session:2,title:'POL2107 · ครั้งที่ 2'}),
  newNote({id:'late-4',course:'POL2107',session:4,title:'POL2107 · ครั้งที่ 4'}),
 ];
 notes[1].updatedAt='2026-11-25T12:00:00Z';
 notes[2].updatedAt='2026-11-20T12:00:00Z';
 const before=JSON.stringify(notes);
 const ordered=findNotes({notes},{});
 assert.deepEqual(ordered.map(n=>n.id),['early-3','early-2','early-1','late-4','late-2','newer-edit']);
 assert.equal(JSON.stringify(notes),before,'view sorting should never modify saved notebook order');
 const html=noteCards(ordered);
 assert.ok(html.indexOf('POL1101 ·')<html.indexOf('POL2107 ·'));
 assert.ok(html.indexOf('ครั้งที่ 3')<html.indexOf('ครั้งที่ 2'));
 assert.match(html,/note-session-tone-3/);
 assert.match(html,/notebook-course-heading/);
});

test('legacy session titles remain sortable and an unclassified note falls last',async()=>{
 const {noteSession}=await import('../dist/notebook-core.js');
 const a=newNote({id:'class-7',course:'POL2303',title:'POL2303 บทเรียน · ครั้งที่ 7'});
 const b=newNote({id:'class-2',course:'POL2303',session:2,title:'POL2303 บทเรียน · ครั้งที่ 2'});
 const c=newNote({id:'unknown',course:'POL2303',title:'โน้ตทั่วไป'});
 assert.equal(noteSession(a),7);
 assert.deepEqual(findNotes({notes:[b,c,a]}).map(n=>n.id),['class-7','class-2','unknown']);
});
