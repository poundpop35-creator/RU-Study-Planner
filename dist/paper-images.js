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
 dialog.className='paper-sheet-dialog';
 dialog.innerHTML='<form method="dialog"><h2>ครอปรูป</h2><canvas width="260" height="160"></canvas>'+['ซ้าย','ขวา','บน','ล่าง'].map(label=>'<label>'+label+' <input type="range" min="0" max="95" value="0"></label>').join('')+'<footer><button value="cancel">ยกเลิก</button><button value="crop">ใช้ส่วนที่เลือก</button></footer></form>';
 document.body.append(dialog);
 const sliders=[...dialog.querySelectorAll('input')],preview=dialog.querySelector('canvas');
 function region(){const [l,r,t,b]=sliders.map(s=>Number(s.value)/100);return [l*img.width,t*img.height,Math.max(1,(1-l-r)*img.width),Math.max(1,(1-t-b)*img.height)];}
 function paint(){
  sliders.forEach((s,i)=>s.max=String(95-Number(sliders[i^1].value)));
  const rect=region(),ratio=Math.min(preview.width/rect[2],preview.height/rect[3]);
  const ctx=preview.getContext('2d');ctx.clearRect(0,0,preview.width,preview.height);ctx.drawImage(img,...rect,0,0,rect[2]*ratio,rect[3]*ratio);
 }
 dialog.oninput=paint;paint();dialog.showModal();
 const confirmed=await new Promise(resolve=>dialog.onclose=()=>resolve(dialog.returnValue==='crop'));dialog.remove();if(!confirmed)return;
 const rect=region(),canvas=document.createElement('canvas'),factor=Math.min(1,2048/Math.max(rect[2],rect[3]));
 canvas.width=Math.max(1,Math.round(rect[2]*factor));canvas.height=Math.max(1,Math.round(rect[3]*factor));
 canvas.getContext('2d').drawImage(img,...rect,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.93));
 if(!blob)throw Error('ครอปรูปไม่สำเร็จ');
 return {blob,widthFraction:rect[2]/img.width,heightFraction:rect[3]/img.height};
}
