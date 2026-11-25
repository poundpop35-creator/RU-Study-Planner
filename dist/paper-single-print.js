import {PAGE_W,PAGE_H,inkPadding} from './paper-core.js?v=20261124-tips';
import {pageSVG} from './paper-render.js?v=20261124-tips';
// Export-only geometry; never modify saved objects.
export const MAX_PRINT_PX=14400;
export function singlePrintLayout(model,marginMM=0){
 if(!model?.pages?.length||![0,5,10,15].includes(marginMM))throw Error('ข้อมูลการพิมพ์ไม่ถูกต้อง');
 const blocks=[];let width=0,height=0;
 for(const p of model.pages){
  let left=0,top=0,right=PAGE_W,bottom=Math.max(PAGE_H,(p.sections?.length||0)*PAGE_H);
  for(const o of p.objects){
   let w=o.w,h=o.h,pad=inkPadding(o);
   if(o.type==='shape'){
    const a=(o.angle||0)*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
    w=c*o.w+s*o.h;h=s*o.w+c*o.h;
    pad=Math.max(o.width||0,['arrow','doubleArrow'].includes(o.kind)?Math.max(24,(o.width||0)*5):0);
   }
   if(o.type==='text'&&o.border)pad=4+o.border.width;
   const cx=o.x+o.w/2,cy=o.y+o.h/2;
   left=Math.min(left,cx-w/2-pad-12);right=Math.max(right,cx+w/2+pad+12);
   top=Math.min(top,cy-h/2-pad-12);bottom=Math.max(bottom,cy+h/2+pad+12);
  }
  left=Math.floor(left);top=Math.floor(top);right=Math.ceil(right);bottom=Math.ceil(bottom);
  blocks.push({page:p,left,top,right,bottom,y:height});
  width=Math.max(width,right-left);height+=bottom-top;
 }
 const margin=marginMM*96/25.4,scale=Math.min(1,(MAX_PRINT_PX-2*margin)/Math.max(width,height));
 const pageWidth=Math.max(144,Math.ceil(width*scale+2*margin)),pageHeight=Math.max(144,Math.ceil(height*scale+2*margin));
 return {blocks,width,height,scale,pageWidth,pageHeight,offsetX:(pageWidth-width*scale)/2,offsetY:(pageHeight-height*scale)/2};
}
export function singlePrintSheet(model,images=new Map(),marginMM=0){
 const g=singlePrintLayout(model,marginMM);
 const body=g.blocks.map(({page,left,top,right,bottom,y},i)=>'<g transform="translate('+(-left)+' '+(y-top)+')">'+pageSVG(page,images,'thumb-single-print-'+i,bottom,right,false)+'</g>').join('');
 const markup='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+g.pageWidth+' '+g.pageHeight+'"><rect width="100%" height="100%" fill="white"/><g transform="translate('+g.offsetX+' '+g.offsetY+') scale('+g.scale+')">'+body+'</g></svg>';
 return {...g,markup};
}
