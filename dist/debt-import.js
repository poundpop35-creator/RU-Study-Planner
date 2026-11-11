// Restore a schedule into the currently open workspace. Never switch the user's space.
import {supabaseConfig} from './supabase-config.js';
import {decode} from './debt-update.js?v=20261111b';
const enc=new TextEncoder(), bytes=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const digest=t=>crypto.subtle.digest('SHA-256',enc.encode(t));
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
export const importPanel=()=>`<section class="panel" aria-labelledby="plan-import-title"><h2 id="plan-import-title">อัปเดตแผนหนี้</h2><p>ใส่รหัสรับแผนจากแชตเพื่อใช้ยอดใหม่กับประวัติการจ่ายในไอคอนนี้</p><form id="debt-import-form"><label for="debt-import-value">รหัสรับแผน หรือลิงก์แผน</label><input id="debt-import-value" style="width:100%;margin:.4rem 0 .75rem" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" required><button class="button primary" type="submit">อัปเดตแผนในไอคอนนี้</button><p id="debt-import-message" role="status" aria-live="polite"></p></form></section>`;
export async function resolvePlan(value,fetcher=fetch){
 const input=String(value||'').trim();
 const m=input.match(/^(?:https:\/\/[^\s#]+\/#debt\/|#debt\/)?(p2\.[\w-]+)$/);if(m){decode(m[1]);return m[1];}
 if(!/^P1-[A-Za-z0-9_-]{24}$/.test(input))throw Error('รหัสไม่ครบ กรุณาคัดลอกรหัสทั้งบรรทัด หรือลิงก์แผนจากแชต');
 const k=hex(await digest('repay-fetch:'+input)),resp=await fetcher(supabaseConfig.url+'/functions/v1/personal-study/workspace',{method:'GET',cache:'no-store',redirect:'error',credentials:'omit',headers:{apikey:supabaseConfig.publishableKey,'x-study-key':k}});
 if(!resp.ok)throw Error(resp.status===404?'ไม่พบรหัสรับแผน กรุณาตรวจรหัส':'ยังโหลดแผนไม่ได้ กรุณาลองอีกครั้ง');
 const env=(await resp.json())?.payload?.planEnvelope;
 if(env?.version!==1||typeof env.box!=='string'||env.box.length>50000||typeof env.iv!=='string')throw Error('ข้อมูลที่รับมาไม่ใช่แผนหนี้');
 const aes=await crypto.subtle.importKey('raw',await digest('repay-open:'+input),'AES-GCM',false,['decrypt']);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(env.iv)},aes,bytes(env.box));const token=new TextDecoder().decode(plain);decode(token);return token;
}
