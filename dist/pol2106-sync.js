import {supabaseConfig as cfg} from './supabase-config.js';
const base=cfg.url+'/rest/v1/', headers={apikey:cfg.publishableKey,'Content-Type':'application/json'};
async function request(path,body){
 const res=await fetch(base+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('Supabase '+res.status);
 return res.json();
}
export async function loadBank(){
 const rows=await request('ru_pol2106_bank?select=part,packed&order=part');
 if(rows.length!==7)throw Error('คลังข้อสอบยังไม่ครบ');
 const parts=await Promise.all(rows.map(async(r,i)=>{
  if(r.part!==i)throw Error('ลำดับชุดข้อสอบผิด');
  const bytes=Uint8Array.from(atob(r.packed),c=>c.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 }));
 return parts.flat();
}
export function sharedAnswers({storage,onUpdate,status,api=request}){
 const get=(k,d)=>{try{return JSON.parse(storage.getItem(k))??d}catch{return d}};
 const prefix='pol2106-cloud-v1-',old=get('pol2106-attempts-v1',{});let remote=get(prefix+'snapshot',{}),queue=get(prefix+'queue',{}),busy=false,again=false,conflicts=[];
 if(!get(prefix+'imported',false))for(const [i,c] of Object.entries(old||{}))if(valid(i,c)&&!queue[i])queue[i]={c,r:0,legacy:true};
 function valid(i,c){return /^\d+$/.test(i)&&+i<=699&&Number.isInteger(c)&&c>=1&&c<=5}
 function put(k,v){try{storage.setItem(k,JSON.stringify(v));return true}catch{return false}}
 function save(){return put(prefix+'queue',queue)}
 if(save())put(prefix+'imported',true);
 function paint(){onUpdate({...Object.fromEntries(Object.entries(remote).map(([i,v])=>[i,v.choice])),...Object.fromEntries(Object.entries(queue).map(([i,v])=>[i,v.c]))})}
 async function sync(){
  if(busy){again=true;return}busy=true;
  try{
   const rows=await api('ru_pol2106_answers?select=item,choice,revision&order=item');remote=Object.fromEntries(rows.map(row=>[row.item,row]));paint();
   for(const [i,op] of Object.entries(queue)){
    if(queue[i]!==op)continue;
    const current=remote[i];let ok=false;
    if((current?.revision||0)===op.r){
     ok=await api('rpc/ru_pol2106_answer',{p_item:+i,p_choice:op.c,p_revision:op.r});
     if(ok)remote[i]={item:+i,choice:op.c,revision:op.r+1};
    }
    if(!ok&&!current){again=true}
    if(!ok&&!op.legacy&&current?.choice!==op.c){conflicts.push(+i);again=true}
    if(queue[i]===op)delete queue[i];else if(ok&&queue[i])queue[i].r=op.r+1;
    save();
   }
   put(prefix+'snapshot',remote);paint();
   status(conflicts.length?'อีกเครื่องแก้ข้อ '+conflicts.map(i=>((i/100|0)+1)+'/'+(i%100+1)).join(', ')+' ด้วย · แสดงคำตอบออนไลน์ เลือกใหม่ได้':Object.keys(queue).length?'รอซิงก์':'ซิงก์คำตอบกับ Supabase แล้ว');
  }catch{status(Object.keys(queue).length?'ยังไม่บันทึกออนไลน์ · จะลองส่งคำตอบอีกครั้ง':'ยังไม่เชื่อมต่อ · แสดงข้อมูลที่มีในเครื่อง')}
  finally{busy=false;if(again){again=false;queueMicrotask(sync)}}
 }
 paint();return {sync,answer(i,c){if(!valid(String(i),c))return;conflicts=conflicts.filter(n=>n!==i);queue[i]={c,r:queue[i]?.r??remote[i]?.revision??0};const saved=save();paint();status(saved?'กำลังบันทึกคำตอบ…':'อย่าปิดหน้านี้จนกว่าจะซิงก์สำเร็จ');void sync()}};
}
