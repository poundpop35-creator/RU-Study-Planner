import test from 'node:test';
import assert from 'node:assert/strict';
import {textSize,textColor,validateMarks,applyTextFormat,toggleTextFormat,moveMarks,formattedTextHTML} from '../dist/paper-rich-text.js';
import {validatePaper,emptyPage} from '../dist/paper-core.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('Word-like selected word formatting is isolated to selected UTF-16 characters',()=>{
 const text='เรียน รัฐศาสตร์';
 let marks=toggleTextFormat([],text,6,15,'bold');
 assert.deepEqual(marks,[{start:6,end:15,bold:true}]);
 marks=toggleTextFormat(marks,text,6,15,'italic');
 assert.deepEqual(marks,[{start:6,end:15,bold:true,italic:true}]);
 marks=toggleTextFormat(marks,text,6,15,'underline');
 marks=applyTextFormat(marks,text,6,15,'size',27);
 assert.equal(marks[0].size,27);
 assert.equal(marks[0].underline,true);
 assert.equal(marks[0].bold,true);
 marks=toggleTextFormat(marks,text,6,15,'bold');
 assert.equal(marks[0].bold,undefined);
 assert.equal(marks[0].italic,true);
 assert.equal(marks[0].size,27);
 const html=formattedTextHTML({text,marks},escape);
 assert.ok(html.startsWith('เรียน '));
 assert.ok(html.includes('font-size:27px'));
 assert.ok(html.includes('font-style:italic'));
 assert.ok(!html.includes('font-weight:700'));
});
test('selected word styles and links can coexist across the same range',()=>{
 const text='อ่านคำนี้ ต่อไป';
 const formats=toggleTextFormat([],text,4,10,'bold');
 const url='https://ru.ac.th/';
 const html=formattedTextHTML({text,marks:formats,links:[{start:4,end:10,url}]},escape);
 assert.ok(html.includes('class="paper-word-mark" data-word-link'));
 assert.ok(html.includes('href="https://ru.ac.th/"'));
 assert.ok(html.includes('font-weight:700'));
 assert.ok(html.includes('อ่าน'));
 const fileId='12345678-1234-1234-1234-123456789012';
 const fileHtml=formattedTextHTML({text,marks:formats,links:[{start:4,end:10,fileId}]},escape);
 assert.ok(fileHtml.includes('data-word-file="'+fileId+'"'));
 assert.ok(fileHtml.includes('font-weight:700'));
});
test('ranges survive text insertion before them; validation rejects malformed and unsafe mark definitions',()=>{
 const before='abcd efgh',after='start abcd efgh';
 const marks=[{start:5,end:9,italic:true}];
 assert.deepEqual(moveMarks(marks,before,after),[{start:11,end:15,italic:true}]);
 assert.deepEqual(validateMarks(marks,before),marks);
 for(const invalid of [
  [{start:-1,end:3,bold:true}],[{start:0,end:2,size:200}],
  [{start:0,end:2,evil:true}].map(m=>({...m,size:0})),
  [{start:0,end:5,bold:true},{start:4,end:8,italic:true}]
 ])assert.throws(()=>validateMarks(invalid,before));
 assert.equal(textSize('17'),17);
 assert.equal(textSize('97',24),24);
 assert.equal(textSize('20.5',24),24);
});
test('paper persistence keeps per-word formats together with per-word links',()=>{
 const p=emptyPage();
 p.objects.push({id:'text-1',type:'text',x:20,y:20,w:400,h:80,text:'hello link',size:24,color:'#172033',bold:false,
  marks:[{start:6,end:10,bold:true,italic:true,underline:true,size:19}],
  links:[{start:6,end:10,url:'https://example.com/'}]});
 const saved=validatePaper({version:1,pages:[p]});
 assert.deepEqual(saved.pages[0].objects[0].marks,p.objects[0].marks);
 assert.deepEqual(saved.pages[0].objects[0].links,p.objects[0].links);
});

test('Word colors only the selected word, retains existing formatting and word link, and roundtrips',()=>{
 const phrase='รัฐศาสตร์ และการเมือง';
 const selectedEnd=phrase.indexOf(' ');
 let marks=applyTextFormat([],phrase,0,selectedEnd,'color','#DC4343');
 marks=toggleTextFormat(marks,phrase,0,selectedEnd,'bold');
 marks=applyTextFormat(marks,phrase,0,selectedEnd,'size',19);
 assert.deepEqual(marks,[{start:0,end:selectedEnd,bold:true,size:19,color:'#dc4343'}]);
 const html=formattedTextHTML({text:phrase,marks,links:[{start:0,end:selectedEnd,url:'https://example.org/word'}]},escape);
 assert.match(html,/font-weight:700/);
 assert.match(html,/font-size:19px/);
 assert.match(html,/color:#dc4343/);
 assert.ok(html.includes('> และการเมือง'),'unselected text must be outside the styled span');
 assert.ok(html.includes('href="https://example.org/word"'));
 const p=emptyPage();
 p.objects.push({id:'color-test',type:'text',x:20,y:20,w:400,h:80,text:phrase,size:24,color:'#172033',bold:false,marks,links:[{start:0,end:selectedEnd,url:'https://example.org/word'}]});
 const saved=validatePaper({version:1,pages:[p]}).pages[0].objects[0];
 assert.deepEqual(saved.marks,marks);
 assert.equal(saved.color,'#172033','object default ink stays unchanged');
 assert.equal(saved.links[0].url,'https://example.org/word');
});
test('rich text color parser accepts only safe opaque RGB or six-digit hex',()=>{
 assert.equal(textColor('#DC4343'),'#dc4343');
 assert.equal(textColor('rgb(220, 67, 67)'),'#dc4343');
 assert.equal(textColor('rgba(220,67,67,1)'),'#dc4343');
 assert.equal(textColor('rgb(256,1,1)'),null);
 assert.equal(textColor('red'),null);
 assert.equal(textColor('#fff;position:absolute'),null);
 const sample='word';
 for(const unsafe of ['rgb(1,1,1);background:red','var(--ink)','red','#123','javascript:alert(1)']){
  assert.throws(()=>validateMarks([{start:0,end:4,color:unsafe}],sample));
 }
});
