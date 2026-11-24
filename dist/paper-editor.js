import {notebookHistory} from './paper-page-history.js';
import {confirmNoteDelete} from './note-delete-dialog.js?v=20261118-edit2';
import {PAGE_W,PAGE_H,MAX_CANVAS_HEIGHT,pageHeight,continuousContentHeight,toContinuousPaper,toPagedPaper,emptyPage,uid,paperFor,imageLink,validatePaper,strokeObject,bounds,contains,inPolygon,strokeHit,pageHistory,copy,mergePaper,penWidth,highlightWidth,PEN_WIDTH_PRESETS,HIGHLIGHT_WIDTH_PRESETS,expandSelection,selectionGroupState,changeObjectGroups,cloneGroupedObjects,scaleGroupObject} from './paper-core.js?v=20261124-groups';
import {printBoundaryGuides,pageSVG,printableSheets,objectSVG,esc} from './paper-render.js?v=20261124-groups';
import {imageHandles,resizeImage,cropImage} from './paper-images.js';
import {readAttachment,downloadAttachment} from './note-files.js?v=20261124-documents20';
import {replaceLink,moveLinks} from './word-links.js';
import {textSize,textColor,formattedTextHTML,normalizeMarks,toggleTextFormat,applyTextFormat,moveMarks} from './paper-rich-text.js?v=20261121-paper-format';
import {applyListPrefix} from './paper-list-prefix.js?v=20261123-list-v1';
import {chooseWordTarget} from './word-link-dialog.js?v=20261124-documents20';
import {openNoteFile} from './file-viewer.js?v=20261124-documents20';
import {openSharedCourseMaterials,courseMaterialLabel} from './course-materials-ui.js?v=20261124-documents20';
import {makeShape,resizeShape,shapeAngle,shapeContains,eraserTargetHit,isJoinable,snapLinePoint,snapMovedLine} from './paper-shapes.js?v=20261123-shapes-eraser-v4';
import {recognizeHeldShape,recognizeDrawnShape,diagramSegments,hasBranchJunction,rulerProject,rulerSnap,rulerSVG} from './paper-geometry.js?v=20261123-shapes-eraser-v4';
import {mountTableEditor} from './paper-table-ui.js?v=20261124-notebook-v2';
import {tableWithCells,tableGrid,tableStyle} from './paper-table.js?v=20261121-paper-format';
let active=null;
export function refreshPaper(space,id){return active?.id===id?active.refresh(space):false;}
export function mountPaper(space,id,{onLegacy=()=>{},startInk=false}={}){
 const root=document.querySelector('.paper-app');if(!root)return ()=>{};
 let note=space.notebook().notes.find(n=>n.id===id);if(!note)return ()=>{};
 let conversionWarning='';let initial;
 try{initial=paperFor(note);}
 catch(err){throw Error('อ่านหน้ากระดาษเดิมไม่สำเร็จ: '+(err?.message||'รูปแบบข้อมูลไม่รองรับ')+' · ไม่มีการลบหรือบันทึกทับต้นฉบับ');}
 let model=initial,pageId=model.pages[0].id,virtualHeight=initial.version===2?Math.min(MAX_CANVAS_HEIGHT,pageHeight(initial.pages[0])+PAGE_H):PAGE_H,tool=startInk?'pen':window.matchMedia('(max-width:600px)').matches?'hand':'text',color='#172033',defaultTextColor='#172033',width=5,highlighterSize=12,fontSize=16,bold=false,finger=startInk,selected=new Set(),zoom=1,fit=1,scale=1,gesture=null,closed=false,raf=0,editing=null,unsaved=null,loadingImages=0;
 let multiSelect=false,wordSelection=null,lineStyle='solid',eraserKind='stroke',smartEnabled=true,smartTimer=0,lastTextTap=null,lastMouseTextTap=null;
 let lastSelectionSignature='';
 let virtualWidth=PAGE_W*2;const canvasWidth=()=>model.version===2?virtualWidth:PAGE_W;
 let ruler={active:false,x:PAGE_W/2,y:PAGE_H/2,angle:0,length:440,height:44};
 function cancelSmartTimer(){clearTimeout(smartTimer);smartTimer=0;}
 function scheduleSmartHold(g){
  cancelSmartTimer();g.snap=null;
  if(!smartEnabled||g.kind!=='stroke'||g.tool!=='pen'||g.rulerEdge||g.points.length<3)return;
  smartTimer=setTimeout(()=>{
   if(closed||gesture!==g)return;
   const found=g.straighten?recognizeDrawnShape(g.points):recognizeHeldShape(g.points);
   if(found){g.snap=makeShape(uid(),found.kind,found.start,found.end,g.color,g.width,lineStyle);if(found.inverted)g.snap.inverted=true;scheduleDraw();say('วาดเป็นรูปทรงแล้ว · ยกปากกาเพื่อบันทึก · ย้อนกลับได้');}
  },550);
 }
 let lastStored=JSON.stringify(note.paper||null),pendingRemote=false,draftBase=null;
 let cachedPage=null,cachedContent='',cachedRenderHeight=-1,imageVersion=0,cachedImageVersion=-1;
 const scope=space.info().scope,images=new Map(),loading=new Set(),history=notebookHistory(),events=[],pointers=new Map();
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
 const printButton=document.createElement('button');
 printButton.type='button';printButton.textContent='พิมพ์ทุกหน้า / PDF';printButton.dataset.paper='print-pages';
 $('.paper-context-actions').append(printButton);
 bind(printButton,'click',async()=>{
  if(composingScribble){say('รอให้แปลงลายมือเสร็จก่อนพิมพ์',true);return;}
  finishText();
  const preview=window.open('','_blank');
  if(!preview){say('กรุณาอนุญาตหน้าต่างตัวอย่างก่อนพิมพ์',true);return;}
  preview.opener=null;
  const doc=preview.document;doc.documentElement.lang='th';doc.title=note.title;
  doc.body.textContent='กำลังเตรียมหน้ากระดาษ…';
  try{
   const printable=copy(unsaved||model),pages=printable.pages,assets=new Map();
   const ids=new Set(pages.flatMap(p=>p.objects.filter(o=>o.type==='image').map(o=>o.imageId)));
   for(const imageId of ids){
    const blob=await space.image(imageId);
    if(preview.closed)return;
    const url=preview.URL.createObjectURL(blob),img=new preview.Image();
    img.src=url;await img.decode();assets.set(imageId,url);
   }
   if(preview.closed)return;
   const css=doc.createElement('style');
   css.textContent='@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{--print-margin:0mm;margin:0;background:#edf1f6;font-family:sans-serif;color:#203050}svg{display:block;width:100%;height:100%}article{box-sizing:border-box;background:white;width:210mm;height:297mm;padding:var(--print-margin);margin:12px auto;overflow:hidden;box-shadow:0 2px 15px #22335530}.print-actions{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;padding:12px;background:#f8fbff;border-bottom:1px solid #c7d4e8}.print-actions button{padding:10px 22px;border:0;border-radius:9px;background:#2b50b9;color:white;font-size:14px;cursor:pointer}.print-actions label{font-size:13px;display:flex;align-items:center;gap:8px}.print-actions select{padding:7px;border-radius:8px;border:1px solid #c1cbe1}@media print{.print-actions{display:none!important}body{background:#fff}article{margin:0;box-shadow:none;break-after:page}article:last-child{break-after:auto}}';
   doc.head.append(css);doc.body.replaceChildren();
   const actions=doc.createElement('div');actions.className='print-actions';
   const label=doc.createElement('label');label.textContent='ระยะขอบกระดาษ';
   const marginSelect=doc.createElement('select');
   for(const [n,labelText] of [[0,'ชิดขอบ'],[5,'5 มม.'],[10,'10 มม.'],[15,'15 มม.']]){
    const option=doc.createElement('option');option.value=String(n);option.textContent=labelText;marginSelect.append(option);
   }
   marginSelect.onchange=()=>doc.body.style.setProperty('--print-margin',marginSelect.value+'mm');
   label.append(marginSelect);
   const print=doc.createElement('button');print.textContent='พิมพ์ / บันทึก PDF';print.onclick=()=>preview.print();
   actions.append(label,print);doc.body.append(actions);
   const sheets=printableSheets(printable,assets);
   for(const markup of sheets){
    const article=doc.createElement('article');article.innerHTML=markup;doc.body.append(article);
   }
  }catch{if(!preview.closed)doc.body.textContent='เตรียมหน้ากระดาษไม่สำเร็จ กรุณาปิดหน้านี้แล้วลองพิมพ์อีกครั้ง';}
 });
 const palmToggle=$('#paper-palm-guard');
 const syncInputControls=()=>{
  $('#paper-finger').checked=finger;
  $('#paper-pencil-only').checked=!finger;
  palmToggle.checked=palmGuard;
 };
 syncInputControls();root.classList.toggle('paper-palm-guard-on',palmGuard);
 const page=()=>model.pages.find(p=>p.id===pageId)||model.pages[0];
 const continuous=()=>model.version===2;
 const canvasLimit=()=>continuous()?MAX_CANVAS_HEIGHT:PAGE_H;
 function ensureCanvasHeight(required,extra=PAGE_H){
  if(!continuous()||required<virtualHeight-180)return;
  const next=Math.min(MAX_CANVAS_HEIGHT,Math.ceil(Math.max(required+extra,PAGE_H)/PAGE_H)*PAGE_H);
  if(next>virtualHeight){virtualHeight=next;sizing();scheduleDraw();}
 }

 const say=(text,bad=false)=>{const el=$('#paper-hint');el.textContent=text;el.classList.toggle('error',bad);};
 function setPalmGuard(value){
  palmGuard=!!value;palmToggle.checked=palmGuard;
  root.classList.toggle('paper-palm-guard-on',palmGuard);
  if(palmGuard){finger=false;pointers.clear();gesture=null;cancelSmartTimer();scheduleDraw();}
  syncInputControls();
  try{
   localStorage.setItem(palmKey,String(palmGuard));
   if(palmGuard)localStorage.setItem(fingerKey,'false');
  }catch{}
  say(palmGuard?'กันฝ่ามือแล้ว · Apple Pencil เขียนได้ · ใช้ปุ่ม +/− เพื่อซูม':'ปิดกันฝ่ามือแล้ว · ใช้สองนิ้วซูมได้');
 }
 const selectIds=ids=>expandSelection(page().objects,ids);
 const currentNote=()=>space.notebook().notes.find(n=>n.id===id);
 const writable=()=>{const i=space.info();if(i.scope!==scope||!i.canEdit)throw Error('ยังเชื่อมต่อพื้นที่จดไม่ได้ กรุณารอหรือลองเชื่อมต่อใหม่');if(i.conflict)throw Error('มีการแก้พร้อมกัน เปิด “ข้อมูลและการซิงก์” เพื่อเลือกฉบับก่อน');};
 function persist(next,record=true){
  try{
   writable();const live=currentNote();if(!live)throw Error('โน้ตถูกลบจากอีกเครื่อง');
   next=validatePaper(next);const previous=model,before=page(),oldPages=model.pages;
   const added=next.pages.find(p=>!oldPages.some(old=>old.id===p.id));
   const removed=oldPages.find(p=>!next.pages.some(now=>now.id===p.id));
   const after=next.pages.find(p=>p.id===before.id);
   if(draftBase)next=mergePaper(draftBase,next,paperFor(live));
   else if(JSON.stringify(live.paper||null)!==lastStored&&live.paper)next=mergePaper(model,next,live.paper);
   const book=copy(space.notebook()),target=book.notes.find(n=>n.id===id);target.paper=next;target.updatedAt=new Date().toISOString();
   space.saveNotebook(book);model=copy(next);lastStored=JSON.stringify(next);unsaved=null;draftBase=null;try{localStorage.removeItem(draftKey);}catch{}root.classList.remove('paper-has-draft');
   if(previous.version!==next.version && record)history.record(previous,next,0,true);
   else if(record){if(added)history.record(null,added,next.pages.findIndex(p=>p.id===added.id));else if(removed)history.record(removed,null,oldPages.indexOf(removed));else if(after)history.record(before,after,oldPages.indexOf(before));}
   if(!model.pages.some(p=>p.id===pageId))pageId=model.pages[0].id;
   if(continuous())ensureCanvasHeight(pageHeight(page()),PAGE_H);
   say('บันทึกอัตโนมัติ · ปุ่มบันทึกงานใช้สั่งบันทึกทันที');draw();thumbs();return true;
  }catch(err){draftBase??=copy(model);unsaved=copy(next);try{localStorage.setItem(draftKey,JSON.stringify({paper:unsaved,base:draftBase}));}catch{}say(err.message+' · งานล่าสุดยังอยู่ในหน้านี้ กด “สำรองงานค้าง” ก่อนปิด',true);root.classList.add('paper-has-draft');return false;}
 }
 function change(fn){
  const next=copy(unsaved||model),p=next.pages.find(p=>p.id===pageId);
  fn(p,next);
  if(next.version===2){
   const actual=p.objects.reduce((max,o)=>Math.max(max,o.y+o.h),0);
   if(actual>MAX_CANVAS_HEIGHT)throw Error('กระดาษยาวถึงขีดจำกัดทางเทคนิคแล้ว กรุณาแยกเป็นสมุดใหม่');
   p.height=Math.max(pageHeight(p),continuousContentHeight(p));
  }
  return persist(next);
 }
 function scheduleDraw(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw();});}
 function draw(){
  // Keep the settled page and controls mounted while only the live ink changes.
  if(gesture?.kind==='stroke'){
   let layer=svg.querySelector('[data-live-ink]');
   if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.setAttribute('data-live-ink','');layer.setAttribute('pointer-events','none');svg.append(layer);}
   layer.innerHTML=gesture.snap?objectSVG(gesture.snap,images):objectSVG(strokeObject(gesture.points,{tool:gesture.tool,color:gesture.color,width:gesture.width}),images);
   return;
  }
  if(!editing)selected=selectIds(selected);
  const signature=[...selected].sort().join('|');
  if(signature!==lastSelectionSignature){$('#paper-selection-more').open=false;lastSelectionSignature=signature;}
  const p=page();if(model.version===2&&cachedPage!==p){const end=p.objects.reduce((v,o)=>Math.max(v,o.x+o.w),0);virtualWidth=Math.min(PAGE_W*250,Math.max(virtualWidth,(Math.ceil(end/PAGE_W)+1)*PAGE_W));sizing();}if(model.version===2&&virtualHeight<Math.min(MAX_CANVAS_HEIGHT,pageHeight(p)+PAGE_H)){
   virtualHeight=Math.min(MAX_CANVAS_HEIGHT,pageHeight(p)+PAGE_H);sizing();
  }
  const renderHeight=model.version===2?virtualHeight:PAGE_H;
  if(cachedPage!==p||cachedImageVersion!==imageVersion||cachedRenderHeight!==renderHeight){
   cachedContent=pageSVG(p,images,'paper-lines',renderHeight,canvasWidth());
   cachedPage=p;cachedImageVersion=imageVersion;cachedRenderHeight=renderHeight;
  }
  let content=cachedContent;
  if(editing&&scribbleActive){
   const preview={...editing.object,text:textarea.value,marks:editing.marks||[],links:editing.links||[],
    w:editing.paperWidth||editing.object.w,
    h:editing.paperHeight||editing.object.h};
   const objects=p.objects.some(o=>o.id===editing.id)
     ?p.objects.map(o=>o.id===editing.id?preview:o):[...p.objects,preview];
   content=pageSVG({...p,objects},images,'paper-lines',renderHeight,canvasWidth());
  }else if(editing)content=pageSVG({...p,objects:p.objects.filter(o=>o.id!==editing.id)},images,'paper-lines',renderHeight,canvasWidth());
  if(gesture?.kind==='shape'&&gesture.object)content+=objectSVG(gesture.object);
  const visible=gesture?.preview||p.objects;
  if(gesture?.preview)content=pageSVG({...p,objects:visible},images,'paper-lines',renderHeight,canvasWidth());
  const chosen=visible.filter(o=>selected.has(o.id)),box=bounds(chosen);
  const groupState=selectionGroupState(visible,selected);
  if(chosen.length>1&&!groupState.single)for(const o of chosen)content+=`<rect x="${o.x-2}" y="${o.y-2}" width="${o.w+4}" height="${o.h+4}" fill="none" stroke="#7590fc" stroke-width="1" pointer-events="none"/>`;
  const singleImage=selected.size===1&&visible.find(o=>selected.has(o.id)&&o.type==="image");
   const singleShape=selected.size===1&&visible.find(o=>selected.has(o.id)&&o.type==="shape");
   const singleTable=selected.size===1&&visible.find(o=>selected.has(o.id)&&o.type==='table');
  if(box&&!editing)content+=`<rect x="${box.x-6}" y="${box.y-6}" width="${box.w+12}" height="${box.h+12}" fill="none" stroke="#3155d9" stroke-width="2" stroke-dasharray="7 5"/>${singleImage||singleShape?imageHandles(box,scale):`<rect data-resize="true" x="${box.x+box.w-9}" y="${box.y+box.h-9}" width="18" height="18" rx="4" fill="#3155d9"/>`}`;
  if(showA4)content+=printBoundaryGuides(renderHeight,canvasWidth());
  content+=rulerSVG(ruler);
  if(gesture?.kind==='lasso')content+=`<path d="${gesture.points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')}" fill="#3155d910" stroke="#3155d9" stroke-width="2" stroke-dasharray="6 4"/>`;
  svg.innerHTML=content;tableUI.sync(!multiSelect&&['select','text'].includes(tool)&&!gesture&&singleTable);svg.dataset.tool=tool;root.dataset.paperTool=tool;
  updateContextToolBar();
  const continuous=model.version===2;
  root.dataset.paperContinuous=continuous?'true':'false';
  $('#paper-page-label').textContent=continuous?(showA4?'กระดาษอิสระ · แสดงกรอบ A4':'กระดาษอิสระ'):`หน้า ${model.pages.findIndex(p=>p.id===pageId)+1} / ${model.pages.length}`;
  for(const button of root.querySelectorAll('[data-paper="continuous"]')){
   button.hidden=continuous;
  }
  $('[data-paper="pages"]').hidden=continuous;
  for(const button of root.querySelectorAll('[data-paper="add-page"],[data-paper="duplicate-page"],[data-paper="delete-page"]'))button.hidden=continuous;
  $('#paper-template').value=p.template;
  $('[data-paper="multi"]').setAttribute('aria-pressed',String(multiSelect));
  $('#paper-shape-options').hidden=true;
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

  const currentIcon=root.querySelector('[data-shape-pick="'+$('#paper-shape').value+'"] svg');
  if(currentIcon&&shapeGallery.dataset.kind!==$('#paper-shape').value){
   shapeGallery.dataset.kind=$('#paper-shape').value;shapeGallery.replaceChildren(currentIcon.cloneNode(true));
  }
  $('[data-paper="undo"]').disabled=!history.canUndo; $('[data-paper="redo"]').disabled=!history.canRedo;
  const tools=$('#paper-selection-tools');tools.hidden=!selected.size||!!editing;$('#paper-selected-count').textContent=groupState.single?'กลุ่ม · '+selected.size:selected.size; $('[data-paper="group"]').hidden=!groupState.canGroup;$('[data-paper="ungroup"]').hidden=!groupState.canUngroup;if(!tools.hidden&&selectedDesktop.matches)requestAnimationFrame(placeSelectedTools);
   $('#paper-table-selection').hidden=!singleTable;
   if(singleTable){const palette=tableStyle(singleTable);root.querySelectorAll('[data-table-style]').forEach(input=>{if(document.activeElement!==input)input.value=palette[input.dataset.tableStyle];});}
   const globalPicker=$('#paper-global-text-color');
   if(document.activeElement!==globalPicker)globalPicker.value=editing?.object?.color||visible.find(o=>selected.has(o.id)&&o.type==='text')?.color||singleTable?.textColor||defaultTextColor;
   syncPaint();
   const shapePanel=$('#paper-shape-selection');shapePanel.hidden=!singleShape;
   if(singleShape){$('#paper-selected-shape').value=singleShape.kind;$('#paper-selected-line-style').value=singleShape.dash||singleShape.lineStyle||'solid';const angleInput=$('#paper-shape-angle');if(document.activeElement!==angleInput)angleInput.value=String(shapeAngle(singleShape.angle));}
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
  $('#paper-font-size').value=Math.round(texts[0]?.size||fontSize);
  $('#paper-default-text-size').value=fontSize;
  loadImages();
 }
 function thumbs(){
  if(model.version===2){$('#paper-page-list').replaceChildren();return;}
  if(!root.classList.contains('pages-open'))return;
  $('#paper-page-list').innerHTML=model.pages.map((p,i)=>{
   let thumb='';
   try{thumb=pageSVG(p,images,'thumb-'+p.id);}
   catch(err){thumb='<text x="20" y="80" font-size="26">รูปตัวอย่างไม่พร้อม</text>';}
   return `<button class="paper-thumb ${p.id===pageId?'active':''}" data-paper-page="${p.id}" aria-label="หน้า ${i+1}" aria-current="${p.id===pageId?'page':'false'}"><svg viewBox="0 0 ${PAGE_W} ${PAGE_H}" aria-hidden="true">${thumb}</svg><span>${i+1}</span></button>`;
  }).join('');
 }
 const missingImages=new Set(),retryImages=document.createElement('button');
 retryImages.type='button';retryImages.hidden=true;retryImages.textContent='โหลดรูปอีกครั้ง';
 $('#paper-hint').after(retryImages);
 bind(retryImages,'click',()=>{missingImages.clear();retryImages.hidden=true;loadImages();});
 function loadImages(){
  const objects=root.classList.contains('pages-open')?model.pages.flatMap(p=>p.objects):page().objects;
  for(const o of objects){if(o.type!=='image'||images.has(o.imageId)||loading.has(o.imageId)||missingImages.has(o.imageId))continue;loading.add(o.imageId);
   space.image(o.imageId).then(blob=>{if(closed)return;images.set(o.imageId,URL.createObjectURL(blob));imageVersion++;scheduleDraw();thumbs();}).catch(()=>{if(!closed){missingImages.add(o.imageId);retryImages.hidden=false;say('โหลดรูปไม่สำเร็จ',true);}}).finally(()=>loading.delete(o.imageId));
  }
 }
 function sizing(){
  const horizontalInset=window.matchMedia('(max-width:600px)').matches?18:48;
  fit=Math.min(1,Math.max(.2,(viewport.clientWidth-horizontalInset)/PAGE_W));scale=fit*zoom;
  const h=model.version===2?virtualHeight:PAGE_H;
  sheet.style.width=svg.style.width=canvasWidth()+'px';wrap.style.width=canvasWidth()*scale+'px';wrap.style.height=h*scale+'px';
  sheet.style.height=h+'px';svg.style.height=h+'px';
  svg.setAttribute('viewBox','0 0 '+canvasWidth()+' '+h);
  sheet.style.transform=`scale(${scale})`;
  $('#paper-zoom').textContent=Math.round(zoom*100)+'%';
 }
 function zoomAt(next,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const old=scale,x=(viewport.scrollLeft+cx)/old,y=(viewport.scrollTop+cy)/old;zoom=Math.min(4,Math.max(.5,next));sizing();viewport.scrollLeft=x*scale-cx;viewport.scrollTop=y*scale-cy;}
 function point(e){
  const r=svg.getBoundingClientRect(),h=model.version===2?virtualHeight:PAGE_H;
  return {x:Math.max(0,Math.min(canvasWidth(),(e.clientX-r.left)/r.width*canvasWidth())),
   y:Math.max(0,Math.min(h,(e.clientY-r.top)/r.height*h))};
 }
 function extendVisibleCanvas(){
  if(closed||model.version!==2)return;
  if(virtualWidth<PAGE_W*250&&(viewport.scrollLeft+viewport.clientWidth)/scale>virtualWidth-PAGE_W*.3){virtualWidth+=PAGE_W;cachedPage=null;sizing();scheduleDraw();}
  if(virtualHeight>=MAX_CANVAS_HEIGHT)return;
  // Blank space is virtual: browsing down never writes a new page to
  // Supabase. Only ink/text actually placed below gets persisted.
  const nearBottom=(viewport.scrollTop+viewport.clientHeight)/Math.max(scale,.01)>=virtualHeight-PAGE_H*.45;
  if(!nearBottom)return;
  virtualHeight=Math.min(MAX_CANVAS_HEIGHT,virtualHeight+PAGE_H);
  sizing();scheduleDraw();
 }
 bind(viewport,'scroll',extendVisibleCanvas,{passive:true});
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
  if(value)try{thumbs();loadImages();}catch(err){say('เปิดรายการหน้าแล้ว แต่รูปตัวอย่างบางหน้าไม่พร้อม: '+err.message,true);}
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
  cancelSmartTimer();closePenSizePicker();closeEraserMenu();finishText();pointers.clear();gesture=null;
  activePanel=['line','arrow','branch3'].includes(next)?'shape':next;
  if(next==='line'||next==='arrow'||next==='branch3'){
   $('#paper-shape').value=next;tool='shape';
  }else tool=next;
  closeExtraTools();setShapesOpen(false);
  if(typeof collapsePhoneMore==='function'&&phoneQuickTools.has(tool))collapsePhoneMore();
  if(next!=='select')multiSelect=false;
  if(!['select','text'].includes(tool))selected.clear();
  syncPenWidthControls();showTextRibbon();
  say(({shape:'เลือกชนิดรูปทรงจากไอคอน แล้วลากบนกระดาษ',
   straighten:'วาดรูปทรงหรือผังกิ่งก้าน แล้วยกปากกาเพื่อจัดเส้น',
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
 const selectionTools=$('#paper-selection-tools');
 const selectionGrip=selectionTools.querySelector('.paper-selection-drag');
 const selectedDesktop=window.matchMedia('(min-width:901px) and (pointer:fine)');
 const selectedPositionKey='ru-paper-object-toolbar-xy-v1';
 let selectionPosition=null,selectionDrag=null;
 try{
  const old=JSON.parse(localStorage.getItem(selectedPositionKey)||'null');
  if(old&&Number.isFinite(old.x)&&Number.isFinite(old.y))selectionPosition={x:old.x,y:old.y};
 }catch{}
 function placeSelectedTools(){
  if(!selectedDesktop.matches||selectionTools.hidden||!selectionTools.isConnected)return;
  const rect=selectionTools.getBoundingClientRect();
  const point=selectionPosition||{x:(window.innerWidth-rect.width)/2,y:window.innerHeight-rect.height-90};
  const x=Math.max(8,Math.min(point.x,window.innerWidth-rect.width-8));
  const y=Math.max(8,Math.min(point.y,window.innerHeight-rect.height-8));
  selectionTools.style.setProperty('--paper-selection-x',x+'px');
  selectionTools.style.setProperty('--paper-selection-y',y+'px');
 }
 bind(selectionGrip,'pointerdown',e=>{
  if(!selectedDesktop.matches||e.button!==0)return;
  e.preventDefault();
  const rect=selectionTools.getBoundingClientRect();
  selectionDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};
  selectionGrip.setPointerCapture(e.pointerId);
 });
 bind(selectionGrip,'pointermove',e=>{
  if(!selectionDrag||selectionDrag.id!==e.pointerId)return;
  e.preventDefault();
  selectionPosition={x:selectionDrag.left+e.clientX-selectionDrag.x,y:selectionDrag.top+e.clientY-selectionDrag.y};
  placeSelectedTools();
 });
 const finishSelectionDrag=e=>{
  if(selectionDrag?.id!==e.pointerId)return;
  selectionDrag=null;
  const rect=selectionTools.getBoundingClientRect();
  selectionPosition={x:rect.left,y:rect.top};
  try{localStorage.setItem(selectedPositionKey,JSON.stringify(selectionPosition));}catch{}
 };
 bind(selectionGrip,'pointerup',finishSelectionDrag);
 bind(selectionGrip,'pointercancel',finishSelectionDrag);
 bind(window,'resize',placeSelectedTools);
 bind(selectedDesktop,'change',placeSelectedTools);
 // Restore one familiar tool row. Move drawing colors out of the advanced
 // dropdown so pen/highlighter colors cannot be hidden by a clipped menu.
 const eraserMenu=$('#paper-eraser-menu');
 const eraserButton=$('[data-paper="eraser"]');
 eraserButton.setAttribute('aria-haspopup','true');
 eraserButton.setAttribute('aria-expanded','false');
 eraserButton.setAttribute('aria-controls','paper-eraser-menu');
 function closeEraserMenu(){eraserMenu.hidden=true;eraserButton.setAttribute('aria-expanded','false');}
 function toggleEraserMenu(){
  if(!eraserMenu.hidden){closeEraserMenu();return;}
  eraserMenu.hidden=false;
  const anchor=eraserButton.getBoundingClientRect(),parent=$('.paper-toolbar').getBoundingClientRect();
  eraserMenu.style.left=Math.max(6,Math.min(anchor.left-parent.left,parent.width-eraserMenu.offsetWidth-6))+'px';
  eraserButton.setAttribute('aria-expanded','true');
  for(const b of eraserMenu.querySelectorAll('[data-eraser-kind]'))
   b.setAttribute('aria-pressed',String(b.dataset.eraserKind===eraserKind));
 }
 const mainTools=$('.paper-toolset');
 // A compact phone tool dock: five common tools are always visible.
 // Less frequent tools can be expanded in place without duplicating buttons
 // or changing their event handlers, notebook data, or desktop/tablet UI.
 const phoneMore=document.createElement('button');
 phoneMore.type='button';phoneMore.className='paper-mobile-more';
 phoneMore.id='paper-mobile-more';phoneMore.setAttribute('aria-expanded','false');
 phoneMore.setAttribute('aria-label','แสดงเครื่องมือเพิ่มเติม');
 phoneMore.innerHTML='<span aria-hidden="true">⊞</span><small>เพิ่มเติม</small>';
 mainTools.append(phoneMore);
 const captureButton=document.createElement('button');
 captureButton.type='button';
 captureButton.innerHTML='<span aria-hidden="true">▣</span><small>แคปหน้าจอ</small>';
 captureButton.setAttribute('aria-label','แคปหน้าจอแล้วแทรกในสมุด');
 $('[data-paper="image"]').after(captureButton);
 const captureHelp=document.createElement('dialog');
 captureHelp.style.cssText='width:min(360px,90vw);padding:20px;border:1px solid #dce2ec;border-radius:16px;color:#203050';
 captureHelp.setAttribute('aria-label','นำภาพหน้าจอเข้าโน้ต');
 captureHelp.innerHTML='<strong>นำภาพหน้าจอเข้าโน้ต</strong><p></p><a href="#account">เปิดข้อมูลและการซิงก์</a> <button type="button">เลือกรูปหน้าจอ</button> <button type="button">ปิด</button>';
 root.append(captureHelp);
 const [chooseCapture,closeCapture]=captureHelp.querySelectorAll('button');
 bind(closeCapture,'click',()=>captureHelp.close());
 bind(chooseCapture,'click',()=>{captureHelp.close();$('#paper-image-file').click();});
 function explainCapture(conflict){
  captureHelp.querySelector('p').textContent=conflict?'สมุดมีข้อมูลสองฉบับ จึงยังเพิ่มรูปไม่ได้ เปิดข้อมูลและการซิงก์เพื่อตรวจฉบับที่จะเก็บ แล้วกลับมาเพิ่มรูปอีกครั้ง':'บน iPhone ที่มี Face ID ให้กดปุ่มด้านข้างและเพิ่มเสียงพร้อมกัน บันทึกภาพไปที่รูปภาพ แล้วกด “เลือกรูปหน้าจอ” หากใช้เครื่องอื่น ให้แคปด้วยปุ่มของเครื่องก่อน';
  captureHelp.querySelector('a').hidden=!conflict;
  chooseCapture.hidden=conflict;
  captureHelp.showModal();
 }
 bind(captureButton,'click',async()=>{
  if(space.info().conflict){explainCapture(true);return;}
  if(!navigator.mediaDevices?.getDisplayMedia){
   explainCapture(false);
   return;
  }
  captureButton.disabled=true;
  let stream;
  const video=document.createElement('video');
  video.muted=true;
  video.playsInline=true;
  const targetPage=pageId;
  try{
   writable();
   stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
   video.srcObject=stream;
   await video.play();
   if(closed||pageId!==targetPage)return;
   const canvas=document.createElement('canvas');
   const ratio=Math.min(1,1920/Math.max(video.videoWidth,video.videoHeight));
   canvas.width=Math.round(video.videoWidth*ratio);
   canvas.height=Math.round(video.videoHeight*ratio);
   canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
   stream.getTracks().forEach(track=>track.stop());
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('สร้างภาพหน้าจอไม่ได้ กรุณาลองอีกครั้ง');
   if(!closed&&pageId===targetPage)await insertImages([new File([blob],'ภาพหน้าจอ.png',{type:blob.type})]);
  }catch(error){
   if(!closed&&['NotSupportedError','TypeError'].includes(error.name)){explainCapture(false);return;}
   if(!closed)say(error.name==='NotAllowedError'?'ยังไม่ได้แชร์หน้าจอ · เลือกปุ่มรูปเพื่อนำเข้าภาพที่แคปไว้ได้':error.message,true);
  }finally{
   stream?.getTracks().forEach(track=>track.stop());
   video.srcObject=null;
   captureButton.disabled=false;
  }
 });
 const phoneQuickTools=new Set(['select','hand','pen','text','eraser']);
 bind(phoneMore,'click',()=>{
  const expanded=root.classList.toggle('paper-mobile-tools-expanded');
  phoneMore.setAttribute('aria-expanded',String(expanded));
  phoneMore.setAttribute('aria-label',expanded?'ซ่อนเครื่องมือเพิ่มเติม':'แสดงเครื่องมือเพิ่มเติม');
  const label=phoneMore.querySelector('small');
  if(label)label.textContent=expanded?'ย่อเมนู':'เพิ่มเติม';
 });
 function collapsePhoneMore(){
  root.classList.remove('paper-mobile-tools-expanded');
  phoneMore.setAttribute('aria-expanded','false');
  phoneMore.setAttribute('aria-label','แสดงเครื่องมือเพิ่มเติม');
  phoneMore.querySelector('small').textContent='เพิ่มเติม';
 }
 // Use a contextual settings strip, not a nested options popup. Keep the
 // actual controls and IDs intact so their existing event bindings survive.
 const contextWrap=document.createElement('div');
 contextWrap.className='paper-context-wrap';contextWrap.hidden=true;
 const contextBar=document.createElement('div');
 contextBar.className='paper-context-controls';contextBar.setAttribute('role','toolbar');
 contextBar.setAttribute('aria-label','การตั้งค่าของเครื่องมือที่เลือก');
 contextWrap.append(contextBar);
 // Keep the writing device and palm-protection choices visible beside the
 // drawing tools instead of burying them inside a horizontally scrolled menu.
 const inputStrip=document.createElement('div');
 inputStrip.id='paper-input-strip';inputStrip.className='paper-input-strip';
 inputStrip.setAttribute('role','group');inputStrip.setAttribute('aria-label','วิธีเขียนและป้องกันฝ่ามือ');
 inputStrip.hidden=true;
 inputStrip.append($('.paper-input-switch'),$('.paper-palm-guard'),$('.paper-geometry-check'));
 root.querySelector('.paper-toolbar').after(inputStrip,contextWrap);
 let activePanel=tool;
 const settingsRow=(name,label)=>{const node=document.createElement('div');node.className='paper-context-section paper-context-'+name;node.hidden=true;node.setAttribute('aria-label',label);contextBar.append(node);return node;};
 const inkOptions=settingsRow('ink','สีและความหนาเส้น');
 const shapeOptions=settingsRow('shape','การเลือกและปรับรูปทรง');
 const textOptions=settingsRow('text','การพิมพ์ข้อความ');
 const pageOptions=settingsRow('page','แบบหน้ากระดาษ');
 const selectOptions=settingsRow('select','การเลือกวัตถุ');
 const rulerOptions=settingsRow('ruler','องศาไม้บรรทัด');
 const mainSettings=document.createElement('button');
 mainSettings.type='button';mainSettings.dataset.paper='page-settings';
 mainSettings.textContent='เลือกกระดาษ';mainSettings.className='paper-main-settings-button';
 mainTools.append($('[data-paper="ruler"]'));
 const shortcuts=document.createElement('div');
 shortcuts.className='paper-menu-shortcuts';
 $('.paper-save').before(shortcuts);
 shortcuts.append(mainSettings,$('[data-paper="course-materials"]'));
 refreshCourseButton();
 inkOptions.hidden=false;
 shapeOptions.append($('#paper-shape-options'),$('#paper-line-options'));
 const shapeGallery=document.createElement('button');shapeGallery.type='button';shapeGallery.dataset.openShapes='context';
 shapeGallery.setAttribute('aria-label','เลือกรูปทรง');shapeGallery.title='เลือกรูปทรง';shapeOptions.prepend(shapeGallery);
 textOptions.append($('.paper-default-text-size'),$('.paper-global-ink'),$('[data-paper="scribble-text"]'));
 const boldPreset=document.createElement('button');
 boldPreset.type='button';boldPreset.textContent='B';boldPreset.style.fontWeight='700';
 boldPreset.setAttribute('aria-label','พิมพ์กล่องใหม่เป็นตัวหนา');boldPreset.setAttribute('aria-pressed',String(bold));
 textOptions.prepend(boldPreset);
 bind(boldPreset,'click',()=>{bold=!bold;boldPreset.setAttribute('aria-pressed',String(bold));});
 let showA4=false;
 try{showA4=localStorage.getItem('ru-paper-a4-guides')==='true';}catch{}
 const a4Toggle=document.createElement('button');a4Toggle.type='button';
 a4Toggle.textContent='กรอบ A4';a4Toggle.setAttribute('aria-pressed',String(showA4));
 a4Toggle.title='เปิดหรือปิดกรอบกระดาษ A4 สำหรับจัดพิมพ์';mainTools.append(a4Toggle);
 bind(a4Toggle,'click',()=>{showA4=!showA4;a4Toggle.setAttribute('aria-pressed',String(showA4));try{localStorage.setItem('ru-paper-a4-guides',String(showA4));}catch{}draw();});
 const modeLabel=document.createElement('label');
 modeLabel.innerHTML='รูปแบบ <select id="paper-mode-choice"><option value="2">กระดาษต่อเนื่อง</option><option value="1">กระดาษปกติ (A4)</option></select>';
 pageOptions.append(modeLabel,$('.paper-template-tool'));
 const modeSelect=modeLabel.querySelector('select');
 bind(modeSelect,'change',()=>{
  try{
   if(editing)finishText(true);
   const next=modeSelect.value==='1'?toPagedPaper(unsaved||model):toContinuousPaper(unsaved||model);
   if(persist(next)){
    pageId=next.pages[0].id;selected.clear();viewport.scrollTop=0;viewport.scrollLeft=0;
    virtualHeight=next.version===2?Math.min(MAX_CANVAS_HEIGHT,pageHeight(next.pages[0])+PAGE_H):PAGE_H;
    sizing();draw();thumbs();
   }
  }catch(error){say(error.message,true);}
  modeSelect.value=String(model.version);
 });
 selectOptions.append($('[data-paper="multi"]'));
 const stack=document.createElement('select');stack.setAttribute('aria-label','เลือกเลเยอร์วัตถุ');selectOptions.append(stack);
 let stackKey='';
 bind(stack,'change',()=>{selected=new Set(stack.value?[stack.value]:[]);draw();});
 const paintButton=document.createElement('button');
 paintButton.type='button';paintButton.textContent='สีรูปทรง';
 paintButton.setAttribute('aria-haspopup','dialog');
 $('#paper-shape-selection').before(paintButton);
 const palette=document.createElement('dialog');
 palette.className='paper-paint-dialog';palette.setAttribute('aria-label','สีรูปทรง');
 palette.innerHTML='<h2>สีรูปทรง</h2><label class="paint-opacity">ความทึบทั้งรูป <input type="range" min="0" max="100"><output></output></label><button type="button" class="paint-done">เสร็จสิ้น</button>';
 root.append(palette);
 const opacity=palette.querySelector('input'),output=palette.querySelector('output');
 const colors=[['ดำ','#172033'],['น้ำเงิน','#3255be'],['ฟ้า','#81bdf2'],['เขียว','#399777'],['เหลือง','#f5cc55'],['แดง','#cf535e'],['ม่วง','#9063cb'],['ขาว','#ffffff']];
 const chosenShapes=()=>page().objects.filter(o=>selected.has(o.id)&&o.type==='shape');
 const paintRows=[];
 for(const [key,label] of [['fill','สีพื้น'],['color','สีเส้น']]){
  const row=document.createElement('fieldset');
  row.innerHTML='<legend>'+label+'</legend><div class="paint-swatches"></div>';
  const swatches=row.querySelector('div');
  const apply=value=>{
   change(p=>p.objects.filter(o=>selected.has(o.id)&&o.type==='shape'&&(key!=='fill'||!isJoinable(o))).forEach(o=>{
    if(value)o[key]=value;else delete o.fill;
   }));
  };
  for(const [name,value] of colors){
   const button=document.createElement('button');button.type='button';
   button.setAttribute('aria-label',label+' '+name);button.title=name;button.dataset.value=value;
   button.style.setProperty('--swatch',value);swatches.append(button);
   bind(button,'click',()=>apply(value));
  }
  if(key==='fill'){
   const none=document.createElement('button');none.type='button';none.textContent='ไม่มีสีพื้น';none.dataset.value='';
   row.append(none);bind(none,'click',()=>apply(''));
  }
  const custom=document.createElement('label');custom.textContent='เลือกสีอื่น';
  const picker=document.createElement('input');picker.type='color';picker.setAttribute('aria-label',label+' กำหนดเอง');
  custom.append(picker);row.append(custom);bind(picker,'change',()=>apply(picker.value));
  palette.insertBefore(row,opacity.parentElement);paintRows.push({row,key,picker});
 }
 function syncPaint(){
  const shapes=chosenShapes();
  paintButton.hidden=!shapes.length;
  if(!shapes.length){if(palette.open)palette.close();return;}
  if(!palette.open)return;
  for(const {row,key,picker} of paintRows){
   const targets=key==='fill'?shapes.filter(o=>!isJoinable(o)):shapes;
   row.hidden=!targets.length;if(!targets.length)continue;
   picker.value=targets[0][key]||'#ffffff';
   for(const button of row.querySelectorAll('[data-value]')){
    button.setAttribute('aria-pressed',String(targets.every(o=>(o[key]||'').toLowerCase()===button.dataset.value)));
   }
  }
  opacity.value=Math.round((shapes[0].opacity??1)*100);
  output.textContent=shapes.every(o=>(o.opacity??1)===(shapes[0].opacity??1))?opacity.value+'%':'หลายค่า';
 }
 bind(paintButton,'click',()=>{palette.showModal();syncPaint();});
 bind(palette.querySelector('.paint-done'),'click',()=>palette.close());
 bind(opacity,'input',()=>output.textContent=opacity.value+'%');
 bind(opacity,'change',()=>change(p=>p.objects.filter(o=>selected.has(o.id)&&o.type==='shape').forEach(o=>o.opacity=Number(opacity.value)/100)));
 const order=document.createElement('span');selectOptions.append(order);
 for(const [front,label] of [[false,'ไว้หลังสุด'],[true,'ไว้หน้าสุด']]){
  const btn=document.createElement('button');btn.type='button';btn.textContent=label;order.append(btn);
  bind(btn,'click',()=>change(p=>{const group=p.objects.filter(o=>selected.has(o.id)),rest=p.objects.filter(o=>!selected.has(o.id));p.objects=front?[...rest,...group]:[...group,...rest];}));
 }

 for(const [direction,label] of [[-1,'ลงหนึ่งชั้น'],[1,'ขึ้นหนึ่งชั้น']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;order.append(button);
  bind(button,'click',()=>change(p=>{
   const indices=p.objects.map((o,i)=>i);if(direction>0)indices.reverse();
   for(const i of indices){const j=i+direction;if(j>=0&&j<p.objects.length&&selected.has(p.objects[i].id)&&!selected.has(p.objects[j].id))[p.objects[i],p.objects[j]]=[p.objects[j],p.objects[i]];}
  }));
 }
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
  inputStrip.hidden=!['pen','highlight','eraser','straighten','shape'].includes(activePanel);
  $('.paper-geometry-check').hidden=!['pen','straighten'].includes(activePanel);
  shapeOptions.hidden=activePanel!=='shape';
  textOptions.hidden=activePanel!=='text';boldPreset.hidden=!!editing;
  modeSelect.value=String(model.version);
  pageOptions.hidden=activePanel!=='page';
  selectOptions.hidden=activePanel!=='select';
  if(!selectOptions.hidden){
   const objects=page().objects,chosen=objects.filter(o=>selected.has(o.id));
   const key=JSON.stringify(objects.map(o=>[o.id,o.text?.slice(0,24)]));
   if(key!==stackKey){stackKey=key;stack.replaceChildren(new Option('เลเยอร์ · หน้าสุดก่อน',''),...objects.slice().reverse().map((o,i)=>new Option((objects.length-i)+' · '+({shape:'รูปทรง',text:o.text?.slice(0,24)||'ข้อความ',image:'รูปภาพ',stroke:'ลายมือ',table:'ตาราง'}[o.type]),o.id)));}
   stack.value=chosen.length===1?chosen[0].id:'';order.hidden=!chosen.length;
  }
  rulerOptions.hidden=activePanel!=='ruler'||!ruler.active;
  ribbon.hidden=activePanel!=='text'||!editing||!wordMenu.hidden;
  inkBar.hidden=!showInk;
  contextWrap.hidden=[inkOptions,shapeOptions,textOptions,pageOptions,selectOptions,rulerOptions,ribbon].every(el=>el.hidden);
  $('#paper-shape-options').hidden=true;
  $('#paper-line-options').hidden=activePanel!=='shape';
  const angleInput=$('#paper-ruler-angle');
  if(document.activeElement!==angleInput)angleInput.value=String(((ruler.angle%360)+360)%360);
 }
 // A temporary, native editable handwriting surface. The writing surface
 // never changes the selected object's ID or x/y page coordinates.
 let scribbleActive=false;
 const scribblePad=document.createElement('section');
 scribblePad.className='paper-scribble-panel';scribblePad.hidden=true;
 scribblePad.innerHTML='<header><b class="paper-scribble-title">✍️ เขียนในพื้นที่สีฟ้า · ข้อความไปยังกล่องเดิม</b><div class="paper-scribble-actions" role="group" aria-label="ปุ่มแก้ข้อความระหว่างเขียน"><button type="button" data-pencil-edit="backspace" aria-label="ลบตัวอักษรก่อนเคอร์เซอร์">⌫ ลบ</button><button type="button" data-pencil-edit="space">เว้นวรรค</button><button type="button" data-pencil-edit="enter">Enter ↵</button><button type="button" data-pencil-keyboard>⌨️ แป้นพิมพ์</button><button type="button" data-pencil-finish>✓ เสร็จสิ้น</button></div></header><div class="paper-scribble-formats" role="toolbar" aria-label="จัดรูปแบบตัวพิมพ์ในพื้นที่เขียน"><span class="paper-scribble-format-label">ตัวพิมพ์</span><button type="button" data-pencil-format="bold" aria-label="ตัวหนา" aria-pressed="false"><b>B</b></button><button type="button" data-pencil-format="italic" aria-label="ตัวเอียง" aria-pressed="false"><i>I</i></button><button type="button" data-pencil-format="underline" aria-label="ขีดเส้นใต้" aria-pressed="false"><u>U</u></button><span class="paper-scribble-format-label">สี</span><button type="button" data-pencil-color="#172033" class="paper-pencil-swatch" style="--pencil-ink:#172033" aria-label="สีดำ"></button><button type="button" data-pencil-color="#3155d9" class="paper-pencil-swatch" style="--pencil-ink:#3155d9" aria-label="สีน้ำเงิน"></button><button type="button" data-pencil-color="#15966d" class="paper-pencil-swatch" style="--pencil-ink:#15966d" aria-label="สีเขียว"></button><button type="button" data-pencil-color="#dc4343" class="paper-pencil-swatch" style="--pencil-ink:#dc4343" aria-label="สีแดง"></button><button type="button" data-pencil-color="#8756c6" class="paper-pencil-swatch" style="--pencil-ink:#8756c6" aria-label="สีม่วง"></button><label class="paper-pencil-custom">สีอื่น <input type="color" data-pencil-custom-color value="#172033" aria-label="เลือกสีตัวพิมพ์เพิ่มเติม"></label></div><textarea class="paper-scribble-input" lang="th" inputmode="none" spellcheck="false" aria-label="พื้นที่เขียนด้วย Apple Pencil ลงกล่องข้อความที่เลือก" placeholder="ใช้ Apple Pencil เขียนภายในพื้นที่นี้ หรือเปิดแป้นพิมพ์…"></textarea><textarea class="paper-keyboard-input" inputmode="text" lang="th" spellcheck="false" enterkeyhint="enter" aria-label="พิมพ์ข้อความด้วยแป้นพิมพ์ของ iPad" placeholder="พิมพ์ข้อความด้วยแป้นพิมพ์…" hidden></textarea>';
 viewport.append(scribblePad);

 const scribbleInput=scribblePad.querySelector('.paper-scribble-input');
 const keyboardInput=scribblePad.querySelector('.paper-keyboard-input');
 let keyboardActive=false;
 const activeScribbleInput=()=>keyboardActive?keyboardInput:scribbleInput;
 // Formatting chosen at a collapsed caret applies to future Scribble or typed input.
 // Selected text is formatted immediately using the same persisted mark ranges
 // used by the ordinary notebook editor; no separate text object is created.
 let scribblePending={};
 function scribbleSelection(){
  return {start:activeScribbleInput().selectionStart,end:activeScribbleInput().selectionEnd};
 }
 function refreshScribbleControls(){
  if(!scribbleActive||!editing)return;
  const range=scribbleSelection();
  const mark=range.end>range.start?
   (editing.marks||[]).find(m=>m.start<=range.start&&m.end>=range.end):null;
  for(const button of scribblePad.querySelectorAll('[data-pencil-format]')){
   const kind=button.dataset.pencilFormat;
   button.setAttribute('aria-pressed',String(range.end>range.start?!!mark?.[kind]:!!scribblePending[kind]));
  }
  const ink=textColor(range.end>range.start?mark?.color:(scribblePending.color||editing.object.color),editing.object.color||'#172033');
  for(const button of scribblePad.querySelectorAll('[data-pencil-color]'))
   button.setAttribute('aria-pressed',String(button.dataset.pencilColor===ink));
  const custom=scribblePad.querySelector('[data-pencil-custom-color]');
  if(document.activeElement!==custom)custom.value=ink;
 }
 function closeScribblePanel(){
  scribbleActive=false;scribblePad.hidden=true;
  keyboardActive=false;keyboardInput.hidden=true;scribbleInput.hidden=false;
  root.classList.remove('paper-scribble-open');
 }
 function openScribblePanel(){
  if(!editing)return;
  scribbleActive=true;scribblePending={};root.classList.add('paper-scribble-open');
  scribblePad.hidden=false;textarea.hidden=true;
  keyboardActive=false;
  keyboardInput.hidden=true;scribbleInput.hidden=false;
  scribbleInput.value=keyboardInput.value=textarea.value;
  // Keep inputmode fixed per field: iOS Safari does not reliably refresh
  // its software keyboard when inputmode changes on the focused textarea.
  scribblePad.querySelector('[data-pencil-keyboard]').textContent='⌨️ แป้นพิมพ์';
  fitTextBox();draw();refreshScribbleControls();
  activeScribbleInput().focus({preventScroll:true});
  const caret=activeScribbleInput().value.length;activeScribbleInput().setSelectionRange(caret,caret);
 }
 let composingScribble=false;
 for(const field of [scribbleInput,keyboardInput]){
  bind(field,'compositionstart',()=>{composingScribble=true;clearTimeout(textTimer)});
  bind(field,'compositionend',()=>{composingScribble=false;applyScribble()});
  bind(field,'input',event=>{if(!event.isComposing&&!composingScribble)applyScribble()});
  bind(field,'select',refreshScribbleControls);
 }
 function applyScribble(){
  if(!scribbleActive||!editing)return;
  const before=editing.lastText,next=activeScribbleInput().value;
  let from=0,oldEnd=before.length,newEnd=next.length;
  while(from<oldEnd&&from<newEnd&&before[from]===next[from])from++;
  while(oldEnd>from&&newEnd>from&&before[oldEnd-1]===next[newEnd-1]){oldEnd--;newEnd--;}
  editing.links=moveLinks(editing.links,before,next);
  editing.marks=moveMarks(editing.marks,before,next);
  if(newEnd>from){
   for(const [kind,value] of Object.entries(scribblePending)){
    if(value===true||kind==='color'&&value)
     editing.marks=applyTextFormat(editing.marks,next,from,newEnd,kind,value);
   }
  }
  editing.lastText=next;textarea.value=next;
  fitTextBox();draw();refreshScribbleControls();
  clearTimeout(textTimer);textTimer=setTimeout(()=>finishText(true),700);
 }
 // Native textarea text insertion keeps iPadOS Scribble recognition in place.
 // Buttons provide a reliable alternative when iPadOS does not recognize
 // handwriting for spaces, newlines, or a backward-delete gesture.
 function editScribble(action){
  if(!scribbleActive||!editing||composingScribble)return;
  const range=scribbleSelection();let from=range.start,insert='';
  if(action==='space')insert=' ';
  else if(action==='enter')insert='\n';
  else if(action==='backspace'&&from===range.end){
   if(from===0)return;
   if(typeof Intl.Segmenter==='function'){
    for(const segment of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(activeScribbleInput().value.slice(0,from)))from=segment.index;
   }else{
    from--;if(from>0&&/[\uDC00-\uDFFF]/.test(activeScribbleInput().value[from]))from--;
    while(from>0&&/[\u0300-\u036f\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/.test(activeScribbleInput().value[from]))from--;
   }
  }
  activeScribbleInput().setRangeText(insert,from,range.end,'end');
  applyScribble();
  activeScribbleInput().focus({preventScroll:true});
  refreshScribbleControls();
 }
 function formatScribble(kind,value,refocus=true){
  if(!scribbleActive||!editing||composingScribble)return;
  const range=scribbleSelection(),selected=range.end>range.start;
  if(selected){
   editing.marks=kind==='color'?
    applyTextFormat(editing.marks,activeScribbleInput().value,range.start,range.end,'color',textColor(value,editing.object.color)):
    toggleTextFormat(editing.marks,activeScribbleInput().value,range.start,range.end,kind);
   clearTimeout(textTimer);finishText(true);
  }else if(kind==='color')scribblePending.color=textColor(value,editing.object.color);
  else scribblePending[kind]=!scribblePending[kind];
  if(refocus){
   activeScribbleInput().focus({preventScroll:true});
   activeScribbleInput().setSelectionRange(range.start,range.end);
  }
  refreshScribbleControls();
 }
 // Keep the textarea selection when tapping formatting buttons on an iPad.
 bind(scribblePad.querySelector('.paper-scribble-formats'),'pointerdown',event=>{
  if(event.target.closest('button'))event.preventDefault();
 });
 for(const button of scribblePad.querySelectorAll('[data-pencil-edit]'))
  bind(button,'click',()=>editScribble(button.dataset.pencilEdit));
 for(const button of scribblePad.querySelectorAll('[data-pencil-format]'))
  bind(button,'click',()=>formatScribble(button.dataset.pencilFormat));
 for(const button of scribblePad.querySelectorAll('[data-pencil-color]'))
  bind(button,'click',()=>formatScribble('color',button.dataset.pencilColor));
 const scribbleCustom=scribblePad.querySelector('[data-pencil-custom-color]');
 bind(scribbleCustom,'input',event=>formatScribble('color',event.target.value,false));
 bind(scribbleCustom,'change',()=>{activeScribbleInput().focus({preventScroll:true});refreshScribbleControls();});
 bind(scribblePad.querySelector('[data-pencil-keyboard]'),'click',event=>{
  if(!scribbleActive||!editing||composingScribble)return;
  // A fresh, visibly editable text-mode field is focused synchronously
  // inside the user's tap. This avoids Safari retaining inputmode="none".
  const current=activeScribbleInput();
  const start=current.selectionStart,end=current.selectionEnd;
  const value=current.value;
  const next=keyboardActive?scribbleInput:keyboardInput;
  next.value=value;
  current.blur();
  current.hidden=true;
  keyboardActive=!keyboardActive;
  next.hidden=false;
  next.focus({preventScroll:true});
  next.setSelectionRange(start,end);
  event.currentTarget.textContent=keyboardActive?'✍️ กลับไปใช้ปากกา':'⌨️ แป้นพิมพ์';
  refreshScribbleControls();
 });
 bind(scribblePad.querySelector('[data-pencil-finish]'),'click',()=>{
  if(composingScribble)return;
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
  const marker=event.target.closest('[data-list-prefix]');
  if(marker){event.preventDefault();toggleTextList(marker.dataset.listPrefix);return;}
  const button=event.target.closest('[data-ribbon-scroll]');
  if(button){event.preventDefault();ribbon.scrollBy({left:Number(button.dataset.ribbonScroll)*245,behavior:'smooth'});}
 });
 // On desktop the Word toolbar floats above the canvas; it is independent
 // from the horizontally clipped tool-settings strip. Tablet and phone keep
 // the existing in-flow placement.
 const desktopRibbon=window.matchMedia('(min-width:721px) and (pointer:fine)');
 const dragGrip=ribbon.querySelector('.paper-ribbon-drag');
 let ribbonDrag=null,ribbonPoint=null;
 const savedRibbonKey='ru-paper-word-ribbon-xy-v1';
 try{
  const xy=JSON.parse(localStorage.getItem(savedRibbonKey)||'null');
  if(xy&&Number.isFinite(xy.x)&&Number.isFinite(xy.y))ribbonPoint={x:xy.x,y:xy.y};
 }catch{}
 const clampRibbon=()=>{
  if(!desktopRibbon.matches)return;
  const bounds=ribbon.getBoundingClientRect();
  const xy=ribbonPoint||{x:Math.max(12,(window.innerWidth-Math.min(790,window.innerWidth-20))/2),y:110};
  const x=Math.max(8,Math.min(xy.x,window.innerWidth-bounds.width-8));
  const y=Math.max(8,Math.min(xy.y,window.innerHeight-bounds.height-8));
  ribbon.style.left=x+'px';ribbon.style.top=y+'px';
 };
 const hostRibbon=()=>{
  if(desktopRibbon.matches){
   if(ribbon.parentElement!==root)root.append(ribbon);
   ribbon.dataset.floating='true';
   dragGrip.hidden=false;
   requestAnimationFrame(clampRibbon);
  }else{
   if(ribbon.parentElement!==contextBar)contextBar.append(ribbon);
   delete ribbon.dataset.floating;
   ribbon.style.left='';ribbon.style.top='';
   dragGrip.hidden=true;
  }
 };
 hostRibbon();
 bind(desktopRibbon,'change',hostRibbon);
 bind(window,'resize',clampRibbon);
 bind(dragGrip,'pointerdown',event=>{
  if(!desktopRibbon.matches||event.button!==0)return;
  event.preventDefault();
  ribbonDrag={id:event.pointerId,x:event.clientX,y:event.clientY,left:ribbon.offsetLeft,top:ribbon.offsetTop};
  dragGrip.setPointerCapture(event.pointerId);
 });
 bind(dragGrip,'pointermove',event=>{
  if(!ribbonDrag||ribbonDrag.id!==event.pointerId)return;
  event.preventDefault();
  ribbonPoint={x:ribbonDrag.left+event.clientX-ribbonDrag.x,y:ribbonDrag.top+event.clientY-ribbonDrag.y};
  clampRibbon();
 });
 const finishRibbonDrag=event=>{
  if(!ribbonDrag||ribbonDrag.id!==event.pointerId)return;
  ribbonDrag=null;
  ribbonPoint={x:ribbon.offsetLeft,y:ribbon.offsetTop};
  try{localStorage.setItem(savedRibbonKey,JSON.stringify(ribbonPoint));}catch{}
 };
 bind(dragGrip,'pointerup',finishRibbonDrag);
 bind(dragGrip,'pointercancel',finishRibbonDrag);
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
    const field=scribbleActive?activeScribbleInput():editing.rich?rich:textarea;
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
 // Native color pickers and toolbar inputs can blur a textarea with
 // relatedTarget=null (especially desktop Safari/Chromium). Keep the editing
 // object and a valid text selection alive until the formatting action ends.
 let formattingControlActive=false,formattingSelection=null;
 const selectedOffsets=()=>{
  if(!editing)return null;
  const live=editing.rich?richOffsets():{start:textarea.selectionStart,end:textarea.selectionEnd};
  if(live?.end>live?.start)return live;
  if(formattingControlActive)return formattingSelection||((editing.rich&&richSelection?.end>richSelection?.start)?richSelection:null);
  return live;
 };
 const menuBounds=()=>{const vv=window.visualViewport;return {left:vv?.offsetLeft||0,top:vv?.offsetTop||0,width:vv?.width||window.innerWidth,height:vv?.height||window.innerHeight};};
 function moveMenu(x,y){
  const b=menuBounds(),w=wordMenu.offsetWidth,h=wordMenu.offsetHeight;
  const left=Math.max(b.left+8,Math.min(x,b.left+b.width-w-8));
  const top=Math.max(b.top+8,Math.min(y,b.top+b.height-h-8));
  wordMenu.style.left=left+'px';wordMenu.style.top=top+'px';menuPosition={x:left,y:top};
 }
 function closeWordMenu(){
  wordMenu.hidden=true;wordMenuSelection=null;
  ribbon.hidden=activePanel!=='text'||!editing;
  if(!ribbon.hidden&&desktopRibbon.matches)requestAnimationFrame(clampRibbon);
 }
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
  ribbon.querySelector('.paper-ribbon-help').textContent=editing?'เลือกคำเพื่อจัดรูปแบบเฉพาะคำ · ไม่เลือก = ทั้งกล่อง':'แตะข้อความเพื่อแก้ · ใช้ ✍ เขียน→ตัวพิมพ์ สำหรับ Apple Pencil';
 }
 function showTextRibbon(){
  ribbon.hidden=activePanel!=='text'||!editing||!wordMenu.hidden;
  textRibbonState();
  if(!ribbon.hidden&&desktopRibbon.matches)requestAnimationFrame(clampRibbon);
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
  if(event?.type!=='contextmenu'&&window.matchMedia('(pointer:coarse)').matches){closeWordMenu();return false;}
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
  wordMenu.hidden=false;ribbon.hidden=true;
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
  const {text,marks}=readRich(),o=editing.object,available=Math.max(1,canvasWidth()-o.x);
  textMeasure.style.fontSize=o.size+'px';textMeasure.style.fontWeight=o.bold?'700':'400';
  textMeasure.style.width='max-content';textMeasure.style.maxWidth='none';textMeasure.style.whiteSpace='pre';
  textMeasure.innerHTML=formattedTextHTML({text,marks},esc,false,false);
  const hasInlineAlign=marks.some(m=>m.align);
  // Measure the longest explicit line before wrapping. Keep an existing
  // manually enlarged box as the minimum width and expand with typing, up
  // to the right paper edge. Mixed B/I/U text uses its real styled width.
  const naturalWidth=Math.ceil(Math.max(textMeasure.scrollWidth,textMeasure.getBoundingClientRect().width))+14;
  const width=Math.min(available,Math.max(32,o.w,editing.align||hasInlineAlign?(editing.alignWidth||0):0,naturalWidth));
  textMeasure.style.width=width+'px';textMeasure.style.maxWidth=width+'px';
  textMeasure.style.whiteSpace='pre-wrap';textMeasure.style.overflowWrap='anywhere';
  editing.paperWidth=width;
  editing.paperHeight=Math.min(Math.max(1,canvasLimit()-o.y),Math.max(o.h||0,Math.ceil(o.size*1.5),textMeasure.offsetHeight));
  ensureCanvasHeight(o.y+editing.paperHeight);
  rich.style.width=width+'px';
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
  let selectedBefore=selectedOffsets();
  if(!selectedBefore||selectedBefore.start===selectedBefore.end){
   const text=editing.rich?readRich().text:textarea.value;
   if(text.length){selectedBefore={start:0,end:text.length};formattingSelection=selectedBefore;}
   else{
    const o=editing.object;
    if(kind==='color')o.color=textColor(value,o.color);
    else if(kind==='size')o.size=textSize(value,o.size);
    else if(kind==='bold')o.bold=!o.bold;
    else {say('พิมพ์ข้อความก่อน แล้วเลือกคำเพื่อใช้รูปแบบนี้');return;}
    Object.assign(textarea.style,{color:o.color,fontSize:o.size+'px',fontWeight:o.bold?'700':'400'});
    textarea.focus({preventScroll:true});fitTextBox();textRibbonState();return;
   }
  }
  // When a native color picker takes focus, the browser may collapse the
  // visible range. Restore the range before switching textarea → rich editor.
  if(!editing.rich){
   textarea.setSelectionRange(selectedBefore.start,selectedBefore.end);
   activateRich();
  }
  const before=readRich(),current=richOffsets();
  const range=current?.end>current?.start?current:(formattingSelection?.end>formattingSelection?.start?formattingSelection:richSelection)||selectedBefore;
  if(!range||range.start===range.end)return;
  if(kind==='align'&&!editing.alignWidth)editing.alignWidth=Math.min(canvasWidth()-editing.object.x,Math.max(editing.object.w,420));
  const marks=kind==='size'?applyTextFormat(before.marks,before.text,range.start,range.end,'size',textSize(value,editing.object.size)):
   kind==='color'?applyTextFormat(before.marks,before.text,range.start,range.end,'color',textColor(value,editing.object.color)):
   kind==='align'?applyTextFormat(before.marks,before.text,range.start,range.end,'align',value):
   toggleTextFormat(before.marks,before.text,range.start,range.end,kind);
  rich.innerHTML=formattedTextHTML({text:before.text,marks},esc,false,false);
  rich.focus();selectRichOffsets(range.start,range.end);
  formattingSelection={start:range.start,end:range.end};
  editing.marks=marks;
  fitRichBox();textRibbonState();
  clearTimeout(textTimer);textTimer=setTimeout(()=>finishText(true),450);
 }
 // List markers are real plain-text prefixes, not extra SVG decorations:
 // word formatting, links, copying and old saved notes retain their offsets.
 function toggleTextList(kind){
  if(!editing){say('ดับเบิลคลิกข้อความที่ต้องการ แล้วเลือกสัญลักษณ์รายการ',true);return;}
  const wasRich=editing.rich;
  const value=wasRich?readRich():{text:textarea.value,marks:editing.marks||[]};
  const range=wasRich?(richOffsets()||richSelection):{start:textarea.selectionStart,end:textarea.selectionEnd};
  if(!range)return;
  let next;
  try{next=applyListPrefix(value.text,range.start,range.end,kind);}catch(err){say(err.message,true);return;}
  let marks=value.marks||[],links=editing.links||[];
  for(const op of next.operations){
   marks=moveMarks(marks,op.before,op.after);
   links=moveLinks(links,op.before,op.after);
  }
  editing.marks=marks;editing.links=links;editing.lastText=next.text;
  if(wasRich){
   rich.innerHTML=formattedTextHTML({text:next.text,marks},esc,false,false);
   rich.focus();selectRichOffsets(next.start,next.end);fitRichBox();
  }else{
   textarea.value=next.text;
   textarea.focus({preventScroll:true});
   textarea.setSelectionRange(next.start,next.end);
   fitTextBox();
  }
  textRibbonState();clearTimeout(textTimer);
  textTimer=setTimeout(()=>finishText(true),450);
 }
 function fitTextBox(){
  if(!editing)return;
  const o=editing.object;
  // Reset temporary measurements on every keystroke: stale widths must not stick.
  textMeasure.style.display='inline-block';textMeasure.style.width='max-content';
  textMeasure.style.maxWidth='none';textMeasure.style.whiteSpace='pre';
  textMeasure.style.overflowWrap='normal';textMeasure.style.lineHeight='1.5';
  textMeasure.textContent=textarea.value;
  const availableWidth=Math.max(1,canvasWidth()-o.x);
  // Measure unwrapped text first. Growing only the textarea's height would
  // cause premature line breaks (notably when returning to a saved text box).
  const naturalWidth=Math.ceil(Math.max(textMeasure.scrollWidth,textMeasure.getBoundingClientRect().width))+14;
  const width=Math.min(availableWidth,Math.max(32,o.w,editing.alignWidth||0,naturalWidth));
  editing.paperWidth=width;
  // Compute the real height at the actual paper width on every device,
  // including desktop and Pencil. Only wrap at the paper's right edge or
  // where the user explicitly entered a newline.
  textMeasure.style.width=width+'px';textMeasure.style.maxWidth=width+'px';
  textMeasure.style.whiteSpace='pre-wrap';textMeasure.style.overflowWrap='anywhere';
  editing.paperHeight=Math.min(Math.max(1,canvasLimit()-o.y),Math.max(o.h||0,Math.ceil(o.size*1.5),textMeasure.offsetHeight+3));
  ensureCanvasHeight(o.y+editing.paperHeight);
  // Keep a comfortable editing target on iPad/phones even when the
  // text object itself is short. As text grows, the target expands past 250px
  // and the saved box uses its naturally measured width.
  const visualWidth=Math.min(availableWidth,Math.max(250,width));
  textarea.style.width=visualWidth+'px';
  textarea.style.overflowY='hidden';
  textarea.style.height='1px';
  const height=Math.min(Math.max(1,canvasLimit()-o.y),Math.max(editing.paperHeight,textarea.scrollHeight));
  ensureCanvasHeight(o.y+height);
  textarea.style.height=height+'px';
  if(textarea.scrollHeight>height)textarea.style.overflowY='auto';
 }
 function rememberWord(){
  if(!editing)return;
  const range=editing.rich?(richOffsets()||richSelection):{start:textarea.selectionStart,end:textarea.selectionEnd};
  const content=editing.rich?readRich().text:textarea.value;
  if(editing.rich&&range)richSelection=range;
  if(range&&range.end>range.start){
   wordSelection={pageId,id:editing.id,start:range.start,end:range.end,text:content};
   formattingSelection={start:range.start,end:range.end};
  }else if(!formattingControlActive){
   wordSelection=null;formattingSelection=null;
  }
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
  const result=await chooseWordTarget(range.text.slice(range.start,range.end),old,currentNote().files||[],space);
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
  formattingSelection=null;formattingControlActive=false;
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
  if(scribbleActive&&composingScribble)return;
  const wasScribble=scribbleActive;
  if(!keepOpen){closeWordMenu();closeScribblePanel();}
  clearTimeout(textTimer);
  if(!editing)return;
  const edit=editing;
  if(edit.rich)fitRichBox();
  const content=edit.rich?readRich():{text:textarea.value,marks:edit.marks||[]};
  const w=parseFloat(textarea.style.width),h=parseFloat(textarea.style.height);
  const o={...edit.object,text:content.text,w:edit.paperWidth??w,h:edit.paperHeight??h};
  if(edit.align)o.align=edit.align;
  if(edit.links.length)o.links=edit.links;else delete o.links;
  if(content.marks.length)o.marks=content.marks;else delete o.marks;
  if(!keepOpen){
   editing=null;rich.hidden=true;textarea.hidden=true;richSelection=null;
   formattingSelection=null;formattingControlActive=false;
   if(edit.mobile){
     root.classList.remove('paper-is-editing');
     if(edit.view){zoom=edit.view.zoom;sizing();viewport.scrollLeft=edit.view.left;viewport.scrollTop=edit.view.top;}
    }
   showTextRibbon();
  }
  if(edit.fresh&&!o.text.trim()){selected.clear();draw();return;}
  const unchanged=!edit.fresh&&o.text===edit.object.text&&o.w===edit.object.w&&o.h===edit.object.h&&o.align===edit.object.align&&o.bold===edit.object.bold&&JSON.stringify(o.marks||[])===JSON.stringify(edit.object.marks||[])&&JSON.stringify(o.links||[])===JSON.stringify(edit.object.links||[]);
  if(unchanged){if(!keepOpen)draw();return;}
  if(change(p=>{const i=p.objects.findIndex(v=>v.id===o.id);if(i>=0)p.objects[i]=o;else p.objects.push(o);})&&keepOpen){edit.object=o;edit.fresh=false;}
 }
 bind(textarea,'select',rememberWord);
 for(const linkButton of root.querySelectorAll('[data-paper="word-link"]'))bind(linkButton,'pointerdown',e=>{if(editing){rememberWord();e.preventDefault();}});
 bind(ribbon,'pointerdown',e=>{
   const formatTarget=e.target.closest('button,input,select,label');
   if(formatTarget&&editing){
    rememberWord();formattingControlActive=true;
   }
   // Buttons never need focus, so keep the selection highlighted.
   // Do not cancel pointerdown on input[type=color]: that would block the
   // operating system's color picker from opening.
   if(e.target.closest('button'))e.preventDefault();
  });
 bind(ribbon,'focusin',e=>{
  if(editing&&e.target.matches('input,select,button')){
   rememberWord();formattingControlActive=true;
  }
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
  if(!closed&&!scribbleActive&&!editing?.rich&&!formattingControlActive&&!e.relatedTarget?.closest?.('.paper-text-ribbon,.paper-word-menu,.paper-scribble-panel')){rememberWord();finishText();}
 });
 bind(rich,'input',()=>{
  if(!editing?.rich)return;
  const current=readRich();editing.links=moveLinks(editing.links,editing.lastText,current.text);editing.lastText=current.text;
  richSelection=richOffsets();fitRichBox();textRibbonState();
  clearTimeout(textTimer);textTimer=setTimeout(()=>finishText(true),1200);
 });
  // Normal selection uses the existing text ribbon. Only an explicit right-click
 // switches to the alternative menu, and never displays both toolbars.
 for(const editor of [textarea,rich]){
  bind(editor,'contextmenu',e=>{if(showWordMenu(e))e.preventDefault();});
  bind(editor,'mouseup',e=>{if(e.button===0){closeWordMenu();rememberWord();}});
  bind(editor,'touchend',()=>{closeWordMenu();rememberWord();});
 }
 bind(wordMenu,'pointerdown',e=>{
  if(editing){rememberWord();formattingControlActive=true;}
  if(e.target.closest('button'))e.preventDefault();
 });
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
  if(button.hasAttribute('data-word-menu-close')){restoreMenuSelection();closeWordMenu();textRibbonState();return;}
  if(button.hasAttribute('data-word-menu-done')){finishText();return;}
  if(!range||!restoreMenuSelection()){closeWordMenu();return;}
  try{
   if(button.dataset.wordMenuPrefix){toggleTextList(button.dataset.wordMenuPrefix);return;}
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
bind(rich,'keyup',()=>{
  richSelection=richOffsets();
  if(richSelection?.end>richSelection?.start)formattingSelection=richSelection;
  else if(!formattingControlActive)formattingSelection=null;
  textRibbonState();
 });
 bind(rich,'pointerup',()=>{
  richSelection=richOffsets();
  if(richSelection?.end>richSelection?.start)formattingSelection=richSelection;
  else if(!formattingControlActive)formattingSelection=null;
  textRibbonState();
 });
 bind(rich,'blur',e=>{
  if(!closed&&!formattingControlActive&&!e.relatedTarget?.closest?.('.paper-text-ribbon,.paper-word-menu')){
   rememberWord();finishText();
  }
 });
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
  getScale:()=>scale,getCanvasLimit:canvasLimit,onSaved:tableId=>{multiSelect=false;setTool('select');selected=new Set([tableId]);draw();},say});
 // In-app Word-style right-click menu. This is local to the notebook canvas,
 // so browser menus elsewhere in the application are not affected.
 const canvasMenu=$('#paper-context-menu');
 let contextAnchor={x:100,y:100},objectClipboard=[];
 const closeCanvasMenu=()=>{canvasMenu.hidden=true;};
 function showCanvasMenu(event){
  if(!event.target.closest('#paper-sheet'))return;
  // Text with a highlighted range uses the existing rich-text mini toolbar;
  // a new right-click elsewhere must replace it, not fall through to Safari.
  if(!wordMenu.hidden&&event.target.closest('#paper-text-input,#paper-rich-editor'))return;
  closeWordMenu();
  event.preventDefault();
  const at=point(event);
  contextAnchor={x:Math.max(0,Math.min(canvasWidth(),at.x)),y:Math.max(0,Math.min(canvasLimit(),at.y))};
  const target=[...page().objects].reverse().find(o=>
   o.type==='stroke'?strokeHit(o,at,8/scale):
   o.type==='shape'?shapeContains(o,at,8/scale):contains(at,o,3/scale));
  // A right-click on an existing object should select that exact object,
  // including when the pen or highlighter was the previous tool.
  if(target){
   if(editing)finishText();
   if(tool!=='select')setTool('select');
   if(!selected.has(target.id))selected=selectIds([target.id]);
   draw();
  }else{
   if(editing)finishText();
   selected.clear();draw();
  }
  const any=selected.size>0;
  const shape=any&&page().objects.some(o=>selected.has(o.id)&&o.type==='shape');
  const onlyText=any&&selected.size===1&&page().objects.some(o=>selected.has(o.id)&&o.type==='text');
  const visible={
   'edit-text':onlyText,'copy':any,'paste':!!objectClipboard.length,
   duplicate:any,group:selectionGroupState(page().objects,selected).canGroup,ungroup:selectionGroupState(page().objects,selected).canUngroup,'rotate-left':shape,'rotate-right':shape,delete:any,
   'add-text':!any,'select-tool':true,'pen-tool':true,undo:true,redo:true
  };
  for(const button of canvasMenu.querySelectorAll('[data-context-action]')){
   button.hidden=!visible[button.dataset.contextAction];
   button.disabled=button.dataset.contextAction==='undo'?!history.canUndo:
    button.dataset.contextAction==='redo'?!history.canRedo:false;
  }
  $('#paper-context-caption').textContent=any
   ?(selected.size>1?'เลือก '+selected.size+' วัตถุ':
     ({text:'ข้อความ',shape:'รูปทรง',image:'รูปภาพ',stroke:'เส้นปากกา',table:'ตาราง'}[target?.type]||'วัตถุ'))
   :'คำสั่งบนกระดาษ';
  closeWordMenu();
  canvasMenu.hidden=false;
  const left=Math.max(8,Math.min(event.clientX,window.innerWidth-canvasMenu.offsetWidth-8));
  const top=Math.max(8,Math.min(event.clientY,window.innerHeight-canvasMenu.offsetHeight-8));
  canvasMenu.style.left=left+'px';canvasMenu.style.top=top+'px';
 }
 bind(root,'contextmenu',showCanvasMenu);
 const inkTools=new Set(['pen','highlight','eraser','straighten','shape']);
 function guardInkSelection(e){
  if(!inkTools.has(tool)||e.target.closest('input,textarea,select,[contenteditable="true"],dialog'))return;
  if(e.target.closest('#paper-sheet,.paper-bottom,.paper-header,.paper-toolbar'))e.preventDefault();
 }
 bind(root,'selectstart',guardInkSelection);
 bind(root,'contextmenu',guardInkSelection);
 function pointerDown(e){
  // The phone's More drawer must never remain over the paper after the user
  // starts working with a tool or selects a shape/text box.
  if(root.classList.contains('paper-mobile-tools-expanded'))collapsePhoneMore();
  if(e.pointerType==='pen'&&inkTools.has(tool)){
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
   if(item&&!(tool==='select'&&item.groupId)){e.preventDefault();try{tableUI.open(item,Number(cell.dataset.tableRow),Number(cell.dataset.tableCol));}catch(err){say(err.message,true);}return;}
  }
  const guardedTextTap=e.pointerType==='touch'&&palmGuard&&tool==='text'&&e.isPrimary!==false&&!multiSelect&&page().objects.some(o=>o.type==='text'&&contains(point(e),o,2));
  if(e.pointerType==='touch'&&((palmGuard&&!guardedTextTap&&!(['select','hand'].includes(tool)&&e.isPrimary!==false))||[...pointers.values()].some(p=>p.pointerType==='pen'))){if(e.cancelable)e.preventDefault();return;}
  if(e.target.closest('[data-word-link],[data-word-file]')&&['text','select','hand'].includes(tool)&&!multiSelect&&!e.shiftKey)return;
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
  if(tool==='hand'||e.pointerType==='touch'&&!finger&&['pen','highlight','eraser','straighten','shape'].includes(tool)){gesture={kind:'pan',px:e.clientX,py:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};return;}
  try{writable();}catch(err){say(err.message,true);return;}
  if((tool==='select'||tool==='text')&&(e.shiftKey||multiSelect)){
   tool='select';
   const hit=[...page().objects].reverse().find(o=>o.type==='stroke'?strokeHit(o,p,8):(o.type==='shape'?shapeContains(o,p,8):contains(p,o,0)));
   if(hit){
    const alreadySelected=selected.has(hit.id);
    selected=selectIds([...selected,hit.id]);
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
   const hit=edge?page().objects.find(o=>selected.has(o.id)&&(o.type==='image'||o.type==='shape')):[...page().objects].reverse().find(o=>o.type==='stroke'?strokeHit(o,p,8):(o.type==='shape'?shapeContains(o,p,8):contains(p,o,0)));
   if(hit?.type==='shape'&&edge){selected=new Set([hit.id]);gesture={kind:'shape-resize',edge,shape:hit,start:p,before:copy(page().objects)};draw();return;}
   if(hit?.type==='image'&&!(tool==='select'&&hit.groupId)&&(edge||tool==='text'||selected.size<=1||!selected.has(hit.id))){
    selected=new Set([hit.id]);gesture={kind:edge?'image-resize':'move',edge,image:hit,start:p,before:copy(page().objects)};draw();return;
   }
  }
  if(tool==='text'){
   const table=[...page().objects].reverse().find(o=>o.type==='table'&&contains(p,o));
   if(table){selected=new Set([table.id]);tableUI.open(table);draw();return;}
   const target=findTextToContinue(p);
   startText(target||{id:uid(),type:'text',x:Math.min(p.x,canvasWidth()-32),y:Math.min(p.y,canvasLimit()-Math.ceil(fontSize*1.5)),w:32,h:Math.ceil(fontSize*1.5),text:'',size:fontSize,color:defaultTextColor,bold});
   if(target)say('กำลังเขียนต่อในกล่องเดิม · เขียนจากเคอร์เซอร์ได้เลย');
   return;
  }
  if(tool==='select'){
   const box=bounds(page().objects.filter(o=>selected.has(o.id)));
   if(box&&contains(p,{x:box.x+box.w-15,y:box.y+box.h-15,w:30,h:30})){gesture={kind:'resize',start:p,before:copy(page().objects),box};return;}
   const hit=[...page().objects].reverse().find(o=>o.type==='stroke'?strokeHit(o,p,8):(o.type==='shape'?shapeContains(o,p,8):contains(p,o,0)));
   if(hit){if(!selected.has(hit.id))selected=selectIds([hit.id]);gesture={kind:'move',start:p,before:copy(page().objects)};}
   else if(box&&selectionGroupState(page().objects,selected).single&&contains(p,box)){gesture={kind:'move',start:p,before:copy(page().objects)};}
   else{selected.clear();gesture={kind:'lasso',points:[p]};}draw();return;
  }
  if(tool==='shape'){
   const kind=$('#paper-shape').value;
   const join=isJoinable({type:'shape',kind})&&kind!=='branch3';
   gesture={kind:'shape',id:uid(),shape:kind,start:join?snapLinePoint(p,page().objects,10/scale):p,join,color,width,lineStyle};
   return;
  }
  if(tool==='eraser'){gesture={kind:'erase',eraseMode:eraserKind,last:p,before:copy(page().objects),preview:copy(page().objects)};sweepErase(gesture,p);scheduleDraw();return;}
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
   const y=Math.max(-PAGE_H,Math.min(canvasLimit()-h,o.y+(o.h-h)/2+((a.y+b.y)/2-gesture.cy)/scale));
   gesture.preview=gesture.before.map(item=>item.id===o.id?{...o,x,y,w,h}:item);scheduleDraw();return;
  }
  if(gesture.kind==='pinch'&&pointers.size>=2){const [a,b]=[...pointers.values()],r=viewport.getBoundingClientRect(),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;zoomAt(gesture.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(10,gesture.distance),cx-r.left,cy-r.top);viewport.scrollLeft-=cx-gesture.cx;viewport.scrollTop-=cy-gesture.cy;gesture.cx=cx;gesture.cy=cy;return;}
  if(gesture.kind==='pan'){viewport.scrollLeft=gesture.left-(e.clientX-gesture.px);viewport.scrollTop=gesture.top-(e.clientY-gesture.py);return;}
  const p=point(e);
  if(gesture.kind==='ruler-move'){
   ruler.x=Math.max(30,Math.min(canvasWidth()-30,gesture.startX+p.x-gesture.start.x));
   ruler.y=Math.max(30,Math.min(canvasLimit()-30,gesture.startY+p.y-gesture.start.y));scheduleDraw();return;
  }
  if(gesture.kind==='ruler-rotate'){
   ruler.angle=Math.round(Math.atan2(p.y-ruler.y,p.x-ruler.x)*180/Math.PI/5)*5; scheduleDraw();return;
  }
  if(gesture.kind==='shape'){
   gesture.object=makeShape(gesture.id,gesture.shape,gesture.start,gesture.join?snapLinePoint(p,page().objects,10/scale):p,gesture.color,gesture.width,gesture.lineStyle);
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
   const groupBounds=bounds(gesture.before.filter(o=>selected.has(o.id)));
   const dx=groupBounds?Math.max(-groupBounds.x,Math.min(canvasWidth()-groupBounds.x-groupBounds.w,p.x-gesture.start.x)):0;
   const dy=groupBounds?Math.max(-groupBounds.y,Math.min(canvasLimit()-groupBounds.y-groupBounds.h,p.y-gesture.start.y)):0;
   gesture.preview=gesture.before.map(o=>{
    if(!selected.has(o.id))return o;
    if(selected.size>1){const moved={...o,x:o.x+dx,y:o.y+dy};ensureCanvasHeight(moved.y+moved.h);return moved;}
    const moved={...o,x:Math.max(-o.w/2,Math.min(canvasWidth()-o.w/2,o.x+p.x-gesture.start.x)),y:Math.max(-o.h/2,Math.min(canvasLimit()-o.h/2,o.y+p.y-gesture.start.y))};
    ensureCanvasHeight(moved.y+moved.h);
    return selected.size===1?snapMovedLine(moved,targets,10/scale):moved;
   });
  }
  else if(gesture.kind==='image-resize')gesture.preview=gesture.before.map(o=>o.id===gesture.image.id?resizeImage(o,gesture.edge,p.x-gesture.start.x,p.y-gesture.start.y):o);
   else if(gesture.kind==='shape-resize')gesture.preview=gesture.before.map(o=>o.id===gesture.shape.id?resizeShape(o,gesture.edge,p.x-gesture.start.x,p.y-gesture.start.y):o);
  else if(gesture.kind==='resize'){
   const b=gesture.box,dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
   const desired=Math.max(.15,Math.min(4,Math.max((p.x-b.x)/Math.max(1,b.w),(p.y-b.y)/Math.max(1,b.h))));
   const f=Math.min(desired,Math.max(.01,(canvasWidth()-b.x)/Math.max(1,b.w)),Math.max(.01,(canvasLimit()-b.y)/Math.max(1,b.h)));
   gesture.preview=gesture.before.map(o=>{
    if(!selected.has(o.id))return o;
    if(selected.size>1){const next=scaleGroupObject(o,b,f);ensureCanvasHeight(next.y+next.h);return next;}
    if(o.type==='text'){
     // Dragging the corner changes only the editable box dimensions.
     // Font size and per-word formatting are deliberately untouched.
     const next={...o,w:Math.max(32,Math.min(canvasWidth()-o.x,o.w+dx)),h:Math.max(o.size*1.5,Math.min(canvasLimit()-o.y,o.h+dy))};
     ensureCanvasHeight(next.y+next.h);return next;
    }
    return {...o,x:b.x+(o.x-b.x)*f,y:b.y+(o.y-b.y)*f,w:Math.max(1,o.w*f),h:Math.max(1,o.h*f)};
   });
  }
  scheduleDraw();
 }
 function sweepErase(g,p){g.preview=g.preview.filter(o=>!eraserTargetHit(o,g.last,p,g.eraseMode,10/scale));g.last=p;}
 function pointerUp(e){
  if(!pointers.has(e.pointerId))return;const g=gesture;
  cancelSmartTimer();
  if(g?.kind==='erase'&&e.type==='pointerup')sweepErase(g,point(e));
  if(g?.kind==='stroke'&&e.type==='pointerup'){const p=point(e),to=g.rulerEdge?rulerProject(p,ruler,g.rulerEdge):p;g.points.push([to.x,to.y,e.pointerType==='pen'&&e.pressure>0?e.pressure:.5]);}
  pointers.delete(e.pointerId);if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
  if(g?.kind==='pinch'){if(pointers.size<2)gesture=null;return;}
  gesture=null;
  if(g?.multiTap&&!g.moved&&g.alreadySelected&&e.type==='pointerup')for(const member of selectIds([g.multiTap]))selected.delete(member);
  // Mouse clicks can lose their native dblclick event when the SVG rerenders
   // its selection outline between clicks. Detect the same object twice.
   if(e.type==='pointerup'&&e.pointerType==='mouse'&&['select','hand'].includes(tool)
      &&(g?.kind==='move'&&!g.preview||g?.kind==='pan')){
    const at=point(e),hit=[...page().objects].reverse().find(o=>o.type==='text'&&contains(at,o,4/scale));
    const previous=lastMouseTextTap,now=Date.now();
    lastMouseTextTap=hit?{id:hit.id,time:now,x:at.x,y:at.y}:null;
    if(hit&&previous?.id===hit.id&&now-previous.time<550&&Math.hypot(at.x-previous.x,at.y-previous.y)<15){
     lastMouseTextTap=null;
     if(tool==='hand')setTool('select');
     startText(hit);return;
    }
   }
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
   let result,branches;
   if(g.straighten){
    // The old implementation connected the first/last samples as a line,
    // destroying circles whenever the stroke began and ended together.
    // Recognize the whole gesture when the Pencil is lifted instead.
    const found=recognizeDrawnShape(g.points);
    const segments=diagramSegments(g.points);
    // Keep recognition of closed outlines. Open corners and retraced branches
    // are represented by individual lines so the next stroke can snap to them.
    if(segments&&(!found||found.kind==='line'||hasBranchJunction(segments))){
     branches=segments.map(({start,end})=>{
      const horizontal=start.y===end.y;
      const a=snapLinePoint(start,page().objects,8/scale),b=snapLinePoint(end,page().objects,8/scale);
      const level=horizontal?(a!==start?a.y:b!==end?b.y:start.y):(a!==start?a.x:b!==end?b.x:start.x);
      return makeShape(uid(),'line',horizontal?{x:a.x,y:level}:{x:level,y:a.y},horizontal?{x:b.x,y:level}:{x:level,y:b.y},g.color,g.width,lineStyle);
     });
    }else if(found){
     result=makeShape(uid(),found.kind,found.start,found.end,g.color,g.width,lineStyle);
     if(found.inverted)result.inverted=true;
    }
    else if(g.snap)result=g.snap;
   }
   else if(g.snap)result=g.snap;
   else if(g.rulerEdge&&g.points.length>1){
    const first=g.points[0],last=g.points.at(-1);
    result=makeShape(uid(),'line',{x:first[0],y:first[1]},{x:last[0],y:last[1]},g.color,g.width,lineStyle);
   }
   if(branches)change(p=>p.objects.push(...branches));
   else if(result)change(p=>p.objects.push(result));
   else if(g.points.length>1){const stroke=strokeObject(g.points,{tool:g.tool,color:g.color,width:g.width});change(p=>p.objects.push(stroke));}
  }
  else if(g?.kind==='shape'&&e.type==='pointerup'){
   const end=point(e);
   if(Math.hypot(end.x-g.start.x,end.y-g.start.y)>2){
    const shape=makeShape(g.id,g.shape,g.start,g.join?snapLinePoint(end,page().objects,10/scale):end,g.color,g.width,g.lineStyle);
    if(change(p=>p.objects.push(shape))){tool='select';selected=new Set([shape.id]);$('#paper-geometry-menu').open=false;setShapesOpen(false);showTextRibbon();}
   }
  }
  else if(g?.preview&&e.type!=='pointercancel')change(p=>{p.objects=g.preview;});
  else if(g?.kind==='lasso'){selected=new Set(page().objects.filter(o=>o.type==='stroke'?o.points.some(pt=>inPolygon({x:o.x+pt[0]*o.w,y:o.y+pt[1]*o.h},g.points)):inPolygon({x:o.x+o.w/2,y:o.y+o.h/2},g.points)).map(o=>o.id));}
  draw();if(pendingRemote)refresh(space);
 }
 bind(svg,'click',e=>{
  const link=e.target.closest('[data-word-link],[data-word-file]');if(!link)return;
  if(!['text','select','hand'].includes(tool)||multiSelect||e.shiftKey){e.preventDefault();return;}
  if(link.dataset.wordFile){
   const file=currentNote()?.files?.find(f=>f.id===link.dataset.wordFile);
   if(file)openNoteFile(file,space).catch(err=>say(err.message,true));else say('ไฟล์แนบนี้ถูกลบแล้ว',true);
  }
 });
 bind(svg,'pointerdown',pointerDown);bind(svg,'pointermove',pointerMove);bind(svg,'pointerup',pointerUp);bind(svg,'pointercancel',pointerUp);
 bind(svg,'lostpointercapture',e=>{if(pointers.delete(e.pointerId)){cancelSmartTimer();gesture=null;scheduleDraw();}});
 function editFromDesktopDoubleClick(e){
   if(editing||!['select','text','hand'].includes(tool))return false;
   // Resolve the text by page coordinates instead of the event's SVG child,
   // which may have been re-rendered after the first click.
   const p=point(e);
   const o=[...page().objects].reverse().find(item=>
    (item.type==='text'||item.type==='table')&&contains(p,item,3/scale));
   if(!o)return false;
   e.preventDefault();
   if(tool==='hand')setTool('select');
   if(o.type==='table')tableUI.open(o);else startText(o);
   return true;
 }
 bind(svg,'dblclick',e=>{editFromDesktopDoubleClick(e);});
 bind(svg,'click',e=>{
  // Some desktop browsers dispatch the second click but not dblclick when
  // the selection rectangle is replaced on the first click.
  if(e.detail>=2)editFromDesktopDoubleClick(e);
 });
 bind(viewport,'wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();const r=viewport.getBoundingClientRect();zoomAt(zoom*Math.exp(-e.deltaY*.005),e.clientX-r.left,e.clientY-r.top);}},{passive:false});
 async function insertImages(files){
  finishText();loadingImages++;try{for(const file of files){writable();say('กำลังส่งรูปขึ้น Supabase…');const imageId=await space.uploadImage(file);if(closed)return;const url=URL.createObjectURL(file),img=new Image();img.src=url;await img.decode();if(closed){URL.revokeObjectURL(url);return;}images.set(imageId,url);imageVersion++;const w=Math.min(620,img.naturalWidth),height=Math.min(900,w*img.naturalHeight/img.naturalWidth),actualW=height*img.naturalWidth/img.naturalHeight;
   const visibleTop=continuous()?viewport.scrollTop/Math.max(scale,.01):0;
   const imageY=Math.min(canvasLimit()-height,Math.max(80,visibleTop+70));
   ensureCanvasHeight(imageY+height);
   const o={id:uid(),type:'image',x:(PAGE_W-actualW)/2,y:imageY,w:actualW,h:height,imageId};if(change(p=>p.objects.push(o))){selected=new Set([o.id]);tool='select';collapsePhoneMore();draw();}}
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
  try{status.textContent='กำลังอัปโหลดเอกสาร…';const item=await readAttachment(file,space);if(closed)return;updateFiles(files=>[...files,item]);await space.flush();status.textContent='บันทึกไฟล์แนบแล้ว';}
  catch(err){status.textContent=err.message;}finally{input.value='';input.disabled=false;}
 });
 bind($('#paper-file-list'),'click',async e=>{
  const {download,remove}=e.target.dataset,file=currentNote()?.files?.find(f=>f.id===(download||remove));if(!file)return;
  try{if(download)await downloadAttachment(file,space);else {
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
   if(b.dataset.contextAction){
    const cmd=b.dataset.contextAction;closeCanvasMenu();
    if(cmd==='copy'){
     objectClipboard=copy(page().objects.filter(o=>selected.has(o.id)));
     say('คัดลอก '+objectClipboard.length+' วัตถุแล้ว · คลิกขวาที่ตำแหน่งที่จะวาง');return;
    }
    if(cmd==='paste'&&objectClipboard.length){
     const box=bounds(objectClipboard);
     if(!box)return;
     const dx=Math.max(-box.x,Math.min(canvasWidth()-box.x-box.w,contextAnchor.x-box.x));
     const dy=Math.max(-box.y,Math.min(canvasLimit()-box.y-box.h,contextAnchor.y-box.y));
     const pasted=cloneGroupedObjects(objectClipboard,dx,dy);
     if(change(p=>p.objects.push(...pasted))){selected=new Set(pasted.map(o=>o.id));setTool('select');draw();}
     return;
    }
    if(cmd==='group'||cmd==='ungroup'){root.querySelector('[data-paper="'+cmd+'"]').click();return;}
    if(cmd==='duplicate'||cmd==='delete'){root.querySelector('[data-paper="'+(cmd==='duplicate'?'duplicate':'delete-object')+'"]')?.click();return;}
    if(cmd==='rotate-left'||cmd==='rotate-right'){
     const delta=cmd==='rotate-left'?-15:15;
     change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='shape')o.angle=shapeAngle((o.angle||0)+delta);}));
     return;
    }
    if(cmd==='edit-text'){
     const o=page().objects.find(o=>selected.has(o.id)&&o.type==='text');
     if(o){setTool('text');startText(o);}
     return;
    }
    if(cmd==='add-text'){
     setTool('text');
     startText({id:uid(),type:'text',
      x:Math.min(canvasWidth()-32,Math.max(0,contextAnchor.x)),
      y:Math.min(canvasLimit()-Math.ceil(fontSize*1.5),Math.max(0,contextAnchor.y)),
      w:32,h:Math.ceil(fontSize*1.5),text:'',size:fontSize,color:defaultTextColor,bold});
     return;
    }
    if(cmd==='select-tool'||cmd==='pen-tool'){setTool(cmd==='select-tool'?'select':'pen');return;}
    if(cmd==='undo'||cmd==='redo'){root.querySelector('[data-paper="'+cmd+'"]')?.click();return;}
    return;
   }
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
   if(b.dataset.eraserKind){
    if(!['stroke','shape','text'].includes(b.dataset.eraserKind))return;
    eraserKind=b.dataset.eraserKind;
    for(const item of eraserMenu.querySelectorAll('[data-eraser-kind]'))
     item.setAttribute('aria-pressed',String(item.dataset.eraserKind===eraserKind));
    setTool('eraser');
    eraserButton.title='ยางลบ · '+({stroke:'ลบเส้นปากกา',shape:'ลบรูปทรง',text:'ลบข้อความ'})[eraserKind];
    say('ยางลบ: '+({stroke:'ปาดหรือลากเพื่อลบเส้นปากกาและไฮไลต์',shape:'แตะหรือลากเพื่อลบรูปทรงและลูกศร',text:'แตะหรือลากเพื่อลบกล่องข้อความ'})[eraserKind]);
    return;
   }
   if(b.dataset.shapeRotate){
    const delta=b.dataset.shapeRotate==='reset'?null:Number(b.dataset.shapeRotate);
    if(delta!==null&&!Number.isFinite(delta))return;
    change(p=>p.objects.forEach(o=>{
     if(selected.has(o.id)&&o.type==='shape')o.angle=delta===null?0:shapeAngle((o.angle||0)+delta);
    }));
    return;
   }
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
   const noteMenu=b.closest("details.paper-menu");
   if(noteMenu)noteMenu.open=false;
   if(action==='finish-text'){finishText();return;}
   if(action==='scribble-text'){
    const targetId=editing?.id||page().objects.find(o=>selected.has(o.id)&&o.type==='text')?.id;
    if(editing)finishText();
    const existing=page().objects.find(o=>o.id===targetId&&o.type==='text');
    tool='text';activePanel='text';selected=existing?new Set([existing.id]):new Set();
    const x=Math.max(28,Math.min(canvasWidth()-440,viewport.scrollLeft/scale+75));
    const y=Math.max(35,Math.min(canvasLimit()-70,viewport.scrollTop/scale+110));
    startText(existing||{id:uid(),type:'text',x,y,w:440,h:Math.ceil(fontSize*1.5),text:'',size:fontSize,color:defaultTextColor,bold},null,{wideArea:true});
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
   if(action==='eraser'){toggleEraserMenu();return;}
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
   if(action==='undo'||action==='redo'){history.apply(model.pages,action==='undo',(pages,focus,version=model.version)=>{if(!persist({version,pages},false))return false;pageId=focus;selected.clear();sizing();return true;});draw();thumbs();}
   if(action==='pages'){setPagesOpen(!root.classList.contains('pages-open'));return;}
   if(action==='info')$('#paper-info').hidden=!$('#paper-info').hidden;
   if(action==='zoom-in')zoomAt(zoom*1.2);if(action==='zoom-out')zoomAt(zoom/1.2);if(action==='fit'){zoom=1;sizing();viewport.scrollLeft=0;}
   if(action==='continuous'){
    if(continuous())return;
    const next=toContinuousPaper(unsaved||model);
    if(persist(next)){
     pageId=next.pages[0].id;selected.clear();
     virtualHeight=Math.min(MAX_CANVAS_HEIGHT,pageHeight(next.pages[0])+PAGE_H);
     setPagesOpen(false);sizing();draw();thumbs();
     say('ใช้กระดาษต่อเนื่องแล้ว · เลื่อนลงได้เรื่อย ๆ · เปิดกรอบ A4 เพื่อช่วยจัดพิมพ์');
    }
    return;
   }
   if(action==='add-page'){const next=copy(model),p=emptyPage();p.template=page().template;next.pages.push(p);if(persist(next)){if(window.matchMedia('(max-width:720px)').matches)setPagesOpen(false);pageId=p.id;selected.clear();viewport.scrollTop=0;draw();thumbs();}}
   if(action==='duplicate-page'){const next=copy(model),p=copy(page());p.id=uid();p.objects=cloneGroupedObjects(p.objects);next.pages.splice(next.pages.findIndex(p=>p.id===pageId)+1,0,p);if(persist(next)){if(window.matchMedia('(max-width:720px)').matches)setPagesOpen(false);pageId=p.id;selected.clear();draw();thumbs();}}
   if(action==='delete-page'){
    const current=page(),target=pageId;
    if(model.pages.length===1){
     if(current.objects.length)throw Error('หน้านี้มีเนื้อหาอยู่ ต้องเหลือกระดาษอย่างน้อยหนึ่งผืน · เลือกกระดาษต่อเนื่องเพื่อไม่ต้องสร้างหน้าเพิ่ม');
     // Deleting the final blank page is equivalent to an empty infinite
     // sheet: there is no meaningful "page 0" to keep in the database.
     const next=toContinuousPaper(model);
     if(persist(next)){virtualHeight=PAGE_H*2;setPagesOpen(false);sizing();say('ลบหน้าว่างแล้ว · เปลี่ยนเป็นกระดาษต่อเนื่อง');}
     return;
    }
    if(!current.objects.length||await confirmNoteDelete('หน้ากระดาษ '+(model.pages.findIndex(p=>p.id===target)+1))){
     const next=copy(model);next.pages=next.pages.filter(p=>p.id!==target);
     if(persist(next)){selected.clear();draw();thumbs();}
    }
    return;
   }
   if(action==='group'||action==='ungroup'){
    const state=selectionGroupState(page().objects,selected);if(action==='group'?!state.canGroup:!state.canUngroup)return;
    if(change(p=>{p.objects=changeObjectGroups(p.objects,selected,action==='group'?uid():null);})){multiSelect=false;$('#paper-selection-more').open=false;say(action==='group'?'จัดกลุ่มแล้ว · คลิกชิ้นใดก็เลือกทั้งกลุ่ม':'ยกเลิกกลุ่มแล้ว · เลือกแต่ละชิ้นได้');draw();}return;
   }
   if(action==='delete-object'){$('#paper-selection-more').open=false;change(p=>{p.objects=p.objects.filter(o=>!selected.has(o.id));});selected.clear();draw();}
   if(action==='duplicate'){const ids=[];change(p=>{const objects=cloneGroupedObjects(p.objects.filter(o=>selected.has(o.id)),24,24);ids.push(...objects.map(o=>o.id));p.objects.push(...objects);});selected=new Set(ids);draw();}
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
 bind($('#paper-shape-angle'),'change',e=>{
  const raw=Number(e.target.value);
  if(!Number.isFinite(raw)){draw();return;}
  const angle=shapeAngle(raw);
  change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='shape')o.angle=angle;}));
 });
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
 bind(root,'pointerdown',e=>{
  if(!e.target.closest('#paper-context-menu'))closeCanvasMenu();
  if(!e.target.closest('.paper-text-ribbon,.paper-word-menu')){
   formattingControlActive=false;
  }
  if(!e.target.closest('.paper-selection-more'))$('#paper-selection-more').open=false;if(!e.target.closest('.paper-shapes-popup,[data-open-shapes],[data-paper="shape"]'))setShapesOpen(false);if(!e.target.closest('.paper-word-menu,.paper-text-ribbon,#paper-text-input,#paper-rich-editor'))closeWordMenu();if(!e.target.closest('.paper-pen-sizes'))closePenSizePicker();if(!e.target.closest('#paper-toolbar-more'))closeExtraTools();if(!e.target.closest('#paper-eraser-menu,[data-paper="eraser"]'))closeEraserMenu();});
 bind(root,'keydown',e=>{if(e.key==='Escape'){setShapesOpen(false);closeWordMenu();closeCanvasMenu();closePenSizePicker();closeExtraTools();closeEraserMenu();}});
  bind($('#paper-finger'),'change',e=>{
   if(!e.target.checked)return;
   if(palmGuard)setPalmGuard(false);
   finger=true;syncInputControls();
   try{localStorage.setItem(fingerKey,'true');}catch{}
   say('ใช้นิ้วเขียนได้แล้ว · Apple Pencil ยังเขียนได้ตามปกติ');
  });
  bind($('#paper-pencil-only'),'change',e=>{
   if(!e.target.checked)return;
   finger=false;syncInputControls();
   try{localStorage.setItem(fingerKey,'false');}catch{}
   say('ใช้ Apple Pencil เขียน · นิ้วใช้เลื่อนกระดาษ ไม่สร้างเส้น');
  });
  bind(palmToggle,'change',e=>setPalmGuard(e.target.checked));
 bind($('#paper-template'),'change',e=>change(p=>{p.template=e.target.value;for(const section of p.sections||[])section.template=p.template;}));
 bind($('#paper-shape'),'change',()=>{closeExtraTools();});
 bind($('#paper-smart-shape'),'change',e=>{smartEnabled=e.target.checked;if(!smartEnabled)cancelSmartTimer();});
 bind($('#paper-line-style'),'change',e=>{
  lineStyle=e.target.value;
  if(selected.size)change(p=>{p.objects=p.objects.map(o=>selected.has(o.id)&&o.type==='shape'?{...o,dash:lineStyle}:o);});
  closeExtraTools();
 });
 for(const button of selectionTools.querySelectorAll('[data-box-size-step]'))bind(button,'click',()=>{
  const input=$('#paper-font-size');
  const next=textSize(Number(input.value)+Number(button.dataset.boxSizeStep),fontSize);
  if(Number(input.value)===next)return;
  input.value=String(next);
  input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 bind($('#paper-font-size'),'change',e=>{
  const size=textSize(e.target.value,fontSize);e.target.value=String(size);fontSize=size;
  change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='text'){o.size=size;o.h=Math.max(o.h,Math.ceil(size*1.5));}}));
 });
 bind($('#paper-word-custom-color'),'input',e=>applyWordFormat('color',e.target.value));
 bind($('#paper-global-text-color'),'input',e=>{
  const ink=textColor(e.target.value);if(!ink)return;
  if(editing){if(currentWordSelection())applyWordFormat('color',ink);else {editing.object.color=ink;textarea.style.color=rich.style.color=ink;finishText(true);}}
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
 bind(document,'keydown',e=>{if(!root.isConnected||/INPUT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='g'&&selected.size){e.preventDefault();$('[data-paper="'+(e.shiftKey?'ungroup':'group')+'"]').click();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(`[data-paper="${e.shiftKey?'redo':'undo'}"]`).click();}if((e.key==='Delete'||e.key==='Backspace')&&selected.size){e.preventDefault();$('[data-paper="delete-object"]').click();}});
 bind(window,'beforeunload',e=>{if(unsaved||editing||gesture?.kind==='stroke'||loadingImages){e.preventDefault();e.returnValue='';}});
 const ro=new ResizeObserver(()=>sizing());ro.observe(viewport);
 function refreshCourseButton(){
  const button=$('[data-paper="course-materials"]');
  if(button){button.textContent='เอกสารหลักของวิชา';button.title=courseMaterialLabel(space.notebook(),currentNote()?.course);}
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
