// A fixture must explicitly supply a mock. Never send test traffic to a hosted workspace.
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url||input);
 if(url.protocol==='data:'||url.protocol==='blob:')return original(input,options);
 return Promise.reject(new Error('Network disabled in unit tests'));
};
