// Editable, synchronized Word-style table objects on a paper page.
// Keep cell data as plain text; never store/render executable HTML.
export const TABLE_MAX_ROWS=16,TABLE_MAX_COLS=8,TABLE_MAX_CELL=500;
const safeColor=(v,fallback)=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)?v.toLowerCase():fallback;
export function tableStyle(o){return {
 headerBg:safeColor(o.headerBg,'#dbeafe'),bodyBg:safeColor(o.bodyBg,'#ffffff'),
 borderColor:safeColor(o.borderColor,'#97aaca'),textColor:safeColor(o.textColor,'#172033'),
 headerTextColor:safeColor(o.headerTextColor,'#102a4c')
};}
const integer=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;

export function validateTableCells(cells){
 if(!Array.isArray(cells)||!integer(cells.length,1,TABLE_MAX_ROWS))throw Error('ตารางต้องมี 1–16 แถว');
 const columns=cells[0]?.length;
 if(!integer(columns,1,TABLE_MAX_COLS))throw Error('ตารางต้องมี 1–8 คอลัมน์');
 let total=0;
 return cells.map(row=>{
  if(!Array.isArray(row)||row.length!==columns)throw Error('จำนวนช่องในแต่ละแถวของตารางไม่เท่ากัน');
  return row.map(cell=>{
   if(typeof cell!=='string'||cell.length>TABLE_MAX_CELL)throw Error('ข้อความแต่ละช่องต้องไม่เกิน 500 ตัวอักษร');
   total+=cell.length;
   if(total>12000)throw Error('ข้อความในตารางยาวเกินไป กรุณาแยกเป็นหลายตาราง');
   return cell;
  });
 });
}

export function tableGrid(cells,rows,cols){
 const checked=validateTableCells(cells);
 if(!integer(rows,1,TABLE_MAX_ROWS)||!integer(cols,1,TABLE_MAX_COLS))throw Error('เลือก 1–16 แถว และ 1–8 คอลัมน์');
 return Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>checked[r]?.[c]||''));
}

export function tableHeight(cells,width=720){
 const rows=validateTableCells(cells),columnWidth=Math.max(40,(width-12)/rows[0].length);
 const charsPerLine=Math.max(3,Math.floor((columnWidth-20)/10));
 return Math.ceil(rows.reduce((total,row)=>{
  const maxLines=Math.max(1,...row.map(cell=>cell.split('\n').reduce((count,line)=>count+Math.max(1,Math.ceil(line.length/charsPerLine)),0)));
  return total+Math.max(46,18+maxLines*23);
 },0)+2);
}

export function makeTable(id,rows=3,cols=3,x=90,y=110){
 if(!integer(rows,1,TABLE_MAX_ROWS)||!integer(cols,1,TABLE_MAX_COLS))throw Error('เลือก 1–16 แถว และ 1–8 คอลัมน์');
 const cells=Array.from({length:rows},()=>Array(cols).fill(''));
 const w=720,h=tableHeight(cells,w);
 return {id,type:'table',x,y,w,h,cells};
}

export function tableWithCells(table,cells){
 const checked=validateTableCells(cells);
 const h=table.h*checked.length/table.cells.length;
 if(h>1200)throw Error('ตารางยาวเกินหนึ่งหน้ากระดาษ กรุณาแบ่งเป็นหลายตาราง');
 const next={...table};
 for(const [key,n] of [['rows',checked.length],['columns',checked[0].length]]){
  if(next[key]){const sizes=tracks(next,key,next[key].length);next[key]=Array.from({length:n},(_,i)=>sizes[i]??1/sizes.length);}
 }
 return {...next,cells:checked,h,y:Math.max(12,Math.min(table.y,1273-h-24))};
}

export function tracks(o,key,count){
 const values=o[key]||Array(count).fill(1);
 const total=values.reduce((sum,value)=>sum+value,0);
 return values.map(value=>value/total);
}

export function tableSVG(o,escapeText){
 const columns=o.cells[0].length,rows=o.cells.length,{headerBg,bodyBg,borderColor,textColor,headerTextColor}=tableStyle(o);
 const body=o.cells.map((cells,r)=>{
  const tag=r===0?'th':'td';
  return '<tr style="height:'+tracks(o,'rows',rows)[r]*100+'%">'+cells.map((cell,c)=>
   '<'+tag+' scope="'+(r===0?'col':'row')+'" data-table-row="'+r+'" data-table-col="'+c+'" style="border:1px solid '+borderColor+';position:relative;padding:0;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;background:'+(r===0?headerBg:bodyBg)+';color:'+(r===0?headerTextColor:textColor)+';'+(r===0?'font-weight:700;':'')+'"><div style="position:absolute;inset:0;padding:7px 9px;overflow:hidden">'+escapeText(cell)+'</div></'+tag+'>'
  ).join('')+'</tr>';
 }).join('');
 return '<foreignObject data-object="'+escapeText(o.id)+'" x="'+o.x+'" y="'+o.y+'" width="'+o.w+'" height="'+o.h+'">'+
  '<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;overflow:hidden;color:#172033;font:16px/1.44 Noto Sans Thai,sans-serif;">'+
  '<table aria-label="ตาราง '+rows+' แถว '+columns+' คอลัมน์" style="border-collapse:collapse;table-layout:fixed;width:100%;height:100%;font:inherit;">'+'<colgroup>'+tracks(o,'columns',columns).map(w=>'<col style="width:'+w*100+'%">').join('')+'</colgroup>'+body+'</table></div></foreignObject>';
}
