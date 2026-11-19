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
  const click=async key=>{const button=page.locator('[data-paper="'+key+'"]').first();await button.click();if(key==='save')await wait(()=>button.isEnabled());};
  const point=async(x,y)=>{const r=await page.locator('#paper-svg').boundingBox();return {x:r.x+x*r.width/900,y:r.y+y*r.height/1273};};
  const tap=async(x,y)=>{const p=await point(x,y);if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
  // Text can be entered on touch without enabling finger drawing.
  assert.equal(await page.locator('[data-paper="text"]').getAttribute('aria-pressed'),'true');await tap(100,230);
  const typingBox=page.locator('#paper-text-input'),size=()=>typingBox.evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight}));
  await typingBox.fill('จด');const small=await size();assert.ok(small.w<90&&small.h<60);
  await typingBox.fill('ข้อความสำหรับทดสอบการตัดบรรทัด '.repeat(18));const long=await size();assert.ok(long.w>small.w&&long.w<=801&&long.h>small.h);
  await typingBox.fill('จด');assert.deepEqual(await size(),small);
  await page.locator('#paper-text-input').fill('ความเข้าใจของฉัน');await click('save');await wait(()=>row.payload.notebook.notes[0].paper?.pages[0].objects.some(o=>o.text==='ความเข้าใจของฉัน'));
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
  await click('pen');
   if(mobile){assert.ok(await page.locator('#paper-width').isVisible(),'mobile thickness slider must be directly visible');}
   const dots=page.locator('[data-paper-width]');
   assert.equal(await dots.count(),6);
   await page.locator('[data-paper-width="2"]').click();
   assert.equal(await page.locator('#paper-width-value').innerText(),'2');
   assert.equal(await page.locator('[data-paper-width="2"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#paper-pen-preview').evaluate(el=>el.style.width),'2px');
   // The width chooser stays directly visible on mobile.
   await page.locator('#paper-width').evaluate(el=>{el.value='12';el.dispatchEvent(new Event('input',{bubbles:true}));});
   assert.equal(await page.locator('#paper-width-value').innerText(),'12');
   assert.equal(await page.locator('[data-paper-width="12"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#paper-pen-preview').evaluate(el=>el.style.width),'12px');
   // The width chooser stays directly visible on mobile.
   const from=await point(100,400),to=await point(350,450);
  if(mobile){await page.locator('#paper-finger').check();await tap(220,420);}
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
  await click('text');await tap(100,600);await page.locator('#paper-text-input').fill('กำลังเขียนขณะซิงก์');
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
  assert.deepEqual(errors,[]);console.log(name+': editor, text, vector ink, undo/redo, selection, images, pages, confirmation, offline save, cross-device sync, no remount, legacy original PASS');
 }catch(err){console.error(name,err);let shot=0;for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:'test-results/failure-'+name+'-'+shot+++'.png'}).catch(()=>{});process.exitCode=1;}
 finally{await browser.close();}
}
await new Promise(r=>server.close(r));
