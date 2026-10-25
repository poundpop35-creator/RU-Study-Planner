import {interestPanel} from './debt-interest-view.js?v=20261025g';
import {readRates,interestPlan} from './debt-interest.js?v=20261025e';
import {readPayments,paymentSummary,addPayment,removePayment} from './debt-payments.js?v=20261025e';
import {months,creditors,data,budget,plan,monthTotal} from './debt-core.js?v=20261025e';
const fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
const round=n=>Math.round(n*100)/100;
const colors={G:'#be185d',AEON:'#6d28d9',LINE:'#0369a1','ทอง':'#b45309',S:'#047857'};
const when=at=>at?new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(at)):'จากสถานะจ่ายครบที่เคยบันทึก';
const lastMonth=key=>months.filter(m=>data[m][key]>0).at(-1);
// Personal debt plan: a separate tool that only borrows the study app's shell.
// Order follows what the user does: how much is left → what to pay now → record it → details.
export function debtPage(storage){
 const {entries,error}=readPayments(storage),s=paymentSummary(entries);
 const amount=n=>error?'—':fmt(n);
 const {rates,error:rateError}=readRates(storage);
 const interestRow=m=>rateError?null:interestPlan(rates).find(r=>r.month===m);
 return `<div class="debt-page">
 <header class="debt-bar"><div><span class="debt-bar-tag">เครื่องมือส่วนตัว · ไม่เกี่ยวกับการเรียน</span><h1>แผนจัดการหนี้</h1><p>งบเดือนละ ${fmt(budget)} บาท · ${months[0]} ถึง ${months.at(-1)} (${months.length} เดือน)</p></div><a class="button secondary" href="#home">← กลับห้องเรียน</a></header>
 <p class="debt-local">🔒 บันทึกไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ซิงก์ และไม่อยู่ในไฟล์สำรองการเรียน</p>
 ${error?`<div class="notice" role="alert">${error}</div>`:''}
 ${overview(s,error,amount)}
 ${thisMonth(s,error,amount,interestRow)}
 ${entryForm(s,error,amount)}
 ${schedule(s,error,amount)}
 <section class="debt-section" aria-labelledby="debt-creditors-title"><h2 id="debt-creditors-title"><span class="debt-step">4</span>ยอดคงเหลือแต่ละเจ้า</h2><div class="debt-creditors">${creditors.map(c=>{const done=s.byCreditor[c.key],left=round(c.balance-done);return `<article style="--debt-color:${colors[c.key]}"><div class="debt-creditor-head"><h3>${c.name}</h3>${!error&&left<=0?'<span class="debt-badge ok">ปิดแล้ว ✓</span>':`<span class="debt-badge">ปิดตามแผน ${lastMonth(c.key)}</span>`}</div><p class="debt-creditor-left">เหลือ <strong>${amount(left)}</strong> บาท</p><progress max="${c.balance}" ${error?'':`value="${done}"`} aria-label="การจ่าย ${c.name}"></progress><small>จ่ายลดหนี้แล้ว ${amount(done)} จาก ${fmt(c.balance)} บาท</small></article>`;}).join('')}</div></section>
 ${history(entries,s,error,amount)}
 ${interestPanel(storage)}
 <details class="debt-more"><summary>วิธีคิดของแผนนี้</summary><ul>
  <li>งบ ${fmt(budget)} บาท/เดือน ใช้<b>ลดเงินต้น</b>ทุกเจ้า และจ่าย<b>งวด G</b> (งวด G รวมดอกแล้ว)</li>
  <li>ทุกเดือนกันขั้นต่ำให้ทุกเจ้าที่ยังมีหนี้: AEON 2 บัญชี บัญชีละ 1,000 บาท · LINE, ทอง, S เจ้าละ 1,000 บาท (ถ้าเหลือน้อยกว่านั้นก็จ่ายปิดตามยอดจริง)</li>
  <li>เงินที่เหลือเอาไปเร่งปิดตามลำดับ: AEON รายการบน → AEON เครดิต → LINE → ทอง → S</li>
  <li><b>ดอกเบี้ยของ AEON, LINE และทอง ต้องเตรียมเงินแยกต่างหาก</b> นอกงบ ${fmt(budget)} บาท (ดูหัวข้อดอกเบี้ย)</li>
  <li>8 เดือนจ่ายได้ 120,000 บาท ยังไม่พอ จึงใช้ ${months.length} เดือน งวดสุดท้าย ${months.at(-1)} ใช้ ${fmt(plan.at(-1).total)} บาท เหลืองบ ${fmt(plan.at(-1).unused)} บาท</li>
  <li>แผนจบตามนี้ถ้าจ่ายดอกครบทุกงวดและไม่ก่อหนี้ใหม่ · จ่ายทีละน้อยได้ ระบบรวมยอดให้เอง</li>
 </ul></details>
 </div>`;
}
function overview(s,error,amount){
 const doneAll=!error&&!s.next;
 return `<section class="debt-hero" aria-label="ภาพรวมหนี้"><div class="debt-hero-main"><span>หนี้คงเหลือ</span><p class="debt-balance">${amount(s.left)} <small>บาท</small></p><div class="debt-meter"><progress max="100" ${error?'':`value="${s.percent}"`} aria-label="ความคืบหน้าการจ่าย"></progress><b>${error?'—':s.percent+'%'}</b></div><small>จ่ายลดหนี้แล้ว ${amount(s.paid)} จาก ${fmt(s.total)} บาท</small></div>
 <dl class="debt-hero-facts"><div><dt>จ่ายครบแล้ว</dt><dd>${error?'—':s.count} <small>/ ${months.length} เดือน</small></dd></div><div><dt>${doneAll?'สถานะ':'งวดที่ต้องจ่ายตอนนี้'}</dt><dd>${error?'—':doneAll?'ปลดหนี้ครบ 🎉':s.next}</dd></div><div><dt>ปิดหนี้ทั้งหมดตามแผน</dt><dd>${months.at(-1)}</dd></div></dl></section>`;
}
function thisMonth(s,error,amount,interestRow){
 if(error)return '';
 if(!s.next)return `<section class="debt-section debt-now"><h2><span class="debt-step">1</span>งวดนี้</h2><p>จ่ายครบทุกงวดตามแผนแล้ว ✓</p></section>`;
 const m=s.next,row=plan.find(r=>r.month===m),ir=interestRow(m);
 const interestOf={AEON:ir?ir.interest.aeonUpper+ir.interest.aeonCard:0,LINE:ir?.interest.line||0,'ทอง':ir?.interest.gold||0};
 return `<section class="debt-section debt-now" aria-labelledby="debt-now-title"><h2 id="debt-now-title"><span class="debt-step">1</span>ต้องจ่ายงวด ${m}</h2><p class="debt-lead">ยังขาดอีก <strong>${amount(s.monthRemaining[m])} บาท</strong> จากเป้า ${fmt(monthTotal(m))} บาท${ir?`<br>+ ดอกเบี้ยที่ต้องเตรียมเพิ่ม (ประมาณ) <strong>${fmt(ir.interestTotal)} บาท</strong>`:''}</p>
 <ul class="debt-due">${creditors.filter(c=>data[m][c.key]>0).map(c=>{const target=data[m][c.key],left=round(target-s.allocation[m][c.key]),int=round(interestOf[c.key]||0);return `<li class="${left<=0?'ok':''}" style="--debt-color:${colors[c.key]}"><div><b>${c.name}</b>${c.key==='AEON'?`<small>รายการบน ${fmt(row.aeonAllocation.aeonUpper)} · เครดิต ${fmt(row.aeonAllocation.aeonCard)}</small>`:''}${int?`<small>+ ดอกประมาณ ${fmt(int)} บาท (เงินแยก)</small>`:''}</div><div class="debt-due-amt">${left<=0?'<span class="debt-badge ok">ครบแล้ว ✓</span>':`<strong>${fmt(left)}</strong><small>จาก ${fmt(target)} บาท</small>`}</div></li>`;}).join('')}</ul></section>`;
}
function entryForm(s,error,amount){
 const off=error?'disabled':'';
 return `<section class="debt-section debt-entry-panel" aria-labelledby="debt-entry-title"><h2 id="debt-entry-title"><span class="debt-step">2</span>จ่ายแล้ว? บันทึกตรงนี้</h2><p>จ่ายทีละเท่าไรก็ได้ ระบบรวมยอดให้เอง</p>
 <form id="debt-payment-form" class="debt-entry-form"><label>จ่ายให้ใคร<select id="debt-creditor" required ${off}><option value="">เลือกเจ้าหนี้</option>${creditors.map(c=>`<option value="${c.key}">${c.name} · เหลือ ${amount(round(c.balance-s.byCreditor[c.key]))} บาท</option>`).join('')}</select></label><label>จ่ายไปทั้งหมด (บาท)<input id="debt-payment-amount" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="เช่น 1000" ${off}></label><label>ในนั้นเป็นดอกเบี้ย (บาท)<input id="debt-payment-interest" type="number" inputmode="decimal" min="0" step="0.01" value="0" required ${off}><span class="debt-field-hint">ดูจากใบเสร็จ · ไม่มีดอกใส่ 0 · G และ S ใส่ 0 เสมอ</span></label><button type="submit" class="button primary" ${off}>บันทึกการจ่าย</button></form>
 <p id="debt-payment-error" role="alert" hidden></p><p class="debt-example">ตัวอย่าง: จ่าย 100 บาท เป็นดอก 20 → หนี้ลดลง 80 บาท</p></section>`;
}
function schedule(s,error,amount){
 return `<section class="debt-section" aria-labelledby="debt-plan-title"><h2 id="debt-plan-title"><span class="debt-step">3</span>แผนทั้ง ${months.length} เดือน</h2><p>แตะที่เดือนเพื่อดูว่าต้องจ่ายเจ้าไหนเท่าไร</p><div class="debt-months">${months.map((m,i)=>{const left=s.monthRemaining[m],row=plan[i],done=!error&&left===0,now=!error&&m===s.next;const status=error?'ยังอ่านยอดไม่ได้':done?'ครบแล้ว ✓':now?`งวดนี้ · ขาด ${fmt(left)}`:`ขาด ${fmt(left)}`;return `<details class="debt-month${done?' done':''}${now?' now':''}"${now?' open':''}><summary><span class="debt-month-name">${m}</span><span class="debt-month-status">${status}</span><span class="debt-month-total">${fmt(monthTotal(m))} บาท</span></summary><table><thead><tr><th scope="col">เจ้าหนี้</th><th scope="col">เป้า</th><th scope="col">จ่ายแล้ว</th><th scope="col">ขาด</th></tr></thead><tbody>${creditors.filter(c=>data[m][c.key]>0).map(c=>{const v=data[m][c.key],p=s.allocation[m][c.key];return `<tr><th scope="row"><i style="background:${colors[c.key]}"></i>${c.name}${lastMonth(c.key)===m?' <span class="debt-close">งวดปิด</span>':''}${c.key==='AEON'?`<small>บน ${fmt(row.aeonAllocation.aeonUpper)} · เครดิต ${fmt(row.aeonAllocation.aeonCard)}</small>`:''}</th><td>${fmt(v)}</td><td>${amount(p)}</td><td>${error?'—':fmt(round(v-p))}</td></tr>`;}).join('')}</tbody></table>${row.unused?`<p class="debt-hint">งบเหลือเดือนนี้ ${fmt(row.unused)} บาท</p>`:''}</details>`;}).join('')}</div></section>`;
}
function history(entries,s,error,amount){
 return `<section class="debt-section debt-history" aria-labelledby="debt-history-title"><h2 id="debt-history-title"><span class="debt-step">5</span>ประวัติการจ่าย <small>${error?'—':entries.length} รายการ</small></h2>${entries.length&&!error?`<p>จ่ายไปรวม ${amount(s.cashPaid)} บาท = ลดหนี้ ${amount(s.paid)} + ดอกเบี้ย ${amount(s.interestPaid)} บาท</p>`:''}${error?'<p>ยังอ่านประวัติไม่ได้</p>':entries.length?`<ul>${[...entries].reverse().map(entry=>`<li style="--debt-color:${colors[entry.creditor]}"><div><strong>${entry.creditor} · ${fmt((entry.amountCents+(entry.interestCents||0))/100)} บาท</strong><small>ลดหนี้ ${fmt(entry.amountCents/100)} · ดอกเบี้ย ${fmt((entry.interestCents||0)/100)} บาท · ${when(entry.at)}</small></div><button class="button secondary small" data-action="debt-remove" data-id="${entry.id}" aria-label="ลบรายการ ${entry.creditor} ${fmt(entry.amountCents/100)} บาท">ลบ</button></li>`).join('')}</ul>`:'<p>ยังไม่มีรายการ เมื่อจ่ายแล้วบันทึกที่ข้อ 2 ได้เลย</p>'}</section>`;
}
export function debtAction(action,dataset,storage){if(action==='debt-add')return addPayment(storage,dataset.creditor,dataset.amount,dataset.interest??0);if(action==='debt-remove')return removePayment(storage,dataset.id);return 'ไม่พบคำสั่ง';}
