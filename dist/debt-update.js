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
  if(!Array.isArray(v)||v.length!==11)fail();
  const [label,group,bal,min,bills,carry,old,rate,period,storedRate,day]=v;
  if(!str(label,80)||!label||!str(group,80)||!int(bal)||!int(min)||!Array.isArray(bills)||bills.length>120||!bills.every(x=>int(x))||!int(carry)||carry+sum(bills)>bal||(!min&&carry+sum(bills)!==bal)||!str(old,60)||!int(rate,10000)||!['','y','m'].includes(period)||!str(storedRate,40)||!int(day,31))fail();
  return {label,group,bal,min,bills,carry,old,rate:rate/100,period,storedRate,day};
 });
 return {date,budget,unit,accounts,note};
}
const month=(d,i)=>new Intl.DateTimeFormat('th-TH',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7)-1+i,1)));
export function forecast(p,old,rates){
 const ac=p.accounts.map(a=>{let credit=sum(old.filter(e=>a.old&&e.creditor===a.old).map(e=>e.amountCents));const paid=Math.min(a.bal,credit);
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
 const paid=ac.map((_,i)=>sum(s.entries.filter(e=>e.k===i).map(e=>e.p)));if(paid.some((v,i)=>v>ac[i].bal))fail();
 return {s,p,ac,rows,paid,old:previous.entries,saved:!!raw};
};
export function updateAction(action,store,d){
 try{const c=read(store,d.token);if(!c)fail();const {s,saved,ac,paid}=c;
  if(action==='activate'){if(saved&&s.token!==d.token)throw Error('มีแผนอื่นที่บันทึกอยู่แล้ว');if(saved)return '';}
  else if(!saved)fail();
  else if(action==='remove'){if(!s.entries.some(e=>e.id===d.id))fail();s.entries=s.entries.filter(e=>e.id!==d.id);}
  else if(action==='add'){
   const k=Number(d.creditor),all=num(d.amount),i=num(d.interest||0),f=num(d.fee||0),p=all-i-f;
   if(!int(k,ac.length-1)||!all||p<0||p>ac[k].bal-paid[k])throw Error('ตรวจยอดจ่าย: ส่วนลดหนี้ต้องไม่เกินยอดคงเหลือ');
   if(i&&!ac[k].period)throw Error('ใช้ยอดงวดตามบิล ไม่ต้องแยกดอกเบี้ยซ้ำ');
   s.entries.push({id:crypto.randomUUID(),at:new Date().toISOString(),k,p,i,f});
  }else fail();
  store.setItem(snapshotKey,JSON.stringify(s));return '';
 }catch(e){return e.userMessage||e.message;}
}
export function updatedPage(store,token,editable){
 try{const c=read(store,token);if(!c)return null;
 const {p,s,ac,rows,paid,old,saved}=c,credit=[...paid],groups=new Map();
 ac.forEach((v,i)=>groups.set(v.group||v.label,(groups.get(v.group||v.label)||0)+v.bal-paid[i]));
 const once=ac.map((v,i)=>({v,i,when:v.bills.findIndex(n=>n>0)})).filter(({v,i,when})=>when>=0&&!v.min&&!v.carry&&v.bills.filter(n=>n>0).length===1&&v.bal>paid[i]);
 const onceBox=once.length?'<section class="notice"><strong>จ่ายครั้งเดียว</strong>'+once.map(({v,i,when})=>'<p><b>'+esc(v.label)+' · '+fmt(v.bal-paid[i])+' บาท</b> · '+month(p.date,when)+(v.day?' วันที่ '+v.day:' (วันจริงตามบิล)')+'</p>').join('')+'</section>':'';
 const schedule=rows.map(r=>({...r,items:r.a.map((v,i)=>{const used=Math.min(v,credit[i]);credit[i]-=used;return v?'<li>'+esc(ac[i].label)+(ac[i].day?' · วันที่ '+ac[i].day:'')+' <b>'+fmt(v-used)+'</b> บาท'+(used?' (เป้า '+fmt(v)+')':'')+'</li>':''}).join(''),covered:0}));
 const result='<div class="debt-page"><header class="debt-bar"><div><h1>แผนจัดการหนี้</h1><p>งบเดือนละ '+fmt(p.budget)+' บาท · ปรับยอด '+esc(p.date)+'</p></div></header>'+
 (!saved?'<section class="panel"><h2>ใช้ยอดใหม่กับพื้นที่เรียนนี้</h2><p>บันทึกครั้งเดียว ครั้งต่อไปเปิดจากเมนูแผนจัดการหนี้ได้เลย</p><button class="button primary" data-action="debt-activate" '+(editable?'':'disabled')+'>'+(editable?'ใช้แผนนี้':'กำลังเชื่อมต่อพื้นที่เรียน…')+'</button></section>':'')+
 onceBox+'<section class="debt-hero"><div><h2>หนี้คงเหลือ</h2><b class="debt-balance">'+fmt(sum([...groups.values()]))+' บาท</b></div></section>'+
 '<section class="panel"><h2>ยอดแยกตามเจ้าหนี้</h2><ul>'+[...groups].map(([k,v])=>'<li><b>'+esc(k)+'</b> · '+fmt(v)+' บาท</li>').join('')+'</ul><p>'+esc(p.note)+'</p></section>'+
 '<section class="panel"><h2>ตารางจ่ายรายเดือน</h2><p>ยอดบรรทัดแรกคือเงินที่ใช้จากงบเดือนนั้น แตะเดือนเพื่อดูงวดของแต่ละเจ้า</p>'+schedule.map((r,i)=>'<details '+(i===0?'open':'')+'><summary><b>'+r.month+' · '+fmt(r.fromBudget)+' บาท</b></summary><ul>'+r.items+'</ul><p>จ่ายตามแผน '+fmt(r.total)+(r.setAside?' · กันไว้เดือนหน้า '+fmt(r.setAside):'')+(r.carryIn?' · ใช้เงินที่กันไว้ '+fmt(r.carryIn):'')+' บาท</p><p>ดอกเบี้ยประมาณ '+fmt(r.interest)+' บาทนอกงบ · รวมเตรียม '+fmt(r.fromBudget+r.interest)+' บาท</p></details>').join('')+'<p>ดอกเบี้ยประมาณรอบละ 30 วัน: '+ac.filter(v=>v.period).map(v=>esc(v.label)+' '+v.rate+'% ต่อ'+(v.period==='m'?'เดือน':'ปี')).join(' · ')+'</p></section>'+
 (saved?'<section class="panel"><h2>บันทึกการจ่าย</h2><form id="debt-payment-form"><label>รายการ <select id="debt-creditor">'+ac.map((v,i)=>'<option value="'+i+'">'+esc(v.label)+'</option>').join('')+'</select></label><p><label>ยอดที่จ่ายทั้งหมด (บาท) <input id="debt-payment-amount" type="number" min=".01" step=".01" required></label></p><p><label>ในยอดนี้เป็นดอกเบี้ย <input id="debt-payment-interest" type="number" min="0" step=".01"></label> <label>ค่าธรรมเนียม/ประกัน <input id="debt-payment-fee" type="number" min="0" step=".01"></label></p><button class="button primary">บันทึกยอดจ่าย</button><p id="debt-payment-error" role="alert" hidden></p></form></section>':'')+
 '<details class="panel" id="debt-history"><summary>ประวัติการจ่าย ('+(s.entries.length+old.length)+')</summary><ul>'+s.entries.slice().reverse().map(e=>'<li>'+esc(new Date(e.at).toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok'}))+' · '+esc(ac[e.k].label)+' · '+fmt(e.p+e.i+e.f)+' บาท <button data-action="debt-remove" data-id="'+esc(e.id)+'">ลบ</button></li>').join('')+old.slice().reverse().map(e=>'<li>แผนเดิม · '+esc(e.creditor)+' · '+fmt(e.amountCents+(e.interestCents||0)+(e.feeCents||0))+' บาท</li>').join('')+'</ul></details></div>';
 return result;
 }catch(e){return '<div class="panel" role="alert">'+esc(e.message)+'</div>';}
}
