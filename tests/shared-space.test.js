import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedClient,sharedKey,legacyKeys,migrateLegacy} from '../dist/shared-space.js';
import {personalKey,createPersonalClient} from '../dist/personal-client.js';
import {createStudySpace} from '../dist/study-space.js';
import {freshState} from '../dist/core.js';
import {newNote,validateEnvelope} from '../dist/notebook-core.js';
import {memoryStorage,imageCache} from './cloud-fixture.js';
const loc=hash=>({origin:'https://study.example.test',pathname:'/',hash:hash||''});
function backend(){
 const rows=new Map(),images=new Map(),seen=[];
 const fetcher=async(url,options={})=>{
  const key=options.headers['x-study-key'],path=new URL(url).pathname.split('/personal-study').pop();seen.push(key);
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
  if(path==='/open')return json({id:key});
  if(path==='/workspace'){
   if(options.method!=='POST')return json(rows.get(key)||null);
   const body=JSON.parse(options.body),old=rows.get(key);if(body.expected_revision!==(old?.revision||0))return json({code:'40001'},409);
   const row={payload:body.new_payload,revision:body.expected_revision+1,updated_at:new Date().toISOString()};rows.set(key,row);return json({revision:row.revision,updated_at:row.updated_at});
  }
  const imageKey=key+'/'+path.slice(7);
  if(options.method==='POST'){images.set(imageKey,options.body);return json({ok:true});}
  return images.has(imageKey)?new Response(images.get(imageKey)):json({error:'missing image'},404);
 };
 return {fetcher,rows,images,seen};
}
const device=(storage,backend)=>{
 const client=createSharedClient({storage,fetcher:backend.fetcher,location:loc()});
 return createStudySpace({storage,progress:freshState(),clientFactory:()=>client,imageStore:imageCache()});
};
test('independent browsers, existing private keys and storage-blocked devices use one public workspace',async()=>{
 const server=backend(),a=memoryStorage(),b=memoryStorage();a.setItem(personalKey,'a'.repeat(64));b.setItem(personalKey,'b'.repeat(64));
 for(const storage of [a,b,{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}]){
  const client=createSharedClient({storage,fetcher:server.fetcher,location:loc('#space='+'c'.repeat(64)),history:{replaceState(){}}});
  assert.equal((await client.auth.getSession()).data.session.user.id,sharedKey);assert.equal(client.access().url,'https://study.example.test/');
 }
 assert.deepEqual(new Set(server.seen),new Set([sharedKey]));assert.equal(a.getItem(personalKey),'a'.repeat(64));assert.equal(b.getItem(personalKey),'b'.repeat(64));
 assert.deepEqual(legacyKeys(a,loc('#space='+'c'.repeat(64))),['c'.repeat(64),'a'.repeat(64)]);
});
test('save, edit, images and deletion propagate to another browser without a login or special URL',async()=>{
 const server=backend(),a=device(memoryStorage(),server),b=device(memoryStorage(),server);await a.init();await b.init();
 const image=await a.uploadImage(new Blob(['picture'],{type:'image/png'}));const n=newNote({id:'same',text:'เห็นทุกเครื่อง'});n.delta.ops.unshift({insert:{studyImage:image}});
 a.saveNotebook({version:1,notes:[n]});await a.sync();await b.sync();assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(await(await b.image(image)).text(),'picture');
 const book=b.notebook();book.notes[0].title='แก้จากมือถือ';b.saveNotebook(book);await b.sync();await a.sync();assert.equal(a.notebook().notes[0].title,'แก้จากมือถือ');
 b.saveNotebook({version:1,notes:[]});await b.sync();await a.sync();assert.equal(a.notebook().notes.length,0);a.dispose();b.dispose();
});
test('migration retains original data, combines pending edits and does not resurrect deleted notes on another browser',async()=>{
 const server=backend(),storage=memoryStorage(),key='d'.repeat(64),cache=imageCache();storage.setItem(personalKey,key);
 const old=createPersonalClient({storage,accountKey:key,fetcher:server.fetcher,location:loc()}),image='123e4567-e89b-12d3-a456-426614174000.png';
 const note=newNote({id:'old',title:'ต้นฉบับ'});note.delta.ops.unshift({insert:{studyImage:image}});
 const payload={version:1,progress:freshState(),notebook:{version:1,notes:[note]}};payload.progress.completed=['POL1101-1'];
 await old.rpc('',{expected_revision:0,new_payload:payload});await old.storage.from('').upload(key+'/'+image,new Blob(['old image'],{type:'image/png'}));
 const pending=structuredClone(payload);pending.notebook.notes[0].title='ฉบับค้างบันทึก';storage.setItem('ru-study-workspace.v1:'+key,JSON.stringify({dirty:true,payload:pending}));
 const shared=createSharedClient({storage,fetcher:server.fetcher,location:loc()});const opts={client:shared,keys:[key],storage,imageStore:cache,fetcher:server.fetcher,progress:freshState()};
 await migrateLegacy(opts);const row=server.rows.get(sharedKey);assert.equal(row.payload.notebook.notes.length,2);assert.equal(row.payload.migrations.length,2);assert.equal(row.payload.progress.completed[0],'POL1101-1');
 assert.equal(server.rows.get(key).payload.notebook.notes[0].title,'ต้นฉบับ');assert.equal(JSON.parse(storage.getItem('ru-study-workspace.v1:'+key)).dirty,true);
 const migratedImage=row.payload.notebook.notes[0].delta.ops[0].insert.studyImage;assert.notEqual(migratedImage,image);assert.equal(await server.images.get(sharedKey+'/'+migratedImage).text(),'old image');
 const deleted=validateEnvelope(row.payload,x=>x);deleted.notebook.notes=[];await shared.rpc('',{expected_revision:row.revision,new_payload:deleted});
 await migrateLegacy({...opts,storage:memoryStorage()});assert.equal(server.rows.get(sharedKey).payload.notebook.notes.length,0);
 await migrateLegacy(opts);assert.equal(server.rows.get(sharedKey).payload.notebook.notes.length,0);
});
test('missing source image aborts migration without changing shared notes; retry recovers',async()=>{
 const server=backend(),storage=memoryStorage(),key='e'.repeat(64),image='123e4567-e89b-12d3-a456-426614174000.png';const n=newNote({id:'image'});n.delta.ops.unshift({insert:{studyImage:image}});
 server.rows.set(key,{revision:1,payload:{version:1,progress:freshState(),notebook:{version:1,notes:[n]}}});
 const client=createSharedClient({storage,fetcher:server.fetcher,location:loc()}),opts={client,keys:[key],storage,imageStore:imageCache(),fetcher:server.fetcher};
 await assert.rejects(()=>migrateLegacy(opts),err=>err.message==='missing image');assert.equal(server.rows.has(sharedKey),false);
 server.images.set(key+'/'+image,new Blob(['recovered'],{type:'image/png'}));await migrateLegacy(opts);assert.equal(server.rows.get(sharedKey).payload.notebook.notes.length,1);
});

test('a stale local cache with the correct revision is repaired from the shared cloud',async()=>{
 const server=backend(),storage=memoryStorage(),first=device(storage,server);
 await first.init();
 const original=newNote({id:'shared-recover',text:'บันทึกยังอยู่ในคลาวด์'});
 first.saveNotebook({version:1,notes:[original]});await first.flush();first.dispose();
 const key='ru-study-workspace.v1:'+sharedKey;
 const stale=JSON.parse(storage.getItem(key));
 assert.equal(stale.dirty,false);
 stale.payload.notebook.notes=[]; // Browser cache corrupted; cloud revision unchanged.
 storage.setItem(key,JSON.stringify(stale));
 const second=device(storage,server);
 try{
  await second.init();
  assert.equal(second.info().canEdit,true);
  assert.equal(second.notebook().notes.length,1);
  assert.equal(second.notebook().notes[0].id,'shared-recover');
  assert.equal(JSON.parse(storage.getItem(key)).payload.notebook.notes.length,1);
 }finally{second.dispose();}
});
