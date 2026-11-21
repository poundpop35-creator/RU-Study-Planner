import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTable,tableGrid,tableWithCells,tableSVG,validateTableCells,TABLE_MAX_ROWS,TABLE_MAX_COLS} from '../dist/paper-table.js';
import {paperFor,validatePaper,copy,mergePaper,pageHistory} from '../dist/paper-core.js';
import {validateNotebook,newNote,findNotes,noteText} from '../dist/notebook-core.js';
import {objectSVG} from '../dist/paper-render.js';

const note=()=>newNote({id:'table-test',course:'POL2106',title:'ปรัชญาการเมือง'});
test('new table starts 3×3 with editable cells, coordinates, and stable object ID',()=>{
 const item=makeTable('table-one');
 assert.equal(item.type,'table');
 assert.deepEqual([item.cells.length,item.cells[0].length],[3,3]);
 assert.equal(item.cells[0][0],'');
 const paper=paperFor(note());paper.pages[0].objects.push(item);
 assert.deepEqual(validatePaper(paper).pages[0].objects.at(-1),item);
 assert.deepEqual(validateNotebook({version:2,notes:[{...note(),paper}]}).notes[0].paper.pages[0].objects.at(-1),item);
});
test('table cells accept Unicode Thai text and roundtrip through notebook search',()=>{
 const paper=paperFor(note()),item=makeTable('table-two');
 item.cells[0][0]='นักปรัชญา';
 item.cells[1][1]='เพลโต: ความยุติธรรม';
 paper.pages[0].objects.push(item);
 const doc=validateNotebook({version:6,notes:[{...note(),paper}],courseMaterials:{}});
 const result=doc.notes[0].paper.pages[0].objects.at(-1);
 assert.equal(result.cells[1][1],item.cells[1][1]);
 assert.ok(noteText(doc.notes[0]).includes('เพลโต'));
 assert.equal(findNotes(doc,{query:'นักปรัชญา'}).length,1);
 assert.equal(findNotes(doc,{query:'เพลโต'}).length,1);
});
test('adding/removing rows and columns keeps existing cell text in its original position',()=>{
 let t=makeTable('table-three');
 t.cells[0][0]='หัวตาราง';t.cells[2][2]='บทสุดท้าย';
 t=tableWithCells(t,tableGrid(t.cells,5,4));
 assert.deepEqual([t.cells.length,t.cells[0].length],[5,4]);
 assert.equal(t.cells[2][2],'บทสุดท้าย');
 t=tableWithCells(t,tableGrid(t.cells,3,3));
 assert.equal(t.cells[0][0],'หัวตาราง');
 assert.equal(t.cells[2][2],'บทสุดท้าย');
 assert.ok(t.h>=120);
 assert.throws(()=>tableGrid(t.cells,0,3),/1–16/);
 assert.throws(()=>tableGrid(t.cells,4,9),/1–8/);
 assert.deepEqual([TABLE_MAX_ROWS,TABLE_MAX_COLS],[16,8]);
});
test('malformed, oversized or unsafe table data is rejected before sync',()=>{
 const bad=makeTable('bad');
 bad.cells=[['a','b'],['one']];
 assert.throws(()=>validateTableCells(bad.cells),/เท่ากัน/);
 assert.throws(()=>tableWithCells(makeTable('t'),[['x'.repeat(501)]]),/500/);
 assert.throws(()=>tableWithCells(makeTable('t'),[[23]]),/ข้อความ/);
 assert.throws(()=>makeTable('x',17,1),/1–16/);
 assert.throws(()=>makeTable('x',3,9),/1–8/);
});
test('table SVG escapes scripts and retains direct click selection boundaries',()=>{
 const t=makeTable('tbl-render');
 t.cells[0][0]='<script>alert(1)</script>';
 t.cells[1][0]='รัฐ & สังคม';
 const svg=objectSVG(t);
 assert.ok(svg.includes('<foreignObject data-object="tbl-render"'));
 assert.ok(svg.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(!svg.includes('<script>'));
 assert.ok(svg.includes('รัฐ &amp; สังคม'));
 assert.ok(svg.includes('<table aria-label="ตาราง 3 แถว 3 คอลัมน์"'));
});
test('table objects survive independent cloud-style merges and page undo',()=>{
 const base=paperFor(note()),left=copy(base),right=copy(base);
 const obj=makeTable('table-four');obj.cells[0][0]='POL2106';
 left.pages[0].objects.push(obj);
 const result=mergePaper(base,left,right);
 assert.equal(result.pages[0].objects[0].cells[0][0],'POL2106');
 const hist=pageHistory();
 hist.record(base.pages[0],result.pages[0]);
 assert.equal(hist.step(result.pages[0]).objects.length,0);
 assert.equal(hist.step(base.pages[0],false).objects[0].type,'table');
 const conflict=copy(result),remote=copy(result);
 conflict.pages[0].objects[0].cells[0][0]='A';
 remote.pages[0].objects[0].cells[0][0]='B';
 assert.throws(()=>mergePaper(result,conflict,remote),/พร้อมกัน/);
});

test('header, body, borders and text colors stay editable and header remains readable',()=>{
 const t=makeTable('table-colors');Object.assign(t,{headerBg:'#0f172a',headerTextColor:'#ffffff',bodyBg:'#fff8dc',textColor:'#16325c',borderColor:'#334155'});
 t.cells[0][0]='หัวตาราง';
 const page=paperFor(note()).pages[0];page.objects.push(t);
 const saved=validatePaper({version:1,pages:[page]}).pages[0].objects[0];
 assert.equal(saved.headerTextColor,'#ffffff');
 const html=objectSVG(saved);
 for(const hex of ['#0f172a','#ffffff','#fff8dc','#16325c','#334155'])assert.ok(html.includes(hex));
 const invalid={...t,headerBg:'red;position:fixed'};
 assert.throws(()=>validatePaper({version:1,pages:[{...page,objects:[invalid]}]}),/สีตาราง/);
});
