import {PAGE_W,PAGE_H} from './paper-core.js?v=word-format-20261120';
import {formattedTextHTML} from './paper-rich-text.js?v=word-format-20261120';
import {shapeSVG} from './paper-shapes.js?v=notebook-shape-tools-20261120';
import {tableSVG} from './paper-table.js?v=20261120-table';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=n=>Math.round(n*100)/100;
export function objectSVG(o,images=new Map(),interactive=true){
 if(o.type==='shape')return shapeSVG(o);
 if(o.type==='table')return tableSVG(o,esc);
 if(o.type==='image')return `<image data-object="${o.id}" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" href="${esc(images.get(o.imageId)||'')}" preserveAspectRatio="${o.stretch?'none':'xMidYMid meet'}"/>`;
 if(o.type==='text')return `<foreignObject data-object="${o.id}" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:'Noto Sans Thai',sans-serif;font-size:${o.size}px;line-height:1.5;font-weight:${o.bold?700:400};color:${o.color};white-space:pre-wrap;overflow-wrap:anywhere;height:100%;overflow:hidden">${formattedTextHTML(o,esc,interactive)}</div></foreignObject>`;
 const points=o.points.map(p=>[o.x+p[0]*o.w,o.y+p[1]*o.h,p[2]]);
 if(points.length===1)return `<circle data-object="${o.id}" cx="${points[0][0]}" cy="${points[0][1]}" r="${o.width/2}" fill="${o.color}" opacity="${o.tool==='highlight'?'.3':'1'}"/>`;
 if(o.tool==='highlight')return `<path data-object="${o.id}" d="${points.map((p,i)=>(i?'L':'M')+round(p[0])+','+round(p[1])).join(' ')}" fill="none" stroke="${o.color}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round" opacity=".3"/>`;
 const left=[],right=[];for(let i=0;i<points.length;i++){const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1,r=o.width*(.45+p[2])*.5;left.push([p[0]-dy/length*r,p[1]+dx/length*r]);right.push([p[0]+dy/length*r,p[1]-dx/length*r]);}
 return `<path data-object="${o.id}" d="${[...left,...right.reverse()].map((p,i)=>(i?'L':'M')+round(p[0])+','+round(p[1])).join(' ')} Z" fill="${o.color}"/>`;
}
export function paperBackground(template,id){const pattern=template==='ruled'?'<path d="M0 35.5 H900" stroke="#dce6ef"/>':template==='grid'?'<path d="M30 0 H0 V30" fill="none" stroke="#e0e8ef"/>':'<circle cx="2" cy="2" r="1.2" fill="#cbd6df"/>';const step=template==='ruled'?36:template==='grid'?30:24;return `<defs><pattern id="${id}" width="${template==='ruled'?900:step}" height="${step}" patternUnits="userSpaceOnUse">${pattern}</pattern></defs><rect width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/>${template==='plain'?'':`<rect width="${PAGE_W}" height="${PAGE_H}" fill="url(#${id})"/>`}`;}
export function pageSVG(page,images,id='paper-lines'){return paperBackground(page.template,id)+page.objects.map(o=>objectSVG(o,images,!id.startsWith('thumb-'))).join('');}
