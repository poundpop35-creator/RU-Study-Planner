// The first destination opens the section. Other destinations stay directly linkable.
export const sections=[
 {label:'วันนี้',icon:'home',pages:[['home','วันนี้ต้องทำอะไร']]},
 {label:'เรียนและฝึกสอบ',icon:'book',pages:[['courses','ติวก่อนเรียน'],['practice','ฝึกทำข้อสอบ'],['review','ทบทวนบทเรียน']]},
 {label:'สมุดจด',icon:'notes',pages:[['notes','โน้ตทั้งหมด'],['classroom','แยกตามวิชาและเอกสาร']]},
 {label:'แผนของฉัน',icon:'calendar',pages:[['plan','แผนอ่าน'],['calendar','ตารางเรียน–สอบ'],['registration','แผนลงทะเบียน']]},
 {label:'เอกสารและแหล่งเรียน',icon:'doc',pages:[['documents','เอกสารมหาวิทยาลัย'],['resources','แหล่งเรียนออนไลน์'],['about','ที่มาและข้อตกลง']]},
 {label:'ข้อมูลและการตั้งค่า',icon:'device',pages:[['account','สถานะการซิงก์'],['settings','ตั้งค่าและสำรองข้อมูล']]},
 {label:'รางวัลของฉัน',icon:'trophy',pages:[['awards','รางวัลของฉัน']]},
 {label:'แผนจัดการหนี้',icon:'wallet',pages:[['debt','แผนจัดการหนี้']]}
];
const detailParent={lesson:'courses',course:'courses',prep:'practice',note:'notes'};
export function sectionFor(view){
 const page=detailParent[view]||view;
 return sections.find(section=>section.pages.some(([key])=>key===page));
}
export function sectionTabs(view){
 const section=sectionFor(view);
 if(!section||section.pages.length<2||!section.pages.some(([key])=>key===view))return '';
 return '<nav class="hub-tabs" aria-label="'+section.label+'">'+section.pages.map(([key,label])=>
  '<a href="#'+key+'" '+(key===view?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>';
}
