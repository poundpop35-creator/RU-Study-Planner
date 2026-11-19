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
  assert.equal(validated.pages[0].objects[0].lineStyle,'dashed');
 }
 assert.throws(()=>validatePaper({version:1,pages:[{...emptyPage(),objects:[makeShape('a','rect',{x:0,y:0},{x:50,y:50},'#172033',2,'invalid')]}]}),/รูปแบบเส้น/);
 const square=makeShape('square','square',{x:100,y:150},{x:180,y:220},'#172033',3);
 assert.equal(square.w,square.h);assert.equal(square.w,70);
});
test('original outline shapes retain backward compatibility, and geometry edits undo cleanly',()=>{
 const before=emptyPage(),after=copy(before);
 after.objects.push({id:'old-shape',type:'shape',kind:'rect',x:10,y:10,w:40,h:30,color:'#172033',width:2,reverseX:false,reverseY:false});
 const checked=validatePaper({version:1,pages:[after]});
 assert.equal(checked.pages[0].objects[0].lineStyle,undefined);
 const h=pageHistory();h.record(before,after);assert.deepEqual(h.step(after),before);assert.deepEqual(h.step(before,false),after);
});
test('hold-to-snap recognizes clean lines, rectangles and circles but leaves short scribbles alone',()=>{
 assert.equal(recognizeHeldShape([[10,20],[35,22],[58,21],[89,24],[120,25]])?.kind,'line');
 const rect=[[20,20],[55,20],[100,20],[100,55],[100,95],[60,95],[20,95],[20,55],[20,20]];
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
