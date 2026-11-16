import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmNoteDelete} from '../dist/note-delete-dialog.js';
import {createStudySpace} from '../dist/study-space.js';
import {freshState} from '../dist/core.js';
import {newNote} from '../dist/notebook-core.js';
import {cloudFixture,memoryStorage,imageCache,settingsFetcher} from './cloud-fixture.js';

test('in-page confirmation works without native confirm, handles cancel/Escape and safely displays titles',async()=>{
 const saved={document:globalThis.document,window:globalThis.window,confirm:globalThis.confirm};
 let overlay;const handlers={};
 const element=()=>({listeners:{},isConnected:true,textContent:'',addEventListener(type,fn){this.listeners[type]=fn;},focus(){document.activeElement=this;},remove(){this.removed=true;}});
 const previous=element();globalThis.document={activeElement:previous,body:{append(el){overlay=el;}},addEventListener(type,fn){handlers[type]=fn;},removeEventListener(type){delete handlers[type];},createElement(){const root=element(),parts={};root.querySelector=s=>parts[s]??=element();return root;}};
 globalThis.window={addEventListener(type,fn){handlers[type]=fn;},removeEventListener(type){delete handlers[type];}};
 globalThis.confirm=()=>{throw Error('native confirmation must not run');};
 const click=selector=>overlay.querySelector(selector).listeners.click({stopPropagation(){}});
 try{
  let result=confirmNoteDelete('<script>test</script>');assert.equal(overlay.querySelector('.note-delete-name').textContent,'<script>test</script>');assert.ok(!overlay.innerHTML.includes('<script>test</script>'));
  click('[data-delete-choice="confirm"]');assert.equal(await result,true);assert.equal(overlay.removed,true);assert.equal(document.activeElement,previous);
  result=confirmNoteDelete('cancel');click('[data-delete-choice="cancel"]');assert.equal(await result,false);
  result=confirmNoteDelete('escape');handlers.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(await result,false);
  result=confirmNoteDelete('navigate');handlers.hashchange();assert.equal(await result,false);assert.deepEqual(handlers,{});
 }finally{Object.assign(globalThis,saved);}
});

test('delete waits for in-flight autosave and removes only the selected note in cloud',async()=>{
 const cloud=cloudFixture(),space=createStudySpace({storage:memoryStorage(),progress:freshState(),clientFactory:()=>cloud.client,settingsFetcher,imageStore:imageCache()});await space.init();
 space.saveNotebook({version:1,notes:[newNote({id:'remove'}),newNote({id:'keep'})]});
 const rpc=cloud.client.rpc;let release;const waiting=new Promise(r=>release=r);let entered;const started=new Promise(r=>entered=r);
 cloud.client.rpc=async(...args)=>{entered();await waiting;return rpc(...args);};
 const saving=space.sync();await started;const deleting=space.deleteNote('remove');release();await saving;await deleting;
 assert.deepEqual(cloud.rows.get(cloud.owner.id).payload.notebook.notes.map(n=>n.id),['keep']);assert.equal(space.info().dirty,false);space.dispose();
});

test('offline deletion reports failure and does not remove notes before connecting',async()=>{
 const cloud=cloudFixture(),space=createStudySpace({storage:memoryStorage(),progress:freshState(),clientFactory:()=>cloud.client,settingsFetcher,imageStore:imageCache()});await space.init();space.saveNotebook({version:1,notes:[newNote({id:'keep'})]});await space.sync();
 cloud.fail(Error('offline'));await assert.rejects(()=>space.deleteNote('keep'),/offline/);assert.equal(space.notebook().notes.length,1);assert.equal(cloud.rows.get(cloud.owner.id).payload.notebook.notes.length,1);space.dispose();
});
