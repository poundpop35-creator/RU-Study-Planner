// Phase 0 prototype: pure layout only. No network, storage, or production writes.
// Validate input with validatePaper before invoking and output before saving.
export function appendImageBatch(paper,items,requestId){
 const W=900,H=1273,MAX=H*250,gap=32;
 const fail=msg=>{throw new Error(msg)};
 if(!paper||![1,2].includes(paper.version)||!Array.isArray(paper.pages)||!paper.pages.length||(paper.version===2&&paper.pages.length!==1))fail('Unsupported paper schema');
 if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,48}$/.test(requestId))fail('Invalid request ID');
 if(!Array.isArray(items)||items.length<1||items.length>10)fail('Expected 1–10 images');
 const prepared=items.map((item,i)=>{
  if(!item||typeof item.imageId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/.test(item.imageId)||!Number.isInteger(item.width)||!Number.isInteger(item.height)||item.width<1||item.height<1||item.width>32768||item.height>32768)fail('Invalid image metadata');
  const scale=Math.min(1,772/item.width,Math.min(900,H-128)/item.height);
  const w=item.width*scale,h=item.height*scale;
  if(w<1||h<1)fail('Unsupported image aspect ratio');
  return {id:'ai-'+requestId+'-'+(i+1),type:'image',imageId:item.imageId,w,h,x:(W-w)/2};
 });
 const old=paper.pages.flatMap(p=>p.objects);
 const prefix='ai-'+requestId+'-';
 const existing=old.filter(o=>o.id.startsWith(prefix));
 if(existing.length){
  if(existing.length!==prepared.length||prepared.some(o=>!existing.some(e=>e.id===o.id&&e.type==='image'&&e.imageId===o.imageId&&e.w===o.w&&e.h===o.h)))fail('Request ID conflict; inspect the saved note before retrying');
  return {paper:JSON.parse(JSON.stringify(paper)),added:0,replayed:true,objectIds:prepared.map(o=>o.id)};
 }
 const next=JSON.parse(JSON.stringify(paper));
 if(next.version===2){
  const p=next.pages[0];
  if(p.objects.length+prepared.length>12000)fail('Paper object limit');
  const bottom=p.objects.reduce((max,o)=>{
   const strokePad=o.type==='stroke'?Math.max(0,Number(o.width)||0):0;
   const rotated=o.type==='shape'&&o.angle?Math.hypot(o.w,o.h)/2-o.h/2:0;
   return Math.max(max,o.y+o.h+strokePad+Math.max(0,rotated));
  },32);
  let y=bottom+gap;
  for(const o of prepared){p.objects.push({...o,y});y+=o.h+gap;}
  if(y>MAX)fail('Continuous paper height limit');
  p.height=Math.max(p.height||H,Math.ceil(y/H)*H);
 }else{
  if(next.pages.length+prepared.length>100)fail('Paper page limit');
  const template=next.pages[next.pages.length-1].template;
  const ids=new Set([...next.pages.map(p=>p.id),...old.map(o=>o.id)]);
  for(const [i,o] of prepared.entries()){
   const pageId='ai-page-'+requestId+'-'+(i+1);
   if(ids.has(pageId)||ids.has(o.id))fail('Object ID collision');
   next.pages.push({id:pageId,template,objects:[{...o,y:64}]});
  }
 }
 return {paper:next,added:prepared.length,replayed:false,objectIds:prepared.map(o=>o.id)};
}
