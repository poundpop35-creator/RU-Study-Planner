import test from 'node:test';
import assert from 'node:assert/strict';
import {makeShape,shapeSVG,shapePoint,shapeContains,eraserTargetHit,shapes,lineStyles,snapLinePoint,snapMovedLine} from '../dist/paper-shapes.js';
import {recognizeHeldShape,recognizeDrawnShape,rulerProject,rulerSnap,rulerSVG} from '../dist/paper-geometry.js';
import {emptyPage,validatePaper,pageHistory,copy} from '../dist/paper-core.js';

test('extra shapes render editable SVG and retain the selected line style after validation',()=>{
 assert.equal(Object.keys(shapes).length,15);
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

test('straighten preserves three side or downward branches, including retraced ink',async()=>{
 const {diagramSegments,hasBranchJunction}=await import('../dist/paper-geometry.js');
 const e=[[80,0],[0,2],[1,40],[74,42],[0,39],[2,82],[81,80]];
 for(const points of [e,e.map(([x,y])=>[y,x]),[...e].reverse()]){
  const lines=diagramSegments(points);
  assert.equal(lines.length,4);
  assert.ok(hasBranchJunction(lines));
  assert.ok(lines.every(({start,end})=>start.x===end.x||start.y===end.y));
 }
 assert.equal(diagramSegments([[2,1],[13,13],[25,24]]),null);
});

test('release recognizes traced arrowheads and remembers downward triangle orientation',()=>{
 const arrow=[[30,0],[29,45],[36,105],[14,85],[35,105],[51,78]];
 const triangle=[[2,1],[39,3],[33,30],[28,59],[12,25],[1,0]];
 for(const path of [arrow,[...arrow].reverse(),arrow.map(([x,y])=>[y,x])])
  assert.equal(recognizeDrawnShape(path)?.kind,'arrow');
 for(const path of [triangle,[...triangle].reverse()]){
  const found=recognizeDrawnShape(path);
  assert.equal(found?.kind,'triangle');assert.equal(found.inverted,true);
  const o={...makeShape('tri',found.kind,found.start,found.end,'#172033',3),inverted:true};
  const saved=validatePaper({version:1,pages:[{...emptyPage(),objects:[o]}]}).pages[0].objects[0];
  assert.ok(saved.inverted);assert.ok(shapeSVG(saved).includes('M'+(o.x+o.w/2)+' '+(o.y+o.h)));
 }
 assert.notEqual(recognizeDrawnShape([[0,0],[0,100],[20,80]])?.kind,'arrow');
});


test('held triangles retain their apex direction and modestly shaky lines still straighten',()=>{
 const descending=[[20,20],[90,20],[70,65],[55,110],[35,65],[20,20]];
 const samples=descending.flatMap((p,i)=>i?Array.from({length:9},(_,j)=>{
  const a=descending[i-1],t=(j+1)/9;
  return [a[0]+(p[0]-a[0])*t,a[1]+(p[1]-a[1])*t];
 }):[p]);
 const held=recognizeHeldShape(samples);
 assert.equal(held?.kind,'triangle');
 assert.equal(held?.inverted,true,'a downward apex may not be replaced by an upright triangle');
 const wavering=Array.from({length:25},(_,i)=>[10+i*7,30+i*.44+Math.sin(i*1.8)*3]);
 assert.equal(recognizeDrawnShape(wavering)?.kind,'line','moderately uneven straight pen strokes should snap');
 assert.notEqual(recognizeDrawnShape([[0,0],[55,60],[110,0]])?.kind,'line','an open V must remain ink');
});
test('rotation survives persistence, keeps old shapes at zero and adjusts hit-testing',()=>{
 const original=makeShape('angled','triangle',{x:100,y:100},{x:190,y:180},'#172033',3);
 const rotated={...original,angle:90};
 const svg=shapeSVG(rotated);
 assert.match(svg,/transform="rotate\(90 145 140\)"/);
 assert.doesNotMatch(shapeSVG(original),/rotate\(/);
 const saved=validatePaper({version:1,pages:[{...emptyPage(),objects:[rotated]}]}).pages[0].objects[0];
 assert.equal(saved.angle,90);
 const before=copy(saved);
 assert.equal(shapeContains(rotated,shapePoint(rotated,{x:105,y:110})),true);
 assert.ok(eraserTargetHit(rotated,{x:145,y:140},{x:145,y:140},'shape'));
 assert.ok(!eraserTargetHit(rotated,{x:145,y:140},{x:145,y:140},'stroke'));
 const history=pageHistory();const page=emptyPage();page.objects=[before];
 const after=copy(page);after.objects[0].angle=180;
 history.record(page,after);
 assert.deepEqual(history.step(after),page);
 assert.throws(()=>validatePaper({version:1,pages:[{...emptyPage(),objects:[{...rotated,angle:900}]}]}),/มุมหมุน/);
});
test('eraser modes do not delete object types outside the chosen category',()=>{
 const stroke={type:'stroke',x:0,y:0,w:100,h:1,width:3,points:[[0,0],[1,0]]};
 const shape=makeShape('fig','rect',{x:10,y:5},{x:110,y:90},'#172033',3);
 const line=makeShape('line','line',{x:0,y:50},{x:100,y:50},'#172033',3);
 const textBox={type:'text',x:0,y:0,w:130,h:30,text:'ประโยค'};
 assert.ok(eraserTargetHit(stroke,{x:35,y:0},{x:35,y:0},'stroke'));
 assert.ok(!eraserTargetHit(stroke,{x:35,y:0},{x:35,y:0},'text'));
 assert.ok(eraserTargetHit(shape,{x:55,y:50},{x:55,y:50},'shape'));
 assert.ok(!eraserTargetHit(shape,{x:55,y:50},{x:55,y:50},'stroke'));
 assert.ok(eraserTargetHit(line,{x:50,y:48},{x:50,y:52},'shape'));
 assert.ok(eraserTargetHit(textBox,{x:4,y:5},{x:4,y:5},'text'));
 assert.ok(!eraserTargetHit(textBox,{x:4,y:5},{x:4,y:5},'shape'));
});
