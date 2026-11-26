import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
test('mobile overflow menu anchors to full header with both edges inside viewport and scrollable actions',()=>{
 const css=read('paper.css').split('/* Anchor the wrapped phone menu')[1];
 assert.match(css,/max-width:720px/);
 assert.match(css,/\.paper-header\{position:relative;overflow:visible\}/);
 assert.match(css,/\.paper-menu\{position:static;flex:none\}/);
 assert.match(css,/left:max\(8px,env\(safe-area-inset-left\)\);right:max\(8px,env\(safe-area-inset-right\)\);top:100%/);
 assert.match(css,/min-width:0;width:auto/);
 assert.match(css,/overflow:auto;overscroll-behavior:contain/);
 assert.match(css,/min-height:44px/);
 assert.match(read('index.html'),/paper\.css\?v=20261126-mobile-menu/);
});
test('overflow menu closes when tapping outside, invoking action or pressing Escape',()=>{
 const js=read('paper-editor.js');
 assert.ok(js.includes('if(menu.open&&!menu.contains(e.target))menu.open=false'));
 assert.ok(js.includes("e.target.closest('.paper-menu [data-action]')"));
 assert.ok(js.includes("menu.querySelector('summary').focus({preventScroll:true})"));
});
