// Updated from the user's 25 Oct 2569 note and monthly budget of 15,000 baht.
export const budget=15000;
export const creditors=[
 {key:'G',name:'G',balance:28083},
 {key:'AEON',name:'AEON',balance:25000},
 {key:'LINE',name:'LINE',balance:26000},
 {key:'ทอง',name:'ทอง',balance:46000},
 {key:'S',name:'S',balance:7900},
];
export const gInstallments=[8560,5993,4510,4510,4510];
const monthNames=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
// G keeps its fixed installments; remaining budget clears AEON, LINE, gold, then S as agreed.
// Principal only: the user funds interest separately from this monthly budget.
export function buildPlan(monthlyBudget=budget){
 if(!Number.isSafeInteger(monthlyBudget)||monthlyBudget<Math.max(...gInstallments))throw new Error('งบต้องไม่น้อยกว่างวด G สูงสุด');
 const remaining=Object.fromEntries(creditors.map(c=>[c.key,c.balance])),rows=[];
 for(let i=0;Object.values(remaining).some(v=>v>0);i++){
  if(i>=120)throw new Error('แผนยาวเกินช่วงที่รองรับ');
  const date=new Date(Date.UTC(2026,9+i,1));
  const month=monthNames[date.getUTCMonth()]+' '+(date.getUTCFullYear()+543);
  const payments=Object.fromEntries(creditors.map(c=>[c.key,0]));
  let available=monthlyBudget;
  payments.G=gInstallments[i]||0;remaining.G-=payments.G;available-=payments.G;
  for(const key of ['AEON','LINE','ทอง','S']){
   if(key==='S'&&['G','ทอง','LINE','AEON'].some(k=>remaining[k]>0))continue;
   // Non-final payments are whole thousands; only the closing payment has a remainder.
   payments[key]=remaining[key]<=available?remaining[key]:Math.floor(available/1000)*1000;
   remaining[key]-=payments[key];available-=payments[key];
  }
  rows.push({month,payments,total:monthlyBudget-available,unused:available,remaining:{...remaining}});
 }
 return rows;
}
export const plan=buildPlan();
export const months=plan.map(row=>row.month);
export const data=Object.fromEntries(plan.map(row=>[row.month,row.payments]));
// Keep incorrect legacy flags intact, but never apply them to revised installments.
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
 const total=months.reduce((sum,m)=>sum+monthTotal(m),0);
 const paidTotal=months.reduce((sum,m)=>sum+(paid[m]?monthTotal(m):0),0);
 return {total,paid:paidTotal,left:total-paidTotal,count:months.filter(m=>paid[m]).length,percent:Math.round(paidTotal/total*100),next:months.find(m=>!paid[m])};
}
export function setMonth(storage,month){
 if(!months.includes(month))return 'ไม่พบเดือนที่เลือก';
 const result=readPaid(storage);if(result.error)return result.error;
 const paid={...result.paid};if(paid[month])delete paid[month];else paid[month]=true;
 try{storage.setItem(STORE,JSON.stringify(paid));return '';}catch{return 'ยังบันทึกไม่ได้ กรุณาตรวจสิทธิ์หรือพื้นที่จัดเก็บในเบราว์เซอร์ แล้วลองอีกครั้ง';}
}
