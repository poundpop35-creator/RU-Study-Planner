import {cleanDelta} from './notebook-core.js?v=word-canva-classroom-20261120';

function renderLegacy(host,delta){
 const doc=host.ownerDocument;
 let line=doc.createDocumentFragment(),list=null,listType='';
 function finishLine(attrs){
  const type=attrs.list,tag=type?'li':attrs.header?'h'+attrs.header:attrs.blockquote?'blockquote':'p';
  const block=doc.createElement(tag);
  if(attrs.align)block.style.textAlign=attrs.align;
  if(type==='checked'||type==='unchecked')block.append(type==='checked'?'☑ ':'☐ ');
  block.append(line.hasChildNodes()?line:doc.createElement('br'));
  if(type){
   if(type!==listType){list=doc.createElement(type==='ordered'?'ol':'ul');host.append(list);}
   list.append(block);
  }else host.append(block);
  listType=type||'';line=doc.createDocumentFragment();
 }
 for(const {insert,attributes={}} of cleanDelta(delta).ops){
  if(typeof insert!=='string'){
   const image=doc.createElement('img');image.dataset.imageId=insert.studyImage;image.alt='รูปต้นฉบับ';line.append(image);continue;
  }
  const pieces=insert.split('\n');
  for(const [index,text] of pieces.entries()){
   if(index)finishLine(attributes);
   if(!text)continue;
   const span=doc.createElement(attributes.link?'a':'span');
   if(attributes.link){span.href=attributes.link;span.target='_blank';span.rel='noopener noreferrer';}
   span.textContent=text;
   if(attributes.bold)span.style.fontWeight='bold';
   if(attributes.italic)span.style.fontStyle='italic';
   span.style.textDecoration=[attributes.underline&&'underline',attributes.strike&&'line-through'].filter(Boolean).join(' ');
   if(attributes.background)span.style.backgroundColor=attributes.background;
   if(attributes.color)span.style.color=attributes.color;
   line.append(span);
  }
 }
}
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
  host.replaceChildren();renderLegacy(host,note.delta);
  for(const img of host.querySelectorAll('img[data-image-id]')){try{const blob=await space.image(img.dataset.imageId);if(closed)return;const url=URL.createObjectURL(blob);urls.push(url);img.src=url;}catch{img.alt='โหลดรูปไม่สำเร็จ กรุณาลองอีกครั้ง';}}
 }catch(err){host.textContent=err.message;}
}
