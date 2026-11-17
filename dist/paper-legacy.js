import {loadScript} from './study-space.js?v=20261117-paper';
// The original rich text remains intact and viewable; conversion never rewrites it.
export async function openLegacy(space,id){
 const note=space.notebook().notes.find(n=>n.id===id);if(!note)return;
 const dialog=document.createElement('dialog');dialog.className='paper-legacy';
 dialog.innerHTML='<header><div><h2>ต้นฉบับเดิม</h2><p>เก็บข้อความ รูป และรูปแบบเดิมไว้ครบ · อ่านอย่างเดียว</p></div><button type="button">กลับหน้ากระดาษ</button></header><div class="paper-legacy-content"></div>';
 document.body.append(dialog);const urls=[];let closed=false;
 const close=()=>{closed=true;urls.forEach(u=>URL.revokeObjectURL(u));dialog.remove();};
 dialog.addEventListener('close',close);dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
 const host=dialog.querySelector('.paper-legacy-content');host.textContent='กำลังเปิดต้นฉบับ…';
 try{
  await loadScript('./vendor/quill-2.0.3.js');if(closed)return;
  const Q=globalThis.Quill,Base=Q.import('blots/block/embed');
  if(!Q.imports['formats/studyImage']){class StudyImage extends Base{static blotName='studyImage';static tagName='img';static create(id){const el=super.create();el.dataset.imageId=id;el.alt='รูปต้นฉบับ';return el;}}Q.register(StudyImage);}
  host.textContent='';const q=new Q(host,{readOnly:true,modules:{toolbar:false}});q.setContents(note.delta,'silent');
  for(const img of host.querySelectorAll('img[data-image-id]')){try{const blob=await space.image(img.dataset.imageId);if(closed)return;const url=URL.createObjectURL(blob);urls.push(url);img.src=url;}catch{img.alt='โหลดรูปไม่สำเร็จ กรุณาลองอีกครั้ง';}}
 }catch(err){host.textContent=err.message;}
}
