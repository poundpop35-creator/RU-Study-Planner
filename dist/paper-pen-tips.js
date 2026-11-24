export const PEN_TIPS={
 fine:{label:'หัวแหลม',width:5,max:12,opacity:1,color:'#172033',presets:[1,2,3,5,8,12],icon:'M5 19l2-6 10-10 4 4L11 17z M7 13l4 4'},
 pencil:{label:'ดินสอ',width:2,max:12,opacity:.72,color:'#172033',presets:[1,2,3,5,8,12],icon:'M4 20l2-7L16 3l5 5L11 18z M6 13l5 5 M14 5l5 5'},
 chisel:{label:'ไฮไลต์หัวตัด',width:12,max:40,opacity:.3,color:'#f5cc55',presets:[4,8,12,20,28,40],icon:'M3 17l4-5 5 4-4 5H3z M7 12l9-10 6 6-10 8'},
 marker:{label:'มาร์กเกอร์',width:8,max:40,opacity:1,color:'#172033',presets:[4,8,12,20,28,40],icon:'M4 20v-6l9-11 7 6-9 11z M4 14l7 6'},
 brush:{label:'พู่กัน',width:8,max:40,opacity:1,color:'#172033',presets:[4,8,12,20,28,40],icon:'M3 21q1-7 6-9l4 4Q10 21 3 21z M9 12L19 2l3 3-9 11'}
};
export const validTip=key=>typeof key==='string'&&Object.hasOwn(PEN_TIPS,key);
export function tipSettings(key,value={}){
 const d=PEN_TIPS[key]||PEN_TIPS.fine;
 return {width:Number.isInteger(value.width)&&value.width>=1&&value.width<=d.max?value.width:d.width,
 opacity:typeof value.opacity==='number'&&Number.isFinite(value.opacity)&&value.opacity>=.05&&value.opacity<=1?value.opacity:d.opacity,
 color:typeof value.color==='string'&&/^#[a-f0-9]{6}$/i.test(value.color)?value.color:d.color};
}
const r=n=>Math.round(n*100)/100;
const xy=p=>r(p[0])+','+r(p[1]);
const path=ps=>ps.map((p,i)=>(i?'L':'M')+xy(p)).join(' ');
const polygon=ps=>path(ps)+' Z';
// Draw a fixed-angle rectangular nib swept along the sampled centerline.
// All overlapping segments are filled within one path at one opacity.
function chiselPath(points,w){
 const a=Math.PI/9,ux=Math.sin(a)*w/2,uy=Math.cos(a)*w/2,vx=Math.cos(a)*w*.15,vy=-Math.sin(a)*w*.15;
 const corners=([x,y])=>[[x+ux+vx,y+uy+vy],[x-ux+vx,y-uy+vy],[x-ux-vx,y-uy-vy],[x+ux-vx,y+uy-vy]];
 const stamps=points.map(corners);let d=stamps.map(polygon).join(' ');
 for(let i=1;i<stamps.length;i++){const p=stamps[i-1],q=stamps[i];for(let j=0;j<4;j++){const k=(j+1)%4;const face=[p[j],p[k],q[k],q[j]];const area=face.reduce((s,v,n)=>s+v[0]*face[(n+1)%4][1]-v[1]*face[(n+1)%4][0],0);if(area<0)face.reverse();d+=' '+polygon(face);}}
 return d;
}
export function renderTipStroke(o,points){
 const tip=PEN_TIPS[o.tip],opacity=o.opacity??tip.opacity,w=o.width,c=o.color;
 let body='';
 if(o.tip==='chisel'){
  // Use the same winding for all components; overlap must never punch holes.
  const d=chiselPath(points,w);
  body='<path d="'+d+'" fill="'+c+'"/>';
 }else if(o.tip==='marker'){
  body=points.length===1?'<circle cx="'+r(points[0][0])+'" cy="'+r(points[0][1])+'" r="'+w/2+'" fill="'+c+'"/>':'<path d="'+path(points)+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round" stroke-linejoin="round"/>';
 }else if(o.tip==='pencil'){
  const d=path(points);
  body=points.length===1?'<circle cx="'+r(points[0][0])+'" cy="'+r(points[0][1])+'" r="'+w*.4+'" fill="'+c+'"/>':'<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w*.65+'" stroke-linecap="round" stroke-linejoin="round" opacity=".65"/><path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round" stroke-dasharray="'+Math.max(.4,w*.3)+' '+Math.max(.5,w*.4)+'" opacity=".45"/>';
 }else{
  if(points.length===1)body='<circle cx="'+r(points[0][0])+'" cy="'+r(points[0][1])+'" r="'+w/2+'" fill="'+c+'"/>';
  else{
   const left=[],right=[];
   for(let i=0;i<points.length;i++){
    const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;
    const taper=o.tip==='brush'?Math.min(1,.12+i*.28,.12+(points.length-1-i)*.28):1;
    const radius=w*(o.tip==='brush'?(.18+1.27*p[2]):(.45+p[2]))*.5*taper;
    left.push([p[0]-dy/l*radius,p[1]+dx/l*radius]);right.push([p[0]+dy/l*radius,p[1]-dx/l*radius]);
   }
   body='<path d="'+polygon([...left,...right.reverse()])+'" fill="'+c+'"/>';
  }
 }
 return '<g data-object="'+o.id+'" data-pen-tip="'+o.tip+'" opacity="'+opacity+'">'+body+'</g>';
}
