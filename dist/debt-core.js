// Updated from the user's 25 Oct 2569 note and monthly budget of 15,000 baht.
export const budget=15000;
export const creditors=[
 {key:'G',name:'G',balance:28083},
 {key:'AEON',name:'AEON (2 บัญชี)',balance:25440.55},
 {key:'LINE',name:'LINE',balance:26000},
 {key:'ทอง',name:'ทอง',balance:46000},
 {key:'S',name:'S',balance:7900},
];
export const gInstallments=[8560,5993,4510,4510,4510];
const monthNames=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
export const monthlyMinimum=1000;
const priority=['AEON','LINE','ทอง','S'];
const round=n=>Math.round(n*100)/100;
// AEON's photographed bill: 378 + 827 = 1,205; reserve 2,000 to keep non-final targets in thousands.
export const minimumTargets={AEON:2000,LINE:1000,'ทอง':1000,S:1000};
// Reserve every active creditor's minimum before accelerating debts in priority order.
// Principal only: the user funds interest separately from this monthly budget.
export function buildPlan(monthlyBudget=budget){
 if(!Number.isSafeInteger(monthlyBudget)||monthlyBudget<Math.max(...gInstallments)+Object.values(minimumTargets).reduce((a,b)=>a+b,0))throw new Error('งบต้องพอจ่ายงวด G และขั้นต่ำทุกบัญชี รวมอย่างน้อย 13,560 บาท');
 const remaining={G:28083,aeonUpper:15115.44,aeonCard:10325.11,LINE:26000,'ทอง':46000,S:7900},rows=[];
 const accountPriority=['aeonUpper','aeonCard','LINE','ทอง','S'];
 for(let i=0;Object.values(remaining).some(v=>v>0);i++){
  if(i>=120)throw new Error('แผนยาวเกินช่วงที่รองรับ');
  const date=new Date(Date.UTC(2026,9+i,1));
  const month=monthNames[date.getUTCMonth()]+' '+(date.getUTCFullYear()+543);
  const amounts=Object.fromEntries(Object.keys(remaining).map(k=>[k,0]));
  let available=monthlyBudget;
  amounts.G=gInstallments[i]||0;remaining.G-=amounts.G;available-=amounts.G;
  for(const key of accountPriority){
   amounts[key]=Math.min(monthlyMinimum,remaining[key]);
   remaining[key]=round(remaining[key]-amounts[key]);available=round(available-amounts[key]);
  }
  for(const key of accountPriority){
   const extra=remaining[key]<=available?remaining[key]:Math.floor(available/1000)*1000;
   amounts[key]=round(amounts[key]+extra);remaining[key]=round(remaining[key]-extra);available=round(available-extra);
  }
  const payments={G:amounts.G,AEON:round(amounts.aeonUpper+amounts.aeonCard),LINE:amounts.LINE,'ทอง':amounts['ทอง'],S:amounts.S};
  rows.push({month,payments,aeonAllocation:{aeonUpper:amounts.aeonUpper,aeonCard:amounts.aeonCard},total:round(monthlyBudget-available),unused:available,remaining:{G:remaining.G,AEON:round(remaining.aeonUpper+remaining.aeonCard),LINE:remaining.LINE,'ทอง':remaining['ทอง'],S:remaining.S}});
 }
 return rows;
}
export const plan=buildPlan();
export const months=plan.map(row=>row.month);
export const data=Object.fromEntries(plan.map(row=>[row.month,row.payments]));
// Freeze the previous schedule so its saved flags retain the original creditor amounts.
// Existing ledger entries are actual payments and must never be rewritten when targets change.
export const legacyData=Object.fromEntries([
 [8560,6000,0,0,0],[5993,9000,0,0,0],[4510,10000,0,0,0],
 [4510,0,10000,0,0],[4510,0,10000,0,0],[0,0,6000,9000,0],
 [0,0,0,15000,0],[0,0,0,15000,0],[0,0,0,7000,7900]
].map((amounts,i)=>[months[i],Object.fromEntries(creditors.map((c,j)=>[c.key,amounts[j]]))]));
// Keep incorrect original flags intact; this key belongs only to the previous corrected plan.
export const STORE='debtPlanPaid_20261025_budget15000_v2';
export function readPaid(storage){
 try{
  const raw=storage.getItem(STORE),value=raw?JSON.parse(raw):{};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([k,v])=>!months.includes(k)||typeof v!=='boolean'))throw Error('invalid');
  return {paid:Object.fromEntries(months.filter(m=>value[m]===true).map(m=>[m,true])),error:''};
 }catch{return {paid:{},error:'อ่านข้อมูลการจ่ายในเครื่องไม่ได้ จึงยังไม่แสดงยอดที่จ่ายแล้วและไม่เขียนทับข้อมูลเดิม กรุณาเปิดผ่านเบราว์เซอร์เดิมหรือตรวจสิทธิ์การจัดเก็บข้อมูล'};}
}
export const monthTotal=m=>creditors.reduce((sum,c)=>sum+data[m][c.key],0);
export function summary(paid){
 const total=round(Object.values(legacyData).reduce((sum,row)=>sum+Object.values(row).reduce((a,b)=>a+b,0),0));
 const paidTotal=months.reduce((sum,m)=>sum+(paid[m]?Object.values(legacyData[m]).reduce((a,b)=>a+b,0):0),0);
 return {total,paid:paidTotal,left:round(total-paidTotal),count:months.filter(m=>paid[m]).length,percent:Math.round(paidTotal/total*100),next:months.find(m=>!paid[m])};
}
export function setMonth(storage,month){
 if(!months.includes(month))return 'ไม่พบเดือนที่เลือก';
 const result=readPaid(storage);if(result.error)return result.error;
 const paid={...result.paid};if(paid[month])delete paid[month];else paid[month]=true;
 try{storage.setItem(STORE,JSON.stringify(paid));return '';}catch{return 'ยังบันทึกไม่ได้ กรุณาตรวจสิทธิ์หรือพื้นที่จัดเก็บในเบราว์เซอร์ แล้วลองอีกครั้ง';}
}
