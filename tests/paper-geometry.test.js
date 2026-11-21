import test from 'node:test';
import assert from 'node:assert/strict';
import {makeShape,shapeSVG,shapes,lineStyles,snapLinePoint,snapMovedLine} from '../dist/paper-shapes.js';
import {recognizeHeldShape,recognizeDrawnShape,rulerProject,rulerSnap,rulerSVG} from '../dist/paper-geometry.js';
import {emptyPage,validatePaper,pageHistory,copy,mergePaper} from '../dist/paper-core.js';

test('extra shapes render editable SVG and retain the selected line style after validation',()=>{
 assert.equal(Object.keys(shapes).length,16);
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

test('one horizontal drag produces a level three-branch diagram in either direction',()=>{
 const a={x:40,y:100},b={x:240,y:100};
 for(const [from,to] of [[a,b],[b,a]]){
  const shape=makeShape('branch','branch3',from,to,'#172033',2);
  assert.match(shapeSVG(shape),/M40 118 L40 109 L240 109 L240 118 M140 100 L140 118/);
 }
});

test('lines attach at an endpoint or along a segment when drawn or moved nearby',()=>{
 const line=(id,x,y,endX,endY)=>makeShape(id,'line',{x,y},{x:endX,y:endY},'#172033',2);
 const rail=line('rail',100,100,300,100);
 assert.deepEqual(snapLinePoint({x:98,y:99},[rail],8),{x:100,y:100});
 const middle=snapLinePoint({x:200,y:104},[rail],8);
 assert.ok(Math.abs(middle.x-200)<1 && Math.abs(middle.y-100)<1);
 const near=line('next',98,97,150,50);
 const moved=snapMovedLine(near,[rail],8);
 assert.equal(moved.x,100);assert.equal(moved.y+moved.h,100);
 assert.equal(moved.w,near.w);assert.equal(moved.h,near.h);
 const far={x:50,y:20};assert.equal(snapLinePoint(far,[rail],8),far);
});

test('shape on Pencil release: a closed loop becomes circle/ellipse rather than a zero-length line',()=>{
 const circle=Array.from({length:55},(_,i)=>{
  const a=(i/54)*Math.PI*1.98;
  return [240+82*Math.cos(a)+(i%3-1)*.7,260+82*Math.sin(a)+(i%4-2)*.6,.5];
 });
 const c=recognizeHeldShape(circle);
 assert.equal(c?.kind,'circle');
 const oval=Array.from({length:55},(_,i)=>{
  const a=(i/54)*Math.PI*1.98;return [320+115*Math.cos(a),280+56*Math.sin(a),.5];
 });
 assert.equal(recognizeHeldShape(oval)?.kind,'ellipse');
 const line=[[10,10,.5],[50,11,.5],[100,10,.5],[175,12,.5]];
 assert.equal(recognizeHeldShape(line)?.kind,'line');
 assert.equal(recognizeHeldShape([[10,10,.5],[45,60,.5],[75,15,.5]]),null);
});

test('realistic Pencil circles and ellipses, but not an open arc',()=>{
 const loop=(n,span,rx,ry,jitter=0)=>Array.from({length:n},(_,i)=>{
  const t=span*i/(n-1),j=jitter*Math.sin(i*3.7);
  return [230+(rx+j)*Math.cos(t),210+(ry+j)*Math.sin(t),.5];
 });
 assert.equal(recognizeDrawnShape(loop(51,Math.PI*1.74,85,81,5))?.kind,'circle');
 assert.equal(recognizeDrawnShape(loop(51,Math.PI*1.76,118,62,4))?.kind,'ellipse');
 assert.equal(recognizeDrawnShape(loop(51,Math.PI*2,85,85,9))?.kind,'circle');
 assert.equal(recognizeDrawnShape(loop(30,Math.PI*1.04,85,85)),null);
 assert.equal(recognizeDrawnShape([[10,12],[75,13],[150,12]])?.kind,'line');
});

test('axis lines meet exactly on a rail and render with no one-pixel tilt',()=>{
 const rail=makeShape('r','line',{x:20,y:50},{x:240,y:50},'#172033',2);
 const start=snapLinePoint({x:90,y:54},[rail],8);
 assert.deepEqual(start,{x:90,y:50});
 const limb=makeShape('l','line',start,{x:start.x,y:180},'#172033',2);
 assert.match(shapeSVG(rail),/M20 50 L240 50/);
 assert.match(shapeSVG(limb),/M90 50 L90 180/);
});
test('filled arrows keep their direction, paint and position behind text across serialization and undo',()=>{
 const before=emptyPage(),arrow=makeShape('arrow','blockArrow',{x:180,y:80},{x:20,y:80},'#247a58',2);
 const text={id:'title',type:'text',x:30,y:60,w:80,h:40,size:16,text:'ใจความ',color:'#172033',bold:false};
 before.objects=[text,arrow];
 const after=copy(before);after.objects.reverse();after.objects[0].fill='#ffee88';
 const checked=validatePaper(JSON.parse(JSON.stringify({version:1,pages:[after]}))).pages[0];
 assert.deepEqual(checked,after);assert.match(shapeSVG(checked.objects[0]),/fill="#ffee88"/);
 assert.match(shapeSVG({...arrow,fill:'none'}),/fill="none"/);assert.ok(arrow.h>1&&arrow.reverseX);
 assert.throws(()=>validatePaper({version:1,pages:[{...before,objects:[{...arrow,fill:'invalid'}]}]}));
 const history=pageHistory();history.record(before,after);assert.deepEqual(history.step(after),before);
});

test('cloud edit of an existing object survives a concurrent local layer change; divergent orders conflict',()=>{
 const objects=['a','b','c'].map(id=>makeShape(id,'rect',{x:1,y:1},{x:40,y:30},'#112233',2));
 const doc=objects=>({version:1,pages:[{id:'page',template:'plain',objects}]});
 const [a,b,c]=objects,local=doc([c,a,b]),remote=doc([a,{...b,fill:'#123456'},c]);
 const out=mergePaper(doc(objects),local,remote).pages[0].objects;
 assert.deepEqual(out.map(o=>o.id),['c','a','b']);assert.equal(out[2].fill,'#123456');
 assert.throws(()=>mergePaper(doc(objects),local,doc([b,c,a])),/ลำดับชั้น/);
});
