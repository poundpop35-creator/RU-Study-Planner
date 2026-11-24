import test from 'node:test';
import assert from 'node:assert/strict';
import {
 PAGE_W,PAGE_H,MAX_CANVAS_HEIGHT,emptyPage,pageHeight,continuousContentHeight,
 paperFor,toContinuousPaper,validatePaper,mergePaper
} from '../dist/paper-core.js';
import {pageSVG,printBoundaryGuides,printableSheets} from '../dist/paper-render.js';
import {notebookHistory} from '../dist/paper-page-history.js';

const txt=(id,text,y)=>({id,type:'text',x:50,y,w:550,h:45,text,size:19,color:'#172033',bold:false});
test('new blank notes start on one continuous surface; populated legacy notes stay untouched',()=>{
 const blank=paperFor({id:'empty-note',delta:{ops:[{insert:'\n'}]}});
 assert.equal(blank.version,2);
 assert.equal(blank.pages.length,1);
 assert.equal(blank.pages[0].height,PAGE_H);
 const old=paperFor({id:'old-lesson',delta:{ops:[{insert:'บทเรียน\nรัฐและอำนาจ\n'}]}});
 assert.equal(old.version,1);
 assert.equal(old.pages.length,1);
 assert.ok(old.pages[0].objects.length);
});
test('conversion preserves all old page content, ids, table/text metadata and original ordering',()=>{
 const a=emptyPage(),b=emptyPage(),c=emptyPage();
 a.objects=[{...txt('first','เริ่ม',75),links:[{start:0,end:4,url:'https://example.org/'}]}];
 b.objects=[txt('middle','ตรงกลาง',120)];
 c.objects=[txt('last','จบ',200)];
 const original=validatePaper({version:1,pages:[a,b,c]});
 const extended=toContinuousPaper(original);
 assert.equal(extended.version,2);
 assert.equal(extended.pages.length,1);
 assert.equal(extended.pages[0].id,a.id);
 assert.equal(extended.pages[0].height,PAGE_H*3);
 assert.deepEqual(extended.pages[0].objects.map(o=>o.id),['first','middle','last']);
 assert.deepEqual(extended.pages[0].objects.map(o=>o.y),[75,PAGE_H+120,2*PAGE_H+200]);
 assert.equal(extended.pages[0].objects[0].links[0].url,'https://example.org/');
 assert.deepEqual(original.pages[1].objects[0].y,120,'original is not mutated');
 assert.deepEqual(toContinuousPaper(extended),extended,'conversion can be retried safely');
});
test('continuous validation supports strokes/text well past A4 without allowing off-canvas corruption',()=>{
 const page={...emptyPage(),height:PAGE_H*7};
 page.objects=[txt('deep','ความต่อเนื่อง',6*PAGE_H+35)];
 assert.equal(validatePaper({version:2,pages:[page]}).pages[0].objects[0].y,6*PAGE_H+35);
 assert.equal(pageHeight(page),7*PAGE_H);
 assert.equal(continuousContentHeight(page),7*PAGE_H);
 assert.throws(()=>validatePaper({version:2,pages:[{...page,height:PAGE_H}]}));
 assert.throws(()=>validatePaper({version:2,pages:[{...page,height:MAX_CANVAS_HEIGHT+1}]}));
 assert.throws(()=>validatePaper({version:2,pages:[page,emptyPage()]}));
});
test('dashed screen boundaries repeat at each A4 break but are excluded from print',()=>{
 const page={...emptyPage(),height:PAGE_H*3,objects:[
  txt('cross','สองหน้า',PAGE_H-20),txt('third','บทสาม',2*PAGE_H+135)
 ]};
 const model=validatePaper({version:2,pages:[page]});
 const guides=printBoundaryGuides(3*PAGE_H);
 assert.equal((guides.match(/data-print-boundary=/g)||[]).length,3);
 assert.match(guides,/stroke-dasharray="11 8"/);
 assert.match(guides,/A4 · หน้า 2/);
 const display=pageSVG(model.pages[0],new Map(),'paper-lines',3*PAGE_H,PAGE_W,true);
 assert.match(display,/data-print-boundary="1"/);
 const printed=printableSheets(model);
 assert.equal(printed.length,3,'A4 generated automatically by occupied content');
 assert.ok(printed[0].includes('data-object="cross"'));
 assert.ok(printed[1].includes('data-object="cross"'),'crossing content is on both clipped A4 sheets');
 assert.ok(printed[2].includes('data-object="third"'));
 assert.ok(printed.every(sheet=>!sheet.includes('data-print-boundary')),'guide not printed over writing');
});
test('print pagination skips virtually scrolled blank paper and does not introduce real pages',()=>{
 const page={...emptyPage(),height:PAGE_H*6,objects:[txt('early','เนื้อหา',80)]};
 const model=validatePaper({version:2,pages:[page]});
 assert.equal(printableSheets(model).length,1);
 assert.equal(model.pages.length,1);
});
test('conversion merges against an unchanged remote legacy notebook without dropping content',()=>{
 const p1={...emptyPage(),objects:[txt('a','หน้าแรก',20)]};
 const p2={...emptyPage(),objects:[txt('b','หน้าสอง',30)]};
 const old=validatePaper({version:1,pages:[p1,p2]});
 const result=mergePaper(old,toContinuousPaper(old),old);
 assert.equal(result.version,2);
 assert.equal(result.pages.length,1);
 assert.deepEqual(result.pages[0].objects.map(o=>o.id),['a','b']);
});
test('conversion can safely clear stale per-page undo without changing the saved objects',()=>{
 const history=notebookHistory();
 const p=emptyPage(),next={...p,template:'grid'};
 history.record(p,next,0);
 assert.ok(history.canUndo);
 history.clear();
 assert.equal(history.canUndo,false);
 assert.equal(history.canRedo,false);
});

test('converted page templates and identifiers survive reload and print; undo protects newer edits',()=>{
 const a=emptyPage(),b=emptyPage();
 b.template='grid';b.objects=[txt('grid-content','ในตาราง',100)];
 const original=validatePaper({version:1,pages:[a,b]});
 const converted=validatePaper(toContinuousPaper(original));
 assert.deepEqual(converted.pages[0].sections,[{id:a.id,template:'ruled'},{id:b.id,template:'grid'}]);
 assert.match(pageSVG(converted.pages[0],new Map()),/M30 0 H0 V30/);
 assert.match(printableSheets(converted)[1],/M30 0 H0 V30/);
 const history=notebookHistory();
 history.record(original,converted,0,true);
 const newer=structuredClone(converted);newer.pages[0].objects[0].text+='!';
 assert.throws(()=>history.apply(newer.pages,true,()=>true));
 assert.throws(()=>mergePaper(converted,original,newer));
 let restored;
 const save=(pages,id,version)=>{restored={version,pages};return true;};
 history.apply(converted.pages,true,save);assert.deepEqual(restored,original);
 history.apply(restored.pages,false,save);assert.deepEqual(restored,converted);
});

test('wide highlight crossing A4 prints both fragments',()=>{
 const page={...emptyPage(),height:PAGE_H*2,objects:[{id:'marker',type:'stroke',tool:'highlight',width:40,color:'#ffff00',x:100,y:PAGE_H-5,w:100,h:1,points:[[0,0,.5],[1,0,.5]]}]};
 const sheets=printableSheets({version:2,pages:[page]});
 assert.equal(sheets.length,2);
 for(const sheet of sheets)assert.match(sheet,/data-object="marker"/);
});
test('wide notes preserve translucent shapes behind text on reload, merge and A4 print',()=>{
 const p=emptyPage(),s={id:'badge',type:'shape',kind:'roundRect',x:2800,y:100,w:200,h:80,color:'#3155dd',width:2,fill:'#aabbcc',opacity:0.4};
 p.objects=[{...txt('label','หัวข้อ',110),x:2820},s];
 const before=validatePaper({version:2,pages:[p]}),local=structuredClone(before),remote=structuredClone(before);
 local.pages[0].objects.reverse();remote.pages[0].objects[0].text='เปลี่ยนชื่อ';
 const merged=mergePaper(before,local,remote);
 assert.deepEqual(merged.pages[0].objects.map(o=>o.id),['badge','label']);
 const printed=printableSheets(merged).at(-1);
 assert.match(printed,/translate\(-2700,/);assert.match(printed,/fill="#aabbcc" opacity="0.4"/);assert.match(printed,/เปลี่ยนชื่อ/);
});

test('A4 frames are opt-in and tile horizontally without changing content',()=>{
 const p=emptyPage();
 assert.doesNotMatch(pageSVG(p,new Map(),'paper-lines',PAGE_H*2,PAGE_W*2),/data-print-boundary/);
 const shown=pageSVG(p,new Map(),'paper-lines',PAGE_H*2,PAGE_W*2,true);
 assert.equal((shown.match(/data-print-boundary=/g)||[]).length,4);
 assert.match(shown,/fill="none" stroke="#778db6"/);
});

test('switching back to A4 restores original pages and refuses to clip crossing objects',async()=>{
 const {toPagedPaper}=await import('../dist/paper-core.js');
 const a=emptyPage(),b=emptyPage();b.template='dots';b.objects.push(txt('second','บทเรียน',50));
 const original=validatePaper({version:1,pages:[a,b]});
 const sheet=toContinuousPaper(original);
 assert.deepEqual(toPagedPaper(sheet),original);
 sheet.pages[0].objects[0].y=PAGE_H-10;
 assert.throws(()=>toPagedPaper(sheet),/คร่อมขอบ/);
});
