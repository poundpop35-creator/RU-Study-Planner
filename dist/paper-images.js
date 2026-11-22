const handles = {nw:[0,0],n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5]};
export function imageHandles(box,scale) {
 return Object.entries(handles).map(([edge,[x,y]])=>{
  const cx=box.x+x*box.w,cy=box.y+y*box.h,r=5/scale;
  return `<g data-edge="${edge}" style="cursor:${edge}-resize"><circle cx="${cx}" cy="${cy}" r="${Math.min(15/scale,Math.min(box.w,box.h)/4)}" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="#3155d9" stroke-width="${2/scale}"/></g>`;
 }).join('');
}
export function resizeImage(image,edge,dx,dy) {
 const out={...image,stretch:true};
 if(edge.includes('e'))out.w=Math.max(12,Math.min(2700,image.w+dx));
 if(edge.includes('s'))out.h=Math.max(12,Math.min(3819,image.h+dy));
 if(edge.includes('w')){out.w=Math.max(12,Math.min(image.x+image.w+900,image.w-dx,2700));out.x=image.x+image.w-out.w;}
 if(edge.includes('n')){out.h=Math.max(12,Math.min(image.y+image.h+1273,image.h-dy,3819));out.y=image.y+image.h-out.h;}
 return out;
}
export async function cropImage(url) {
 const img=new Image();img.src=url;await img.decode();
 const dialog=document.createElement('dialog');
 dialog.className='paper-sheet-dialog photo-crop';
 dialog.setAttribute('aria-labelledby','photo-crop-title');
 dialog.innerHTML=`<form method="dialog"><header><button value="cancel">ยกเลิก</button><h2 id="photo-crop-title">ครอปรูป</h2><button value="crop">เสร็จสิ้น</button></header>
 <div class="crop-preview"><div class="crop-stage"><div class="crop-frame" tabindex="0" aria-label="ย้ายกรอบตัดรูป"></div></div></div>
 <footer><span>ลากขอบหรือมุมเพื่อตัด · กางสองนิ้วเพื่อซูม</span><button type="button" data-reset>เริ่มใหม่</button></footer></form>`;
 const stage=dialog.querySelector('.crop-stage'),frame=dialog.querySelector('.crop-frame');
 img.alt='';img.draggable=false;stage.prepend(img);
 stage.style.setProperty('--ratio',img.naturalWidth/img.naturalHeight);
 const labels={n:'บน',s:'ล่าง',w:'ซ้าย',e:'ขวา',nw:'บนซ้าย',ne:'บนขวา',sw:'ล่างซ้าย',se:'ล่างขวา'};
 for(const [edge,[x,y]] of Object.entries(handles)){
  const grip=document.createElement('button');grip.type='button';grip.dataset.edge=edge;
  grip.setAttribute('aria-label','ปรับขอบ'+labels[edge]);grip.style.left=x*100+'%';grip.style.top=y*100+'%';frame.append(grip);
 }
 const full=()=>({l:0,t:0,r:1,b:1});
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 let box=full(),view={x:0,y:0,z:1},drag;
 const contacts=new Map();
 function paint(){
  img.style.transform=`translate(${view.x*100}%,${view.y*100}%) scale(${view.z})`;
  Object.assign(frame.style,{left:box.l*100+'%',top:box.t*100+'%',width:(box.r-box.l)*100+'%',height:(box.b-box.t)*100+'%'});
 }
 function adjust(start,edge,dx,dy){
  const next={...start};
  if(edge==='move'){
   dx=clamp(dx,-start.l,1-start.r);dy=clamp(dy,-start.t,1-start.b);
   next.l+=dx;next.r+=dx;next.t+=dy;next.b+=dy;
  }else{
   const minW=Math.min(1,24/stage.clientWidth),minH=Math.min(1,24/stage.clientHeight);
   if(edge.includes('w'))next.l=clamp(start.l+dx,0,start.r-minW);
   if(edge.includes('e'))next.r=clamp(start.r+dx,start.l+minW,1);
   if(edge.includes('n'))next.t=clamp(start.t+dy,0,start.b-minH);
   if(edge.includes('s'))next.b=clamp(start.b+dy,start.t+minH,1);
  }
  box=next;paint();
 }
 function point(e){
  const r=stage.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
 }
 function pair(){
  const [a,b]=contacts.values();
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot((a.x-b.x)*stage.clientWidth,(a.y-b.y)*stage.clientHeight))};
 }
 stage.onpointerdown=e=>{
  if(e.button!==0||contacts.size>=2)return;
  e.preventDefault();stage.setPointerCapture(e.pointerId);const p=point(e);contacts.set(e.pointerId,p);
  drag=contacts.size===2?{pair:pair(),view:{...view}}:{p,box:{...box},view:{...view},edge:e.target.closest('[data-edge]')?.dataset.edge||(view.z>1?'pan':'move')};
 };
 stage.onpointermove=e=>{
  if(!contacts.has(e.pointerId)||!drag)return;
  const p=point(e);contacts.set(e.pointerId,p);
  if(drag.pair){
   const now=pair(),was=drag.pair,old=drag.view,z=clamp(old.z*now.d/was.d,1,12);
   view={z,x:clamp(now.x-(was.x-old.x)*z/old.z,1-z,0),y:clamp(now.y-(was.y-old.y)*z/old.z,1-z,0)};paint();
  }else if(drag.edge==='pan'){
   view.x=clamp(drag.view.x+p.x-drag.p.x,1-view.z,0);view.y=clamp(drag.view.y+p.y-drag.p.y,1-view.z,0);paint();
  }else adjust(drag.box,drag.edge,p.x-drag.p.x,p.y-drag.p.y);
 };
 stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=e=>{
  if(!contacts.delete(e.pointerId))return;
  drag=contacts.size?{p:[...contacts.values()][0],box:{...box},view:{...view},edge:view.z>1?'pan':'move'}:null;
 };
 frame.onkeydown=e=>{
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(!delta)return;e.preventDefault();
  adjust(box,e.target.dataset.edge||'move',delta[0]*(e.shiftKey?10:1)/stage.clientWidth,delta[1]*(e.shiftKey?10:1)/stage.clientHeight);
 };
 dialog.querySelector('[data-reset]').onclick=()=>{box=full();view={x:0,y:0,z:1};paint();};
 document.body.append(dialog);paint();dialog.showModal();
 const confirmed=await new Promise(resolve=>dialog.onclose=()=>resolve(dialog.returnValue==='crop'));dialog.remove();if(!confirmed)return;
 const rect=[(box.l-view.x)/view.z*img.naturalWidth,(box.t-view.y)/view.z*img.naturalHeight,
  (box.r-box.l)/view.z*img.naturalWidth,(box.b-box.t)/view.z*img.naturalHeight];
 const canvas=document.createElement('canvas'),factor=Math.min(1,2048/Math.max(rect[2],rect[3]));
 canvas.width=Math.max(1,Math.round(rect[2]*factor));canvas.height=Math.max(1,Math.round(rect[3]*factor));
 canvas.getContext('2d').drawImage(img,...rect,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.93));
 if(!blob)throw Error('ครอปรูปไม่สำเร็จ');
 return {blob,widthFraction:rect[2]/img.naturalWidth,heightFraction:rect[3]/img.naturalHeight};
}
