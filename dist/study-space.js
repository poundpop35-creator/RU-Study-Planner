import {createSharedClient,legacyKeys,migrateLegacy} from './shared-space.js?v=registration-status';
import {accountClient,lookupAccount,sessionKey} from './notebook-account.js';
import {createPersonalClient,personalKey} from './personal-client.js?v=20261116-account';
import {supabaseConfig as config} from './supabase-config.js?v=20261027c';
import {freshState,validateState} from './core.js?v=replay-20261119';
import {freshNotebook,validateEnvelope,validateNotebook,referencedImages} from './notebook-core.js?v=word-canva-classroom-20261120';
import {getImage,putImage,newImageId} from './image-store.js?v=20261027c';
export const workspaceKey=id=>'ru-study-workspace.v1:'+id;
const scriptLoads=new Map();
export function loadScript(src){if(!scriptLoads.has(src))scriptLoads.set(src,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{scriptLoads.delete(src);reject(Error('โหลดเครื่องมือไม่สำเร็จ กรุณาลองอีกครั้ง'));};document.head.append(s);}));return scriptLoads.get(src);}
const empty=()=>({version:1,progress:freshState(),notebook:freshNotebook()});
export function assertCapacity(payload){if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>3800000)throw Error('พื้นที่ข้อมูลใกล้เต็มแล้ว กรุณาส่งออกสำรองและลบโน้ตที่ไม่ใช้ก่อนเพิ่มงาน');}
const clone=value=>JSON.parse(JSON.stringify(value));
const message=err=>err?.code==='40001'?'มีข้อมูลใหม่จากอีกเครื่อง กรุณาเลือกฉบับในหน้าข้อมูลและการซิงก์':err?.message||'เชื่อมต่อ Supabase ไม่ได้ กรุณาลองอีกครั้ง';
// Supabase is authoritative. Device storage is only a recovery queue/cache.
export function createStudySpace({storage,progress,onProgress=()=>{},onChange=()=>{},onStatus=()=>{},clientFactory,settingsFetcher=fetch,imageStore={get:getImage,put:putImage}}){
 let membership={},migrationWarning='';
 let scope='guest',user=null,client=null,revision=0,dirty=false,conflict=false,timer,poll,busy=false,epoch=0,edit=0,locked=false,initialized=false,hydrated=false,disposed=false;
 let status='กำลังเชื่อมต่อพื้นที่เรียน…',phase='loading',lastSync='',providers={},cacheWarning='',payload=empty(),subscription;
 const uploaded=new Set(),removeListeners=[];
 function notify(){onStatus(api.info());}
 function setStatus(text,state){status=text;phase=state;notify();}
 function cacheBackup(suffix,value){try{storage.setItem(workspaceKey(scope)+':'+suffix+':'+Date.now(),JSON.stringify(value));return true;}catch{return false;}}
 function restore(){
  payload=empty();revision=0;dirty=false;lastSync='';locked=false;cacheWarning='';
  try{const raw=storage.getItem(workspaceKey(scope));if(!raw)return;const v=JSON.parse(raw);payload=validateEnvelope(v.payload,validateState);revision=Number.isSafeInteger(v.revision)&&v.revision>=0?v.revision:0;dirty=v.dirty===true;lastSync=v.lastSync||'';}
  catch{cacheWarning='อ่านสำเนาในเครื่องไม่ได้ กำลังใช้ข้อมูลจาก Supabase';}
 }
 function persist(){
  try{storage.setItem(workspaceKey(scope),JSON.stringify({payload,revision,dirty,lastSync}));cacheWarning='';return true;}
  catch{cacheWarning='เก็บสำเนาชั่วคราวในเครื่องไม่ได้ อย่าปิดหน้านี้จนกว่าจะบันทึกใน Supabase สำเร็จ';return false;}
 }
 function requireAccount(){if(!user)throw Error('กำลังเชื่อมต่อพื้นที่บันทึกใน Supabase กรุณาลองอีกครั้ง');if(!hydrated||locked)throw Error('ยังโหลดข้อมูลบัญชีจาก Supabase ไม่สำเร็จ กรุณาลองเชื่อมต่ออีกครั้ง');}
 function schedule(delay=3000){clearTimeout(timer);timer=setTimeout(()=>sync(),delay);timer?.unref?.();}
 function changed(){requireAccount();edit++;dirty=true;persist();setStatus('กำลังรอบันทึกใน Supabase…','pending');schedule();return true;}
 async function fetchRemote(uid){const {data,error}=await client.from('ru_study_workspaces').select('payload,revision,updated_at').eq('user_id',uid).maybeSingle();if(error)throw error;return data;}
 async function upload(id,blob,uid){const {error}=await client.storage.from('ru-study-notes').upload(uid+'/'+id,blob,{contentType:blob.type,upsert:false});if(error&&!['409','Duplicate'].includes(String(error.statusCode||error.error))&&!/already exists|duplicate/i.test(error.message||''))throw error;}
 async function sync(){
  if(!user||!client||busy||conflict||disposed)return;
  const ticket=epoch,uid=user.id,wasHydrated=hydrated;busy=true;clearTimeout(timer);
  if(dirty||!wasHydrated)setStatus(dirty?'กำลังบันทึกใน Supabase…':'กำลังตรวจข้อมูลจาก Supabase…',dirty?'saving':'loading');
  try{
   const remote=await fetchRemote(uid);if(ticket!==epoch)return;
   if(remote){
    const incoming=validateEnvelope(remote.payload,validateState);
    referencedImages(incoming.notebook).forEach(id=>uploaded.add(id));
    if(remote.revision!==revision){
     if(dirty){hydrated=true;conflict=true;throw {code:'40001'};}
     payload=incoming;revision=remote.revision;lastSync=remote.updated_at;hydrated=true;persist();onProgress(payload.progress);onChange();
    }
   }else if(revision>0){locked=true;throw Error('ไม่พบข้อมูลบัญชีที่เคยบันทึกใน Supabase หยุดการเขียนทับเพื่อรักษาข้อมูลเดิม');}
   hydrated=true;
   if(dirty){
    const snapshot=clone(payload),savedEdit=edit;assertCapacity(snapshot);
    for(const id of referencedImages(snapshot.notebook)){
     if(uploaded.has(id))continue;
     let blob;try{blob=await imageStore.get(scope,id);}catch{}
     if(ticket!==epoch)return;
     if(!blob)throw Error('รูปบางรูปยังส่งเข้า Supabase ไม่ครบ กรุณาเปิดเครื่องเดิมแล้วซิงก์อีกครั้ง');
     await upload(id,blob,uid);if(ticket!==epoch)return;uploaded.add(id);
    }
    const {data,error}=await client.rpc('ru_study_save_workspace',{expected_revision:revision,new_payload:snapshot});if(error)throw error;if(ticket!==epoch)return;
    revision=data.revision;lastSync=data.updated_at;dirty=edit!==savedEdit;persist();
   }
   setStatus(dirty?'กำลังรอบันทึกใน Supabase…':lastSync?'บันทึกใน Supabase แล้ว':'เชื่อมต่อ Supabase แล้ว',dirty?'pending':'saved');
  }catch(err){
   if(ticket!==epoch)return;
   if(err.code==='40001')conflict=true;
   setStatus(conflict?message(err):dirty?'ยังไม่บันทึกออนไลน์ · '+message(err):message(err),conflict?'conflict':'error');
  }finally{
   busy=false;
   if(ticket===epoch&&!wasHydrated&&hydrated){onProgress(payload.progress);onChange();}
   if(ticket!==epoch&&user&&!disposed)schedule(0);
   else if(dirty&&!conflict&&!locked&&!disposed)schedule(phase==='pending'?3000:10000);
  }
 }
 async function switchUser(next){
  if(disposed)return;
  if((next?.id||'guest')===scope){user=next;if(user)await sync();else setStatus('เข้าสู่ระบบเพื่อเปิดข้อมูลจาก Supabase','auth');return;}
  clearTimeout(timer);epoch++;edit=0;user=next;scope=user?.id||'guest';conflict=false;hydrated=false;uploaded.clear();
  if(user)restore();else{payload=empty();revision=0;dirty=false;lastSync='';locked=false;}
  setStatus(user?'กำลังโหลดข้อมูลบัญชีจาก Supabase…':'เข้าสู่ระบบเพื่อเปิดข้อมูลจาก Supabase',user?'loading':'auth');onProgress(payload.progress);onChange();
  if(user)await sync();
 }
 function listen(target,event,fn){target?.addEventListener?.(event,fn);removeListeners.push(()=>target?.removeEventListener?.(event,fn));}
 async function restoreWorkspace(value,readImage){
  requireAccount();
  const next=validateEnvelope(value,validateState),ticket=epoch,startEdit=edit,uid=user.id;
  const expectedRevision=revision+(dirty?1:0);
  function checkCurrent(){
   if(disposed||ticket!==epoch||edit!==startEdit||revision!==expectedRevision||conflict||locked)
    throw Error('ข้อมูลเปลี่ยนระหว่างนำเข้า กรุณาตรวจข้อมูลแล้วลองอีกครั้ง');
  }
  if(payload.migrations)next.migrations=[...new Set([...(next.migrations||[]),...payload.migrations])];
  assertCapacity(next);
  await api.flush();
  checkCurrent();
  if(!cacheBackup('before-import',payload))throw Error('เก็บสำเนาก่อนนำเข้าไม่ได้ กรุณาเพิ่มพื้นที่ในเครื่องแล้วลองอีกครั้ง');
  for(const id of referencedImages(next.notebook)){
   const blob=await readImage(id);
   checkCurrent();
   if(blob){
    newImageId(blob);await upload(id,blob,uid);checkCurrent();uploaded.add(id);
    try{await imageStore.put(scope,id,blob);}catch{}
   }else await api.image(id);
   checkCurrent();
  }
  payload=next;changed();onProgress(payload.progress);onChange();await api.flush();
 }
 const api={
  dispose(){disposed=true;clearTimeout(timer);clearInterval(poll);epoch++;subscription?.unsubscribe();removeListeners.forEach(fn=>fn());},
  info:()=>({scope,user,shared:!!client?.shared,accountEmail:membership.email,linked:!!membership.key,status,phase,lastSync,dirty,busy,conflict,locked,personal:!!client?.personal,providers,ready:!!client,initialized,hydrated,canEdit:!!user&&hydrated&&!locked,cacheWarning:migrationWarning||(client?.access?.().remembered===false?'เครื่องนี้จำลิงก์ส่วนตัวไม่ได้ กรุณาคัดลอกลิงก์ในเมนูข้อมูลไว้ก่อนปิดแอป':cacheWarning)}),
  access:()=>client?.access?.()||null,
  notebook:()=>payload.notebook,
  snapshot:()=>clone(payload),
  requireAccount,
  saveProgress(value){requireAccount();const next=validateState(value);if(JSON.stringify(next)===JSON.stringify(payload.progress))return true;assertCapacity({...payload,progress:next});payload.progress=next;return changed();},
  saveNotebook(value){requireAccount();const next=validateNotebook(value);assertCapacity({...payload,notebook:next});payload.notebook=next;return changed();},
  sync,
  async flush(){
   requireAccount();const ticket=epoch,deadline=Date.now()+30000;
   do{
    while(busy){if(Date.now()>deadline)throw Error('การบันทึกใช้เวลานาน กรุณาตรวจการเชื่อมต่อ');await new Promise(resolve=>setTimeout(resolve,50));}
    if(ticket!==epoch||disposed)throw Error('พื้นที่เปลี่ยน กรุณาเปิดโน้ตใหม่');
    if(conflict||locked)throw Error(status);
    await sync();if(ticket!==epoch||disposed)throw Error('พื้นที่เปลี่ยน กรุณาเปิดโน้ตใหม่');if(conflict||locked||phase==='error')throw Error(status);
    if(Date.now()>deadline)throw Error('ยังบันทึกไม่เสร็จ กรุณาลองอีกครั้ง');
   }while(dirty||busy);
  },
  async init(){
   try{
    if(clientFactory)client=await clientFactory();else {
     const keys=legacyKeys(storage);
     let hasSession=false;try{hasSession=!!storage.getItem(sessionKey);}catch{}
     if(hasSession)try{membership=await lookupAccount(await accountClient(loadScript));if(membership.key)keys.push(membership.key);}catch{migrationWarning='ยังอ่านพื้นที่บัญชีเดิมไม่ได้ ต้นฉบับยังอยู่ กรุณาลองเชื่อมต่ออีกครั้ง';}
     client=createSharedClient({storage});
     try{await migrateLegacy({client,keys,storage,imageStore,progress});}catch(err){migrationWarning='นำข้อมูลเดิมเข้าพื้นที่กลางยังไม่สำเร็จ: '+message(err);}
    }
    const listener=client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>switchUser(session?.user||null),0);});subscription=listener?.data?.subscription;
    const {data,error}=await client.auth.getSession();if(error)throw error;await switchUser(data.session?.user||null);
    if(!client.personal)try{const r=await settingsFetcher(config.url+'/auth/v1/settings',{headers:{apikey:config.publishableKey}});if(r.ok)providers=(await r.json()).external||{};}catch{}

    listen(globalThis.window,'online',()=>sync());listen(globalThis.window,'focus',()=>sync());
    listen(globalThis.document,'visibilitychange',()=>{if(document.visibilityState==='visible'||dirty)sync();});
    listen(globalThis.window,'beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
    poll=setInterval(()=>{if(!dirty&&(!globalThis.document||document.visibilityState!=='hidden'))sync();},15000);poll?.unref?.();
   }catch(err){setStatus(message(err),'error');}
   finally{initialized=true;notify();onChange();}
  },
  async signIn(email,password){if(!client)throw Error('ระบบบัญชียังไม่พร้อม กรุณาโหลดหน้าใหม่');const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;if(data?.user)await switchUser(data.user);},
  async signUp(email,password){if(!client)throw Error('ระบบบัญชียังไม่พร้อม');const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(data.session?.user)await switchUser(data.session.user);return !!data.session;},
  async google(){if(!providers.google)throw Error('ยังไม่เปิด Google ใน Supabase Authentication');const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error)throw error;},
  async signOut(){if(dirty||busy)await sync();if(dirty||busy||conflict)throw Error('ยังมีข้อมูลไม่บันทึกใน Supabase กรุณารอให้สำเร็จก่อนออกจากระบบ');const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;await switchUser(null);},
  async resolve(useLocal){
   if(!user||!conflict)return;const ticket=epoch,remote=await fetchRemote(user.id);if(ticket!==epoch)return;
   if(remote){if(!cacheBackup('recovery',{local:payload,remote:remote.payload}))throw Error('เก็บฉบับกู้คืนไม่สำเร็จ กรุณาส่งออกสำรองก่อนแก้ข้อมูลชนกัน');if(!useLocal){payload=validateEnvelope(remote.payload,validateState);dirty=false;onProgress(payload.progress);onChange();}if(useLocal&&remote.payload.migrations)payload.migrations=[...new Set([...(payload.migrations||[]),...remote.payload.migrations])];revision=remote.revision;lastSync=remote.updated_at;}
   conflict=false;persist();await sync();
  },
  async deleteNote(id){
   requireAccount();const ticket=epoch,deadline=Date.now()+30000;
   const flush=async()=>{
    do{
     while(busy){if(Date.now()>deadline)throw Error('ยังซิงก์ไม่เสร็จ กรุณาลองลบอีกครั้ง');await new Promise(resolve=>setTimeout(resolve,50));}
     if(ticket!==epoch||disposed)throw Error('พื้นที่เปลี่ยน กรุณาเปิดโน้ตใหม่');
     if(conflict||locked)throw Error(status);
     await sync();
     if(conflict||locked||phase==='error')throw Error(status);
     if(Date.now()>deadline)throw Error('ยังบันทึกไม่เสร็จ กรุณาตรวจสถานะการซิงก์');
    }while(dirty||busy);
   };
   // Finish any in-flight autosave and load current data before removing one note.
   await flush();requireAccount();
   const next=clone(payload.notebook);next.notes=next.notes.filter(note=>note.id!==id);
   api.saveNotebook(next);await flush();
  },
  async importGuest(){
   requireAccount();const raw=storage.getItem(workspaceKey('guest'));const guest=raw?validateEnvelope(JSON.parse(raw).payload,validateState):{...empty(),progress};
   await restoreWorkspace(guest,async id=>{
    const blob=await imageStore.get('guest',id);
    if(!blob)throw Error('ไม่พบรูปเดิม กรุณานำเข้าจากเครื่องที่เคยจด');
    return blob;
   });
  },
  async uploadImage(file){
   requireAccount();const ticket=epoch,uid=user.id,id=newImageId(file);setStatus('กำลังส่งรูปเข้า Supabase…','saving');
   try{await upload(id,file,uid);if(ticket!==epoch)throw Error('บัญชีเปลี่ยน กรุณาเพิ่มรูปอีกครั้ง');uploaded.add(id);try{await imageStore.put(scope,id,file);}catch{}setStatus('ส่งรูปเข้า Supabase แล้ว','saved');return id;}
   catch(err){setStatus('ส่งรูปเข้า Supabase ไม่สำเร็จ · '+message(err),'error');throw err;}
  },
  async image(id){requireAccount();const ticket=epoch,uid=user.id;let blob;try{blob=await imageStore.get(scope,id);}catch{}if(!blob){const {data,error}=await client.storage.from('ru-study-notes').download(uid+'/'+id);if(error)throw error;if(ticket!==epoch)throw Error('บัญชีเปลี่ยน');blob=data;try{await imageStore.put(scope,id,blob);}catch{}}return blob;},
  async importSnapshot(value,images={}){
   await restoreWorkspace(value,async id=>{
    if(!Object.hasOwn(images,id))return null;
    const data=images[id];
    if(typeof data!=='string'||data.length>7100000||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(data))throw Error('รูปในไฟล์สำรองไม่ถูกต้อง');
    return (await fetch(data)).blob();
   });
  }
 };
 return api;
}
