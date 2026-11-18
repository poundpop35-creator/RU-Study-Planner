import {confirmNoteDelete} from './note-delete-dialog.js?v=20261118-edit2';
import {PAGE_W,PAGE_H,emptyPage,uid,paperFor,imageLink,validatePaper,strokeObject,bounds,contains,inPolygon,strokeHit,pageHistory,copy,mergePaper} from './paper-core.js?v=20261118-wordlinks';
import {pageSVG,objectSVG,esc} from './paper-render.js?v=20261118-wordlinks';
import {imageHandles,resizeImage,cropImage} from './paper-images.js';
import {readAttachment,downloadAttachment} from './note-files.js';
import {replaceLink,moveLinks} from './word-links.js';
import {chooseWordTarget} from './word-link-dialog.js';
import {openNoteFile} from './file-viewer.js';
import {makeShape} from './paper-shapes.js';
let active=null;
export function refreshPaper(space,id){return active?.id===id?active.refresh(space):false;}
export function mountPaper(space,id,{onLegacy=()=>{}}={}){
 const root=document.querySelector('.paper-app');if(!root)return ()=>{};
 let note=space.notebook().notes.find(n=>n.id===id);if(!note)return ()=>{};
 let conversionWarning='';let initial;try{initial=paperFor(note);}catch{initial={version:1,pages:[emptyPage()]};conversionWarning='ต้นฉบับยาวเกินหน้ากระดาษที่รองรับ ดูฉบับเต็มได้ในเมนู ดูต้นฉบับเดิม';}
 let model=initial,pageId=model.pages[0].id,tool='text',color='#172033',width=5,fontSize=24,bold=false,finger=false,selected=new Set(),zoom=1,fit=1,scale=1,gesture=null,closed=false,raf=0,editing=null,unsaved=null,loadingImages=0;
 let multiSelect=false,wordSelection=null;
 let lastStored=JSON.stringify(note.paper||null),pendingRemote=false,draftBase=null;
 let cachedPage=null,cachedContent='',imageVersion=0,cachedImageVersion=-1;
 const scope=space.info().scope,images=new Map(),loading=new Set(),history=new Map(),events=[],pointers=new Map();
 const draftKey='ru-paper-draft:'+scope+':'+id;
 const $=s=>root.querySelector(s),svg=$('#paper-svg'),sheet=$('#paper-sheet'),wrap=$('#paper-wrap'),viewport=$('#paper-viewport'),textarea=$('#paper-text-input');
 const bind=(el,type,fn,opts)=>{el.addEventListener(type,fn,opts);events.push(()=>el.removeEventListener(type,fn,opts));};
 const page=()=>model.pages.find(p=>p.id===pageId)||model.pages[0];
 const h=()=>{if(!history.has(pageId))history.set(pageId,pageHistory());return history.get(pageId);};
 const say=(text,bad=false)=>{const el=$('#paper-hint');el.textContent=text;el.classList.toggle('error',bad);};
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
  const p=page();if(cachedPage!==p||cachedImageVersion!==imageVersion){cachedContent=pageSVG(p,images);cachedPage=p;cachedImageVersion=imageVersion;}let content=cachedContent;
  if(gesture?.kind==='shape'&&gesture.object)content+=objectSVG(gesture.object);
  if(gesture?.kind==='stroke'&&gesture.points.length)content+=objectSVG(strokeObject(gesture.points,{tool:gesture.tool,color:gesture.color,width:gesture.width}),images);
  const visible=gesture?.preview||p.objects;
  if(gesture?.preview)content=pageSVG({...p,objects:visible},images);
  const chosen=visible.filter(o=>selected.has(o.id)),box=bounds(chosen);
  if(chosen.length>1)for(const o of chosen)content+=`<rect x="${o.x-2}" y="${o.y-2}" width="${o.w+4}" height="${o.h+4}" fill="none" stroke="#7590fc" stroke-width="1" pointer-events="none"/>`;
  const singleImage=selected.size===1&&visible.find(o=>selected.has(o.id)&&o.type==="image");
  if(box&&!editing)content+=`<rect x="${box.x-6}" y="${box.y-6}" width="${box.w+12}" height="${box.h+12}" fill="none" stroke="#3155d9" stroke-width="2" stroke-dasharray="7 5"/>${singleImage?imageHandles(box,scale):`<rect data-resize="true" x="${box.x+box.w-9}" y="${box.y+box.h-9}" width="18" height="18" rx="4" fill="#3155d9"/>`}`;
  if(gesture?.kind==='lasso')content+=`<path d="${gesture.points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')}" fill="#3155d910" stroke="#3155d9" stroke-width="2" stroke-dasharray="6 4"/>`;
  svg.innerHTML=content;svg.dataset.tool=tool;
  $('#paper-page-label').textContent=`หน้า ${model.pages.findIndex(p=>p.id===pageId)+1} / ${model.pages.length}`;
  $('#paper-template').value=p.template;
  $('[data-paper="multi"]').setAttribute('aria-pressed',String(multiSelect));
  $('#paper-shape-options').hidden=tool!=='shape';
  root.querySelectorAll('[data-paper]').forEach(b=>{if(['pen','highlight','eraser','text','shape','select','hand'].includes(b.dataset.paper))b.setAttribute('aria-pressed',String(tool===b.dataset.paper));});
  root.querySelectorAll('[data-paper-color]').forEach(b=>b.setAttribute('aria-pressed',String(color===b.dataset.paperColor)));
  $('[data-paper="undo"]').disabled=!h().canUndo; $('[data-paper="redo"]').disabled=!h().canRedo;
  const tools=$('#paper-selection-tools');tools.hidden=!selected.size;$('#paper-selected-count').textContent=selected.size;
  const linkButton=$('[data-paper="image-link"]'),openLink=$('#paper-open-link');
  linkButton.hidden=!singleImage;linkButton.textContent=singleImage?.link?'แก้ลิงก์':'ใส่ลิงก์';
  openLink.hidden=!singleImage?.link;
  if(singleImage?.link)openLink.href=singleImage.link;else openLink.removeAttribute('href');
  $('[data-paper="crop"]').hidden=!singleImage;
  const texts=p.objects.filter(o=>selected.has(o.id)&&o.type==='text');$('[data-paper="edit-text"]').hidden=texts.length!==1;$('#paper-font-size').parentElement.hidden=!texts.length;$('[data-paper="bold"]').hidden=!texts.length;
  $('#paper-font-size').value=texts[0]?.size||fontSize;
  loadImages();
 }
 function thumbs(){ $('#paper-page-list').innerHTML=model.pages.map((p,i)=>`<button class="paper-thumb ${p.id===pageId?'active':''}" data-paper-page="${p.id}" aria-label="หน้า ${i+1}" aria-current="${p.id===pageId?'page':'false'}"><svg viewBox="0 0 ${PAGE_W} ${PAGE_H}" aria-hidden="true">${pageSVG(p,images,'thumb-'+p.id)}</svg><span>${i+1}</span></button>`).join('');}
 function loadImages(){
  for(const o of page().objects){if(o.type!=='image'||images.has(o.imageId)||loading.has(o.imageId))continue;loading.add(o.imageId);
   space.image(o.imageId).then(blob=>{if(closed)return;images.set(o.imageId,URL.createObjectURL(blob));imageVersion++;scheduleDraw();thumbs();}).catch(()=>{if(!closed)say('โหลดรูปบางรูปไม่สำเร็จ ลองเชื่อมต่อใหม่',true);}).finally(()=>loading.delete(o.imageId));
  }
 }
 function sizing(){fit=Math.min(1,Math.max(.2,(viewport.clientWidth-48)/PAGE_W));scale=fit*zoom;wrap.style.width=PAGE_W*scale+'px';wrap.style.height=PAGE_H*scale+'px';sheet.style.transform=`scale(${scale})`;$('#paper-zoom').textContent=Math.round(zoom*100)+'%';}
 function zoomAt(next,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const old=scale,x=(viewport.scrollLeft+cx)/old,y=(viewport.scrollTop+cy)/old;zoom=Math.min(4,Math.max(.5,next));sizing();viewport.scrollLeft=x*scale-cx;viewport.scrollTop=y*scale-cy;}
 function point(e){const r=svg.getBoundingClientRect();return {x:Math.max(0,Math.min(PAGE_W,(e.clientX-r.left)/r.width*PAGE_W)),y:Math.max(0,Math.min(PAGE_H,(e.clientY-r.top)/r.height*PAGE_H))};}
 function setTool(next){finishText();pointers.clear();gesture=null;tool=next;if(next!=='select')multiSelect=false;if(!['select','text'].includes(tool))selected.clear();say(({shape:'เลือกรูปทรง แล้วลากบนหน้ากระดาษ',pen:'ใช้ปากกาเขียน · เปิดนิ้วเขียนหากต้องการ',highlight:'ลากเพื่อไฮไลต์',eraser:'ลากผ่านเส้นเพื่อลบทั้งเส้น',select:'แตะเพื่อเลือก · ล้อมวัตถุเพื่อเลือกหลายชิ้น · ลากมุมเพื่อปรับขนาด',text:'แตะตำแหน่งบนกระดาษเพื่อพิมพ์',hand:'ลากเพื่อเลื่อน · สองนิ้วเพื่อซูม'})[tool]);draw();}
 const textMeasure=document.createElement('span');
 Object.assign(textMeasure.style,{position:'absolute',visibility:'hidden',pointerEvents:'none',whiteSpace:'pre',width:'max-content',maxWidth:'none',left:'0',top:'0'});
 const measureClip=document.createElement('div');
 Object.assign(measureClip.style,{position:'absolute',width:'0',height:'0',overflow:'hidden'});
 measureClip.append(textMeasure);sheet.append(measureClip);
 function fitTextBox(){
  if(!editing)return;
  const o=editing.object;
  textMeasure.textContent=textarea.value;
  const availableWidth=Math.max(1,PAGE_W-o.x);
  const width=Math.min(availableWidth,Math.max(32,textMeasure.offsetWidth+5));
  textarea.style.width=width+'px';
  textarea.style.overflowY='hidden';
  textarea.style.height='1px';
  const height=Math.min(Math.max(1,PAGE_H-o.y),Math.max(Math.ceil(o.size*1.5),textarea.scrollHeight));
  textarea.style.height=height+'px';
  if(textarea.scrollHeight>height)textarea.style.overflowY='auto';
 }
 function rememberWord(){
  if(!editing)return;
  const start=textarea.selectionStart,end=textarea.selectionEnd;
  wordSelection=end>start?{pageId,id:editing.id,start,end,text:textarea.value}:null;
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
 function startText(o){
  finishText();wordSelection=null;editing={lastText:o.text,links:o.links||[],id:o.id,before:copy(page()),fresh:!page().objects.some(x=>x.id===o.id),object:copy(o)};selected=new Set([o.id]);textarea.value=o.text;
  Object.assign(textarea.style,{left:o.x+'px',top:o.y+'px',fontSize:o.size+'px',fontWeight:o.bold?'700':'400',color:o.color});textarea.hidden=false;
  const style=getComputedStyle(textarea);
  Object.assign(textMeasure.style,{fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,letterSpacing:style.letterSpacing});
  fitTextBox();draw();textarea.focus();textarea.setSelectionRange(textarea.value.length,textarea.value.length);textarea.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 let textTimer;
 function finishText(keepOpen=false){
  clearTimeout(textTimer);
  if(!editing)return;const edit=editing,w=parseFloat(textarea.style.width),h=parseFloat(textarea.style.height);
  if(!keepOpen){editing=null;textarea.hidden=true;}
  const o={...edit.object,text:textarea.value,w,h};if(edit.links.length)o.links=edit.links;else delete o.links;
  if(edit.fresh&&!o.text.trim()){selected.clear();draw();return;}
  if(!edit.fresh&&o.text===edit.object.text&&o.w===edit.object.w&&o.h===edit.object.h){if(!keepOpen)draw();return;}
  if(change(p=>{const i=p.objects.findIndex(v=>v.id===o.id);if(i>=0)p.objects[i]=o;else p.objects.push(o);})&&keepOpen){edit.object=o;edit.fresh=false;}
 }
 bind(textarea,'select',rememberWord);
 bind($('[data-paper="word-link"]'),'pointerdown',e=>{if(editing){rememberWord();e.preventDefault();}});
 bind(textarea,'input',()=>{if(editing){editing.links=moveLinks(editing.links,editing.lastText,textarea.value);editing.lastText=textarea.value;}clearTimeout(textTimer);textTimer=setTimeout(()=>finishText(true),1200);fitTextBox();});
 bind(textarea,'blur',()=>{if(!closed){rememberWord();finishText();}});
 bind(textarea,'keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();linkWord().catch(err=>say(err.message,true));return;}if(e.key==='Escape'){e.preventDefault();finishText();}});
 function pointerDown(e){
  if(e.target.closest('[data-word-link],[data-word-file]')&&['text','select'].includes(tool)&&!multiSelect&&!e.shiftKey)return;
  wordSelection=null;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(e.pointerType==='touch'&&[...pointers.values()].some(p=>p.pointerType==='pen'))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pointerType:e.pointerType});
  if(pointers.size===2&&gesture?.image){
   const [a,b]=[...pointers.values()];gesture={kind:'image-pinch',image:gesture.preview?.find(o=>o.id===gesture.image.id)||gesture.image,before:gesture.before,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};
   svg.setPointerCapture(e.pointerId);e.preventDefault();return;
  }
  if(pointers.size===2){finishText();const [a,b]=[...pointers.values()];gesture={kind:'pinch',distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};scheduleDraw();svg.setPointerCapture(e.pointerId);e.preventDefault();return;}
  if(pointers.size>2)return;
  finishText();e.preventDefault();svg.setPointerCapture(e.pointerId);const p=point(e);
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
  if(['text','select'].includes(tool)){
   const edge=e.target.closest('[data-edge]')?.dataset.edge;
   const hit=edge?page().objects.find(o=>selected.has(o.id)&&o.type==='image'):[...page().objects].reverse().find(o=>o.type==='stroke'?strokeHit(o,p,8):contains(p,o,o.type==='shape'?8:0));
   if(hit?.type==='image'&&(edge||tool==='text'||selected.size<=1||!selected.has(hit.id))){
    selected=new Set([hit.id]);gesture={kind:edge?'image-resize':'move',edge,image:hit,start:p,before:copy(page().objects)};draw();return;
   }
  }
  if(tool==='text'){
   const target=[...page().objects].reverse().find(o=>o.type==='text'&&contains(p,o));startText(target||{id:uid(),type:'text',x:Math.min(p.x,PAGE_W-32),y:Math.min(p.y,PAGE_H-Math.ceil(fontSize*1.5)),w:32,h:Math.ceil(fontSize*1.5),text:'',size:fontSize,color,bold});return;
  }
  if(tool==='select'){
   const box=bounds(page().objects.filter(o=>selected.has(o.id)));
   if(box&&contains(p,{x:box.x+box.w-15,y:box.y+box.h-15,w:30,h:30})){gesture={kind:'resize',start:p,before:copy(page().objects),box};return;}
   const hit=[...page().objects].reverse().find(o=>o.type==='stroke'?strokeHit(o,p,8):contains(p,o,o.type==='shape'?8:0));
   if(hit){if(!selected.has(hit.id))selected=new Set([hit.id]);gesture={kind:'move',start:p,before:copy(page().objects)};}
   else{selected.clear();gesture={kind:'lasso',points:[p]};}draw();return;
  }
  if(tool==='shape'){
   gesture={kind:'shape',id:uid(),shape:$('#paper-shape').value,start:p,color,width};
   return;
  }
  if(tool==='eraser'){gesture={kind:'erase',before:copy(page().objects),preview:page().objects.filter(o=>o.type!=='stroke'||!strokeHit(o,p))};scheduleDraw();return;}
  gesture={kind:'stroke',tool,color:tool==='highlight'&&color==='#172033'?'#f4cd45':color,width:tool==='highlight'?width*3:width,points:[[p.x,p.y,e.pointerType==='pen'&&e.pressure>0?e.pressure:.5]],pointer:e.pointerId};
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
  if(gesture.kind==='shape'){
   gesture.object=makeShape(gesture.id,gesture.shape,gesture.start,p,gesture.color,gesture.width);
  }else if(gesture.kind==='stroke'){
   for(const sample of e.getCoalescedEvents?.()?.length?e.getCoalescedEvents():[e]){const pt=point(sample),last=gesture.points.at(-1);if(Math.hypot(pt.x-last[0],pt.y-last[1])>=1.2&&gesture.points.length<12000)gesture.points.push([pt.x,pt.y,sample.pointerType==='pen'&&sample.pressure>0?sample.pressure:.5]);}
  }else if(gesture.kind==='erase')gesture.preview=gesture.preview.filter(o=>o.type!=='stroke'||!strokeHit(o,p));
  else if(gesture.kind==='lasso')gesture.points.push(p);
  else if(gesture.kind==='move')gesture.preview=gesture.before.map(o=>selected.has(o.id)?{...o,x:Math.max(-o.w/2,Math.min(PAGE_W-o.w/2,o.x+p.x-gesture.start.x)),y:Math.max(-o.h/2,Math.min(PAGE_H-o.h/2,o.y+p.y-gesture.start.y))}:o);
  else if(gesture.kind==='image-resize')gesture.preview=gesture.before.map(o=>o.id===gesture.image.id?resizeImage(o,gesture.edge,p.x-gesture.start.x,p.y-gesture.start.y):o);
  else if(gesture.kind==='resize'){const b=gesture.box,f=Math.max(.15,Math.min(4,Math.max((p.x-b.x)/Math.max(1,b.w),(p.y-b.y)/Math.max(1,b.h))));gesture.preview=gesture.before.map(o=>selected.has(o.id)?{...o,x:b.x+(o.x-b.x)*f,y:b.y+(o.y-b.y)*f,w:Math.max(1,o.w*f),h:Math.max(1,o.h*f),...(o.type==='text'?{size:Math.min(96,Math.max(10,o.size*f))}:{})}:o);}
  scheduleDraw();
 }
 function pointerUp(e){
  if(!pointers.has(e.pointerId))return;const g=gesture;
  if(g?.kind==='stroke'&&e.type==='pointerup'){const p=point(e);g.points.push([p.x,p.y,e.pointerType==='pen'&&e.pressure>0?e.pressure:.5]);}
  pointers.delete(e.pointerId);if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
  if(g?.kind==='pinch'){if(pointers.size<2)gesture=null;return;}
  gesture=null;
  if(g?.multiTap&&!g.moved&&g.alreadySelected&&e.type==='pointerup')selected.delete(g.multiTap);
  if(g?.kind==='stroke'&&e.type!=='pointercancel'){const stroke=strokeObject(g.points,{tool:g.tool,color:g.color,width:g.width});change(p=>p.objects.push(stroke));}
  else if(g?.kind==='shape'&&e.type==='pointerup'){
   const end=point(e);
   if(Math.hypot(end.x-g.start.x,end.y-g.start.y)>2){
    const shape=makeShape(g.id,g.shape,g.start,end,g.color,g.width);
    if(change(p=>p.objects.push(shape))){tool='select';selected=new Set([shape.id]);}
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
 bind(svg,'pointerdown',pointerDown);bind(svg,'pointermove',pointerMove);bind(svg,'pointerup',pointerUp);bind(svg,'pointercancel',pointerUp);
 bind(svg,'lostpointercapture',e=>{if(pointers.delete(e.pointerId)){gesture=null;scheduleDraw();}});
 bind(svg,'dblclick',e=>{if(tool!=='select')return;const o=[...page().objects].reverse().find(o=>o.type==='text'&&contains(point(e),o));if(o)startText(o);});
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
   if(unsaved&&b.dataset.paper!=='save'&&b.dataset.paper!=='draft'&&b.dataset.paper!=='discard-draft')throw Error('มีงานค้าง กรุณาบันทึกหรือสำรองก่อนทำรายการต่อ');
   if(b.dataset.paperPage){finishText();pageId=b.dataset.paperPage;selected.clear();viewport.scrollTop=0;root.classList.remove('pages-open');draw();thumbs();return;}
   if(b.dataset.paperColor){color=b.dataset.paperColor;if(selected.size)change(p=>{p.objects=p.objects.map(o=>selected.has(o.id)&&o.type!=='image'?{...o,color}:o);});draw();return;}
   const action=b.dataset.paper;if(!action)return;
   if(action==='word-link'){await linkWord();return;}
   if(action==='multi'){
    multiSelect=!multiSelect;setTool('select');
    say(multiSelect?'แตะเพื่อเพิ่มหรือนำออกจากกลุ่ม · ลากชิ้นที่เลือกเพื่อย้ายพร้อมกัน':'แตะเพื่อเลือก · Shift + คลิกเพื่อเลือกเพิ่ม');return;
   }
   if(['select','pen','highlight','eraser','text','shape','hand'].includes(action)){setTool(action);return;}
   if(action==='files'){fileList();$('#paper-files').showModal();return;}
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
   if(action==='pages')root.classList.toggle('pages-open');
   if(action==='info')$('#paper-info').hidden=!$('#paper-info').hidden;
   if(action==='zoom-in')zoomAt(zoom*1.2);if(action==='zoom-out')zoomAt(zoom/1.2);if(action==='fit'){zoom=1;sizing();viewport.scrollLeft=0;}
   if(action==='add-page'){const next=copy(model),p=emptyPage();p.template=page().template;next.pages.push(p);if(persist(next)){root.classList.remove('pages-open');pageId=p.id;selected.clear();viewport.scrollTop=0;draw();thumbs();}}
   if(action==='duplicate-page'){const next=copy(model),p=copy(page());p.id=uid();p.objects.forEach(o=>o.id=uid());next.pages.splice(next.pages.findIndex(p=>p.id===pageId)+1,0,p);if(persist(next)){root.classList.remove('pages-open');pageId=p.id;selected.clear();draw();thumbs();}}
   if(action==='delete-page'){if(model.pages.length===1)throw Error('ต้องเหลืออย่างน้อยหนึ่งหน้า');const target=pageId;if(await confirmNoteDelete('หน้ากระดาษ '+(model.pages.findIndex(p=>p.id===target)+1))){const next=copy(model);next.pages=next.pages.filter(p=>p.id!==target);persist(next,false);selected.clear();draw();thumbs();}}
   if(action==='delete-object'){change(p=>{p.objects=p.objects.filter(o=>!selected.has(o.id));});selected.clear();draw();}
   if(action==='duplicate'){const ids=[];change(p=>{const objects=p.objects.filter(o=>selected.has(o.id)).map(o=>({...copy(o),id:uid(),x:o.x+24,y:o.y+24}));ids.push(...objects.map(o=>o.id));p.objects.push(...objects);});selected=new Set(ids);draw();}
   if(action==='edit-text'){const o=page().objects.find(o=>selected.has(o.id)&&o.type==='text');if(o)startText(o);}
   if(action==='bold'){bold=!bold;change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='text')o.bold=bold;}));}
   if(action==='legacy'){if(unsaved)throw Error('กรุณาบันทึกหรือสำรองงานค้างก่อนเปิดต้นฉบับ');onLegacy();}
  }catch(err){say(err.message,true);}
 });
 bind($('#paper-width'),'change',e=>{width=Number(e.target.value);});bind($('#paper-finger'),'change',e=>{finger=e.target.checked;});
 bind($('#paper-template'),'change',e=>change(p=>{p.template=e.target.value;}));
 bind($('#paper-font-size'),'change',e=>{fontSize=Number(e.target.value);change(p=>p.objects.forEach(o=>{if(selected.has(o.id)&&o.type==='text')o.size=fontSize;}));});
 for(const [selector,key] of [['#paper-title','title'],['#paper-course','course'],['#paper-source','source'],['#paper-tags','tags'],['#paper-question','question'],['#paper-answer','answer']])bind($(selector),'change',e=>{try{writable();const book=copy(space.notebook()),n=book.notes.find(n=>n.id===id);n[key]=key==='course'?e.target.value.trim().toUpperCase():e.target.value;if(key==='course'&&n[key]&&!/^POL\d{4}$/.test(n[key]))throw Error('กรอกรหัสวิชา เช่น POL1101');n.updatedAt=new Date().toISOString();space.saveNotebook(book);}catch(err){say(err.message,true);}});
 bind(document,'keydown',e=>{if(!root.isConnected||/INPUT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(`[data-paper="${e.shiftKey?'redo':'undo'}"]`).click();}if((e.key==='Delete'||e.key==='Backspace')&&selected.size){e.preventDefault();$('[data-paper="delete-object"]').click();}});
 bind(window,'beforeunload',e=>{if(unsaved||editing||gesture?.kind==='stroke'||loadingImages){e.preventDefault();e.returnValue='';}});
 const ro=new ResizeObserver(()=>sizing());ro.observe(viewport);
 function refresh(nextSpace){
  if(closed||nextSpace.info().scope!==scope||!nextSpace.info().canEdit)return false;
  const live=currentNote();if(!live)return false;
  if($('#paper-files').open)fileList();
  if(gesture||editing||unsaved){pendingRemote=true;return true;}
  pendingRemote=false;const serialized=JSON.stringify(live.paper||null);
  if(serialized!==lastStored){model=paperFor(live);lastStored=serialized;if(!model.pages.some(p=>p.id===pageId))pageId=model.pages[0].id;selected=new Set([...selected].filter(id=>page().objects.some(o=>o.id===id)));draw();thumbs();say('อัปเดตจากอีกเครื่องแล้ว');}
  for(const [selector,key] of [['#paper-title','title'],['#paper-course','course'],['#paper-source','source'],['#paper-tags','tags'],['#paper-question','question'],['#paper-answer','answer']])if(document.activeElement!==$(selector))$(selector).value=live[key];return true;
 }
 const backup=document.createElement('button');backup.dataset.paper='draft';backup.className='paper-draft-button';backup.textContent='สำรองงานค้าง';$('.paper-bottom').append(backup);const discard=backup.cloneNode();discard.dataset.paper='discard-draft';discard.textContent='ละทิ้งงานค้าง';$('.paper-bottom').append(discard);
 try{const raw=localStorage.getItem(draftKey);if(raw){const draft=JSON.parse(raw);unsaved=validatePaper(draft.paper);draftBase=validatePaper(draft.base);root.classList.add('paper-has-draft');say('มีงานค้างจากครั้งก่อน กดสำรองงานค้างเพื่อเก็บฉบับกู้คืน',true);}}catch{}
 document.body.classList.add('paper-mode');active={id,refresh};sizing();draw();thumbs();if(conversionWarning)say(conversionWarning,true);
 return ()=>{finishText();closed=true;cancelAnimationFrame(raf);events.forEach(fn=>fn());ro.disconnect();for(const url of images.values())URL.revokeObjectURL(url);document.body.classList.remove('paper-mode');if(active?.id===id)active=null;};
}
