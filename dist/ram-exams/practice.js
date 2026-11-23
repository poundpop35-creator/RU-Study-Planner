const el=id=>document.getElementById(id);
const course=new URL(location.href).searchParams.get('course');
async function openBank(){
 if(!/^POL(?:1101|2104|2106|2107|2200|2301|2303)$/.test(course))throw Error('กรุณากลับไปเลือกวิชา');
 const response=await fetch('./'+course+'.gz');
 if(!response.ok)throw Error('โหลดชุดข้อสอบไม่สำเร็จ');
 const bytes=new Uint8Array(await response.arrayBuffer());
 const body=bytes[0]===31?new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')):bytes;
 const bank=await new Response(body).json();
 el('title').textContent=course+' · '+bank.name;
 el('source').href='https://ram-test-hub.com/s/'+course+'/';
 const groups=new Map();
 for(const q of bank.items){
  if(!groups.has(q.set))groups.set(q.set,[]);
  groups.get(q.set).push(q);
 }
 for(const [key,list] of groups)el('sets').add(new Option((bank.sets[key]||key)+' · '+list.length+' ข้อ',key));
 let index=0;
 function show(){
  const list=groups.get(el('sets').value),q=list[index],key='ru:ram-test-hub:'+course+':'+q.id;
  el('question').textContent=q.q;el('number').max=list.length;el('number').value=index+1;
  el('count').textContent='ข้อ '+(index+1)+' / '+list.length;el('feedback').textContent='';
  el('prev').disabled=index===0;el('next').disabled=index===list.length-1;
  const buttons=q.o.map((option,i)=>{
   const b=document.createElement('button');b.className='choice';b.textContent=(i+1)+'. '+option;
   b.onclick=()=>{try{localStorage.setItem(key,String(i));}catch{el('status').textContent='เก็บคำตอบในเครื่องไม่สำเร็จ';}reveal(i);};return b;
  });
  function reveal(i){
   buttons.forEach((b,j)=>{b.disabled=true;b.classList.toggle('correct',j===q.a);b.classList.toggle('incorrect',j===i&&i!==q.a);});
   el('feedback').textContent=(i===q.a?'ถูกต้อง':'คำตอบที่ถูกคือ '+q.o[q.a])+'\n'+q.why;
  }
  el('options').replaceChildren(...buttons);
  try{const stored=localStorage.getItem(key);if(stored!==null&&buttons[Number(stored)])reveal(Number(stored));}catch{}
 }
 el('sets').onchange=()=>{index=0;show();};
 el('number').onchange=()=>{index=Math.min(groups.get(el('sets').value).length,Math.max(1,Math.trunc(Number(el('number').value))||1))-1;show();};
 el('prev').onclick=()=>{index--;show();};el('next').onclick=()=>{index++;show();};
 el('status').textContent=bank.items.length+' ข้อ · เก็บคำตอบชุดนี้ในเบราว์เซอร์นี้';show();el('panel').hidden=false;
}
openBank().catch(e=>{el('status').textContent=e.message;});
