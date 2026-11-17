import {createPersonalClient,personalKey} from './personal-client.js?v=20261116-account';
import {freshState,validateState} from './core.js?v=20261112a';
import {validateEnvelope,referencedImages} from './notebook-core.js?v=20261117-paper';

// Intentionally PUBLIC: the owner requested one editable workspace for all visitors.
// This is a workspace capability, not a Supabase service-role or administrative key.
export const sharedKey='e800328b0137d3b0145ef3eb96724b795fd438a1e0437bc689da8f32b99404c4';
const valid=k=>/^[a-f0-9]{64}$/.test(k||'');
export function legacyKeys(storage,location=globalThis.location){
 let stored;try{stored=storage.getItem(personalKey);}catch{}
 return [...new Set([/^#space=([a-f0-9]{64})$/.exec(location?.hash||'')?.[1],stored].filter(k=>valid(k)&&k!==sharedKey))];
}
export function createSharedClient(options={}){
 const client=createPersonalClient({...options,accountKey:sharedKey});client.shared=true;
 client.access=()=>({url:((options.location||globalThis.location)?.origin||'')+((options.location||globalThis.location)?.pathname||'/'),remembered:true});
 return client;
}
const copy=v=>JSON.parse(JSON.stringify(v));
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const blank=()=>({version:1,progress:freshState(),notebook:{version:1,notes:[]}});
function mergeProgress(current,source){
 const defaults=freshState();
 const merge=(a,b,d)=>{
  if(JSON.stringify(a)===JSON.stringify(d))return copy(b);
  if(Array.isArray(a)&&Array.isArray(b))return [...new Map([...a,...b].map(x=>[JSON.stringify(x),x])).values()];
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
   const out=copy(a);for(const [k,v] of Object.entries(b))out[k]=Object.hasOwn(a,k)?merge(a[k],v,d?.[k]):copy(v);return out;
  }
  return a;
 };
 return validateState(merge(current,source,defaults));
}
export async function migrateLegacy({client,keys,storage,imageStore,fetcher=fetch,progress}){
 const sources=[];const markProgress=()=>{try{storage.setItem('ru-study-shared-progress-imported.v1','done');}catch{}};
 let progressDone=false;try{progressDone=storage.getItem('ru-study-shared-progress-imported.v1')==='done';}catch{}
 for(const key of [...new Set(keys)].filter(k=>valid(k)&&k!==sharedKey)){
  const old=createPersonalClient({storage,accountKey:key,fetcher,location:{origin:'',pathname:'/',hash:''},history:null});
  const session=await old.auth.getSession();if(session.error)throw session.error;
  const id=session.data.session.user.id;
  const remote=await old.from('').select().eq('',id).maybeSingle();if(remote.error)throw remote.error;
  if(remote.data?.payload)sources.push({receipt:await hash(key+':cloud'),payload:validateEnvelope(remote.data.payload,validateState),old,id});
  let cached;try{cached=JSON.parse(storage.getItem('ru-study-workspace.v1:'+id)||'null');}catch{throw Error('อ่านสำเนาเดิมไม่ได้ ต้นฉบับยังอยู่ กรุณาสำรองข้อมูลก่อน');}
  if(cached?.dirty)sources.push({receipt:await hash(key+':pending:'+JSON.stringify(cached.payload)),payload:validateEnvelope(cached.payload,validateState),old,id});
 }
 if(!progressDone&&progress&&JSON.stringify(validateState(progress))!==JSON.stringify(freshState()))sources.push({receipt:await hash('browser-progress:'+JSON.stringify(progress)),payload:{...blank(),progress:validateState(progress)}});
 if(!sources.length){markProgress();return;}
 const session=await client.auth.getSession();if(session.error)throw session.error;const target=session.data.session.user.id;
 for(let attempt=0;attempt<3;attempt++){
  const remote=await client.from('').select().eq('',target).maybeSingle();if(remote.error)throw remote.error;
  const next=remote.data?validateEnvelope(remote.data.payload,validateState):blank();
  const receipts=new Set(next.migrations||[]),ids=new Set(next.notebook.notes.map(n=>n.id));let changed=false;
  for(const source of sources){
   if(receipts.has(source.receipt))continue;
   const mapping=new Map();
   for(const id of referencedImages(source.payload.notebook)){
    const h=await hash(source.id+':'+id),dest=h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32)+'.'+id.split('.').pop();mapping.set(id,dest);
    let blob;try{blob=await imageStore.get(source.id,id);}catch{}
    if(!blob){const r=await source.old.storage.from('').download(source.id+'/'+id);if(r.error)throw r.error;blob=r.data;}
    const r=await client.storage.from('').upload(target+'/'+dest,blob);
    if(r.error&&!['409','Duplicate'].includes(String(r.error.statusCode||r.error.error))&&!/already exists|duplicate/i.test(r.error.message||''))throw r.error;
   }
   for(const original of source.payload.notebook.notes){
    const n=copy(original);n.id='import-'+(await hash(source.id+':'+JSON.stringify(n))).slice(0,48);
    for(const op of n.delta.ops)if(op.insert?.studyImage)op.insert.studyImage=mapping.get(op.insert.studyImage);
    for(const page of n.paper?.pages||[])for(const object of page.objects)if(object.type==='image')object.imageId=mapping.get(object.imageId);
    if(!ids.has(n.id)){next.notebook.notes.push(n);ids.add(n.id);}
   }
   next.progress=mergeProgress(next.progress,source.payload.progress);receipts.add(source.receipt);changed=true;
  }
  if(!changed){markProgress();return;}
  next.migrations=[...receipts];const payload=validateEnvelope(next,validateState);
  const result=await client.rpc('',{expected_revision:remote.data?.revision||0,new_payload:payload});
  if(!result.error){markProgress();return;}if(result.error.code!=='40001')throw result.error;
 }
 throw Error('อีกเครื่องกำลังบันทึกงาน กรุณาโหลดใหม่เพื่อนำข้อมูลเดิมเข้าพื้นที่กลาง');
}
