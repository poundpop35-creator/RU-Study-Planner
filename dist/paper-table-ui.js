import {makeTable,tableWithCells,tableGrid,TABLE_MAX_ROWS,TABLE_MAX_COLS} from './paper-table.js?v=20261120-table';
import {esc} from './paper-render.js?v=word-format-20261120';
import {uid,copy} from './paper-core.js?v=20261120-table';

export function mountTableDialog(root,{page,change,writable,finishText,closeExtraTools,setShapesOpen,viewport,getScale,onSaved,say}){
 const $=selector=>root.querySelector(selector);
 const dialog=$('#paper-table-dialog'),grid=$('#paper-table-grid');
 let draft=null;
 const handlers=[];
 const bind=(el,event,callback)=>{el.addEventListener(event,callback);handlers.push(()=>el.removeEventListener(event,callback));};
 function readCells(){
  if(!draft)return;
  for(const field of grid.querySelectorAll('textarea[data-table-row]')){
   const r=Number(field.dataset.tableRow),c=Number(field.dataset.tableCol);
   if(draft.cells[r]?.[c]!==undefined)draft.cells[r][c]=field.value;
  }
 }
 function render(){
  if(!draft)return;
  const rows=draft.cells.length,cols=draft.cells[0].length;
  $('#paper-table-rows').value=rows;$('#paper-table-cols').value=cols;
  grid.style.setProperty('--table-columns',cols);
  grid.innerHTML=draft.cells.map((row,r)=>
   row.map((cell,c)=>
    '<label class="paper-table-cell'+(r===0?' is-header':'')+'"><span>แถว '+(r+1)+' · คอลัมน์ '+(c+1)+'</span>'+
    '<textarea data-table-row="'+r+'" data-table-col="'+c+'" rows="2" maxlength="500" aria-label="แถว '+(r+1)+' คอลัมน์ '+(c+1)+'" placeholder="'+(r===0?'หัวตาราง':'ข้อความ')+'">'+esc(cell)+'</textarea></label>'
   ).join('')
  ).join('');
  for(const [cmd,disabled] of [['add-row',rows===TABLE_MAX_ROWS],['remove-row',rows===1],['add-col',cols===TABLE_MAX_COLS],['remove-col',cols===1]]){
   dialog.querySelector('[data-table-command="'+cmd+'"]').disabled=disabled;
  }
  $('#paper-table-status').textContent='';
 }
 function dimensions(rows,cols){
  readCells();
  try{draft.cells=tableGrid(draft.cells,rows,cols);render();}
  catch(error){render();$('#paper-table-status').textContent=error.message;}
 }
 function open(item=null){
  if(dialog.open)return;
  writable();finishText();closeExtraTools();setShapesOpen(false);
  const table=item||makeTable(uid());
  draft={id:table.id,original:item?copy(item):null,cells:copy(table.cells)};
  $('#paper-table-title').textContent=item?'แก้ไขตาราง':'สร้างตาราง';
  render();
  dialog.showModal();
 }
 function save(){
  if(!draft)return;
  readCells();
  const original=draft.original;
  if(original&&!page().objects.some(o=>o.id===original.id&&o.type==='table'))throw Error('ไม่พบตารางเดิม กรุณาเปิดใหม่');
  let table=tableWithCells(original||makeTable(draft.id,draft.cells.length,draft.cells[0].length),draft.cells);
  if(!original){
   const y=Math.round(viewport.scrollTop/Math.max(.1,getScale()));
   table.y=Math.max(12,Math.min(1273-table.h-24,y+110));
  }
  if(change(p=>{
   const i=p.objects.findIndex(o=>o.id===table.id);
   if(i>=0)p.objects[i]=table;else p.objects.push(table);
  })){
   dialog.close();draft=null;onSaved(table.id);
   say('บันทึกตารางแล้ว · แตะเพื่อเลือกและย้าย หรือกดแก้ตารางเพื่อแก้ช่อง');
  }else $('#paper-table-status').textContent='บันทึกตารางไม่ได้ กรุณาตรวจการซิงก์';
 }
 bind(dialog,'close',()=>{draft=null;});
 bind(dialog,'click',event=>{
  const cmd=event.target.closest('[data-table-command]')?.dataset.tableCommand;
  if(!cmd||!draft)return;
  event.preventDefault();event.stopPropagation();
  try{
   if(cmd==='cancel'){dialog.close();draft=null;return;}
   if(cmd==='save'){save();return;}
   const rows=draft.cells.length,cols=draft.cells[0].length;
   if(cmd==='add-row')dimensions(rows+1,cols);
   if(cmd==='remove-row')dimensions(rows-1,cols);
   if(cmd==='add-col')dimensions(rows,cols+1);
   if(cmd==='remove-col')dimensions(rows,cols-1);
  }catch(error){$('#paper-table-status').textContent=error.message;}
 });
 for(const [selector,axis,max] of [['#paper-table-rows','row',TABLE_MAX_ROWS],['#paper-table-cols','column',TABLE_MAX_COLS]]){
  bind($(selector),'change',event=>{
   if(!draft)return;
   const value=Number(event.target.value);
   if(!Number.isInteger(value)||value<1||value>max){
    $('#paper-table-status').textContent='จำนวน'+(axis==='row'?'แถว':'คอลัมน์')+'ต้องอยู่ระหว่าง 1–'+max;
    event.target.value=axis==='row'?draft.cells.length:draft.cells[0].length;return;
   }
   dimensions(axis==='row'?value:draft.cells.length,axis==='column'?value:draft.cells[0].length);
  });
 }
 return {open,close:()=>{if(dialog.open)dialog.close();handlers.forEach(off=>off());},get editing(){return dialog.open;}};
}
