import {renderDebtCards} from './debt-cards.js?v=20261125-surplus';
// Portfolio details arrive from the private workspace or an import link's fragment.
// No personal plans, balances, lender names, or installment amounts belong in this module.
import {readPayments} from './debt-payments.js?v=20261027c';
// Actual interest is provided by the user when recording a payment; never forecast interest.
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
  const dueMonthOffset=meta?.dueMonthOffset;
  if(dueMonthOffset!==undefined&&!int(dueMonthOffset,1))fail();
  return {dueMonthOffset,label,group,bal,min,bills,carry,old,rate:rate/100,period,storedRate,day,parts,after};
 });
 const baseBudget=items[0][11]?.baseBudget||budget;
 if(!int(baseBudget)||!baseBudget||baseBudget>budget)fail();
 const payWindow=items[0][11]?.payWindow;
 if(payWindow&&(!Array.isArray(payWindow)||payWindow.length!==2||!payWindow.every(n=>int(n,31)&&n>0)||payWindow[0]>payWindow[1]))fail();
 return {date,budget,baseBudget,unit,accounts,note,payWindow};
}
const month=(d,i)=>new Intl.DateTimeFormat('th-TH',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7)-1+i,1)));
function earlyInstallments(ac,m,start,left){
 return ac.flatMap((v,i)=>{
  let bill=Math.min(left[i],v.bills[m]||0);if(!bill)return [];
  const pieces=v.parts.length?v.parts.map(([label,day,ns])=>({label:v.label+' · '+label,day,n:ns[m]||0})):
   [{label:v.label,day:v.day,n:bill}];
  return pieces.filter(x=>x.day>0&&x.day<start&&x.n>0).sort((a,b)=>a.day-b.day).map(x=>{const n=Math.min(bill,x.n);bill-=n;return {...x,n};}).filter(x=>x.n);
 }).sort((a,b)=>a.day-b.day);
}

const roundCash=c=>Math.ceil(c/100)*100;
// Required installments are minimums, not maximums (except G). Use available
// current-month cash in 100-baht steps; reserve only genuine unspent cash.
function forecastMinimumsWithRollover(p,accounts){
 const left=accounts.map(x=>x.bal),arrears=accounts.map(()=>0),rows=[];
 const bills=accounts.map(x=>[...x.bills]);
 const fixedG=v=>String(v.group||v.label).trim().toUpperCase()==='G';
 const priority=accounts.map((_,i)=>i).filter(i=>!fixedG(accounts[i])).sort((i,j)=>Number(!accounts[i].min)-Number(!accounts[j].min)||i-j);
 let reserve=0;
 for(let m=0;sum(left)>0;m++){
  if(m>=240)fail();
  const opening=[...left],a=accounts.map(()=>0),carryIn=reserve;
  const dues=accounts.map((v,i)=>Math.min(left[i],arrears[i]+(bills[i][m]||0)+v.min));
  const neededCash=sum(dues.map(roundCash));
  const emergency=Math.min(Math.max(0,p.budget-p.baseBudget),Math.max(0,neededCash-p.baseBudget-carryIn));
  const deposit=p.baseBudget+emergency;
  const cap=Math.min(p.budget,deposit+carryIn);
  let cashOut=0,shortfall=0;
  accounts.forEach((v,i)=>{
   const due=dues[i],cash=roundCash(due);
   if(!due){arrears[i]=0;return;}
   if(cashOut+cash>cap){arrears[i]=due;shortfall+=cash;return;}
   a[i]=due;left[i]-=due;arrears[i]=0;cashOut+=cash;
  });
  const extra=accounts.map(()=>0);
  // Use the normal budget, including genuine prior cash, but do not use
  // emergency borrowing for discretionary top-ups.
  let available=Math.max(0,Math.min(cap,p.baseBudget+carryIn)-cashOut);
  if(!shortfall)for(const i of priority){
   if(available<10000||!left[i])continue;
   const chunks=Math.floor(available/10000)*10000;
   const pay=Math.min(left[i],chunks),cash=roundCash(pay);
   if(!pay||cash>available)continue;
   // Credit prepaid fixed installments oldest first; no double counting.
   const future=sum(bills[i].slice(m+1));
   let credit=Math.max(0,pay-Math.max(0,left[i]-future));
   for(let j=m+1;j<bills[i].length&&credit;j++){
    const used=Math.min(credit,bills[i][j]);bills[i][j]-=used;credit-=used;
   }
   a[i]+=pay;extra[i]+=pay;left[i]-=pay;cashOut+=cash;available-=cash;
  }
  reserve=carryIn+deposit-cashOut;
  rows.push({month:month(p.date,m),a,opening,interest:0,early:[],shortfall,
   cashCeiling:cap,setAside:reserve,carryOut:reserve,carryIn,extra,total:sum(a),
   transferTotal:cashOut,fromBudget:cashOut-Math.min(carryIn,cashOut),emergency});
 }
 return {ac:accounts,rows};
}

export function forecast(p,old,_rates={}){
 const ac=p.accounts.map(a=>{let credit=sum(old.filter(e=>a.old&&e.creditor===a.old&&(!a.after||Date.parse(e.at)>Date.parse(a.after))).map(e=>e.amountCents));const paid=Math.min(a.bal,credit);
  const use=v=>{const used=Math.min(v,credit);credit-=used;return v-used;};
  return {...a,bal:a.bal-paid,carry:use(a.carry),bills:a.bills.map(use)};
 });
 // The personal plan with a 25th-of-month payment day uses minimums + cash rollover.
 // Older imported plans retain the legacy model for compatibility.
 if(p.baseBudget<p.budget&&p.payWindow?.[0]===25&&p.payWindow?.[1]===25)
  return forecastMinimumsWithRollover(p,ac);
 const left=ac.map(a=>a.bal),rows=[];let reserve=0;
 for(let m=0;sum(left)>0;m++){
  if(m>=240)fail();const opening=[...left],a=ac.map(()=>0);
  const interest=0; // No estimated interest: users enter their actual amount on each receipt.
  const mandatory=sum(ac.map((v,i)=>Math.min(left[i],(v.bills[m]||0)+v.min)));
  const roundingBuffer=p.baseBudget<p.budget?ac.length*100:0; // preserve legacy plan's exact original budget
  const cashCeiling=Math.min(p.budget,Math.max(p.baseBudget||p.budget,mandatory+interest+roundingBuffer));
  let free=cashCeiling-interest-roundingBuffer;
  const put=(i,n)=>{const pay=Math.max(0,Math.min(left[i],n));left[i]-=pay;a[i]+=pay;free-=pay;return pay;};
  ac.forEach((v,i)=>put(i,(v.bills[m]||0)+v.min));
  const carryIn=p.payWindow?Math.min(reserve,sum(a)):Math.min(reserve,Math.max(0,-free));reserve-=carryIn;free+=carryIn;
  const needed=sum(ac.map((v,i)=>Math.min(left[i],(v.bills[m+1]||0)+v.min)));
  const early=p.payWindow?earlyInstallments(ac,m+1,p.payWindow[0],left):[];
  const reserveGoal=Math.max(sum(early.map(x=>x.n)),needed-p.budget,0);
  const setAside=Math.min(Math.max(0,free),Math.max(0,reserveGoal-reserve));reserve+=setAside;free-=setAside;
  ac.forEach((v,i)=>{v.carry-=put(i,Math.min(Math.max(0,free),v.carry));});
  ac.forEach((v,i)=>{if(v.min)put(i,left[i]<=free?left[i]:Math.floor(free/p.unit)*p.unit);});
  // Return unused reserve if a discretionary early payoff made it unnecessary.
  const release=p.payWindow?0:Math.min(reserve,Math.max(0,reserve-Math.max(0,sum(ac.map((v,i)=>Math.min(left[i],(v.bills[m+1]||0)+v.min)))-p.budget)));
  reserve-=release;
  rows.push({month:month(p.date,m),a,opening,interest,cashCeiling,early,shortfall:Math.max(0,reserveGoal-reserve),setAside,carryIn:carryIn+release,total:sum(a),fromBudget:sum(a)+setAside-carryIn-release});
 }
 return {ac,rows};
}
const num=v=>{const s=String(v??'').trim();if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(s))throw Error('กรอกยอดเป็นบาท ทศนิยมไม่เกิน 2 ตำแหน่ง');return Math.round(Number(s)*100);};
const read=(store,token)=>{
 const raw=store.getItem(snapshotKey);if(!raw&&!token?.startsWith('p2.'))return null;
 const s=raw?JSON.parse(raw):{token,entries:[]};const p=decode(s.token);
 if(!Array.isArray(s.entries)||!s.entries.every(e=>int(e.k,p.accounts.length-1)&&int(e.p)&&int(e.i)&&int(e.f)&&/^[\w-]+$/.test(e.id)&&Number.isFinite(Date.parse(e.at))))fail();
 const previous=readPayments(store);if(previous.error)throw Error(previous.error);
 const {ac,rows}=forecast(p,previous.entries);
 const paid=ac.map((_,i)=>sum(s.entries.filter(e=>e.k===i&&!e.inBaseline).map(e=>e.p)));if(paid.some((v,i)=>v>ac[i].bal))fail();
 return {s,p,ac,rows,paid,old:previous.entries,saved:!!raw};
};
export function firstUnpaidDue(rows,paid,k){
 let credit=paid[k]||0;
 for(let m=0;m<rows.length;m++){const target=rows[m].a[k]||0,done=Math.min(target,credit);credit-=done;if(target>done)return {m,target,done,left:target-done};}
 return null;
}
export function updateAction(action,store,d){
 try{const c=read(store,d.token);if(!c)fail();const {s,saved,ac,paid,rows}=c;
  if(action==='activate'){if(saved&&s.token!==d.token)throw Error('มีแผนอื่นที่บันทึกอยู่แล้ว');if(saved)return '';}
  else if(!saved)fail();
  else if(action==='remove'){if(!s.entries.some(e=>e.id===d.id))fail();s.entries=s.entries.filter(e=>e.id!==d.id);}
  else if(action==='full'){
   const k=Number(d.creditor),m=Number(d.month);
   if(!int(k,ac.length-1)||!int(m,rows.length-1)||ac[k].period)throw Error('กรุณาบันทึกยอดโอนและดอกเบี้ยจริงในแบบฟอร์ม');
   const due=firstUnpaidDue(rows,paid,k);
   if(!due||due.m!==m||String(d.cents)!==String(due.left))throw Error('ยอดงวดเปลี่ยนแล้ว กรุณาตรวจยอดใหม่ก่อนบันทึก');
   s.entries.push({id:crypto.randomUUID(),at:new Date().toISOString(),k,p:due.left,i:0,f:0});
  }
  else if(action==='add'){
   if(String(d.creditor??'').trim()==='')throw Error('เลือกเจ้าหนี้ก่อนบันทึก');
   const k=Number(d.creditor),all=num(d.amount),i=num(d.interest||0),f=0,p=all-i;
   if(!int(k,ac.length-1)||!all||p<0||p>ac[k].bal-paid[k])throw Error('ตรวจยอดจ่าย: ส่วนลดหนี้ต้องไม่เกินยอดคงเหลือ');
   if(d.month!==undefined&&d.month!==''&&firstUnpaidDue(rows,paid,k)?.m!==Number(d.month))throw Error('กรุณาเลือกงวดแรกที่ยังค้างของเจ้าหนี้นี้');
   if(i&&!ac[k].period)throw Error('รายการนี้เป็นยอดผ่อนตามบิลแล้ว ไม่ต้องคิดดอกเบี้ยซ้ำ');
   s.entries.push({id:crypto.randomUUID(),at:new Date().toISOString(),k,p,i,f});
  }else fail();
  store.setItem(snapshotKey,JSON.stringify(s));return '';
 }catch(e){return e.userMessage||e.message;}
}
export function updatedPage(store,token,editable){
 try{const c=read(store,token);return c?renderDebtCards(c,editable):null;}
 catch(err){return '<div class="panel" role="alert">'+esc(err.message)+'</div>';}
}
