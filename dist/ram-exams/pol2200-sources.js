// URLs supplied by the student on 26 Nov 2026. These are external sources,
// NOT imported, graded, authenticated or verified university examination items.
export const pol2200Sources=Object.freeze([
 {label:'ชุด 1-1',url:'https://pol2200-1-1-year69.netlify.app/'},
 {label:'ชุด 1-2',url:'https://pol2200-1-2-year69.netlify.app/'},
 ...Array.from({length:12},(_,i)=>({label:'ชุด '+(i+2),url:'https://pol2200-'+(i+2)+'-year69.netlify.app/'})),
 {label:'ชุดรวม 1 (Mix)',url:'https://pol2200-mix-1-69.netlify.app/'}
].map(Object.freeze));
export function pol2200SourcePanel(course){
 if(course!=='POL2200')return '';
 return '<details class="panel ram-pol-sources" id="pol2200-external-sources"><summary>แหล่งข้อสอบ POL2200 · 15 ชุด (เปิดเว็บต้นฉบับ)</summary><p>ลิงก์ที่ผู้เรียนส่งมา ยังไม่สามารถตรวจเนื้อหาและเฉลยได้ ไม่ใช่ข้อสอบที่นำเข้าคลังของเรา คะแนนในเว็บภายนอกไม่รวมกับคะแนนใน RU Study Planner</p><div class="ram-pol-source-grid">'+pol2200Sources.map(s=>'<a class="button secondary" href="'+s.url+'" target="_blank" rel="noopener noreferrer">'+s.label+' ↗</a>').join('')+'</div></details>';
}
