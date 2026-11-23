import test from 'node:test';
import assert from 'node:assert/strict';
import {planRestore} from '../dist/notebook-backup.js';
import {newNote} from '../dist/notebook-core.js';
test('old workspace archive only contributes missing notebook IDs',()=>{
 const current={version:1,notes:[newNote({id:'known',text:'ใหม่'})]},old={...current.notes[0],delta:{ops:[{insert:'เก่า\n'}]}};
 const plan=planRestore({format:'ru-study-notebook',version:1,snapshot:{progress:{debt:999},notebook:{version:1,notes:[old,newNote({id:'missing'})]}}},current);
 assert.deepEqual(plan.next.notes[0],current.notes[0]);assert.deepEqual(plan.next.notes.map(n=>n.id),['known','missing']);assert.equal(plan.skipped,1);assert.equal('progress' in plan.next,false);assert.equal(current.notes.length,1);
});
