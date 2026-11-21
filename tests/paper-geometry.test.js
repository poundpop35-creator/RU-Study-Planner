import test from 'node:test';
import assert from 'node:assert/strict';
import {makeShape,shapeSVG,shapes,lineStyles} from '../dist/paper-shapes.js';
import {recognizeHeldShape,rulerProject,rulerSnap,rulerSVG} from '../dist/paper-geometry.js';
import {emptyPage,validatePaper,pageHistory,copy} from '../dist/paper-core.js';

test('extra shapes render editable SVG and retain the selected line style after validation',()=>{
 assert.equal(Object.keys(shapes).length,14);
 assert.deepEqual(Object.keys(lineStyles),['solid','dashed','dotted']);
 for(const kind of Object.keys(shapes)){
  const s=makeShape('test-shape',kind,{x:90,y:80},{x:210,y:170},'#172033',3,'dashed');
  const svg=shapeSVG(s);
  assert.match(svg,/data-shape="/);assert.match(svg,/stroke-dasharray="/);
  const validated=validatePaper({version:1,pages:[{...emptyPage(),objects:[s]}]});
  assert.equal(validated.pages[0].objects[0].dash,'dashed');
 }
 assert.throws(()=>validatePaper({version:1,pages:[{...emptyPage(),objects:[makeShape('a','rect',{x:0,y:0},{x:50,y:50},'#172033',2,'invalid')]}]}),/รูปแบบเส้น/);
 const square=makeShape('square','square',{x:100,y:150},{x:180,y:220},'#172033',3);
 assert.equal(square.w,square.h);assert.ok(square.w>=70);
});
test('original outline shapes retain backward compatibility, and geometry edits undo cleanly',()=>{
 const before=emptyPage(),after=copy(before);
 after.objects.push({id:'old-shape',type:'shape',kind:'rect',x:10,y:10,w:40,h:30,color:'#172033',width:2,reverseX:false,reverseY:false});
 const checked=validatePaper({version:1,pages:[after]});
 assert.equal(checked.pages[0].objects[0].dash,undefined);
 const h=pageHistory();h.record(before,after);assert.deepEqual(h.step(after),before);assert.deepEqual(h.step(before,false),after);
});
test('hold-to-snap recognizes clean lines, rectangles and circles but leaves short scribbles alone',()=>{
 assert.equal(recognizeHeldShape([[10,20],[35,22],[58,21],[89,24],[120,25]])?.kind,'line');
 const rect=[[20,20],[80,20],[160,20],[160,55],[160,95],[100,95],[20,95],[20,55],[20,20]];
 assert.equal(recognizeHeldShape(rect)?.kind,'rect');
 const circle=Array.from({length:41},(_,i)=>[130+85*Math.cos(i*Math.PI*2/40),130+85*Math.sin(i*Math.PI*2/40)]);
 assert.equal(recognizeHeldShape(circle)?.kind,'circle');
 assert.equal(recognizeHeldShape([[10,10],[15,12],[16,10]]),null);
});
test('floating ruler rotates, snaps to either edge and is never written into a page',()=>{
 const r={active:true,x:450,y:600,angle:0,length:400,height:40};
 const edge=rulerSnap({x:500,y:620},r);
 assert.ok(edge);assert.equal(edge.edge,1);assert.equal(edge.y,620);
 assert.equal(rulerSnap({x:500,y:680},r),null);
 assert.equal(rulerProject({x:520,y:700},r,1).y,620);
 r.angle=90;const rotated=rulerProject({x:450,y:700},r,-1);
 assert.ok(Number.isFinite(rotated.x)&&Number.isFinite(rotated.y));
 assert.match(rulerSVG(r),/data-ruler="move"/);
 assert.match(rulerSVG(r),/data-ruler="rotate"/);
 assert.equal(rulerSVG({...r,active:false}),'');
});

test('eraser sweeps actual linework, including reversed arrowheads and elbow bends',async()=>{
 const {eraserHit}=await import('../dist/paper-shapes.js');
 const shape=kind=>makeShape('s',kind,{x:200,y:100},{x:0,y:0},'#172033',8);
 for(const kind of ['line','arrow','doubleArrow'])assert.ok(eraserHit(shape(kind),{x:100,y:-40},{x:100,y:150},0));
 assert.ok(eraserHit(shape('doubleArrow'),{x:165,y:99},undefined,2));
 assert.ok(eraserHit(shape('connector'),{x:170,y:100}));
 assert.equal(eraserHit(shape('connector'),{x:160,y:55}),false);
 assert.equal(eraserHit(shape('line'),{x:5,y:90}),false);
 assert.ok(eraserHit({type:'stroke',x:0,y:20,w:100,h:1,width:1,points:[[0,0],[1,0]]},{x:45,y:0},{x:45,y:45},0));
 for(const type of ['text','image','table'])assert.equal(eraserHit({type},{x:0,y:0}),false);
});
