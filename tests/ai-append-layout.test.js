import test from 'node:test';
import assert from 'node:assert/strict';
import {appendImageBatch} from '../dist/ai-append-layout.js';
import {validatePaper,MAX_CANVAS_HEIGHT} from '../dist/paper-core.js';
const img=i=>({imageId:'00000000-0000-4000-8000-'+String(i).padStart(12,'0')+'.png',width:1200,height:1600});
const old={id:'text1',type:'text',x:10,y:100,w:100,h:100,text:'old',size:16,color:'#000000',bold:false};
const initial=()=>({version:2,pages:[{id:'sheet',template:'ruled',height:1273,objects:[structuredClone(old)]}]});
test('four images appended in order and original retained',()=>{
 const base=initial(),snapshot=structuredClone(base);
 const r=appendImageBatch(base,[1,2,3,4].map(img),'request-123');
 assert.deepEqual(base,snapshot);
 assert.deepEqual(r.paper.pages[0].objects[0],old);
 assert.equal(r.added,4);validatePaper(r.paper);
 const images=r.paper.pages[0].objects.slice(1);
 for(const [i,o] of images.entries()){
  assert.equal(o.imageId,img(i+1).imageId);
  assert.ok(Math.abs(o.w/o.h-.75)<1e-9);
  const prev=i?images[i-1]:old;
  assert.ok(o.y>prev.y+prev.h);
 }
});
test('same request replays without adding and different payload rejects',()=>{
 const r=appendImageBatch(initial(),[img(1),img(2)],'request-123');
 const retry=appendImageBatch(r.paper,[img(1),img(2)],'request-123');
 assert.equal(retry.added,0);assert.deepEqual(retry.paper,r.paper);
 assert.throws(()=>appendImageBatch(r.paper,[img(3)],'request-123'),/conflict/);
});
test('paged notebook keeps original pages untouched',()=>{
 const base={version:1,pages:[{id:'oldpage',template:'ruled',objects:[old]}]};
 const r=appendImageBatch(base,[img(1),img(2)],'request-paged');
 assert.deepEqual(r.paper.pages[0],base.pages[0]);
 assert.equal(r.paper.pages.length,3);validatePaper(r.paper);
});
test('capacity and invalid metadata fail without changing source',()=>{
 const base=initial();base.pages[0].height=MAX_CANVAS_HEIGHT;
 base.pages[0].objects[0].y=MAX_CANVAS_HEIGHT-100;
 const snapshot=structuredClone(base);
 assert.throws(()=>appendImageBatch(base,[img(1)],'request-full'),/height limit/);
 assert.deepEqual(base,snapshot);
 assert.throws(()=>appendImageBatch(initial(),[{...img(1),width:0}],'request-bad'),/metadata/);
});
