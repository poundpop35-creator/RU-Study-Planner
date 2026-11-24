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
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAA2ElEQVR4nO3QQRHAIADAMMD4NOAFgVOw65M9EgW9zmefwbd1O+DvDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFAwKBgUDAoGBYOCQcGgYFB4AXO7AoQ4sya6AAAAAElFTkSuQmCC','base64');
const wait=async(fn)=>{const until=Date.now()+15000;while(!await fn()){if(Date.now()>until)throw Error('Timed out waiting for state');await new Promise(r=>setTimeout(r,100));}};
for(const [name,type,mobile] of [['desktop',chromium,false],['tablet',chromium,false],['mobile-webkit',webkit,true]]){
 const browser=await type.launch(type===chromium&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});let row={revision:1,updated_at:new Date().toISOString(),payload:{version:1,progress:freshState(),notebook:{version:1,notes:[newNote({id:'browser-note',title:'สมุดทดสอบ · POL1101',text:'ต้นฉบับบทเรียน\nรัฐและอำนาจ'})]}}},offline=false,delaySave=null;
 const errors=[],images=new Map();
 const setup=async()=>{const context=await browser.newContext(mobile?{...devices['iPhone 13']}:{viewport:{width:name==='tablet'?768:1280,height:1000}});
  await context.route('**/*',route=>(['blob:','data:'].includes(new URL(route.request().url()).protocol)||new URL(route.request().url()).origin==='http://127.0.0.1:3000')?route.continue():route.abort());
  await context.route('**/functions/v1/personal-study/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname.split('/personal-study')[1];
   if(offline)return route.fulfill({status:503,json:{error:'offline test'}});
   if(path==='/open')return route.fulfill({json:{id:'browser-shared'}});
   if(path==='/workspace'){
    if(req.method()==='POST'){if(delaySave)await delaySave;const input=req.postDataJSON();if(input.expected_revision!==row.revision)return route.fulfill({status:409,json:{error:'conflict',code:'40001'}});row={revision:row.revision+1,updated_at:new Date().toISOString(),payload:input.new_payload};}
    return route.fulfill({json:row});
   }
   if(path.startsWith('/document/')){if(req.method()==='POST'){images.set(path,req.postDataBuffer());return route.fulfill({json:{ok:true}});}return route.fulfill({contentType:'application/octet-stream',body:images.get(path)});}
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
   // Phone UI folds uncommon tools into a single thumb-reachable More dock.
   // Navigate the actual UI rather than force-clicking hidden buttons.
   if(mobile&&await page.locator('#paper-mobile-more').isVisible()&&
      !(await button.isVisible())&&await button.evaluate(el=>!!el.closest('.paper-toolset'))){
    await page.locator('#paper-mobile-more').click();
   }
   await button.evaluate(el=>{let parent=el.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}});
   await button.click();if(key==='save')await wait(()=>button.isEnabled());
  };
  if(process.env.PAPER_TEST==='branches'){
   if(name==='desktop'){
    const {emptyPage,strokeObject}=await import('../../dist/paper-core.js');
    const pages=Array.from({length:4},()=>({...emptyPage(),objects:Array.from({length:125},(_,i)=>strokeObject([[20,i+10,.5],[100,i+11,.6]],{tool:'pen',color:'#172033',width:2}))}));
    row.payload.notebook.notes[0].paper={version:1,pages};
    row.revision++;
    const large=await setup();
    const menu=large.page.locator('.paper-menu');
    await menu.locator('summary').first().click();
    const popup=large.page.waitForEvent('popup');
    await menu.locator('[data-paper="print-pages"]').click();
    const preview=await popup;
    await preview.locator('article').nth(3).waitFor();
    assert.equal(await preview.locator('article [data-object]').count(),500);
    const pdf=await preview.pdf({preferCSSPageSize:true});
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,4);
    await large.context.close();
    delete row.payload.notebook.notes[0].paper;
    row.revision--;
   }
   await click('shape');
   const choice=page.locator('[data-shape-pick="triangle"]');
   assert.ok(await choice.locator('svg').isVisible());
   await choice.click();assert.equal(await page.locator('#paper-shape').inputValue(),'triangle');
   await click('straighten');
   await page.locator('#paper-svg').evaluate(svg=>{
    const r=svg.getBoundingClientRect(),scale=r.width/900;
    const send=(type,x,y)=>svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'pen',pointerId:85,clientX:r.left+(100+x)*scale,clientY:r.top+(180+y)*scale}));
    svg.setPointerCapture=()=>{};
    try{
     send('pointerdown',80,0);
     for(const [x,y] of [[0,2],[1,40],[74,42],[0,39],[2,82],[81,80]])send('pointermove',x,y);
     send('pointerup',81,80);
    }finally{delete svg.setPointerCapture;}
   });
   await click('save');
   const lines=row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.kind==='line');
   assert.equal(lines.length,4);
   assert.deepEqual(errors,[]);console.log(name+': gallery and branch ink PASS');continue;
  }
  if(process.env.PAPER_TEST==='crop'){
   const start=()=>page.evaluate(async src=>{
    const {cropImage}=await import('/paper-images.js');
    window.cropResult=cropImage(src).then(r=>r?[r.widthFraction,r.heightFraction,r.blob.size]:null);
   },'data:image/png;base64,'+png.toString('base64'));
   await start();
   const dialog=page.locator('.photo-crop'),frame=dialog.locator('.crop-frame');
   await frame.waitFor();const rect=await frame.boundingBox();
   await page.mouse.move(rect.x+4,rect.y+4);await page.mouse.down();
   await page.mouse.move(rect.x+rect.width*.25,rect.y+rect.height*.25);await page.mouse.up();
   await dialog.getByRole('button',{name:'เสร็จสิ้น'}).click();
   const [w,h,size]=await page.evaluate(()=>window.cropResult);
   assert.ok(w>.65&&w<.85&&h>.65&&h<.85&&size>0);
   await start();await dialog.getByRole('button',{name:'ยกเลิก'}).click();
   assert.equal(await page.evaluate(()=>window.cropResult),null);
   assert.deepEqual(errors,[]);console.log(name+': direct photo crop PASS');continue;
  }
  if(process.env.PAPER_TEST==='tables'){
   const primary=page.locator('.paper-toolbar');
   assert.equal(await page.locator('[data-paper="table"]').count(),1);
   await click('page-settings');
   assert.ok(await page.locator('.paper-context-page #paper-template').isVisible());
   await click('ruler');await click('ruler-plus');
   assert.match(await page.locator('[data-ruler-overlay]').getAttribute('transform'),/rotate\(15\)/);
   await click('ruler-zero');await click('ruler');
   await click('text');
   await page.locator('#paper-svg').evaluate(svg=>{
    const r=svg.getBoundingClientRect();svg.setPointerCapture=()=>{};
    for(const type of ['pointerdown','pointerup'])svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'pen',pointerId:92,clientX:r.left+r.width*.5,clientY:r.top+r.height*.35}));
    delete svg.setPointerCapture;
   });
   await page.locator('#paper-text-input').fill('ระยะที่ 2');
   await page.locator('[data-text-align="center"]').click();
   await click('finish-text');await click('save');
   assert.ok(row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.text==='ระยะที่ 2'&&o.align==='center'));
   // Table creation, resizing, editable cells and persistence on each screen size.
   await click('table');
   const grid=page.locator('.paper-inline-table');
   await grid.waitFor({state:'visible'});
   await click('table-add-row');
   await grid.getByLabel('แถว 1 คอลัมน์ 1',{exact:true}).fill('นักปรัชญา');
   await grid.getByLabel('แถว 2 คอลัมน์ 1',{exact:true}).fill('เพลโต');
   const grip=grid.locator('[data-axis="x"][data-index="0"]');
   await grip.scrollIntoViewIfNeeded();
   const tableEdge=await grip.boundingBox();
   const firstCell=await grid.locator('textarea').first().boundingBox();
   const handleY=firstCell.y+firstCell.height/2;
   await page.mouse.move(tableEdge.x+tableEdge.width/2,handleY);
   await page.mouse.down();await page.mouse.move(tableEdge.x+tableEdge.width/2+18,handleY);await page.mouse.up();
   await click('save');
   const savedTable=()=>row.payload.notebook.notes.find(n=>n.id==='browser-note').paper.pages[0].objects.find(o=>o.type==='table');
   await wait(()=>savedTable()?.cells[1]?.[0]==='เพลโต');
   assert.deepEqual([savedTable().cells.length,savedTable().cells[0].length],[4,3]);
   assert.ok(await page.locator('#paper-svg foreignObject[data-object]').count(),'table appears on paper, not only in dialog');
   await click('table-add-row');await click('table-add-col');await click('save');
   assert.deepEqual([savedTable().cells.length,savedTable().cells[0].length],[5,4]);
   await click('table-edit');
   await grid.getByLabel('แถว 3 คอลัมน์ 2',{exact:true}).fill('ความยุติธรรม');
   await click('save');
   assert.ok(savedTable().columns[0]>savedTable().columns[1]);
   assert.equal(savedTable().cells[2][1],'ความยุติธรรม');
   await page.reload();await page.locator('#paper-svg').waitFor();
   assert.equal(await page.locator('#paper-svg table').count(),1,'table persists after reload');
   assert.ok((await page.locator('#paper-svg table').innerText()).includes('ความยุติธรรม'));
   await page.screenshot({path:'test-results/notebook-tables-'+name+'.png'});
   
   await click('pen');
   const wrote=await page.locator('#paper-svg').evaluate(svg=>{
    const footer=document.querySelector('#paper-page-label');
    const select=new Event('selectstart',{bubbles:true,cancelable:true});
    footer.dispatchEvent(select);
    const range=document.createRange();range.selectNodeContents(footer);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    const rect=svg.getBoundingClientRect();
    const send=(type,id,device,x)=>svg.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:device,clientX:rect.x+x,clientY:rect.y+90,pressure:.5}));
    // Synthetic contacts cannot request native pointer capture.
    svg.setPointerCapture=()=>{};
    try{
     send('pointerdown',81,'touch',45);send('pointerdown',82,'pen',65);
     send('pointerup',81,'touch',45);send('pointermove',82,'pen',95);send('pointerup',82,'pen',105);
    }finally{delete svg.setPointerCapture;}
    return select.defaultPrevented&&selection.isCollapsed;
   });
   assert.ok(wrote,'ink suppresses selection on the status bar');
   await click('save');
   assert.ok(row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.type==='stroke'),'pen writes with a palm already on the page');
   assert.deepEqual(errors,[]);console.log(name+': inline table PASS');continue;
  }
  const point=(x,y)=>page.locator('#paper-svg').evaluate((svg,[x,y])=>{
   const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());
   return {x:p.x,y:p.y};
  },[x,y]);
  const toolbar=page.locator('.paper-toolbar');
  const toolOrder=await page.locator('.paper-toolset>button[data-paper]').evaluateAll(items=>items.map(el=>el.dataset.paper));
  assert.deepEqual(toolOrder.slice(0,2),['select','hand'],'Select and Pan are the first two neighboring notebook tools');
  const dockMore=page.locator('#paper-mobile-more');
  if(mobile){
   assert.ok(await dockMore.isHidden(),'all tools are available without opening More');
   assert.ok(await page.locator('[data-paper="hand"]').isVisible(),'Pan is immediately visible on phone');
   assert.ok(await page.locator('[data-paper="select"]').isVisible(),'Select is immediately visible on phone');
   assert.ok(await page.locator('[data-paper="pen"]').isVisible(),'Pen is immediately visible on phone');
   assert.ok(await page.locator('[data-paper="text"]').isVisible(),'Text is immediately visible on phone');
   assert.ok(await page.locator('[data-paper="eraser"]').isVisible(),'Eraser is immediately visible on phone');
   assert.ok(await page.locator('[data-paper="shape"]').isVisible(),'shape tool is in the scrollable dock');
   const layout=await page.evaluate(()=>{
    const bar=document.querySelector('.paper-toolbar').getBoundingClientRect();
    const paper=document.querySelector('.paper-viewport').getBoundingClientRect();
    return {dockBelowCanvas:bar.top>=paper.bottom-2,noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth+2,
      dockHeight:bar.height,canvasWidth:paper.width};
   });
   assert.ok(layout.dockBelowCanvas,'phone toolbar is thumb-reachable below the paper');
   assert.ok(layout.noHorizontalOverflow,'phone layout does not overflow horizontally');
   assert.ok(layout.dockHeight>=44&&layout.dockHeight<=90,'phone dock remains compact');
   assert.ok(await page.locator('[data-paper="table"]').isVisible(),'table is available without opening More');
   assert.ok(await page.locator('[data-paper="multi"]').isVisible(),'multi-select is directly available');
  }else{
   assert.ok(await dockMore.isHidden(),'iPad and desktop retain the existing full toolbar');
  }
  const toolbarMetrics=await toolbar.evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,
   children:Array.from(el.children).map(c=>({class:c.className,height:c.getBoundingClientRect().height,display:getComputedStyle(c).display,position:getComputedStyle(c).position})),
   display:getComputedStyle(el).display,flexWrap:getComputedStyle(el).flexWrap}));
  assert.ok(toolbarMetrics.height<=90,'notebook toolbar should remain a compact single row: '+JSON.stringify(toolbarMetrics));
   assert.equal(await page.locator('[data-paper="table"]').count(),1);
   assert.equal(await toolbar.locator('[data-paper="ruler"]').count(),1);
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false);
   if(mobile)assert.ok(await page.locator('#paper-text-ribbon').isHidden(),'Word toolbar is inside the editor on narrow phones');
   else assert.ok(await page.locator('#paper-text-ribbon').isHidden(),'text format opens only while editing');
  assert.ok(await page.locator('.paper-tool-options').isHidden(),'extra options must not occupy canvas when closed');
   assert.ok(await page.locator('.paper-pages').isHidden(),'page thumbnails start collapsed to maximize writing space');
   await click('pages');
   assert.ok(await page.locator('.paper-pages').isVisible(),'page thumbnails can be expanded');
   assert.equal(await page.locator('[data-paper="pages"]').getAttribute('aria-expanded'),'true');
   await click('pages');
   assert.ok(await page.locator('.paper-pages').isHidden(),'page thumbnails can be folded again');
  await click('pen');
  const inputStrip=page.locator('#paper-input-strip');
  assert.ok(await inputStrip.isVisible(),'Pencil/finger and palm-protection choices appear directly below pen tools');
  assert.equal(await inputStrip.locator('#paper-pencil-only').count(),1,'Pencil-only mode is visible');
  assert.equal(await inputStrip.locator('#paper-finger').count(),1,'finger drawing mode is visible');
  assert.equal(await inputStrip.locator('#paper-palm-guard').count(),1,'palm/zoom protection stays in the same visible strip');
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'settings popup stays closed');
  await inputStrip.locator('#paper-pencil-only').check();
  assert.ok(await inputStrip.locator('#paper-pencil-only').isChecked(),'Pencil-only mode can be selected');
  assert.ok(!await inputStrip.locator('#paper-finger').isChecked(),'only one drawing input mode is selected');
  await inputStrip.locator('#paper-palm-guard').check();
  assert.ok(await inputStrip.locator('#paper-pencil-only').isChecked(),'enabling palm guard selects Pencil-only input');
  assert.ok(await page.locator('.paper-app').evaluate(el=>el.classList.contains('paper-palm-guard-on')),'palm/zoom protection applies immediately');
  await inputStrip.locator('#paper-finger').check();
  assert.ok(!await inputStrip.locator('#paper-palm-guard').isChecked(),'selecting finger input automatically releases palm lock');
  assert.ok(await inputStrip.locator('#paper-finger').isChecked(),'finger mode is now active');
  assert.ok(await inputStrip.locator('.paper-geometry-check').isVisible(),'hold-to-shape drawing option is not hidden inside an advanced menu');
  assert.ok(await page.locator('.paper-context-ink').isVisible(),'pen settings available directly');
  await page.locator('[data-paper-color="#3155d9"]').click();
  await click('text');
  assert.ok(await inputStrip.isHidden(),'drawing controls disappear when typing to preserve writing space');
  assert.ok(await page.locator('.paper-context-ink').isHidden(),'drawing controls leave room for text');
  await page.screenshot({path:'test-results/notebook-compact-'+name+'.png'});

  const tap=async(x,y)=>{const p=await point(x,y);if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
  // Text can be entered on touch without enabling finger drawing.
  assert.equal(await page.locator('[data-paper="text"]').getAttribute('aria-pressed'),'true');await tap(100,230);
  const typingBox=page.locator('#paper-text-input'),size=()=>typingBox.evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight}));
  await typingBox.fill('จด');const small=await size();
   if(mobile){
     assert.ok(await page.locator('#paper-mobile-editor').isHidden(),'no floating phone editor');
     assert.ok(await page.locator('#paper-selection-tools').isHidden(),'selection tools must not cover text while the keyboard is open');
     assert.ok(small.w>=250&&small.h<60,'mobile text edits at the original paper position');
     assert.ok(Number.parseFloat(await typingBox.evaluate(el=>getComputedStyle(el).fontSize))>=16);
     assert.equal(await typingBox.evaluate(el=>el.parentElement.id),'paper-sheet');
     assert.ok(await page.locator('#paper-text-ribbon').isVisible(),'formatting stays in a compact strip');
     const paperScale=await typingBox.evaluate(el=>el.getBoundingClientRect().width/el.offsetWidth);
     assert.ok(paperScale>=.9,'paper zoom is readable on a phone');
    }else assert.ok(small.w>=250&&small.h<60,'leave room to handwrite after existing words');
   await typingBox.fill('พิมพ์ข้อความยาวขึ้นโดยไม่ตัดบรรทัดเอง');const medium=await size();
   assert.ok(medium.w>small.w+40,'text box width must grow with a single line of text');
   assert.ok(medium.h<=small.h+8,'an ordinary sentence must stay on one line while paper width is available');
   await typingBox.fill('ข้อความสำหรับทดสอบการตัดบรรทัด '.repeat(18));const long=await size();
   assert.ok(long.w>small.w&&long.w<=801&&long.h>small.h);
   await typingBox.fill('จด');assert.deepEqual(await size(),small);
   await page.locator('#paper-text-input').fill('ความเข้าใจของฉัน');await click('save');
   if(mobile)assert.ok(await page.locator('#paper-mobile-editor').isHidden(),'phone never opens the old editor');await wait(()=>row.payload.notebook.notes[0].paper?.pages[0].objects.some(o=>o.text==='ความเข้าใจของฉัน'));
  const text=row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.text==='ความเข้าใจของฉัน');
   assert.ok(text.h>=text.size*1.5&&text.h<60&&text.w<400);
   assert.equal(text.size,16,'new text defaults to 16px');
   await click('select');
   if(name==='desktop'){
    const selectedBar=page.locator('#paper-selection-tools');
    assert.ok(await selectedBar.isVisible(),'selected-object controls appear after selecting text');
    const size=selectedBar.locator('#paper-font-size');
    await selectedBar.getByRole('button',{name:'เพิ่มขนาดตัวอักษรทั้งกล่อง'}).click();
    assert.equal(await size.inputValue(),'17');
    await selectedBar.getByRole('button',{name:'ลดขนาดตัวอักษรทั้งกล่อง'}).click();
    assert.equal(await size.inputValue(),'16');
    const oldBox=await selectedBar.boundingBox();
    for(const key of ['layer-front','layer-up','layer-down','layer-back','duplicate','delete-object','group','ungroup']){
     assert.ok(await selectedBar.locator('[data-paper="'+key+'"]').isVisible(),'direct object command '+key+' is visible');
    }
    const drag=selectedBar.locator('.paper-selection-drag');
    assert.ok(await drag.isVisible(),'selected-object controls have a draggable grip');
    assert.ok(oldBox.height<150,'selected-object command box is compact with direct actions');
    const handle=await drag.boundingBox();
    const sx=handle.x+handle.width/2,sy=handle.y+handle.height/2;
    await page.mouse.move(sx,sy);
    await page.mouse.down();
    await page.mouse.move(sx+90,sy-80,{steps:6});
    await page.mouse.up();
    const movedBar=await selectedBar.boundingBox();
    assert.ok(movedBar.y<oldBox.y-25,
     'selected-object palette can move freely rather than being locked to the footer');
   }
   const editAt=await point(text.x+10,text.y+8);
   await page.locator('#paper-svg').dispatchEvent('dblclick',{bubbles:true,clientX:editAt.x,clientY:editAt.y});
   assert.ok(await page.locator('#paper-text-input').isVisible(),'double-click opens text for editing immediately');
   await click('save');
   if(name==='desktop'){
    // Real mouse double click must reopen a text object from Hand mode,
    // not merely synthetic dblclick dispatched on the SVG container.
    await click('hand');
    const realPoint=await point(text.x+10,text.y+8);
    await page.mouse.dblclick(realPoint.x,realPoint.y,{delay:75});
    const reopened=page.locator('#paper-text-input');
    assert.ok(await reopened.isVisible(),'mouse double-click in Hand mode edits text without choosing the Text tool first');
    assert.equal(await reopened.inputValue(),'ความเข้าใจของฉัน','double-click preserves the original text');
    const toolbar=page.locator('#paper-text-ribbon');
    assert.ok(await toolbar.isVisible());
    const grip=toolbar.locator('.paper-ribbon-drag');
    assert.ok(await grip.isVisible(),'desktop text toolbar has a dedicated drag grip');
    const rect=await toolbar.boundingBox();
    assert.ok(rect.height<60,'desktop text toolbar stays one row tall');
    const gripRect=await grip.boundingBox();
    await page.mouse.move(gripRect.x+gripRect.width/2,gripRect.y+gripRect.height/2);
    await page.mouse.down();await page.mouse.move(gripRect.x+gripRect.width/2+105,gripRect.y+gripRect.height/2+65,{steps:8});await page.mouse.up();
    const moved=await toolbar.boundingBox();
    assert.ok(moved.x>rect.x+30&&moved.y>rect.y+20,'desktop toolbar moves freely on drag');
    await reopened.evaluate(input=>input.setSelectionRange(0,input.value.length));
    await toolbar.locator('[data-list-prefix="bullet"]').click();
    assert.equal(await reopened.inputValue(),'• ความเข้าใจของฉัน','bullet inserts before the actual text');
    await toolbar.locator('[data-list-prefix="triangle"]').click();
    assert.equal(await reopened.inputValue(),'▸ ความเข้าใจของฉัน','triangle replaces bullet without duplicating it');
    await toolbar.locator('[data-list-prefix="triangle"]').click();
    assert.equal(await reopened.inputValue(),'ความเข้าใจของฉัน','clicking the same symbol again removes the prefix');
    await click('save');
    await wait(()=>Promise.resolve(row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.id===text.id&&o.text==='ความเข้าใจของฉัน')));
   }
   await click('text');
  // Real mouse/pen-style pointer flow; touch mode additionally checks pan-vs-ink behavior.
  await click('shape');await page.locator('[data-shape-pick="arrow"]').click();assert.equal(await page.locator('#paper-shape').inputValue(),'arrow');
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
  if(!mobile){
   await page.keyboard.down('Shift');await tap(120,330);await page.keyboard.up('Shift');
   await click('group');await click('save');
   const grouped=row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.groupId);
   assert.equal(grouped.length,2);assert.equal(grouped[0].groupId,grouped[1].groupId);
   await tap(600,500);await tap(120,330);
   assert.equal(await page.locator('#paper-selected-count').innerText(),'กลุ่ม · 2');
   await click('ungroup');await click('save');
   assert.ok(!row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.groupId));
   const count=()=>row.payload.notebook.notes[0].paper.pages[0].objects.length;
   const initialCount=count();
   await page.keyboard.press('Control+a');
   assert.equal(await page.locator('#paper-selected-count').innerText(),String(initialCount));
   await page.evaluate(()=>{
    const data=new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));
    document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
   });
   await click('save');assert.equal(count(),initialCount*2,'copy and paste selected objects');
   await page.keyboard.press('Control+z');await click('save');assert.equal(count(),initialCount,'keyboard undo removes pasted objects');
   await page.keyboard.press('Control+y');await click('save');assert.equal(count(),initialCount*2,'keyboard redo restores pasted objects');
   await page.keyboard.press('Control+z');await click('save');assert.equal(count(),initialCount);
   await page.evaluate(()=>{
    const data=new DataTransfer();data.setData('text/plain','ข้อความจากคลิปบอร์ด');
    document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
   });
   await click('save');assert.ok(row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.text==='ข้อความจากคลิปบอร์ด'));
   await page.keyboard.press('Control+z');await click('save');assert.equal(count(),initialCount);
  }
  assert.ok(await page.locator('#paper-toolbar-more').evaluate(el=>!el.open),'extra tools should start folded');
  assert.ok(await page.locator('#paper-width').isHidden(),'pen size cannot obstruct the page while menu is folded');
  await click('pen');
  if(!await page.locator('#paper-width').isVisible())await page.locator('[data-paper-size-toggle]').click();
  assert.ok(await page.locator('#paper-width').isVisible(),'size controls should be available inside the overlay');
  const dots=page.locator('[data-paper-width]');assert.equal(await dots.count(),6);
  await page.locator('[data-paper-width="2"]').click();
  assert.equal(await page.locator('#paper-width-value').textContent(),'2');
  assert.equal(await page.locator('[data-paper-width="2"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#paper-pen-preview').evaluate(el=>el.style.width),'2px');
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'preset selection should fold extras');
  if(!await page.locator('#paper-width').isVisible())await page.locator('[data-paper-size-toggle]').click();
  await page.locator('#paper-width').evaluate(el=>{el.value='12';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.locator('#paper-width-value').textContent(),'12');
  assert.equal(await page.locator('[data-paper-width="12"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#paper-pen-preview').evaluate(el=>el.style.width),'12px');
  assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'slider change should fold extras');
   await click('highlight');
   if(!await page.locator('#paper-width').isVisible())await page.locator('[data-paper-size-toggle]').click();
   assert.equal(await page.locator('#paper-width').getAttribute('max'),'40','highlighter has independent 1–40 width range');
   await page.locator('[data-paper-width="28"]').click();
   assert.equal(await page.locator('#paper-width-value').textContent(),'28');
   await click('pen');
   if(!await page.locator('#paper-width').isVisible())await page.locator('[data-paper-size-toggle]').click();
   assert.equal(await page.locator('#paper-width-value').textContent(),'12','pen remembers its own width after switching from highlighter');
   await page.keyboard.press('Escape');
   const from=await point(100,400),to=await point(350,450);
  if(mobile){

   await page.locator('#paper-finger').check();
   assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'finger-draw choice should uncover the paper');
   await tap(220,420);
  }
  else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:15});await page.mouse.up();}
  await click('save');await wait(()=>row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.type==='stroke'));
   assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.find(o=>o.type==='stroke').width,12,'selected width must be persisted on new vector stroke');
  await click('undo');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,0);
  await click('redo');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,1);
  await click('select');await tap(220,420);await click('delete-object');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages[0].objects.filter(o=>o.type==='stroke').length,0);
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
  const beforeCropWidth=picture().w;await click('crop');const crop=page.getByRole('dialog');await crop.getByRole('button',{name:'ปรับขอบซ้าย',exact:true}).press('ArrowRight');await crop.getByRole('button',{name:'เสร็จสิ้น'}).click();
  await wait(()=>images.size===2);await wait(()=>page.locator('#paper-svg image').getAttribute('width').then(w=>Number(w)<beforeCropWidth));await click('save');assert.notEqual(picture().imageId,original.imageId);
  await click('files');await page.locator('#paper-doc-file').setInputFiles({name:'lesson.pdf',mimeType:'application/pdf',buffer:Buffer.concat([Buffer.from('%PDF-1.4 sample'),Buffer.alloc(20*1024*1024-15)])});
  await wait(()=>row.payload.notebook.notes[0].files?.[0]?.name==='lesson.pdf');await page.locator('#paper-files form button').click();
  await click('page-settings');await page.locator('#paper-template').selectOption('dots');await click('save');
  await page.screenshot({path:'test-results/paper-'+name+'.png'});
  if(!await page.locator('[data-paper="add-page"]').first().isVisible())await click('pages');await click('add-page');await click('save');assert.equal(row.payload.notebook.notes[0].paper.pages.length,2);
  // Empty pages now delete immediately without a redundant confirmation,
  // and undo/redo still protects against accidental taps.
  await click('delete-page');await click('save');
  assert.equal(row.payload.notebook.notes[0].paper.pages.length,1);
  assert.equal(await page.getByRole('alertdialog').count(),0);
  await click('undo');await click('save');
  assert.equal(row.payload.notebook.notes[0].paper.pages.length,2,'Undo restores a deleted blank page');
  await click('redo');await click('save');
  assert.equal(row.payload.notebook.notes[0].paper.pages.length,1,'Redo removes the blank page again');
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
  assert.equal(await page.locator('#paper-text-input').inputValue(),'กำลังเขียนขณะซิงก์');assert.equal(await page.evaluate(()=>window.__paperNode===document.querySelector('#paper-svg')),true);await click('save');await wait(()=>Promise.resolve(row.payload.notebook.notes[0].paper.pages[0].objects.some(o=>o.text==='กำลังเขียนขณะซิงก์')));assert.equal(row.payload.notebook.notes[0].title,'อีกเครื่องอัปเดตชื่อ');
  await page.reload();await page.waitForFunction(()=>document.body.classList.contains('paper-mode'));assert.equal(await page.locator('#paper-svg image').count(),1);
  await page.locator('.paper-menu summary').click();await click('legacy');await page.getByRole('dialog').waitFor();await page.locator('.paper-legacy-content p').first().waitFor();assert.match(await page.locator('.paper-legacy-content').innerText(),/ต้นฉบับบทเรียน/);await page.getByRole('button',{name:'กลับหน้ากระดาษ',exact:true}).click();
  await page.locator('.paper-back').click();await page.locator('.note-card').waitFor();assert.equal(await page.locator('.note-card p').count(),0);await page.screenshot({path:'test-results/library-'+name+'.png'});
  await page.locator('[data-action="nb-classify"]').first().click();
  const category=page.getByRole('dialog');await category.locator('[name="source"]').selectOption('prep');
  await category.locator('[name="course"]').selectOption('POL2106');await category.getByText('บันทึก',{exact:true}).click();
  await wait(()=>row.payload.notebook.notes[0].source==='prep');assert.equal(row.payload.notebook.notes[0].course,'POL2106');
  await page.locator('[data-action="nb-new"]').first().click();
  const create=page.getByRole('dialog');assert.equal(await create.locator('[name="group"]').inputValue(),'yes');
  await create.locator('[name="course"]').selectOption('POL2104');await create.getByRole('button',{name:'สร้างโน้ต',exact:true}).click();
  await page.locator('#paper-svg').waitFor();await click('save');assert.ok(row.payload.notebook.notes.some(n=>n.course==='POL2104'&&n.source==='classroom'));
   // A primary teacher file belongs to the course, not this one note page.
   await click('course-materials');
   const courseDialog=page.locator('.course-materials-dialog');
   await courseDialog.waitFor();
   await courseDialog.locator('[data-course-upload]').setInputFiles({name:'POL2104-syllabus.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 test course')});
   await wait(()=>row.payload.notebook.courseMaterials?.POL2104?.files?.[0]?.name==='POL2104-syllabus.pdf');
   await courseDialog.locator('[data-course-close]').click();
   assert.ok(await page.locator('.paper-course-materials').count(),'note shows the shared course file shortcut');
   const courseNoteId=row.payload.notebook.notes.find(n=>n.course==='POL2104').id;
   await page.evaluate(()=>{location.hash='#classroom';});
   await page.locator('.classroom-grid').waitFor();
   assert.ok(await page.locator('.classroom-note-link[href="#note/'+courseNoteId+'"]').isVisible(),'classroom links to the existing note without creating another');
   assert.ok(await page.locator('.classroom-course').filter({hasText:'POL2104'}).getByText('POL2104-syllabus.pdf').isVisible(),'classroom shows the same primary PDF');
   const courseCard=page.locator('.classroom-course').filter({hasText:'POL2104'});
   await courseCard.locator('[data-course-upload-direct="POL2104"]').setInputFiles({name:'lecture-week1.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 lecture')});
    await wait(()=>row.payload.notebook.courseMaterials?.POL2104?.files?.some(f=>f.name==='lecture-week1.pdf'));
    assert.equal(row.payload.notebook.courseMaterials.POL2104.files.length,2,'direct classroom upload shares the course collection');
    await courseCard.locator('[data-action="nb-new"]').click();
    assert.equal(await page.getByRole('dialog').locator('[name="session"]').inputValue(),'2');
    await page.getByRole('dialog').getByRole('button',{name:'สร้างโน้ต',exact:true}).click();
   await page.locator('#paper-svg').waitFor();
   const sharedFiles=page.getByRole('button',{name:'เอกสารหลักของวิชา',exact:true});
   assert.equal(await sharedFiles.getAttribute('title'),'ไฟล์หลักวิชา POL2104 · 2 รายการ');assert.ok(await sharedFiles.isVisible(),'a new note exposes its course files immediately');
   await sharedFiles.click();await courseDialog.locator('[data-course-preview]').first().click();
   const preview=page.locator('.paper-file-view');
   await preview.locator('iframe').waitFor();assert.equal(await preview.locator('h2').innerText(),'POL2104-syllabus.pdf');
   await preview.locator('[data-close]').click();await courseDialog.locator('[data-course-close]').click();
   await page.evaluate(()=>{location.hash='#classroom';});
   await page.locator('.classroom-note-link[href="#note/'+courseNoteId+'"]').click();
   await page.locator('#paper-svg').waitFor();

   // Geometry is folded, but shape and ruler controls remain functional.
   assert.equal(await page.locator('#paper-geometry-menu').evaluate(el=>el.open),false);
   await click('shape');
   assert.ok(await page.locator('#paper-shapes-popup').isVisible());
   await page.locator('[data-shape-pick="hexagon"]').click();
   assert.ok(await page.locator('#paper-shapes-popup').isHidden());
   assert.equal(await page.locator('#paper-toolbar-more').evaluate(el=>el.open),false,'shape selection must uncover the paper');
   await click('shape');await page.keyboard.press('Escape');
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
    assert.ok(await page.locator('[data-open-shapes="selected"]').isVisible(),'selected shape supports icon gallery');
    await page.locator('[data-open-shapes="selected"]').click();
    await page.locator('[data-shape-pick="triangle"]').click();
    await page.locator('#paper-selected-line-style').selectOption('dashed');
    await click('save');
    const savedShape=()=>row.payload.notebook.notes.find(n=>n.course==='POL2104').paper.pages[0].objects.find(o=>o.type==='shape');
    assert.equal(savedShape().kind,'triangle','selected shape can be converted without redrawing');
    assert.equal(savedShape().dash,'dashed','selected shape line can be changed after drawing');
    await page.getByRole('button',{name:'สีรูปทรง',exact:true}).click();
    const palette=page.getByRole('dialog',{name:'สีรูปทรง'});
    await palette.getByRole('button',{name:'สีพื้น เหลือง',exact:true}).click();
    await palette.getByRole('button',{name:'สีเส้น น้ำเงิน',exact:true}).click();
    await palette.getByRole('button',{name:'เสร็จสิ้น'}).click();
    await click('save');
    assert.equal(savedShape().fill,'#f5cc55');
    assert.equal(savedShape().color,'#3255be');
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
    await page.locator('[data-shape-rotate="90"]').click();
    await click('save');
    assert.equal(savedShape().angle,90,'rotation is persisted independently of shape bounds');
    assert.match(await page.locator('#paper-svg [data-shape="triangle"]').getAttribute('transform'),/rotate\(90 /);
    await page.locator('#paper-shape-angle').fill('270');
    await page.locator('#paper-shape-angle').dispatchEvent('change');
    await click('save');
    assert.equal(savedShape().angle,270,'numeric angle input changes the selected shape');
    // Word-like notebook context menu must prevent the browser menu and
    // choose actions based on what lies under the right-clicked location.
    const canvasMenu=page.locator('#paper-context-menu');
    const shapeAt=await point(340,830);
    const appMenu=await page.locator('#paper-svg').evaluate((svg,p)=>{
     const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:p.x,clientY:p.y});
     svg.dispatchEvent(event);return event.defaultPrevented;
    },shapeAt);
    assert.ok(appMenu,'right-clicking the paper suppresses the native browser menu');
    assert.ok(await canvasMenu.isVisible(),'the app provides a context menu for a selected object');
    assert.ok(await canvasMenu.locator('[data-context-action="copy"]').isVisible());
    await canvasMenu.locator('[data-context-action="copy"]').click();
    const blankAt=await point(650,1150);
    await page.locator('#paper-svg').evaluate((svg,p)=>{
     const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:p.x,clientY:p.y});
     svg.dispatchEvent(event);
     if(!event.defaultPrevented)throw Error('Browser menu was not prevented over blank paper');
    },blankAt);
    assert.ok(await canvasMenu.locator('[data-context-action="add-text"]').isVisible(),'blank page offers an add-text action');
    assert.ok(await canvasMenu.locator('[data-context-action="paste"]').isVisible(),'copied objects may be pasted from the app menu');
    await canvasMenu.locator('[data-context-action="paste"]').click();
    await click('save');
    assert.equal(row.payload.notebook.notes.find(n=>n.course==='POL2104').paper.pages[0].objects.filter(o=>o.type==='shape').length,2);
    await click('undo');await click('save');
    assert.equal(row.payload.notebook.notes.find(n=>n.course==='POL2104').paper.pages[0].objects.filter(o=>o.type==='shape').length,1);
   await click('ruler');
   assert.equal(await page.locator('[data-paper="ruler"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#paper-svg [data-ruler="move"]').count(),1);
   await click('ruler-plus');
   assert.match(await page.locator('#paper-svg [data-ruler-overlay]').getAttribute('transform'),/rotate\(15\)/);
   await click('ruler');
   assert.equal(await page.locator('#paper-svg [data-ruler="move"]').count(),0);
   await click('eraser');
   assert.ok(await page.locator('#paper-eraser-menu').isVisible(),'the Eraser button opens the three eraser modes');
   for(const mode of ['stroke','shape','text'])
    assert.ok(await page.locator('[data-eraser-kind="'+mode+'"]').isVisible());
   await page.locator('[data-eraser-kind="shape"]').click();
   assert.ok(await page.locator('#paper-eraser-menu').isHidden(),'selecting an eraser mode closes its menu');
   assert.equal(await page.locator('#paper-svg').getAttribute('data-tool'),'eraser');
   await click('eraser');await page.locator('[data-eraser-kind="text"]').click();
   assert.equal(await page.locator('[data-eraser-kind="text"]').getAttribute('aria-pressed'),'true');
   await click('text');
  await b.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await b.page.locator('.paper-menu > summary').click();
  await b.page.locator('[data-paper="files"]').click();const fileButton=b.page.locator('#paper-file-list').getByText('lesson.pdf');await fileButton.waitFor();
  const [download]=await Promise.all([b.page.waitForEvent('download'),fileButton.click()]);
  assert.equal(download.suggestedFilename(),'lesson.pdf');const downloaded=await readFile(await download.path());assert.equal(downloaded.length,20*1024*1024);assert.equal(downloaded.subarray(0,15).toString(),'%PDF-1.4 sample');
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
  await click('text');
  const blankSpot=await point(760,1120);
  await page.locator('#paper-svg').evaluate((svg,p)=>{
   svg.setPointerCapture=()=>{};
   for(const type of ['pointerdown','pointerup'])
    svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'pen',pointerId:982,clientX:p.x,clientY:p.y}));
   delete svg.setPointerCapture;
  },blankSpot);
  const follow=page.locator('#paper-text-input');
  await follow.fill('รัฐ');await click('save');
  const activeNote=()=>row.payload.notebook.notes.find(n=>n.course==='POL2104');
  const originalText=activeNote().paper.pages[0].objects.find(o=>o.type==='text'&&o.text==='รัฐ');
  assert.ok(originalText,'create a short test word in an otherwise empty region');
  await page.locator('#paper-svg [data-object="'+originalText.id+'"]').first().scrollIntoViewIfNeeded();
  const following=await point(Math.min(890,originalText.x+originalText.w+32),originalText.y+originalText.h/2);
  if(mobile)await page.touchscreen.tap(following.x,following.y);
  else await page.mouse.click(following.x,following.y);
  if(!await follow.isVisible()&&!await page.locator('#paper-rich-editor').isVisible()){
   await click('select');
   const textAt=await point(originalText.x+10,originalText.y+8);
   await page.locator('#paper-svg').dispatchEvent('dblclick',{bubbles:true,clientX:textAt.x,clientY:textAt.y});
  }
  assert.equal(await follow.inputValue(),'รัฐ','existing text remains intact when reopened');
  assert.equal(await follow.evaluate(el=>el.selectionStart),await follow.inputValue().then(v=>v.length),'cursor should be at the end ready for Scribble');
  if(await follow.isVisible())await follow.fill('รัฐศาสตร์');
   else{const rich=page.locator('#paper-rich-editor');assert.ok(await rich.isVisible());await rich.fill('รัฐศาสตร์');}
   await click('save');
  const continued=activeNote().paper.pages[0].objects.find(o=>o.id===originalText.id);
  assert.equal(continued.text,'รัฐศาสตร์','new handwriting text should be stored on same object');
  assert.equal(activeNote().paper.pages[0].objects.filter(o=>o.text==='รัฐศาสตร์').length,1);

  // Touch contacts on the writing surface must not trigger zoom or new text
  // while palm protection is enabled. Pen input must still work.
  await click('pen');
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
  await click('text');
  const existingTextPoint=await point(continued.x+3,continued.y+5);
  await page.locator('#paper-svg').evaluate((svg,p)=>{
   svg.setPointerCapture=()=>{};
   for(const type of ['pointerdown','pointerup'])svg.dispatchEvent(new PointerEvent(type,{pointerId:812,isPrimary:true,pointerType:'touch',bubbles:true,cancelable:true,clientX:p.x,clientY:p.y}));
   delete svg.setPointerCapture;
  },existingTextPoint);
  assert.equal(await page.locator('#paper-text-input').inputValue(),'รัฐศาสตร์');
  assert.ok(await page.locator('#paper-text-input').isVisible());
  await click('finish-text');
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

  // Word-style selection, exact size and one-word links must survive cloud save.
   await page.locator('.paper-back').click();await page.locator('.note-card').first().waitFor();
   await page.locator('[data-action="nb-new"]').first().click();
   const createWord=page.getByRole('dialog');
   
   await createWord.locator('[name="course"]').selectOption('POL2200');
   const wordSession=await createWord.locator('[name="session"]').inputValue();
   await createWord.getByRole('button',{name:'สร้างโน้ต',exact:true}).click();
   await page.locator('#paper-svg').waitFor();
   await click('text');
   // A mobile tap can be swallowed by viewport/palm interactions. A stylus event
   // exercises the same insertion path reliably on iPhone, iPad and desktop.
   const wordAt=await point(140,320);
   await page.locator('#paper-svg').evaluate((svg,p)=>{
    svg.setPointerCapture=()=>{};
    for(const type of ['pointerdown','pointerup'])svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'pen',pointerId:885,clientX:p.x,clientY:p.y}));
    delete svg.setPointerCapture;
   },wordAt);
   const wordInput=page.locator('#paper-text-input');
   assert.ok(await wordInput.isVisible(),'fresh notebook text box should open on stylus input');
   await wordInput.fill('Word text with link');
   await wordInput.evaluate(el=>el.setSelectionRange(0,4));
   await wordInput.dispatchEvent('mouseup',{bubbles:true,button:0});
   const wordRibbon=page.locator('#paper-text-ribbon');
   assert.ok(await wordRibbon.isVisible(),'ordinary text selection uses the single formatting ribbon');
   assert.ok(await page.locator('#paper-word-menu').isHidden(),'ordinary selection must not open a duplicate toolbar');
   await wordInput.dispatchEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:200});
   const miniToolbar=page.locator('#paper-word-menu');
   assert.ok(await miniToolbar.isVisible(),'right-click must open the Word selection mini toolbar');
   assert.ok(await miniToolbar.locator('[data-word-menu-link]').isVisible(),'mini toolbar must expose link/file for the selected word');
   assert.ok(await wordRibbon.isHidden(),'right-click menu replaces rather than duplicates the ribbon');
   await miniToolbar.locator('[data-word-menu-format="bold"]').click();
   assert.ok(await page.locator('#paper-rich-editor').isVisible(),'mini toolbar formats only the selected word and enters rich editing');
   const dropBlocked=await page.locator('#paper-rich-editor').evaluate(editor=>{
    const before=editor.innerHTML,transfer=new DataTransfer();
    transfer.setData('text/html','<b>sample</b>');
    const event=new Event('drop',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'dataTransfer',{value:transfer});
    editor.dispatchEvent(event);
    return event.defaultPrevented&&editor.innerHTML===before;
   });
   assert.ok(dropBlocked,'formatted HTML drops must not invoke native rich-text insertion');
   await miniToolbar.locator('[data-word-menu-close]').click();
   assert.ok(await miniToolbar.isHidden());assert.ok(await wordRibbon.isVisible(),'closing context menu restores the single ribbon');
   assert.ok(await wordRibbon.locator('[data-paper="word-link"]').isVisible());
   await wordRibbon.locator('[data-word-format="italic"]').click();
   await wordRibbon.locator('[data-word-format="underline"]').click();
   // A desktop color picker steals focus: the highlighted word must be
   // retained while choosing a new color, not silently dropped.
   const customInk=wordRibbon.locator('#paper-word-custom-color');
   await customInk.dispatchEvent('pointerdown',{bubbles:true,pointerType:'mouse'});
   await customInk.evaluate(input=>{input.value='#0c8d53';input.dispatchEvent(new Event('input',{bubbles:true}));});
   assert.ok((await page.locator('#paper-rich-editor').innerHTML()).includes('color:#0c8d53'),'desktop color picker changes selected words after it receives focus');
   await page.locator('#paper-rich-editor').dispatchEvent('contextmenu',{bubbles:true,cancelable:true,clientX:140,clientY:235});
   assert.ok(await miniToolbar.isVisible(),'right-click works on rich text after formatting');
   await miniToolbar.locator('[data-word-menu-color="#dc4343"]').click();
   assert.ok((await page.locator('#paper-rich-editor').innerHTML()).includes('color:#dc4343'),'mini toolbar changes only the selected word color');
   assert.ok(await wordRibbon.isHidden());
   await miniToolbar.locator('[data-word-menu-close]').click();
   await page.locator('#paper-word-size').fill('19');
   await page.locator('#paper-word-size').press('Tab');
   assert.ok((await page.locator('#paper-rich-editor').innerHTML()).includes('font-size:19px'),'exact size is visible while editing');
   await wordRibbon.locator('[data-paper="word-link"]').click();
   const wordLinkDialog=page.getByRole('dialog').filter({hasText:'เชื่อมคำกับเว็บหรือไฟล์'});
   assert.equal(await wordLinkDialog.locator('blockquote').innerText(),'Word');
   assert.ok(await wordLinkDialog.locator('[name="kind"] option[value="upload"]').count(),'file attachment is still supported for selected words');
   await wordLinkDialog.locator('[name="address"]').fill('https://example.org/word');
   await wordLinkDialog.getByText('บันทึกลิงก์').click();
   await click('save');
   const wordNote=()=>row.payload.notebook.notes.find(n=>n.course==='POL2200'&&n.session===Number(wordSession));
   await wait(()=>!!wordNote()?.paper?.pages?.[0]?.objects?.some(o=>o.type==='text'&&o.marks?.length&&o.links?.length));
   const wordObject=wordNote().paper.pages[0].objects.find(o=>o.type==='text');
   assert.equal(wordObject.marks[0].size,19);
   assert.equal(wordObject.marks[0].bold,true);
   assert.equal(wordObject.marks[0].italic,true);
   assert.equal(wordObject.marks[0].underline,true);
   assert.equal(wordObject.marks[0].color,'#dc4343','selected word color saved');
   assert.equal(wordObject.marks[0].start,0);
   assert.equal(wordObject.marks[0].end,4,'color does not spread to unselected words');
   assert.equal(wordObject.links[0].url,'https://example.org/word');
   await page.reload();await page.locator('#paper-svg').waitFor();
   assert.ok(await page.locator('#paper-svg [data-word-link]').count(),'word link must survive reload alongside formatting');
   assert.ok(await page.locator('#paper-svg span[style*="font-weight:700"]').count(),'individual word style must survive reload');
   assert.ok(await page.locator('#paper-svg span[style*="color:#dc4343"]').count(),'per-word color survives reload');
   await page.screenshot({path:'test-results/notebook-word-format-'+name+'.png'});

   // Scribble is inside the Text tool's contextual controls. A phone
   // intentionally reopens in Hand mode, so explicitly choose Text first.
   // Scribble quick keys must insert literal whitespace/newlines and format
   // the same text object, both on iPad-like and touch/mobile layouts.
   if(mobile)await click('text');
   await click('scribble-text');
   const pencilPanel=page.locator('.paper-scribble-panel');
   const pencilInput=pencilPanel.locator('.paper-scribble-input');
   assert.ok(await pencilPanel.isVisible(),'Scribble handwriting input should open');
   assert.equal(await pencilPanel.locator('.paper-scribble-preview').count(),0,'the paper already displays formatted text, so no redundant preview');
   assert.ok(await pencilPanel.locator('.paper-keyboard-input').isHidden(),'keyboard field stays hidden during Apple Pencil handwriting');
   await pencilInput.fill('ทดสอบแป้นพิมพ์');
   await pencilPanel.locator('[data-pencil-keyboard]').click();
   const keyboardInput=pencilPanel.locator('.paper-keyboard-input');
   assert.ok(await keyboardInput.isVisible(),'keyboard button opens a separate keyboard-enabled field on iPad Safari');
   assert.equal(await keyboardInput.getAttribute('inputmode'),'text');
   assert.equal(await keyboardInput.evaluate(el=>document.activeElement===el),true,'tap directly focuses the keyboard-enabled textarea');
   assert.equal(await keyboardInput.inputValue(),'ทดสอบแป้นพิมพ์','switching to keyboard retains existing handwriting');
   await keyboardInput.fill('พิมพ์ด้วยคีย์บอร์ด');
   await pencilPanel.locator('[data-pencil-keyboard]').click();
   assert.ok(await pencilInput.isVisible(),'back to Pencil keeps the native handwriting field');
   assert.equal(await pencilInput.inputValue(),'พิมพ์ด้วยคีย์บอร์ด','text survives switching back and forth');
   for(const key of ['backspace','space','enter'])
    assert.ok(await pencilPanel.locator('[data-pencil-edit="'+key+'"]').isVisible(),key+' shortcut is available beside keyboard');
   await pencilInput.fill('ตัวอย่าง');
   await pencilInput.evaluate(el=>el.setSelectionRange(el.value.length,el.value.length));
   await pencilPanel.locator('[data-pencil-edit="space"]').click();
   await pencilPanel.locator('[data-pencil-edit="enter"]').click();
   assert.equal(await pencilInput.inputValue(),'ตัวอย่าง \n','space and Enter insert actual whitespace');
   await pencilPanel.locator('[data-pencil-edit="backspace"]').click();
   assert.equal(await pencilInput.inputValue(),'ตัวอย่าง ','backspace removes the preceding newline');
   await pencilInput.evaluate(el=>el.setSelectionRange(0,el.value.indexOf(' ')));
   await pencilPanel.locator('[data-pencil-format="bold"]').click();
   assert.ok(await page.locator('#paper-svg span[style*="font-weight:700"]').count(),'selected Scribble text renders bold on the actual paper');
   await pencilInput.evaluate(el=>el.setSelectionRange(el.value.length,el.value.length));
   await pencilPanel.locator('[data-pencil-format="italic"]').click();
   await pencilPanel.locator('[data-pencil-format="underline"]').click();
   await pencilPanel.locator('[data-pencil-color="#dc4343"]').click();
   await pencilPanel.locator('[data-pencil-edit="space"]').click();
   await pencilInput.evaluate(el=>{
    el.setRangeText('ใหม่',el.selectionStart,el.selectionEnd,'end');
    el.dispatchEvent(new Event('input',{bubbles:true}));
   });
   assert.equal(await pencilInput.inputValue(),'ตัวอย่าง  ใหม่');
   assert.ok(await page.locator('#paper-svg span[style*="color:#dc4343"]').count(),'newly typed colored text appears directly on the paper');
   await pencilPanel.locator('[data-pencil-finish]').click();
   await click('save');
   await wait(()=>row.payload.notebook.notes.some(n=>n.paper?.pages?.some(p=>p.objects.some(o=>o.type==='text'&&o.text==='ตัวอย่าง  ใหม่'))));
   const pencilSaved=row.payload.notebook.notes.flatMap(n=>n.paper?.pages?.flatMap(p=>p.objects)||[]).find(o=>o.type==='text'&&o.text==='ตัวอย่าง  ใหม่');
   assert.ok(pencilSaved.marks?.some(m=>m.bold&&m.start===0),'selected bold text is saved with original text');
   assert.ok(pencilSaved.marks?.some(m=>m.italic&&m.underline&&m.color==='#dc4343'),'Scribble typing styles are persisted');

  await page.evaluate(()=>{location.hash='#home';});
  await page.locator('.start-card').waitFor();
  const sideNotebook=page.locator('#navigation a[href="#notes"]');
  const notebookEntry=await sideNotebook.isVisible()?sideNotebook:page.locator('#bottom-nav a[href="#notes"]');
  await notebookEntry.click();
  await page.locator('.hub-tabs a[href="#classroom"]').click();
  await page.locator('.classroom-grid').waitFor();
  assert.ok(await page.locator('.hub-tabs a[href="#classroom"][aria-current="page"]').isVisible());
  await page.locator('.hub-tabs a[href="#notes"]').click();
  await page.locator('.hub-tabs a[href="#notes"][aria-current="page"]').waitFor();

  await page.route('**/rest/v1/ru_pol2106_bank*',route=>route.fulfill({status:503,body:''}));
  await page.route('**/rest/v1/ru_pol2106_answers*',route=>route.fulfill({json:[]}));
  await page.evaluate(()=>{
   const bank=Array.from({length:700},(_,i)=>({s:1+Math.floor(i/100),n:1+i%100,stem:'คำถามทดสอบ '.repeat(30),options:['ก','ข','ค','ง','จ'],k:1,p:2}));
   localStorage.setItem('pol2106-private-v1',JSON.stringify(bank));
   location.hash='#practice/POL2106';
  });
  await page.locator('#exam-reader #next').click();
  assert.equal(await page.locator('#counter').innerText(),'ข้อ 2 / 100');
  assert.equal(await page.locator('#choices .choice').count(),5);
  assert.ok(await page.locator('#bottom-nav').isVisible()||await page.locator('#navigation').isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#exam-reader .back-link').click();
  await page.locator('.exam-timeline').waitFor();


  // Regress the real debt plan markup on a narrow viewport: columns must
  // swipe inside the monthly card rather than be clipped by details overflow.
  await page.evaluate(async()=>{
   const {updatedPage}=await import('/debt-update.js?v=20261123-debt-mobile-scroll-v2');
   const input=['2030-05-01',60000,10000,[['Fixed','',35000,0,[10000,25000],0,'',0,'','',0],['One-off','',32000,0,[0,32000],0,'',0,'','',0],['Variable','',120000,6000,[],0,'example',700,'y','',0]],'Example only'];
   const token='p2.'+btoa(JSON.stringify(input)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
   const html=updatedPage({getItem:()=>null},token,false);
   const fixture=document.createElement('main');
   fixture.id='debt-scroll-fixture';
   fixture.style.cssText='width:min(100%,360px);margin:0 auto;padding:0 8px;box-sizing:border-box';
   fixture.innerHTML=html;
   document.body.replaceChildren(fixture);
  });
  const debtMonth=page.locator('.debt-month').first();
  await debtMonth.evaluate(el=>el.open=true);
  const debtScroller=debtMonth.locator('.debt-month-scroll');
  const debtGeometry=await debtScroller.evaluate(el=>({
   width:el.clientWidth,content:el.scrollWidth,overflow:getComputedStyle(el).overflowX,
   tableWidth:el.querySelector('table').getBoundingClientRect().width
  }));
  assert.equal(debtGeometry.overflow,'auto','monthly plan has a dedicated horizontal scroll region');
  if(mobile){
   assert.ok(debtGeometry.content>debtGeometry.width+150,'all debt columns remain reachable with horizontal swipe on iPhone');
   const moved=await debtScroller.evaluate(el=>{el.scrollLeft=el.scrollWidth;return el.scrollLeft;});
   assert.ok(moved>150,'dragging debt table horizontally is not locked by the surrounding card');
   assert.ok(await debtMonth.locator('.debt-scroll-hint').isVisible(),'mobile includes a swipe hint');
  }
  await page.screenshot({path:'test-results/debt-scroll-'+name+'.png'});

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
  assert.equal(await schedule.locator('.unified-replay').count(),12,
    'first week has five weekday skims and seven serious weekend clips');
   assert.equal(await schedule.locator('.unified-skim').count(),5);
   assert.equal(await schedule.locator('.unified-deep').count(),7);
   assert.ok(await schedule.getByText('09:00–10:15 · ดูจริงจัง').count(),'first Saturday POL2106 starts at 09:00');
   assert.ok(await schedule.getByText('20:00–20:40 · ทวนเบา ๆ').count(),'Friday initial skim remains at night after live POL2200');
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
  // Standalone HTML design lab must be interactive rather than a static mockup.
  await page.goto('http://127.0.0.1:3000/demo.html');
  await page.locator('#view-home.active').waitFor();
  await page.locator('[data-jump="notes"]').first().click();
  await page.locator('#view-notes.active').waitFor();
  await page.locator('[data-tool="table"]').click();
  await page.locator('#tableModal.open').waitFor();
  await page.locator('#rowsInput').fill('4');
  await page.locator('#rowsInput').press('Tab');
  await page.locator('#cellGrid textarea[data-r="0"][data-c="0"]').fill('นักคิด');
  await page.locator('#cellGrid textarea[data-r="1"][data-c="0"]').fill('เพลโต');
  await page.locator('#saveTable').click();
  assert.equal(await page.locator('#tableModal.open').count(),0);
  assert.equal(await page.locator('.paper-object.table-object').count(),2,
    'new table appears beside the sample table');
  await page.reload();
  await page.locator('#view-home.active').waitFor();
  await page.evaluate(()=>document.querySelector('[data-view="notes"]').click());
  assert.equal(await page.locator('.paper-object.table-object').count(),2,'preview stores tables across reloads');
  await page.evaluate(()=>document.querySelector('[data-view="schedule"]').click());
  await page.locator('#view-schedule.active').waitFor();
  await page.locator('[data-schedule-mode="light"]').first().click();
  assert.match(await page.locator('#lightCount').innerText(),/1/);
  await page.locator('[data-schedule-mode="deep"]').first().click();
  assert.match(await page.locator('#deepCount').innerText(),/1/);
  assert.match(await page.locator('#lightCount').innerText(),/1/,'light review is independent of deep watch');
  await page.screenshot({path:'test-results/interactive-demo-'+name+'.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log(name+': editor, text, vector ink, undo/redo, selection, images, pages, confirmation, offline save, cross-device sync, no remount, legacy original PASS');
 }catch(err){console.error(name,err);let shot=0;for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:'test-results/failure-'+name+'-'+shot+++'.png'}).catch(()=>{});process.exitCode=1;}
 finally{await browser.close();}
}
await new Promise(r=>server.close(r));
