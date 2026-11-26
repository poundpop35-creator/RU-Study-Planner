import {pol2200SourcePanel} from './pol2200-sources.js?v=20261126';
import {accepts,answerKey,parsedAnswer,scoreSet} from './score.js?v=20261123-multikey';

const el=id=>document.getElementById(id);
const course=new URL(location.href).searchParams.get('course');
const external=pol2200SourcePanel(course);if(external){el('status').insertAdjacentHTML('beforebegin',external);if(location.hash==='#pol2200-external-sources')document.getElementById('pol2200-external-sources').open=true;}
const answers=new Map();
let groups=new Map(),setNames={},index=0,bank=null,storageWarning=false;
const currentList=()=>groups.get(el('sets').value)||[];
const setTitle=()=>setNames[el('sets').value]||el('sets').selectedOptions[0]?.textContent||'ชุดปัจจุบัน';
const percent=(value,total)=>total?Math.round(value/total*100):0;

function getAnswer(q){
 const key=answerKey(course,q.id);
 if(answers.has(key))return answers.get(key);
 let parsed=null;
 try{parsed=parsedAnswer(localStorage.getItem(key),q.o.length);}
 catch{storageWarning=true;}
 if(parsed!==null)answers.set(key,parsed);
 return parsed;
}
function setAnswer(q,value){
 const key=answerKey(course,q.id);
 answers.set(key,value);
 try{localStorage.setItem(key,String(value));}
 catch{storageWarning=true;}
}
function tally(){return scoreSet(currentList(),getAnswer);}
function updateOverview(){
 const result=tally();
 el('stat-answered').textContent=result.answered+'/'+result.total;
 el('stat-correct').textContent=result.correct;
 el('stat-wrong').textContent=result.wrong;
 el('stat-pending').textContent=result.pending;
 el('progress').value=percent(result.answered,result.total);
 el('progress-label').textContent=percent(result.answered,result.total)+'%';
 el('status').textContent=storageWarning
  ?'มีปัญหาการบันทึกบนเครื่องนี้ · คำตอบยังอยู่ระหว่างที่เปิดหน้านี้ แต่ควรตรวจพื้นที่เก็บข้อมูลของ Safari'
  :bank.items.length+' ข้อจากคลัง · ทำทีละชุด · คำตอบเก็บในเบราว์เซอร์เครื่องนี้';
}
function reveal(q,choice,buttons){
 const graded=Number.isInteger(q.a)&&q.a>=0&&q.a<q.o.length;
 buttons.forEach((button,i)=>{
  button.disabled=true;
  button.classList.toggle('correct',graded&&accepts(q,i));
  button.classList.toggle('incorrect',graded&&i===choice&&!accepts(q,choice));
  button.classList.toggle('picked',!graded&&i===choice);
  button.setAttribute('aria-pressed',String(i===choice));
 });
 el('feedback').hidden=false;
 el('feedback').classList.toggle('is-wrong',graded&&!accepts(q,choice));
 el('feedback-title').textContent=!graded?'ข้อนี้ยังไม่มีเฉลย':accepts(q,choice)?'✓ ถูกต้อง!':'✗ ยังไม่ถูกต้อง';
 el('feedback-answer').textContent=!graded?'คำตอบข้อนี้ยังไม่นับคะแนน':
  accepts(q,choice)?'คุณตอบข้อ '+(choice+1)+' ได้ถูกต้อง':'คำตอบที่ถูกคือข้อ '+(q.a+1)+' · '+q.o[q.a];
 el('feedback-why').textContent=String(q.why||'ไม่มีคำอธิบายเพิ่มเติม');
}
function showQuestion(){
 const list=currentList();
 if(!list.length)return;
 index=Math.min(Math.max(index,0),list.length-1);
 const q=list[index],choice=getAnswer(q);
 el('results').hidden=true;
 el('exercise').hidden=false;
 el('number').max=list.length;
 el('number').value=index+1;
 el('count').textContent='ข้อ '+(index+1)+' / '+list.length;
 el('question').textContent=q.q;
 el('feedback').hidden=true;
 el('prev').disabled=index===0;
 el('next').textContent=index===list.length-1?'ดูผลคะแนนชุดนี้ →':'ข้อถัดไป →';
 const buttons=q.o.map((option,i)=>{
  const button=document.createElement('button');
  button.type='button';
  button.className='choice';
  button.setAttribute('aria-pressed','false');
  const badge=document.createElement('span');
  badge.textContent=String(i+1);
  button.append(badge,document.createTextNode(String(option)));
  button.onclick=()=>{
   if(getAnswer(q)!==null)return;
   setAnswer(q,i);
   reveal(q,i,buttons);
   updateOverview();
  };
  return button;
 });
 el('options').replaceChildren(...buttons);
 if(choice!==null)reveal(q,choice,buttons);
 updateOverview();
}
function displayReview(items){
 const list=el('review-list');
 list.replaceChildren();
 if(!items.length){
  const note=document.createElement('p');
  note.className='ram-empty-review';
  note.textContent=tally().complete?'เยี่ยมมาก! ไม่มีข้อที่ตอบผิดในชุดนี้':'ยังไม่มีข้อผิด · ทำข้อที่เหลือให้ครบเพื่อดูผลทั้งหมด';
  list.append(note);
  return;
 }
 for(const [position,q] of items){
  const answer=getAnswer(q),button=document.createElement('button');
  button.type='button';
  button.className='ram-review-row';
  const title=document.createElement('span');
  title.textContent='ข้อ '+(position+1)+' · '+String(q.q);
  const detail=document.createElement('small');
  detail.textContent=answer===null?'ยังไม่ตอบ':'ตอบผิด';
  button.append(title,detail);
  button.onclick=()=>{index=position;showQuestion();el('question').scrollIntoView({block:'center',behavior:'smooth'});};
  list.append(button);
 }
}
function showResults(){
 const list=currentList(),data=tally();
 el('exercise').hidden=true;
 el('results').hidden=false;
 el('results-title').textContent='ผลคะแนน · '+setTitle();
 el('results-subtitle').textContent=data.complete
  ?'ทำครบ '+data.total+' ข้อแล้ว · ตรวจคำตอบและทบทวนข้อที่ผิดได้ด้านล่าง'
  :'ยังเหลืออีก '+data.pending+' ข้อ · นี่คือคะแนนปัจจุบัน กลับไปทำต่อได้';
 el('final-percent').textContent=data.percent+'%';
 el('final-score').textContent=data.correct+'/'+data.gradable;
 el('final-wrong').textContent=data.wrong;
 el('final-pending').textContent=data.pending;
 el('final-answered').textContent=data.answered;
 el('score-ring').style.setProperty('--score',data.percent+'%');
 el('score-ring').setAttribute('aria-label','ตอบถูก '+data.correct+' จาก '+data.gradable+' ข้อที่นับคะแนน คิดเป็น '+data.percent+'%');
 const missed=list.map((q,i)=>[i,q]).filter(([,q])=>!accepts(q,getAnswer(q))||getAnswer(q)===null);
 el('review-heading').textContent=missed.length?'ข้อที่ตอบผิดหรือยังไม่ได้ทำ · '+missed.length+' ข้อ':'ตอบถูกครบทุกข้อ 🎉';
 displayReview(missed);
 updateOverview();
 el('results').scrollIntoView({block:'start',behavior:'smooth'});
}
function resetCurrentSet(){
 const list=currentList();
 if(!confirm('ลบคำตอบที่บันทึกไว้สำหรับ '+setTitle()+' ทั้ง '+list.length+' ข้อ แล้วเริ่มทำใหม่ใช่ไหม?'))return;
 for(const q of list){
  const key=answerKey(course,q.id);
  answers.delete(key);
  try{localStorage.removeItem(key);}catch{storageWarning=true;}
 }
 index=0;
 showQuestion();
 el('question').scrollIntoView({block:'start',behavior:'smooth'});
}
async function openBank(){
 if(course!=='PALAD'&&!/^POL(?:1101|2104|2106|2107|2200|2301|2303)$/.test(course))
  throw Error('ไม่พบรายวิชานี้ กรุณากลับไปเลือกวิชาฝึกสอบ');
 const response=await fetch(course==='PALAD'?'./PALAD.json':'./'+course+'.gz');
 if(!response.ok)throw Error('โหลดชุดข้อสอบไม่สำเร็จ');
 const bytes=new Uint8Array(await response.arrayBuffer());
 const body=bytes[0]===31?new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')):bytes;
 const parsed=await new Response(body).json();
 if(course==='PALAD'){
  el('title').textContent='ติวสอบปลัด';
  el('source').parentElement.textContent='เป้าหมายการฝึก · ปี 2571';
  if(Array.isArray(parsed?.items)&&parsed.items.length===0){
   el('status').textContent='ยังไม่มีชุดข้อสอบ · รอเพิ่มข้อสอบชุดแรก';return;
  }
 }
 if(!parsed||!Array.isArray(parsed.items)||!parsed.items.length||!parsed.sets||typeof parsed.sets!=='object')
  throw Error('ไฟล์ชุดข้อสอบไม่สมบูรณ์');
 for(const q of parsed.items){
  if(typeof q.id!=='string'&&typeof q.id!=='number')throw Error('รหัสคำถามไม่ถูกต้อง');
  if(!Array.isArray(q.o)||q.o.length<2||!q.o.every(x=>typeof x==='string')||typeof q.q!=='string')
   throw Error('เนื้อหาคำถามไม่ถูกต้อง');
  if(!Number.isInteger(q.a)||q.a<0||q.a>=q.o.length)throw Error('เฉลยในชุดข้อสอบไม่ถูกต้อง');
  const key=String(q.set);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(q);
 }
 bank=parsed;
 setNames=parsed.sets;
 if(course!=='PALAD')el('title').textContent=course+' · '+String(parsed.name||'ฝึกทำข้อสอบ');
 if(course!=='PALAD')el('source').href='https://ram-test-hub.com/s/'+course+'/';
 el('sets').replaceChildren(...[...groups].map(([key,list])=>
  new Option(String(setNames[key]||key)+' · '+list.length+' ข้อ',key)));
 el('sets').onchange=()=>{index=0;showQuestion();};
 el('number').onchange=()=>{
  const n=Math.trunc(Number(el('number').value));
  index=Number.isFinite(n)?Math.min(currentList().length,Math.max(1,n))-1:0;
  showQuestion();
 };
 el('prev').onclick=()=>{if(index>0){index--;showQuestion();}};
 el('next').onclick=()=>{if(index===currentList().length-1)showResults();else{index++;showQuestion();}};
 el('finish').onclick=showResults;
 el('back-to-questions').onclick=()=>showQuestion();
 el('review-wrong').onclick=()=>{
  const list=currentList(),wrong=list.findIndex(q=>getAnswer(q)!==null&&!accepts(q,getAnswer(q)));
  const pending=list.findIndex(q=>getAnswer(q)===null);
  index=wrong>=0?wrong:pending>=0?pending:0;
  showQuestion();
 };
 el('reset-set').onclick=resetCurrentSet;
 el('lab').hidden=false;
 showQuestion();
}
openBank().catch(error=>{
 el('status').classList.add('is-error');
 el('status').textContent=error?.message||'เปิดชุดข้อสอบไม่สำเร็จ';
});
