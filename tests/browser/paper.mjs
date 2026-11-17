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
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=','base64');
const wait=async(fn)=>{const until=Date.now()+15000;while(!await fn()){if(Date.now()>until)throw Error('Timed out waiting for state');await new Promise(r=>setTimeout(r,100));}};
for(const [name,type,mobile] of [['desktop',chromium,false],['mobile-webkit',webkit,true]]){
 const browser=await type.launch();let row={revision:1,updated_at:new Date().toISOString(),payload:{version:1,progress:freshState(),notebook:{version:1,notes:[newNote({id:'browser-note',title:'สมุดทดสอบ · POL1101',text:'ต้นฉบับบทเรียน\nรัฐและอำนาจ'})]}}},offline=false,delaySave=null;
 const errors=[],images=new Map();
 const setup=async()=>{const context=await browser.newContext(mobile?{...devices['iPhone 13']}:{viewport:{width:1440,height:1000}});
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
  await click('text');await tap(100,230);await page.locator('#paper-text-input').fill('ความเข้าใจของฉัน');await click('save');await wait(()=>row.payload.notebook.notes[0].paper?.pages[0].objects.some(o=>o.text==='ความเข้าใจของฉัน'));
  const text=row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.text==='ความเข้าใจของฉัน');assert.ok(text.h>=60);
  // Real mouse/pen-style pointer flow; touch mode additionally checks pan-vs-ink behavior.
  await click('pen');const from=await point(100,400),to=await point(350,450);
  if(mobile){await page.locator('#paper-finger').check();await tap(220,420);}
  else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:15});await page.mouse.up();}
  await click('save');await wait(()=>row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.type==='stroke'));
  await click('undo');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,0);
  await click('redo');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,1);
  await click('select');await tap(220,420);await page.locator('[data-paper="delete-object"]').click();await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,0);
  await click('undo');await click('save');
  await page.locator('#paper-image-file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});await wait(()=>images.size===1);await wait(()=>page.locator('#paper-svg image').count().then(n=>n===1));await click('save');
  await page.locator('#paper-template').selectOption('dots');await click('save');
  await page.screenshot({path:'test-results/paper-'+name+'.png'});
  if(mobile)await click('pages');await click('add-page');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages.length,2);
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
  assert.deepEqual(errors,[]);console.log(name+': editor, text, vector ink, undo/redo, selection, images, pages, confirmation, offline save, cross-device sync, no remount, legacy original PASS');
 }catch(err){console.error(name,err);let shot=0;for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:'test-results/failure-'+name+'-'+shot+++'.png'}).catch(()=>{});process.exitCode=1;}
 finally{await browser.close();}
}
await new Promise(r=>server.close(r));
