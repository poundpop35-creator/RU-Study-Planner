import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../dist/paper-editor.js',import.meta.url),'utf8');
const navigation=source.slice(source.indexOf(' function moveNavigation(e){'),source.indexOf(' function pointerDown(e){'));
test('a navigation finger scrolls without changing the active pen drag',()=>{
 const gesture={kind:'move'},dragPointer={pointerId:7};
 const context={navigationTouches:new Map([[3,{x:100,y:100}]]),viewport:{scrollLeft:100,scrollTop:200},gesture,dragPointer,moves:[],pointerMove(e){this.moves.push(e);}};
 // Use a closure so pointerMove does not depend on event receiver binding.
 context.pointerMove=e=>context.moves.push(e);
 vm.createContext(context);vm.runInContext(navigation,context);
 context.moveNavigation({pointerId:3,clientX:80,clientY:60});
 assert.equal(context.viewport.scrollLeft,120);
 assert.equal(context.viewport.scrollTop,240);
 assert.equal(context.gesture,gesture);
 assert.deepEqual(context.moves,[dragPointer]);
});
test('two navigation fingers zoom when no object gesture is active',()=>{
 const context={navigationTouches:new Map([[1,{x:0,y:0}],[2,{x:100,y:0}]]),viewport:{scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0})},gesture:null,dragPointer:null,zoom:1};
 context.zoomAt=z=>context.newZoom=z;
 vm.createContext(context);vm.runInContext(navigation,context);
 context.moveNavigation({pointerId:2,clientX:200,clientY:0});
 assert.equal(context.newZoom,2);
});
