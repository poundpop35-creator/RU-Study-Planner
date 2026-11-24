export const fileLimit=20*1024*1024;
const legacyLimit=2*1024*1024;
export const extensions=['pdf','doc','docx','ppt','pptx'];
const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const extension=name=>typeof name==='string'?name.split('.').pop().toLowerCase():'';
const validName=name=>typeof name==='string'&&name.length<=255&&extensions.includes(extension(name));
export const attachmentPath=file=>file.id+'.'+extension(file.name);
export function validateFiles(files){
 if(!Array.isArray(files)||files.length>50)throw Error('แนบได้ไม่เกิน 50 ไฟล์ต่อโน้ต');
 const ids=new Set();
 return files.map(file=>{
  if(!file||!validName(file.name)||!validId(file.id)||ids.has(file.id))throw Error('ข้อมูลไฟล์แนบไม่ถูกต้อง');
  const {id,name,data,storage,size}=file;ids.add(id);
  if(storage==='document'){
   if(!Number.isSafeInteger(size)||size<1||size>fileLimit||data!==undefined)throw Error('ข้อมูลไฟล์แนบไม่ถูกต้อง');
   return {id,name,storage,size};
  }
  if(storage!==undefined||typeof data!=='string'||!data.length||data.length>4*Math.ceil(legacyLimit/3)||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('ข้อมูลไฟล์แนบไม่ถูกต้อง');
  return {id,name,data};
 });
}
export async function readAttachment(file,space){
 if(!validName(file.name))throw Error('เลือกไฟล์ PDF, Word หรือ PowerPoint');
 if(!file.size||file.size>fileLimit)throw Error('เลือกไฟล์ขนาดไม่เกิน 20 MB');
 if(!space?.uploadDocument)throw Error('ยังไม่สามารถเชื่อมต่อพื้นที่เก็บเอกสาร กรุณาโหลดหน้าใหม่');
 const item={id:crypto.randomUUID(),name:file.name,storage:'document',size:file.size};
 await space.uploadDocument(item,file);return item;
}
export function storedDocuments(book){
 return [...new Map([...(book.notes||[]).flatMap(n=>n.files||[]),...Object.values(book.courseMaterials||{}).flatMap(c=>c.files||[])].filter(f=>f.storage==='document').map(f=>[f.id,f])).values()];
}
export async function attachmentBlob(file,space){
 if(file.storage==='document'){
  if(!space?.document)throw Error('ยังไม่สามารถเชื่อมต่อพื้นที่เก็บเอกสาร');
  const blob=await space.document(file);
  if(blob.size!==file.size)throw Error('ไฟล์ดาวน์โหลดไม่ครบ กรุณาลองอีกครั้ง');
  return blob;
 }
 return new Blob([Uint8Array.from(atob(file.data),c=>c.charCodeAt(0))],{type:'application/octet-stream'});
}
export function documentData(blob){
 return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});
}
export function documentFromBackup(file,data){
 if(typeof data!=='string'||data.length!==4*Math.ceil(file.size/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('ไฟล์เอกสารในสำเนาไม่ถูกต้อง');
 const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
 if(bytes.length!==file.size)throw Error('ไฟล์เอกสารในสำเนาไม่ครบ');
 return new Blob([bytes],{type:'application/octet-stream'});
}
export async function downloadAttachment(file,space){
 const blob=await attachmentBlob(file,space);
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download=file.name;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
