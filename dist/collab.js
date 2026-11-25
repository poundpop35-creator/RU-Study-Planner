import {accountClient} from './notebook-account.js';
import {loadScript} from './study-space.js?v=20261124-tips';
import {newNote,validateNotebook,referencedImages} from './notebook-core.js?v=20261125-course-sort';
import {mergePaper,paperFor,copy} from './paper-core.js?v=20261124-tips';
import {notePage,refreshPaper} from './notebook-view.js?v=20261125-course-sort';
import {newImageId} from './image-store.js?v=20261027c';
import {storedDocuments,attachmentPath} from './note-files.js?v=20261124-documents20';
import {escapeHTML as e} from './core.js?v=20261027c';

let db=null,user=null,items=[],active=null,loading=false,error='',notify=()=>{},shareSource=null,authReady=false,onlineListener=null;
const assetBucket='ru-collab-assets';
const clone=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const dateString=x=>x?new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(x)):'';
function checked(note){
 const out=validateNotebook({version:10,notes:[note]}).notes[0];
 if(out.id!==note.id)throw Error('ข้อมูลสมุดไม่ถูกต้อง');
 return out;
}
export function mergeCollaborativeNote(base,local,remote){
 if(base.id!==local.id||base.id!==remote.id)throw Error('รหัสสมุดไม่ตรงกัน');
 const next=clone(remote);
 for(const key of ['title','course','lesson','source','session','tags','question','answer','delta','files','replayStudiedAt']){
  if(same(base[key],local[key]))continue;
  if(!same(base[key],remote[key])&&!same(local[key],remote[key]))throw Error('แก้ไขส่วนเดียวกันพร้อมกัน · โปรดเก็บสำเนางานค้างก่อน');
  if(local[key]===undefined)delete next[key];else next[key]=clone(local[key]);
 }
 if(!same(base.paper,local.paper)){
  if(!base.paper||!local.paper||!remote.paper){
   if(!same(base.paper,remote.paper)&&!same(local.paper,remote.paper))throw Error('โครงสร้างหน้ากระดาษเปลี่ยนพร้อมกัน · โปรดเก็บสำเนางานค้าง');
   next.paper=clone(local.paper);
  }else next.paper=mergePaper(base.paper,local.paper,remote.paper);
 }
 next.updatedAt=new Date().toISOString();
 return checked(next);
}
async function client(){
 if(!db)db=await accountClient(loadScript);
 return db;
}
function updateNotice(note){
 if(!note||!active||note.id!==active.id)return;
 const online=document.getElementById('collab-online');
 if(online)online.textContent=active.present?.length?'กำลังเปิด: '+active.present.slice(0,3).join(', ')+(active.present.length>3?' และอีก '+(active.present.length-3)+' คน':''):'กำลังเชื่อมต่อผู้ร่วมงาน';
 const title=document.querySelector('.collab-head h1');if(title)title.textContent=active.note.title;
 const saving=document.getElementById('collab-save-status');
 if(saving)saving.textContent=active.status;
}
function show(){notify();updateNotice(active?.note);}
function message(err){return String(err?.message||'เชื่อมต่อสมุดร่วมกันไม่สำเร็จ');}
function draftKey(a){return 'ru-collab-draft:'+user.id+':'+a.id;}
function storeDraft(a){
 try{localStorage.setItem(draftKey(a),JSON.stringify({base:a.base,revision:a.revision,note:a.note}));}catch{}
}
function clearDraft(a){try{localStorage.removeItem(draftKey(a));}catch{}}
async function fetchNote(id){
 const response=await (await client()).from('ru_collab_notes').select('id,owner_id,snapshot,revision,updated_at').eq('id',id).maybeSingle();
 if(response.error)throw response.error;
 if(!response.data)throw Error('ไม่พบสมุดนี้หรือยังไม่ได้รับสิทธิ์');
 return response.data;
}
async function refreshRemote(a){
 if(active!==a)return;
 const row=await fetchNote(a.id);
 if(row.revision===a.revision)return;
 const remote=checked(row.snapshot);
 try{
  if(a.dirty)a.note=mergeCollaborativeNote(a.base,a.note,remote);
  else a.note=remote;
  a.base=clone(remote);a.revision=row.revision;a.status=a.dirty?'กำลังรวมการแก้ไขจากอีกเครื่อง…':'บันทึกใน Supabase แล้ว';
  if(a.dirty)schedule(a);
  refreshPaper(a.space,a.id);updateNotice(a.note);
 }catch(err){
  a.base=clone(remote);a.revision=row.revision;
  a.conflict=true;a.status='มีการแก้ไขชนกัน · กดสำรองงานค้างก่อน';
  storeDraft(a);updateNotice(a.note);
 }
}
function schedule(a,delay=1400){
 clearTimeout(a.timer);
 a.timer=setTimeout(()=>{void flush(a).catch(()=>{});},delay);
}
async function flush(a){
 if(active!==a||!a.dirty||a.conflict)return;
 if(a.saving)return a.saving;
 a.saving=(async()=>{
  for(let attempt=0;attempt<5&&a.dirty;attempt++){
   const next=checked(a.note),edit=a.edits;
   a.status='กำลังบันทึกใน Supabase…';updateNotice(a.note);
   const result=await (await client()).rpc('ru_collab_save',{p_note_id:a.id,p_expected_revision:a.revision,p_snapshot:next});
   if(result.error){
    if(result.error.code==='40001'){await refreshRemote(a);if(a.conflict)throw Error(a.status);continue;}
    a.status='ยังไม่บันทึกออนไลน์: '+message(result.error);storeDraft(a);updateNotice(a.note);schedule(a,8000);throw result.error;
   }
   a.revision=Number(result.data);a.base=clone(next);
   a.dirty=a.edits!==edit;
   a.status=a.dirty?'ยังมีงานรอบันทึก…':'บันทึกใน Supabase แล้ว';
   if(!a.dirty)clearDraft(a);
   updateNotice(a.note);
   try{await a.channel?.send({type:'broadcast',event:'change',payload:{revision:a.revision}});}catch{}
  }
  if(a.dirty)schedule(a);
 })();
 try{return await a.saving;}finally{a.saving=null;}
}
function makeSpace(a){
 return {
  info:()=>({scope:'ru-collab:'+a.id,user,canEdit:a.role!=='viewer'&&!a.conflict,readOnly:a.role==='viewer',status:a.status,phase:a.conflict?'conflict':a.dirty?'pending':'saved',dirty:a.dirty,busy:!!a.saving,conflict:a.conflict,locked:a.role==='viewer'}),
  notebook:()=>({version:10,notes:[a.note]}),
  saveNotebook(book){
   if(a.role==='viewer')throw Error('บัญชีนี้มีสิทธิ์ดูอย่างเดียว');
   if(a.conflict)throw Error('มีการแก้ไขชนกัน กรุณาสำรองงานค้างก่อน');
   if(!Array.isArray(book?.notes)||book.notes.length!==1||book.notes[0].id!==a.id)throw Error('รูปแบบสมุดไม่ถูกต้อง');
   a.note=checked(book.notes[0]);a.dirty=true;a.edits++;a.status='กำลังรอบันทึก…';storeDraft(a);schedule(a);updateNotice(a.note);return true;
  },
  async flush(){if(a.role==='viewer')return;await flush(a);if(a.dirty||a.conflict)throw Error(a.status);},
  async sync(){await refreshRemote(a);},
  async uploadImage(file){
   if(a.role==='viewer')throw Error('ไม่มีสิทธิ์แนบรูป');
   const id=newImageId(file),response=await (await client()).storage.from(assetBucket).upload(a.id+'/'+id,file,{upsert:false,contentType:file.type});
   if(response.error)throw response.error;return id;
  },
  async image(id){
   const response=await (await client()).storage.from(assetBucket).download(a.id+'/'+id);
   if(response.error)throw response.error;return response.data;
  },
  async uploadDocument(file,blob){
   if(a.role==='viewer')throw Error('ไม่มีสิทธิ์แนบเอกสาร');
   const response=await (await client()).storage.from(assetBucket).upload(a.id+'/documents/'+file.id,blob,{contentType:blob.type,upsert:false});
   if(response.error)throw response.error;
  },
  async document(file){
   const response=await (await client()).storage.from(assetBucket).download(a.id+'/documents/'+file.id);
   if(response.error)throw response.error;return response.data;
  }
 };
}
function disconnect(){
 if(!active)return;
 clearTimeout(active.timer);clearInterval(active.poll);
 if(active.channel)db?.removeChannel?.(active.channel);
 if(onlineListener){window.removeEventListener('online',onlineListener);onlineListener=null;}
 active=null;
}
async function joinChannel(a){
 const channel=(await client()).channel('ru-collab:'+a.id,{config:{private:true,presence:{key:user.id}}});
 a.channel=channel;
 channel.on('broadcast',{event:'change'},()=>{void refreshRemote(a).catch(err=>{a.status=message(err);updateNotice(a.note);});});
 channel.on('presence',{event:'sync'},()=>{
  a.present=[...new Set(Object.values(channel.presenceState()).flat().map(v=>v.display||'ผู้ร่วมงาน'))];a.online=a.present.length;updateNotice(a.note);
 });
 channel.subscribe(status=>{
  if(status==='SUBSCRIBED')void channel.track({user:user.id,display:(user.email||'ผู้ร่วมงาน').split('@')[0].slice(0,40)});
  else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){a.status='เชื่อมต่อการแสดงผู้ร่วมงานไม่สำเร็จ · ยังตรวจการแก้ไขเป็นระยะ';updateNotice(a.note);}
 });
 a.poll=setInterval(()=>{void refreshRemote(a).catch(()=>{});},5000);
 onlineListener=()=>{if(active===a&&a.dirty&&!a.conflict)schedule(a,200);};window.addEventListener('online',onlineListener);
}
async function openShared(id){
 disconnect();const row=await fetchNote(id);
 const members=await (await client()).from('ru_collab_members').select('user_id,role,display_name').eq('note_id',id);
 if(members.error)throw members.error;
 const role=row.owner_id===user.id?'owner':members.data?.find(x=>x.user_id===user.id)?.role;
 if(!role)throw Error('ไม่มีสิทธิ์เปิดสมุดนี้');
 const a={id,owner:row.owner_id,revision:row.revision,base:checked(row.snapshot),note:checked(row.snapshot),role,
  members:members.data||[],edits:0,dirty:false,conflict:false,saving:null,timer:null,poll:null,channel:null,online:0,present:[],status:'บันทึกใน Supabase แล้ว'};
 a.space=makeSpace(a);active=a;
 try{
  const saved=JSON.parse(localStorage.getItem(draftKey(a))||'null');
  if(saved&&saved.note?.id===id){
   a.note=mergeCollaborativeNote(saved.base,checked(saved.note),a.base);
   a.dirty=true;a.edits++;a.status='กู้คืนงานค้างจากเครื่องนี้ · กำลังบันทึก';schedule(a);
  }
 }catch{a.conflict=true;a.status='พบงานค้างที่มีข้อมูลชนกัน · ดาวน์โหลดสำเนาก่อน';}
 await joinChannel(a);return a;
}
async function loadIndex(){
 const r=await (await client()).from('ru_collab_notes').select('id,owner_id,title,course,updated_at').order('updated_at',{ascending:false}).limit(200);
 if(r.error)throw r.error;items=r.data||[];
}
export async function collabNavigate(view,id,onRender){
 notify=onRender;
 if(loading)return;loading=true;error='';
 try{
  const database=await client(),r=await database.auth.getSession();
  if(r.error)throw r.error;
  user=r.data.session?.user||null;authReady=true;
  if(!user){disconnect();items=[];return;}
  if(view==='collab-note'&&id)await openShared(id);
  else {disconnect();await loadIndex();}
 }catch(err){error=message(err);}
 finally{loading=false;show();}
}
export function collabActiveSpace(id){return active?.id===id?active.space:null;}
export function collabLeave(){if(active?.dirty){storeDraft(active);void flush(active).catch(()=>{});}disconnect();}
export function collabNotePage(id){
 if(loading)return '<section class="panel" role="status">กำลังเปิดสมุดร่วมกัน…</section>';
 if(error)return '<section class="panel" role="alert"><h2>เปิดสมุดร่วมกันไม่ได้</h2><p>'+e(error)+'</p><a href="#collab">กลับรายการสมุด</a></section>';
 const a=active;
 if(!a||a.id!==id)return '<section class="panel">ยังไม่พบสมุดที่เลือก <a href="#collab">กลับรายการ</a></section>';
 const viewer=a.role==='viewer';
 const online='<span id="collab-online">กำลังเชื่อมต่อผู้ร่วมงาน</span>';
 const head='<header class="collab-head"><div><a href="#collab" class="text-link">← สมุดร่วมกัน</a><h1>'+e(a.note.title)+'</h1><p>'+online+' · '+(viewer?'ดูอย่างเดียว':a.role==='owner'?'เจ้าของ':'แก้ไขได้')+' · <span id="collab-save-status">'+e(a.status)+'</span></p></div><div class="collab-head-actions">'+(a.role==='owner'?'<button class="button secondary" data-action="collab-invite-open">เชิญผู้ร่วมงาน</button>':'')+'<button class="button secondary" data-action="collab-copy-link">คัดลอกลิงก์</button>'+(viewer?'':'<button class="button secondary" data-action="collab-history">ประวัติ</button>')+'<button class="button secondary" data-action="collab-backup">สำรองงาน</button>'+(a.conflict?'<button class="button primary" data-action="collab-resolve">โหลดฉบับล่าสุด</button>':viewer?'':'<button class="button primary" data-action="collab-save">บันทึกงาน</button>')+'</div></header>';
 const members=a.members.map(m=>'<div class="collab-member"><span>'+e(m.display_name||m.user_id.slice(0,8))+' · '+(m.role==='editor'?'แก้ไขได้':'ดูอย่างเดียว')+'</span>'+(a.role==='owner'?'<button type="button" data-action="collab-member-role" data-user="'+m.user_id+'">'+(m.role==='editor'?'เปลี่ยนเป็นดู':'ให้แก้ไข')+'</button><button type="button" data-action="collab-member-remove" data-user="'+m.user_id+'">นำออก</button>':'')+'</div>').join('');
 return head+'<div class="collab-members">'+members+'</div><div class="'+(viewer||a.conflict?'collab-viewer':'collab-editor')+'">'+notePage(a.space,a.id,true)+'</div>';
}
export function collabPage(){
 if(loading&&!authReady)return '<section class="panel" role="status">กำลังเชื่อมต่อสมุดร่วมกัน…</section>';
 const heading='<div class="page-heading"><div><div class="eyebrow">COLLABORATIVE NOTEBOOK</div><h1>สมุดร่วมกัน</h1><p>แชร์ให้ผู้ร่วมงานแก้ไขพร้อมกันได้ โดยสมุดส่วนตัวยังอยู่ครบ</p></div></div>';
 if(error)return heading+'<section class="panel" role="alert"><h2>ระบบแชร์ยังไม่พร้อม</h2><p>'+e(error)+'</p><p>ต้องเปิดตารางและสิทธิ์ของระบบสมุดร่วมกันใน Supabase โปรเจ็กต์ของแอปก่อน</p><button class="button secondary" data-action="collab-retry">ลองอีกครั้ง</button></section>';
 if(!user)return heading+'<section class="panel collab-login"><h2>เข้าสู่ระบบเพื่อใช้สมุดร่วมกัน</h2><p>ต้องใช้บัญชี Supabase Auth ที่ยืนยันอีเมลแล้ว ระบบนี้แยกจากสมุดส่วนตัวเดิม</p><form id="collab-auth-form"><label>อีเมล<input name="email" type="email" autocomplete="email" required></label><label>รหัสผ่าน<input name="password" type="password" minlength="6" autocomplete="current-password" required></label><div class="button-row"><button class="button primary" type="submit" name="mode" value="login">เข้าสู่ระบบ</button><button class="button secondary" type="submit" name="mode" value="signup">สมัครบัญชี</button></div></form></section>';
 const source=shareSource?'<button class="button primary" data-action="collab-share-current">นำหน้าโน้ตที่เลือกมาแชร์</button>':'';
 const cards=items.map(n=>'<article class="collab-note-card"><strong>'+e(n.title||'สมุดร่วมกัน')+'</strong><p>'+e(n.course||'')+' · แก้ไข '+e(dateString(n.updated_at))+'</p><div class="button-row"><a class="button secondary" href="#collab-note/'+n.id+'">เปิดสมุด</a><span class="note-origin">'+(n.owner_id===user.id?'เจ้าของ':'ร่วมงาน')+'</span></div></article>').join('');
 return heading+'<div class="collab-toolbar"><span>เข้าสู่ระบบ: '+e(user.email||'')+'</span><div class="button-row">'+source+'<button class="button primary" data-action="collab-create">＋ สร้างสมุดร่วมกัน</button><button class="button secondary" data-action="collab-logout">ออกจากระบบแชร์</button></div></div><div class="collab-grid">'+(cards||'<section class="panel">ยังไม่มีสมุดที่แชร์ เริ่มสร้างสมุดแรกได้เลย</section>')+'</div>';
}
export function collabShareSource(id){shareSource=id;}
async function createShared(personalNote,personalSpace){
 const d=await client(),id=crypto.randomUUID();
 let n=personalNote?clone(personalNote):newNote({id,source:'classroom',title:'สมุดร่วมกันใหม่'});
 n.id=id;n.pinned=false;n.archived=false;n.updatedAt=new Date().toISOString();
 if(!n.paper)n.paper=paperFor(n);
 n=checked(n);
 const blank=checked({...newNote({id,title:n.title,course:n.course}),paper:paperFor(newNote({id}))});
 const created=await d.from('ru_collab_notes').insert({id,owner_id:user.id,snapshot:blank}).select('id').single();
 if(created.error)throw created.error;
 try{if(personalNote){
  for(const imageId of referencedImages({notes:[n]})){
   const blob=await personalSpace.image(imageId);
   const sent=await d.storage.from(assetBucket).upload(id+'/'+imageId,blob,{contentType:blob.type,upsert:false});
   if(sent.error)throw sent.error;
  }
  for(const file of storedDocuments({notes:[n]})){
   const blob=await personalSpace.document(file);
   const sent=await d.storage.from(assetBucket).upload(id+'/documents/'+file.id,blob,{contentType:blob.type,upsert:false});
   if(sent.error)throw sent.error;
  }
  const saved=await d.rpc('ru_collab_save',{p_note_id:id,p_expected_revision:1,p_snapshot:n});
  if(saved.error)throw saved.error;
 }}catch(err){await d.from('ru_collab_notes').delete().eq('id',id);throw err;}
 shareSource=null;return id;
}
export async function collabAction(action,data,personalSpace,render,toast){
 try{
  if(action==='collab-retry'){await collabNavigate('collab','',render);return;}
  if(action==='collab-logout'){collabLeave();await (await client()).auth.signOut({scope:'local'});user=null;items=[];render();return;}
  if(action==='collab-create'||action==='collab-share-current'){
   if(!user)throw Error('กรุณาเข้าสู่ระบบแชร์ก่อน');
   const original=action==='collab-share-current'?personalSpace.notebook().notes.find(n=>n.id===shareSource):null;
   if(action==='collab-share-current'&&!original)throw Error('ไม่พบโน้ตที่เลือกแชร์');
   const id=await createShared(original,personalSpace);
   location.hash='#collab-note/'+id;toast('สร้างสมุดร่วมกันแล้ว');return;
  }
  if(action==='collab-copy-link'){
   if(!active)throw Error('ยังไม่พบสมุด');
   const url=location.origin+location.pathname+'#collab-note/'+active.id;
   if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);toast('คัดลอกลิงก์แล้ว · ผู้รับต้องได้รับคำเชิญก่อน');}
   else prompt('คัดลอกลิงก์',url);
   return;
  }
  if(action==='collab-member-role'||action==='collab-member-remove'){
   if(!active||active.role!=='owner')throw Error('เฉพาะเจ้าของสมุด');
   const member=active.members.find(m=>m.user_id===data.user);if(!member)throw Error('ไม่พบผู้ร่วมงาน');
   if(action==='collab-member-remove'&&!confirm('ยกเลิกสิทธิ์ของ '+(member.display_name||'ผู้ร่วมงาน')+' ใช่ไหม?'))return;
   const q=(await client()).from('ru_collab_members');
   const role=member.role==='editor'?'viewer':'editor';
   const result=action==='collab-member-role'
    ?await q.update({role}).eq('note_id',active.id).eq('user_id',member.user_id)
    :await q.delete().eq('note_id',active.id).eq('user_id',member.user_id);
   if(result.error)throw result.error;
   active.members=action==='collab-member-role'?active.members.map(m=>m.user_id===member.user_id?{...m,role}:m):active.members.filter(m=>m.user_id!==member.user_id);
   render();toast('อัปเดตสิทธิ์แล้ว');return;
  }
  if(action==='collab-history'){
   if(!active)throw Error('ยังไม่พบสมุด');
   const r=await (await client()).from('ru_collab_versions').select('revision,updated_at').eq('note_id',active.id).order('revision',{ascending:false}).limit(20);
   if(r.error)throw r.error;
   if(!r.data?.length){toast('ยังไม่มีประวัติการแก้ไขก่อนหน้านี้');return;}
   const lines=r.data.map(v=>v.revision+' · '+dateString(v.updated_at)).join('\n');
   const choice=prompt('ประวัติ (ฉบับก่อนหน้า)\n'+lines+'\n\nใส่เลขฉบับเพื่อกู้คืน หรือเว้นว่างเพื่อปิด');
   if(!choice)return;
   if(active.role==='viewer')throw Error('สิทธิ์ดูอย่างเดียว ไม่สามารถย้อนฉบับ');
   const picked=r.data.find(v=>String(v.revision)===choice.trim());if(!picked)throw Error('ไม่พบฉบับที่เลือก');
   if(!confirm('ยืนยันนำฉบับ '+choice+' กลับมาแทนฉบับล่าสุด? ระบบจะเก็บฉบับก่อนหน้าไว้อีกครั้ง'))return;
   const revision=await (await client()).from('ru_collab_versions').select('snapshot').eq('note_id',active.id).eq('revision',picked.revision).single();
   if(revision.error||!revision.data?.snapshot)throw revision.error||Error('ไม่สามารถโหลดฉบับก่อนหน้าได้');
   active.space.saveNotebook({notes:[checked(revision.data.snapshot)]});await active.space.flush();render();toast('กู้คืนฉบับ '+choice+' แล้ว');return;
  }
  if(action==='collab-resolve'){
   if(!active||!active.conflict)throw Error('ยังไม่มีข้อมูลชนกัน');
   if(!confirm('ระบบจะดาวน์โหลดสำรองงานค้าง แล้วโหลดฉบับล่าสุดจาก Supabase แทนงานค้าง ยืนยันหรือไม่?'))return;
   const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(active.note,null,2)],{type:'application/json'}));
   a.download='shared-note-conflict-'+active.id+'.json';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   active.note=clone(active.base);active.dirty=false;active.conflict=false;active.edits++;clearDraft(active);
   active.status='โหลดฉบับล่าสุดแล้ว · งานเดิมสำรองไว้ในไฟล์ JSON';
   render();toast('สำรองงานเดิมและกลับไปฉบับล่าสุดแล้ว');return;
  }
  if(action==='collab-save'){if(!active)throw Error('ยังไม่พบสมุด');await active.space.flush();toast('บันทึกใน Supabase แล้ว');return;}
  if(action==='collab-backup'){
   if(!active)throw Error('ยังไม่พบสมุด');
   const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(active.note,null,2)],{type:'application/json'}));
   a.download='shared-note-'+active.id+'.json';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(action==='collab-invite-open'){
   if(!active||active.role!=='owner')throw Error('เฉพาะเจ้าของสมุดเท่านั้น');
   const dialog=document.createElement('dialog');
   dialog.className='collab-invite-dialog';
   dialog.innerHTML='<form method="dialog"><h2>เชิญผู้ร่วมงาน</h2><p>ผู้รับต้องสมัครบัญชีและยืนยันอีเมลก่อน</p><label>อีเมลผู้รับ<input name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label><label>สิทธิ์<select name="role"><option value="editor">แก้ไขได้</option><option value="viewer">ดูอย่างเดียว</option></select></label><div class="button-row"><button class="button primary" value="invite">ส่งคำเชิญ</button><button class="button secondary" value="cancel" formnovalidate>ยกเลิก</button></div></form>';
   document.body.append(dialog);
   const done=new Promise(resolve=>dialog.onclose=resolve);dialog.showModal();await done;
   const email=dialog.querySelector('[name="email"]').value.trim(),role=dialog.querySelector('[name="role"]').value,result=dialog.returnValue;
   dialog.remove();
   if(result!=='invite'||!email)return;
   const r=await (await client()).rpc('ru_collab_invite',{p_note_id:active.id,p_email:email,p_role:role});
   if(r.error)throw r.error;const members=await (await client()).from('ru_collab_members').select('user_id,role,display_name').eq('note_id',active.id);if(!members.error){active.members=members.data||[];render();}toast('เพิ่มผู้ร่วมงานแล้ว ส่งลิงก์ URL หน้านี้ให้ผู้รับเปิดได้เลย');return;
  }
 }catch(err){toast(message(err));if(active){active.status=message(err);updateNotice(active.note);}}
}
export async function collabAuth(form,submitter,render,toast){
 const fd=new FormData(form),email=String(fd.get('email')||'').trim(),password=String(fd.get('password')||'');
 const mode=submitter?.value==='signup'?'signup':'login';const d=await client();
 const r=mode==='signup'?await d.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await d.auth.signInWithPassword({email,password});
 if(r.error){toast(message(r.error));return;}
 if(mode==='signup'&&!r.data.session)toast('สมัครแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');
 await collabNavigate('collab','',render);
}
