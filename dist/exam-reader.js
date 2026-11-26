import {scrollQuestion} from './quiz-scroll.js?v=20261126-shared';
import {loadBank,sharedAnswers} from "./pol2106-sync.js";
export function examReader(){
 return `<section class="exam-reader" id="exam-reader">
 <a class="back-link" href="#practice">← เลือกวิชาฝึกสอบ</a>
 <header class="reader-heading"><span class="cc-code">POL2106</span><h1>ปรัชญาการเมืองเบื้องต้น</h1><p>ข้อสอบเก่า · 7 ชุด · 700 ข้อ</p></header>
 <p class="reader-status" role="status" id="cloud">กำลังโหลดข้อสอบ…</p><button class="button secondary" id="retry" hidden>ลองเชื่อมต่ออีกครั้ง</button>
 <div id="lab" hidden><div class="panel reader-filters"><label>ชุดข้อสอบ<select id="sets"></select></label><label>ไปยังข้อ<select id="num"></select></label></div>
 <article class="panel reader-question"><div class="reader-meta"><strong id="counter"></strong><small id="meta"></small></div>
 <h2 id="stem" tabindex="-1"></h2><div id="choices" class="choices"></div>
 <section id="feedback" hidden aria-live="polite"><strong id="result"></strong><p id="note"></p><details><summary>ดูคำอธิบายจากเอกสารเดิม</summary><p id="why"></p></details></section>
 <div class="reader-navigation"><button class="button secondary" id="prev">← ก่อนหน้า</button><button class="button primary" id="next">ถัดไป →</button></div></article>
 <section class="panel reader-review"><p id="score"></p><button class="button secondary" id="random">สุ่มข้อที่ยังไม่ตอบ</button> <button class="button secondary" id="wrong">ทบทวนข้อที่ผิด</button><p id="notice" role="status"></p></section></div></section>`;
}
export function mountExamReader(root){
const $=id=>root.querySelector("#"+id),names=['รวม 5 ภาค · 2/2568','รวม 5 ภาค · 1/2568','รวม 5 ภาค · ฤดูร้อน 2567','รวม 5 ภาค · 1/2567','รวม 5 ภาค · ฤดูร้อน 2566','ลับเฉพาะ 1/2569 · ชุด 1','ลับเฉพาะ 1/2569 · ชุด 2'];let bank,ix=0,history={};
function init(b){if(!Array.isArray(b)||b.length!==700||b.some((a,i)=>a.s!==1+Math.floor(i/100)||a.n!==1+i%100||typeof a.stem!=='string'||!Array.isArray(a.options)||a.options.length!==5||!a.options.every(o=>typeof o==='string')||!(a.k===null||(Number.isInteger(a.k)&&a.k>=1&&a.k<=5))))throw Error('รูปแบบคลังไม่ตรง');bank=b;$('sets').replaceChildren(...names.map((n,i)=>new Option(n,i)));$('num').replaceChildren(...Array.from({length:100},(_,i)=>new Option(i+1,i)));$('lab').hidden=false;show(0)}
function show(i){const same=i===ix,explanationOpen=same&&$('feedback').querySelector('details').open;ix=i;let a=bank[i],v=history[i];$('sets').value=a.s-1;$('num').value=a.n-1;$('meta').textContent='หน้า PDF '+a.p;$('counter').textContent='ข้อ '+a.n+' / 100';$('stem').textContent=a.stem;$('choices').replaceChildren(...a.options.map((o,j)=>{let b=document.createElement('button');b.className='choice'+(v&&a.k===j+1?' correct':v===j+1?(a.k===null?' picked':' incorrect'):'');const number=document.createElement('span');number.textContent=j+1;b.append(number,document.createTextNode(o));b.onclick=()=>{cloud.answer(i,j+1)};return b}));$('feedback').hidden=!v;$('result').textContent=!v?'':a.k===null?'ข้อนี้ไม่นับคะแนน':(v===a.k?'ถูกต้อง':'คุณเลือก '+v+' · เฉลย '+a.k)+' — '+a.options[a.k-1];$('why').textContent=a.why;$('note').textContent=a.note||'';$('feedback').querySelector('details').open=!!v&&explanationOpen;let done=bank.filter(x=>x.s===a.s&&history[100*(x.s-1)+x.n-1]);let graded=done.filter(x=>x.k!==null);$('score').textContent='ชุดนี้ตอบแล้ว '+done.length+'/100 · ถูก '+graded.filter(x=>history[100*(x.s-1)+x.n-1]===x.k).length+' จาก '+graded.length+' ข้อที่นับคะแนน';$('prev').disabled=i%100===0;$('next').disabled=i%100===99;$('notice').textContent=''}
// Only explicit navigation changes the reading position. Answering and
// background Supabase updates must never jump the learner away from feedback.
function goToQuestion(i){
 if(!bank||!Number.isInteger(i)||i<0||i>=bank.length||!root.isConnected)return;
 $('feedback').querySelector('details').open=false;
 show(i);
 const card=root.querySelector('.reader-question'),stem=$('stem'),topbar=document.querySelector('.topbar');
 scrollQuestion(card,stem,topbar);
}
$('prev').onclick=()=>goToQuestion(ix-1);$('next').onclick=()=>goToQuestion(ix+1);$('sets').onchange=()=>goToQuestion(100*Number($('sets').value));$('num').onchange=()=>goToQuestion(100*Math.floor(ix/100)+Number($('num').value));function choose(wrong){const list=bank.map((x,i)=>i).filter(i=>Math.floor(i/100)===Math.floor(ix/100)&&(wrong?(history[i]&&bank[i].k&&history[i]!==bank[i].k):!history[i]));if(list.length)goToQuestion(list[Math.floor(Math.random()*list.length)]);else $('notice').textContent=wrong?'ไม่มีข้อที่ตอบผิดในชุดนี้':'ตอบครบชุดนี้แล้ว'}$('random').onclick=()=>choose(false);$('wrong').onclick=()=>choose(true);
const cloud=sharedAnswers({storage:localStorage,onUpdate:v=>{const changed=JSON.stringify(history)!==JSON.stringify(v);history=v;if(bank&&changed)show(ix)},status:t=>{$('cloud').textContent=t}});
let booting=false;
async function boot(){if(booting)return;booting=true;try{const data=await loadBank();init(data);try{localStorage.setItem('pol2106-private-v1',JSON.stringify(data))}catch{}$('retry').hidden=true;await cloud.sync()}catch{try{if(!bank)init(JSON.parse(localStorage.getItem('pol2106-private-v1')))}catch{}$('cloud').textContent=bank?'ใช้คลังที่เคยโหลด · ยังไม่เชื่อมต่อ':'โหลดคลังข้อสอบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง';$('retry').hidden=false}finally{booting=false}}
function refresh(){if(!bank||!$('retry').hidden)void boot();else void cloud.sync()}
$('retry').onclick=boot;const controller=new AbortController();
 window.addEventListener('online',refresh,{signal:controller.signal});window.addEventListener('focus',refresh,{signal:controller.signal});
 const timer=setInterval(()=>{if(!document.hidden)refresh()},7000);
 void boot();
 return ()=>{controller.abort();clearInterval(timer);};
}
