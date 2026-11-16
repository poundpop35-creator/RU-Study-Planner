import {supabaseConfig} from './supabase-config.js';
export const sessionKey='ru-study-notebook-auth-v1';
let client;
export async function accountClient(load){
 if(!globalThis.supabase?.createClient)await load('./vendor/supabase-2.117.3.js');
 return client??=globalThis.supabase.createClient(supabaseConfig.url,supabaseConfig.publishableKey,{auth:{storageKey:sessionKey,detectSessionInUrl:false}});
}
export async function lookupAccount(db){
 const {data,error}=await db.auth.getSession();if(error)throw error;
 const user=data.session?.user;if(!user)return {};
 const row=await db.from('ru_study_account_links').select('space_key').eq('user_id',user.id).maybeSingle();
 if(row.error)throw row.error;return {email:user.email,key:row.data?.space_key};
}
