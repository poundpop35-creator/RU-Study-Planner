// Simple, conservative recognizer: only convert confident closed shapes or straight strokes.
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const distanceToSegment=(p,a,b)=>{
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
function simplify(points,epsilon){
 if(points.length<=2)return points;
 let far=0,at=0;
 for(let i=1;i<points.length-1;i++){const d=distanceToSegment(points[i],points[0],points.at(-1));if(d>far){far=d;at=i;}}
 if(far<=epsilon)return [points[0],points.at(-1)];
 return [...simplify(points.slice(0,at+1),epsilon).slice(0,-1),...simplify(points.slice(at),epsilon)];
}
export function recognizeHeldShape(samples){
 if(!Array.isArray(samples)||samples.length<3)return null;
 const p=samples.map(v=>({x:v[0],y:v[1]})),first=p[0],last=p.at(-1),xs=p.map(v=>v.x),ys=p.map(v=>v.y);
 const minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys),w=maxX-minX,h=maxY-minY,diag=Math.hypot(w,h);
 if(diag<32)return null;
 const travelled=p.slice(1).reduce((sum,v,i)=>sum+dist(v,p[i]),0);
 const direct=dist(first,last),dev=Math.max(...p.map(v=>distanceToSegment(v,first,last)));
 if(direct>40&&travelled/direct<1.20&&dev<Math.max(8,direct*.08))return {kind:'line',start:first,end:last};
 const closed=direct<Math.max(18,diag*.21)&&travelled>diag*1.80&&w>25&&h>25;
 if(!closed)return null;
 const cx=(minX+maxX)/2,cy=(minY+maxY)/2,rx=w/2,ry=h/2;
 const ellipseError=p.reduce((v,pt)=>v+Math.abs(Math.hypot((pt.x-cx)/rx,(pt.y-cy)/ry)-1),0)/p.length;
 const rectangleError=p.reduce((v,pt)=>v+Math.min(Math.abs(pt.x-minX),Math.abs(pt.x-maxX),Math.abs(pt.y-minY),Math.abs(pt.y-maxY)),0)/p.length;
 if(rectangleError<Math.max(5,Math.min(w,h)*.085)&&ellipseError>.14){
  return {kind:Math.abs(w-h)/Math.max(w,h)<.1?'square':'rect',start:{x:minX,y:minY},end:{x:maxX,y:maxY}};
 }
 if(ellipseError<.19){
  return {kind:Math.abs(w-h)/Math.max(w,h)<.12?'circle':'ellipse',start:{x:minX,y:minY},end:{x:maxX,y:maxY}};
 }
 // Validate the three sides and preserve the apex direction. A simple
 // 3-corner simplification alone can turn a downward triangle upright.
 const triangle=drawnTriangle(tracePoints(samples));
 if(triangle)return triangle;
 return null;
}
export function rulerProject(point,ruler,edge=1){
 const radians=ruler.angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
 const u=Math.max(-ruler.length/2,Math.min(ruler.length/2,(point.x-ruler.x)*c+(point.y-ruler.y)*s));
 const v=edge*ruler.height/2;
 return {x:ruler.x+u*c-v*s,y:ruler.y+u*s+v*c};
}
export function rulerSnap(point,ruler,threshold=18){
 if(!ruler?.active)return null;
 const a=ruler.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const u=(point.x-ruler.x)*c+(point.y-ruler.y)*s,v=-(point.x-ruler.x)*s+(point.y-ruler.y)*c;
 if(Math.abs(u)>ruler.length/2+6)return null;
 const edge=v>=0?1:-1;
 if(Math.abs(v-edge*ruler.height/2)>threshold)return null;
 return {...rulerProject(point,ruler,edge),edge};
}
export function rulerSVG(ruler){
 if(!ruler.active)return '';
 const ticks=Array.from({length:31},(_,i)=>{
  const x=-ruler.length/2+i*ruler.length/30;
  return `<path d="M${x} ${-ruler.height/2} V${-ruler.height/2+(i%5===0?18:i%2===0?12:7)}" stroke="#57749e" stroke-width="1.5" pointer-events="none"/>`;
 }).join('');
 return `<g transform="translate(${ruler.x} ${ruler.y}) rotate(${ruler.angle})" data-ruler-overlay="true">
  <rect x="${-ruler.length/2}" y="${-ruler.height/2}" width="${ruler.length}" height="${ruler.height}" rx="6" fill="#cfe3ff" fill-opacity=".65" stroke="#4776b6" stroke-width="2" pointer-events="none"/>
  ${ticks}
  <g data-ruler="move" role="button" aria-label="ย้ายไม้บรรทัด" style="cursor:move">
   <circle cx="0" cy="0" r="25" fill="#3155d9" stroke="#fff" stroke-width="3"/>
   <path d="M-11 0 H11 M0 -11 V11 M-11 0 l5 -5 M-11 0 l5 5 M11 0 l-5 -5 M11 0 l-5 5" fill="none" stroke="#fff" stroke-width="2.5" pointer-events="none"/>
  </g>
  <path d="M${ruler.length/2} 0 H${ruler.length/2+50}" stroke="#4776b6" stroke-width="2" pointer-events="none"/>
  <g data-ruler="rotate" role="button" aria-label="หมุนไม้บรรทัด" style="cursor:grab"><circle cx="${ruler.length/2+50}" cy="0" r="24" fill="#fff" stroke="#3155d9" stroke-width="3"/><path d="M${ruler.length/2+40} -4 Q${ruler.length/2+55} -18 ${ruler.length/2+62} 1 M${ruler.length/2+62} 1 l-9 -4 M${ruler.length/2+62} 1 l-3 -9" stroke="#3155d9" fill="none" stroke-width="3" pointer-events="none"/></g>
 </g>`;
}

// Even spacing keeps slow corners and fast straight sections equally weighted.
function tracePoints(samples){
 const trace=samples.map(([x,y])=>({x,y}));
 const lengths=[0];
 for(let i=1;i<trace.length;i++)lengths.push(lengths[i-1]+dist(trace[i-1],trace[i]));
 const length=lengths.at(-1);
 if(!Number.isFinite(length)||length<24)return [];
 let i=1;
 return Array.from({length:65},(_,j)=>{
  const at=length*j/64;
  while(i<trace.length-1&&lengths[i]<at)i++;
  const t=(at-lengths[i-1])/(lengths[i]-lengths[i-1]||1);
  return {x:trace[i-1].x+(trace[i].x-trace[i-1].x)*t,y:trace[i-1].y+(trace[i].y-trace[i-1].y)*t};
 });
}

function drawnTriangle(p){
 const xs=p.map(v=>v.x),ys=p.map(v=>v.y);
 const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 if(Math.min(w,h)<10||dist(p[0],p.at(-1))>Math.hypot(w,h)*.23)return null;
 const unit=p.map(v=>({x:(v.x-x)/w,y:(v.y-y)/h}));
 for(const inverted of [false,true]){
  const base=inverted?0:1;
  const corners=[{x:0,y:base},{x:1,y:base},{x:.5,y:1-base}];
  if(corners.some(c=>!unit.some(v=>dist(v,c)<.21)))continue;
  const deviations=unit.map(v=>Math.min(...corners.map((c,i)=>distanceToSegment(v,c,corners[(i+1)%3]))));
  if(Math.max(...deviations)<.19&&deviations.reduce((a,b)=>a+b,0)/unit.length<.075)
   return {kind:'triangle',inverted,start:{x,y},end:{x:x+w,y:y+h}};
 }
 return null;
}

// A rough but clearly single-direction pen stroke may have more local jitter
// than the hold recognizer permits. Never turn a bent stroke or open V into a
// line: the midpoint/overall deviation must remain small.
function forgivingStraightLine(points){
 if(points.length<3)return null;
 const start=points[0],end=points.at(-1),length=dist(start,end);
 if(length<42)return null;
 const traveled=points.slice(1).reduce((n,p,i)=>n+dist(p,points[i]),0);
 const dev=points.map(p=>distanceToSegment(p,start,end));
 const mean=dev.reduce((a,b)=>a+b,0)/dev.length;
 if(traveled/length>1.38||Math.max(...dev)>Math.max(9,length*.125)||mean>Math.max(4,length*.045))return null;
 // A tiny backwards flourish is okay, but a U-turn/retracing is not.
 const vx=(end.x-start.x)/length,vy=(end.y-start.y)/length;
 let progress=-Infinity,back=0;
 for(const p of points){
  const t=(p.x-start.x)*vx+(p.y-start.y)*vy;
  if(t<progress-length*.055)back+=progress-t;
  progress=Math.max(progress,t);
 }
 if(back>length*.17)return null;
 return {kind:'line',start,end};
}

function drawnArrow(points){
 // The shaft reaches the tip first. The rest of the trace must visit both wings
 // behind the tip, allowing a retraced wing or a closed triangular head.
 const tail=points[0];
 for(let i=points.length-4;i>=12;i--){
  const tip=points[i],length=dist(tail,tip);
  if(length<24)continue;
  const ux=(tip.x-tail.x)/length,uy=(tip.y-tail.y)/length;
  if(points.slice(1,i).some(v=>distanceToSegment(v,tail,tip)>length*.09))continue;
  let left=0,right=0,invalid=false;
  for(const v of points.slice(i+1)){
   const dx=(v.x-tip.x)/length,dy=(v.y-tip.y)/length;
   const back=-dx*ux-dy*uy,side=dx*uy-dy*ux;
   if(back<-.035||back>.52||Math.abs(side)>back*1.75+.035){invalid=true;break;}
   left=Math.max(left,side);right=Math.max(right,-side);
  }
  if(!invalid&&Math.min(left,right)>.065&&Math.min(left,right)>.32*Math.max(left,right))
   return {kind:'arrow',start:tail,end:tip};
 }
 return null;
}

/* Forgiving release recognizer for the deliberate "จัดทรง" mode. */
export function recognizeDrawnShape(samples){
 if(!Array.isArray(samples)||samples.length<3)return null;
 const uniform=tracePoints(samples);
 if(!uniform.length)return null;
 const directional=drawnTriangle(uniform)||drawnArrow(uniform)||drawnArrow([...uniform].reverse());
 if(directional)return directional;
 const exact=recognizeHeldShape(samples);
 if(exact)return exact;
 const line=forgivingStraightLine(uniform);
 if(line)return line;
 if(!Array.isArray(samples)||samples.length<9)return null;
 const p=samples.map(s=>({x:Number(s[0]),y:Number(s[1])}));
 if(p.some(a=>!Number.isFinite(a.x)||!Number.isFinite(a.y)))return null;
 const xs=p.map(a=>a.x),ys=p.map(a=>a.y);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const w=maxX-minX,h=maxY-minY,diagonal=Math.hypot(w,h);
 if(w<27||h<27||diagonal<45||Math.max(w,h)/Math.min(w,h)>3.4)return null;
 if(dist(p[0],p.at(-1))>diagonal*.80)return null;
 const cx=(maxX+minX)/2,cy=(maxY+minY)/2,rx=w/2,ry=h/2;
 const theta=p.map(a=>Math.atan2((a.y-cy)/ry,(a.x-cx)/rx));
 let signed=0,total=0;
 for(let i=1;i<theta.length;i++){
  let step=theta[i]-theta[i-1];
  while(step>Math.PI)step-=Math.PI*2;
  while(step< -Math.PI)step+=Math.PI*2;
  signed+=step;total+=Math.abs(step);
 }
 if(Math.abs(signed)<4.35||Math.abs(signed)>9.5||Math.abs(signed)/Math.max(1,total)<.70)return null;
 const err=p.map(a=>Math.abs(Math.hypot((a.x-cx)/rx,(a.y-cy)/ry)-1));
 if(err.reduce((sum,x)=>sum+x,0)/err.length>.28||err.filter(x=>x>.43).length/err.length>.25)return null;
 return {kind:Math.abs(w-h)/Math.max(w,h)<.20?'circle':'ellipse',
  start:{x:minX,y:minY},end:{x:maxX,y:maxY}};
}

// Clean up open, axis-aligned diagram strokes, including a pen retracing a branch.
export function diagramSegments(samples){
 if(samples.length<2)return null;
 const points=samples.map(([x,y])=>({x,y}));
 // Bound the corner search on long Pencil strokes.
 const step=Math.max(1,Math.ceil(points.length/400));
 const path=points.filter((_,i)=>i%step===0||i===points.length-1);
 const span=Math.max(Math.max(...path.map(p=>p.x))-Math.min(...path.map(p=>p.x)),
  Math.max(...path.map(p=>p.y))-Math.min(...path.map(p=>p.y)));
 if(span<10)return null;
 const tolerance=Math.max(3,Math.min(8,span*.055)),nodes=simplify(path,tolerance);
 if(nodes.length<2||nodes.length>32)return null;
 const runs=[];
 for(let i=1;i<nodes.length;i++){
  const a=nodes[i-1],b=nodes[i],dx=Math.abs(b.x-a.x),dy=Math.abs(b.y-a.y);
  if(Math.max(dx,dy)<tolerance)continue;
  if(Math.min(dx,dy)>Math.max(dx,dy)*.36)return null;
  const horizontal=dx>=dy,axis=horizontal?'y':'x',along=horizontal?'x':'y';
  const level=(a[axis]+b[axis])/2;
  const near=runs.find(r=>r.axis===axis&&Math.abs(r.level-level)<=tolerance*1.6);
  runs.push({from:a,axis,along,level:near?.level??level,lo:Math.min(a[along],b[along]),hi:Math.max(a[along],b[along])});
 }
 // Intersect neighboring legs exactly, including reversals back to a junction.
 for(let i=1;i<runs.length;i++){
  const a=runs[i-1],b=runs[i];
  if(a.axis===b.axis)continue;
  for(const [leg,cross] of [[a,b],[b,a]]){
   const edge=Math.abs(b.from[leg.along]-leg.lo)<Math.abs(b.from[leg.along]-leg.hi)?'lo':'hi';
   leg[edge]=cross.level;
  }
 }
 const merged=[];
 for(const run of runs){
  let {lo,hi}=run;
  for(let i=merged.length-1;i>=0;i--){
   const other=merged[i];
   if(other.axis!==run.axis||other.level!==run.level||other.hi<lo-tolerance||other.lo>hi+tolerance)continue;
   lo=Math.min(lo,other.lo);hi=Math.max(hi,other.hi);merged.splice(i,1);
  }
  merged.push({...run,lo,hi});
 }
 if(!merged.length)return null;
 return merged.map(({axis,along,level,lo,hi})=>({start:{[axis]:level,[along]:lo},end:{[axis]:level,[along]:hi}}));
}

export function hasBranchJunction(segments){
 const h=segments.filter(s=>s.start.y===s.end.y),v=segments.filter(s=>s.start.x===s.end.x);
 return h.some(row=>v.some(col=>{
  const x=col.start.x,y=row.start.y;
  return x>=row.start.x-2&&x<=row.end.x+2&&y>=col.start.y-2&&y<=col.end.y+2&&
   ((x>row.start.x+3&&x<row.end.x-3)||(y>col.start.y+3&&y<col.end.y-3));
 }));
}
