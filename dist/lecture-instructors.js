// ม.ร.30 ภาค 2/2569 ส่วนกลาง หน้า 142–143 (PDF in sources/).
// The document lists teaching teams, not a lecturer for each meeting.
const rosters={
 'POL1101-269-lecture':['รศ. ดร. SUPATRA','ผศ. ดร. NIPON'],
 'POL2104-269-lecture':['ผศ. ดร. NIPON','ผศ. ดร. KRIANGCHAI'],
 'POL2106-269-lecture':['ดร. CHATCHAPHANU'],
 'POL2107-269-lecture':['ผศ. ดร. GRITTHEE','ดร. CHATCHAPHANU'],
 'POL2200-269-lecture':['ผศ. SATIN','ผศ. ดร. KRISSADA','ผศ. ANCHALEE'],
 'POL2301-269-lecture':['ผศ. ดร. WIRAYUT','รศ. ดร. RATTHASIRIN'],
 'POL2303-269-lecture':['รศ. ดร. RAVIPA','รศ. ดร. NITHITA','ดร. PICHAYA']
};
export const lectureInstructors=s=>rosters[s.id]?.join(' · ')||'ยังไม่ระบุในข้อมูลที่ตรวจแล้ว';
