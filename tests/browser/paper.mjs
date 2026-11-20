import {chromium,webkit,devices} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {freshState} from '../../dist/core.js';
import {newNote} from '../../dist/notebook-core.js';
const root=resolve('dist');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')));if(!path.startsWith(root+'/'))throw Error();const body=await readFile(path);res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(3000,'127.0.0.1',r));await mkdir('test-results',{recursive:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAnElEQVR4nO3QQRHAIADAMMDh9CANc1Ow65M9EgW9zmefwbd1O+DvDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFB4AbYIAgdMU5T+AAAAAElFTkSuQmCC','base64');
const wait=async(fn)=>{const until=Date.now()+15000;while(!await fn()){if(Date.now()>until)throw Error('Timed out waiting for state');await new Promise(r=>setTimeout(r,100));}};
for(const [name,type,mobile] of [['desktop',chromium,false],['tablet',chromium,false],['mobile-webkit',webkit,true]]){
 const browser=await type.launch();let row={revision:1,updated_at:new Date().toISOString(),payload:{version:1,progress:freshState(),notebook:{version:1,notes:[newNote({id:'browser-note',title:'สมุดทดสอบ · POL1101',text:'ต้นฉบับบทเรียน\nรัฐและอำนาจ'})]}}},offline=false,delaySave=null;
 const errors=[],images=new Map();
 const setup=async()=>{const context=await browser.newContext(mobile?{...devices['iPhone 13']}:{viewport:{width:name==='tablet'?768:1280,height:1000}});
  await context.route('**/functions/v1/personal-study/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname.split('/personal-study')[1];
   if(offline)return route.fulfill({status:503,json:{error:'offline test'}});
   if(path==='/open')return route.fulfill({json:{id:'browser-shared'}});
   if(path==='/workspace'){
    if(req.method()==='POST'){if(delaySave)await delaySave;const input=req.postDataJSON();if(input.expected_revision!==row.revision)return route.fulfill({status:409,json:{error:'conflict',code:'40001'}});row={revision:row.revision+1,updated_at:new Date().toISOString(),payload:input.new_payload};}
    return route.fulfill({json:row});
   }
   if(path.startsWith('/image/')){if(req.method()==='POST'){images.set(path,req.postDataBuffer());return route.fulfill({json:{ok:true}});}return route.fulfill({contentType:'image/png',body:images.get(path)||png});}
   return route.fulfill({status:404});
  });
  // No test ever talks to the production workspace, including unexpected auth requests.
  await context.route('**/auth/v1/**',route=>route.fulfill({json:{external:{}}}));
  const page=await context.newPage();page.on('pageerror',err=>errors.push(err.message));await page.goto('http://127.0.0.1:3000/#note/browser-note');await page.locator('#paper-svg').waitFor();await page.waitForFunction(()=>document.body.classList.contains('paper-mode'));return {context,page};};
 try{
  const a=await setup(),b=await setup(),page=a.page;
  const click=async key=>{
   const button=key==='word-link'&&mobile&&await page.locator('#paper-mobile-editor').isVisible()
    ?page.locator('#paper-mobile-editor [data-paper="word-link"]')
    :page.locator('[data-paper="'+key+'"]').first();
   await button.evaluate(el=>{let parent=el.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}});
   await button.click();if(key==='save')await wait(()=>button.isEnabled());
  };
  const point=async(x,y)=>{const r=await page.locator('#paper-svg').boundingBox();return {x:r.x+x*r.width/900,y:r.y+y*r.height/1273};};
  const toolbar=page.locator('.paper-toolbar');
  const toolbarMetrics=await toolbar.evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,
   children:Array.from(el.children).map(c=>({class:c.className,height:c.getBoundingClientRect().height,display:getComputedStyle(c).display,position:getComputedStyle(c).position})),
   display:getComputedStyle(el).display,flexWrap:getComputedStyle(el).flexWrap}));
  assert.ok(toolbarMetrics.height<=90,'notebook toolbar should remain a compact single row: '+JSON.stringify(toolbarMetrics));
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false);
  assert.ok(await page.locator('.paper-tool-options').isHidden(),'extra options must not occupy canvas when closed');
   assert.ok(await page.locator('.paper-pages').isHidden(),'page thumbnails start collapsed to maximize writing space');
   await click('pages');
   assert.ok(await page.locator('.paper-pages').isVisible(),'page thumbnails can be expanded');
   assert.equal(await page.locator('[data-paper="pages"]').getAttribute('aria-expanded'),'true');
   await click('pages');
   assert.ok(await page.locator('.paper-pages').isHidden(),'page thumbnails can be folded again');
  await page.locator('#paper-toolbar-more > summary').click();
  assert.ok(await page.locator('.paper-tool-options').isVisible(),'advanced tools open on demand');
  await page.locator('[data-paper-color="#3155d9"]').click();
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'choosing color should fold menu');
  await page.locator('#paper-toolbar-more > summary').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'Escape closes settings');
  await page.screenshot({path:'test-results/notebook-compact-'+name+'.png'});

  const tap=async(x,y)=>{const p=await point(x,y);if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
  // Text can be entered on touch without enabling finger drawing.
  assert.equal(await page.locator('[data-paper="text"]').getAttribute('aria-pressed'),'true');await tap(100,230);
  const typingBox=page.locator('#paper-text-input'),size=()=>typingBox.evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight}));
  await typingBox.fill('จด');const small=await size();
   if(mobile){
    assert.ok(await page.locator('#paper-mobile-editor').isVisible(),'mobile edit panel visible');
     assert.ok(await page.locator('#paper-selection-tools').isHidden(),'floating selection tools must not cover text while iPhone keyboard is open');
    assert.ok(small.w>=200&&small.h>=120,'mobile editable text is legible');
    assert.ok(Number.parseFloat(await typingBox.evaluate(el=>getComputedStyle(el).fontSize))>=16);
    assert.ok(await typingBox.evaluate(el=>el.parentElement.id==='paper-mobile-editor'));
   }else assert.ok(small.w>=250&&small.h<60,'leave room to handwrite after existing words');
   await typingBox.fill('ข้อความสำหรับทดสอบการตัดบรรทัด '.repeat(18));const long=await size();
   if(mobile)assert.ok(long.w>=200&&long.h>=120);else assert.ok(long.w>small.w&&long.w<=801&&long.h>small.h);
   await typingBox.fill('จด');assert.deepEqual(await size(),small);
   await page.locator('#paper-text-input').fill('ความเข้าใจของฉัน');await click('save');
   if(mobile)assert.ok(await page.locator('#paper-mobile-editor').isHidden(),'mobile edit closes after saving');await wait(()=>row.payload.notebook.notes[0].paper?.pages[0].objects.some(o=>o.text==='ความเข้าใจของฉัน'));
  const text=row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.text==='ความเข้าใจของฉัน');assert.ok(text.h>=text.size*1.5&&text.h<60&&text.w<400);
  // Real mouse/pen-style pointer flow; touch mode additionally checks pan-vs-ink behavior.
  await click('shape');await page.locator('#paper-shape').selectOption('arrow');
  const startShape=await point(160,360),endShape=await point(70,300);
  if(mobile){
   await page.locator('#paper-svg').evaluate((svg,[a,b])=>{
    svg.setPointerCapture=()=>{};
    for(const [type,p] of [['pointerdown',a],['pointermove',b],['pointerup',b]])svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:12,clientX:p.x,clientY:p.y}));
    delete svg.setPointerCapture;
   },[startShape,endShape]);
  }else {await page.mouse.move(startShape.x,startShape.y);await page.mouse.down();await page.mouse.move(endShape.x,endShape.y);await page.mouse.up();}
  await click('save');assert.ok(row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.kind==='arrow'&&o.reverseX&&o.reverseY),JSON.stringify(row.payload.notebook.notes[0].paper.pages[0].objects));
  await click('undo');await click('save');assert.equal(await page.locator('#paper-svg [data-shape]').count(),0);
  await click('redo');await click('save');assert.equal(await page.locator('#paper-svg [data-shape="arrow"]').count(),1);
  await click('select');await tap(105,240);
  if(mobile)await click('multi');else await page.keyboard.down('Shift');
  await tap(120,330);assert.equal(await page.locator('#paper-selected-count').innerText(),'2');
  await tap(120,330);assert.equal(await page.locator('#paper-selected-count').innerText(),'1');
  if(mobile)await click('multi');else await page.keyboard.up('Shift');
  assert.ok(await page.locator('#paper-toolbar-more').evaluate(el=>!el.open),'extra tools should start folded');
  assert.ok(await page.locator('#paper-width').isHidden(),'pen size cannot obstruct the page while menu is folded');
  await click('pen');
  await page.locator('#paper-toolbar-more > summary').click();
  assert.ok(await page.locator('#paper-width').isVisible(),'size controls should be available inside the overlay');
  const dots=page.locator('[data-paper-width]');assert.equal(await dots.count(),6);
  await page.locator('[data-paper-width="2"]').click();
  assert.equal(await page.locator('#paper-width-value').textContent(),'2');
  assert.equal(await page.locator('[data-paper-width="2"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#paper-pen-preview').evaluate(el=>el.style.width),'2px');
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'preset selection should fold extras');
  await page.locator('#paper-toolbar-more > summary').click();
  await page.locator('#paper-width').evaluate(el=>{el.value='12';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.locator('#paper-width-value').textContent(),'12');
  assert.equal(await page.locator('[data-paper-width="12"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#paper-pen-preview').evaluate(el=>el.style.width),'12px');
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'slider change should fold extras');
   await click('highlight');
   await page.locator('#paper-toolbar-more > summary').click();
   assert.equal(await page.locator('#paper-width').getAttribute('max'),'40','highlighter has independent 1–40 width range');
   await page.locator('[data-paper-width="28"]').click();
   assert.equal(await page.locator('#paper-width-value').textContent(),'28');
   await click('pen');
   await page.locator('#paper-toolbar-more > summary').click();
   assert.equal(await page.locator('#paper-width-value').textContent(),'12','pen remembers its own width after switching from highlighter');
   await page.keyboard.press('Escape');
   const from=await point(100,400),to=await point(350,450);
  if(mobile){
   await page.locator('#paper-toolbar-more').evaluate(el=>el.open=true);
   await page.locator('#paper-finger').check();
   assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'finger-draw choice should uncover the paper');
   await tap(220,420);
  }
  else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:15});await page.mouse.up();}
  await click('save');await wait(()=>row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.type==='stroke'));
   assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.type==='stroke').width,12,'selected width must be persisted on new vector stroke');
  await click('undo');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,0);
  await click('redo');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,1);
  await click('select');await tap(220,420);await page.locator('[data-paper="delete-object"]').click();await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,0);
  await click('undo');await click('save');
  await page.locator('#paper-image-file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});await wait(()=>images.size===1);await wait(()=>page.locator('#paper-svg image').count().then(n=>n===1));await click('save');
  await click('image-link');const linkDialog=page.locator('#paper-link-dialog');
  await linkDialog.locator('input').fill('https://example.org/lesson');await linkDialog.getByText('บันทึกลิงก์').click();
  await click('save');assert.equal(await page.locator('#paper-open-link').getAttribute('href'),'https://example.org/lesson');
  assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.type==='image').link,'https://example.org/lesson');
  await click('image-link');await linkDialog.locator('input').fill('javascript:alert(1)');
  await linkDialog.getByText('บันทึกลิงก์').click();assert.ok(await linkDialog.isVisible());
  await linkDialog.getByText('ลบลิงก์').click();assert.ok(await page.locator('#paper-open-link').isHidden());
  await click('undo');await click('save');
  assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.type==='image').link,'https://example.org/lesson');
  // Undo clears selection. Select the restored picture again before using its handles.
  const restored=row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.type==='image');
  await tap(restored.x+restored.w/2,restored.y+restored.h/2);
  const picture=()=>row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.type==='image');
  const original={...picture()};
  const edge=page.locator('#paper-svg [data-edge="e"] circle').last(),handle=await edge.boundingBox();
  const x=handle.x+handle.width/2,y=handle.y+handle.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+22,y,{steps:4});await page.mouse.up();await click('save');
  assert.ok(picture().w>original.w);assert.equal(picture().h,original.h);
  if(mobile){
   const beforePinch={...picture()},zoom=await page.locator('#paper-zoom').innerText();
   const mid=await point(beforePinch.x+beforePinch.w/2,beforePinch.y+beforePinch.h/2);
   await page.locator('#paper-svg').evaluate((svg,mid)=>{
    // Synthetic multi-touch events do not establish native pointer capture.
    svg.setPointerCapture=()=>{};
    const send=(type,id,x)=>svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:id,clientX:x,clientY:mid.y}));
    send('pointerdown',21,mid.x-5);send('pointerdown',22,mid.x+5);
    send('pointermove',22,mid.x+10);send('pointerup',22,mid.x+10);send('pointerup',21,mid.x-5);
    delete svg.setPointerCapture;
   },mid);await click('save');assert.ok(picture().w>beforePinch.w);assert.equal(await page.locator('#paper-zoom').innerText(),zoom);
  }
  const beforeCropWidth=picture().w;await click('crop');const crop=page.getByRole('dialog');await crop.locator('input').first().press('ArrowRight');await crop.getByText('ใช้ส่วนที่เลือก').click();
  await wait(()=>images.size===2);await wait(()=>page.locator('#paper-svg image').getAttribute('width').then(w=>Number(w)<beforeCropWidth));await click('save');assert.notEqual(picture().imageId,original.imageId);
  await click('files');await page.locator('#paper-doc-file').setInputFiles({name:'lesson.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 sample')});
  await wait(()=>row.payload.notebook.notes[0].files?.[0]?.name==='lesson.pdf');await page.locator('#paper-files form button').click();
  await page.locator('#paper-template').selectOption('dots');await click('save');
  await page.screenshot({path:'test-results/paper-'+name+'.png'});
  if(!await page.locator('[data-paper="add-page"]').first().isVisible())await click('pages');await click('add-page');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages.length,2);
  await click('delete-page');await page.getByRole('alertdialog').waitFor();await page.locator('[data-delete-choice="cancel"]').click();assert.equal(row.payload.notebook.notes[0].paper.pages.length,2);
  await click('delete-page');await page.locator('[data-delete-choice="confirm"]').click();await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages.length,1);
  // Save waits for acknowledgement instead of reporting success on click.
  offline=true;await page.locator('#paper-title').fill('งานรอออนไลน์');await page.locator('#paper-title').blur();await click('save');assert.match(await page.locator('#paper-hint').innerText(),/offline/);offline=false;await click('save');assert.equal(row.payload.notebook.notes[0].title,'งานรอออนไลน์');
  // Second independent browser context receives the exact same objects without reloading editor.
  await b.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await wait(()=>b.page.locator('#paper-title').inputValue().then(s=>s==='งานรอออนไลน์'));assert.equal(await b.page.locator('#paper-svg image').count(),1);
  // Remote updates during text entry preserve the editor node and pending text.
  await click('text');await tap(650,600);
   if(!await page.locator('#paper-text-input').isVisible()){
    // If an image covers this position, write in the unused bottom-right page area.
    const fallback=await point(850,1010);
    await page.locator('#paper-svg').evaluate((svg,p)=>{
     svg.setPointerCapture=()=>{};
     for(const type of ['pointerdown','pointerup'])svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'pen',pointerId:115,clientX:p.x,clientY:p.y}));
     delete svg.setPointerCapture;
    },fallback);
   }
   assert.ok(await page.locator('#paper-text-input').isVisible(),'tapping an empty paper area enters text edit mode');
   await page.locator('#paper-text-input').fill('กำลังเขียนขณะซิงก์');
  await b.page.locator('#paper-title').fill('อีกเครื่องอัปเดตชื่อ');await b.page.locator('#paper-title').blur();await b.page.locator('[data-paper="save"]').click();await wait(()=>b.page.locator('[data-paper="save"]').isEnabled());
  await page.evaluate(()=>{window.__paperNode=document.querySelector('#paper-svg');window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(300);
  assert.equal(await page.locator('#paper-text-input').inputValue(),'กำลังเขียนขณะซิงก์');assert.equal(await page.evaluate(()=>window.__paperNode===document.querySelector('#paper-svg')),true);await click('save');assert.ok(row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.text==='กำลังเขียนขณะซิงก์'));assert.equal(row.payload.notebook.notes[0].title,'อีกเครื่องอัปเดตชื่อ');
  await page.reload();await page.waitForFunction(()=>document.body.classList.contains('paper-mode'));assert.equal(await page.locator('#paper-svg image').count(),1);
  await page.locator('.paper-menu summary').click();await click('legacy');await page.getByRole('dialog').waitFor();await page.locator('.paper-legacy .ql-editor').waitFor();assert.match(await page.locator('.paper-legacy-content').innerText(),/ต้นฉบับบทเรียน/);await page.getByRole('button',{name:'กลับหน้ากระดาษ',exact:true}).click();
  await page.locator('.paper-back').click();await page.locator('.note-card').waitFor();assert.equal(await page.locator('.note-card p').count(),0);await page.screenshot({path:'test-results/library-'+name+'.png'});
  await page.locator('[data-action="nb-classify"]').first().click();
  const category=page.getByRole('dialog');await category.locator('[name="source"]').selectOption('prep');
  await category.locator('[name="course"]').fill('POL2106');await category.getByText('บันทึก',{exact:true}).click();
  await wait(()=>row.payload.notebook.notes[0].source==='prep');assert.equal(row.payload.notebook.notes[0].course,'POL2106');
  await page.locator('[data-action="nb-new"]').first().click();
  const create=page.getByRole('dialog');await create.locator('[name="title"]').fill('Pol2104 ครั้งที่ 1');
  await create.locator('[name="course"]').fill('pol2104');await create.getByText('สร้างโน้ต',{exact:true}).click();
  await page.locator('#paper-svg').waitFor();await click('save');assert.ok(row.payload.notebook.notes.some(n=>n.course==='POL2104'&&n.source==='classroom'));
   // Geometry is folded, but shape and ruler controls remain functional.
   assert.equal(await page.locator('#paper-geometry-menu').evaluate(el=>el.open),false);
   await click('shape');
   assert.equal(await page.locator('#paper-geometry-menu').evaluate(el=>el.open),true);
   await page.locator('#paper-shape').selectOption('hexagon');
   assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'shape selection must uncover the paper');
   await page.locator('#paper-toolbar-more').evaluate(el=>el.open=true);
   await page.locator('#paper-line-style').selectOption('dotted');
   const fromShape=await point(280,780),toShape=await point(400,890);
   await page.locator('#paper-svg').evaluate((svg,[a,b])=>{
    svg.setPointerCapture=()=>{};
    const evt=(type,p)=>svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'pen',pointerId:95,clientX:p.x,clientY:p.y}));
    evt('pointerdown',a);evt('pointermove',b);evt('pointerup',b);
    delete svg.setPointerCapture;
   },[fromShape,toShape]);
   await click('save');
   assert.ok(row.payload.notebook.notes.find(n=>n.course==='POL2104').paper.pages[0].objects.some(o=>o.kind==='hexagon'&&o.dash==='dotted'));
    assert.ok(await page.locator('#paper-selected-shape').isVisible(),'selected shape displays shape type picker');
    await page.locator('#paper-selected-shape').selectOption('triangle');
    await page.locator('#paper-selected-line-style').selectOption('dashed');
    await click('save');
    const savedShape=()=>row.payload.notebook.notes.find(n=>n.course==='POL2104').paper.pages[0].objects.find(o=>o.type==='shape');
    assert.equal(savedShape().kind,'triangle','selected shape can be converted without redrawing');
    assert.equal(savedShape().dash,'dashed','selected shape line can be changed after drawing');
    const oldShapeWidth=savedShape().w,oldShapeHeight=savedShape().h;
    assert.equal(await page.locator('#paper-svg [data-edge]').count(),8,'selected shape has eight resize handles');
    await page.locator('#paper-svg').evaluate(svg=>{
     const grip=svg.querySelector('[data-edge="e"] circle');
     const box=grip.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
     svg.setPointerCapture=()=>{};
     const dispatch=(target,type,cx,cy)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'pen',pointerId:117,clientX:cx,clientY:cy}));
     dispatch(grip,'pointerdown',x,y);
     dispatch(svg,'pointermove',x+40,y);
     dispatch(svg,'pointerup',x+40,y);
     delete svg.setPointerCapture;
    });
    await click('save');
    assert.ok(savedShape().w>oldShapeWidth,'east resize handle grows only the right side');
    assert.equal(savedShape().h,oldShapeHeight,'horizontal resize must not stretch height');
   await page.locator('#paper-toolbar-more').evaluate(el=>el.open=true);await page.locator('#paper-geometry-menu summary').click();
   await click('ruler');
   assert.equal(await page.locator('[data-paper="ruler"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#paper-svg [data-ruler="move"]').count(),1);
   await click('ruler-plus');
   assert.match(await page.locator('#paper-svg [data-ruler-overlay]').getAttribute('transform'),/rotate\(15\)/);
   await click('ruler');
   assert.equal(await page.locator('#paper-svg [data-ruler="move"]').count(),0);
   await page.locator('#paper-toolbar-more').evaluate(el=>el.open=true);await page.locator('#paper-geometry-menu summary').click();
  await b.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await b.page.locator('[data-paper="files"]').click();const fileButton=b.page.locator('#paper-file-list').getByText('lesson.pdf');await fileButton.waitFor();
  const [download]=await Promise.all([b.page.waitForEvent('download'),fileButton.click()]);
  assert.equal(download.suggestedFilename(),'lesson.pdf');assert.equal((await readFile(await download.path())).toString(),'%PDF-1.4 sample');
  await click('text');await tap(120,240);
  const box=page.locator('#paper-text-input');await box.fill('politics / politics');
  await box.evaluate(el=>el.setSelectionRange(11,19));await click('word-link');
  let linkForm=page.getByRole('dialog').filter({hasText:'เชื่อมคำกับเว็บหรือไฟล์'});
  assert.equal(await linkForm.locator('blockquote').innerText(),'politics');
  await linkForm.locator('[name="address"]').fill('https://example.org/politics');await linkForm.getByText('บันทึกลิงก์').click();
  const webWord=page.locator('#paper-svg [data-word-link]');await webWord.waitFor();assert.equal(await webWord.innerText(),'politics');
  await tap(122,246);await box.evaluate(el=>el.setSelectionRange(0,8));await click('word-link');
  await linkForm.locator('[name="kind"]').selectOption('upload');
  await linkForm.locator('[name="upload"]').setInputFiles({name:'reading.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 preview test')});
  await linkForm.getByText('บันทึกลิงก์').click();await click('save');
  await page.reload();await page.locator('#paper-svg [data-word-file]').click();
  const reader=page.locator('.paper-file-view');assert.equal(await reader.locator('h2').innerText(),'reading.pdf');
  assert.equal(await reader.locator('iframe').getAttribute('title'),'reading.pdf');await reader.locator('[data-close]').click();
  assert.equal(await webWord.getAttribute('href'),'https://example.org/politics');
  await page.evaluate(async data=>{const {openNoteFile}=await import('/file-viewer.js');await openNoteFile({name:'lesson.docx',data});},'UEsDBBQAAAAIAIV4cl1iiZmmSgAAAFAAAAARAAAAd29yZC9kb2N1bWVudC54bWyzKcrPL1GoyM3JK7Yqt1UqLcqzKkktLlGysym3KgARJXYPdsx6sGP6g50ND3YsfrBj64Mdix7smKmQkp9cYaMPkgeRQKX6IJPsAFBLAQIUAxQAAAAIAIV4cl1iiZmmSgAAAFAAAAARAAAAAAAAAAAAAACAAQAAAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAQABAD8AAAB5AAAAAAA=');
  assert.match(await reader.locator('.file-content').innerText(),/บทเรียน docx/);await reader.locator('[data-close]').click();
  await page.evaluate(async data=>{const {openNoteFile}=await import('/file-viewer.js');await openNoteFile({name:'lesson.pptx',data});},'UEsDBBQAAAAIAIV4cl1c32V0SgAAAFAAAAAVAAAAcHB0L3NsaWRlcy9zbGlkZTEueG1ssynKzy9RqMjNySu2SrRVKi3KsypJLS5RsrNJtCoAESV2D3bMerBj+oOdDQ92LH6wY+uDHYse7JipUFBQUmGjD5IHkUCl+iCT7ABQSwECFAMUAAAACACFeHJdXN9ldEoAAABQAAAAFQAAAAAAAAAAAAAAgAEAAAAAcHB0L3NsaWRlcy9zbGlkZTEueG1sUEsFBgAAAAABAAEAQwAAAH0AAAAAAA==');
  assert.match(await reader.locator('.file-content').innerText(),/บทเรียน pptx/);await reader.locator('[data-close]').click();

  // Apple Pencil Scribble should reopen the SAME text object when the user writes
  // immediately after the last word (within a small right-side continuation area).
  await click('text');await tap(510,620);
  const follow=page.locator('#paper-text-input');
  await follow.fill('รัฐ');await click('save');
  const activeNote=()=>row.payload.notebook.notes.find(n=>n.course==='POL2104');
  const originalText=activeNote().paper.pages[0].objects.find(o=>o.type==='text'&&o.text==='รัฐ');
  assert.ok(originalText,'create a short test word in an otherwise empty region');
  const following=await point(Math.min(890,originalText.x+originalText.w+32),originalText.y+originalText.h/2);
  if(mobile)await page.touchscreen.tap(following.x,following.y);
  else await page.mouse.click(following.x,following.y);
  assert.equal(await follow.inputValue(),'รัฐ','tapping after the word must resume its textbox');
  assert.equal(await follow.evaluate(el=>el.selectionStart),await follow.inputValue().then(v=>v.length),'cursor should be at the end ready for Scribble');
  await follow.fill('รัฐศาสตร์');await click('save');
  const continued=activeNote().paper.pages[0].objects.find(o=>o.id===originalText.id);
  assert.equal(continued.text,'รัฐศาสตร์','new handwriting text should be stored on same object');
  assert.equal(activeNote().paper.pages[0].objects.filter(o=>o.text==='รัฐศาสตร์').length,1);

  // Touch contacts on the writing surface must not trigger zoom or new text
  // while palm protection is enabled. Pen input must still work.
  await page.locator('#paper-toolbar-more > summary').click();
  await page.locator('#paper-palm-guard').check();
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false);
  const beforeZoom=await page.locator('#paper-zoom').innerText();
  const objectCount=activeNote().paper.pages[0].objects.length;
  const contact=await point(620,690);
  await page.locator('#paper-svg').evaluate((svg,p)=>{
   svg.setPointerCapture=()=>{};
   const send=(type,id,dx=0)=>svg.dispatchEvent(new PointerEvent(type,{
    bubbles:true,cancelable:true,pointerType:'touch',pointerId:id,
    clientX:p.x+dx,clientY:p.y}));
   send('pointerdown',810,-14);send('pointerdown',811,14);
   send('pointermove',810,-74);send('pointermove',811,74);
   send('pointerup',810,-74);send('pointerup',811,74);
   delete svg.setPointerCapture;
  },contact);
  assert.equal(await page.locator('#paper-zoom').innerText(),beforeZoom,'palm touches should never pinch-zoom');
  assert.equal(activeNote().paper.pages[0].objects.length,objectCount,'palm touches should not create extra text');
  await click('pen');
  const inkFrom=await point(560,910),inkTo=await point(635,950);
  await page.locator('#paper-svg').evaluate((svg,[a,b])=>{
   svg.setPointerCapture=()=>{};
   for(const [type,p] of [['pointerdown',a],['pointermove',b],['pointerup',b]]){
    svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'pen',pointerId:815,clientX:p.x,clientY:p.y,pressure:.6}));
   }
   delete svg.setPointerCapture;
  },[inkFrom,inkTo]);
  await click('save');
  assert.ok(activeNote().paper.pages[0].objects.some(o=>o.type==='stroke'),'Apple Pencil input should work with palm guard enabled');

  // The single weekly planner must fit replay cards, including watch buttons, at iPhone widths.
  // Render a fixed sample week so this regression check remains independent of the current date.
  await page.evaluate(async()=>{
   const {weeklyPlanner}=await import('/weekly-planner.js?v=horizontal-timeline-20261120');
   const {freshState}=await import('/core.js?v=replay-20261119');
   const fixture=document.createElement('section');
   fixture.id='replay-layout-fixture';
   fixture.style.cssText='max-width:790px;margin:0 auto;padding:10px;background:#fff';
   fixture.innerHTML=weeklyPlanner('inline',freshState(),'2026-11-19',true);
   document.body.replaceChildren(fixture);
  });
  const schedule=page.locator('#replay-layout-fixture');
  assert.equal(await schedule.locator('.unified-replay').count(),7);
  const layout=await schedule.locator('.unified-weekday').evaluateAll(rows=>rows.map(row=>{
   const cards=Array.from(row.querySelectorAll('.unified-replay'));
   const track=row.querySelector('.unified-weekday-track');
   return {cards:cards.map(card=>{
    const body=card.getBoundingClientRect(),button=card.querySelector('button').getBoundingClientRect();
    return {top:body.top,bottom:body.bottom,left:body.left,right:body.right,
     btnTop:button.top,btnBottom:button.bottom,btnLeft:button.left,btnRight:button.right,
     overflow:card.scrollHeight-card.clientHeight};
   }),track:{left:track.getBoundingClientRect().left,right:track.getBoundingClientRect().right,
    bottom:track.getBoundingClientRect().bottom}};
  }));
  for(const day of layout)for(let i=0;i<day.cards.length;i++){
   const card=day.cards[i];
   assert.ok(card.btnTop>=card.top-1&&card.btnBottom<=card.bottom+1,
    'replay watch button must fit entirely inside the card');
   assert.ok(card.btnLeft>=card.left-1&&card.btnRight<=card.right+1,
    'replay watch button must fit width');
   assert.ok(card.bottom<=day.track.bottom+1,'the day row must contain every replay');
   assert.ok(card.overflow<=2,'replay text must not be clipped');
   if(i)assert.ok(day.cards[i-1].bottom<=card.top+1,'same-day replay cards must not overlap');
  }
  if(mobile){
   const scrollState=await schedule.locator('.unified-scroll').evaluate(el=>({
    containerWidth:el.clientWidth,
    contentWidth:el.scrollWidth,
    headerVisible:getComputedStyle(el.querySelector('.unified-axis')).display!=='none',
    hasTimeHeaders:el.querySelectorAll('.unified-axis span').length>=7,
    dayColumnSticky:getComputedStyle(el.querySelector('.unified-weekday-name')).position==='sticky',
    horizontalScroll:['auto','scroll'].includes(getComputedStyle(el).overflowX)
   }));
   assert.ok(scrollState.contentWidth>scrollState.containerWidth+400,
    'the timeline must remain wide and horizontally scrollable');
   assert.ok(scrollState.headerVisible&&scrollState.hasTimeHeaders,
    'mobile must show the time-axis columns');
   assert.ok(scrollState.dayColumnSticky,'weekday labels must remain sticky when panning');
   assert.ok(scrollState.horizontalScroll,'the schedule must allow a horizontal finger swipe');
   const stickyResult=await schedule.locator('.unified-scroll').evaluate(el=>{
    el.scrollLeft=520;
    const date=el.querySelector('.unified-weekday-name'),scroll=el.getBoundingClientRect();
    return {left:date.getBoundingClientRect().left,containerLeft:scroll.left,scrollLeft:el.scrollLeft};
   });
   assert.ok(stickyResult.scrollLeft>200,'the timetable should respond to a sideways swipe');
   assert.ok(Math.abs(stickyResult.left-stickyResult.containerLeft)<7,
    'weekday labels must stay visible when scrolling horizontally');
  }
  await page.screenshot({path:'test-results/replay-calendar-'+name+'.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log(name+': editor, text, vector ink, undo/redo, selection, images, pages, confirmation, offline save, cross-device sync, no remount, legacy original PASS');
 }catch(err){console.error(name,err);let shot=0;for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:'test-results/failure-'+name+'-'+shot+++'.png'}).catch(()=>{});process.exitCode=1;}
 finally{await browser.close();}
}
await new Promise(r=>server.close(r));
