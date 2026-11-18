import {webAddress} from './word-links.js';
import {readAttachment} from './note-files.js';
export async function chooseWordTarget(label,existing,files){
 const dialog=document.createElement('dialog');
 dialog.className='paper-sheet-dialog';
 dialog.innerHTML='<form><h2>เชื่อมคำกับเว็บหรือไฟล์</h2><blockquote></blockquote><label>ปลายทาง<select name="kind"><option value="url">เว็บไซต์</option><option value="file">ไฟล์ในโน้ตนี้</option><option value="upload">แนบไฟล์ใหม่</option></select></label><label data-kind="url">ลิงก์เว็บไซต์<input name="address" placeholder="https://"></label><label data-kind="file">เลือกไฟล์<select name="existingFile"></select></label><label data-kind="upload">PDF, Word หรือ PowerPoint (ไม่เกิน 2 MB)<input type="file" name="upload" accept=".pdf,.doc,.docx,.ppt,.pptx"></label><p role="status"></p><div class="paper-dialog-actions"><button type="submit">บันทึกลิงก์</button><button type="button" data-remove>ลบลิงก์</button><button type="button" data-cancel>ยกเลิก</button></div></form>';
 const form=dialog.querySelector('form'),fields=form.elements,status=dialog.querySelector('[role=status]');
 dialog.querySelector('blockquote').textContent=label;
 for(const file of files)fields.existingFile.add(new Option(file.name,file.id));
 fields.kind.options[1].disabled=!files.length;
 fields.kind.value=existing?.fileId&&files.length?'file':'url';
 fields.address.value=existing?.url||'';if(existing?.fileId)fields.existingFile.value=existing.fileId;
 const update=()=>dialog.querySelectorAll('[data-kind]').forEach(el=>el.hidden=el.dataset.kind!==fields.kind.value);
 fields.kind.onchange=update;update();
 let result;
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 const remove=dialog.querySelector('[data-remove]');remove.hidden=!existing;remove.onclick=()=>{result={target:null};dialog.close();};
 form.onsubmit=async event=>{
  event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try{
   if(fields.kind.value==='url')result={target:{url:webAddress(fields.address.value)}};
   else if(fields.kind.value==='file'){if(!fields.existingFile.value)throw Error('เลือกไฟล์ก่อน');result={target:{fileId:fields.existingFile.value}};}
   else{const file=fields.upload.files[0];if(!file)throw Error('เลือกไฟล์ก่อน');const attachment=await readAttachment(file);if(!dialog.open)return;result={target:{fileId:attachment.id},attachment};}
   dialog.close();
  }catch(err){status.textContent=err.message;}finally{submit.disabled=false;}
 };
 document.body.append(dialog);dialog.showModal();
 await new Promise(resolve=>dialog.onclose=resolve);dialog.remove();return result;
}
