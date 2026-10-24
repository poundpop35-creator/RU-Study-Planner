export const months = ['ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.','ม.ค.','ก.พ.','มี.ค.'];
export const creditors = [
  {key:'S',        name:'S',        cvar:'--c-S'},
  {key:'G',        name:'G',        cvar:'--c-G'},
  {key:'YourCash', name:'YourCash', cvar:'--c-Y'},
  {key:'LINE BK',  name:'LINE BK',  cvar:'--c-L'},
  {key:'AEON',     name:'AEON',     cvar:'--c-A'},
];
// จำนวนเงินที่ต้องจ่ายต่อเดือน (0 = ไม่ต้องจ่าย)
export const data = {
  'ส.ค.':{S:4231,G:4046,YourCash:400, 'LINE BK':1000,AEON:700},
  'ก.ย.':{S:4084,G:4046,YourCash:400, 'LINE BK':1000,AEON:700},
  'ต.ค.':{S:0,   G:4046,YourCash:4254,'LINE BK':1000,AEON:700},
  'พ.ย.':{S:0,   G:1483,YourCash:6817,'LINE BK':1000,AEON:700},
  'ธ.ค.':{S:0,   G:0,   YourCash:3776,'LINE BK':5524,AEON:700},
  'ม.ค.':{S:0,   G:0,   YourCash:0,   'LINE BK':9300,AEON:700},
  'ก.พ.':{S:0,   G:0,   YourCash:0,   'LINE BK':9300,AEON:700},
  'มี.ค.':{S:0,  G:0,   YourCash:0,   'LINE BK':1368,AEON:2875},
};


export const STORE='debtPlanPaid_v1';
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
