export const shapes={rect:'สี่เหลี่ยมผืนผ้า',roundrect:'สี่เหลี่ยมมุมมน',square:'สี่เหลี่ยมจัตุรัส',ellipse:'วงรี',circle:'วงกลม',triangle:'สามเหลี่ยม',diamond:'ข้าวหลามตัด',pentagon:'ห้าเหลี่ยม',hexagon:'หกเหลี่ยม',star:'ดาว',line:'เส้นตรง',arrow:'ลูกศร',doubleArrow:'ลูกศรสองหัว',elbow:'เส้นเชื่อมหักมุม'};
export const lineStyles={solid:'เส้นทึบ',dashed:'เส้นประ',dotted:'เส้นจุด'};
export function makeShape(id,kind,start,end,color,width,lineStyle='solid'){
 let dx=Math.abs(end.x-start.x),dy=Math.abs(end.y-start.y);
 if(kind==='square'||kind==='circle'){const side=Math.max(1,Math.min(dx,dy));dx=side;dy=side;}
 return {id,type:'shape',kind,color,width,lineStyle,x:end.x<start.x?start.x-dx:start.x,y:end.y<start.y?start.y-dy:start.y,
  w:Math.max(1,dx),h:Math.max(1,dy),reverseX:end.x<start.x,reverseY:end.y<start.y};
}
const regularPolygon=(n,cx,cy,rx,ry,shift=-Math.PI/2)=>
 Array.from({length:n},(_,i)=>{const t=shift+i*Math.PI*2/n;return [cx+rx*Math.cos(t),cy+ry*Math.sin(t)];})
 .map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')+' Z';
const starPath=(cx,cy,rx,ry)=>
 Array.from({length:10},(_,i)=>{const t=-Math.PI/2+i*Math.PI/5,k=i%2?.45:1;return [cx+rx*k*Math.cos(t),cy+ry*k*Math.sin(t)];})
 .map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')+' Z';
function arrowHead(x1,y1,x2,y2,width){
 const dx=x2-x1,dy=y2-y1,length=Math.hypot(dx,dy)||1;
 const head=Math.min(length*.4,Math.max(10,width*4)),ux=dx/length,uy=dy/length;
 const bx=x2-head*ux,by=y2-head*uy,sx=-uy*head*.45,sy=ux*head*.45;
 return ` M${bx+sx} ${by+sy} L${x2} ${y2} L${bx-sx} ${by-sy}`;
}
export function shapeSVG(o){
 const {x,y,w,h}=o,cx=x+w/2,cy=y+h/2;
 const dash=o.lineStyle==='dashed'?` stroke-dasharray="${Math.max(6,o.width*4)} ${Math.max(4,o.width*2)}"`:
  o.lineStyle==='dotted'?` stroke-dasharray="1 ${Math.max(5,o.width*2.5)}"`:'';
 const style=`data-object="${o.id}" data-shape="${o.kind}" fill="none" stroke="${o.color}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round"${dash}`;
 if(['rect','square'].includes(o.kind))return `<rect ${style} x="${x}" y="${y}" width="${w}" height="${h}"/>`;
 if(o.kind==='roundrect')return `<rect ${style} x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w,h)*.17}"/>`;
 if(['ellipse','circle'].includes(o.kind))return `<ellipse ${style} cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}"/>`;
 if(o.kind==='triangle')return `<path ${style} d="M${cx} ${y} L${x+w} ${y+h} H${x} Z"/>`;
 if(o.kind==='diamond')return `<path ${style} d="M${cx} ${y} L${x+w} ${cy} L${cx} ${y+h} L${x} ${cy} Z"/>`;
 if(o.kind==='pentagon')return `<path ${style} d="${regularPolygon(5,cx,cy,w/2,h/2)}"/>`;
 if(o.kind==='hexagon')return `<path ${style} d="${regularPolygon(6,cx,cy,w/2,h/2,0)}"/>`;
 if(o.kind==='star')return `<path ${style} d="${starPath(cx,cy,w/2,h/2)}"/>`;
 const x1=o.reverseX?x+w:x,x2=o.reverseX?x:x+w,y1=o.reverseY?y+h:y,y2=o.reverseY?y:y+h;
 if(o.kind==='elbow')return `<path ${style} d="M${x1} ${y1} H${x2} V${y2}"/>`;
 let path=`M${x1} ${y1} L${x2} ${y2}`;
 if(['arrow','doubleArrow'].includes(o.kind))path+=arrowHead(x1,y1,x2,y2,o.width);
 if(o.kind==='doubleArrow')path+=arrowHead(x2,y2,x1,y1,o.width);
 return `<path ${style} d="${path}"/>`;
}
