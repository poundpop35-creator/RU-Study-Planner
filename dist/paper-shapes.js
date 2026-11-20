export const shapes = {
 rect:'สี่เหลี่ยมผืนผ้า',roundRect:'สี่เหลี่ยมมุมมน',square:'สี่เหลี่ยมจัตุรัส',
 ellipse:'วงรี',circle:'วงกลม',triangle:'สามเหลี่ยม',diamond:'สี่เหลี่ยมข้าวหลามตัด',
 pentagon:'ห้าเหลี่ยม',hexagon:'หกเหลี่ยม',star:'ดาว',line:'เส้นตรง',
 arrow:'ลูกศร',doubleArrow:'ลูกศรสองหัว',connector:'เส้นเชื่อมหักมุม'
};
export const lineStyles={solid:'เส้นทึบ',dashed:'เส้นประ',dotted:'เส้นจุด'};
const round=n=>Math.round(n*100)/100;
const hypot=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function polygonPath(x,y,w,h,vertices){
 return vertices.map(([dx,dy],i)=>(i?'L':'M')+round(x+w*dx)+' '+round(y+h*dy)).join(' ')+' Z';
}
function polygonVertices(n,rotation=-Math.PI/2){
 return Array.from({length:n},(_,i)=>[.5+.48*Math.cos(rotation+2*Math.PI*i/n),.5+.48*Math.sin(rotation+2*Math.PI*i/n)]);
}
export function makeShape(id,kind,start,end,color,width,dash='solid'){
 if(!Object.hasOwn(shapes,kind))throw Error('ไม่รู้จักรูปทรงที่เลือก');
 const x=Math.min(start.x,end.x),y=Math.min(start.y,end.y);
 let w=Math.max(1,Math.abs(end.x-start.x)),h=Math.max(1,Math.abs(end.y-start.y));
 if(kind==='square'||kind==='circle'){
  const side=Math.max(w,h);w=side;h=side;
 }
 return {id,type:'shape',kind,color,width,x,y,w,h,
  reverseX:end.x<start.x,reverseY:end.y<start.y,...(dash==='solid'?{}:{dash})};
}
// Each handle moves just its selected edge(s), leaving the opposite edge anchored.
export function resizeShape(shape,edge,dx,dy){
 if(!/^(n|s|e|w|nw|ne|sw|se)$/.test(edge))return {...shape};
 const out={...shape},min=12;
 if(edge.includes('e'))out.w=Math.max(min,Math.min(2700,shape.w+dx));
 if(edge.includes('s'))out.h=Math.max(min,Math.min(3819,shape.h+dy));
 if(edge.includes('w')){
  const right=shape.x+shape.w;
  out.w=Math.max(min,Math.min(2700,right+900,shape.w-dx));
  out.x=right-out.w;
 }
 if(edge.includes('n')){
  const bottom=shape.y+shape.h;
  out.h=Math.max(min,Math.min(3819,bottom+1273,shape.h-dy));
  out.y=bottom-out.h;
 }
 if(Math.abs(out.w-out.h)>0.1){
  if(out.kind==='square')out.kind='rect';
  if(out.kind==='circle')out.kind='ellipse';
 }
 return out;
}
function arrowHead(x,y,dx,dy,width,sign=1){
 const length=Math.hypot(dx,dy)||1,head=Math.min(length*.45,Math.max(14,width*4));
 const ux=sign*dx/length,uy=sign*dy/length;
 return `M${round(x-head*ux-head*.48*uy)} ${round(y-head*uy+head*.48*ux)} L${round(x)} ${round(y)} L${round(x-head*ux+head*.48*uy)} ${round(y-head*uy-head*.48*ux)}`;
}
export function shapeSVG(o){
 const {x,y,w,h}=o;
 const dash=o.dash==='dashed'?` stroke-dasharray="${Math.max(8,o.width*4)} ${Math.max(4,o.width*3)}"`:o.dash==='dotted'?` stroke-dasharray="1 ${Math.max(5,o.width*3)}"`:'';
 const style=`data-object="${o.id}" data-shape="${o.kind}" fill="none" stroke="${o.color}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round"${dash}`;
 if(o.kind==='rect'||o.kind==='square')return `<rect ${style} x="${x}" y="${y}" width="${w}" height="${h}"/>`;
 if(o.kind==='roundRect')return `<rect ${style} x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w,h)*.16}"/>`;
 if(o.kind==='ellipse'||o.kind==='circle')return `<ellipse ${style} cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}"/>`;
 if(o.kind==='triangle')return `<path ${style} d="M${x+w/2} ${y} L${x+w} ${y+h} H${x} Z"/>`;
 if(o.kind==='diamond')return `<path ${style} d="M${x+w/2} ${y} L${x+w} ${y+h/2} L${x+w/2} ${y+h} L${x} ${y+h/2} Z"/>`;
 if(o.kind==='pentagon'||o.kind==='hexagon'||o.kind==='star'){
  const vertices=o.kind==='star'?Array.from({length:10},(_,i)=>{const a=-Math.PI/2+Math.PI*i/5,r=i%2?.22:.49;return [.5+r*Math.cos(a),.5+r*Math.sin(a)];}):polygonVertices(o.kind==='pentagon'?5:6);
  return `<path ${style} d="${polygonPath(x,y,w,h,vertices)}"/>`;
 }
 const x1=o.reverseX?x+w:x,x2=o.reverseX?x:x+w,y1=o.reverseY?y+h:y,y2=o.reverseY?y:y+h;
 const dx=x2-x1,dy=y2-y1;
 let path=`M${x1} ${y1} L${x2} ${y2}`;
 if(o.kind==='connector')path=`M${x1} ${y1} H${(x1+x2)/2} V${y2} H${x2}`;
 if(o.kind==='arrow'||o.kind==='doubleArrow')path+=' '+arrowHead(x2,y2,dx,dy,o.width);
 if(o.kind==='doubleArrow')path+=' '+arrowHead(x1,y1,dx,dy,o.width,-1);
 return `<path ${style} d="${path}"/>`;
}

// Conservative recognition. Only converts after a deliberate hold; otherwise preserves raw ink.
export function recognizeStroke(raw){
 const points=raw.map(p=>({x:Number(p[0]??p.x),y:Number(p[1]??p.y)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
 if(points.length<6)return null;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),
       w=Math.max(...xs)-x,h=Math.max(...ys)-y,diag=Math.hypot(w,h);
 if(diag<34)return null;
 const start=points[0],last=points.at(-1),direct=hypot(start,last);
 let traveled=0,maxDeviation=0;
 for(let i=1;i<points.length;i++)traveled+=hypot(points[i-1],points[i]);
 if(direct>42){
  maxDeviation=Math.max(...points.map(p=>Math.abs((last.x-start.x)*(start.y-p.y)-(start.x-p.x)*(last.y-start.y))/direct));
  if(maxDeviation<Math.max(7,direct*.065)&&traveled/direct<1.22)
   return {kind:'line',start,end:last};
 }
 if(diag<48||hypot(start,last)>Math.max(18,diag*.19)||traveled<diag*2)return null;
 const vertices={rect:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],
 triangle:[[x+w/2,y],[x+w,y+h],[x,y+h]]};
 const distanceSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);};
 const fitPolygon=verts=>{
  const error=points.reduce((sum,p)=>sum+Math.min(...verts.map((a,i)=>distanceSegment(p,a,verts[(i+1)%verts.length]))),0)/points.length;
  const hasCorners=verts.every(v=>points.some(p=>Math.hypot(p.x-v[0],p.y-v[1])<diag*.19));
  return error/diag+(hasCorners?0:1);
 };
 if(w>=28&&h>=28){
  if(fitPolygon(vertices.rect)<.065)return {kind:'rect',start:{x,y},end:{x:x+w,y:y+h}};
  if(fitPolygon(vertices.triangle)<.072)return {kind:'triangle',start:{x,y},end:{x:x+w,y:y+h}};
  const rx=w/2,ry=h/2,cx=x+rx,cy=y+ry;
  const error=points.reduce((sum,p)=>sum+Math.abs(Math.hypot((p.x-cx)/rx,(p.y-cy)/ry)-1),0)/points.length;
  if(error<.11)return {kind:'ellipse',start:{x,y},end:{x:x+w,y:y+h}};
 }
 return null;
}
export function rulerProject(point,ruler,edge=null,tolerance=18){
 const a=ruler.angle*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a),
  dx=point.x-ruler.x,dy=point.y-ruler.y,
  localX=dx*cos+dy*sin,localY=-dx*sin+dy*cos;
 const targetEdge=edge===null?(Math.abs(localY)<Math.abs(localY-48)?0:48):edge;
 if(edge===null&&(localX<0||localX>ruler.length||Math.abs(localY-targetEdge)>tolerance))return null;
 const x=Math.max(0,Math.min(ruler.length,localX));
 return {edge:targetEdge,point:{x:ruler.x+x*cos-targetEdge*sin,y:ruler.y+x*sin+targetEdge*cos}};
}
export function rulerSVG(ruler){
 const {x,y,angle,length}=ruler;
 const ticks=Array.from({length:Math.floor(length/12)+1},(_,i)=>`<path d="M${i*12} 0 v${i%5===0?19:i%2===0?12:8}" stroke="#395b94" stroke-width="1" pointer-events="none"/>`).join('');
 return `<g data-paper-ruler="true" transform="translate(${round(x)} ${round(y)}) rotate(${round(angle)})">
  <rect x="0" y="0" width="${length}" height="48" rx="6" fill="#c9dcf6" fill-opacity=".65" stroke="#4970a7" stroke-width="2"/>
  ${ticks}<text x="12" y="38" fill="#284570" font-size="15" pointer-events="none">ไม้บรรทัด · ${round(angle)}° · ลากเพื่อย้าย</text>
  </g>`;
}
