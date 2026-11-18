export const shapes = {rect:'สี่เหลี่ยม', ellipse:'วงรี', triangle:'สามเหลี่ยม', line:'เส้นตรง', arrow:'ลูกศร'};

export function makeShape(id, kind, start, end, color, width) {
 return {id,type:'shape',kind,color,width,
  x:Math.min(start.x,end.x), y:Math.min(start.y,end.y),
  w:Math.max(1,Math.abs(end.x-start.x)), h:Math.max(1,Math.abs(end.y-start.y)),
  reverseX:end.x<start.x, reverseY:end.y<start.y};
}

export function shapeSVG(o) {
 const {x,y,w,h}=o;
 const style=`data-object="${o.id}" data-shape="${o.kind}" fill="none" stroke="${o.color}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round"`;
 if(o.kind==='rect')return `<rect ${style} x="${x}" y="${y}" width="${w}" height="${h}"/>`;
 if(o.kind==='ellipse')return `<ellipse ${style} cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}"/>`;
 if(o.kind==='triangle')return `<path ${style} d="M${x+w/2} ${y} L${x+w} ${y+h} H${x} Z"/>`;
 const x1=o.reverseX?x+w:x, x2=o.reverseX?x:x+w, y1=o.reverseY?y+h:y, y2=o.reverseY?y:y+h;
 let path=`M${x1} ${y1} L${x2} ${y2}`;
 if(o.kind==='arrow'){
  const dx=x2-x1,dy=y2-y1,length=Math.hypot(dx,dy),head=Math.min(length*.45,Math.max(14,o.width*4));
  const bx=x2-head*dx/length,by=y2-head*dy/length,sx=-head*.5*dy/length,sy=head*.5*dx/length;
  path+=` M${bx+sx} ${by+sy} L${x2} ${y2} L${bx-sx} ${by-sy}`;
 }
 return `<path ${style} d="${path}"/>`;
}
