export const fileLimit = 2 * 1024 * 1024;
export const extensions = ['pdf','doc','docx','ppt','pptx'];
export function validateFiles(files) {
 if (!Array.isArray(files) || files.length > 50) throw Error('แนบได้ไม่เกิน 50 ไฟล์ต่อโน้ต');
 const ids = new Set();
 return files.map(({id,name,data}) => {
  if (typeof name !== 'string' || name.length > 255 || !extensions.includes(name.split('.').pop().toLowerCase()) ||
      typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || ids.has(id) ||
      typeof data !== 'string' || !data.length || data.length > 4*Math.ceil(fileLimit/3) ||
      data.length % 4 || /[^a-zA-Z0-9+/=]/.test(data) || !(/^[A-Za-z0-9+/]*={0,2}$/.test(data))) throw Error('ข้อมูลไฟล์แนบไม่ถูกต้อง');
  ids.add(id);
  return {id,name,data};
 });
}
export async function readAttachment(file) {
 if (!extensions.includes(file.name.split('.').pop().toLowerCase())) throw Error('เลือกไฟล์ PDF, Word หรือ PowerPoint');
 if (!file.size || file.size > fileLimit) throw Error('เลือกไฟล์ขนาดไม่เกิน 2 MB');
 const data = await new Promise((resolve,reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = () => reject(Error('อ่านไฟล์ไม่สำเร็จ'));
  reader.readAsDataURL(file);
 });
 return {id:crypto.randomUUID(),name:file.name,data};
}
export function downloadAttachment(file) {
 const bytes = Uint8Array.from(atob(file.data), c=>c.charCodeAt(0));
 const url = URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
 const link = document.createElement('a');
 link.href=url;link.download=file.name;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
