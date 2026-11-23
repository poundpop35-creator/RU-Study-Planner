import test from 'node:test';
import assert from 'node:assert/strict';
import {planRestore} from '../dist/notebook-backup.js';
import {newNote} from '../dist/notebook-core.js';
test('old workspace archive only contributes missing notebook IDs',()=>{
 const current={version:1,notes:[newNote({id:'known',text:'ใหม่'})]},old={...current.notes[0],delta:{ops:[{insert:'เก่า\n'}]}};
 const plan=planRestore({format:'ru-study-notebook',version:1,snapshot:{progress:{debt:999},notebook:{version:1,notes:[old,newNote({id:'missing'})]}}},current);
 assert.deepEqual(plan.next.notes[0],current.notes[0]);assert.deepEqual(plan.next.notes.map(n=>n.id),['known','missing']);assert.equal(plan.skipped,1);assert.equal('progress' in plan.next,false);assert.equal(current.notes.length,1);
});

import {createStudySpace} from '../dist/study-space.js';
import {freshState,DEBT_KEYS} from '../dist/core.js';
import {memoryStorage,cloudFixture,imageCache,settingsFetcher} from './cloud-fixture.js';
test('restore image and attachment on a second device without replacing debt, course progress or an existing note',async t=>{
 const cloud=cloudFixture();
 const open=async()=>{const s=createStudySpace({storage:memoryStorage(),progress:freshState(),clientFactory:()=>cloud.client,settingsFetcher,imageStore:imageCache()});t.after(()=>s.dispose());await s.init();return s};
 const a=await open(),progress=freshState();progress.completed=['POL1101-1'];progress.debt[DEBT_KEYS[0]]='{"balance":1800}';
 a.saveProgress(progress);a.saveNotebook({version:1,notes:[newNote({id:'original',text:'เก็บไว้'})]});await a.flush();
 const before=a.snapshot(),img='123e4567-e89b-12d3-a456-426614174000.png',n=newNote({id:'restored',text:'รูปเก่า'});n.delta.ops.unshift({insert:{studyImage:img}});
 n.files=[{id:'123e4567-e89b-12d3-a456-426614174001',name:'lecture.pdf',data:'QUJD'}];
 const data={version:1,format:'ru-study-notebook',snapshot:{progress:freshState(),notebook:{version:3,notes:[n]}}},base=JSON.stringify(before.notebook);
 const plan=planRestore(data,before.notebook);
 await assert.rejects(a.restoreNotebook(plan,base,{}));assert.deepEqual(a.snapshot(),before);
 await a.restoreNotebook(plan,base,{[img]:'data:image/png;base64,YWJj'});
 const b=await open();assert.deepEqual(b.snapshot().progress,before.progress);assert.deepEqual(b.notebook().notes,[before.notebook.notes[0],n]);assert.equal(await (await b.image(img)).text(),'abc');
 await assert.rejects(a.restoreNotebook(plan,base,{}),/เปลี่ยน/);
});
