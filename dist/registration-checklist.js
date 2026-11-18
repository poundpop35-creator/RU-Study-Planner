import {meta,categories,categoryTargets} from './data.js?v=20261027c';
import {escapeHTML as e} from './core.js?v=20261112a';

const transferGroups=[
 ['general','ศึกษาทั่วไป',30,'ทักษะการเรียนรู้ตลอดชีวิต 15 · ผู้สร้างสรรค์นวัตกรรม 6 · พลเมืองที่เข้มแข็ง 9'],
 ['free','เลือกเสรี',12,'ตามแผนบริหารรัฐกิจ']
];

export function registrationChecklist(state,summary){
 const total=meta.totalCredits;
 const inPlan=transferGroups.reduce((sum,[,,target])=>sum+target,0)+Object.keys(categoryTargets)
  .reduce((sum,key)=>sum+Math.min(summary.planned[key],categoryTargets[key]),0);
 const confirmed=summary.transfer+summary.earned;
 const left=transferGroups.map(([key,label,target,detail])=>{
  const approved=state.transfer[key];
  return `<tr><th scope="row">${label}<small>${detail}</small></th><td>${target}</td><td>${approved}</td><td>${target-approved||'ครบ'}</td></tr>`;
 }).join('');
 const courseTable=key=>{
  const target=categoryTargets[key],planned=summary.planned[key],passed=summary.passed[key];
  const rows=summary.termRows.flatMap(term=>term.courses.filter(c=>c.category===key).map(c=>{
   const grade=state.grades[c.id];
   const status=grade?(grade==='F'?'retry':'passed'):(c.enrolled?'enrolled':'planned');
   const label={enrolled:'ลงแล้ว',planned:'รอตามแผน',passed:'สอบผ่าน',retry:'ต้องสอบใหม่'}[status];
   return `<tr class="audit-course ${status}"><td>${e(term.name)}</td><th scope="row"><button type="button" data-action="registration-find" data-course="${e(c.id)}" data-term="${term.id}" title="ดูวิชานี้ในแผนรายภาค">${e(c.id)}</button><small>${e(c.title)}</small></th><td>${c.credits}</td><td>${grade?`<b>${e(grade)}</b> `:''}<span class="audit-status">${label}</span></td></tr>`;
  })).join('');
  return `<section class="audit-group"><h3>${e(categories[key])} <small>${target} หน่วยกิต</small></h3><p>${planned>=target?'วางแผนครบ':'ขาดในแผน '+(target-planned)+' นก.'} · สอบผ่านที่บันทึก ${passed} นก.</p><table><thead><tr><th>ภาค</th><th>รายวิชา</th><th>นก.</th><th>ผล / สถานะ</th></tr></thead><tbody>${rows}</tbody></table></section>`;
 };
 return `<section class="degree-audit" aria-labelledby="degree-audit-title"><div class="section-heading"><div><h2 id="degree-audit-title">ตารางตรวจหน่วยกิตตามหลักสูตร</h2><p>รัฐศาสตรบัณฑิต · แผน C บริหารรัฐกิจ · หลักสูตรที่ใช้ในแผนปี 2569</p></div><a href="./sources/curriculum-2569.pdf" target="_blank" rel="noopener">ดูเอกสารหลักสูตร</a></div>
 <div class="audit-totals"><div><strong>แผนครอบคลุม ${inPlan} / ${total} นก.</strong><span>เรียนตามแผน ${Object.values(summary.planned).reduce((a,b)=>a+b,0)} + คาดว่าเทียบโอน ${meta.expectedTransfer}</span></div><div><strong>ยืนยันแล้ว ${confirmed} / ${total} นก.</strong><span>สอบผ่าน ${summary.earned} + โอนอนุมัติ ${summary.transfer} · ยังขาด ${Math.max(0,total-confirmed)} นก.</span></div></div>
 <div class="audit-columns"><div><section class="audit-group"><h3>หมวดที่คาดว่าเทียบโอน <small>${meta.expectedTransfer} หน่วยกิต</small></h3><table><thead><tr><th>หมวด</th><th>คาดว่าโอน</th><th>อนุมัติแล้ว</th><th>รอยืนยัน</th></tr></thead><tbody>${left}</tbody></table><button type="button" data-action="audit-transfer">บันทึกผลเทียบโอน</button></section>${courseTable('core')}${courseTable('required')}</div><div>${courseTable('elective')}${courseTable('faculty')}</div></div></section>`;
}
