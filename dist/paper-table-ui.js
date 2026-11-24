import {makeTable,tracks,tableStyle} from './paper-table.js?v=20261121-table-colors';
import {uid} from './paper-core.js?v=20261124-notebook-v2';

export function mountTableEditor(root,{page,change,writable,finishText,viewport,getScale,getCanvasLimit=()=>1273,onSaved,say}){
 const layer=document.createElement('div');
 layer.className='paper-inline-table';
 root.querySelector('#paper-sheet').append(layer);
 let active='',shape='',drag=null;
 const current=()=>page().objects.find(o=>o.id===active);
 const field=(r,c)=>layer.querySelector(`textarea[data-r="${r}"][data-c="${c}"]`);
 function layout(o){
  Object.assign(layer.style,{left:o.x+'px',top:o.y+'px',width:o.w+'px',height:o.h+'px'});
  for(const [axis,key,count] of [['x','columns',o.cells[0].length],['y','rows',o.cells.length]]){
   const sizes=tracks(o,key,count);
   layer.style[axis==='x'?'gridTemplateColumns':'gridTemplateRows']=sizes.map(v=>v+'fr').join(' ');
   let end=0;
   sizes.slice(0,-1).forEach((v,i)=>{
    end+=v;
    layer.querySelector(`[data-axis="${axis}"][data-index="${i}"]`).style[axis==='x'?'left':'top']=end*100+'%';
   });
  }
 }
 function grip(axis,index,label){
  const el=document.createElement('span');
  el.className='table-grip';el.dataset.axis=axis;el.dataset.index=index;el.title=label;
  layer.append(el);
 }
 function sync(o){
  if(!o){active='';shape='';layer.hidden=true;layer.replaceChildren();drag=null;return;}
  const rows=o.cells.length,cols=o.cells[0].length,key=[o.id,rows,cols].join('/');
  if(shape!==key){
   layer.replaceChildren();active=o.id;shape=key;
   o.cells.forEach((row,r)=>row.forEach((_,c)=>{
    const input=document.createElement('textarea');
    input.dataset.r=r;input.dataset.c=c;input.maxLength=500;
    input.setAttribute('aria-label',`แถว ${r+1} คอลัมน์ ${c+1}`);layer.append(input);
   }));
   for(let i=0;i<cols-1;i++)grip('x',i,'ปรับความกว้างคอลัมน์');
   for(let i=0;i<rows-1;i++)grip('y',i,'ปรับความสูงแถว');
   for(const axis of ['left','right','top','bottom','move'])grip(axis,-1,axis==='move'?'ย้ายตาราง':'ปรับขนาดตาราง');
  }
  layer.hidden=false;
  const palette=tableStyle(o);
  o.cells.forEach((row,r)=>row.forEach((text,c)=>{const el=field(r,c);if(el.value!==text)el.value=text;
   el.style.backgroundColor=r===0?palette.headerBg:palette.bodyBg;
   el.style.color=r===0?palette.headerTextColor:palette.textColor;
   el.style.borderColor=palette.borderColor;
  }));
  if(!drag)layout(o);
 }
 layer.oninput=e=>{
  const el=e.target,r=Number(el.dataset.r),c=Number(el.dataset.c),o=current();
  if(!o)return;
  if(o.cells.flat().reduce((n,s)=>n+s.length,0)-o.cells[r][c].length+el.value.length>12000){
   el.value=o.cells[r][c];say('ข้อความในตารางยาวเกินไป กรุณาแยกเป็นหลายตาราง',true);return;
  }
  change(p=>{p.objects.find(t=>t.id===active).cells[r][c]=el.value;});
 };
 const limit=(v,min,max)=>Math.max(min,Math.min(max,v));
 layer.onpointerdown=e=>{
  const {axis,index}=e.target.dataset;
  if(!axis||drag)return;
  e.preventDefault();layer.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,axis,index:Number(index),x:e.clientX,y:e.clientY,original:current(),scale:getScale()};
 };
 function preview(e){
  const {axis,index,original:o,scale}=drag,next={...o};
  const dx=(e.clientX-drag.x)/scale,dy=(e.clientY-drag.y)/scale;
  if(axis==='move'){next.x=limit(o.x+dx,0,900-o.w);next.y=limit(o.y+dy,0,getCanvasLimit()-o.h);}
  else if(axis==='x'||axis==='y'){
   const horizontal=axis==='x',key=horizontal?'columns':'rows';
   const weights=tracks(o,key,horizontal?o.cells[0].length:o.cells.length);
   const min=Math.min((horizontal?32:24)/(horizontal?o.w:o.h),weights[index],weights[index+1]);
   const d=limit((horizontal?dx/o.w:dy/o.h),min-weights[index],weights[index+1]-min);
   weights[index]+=d;weights[index+1]-=d;next[key]=weights;
  }else{
   const mw=Math.min(o.w,o.cells[0].length*32),mh=Math.min(o.h,o.cells.length*24);
   if(axis==='left'){next.x=limit(o.x+dx,0,o.x+o.w-mw);next.w=o.w+o.x-next.x;}
   if(axis==='right')next.w=limit(o.w+dx,mw,900-o.x);
   if(axis==='top'){next.y=limit(o.y+dy,0,o.y+o.h-mh);next.h=o.h+o.y-next.y;}
   if(axis==='bottom')next.h=limit(o.h+dy,mh,getCanvasLimit()-o.y);
  }
  return next;
 }
 layer.onpointermove=e=>{if(drag?.id===e.pointerId)layout(preview(e));};
 layer.onpointerup=e=>{
  if(drag?.id!==e.pointerId)return;
  const next=preview(e),axis=drag.axis;drag=null;
  change(p=>{const o=p.objects.find(t=>t.id===active);if(!o)return;
   if(axis==='x')o.columns=next.columns;
   else if(axis==='y')o.rows=next.rows;
   else Object.assign(o,{x:next.x,y:next.y,w:next.w,h:next.h});
  });
 };
 layer.onlostpointercapture=()=>{if(drag){drag=null;if(current())layout(current());}};
 function open(item,r=0,c=0){
  writable();finishText();
  if(!item){
   item=makeTable(uid());item.y=limit(viewport.scrollTop/getScale()+110,12,getCanvasLimit()-item.h-24);
   if(!change(p=>p.objects.push(item)))return;
  }
  onSaved(item.id);field(r,c)?.focus({preventScroll:true});
 }
 return {open,sync,close:()=>layer.remove()};
}
