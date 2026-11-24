import {downloadAttachment,attachmentBlob} from './note-files.js?v=20261124-documents20';

// Read only Word document XML or PowerPoint slides, with bounded inflation.
async function officeParts(bytes,word){
 const view=new DataView(bytes.buffer),u16=i=>view.getUint16(i,true),u32=i=>view.getUint32(i,true);
 const decoder=new TextDecoder(),parts=[];
 let end=bytes.length-22;
 while(end>=0&&bytes.length-end<=65557&&u32(end)!==0x06054b50)end--;
 if(end<0||u32(end)!==0x06054b50)throw Error();
 const count=u16(end+10);if(count>10000)throw Error();
 let pos=u32(end+16),remaining=8*1024*1024;
 for(let i=0;i<count;i++){
  if(u32(pos)!==0x02014b50)throw Error();
  const n=u16(pos+28),name=decoder.decode(bytes.subarray(pos+46,pos+46+n)),method=u16(pos+10),size=u32(pos+20),raw=u32(pos+24),local=u32(pos+42);
  pos+=46+n+u16(pos+30)+u16(pos+32);
  if(!(word?name==='word/document.xml':/^ppt\/slides\/slide\d+\.xml$/.test(name)))continue;
  if(raw>remaining||parts.length>=200||u32(local)!==0x04034b50)throw Error();
  const offset=local+30+u16(local+26)+u16(local+28);
  if(offset+size>bytes.length||![0,8].includes(method))throw Error();
  let stream=new Blob([bytes.subarray(offset,offset+size)]).stream();
  if(method===8)stream=stream.pipeThrough(new DecompressionStream('deflate-raw'));
  const reader=stream.getReader(),chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>raw||total>remaining){await reader.cancel();throw Error();}chunks.push(value);}
  if(total!==raw)throw Error();remaining-=total;
  const xml=new DOMParser().parseFromString(await new Blob(chunks).text(),'application/xml');
  if(xml.querySelector('parsererror'))throw Error();
  const lines=Array.from(xml.getElementsByTagNameNS('*','p'),p=>Array.from(p.getElementsByTagNameNS('*','t'),t=>t.textContent).join(''));
  parts.push({number:word?0:Number(name.match(/slide(\d+)/)[1]),text:lines.join('\n')});
 }
 if(!parts.length)throw Error();return parts.sort((a,b)=>a.number-b.number);
}

export async function openNoteFile(file,space){
 const blob=await attachmentBlob(file,space);
 const dialog=document.createElement('dialog');dialog.className='paper-sheet-dialog paper-file-view';
 dialog.innerHTML='<header><h2></h2><button type="button" data-close>ปิด</button></header><div class="file-content"></div><button type="button" data-download>ดาวน์โหลดไฟล์ต้นฉบับ</button>';
 const content=dialog.querySelector('.file-content');
 dialog.querySelector('h2').textContent=file.name;dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-download]').onclick=()=>downloadAttachment(file,space).catch(err=>{content.textContent=err.message;});
 let url;dialog.onclose=()=>{dialog.remove();if(url)URL.revokeObjectURL(url);};
 document.body.append(dialog);dialog.showModal();
 const bytes=new Uint8Array(await blob.arrayBuffer()),ext=file.name.split('.').pop().toLowerCase();
 try{
  if(ext==='pdf'&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-'){
   url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const frame=document.createElement('iframe');
   frame.title=file.name;frame.src=url;content.append(frame);return;
  }
  if(ext==='docx'||ext==='pptx'){
   content.textContent='กำลังเปิดเอกสาร…';const parts=await officeParts(bytes,ext==='docx');
   if(!dialog.open)return;content.replaceChildren();
   for(const part of parts){if(part.number){const h=document.createElement('h3');h.textContent='สไลด์ '+part.number;content.append(h);}
    const p=document.createElement('p');p.textContent=part.text;content.append(p);}
   return;
  }
 }catch{}
 content.textContent='เปิดไฟล์ต้นฉบับในแอปของคุณด้วยปุ่มดาวน์โหลดด้านล่าง';
}
