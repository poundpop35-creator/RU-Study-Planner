import test from 'node:test';
import assert from 'node:assert/strict';
import {fileLimit,readAttachment,validateFiles,attachmentBlob,storedDocuments,documentFromBackup} from '../dist/note-files.js';
import {validateNotebook,newNote} from '../dist/notebook-core.js';
test('20 MiB document uses a storage reference; legacy inline data survives',async()=>{
 const file=new Blob([new Uint8Array(fileLimit)]);Object.defineProperty(file,'name',{value:'lecture.pdf'});
 let saved;const space={async uploadDocument(meta,blob){saved={meta,blob}},async document(){return saved.blob}};
 const item=await readAttachment(file,space);assert.equal(item.size,fileLimit);assert.equal(item.data,undefined);
 assert.equal((await attachmentBlob(item,space)).size,fileLimit);
 const old={id:'12345678-1234-1234-1234-123456789abc',name:'old.pdf',data:'YWJj'};
 const book=validateNotebook({version:6,notes:[{...newNote({id:'one'}),files:[old,item]}],courseMaterials:{POL2104:{files:[item],links:[]}}});
 assert.equal(book.version,7);assert.equal(book.notes[0].files[0].data,'YWJj');assert.equal(storedDocuments(book).length,1);
 assert.ok(JSON.stringify(book).length<10000);assert.deepEqual(validateFiles([item]),[item]);
 const large=new Blob([new Uint8Array(fileLimit+1)]);Object.defineProperty(large,'name',{value:'too-large.pdf'});
 await assert.rejects(readAttachment(large,space),/20 MB/);
 assert.throws(()=>validateFiles([{...item,size:fileLimit+1}]));
});
test('backup binary length is checked',()=>{const item={size:3};assert.equal(documentFromBackup(item,'YWJj').size,3);assert.throws(()=>documentFromBackup(item,'YQ=='));});
