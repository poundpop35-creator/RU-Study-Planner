// In-page confirmation works even when a mobile browser suppresses window.confirm.
let activeClose=null;
export function confirmNoteDelete(title,kind){
 activeClose?.(false);
 return new Promise(resolve=>{
  const previous=document.activeElement,overlay=document.createElement('div');
  overlay.className='note-delete-overlay';
  overlay.innerHTML='<section class="note-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="note-delete-title" aria-describedby="note-delete-detail"><h2 id="note-delete-title">ลบโน้ตนี้ใช่ไหม?</h2><p class="note-delete-name"></p><p id="note-delete-detail">โน้ตนี้จะถูกลบจากพื้นที่กลางและทุกเครื่อง</p><div class="button-row"><button type="button" class="button secondary" data-delete-choice="cancel">ยกเลิก</button><button type="button" class="button note-delete-danger" data-delete-choice="confirm">ยืนยันลบ</button></div></section>';
  if(kind){overlay.querySelector('h2').textContent='ลบ'+kind+'นี้ใช่ไหม?';overlay.querySelector('#note-delete-detail').textContent='ลบไฟล์แนบนี้จากโน้ตทุกเครื่อง';}
  overlay.querySelector('.note-delete-name').textContent=title||'โน้ตไม่มีชื่อ';
  const cancel=overlay.querySelector('[data-delete-choice="cancel"]'),confirm=overlay.querySelector('[data-delete-choice="confirm"]');
  let closed=false;
  const close=value=>{if(closed)return;closed=true;overlay.remove();document.removeEventListener('keydown',key,true);window.removeEventListener('hashchange',navigate);if(activeClose===close)activeClose=null;if(previous?.isConnected)previous.focus();resolve(value);};
  const navigate=()=>close(false);
  const key=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(false);}
   if(event.key==='Tab'){event.preventDefault();(document.activeElement===cancel?confirm:cancel).focus();}
  };
  cancel.addEventListener('click',event=>{event.stopPropagation();close(false);});
  confirm.addEventListener('click',event=>{event.stopPropagation();close(true);});
  overlay.addEventListener('click',event=>{if(event.target===overlay)close(false);});
  document.addEventListener('keydown',key,true);window.addEventListener('hashchange',navigate);
  activeClose=close;document.body.append(overlay);cancel.focus();
 });
}
