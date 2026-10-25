import {plan} from './debt-core.js?v=20261025j';
export const RATE_STORE='debtInterestRates_20261025_v1';
export const rateFields=[
 {key:'aeonUpper',name:'AEON รายการบน (ยังไม่ทราบประเภท)',value:25,unit:'% ต่อปี',max:100},
 {key:'aeonCard',name:'AEON คลาสสิค วีซ่า',value:16,unit:'% ต่อปี',max:100},
 {key:'line',name:'LINE BK',value:25,unit:'% ต่อปี',max:100},
 {key:'gold',name:'ทองมาเงินไป',value:1.25,unit:'% ต่อเดือน',max:10},
];
export const defaultRates=Object.fromEntries(rateFields.map(f=>[f.key,f.value]));
function valid(rates){return rates&&typeof rates==='object'&&!Array.isArray(rates)&&rateFields.every(f=>typeof rates[f.key]==='number'&&Number.isFinite(rates[f.key])&&rates[f.key]>=0&&rates[f.key]<=f.max);}
export function readRates(storage){
 try{const raw=storage.getItem(RATE_STORE);if(raw==null)return {rates:{...defaultRates},error:''};const rates=JSON.parse(raw);if(!valid(rates))throw Error();return {rates,error:''};}
 catch{return {rates:{...defaultRates},error:'อ่านอัตราที่บันทึกไว้ไม่ได้ กรุณาตรวจแล้วบันทึกอัตราใหม่ ประวัติการจ่ายยังอยู่เดิม'};}
}
export function saveRates(storage,values){
 if(rateFields.some(f=>String(values[f.key]??'').trim()===''))return 'กรอกอัตราให้ครบทุกช่อง';
 const rates=Object.fromEntries(rateFields.map(f=>[f.key,Number(values[f.key])]));
 if(!valid(rates))return 'กรอกอัตรารายปี 0–100% และรายเดือน 0–10%';
 try{storage.setItem(RATE_STORE,JSON.stringify(rates));return '';}catch(err){return err?.userMessage||'บันทึกอัตราไม่ได้ กรุณาตรวจพื้นที่จัดเก็บของเบราว์เซอร์';}
}
// This is a forecast, never a lender statement or a source of actual payment entries.
// AEON statement totals proxy opening balances; they may include prior accrued charges.
// Each forecast period is 30 days, with planned balance payments at period end.
export function interestPlan(rates=defaultRates){
 if(!valid(rates))throw Error('Invalid interest rates');
 const remaining={aeonUpper:1511544,aeonCard:1032511,line:2600000,gold:4600000};
 return plan.map(row=>{
  const opening={...remaining};
  const interest={aeonUpper:Math.round(opening.aeonUpper*rates.aeonUpper/100*30/365),aeonCard:Math.round(opening.aeonCard*rates.aeonCard/100*30/365),line:Math.round(opening.line*rates.line/100*30/365),gold:Math.round(opening.gold*rates.gold/100)};
  // Both AEON accounts receive whole-thousand targets; fractional amounts only close an account.
  const allocation=Object.fromEntries(Object.entries(row.aeonAllocation).map(([k,v])=>[k,Math.round(v*100)]));
  for(const key of ['aeonUpper','aeonCard'])remaining[key]-=allocation[key];
  remaining.line-=Math.round(row.payments.LINE*100);remaining.gold-=Math.round(row.payments['ทอง']*100);
  const interestTotalCents=Object.values(interest).reduce((a,b)=>a+b,0);
  return {month:row.month,opening:Object.fromEntries(Object.entries(opening).map(([k,v])=>[k,v/100])),interest:Object.fromEntries(Object.entries(interest).map(([k,v])=>[k,v/100])),aeonAllocation:Object.fromEntries(Object.entries(allocation).map(([k,v])=>[k,v/100])),interestTotal:interestTotalCents/100,baseTotal:row.total,cashTotal:(Math.round(row.total*100)+interestTotalCents)/100};
 });
}
