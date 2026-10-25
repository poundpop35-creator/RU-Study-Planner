import {readRates,rateFields,interestPlan} from './debt-interest.js?v=20261025e';
const fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
// Interest is funded outside the monthly budget, so it lives in its own folded section.
export function interestPanel(storage){
 const {rates,error}=readRates(storage),rows=interestPlan(rates);
 const interestTotal=rows.reduce((n,r)=>n+Math.round(r.interestTotal*100),0)/100;
 const cashTotal=rows.reduce((n,r)=>n+Math.round(r.cashTotal*100),0)/100;
 return `<details class="debt-more debt-interest" id="debt-interest-details"${error?' open':''}><summary>ดอกเบี้ยและเงินที่ต้องเตรียมเพิ่ม <span>${error?'ต้องบันทึกอัตราใหม่':`ทั้งแผนประมาณ ${fmt(interestTotal)} บาท`}</span></summary>
 <p>ดอกเบี้ยของ <b>AEON, LINE และทอง</b> จ่ายแยกจากงบ 15,000 บาท · <b>G</b> รวมดอกในงวดแล้ว · S รวม 7,900 บาท ไม่มีดอกเพิ่ม</p>
 ${error?'':`<div class="debt-table" tabindex="0" role="region" aria-label="ตารางดอกเบี้ยประมาณการรายเดือน"><table><thead><tr><th scope="col">เดือน</th><th scope="col">ดอกเบี้ย (ประมาณ)</th><th scope="col">งบลดหนี้</th><th scope="col">รวมต้องจ่าย</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${r.month}</th><td>${fmt(r.interestTotal)}<small>AEON ${fmt(Math.round((r.interest.aeonUpper+r.interest.aeonCard)*100)/100)} · LINE ${fmt(r.interest.line)} · ทอง ${fmt(r.interest.gold)}</small></td><td>${fmt(r.baseTotal)}</td><td><strong>${fmt(r.cashTotal)}</strong></td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">รวม</th><td>${fmt(interestTotal)}</td><td></td><td><strong>${fmt(cashTotal)}</strong></td></tr></tfoot></table></div>`}
 <div class="debt-caution"><strong>เป็นตัวเลขประมาณ ไม่ใช่ยอดที่เจ้าหนี้เรียกเก็บ</strong> ยอดจริงดูจากใบแจ้งหนี้แต่ละเดือน · จำลองรอบละ 30 วัน และสมมติว่าจ่ายตามแผนทุกงวด</div>
 <h3>อัตราดอกเบี้ยที่ใช้คำนวณ</h3><p class="debt-hint">ค่าตั้งต้น: AEON รายการบน 25% ต่อปี (ยังไม่รู้ประเภท สมมติเป็นยัวร์แคช) · AEON เครดิต 16% · LINE BK 25% · ทอง 1.25% ต่อเดือน — แก้ให้ตรงสัญญาของคุณได้</p>
 <form id="debt-rate-form" class="debt-rate-form">${rateFields.map(f=>`<label>${f.name}<span>${f.unit}</span><input id="debt-rate-${f.key}" type="number" inputmode="decimal" min="0" max="${f.max}" step="0.01" value="${rates[f.key]}" required></label>`).join('')}<button class="button secondary" type="submit">บันทึกอัตราและคำนวณใหม่</button></form><p id="debt-rate-error" role="alert" ${error?'':'hidden'}>${error}</p>
 <p class="debt-hint">ยอด AEON ตั้งต้นใช้ยอดเต็มจากภาพบิล 15,115.44 + 10,325.11 = 25,440.55 บาท อาจรวมดอก/ค่าธรรมเนียมเดิมแล้ว · แหล่งอัตรา (ตรวจ 25 ต.ค. 2569): <a href="https://www.aeon.co.th/aeon/personal-loan/yourcash" target="_blank" rel="noopener noreferrer">AEON ยัวร์แคช</a> · <a href="https://www.aeon.co.th/aeon/cards/" target="_blank" rel="noopener noreferrer">AEON เครดิต</a> · <a href="https://www.linebk.com/th/credit-line/" target="_blank" rel="noopener noreferrer">LINE BK</a> · <a href="https://www.aurora.co.th/news/page_news/2166/ขาย-ฝาก-ปลอดภัยกว่าใครที่-ทองมาเงินไป" target="_blank" rel="noopener noreferrer">ทองมาเงินไป / AURORA</a></p>
 </details>`;
}
