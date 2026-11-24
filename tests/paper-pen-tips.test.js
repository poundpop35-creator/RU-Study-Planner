import test from 'node:test';
import assert from 'node:assert/strict';
import {PEN_TIPS,tipSettings} from '../dist/paper-pen-tips.js';
import {strokeObject,validatePaper} from '../dist/paper-core.js';
import {objectSVG} from '../dist/paper-render.js';
test('all five tips survive validation and render distinctly',()=>{
 const strokes=Object.keys(PEN_TIPS).map(tip=>strokeObject([[20,20,.2],[70,30,.9],[100,20,.5]],{tip,tool:tip==='chisel'?'highlight':'pen',...tipSettings(tip)}));
 const paper=validatePaper({version:1,pages:[{id:'p',template:'plain',objects:strokes}]});
 assert.equal(paper.pages[0].objects.length,5);
 for(const o of paper.pages[0].objects){assert.match(objectSVG(o),new RegExp('data-pen-tip="'+o.tip+'"'));assert.equal(o.opacity,PEN_TIPS[o.tip].opacity);}
 assert.match(objectSVG(strokes[1]),/stroke-dasharray/);assert.match(objectSVG(strokes[2]),/opacity="0.3"/);
 assert.equal(new Set(strokes.map(o=>objectSVG({...o,id:'same'}))).size,5);
 const old=strokeObject([[20,20,.5],[40,40,.5]],{tool:'highlight',width:12,color:'#f5cc55'});
 assert.match(objectSVG(old),/stroke-linecap="round"/);
 assert.equal(validatePaper({version:1,pages:[{id:'p',template:'plain',objects:[old]}]}).pages[0].objects[0].tip,undefined);
 assert.throws(()=>validatePaper({version:1,pages:[{id:'p',template:'plain',objects:[{...old,tip:'bad'}]}]}));
});
