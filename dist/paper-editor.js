import {confirmNoteDelete} from './note-delete-dialog.js?v=20261118-edit2';
import {PAGE_W,PAGE_H,emptyPage,uid,paperFor,imageLink,validatePaper,strokeObject,bounds,contains,inPolygon,strokeHit,pageHistory,copy,mergePaper,penWidth,highlightWidth,PEN_WIDTH_PRESETS,HIGHLIGHT_WIDTH_PRESETS} from './paper-core.js?v=20261121-paper-format';
import {pageSVG,objectSVG,esc} from './paper-render.js?v=20261121-paper-format';
import {imageHandles,resizeImage,cropImage} from './paper-images.js';
import {readAttachment,downloadAttachment} from './note-files.js';
import {replaceLink,moveLinks} from './word-links.js';
import {textSize,textColor,formattedTextHTML,normalizeMarks,toggleTextFormat,applyTextFormat,moveMarks} from './paper-rich-text.js?v=20261121-paper-format';
import {chooseWordTarget} from './word-link-dialog.js';
import {openNoteFile} from './file-viewer.js';
import {openSharedCourseMaterials,courseMaterialLabel} from './course-materials-ui.js?v=shared-course-20261120';
import {makeShape,resizeShape,eraserHit,isJoinable,snapLinePoint,snapMovedLine} from './paper-shapes.js?v=eraser-20261121';
import {recognizeHeldShape,recognizeDrawnShape,rulerProject,rulerSnap,rulerSVG} from './paper-geometry.js?v=20261121-safe-forms';
import {mountTableEditor} from './paper-table-ui.js?v=20261121-paper-format';
import {tableWithCells,tableGrid,tableStyle} from './paper-table.js?v=20261121-paper-format';
let active=null;
export function refreshPaper(space,id){return active?.id===id?active.refresh(space):false;}
export function mountPaper(space,id,{onLegacy=()=>{},startInk=false}={}){
 const root=document.querySelector('.paper-app');if(!root)return ()=>{};
 let note=space.notebook().notes.find(n=>n.id===id);if(!note)return ()=>{};
 let conversionWarning='';let initial;
 try{initial=paperFor(note);}
 catch(err){throw Error('อ่านหน้ากระดาษเดิมไม่สำเร็จ: '+(err?.message||'รูปแบบข้อมูลไม่รองรับ')+' · ไม่มีการลบหรือบันทึกทับต้นฉบับ');}
 let model=initial,pageId=model.pages[0].id,tool=startInk?'pen':'text',color='#172033',defaultTextColor='#172033',width=5,highlighterSize=12,fontSize=16,bold=false,finger=startInk,selected=new Set(),zoom=1,fit=1,scale=1,gesture=null,closed=false,raf=0,editing=null,unsaved=null,loadingImages=0;
 let multiSelect=false,wordSelection=null,lineStyle='solid',smartEnabled=true,smartTimer=0,lastTextTap=null;
 let lastSelectionSignature='';
 let ruler={active:false,x:PAGE_W/2,y:PAGE_H/2,angle:0,length:440,height:44};
 function cancelSmartTimer(){clearTimeout(smartTimer);smartTimer=0;}
 function scheduleSmartHold(g){
  cancelSmartTimer();g.snap=null;
  if(!smartEnabled||g.kind!=='stroke'||g.tool!=='pen'||g.rulerEdge||g.points.length<3)return;
  smartTimer=setTimeout(()=>{
   if(closed||gesture!==g)return;
   const found=recognizeHeldShape(g.points);
   if(found){g.snap=makeShape(uid(),found.kind,found.start,found.end,g.color,g.width,lineStyle);scheduleDraw();say('วาดเป็นรูปทรงแล้ว · ยกปากกาเพื่อบันทึก · ย้อนกลับได้');}
  },550);
 }
 let lastStored=JSON.stringify(note.paper||null),pendingRemote=false,draftBase=null;
 let cachedPage=null,cachedContent='',imageVersion=0,cachedImageVersion=-1;
 const scope=space.info().scope,images=new Map(),loading=new Set(),history=new Map(),events=[],pointers=new Map();
 const draftKey='ru-paper-draft:'+scope+':'+id;
 const widthKey='ru-paper-pen-width.v1:'+scope,highlightKey='ru-paper-highlight-width.v1:'+scope,pagesKey='ru-paper-pages-open.v1',textSizeKey='ru-paper-text-font-size.v2';
 const palmKey='ru-paper-palm-guard.v1',fingerKey='ru-paper-finger.v2';
 let palmGuard=false;finger=true;
 try{palmGuard=localStorage.getItem(palmKey)==='true';finger=!palmGuard&&localStorage.getItem(fingerKey)!=='false';}catch{}
 try{width=penWidth(localStorage.getItem(widthKey));}catch{/* unavailable device preference: keep 5 */}
 try{highlighterSize=highlightWidth(localStorage.getItem(highlightKey));}catch{/* keep 12 */}
 try{if(localStorage.getItem(pagesKey)==='1')root.classList.add('pages-open');}catch{/* default collapsed */}
 // Default new typed text to 16 pt on each note-opening session.
 const $=s=>root.querySelector(s),svg=$('#paper-svg'),sheet=$('#paper-sheet'),wrap=$('#paper-wrap'),viewport=$('#paper-viewport'),textarea=$('#paper-text-input');
 const bind=(el,type,fn,opts)=>{el.addEventListener(type,fn,opts);events.push(()=>el.removeEventListener(type,fn,opts));};
 const palmToggle=$('#paper-palm-guard');
 palmToggle.checked=palmGuard;root.classList.toggle('paper-palm-guard-on',palmGuard);
 const page=()=>model.pages.find(p=>p.id===pageId)||model.pages[0];
 const h=()=>{if(!history.has(pageId))history.set(pageId,pageHistory());return history.get(pageId);};
 const say=(text,bad=false)=>{const el=$('#paper-hint');el.textContent=text;el.classList.toggle('error',bad);};
 function setPalmGuard(value){
  palmGuard=!!value;palmToggle.checked=palmGuard;
  root.classList.toggle('paper-palm-guard-on',palmGuard);
  if(palmGuard){finger=false;$('#paper-finger').checked=false;pointers.clear();gesture=null;cancelSmartTimer();scheduleDraw();}
  try{localStorage.setItem(palmKey,String(palmGuard));}catch{}
  say(palmGuard?'กันฝ่ามือแล้ว · Apple Pencil เขียนได้ · ใช้ปุ่ม +/− เพื่อซูม':'ปิดกันฝ่ามือแล้ว · ใช้สองนิ้วซูมได้');
 }
 const currentNote=()=>space.notebook().notes.find(n=>n.id===id);
 const writable=()=>{const i=space.info();if(i.scope!==scope||!i.canEdit)throw Error('ยังเชื่อมต่อพื้นที่จดไม่ได้ กรุณารอหรือลองเชื่อมต่อใหม่');if(i.conflict)throw Error('มีการแก้พร้อมกัน เปิด “ข้อมูลและการซิงก์” เพื่อเลือกฉบับก่อน');};
 function persist(next,record=true){
  try{
   writable();const live=currentNote();if(!live)throw Error('โน้ตถูกลบจากอีกเครื่อง');
   next=validatePaper(next);const before=copy(page());
   if(draftBase)next=mergePaper(draftBase,next,paperFor(live));
   else if(JSON.stringify(live.paper||null)!==lastStored&&live.paper)next=mergePaper(model,next,live.paper);
   const book=copy(space.notebook()),target=book.notes.find(n=>n.id===id);target.paper=next;target.updatedAt=new Date().toISOString();
   space.saveNotebook(book);model=copy(next);lastStored=JSON.stringify(next);unsaved=null;draftBase=null;try{localStorage.removeItem(draftKey);}catch{}root.classList.remove('paper-has-draft');
   if(record){const after=model.pages.find(p=>p.id===before.id);if(after&&pageId===before.id)h().record(before,after);}
   if(!model.pages.some(p=>p.id===pageId))pageId=model.pages[0].id;
   say('บันทึกอัตโนมัติ · ปุ่มบันทึกงานใช้สั่งบันทึกทันที');draw();thumbs();return true;
  }catch(err){draftBase??=copy(model);unsaved=copy(next);try{localStorage.setItem(draftKey,JSON.stringify({paper:unsaved,base:draftBase}));}catch{}say(err.message+' · งานล่าสุดยังอยู่ในหน้านี้ กด “สำรองงานค้าง” ก่อนปิด',true);root.classList.add('paper-has-draft');return false;}
 }
 function change(fn){const next=copy(unsaved||model);fn(next.pages.find(p=>p.id===pageId),next);return persist(next);}
 function scheduleDraw(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw();});}
 function draw(){
  // Keep the settled page and controls mounted while only the live ink changes.
  if(gesture?.kind==='stroke'){
   let layer=svg.querySelector('[data-live-ink]');
   if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.setAttribute('data-live-ink','');layer.setAttribute('pointer-events','none');svg.append(layer);}
   layer.innerHTML=gesture.snap?objectSVG(gesture.snap,images):objectSVG(strokeObject(gesture.points,{tool:gesture.tool,color:gesture.color,width:gesture.width}),images);
   return;
  }
  const signature=[...selected].sort().join('|');
  if(signature!==lastSelectionSignature){$('#paper-selection-more').open=false;lastSelectionSignature=signature;}
  const p=page();if(cachedPage!==p||cachedImageVersion!==imageVersion){cachedContent=pageSVG(p,images);cachedPage=p;cachedImageVersion=imageVersion;}let content=cachedContent;
  if(editing&&scribbleActive){
   const preview={...editing.object,text:textarea.value,marks:editing.marks||[],links:editing.links||[],
    w:editing.paperWidth||editing.object.w,
    h:editing.paperHeight||editing.object.h};
   const objects=p.objects.some(o=>o.id===editing.id)
     ?p.objects.map(o=>o.id===editing.id?preview:o):[...p.objects,preview];
   content=pageSVG({...p,objects},images);
  }else if(editing)content=pageSVG({...p,objects:p.objects.filter(o=>o.id!==editing.id)},images);
  if(gesture?.kind==='shape'&&gesture.object)content+=objectSVG(gesture.object);
  const visible=gesture?.preview||p.objects;
  if(gesture?.preview)content=pageSVG({...p,objects:visible},images);
  const chosen=visible.filter(o=>selected.has(o.id)),box=bounds(chosen);
  if(chosen.length>1)for(const o of chosen)content+=`<rect x="${o.x-2}" y="${o.y-2}" width="${o.w+4}" height="${o.h+4}" fill="none" stroke="#7590fc" stroke-width="1" pointer-events="none"/>`;
  const singleImage=selected.size===1&&visible.find(o=>selected.has(o.id)&&o.type==="image");
   const singleShape=selected.size===1&&visible.find(o=>selected.has(o.id)&&o.type==="shape");
   const singleTable=selected.size===1&&visible.find(o=>selected.has(o.id)&&o.type==='table');
  if(box&&!editing)content+=`<rect x="${box.x-6}" y="${box.y-6}" width="${box.w+12}" height="${box.h+12}" fill="none" stroke="#3155d9" stroke-width="2" stroke-dasharray="7 5"/>${singleImage||singleShape?imageHandles(box,scale):`<rect data-resize="true" x="${box.x+box.w-9}" y="${box.y+box.h-9}" width="18" height="18" rx="4" fill="#3155d9"/>`}`;
  content+=rulerSVG(ruler);
  if(gesture?.kind==='lasso')content+=`<path d="${gesture.points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')}" fill="#3155d910" stroke="#3155d9" stroke-width="2" stroke-dasharray="6 4"/>`;
  svg.innerHTML=content;tableUI.sync(!multiSelect&&['select','text'].includes(tool)&&!gesture&&singleTable);svg.dataset.tool=tool;root.dataset.paperTool=tool;
  updateContextToolBar();
  $('#paper-page-label').textContent=`หน้า ${model.pages.findIndex(p=>p.id===pageId)+1} / ${model.pages.length}`;
  $('#paper-template').value=p.template;
  $('[data-paper="multi"]').setAttribute('aria-pressed',String(multiSelect));
  $('#paper-shape-options').hidden=activePanel!=='shape';
  $('#paper-line-options').hidden=activePanel!=='shape';
  const rulerButton=$('[data-paper="ruler"]');
  $('#paper-ruler-angles').hidden=!ruler.active;
  rulerButton.setAttribute('aria-pressed',String(ruler.active));
  rulerButton.textContent=ruler.active?'📏 ปิดไม้บรรทัด':'📏 เปิดไม้บรรทัด';
  root.querySelectorAll('[data-paper]').forEach(b=>{
   if(['pen','highlight','eraser','text','shape','select','hand','line','arrow','straighten'].includes(b.dataset.paper))
    b.setAttribute('aria-pressed',String(['line','arrow'].includes(b.dataset.paper)
     ?tool==='shape'&&$('#paper-shape').value===b.dataset.paper:tool===b.dataset.paper));
  });
  root.querySelectorAll('[data-paper-color]').forEach(b=>b.setAttribute('aria-pressed',String(color===b.dataset.paperColor)));
  const inkPicker=$('#paper-ink-custom');if(document.activeElement!==inkPicker)inkPicker.value=color;
   root.querySelectorAll('[data-shape-pick]').forEach(b=>b.setAttribute('aria-pressed',
    String(b.dataset.shapePick===$('#paper-shape').value)));

  $('[data-paper="undo"]').disabled=!h().canUndo; $('[data-paper="redo"]').disabled=!h().canRedo;
  const tools=$('#paper-selection-tools');tools.hidden=!selected.size||!!editing;$('#paper-selected-count').textContent=selected.size;
   $('#paper-table-selection').hidden=!singleTable;
   if(singleTable){const palette=tableStyle(singleTable);root.querySelectorAll('[data-table-style]').forEach(input=>{if(document.activeElement!==input)input.value=palette[input.dataset.tableStyle];});}
   const globalPicker=$('#paper-global-text-color');
   if(document.activeElement!==globalPicker)globalPicker.value=editing?.object?.color||visible.find(o=>selected.has(o.id)&&o.type==='text')?.color||singleTable?.textColor||defaultTextColor;
   const shapePanel=$('#paper-shape-selection');shapePanel.hidden=!singleShape;
   if(singleShape){$('#paper-fill-tools').hidden=isJoinable(singleShape);$('#paper-shape-fill').value=/^#[0-9a-f]{6}$/i.test(singleShape.fill)?singleShape.fill:singleShape.color;$('#paper-selected-shape').value=singleShape.kind;$('#paper-selected-line-style').value=singleShape.dash||singleShape.lineStyle||'solid';}
  const linkButton=$('[data-paper="image-link"]'),openLink=$('#paper-open-link');
  linkButton.hidden=!singleImage;linkButton.textContent=singleImage?.link?'แก้ลิงก์':'ใส่ลิงก์';
  openLink.hidden=!singleImage?.link;
  if(singleImage?.link)openLink.href=singleImage.link;else openLink.removeAttribute('href');
  $('[data-paper="crop"]').hidden=!singleImage;
  const texts=p.objects.filter(o=>selected.has(o.id)&&o.type==='text');$('[data-paper="edit-text"]').hidden=texts.length!==1;$('#paper-font-size').parentElement.hidden=!texts.length;$('[data-paper="bold"]').hidden=!texts.length;
  const alignGroup=$('#paper-align');
  const alignHost=editing?ribbon:tools;
  if(alignGroup.parentElement!==alignHost)alignHost.prepend(alignGroup);
  alignGroup.hidden=!editing&&!texts.length;
  if(!editing)for(const button of alignGroup.children)button.setAttribute('aria-pressed',String(texts.length>0&&texts.every(t=>(t.align||'left')===button.dataset.textAlign)));
  else textRibbonState();
  if(document.activeElement!==$('#paper-font-size'))$('#paper-font-size').value=Math.round(texts[0]?.size||fontSize);
  $('#paper-default-text-size').value=fontSize;
  loadImages();
 }
 function thumbs(){
  if(!root.classList.contains('pages-open'))return;
  $('#paper-page-list').innerHTML=model.pages.map((p,i)=>{
   let thumb='';
   try{thumb=pageSVG(p,images,'thumb-'+p.id);}
   catch(err){thumb='<text x="20" y="80" font-size="26">รูปตัวอย่างไม่พร้อม</text>';}
   return `<button class="paper-thumb ${p.id===pageId?'active':''}" data-paper-page="${p.id}" aria-label="หน้า ${i+1}" aria-current="${p.id===pageId?'page':'false'}"><svg viewBox="0 0 ${PAGE_W} ${PAGE_H}" aria-hidden="true">${thumb}</svg><span>${i+1}</span></button>`;
  }).join('');
 }
 function loadImages(){
  for(const o of page().objects){if(o.type!=='image'||images.has(o.imageId)||loading.has(o.imageId))continue;loading.add(o.imageId);
   space.image(o.imageId).then(blob=>{if(closed)return;images.set(o.imageId,URL.createObjectURL(blob));imageVersion++;scheduleDraw();thumbs();}).catch(()=>{if(!closed)say('โหลดรูปบางรูปไม่สำเร็จ ลองเชื่อมต่อใหม่',true);}).finally(()=>loading.delete(o.imageId));
  }
 }
 function sizing(){fit=Math.min(1,Math.max(.2,(viewport.clientWidth-48)/PAGE_W));scale=fit*zoom;wrap.style.width=PAGE_W*scale+'px';wrap.style.height=PAGE_H*scale+'px';sheet.style.transform=`scale(${scale})`;$('#paper-zoom').textContent=Math.round(zoom*100)+'%';}
 function zoomAt(next,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const old=scale,x=(viewport.scrollLeft+cx)/old,y=(viewport.scrollTop+cy)/old;zoom=Math.min(4,Math.max(.5,next));sizing();viewport.scrollLeft=x*scale-cx;viewport.scrollTop=y*scale-cy;}
 function point(e){const r=svg.getBoundingClientRect();return {x:Math.max(0,Math.min(PAGE_W,(e.clientX-r.left)/r.width*PAGE_W)),y:Math.max(0,Math.min(PAGE_H,(e.clientY-r.top)/r.height*PAGE_H))};}
 function syncPenWidthControls(){
  const highlight=tool==='highlight',value=highlight?highlighterSize:width;
  const slider=$('#paper-width'),preview=$('#paper-pen-preview');
  slider.max=highlight?'40':'12';
  slider.value=String(value);
  slider.setAttribute('aria-label',highlight?'ปรับความหนาไฮไลท์':'ปรับความหนาปากกา');
  $('#paper-width-value').textContent=String(value);
  $('#paper-width-mobile-value').textContent=String(value);
  $('#paper-size-label').textContent=highlight?'ความหนาไฮไลท์ (1–40) · เลือกขนาดหรือเลื่อนแถบ':'ความหนาปากกา (1–12) · เลือกขนาดหรือเลื่อนแถบ';
  const toggle=$('[data-paper-size-toggle]');toggle.title=highlight?'ปรับความหนาไฮไลท์':'ปรับความหนาปากกา';
  const presets=highlight?HIGHLIGHT_WIDTH_PRESETS:PEN_WIDTH_PRESETS;
  root.querySelectorAll('[data-paper-width]').forEach((button,index)=>{
   const size=presets[index];button.dataset.paperWidth=String(size);
   button.setAttribute('aria-label',(highlight?'ไฮไลท์':'ปากกา')+' ขนาด '+size);
   button.title=(highlight?'ไฮไลท์':'ปากกา')+' ขนาด '+size;
   button.setAttribute('aria-pressed',String(size===value));
   const dot=button.querySelector('span');
   if(dot){dot.style.width=Math.max(3,Math.min(20,highlight?size*.5:size+2))+'px';dot.style.height=Math.max(3,Math.min(20,highlight?size*.5:size+2))+'px';dot.style.borderRadius=highlight?'3px':'50%';}
  });
  preview.style.width=highlight?'22px':value+'px';
  preview.style.height=(highlight?Math.max(3,Math.min(20,value*.5)):value)+'px';
  preview.style.borderRadius=highlight?'3px':'50%';
  preview.style.background=highlight?'#f4cd45':'#172033';
 }
 function updatePenWidth(value){
  if(tool==='highlight'){
   highlighterSize=highlightWidth(value,highlighterSize);
   try{localStorage.setItem(highlightKey,String(highlighterSize));}catch{}
  }else{
   width=penWidth(value,width);
   try{localStorage.setItem(widthKey,String(width));}catch{}
  }
  syncPenWidthControls();
 }
 function setPagesOpen(value){
  root.classList.toggle('pages-open',!!value);
  if(value)try{thumbs();}catch(err){say('เปิดรายการหน้าแล้ว แต่รูปตัวอย่างบางหน้าไม่พร้อม: '+err.message,true);}
  const toggle=$('[data-paper="pages"]');toggle.setAttribute('aria-expanded',String(!!value));
  toggle.setAttribute('aria-label',value?'ซ่อนรายการหน้ากระดาษ':'แสดงรายการหน้ากระดาษ');
  toggle.textContent=value?'▤ ซ่อนหน้า':'▤ หน้า';
  try{localStorage.setItem(pagesKey,value?'1':'0');}catch{}
  sizing();
 }
 function closePenSizePicker(){
  const picker=$('.paper-pen-sizes'),toggle=$('[data-paper-size-toggle]');
  picker?.classList.remove('is-open');
  if(toggle)toggle.setAttribute('aria-expanded','false');
 }
 function closeExtraTools(){const menu=$('#paper-toolbar-more');if(menu)menu.open=false;}
 function setShapesOpen(open){
  const panel=$('#paper-shapes-popup');panel.hidden=!open;
  if(open){
   const anchor=$('[data-paper="shape"]').getBoundingClientRect();
   panel.style.left=Math.max(8,Math.min(anchor.left,window.innerWidth-360))+'px';
   panel.style.top=Math.max(8,Math.min(anchor.bottom+6,window.innerHeight-250))+'px';
  }
 }
 function setTool(next){
  branchMode=false;branchTool.setAttribute("aria-pressed","false");
  cancelSmartTimer();closePenSizePicker();finishText();pointers.clear();gesture=null;
  activePanel=['line','arrow','branch3'].includes(next)?'shape':next;
  if(next==='line'||next==='arrow'||next==='branch3'){
   $('#paper-shape').value=next;tool='shape';
  }else tool=next;
  closeExtraTools();setShapesOpen(false);
  if(next!=='select')multiSelect=false;
  if(!['select','text'].includes(tool))selected.clear();
  syncPenWidthControls();showTextRibbon();
  say(({shape:'เลือกชนิดรูปทรงจากไอคอน แล้วลากบนกระดาษ',
   straighten:'วาดวงกลม วงรี สี่เหลี่ยม หรือเส้นตรง แล้วปล่อยปากกาเพื่อจัดรูปทรง · ถ้าไม่ตรงรูปทรงจะเก็บลายเส้นเดิม',
   pen:'ใช้ปากกาเขียน · เปิดนิ้วเขียนหากต้องการ',
   highlight:'ลากเพื่อไฮไลต์',eraser:'ลากผ่านเส้นเพื่อลบทั้งเส้น',
   select:'คลิกเพื่อเลือก · ดับเบิลคลิกข้อความเพื่อแก้ทันที',
   text:'คลิกข้อความเดิมเพื่อแก้ · คลิกพื้นที่ว่างเพื่อสร้างใหม่',
   hand:'ลากเพื่อเลื่อน · สองนิ้วเพื่อซูมเมื่อปิดกันฝ่ามือ'})[tool]);draw();
 }
 const textMeasure=document.createElement('span');
 Object.assign(textMeasure.style,{position:'absolute',visibility:'hidden',pointerEvents:'none',whiteSpace:'pre',width:'max-content',maxWidth:'none',left:'0',top:'0'});
 const measureClip=document.createElement('div');
 Object.assign(measureClip.style,{position:'absolute',width:'0',height:'0',overflow:'hidden'});
 measureClip.append(textMeasure);sheet.append(measureClip);
 const ribbon=$('#paper-text-ribbon'),wordMenu=$('#paper-word-menu'),rich=document.createElement('div');
 // Restore one familiar tool row. Move drawing colors out of the advanced
 // dropdown so pen/highlighter colors cannot be hidden by a clipped menu.
 const mainTools=$('.paper-toolset');
 // Use a contextual settings strip, not a nested options popup. Keep the
 // actual controls and IDs intact so their existing event bindings survive.
 const contextWrap=document.createElement('div');
 contextWrap.className='paper-context-wrap';contextWrap.hidden=true;
 const contextBar=document.createElement('div');
 contextBar.className='paper-context-controls';contextBar.setAttribute('role','toolbar');
 contextBar.setAttribute('aria-label','การตั้งค่าของเครื่องมือที่เลือก');
 contextWrap.append(contextBar);
 root.querySelector('.paper-toolbar').after(contextWrap);
 let activePanel=tool;
 const settingsRow=(name,label)=>{const node=document.createElement('div');node.className='paper-context-section paper-context-'+name;node.hidden=true;node.setAttribute('aria-label',label);contextBar.append(node);return node;};
 const inkOptions=settingsRow('ink','สีและความหนาเส้น');
 const pencilOptions=settingsRow('pencil','การเขียนด้วยปากกา');
 const shapeOptions=settingsRow('shape','การเลือกและปรับรูปทรง');
 const textOptions=settingsRow('text','การพิมพ์ข้อความ');
 const pageOptions=settingsRow('page','แบบหน้ากระดาษ');
 const selectOptions=settingsRow('select','การเลือกวัตถุ');
 const rulerOptions=settingsRow('ruler','องศาไม้บรรทัด');
 const mainSettings=document.createElement('button');
 mainSettings.type='button';mainSettings.dataset.paper='page-settings';
 mainSettings.textContent='▤ กระดาษ';mainSettings.className='paper-main-settings-button';
 mainTools.append($('[data-paper="ruler"]'),mainSettings);
 inkOptions.hidden=false;
 shapeOptions.append($('#paper-shape-options'),$('#paper-line-options'));
 const shapeGallery=document.createElement('button');shapeGallery.type='button';shapeGallery.dataset.openShapes='context';
 const branchTool=document.createElement('button');branchTool.type='button';branchTool.textContent='เส้นแตกกิ่ง ↳';
 branchTool.setAttribute('title','ลากทีละเส้นในแนวตั้งหรือแนวนอน เริ่มกิ่งใหม่ตรงเส้นเดิม');
 shapeOptions.append(branchTool);
 let branchMode=false;
 bind(branchTool,'click',()=>{setTool('line');branchMode=true;branchTool.setAttribute('aria-pressed','true');say('ลากเส้นหลัก แล้วลากกิ่งจากจุดใดก็ได้บนเส้น');});
 function lineEnd(g,p){
  if(!g.axis)return g.join?snapLinePoint(p,page().objects,10/scale):p;
  const horizontal=Math.abs(p.x-g.start.x)>=Math.abs(p.y-g.start.y);
  const projected=horizontal?{x:p.x,y:g.start.y}:{x:g.start.x,y:p.y};
  const snapped=snapLinePoint(projected,page().objects,10/scale);
  return horizontal?{x:snapped.x,y:g.start.y}:{x:g.start.x,y:snapped.y};
 }
 shapeGallery.textContent='▱ รูปทรงทั้งหมด';shapeOptions.prepend(shapeGallery);
 pencilOptions.append($('.paper-finger'),$('.paper-palm-guard'),$('.paper-geometry-check'));
 textOptions.append($('.paper-default-text-size'),$('.paper-global-ink'),$('[data-paper="scribble-text"]'));
 pageOptions.append($('.paper-template-tool'));
 selectOptions.append($('[data-paper="multi"]'));
 rulerOptions.append($('#paper-ruler-angles'));
 $('#paper-ruler-angles').insertAdjacentHTML('beforeend','<label class="paper-angle-input">องศา <input id="paper-ruler-angle" type="number" min="0" max="359" step="1" value="0" aria-label="องศาไม้บรรทัด"></label>');
 bind($('#paper-ruler-angle'),'change',event=>{
  const n=Number(event.target.value);
  if(!Number.isFinite(n)){event.target.value=String(ruler.angle);return;}
  ruler.angle=((Math.round(n)%360)+360)%360;
  ruler.active=true;activePanel='ruler';draw();
 });
 const oldAdvanced=$('#paper-toolbar-more');oldAdvanced.hidden=true;oldAdvanced.open=false;
 const mainPrev=document.createElement('button'),mainNext=document.createElement('button');
 for(const [el,d,label] of [[mainPrev,-1,'เลื่อนเครื่องมือไปทางซ้าย'],[mainNext,1,'เลื่อนเครื่องมือไปทางขวา']]){
  el.type='button';el.className='paper-strip-arrow';el.textContent=d<0?'‹':'›';el.setAttribute('aria-label',label);
  bind(el,'click',()=>mainTools.scrollBy({left:d*225,behavior:'smooth'}));
 }
 mainTools.before(mainPrev);mainTools.after(mainNext);
 const optsPrev=document.createElement('button'),optsNext=document.createElement('button');
 for(const [el,d,label] of [[optsPrev,-1,'เลื่อนการตั้งค่าไปทางซ้าย'],[optsNext,1,'เลื่อนการตั้งค่าไปทางขวา']]){
  el.type='button';el.className='paper-strip-arrow';el.textContent=d<0?'‹':'›';el.setAttribute('aria-label',label);
  bind(el,'click',()=>contextBar.scrollBy({left:d*250,behavior:'smooth'}));
 }
 contextWrap.prepend(optsPrev);contextWrap.append(optsNext);
 function updateContextToolBar(){
  const showInk=['pen','highlight','shape','straighten'].includes(activePanel);
  inkOptions.hidden=!showInk;
  pencilOptions.hidden=!['pen','highlight','eraser','straighten'].includes(activePanel);
  $('.paper-geometry-check').hidden=!['pen','straighten'].includes(activePanel);
  shapeOptions.hidden=activePanel!=='shape';
  textOptions.hidden=activePanel!=='text';
  pageOptions.hidden=activePanel!=='page';
  selectOptions.hidden=activePanel!=='select';
  rulerOptions.hidden=activePanel!=='ruler'||!ruler.active;
  ribbon.hidden=activePanel!=='text'||!editing;
  inkBar.hidden=!showInk;
  contextWrap.hidden=[inkOptions,pencilOptions,shapeOptions,textOptions,pageOptions,selectOptions,rulerOptions,ribbon].every(el=>el.hidden);
  $('#paper-shape-options').hidden=activePanel!=='shape';
  $('#paper-line-options').hidden=activePanel!=='shape';
  const angleInput=$('#paper-ruler-angle');
  if(document.activeElement!==angleInput)angleInput.value=String(((ruler.angle%360)+360)%360);
 }
 // A temporary, native editable handwriting surface. The writing surface
 // never changes the selected object's ID or x/y page coordinates.
 let scribbleActive=false;
 const scribblePad=document.createElement('section');
 scribblePad.className='paper-scribble-panel';scribblePad.hidden=true;
 scribblePad.innerHTML='<header><b>✍️ เขียนในพื้นที่สีฟ้า · ข้อความไปยังกล่องเดิม</b><button type="button" data-pencil-ink>✎ กลับไปเขียนเส้น</button><button type="button" data-pencil-keyboard>⌨️ แป้นพิมพ์</button><button type="button" data-pencil-finish>✓ เสร็จสิ้น</button></header><textarea class="paper-scribble-input" lang="th" inputmode="none" spellcheck="false" aria-label="พื้นที่เขียนด้วย Apple Pencil ลงกล่องข้อความที่เลือก" placeholder="ใช้ Apple Pencil เขียนภายในพื้นที่นี้ หรือเปิดแป้นพิมพ์…"></textarea>';
 viewport.append(scribblePad);
 const scribbleInput=scribblePad.querySelector('textarea');
 function closeScribblePanel(){
  scribbleActive=false;scribblePad.hidden=true;
  root.classList.remove('paper-scribble-open');
 }
 function openScribblePanel(){
  if(!editing)return;
  scribbleActive=true;root.classList.add('paper-scribble-open');
  scribblePad.hidden=false;textarea.hidden=true;
  scribbleInput.value=textarea.value;
  scribbleInput.inputMode='none';
  scribblePad.querySelector('[data-pencil-keyboard]').textContent='⌨️ แป้นพิมพ์';
  fitTextBox();draw();
  scribbleInput.focus({preventScroll:true});
  const caret=scribbleInput.value.length;scribbleInput.setSelectionRange(caret,caret);
 }
 bind(scribblePad.querySelector('[data-pencil-ink]'),'click',()=>setTool('pen'));
 bind(scribbleInput,'input',()=>{
  if(!scribbleActive||!editing)return;
  const before=editing.lastText,next=scribbleInput.value;
  editing.links=moveLinks(editing.links,before,next);
  editing.marks=moveMarks(editing.marks,before,next);
  editing.lastText=next;textarea.value=next;
  fitTextBox();draw();
  clearTimeout(textTimer);textTimer=setTimeout(()=>finishText(true),700);
 });
 bind(scribblePad.querySelector('[data-pencil-keyboard]'),'click',event=>{
  const viaKeyboard=scribbleInput.inputMode!=='text';
  scribbleInput.inputMode=viaKeyboard?'text':'none';
  event.currentTarget.textContent=viaKeyboard?'✍️ กลับไปใช้ปากกา':'⌨️ แป้นพิมพ์';
  scribbleInput.blur();scribbleInput.focus({preventScroll:true});
 });
 bind(scribblePad.querySelector('[data-pencil-finish]'),'click',()=>{
  finishText();setTool('select');say('บันทึกข้อความไว้ที่กล่องเดิมแล้ว');
 });
 const inkBar=document.createElement('div');
 inkBar.className='paper-ink-bar';inkBar.setAttribute('role','toolbar');
 inkBar.setAttribute('aria-label','สีปากกาและขนาดเส้น');inkBar.hidden=true;
 inkBar.append($('.paper-colors'),$('.paper-pen-sizes'));
 const inkCustom=document.createElement('label');
 inkCustom.className='paper-ink-custom';
 inkCustom.innerHTML='สีอื่น <input type="color" id="paper-ink-custom" value="#172033" aria-label="กำหนดสีปากกาหรือไฮไลต์เอง">';
 inkBar.append(inkCustom);
 inkOptions.append(inkBar);
 contextBar.append(ribbon);
 // Explicit scroll controls make the Word ribbon operable even when iPadOS
 // intercepts a horizontal swipe during selection or Pencil input.
 ribbon.insertAdjacentHTML('afterbegin','<button type="button" class="paper-ribbon-scroll paper-ribbon-prev" data-ribbon-scroll="-1" aria-label="เลื่อนเครื่องมือข้อความไปทางซ้าย">‹</button>');
 ribbon.insertAdjacentHTML('beforeend','<button type="button" class="paper-ribbon-scroll paper-ribbon-next" data-ribbon-scroll="1" aria-label="เลื่อนเครื่องมือข้อความไปทางขวา">›</button>');
 bind(ribbon,'click',event=>{
  const button=event.target.closest('[data-ribbon-scroll]');
  if(button){event.preventDefault();ribbon.scrollBy({left:Number(button.dataset.ribbonScroll)*245,behavior:'smooth'});}
 });
 bind($('#paper-ink-custom'),'input',event=>{
  const next=textColor(event.target.value);
  if(!next)return;
  color=next;draw();say('เลือกสีปากกา '+next+' แล้ว · เริ่มเขียนได้เลย');
 });

 // Detect native on-screen keyboard viewport shrink and keep secondary UI
 // from covering the editable field. No note data is changed.
 const updateKeyboardClass=()=>{
  const vv=window.visualViewport;
  const occlusion=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
  const visible=occlusion>120;
  root.classList.toggle('paper-keyboard-visible',visible);
  root.style.setProperty('--paper-keyboard-inset',visible?Math.round(occlusion)+'px':'0px');
  if(visible&&editing)requestAnimationFrame(()=>{
   if(!closed&&editing){
    const field=scribbleActive?scribbleInput:editing.rich?rich:textarea;
    field?.scrollIntoView?.({block:'nearest',inline:'nearest'});
   }
  });
 };
 if(window.visualViewport){bind(window.visualViewport,'resize',updateKeyboardClass);bind(window.visualViewport,'scroll',updateKeyboardClass);}
 updateKeyboardClass();
 rich.id='paper-rich-editor';rich.contentEditable='true';rich.setAttribute('role','textbox');
 rich.setAttribute('aria-label','แก้ข้อความพร้อมตัวหนา ตัวเอียง ขีดเส้นใต้ และขนาดเฉพาะคำ');
 rich.spellcheck=false;rich.hidden=true;sheet.append(rich);
 let richSelection=null,wordMenuSelection=null,menuDrag=null,menuPosition=null;
 const menuBounds=()=>{const vv=window.visualViewport;return {left:vv?.offsetLeft||0,top:vv?.offsetTop||0,width:vv?.width||window.innerWidth,height:vv?.height||window.innerHeight};};
 const panel=$('#paper-selection-tools'),grip=document.createElement('button');grip.type='button';grip.className='paper-panel-grip';grip.textContent='⠿ ย้าย';grip.title='ลากเพื่อย้ายแผง · แตะสองครั้งเพื่อคืนตำแหน่ง';panel.prepend(grip);
 let drag=null,position=null;
 function place(x,y){
  const b=menuBounds();panel.classList.add('is-floating');
  const r=panel.getBoundingClientRect();position={x:Math.max(b.left+4,Math.min(x,b.left+b.width-r.width-4)),y:Math.max(b.top+4,Math.min(y,b.top+b.height-r.height-4))};
  panel.style.left=position.x+'px';panel.style.top=position.y+'px';
 }
 bind(grip,'pointerdown',e=>{e.preventDefault();const r=panel.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top};grip.setPointerCapture(e.pointerId);});
 bind(grip,'pointermove',e=>{if(drag?.id===e.pointerId)place(e.clientX-drag.x,e.clientY-drag.y);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])bind(grip,event,()=>{drag=null;});
 bind(grip,'dblclick',()=>{position=null;panel.classList.remove('is-floating');panel.style.removeProperty('left');panel.style.removeProperty('top');});
 const keepVisible=()=>{if(position&&!panel.hidden)place(position.x,position.y);};
 bind(window,'resize',keepVisible);if(window.visualViewport){bind(window.visualViewport,'resize',keepVisible);bind(window.visualViewport,'scroll',keepVisible);}
 bind($('#paper-font-size'),'focus',()=>{if(!position){const b=menuBounds();place(b.left+8,b.top+55);}else keepVisible();});
 function moveMenu(x,y){
  const b=menuBounds(),w=wordMenu.offsetWidth,h=wordMenu.offsetHeight;
  const left=Math.max(b.left+8,Math.min(x,b.left+b.width-w-8));
  const top=Math.max(b.top+8,Math.min(y,b.top+b.height-h-8));
  wordMenu.style.left=left+'px';wordMenu.style.top=top+'px';menuPosition={x:left,y:top};
 }
 function closeWordMenu(){wordMenu.hidden=true;wordMenuSelection=null;}
 function richOffsets(){
  const sel=window.getSelection();
  if(!sel?.rangeCount||!rich.contains(sel.anchorNode)||!rich.contains(sel.focusNode))return null;
  const count=(node,offset)=>{const r=document.createRange();r.selectNodeContents(rich);r.setEnd(node,offset);return r.toString().length;};
  const a=count(sel.anchorNode,sel.anchorOffset),b=count(sel.focusNode,sel.focusOffset);
  return {start:Math.min(a,b),end:Math.max(a,b)};
 }
 function selectRichOffsets(start,end){
  const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT),nodes=[];let node,total=0;
  while((node=walker.nextNode())){nodes.push({node,start:total,end:total+node.textContent.length});total+=node.textContent.length;}
  if(!nodes.length)return;
  const locate=n=>{for(const item of nodes)if(n<=item.end)return {node:item.node,offset:Math.max(0,n-item.start)};const last=nodes.at(-1);return {node:last.node,offset:last.node.textContent.length};};
  const a=locate(start),b=locate(end),range=document.createRange(),selection=window.getSelection();
  range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);selection.removeAllRanges();selection.addRange(range);
  richSelection={start,end};
 }
 function readRich(){
  let text='',parts=[];
  const append=(value,style)=>{if(!value)return;const from=text.length;text+=value;if(Object.keys(style).length)parts.push({start:from,end:text.length,...style});};
  const walk=(node,style)=>{
   if(node.nodeType===Node.TEXT_NODE){append(node.textContent||'',style);return;}
   if(node.nodeType!==Node.ELEMENT_NODE)return;
   if(node.tagName==='BR'){append('\n',style);return;}
   const s={...style},tag=node.tagName.toLowerCase(),css=node.style||{};
   if(tag==='b'||tag==='strong'||/^(bold|[6-9]00)$/.test(css.fontWeight||''))s.bold=true;
   if(tag==='i'||tag==='em'||css.fontStyle==='italic')s.italic=true;
   if(tag==='u'||(css.textDecorationLine||'').includes('underline'))s.underline=true;
   if(tag==='s'||tag==='strike'||(css.textDecorationLine||'').includes('line-through'))s.strike=true;
   if(css.fontSize){const size=textSize(parseInt(css.fontSize,10),null);if(size)s.size=size;}
   if(css.color){const ink=textColor(css.color);if(ink)s.color=ink;}
   if(css.display==='block'&&['left','center','right'].includes(css.textAlign))s.align=css.textAlign;
   const block=tag==='div'||tag==='p';
   if(block&&text&&!text.endsWith('\n'))append('\n',style);
   for(const child of node.childNodes)walk(child,s);
  };
  for(const child of rich.childNodes)walk(child,{});
  return {text,marks:normalizeMarks(parts,text.length)};
 }
 function textRibbonState(){
  const alignSelection=editing?(editing.rich?(richOffsets()||richSelection):{start:textarea.selectionStart,end:textarea.selectionEnd}):null;
  const alignMarks=editing?(editing.rich?readRich().marks:editing.marks||[]):[];
  const selectedAlign=alignSelection?.end>alignSelection?.start?alignMarks.find(m=>m.start<=alignSelection.start&&m.end>=alignSelection.end)?.align:null;
  for(const b of ribbon.querySelectorAll('[data-text-align]'))b.setAttribute('aria-pressed',String(b.dataset.textAlign===(selectedAlign||editing?.align||'left')));
  const range=editing?(editing.rich?(richOffsets()||richSelection):{start:textarea.selectionStart,end:textarea.selectionEnd}):null;
  const marks=editing?(editing.rich?readRich().marks:editing.marks||[]):[];
  const active=range?marks.find(m=>m.start<=range.start&&m.end>=Math.max(range.start+1,range.end)):null;
  const ink=active?.color||editing?.object?.color||color;
  for(const button of ribbon.querySelectorAll('[data-word-format]')){
   button.disabled=!editing;
   button.setAttribute('aria-pressed',String(!!active?.[button.dataset.wordFormat]));
  }
  for(const button of ribbon.querySelectorAll('[data-word-color]')){
   button.setAttribute('aria-pressed',String(button.dataset.wordColor.toLowerCase()===ink.toLowerCase()));
  }
  $('#paper-word-custom-color').value=textColor(ink,'#172033');
  $('#paper-word-size').value=active?.size||editing?.object?.size||fontSize;
  ribbon.querySelector('[data-paper="word-link"]').disabled=!editing;
  ribbon.querySelector('[data-paper="finish-text"]').hidden=!editing;
  ribbon.querySelector('.paper-ribbon-help').textContent=editing?'เลือกคำเพื่อจัดกึ่งกลาง เปลี่ยนสี/ขนาด หรือกด B I U':'แตะข้อความเพื่อแก้ · ใช้ ✍ เขียน→ตัวพิมพ์ สำหรับ Apple Pencil';
 }
 function showTextRibbon(){
  ribbon.hidden=activePanel!=='text'||!editing;
  textRibbonState();
 }
 // Word-style mini toolbar follows a real selection without changing the stored
 // text or its per-word format. This is shared by mouse right-click and touch.
 function currentWordSelection(){
  if(!editing)return null;
  const range=editing.rich?(richOffsets()||richSelection):{start:textarea.selectionStart,end:textarea.selectionEnd};
  if(!range||range.end<=range.start)return null;
  const text=editing.rich?readRich().text:textarea.value;
  if(range.end>text.length)return null;
  return {start:range.start,end:range.end,text};
 }
 function restoreMenuSelection(){
  if(!editing||!wordMenuSelection)return false;
  const {start,end}=wordMenuSelection;
  if(editing.rich){rich.focus();selectRichOffsets(start,end);}
  else{textarea.focus();textarea.setSelectionRange(start,end);}
  return true;
 }
 function showWordMenu(event){
  // On touch-first iPads, keep formatting in the scrollable top ribbon.
  // Do not create a second floating toolbar over the virtual keyboard.
  if(window.matchMedia('(pointer:coarse)').matches){closeWordMenu();return false;}
  const selection=currentWordSelection();
  if(!selection){closeWordMenu();return false;}
  wordMenuSelection={start:selection.start,end:selection.end};
  const marks=editing.rich?readRich().marks:editing.marks||[];
  const active=marks.find(m=>m.start<=selection.start&&m.end>=selection.end);
  const ink=textColor(active?.color||editing.object.color,'#172033');
  for(const b of wordMenu.querySelectorAll('[data-word-menu-align]'))b.setAttribute('aria-pressed',String(b.dataset.wordMenuAlign===(active?.align||editing.align||'left')));
  for(const b of wordMenu.querySelectorAll('[data-word-menu-format]'))
   b.setAttribute('aria-pressed',String(!!active?.[b.dataset.wordMenuFormat]));
  for(const b of wordMenu.querySelectorAll('[data-word-menu-color]'))
   b.setAttribute('aria-pressed',String(b.dataset.wordMenuColor.toLowerCase()===ink));
  $('#paper-word-menu-custom').value=ink;
  $('#paper-word-menu-size').value=String(active?.size||editing.object.size);
  wordMenu.hidden=false;
  const el=editing.rich?rich:textarea,rect=el.getBoundingClientRect();
  const box=wordMenu.getBoundingClientRect(),visual=window.visualViewport;
  const visualLeft=visual?.offsetLeft||0,visualTop=visual?.offsetTop||0;
  const visualRight=visualLeft+(visual?.width||window.innerWidth),visualBottom=visualTop+(visual?.height||window.innerHeight);
  const x=event?.clientX>0?event.clientX:rect.left+Math.min(70,rect.width/2);
  const y=event?.clientY>0?event.clientY:rect.top+Math.min(36,rect.height/2);
  const below=y+12,above=y-box.height-12;
  wordMenu.style.left=Math.max(visualLeft+8,Math.min(x,visualRight-box.width-8))+'px';
  wordMenu.style.top=Math.max(visualTop+8,Math.min(below+box.height<=visualBottom-8?below:above,visualBottom-box.height-8))+'px';
  if(menuPosition)moveMenu(menuPosition.x,menuPosition.y);
  return true;
 }
 function fitRichBox(){
  if(!editing?.rich)return;
  const {text,marks}=readRich(),o=editing.object,available=Math.max(1,PAGE_W-o.x);
  textMeasure.style.fontSize=o.size+'px';textMeasure.style.fontWeight=o.bold?'700':'400';
  textMeasure.style.width='max-content';textMeasure.style.maxWidth='none';textMeasure.style.whiteSpace='pre';
  textMeasure.innerHTML=formattedTextHTML({text,marks},esc,false,false);
  const hasInlineAlign=marks.some(m=>m.align);
  const width=Math.min(available,Math.max(editing.align||hasInlineAlign?(editing.alignWidth||o.w):32,textMeasure.offsetWidth+7));
  textMeasure.style.width=width+'px';textMeasure.style.maxWidth=width+'px';
  textMeasure.style.whiteSpace='pre-wrap';textMeasure.style.overflowWrap='anywhere';
  editing.paperWidth=width;
  editing.paperHeight=Math.min(Math.max(1,PAGE_H-o.y),Math.max(Math.ceil(o.size*1.5),textMeasure.offsetHeight));
  rich.style.width=Math.min(available,(editing.align||hasInlineAlign?width:Math.max(250,width)))+'px';
  rich.style.minHeight=Math.max(o.size*1.5,editing.paperHeight)+'px';
 }
 function activateRich(){
  if(!editing)return;
  if(editing.rich)return;
  const selection={start:textarea.selectionStart,end:textarea.selectionEnd};
  editing.rich=true;editing.lastText=textarea.value;
  const original={text:textarea.value,marks:editing.marks||[]};
  // Normalize old whole-object bold into range styling so individual words can be toggled.
  if(editing.object.bold){original.marks=applyTextFormat(original.marks,original.text,0,original.text.length,'bold',true);editing.object.bold=false;}
  editing.marks=original.marks;
  rich.innerHTML=formattedTextHTML(original,esc,false,false);
  rich.style.textAlign=editing.align||'left';rich.style.left=editing.object.x+'px';
  rich.style.top=editing.object.y+'px';
  rich.style.fontSize=editing.object.size+'px';rich.style.fontWeight='400';rich.style.color=editing.object.color;
  rich.hidden=false;textarea.hidden=true;
  
  fitRichBox();rich.focus();selectRichOffsets(selection.start,selection.end);textRibbonState();
 }
 function applyWordFormat(kind,value){
  if(!editing){
   if(kind==='color')color=textColor(value,color);
   else if(kind==='size'){
    fontSize=textSize(value,fontSize);
    $('#paper-default-text-size').value=String(fontSize);
    try{localStorage.setItem(textSizeKey,String(fontSize));}catch{}
   }else{say('คลิกข้อความบนกระดาษ แล้วลากเลือกคำที่ต้องการก่อน',true);return;}
   draw();showTextRibbon();return;
  }
  const selectedBefore=editing.rich?(richOffsets()||richSelection):{start:textarea.selectionStart,end:textarea.selectionEnd};
  if(!selectedBefore||selectedBefore.start===selectedBefore.end){
   say('ลากเลือกเฉพาะคำที่ต้องการก่อนเปลี่ยนรูปแบบหรือสี',true);return;
  }
  if(!editing.rich)activateRich();
  const before=readRich(),current=richOffsets();
  const range=current?.end>current?.start?current:richSelection||selectedBefore;
  if(!range||range.start===range.end)return;
  if(kind==='align'&&!editing.alignWidth)editing.alignWidth=Math.min(PAGE_W-editing.object.x,Math.max(editing.object.w,420));
  const marks=kind==='size'?applyTextFormat(before.marks,before.text,range.start,range.end,'size',textSize(value,editing.object.size)):
   kind==='color'?applyTextFormat(before.marks,before.text,range.start,range.end,'color',textColor(value,editing.object.color)):
   kind==='align'?applyTextFormat(before.marks,before.text,range.start,range.end,'align',value):
   toggleTextFormat(before.marks,before.text,range.start,range.end,kind);
  rich.innerHTML=formattedTextHTML({text:before.text,marks},esc,false,false);
  rich.focus();selectRichOffsets(range.start,range.end);editing.marks=marks;
  fitRichBox();textRibbonState();
  clearTimeout(textTimer);textTimer=setTimeout(()=>finishText(true),450);
 }
 function fitTextBox(){
  if(!editing)return;
  const o=editing.object;
  // Reset temporary measurements on every keystroke: stale widths must not stick.
  textMeasure.style.display='inline-block';textMeasure.style.width='max-content';
  textMeasure.style.maxWidth='none';textMeasure.style.whiteSpace='pre';
  textMeasure.style.overflowWrap='normal';textMeasure.style.lineHeight='1.5';
  textMeasure.textContent=textarea.value;
  const availableWidth=Math.max(1,PAGE_W-o.x);
  const width=Math.min(availableWidth,scribbleActive?Math.max(32,o.w):Math.max(editing.align?(editing.alignWidth||o.w):32,textMeasure.offsetWidth+5));
  editing.paperWidth=width;
  if(editing.mobile||scribbleActive){
   // Store the natural on-paper height, not the temporary interactive target.
   textMeasure.style.width=width+'px';textMeasure.style.maxWidth=width+'px';
   textMeasure.style.whiteSpace='pre-wrap';textMeasure.style.overflowWrap='anywhere';
   editing.paperHeight=Math.min(Math.max(1,PAGE_H-o.y),Math.max(o.h||0,Math.ceil(o.size*1.5),textMeasure.offsetHeight));
  }
  // Leave a wider editable target for Apple Pencil Scribble *without* storing
  // that extra whitespace as the object's final bounds.
  textarea.style.width=Math.min(availableWidth,(editing.align?width:Math.max(250,width)))+'px';
  textarea.style.overflowY='hidden';
  textarea.style.height='1px';
  const height=Math.min(Math.max(1,PAGE_H-o.y),Math.max(Math.ceil(o.size*1.5),textarea.scrollHeight));
  textarea.style.height=height+'px';
  if(textarea.scrollHeight>height)textarea.style.overflowY='auto';
 }
 function rememberWord(){
  if(!editing)return;
  const range=editing.rich?(richOffsets()||richSelection):{start:textarea.selectionStart,end:textarea.selectionEnd};
  const content=editing.rich?readRich().text:textarea.value;
  if(editing.rich&&range)richSelection=range;
  if(range&&range.end>range.start)wordSelection={pageId,id:editing.id,start:range.start,end:range.end,text:content};
  else wordSelection=null;
  textRibbonState();
 }
 async function linkWord(){
  if(editing)rememberWord();
  const range=wordSelection;
  if(!range||range.pageId!==pageId){say('เลือกคำในกล่องข้อความก่อน แล้วกดเชื่อมคำกับเว็บ/ไฟล์',true);return;}
  finishText();
  const findTarget=()=>page().objects.find(o=>o.id===range.id&&o.text===range.text);
  const object=findTarget();if(!object)return;
  const old=object.links?.find(link=>link.start<range.end&&link.end>range.start);
  const result=await chooseWordTarget(range.text.slice(range.start,range.end),old,currentNote().files||[]);
  if(!result||closed)return;
  if(!findTarget()||pageId!==range.pageId)throw Error('ข้อความเปลี่ยนแล้ว กรุณาเลือกคำอีกครั้ง');
  if(result.attachment)updateFiles(files=>[...files,result.attachment]);
  if(result.target?.fileId&&!currentNote().files?.some(f=>f.id===result.target.fileId))throw Error('ไม่พบไฟล์ที่เลือกแล้ว');
  if(change(p=>{const o=p.objects.find(o=>o.id===range.id);o.links=replaceLink(o.links||[],range.start,range.end,result.target);}))say(result.target?'แตะคำที่ขีดเส้นใต้เพื่อเปิด':'ลบลิงก์จากคำแล้ว');
  wordSelection=null;
 }
 // iPhone: enlarge the actual paper, keeping the caret on its original
 // coordinates instead of detaching the field into a floating dialog.
 function focusInlineText(o){
  if(!editing?.mobile)return;
  const targetScale=Math.min(1.45,Math.max(1,17/Math.max(10,o.size)));
  if(scale<targetScale)zoomAt(Math.min(4,targetScale/fit));
  viewport.scrollLeft=Math.max(0,(o.x-24)*scale);
  viewport.scrollTop=Math.max(0,(o.y-54)*scale);
 }
 function startText(o,caret=null,{wideArea=false}={}){
  closeWordMenu();finishText();wordSelection=null;richSelection=null;
  activePanel='text';
  editing={align:o.align,lastText:o.text,links:o.links||[],marks:o.marks||[],rich:false,id:o.id,before:copy(page()),fresh:!page().objects.some(x=>x.id===o.id),object:copy(o)};
  selected=new Set([o.id]);textarea.value=o.text;
  editing.mobile=window.matchMedia('(max-width:720px)').matches;
   if(editing.mobile){
    editing.view={zoom,left:viewport.scrollLeft,top:viewport.scrollTop};
    root.classList.add('paper-is-editing');
   }
   ribbon.hidden=false;
  $('#paper-word-size').value=o.size;
  Object.assign(textarea.style,{textAlign:o.align||'left',left:o.x+'px',top:o.y+'px',fontSize:o.size+'px',fontWeight:o.bold?'700':'400',color:o.color});textarea.hidden=false;
  const style=getComputedStyle(textarea);
  Object.assign(textMeasure.style,{fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,letterSpacing:style.letterSpacing});
  fitTextBox();draw();
  if(!wideArea){focusInlineText(o);textarea.focus({preventScroll:true});}
  const cursor=caret??textarea.value.length;textarea.setSelectionRange(cursor,cursor);
  if(o.marks?.length&&!wideArea)activateRich();
  textRibbonState();
  if(!wideArea&&!editing.mobile&&!editing.rich)textarea.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 let textTimer;
 function finishText(keepOpen=false){
  const wasScribble=scribbleActive;
  if(!keepOpen){closeWordMenu();closeScribblePanel();}
  clearTimeout(textTimer);
  if(!editing)return;
  const edit=editing;
  if(edit.rich)fitRichBox();
  const content=edit.rich?readRich():{text:textarea.value,marks:edit.marks||[]};
  const w=parseFloat(textarea.style.width),h=parseFloat(textarea.style.height);
  const o={...edit.object,color:edit.ink||edit.object.color,text:content.text,w:edit.paperWidth??w,h:edit.rich||edit.mobile||wasScribble?(edit.paperHeight||h):h};
  if(edit.align)o.align=edit.align;
  if(edit.links.length)o.links=edit.links;else delete o.links;
  if(content.marks.length)o.marks=content.marks;else delete o.marks;
  if(!keepOpen){
   editing=null;rich.hidden=true;textarea.hidden=true;richSelection=null;
   if(edit.mobile){
     root.classList.remove('paper-is-editing');
     if(edit.view){zoom=edit.view.zoom;sizing();viewport.scrollLeft=edit.view.left;viewport.scrollTop=edit.view.top;}
    }
   showTextRibbon();
  }
  if(edit.fresh&&!o.text.trim()){selected.clear();draw();return;}
  const unchanged=!edit.fresh&&o.text===edit.object.text&&o.w===edit.object.w&&o.h===edit.object.h&&o.align===edit.object.align&&o.bold===edit.object.bold&&o.color===edit.object.color&&JSON.stringify(o.marks||[])===JSON.stringify(edit.object.marks||[])&&JSON.stringify(o.links||[])===JSON.stringify(edit.object.links||[]);
  if(unchanged){if(!keepOpen)draw();return;}
  if(change(p=>{const i=p.objects.findIndex(v=>v.id===o.id);if(i>=0)p.objects[i]=o;else p.objects.push(o);})&&keepOpen){edit.object=o;edit.fresh=false;}
 }
 bind(textarea,'select',rememberWord);
 for(const linkButton of root.querySelectorAll('[data-paper="word-link"]'))bind(linkButton,'pointerdown',e=>{if(editing){rememberWord();e.preventDefault();}});
 bind(ribbon,'pointerdown',e=>{
   if(e.target.closest('button,input[type="color"]')&&editing)rememberWord();
   if(e.target.closest('button'))e.preventDefault();
  });
 bind(textarea,'input',()=>{
  if(editing&&!editing.rich){
   editing.links=moveLinks(editing.links,editing.lastText,textarea.value);
   editing.marks=moveMarks(editing.marks,editing.lastText,textarea.value);
   editing.lastText=textarea.value;
  }
  clearTimeout(textTimer);textTimer=setTimeout(()=>finishText(true),1200);fitTextBox();
 });
 bind(textarea,'blur',e=>{
  if(!closed&&!scribbleActive&&!editing?.rich&&!e.relatedTarget?.closest?.('.paper-text-ribbon,.paper-word-menu,.paper-scribble-panel')){rememberWord();finishText();}
 });
 bind(rich,'input',()=>{
  if(!editing?.rich)return;
  const current=readRich();editing.links=moveLinks(editing.links,editing.lastText,current.text);editing.lastText=current.text;
  richSelection=richOffsets();fitRichBox();textRibbonState();
  clearTimeout(textTimer);textTimer=setTimeout(()=>finishText(true),1200);
 });
  // Mouse selection opens the floating Word mini toolbar; right-click opens
 // the same menu. On iPad a long-press selection can be completed by touchend.
 for(const editor of [textarea,rich]){
  bind(editor,'contextmenu',e=>{if(showWordMenu(e))e.preventDefault();});
  bind(editor,'mouseup',e=>{if(e.button===0&&!e.sourceCapabilities?.firesTouchEvents)showWordMenu(e);});
  bind(editor,'touchend',()=>{rememberWord();});
 }
 bind(wordMenu,'pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
 const dragHandle=wordMenu.querySelector('.paper-word-menu-heading');
 bind(dragHandle,'pointerdown',e=>{
  if(e.target.closest('button')||e.button!==0)return;
  e.preventDefault();menuDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:wordMenu.offsetLeft,top:wordMenu.offsetTop};
  dragHandle.setPointerCapture(e.pointerId);
 });
 bind(dragHandle,'pointermove',e=>{
  if(!menuDrag||e.pointerId!==menuDrag.id)return;
  e.preventDefault();moveMenu(menuDrag.left+e.clientX-menuDrag.x,menuDrag.top+e.clientY-menuDrag.y);
 });
 const endDrag=e=>{if(menuDrag?.id===e.pointerId)menuDrag=null;};
 bind(dragHandle,'pointerup',endDrag);bind(dragHandle,'pointercancel',endDrag);
 if(window.visualViewport)bind(window.visualViewport,'resize',()=>{if(!wordMenu.hidden)moveMenu(wordMenu.offsetLeft,wordMenu.offsetTop);});
 bind(wordMenu,'click',async e=>{
  e.stopPropagation();
  const button=e.target.closest('button');
  if(!button)return;
  const range=wordMenuSelection;
  if(button.hasAttribute('data-word-menu-close')){closeWordMenu();return;}
  if(!range||!restoreMenuSelection()){closeWordMenu();return;}
  try{
   if(button.dataset.wordMenuFormat){applyWordFormat(button.dataset.wordMenuFormat);return;}
   if(button.dataset.wordMenuAlign){applyWordFormat('align',button.dataset.wordMenuAlign);return;}
   if(button.dataset.wordMenuColor){applyWordFormat('color',button.dataset.wordMenuColor);return;}
   if(button.hasAttribute('data-word-menu-copy')){
    const value=editing.rich?readRich().text:textarea.value;
    const copied=value.slice(range.start,range.end);
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(copied);
    else{const source=editing.rich?rich:textarea;source.focus();document.execCommand('copy');}
    closeWordMenu();say('คัดลอกข้อความที่เลือกแล้ว');return;
   }
   if(button.hasAttribute('data-word-menu-link')){closeWordMenu();await linkWord();return;}
  }catch(err){say(err.message,true);}
 });
 bind($('#paper-word-menu-size'),'change',e=>{
  if(restoreMenuSelection())applyWordFormat('size',textSize(e.target.value,editing.object.size));
 });
 bind($('#paper-word-menu-custom'),'input',e=>{
  if(restoreMenuSelection())applyWordFormat('color',e.target.value);
 });
bind(rich,'keyup',()=>{richSelection=richOffsets();textRibbonState();});
 bind(rich,'pointerup',()=>{richSelection=richOffsets();textRibbonState();});
 bind(rich,'blur',e=>{if(!closed&&!e.relatedTarget?.closest?.('.paper-text-ribbon,.paper-word-menu')){rememberWord();finishText();}});
 bind(rich,'paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData?.getData('text/plain')||'');});
 bind(rich,'dragover',event=>event.preventDefault());
 bind(rich,'drop',event=>{
  event.preventDefault();
  const text=event.dataTransfer?.getData('text/plain');
  if(!text)return;
  const caret=document.caretRangeFromPoint?.(event.clientX,event.clientY);
  if(caret&&rich.contains(caret.startContainer)){
   const selection=window.getSelection();
   selection.removeAllRanges();selection.addRange(caret);
  }
  if(rich.contains(window.getSelection()?.anchorNode))document.execCommand('insertText',false,text);
 });
 bind(rich,'beforeinput',e=>{if(e.inputType==='insertParagraph'){e.preventDefault();document.execCommand('insertText',false,'\n');}});
 const textKeydown=e=>{
  if(e.ctrlKey||e.metaKey){
   const shortcut={b:'bold',i:'italic',u:'underline'}[e.key.toLowerCase()];
   if(shortcut){e.preventDefault();applyWordFormat(shortcut);return;}
   if(e.key.toLowerCase()==='k'){e.preventDefault();linkWord().catch(err=>say(err.message,true));return;}
  }
  if(e.key==='Escape'){e.preventDefault();finishText();}
 };
 bind(textarea,'keydown',textKeydown);
 bind(rich,'keydown',textKeydown);
 // Follow-up Scribble strokes placed slightly after the last word should
 // reopen that very same text object rather than create a separate textbox.
 function findTextToContinue(p){
  const objects=[...page().objects].reverse().filter(o=>o.type==='text');
  const exact=objects.find(o=>contains(p,o,3));if(exact)return exact;
  const near=objects.filter(o=>o.text&&p.x>=o.x+o.w-8&&
   p.x<=o.x+o.w+Math.min(150,o.size*7)&&p.y>=o.y-12&&
   p.y<=o.y+o.h+Math.min(12,o.size*.5));
  return near.sort((a,b)=>Math.abs(p.x-(a.x+a.w))-Math.abs(p.x-(b.x+b.w)))[0]||null;
 }
 const tableUI=mountTableEditor(root,{page,change,writable,finishText,closeExtraTools,setShapesOpen,viewport,
  getScale:()=>scale,onSaved:tableId=>{multiSelect=false;setTool('select');selected=new Set([tableId]);draw();},say});
 const inkTools=new Set(['pen','highlight','eraser','straighten','shape']);
 function guardInkSelection(e){
  if(!inkTools.has(tool)||e.target.closest('input,textarea,select,[contenteditable="true"],dialog'))return;
  if(e.target.closest('#paper-sheet,.paper-bottom,.paper-header,.paper-toolbar'))e.preventDefault();
 }
 bind(root,'selectstart',guardInkSelection);
 bind(root,'contextmenu',guardInkSelection);
 function pointerDown(e){
  if(e.pointerType==='pen'&&inkTools.has(tool)){
   for(const [id,contact] of pointers)if(contact.pointerType==='pen'&&id!==e.pointerId){pointers.delete(id);gesture=null;cancelSmartTimer();}
   const selection=window.getSelection();
   if(selection&&!selection.isCollapsed&&root.contains(selection.anchorNode))selection.removeAllRanges();
   // A palm already resting on the sheet must not turn the pen into a pinch.
   for(const [id,contact] of pointers){
    if(contact.pointerType!=='touch')continue;
    pointers.delete(id);
    if(svg.hasPointerCapture(id))svg.releasePointerCapture(id);
    gesture=null;cancelSmartTimer();
   }
  }
  // Resting hands are often interpreted as a two-finger pinch by the browser.
  // Ignore touch contact on the page while protected or immediately after pen use.
  const cell=e.target.closest('[data-table-row][data-table-col]');
  if(cell&&['select','text'].includes(tool)&&!multiSelect&&!e.shiftKey&&e.isPrimary!==false&&e.button===0){
   const item=page().objects.find(o=>o.id===cell.closest('[data-object]').dataset.object);
   if(item){e.preventDefault();try{tableUI.open(item,Number(cell.dataset.tableRow),Number(cell.dataset.tableCol));}catch(err){say(err.message,true);}return;}
  }
  const guardedTextTap=e.pointerType==='touch'&&palmGuard&&tool==='text'&&e.isPrimary!==false&&!multiSelect&&page().objects.some(o=>o.type==='text'&&contains(point(e),o,2));
  if(e.pointerType==='touch'&&((palmGuard&&!guardedTextTap&&!(['select','hand'].includes(tool)&&e.isPrimary!==false))||[...pointers.values()].some(p=>p.pointerType==='pen'))){if(e.cancelable)e.preventDefault();return;}
  if(e.target.closest('[data-word-link],[data-word-file]')&&['text','select'].includes(tool)&&!multiSelect&&!e.shiftKey)return;
  wordSelection=null;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pointerType:e.pointerType});
  if(pointers.size===2&&gesture?.image){
   const [a,b]=[...pointers.values()];gesture={kind:'image-pinch',image:gesture.preview?.find(o=>o.id===gesture.image.id)||gesture.image,before:gesture.before,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};
   svg.setPointerCapture(e.pointerId);e.preventDefault();return;
  }
  if(pointers.size===2){finishText();const [a,b]=[...pointers.values()];gesture={kind:'pinch',distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};scheduleDraw();svg.setPointerCapture(e.pointerId);e.preventDefault();return;}
  if(pointers.size>2)return;
  const p=point(e);finishText();e.preventDefault();svg.setPointerCapture(e.pointerId);
  const rulerHit=e.target.closest('[data-ruler]');
  if(ruler.active&&rulerHit){
   gesture={kind:rulerHit.dataset.ruler==='rotate'?'ruler-rotate':'ruler-move',
    start:p,startX:ruler.x,startY:ruler.y,startAngle:ruler.angle};
   return;
  }
  if(unsaved){say('มีงานค้าง กรุณาบันทึกหรือสำรองก่อนเขียนต่อ',true);return;}
  if(tool==='hand'||e.pointerType==='touch'&&!finger&&['pen','highlight','eraser'].includes(tool)){gesture={kind:'pan',px:e.clientX,py:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};return;}
  try{writable();}catch(err){say(err.message,true);return;}
  if((tool==='select'||tool==='text')&&(e.shiftKey||multiSelect)){
   tool='select';
   const hit=[...page().objects].reverse().find(o=>o.type==='stroke'?strokeHit(o,p,8):contains(p,o,o.type==='shape'?8:0));
   if(hit){
    const alreadySelected=selected.has(hit.id);
    selected.add(hit.id);
    gesture={kind:'move',start:p,before:copy(page().objects),multiTap:hit.id,alreadySelected,px:e.clientX,py:e.clientY};
   }
   draw();return;
  }
  if(tool==='text'&&!e.target.closest('[data-edge]')){
   const existing=[...page().objects].reverse().find(o=>o.type==='text'&&contains(p,o,2));
   if(existing){
    const host=svg.querySelector('[data-object="'+CSS.escape(existing.id)+'"]');
    const pos=document.caretPositionFromPoint?.(e.clientX,e.clientY);
    const range=pos?null:document.caretRangeFromPoint?.(e.clientX,e.clientY);
    const node=pos?.offsetNode||range?.startContainer;let offset=null;
    if(node&&host?.contains(node)){const prefix=document.createRange();prefix.selectNodeContents(host);prefix.setEnd(node,pos?.offset??range.startOffset);offset=Math.min(existing.text.length,prefix.toString().length);}
    startText(existing,offset);return;
   }
  }
  if(['text','select'].includes(tool)){
   const edge=e.target.closest('[data-edge]')?.dataset.edge;
   const hit=edge?page().objects.find(o=>selected.has(o.id)&&(o.type==='image'||o.type==='shape')):[...page().objects].reverse().find(o=>o.type==='stroke'?strokeHit(o,p,8):contains(p,o,o.type==='shape'?8:0));
   if(hit?.type==='shape'&&edge){selected=new Set([hit.id]);gesture={kind:'shape-resize',edge,shape:hit,start:p,before:copy(page().objects)};draw();return;}
   if(hit?.type==='image'&&(edge||tool==='text'||selected.size<=1||!selected.has(hit.id))){
    selected=new Set([hit.id]);gesture={kind:edge?'image-resize':'move',edge,image:hit,start:p,before:copy(page().objects)};draw();return;
   }
  }
  if(tool==='text'){
   const table=[...page().objects].reverse().find(o=>o.type==='table'&&contains(p,o));
   if(table){selected=new Set([table.id]);tableUI.open(table);draw();return;}
   const target=findTextToContinue(p);
   startText(target||{id:uid(),type:'text',x:Math.min(p.x,PAGE_W-32),y:Math.min(p.y,PAGE_H-Math.ceil(fontSize*1.5)),w:32,h:Math.ceil(fontSize*1.5),text:'',size:fontSize,color:defaultTextColor,bold});
   if(target)say('กำลังเขียนต่อในกล่องเดิม · เขียนจากเคอร์เซอร์ได้เลย');
   return;
  }
  if(tool==='select'){
   const box=bounds(page().objects.filter(o=>selected.has(o.id)));
   if(box&&contains(p,{x:box.x+box.w-15,y:box.y+box.h-15,w:30,h:30})){gesture={kind:'resize',start:p,before:copy(page().objects),box};return;}
   const hit=[...page().objects].reverse().find(o=>o.type==='stroke'?strokeHit(o,p,8):contains(p,o,o.type==='shape'?8:0));
   if(hit){if(!selected.has(hit.id))selected=new Set([hit.id]);gesture={kind:'move',start:p,before:copy(page().objects)};}
   else{selected.clear();gesture={kind:'lasso',points:[p]};}draw();return;
  }
  if(tool==='shape'){
   const kind=$('#paper-shape').value;
   const join=isJoinable({type:'shape',kind})&&kind!=='branch3';
   gesture={kind:'shape',id:uid(),shape:kind,axis:branchMode&&kind==='line',start:join?snapLinePoint(p,page().objects,10/scale):p,join,color,width,lineStyle};
   return;
  }
  if(tool==='eraser'){gesture={kind:'erase',last:p,before:copy(page().objects),preview:page().objects.filter(o=>!eraserHit(o,p))};scheduleDraw();return;}
  const snapped=tool==='pen'?rulerSnap(p,ruler):null,initial=snapped||p;
  gesture={kind:'stroke',tool:tool==='straighten'?'pen':tool,straighten:tool==='straighten',color:tool==='highlight'&&color==='#172033'?'#f4cd45':color,width:tool==='highlight'?highlighterSize:width,
   points:[[initial.x,initial.y,e.pointerType==='pen'&&e.pressure>0?e.pressure:.5]],
   rulerEdge:snapped?.edge||0,pointer:e.pointerId};
  scheduleDraw();
 }
 function pointerMove(e){
  if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pointerType:e.pointerType});if(!gesture)return;e.preventDefault();
  if(gesture.multiTap&&!gesture.moved){
   if(Math.hypot(e.clientX-gesture.px,e.clientY-gesture.py)<4)return;
   gesture.moved=true;
  }
  if(gesture.kind==='image-pinch'){
   const [a,b]=[...pointers.values()];if(!b)return;
   const o=gesture.image,f=Math.min(2700/o.w,3819/o.h,Math.max(12/Math.min(o.w,o.h),Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance));
   const w=o.w*f,h=o.h*f;
   const x=Math.max(-900,Math.min(1800,o.x+(o.w-w)/2+((a.x+b.x)/2-gesture.cx)/scale));
   const y=Math.max(-1273,Math.min(2546,o.y+(o.h-h)/2+((a.y+b.y)/2-gesture.cy)/scale));
   gesture.preview=gesture.before.map(item=>item.id===o.id?{...o,x,y,w,h}:item);scheduleDraw();return;
  }
  if(gesture.kind==='pinch'&&pointers.size>=2){const [a,b]=[...pointers.values()],r=viewport.getBoundingClientRect(),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;zoomAt(gesture.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(10,gesture.distance),cx-r.left,cy-r.top);viewport.scrollLeft-=cx-gesture.cx;viewport.scrollTop-=cy-gesture.cy;gesture.cx=cx;gesture.cy=cy;return;}
  if(gesture.kind==='pan'){viewport.scrollLeft=gesture.left-(e.clientX-gesture.px);viewport.scrollTop=gesture.top-(e.clientY-gesture.py);return;}
  const p=point(e);
  if(gesture.kind==='ruler-move'){
   ruler.x=Math.max(30,Math.min(PAGE_W-30,gesture.startX+p.x-gesture.start.x));
   ruler.y=Math.max(30,Math.min(PAGE_H-30,gesture.startY+p.y-gesture.start.y));scheduleDraw();return;
  }
  if(gesture.kind==='ruler-rotate'){
   ruler.angle=Math.round(Math.atan2(p.y-ruler.y,p.x-ruler.x)*180/Math.PI/5)*5; scheduleDraw();return;
  }
  if(gesture.kind==='shape'){
   gesture.object=makeShape(gesture.id,gesture.shape,gesture.start,lineEnd(gesture,p),gesture.color,gesture.width,gesture.lineStyle);
  }else if(gesture.kind==='stroke'){
   for(const sample of e.getCoalescedEvents?.()?.length?e.getCoalescedEvents():[e]){
    const pt=point(sample),target=gesture.rulerEdge?rulerProject(pt,ruler,gesture.rulerEdge):pt,last=gesture.points.at(-1);
    if(Math.hypot(target.x-last[0],target.y-last[1])>=1.2&&gesture.points.length<12000)gesture.points.push([target.x,target.y,sample.pointerType==='pen'&&sample.pressure>0?sample.pressure:.5]);
   }
   scheduleSmartHold(gesture);
  }else if(gesture.kind==='erase')sweepErase(gesture,p);
  else if(gesture.kind==='lasso')gesture.points.push(p);
  else if(gesture.kind==='move'){
   const targets=gesture.before.filter(o=>!selected.has(o.id));
   gesture.preview=gesture.before.map(o=>{
    if(!selected.has(o.id))return o;
    const moved={...o,x:Math.max(-o.w/2,Math.min(PAGE_W-o.w/2,o.x+p.x-gesture.start.x)),y:Math.max(-o.h/2,Math.min(PAGE_H-o.h/2,o.y+p.y-gesture.start.y))};
    return selected.size===1?snapMovedLine(moved,targets,10/scale):moved;
   });
  }
  else if(gesture.kind==='image-resize')gesture.preview=gesture.before.map(o=>o.id===gesture.image.id?resizeImage(o,gesture.edge,p.x-gesture.start.x,p.y-gesture.start.y):o);
   else if(gesture.kind==='shape-resize')gesture.preview=gesture.before.map(o=>o.id===gesture.shape.id?resizeShape(o,gesture.edge,p.x-gesture.start.x,p.y-gesture.start.y):o);
  else if(gesture.kind==='resize'){const b=gesture.box,f=Math.max(.15,Math.min(4,Math.max((p.x-b.x)/Math.max(1,b.w),(p.y-b.y)/Math.max(1,b.h))));gesture.preview=gesture.before.map(o=>selected.has(o.id)?{...o,x:b.x+(o.x-b.x)*f,y:b.y+(o.y-b.y)*f,w:Math.max(1,o.w*f),h:Math.max(1,o.h*f),...(o.type==='text'?{size:Math.round(Math.min(96,Math.max(10,o.size*f)))}:{})}:o);}
  scheduleDraw();
 }
 function sweepErase(g,p){g.preview=g.preview.filter(o=>!eraserHit(o,g.last,p));g.last=p;}
 function pointerUp(e){
  if(!pointers.has(e.pointerId))return;const g=gesture;
  cancelSmartTimer();
  if(g?.kind==='erase'&&e.type==='pointerup')sweepErase(g,point(e));
  if(g?.kind==='stroke'&&e.type==='pointerup'){const p=point(e),to=g.rulerEdge?rulerProject(p,ruler,g.rulerEdge):p;g.points.push([to.x,to.y,e.pointerType==='pen'&&e.pressure>0?e.pressure:.5]);}
  pointers.delete(e.pointerId);if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
  if(g?.kind==='pinch'){if(pointers.size<2)gesture=null;return;}
  gesture=null;
  if(g?.multiTap&&!g.moved&&g.alreadySelected&&e.type==='pointerup')selected.delete(g.multiTap);
  // iOS does not reliably dispatch dblclick on SVG. Two short taps on the
   // same text enter inline editing, without treating drags as taps.
   if(e.type==='pointerup'&&tool==='select'&&['touch','pen'].includes(e.pointerType)&&g?.kind==='move'&&!g.preview){
    const at=point(e),hit=[...page().objects].reverse().find(o=>o.type==='text'&&contains(at,o,4));
    const now=Date.now(),prior=lastTextTap;
    lastTextTap=hit?{id:hit.id,time:now,x:at.x,y:at.y}:null;
    if(hit&&prior?.id===hit.id&&now-prior.time<420&&Math.hypot(at.x-prior.x,at.y-prior.y)<28){
     lastTextTap=null;startText(hit);return;
    }
   }
   if(g?.kind==='stroke'&&e.type!=='pointercancel'){
   let result;
   if(g.straighten){
    // The old implementation connected the first/last samples as a line,
    // destroying circles whenever the stroke began and ended together.
    // Recognize the whole gesture when the Pencil is lifted instead.
    const found=recognizeDrawnShape(g.points);
    if(found)result=makeShape(uid(),found.kind,found.start,found.end,g.color,g.width,lineStyle);
    else if(g.snap)result=g.snap;
   }
   else if(g.snap)result=g.snap;
   else if(g.rulerEdge&&g.points.length>1){
    const first=g.points[0],last=g.points.at(-1);
    result=makeShape(uid(),'line',{x:first[0],y:first[1]},{x:last[0],y:last[1]},g.color,g.width,lineStyle);
   }
   if(result)change(p=>p.objects.push(result));
   else if(g.points.length>1){const stroke=strokeObject(g.points,{tool:g.tool,color:g.color,width:g.width});change(p=>p.objects.push(stroke));}
  }
  else if(g?.kind==='shape'&&e.type==='pointerup'){
   const end=point(e);
   if(Math.hypot(end.x-g.start.x,end.y-g.start.y)>2){
    const shape=makeShape(g.id,g.shape,g.start,lineEnd(g,end),g.color,g.width,g.lineStyle);
    if(change(p=>p.objects.push(shape))&&!g.axis){tool='select';selected=new Set([shape.id]);$('#paper-geometry-menu').open=false;setShapesOpen(false);showTextRibbon();}
   }
  }
  else if(g?.preview&&e.type!=='pointercancel')change(p=>{p.objects=g.preview;});
  else if(g?.kind==='lasso'){selected=new Set(page().objects.filter(o=>o.type==='stroke'?o.points.some(pt=>inPolygon({x:o.x+pt[0]*o.w,y:o.y+pt[1]*o.h},g.points)):inPolygon({x:o.x+o.w/2,y:o.y+o.h/2},g.points)).map(o=>o.id));}
  draw();if(pendingRemote)refresh(space);
 }
 bind(svg,'click',e=>{
  const link=e.target.closest('[data-word-link],[data-word-file]');if(!link)return;
  if(!['text','select'].includes(tool)||multiSelect||e.shiftKey){e.preventDefault();return;}
  if(link.dataset.wordFile){
   const file=currentNote()?.files?.find(f=>f.id===link.dataset.wordFile);
   if(file)openNoteFile(file).catch(err=>say(err.message,true));else say('ไฟล์แนบนี้ถูกลบแล้ว',true);
  }
 });
 bind(window,'blur',()=>{if(pointers.size){pointers.clear();gesture=null;cancelSmartTimer();scheduleDraw();}});
 bind(svg,'pointerdown',pointerDown);bind(svg,'pointermove',pointerMove);bind(svg,'pointerup',pointerUp);bind(svg,'pointercancel',pointerUp);
 bind(svg,'lostpointercapture',e=>{if(pointers.delete(e.pointerId)){cancelSmartTimer();gesture=null;scheduleDraw();}});
 bind(svg,'dblclick',e=>{
   if(!['select','text'].includes(tool)||editing)return;
   const o=[...page().objects].reverse().find(o=>['text','table'].includes(o.type)&&contains(point(e),o));
   if(o){e.preventDefault();if(o.type==='table')tableUI.open(o);else startText(o);}
  });
 bind(viewport,'wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();const r=viewport.getBoundingClientRect();zoomAt(zoom*Math.exp(-e.deltaY*.005),e.clientX-r.left,e.clientY-r.top);}},{passive:false});
 async function insertImages(files){
  finishText();loadingImages++;try{for(const file of files){writable();say('กำลังส่งรูปขึ้น Supabase…');const imageId=await space.uploadImage(file);if(closed)return;const url=URL.createObjectURL(file),img=new Image();img.src=url;await img.decode();if(closed){URL.revokeObjectURL(url);return;}images.set(imageId,url);imageVersion++;const w=Math.min(620,img.naturalWidth),height=Math.min(900,w*img.naturalHeight/img.naturalWidth),actualW=height*img.naturalWidth/img.naturalHeight;
   const o={id:uid(),type:'image',x:(PAGE_W-actualW)/2,y:80,w:actualW,h:height,imageId};if(change(p=>p.objects.push(o))){selected=new Set([o.id]);tool='select';draw();}}
  }catch(err){say(err.message,true);}finally{loadingImages--;}
 }
 bind($('#paper-image-file'),'change',e=>{insertImages([...e.target.files]);e.target.value='';});
 bind(svg,'dragover',e=>e.preventDefault());bind(svg,'drop',e=>{e.preventDefault();insertImages([...e.dataTransfer.files]);});
 bind(root,'paste',e=>{const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();insertImages(files);}});
 function fileList(){
  const files=currentNote()?.files||[];
  $('#paper-file-list').innerHTML=files.map(f=>`<li><button data-download="${f.id}">${esc(f.name)}</button> <button data-remove="${f.id}" aria-label="ลบ ${esc(f.name)}">ลบ</button></li>`).join('');
 }
 function updateFiles(fn){
  writable();const book=copy(space.notebook()),target=book.notes.find(n=>n.id===id);
  const before=target.files||[];target.files=fn(before);
  const removed=new Set(before.filter(f=>!target.files.some(next=>next.id===f.id)).map(f=>f.id));
  if(removed.size)for(const p of target.paper?.pages||[])for(const o of p.objects)if(o.links)o.links=o.links.filter(link=>!removed.has(link.fileId));
  target.updatedAt=new Date().toISOString();space.saveNotebook(book);fileList();
 }
 bind($('#paper-doc-file'),'change',async e=>{
  const input=e.target,file=input.files[0];if(!file)return;
  input.disabled=true;const status=$('#paper-file-status');
  try{const item=await readAttachment(file);if(closed)return;updateFiles(files=>[...files,item]);await space.flush();status.textContent='บันทึกไฟล์แนบแล้ว';}
  catch(err){status.textContent=err.message;}finally{input.value='';input.disabled=false;}
 });
 bind($('#paper-file-list'),'click',async e=>{
  const {download,remove}=e.target.dataset,file=currentNote()?.files?.find(f=>f.id===(download||remove));if(!file)return;
  try{if(download)downloadAttachment(file);else {
   const dialog=$('#paper-files');dialog.close();
   const confirmed=await confirmNoteDelete(file.name,'ไฟล์แนบ');
   if(closed)return;
   dialog.showModal();if(confirmed)updateFiles(files=>files.filter(f=>f.id!==remove));
  }}
  catch(err){$('#paper-file-status').textContent=err.message;}
 });
 bind(root,'click',async e=>{
  const b=e.target.closest('button');if(!b||!root.contains(b))return;
  try{
   if(b.dataset.textAlign&&!editing){
    change(p=>{for(const o of p.objects)if(selected.has(o.id)&&o.type==='text')o.align=b.dataset.textAlign;});return;
   }
   if(b.dataset.textAlign&&editing){
    if(currentWordSelection()){applyWordFormat('align',b.dataset.textAlign);return;}
    if(!editing.align)editing.alignWidth=parseFloat((editing.rich?rich:textarea).style.width);
    editing.align=b.dataset.textAlign;
    textarea.style.textAlign=rich.style.textAlign=editing.align;
    if(editing.rich)fitRichBox();else fitTextBox();
    finishText(true);textRibbonState();return;
   }
   if(b.dataset.wordFormat){applyWordFormat(b.dataset.wordFormat);return;}
   if(b.dataset.wordColor){applyWordFormat('color',b.dataset.wordColor);return;}
   if(b.dataset.wordStep){
    const size=textSize(Number($('#paper-word-size').value)+Number(b.dataset.wordStep),editing?.object?.size||fontSize);
    $('#paper-word-size').value=size;applyWordFormat('size',size);return;
   }
   if(unsaved&&b.dataset.paper!=='save'&&b.dataset.paper!=='draft'&&b.dataset.paper!=='discard-draft'&&b.dataset.paper!=='pages')throw Error('มีงานค้าง กรุณาบันทึกหรือสำรองก่อนทำรายการต่อ');
   if(b.dataset.paperPage){finishText();pageId=b.dataset.paperPage;selected.clear();viewport.scrollTop=0;if(window.matchMedia('(max-width:720px)').matches)setPagesOpen(false);draw();thumbs();return;}
   if(b.hasAttribute('data-open-shapes')){setShapesOpen($('#paper-shapes-popup').hidden);return;}
   if(b.hasAttribute('data-shapes-close')){setShapesOpen(false);return;}
   if(b.dataset.shapePick){
    const kind=b.dataset.shapePick;
    const single=page().objects.find(o=>selected.size===1&&selected.has(o.id)&&o.type==='shape');
    if(single&&tool==='select'){
     change(p=>p.objects.forEach(o=>{
      if(o.id===single.id){o.kind=kind;if(['square','circle'].includes(kind)){const side=Math.max(o.w,o.h);o.w=side;o.h=side;}}
     }));
    }else{$('#paper-shape').value=kind;setTool('shape');}
    setShapesOpen(false);draw();return;
   }
    if(b.dataset.paperColor){
     color=b.dataset.paperColor;
     if(selected.size&&activePanel==='select')change(p=>{p.objects=p.objects.map(o=>selected.has(o.id)&&['stroke','shape'].includes(o.type)?{...o,color}:o);});
     draw();return;
    }
    if(b.dataset.paperSizeToggle){
     const picker=$('.paper-pen-sizes'),open=picker.classList.toggle('is-open');
     b.setAttribute('aria-expanded',String(open));return;
    }
    if(b.dataset.paperWidth){
     updatePenWidth(b.dataset.paperWidth);
     closePenSizePicker();
     return;
    }
   const action=b.dataset.paper;if(!action)return;
   if(action==='finish-text'){finishText();return;}
   if(action==='scribble-text'){
    const targetId=editing?.id||page().objects.find(o=>selected.has(o.id)&&o.type==='text')?.id;
    if(editing)finishText();
    const existing=page().objects.find(o=>o.id===targetId&&o.type==='text');
    tool='text';activePanel='text';selected=existing?new Set([existing.id]):new Set();
    const x=Math.max(28,Math.min(PAGE_W-440,viewport.scrollLeft/scale+75));
    const y=Math.max(35,Math.min(PAGE_H-70,viewport.scrollTop/scale+110));
    startText(existing||{id:uid(),type:'text',x,y,w:440,h:Math.ceil(fontSize*1.5),text:'',size:fontSize,color:defaultTextColor,bold:false},null,{wideArea:true});
    openScribblePanel();
    say('เขียนด้วย Apple Pencil ในพื้นที่สีฟ้า · ข้อความที่ iPadOS แปลงจะไปที่กล่องเดิม');
    return;
   }
   if(action==='ruler'){ruler.active=!ruler.active;activePanel=ruler.active?'ruler':tool;draw();return;}
   if(action==='page-settings'){activePanel=activePanel==='page'?tool:'page';draw();return;}
   if(['ruler-minus','ruler-plus','ruler-zero'].includes(action)){
    ruler.angle=action==='ruler-zero'?0:Math.round((ruler.angle+(action==='ruler-plus'?15:-15)+360)%360);ruler.active=true;activePanel='ruler';draw();return;
   }
   if(action==='word-link'){await linkWord();return;}
   if(action==='multi'){
    multiSelect=!multiSelect;setTool('select');
    say(multiSelect?'แตะเพื่อเพิ่มหรือนำออกจากกลุ่ม · ลากชิ้นที่เลือกเพื่อย้ายพร้อมกัน':'แตะเพื่อเลือก · Shift + คลิกเพื่อเลือกเพิ่ม');return;
   }
   if(action==='shape'){setTool('shape');setShapesOpen(true);return;}
   if(['select','pen','highlight','eraser','text','hand','line','arrow','straighten'].includes(action)){setTool(action);return;}
   if(action==='table'){$('.paper-menu').open=false;tableUI.open();return;}
   if(action==='table-edit'){const item=page().objects.find(o=>selected.size===1&&selected.has(o.id)&&o.type==='table');if(item)tableUI.open(item);return;}
   if(['table-add-row','table-remove-row','table-add-col','table-remove-col'].includes(action)){
    const item=page().objects.find(o=>selected.size===1&&selected.has(o.id)&&o.type==='table');if(!item)return;
    const r=item.cells.length,c=item.cells[0].length;
    const rows=r+(action==='table-add-row'?1:action==='table-remove-row'?-1:0);
    const cols=c+(action==='table-add-col'?1:action==='table-remove-col'?-1:0);
    if(change(p=>{const i=p.objects.findIndex(o=>o.id===item.id);p.objects[i]=tableWithCells(p.objects[i],tableGrid(item.cells,rows,cols));}))
     say('ปรับตารางแล้ว · แตะช่องเพื่อพิมพ์');
    return;
   }
   if(action==='files'){fileList();$('#paper-files').showModal();return;}
   if(action==='course-materials'){
    const course=currentNote()?.course;
    if(!course){$('#paper-info').hidden=false;$('#paper-course').focus();say('ใส่รหัสวิชา เช่น POL1101 แล้วเปิดไฟล์หลักของวิชานี้');return;}
    await openSharedCourseMaterials(space,course,refreshCourseButton,say);
    return;
   }
   if(action==='image-link'){
    const target=page().objects.find(o=>selected.has(o.id)&&o.type==='image');
    if(!target)return;
    const dialog=$('#paper-link-dialog'),form=dialog.querySelector('form'),input=form.elements.url;
    input.value=target.link||'';dialog.querySelector('p').textContent='';
    dialog.querySelector('[value="remove"]').hidden=!target.link;
    form.onsubmit=event=>{
     const choice=event.submitter?.value;
     if(choice==='cancel')return;
     try{
      const link=choice==='remove'?'':imageLink(input.value);
      if(!change(p=>{const image=p.objects.find(o=>o.id===target.id);if(!image)throw Error('ไม่พบรูปนี้บนหน้าแล้ว');if(link)image.link=link;else delete image.link;}))throw Error('บันทึกลิงก์ไม่สำเร็จ');
     }catch(err){event.preventDefault();dialog.querySelector('p').textContent=err.message;}
    };
    dialog.showModal();return;
   }
   if(action==='crop'){
    const o=page().objects.find(o=>selected.has(o.id)&&o.type==='image');
    if(!o||!images.has(o.imageId))throw Error('กรุณารอให้โหลดรูปก่อน');
    const result=await cropImage(images.get(o.imageId));if(!result||closed)return;
    const imageId=await space.uploadImage(result.blob);if(closed)return;
    change(p=>{const target=p.objects.find(item=>item.id===o.id);if(target&&target.imageId===o.imageId)Object.assign(target,{imageId,w:Math.max(1,target.w*result.widthFraction),h:Math.max(1,target.h*result.heightFraction)});});return;
   }
   if(action==='image'){$('#paper-image-file').click();return;}
   finishText();
   if(action==='save'){b.disabled=true;try{if(unsaved&&!persist(unsaved))return;await space.flush();say('บันทึกงานใน Supabase แล้ว');}finally{b.disabled=false;}}
   if(action==='discard-draft'){if(await confirmNoteDelete('งานค้างที่ยังไม่บันทึก (ควรกดสำรองงานค้างก่อน)')){unsaved=null;draftBase=null;localStorage.removeItem(draftKey);root.classList.remove('paper-has-draft');refresh(space);say('กลับมาที่ฉบับที่บันทึกแล้ว');}}
   if(action==='draft'){const blob=new Blob([JSON.stringify({format:'ru-paper-recovery',version:1,note:{...currentNote(),paper:unsaved||model}})],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ru-paper-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   if(action==='undo'||action==='redo'){const next=h().step(page(),action==='undo');if(next){const doc=copy(model);doc.pages[doc.pages.findIndex(p=>p.id===pageId)]=next;persist(doc,false);selected.clear();draw();}}
   if(action==='pages'){setPagesOpen(!root.classList.contains('pages-open'));return;}
   if(action==='info')$('#paper-info').hidden=!$('#paper-info').hidden;
   if(action==='zoom-in')zoomAt(zoom*1.2);if(action==='zoom-out')zoomAt(zoom/1.2);if(action==='fit'){zoom=1;sizing();viewport.scrollLeft=0;}
   if(action==='add-page'){const next=copy(model),p=emptyPage();p.template=page().template;next.pages.push(p);if(persist(next)){if(window.matchMedia('(max-width:720px)').matches)setPagesOpen(false);pageId=p.id;selected.clear();viewport.scrollTop=0;draw();thumbs();}}
   if(action==='duplicate-page'){const next=copy(model),p=copy(page());p.id=uid();p.objects.forEach(o=>o.id=uid());next.pages.splice(next.pages.findIndex(p=>p.id===pageId)+1,0,p);if(persist(next)){if(window.matchMedia('(max-width:720px)').matches)setPagesOpen(false);pageId=p.id;selected.clear();draw();thumbs();}}
   if(action==='delete-page'){if(model.pages.length===1)throw Error('ต้องเหลืออย่างน้อยหนึ่งหน้า');const target=pageId;if(await confirmNoteDelete('หน้ากระดาษ '+(model.pages.findIndex(p=>p.id===target)+1))){const next=copy(model);next.pages=next.pages.filter(p=>p.id!==target);persist(next,false);selected.clear();draw();thumbs();}}
   if(action==='delete-object'){$('#paper-selection-more').open=false;change(p=>{p.objects=p.objects.filter(o=>!selected.has(o.id));});selected.clear();draw();}
   if(action==='layer-front'||action==='layer-back'){change(p=>{const picked=p.objects.filter(o=>selected.has(o.id)),rest=p.objects.filter(o=>!selected.has(o.id));p.objects=action==='layer-front'?[...rest,...picked]:[...picked,...rest];});}
   if(action==='clear-fill')change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='shape')o.fill='none';}));
   if(action==='duplicate'){const ids=[];change(p=>{const objects=p.objects.filter(o=>selected.has(o.id)).map(o=>({...copy(o),id:uid(),x:o.x+24,y:o.y+24}));ids.push(...objects.map(o=>o.id));p.objects.push(...objects);});selected=new Set(ids);draw();}
   if(action==='edit-text'){const o=page().objects.find(o=>selected.has(o.id)&&o.type==='text');if(o)startText(o);}
   if(action==='bold'){bold=!bold;change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='text')o.bold=bold;}));}
   if(action==='legacy'){if(unsaved)throw Error('กรุณาบันทึกหรือสำรองงานค้างก่อนเปิดต้นฉบับ');onLegacy();}
  }catch(err){say(err.message,true);}
 });
 bind($('#paper-selected-shape'),'change',e=>{
  const next=e.target.value;
  if(!selected.size)return;
  change(p=>p.objects.forEach(o=>{
   if(!selected.has(o.id)||o.type!=='shape')return;
   o.kind=next;
   if(next==='square'||next==='circle'){const side=Math.max(o.w,o.h);o.w=side;o.h=side;}
  }));
 });
 bind($('#paper-shape-fill'),'change',e=>{const fill=e.target.value;change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='shape')o.fill=fill;}));});
 bind($('#paper-selected-line-style'),'change',e=>{
  const style=e.target.value;
  if(!selected.size)return;
  change(p=>p.objects.forEach(o=>{
   if(!selected.has(o.id)||o.type!=='shape')return;
   delete o.dash;delete o.lineStyle;
   if(style!=='solid')o.dash=style;
  }));
 });
  bind($('#paper-width'),'input',e=>updatePenWidth(e.target.value));
 bind($('#paper-width'),'change',e=>{updatePenWidth(e.target.value);closePenSizePicker();closeExtraTools();});
 bind(root,'pointerdown',e=>{if(!e.target.closest('.paper-selection-more'))$('#paper-selection-more').open=false;if(!e.target.closest('.paper-shapes-popup,[data-open-shapes],[data-paper="shape"]'))setShapesOpen(false);if(!e.target.closest('.paper-word-menu,.paper-text-ribbon,#paper-text-input,#paper-rich-editor'))closeWordMenu();if(!e.target.closest('.paper-pen-sizes'))closePenSizePicker();if(!e.target.closest('#paper-toolbar-more'))closeExtraTools();});
 bind(root,'keydown',e=>{if(e.key==='Escape'){setShapesOpen(false);closeWordMenu();closePenSizePicker();closeExtraTools();}});
  $('#paper-finger').checked=finger;
  bind($('#paper-finger'),'change',e=>{finger=e.target.checked;if(finger&&palmGuard)setPalmGuard(false);try{localStorage.setItem(fingerKey,String(finger));}catch{}closeExtraTools();});
 bind(palmToggle,'change',e=>{setPalmGuard(e.target.checked);closeExtraTools();});
 bind($('#paper-template'),'change',e=>change(p=>{p.template=e.target.value;}));
 bind($('#paper-shape'),'change',()=>{closeExtraTools();});
 bind($('#paper-smart-shape'),'change',e=>{smartEnabled=e.target.checked;if(!smartEnabled)cancelSmartTimer();});
 bind($('#paper-line-style'),'change',e=>{
  lineStyle=e.target.value;
  if(selected.size)change(p=>{p.objects=p.objects.map(o=>selected.has(o.id)&&o.type==='shape'?{...o,dash:lineStyle}:o);});
  closeExtraTools();
 });
 const wholeSize=$('#paper-font-size');
 for(const [step,label] of [[-1,'−'],[1,'+']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',step<0?'ลดขนาดทั้งกล่อง':'เพิ่มขนาดทั้งกล่อง');wholeSize.parentElement.append(button);
  bind(button,'pointerdown',e=>e.preventDefault());
  bind(button,'click',e=>{e.preventDefault();wholeSize.value=String(Math.max(10,Math.min(96,Number(wholeSize.value)+step)));wholeSize.dispatchEvent(new Event('change'));});
 }
 bind($('#paper-font-size'),'change',e=>{
  const size=textSize(e.target.value,fontSize);e.target.value=String(size);fontSize=size;
  change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='text'){o.size=size;o.h=Math.max(o.h,Math.ceil(size*1.5));}}));
 });
 bind($('#paper-word-custom-color'),'input',e=>applyWordFormat('color',e.target.value));
 bind($('#paper-global-text-color'),'input',e=>{
  const ink=textColor(e.target.value);if(!ink)return;
  if(editing){if(currentWordSelection())applyWordFormat('color',ink);else {editing.ink=ink;textarea.style.color=rich.style.color=ink;finishText(true);}}
  else if(selected.size)change(p=>p.objects.forEach(o=>{if(selected.has(o.id)){if(o.type==='text')o.color=ink;else if(o.type==='table')o.textColor=ink;}}));
  else{defaultTextColor=ink;say('ตั้งสีตัวอักษรสำหรับกล่องข้อความใหม่แล้ว');}
 });
 for(const input of root.querySelectorAll('[data-table-style]'))bind(input,'input',e=>{
  const ink=textColor(e.target.value),key=e.target.dataset.tableStyle;
  if(!ink||!['headerBg','bodyBg','borderColor','textColor','headerTextColor'].includes(key))return;
  change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='table')o[key]=ink;}));
 });
 bind($('#paper-word-size'),'change',e=>{
  const size=textSize(e.target.value,editing?.object?.size||fontSize);e.target.value=String(size);
  applyWordFormat('size',size);
 });
 bind($('#paper-default-text-size'),'change',e=>{
  fontSize=textSize(e.target.value,fontSize);e.target.value=String(fontSize);
  try{localStorage.setItem(textSizeKey,String(fontSize));}catch{}
 });
 for(const [selector,key] of [['#paper-title','title'],['#paper-course','course'],['#paper-source','source'],['#paper-tags','tags'],['#paper-question','question'],['#paper-answer','answer']])bind($(selector),'change',e=>{try{writable();const book=copy(space.notebook()),n=book.notes.find(n=>n.id===id);n[key]=key==='course'?e.target.value.trim().toUpperCase():e.target.value;if(key==='course'&&n[key]&&!/^POL\d{4}$/.test(n[key]))throw Error('กรอกรหัสวิชา เช่น POL1101');n.updatedAt=new Date().toISOString();space.saveNotebook(book);if(key==='course')refreshCourseButton();}catch(err){say(err.message,true);}});
 bind(document,'keydown',e=>{if(!root.isConnected||/INPUT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(`[data-paper="${e.shiftKey?'redo':'undo'}"]`).click();}if((e.key==='Delete'||e.key==='Backspace')&&selected.size){e.preventDefault();$('[data-paper="delete-object"]').click();}});
 bind(window,'beforeunload',e=>{if(unsaved||editing||gesture?.kind==='stroke'||loadingImages){e.preventDefault();e.returnValue='';}});
 const ro=new ResizeObserver(()=>sizing());ro.observe(viewport);
 function refreshCourseButton(){
  const button=$('[data-paper="course-materials"]');
  if(button)button.textContent=courseMaterialLabel(space.notebook(),currentNote()?.course);
 }
 function refresh(nextSpace){
  if(closed||nextSpace.info().scope!==scope||!nextSpace.info().canEdit)return false;
  const live=currentNote();if(!live)return false;
  refreshCourseButton();
  if($('#paper-files').open)fileList();
  if(gesture||editing||unsaved){pendingRemote=true;return true;}
  pendingRemote=false;const serialized=JSON.stringify(live.paper||null);
  if(serialized!==lastStored){model=paperFor(live);lastStored=serialized;if(!model.pages.some(p=>p.id===pageId))pageId=model.pages[0].id;selected=new Set([...selected].filter(id=>page().objects.some(o=>o.id===id)));draw();thumbs();say('อัปเดตจากอีกเครื่องแล้ว');}
  for(const [selector,key] of [['#paper-title','title'],['#paper-course','course'],['#paper-source','source'],['#paper-tags','tags'],['#paper-question','question'],['#paper-answer','answer']])if(document.activeElement!==$(selector))$(selector).value=live[key];return true;
 }
 const backup=document.createElement('button');backup.dataset.paper='draft';backup.className='paper-draft-button';backup.textContent='สำรองงานค้าง';$('.paper-bottom').append(backup);const discard=backup.cloneNode();discard.dataset.paper='discard-draft';discard.textContent='ละทิ้งงานค้าง';$('.paper-bottom').append(discard);
 try{const raw=localStorage.getItem(draftKey);if(raw){const draft=JSON.parse(raw);unsaved=validatePaper(draft.paper);draftBase=validatePaper(draft.base);root.classList.add('paper-has-draft');say('มีงานค้างจากครั้งก่อน กดสำรองงานค้างเพื่อเก็บฉบับกู้คืน',true);}}catch{}
 document.body.classList.add('paper-mode');active={id,refresh};syncPenWidthControls();setPagesOpen(root.classList.contains('pages-open'));sizing();draw();showTextRibbon();thumbs();if(conversionWarning)say(conversionWarning,true);
 return ()=>{finishText();tableUI.close();closed=true;cancelAnimationFrame(raf);events.forEach(fn=>fn());ro.disconnect();for(const url of images.values())URL.revokeObjectURL(url);document.body.classList.remove('paper-mode');if(active?.id===id)active=null;};
}
