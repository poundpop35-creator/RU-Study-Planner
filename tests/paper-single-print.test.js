import test from 'node:test';
import assert from 'node:assert/strict';
import {singlePrintLayout,singlePrintSheet,MAX_PRINT_PX} from '../dist/paper-single-print.js';
const page=(objects=[])=>({id:'page',template:'ruled',height:127300,objects});
test('single PDF geometry includes far-right and lower objects and excludes virtual blank space',()=>{
 const m={version:2,pages:[page([{id:'right',type:'text',x:1600,y:2500,w:600,h:70,text:'POL2301',size:16,color:'#172033'}])]};
 const before=JSON.stringify(m),r=singlePrintSheet(m);
 assert.ok(r.width>=2200&&r.height>=2570&&r.height<3000);
 assert.match(r.markup,/POL2301/);assert.match(r.markup,/foreignObject/);
 assert.equal(JSON.stringify(m),before);
});
test('large content scales proportionally to safe one-page limit',()=>{
 const r=singlePrintLayout({version:2,pages:[page([{type:'image',x:20000,y:100000,w:800,h:1000}])]},15);
 assert.ok(r.scale<1&&r.pageWidth<=MAX_PRINT_PX&&r.pageHeight<=MAX_PRINT_PX);
 assert.ok(r.offsetX>=0&&r.offsetY>=0);
});
test('legacy pages stack without clipping and rotated shapes expand bounds',()=>{
 const m={version:1,pages:[page([{type:'shape',kind:'rect',x:0,y:20,w:50,h:500,angle:90,width:10}]),page()]};
 const r=singlePrintLayout(m);
 assert.ok(r.blocks[0].left<0);assert.equal(r.blocks[1].y,r.blocks[0].bottom-r.blocks[0].top);
});
