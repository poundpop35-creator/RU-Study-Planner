import {supabaseConfig} from './supabase-config.js?v=20261027c';
import {loadContent,validateCatalog} from './content-client.js?v=20261027c';
const snapshotURL=new URL('./content.snapshot.json?v=20261027c',import.meta.url);
async function localSnapshot(){
 if(typeof process!=='undefined'&&process.versions?.node){
  const {readFile}=await import('node:fs/promises');return JSON.parse(await readFile(snapshotURL,'utf8'));
 }
 const response=await fetch(snapshotURL);if(!response.ok)throw new Error('โหลดเนื้อหาไม่สำเร็จ');return response.json();
}
// Must equal `updated` in content.snapshot.json (a test checks this).
export const BUNDLED_UPDATED='2026-10-18';
let storage;try{storage=globalThis.localStorage;}catch{/* Private browsing can deny storage. */}
export const contentStatus=typeof process!=='undefined'&&process.versions?.node
 ? {catalog:validateCatalog(await localSnapshot()),source:'snapshot',warning:null}
 : await loadContent({config:supabaseConfig,storage,fallback:localSnapshot,bundledUpdated:BUNDLED_UPDATED});
export const catalog=contentStatus.catalog;
