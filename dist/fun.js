// Mascot “น้องสมุด” and small celebration effects. Effects live outside #main so a re-render never cuts them off,
// are skipped when the learner prefers reduced motion, and quietly do nothing without a real browser DOM.
const COLORS=['#1d4ed8','#f5b301','#16a34a','#ec4899','#8b5cf6','#06b6d4','#f97316'];
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const faces={
 happy:'<ellipse cx="45" cy="64" rx="5" ry="6.5" fill="#14213d"/><ellipse cx="75" cy="64" rx="5" ry="6.5" fill="#14213d"/><circle cx="46.7" cy="61.5" r="1.9" fill="#fff"/><circle cx="76.7" cy="61.5" r="1.9" fill="#fff"/><path d="M53 75q7 6.5 14 0" stroke="#14213d" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
 cheer:'<path d="M39 66q6-8 12 0M69 66q6-8 12 0" stroke="#14213d" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M51 73h18q-1.5 11-9 11t-9-11z" fill="#14213d"/><path d="M55.5 80.5q4.5 3.5 9 0" stroke="#fb7185" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M15 20l2.4 5.6L23 28l-5.6 2.4L15 36l-2.4-5.6L7 28l5.6-2.4zM106 12l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8z" fill="#f5b301"/>',
 sleepy:'<path d="M40 64q5 4 10 0M70 64q5 4 10 0" stroke="#14213d" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M55 77h10" stroke="#14213d" stroke-width="3" stroke-linecap="round"/><path d="M98 14h9l-9 10h9M88 30h6l-6 7h6" stroke="#5b6b8c" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
};
export function mascot(mood='happy',size=112){
 return `<svg class="mascot mascot-${faces[mood]?mood:'happy'}" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><ellipse cx="60" cy="108" rx="34" ry="5" fill="#132a5e" opacity=".13"/><path d="M11 44c17-7 33-6 49 3 16-9 32-10 49-3v56c-17-6-33-5-49 4-16-9-32-10-49-4z" fill="#1d4ed8"/><path d="M16 38c15-6 30-5 44 4v56c-14-8-29-9-44-4z" fill="#fff" stroke="#1e3a8a" stroke-width="3" stroke-linejoin="round"/><path d="M104 38c-15-6-30-5-44 4v56c14-8 29-9 44-4z" fill="#fff" stroke="#1e3a8a" stroke-width="3" stroke-linejoin="round"/><path d="M23 50q12-4 26 1M71 51q13-5 26-1" stroke="#c7d6fb" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="34" cy="76" r="5.2" fill="#fb7185" opacity=".42"/><circle cx="86" cy="76" r="5.2" fill="#fb7185" opacity=".42"/>${faces[mood]||faces.happy}<path d="M60 9l33 11-33 11-33-11z" fill="#132a5e"/><path d="M43 25v9c0 4 7.5 7 17 7s17-3 17-7v-9l-17 6z" fill="#1e3a8a"/><path d="M93 20v15" stroke="#f5b301" stroke-width="2.6" stroke-linecap="round"/><circle cx="93" cy="37.5" r="3.6" fill="#f5b301"/></svg>`;
}
function layer(){if(typeof document==='undefined'||!document.body||typeof document.getElementById!=='function')return null;return document.getElementById('fx');}
function origin(rect){
 const w=globalThis.innerWidth||800,h=globalThis.innerHeight||600;
 if(!rect||!rect.width)return {x:w/2,y:h/3};
 return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};
}
function show(html,ms){const root=layer();if(!root)return null;const node=document.createElement('div');node.className='fx-item';node.innerHTML=html;root.append(node);setTimeout(()=>node.remove(),ms);return node;}
export function confetti(rect){
 if(reduced())return;
 const {x,y}=origin(rect);let bits='';
 for(let i=0;i<34;i++){const a=Math.random()*Math.PI*2,r=90+Math.random()*150;bits+=`<i style="--c:${COLORS[i%COLORS.length]};--x:${Math.round(Math.cos(a)*r)};--y:${Math.round(Math.sin(a)*r-90)};--r:${Math.round(Math.random()*540-270)};--d:${Math.round(Math.random()*120)}ms"></i>`;}
 show(`<div class="fx-burst" style="left:${x}px;top:${y}px">${bits}</div>`,1800);
}
export function floatXP(rect,amount){if(!(amount>0))return;const {x,y}=origin(rect);show(`<div class="xp-float${reduced()?' still':''}" style="left:${x}px;top:${y}px">+${Math.round(amount)} XP</div>`,1400);}
let levelTimer;
export function levelUp(info){
 const root=layer();if(!root)return;closeLevelUp();
 const node=show(`<div class="levelup" data-action="fx-close" role="dialog" aria-label="เลเวลอัป"><div class="levelup-card">${mascot('cheer',120)}<span class="levelup-kicker">เลเวลอัป!</span><b>Lv.${info.level}</b><strong>${info.icon} ${info.title}</strong><span class="levelup-hint">แตะที่ใดก็ได้เพื่อเรียนต่อ</span></div></div>`,6000);
 if(node){node.dataset.levelup='1';confetti();clearTimeout(levelTimer);levelTimer=setTimeout(closeLevelUp,5200);}
}
export function closeLevelUp(){const root=layer();const open=root?.querySelector?.('[data-levelup]');if(open)open.remove();}
