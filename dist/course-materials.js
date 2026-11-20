import {validateFiles} from './note-files.js';

export const isCourseCode=value=>typeof value==='string'&&/^POL\d{4}$/.test(value);

export function safeCourseUrl(value){
 if(typeof value!=='string'||value.length>2048)return null;
 try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}
}

export function validateCourseMaterials(input={}){
 if(input===undefined)return {};
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('รายการเอกสารประจำวิชาไม่ถูกต้อง');
 const entries=Object.entries(input);
 if(entries.length>100)throw Error('มีรายการวิชามากเกินกำหนด');
 const output={};
 for(const [course,entry] of entries){
  if(!isCourseCode(course)||!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('รหัสวิชาเอกสารไม่ถูกต้อง');
  const files=validateFiles(entry.files||[]);
  if(files.length>12)throw Error('เอกสารประจำวิชาเกิน 12 ไฟล์');
  const links=entry.links||[];
  if(!Array.isArray(links)||links.length>25)throw Error('ลิงก์ประจำวิชาเกินกำหนด');
  const ids=new Set();
  const validatedLinks=links.map(link=>{
   if(!link||typeof link!=='object'||typeof link.id!=='string'||!/^[-a-f0-9]{36}$/.test(link.id)||ids.has(link.id))throw Error('รหัสลิงก์ประจำวิชาไม่ถูกต้อง');
   ids.add(link.id);
   const name=String(link.name||'').trim(),url=safeCourseUrl(link.url);
   if(!name||name.length>160||!url)throw Error('ลิงก์ประจำวิชาไม่ถูกต้อง');
   return {id:link.id,name,url};
  });
  output[course]={files,links:validatedLinks};
 }
 return output;
}
export function materialFor(book,course){
 return book?.courseMaterials?.[course]||{files:[],links:[]};
}
