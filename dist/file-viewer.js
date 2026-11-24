import {attachmentBlob} from './note-files.js?v=20261124-documents20';

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


async function renderFile(file,blob,content,makeURL,isOpen){
 const doc=content.ownerDocument,bytes=new Uint8Array(await blob.arrayBuffer()),ext=file.name.split('.').pop().toLowerCase();
 if(!isOpen())return;
 try{
  if(ext==='pdf'&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-'){
   const frame=doc.createElement('iframe');frame.title=file.name;frame.src=makeURL(new Blob([bytes],{type:'application/pdf'}));content.replaceChildren(frame);return;
  }
  if(ext==='docx'||ext==='pptx'){
   content.textContent='กำลังเปิดเอกสาร…';const parts=await officeParts(bytes,ext==='docx');
   if(!isOpen())return;content.replaceChildren();
   for(const part of parts){if(part.number){const h=doc.createElement('h3');h.textContent='สไลด์ '+part.number;content.append(h);}
    const p=doc.createElement('p');p.textContent=part.text;content.append(p);}
   return;
  }
 }catch{}
 if(isOpen())content.textContent='เปิดไฟล์ต้นฉบับในแอปของคุณด้วยปุ่มดาวน์โหลด';
}

// Open synchronously during the user's click, before fetching large documents.
// The tab owns its own object URLs, so closing the in-note dialog cannot break it.
export async function openNoteFileTab(file,space,readyBlob){
 const tab=window.open('about:blank','_blank');
 if(!tab)throw Error('เบราว์เซอร์ปิดกั้นแท็บใหม่ กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้');
 try{
  tab.opener=null;
  const doc=tab.document;doc.documentElement.lang='th';doc.title=file.name;
  const meta=doc.createElement('meta');meta.name='viewport';meta.content='width=device-width,initial-scale=1';doc.head.append(meta);
  const style=doc.createElement('style');style.textContent='*{box-sizing:border-box}body{margin:0;font:15px system-ui,sans-serif;color:#243047;background:#f5f7fa}header{position:sticky;top:0;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 18px;background:white;border-bottom:1px solid #dbe3ef}h1{font-size:16px;flex:1;margin:0;overflow-wrap:anywhere}a{padding:9px 12px;background:#3155bd;color:white;border-radius:8px;text-decoration:none}main{padding:16px;white-space:pre-wrap}main:has(iframe){padding:0}iframe{width:100%;height:calc(100dvh - 68px);border:0;display:block}p{max-width:1000px;margin:12px auto;line-height:1.7}';doc.head.append(style);
  const header=doc.createElement('header'),title=doc.createElement('h1'),download=doc.createElement('a'),content=doc.createElement('main');
  title.textContent=file.name;download.textContent='ดาวน์โหลดไฟล์ต้นฉบับ';download.hidden=true;
  content.textContent='กำลังเปิดเอกสาร…';header.append(title,download);doc.body.replaceChildren(header,content);
  const urls=[];const makeURL=blob=>{const url=tab.URL.createObjectURL(blob);urls.push(url);return url;};
  tab.addEventListener('pagehide',()=>{for(const url of urls)tab.URL.revokeObjectURL(url);},{once:true});
  const blob=readyBlob||await attachmentBlob(file,space);if(tab.closed)return;
  download.href=makeURL(blob);download.download=file.name;download.hidden=false;
  await renderFile(file,blob,content,makeURL,()=>!tab.closed);
 }catch(err){if(!tab.closed){const message=tab.document.createElement('p');message.textContent='เปิดเอกสารไม่สำเร็จ: '+err.message;tab.document.body.append(message);}throw err;}
}

export async function openNoteFile(file,space){
 const blob=await attachmentBlob(file,space);
 const dialog=document.createElement('dialog');dialog.className='paper-sheet-dialog paper-file-view';
 dialog.innerHTML='<header><h2></h2><button type="button" data-close>ปิด</button></header><div class="file-content"></div><div class="file-view-actions"><button type="button" data-open-tab>↗ เปิดในแท็บใหม่</button><button type="button" data-download>ดาวน์โหลดไฟล์ต้นฉบับ</button></div><p role="status" class="file-view-status"></p>';
 const content=dialog.querySelector('.file-content'),status=dialog.querySelector('.file-view-status');
 dialog.querySelector('h2').textContent=file.name;dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-open-tab]').onclick=()=>openNoteFileTab(file,space,blob).catch(err=>{status.textContent=err.message;});
 dialog.querySelector('[data-download]').onclick=()=>{
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 const urls=[];dialog.onclose=()=>{dialog.remove();for(const url of urls)URL.revokeObjectURL(url);};
 document.body.append(dialog);dialog.showModal();
 await renderFile(file,blob,content,b=>{const url=URL.createObjectURL(b);urls.push(url);return url;},()=>dialog.open);
}
