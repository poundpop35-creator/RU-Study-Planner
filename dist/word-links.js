// Textarea offsets and String.slice both use UTF-16 code units.
export function webAddress(value){
 let url;try{url=new URL(String(value).trim());}catch{}
 if(!url||!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.href.length>2048)throw Error('กรอก URL ที่ขึ้นต้นด้วย https:// หรือ http://');
 return url.href;
}

export function validateLinks(input,text){
 if(!Array.isArray(input)||input.length>1000)throw Error('ข้อมูลลิงก์ในข้อความไม่ถูกต้อง');
 let end=0;
 return input.map(({start,end:next,url,fileId})=>{
  if(!Number.isInteger(start)||!Number.isInteger(next)||start<end||start>=next||next>text.length)throw Error('ช่วงข้อความของลิงก์ไม่ถูกต้อง');
  end=next;
  if(typeof url==='string'&&fileId===undefined)return {start,end,url:webAddress(url)};
  if(url===undefined&&typeof fileId==='string'&&/^[a-f0-9-]{36}$/.test(fileId))return {start,end,fileId};
  throw Error('ปลายทางของลิงก์ไม่ถูกต้อง');
 });
}

export function replaceLink(links,start,end,target){
 const result=[];
 for(const link of links){
  if(link.end<=start||link.start>=end){result.push(link);continue;}
  if(link.start<start)result.push({...link,end:start});
  if(link.end>end)result.push({...link,start:end});
 }
 if(target)result.push({start,end,...target});
 return result.sort((a,b)=>a.start-b.start);
}

// Preserve surviving portions of linked words and shift following links after an edit.
export function moveLinks(links,before,after){
 if(!links?.length||before===after)return links||[];
 let start=0,oldEnd=before.length,newEnd=after.length;
 while(start<oldEnd&&start<newEnd&&before[start]===after[start])start++;
 while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
 const delta=newEnd-oldEnd,result=[];
 for(const link of links){
  if(link.end<=start)result.push(link);
  else if(link.start>=oldEnd)result.push({...link,start:link.start+delta,end:link.end+delta});
  else if(link.start<start||link.end>oldEnd){
   const a=link.start<start?link.start:newEnd,b=link.end>oldEnd?link.end+delta:start;
   if(a<b)result.push({...link,start:a,end:b});
  }
 }
 return result;
}

export function linkedTextHTML(o,escape,interactive=true){
 let html='',offset=0;
 for(const link of o.links||[]){
  html+=escape(o.text.slice(offset,link.start));
  const label=escape(o.text.slice(link.start,link.end));
  if(!interactive)html+='<span class="paper-word-mark">'+label+'</span>';
  else if(link.url)html+='<a class="paper-word-mark" data-word-link href="'+escape(link.url)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>';
  else html+='<button type="button" class="paper-word-mark" data-word-file="'+escape(link.fileId)+'">'+label+'</button>';
  offset=link.end;
 }
 return html+escape(o.text.slice(offset));
}
