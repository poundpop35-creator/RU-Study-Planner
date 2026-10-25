import {creditors,months,data,legacyData,readPaid} from './debt-core.js?v=20261025j';
export const PAYMENT_STORE='debtPayments_20261025_v1';
const errorText='อ่านประวัติการจ่ายไม่ได้ จึงยังไม่แสดงยอดสะสมและไม่เขียนทับข้อมูลเดิม';
const cents=n=>Math.round(n*100);
export function paymentSummary(entries){
 const byCreditor=Object.fromEntries(creditors.map(c=>[c.key,entries.filter(e=>e.creditor===c.key).reduce((n,e)=>n+e.amountCents,0)]));
 const available={...byCreditor},allocation={},monthPaid={},monthRemaining={};
 let count=0;
 for(const m of months){
  allocation[m]={};let paid=0,due=0;
  for(const c of creditors){const target=cents(data[m][c.key]);const used=Math.min(target,available[c.key]);available[c.key]-=used;allocation[m][c.key]=used/100;paid+=used;due+=target;}
  monthPaid[m]=paid/100;monthRemaining[m]=(due-paid)/100;if(paid===due)count++;
 }
 const total=creditors.reduce((n,c)=>n+cents(c.balance),0),paid=Object.values(byCreditor).reduce((a,b)=>a+b,0);
 const interestPaid=entries.reduce((n,e)=>n+(e.interestCents||0),0),feePaid=entries.reduce((n,e)=>n+(e.feeCents||0),0);
 return {interestPaid:interestPaid/100,feePaid:feePaid/100,feeByCreditor:Object.fromEntries(creditors.map(c=>[c.key,entries.filter(e=>e.creditor===c.key).reduce((n,e)=>n+(e.feeCents||0),0)/100])),cashPaid:(paid+interestPaid+feePaid)/100,total:total/100,paid:paid/100,left:(total-paid)/100,count,percent:Math.floor(paid/total*100),next:months.find(m=>monthRemaining[m]>0),byCreditor:Object.fromEntries(Object.entries(byCreditor).map(([k,v])=>[k,v/100])),allocation,monthPaid,monthRemaining};
}
export function readPayments(storage){
 try{
  const raw=storage.getItem(PAYMENT_STORE);let entries;
  if(raw==null){
   const legacy=readPaid(storage);if(legacy.error)throw Error('legacy');
   entries=months.flatMap((m,i)=>legacy.paid[m]?creditors.filter(c=>legacyData[m][c.key]>0).map((c,j)=>({id:`legacy-${i}-${j}`,creditor:c.key,amountCents:cents(legacyData[m][c.key]),at:null})):[]);
  }else entries=JSON.parse(raw);
  if(!Array.isArray(entries))throw Error('shape');
  const ids=new Set(),totals={};
  for(const e of entries){
   const c=e&&creditors.find(c=>c.key===e.creditor);
   if(!c||typeof e.id!=='string'||!/^[-a-zA-Z0-9_]+$/.test(e.id)||ids.has(e.id)||!Number.isSafeInteger(e.amountCents)||e.amountCents<0||!Number.isSafeInteger(e.interestCents??0)||(e.interestCents??0)<0||!Number.isSafeInteger(e.feeCents??0)||(e.feeCents??0)<0||e.amountCents+(e.interestCents??0)+(e.feeCents??0)<=0||!Number.isSafeInteger(e.amountCents+(e.interestCents??0)+(e.feeCents??0))||(['G','S'].includes(e.creditor)&&(e.interestCents??0)>0)||!(e.at===null||typeof e.at==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(e.at)&&Number.isFinite(Date.parse(e.at))))throw Error('entry');
   ids.add(e.id);totals[c.key]=(totals[c.key]||0)+e.amountCents;if(totals[c.key]>cents(c.balance))throw Error('overpaid');
  }
  return {entries,error:''};
 }catch{return {entries:[],error:errorText};}
}
function write(storage,entries){try{storage.setItem(PAYMENT_STORE,JSON.stringify(entries));return '';}catch(err){return err?.userMessage||'บันทึกไม่ได้ กรุณาตรวจพื้นที่จัดเก็บของเบราว์เซอร์แล้วลองอีกครั้ง';}}
export function addPayment(storage,creditor,amount,interestAmount=0,feeAmount=0){
 const result=readPayments(storage);if(result.error)return result.error;
 const c=creditors.find(c=>c.key===creditor);if(!c)return 'เลือกเจ้าหนี้ก่อนบันทึก';
 const raw=String(amount??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return 'กรอกจำนวนเงินมากกว่า 0 และทศนิยมไม่เกิน 2 ตำแหน่ง';
 const value=cents(Number(raw));if(!Number.isSafeInteger(value)||value<=0)return 'กรอกจำนวนเงินมากกว่า 0';
 const interestRaw=String(interestAmount??'0').trim()||'0';
 if(!/^\d+(?:\.\d{1,2})?$/.test(interestRaw))return 'กรอกดอกเบี้ยเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง';
 const interest=cents(Number(interestRaw));if(!Number.isSafeInteger(interest)||interest>value)return 'ดอกเบี้ยต้องไม่เกินยอดที่จ่ายทั้งหมด';
 if(interest>0&&['G','S'].includes(creditor))return 'G รวมดอกในยอดเดิมแล้ว ส่วน S ไม่มีดอกเพิ่ม';
 const feeRaw=String(feeAmount??'0').trim()||'0';
 if(!/^\d+(?:\.\d{1,2})?$/.test(feeRaw))return 'กรอกค่าประกัน/ค่าธรรมเนียมเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง';
 const fee=cents(Number(feeRaw));if(!Number.isSafeInteger(fee)||interest+fee>value)return 'ดอกเบี้ยรวมค่าประกัน/ค่าธรรมเนียมต้องไม่เกินยอดที่จ่ายทั้งหมด';
 const principal=value-interest-fee;
 const paid=result.entries.filter(e=>e.creditor===creditor).reduce((n,e)=>n+e.amountCents,0);
 if(principal>cents(c.balance)-paid)return 'ยอดจ่ายเกินเงินต้นคงเหลือของเจ้าหนี้รายนี้';
 const id=globalThis.crypto?.randomUUID?.()||`payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 return write(storage,[...result.entries,{id,creditor,amountCents:principal,interestCents:interest,...(fee?{feeCents:fee}:{}),at:new Date().toISOString()}]);
}
export function removePayment(storage,id){
 const result=readPayments(storage);if(result.error)return result.error;
 if(!result.entries.some(e=>e.id===id))return 'ไม่พบรายการจ่ายนี้';
 return write(storage,result.entries.filter(e=>e.id!==id));
}
