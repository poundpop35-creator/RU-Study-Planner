import {chromium,webkit,devices} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {freshState} from '../../dist/core.js';
import {newNote} from '../../dist/notebook-core.js';

const root=resolve('dist');
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')));
  if(!path.startsWith(root+'/'))throw Error('invalid path');
  const bytes=await readFile(path);
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});
  res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(3002,'127.0.0.1',done));
await mkdir('test-results',{recursive:true});
const wait=async fn=>{
 const deadline=Date.now()+15000;
 while(!await fn()){
  if(Date.now()>deadline)throw Error('timed out waiting for notebook state');
  await new Promise(done=>setTimeout(done,100));
 }
};
try{
 for(const [name,engine,mobile] of [['desktop',chromium,false],['iPhone WebKit',webkit,true]]){
  const browser=await engine.launch();
  let row={revision:1,updated_at:new Date().toISOString(),payload:{
   version:1,progress:freshState(),notebook:{version:1,notes:[
    newNote({id:'continuous-note',title:'กระดาษยาว · ทดสอบ',text:''})
   ]}
  }};
  const context=await browser.newContext(mobile?{...devices['iPhone 13']}:{viewport:{width:1280,height:920}});
  const errors=[];
  await context.route('**/*',route=>(['blob:','data:'].includes(new URL(route.request().url()).protocol)||
   new URL(route.request().url()).origin==='http://127.0.0.1:3002')?route.continue():route.abort());
  await context.route('**/functions/v1/personal-study/**',route=>{
   const req=route.request(),path=new URL(req.url()).pathname.split('/personal-study')[1];
   if(path==='/open')return route.fulfill({json:{id:'browser-continuous'}});
   if(path==='/workspace'){
    if(req.method()==='POST'){
     const input=req.postDataJSON();
     if(input.expected_revision!==row.revision)return route.fulfill({status:409,json:{error:'conflict',code:'40001'}});
     row={revision:row.revision+1,updated_at:new Date().toISOString(),payload:input.new_payload};
    }
    return route.fulfill({json:row});
   }
   return route.fulfill({status:404});
  });
  await context.route('**/auth/v1/**',route=>route.fulfill({json:{external:{}}}));
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:3002/#note/continuous-note');
   await page.locator('#paper-svg').waitFor();
   await page.waitForFunction(()=>document.body.classList.contains('paper-mode'));
   assert.equal(await page.locator('.paper-app').getAttribute('data-paper-continuous'),'true','blank new note uses continuous mode');
   assert.ok(await page.locator('.paper-pages').isHidden(),'continuous mode has no page switcher');
   assert.ok(await page.locator('#paper-page-label').innerText().then(t=>t.includes('กระดาษต่อเนื่อง')));
   const guide=page.locator('#paper-svg [data-print-boundary="1"]');
   assert.ok(await guide.count(),'dashed A4 guide appears after the first sheet');
   assert.equal(await guide.locator('line').getAttribute('stroke-dasharray'),'11 8');

   // Scroll creates visible blank space without writing new pages to Supabase.
   const initial=await page.locator('#paper-svg').getAttribute('viewBox');
   await page.locator('#paper-viewport').evaluate(el=>{
    el.scrollTop=el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
   });
   await page.waitForFunction(()=>Number(document.querySelector('#paper-svg').getAttribute('viewBox').split(' ')[3])>=3819);
   const enlarged=await page.locator('#paper-svg').getAttribute('viewBox');
   assert.notEqual(initial,enlarged);
   assert.equal(row.payload.notebook.notes[0].paper,undefined,'scrolling should not write blank pages to cloud');

   // Place writing below the legacy A4 page limit, persist, then reload.
   await page.locator('[data-paper="text"]').first().click();
   // Use an actual OS pointer/touch event within the visible viewport.
   // Synthetic PointerEvents cannot acquire native pointer capture.
   const placement=await page.locator('#paper-viewport').evaluate(viewport=>{
    const svg=viewport.querySelector('#paper-svg');
    const scale=svg.getBoundingClientRect().width/900;
    viewport.scrollTop=Math.max(0,1450*scale-175);
    const rect=svg.getBoundingClientRect(),v=viewport.getBoundingClientRect();
    const x=rect.left+155*scale,y=rect.top+1450*scale;
    return {x,y,within:y>=v.top&&y<=v.bottom,scroll:viewport.scrollTop,scale};
   });
   assert.ok(placement.within,'target point in long paper remains visible');
   if(mobile)await page.touchscreen.tap(placement.x,placement.y);
   else await page.mouse.click(placement.x,placement.y);
   await page.locator('#paper-text-input').waitFor({state:'visible'});
   await page.locator('#paper-text-input').fill('บทเรียนต่อเนื่องใต้เส้นประ A4');
   await page.locator('[data-paper="save"]').first().click();
   await wait(()=>row.payload.notebook.notes[0].paper?.pages[0].objects.some(o=>o.text==='บทเรียนต่อเนื่องใต้เส้นประ A4'));
   assert.equal(row.payload.notebook.notes[0].paper.version,2);
   assert.equal(row.payload.notebook.notes[0].paper.pages.length,1);
   assert.ok(row.payload.notebook.notes[0].paper.pages[0].objects[0].y>1273,'saved below the original A4 limit');
   await page.reload();
   await page.locator('#paper-svg [data-object]').first().waitFor();
   assert.equal(await page.locator('.paper-app').getAttribute('data-paper-continuous'),'true');
   assert.ok(await page.locator('#paper-svg').getAttribute('viewBox').then(x=>Number(x.split(' ')[3])>=3819));

   if(!mobile){
    // Print is the only point at which real A4 pages are generated.
    await page.locator('.paper-menu summary').first().click();
    const popupPromise=page.waitForEvent('popup');
    await page.locator('.paper-menu [data-action="nb-print"]').click();
    const popup=await popupPromise;
    await popup.locator('article').first().waitFor();
    assert.equal(await popup.locator('article').count(),2,'content is split automatically into two A4 pages');
    assert.equal(await popup.locator('[data-print-boundary]').count(),0,'dashed guides not printed');
    assert.ok(await popup.locator('.print-actions select').count(),'print margin can be adjusted');
    await popup.close();

    // Existing notes with pages are still supported and can opt into
    // continuous mode without losing or reordering content.
    const prior=row.payload.notebook.notes[0];
    row.payload.notebook.notes[0]={...prior,paper:{version:1,pages:[
     {id:'legacy-a',template:'ruled',objects:[{id:'text-a',type:'text',x:50,y:70,w:400,h:45,size:18,color:'#172033',bold:false,text:'ตอนที่ 1'}]},
     {id:'legacy-b',template:'ruled',objects:[{id:'text-b',type:'text',x:75,y:95,w:400,h:45,size:18,color:'#172033',bold:false,text:'ตอนที่ 2'}]}
    ]}};
    row.revision++;
    await page.reload();
    await page.locator('#paper-svg').waitFor();
    await wait(()=>page.locator('.paper-app').getAttribute('data-paper-continuous').then(v=>v==='false'));
    await page.locator('.paper-menu summary').first().click();
    await page.locator('.paper-menu [data-paper="continuous"]').click();
    await wait(()=>row.payload.notebook.notes[0].paper?.version===2);
    const converted=row.payload.notebook.notes[0].paper;
    assert.equal(converted.pages.length,1);
    assert.deepEqual(converted.pages[0].objects.map(o=>o.id),['text-a','text-b']);
    assert.equal(converted.pages[0].objects[1].y,1273+95);
    assert.ok(await page.locator('.paper-pages').isHidden());
    assert.ok(await page.locator('#paper-svg [data-print-boundary="1"]').count());
   }
   assert.deepEqual(errors,[],'no JS exceptions');
   await page.screenshot({path:'test-results/notebook-continuous-'+(mobile?'iphone':'desktop')+'.png',fullPage:false});
   console.log(name+': infinite scroll, dashed A4 boundaries, writing and print PASS');
  }finally{await context.close();await browser.close();}
 }
}finally{await new Promise(done=>server.close(done));}
