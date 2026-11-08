import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,randomBytes} from 'node:crypto';
import {resolvePlan} from '../dist/debt-import.js';
const b64=b=>Buffer.from(b).toString('base64url');
const token='p2.'+b64(JSON.stringify(['2031-05-01',50000,5000,[['Example','',2000,0,[0,2000],0,'',0,'','',0]],'']));
test('use existing link without navigating away or doing a request',async()=>{
 assert.equal(await resolvePlan('https://example.test/#debt/'+token,()=>assert.fail()),token);
 await assert.rejects(resolvePlan('https://example.test/#space=not-an-import',()=>assert.fail()));
});
test('read only an isolated import envelope; a wrong code cannot open it',async()=>{
 const code='P1-'+b64(randomBytes(18)),hash=v=>createHash('sha256').update(v).digest();
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',hash('repay-open:'+code),iv);
 const box=b64(Buffer.concat([cipher.update(token),cipher.final(),cipher.getAuthTag()]));
 const fetcher=async(url,opt)=>{
  assert.match(url,/\/personal-study\/workspace$/);assert.equal(opt.method,'GET');assert.ok(!url.includes(code));
  return {ok:true,json:async()=>({payload:{planEnvelope:{version:1,iv:b64(iv),box}}})};
 };
 assert.equal(await resolvePlan(code,fetcher),token);
 await assert.rejects(resolvePlan('P1-'+b64(randomBytes(18)),fetcher));
});
