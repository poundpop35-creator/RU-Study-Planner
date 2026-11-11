import {renderDebtCards} from './debt-cards.js?v=20261111a';
// Portfolio details arrive from the private workspace or an import link's fragment.
// No personal plans, balances, lender names, or installment amounts belong in this module.
import {readPayments} from './debt-payments.js?v=20261027c';
import {readRates} from './debt-interest.js?v=20261027c';
export const snapshotKey='debtPrivateSchedule_v1';
const sum=vs=>vs.reduce((a,b)=>a+b,0),fmt=c=>(c/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail=()=>{throw Error('ข้อมูลแผนไม่ครบ กรุณาเปิดลิงก์ปรับยอดอีกครั้ง');};
const int=(x,max=1e10)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const str=(x,max)=>typeof x==='string'&&x.length<=max;
export function decode(token){
 if(!/^p2\.[A-Za-z0-9_-]{16,22000}$/.test(token))fail();
 const raw=atob(token.slice(3).replaceAll('-','+').replaceAll('_','/'));
 const p=JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
 if(!Array.isArray(p)||p.length!==5)fail();
 const [date,budget,unit,items,note]=p;
 if(!/^20\d{2}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(date)||!int(budget)||!budget||!int(unit)||!unit||!Array.isArray(items)||!items.length||items.length>30||!str(note,600))fail();
 const accounts=items.map(v=>{
  if(!Array.isArray(v)||(v.length!==11&&v.length!==12))fail();
  const [label,group,bal,min,bills,carry,old,rate,period,storedRate,day]=v;
  if(!str(label,80)||!label||!str(group,80)||!int(bal)||!int(min)||!Array.isArray(bills)||bills.length>120||!bills.every(x=>int(x))||!int(carry)||carry+sum(bills)>bal||(!min&&carry+sum(bills)!==bal)||!str(old,60)||!int(rate,10000)||!['','y','m'].includes(period)||!str(storedRate,40)||!int(day,31))fail();
  const meta=v[11],parts=meta?.parts||[],after=meta?.after||'';
  if(meta&&(!Array.isArray(parts)||parts.length>10||!parts.every(t=>Array.isArray(t)&&str(t[0],80)&&int(t[1],31)&&Array.isArray(t[2])&&t[2].length<=bills.length&&t[2].every(n=>int(n)))||parts.length&&bills.some((n,i)=>n!==sum(parts.map(t=>t[2][i]||0)))||after&&!Number.isFinite(Date.parse(after))))fail();
  return {label,group,bal,min,bills,carry,old,rate:rate/100,period,storedRate,day,parts,after};
 });
 return {date,budget,unit,accounts,note};
}
const month=(d,i)=>new Intl.DateTimeFormat('th-TH',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7)-1+i,1)));
export function forecast(p,old,rates){
 const ac=p.accounts.map(a=>{let credit=sum(old.filter(e=>a.old&&e.creditor===a.old&&(!a.after||Date.parse(e.at)>Date.parse(a.after))).map(e=>e.amountCents));const paid=Math.min(a.bal,credit);
  const use=v=>{const used=Math.min(v,credit);credit-=used;return v-used;};
  return {...a,bal:a.bal-paid,carry:use(a.carry),bills:a.bills.map(use),rate:a.storedRate&&Object.hasOwn(rates,a.storedRate)?rates[a.storedRate]:a.rate};
 });
 const left=ac.map(a=>a.bal),rows=[];let reserve=0;
 for(let m=0;sum(left)>0;m++){
  if(m>=240)fail();const opening=[...left],a=ac.map(()=>0);let free=p.budget;
  const put=(i,n)=>{const pay=Math.max(0,Math.min(left[i],n));left[i]-=pay;a[i]+=pay;free-=pay;return pay;};
  const interest=sum(ac.map((v,i)=>Math.round(left[i]*v.rate/100*(v.period==='y'?30/365:v.period==='m'?1:0))));
  ac.forEach((v,i)=>put(i,(v.bills[m]||0)+v.min));
  const carryIn=Math.min(reserve,Math.max(0,-free));reserve-=carryIn;free+=carryIn;
  const needed=sum(ac.map((v,i)=>Math.min(left[i],(v.bills[m+1]||0)+v.min)));
  const setAside=Math.min(Math.max(0,free),Math.max(0,needed-p.budget-reserve));reserve+=setAside;free-=setAside;
  ac.forEach((v,i)=>{v.carry-=put(i,Math.min(Math.max(0,free),v.carry));});
  ac.forEach((v,i)=>{if(v.min)put(i,left[i]<=free?left[i]:Math.floor(free/p.unit)*p.unit);});
  // Return unused reserve if a discretionary early payoff made it unnecessary.
  const release=Math.min(reserve,Math.max(0,reserve-Math.max(0,sum(ac.map((v,i)=>Math.min(left[i],(v.bills[m+1]||0)+v.min)))-p.budget)));
  reserve-=release;
  rows.push({month:month(p.date,m),a,opening,interest,setAside,carryIn:carryIn+release,total:sum(a),fromBudget:sum(a)+setAside-carryIn-release});
 }
 return {ac,rows};
}
const num=v=>{const s=String(v??'').trim();if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(s))throw Error('กรอกยอดเป็นบาท ทศนิยมไม่เกิน 2 ตำแหน่ง');return Math.round(Number(s)*100);};
const read=(store,token)=>{
 const raw=store.getItem(snapshotKey);if(!raw&&!token?.startsWith('p2.'))return null;
 const s=raw?JSON.parse(raw):{token,entries:[]};const p=decode(s.token);
 if(!Array.isArray(s.entries)||!s.entries.every(e=>int(e.k,p.accounts.length-1)&&int(e.p)&&int(e.i)&&int(e.f)&&/^[\w-]+$/.test(e.id)&&Number.isFinite(Date.parse(e.at))))fail();
 const previous=readPayments(store),rates=readRates(store);if(previous.error||rates.error)throw Error(previous.error||rates.error);
 const {ac,rows}=forecast(p,previous.entries,rates.rates);
 const paid=ac.map((_,i)=>sum(s.entries.filter(e=>e.k===i&&!e.inBaseline).map(e=>e.p)));if(paid.some((v,i)=>v>ac[i].bal))fail();
 return {s,p,ac,rows,paid,old:previous.entries,saved:!!raw};
};
export function updateAction(action,store,d){
 try{const c=read(store,d.token);if(!c)fail();const {s,saved,ac,paid}=c;
  if(action==='activate'){if(saved&&s.token!==d.token)throw Error('มีแผนอื่นที่บันทึกอยู่แล้ว');if(saved)return '';}
  else if(!saved)fail();
  else if(action==='remove'){if(!s.entries.some(e=>e.id===d.id))fail();s.entries=s.entries.filter(e=>e.id!==d.id);}
  else if(action==='add'){
   if(String(d.creditor??'').trim()==='')throw Error('เลือกเจ้าหนี้ก่อนบันทึก');
   const k=Number(d.creditor),all=num(d.amount),i=num(d.interest||0),f=num(d.fee||0),p=all-i-f;
   if(!int(k,ac.length-1)||!all||p<0||p>ac[k].bal-paid[k])throw Error('ตรวจยอดจ่าย: ส่วนลดหนี้ต้องไม่เกินยอดคงเหลือ');
   if(i&&!ac[k].period)throw Error('ใช้ยอดงวดตามบิล ไม่ต้องแยกดอกเบี้ยซ้ำ');
   s.entries.push({id:crypto.randomUUID(),at:new Date().toISOString(),k,p,i,f});
  }else fail();
  store.setItem(snapshotKey,JSON.stringify(s));return '';
 }catch(e){return e.userMessage||e.message;}
}
export function updatedPage(store,token,editable){
 try{const c=read(store,token);return c?renderDebtCards(c,editable):null;}
 catch(err){return '<div class="panel" role="alert">'+esc(err.message)+'</div>';}
}
