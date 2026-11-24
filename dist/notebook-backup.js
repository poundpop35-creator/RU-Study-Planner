import {validateNotebook,referencedImages} from './notebook-core.js?v=20261124-notebook-v2';
export function planRestore(data,current){
 let raw;
 if(data.format==='ru-study-notebook')raw=data.version===2?data.notebook:data.version===1?data.snapshot?.notebook:null;
 else if(data.format==='ru-paper-recovery'&&data.version===1)raw={version:2,notes:[data.note]};
 if(!raw)throw Error('ไม่รองรับรูปแบบหรือรุ่นของไฟล์สำรอง');
 const book=validateNotebook(raw),ids=new Set(current.notes.map(n=>n.id));
 // A recovery draft usually refers to a note that still exists. Preserve both versions.
 if(data.format==='ru-paper-recovery'&&ids.has(book.notes[0].id)){
  book.notes[0]={...book.notes[0],id:crypto.randomUUID(),title:(book.notes[0].title.slice(0,146)+' (ฉบับกู้คืน)')};
 }
 const additions=book.notes.filter(n=>!ids.has(n.id)),skipped=book.notes.length-additions.length;
 const materials={...current.courseMaterials};
 let addedMaterials=0,skippedMaterials=0;
 for(const [course,entry] of Object.entries(book.courseMaterials||{})){
  const existing=materials[course]||{files:[],links:[]},merged={};
  for(const k of ['files','links']){
   const known=new Set(existing[k].map(x=>x.id)),newItems=entry[k].filter(x=>!known.has(x.id));
   addedMaterials+=newItems.length;skippedMaterials+=entry[k].length-newItems.length;
   merged[k]=[...existing[k],...newItems];
  }
  materials[course]=merged;
 }
 const next=validateNotebook({...current,version:Math.max(current.version,book.version),notes:[...current.notes,...additions],...(Object.keys(materials).length?{courseMaterials:materials}:{})});
 const prior=new Set(referencedImages(current)),imageIds=referencedImages({notes:additions}).filter(id=>!prior.has(id));
 return {next,added:additions.length,skipped,imageIds,addedMaterials,skippedMaterials};
}
export async function confirmRestore(plan){
 const dialog=document.createElement('dialog'),message=document.createElement('p');
 message.textContent='เพิ่ม '+plan.added+' โน้ต · รูปที่ต้องโหลด '+plan.imageIds.length+' รูป · รายการประจำวิชาใหม่ '+plan.addedMaterials+' · ข้ามโน้ตซ้ำ '+plan.skipped+' และรายการประจำวิชาซ้ำ '+plan.skippedMaterials+' รายการ ข้อมูลเดิมจะอยู่ครบ';
 dialog.innerHTML='<form method="dialog"><h2>กู้คืนเฉพาะสมุดจด</h2><button value="cancel" autofocus>ยกเลิก</button> <button value="ok">เพิ่มรายการใหม่</button></form>';
 dialog.querySelector('h2').after(message);document.body.append(dialog);
 return new Promise(resolve=>{dialog.onclose=()=>{const ok=dialog.returnValue==='ok';dialog.remove();resolve(ok)};dialog.showModal()});
}
